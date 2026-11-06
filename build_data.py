"""Build data.js for the precipitation data sources dashboard.

Reads the JSON directories in ../data_sources/data_sources_json, drops the
sources removed from the dashboard (REMOVED; copies are in
../data_sources/removed_from_dashboard), and tags every remaining entry with
its topics. Sources from the invitee roster are added next: new entries,
plus extra endpoints for existing ones. The USGS entry (Other US) is added next, from its own file. State agency
sources come last; entries they replace (marked alreadyOnDashboard) leave Other US.

Run:  python3 build_data.py
"""
import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
SRC = HERE.parent / "data_sources" / "data_sources_json"

AGENCY_FILES = [
    ("NASA", "nasa_eosdis-daac-directory_all.json"),
    ("NOAA", "noaa-data-directory.json"),
    ("NSF", "nsf-data-directory_claude.json"),
    ("NWS", "nws-data-directory_claude.json"),
]
PROJECTS_FILE = "us-government-meteorology-research-projects_and_non_digital.json"
ROSTER_FILE = "invitee-roster-sources.json"
ROSTER_GROUPS = ["Other US", "International"]
USGS_FILE = "usgs-sources.json"
STATES_FILE = "state-agencies-sources.json"
STATES_GROUP = "State agencies"

# Removed from the dashboard: little or no precipitation data. Their entries stay in the
# source files; copies are in data_sources/removed_from_dashboard/removed_from_dashboard.json.
REMOVED = {
    "nasa-sedac": "Socioeconomic and population data; no precipitation holdings.",
    "nasa-cddis": "Space geodesy (GNSS, laser ranging); no precipitation holdings.",
    "nasa-asf": "Synthetic aperture radar imagery of land and ice; no precipitation products.",
    "nasa-lpdaac": "Land surface remote sensing (land cover, elevation, vegetation).",
    "nasa-obdaac": "Ocean biology and ocean color.",
    "nasa-asdc": "Radiation budget, clouds and aerosols; no precipitation products.",
    "noaa-coops": "Tides, currents and water levels.",
    "noaa-coastwatch": "Sea surface temperature, ocean color and altimetry.",
    "noaa-inport": "Fisheries and ecosystem metadata catalog.",
    "noaa-digitalcoast": "Coastal mapping, lidar and land cover.",
    "noaa-gml": "Greenhouse gases and air chemistry.",
    "noaa-ngs": "Geodesy, positioning and gravity.",
    "nsf-opentopo": "Lidar point clouds and topography.",
    "nsf-bcodmo": "Ocean biogeochemistry and ecosystem data.",
    "nsf-designsafe": "Natural hazards engineering; mostly wind, surge and earthquake data.",
    "nws-nwws": "Alert and warning delivery feed, not a data archive.",
    "extra-recovering-from-tornado-brain": "Mental-health study of tornado survivors; no weather data.",
    "extra-totable-tornado-observatory-toto": "In-situ tornado wind measurements; no precipitation records.",
    "extra-project-nimrod": "Downburst (wind) study; no precipitation records listed.",
    "extra-torus-project": "Supercell and tornado structure (radar and drones); wind focused.",
    "extra-lift-project": "Low-level tornado flow; wind focused.",
}

# Precipitation topics, shared across agencies.
TOPICS = {
    "satellite": "Satellite",
    "radar": "Radar",
    "gauges": "Gauges & stations",
    "models": "Models & reanalysis",
    "hydrology": "Hydrology",
    "snow": "Snow & ice",
    "field": "Field campaigns",
    "nondigital": "Non-digital",
    "other": "Other",
}

