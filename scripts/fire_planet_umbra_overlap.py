#!/usr/bin/env python3
"""
CAL FIRE × Planet × Umbra: spatial and temporal intersection only.

- Footprints = original satellite scene footprints from STAC (polygons), not centroids.
  The GeoJSON features have geometry type "Polygon" (scene outline on the ground).
- Uses only 2024 and 2025.
- For each Planet scene date, looks for Umbra scenes within ±DAYS_WINDOW days.
  A fire is included if it intersects both a Planet polygon and an Umbra polygon
  (optional FIRE_BUFFER_DEGREES expands the fire for near-miss edge cases).

Run after fetching footprints:
  python scripts/csdap_planet_umbra_footprints.py
  python scripts/fire_planet_umbra_overlap.py

Output: data/data_availability/fire_planet_umbra_overlap.csv
        fire_name, alarm_date, cont_date, imagery_date, bbox, planet_dates, umbra_dates
        (planet_dates and umbra_dates are semicolon-separated YYYY-MM-DD for scenes intersecting the fire)
"""

from __future__ import annotations

import csv
from datetime import datetime, timedelta
from pathlib import Path

try:
    import geopandas as gpd
    from shapely.ops import unary_union
except ImportError:
    print("Install geopandas and shapely: pip install geopandas shapely", file=__import__("sys").stderr)
    raise SystemExit(1)

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data"
DATA_AVAIL = BASE / "data" / "data_availability"
CALFIRE_SHP = DATA / "cal fire" / "California_Fire_Perimeters_(all).shp"

# Only 2024 and 2025. Umbra footprints are late 2024–2025; ICEYE ends early 2024 (no overlap). See csdap_planet_umbra_footprints.py.
YEAR_MIN = 2024
YEAR_MAX = 2025
# Planet and Umbra can be on different days; allow up to this many days apart (e.g. 7 = within a week)
DAYS_WINDOW = 7
# Buffer fire geometry by this many degrees (~1.1 km per 0.01 at mid-lat) so near-miss footprint edges still count. 0 = no buffer.
FIRE_BUFFER_DEGREES = 0.01


def _date_str(d) -> str:
    if d is None:
        return ""
    if isinstance(d, str):
        return d[:10] if len(d) >= 10 else ""
    if hasattr(d, "strftime"):
        return d.strftime("%Y-%m-%d")
    return str(d)[:10]


def _dates_intersecting_fire(g, gdf, date_col: str = "_date") -> str:
    """Return semicolon-separated sorted unique dates from gdf for geometries intersecting g."""
    if g is None or g.is_empty or gdf.empty:
        return ""
    try:
        candidates = list(gdf.sindex.intersection(g.bounds))
    except Exception:
        candidates = range(len(gdf))
    dates = set()
    for i in candidates:
        if i >= len(gdf):
            continue
        if gdf.geometry.iloc[i].intersects(g):
            d = gdf[date_col].iloc[i]
            if d and len(str(d)) >= 10:
                dates.add(str(d)[:10])
    return ";".join(sorted(dates)) if dates else ""


