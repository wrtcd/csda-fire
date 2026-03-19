#!/usr/bin/env python3
"""
Find fires whose perimeter intersects a Satellogic footprint AND the scene
acquisition falls within discovery + N days (default 60) of the fire.

Satellogic is fetched over a wide date range (default: full archive window) so
all scene times are available for the temporal check.

Usage:
  pip install pystac-client geopandas

  Entire USA (NIFC in data/nifc_perimeters/):
    python scripts/find_fires_intersecting_satellogic.py

  Wider Satellogic fetch + 60-day window (defaults):
    python scripts/find_fires_intersecting_satellogic.py --date 2019-01-01/2027-12-31

  Spatial only (no temporal filter, old behavior):
    python scripts/find_fires_intersecting_satellogic.py --spatial-only

Output: fire name, bbox, START_DATE/END_DATE = discovery to discovery+60 for GEE.
"""

from __future__ import annotations

import argparse
import sys
from datetime import timedelta
from pathlib import Path

try:
    from pystac_client import Client
except ImportError:
    print("Install pystac-client: pip install pystac-client", file=sys.stderr)
    sys.exit(1)
try:
    import pandas as pd
    import geopandas as gpd
    from shapely.geometry import shape
except ImportError:
    print("Install geopandas: pip install geopandas", file=sys.stderr)
    sys.exit(1)

# Bboxes
CA_BBOX = [-124.5, 32.5, -114.0, 42.0]
CONUS_BBOX = [-125.0, 24.0, -66.0, 50.0]
# Wide default so STAC returns scenes across Satellogic archive; temporal filter uses real scene times
DEFAULT_DATE_RANGE = "2019-01-01/2027-12-31"
STAC_URL = "https://csdap.earthdata.nasa.gov/stac/"
BASE = Path(__file__).resolve().parent.parent
CALFIRE_DIR = BASE / "data" / "calfire_perimeters"
NIFC_DIR = BASE / "data" / "nifc_perimeters"

NAME_COLS = ["FIRE_NAME", "NAME", "FIRE_NAME_", "INCENTIVE", "FireName", "IncidentName", "poly_IncidentName", "attr_IncidentName", "IRWIN_ID", "OBJECTID"]
YEAR_COLS = ["YEAR", "YEAR_", "FIRE_YEAR", "YEAR_CALC", "FireYear", "Year"]
ACRES_COLS = ["ACRES", "GIS_ACRES", "SHAPE_Area", "GIS_Acres", "Acres", "poly_GISAcres", "attr_IncidentSize"]


def find_column(df, candidates):
    for c in candidates:
        if c in df.columns:
            return c
    return None


# CSDAP STAC collection id (lowercase)
COLLECTION_SATELLOGIC = "satellogic"
COLLECTION_ICEYE = "iceye"


