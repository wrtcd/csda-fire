"""
Rank CAL FIRE perimeters by year and area for candidate fire selection.

Use this to shortlist fires for the CSDA slide: pick recent, large fires
that are likely to have multi-source satellite coverage.

Usage:
  1. Download California Fire Perimeters (all) from:
     https://gis.data.ca.gov/datasets/CALFIRE-Forestry::california-fire-perimeters-all
     or https://data.ca.gov/dataset/california-fire-perimeters-all
  2. Save shapefile or GeoJSON into: data/calfire_perimeters/
  3. Run: python scripts/rank_fires.py [path_to_perimeters]
     If no path given, uses data/calfire_perimeters/ (first .shp or .geojson found).

Output: CSV of fires sorted by year (newest first) and acres (largest first),
        with name, date, bbox for CSDAP/GEE search.
"""

import argparse
import sys
from pathlib import Path

try:
    import geopandas as gpd
    import pandas as pd
except ImportError:
    print("Install dependencies: pip install geopandas pandas", file=sys.stderr)
    sys.exit(1)

# Common CAL FIRE / FRAP attribute names (dataset may use different casing)
YEAR_COLS = ["YEAR", "YEAR_", "FIRE_YEAR", "YEAR_CALC"]
ACRES_COLS = ["ACRES", "GIS_ACRES", "SHAPE_Area"]
NAME_COLS = ["FIRE_NAME", "NAME", "FIRE_NAME_", "INCENTIVE"]
DATE_COLS = ["ALARM_DATE", "CONT_DATE", "CONT_DAT", "ALARM_DAT", "START_DATE"]


def find_column(df, candidates, default=None):
    for c in candidates:
        if c in df.columns:
            return c
    return default


def main():
    parser = argparse.ArgumentParser(description="Rank CAL FIRE perimeters by year and area.")
    parser.add_argument(
        "path",
        nargs="?",
        default=None,
        help="Path to shapefile (.shp) or GeoJSON. Default: data/calfire_perimeters/ (auto-detect).",
    )
    parser.add_argument(
        "-o", "--output",
        default=None,
        help="Output CSV path. Default: data/candidate_fires_ranked.csv",
    )
    parser.add_argument(
        "-n", "--top",
        type=int,
        default=50,
        help="Number of top fires to output (default 50).",
    )
    parser.add_argument(
        "--min-year",
        type=int,
        default=2018,
        help="Minimum fire year (default 2018 for recent + satellite era).",
    )
    parser.add_argument(
        "--min-acres",
        type=float,
        default=5000,
        help="Minimum fire size in acres (default 5000).",
    )
    args = parser.parse_args()

    base = Path(__file__).resolve().parent.parent
    data_dir = base / "data" / "calfire_perimeters"

    if args.path:
        path = Path(args.path)
        if not path.exists():
            print(f"Error: path not found: {path}", file=sys.stderr)
            sys.exit(1)
        if path.is_dir():
            shp = list(path.glob("*.shp"))
            geojson = list(path.glob("*.geojson"))
            if shp:
                path = shp[0]
            elif geojson:
                path = geojson[0]
            else:
                print(f"No .shp or .geojson in {path}", file=sys.stderr)
                sys.exit(1)
    else:
        if not data_dir.exists():
            data_dir.mkdir(parents=True, exist_ok=True)
            print(f"Created {data_dir}. Please add CAL FIRE shapefile or GeoJSON and run again.", file=sys.stderr)
            sys.exit(1)
        shp = list(data_dir.glob("*.shp"))
        geojson = list(data_dir.glob("*.geojson"))
        if shp:
            path = shp[0]
        elif geojson:
            path = geojson[0]
        else:
            print(f"No .shp or .geojson in {data_dir}. Download from CAL FIRE and add there.", file=sys.stderr)
            sys.exit(1)

    gdf = gpd.read_file(path)
    year_col = find_column(gdf, YEAR_COLS)
    acres_col = find_column(gdf, ACRES_COLS)
    name_col = find_column(gdf, NAME_COLS)
    date_col = find_column(gdf, DATE_COLS)

    if not year_col:
        print("No year column found. Available columns:", list(gdf.columns), file=sys.stderr)
        sys.exit(1)
    if not acres_col:
        # Try to get area from geometry
        gdf["_acres"] = gdf.geometry.to_crs("EPSG:5070").area * 0.000247105  # m² -> acres
        acres_col = "_acres"

    gdf["_year"] = pd.to_numeric(gdf[year_col], errors="coerce")
    gdf["_acres_val"] = pd.to_numeric(gdf[acres_col], errors="coerce").fillna(0)
    gdf = gdf.dropna(subset=["_year"])
    gdf = gdf[(gdf["_year"] >= args.min_year) & (gdf["_acres_val"] >= args.min_acres)].copy()

    if gdf.crs is None:
        gdf.set_crs("EPSG:4326", inplace=True)
    gdf = gdf.to_crs("EPSG:4326")
    gdf["_bbox"] = gdf.geometry.bounds.apply(
        lambda r: f"{r.minx:.4f},{r.miny:.4f},{r.maxx:.4f},{r.maxy:.4f}", axis=1
    )

    out = gdf.copy()
    out["fire_name"] = out[name_col] if name_col else out.index.astype(str)
    out["alarm_date"] = out[date_col] if date_col else ""
    out = out.rename(columns={"_year": "year", "_acres_val": "acres"})
    out = out.sort_values(["year", "acres"], ascending=[False, False]).head(args.top)
    result = out[["fire_name", "year", "acres", "alarm_date", "_bbox"]].copy()
    result.columns = ["fire_name", "year", "acres", "alarm_date", "bbox_wgs84"]

    out_path = Path(args.output) if args.output else base / "data" / "candidate_fires_ranked.csv"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    result.to_csv(out_path, index=False)
    print(f"Wrote top {len(result)} fires to {out_path}")
    print(result.head(10).to_string())


if __name__ == "__main__":
    main()
