#!/usr/bin/env python3
"""
Fetch Planet, Umbra, ICEYE, and Satellogic footprints + dates from CSDAP STAC API (no auth needed for search).
Exports GeoJSON and CSV so you can overlay with CAL FIRE in QGIS and find multi-mission overlap.

Usage:
  pip install pystac-client
  python scripts/csdap_planet_umbra_footprints.py

Outputs (in data/data_availability/):
  - planet_footprints_ca.geojson, umbra_footprints_ca.geojson
  - iceye_footprints_ca.geojson, satellogic_footprints_ca.geojson
  - Corresponding .csv files (id, datetime, bbox) for each.
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

try:
    from pystac_client import Client
except ImportError:
    print("Install pystac-client: pip install pystac-client", file=sys.stderr)
    sys.exit(1)

# California bbox (min_lon, min_lat, max_lon, max_lat) — expand if you want more
CA_BBOX = [-124.5, 32.5, -114.0, 42.0]
# Temporal window: 2024 and 2025 only
DATE_RANGE = "2024-01-01/2025-12-31"
STAC_URL = "https://csdap.earthdata.nasa.gov/stac/"
OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "data_availability"


def fetch_footprints(collection: str, bbox: list[float], datetime: str) -> list[dict]:
    """Search CSDAP STAC for items; return list of {id, datetime, geometry, bbox}."""
    client = Client.open(STAC_URL)
    # bbox order for pystac: [west, south, east, north]
    search = client.search(
        collections=[collection],
        bbox=bbox,
        datetime=datetime,
        max_items=10_000,
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


def to_geojson(features: list[dict], collection: str) -> dict:
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


def to_csv(features: list[dict], path: Path) -> None:
    """Write id, datetime, bbox to CSV."""
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["id", "datetime", "min_lon", "min_lat", "max_lon", "max_lat"])
        for row in features:
            bbox = row.get("bbox") or []
            w.writerow([row["id"], row["datetime"]] + (bbox if len(bbox) >= 4 else ["", "", "", ""]))


def main() -> None:
    out_dir = OUT_DIR
    out_dir.mkdir(parents=True, exist_ok=True)

    print("Searching CSDAP STAC (no auth required)...")
    print(f"  bbox: {CA_BBOX}, datetime: {DATE_RANGE}")

    COLLECTIONS = [
        ("planet", "Planet"),
        ("umbra", "Umbra"),
        ("iceye", "ICEYE"),
        ("satellogic", "Satellogic"),
    ]
    for collection, name in COLLECTIONS:
        print(f"\n{name}...")
        try:
            features = fetch_footprints(collection, CA_BBOX, DATE_RANGE)
        except Exception as e:
            print(f"  error: {e}")
            continue
        print(f"  found {len(features)} items")

        geojson = to_geojson(features, collection)
        geojson_path = out_dir / f"{collection}_footprints_ca.geojson"
        with geojson_path.open("w", encoding="utf-8") as f:
            json.dump(geojson, f, indent=2)
        print(f"  wrote {geojson_path}")

        csv_path = out_dir / f"{collection}_footprints_ca.csv"
        to_csv(features, csv_path)
        print(f"  wrote {csv_path}")

    print("\nDone. Open the GeoJSONs in QGIS and overlay CAL FIRE perimeters to find fire & Planet & Umbra & ICEYE & Satellogic overlap.")


if __name__ == "__main__":
    main()
