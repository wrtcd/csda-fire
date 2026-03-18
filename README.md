# CSDA Fire Product

**Goal:** One slide — fire perimeter + post-fire imagery from **Planet + Umbra + Landsat + Sentinel** (and optionally Satellogic, ICEYE). Use a **fire where multiple sources have coverage**.

- **Map**: QGIS (perimeter + CA/US inset). **Fire data**: [California Fire Perimeters (all)](https://gis.data.ca.gov/datasets/CALFIRE-Forestry::california-fire-perimeters-all).
- **Imagery**: [CSDAP](https://csdap.earthdata.nasa.gov/explore/) + Google Earth Engine (Landsat, Sentinel-2).
- **[OVERVIEW.md](OVERVIEW.md)** — goal and plan | **[TODO.md](TODO.md)** — next steps
- **[PROJECT_PLAN.md](PROJECT_PLAN.md)** — hybrid shortlist → intersection workflow. Use **`data/study_area_tracker.csv`** to record candidate fires and image IDs per source.
- **`docs/FIND_PLANET_UMBRA_FIRE.md`** — Planet + CAL FIRE + Umbra intersection (QGIS + candidate list). **`data/data_availability/`** — footprints and **`fire_planet_umbra_overlap.csv`**.
- **Scripts:** `scripts/csdap_planet_umbra_footprints.py`, `scripts/fire_planet_umbra_overlap.py`, `scripts/rank_fire_planet_umbra.py` (optional `--list-dates` or `--fire NAME --alarm DATE`). **GEE:** `gee_landsat_s2_export.js` (export L+S2 for a fire); **`gee_verify_burn_area_landsat_s2.js`** (verify Landsat + Sentinel-2 over any US burn area; use with Satellogic check in CSDAP — see **[docs/VERIFY_BURN_SATELLOGIC_LANDSAT_S2.md](docs/VERIFY_BURN_SATELLOGIC_LANDSAT_S2.md)**).
- **Workflow report (Satellogic / ICEYE / NIFC / GEE):** **[docs/REPORT_SATELLOGIC_ICEYE_NIFC_GEE.md](docs/REPORT_SATELLOGIC_ICEYE_NIFC_GEE.md)** — what was built, how matching works, observed results, next steps.
