#!/usr/bin/env python3
"""Verify fly-only reset preserves the prepared chemical experiment.

Start npm run dev first. Requires Python Playwright and Chromium.
Optional: FLYWIRE_BASE_URL and FLYWIRE_CHROMIUM_PATH.
"""
import json
import math
import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

BASE_URL = os.environ.get("FLYWIRE_BASE_URL", "http://127.0.0.1:5173/")
CHROMIUM = os.environ.get("FLYWIRE_CHROMIUM_PATH", "/usr/bin/chromium")
OUTPUT = Path("/tmp/flywire-checks")


def exported(page):
    with page.expect_download() as download:
        page.get_by_role("button", name="기록 저장").click()
    return json.loads(Path(download.value.path()).read_text())


def add(page, preset):
    page.get_by_label("추가할 화학물질").select_option(preset)
    page.get_by_role("button", name="화학물질 추가", exact=True).click()


def range_steps(page, selector, steps):
    control = page.locator(selector)
    control.focus()
    control.press("Home")
    for _ in range(steps):
        control.press("ArrowRight")


def assert_fresh_fly(record):
    state = record["state"]
    assert record["behaviorModelVersion"] == 2
    assert isinstance(record["seed"], int) and 0 <= record["seed"] <= 0xFFFFFFFF
    assert record["initialConditions"]["seed"] == record["seed"]
    assert math.isfinite(record["initialConditions"]["angle"])
    assert abs(record["initialConditions"]["angle"]) <= 2 * math.pi
    assert state["angle"] == record["initialConditions"]["angle"]
    assert state["x"] == 500 and state["y"] == 350, "Fly did not reset to arena center"
    assert state["time"] == 0 and record["time"] == 0
    assert state["hunger"] == 0.72
    assert state["distance"] == 0 and state["exposure"] == 0
    assert state["trail"] == [{"x": 500, "y": 350}]
    assert state["behavior"] == "exploring"
    assert state["leftSignal"] == 0 and state["rightSignal"] == 0
    assert all(value == 0 for value in state["concentrations"].values())
    assert record["events"] == [{"time": 0, "behavior": "exploring"}]


