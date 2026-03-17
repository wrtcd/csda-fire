#!/usr/bin/env python3
"""
Report fires with Planet + Umbra within ±30 days; add Satellogic and ICEYE as bonus
(any scene covering the fire bbox; if within ±30 days of P+U pair, note it).
"""
import csv
from datetime import datetime, timedelta
from pathlib import Path

DATA_AVAIL = Path(__file__).resolve().parent.parent / "data" / "data_availability"
OVERLAP_CSV = DATA_AVAIL / "fire_planet_umbra_overlap.csv"
SATELLOGIC_CSV = DATA_AVAIL / "satellogic_footprints_ca.csv"
ICEYE_CSV = DATA_AVAIL / "iceye_footprints_ca.csv"
DAYS = 30


def parse_dates(s):
    if not s or not str(s).strip():
        return set()
    return set(d.strip() for d in str(s).split(";") if len(d.strip()) >= 10)


def has_pu_overlap(planet_str, umbra_str, days=30):
    """Return (True, (pdate, udate)) if some Planet and Umbra date are within ±days."""
    p_dates = parse_dates(planet_str)
    u_dates = parse_dates(umbra_str)
    for pd in p_dates:
        try:
            pt = datetime.strptime(pd, "%Y-%m-%d")
        except ValueError:
            continue
        for ud in u_dates:
            try:
                ut = datetime.strptime(ud, "%Y-%m-%d")
            except ValueError:
                continue
            if abs((pt - ut).days) <= days:
                return True, (pd, ud)
    return False, None


def bbox_overlap(fire_bbox, scene_min_lon, scene_min_lat, scene_max_lon, scene_max_lat):
    """Fire bbox is string 'min_lon,min_lat,max_lon,max_lat'."""
    parts = [x.strip() for x in fire_bbox.split(",")]
    if len(parts) != 4:
        return False
    try:
        f_min_lon, f_min_lat, f_max_lon, f_max_lat = map(float, parts)
    except ValueError:
        return False
    if scene_min_lon is None or scene_max_lon is None:
        return False
    if f_min_lon > scene_max_lon or f_max_lon < scene_min_lon:
        return False
    if f_min_lat > scene_max_lat or f_max_lat < scene_min_lat:
        return False
    return True


def scene_dates_for_bbox(csv_path, fire_bbox):
    """Return sorted set of scene dates (YYYY-MM-DD) that overlap fire_bbox."""
    out = set()
    if not csv_path.exists():
        return out
    with open(csv_path, encoding="utf-8") as f:
        r = csv.DictReader(f)
        for row in r:
            dt = row.get("datetime", "")[:10]
            if len(dt) < 10:
                continue
            try:
                min_lon = float(row.get("min_lon") or 0)
                min_lat = float(row.get("min_lat") or 0)
                max_lon = float(row.get("max_lon") or 0)
                max_lat = float(row.get("max_lat") or 0)
            except (ValueError, TypeError):
                continue
            if bbox_overlap(fire_bbox, min_lon, min_lat, max_lon, max_lat):
                out.add(dt)
    return sorted(out)


def within_days(date_str, ref_date_str, days=30):
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d")
        r = datetime.strptime(ref_date_str, "%Y-%m-%d")
        return abs((d - r).days) <= days
    except ValueError:
        return False


def main():
    with open(OVERLAP_CSV, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    # Find fires with Planet+Umbra within ±30 days
    pu_fires = []
    for row in rows:
        ok, pair = has_pu_overlap(row.get("planet_dates", ""), row.get("umbra_dates", ""), DAYS)
        if ok:
            pu_fires.append((row, pair))

    print("=" * 80)
    print("FIRES WITH PLANET + UMBRA WITHIN ±30 DAYS (±30 days is fine)")
    print("=" * 80)
    if not pu_fires:
        print("None found.\n")
        return

    for row, (pdate, udate) in pu_fires:
        name = row["fire_name"]
        bbox = row["bbox"]
        print(f"\n{name}")
        print(f"  alarm_date: {row['alarm_date']}  cont_date: {row['cont_date']}")
        print(f"  bbox: {bbox}")
        print(f"  Planet date: {pdate}  |  Umbra date: {udate}  (within ±{DAYS} days)")

        # Bonus: Satellogic scenes covering this bbox
        sat_dates = scene_dates_for_bbox(SATELLOGIC_CSV, bbox)
        if sat_dates:
            near_p = [d for d in sat_dates if within_days(d, pdate, DAYS)]
            near_u = [d for d in sat_dates if within_days(d, udate, DAYS)]
            if near_p or near_u:
                print(f"  Satellogic (bonus, within ±{DAYS} days of P/U): {', '.join(sorted(set(near_p + near_u)))}")
            else:
                print(f"  Satellogic (bonus, covers bbox on other dates): {', '.join(sat_dates[:10])}{'...' if len(sat_dates) > 10 else ''}")
        else:
            print("  Satellogic (bonus): no coverage for this bbox")

        # Bonus: ICEYE scenes covering this bbox
        iceye_dates = scene_dates_for_bbox(ICEYE_CSV, bbox)
        if iceye_dates:
            near_p = [d for d in iceye_dates if within_days(d, pdate, DAYS)]
            near_u = [d for d in iceye_dates if within_days(d, udate, DAYS)]
            if near_p or near_u:
                print(f"  ICEYE (bonus, within ±{DAYS} days of P/U): {', '.join(sorted(set(near_p + near_u)))}")
            else:
                print(f"  ICEYE (bonus, covers bbox on other dates): {', '.join(iceye_dates[:10])}{'...' if len(iceye_dates) > 10 else ''}")
        else:
            print("  ICEYE (bonus): no coverage for this bbox")

    print("\n" + "=" * 80)
    print(f"Total: {len(pu_fires)} fire(s) with Planet+Umbra within ±{DAYS} days.")
    print("=" * 80)


if __name__ == "__main__":
    main()
