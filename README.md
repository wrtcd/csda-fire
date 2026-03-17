# CSDA Fire Product

**Goal:** One slide — fire perimeter + post-fire imagery from **Planet + Umbra + Landsat + Sentinel**. Use a **fire where all four have coverage** (not PALISADES — no Umbra there).

- **[OVERVIEW.md](OVERVIEW.md)** — goal and plan
- **[TODO.md](TODO.md)** — next steps
- **`data/TODO1_four_mission_slide.md`** — checklist for first TODO (pick fire with Planet+Umbra, get L+S2 + P+U)
- **`docs/FIND_PLANET_UMBRA_FIRE.md`** — how to find the Planet + CAL FIRE + Umbra intersection (QGIS + candidate list)
- **`data/data_availability/`** — Planet/Umbra footprints (GeoJSON/CSV) and **`fire_planet_umbra_overlap.csv`** = CAL FIRE fires with Planet+Umbra in same place and time (2024–2025)
- **`scripts/csdap_planet_umbra_footprints.py`** — Fetch Planet + Umbra footprints. **`scripts/fire_planet_umbra_overlap.py`** — Build the overlap table (spatial + temporal).
- **GEE:** Use a script for your chosen fire’s bbox/date (adapt from `gee_palisades_landsat_s2.js` or add a generic bbox/date script).

Previous scripts, tracker, reports, and calfire list are in **`_old/`** if you need them.