ENTRY_TOPICS = {
    "nasa-laads": ["satellite"], "nasa-podaac": ["satellite", "hydrology"],
    "nasa-gesdisc": ["satellite", "models"], "nasa-nsidc": ["satellite", "snow"],
    "nasa-ornl": ["gauges", "models"], "nasa-ghrc": ["satellite", "radar", "field"],
    "noaa-ncei": ["gauges", "radar", "satellite"], "noaa-rwrc": ["gauges"],
    "noaa-nodd": ["radar", "satellite", "models"], "noaa-class": ["satellite"],
    "noaa-ndbc": ["gauges"], "noaa-gfdl": ["models"], "noaa-pmel": ["gauges"],
    "noaa-aoml": ["radar", "field"],
    "nsf-rda": ["models", "satellite", "radar"],
    "nsf-eol": ["field", "radar"], "nsf-unidata": ["radar", "models"],
    "nsf-neon": ["gauges"], "nsf-edi": ["gauges"], "nsf-cuahsi": ["hydrology", "gauges"],
    "nsf-arctic": ["snow"], "nsf-usapdc": ["snow", "gauges"], "nsf-dataone": ["other"],
    "nws-api": ["gauges"], "nws-ndfd": ["models"], "nws-mrms": ["radar", "gauges"],
    "nws-nexrad": ["radar"], "nws-nwps": ["hydrology", "radar"],
    "nws-nwm": ["hydrology", "models", "snow"], "nws-nomads": ["models"],
    "nws-tgftp": ["other"], "nws-spc": ["other"],
    "nws-nhc": ["models"], "nws-wfo": ["gauges"],
}


def slug(text):
    out = "".join(c.lower() if c.isalnum() else "-" for c in text)
    return "-".join(p for p in out.split("-") if p)


def agency_entries():
    entries, meta = [], {}
    for agency, filename in AGENCY_FILES:
        doc = json.loads((SRC / filename).read_text())
        meta[agency] = {"title": doc["title"], "notes": doc.get("notes", []), "file": filename}
        for c in doc["dataCenters"]:
            entry_id = f"{agency.lower()}-{c['id']}"
            if entry_id in REMOVED:
                continue
            entries.append({
                "id": entry_id,
                "agency": agency,
                "kind": "data-center",
                "name": c["name"],
                "fullName": c["fullName"],
                "host": c["host"],
                "location": c["location"],
                "discipline": c["discipline"],
                "topics": ENTRY_TOPICS.get(entry_id, ["other"]),
                "blurb": c["blurb"],
                "holdings": c["missions"],
                "formats": c["formats"],
                "volumeTB": c["volumeTB"],
                "filesM": c["filesM"],
                "datasets": c["datasets"],
                "endpoints": c["endpoints"],
                "sources": [{"label": s["label"], "url": s["url"]} for s in c["sources"]],
            })
    return entries, meta


def project_entries():
    doc = json.loads((SRC / PROJECTS_FILE).read_text())
    entries = []
    for p in doc["projects"]:
        entry_id = f"extra-{slug(p['project'])}"
        if entry_id in REMOVED:
            continue
        orgs = [o["name"] for o in p["organizations"]]
        archival = p["archivalSources"]
        endpoints = [{"name": "Project overview", "url": p["projectUrl"]}] if p["projectUrl"] else []
        endpoints += [{"name": a["name"], "url": a["url"]} for a in archival if a["url"]]
        entries.append({
            "id": entry_id,
            "agency": "Extra",
            "kind": "research-project",
            "name": p["project"],
            "fullName": p["project"],
            "host": "; ".join(orgs),
            "location": "",
            "discipline": f"Research project, {p['years']}",
            "topics": ["field"],
            "blurb": f"US government meteorology research project ({p['years']}) run by {', '.join(orgs)}.",
            "holdings": [a["name"] + (f" ({a['note']})" if a.get("note") else "") for a in archival],
            "formats": [],
            "volumeTB": None,
            "filesM": None,
            "datasets": None,
            "endpoints": endpoints,
            "sources": [{"label": r["citation"], "url": r["url"]} for r in p["references"]],
            "years": p["years"],
            "startYear": p["startYear"],
            "endYear": p["endYear"],
            "ongoing": p["ongoing"],
            "organizations": orgs,
            "archivalSources": archival,
        })
    return entries, {"title": doc["title"], "notes": [f"Source: {doc['source']}"], "file": PROJECTS_FILE}


def add_unique(items, extra, key):
    seen = {i[key].rstrip("/") for i in items}
    items += [x for x in extra if x[key].rstrip("/") not in seen]


