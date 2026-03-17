#!/usr/bin/env python3
"""
Rank CAL FIRE fires by likelihood of finding Planet + Umbra overlap, and optionally
list which dates have Planet and Umbra scenes for those fires.

Run after footprints exist:
  python scripts/rank_fire_planet_umbra.py                    # rank only
  python scripts/rank_fire_planet_umbra.py --list-dates        # rank + list dates for top 10
  python scripts/rank_fire_planet_umbra.py --fire EATON --alarm 2025-01-08   # list dates for one fire

Outputs:
  data/data_availability/fire_planet_umbra_ranked.csv
  data/data_availability/fire_planet_umbra_top10.csv
  data/data_availability/fire_planet_umbra_ranked_with_dates.csv  (when using --list-dates or --fire/--alarm)
"""

from __future__ import annotations

import argparse
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
RANKED_CSV = DATA_AVAIL / "fire_planet_umbra_ranked.csv"

YEAR_MIN = 2024
YEAR_MAX = 2025
FIRE_BUFFER_DEGREES = 0.01
TOP_N = 10


def _date_str(d) -> str:
    if d is None:
        return ""
    if isinstance(d, str):
        return d[:10] if len(d) >= 10 else ""
    if hasattr(d, "strftime"):
        return d.strftime("%Y-%m-%d")
    return str(d)[:10]


def _fire_geom(geom):
    if geom is None or geom.is_empty:
        return None
    return geom.buffer(FIRE_BUFFER_DEGREES) if FIRE_BUFFER_DEGREES else geom


def _load_footprints_and_fires(planet_geojson, umbra_geojson):
    """Load Planet/Umbra GeoJSON and CAL FIRE shapefile; filter to YEAR_MIN–YEAR_MAX. Return (planet, umbra, fires, name_col, alarm_col, cont_col)."""
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

    fires = gpd.read_file(CALFIRE_SHP)
    if fires.crs and fires.crs.to_epsg() != 4326:
        fires = fires.to_crs(epsg=4326)
    name_col = "FIRE_NAME" if "FIRE_NAME" in fires.columns else "NAME"
    alarm_col = "ALARM_DATE" if "ALARM_DATE" in fires.columns else "alarm_date"
    cont_col = "CONT_DATE" if "CONT_DATE" in fires.columns else "cont_date"
    return planet, umbra, fires, name_col, alarm_col, cont_col


def run_rank(planet, umbra, fires, name_col, alarm_col, cont_col) -> list[dict]:
    """Score and rank candidate fires; return sorted rows (with rank, no _score)."""
    date_low = min(planet["_date"].min(), umbra["_date"].min())
    date_high = max(planet["_date"].max(), umbra["_date"].max())
    date_range = f"{date_low} to {date_high}"

    planet_union = unary_union(planet.geometry)
    umbra_union = unary_union(umbra.geometry)
    candidate_idx = [
        idx for idx, row in fires.iterrows()
        if (g := _fire_geom(row.geometry)) and g.intersects(planet_union) and g.intersects(umbra_union)
    ]
    fires_sub = fires.loc[candidate_idx]

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
    planet_sindex = planet.sindex
    umbra_sindex = umbra.sindex

    rows = []
    for idx, row in fires_sub.iterrows():
        g = _fire_geom(row.geometry)
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

        geom = row.geometry
        bbox = geom.bounds if hasattr(geom, "bounds") and geom else None
        if not bbox or len(bbox) < 4:
            continue
        min_lon, min_lat, max_lon, max_lat = bbox[0], bbox[1], bbox[2], bbox[3]
        rows.append({
            "fire_name": row.get(name_col, ""),
            "alarm_date": _date_str(row.get(alarm_col)),
            "cont_date": _date_str(row.get(cont_col)),
            "date_range": date_range,
            "bbox": f"{min_lon:.4f},{min_lat:.4f},{max_lon:.4f},{max_lat:.4f}",
            "nw_lon": round(min_lon, 6),
            "nw_lat": round(max_lat, 6),
            "se_lon": round(max_lon, 6),
            "se_lat": round(min_lat, 6),
            "planet_count": planet_count,
            "umbra_count": umbra_count,
            "_score": planet_count * umbra_count,
        })

    rows.sort(key=lambda r: r["_score"], reverse=True)
    for i, r in enumerate(rows, start=1):
        r["rank"] = i
        del r["_score"]
    return rows


