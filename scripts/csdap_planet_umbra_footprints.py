#!/usr/bin/env python3
"""
Fetch Planet, Umbra, ICEYE, and Satellogic footprints + dates from CSDAP STAC API (no auth needed for search).
Uses each collection's temporal extent from the API when available; otherwise fallback ranges.
Planet is fetched in date-range chunks (2024, 2025 H1, 2025 H2) to stay under the 10k footprint cap and get
2024/early-2025 coverage for same-week or same-month P+U overlap with Umbra.
Exports GeoJSON and CSV so you can overlay with CAL FIRE in QGIS and find multi-mission overlap.

Usage:
  pip install pystac-client
  python scripts/csdap_planet_umbra_footprints.py
  python scripts/csdap_planet_umbra_footprints.py --preset conus --collections iceye --tag us
  python scripts/csdap_planet_umbra_footprints.py --bbox -103.5 35.0 -99.5 37.5 --collections iceye --datetime 2024-02-15/2024-03-31 --tag smokehouse

Outputs (in data/data_availability/):
  - planet_footprints_<tag>.geojson, umbra_footprints_<tag>.geojson, iceye_*, satellogic_*
  - collection_temporal_extent.json — start/end dates per collection (from API or fallback)
  - Corresponding .csv files (id, datetime, bbox) for each.
"""

import argparse
import csv
import json
import sys
import urllib.request
from pathlib import Path

try:
    from pystac_client import Client
except ImportError:
    print("Install pystac-client: pip install pystac-client", file=sys.stderr)
    sys.exit(1)

# Default bbox (California) (min_lon, min_lat, max_lon, max_lat)
CA_BBOX = [-124.5, 32.5, -114.0, 42.0]
# Continental US (rough) (CONUS)
CONUS_BBOX = [-125.0, 24.0, -66.0, 49.5]
STAC_URL = "https://csdap.earthdata.nasa.gov/stac/"
OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "data_availability"

# Fallback date ranges when collection extent is empty or null (e.g. Planet has empty extent; Satellogic has null)
FALLBACK_DATE_RANGES = {
    "planet": "2024-01-01/2025-12-31",
    "umbra": "2024-01-01/2025-12-31",
    "iceye": "2019-01-01/2024-12-31",
    "satellogic": "2025-11-01/2026-12-31",
}

# Planet footprint search is capped at 10k items per request. Use date-range chunks so we get
# 2024 and early 2025 coverage instead of filling the cap with mid–late 2025 only.
PLANET_DATE_CHUNKS = [
    "2024-01-01/2024-12-31",
    "2025-01-01/2025-06-30",
    "2025-07-01/2025-12-31",
]
PLANET_FOOTPRINT_CAP = 10000


def get_collection_temporal_extent(collection_id):
    """
    Fetch collection metadata from CSDAP STAC and return (start_date, end_date, source).
    start/end are YYYY-MM-DD or None. source is "api" or "fallback".
    """
    url = "{}/collections/{}".format(STAC_URL.rstrip("/"), collection_id)
    try:
        with urllib.request.urlopen(url, timeout=30) as resp:
            data = json.loads(resp.read().decode())
    except Exception as e:
        print("  (could not fetch collection extent: {})".format(e))
        return None, None, "fallback"
    extent = data.get("extent") or {}
    temporal = extent.get("temporal") or {}
    intervals = temporal.get("interval") or []
    if not intervals or not intervals[0]:
        return None, None, "fallback"
    first = intervals[0]
    start_raw, end_raw = first[0], first[1]
    start = start_raw[:10] if start_raw and len(str(start_raw)) >= 10 else None
    end = end_raw[:10] if end_raw and len(str(end_raw)) >= 10 else None
    return start, end, "api"


def date_range_from_extent(collection_id):
    """
    Get search date range for collection: from API extent if available, else fallback.
    Returns (date_range_str, info_dict for JSON).
    """
    start, end, source = get_collection_temporal_extent(collection_id)
    if start and end:
        date_range = "{}/{}".format(start, end)
        info = {"start": start, "end": end, "source": source}
        return date_range, info
    fallback = FALLBACK_DATE_RANGES.get(collection_id, "2019-01-01/2026-12-31")
    # parse fallback to fill info
    if "/" in fallback:
        s, e = fallback.split("/", 1)
        info = {"start": s, "end": e, "source": "fallback"}
    else:
        info = {"start": None, "end": None, "source": "fallback"}
    return fallback, info


def fetch_footprints(collection, bbox, datetime, max_items=10000):
    """Search CSDAP STAC for items; return list of {id, datetime, geometry, bbox}."""
    client = Client.open(STAC_URL)
    # bbox order for pystac: [west, south, east, north]
    search = client.search(
        collections=[collection],
        bbox=bbox,
        datetime=datetime,
        max_items=max_items,
    )
    items = list(search.items())
    out = []
    for item in items:
        dt = item.datetime.isoformat() if item.datetime else ""
        out.append({
            "id": item.id,
            "datetime": dt,
            "geometry": item.geometry,
            "bbox": item.bbox,
        })
    return out


