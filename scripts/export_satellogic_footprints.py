#!/usr/bin/env python3
"""
Export all Satellogic footprints for a bbox/date to GeoJSON.
Use the same bbox/date as find_fires_intersecting_satellogic.py (default: CONUS, 2025-11-01/2025-12-15).

Usage:
  pip install pystac-client geopandas
  python scripts/export_satellogic_footprints.py [--bbox west,south,east,north] [--date YYYY-MM-DD/YYYY-MM-DD] [--output path.geojson]

Output:
  - Footprints GeoJSON: one feature per Satellogic scene (id, datetime, geometry).
  - Optional: union of all footprints as a single polygon (--union path.geojson).
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

try:
    from pystac_client import Client
except ImportError:
    print("Install pystac-client: pip install pystac-client", file=sys.stderr)
    sys.exit(1)
try:
    import geopandas as gpd
    from shapely.geometry import shape
except ImportError:
    print("Install geopandas: pip install geopandas", file=sys.stderr)
    sys.exit(1)

CONUS_BBOX = [-125.0, 24.0, -66.0, 50.0]
DEFAULT_DATE_RANGE = "2025-11-01/2025-12-15"
STAC_URL = "https://csdap.earthdata.nasa.gov/stac/"
BASE = Path(__file__).resolve().parent.parent
DEFAULT_OUTPUT = BASE / "data" / "satellogic_footprints.geojson"


def fetch_satellogic_footprints(bbox: list[float], date_range: str) -> list[dict]:
    """Return list of {id, datetime, geometry, bbox} for Satellogic."""
    client = Client.open(STAC_URL)
    search = client.search(
        collections=["satellogic"],
        bbox=bbox,
        datetime=date_range,
        max_items=5000,
    )
    items = list(search.items())
    return [
        {
            "id": item.id,
            "datetime": item.datetime.isoformat() if item.datetime else "",
            "geometry": item.geometry,
            "bbox": item.bbox,
        }
        for item in items
    ]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export Satellogic footprints to GeoJSON (shape of all footprints)."
    )
    parser.add_argument(
        "--bbox",
        default=None,
        help="Bbox west,south,east,north. Default: CONUS.",
    )
    parser.add_argument(
        "--date",
        default=DEFAULT_DATE_RANGE,
        help="Date range YYYY-MM-DD/YYYY-MM-DD. Default: 2025-11-01/2025-12-15.",
    )
    parser.add_argument(
        "--output",
        "-o",
        default=str(DEFAULT_OUTPUT),
        help="Output GeoJSON path (all footprints as FeatureCollection). Default: data/satellogic_footprints.geojson",
    )
    parser.add_argument(
        "--union",
        default=None,
        help="Optional: also write union of all footprints to this GeoJSON path (single polygon).",
    )
    args = parser.parse_args()

    bbox = CONUS_BBOX
    if args.bbox:
        try:
            bbox = [float(x.strip()) for x in args.bbox.split(",")]
            if len(bbox) != 4:
                raise ValueError("Need 4 values")
        except Exception as e:
            print(f"Invalid --bbox: {e}", file=sys.stderr)
            sys.exit(1)

    date_range = args.date
    print(f"Fetching Satellogic footprints: bbox={bbox}, date={date_range}")
    features = fetch_satellogic_footprints(bbox, date_range)
    if not features:
        print("No Satellogic footprints found.", file=sys.stderr)
        sys.exit(1)
    print(f"  found {len(features)} footprints")

    geoms = [shape(f["geometry"]) for f in features]
    gdf = gpd.GeoDataFrame(
        {"id": [f["id"] for f in features], "datetime": [f["datetime"] for f in features]},
        geometry=geoms,
        crs="EPSG:4326",
    )

    out_path = Path(args.output)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    gdf.to_file(out_path, driver="GeoJSON")
    print(f"Wrote {len(gdf)} footprints to {out_path}")

    if args.union:
        union_path = Path(args.union)
        union_path.parent.mkdir(parents=True, exist_ok=True)
        union_geom = gdf.union_all()
        union_gdf = gpd.GeoDataFrame(
            [{"id": "union", "datetime": date_range}],
            geometry=[union_geom],
            crs="EPSG:4326",
        )
        union_gdf.to_file(union_path, driver="GeoJSON")
        print(f"Wrote union polygon to {union_path}")


if __name__ == "__main__":
    main()
