#!/usr/bin/env python3
"""
Rank CAL FIRE fires by likelihood of finding Planet + Umbra overlap.

Scores each candidate fire by how many Planet scenes and Umbra scenes intersect it
(probability ≈ more overlapping scenes). Outputs a table ordered by that score with
name, date, bbox, and northwest / southeast corners for manual inspection.

Run after footprints exist:
  python scripts/rank_fire_planet_umbra.py

Output: data/data_availability/fire_planet_umbra_ranked.csv
        rank, fire_name, alarm_date, cont_date, date_range, bbox,
        nw_lon, nw_lat, se_lon, se_lat, planet_count, umbra_count
"""

from __future__ import annotations

import csv
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

YEAR_MIN = 2024
YEAR_MAX = 2025
FIRE_BUFFER_DEGREES = 0.01
TOP_N = 10  # first N to print and emphasize


def _date_str(d) -> str:
    if d is None:
        return ""
    if isinstance(d, str):
        return d[:10] if len(d) >= 10 else ""
    if hasattr(d, "strftime"):
        return d.strftime("%Y-%m-%d")
    return str(d)[:10]


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

    planet["_date"] = planet["datetime"].astype(str).str[:10]
    umbra["_date"] = umbra["id"].astype(str).str[:10]

    def in_range(s):
        if not s or len(s) < 4:
            return False
        try:
            return YEAR_MIN <= int(s[:4]) <= YEAR_MAX
        except ValueError:
            return False

    planet = planet[planet["_date"].apply(in_range)].dropna(subset=["_date"])
    umbra = umbra[umbra["_date"].apply(in_range)].dropna(subset=["_date"])
    date_low = min(planet["_date"].min(), umbra["_date"].min())
    date_high = max(planet["_date"].max(), umbra["_date"].max())
    date_range = f"{date_low} to {date_high}"
    print(f"  Planet: {len(planet)} scenes, Umbra: {len(umbra)} scenes ({YEAR_MIN}-{YEAR_MAX})")

    print("Loading CAL FIRE perimeters...")
    fires = gpd.read_file(CALFIRE_SHP)
    if fires.crs and fires.crs.to_epsg() != 4326:
        fires = fires.to_crs(epsg=4326)

    name_col = "FIRE_NAME" if "FIRE_NAME" in fires.columns else "NAME"
    alarm_col = "ALARM_DATE" if "ALARM_DATE" in fires.columns else "alarm_date"
    cont_col = "CONT_DATE" if "CONT_DATE" in fires.columns else "cont_date"

    def fire_geom(geom):
        if geom is None or geom.is_empty:
            return None
        return geom.buffer(FIRE_BUFFER_DEGREES) if FIRE_BUFFER_DEGREES else geom

    planet_union = unary_union(planet.geometry)
    umbra_union = unary_union(umbra.geometry)
    candidate_idx = [
        idx for idx, row in fires.iterrows()
        if (g := fire_geom(row.geometry)) and g.intersects(planet_union) and g.intersects(umbra_union)
    ]
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
    print(f"  Candidate fires (intersect both coverages, {YEAR_MIN}-{YEAR_MAX} only): {len(fires_sub)}")

    # Use spatial index for fast intersects
    planet_sindex = planet.sindex
    umbra_sindex = umbra.sindex

    print("Scoring each fire (Planet and Umbra scene counts)...")
    rows = []
    for idx, row in fires_sub.iterrows():
        g = fire_geom(row.geometry)
        if g is None:
            continue
        try:
            p_possible = list(planet_sindex.intersection(g.bounds))
            u_possible = list(umbra_sindex.intersection(g.bounds))
            planet_count = sum(1 for i in p_possible if planet.geometry.iloc[i].intersects(g))
            umbra_count = sum(1 for i in u_possible if umbra.geometry.iloc[i].intersects(g))
        except Exception:
            planet_count = umbra_count = 0
        if planet_count == 0 or umbra_count == 0:
            continue

        name = row.get(name_col, "")
        alarm = _date_str(row.get(alarm_col))
        cont = _date_str(row.get(cont_col))
        geom = row.geometry
        bbox = geom.bounds if hasattr(geom, "bounds") and geom else None
        if not bbox or len(bbox) < 4:
            continue
        min_lon, min_lat, max_lon, max_lat = bbox[0], bbox[1], bbox[2], bbox[3]
        nw_lon, nw_lat = min_lon, max_lat   # northwest = left, top
        se_lon, se_lat = max_lon, min_lat   # southeast = right, bottom

        score = planet_count * umbra_count
        rows.append({
            "fire_name": name,
            "alarm_date": alarm,
            "cont_date": cont,
            "date_range": date_range,
            "bbox": f"{min_lon:.4f},{min_lat:.4f},{max_lon:.4f},{max_lat:.4f}",
            "nw_lon": round(nw_lon, 6),
            "nw_lat": round(nw_lat, 6),
            "se_lon": round(se_lon, 6),
            "se_lat": round(se_lat, 6),
            "planet_count": planet_count,
            "umbra_count": umbra_count,
            "_score": score,
        })

    rows.sort(key=lambda r: r["_score"], reverse=True)
    for i, r in enumerate(rows, start=1):
        r["rank"] = i
        del r["_score"]

    fieldnames = [
        "rank", "fire_name", "alarm_date", "cont_date", "date_range", "bbox",
        "nw_lon", "nw_lat", "se_lon", "se_lat", "planet_count", "umbra_count",
    ]
    out = DATA_AVAIL / "fire_planet_umbra_ranked.csv"
    DATA_AVAIL.mkdir(parents=True, exist_ok=True)
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows)

    top10_path = DATA_AVAIL / "fire_planet_umbra_top10.csv"
    with open(top10_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(rows[:TOP_N])

    print(f"\nWrote {out} ({len(rows)} fires, ordered by highest probability)")
    print(f"Wrote {top10_path} (first {TOP_N} for manual inspection)")
    print(f"\n--- First {TOP_N} (inspect these first: name, date, bbox, NW, SE) ---\n")
    for r in rows[:TOP_N]:
        print(f"  {r['rank']}. {r['fire_name']}  alarm {r['alarm_date']}  cont {r['cont_date']}")
        print(f"      date_range: {r['date_range']}")
        print(f"      bbox: {r['bbox']}")
        print(f"      NW (lon,lat): {r['nw_lon']}, {r['nw_lat']}  |  SE (lon,lat): {r['se_lon']}, {r['se_lat']}")
        print(f"      Planet scenes: {r['planet_count']}  Umbra scenes: {r['umbra_count']}")
        print()


if __name__ == "__main__":
    main()