def fetch_planet_footprints_chunked(bbox):
    """
    Fetch Planet footprints in date-range chunks to stay under the 10k cap per request.
    Ensures 2024 and early 2025 coverage instead of only mid–late 2025.
    Merges and deduplicates by item id.
    """
    seen_ids = set()
    merged = []
    for date_range in PLANET_DATE_CHUNKS:
        features = fetch_footprints("planet", bbox, date_range, max_items=PLANET_FOOTPRINT_CAP)
        if len(features) >= PLANET_FOOTPRINT_CAP:
            print(
                "  warning: {} hit cap ({}); consider splitting bbox or sub-dates".format(
                    date_range, PLANET_FOOTPRINT_CAP
                )
            )
        for f in features:
            if f["id"] not in seen_ids:
                seen_ids.add(f["id"])
                merged.append(f)
        print("  {}: {} items (total so far: {})".format(date_range, len(features), len(merged)))
    return merged


def to_geojson(features, collection):
    """Build GeoJSON FeatureCollection."""
    geojson_features = []
    for f in features:
        geojson_features.append({
            "type": "Feature",
            "id": f["id"],
            "properties": {
                "id": f["id"],
                "datetime": f["datetime"],
                "collection": collection,
            },
            "geometry": f["geometry"],
        })
    return {"type": "FeatureCollection", "features": geojson_features}


def to_csv(features, path):
    """Write id, datetime, bbox to CSV."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "datetime", "min_lon", "min_lat", "max_lon", "max_lat"])
        for row in features:
            bbox = row.get("bbox") or []
            w.writerow([row["id"], row["datetime"]] + (bbox if len(bbox) >= 4 else ["", "", "", ""]))


def parse_args():
    p = argparse.ArgumentParser(description="Fetch STAC item footprints to GeoJSON/CSV.")
    p.add_argument(
        "--bbox",
        nargs=4,
        type=float,
        metavar=("MIN_LON", "MIN_LAT", "MAX_LON", "MAX_LAT"),
        help="Search bbox in EPSG:4326 (west south east north). Overrides --preset.",
    )
    p.add_argument(
        "--preset",
        choices=["ca", "conus"],
        default="ca",
        help="Convenience bbox preset (default: ca).",
    )
    p.add_argument(
        "--tag",
        default=None,
        help="Output tag used in filenames (default: preset name).",
    )
    p.add_argument(
        "--collections",
        default="planet,umbra,iceye,satellogic",
        help="Comma-separated collections to fetch (default: all). Example: iceye",
    )
    p.add_argument(
        "--datetime",
        default=None,
        help="Optional STAC datetime range override (YYYY-MM-DD/YYYY-MM-DD). If omitted, uses collection extents/fallbacks.",
    )
    return p.parse_args()


def main():
    args = parse_args()
    out_dir = OUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    print("Fetching collection temporal extents from CSDAP STAC API...")
    requested = [c.strip() for c in str(args.collections).split(",") if c.strip()]
    collection_ids = requested
    extent_records = {}
    collection_config = []  # (id, display_name, date_range)

    for collection_id in collection_ids:
        if args.datetime:
            date_range, info = args.datetime, {"start": None, "end": None, "source": "cli"}
        else:
            date_range, info = date_range_from_extent(collection_id)
        extent_records[collection_id] = info
        name = collection_id.capitalize()
        collection_config.append((collection_id, name, date_range))
        print("  {}: {} (source: {})".format(name, date_range, info["source"]))

    extent_path = out_dir / "collection_temporal_extent.json"
    with extent_path.open("w", encoding="utf-8") as f:
        json.dump(extent_records, f, indent=2)
    print("  wrote {}\n".format(extent_path))

    print("Searching CSDAP STAC (no auth required)...")
    if args.bbox:
        search_bbox = list(args.bbox)
        preset_name = "custom"
    else:
        if args.preset == "conus":
            search_bbox = CONUS_BBOX
            preset_name = "conus"
        else:
            search_bbox = CA_BBOX
            preset_name = "ca"
    tag = args.tag or preset_name
    print("  bbox: {} (tag: {})".format(search_bbox, tag))
    print("  Slide priority: 6 (all) > 5 (e.g. Planet+Umbra+ICEYE+Landsat+Sentinel) > 4 (Planet+Umbra+Landsat+Sentinel). Landsat+Sentinel always available.")

    for collection, name, date_range in collection_config:
        print("\n{} ({})...".format(name, date_range))
        try:
            if collection == "planet":
                features = fetch_planet_footprints_chunked(search_bbox)
                print("  found {} items (merged from date chunks)".format(len(features)))
            else:
                features = fetch_footprints(collection, search_bbox, date_range)
                print("  found {} items".format(len(features)))
        except Exception as e:
            print("  error: {}".format(e))
            continue

        geojson = to_geojson(features, collection)
        geojson_path = out_dir / "{}_footprints_{}.geojson".format(collection, tag)
        with geojson_path.open("w", encoding="utf-8") as f:
            json.dump(geojson, f, indent=2)
        print("  wrote {}".format(geojson_path))

        csv_path = out_dir / "{}_footprints_{}.csv".format(collection, tag)
        to_csv(features, csv_path)
        print("  wrote {}".format(csv_path))

    print("\nDone. Open the GeoJSONs in QGIS and overlay CAL FIRE perimeters.")
    print("  Best: 6 (Planet+Umbra+Satellogic+ICEYE+Landsat+Sentinel). Satellogic intersection may not be possible.")
    print("  Second: 5 (e.g. Planet+Umbra+ICEYE+Landsat+Sentinel). Else: 4 (Planet+Umbra+Landsat+Sentinel).")


if __name__ == "__main__":
    main()
