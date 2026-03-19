#!/usr/bin/env python3
"""
Download NIFC WFIGS interagency fire perimeters (GeoJSON) into data/nifc_perimeters/.
Run this once so find_fires_intersecting_satellogic.py can use entire USA.

Usage:
  pip install requests
  python scripts/download_nifc_perimeters.py
"""

from __future__ import annotations

import sys
from pathlib import Path

# NIFC WFIGS current perimeters (refreshed regularly)
WFIGS_QUERY = (
    "https://services3.arcgis.com/T4QMspbfLg3qTGWY/arcgis/rest/services/"
    "WFIGS_Interagency_Perimeters_Current/FeatureServer/0/query"
    "?where=1%3D1&outFields=*&outSR=4326&f=geojson&resultRecordCount=2000"
)
OUT_DIR = Path(__file__).resolve().parent.parent / "data" / "nifc_perimeters"
OUT_FILE = OUT_DIR / "wfigs_current.geojson"


def main() -> None:
    try:
        import requests
    except ImportError:
        print("Install requests: pip install requests", file=sys.stderr)
        sys.exit(1)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    print("Downloading NIFC WFIGS perimeters...")
    r = requests.get(WFIGS_QUERY, timeout=60)
    r.raise_for_status()
    data = r.json()
    if "features" not in data:
        print("Unexpected response; check URL.", file=sys.stderr)
        sys.exit(1)
    n = len(data.get("features", []))
    with open(OUT_FILE, "w", encoding="utf-8") as f:
        import json
        json.dump(data, f, indent=0)
    print(f"Wrote {n} features to {OUT_FILE}")


if __name__ == "__main__":
    main()
