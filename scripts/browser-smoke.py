#!/usr/bin/env python3
"""Functional browser smoke check. Requires Python Playwright and Chromium.

Start `npm run dev` first, then `python3 scripts/browser-smoke.py`.
Optional environment variables: FLYWIRE_BASE_URL, FLYWIRE_CHROMIUM_PATH.
Screenshots are written outside the checkout, under /tmp/flywire-checks.
"""
import json
import math
import os
from pathlib import Path

from playwright.sync_api import sync_playwright, expect

BASE_URL = os.environ.get("FLYWIRE_BASE_URL", "http://127.0.0.1:5173/")
CHROMIUM = os.environ.get("FLYWIRE_CHROMIUM_PATH", "/usr/bin/chromium")
OUTPUT = Path("/tmp/flywire-checks")
OUTPUT.mkdir(parents=True, exist_ok=True)


def exported(page):
    with page.expect_download() as download_info:
        page.get_by_role("button", name="기록 저장").click()
    return json.loads(Path(download_info.value.path()).read_text())


def source(data, source_id):
    return next(item for item in data["sources"] if item["id"] == source_id)


def canvas_point(page, x, y):
    bounds = page.locator("canvas").bounding_box()
    scale = min(bounds["width"] / 1000, bounds["height"] / 700)
    return (
        bounds["x"] + (bounds["width"] - 1000 * scale) / 2 + x * scale,
        bounds["y"] + (bounds["height"] - 700 * scale) / 2 + y * scale,
    )


def main():
    checks = []
    errors = []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROMIUM, headless=True, args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 1440, "height": 1100}, accept_downloads=True)
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(BASE_URL, wait_until="networkidle")
        expect(page.get_by_text("7,000개 표본 뉴런")).to_be_visible()
        expect(page.get_by_role("heading", name="초파리의 작은 세계.")).to_be_visible()
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth")
        checks.append("desktop and real brain data render")

        page.get_by_role("button", name="시뮬레이션 일시정지").click()
        first = exported(page)
        page.wait_for_timeout(1200)
        second = exported(page)
        assert first["state"] == second["state"], "Paused fly state changed"
        checks.append("pause freezes exact exported simulation state")

        amount = page.locator("#amount")
        amount.focus()
        amount.press("Home")
        for _ in range(3):
            amount.press("ArrowRight")
        expect(amount).to_have_value("3")
        assert source(exported(page), "source-1")["amount"] == 3
        toggle = page.get_by_role("switch", name="A 에틸 아세테이트 활성화")
        toggle.click()
        expect(toggle).to_have_attribute("aria-checked", "false")
        assert not source(exported(page), "source-1")["enabled"]
        toggle.click()
        expect(toggle).to_have_attribute("aria-checked", "true")
        checks.append("amount slider and emitter enable switch update export")

        page.get_by_label("추가할 화학물질").select_option("co2")
        page.get_by_role("button", name="화학물질 추가", exact=True).click()
        expect(page.get_by_text("3개 배치됨")).to_be_visible()
        added = exported(page)
        assert source(added, "source-3")["chemical"] == "co2"
        distance = page.locator("#distance")
        distance.focus()
        distance.press("Home")
        for _ in range(20):
            distance.press("ArrowRight")
        moved = exported(page)
        actual = math.hypot(source(moved, "source-3")["x"] - moved["state"]["x"], source(moved, "source-3")["y"] - moved["state"]["y"])
        assert abs(actual - 100) < 1, f"Distance slider resulted in {actual} instead of 100"
        page.get_by_label("화학물질 X 위치 (mm)").fill("80")
        page.get_by_label("화학물질 Y 위치 (mm)").fill("40")
        numeric = source(exported(page), "source-3")
        assert numeric["x"] == 800 and numeric["y"] == 400
        checks.append("CO2 source addition, distance, and numeric position controls")

        page.locator("canvas").scroll_into_view_if_needed()
        page.mouse.click(*canvas_point(page, 600, 200))
        placed = source(exported(page), "source-3")
        assert abs(placed["x"] - 600) < 2 and abs(placed["y"] - 200) < 2
        page.mouse.move(*canvas_point(page, placed["x"], placed["y"]))
        page.mouse.down()
        page.mouse.move(*canvas_point(page, 300, 250), steps=10)
        page.mouse.up()
        dragged = source(exported(page), "source-3")
        assert abs(dragged["x"] - 300) < 2 and abs(dragged["y"] - 250) < 2
        checks.append("canvas click and pointer drag preserve world coordinates")

        for label in ["이동 경로 표시", "농도 분포 표시"]:
            control = page.get_by_role("button", name=label)
            control.click()
            expect(control).to_have_attribute("aria-pressed", "false")
            control.click()
            expect(control).to_have_attribute("aria-pressed", "true")
        region = page.locator(".brain-region").nth(2)
        region.focus()
        region.press("Enter")
        expect(region).to_have_attribute("aria-pressed", "true")
        expect(page.locator(".brain-selected")).to_contain_text("왼쪽 측각")
        checks.append("display toggles and keyboard-selectable brain regions")

        page.get_by_role("button", name="모델 및 데이터 안내").click()
        expect(page.locator("dialog")).to_be_visible()
        expect(page.locator("dialog")).to_contain_text("측정된 신경 발화나 실제 시냅스 가중치가 아닙니다")
        page.keyboard.press("Escape")
        expect(page.locator("dialog")).not_to_be_visible()
        checks.append("model disclosure dialog opens and closes with Escape")

        page.get_by_role("button", name="4×", exact=True).click()
        before = exported(page)
        page.get_by_role("button", name="시뮬레이션 재생").click()
        page.wait_for_timeout(1200)
        page.get_by_role("button", name="시뮬레이션 일시정지").click()
        after = exported(page)
        assert after["time"] - before["time"] >= 2.5, "4x speed did not advance fast enough"
        assert (after["state"]["x"], after["state"]["y"]) != (before["state"]["x"], before["state"]["y"])
        page.get_by_role("button", name="실험 초기화").click()
        reset = exported(page)
        assert reset["time"] == 0 and len(reset["sources"]) == 2
        assert source(reset, "source-1")["amount"] == 72
        checks.append("speed, autonomous movement, and reset")
        page.screenshot(path=str(OUTPUT / "desktop-functional.png"), full_page=True)

        mobile = context.new_page()
        mobile.set_viewport_size({"width": 390, "height": 844})
        mobile.on("pageerror", lambda error: errors.append(str(error)))
        mobile.goto(BASE_URL, wait_until="networkidle")
        expect(mobile.get_by_text("7,000개 표본 뉴런")).to_be_visible()
        assert not mobile.evaluate("document.documentElement.scrollWidth > innerWidth"), "Mobile horizontal overflow"
        mobile.get_by_role("button", name="시뮬레이션 일시정지").click()
        mobile.get_by_role("switch", name="A 에틸 아세테이트 활성화").click()
        expect(mobile.get_by_role("switch", name="A 에틸 아세테이트 활성화")).to_have_attribute("aria-checked", "false")
        mobile.screenshot(path=str(OUTPUT / "mobile-functional.png"), full_page=True)
        checks.append("390px mobile layout and controls")
        assert not errors, f"Browser runtime errors: {errors}"
        browser.close()
    print(json.dumps({"passed": len(checks), "checks": checks, "runtime_errors": errors}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
