# TODO

1. **California slide: fire with Planet + Umbra + Landsat + Sentinel** — Run `scripts/fire_planet_umbra_overlap.py`; open `data/data_availability/fire_planet_umbra_overlap.csv` and pick a fire (bbox + imagery_date). GEE: Landsat + Sentinel; CSDAP: Planet + Umbra. Log in tracker. Build slide (perimeter + all four).
   - [ ] Pick a fire from `fire_planet_umbra_overlap.csv` (e.g. EATON, LAKE, MOUNTAIN, FRANKLIN).
   - [ ] Confirm in QGIS with `planet_footprints_ca.geojson`, `umbra_footprints_ca.geojson`, CAL FIRE shapefile.
   - [ ] Get bbox and post-fire date (Oct 2024–Dec 2025).
   - [ ] GEE: Landsat + Sentinel for that bbox/date (adapt `gee_landsat_s2_export.js`).
   - [ ] CSDAP: Planet + Umbra for same bbox/date.
   - [ ] Log in `data/study_area_tracker.csv`; build slide (perimeter + all four).
2. **Southeast / Alabama** — CSDAP: search; ICEYE/Satellogic as needed; if no multi-mission match, single-site vs Sentinel/Landsat in GEE.
3. **Slide** — California: one fire with Planet + Umbra + Landsat + Sentinel. Southeast example if ready.