def main():
    OUTPUT.mkdir(parents=True, exist_ok=True)
    checks, errors = [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROMIUM, headless=True, args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 1440, "height": 1100}, accept_downloads=True)
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(BASE_URL, wait_until="networkidle")
        expect(page.get_by_text("7,000개 표본 뉴런")).to_be_visible()
        expect(page.get_by_role("button", name="초파리만 초기화", exact=True)).to_be_visible()
        page.get_by_role("button", name="시뮬레이션 일시정지").click()

        add(page, "ethanol-5")  # source-3
        page.locator("#solution-concentration").select_option("10")
        page.locator("#concentration-basis").select_option("w/v")
        range_steps(page, "#amount", 37)
        range_steps(page, "#spread", 21)
        range_steps(page, "#response-valence", 10)
        page.get_by_label("화학물질 X 위치 (mm)").fill("86")
        page.get_by_label("화학물질 Y 위치 (mm)").fill("12")

        add(page, "dw")  # source-4: deliberately remove it to leave a gap.
        page.get_by_role("button", name="선택한 물질 삭제").click()
        add(page, "pbs-1x")  # source-5
        page.locator(".source-row.is-selected").get_by_role("switch").click()
        range_steps(page, "#amount", 21)
        page.get_by_label("화학물질 X 위치 (mm)").fill("18")
        page.get_by_label("화학물질 Y 위치 (mm)").fill("60")

        page.locator(".source-select").filter(has_text="에탄올 10%").click()
        page.get_by_label("추가할 화학물질").select_option("2-phenylethanol-0.05")
        page.get_by_role("button", name="2×", exact=True).click()
        for label in ["이동 경로 표시", "농도 분포 표시"]:
            page.get_by_role("button", name=label).click()

        page.get_by_role("button", name="시뮬레이션 재생").click()
        page.wait_for_timeout(700)
        page.get_by_role("button", name="시뮬레이션 일시정지").click()
        before = exported(page)
        assert before["time"] > 0
        assert (before["state"]["x"], before["state"]["y"]) != (500, 350)
        assert len(before["state"]["trail"]) > 1
        assert [source["id"] for source in before["sources"]] == ["source-1", "source-2", "source-3", "source-5"]
        organic = next(source for source in before["sources"] if source["id"] == "source-3")
        assert organic["solutionConcentration"] == 10 and organic["concentrationBasis"] == "w/v"
        assert organic["amount"] == 37 and organic["spread"] == 270
        assert organic["responseValence"] == -0.5
        assert organic["x"] == 860 and organic["y"] == 120
        assert not before["sources"][-1]["enabled"]

        page.get_by_role("button", name="초파리만 초기화", exact=True).click()
        after = exported(page)
        assert_fresh_fly(after)
        assert after["seed"] != before["seed"], "Fly-only reset reused the previous trial seed"
        assert after["sources"] == before["sources"], "Fly-only reset changed a chemical setting"
        assert after["chemicalModel"] == before["chemicalModel"]
        expect(page.get_by_test_id("simulation-time")).to_have_text("00:00")
        checks.append("fly resets to center with fresh internal state while all chemical fields are preserved")

        expect(page.locator(".selected-label h3")).to_have_text("에탄올 10%")
        expect(page.locator("#concentration-basis")).to_have_value("w/v")
        expect(page.get_by_label("추가할 화학물질")).to_have_value("2-phenylethanol-0.05")
        expect(page.get_by_role("button", name="2×", exact=True)).to_have_attribute("aria-pressed", "true")
        expect(page.get_by_role("button", name="시뮬레이션 재생")).to_be_visible()
        for label in ["이동 경로 표시", "농도 분포 표시"]:
            expect(page.get_by_role("button", name=label)).to_have_attribute("aria-pressed", "false")
        expect(page.locator(".event-row")).to_have_count(1)
        points = page.locator(".sparkline polyline").get_attribute("points")
        assert all(float(point.split(",")[1]) == 48 for point in points.split())
        checks.append("selection, pending preset, playback settings and display toggles survive reset")

        page.get_by_role("button", name="초파리만 초기화", exact=True).click()
        page.wait_for_timeout(800)
        repeated = exported(page)
        assert_fresh_fly(repeated)
        assert repeated["seed"] != after["seed"]
        assert repeated["initialConditions"]["angle"] != after["initialConditions"]["angle"]
        assert {key: value for key, value in repeated["state"].items() if key != "angle"} == {
            key: value for key, value in after["state"].items() if key != "angle"
        }, "A new heading must not preserve stale internal state"
        assert repeated["sources"] == before["sources"]
        expect(page.locator(".event-row")).to_have_count(1)
        checks.append("repeated paused resets choose a new seed and heading, with fresh state and one behavior event")

        page.get_by_role("button", name="화학물질 추가", exact=True).click()
        added = exported(page)
        ids = [source["id"] for source in added["sources"]]
        assert len(ids) == len(set(ids)) == 5
        assert ids[-1] == "source-6", "Fly-only reset reset the source ID counter"
        assert added["sources"][-1]["chemical"] == "2-phenylethanol"
        assert added["sources"][-1]["solutionConcentration"] == 0.05
        checks.append("adding after reset keeps the pending preset and never reuses existing source IDs")

        page.get_by_role("button", name="시뮬레이션 재생").click()
        page.wait_for_timeout(1900)
        running_before = exported(page)
        assert running_before["time"] > 2.5
        page.get_by_role("button", name="초파리만 초기화", exact=True).click()
        expect(page.get_by_role("button", name="시뮬레이션 일시정지")).to_be_visible()
        page.wait_for_timeout(400)
        page.get_by_role("button", name="시뮬레이션 일시정지").click()
        running_after = exported(page)
        assert 0 < running_after["time"] < running_before["time"]
        assert running_after["seed"] != running_before["seed"]
        assert running_after["sources"] == running_before["sources"]
        expect(page.get_by_role("button", name="2×", exact=True)).to_have_attribute("aria-pressed", "true")
        checks.append("reset during playback keeps the simulation running with the same environment and speed")
        page.screenshot(path=str(OUTPUT / "reset-desktop.png"), full_page=True)

        page.get_by_role("button", name="실험 초기화", exact=True).click()
        complete = exported(page)
        assert_fresh_fly(complete)
        assert complete["seed"] != running_after["seed"]
        assert len(complete["sources"]) == 2
        assert complete["sources"][0]["id"] == "source-1" and complete["sources"][0]["amount"] == 72
        assert complete["sources"][1]["chemical"] == "benzaldehyde"
        expect(page.locator(".selected-label h3")).to_have_text("에틸 아세테이트")
        checks.append("the separate complete-reset button still restores the original environment")

        mobile = context.new_page()
        mobile.set_viewport_size({"width": 390, "height": 844})
        mobile.on("pageerror", lambda error: errors.append(str(error)))
        mobile.goto(BASE_URL, wait_until="networkidle")
        expect(mobile.get_by_text("7,000개 표본 뉴런")).to_be_visible()
        mobile.get_by_role("button", name="시뮬레이션 일시정지").click()
        add(mobile, "acetic-acid-0.5")
        mobile_before = exported(mobile)
        fly_button = mobile.get_by_role("button", name="초파리만 초기화", exact=True)
        fly_button.scroll_into_view_if_needed()
        expect(fly_button).to_be_visible()
        expect(mobile.get_by_role("button", name="실험 초기화", exact=True)).to_be_visible()
        fly_button.click()
        mobile_after = exported(mobile)
        assert_fresh_fly(mobile_after)
        assert mobile_after["seed"] != mobile_before["seed"]
        assert mobile_after["sources"] == mobile_before["sources"]
        assert not mobile.evaluate("document.documentElement.scrollWidth > innerWidth"), "Mobile horizontal overflow"
        expect(mobile.locator(".toast")).not_to_be_visible(timeout=5000)
        expect(mobile.locator(".reset-hint")).to_be_visible()
        mobile.locator(".reset-actions").screenshot(path=str(OUTPUT / "reset-mobile-toolbar.png"))
        mobile.screenshot(path=str(OUTPUT / "reset-mobile.png"), full_page=True)
        checks.append("390px mobile layout exposes both reset actions and preserves placed sources")
        assert not errors, f"Browser runtime errors: {errors}"
        browser.close()
    print(json.dumps({"passed": len(checks), "checks": checks, "runtime_errors": errors}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
