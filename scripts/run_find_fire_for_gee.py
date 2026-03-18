#!/usr/bin/env python3
"""
Run NIFC + CSDAP mission search: Satellogic first, then ICEYE if you follow the printed steps.

  1. Download NIFC perimeters (if needed)
  2a. Satellogic + NIFC (spatial + temporal). If NONE, output tells you to run ICEYE.
  2b. ICEYE + NIFC (same logic)

Usage:
  pip install pystac-client geopandas requests
  python scripts/run_find_fire_for_gee.py

ICEYE only:
  python scripts/find_fires_intersecting_iceye.py
  # or: python scripts/find_fires_intersecting_satellogic.py --collection iceye
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
NIFC_DIR = BASE / "data" / "nifc_perimeters"
NIFC_FILE = NIFC_DIR / "wfigs_current.geojson"
FIND = [sys.executable, "scripts/find_fires_intersecting_satellogic.py"]


def run(cmd: list[str]) -> int:
    return subprocess.run(cmd, cwd=str(BASE)).returncode


def main() -> None:
    if not NIFC_FILE.exists():
        print("Step 1: Downloading NIFC perimeters...")
        if run([sys.executable, "scripts/download_nifc_perimeters.py"]) != 0:
            print("Download failed.", file=sys.stderr)
            sys.exit(1)
    else:
        print("Step 1: NIFC perimeters already present.")

    print("\n" + "=" * 64)
    print("  Step 2a: SATELLOGIC + NIFC")
    print("=" * 64)
    r1 = run(FIND + ["--collection", "satellogic"])
    if r1 != 0:
        print("Satellogic step failed (CSDAP/network).", file=sys.stderr)
        sys.exit(1)

    print("\n" + "=" * 64)
    print("  Step 2b: ICEYE + NIFC  (run even if Satellogic was NONE)")
    print("=" * 64)
    r2 = run(FIND + ["--collection", "iceye"])
    if r2 != 0:
        print("ICEYE step failed.", file=sys.stderr)
        sys.exit(1)

    print("\nStep 3: If either mission listed fires, copy FIRE_NAME, FIRE_BBOX, START_DATE, END_DATE")
    print("         into gee_verify_burn_area_landsat_s2.js; pick the mission footprint in CSDAP for GEE.")


if __name__ == "__main__":
    main()
