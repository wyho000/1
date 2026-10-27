#!/usr/bin/env python3
"""Verify new trial initialization and symmetric-attractant behavior through the UI.

Start npm run dev first. Requires Python Playwright and Chromium.
Only this test replaces crypto entropy with known seeds, making the regression
deterministic; the application itself continues to use crypto.getRandomValues.
"""
import json
import math
import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

BASE_URL = os.environ.get("FLYWIRE_BASE_URL", "http://127.0.0.1:5173/")
CHROMIUM = os.environ.get("FLYWIRE_CHROMIUM_PATH", "/usr/bin/chromium")


def exported(page):
    with page.expect_download() as download:
        page.get_by_role("button", name="기록 저장").click()
    return json.loads(Path(download.value.path()).read_text())


def trial(page, seed):
    page.evaluate("seed => { window.__nextTrialSeed = seed; }", seed)
    page.get_by_role("button", name="초파리만 초기화", exact=True).click()
    data = exported(page)
    assert data["seed"] == seed
    assert data["initialConditions"]["seed"] == seed
    assert data["behaviorModelVersion"] == 2
    assert data["state"]["time"] == 0
    assert (data["state"]["x"], data["state"]["y"]) == (500, 350)
    assert data["state"]["angle"] == data["initialConditions"]["angle"]
    assert -math.pi <= data["state"]["angle"] <= math.pi
    return data


def main():
    checks, errors, movement = [], [], []
    with sync_playwright() as p:
        browser = p.chromium.launch(executable_path=CHROMIUM, headless=True, args=["--no-sandbox"])
        context = browser.new_context(viewport={"width": 1440, "height": 1100}, accept_downloads=True)
        context.add_init_script("""
            window.__nextTrialSeed = 1000;
            const original = crypto.getRandomValues.bind(crypto);
            crypto.getRandomValues = values => {
                if (values instanceof Uint32Array && values.length === 1) {
                    values[0] = window.__nextTrialSeed++;
                    return values;
                }
                return original(values);
            };
        """)
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.clock.install()
        page.goto(BASE_URL, wait_until="networkidle")
        expect(page.get_by_text("7,000개 표본 뉴런")).to_be_visible()
        page.get_by_role("button", name="시뮬레이션 일시정지").click()
        first = exported(page)
        assert first["seed"] in (1000, 1001), "Initial load did not use browser-generated entropy"
        assert first["seed"] == first["initialConditions"]["seed"]
        assert first["behaviorModelVersion"] == 2
        checks.append("initial load exports its generated seed, initial heading and behavior-model version")

        starts = [trial(page, seed) for seed in range(16)]
        assert len({data["seed"] for data in starts}) == 16
        assert len({data["state"]["angle"] for data in starts}) == 16
        left = sum(math.cos(data["state"]["angle"]) < 0 for data in starts)
        right = len(starts) - left
        assert left >= 3 and right >= 3, (left, right)
        assert all(data["sources"] == first["sources"] for data in starts)
        expect(page.get_by_role("button", name="시뮬레이션 재생")).to_be_visible()
        checks.append(f"16 paused resets preserve sources and cover both heading sides ({left} left, {right} right)")

        # Keep one existing emitter and replace the aversive emitter with a
        # second identical attractant. Both have the same dose, range and Y.
        page.locator(".source-select").filter(has_text="벤즈알데하이드").click()
        page.get_by_role("button", name="선택한 물질 삭제").click()
        page.get_by_label("화학물질 X 위치 (mm)").fill("25")
        page.get_by_label("화학물질 Y 위치 (mm)").fill("35")
        page.locator("#amount").focus()
        page.locator("#amount").press("Home")
        for _ in range(55):
            page.locator("#amount").press("ArrowRight")
        page.locator("#spread").focus()
        for _ in range(3):
            page.locator("#spread").press("ArrowLeft")
        page.get_by_label("추가할 화학물질").select_option("ethyl-acetate")
        page.get_by_role("button", name="화학물질 추가", exact=True).click()
        page.get_by_label("화학물질 X 위치 (mm)").fill("75")
        page.get_by_label("화학물질 Y 위치 (mm)").fill("35")
        prepared = exported(page)
        assert len(prepared["sources"]) == 2
        assert [source["x"] for source in prepared["sources"]] == [250, 750]
        for source in prepared["sources"]:
            assert source["chemical"] == "ethyl-acetate" and source["enabled"]
            assert source["y"] == 350 and source["amount"] == 55 and source["spread"] == 190
        page.get_by_role("button", name="4×", exact=True).click()

        # Virtual time exercises actual App RAF updates, playback and export;
        # seeded engine ensemble tests separately cover a larger trial sample.
        for seed, direction in [(6, "right"), (7, "left")]:
            start = trial(page, seed)
            assert start["sources"] == prepared["sources"]
            page.get_by_role("button", name="시뮬레이션 재생").click()
            page.clock.run_for(2000)
            page.get_by_role("button", name="시뮬레이션 일시정지").click()
            final = exported(page)
            assert final["time"] >= 7.5
            assert final["sources"] == prepared["sources"]
            assert final["initialConditions"] == start["initialConditions"]
            assert (final["state"]["x"] > 550) if direction == "right" else (final["state"]["x"] < 450)
            movement.append({"seed": seed, "direction": direction, "x": round(final["state"]["x"], 2), "seconds": round(final["time"], 2)})
        checks.append("identical symmetric attractants produce both left and right movement through the actual UI")
        assert not errors, errors
        browser.close()
    print(json.dumps({"passed": len(checks), "checks": checks, "trials": movement, "runtime_errors": errors}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
