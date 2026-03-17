#!/usr/bin/env python3
"""
List which dates have Planet and Umbra scenes overlapping a given fire.

So for "164 Umbra scenes" you see the actual dates (e.g. 2024-11-07, 2024-11-08, ...).
Run with fire name and alarm date from the ranked table, or with no args to list dates for the top 10 fires.

  python scripts/list_fire_imagery_dates.py
  python scripts/list_fire_imagery_dates.py EATON 2025-01-08
"""

from __future__ import annotations

import csv
import sys
from pathlib import Path

try:
    import geopandas as gpd
except ImportError:
    print("Install geopandas: pip install geopandas", file=sys.stderr)
    raise SystemExit(1)

BASE = Path(__file__).resolve().parent.parent
DATA = BASE / "data"
DATA_AVAIL = BASE / "data" / "data_availability"
CALFIRE_SHP = DATA / "cal fire" / "California_Fire_Perimeters_(all).shp"
RANKED_CSV = DATA_AVAIL / "fire_planet_umbra_ranked.csv"
FIRE_BUFFER_DEGREES = 0.01
YEAR_MIN = 2024
YEAR_MAX = 2025


def _date_str(d) -> str:
    if d is None:
        return ""
    if isinstance(d, str):
        return d[:10] if len(d) >= 10 else ""
    if hasattr(d, "strftime"):
        return d.strftime("%Y-%m-%d")
    return str(d)[:10]


def main() -> None:
    planet_geojson = DATA_AVAIL / "planet_footprints_ca.geojson"
    umbra_geojson = DATA_AVAIL / "umbra_footprints_ca.geojson"
    if not planet_geojson.exists() or not umbra_geojson.exists():
        print("Run scripts/csdap_planet_umbra_footprints.py first.")
        return

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

    def fire_geom(geom):
        if geom is None or geom.is_empty:
            return None
        return geom.buffer(FIRE_BUFFER_DEGREES) if FIRE_BUFFER_DEGREES else geom

    # Which fires to report
    if len(sys.argv) >= 3:
        want_name = sys.argv[1].strip()
        want_alarm = _date_str(sys.argv[2])
        # Find matching fire row
        match = fires[
            (fires[name_col].astype(str).str.strip() == want_name)
            & (fires[alarm_col].apply(lambda x: _date_str(x) == want_alarm))
        ]
        if match.empty:
            print(f"No fire found: {want_name} alarm {want_alarm}")
            return
        rows_to_do = [(want_name, want_alarm, match.iloc[0])]
    else:
        # Top 10 from ranked CSV
        if not RANKED_CSV.exists():
            print(f"Run scripts/rank_fire_planet_umbra.py first to create {RANKED_CSV}")
            return
        with open(RANKED_CSV, encoding="utf-8") as f:
            r = csv.DictReader(f)
            top = list(r)[:10]
        rows_to_do = []
        for t in top:
            name, alarm = t["fire_name"], t["alarm_date"]
            match = fires[
                (fires[name_col].astype(str).str.strip() == name)
                & (fires[alarm_col].apply(lambda x: _date_str(x) == alarm))
            ]
            if not match.empty:
                rows_to_do.append((name, alarm, match.iloc[0]))

    planet_sindex = planet.sindex
    umbra_sindex = umbra.sindex

    csv_rows = []  # same data as ranked + planet_dates, umbra_dates

    for name, alarm, row in rows_to_do:
        g = fire_geom(row.geometry)
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
        # Dates when BOTH have a scene (good for picking one day)
        both = sorted(set(planet_dates) & set(umbra_dates))
        if both:
            print(f"  Both Planet and Umbra on same day: {len(both)} dates — {both[0]} .. {both[-1]}")
            if len(both) <= 20:
                print(f"    {', '.join(both)}")
        else:
            print(f"  Both on same day: 0 (use dates within a few days of each other)")

        # Build row for CSV (match ranked columns + dates)
        csv_rows.append({
            "fire_name": name,
            "alarm_date": alarm,
            "cont_date": _date_str(row.get(cont_col)),
            "date_range": f"{planet_dates[0] if planet_dates else ''} to {planet_dates[-1] if planet_dates else ''} (P); {umbra_dates[0] if umbra_dates else ''} to {umbra_dates[-1] if umbra_dates else ''} (U)",
            "planet_count": len(planet_ilocs),
            "umbra_count": len(umbra_ilocs),
            "planet_dates": ";".join(planet_dates),
            "umbra_dates": ";".join(umbra_dates),
            "bbox": ",".join(f"{x:.4f}" for x in (row.geometry.bounds if hasattr(row.geometry, "bounds") else (None, None, None, None))[:4]) if row.geometry else "",
            "nw_lon": round(row.geometry.bounds[0], 6) if row.geometry and hasattr(row.geometry, "bounds") else "",
            "nw_lat": round(row.geometry.bounds[3], 6) if row.geometry and len(row.geometry.bounds) >= 4 else "",
            "se_lon": round(row.geometry.bounds[2], 6) if row.geometry and len(row.geometry.bounds) >= 3 else "",
            "se_lat": round(row.geometry.bounds[1], 6) if row.geometry and len(row.geometry.bounds) >= 2 else "",
        })

    # Write CSV: same data as ranked + planet_dates, umbra_dates
    if csv_rows:
        out = DATA_AVAIL / "fire_planet_umbra_ranked_with_dates.csv"
        fieldnames = ["fire_name", "alarm_date", "cont_date", "date_range", "planet_count", "umbra_count", "planet_dates", "umbra_dates", "bbox", "nw_lon", "nw_lat", "se_lon", "se_lat"]
        with open(out, "w", newline="", encoding="utf-8") as f:
            w = csv.DictWriter(f, fieldnames=fieldnames)
            w.writeheader()
            w.writerows(csv_rows)
        print(f"\nWrote {out}")


if __name__ == "__main__":
    main()
