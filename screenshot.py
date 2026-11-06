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
        page.get_by_text("Showing 64 of 64 sources").wait_for()
        return page

    page = open_page(1400, 900)
    page.screenshot(path=OUT / "1-dashboard.png")

    # The button reads "Show all ..." when closed and "Hide all ..." when open.
    ncei_button = re.compile(r"(Show|Hide) all \d+ data access endpoints for NCEI$")
    rwrc_button = re.compile(r"(Show|Hide) all \d+ data access endpoints for NCEI-RWRC$")
    page.get_by_role("button", name=ncei_button).click()
    page.get_by_role("heading", name="Data access endpoints").scroll_into_view_if_needed()
    page.screenshot(path=OUT / "2-ncei-panel.png")
    page.get_by_role("button", name=ncei_button).click()

    page.get_by_role("button", name=rwrc_button).click()
    page.get_by_role("heading", name="Data access endpoints").scroll_into_view_if_needed()
    page.screenshot(path=OUT / "2b-rwrc-panel.png")
    page.get_by_role("button", name=rwrc_button).click()

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

    page.get_by_role("button", name="Research projects").click()

    # Other US (PRISM, Colorado Climate Center and the two Iowa sources moved to State agencies).
    page.get_by_role("button", name="Other US").click()
    print("Other US rows:", page.locator("#result-count").inner_text())
    page.get_by_role("button", name="Show all 5 data access endpoints for USGS").click()
    page.get_by_role("heading", name="Data access endpoints").scroll_into_view_if_needed()
    page.screenshot(path=OUT / "4e-usgs-panel.png")
    page.get_by_role("button", name="Other US").click()

    # Sources with no data endpoints are tagged Non-digital.
    page.get_by_role("button", name="Non-digital").click()
    print("Non-digital rows:", page.locator("#result-count").inner_text())
    page.get_by_role("button", name="Non-digital").click()

    # International tab: same panel, international sources only.
    page.get_by_role("tab", name="International").click()
    page.get_by_text("Showing 6 of 6 sources").wait_for()
    page.screenshot(path=OUT / "4c-international.png")
    page.get_by_role("button", name="Save all as").click()
    with page.expect_download() as dl:
        page.locator("#save-all-options").get_by_role("menuitem", name="JSON").click()
    path = OUT / dl.value.suggested_filename
    dl.value.save_as(path)
    intl = json.loads(path.read_text())
    print("international JSON:", path.name, intl["title"], {a: len(v) for a, v in intl["sources"].items()})
    page.get_by_role("button", name="Show all 2 data access endpoints for GPCC").click()
    page.get_by_role("heading", name="Data access endpoints").scroll_into_view_if_needed()
    page.screenshot(path=OUT / "4d-gpcc-panel.png")

    # State agencies tab: same panel, state and local sources, with a State filter.
    page.get_by_role("tab", name="State agencies").click()
    page.get_by_text("Showing 126 of 126 sources").wait_for()
    page.evaluate("window.scrollTo(0, 0)")
    page.screenshot(path=OUT / "8-states.png")
    print("state stats:", page.locator("#stats").inner_text().replace("\n", " | "))
    page.locator("#state-filter").select_option("FL")
    print("Florida rows:", page.locator("#result-count").inner_text())
    page.get_by_role("button", name=re.compile(r"Show all \d+ data access endpoints for FAWN")).click()
    page.get_by_role("heading", name="Data access endpoints").scroll_into_view_if_needed()
    page.screenshot(path=OUT / "8b-fawn-panel.png")
    page.get_by_role("button", name="Save filtered as").click()
    with page.expect_download() as dl:
        page.locator("#save-filtered-options").get_by_role("menuitem", name="JSON").click()
    path = OUT / dl.value.suggested_filename
    dl.value.save_as(path)
    fl = json.loads(path.read_text())
    print("Florida JSON:", path.name, fl["title"], {a: len(v) for a, v in fl["sources"].items()}, "filters:", fl["filters"])
    # A source with several datasets lists each one's time step and period of record as a bullet in About.
    page.locator("#state-filter").select_option("AZ")
    page.get_by_role("button", name=re.compile(r"Show all \d+ data access endpoints for Flood Control District of Maricopa")).click()
    page.get_by_role("heading", name="Data access endpoints").scroll_into_view_if_needed()
    page.screenshot(path=OUT / "8c-multi-dataset-panel.png")
    page.locator("#state-filter").select_option("")
    page.get_by_role("tab", name="Dashboard").click()
    page.get_by_text("Showing 64 of 64 sources").wait_for()

    dark = open_page(1400, 900, "dark")
    dark.screenshot(path=OUT / "6-dark.png")

    phone = open_page(390, 844)
    overflow = phone.evaluate("document.documentElement.scrollWidth - window.innerWidth")
    phone.screenshot(path=OUT / "7-phone.png")
    # The NCEI-RWRC panel has the longest source labels (the six centers and their states).
    phone.get_by_role("button", name=rwrc_button).click()
    phone.get_by_role("heading", name="Sources", exact=True).scroll_into_view_if_needed()
    overflow = max(overflow, phone.evaluate("document.documentElement.scrollWidth - window.innerWidth"))
    phone.screenshot(path=OUT / "7b-phone-rwrc.png")
    # The State agencies panel has the widest table (three endpoint columns).
    phone.get_by_role("tab", name="State agencies").click()
    phone.get_by_role("button", name=re.compile(r"Show all \d+ data access endpoints for FAWN")).click()
    phone.get_by_role("heading", name="Data access endpoints").scroll_into_view_if_needed()
    overflow = max(overflow, phone.evaluate("document.documentElement.scrollWidth - window.innerWidth"))
    phone.screenshot(path=OUT / "7c-phone-states.png")

    print("page errors:", errors or "none")
    print("phone horizontal overflow px:", overflow)
    browser.close()
