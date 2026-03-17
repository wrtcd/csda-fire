# TODO

## Do first (run order)

1. **Run footprints (get dates + footprints):**  
   `python scripts/csdap_planet_umbra_footprints.py`  
   → Fetches API temporal extents, writes `collection_temporal_extent.json` and `*_footprints_ca.geojson` / `.csv` in `data/data_availability/`.

2. **Run overlap table:**  
   `python scripts/fire_planet_umbra_overlap.py`  
   → Writes `fire_planet_umbra_overlap.csv` (fires with Planet + Umbra in same place/time).

3. **Pick a fire by priority:** Open `fire_planet_umbra_overlap.csv` and choose fire + bbox + imagery_date:
   - **Best (6):** Try to find a fire/date with Planet + Umbra + Satellogic + ICEYE + Landsat + Sentinel (Satellogic overlap may not exist for CA).
   - **Second (5):** Aim for Planet + Umbra + ICEYE + Landsat + Sentinel.
   - **Otherwise (4):** Planet + Umbra + Landsat + Sentinel (always have Landsat + Sentinel from GEE).

4. **Then:** Confirm in QGIS → get bbox/date → GEE (Landsat + Sentinel) → CSDAP (Planet + Umbra, + ICEYE/Satellogic if in your combo) → log in tracker → build slide.

---

## California slide checklist (6 → 5 → 4 priority)

- [ ] Run `scripts/csdap_planet_umbra_footprints.py`.
- [ ] Run `scripts/fire_planet_umbra_overlap.py`.
- [ ] Pick a fire from `fire_planet_umbra_overlap.csv` (e.g. EATON, LAKE, MOUNTAIN, FRANKLIN); note bbox + imagery_date.
- [ ] Confirm in QGIS with `planet_footprints_ca.geojson`, `umbra_footprints_ca.geojson`, CAL FIRE shapefile.
- [ ] Get bbox and post-fire date (use `collection_temporal_extent.json` for each sensor’s window).
- [ ] GEE: Landsat + Sentinel for that bbox/date (adapt `gee_landsat_s2_export.js`).
- [ ] CSDAP: Planet + Umbra (and ICEYE/Satellogic if targeting 5 or 6) for same bbox/date.
- [ ] Log in `data/study_area_tracker.csv`; build slide (perimeter + your combo: 6, 5, or 4 sensors).

---

## Other

- **Southeast / Alabama** — CSDAP: search; ICEYE/Satellogic as needed; if no multi-mission match, single-site vs Sentinel/Landsat in GEE.
- **Slide** — California: one fire with best combo (6 > 5 > 4). Southeast example if ready.
