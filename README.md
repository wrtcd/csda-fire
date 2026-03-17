# CSDA Fire Product

**Goal:** One slide — fire perimeter + post-fire imagery from **Planet + Umbra + Landsat + Sentinel**. Use a **fire where all four have coverage**.

- **[OVERVIEW.md](OVERVIEW.md)** — goal and plan
- **[TODO.md](TODO.md)** — next steps (includes California slide checklist)
- **`docs/FIND_PLANET_UMBRA_FIRE.md`** — how to find the Planet + CAL FIRE + Umbra intersection (QGIS + candidate list)
- **`data/data_availability/`** — Planet/Umbra footprints (GeoJSON/CSV) and **`fire_planet_umbra_overlap.csv`** = CAL FIRE fires with Planet+Umbra in same place and time (2024–2025)
- **Scripts:** `scripts/csdap_planet_umbra_footprints.py` (fetch footprints); `scripts/fire_planet_umbra_overlap.py` (overlap table); `scripts/rank_fire_planet_umbra.py` (rank fires, optional `--list-dates` or `--fire NAME --alarm DATE`)
- **GEE:** Adapt `gee_landsat_s2_export.js` for your fire’s bbox/date.