def data_center_entry(c):
    """An entry from a data center in the roster or USGS file, which list topics and agency themselves."""
    return {
        "id": f"{slug(c['agency'])}-{c['id']}",
        "agency": c["agency"],
        "kind": "data-center",
        "name": c["name"],
        "fullName": c["fullName"],
        "host": c["host"],
        "location": c["location"],
        "discipline": c["discipline"],
        "topics": c["topics"],
        "blurb": c["blurb"],
        "holdings": c["missions"],
        "formats": c["formats"],
        "volumeTB": c["volumeTB"],
        "filesM": c["filesM"],
        "datasets": c["datasets"],
        "endpoints": c["endpoints"],
        "sources": c["sources"],
    }


def add_roster(entries, meta):
    """Adds the invitee-roster sources (its notAdded items are not used)."""
    doc = json.loads((SRC / ROSTER_FILE).read_text())
    entries += [data_center_entry(c) for c in doc["dataCenters"]]
    by_id = {e["id"]: e for e in entries}
    unknown = set(doc["additionalEndpoints"]) - set(by_id)
    assert not unknown, f"Unknown ids in additionalEndpoints: {sorted(unknown)}"
    for entry_id, extra in doc["additionalEndpoints"].items():
        e = by_id[entry_id]
        add_unique(e["endpoints"], extra["endpoints"], "url")
        add_unique(e["sources"], extra["sources"], "url")
        e["holdings"] += [h for h in extra["holdings"] if h not in e["holdings"]]
    roster_meta = {"title": doc["title"], "notes": doc["notes"], "file": ROSTER_FILE}
    for group in ROSTER_GROUPS:
        meta[group] = roster_meta


def add_usgs(entries, meta):
    """Adds the USGS entry (Other US) and its notes to the Other US notes."""
    doc = json.loads((SRC / USGS_FILE).read_text())
    entries += [data_center_entry(c) for c in doc["dataCenters"]]
    other = meta["Other US"]
    meta["Other US"] = {**other, "notes": other["notes"] + doc["notes"]}


def add_states(entries, meta):
    """Adds the state agency sources and drops the Other US entries they replace."""
    doc = json.loads((SRC / STATES_FILE).read_text())
    moved = {c["alreadyOnDashboard"] for c in doc["dataCenters"] if c["alreadyOnDashboard"]}
    unknown = moved - {e["id"] for e in entries}
    assert not unknown, f"Unknown ids in alreadyOnDashboard: {sorted(unknown)}"
    entries[:] = [e for e in entries if e["id"] not in moved]
    for c in doc["dataCenters"]:
        e = data_center_entry(c)
        e.update(state=c["state"], stateCodes=c["stateCodes"], orgType=c["orgType"],
                 datasetDetails=c["datasetDetails"])
        entries.append(e)
    meta[STATES_GROUP] = {"title": doc["title"], "notes": doc["notes"], "file": STATES_FILE}


def main():
    entries, meta = agency_entries()
    projects, meta["Extra"] = project_entries()
    entries += projects
    add_roster(entries, meta)
    add_usgs(entries, meta)
    add_states(entries, meta)
    # Sources with no data endpoint at all are tagged Non-digital.
    for e in entries:
        if not e["endpoints"]:
            e["topics"].append("nondigital")
    ids = {e["id"] for e in entries}
    missing = set(ENTRY_TOPICS) - ids
    assert not missing, f"Unknown ids in ENTRY_TOPICS: {sorted(missing)}"

    payload = {"topics": TOPICS, "meta": meta, "entries": entries}
    js = (
        "/* Generated by build_data.py from data_sources/data_sources_json. Do not edit by hand. */\n"
        f"window.PRECIP_DATA = {json.dumps(payload, ensure_ascii=False, indent=1)};\n"
    )
    (HERE / "data.js").write_text(js)
    counts = {}
    for e in entries:
        counts[e["agency"]] = counts.get(e["agency"], 0) + 1
    print(f"{len(entries)} entries written; {counts}; removed {len(REMOVED)}")


if __name__ == "__main__":
    main()
