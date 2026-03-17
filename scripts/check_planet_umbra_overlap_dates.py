#!/usr/bin/env python3
"""Check Planet+Umbra overlap and Satellogic bonus for each window."""
import csv
from datetime import datetime, timedelta
from pathlib import Path

DATA_AVAIL = Path(__file__).resolve().parent.parent / "data" / "data_availability"
CSV_PATH = DATA_AVAIL / "fire_planet_umbra_overlap.csv"
SATELLOGIC_CSV = DATA_AVAIL / "satellogic_footprints_ca.csv"


def parse_dates(s):
    if not s or not str(s).strip():
        return set()
    return set(d.strip() for d in str(s).split(";") if len(d.strip()) >= 10)


def has_overlap(planet_str, umbra_str, days_window=7):
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
            if abs((pt - ut).days) <= days_window:
                return True, (pd, ud)
    return False, None


def bbox_overlap(fb, s_min_lon, s_min_lat, s_max_lon, s_max_lat):
    parts = [x.strip() for x in fb.split(",")]
    if len(parts) != 4:
        return False
    try:
        fl, fa, fr, ft = map(float, parts)
    except ValueError:
        return False
    return not (fl > s_max_lon or fr < s_min_lon or fa > s_max_lat or ft < s_min_lat)


def satellogic_dates_for_bbox(bbox):
    out = set()
    if not SATELLOGIC_CSV.exists():
        return out
    with open(SATELLOGIC_CSV, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            dt = (r.get("datetime") or "")[:10]
            if len(dt) < 10:
                continue
            try:
                sl, sa, sr, st = float(r.get("min_lon") or 0), float(r.get("min_lat") or 0), float(r.get("max_lon") or 0), float(r.get("max_lat") or 0)
            except (ValueError, TypeError):
                continue
            if bbox_overlap(bbox, sl, sa, sr, st):
                out.add(dt)
    return sorted(out)


def within(s_date, ref_date, days):
    try:
        return abs((datetime.strptime(s_date, "%Y-%m-%d") - datetime.strptime(ref_date, "%Y-%m-%d")).days) <= days
    except ValueError:
        return False


def main():
    with open(CSV_PATH, encoding="utf-8") as f:
        rows = list(csv.DictReader(f))

    windows = [7, 10, 15, 20, 25, 30, 45, 60]
    by_window = {d: [] for d in windows}
    for row in rows:
        for d in windows:
            ok, pair = has_overlap(row.get("planet_dates", ""), row.get("umbra_dates", ""), d)
            if ok:
                by_window[d].append((row["fire_name"], row["bbox"], pair))

    print("Planet + Umbra temporal overlap (12 fires checked)\n")
    print("Window (days)  P+U count  Fire(s)              Satellogic within window?")
    print("-" * 75)
    for d in windows:
        fires = by_window[d]
        unique = sorted(set(f[0] for f in fires))
        names = ", ".join(unique)
        if len(names) > 22:
            names = names[:19] + "..."
        seen = set()
        with_sat = 0
        for name, bbox, (pdate, udate) in fires:
            if name in seen:
                continue
            seen.add(name)
            sat_dates = satellogic_dates_for_bbox(bbox)
            if any(within(sd, pdate, d) or within(sd, udate, d) for sd in sat_dates):
                with_sat += 1
        sat_str = str(with_sat) if fires else "-"
        print(f"  +/-{d:2}            {len(unique):5}      {names:22}  {sat_str}")
    print("-" * 75)
    print("\nNote: Satellogic CA coverage only Nov-Dec 2025; P+U pairs are Jul-Sep 2025.")
    print("So Satellogic cannot fall within any of these windows (gap ~90+ days).")
    print("\nExample pairs:")
    for d in windows:
        if by_window[d]:
            name, _, (pdate, udate) = by_window[d][0]
            print(f"  +/-{d:2}: {name}  Planet {pdate} / Umbra {udate}")
            break


if __name__ == "__main__":
    main()