def main() -> None:
    if not CALFIRE_SHP.exists():
        print(f"CAL FIRE shapefile not found: {CALFIRE_SHP}")
        return

    planet_geojson = DATA_AVAIL / "planet_footprints_ca.geojson"
    umbra_geojson = DATA_AVAIL / "umbra_footprints_ca.geojson"
    if not planet_geojson.exists() or not umbra_geojson.exists():
        print("Run scripts/csdap_planet_umbra_footprints.py first.")
        return

    print("Loading Planet and Umbra footprints...")
    planet = gpd.read_file(planet_geojson).to_crs(epsg=4326)
    umbra = gpd.read_file(umbra_geojson).to_crs(epsg=4326)

    # Parse scene date: Planet = datetime, Umbra = id (starts with YYYY-MM-DD)
    planet["_date"] = planet["datetime"].astype(str).str[:10]
    umbra["_date"] = umbra["id"].astype(str).str[:10]

    # Restrict to 2024 and 2025
    def in_range(s):
        if not s or len(s) < 4:
            return False
        try:
            y = int(s[:4])
            return YEAR_MIN <= y <= YEAR_MAX
        except ValueError:
            return False

    planet = planet[planet["_date"].apply(in_range)].dropna(subset=["_date"])
    umbra = umbra[umbra["_date"].apply(in_range)].dropna(subset=["_date"])
    print(f"  Planet: {len(planet)} scenes in {YEAR_MIN}-{YEAR_MAX}")
    print(f"  Umbra: {len(umbra)} scenes in {YEAR_MIN}-{YEAR_MAX}")
    print(f"  Allowing Planet and Umbra up to {DAYS_WINDOW} days apart")

    print("Loading CAL FIRE perimeters...")
    fires = gpd.read_file(CALFIRE_SHP)
    if fires.crs and fires.crs.to_epsg() != 4326:
        fires = fires.to_crs(epsg=4326)

    name_col = "FIRE_NAME" if "FIRE_NAME" in fires.columns else "NAME"
    alarm_col = "ALARM_DATE" if "ALARM_DATE" in fires.columns else "alarm_date"
    cont_col = "CONT_DATE" if "CONT_DATE" in fires.columns else "cont_date"

    # Only consider fires that intersect both Planet and Umbra coverage (any date in 2024-2025).
    # Use optional buffer on fire so footprints that just clip the edge still count.
    def fire_geom_for_intersect(geom):
        if geom is None or geom.is_empty:
            return None
        return geom.buffer(FIRE_BUFFER_DEGREES) if FIRE_BUFFER_DEGREES else geom

    planet_union = unary_union(planet.geometry)
    umbra_union = unary_union(umbra.geometry)
    candidate_idx = []
    for idx, row in fires.iterrows():
        geom = row.geometry
        g = fire_geom_for_intersect(geom)
        if g is None:
            continue
        if not g.intersects(planet_union) or not g.intersects(umbra_union):
            continue
        candidate_idx.append(idx)
    fires_sub = fires.loc[candidate_idx]

    # Only 2024 and 2025 fires (alarm or cont date in that year; skip placeholders like 1899)
    def fire_year_ok(row):
        for col in (alarm_col, cont_col):
            d = _date_str(row.get(col))
            if not d or len(d) < 4:
                continue
            try:
                y = int(d[:4])
                if y in (YEAR_MIN, YEAR_MAX):
                    return True
            except ValueError:
                pass
        return False

    fires_sub = fires_sub[fires_sub.apply(fire_year_ok, axis=1)]
    print(f"  Fires that intersect both Planet and Umbra coverage ({YEAR_MIN}-{YEAR_MAX} only): {len(fires_sub)}")
    if FIRE_BUFFER_DEGREES:
        print(f"  (fire buffer for intersection: {FIRE_BUFFER_DEGREES} deg)")

    results = []
    seen = set()

    # Consider every Planet scene date; for each, Umbra can be within ±DAYS_WINDOW (same date not required)
    planet_dates = sorted(planet["_date"].unique())
    for pdate in planet_dates:
        try:
            t = datetime.strptime(pdate, "%Y-%m-%d")
        except ValueError:
            continue
        low = (t - timedelta(days=DAYS_WINDOW)).strftime("%Y-%m-%d")
        high = (t + timedelta(days=DAYS_WINDOW)).strftime("%Y-%m-%d")

        p_sub = planet[planet["_date"] == pdate]
        u_sub = umbra[(umbra["_date"] >= low) & (umbra["_date"] <= high)]
        if p_sub.empty or u_sub.empty:
            continue

        for idx, row in fires_sub.iterrows():
            geom = row.geometry
            g = fire_geom_for_intersect(geom)
            if g is None:
                continue
            if not p_sub.geometry.intersects(g).any():
                continue
            if not u_sub.geometry.intersects(g).any():
                continue

            name = row.get(name_col, "")
            alarm = _date_str(row.get(alarm_col))
            key = (name, alarm)
            if key in seen:
                continue
            seen.add(key)

            cont = _date_str(row.get(cont_col))
            bbox = geom.bounds if hasattr(geom, "bounds") else None
            bbox_s = ",".join(f"{x:.4f}" for x in bbox) if bbox and len(bbox) >= 4 else ""
            planet_dates_s = _dates_intersecting_fire(g, planet)
            umbra_dates_s = _dates_intersecting_fire(g, umbra)

            results.append({
                "fire_name": name,
                "alarm_date": alarm,
                "cont_date": cont,
                "imagery_date": pdate,
                "bbox": bbox_s,
                "planet_dates": planet_dates_s,
                "umbra_dates": umbra_dates_s,
            })

    # If strict overlap found nothing, still give a usable table: fires that intersect both
    # Planet and Umbra coverage (any date). You can try these in CSDAP with the suggested date range.
    if not results and len(fires_sub) > 0:
        date_low = min(planet["_date"].min(), umbra["_date"].min())
        date_high = max(planet["_date"].max(), umbra["_date"].max())
        suggested_range = f"{date_low} to {date_high}"
        print(f"\nNo strict same-week overlap found. Writing {len(fires_sub)} candidate fires (intersect both coverages) so you can try in CSDAP.")
        for idx, row in fires_sub.iterrows():
            name = row.get(name_col, "")
            alarm = _date_str(row.get(alarm_col))
            key = (name, alarm)
            if key in seen:
                continue
            seen.add(key)
            geom = row.geometry
            cont = _date_str(row.get(cont_col))
            bbox = geom.bounds if hasattr(geom, "bounds") else None
            bbox_s = ",".join(f"{x:.4f}" for x in bbox) if bbox and len(bbox) >= 4 else ""
            g = fire_geom_for_intersect(geom)
            planet_dates_s = _dates_intersecting_fire(g, planet)
            umbra_dates_s = _dates_intersecting_fire(g, umbra)
            results.append({
                "fire_name": name,
                "alarm_date": alarm,
                "cont_date": cont,
                "imagery_date": suggested_range,
                "bbox": bbox_s,
                "planet_dates": planet_dates_s,
                "umbra_dates": umbra_dates_s,
            })

    fieldnames = ["fire_name", "alarm_date", "cont_date", "imagery_date", "bbox", "planet_dates", "umbra_dates"]
    out = DATA_AVAIL / "fire_planet_umbra_overlap.csv"
    DATA_AVAIL.mkdir(parents=True, exist_ok=True)
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(results)

    print(f"\nFires in table (use for California story): {len(results)}")
    print(f"Wrote {out}")
    if results:
        print("\nFirst 10 (inspect in CSV; try bbox + date range in CSDAP):")
        for r in results[:10]:
            print(f"  {r['fire_name']}  alarm {r['alarm_date']}  cont {r['cont_date']}  imagery {r['imagery_date']}")


if __name__ == "__main__":
    main()
