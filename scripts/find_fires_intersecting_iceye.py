#!/usr/bin/env python3
"""ICEYE + NIFC (same logic as Satellogic). Equivalent to --collection iceye on the main script."""

import subprocess
import sys
from pathlib import Path

BASE = Path(__file__).resolve().parent.parent
MAIN = BASE / "scripts" / "find_fires_intersecting_satellogic.py"

if __name__ == "__main__":
    sys.exit(
        subprocess.run(
            [sys.executable, str(MAIN), "--collection", "iceye"] + sys.argv[1:],
            cwd=str(BASE),
        ).returncode
    )