def list_dates_for_fires(planet, umbra, fires, rows_to_do, name_col, alarm_col, cont_col) -> list[dict]:
    """For each (name, alarm, row) in rows_to_do, compute planet/umbra dates; print and return CSV rows."""
    planet_sindex = planet.sindex
    umbra_sindex = umbra.sindex
    csv_rows = []

    for name, alarm, row in rows_to_do:
        g = _fire_geom(row.geometry)
        if g is None:
            continue
        try:
            p_possible = list(planet_sindex.intersection(g.bounds))
            u_possible = list(umbra_sindex.intersection(g.bounds))
            planet_ilocs = [i for i in p_possible if planet.geometry.iloc[i].intersects(g)]
            umbra_ilocs = [i for i in u_possible if umbra.geometry.iloc[i].intersects(g)]
        except Exception:
            planet_ilocs = []
            umbra_ilocs = []

        planet_dates = sorted(set(planet["_date"].iloc[planet_ilocs].tolist()))
        umbra_dates = sorted(set(umbra["_date"].iloc[umbra_ilocs].tolist()))
        both = sorted(set(planet_dates) & set(umbra_dates))

        print(f"\n{name} (alarm {alarm})")
        print(f"  Planet: {len(planet_ilocs)} scenes on {len(planet_dates)} distinct dates")
        if planet_dates:
            print(f"    {planet_dates[0]} .. {planet_dates[-1]}")
            if len(planet_dates) <= 30:
                print(f"    {', '.join(planet_dates)}")
            else:
                print(f"    First 15: {', '.join(planet_dates[:15])} ...")
                print(f"    Last 5: {', '.join(planet_dates[-5:])}")
        print(f"  Umbra: {len(umbra_ilocs)} scenes on {len(umbra_dates)} distinct dates")
        if umbra_dates:
            print(f"    {umbra_dates[0]} .. {umbra_dates[-1]}")
            if len(umbra_dates) <= 30:
                print(f"    {', '.join(umbra_dates)}")
            else:
                print(f"    First 15: {', '.join(umbra_dates[:15])} ...")
                print(f"    Last 5: {', '.join(umbra_dates[-5:])}")
        if both:
            print(f"  Both Planet and Umbra on same day: {len(both)} dates — {both[0]} .. {both[-1]}")
            if len(both) <= 20:
                print(f"    {', '.join(both)}")
        else:
            print(f"  Both on same day: 0 (use dates within a few days of each other)")

        b = row.geometry.bounds if hasattr(row.geometry, "bounds") and row.geometry else (None, None, None, None)
        csv_rows.append({
            "fire_name": name,
            "alarm_date": alarm,
            "cont_date": _date_str(row.get(cont_col)),
            "date_range": f"{planet_dates[0] if planet_dates else ''} to {planet_dates[-1] if planet_dates else ''} (P); {umbra_dates[0] if umbra_dates else ''} to {umbra_dates[-1] if umbra_dates else ''} (U)",
            "planet_count": len(planet_ilocs),
            "umbra_count": len(umbra_ilocs),
            "planet_dates": ";".join(planet_dates),
            "umbra_dates": ";".join(umbra_dates),
            "bbox": ",".join(f"{x:.4f}" for x in b[:4]) if row.geometry and len(b) >= 4 else "",
            "nw_lon": round(b[0], 6) if row.geometry and len(b) >= 4 else "",
            "nw_lat": round(b[3], 6) if row.geometry and len(b) >= 4 else "",
            "se_lon": round(b[2], 6) if row.geometry and len(b) >= 3 else "",
            "se_lat": round(b[1], 6) if row.geometry and len(b) >= 2 else "",
        })
    return csv_rows


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Rank CAL FIRE fires by Planet+Umbra overlap; optionally list imagery dates."
    )
    parser.add_argument(
        "--list-dates",
        action="store_true",
        help="After ranking, list Planet/Umbra dates for the top 10 fires and write fire_planet_umbra_ranked_with_dates.csv",
    )
    parser.add_argument("--fire", metavar="NAME", help="Fire name (with --alarm: list dates for this fire only)")
    parser.add_argument("--alarm", metavar="DATE", help="Alarm date YYYY-MM-DD (with --fire: list dates for this fire only)")
    args = parser.parse_args()

    list_one_fire = bool(args.fire and args.alarm)
    do_list_dates = args.list_dates or list_one_fire

    if not CALFIRE_SHP.exists():
        print(f"CAL FIRE shapefile not found: {CALFIRE_SHP}")
        return

    planet_geojson = DATA_AVAIL / "planet_footprints_ca.geojson"
    umbra_geojson = DATA_AVAIL / "umbra_footprints_ca.geojson"
    if not planet_geojson.exists() or not umbra_geojson.exists():
        print("Run scripts/csdap_planet_umbra_footprints.py first.")
        return

    print("Loading Planet and Umbra footprints...")
    planet, umbra, fires, name_col, alarm_col, cont_col = _load_footprints_and_fires(planet_geojson, umbra_geojson)
    print(f"  Planet: {len(planet)} scenes, Umbra: {len(umbra)} scenes ({YEAR_MIN}-{YEAR_MAX})")

    if list_one_fire:
        want_name = args.fire.strip()
        want_alarm = _date_str(args.alarm)
        match = fires[
            (fires[name_col].astype(str).str.strip() == want_name)
            & (fires[alarm_col].apply(lambda x: _date_str(x) == want_alarm))
        ]
        if match.empty:
            print(f"No fire found: {want_name} alarm {want_alarm}")
            return
        rows_to_do = [(want_name, want_alarm, match.iloc[0])]
        csv_rows = list_dates_for_fires(planet, umbra, fires, rows_to_do, name_col, alarm_col, cont_col)
        if csv_rows:
            out = DATA_AVAIL / "fire_planet_umbra_ranked_with_dates.csv"
            DATA_AVAIL.mkdir(parents=True, exist_ok=True)
            fieldnames = ["fire_name", "alarm_date", "cont_date", "date_range", "planet_count", "umbra_count", "planet_dates", "umbra_dates", "bbox", "nw_lon", "nw_lat", "se_lon", "se_lat"]
            with open(out, "w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=fieldnames)
                w.writeheader()
                w.writerows(csv_rows)
            print(f"\nWrote {out}")
        return

    print("Loading CAL FIRE perimeters...")
    ranked_rows = run_rank(planet, umbra, fires, name_col, alarm_col, cont_col)
    print(f"  Candidate fires (intersect both coverages, {YEAR_MIN}-{YEAR_MAX} only): {len(ranked_rows)}")

    fieldnames = [
        "rank", "fire_name", "alarm_date", "cont_date", "date_range", "bbox",
        "nw_lon", "nw_lat", "se_lon", "se_lat", "planet_count", "umbra_count",
    ]
    DATA_AVAIL.mkdir(parents=True, exist_ok=True)
    out = DATA_AVAIL / "fire_planet_umbra_ranked.csv"
    with open(out, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(ranked_rows)

    top10_path = DATA_AVAIL / "fire_planet_umbra_top10.csv"
    with open(top10_path, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        w.writerows(ranked_rows[:TOP_N])

    print(f"\nWrote {out} ({len(ranked_rows)} fires, ordered by highest probability)")
    print(f"Wrote {top10_path} (first {TOP_N} for manual inspection)")
    print(f"\n--- First {TOP_N} ---\n")
    for r in ranked_rows[:TOP_N]:
        print(f"  {r['rank']}. {r['fire_name']}  alarm {r['alarm_date']}  cont {r['cont_date']}")
        print(f"      date_range: {r['date_range']}")
        print(f"      bbox: {r['bbox']}")
        print(f"      Planet scenes: {r['planet_count']}  Umbra scenes: {r['umbra_count']}")
        print()

    if do_list_dates:
        if not ranked_rows:
            return
        top10_fire_rows = []
        for r in ranked_rows[:TOP_N]:
            match = fires[
                (fires[name_col].astype(str).str.strip() == r["fire_name"])
                & (fires[alarm_col].apply(lambda x: _date_str(x) == r["alarm_date"]))
            ]
            if not match.empty:
                top10_fire_rows.append((r["fire_name"], r["alarm_date"], match.iloc[0]))
        csv_rows = list_dates_for_fires(planet, umbra, fires, top10_fire_rows, name_col, alarm_col, cont_col)
        if csv_rows:
            out_dates = DATA_AVAIL / "fire_planet_umbra_ranked_with_dates.csv"
            fieldnames_dates = ["fire_name", "alarm_date", "cont_date", "date_range", "planet_count", "umbra_count", "planet_dates", "umbra_dates", "bbox", "nw_lon", "nw_lat", "se_lon", "se_lat"]
            with open(out_dates, "w", newline="", encoding="utf-8") as f:
                w = csv.DictWriter(f, fieldnames=fieldnames_dates)
                w.writeheader()
                w.writerows(csv_rows)
            print(f"\nWrote {out_dates}")


if __name__ == "__main__":
    main()
