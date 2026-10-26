#!/usr/bin/env python3
"""Exercise chemical presets, dose metadata, controls, and browser export.

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
PRESETS = [
    ("2-phenylethanol-0.01", "2-phenylethanol", 0.01),
    ("2-phenylethanol-0.05", "2-phenylethanol", 0.05),
    ("2-phenylethanol-0.1", "2-phenylethanol", 0.1),
    ("ethanol-1", "ethanol", 1),
    ("ethanol-5", "ethanol", 5),
    ("ethanol-10", "ethanol", 10),
    ("acetic-acid-0.1", "acetic-acid", 0.1),
    ("acetic-acid-0.5", "acetic-acid", 0.5),
    ("acetic-acid-1", "acetic-acid", 1),
    ("dw", "dw", None),
    ("pbs-1x", "pbs", None),
]


def exported(page):
    with page.expect_download() as download:
        page.get_by_role("button", name="기록 저장").click()
    return json.loads(Path(download.value.path()).read_text())


def by_id(items, source_id):
    return next(item for item in items if item["id"] == source_id)


def add(page, preset_id):
    page.get_by_label("추가할 화학물질").select_option(preset_id)
    page.get_by_role("button", name="화학물질 추가", exact=True).click()


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
        page.get_by_role("button", name="시뮬레이션 일시정지").click()
        initial = exported(page)
        options = page.get_by_label("추가할 화학물질").locator("option").evaluate_all("els => els.map(el => el.value)")
        assert len(options) == 14 and len(set(options)) == 14
        assert all(preset_id in options for preset_id, _, _ in PRESETS)
        checks.append("all 11 requested conditions and three legacy conditions are available")

        for preset_id, chemical, dose in PRESETS:
            add(page, preset_id)
            if dose is not None:
                expect(page.locator("#solution-concentration")).to_have_value(str(dose))
                expect(page.locator("#concentration-basis")).to_have_value("unspecified")
            else:
                expect(page.locator(".control-notice")).to_contain_text("후각 자극이 0")
                expect(page.locator("#solution-concentration")).to_have_count(0)
        dataset = exported(page)
        assert len(dataset["sources"]) == 13
        for index, (_, chemical, dose) in enumerate(PRESETS, start=3):
            src = by_id(dataset["sources"], f"source-{index}")
            assert src["chemical"] == chemical
            if dose is not None:
                assert src["solutionConcentration"] == dose
                assert src["concentrationBasis"] == "unspecified"
            else:
                assert "solutionConcentration" not in src, "A control was incorrectly assigned a percent"
        assert dataset["state"] == initial["state"], "Editing conditions changed the paused fly"
        checks.append("all 11 presets can be added with exact nominal doses while paused")

        for source_id in ["source-12", "source-13"]:
            model = by_id(dataset["chemicalModel"]["sources"], source_id)
            assert model["isControl"] and model["relativeStrength"] == 0 and model["responseValence"] == 0
        assert "1× PBS" in by_id(dataset["chemicalModel"]["sources"], "source-13")["label"]
        checks.append("DW and 1x PBS export as zero-odor controls, not percentage solutions")

        page.locator(".source-select").filter(has_text="2-페닐에탄올 0.01%").click()
        page.locator("#solution-concentration").select_option("0.05")
        page.locator("#concentration-basis").select_option("v/v")
        amount = page.locator("#amount")
        amount.focus()
        amount.press("Home")
        for _ in range(4):
            amount.press("ArrowRight")
        page.locator("#response-valence").focus()
        page.locator("#response-valence").press("Home")
        edited = exported(page)
        src = by_id(edited["sources"], "source-3")
        model = by_id(edited["chemicalModel"]["sources"], "source-3")
        assert src["solutionConcentration"] == 0.05 and src["amount"] == 4
        assert src["concentrationBasis"] == "v/v" and src["responseValence"] == -1
        assert math.isclose(model["relativeStrength"], 0.02)
        assert model["label"] == "2-페닐에탄올 0.05%"
        expect(page.locator(".selected-label h3")).to_have_text("2-페닐에탄올 0.05%")
        checks.append("dose, independent amount, basis, and response direction update live labels and JSON")

        page.locator("#concentration-basis").select_option("w/v")
        page.locator("#response-valence").focus()
        page.locator("#response-valence").press("End")
        changed = exported(page)
        assert by_id(changed["sources"], "source-3")["responseValence"] == 1
        assert by_id(changed["sources"], "source-3")["concentrationBasis"] == "w/v"
        assert by_id(changed["chemicalModel"]["sources"], "source-3")["relativeStrength"] == model["relativeStrength"]
        assert changed["schemaVersion"] == 2
        checks.append("basis remains metadata-only and assumed valence can be reversed")

        for _ in range(3):
            add(page, "ethanol-5")
        expect(page.get_by_text("16개 배치됨")).to_be_visible()
        expect(page.get_by_role("button", name="화학물질 추가", exact=True)).to_be_disabled()
        page.get_by_role("button", name="선택한 물질 삭제").click()
        expect(page.get_by_text("15개 배치됨")).to_be_visible()
        expect(page.get_by_role("button", name="화학물질 추가", exact=True)).to_be_enabled()
        add(page, "dw")
        expect(page.get_by_text("16개 배치됨")).to_be_visible()
        expect(page.locator(".control-notice")).to_contain_text("DW")
        checks.append("16-source limit and deletion/replacement work")

        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth"), "Desktop horizontal overflow"
        page.get_by_role("button", name="시뮬레이션 재생").click()
        page.wait_for_timeout(700)
        page.get_by_role("button", name="시뮬레이션 일시정지").click()
        run = exported(page)
        assert run["time"] > initial["time"]
        assert all(math.isfinite(value) for value in run["state"]["activities"].values())
        expect(page.get_by_text("7,000개 표본 뉴런")).to_be_visible()
        page.screenshot(path=str(OUTPUT / "chemical-desktop.png"), full_page=True)
        checks.append("all mixed sources run with finite regional activity and intact brain map")

        mobile = context.new_page()
        mobile.set_viewport_size({"width": 390, "height": 844})
        mobile.on("pageerror", lambda error: errors.append(str(error)))
        mobile.goto(BASE_URL, wait_until="networkidle")
        expect(mobile.get_by_text("7,000개 표본 뉴런")).to_be_visible()
        mobile.get_by_role("button", name="시뮬레이션 일시정지").click()
        add(mobile, "2-phenylethanol-0.01")
        mobile.locator("#solution-concentration").select_option("0.1")
        mobile.locator("#concentration-basis").select_option("v/v")
        expect(mobile.locator(".selected-label h3")).to_have_text("2-페닐에탄올 0.1%")
        assert not mobile.evaluate("document.documentElement.scrollWidth > innerWidth"), "Mobile horizontal overflow"
        mobile.screenshot(path=str(OUTPUT / "chemical-mobile.png"), full_page=True)
        add(mobile, "pbs-1x")
        expect(mobile.locator(".control-notice")).to_contain_text("1× PBS")
        checks.append("390px mobile dose and control panels work without horizontal overflow")
        assert not errors, f"Browser runtime errors: {errors}"
        browser.close()
    print(json.dumps({"passed": len(checks), "checks": checks, "runtime_errors": errors}, indent=2, ensure_ascii=False))


if __name__ == "__main__":
    main()
