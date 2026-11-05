"""Screenshot the precipitation dashboard in WebKit.

Run:  python screenshot.py <output-folder>
Needs the playwright package and `playwright install webkit`.
"""
import json
import re
import sys
import zipfile
from pathlib import Path
from playwright.sync_api import sync_playwright

PAGE = (Path(__file__).resolve().parent / "index.html").as_uri()
OUT = Path(sys.argv[1])
OUT.mkdir(exist_ok=True)

with sync_playwright() as p:
    browser = p.webkit.launch()
    errors = []

    def open_page(width, height, scheme="light"):
        page = browser.new_page(viewport={"width": width, "height": height}, color_scheme=scheme, accept_downloads=True)
        page.on("pageerror", lambda e: errors.append(f"{width}px {scheme}: {e}"))
        page.goto(PAGE, wait_until="domcontentloaded")
        page.get_by_text("Showing 69 of 69 sources").wait_for()
        return page

    page = open_page(1400, 900)
    page.screenshot(path=OUT / "1-dashboard.png")

    page.get_by_role("button", name="Show all 3 data access endpoints for NCEI").click()
    page.get_by_role("heading", name="Data access endpoints").scroll_into_view_if_needed()
    page.screenshot(path=OUT / "2-ncei-panel.png")

    page.get_by_role("button", name="Save all as").click()
    page.evaluate("window.scrollTo(0, 0)")
    page.locator("#save-all-options").get_by_role("menuitem", name="Excel").wait_for()
    page.screenshot(path=OUT / "3-save-menu.png")
    page.keyboard.press("Escape")

    # Filter to NOAA, then save the filtered list both ways and check what's in the files.
    page.get_by_role("button", name="NOAA").click()
    filtered_menu = page.locator("#save-filtered-options")
    saved = {}
    for fmt in ("Excel", "JSON"):
        page.get_by_role("button", name="Save filtered as").click()
        with page.expect_download() as dl:
            filtered_menu.get_by_role("menuitem", name=fmt).click()
        path = OUT / dl.value.suggested_filename
        dl.value.save_as(path)
        saved[fmt] = path
    doc = json.loads(saved["JSON"].read_text())
    with zipfile.ZipFile(saved["Excel"]) as z:
        sheets = re.findall(r'<sheet [^>]*name="([^"]+)"', z.read("xl/workbook.xml").decode())
    print("filtered JSON:", saved["JSON"].name, {a: len(v) for a, v in doc["sources"].items()}, "filters:", doc["filters"])
    print("filtered Excel:", saved["Excel"].name, "sheets:", sheets)
    print("export note:", page.locator("#export-note").inner_text())
    page.get_by_role("button", name="NOAA").click()

    page.get_by_role("button", name="Research projects").click()
    page.locator("tr.row-main", has_text="Project Cirrus").get_by_role("button").click()
    page.get_by_role("heading", name="References").scroll_into_view_if_needed()
    page.screenshot(path=OUT / "4-cirrus-panel.png")

    page.get_by_role("tab", name="Possible removals").click()
    page.screenshot(path=OUT / "5-removals.png", full_page=True)

    dark = open_page(1400, 900, "dark")
    dark.screenshot(path=OUT / "6-dark.png")

    phone = open_page(390, 844)
    overflow = phone.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    phone.screenshot(path=OUT / "7-phone.png")

    print("page errors:", errors or "none")
    print("phone horizontal overflow px:", overflow)
    browser.close()