def fetch_csdap_footprints(
    collection: str, bbox: list[float], date_range: str, max_items: int
) -> list[dict]:
    client = Client.open(STAC_URL)
    search = client.search(
        collections=[collection],
        bbox=bbox,
        datetime=date_range,
        max_items=max_items,
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


def load_mission_footprints_gdf(
    collection: str, bbox: list[float], date_range: str, max_items: int
):
    features = fetch_csdap_footprints(collection, bbox, date_range, max_items)
    if not features:
        return gpd.GeoDataFrame()
    geoms = [shape(f["geometry"]) for f in features]
    gdf = gpd.GeoDataFrame(
        {"id": [f["id"] for f in features], "datetime": [f["datetime"] for f in features]},
        geometry=geoms,
        crs="EPSG:4326",
    )
    gdf["scene_ts"] = pd.to_datetime(gdf["datetime"], utc=True, errors="coerce")
    return gdf


def parse_fire_discovery_ts(row: pd.Series) -> pd.Timestamp | None:
    """NIFC/WFIGS: ms since epoch. CAL FIRE: may have date string."""
    if "attr_FireDiscoveryDateTime" in row.index and pd.notna(row["attr_FireDiscoveryDateTime"]):
        try:
            ms = int(float(row["attr_FireDiscoveryDateTime"]))
            if ms > 1e11:
                return pd.to_datetime(ms, unit="ms", utc=True)
        except (ValueError, TypeError):
            pass
    if "poly_PolygonDateTime" in row.index and pd.notna(row["poly_PolygonDateTime"]):
        try:
            ms = int(float(row["poly_PolygonDateTime"]))
            if ms > 1e11:
                return pd.to_datetime(ms, unit="ms", utc=True)
        except (ValueError, TypeError):
            pass
    for col in ("ALARM_DATE", "alarm_date", "DISCOVERY_DATE"):
        if col in row.index and pd.notna(row[col]):
            try:
                return pd.to_datetime(row[col], utc=True)
            except Exception:
                pass
    return None


def load_fire_perimeters(path: Path) -> gpd.GeoDataFrame:
    gdf = gpd.read_file(path)
    if gdf.crs is None:
        gdf.set_crs("EPSG:4326", inplace=True)
    gdf = gdf.to_crs("EPSG:4326")
    name_col = find_column(gdf, NAME_COLS)
    year_col = find_column(gdf, YEAR_COLS)
    acres_col = find_column(gdf, ACRES_COLS)
    gdf["fire_name"] = gdf[name_col].astype(str) if name_col else gdf.index.astype(str)
    gdf["year"] = pd.to_numeric(gdf[year_col], errors="coerce") if year_col else None
    if acres_col:
        gdf["acres"] = pd.to_numeric(gdf[acres_col], errors="coerce").fillna(0)
    else:
        gdf["acres"] = gdf.geometry.to_crs("EPSG:5070").area * 0.000247105
    gdf["discovery_ts"] = gdf.apply(parse_fire_discovery_ts, axis=1)
    return gdf


def main():
    parser = argparse.ArgumentParser(
        description="Fires intersecting Satellogic: spatial + scene date within discovery+60d (default)."
    )
    parser.add_argument("--bbox", default=None, help="west,south,east,north. Default CONUS or CA.")
    parser.add_argument(
        "--date",
        default=DEFAULT_DATE_RANGE,
        help="Satellogic STAC query window YYYY-MM-DD/YYYY-MM-DD (wide = more scenes). Default: 2019-01-01/2027-12-31.",
    )
    parser.add_argument(
        "--max-items",
        type=int,
        default=15000,
        help="Max Satellogic items from STAC (default 15000).",
    )
    parser.add_argument(
        "--temporal-days",
        type=int,
        default=60,
        help="Keep fire only if some intersecting scene has acquisition in [discovery, discovery+N days] (default 60).",
    )
    parser.add_argument(
        "--spatial-only",
        action="store_true",
        help="Ignore temporal filter (union of footprints vs fire geometry only).",
    )
    parser.add_argument(
        "--collection",
        default=COLLECTION_SATELLOGIC,
        choices=[COLLECTION_SATELLOGIC, COLLECTION_ICEYE],
        help="CSDAP STAC collection: satellogic (default) or iceye.",
    )
    parser.add_argument(
        "--sample-footprint",
        action="store_true",
        help="If no NIFC match, print one sample footprint for GEE (default: off).",
    )
    parser.add_argument("--california", action="store_true")
    parser.add_argument("--perimeters", default=None, dest="calfire")
    parser.add_argument("-n", "--top", type=int, default=15)
    parser.add_argument("--min-acres", type=float, default=1000)
    args = parser.parse_args()

    bbox = CA_BBOX if args.california else CONUS_BBOX
    if args.bbox:
        try:
            bbox = [float(x.strip()) for x in args.bbox.split(",")]
            if len(bbox) != 4:
                raise ValueError("Need 4 values")
        except Exception as e:
            print(f"Invalid --bbox: {e}", file=sys.stderr)
            sys.exit(1)
    date_range = args.date
    coll = args.collection
    label = "Satellogic" if coll == COLLECTION_SATELLOGIC else "ICEYE"
    print("Region:", "California only" if args.california else "entire USA (CONUS)")
    print(f"Mission: {label} (STAC collection: {coll})")
    print("Fetching footprints from CSDAP...")
    print(f"  bbox: {bbox}, STAC date: {date_range}, max_items: {args.max_items}")
    if not args.spatial_only:
        print(f"  Temporal rule: scene in [fire discovery, discovery + {args.temporal_days} days]")
    else:
        print("  Mode: spatial-only (no temporal filter)")

    sat = load_mission_footprints_gdf(coll, bbox, date_range, args.max_items)
    if sat.empty:
        print(f"No {label} footprints in CSDAP for this bbox/date. Widen --date.", file=sys.stderr)
        sys.exit(1)
    print(f"  found {len(sat)} {label} footprints (each with scene datetime)")
    sat_union = sat.union_all()

    if args.calfire:
        path = Path(args.calfire)
    else:
        if args.california:
            dir_ = CALFIRE_DIR
        else:
            dir_ = NIFC_DIR if NIFC_DIR.exists() else CALFIRE_DIR
        if not dir_.exists():
            print(f"Perimeter dir not found: {dir_}", file=sys.stderr)
            sys.exit(1)
        shp = list(dir_.glob("*.shp"))
        geojson = list(dir_.glob("*.geojson"))
        path = (shp[0] if shp else None) or (geojson[0] if geojson else None)
    if not path or not path.exists():
        print("No fire perimeter file found.", file=sys.stderr)
        sys.exit(1)

    fires = load_fire_perimeters(path)
    fires = fires[fires["acres"] >= args.min_acres].copy()

    if args.spatial_only:
        fires["match"] = fires.geometry.intersects(sat_union)
    else:
        fires_r = fires.reset_index(drop=True)
        fires_r["fire_ix"] = fires_r.index
        joined = gpd.sjoin(fires_r, sat, predicate="intersects", how="inner")

        def group_temporal_ok(g: pd.DataFrame) -> bool:
            d0 = g["discovery_ts"].iloc[0]
            if pd.isna(d0):
                return False
            t_end = d0 + timedelta(days=args.temporal_days)
            st = g["scene_ts"]
            return bool(((st >= d0) & (st <= t_end) & st.notna()).any())

        if joined.empty:
            fires["match"] = False
        else:
            ok = joined.groupby("fire_ix", group_keys=False).apply(group_temporal_ok)
            good_ix = set(ok.index[ok == True])  # noqa: E712
            fires["match"] = fires_r["fire_ix"].isin(good_ix).values

    intersecting = fires[fires["match"]].copy()
    intersecting = intersecting.sort_values("acres", ascending=False).head(args.top)

    no_discovery = (~args.spatial_only) & fires["discovery_ts"].isna() & fires.geometry.intersects(sat_union)
    if no_discovery.any() and intersecting.empty:
        n = int(no_discovery.sum())
        print(f"Note: {n} fires spatially overlap {label} but lack discovery date; excluded from temporal match.")
        print("      Use --spatial-only to include them, or ensure attr_FireDiscoveryDateTime in NIFC.")

    if intersecting.empty:
        print("")
        print("=" * 64)
        print(f"  {label.upper()} + NIFC: NONE")
        print("=" * 64)
        print(
            "No fire perimeter matched (spatial"
            + (" + temporal" if not args.spatial_only else "")
            + ")."
        )
        if coll == COLLECTION_SATELLOGIC:
            print("")
            print("Next step — ICEYE (same logic, different collection):")
            print(
                f'  {sys.executable} scripts/find_fires_intersecting_satellogic.py --collection {COLLECTION_ICEYE}'
            )
        else:
            print("")
            print("Next: CSDAP Explorer (Umbra, Planet) or relax filters:")
            print("  --spatial-only   |   --min-acres 500   |   --temporal-days 120")
        if args.sample_footprint:
            print("")
            row0 = sat.iloc[0]
            b = row0.geometry.bounds
            bbox_str = f"[{b[0]:.4f}, {b[1]:.4f}, {b[2]:.4f}, {b[3]:.4f}]"
            dt = str(row0["datetime"])[:10] if row0.get("datetime") else ""
            print("Sample footprint (optional GEE AOI):")
            print(f"  FIRE_BBOX = {bbox_str};  // scene ~{dt}")
        sys.exit(0)

    print(f"\nFires with {label} match (top {len(intersecting)} by acres):\n")
    for _, row in intersecting.iterrows():
        b = row.geometry.bounds
        bbox_str = f"[{b[0]:.4f}, {b[1]:.4f}, {b[2]:.4f}, {b[3]:.4f}]"
        d0 = row["discovery_ts"]
        if args.spatial_only or pd.isna(d0):
            start_s = date_range.split("/")[0]
            end_s = date_range.split("/")[-1]
        else:
            start_s = d0.strftime("%Y-%m-%d")
            end_s = (d0 + timedelta(days=args.temporal_days)).strftime("%Y-%m-%d")
        print(f"  {row['fire_name']}  ({int(row['acres'])} acres)")
        print(f"    FIRE_NAME = '{row['fire_name']}';")
        print(f"    FIRE_BBOX = {bbox_str};")
        print(f"    START_DATE = '{start_s}'; END_DATE = '{end_s}';  // discovery to discovery+{args.temporal_days}d window")
        print()
    print(f"Copy into gee_verify_burn_area_landsat_s2.js. Mission: {label}.")


if __name__ == "__main__":
    main()
