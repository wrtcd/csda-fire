# TODO

1. **California slide: fire with Planet + Umbra + Landsat + Sentinel**
   - Run `scripts/fire_planet_umbra_overlap.py`; open `data/data_availability/fire_planet_umbra_overlap.csv` and pick a fire (e.g. EATON, LAKE, MOUNTAIN, FRANKLIN, PALISADES). Confirm in QGIS with Planet/Umbra footprints and CAL FIRE shapefile; get bbox and post-fire date.
   - [ ] Download 1 Planet scene (PALISADES first): CSDAP Explorer → PALISADES bbox/post-fire window → Planet; record in `study_area_tracker.csv`.
   - [ ] Request CSDA authorizations (ICEYE, Umbra, Satellogic): https://csdap.earthdata.nasa.gov/signup/
   - [ ] After approval: download 1–2 Umbra scenes for same California fire; log in tracker.
   - [ ] GEE: Landsat + Sentinel‑2 for bbox/date (adapt `gee_landsat_s2_export.js`); record IDs/dates in tracker.
   - [ ] Build slide: perimeter + Planet + Umbra + Landsat + Sentinel.

2. **Southeast / Alabama** — CSDAP: search; ICEYE/Satellogic as needed; log coverage in tracker; single-site vs Sentinel/Landsat in GEE if no multi-mission match.

3. **Final slide** — California: one fire with Planet + Umbra + Landsat + Sentinel; Southeast example if ready. Assemble QGIS map and imagery panels into the PowerPoint slide.
