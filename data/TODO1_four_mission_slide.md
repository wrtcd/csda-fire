# First TODO: California slide (Planet + Umbra + Landsat + Sentinel)

**Goal:** One slide = one fire where **all four** (Planet, Umbra, Landsat, Sentinel) have coverage. We are **not** using PALISADES (no Umbra there).

---

## Checklist

- [ ] **1. Pick a fire**  
  - Open `data/data_availability/fire_planet_umbra_overlap.csv` (fires with Planet + Umbra overlap in 2024–2025).  
  - Choose one, e.g. **EATON**, **LAKE**, **MOUNTAIN**, **FRANKLIN** (2024–2025).

- [ ] **2. Confirm in QGIS**  
  - Load `planet_footprints_ca.geojson`, `umbra_footprints_ca.geojson`, and `data/cal fire/California_Fire_Perimeters_(all).shp`.  
  - Confirm the fire’s perimeter sits **well inside** both Planet and Umbra coverage.

- [ ] **3. Get bbox and post-fire date**  
  - From the shapefile (or CAL FIRE): fire bbox and a **post-fire date** in **Oct 2024–Dec 2025** when both Planet and Umbra have scenes.

- [ ] **4. GEE: Landsat + Sentinel**  
  - In GEE, use that fire’s bbox and date to search and export Landsat + Sentinel (adapt `gee_palisades_landsat_s2.js` with your bbox and date, or use a picker script).

- [ ] **5. CSDAP: Planet + Umbra**  
  - In [CSDAP Explorer](https://csdap.earthdata.nasa.gov/explore/), same bbox and date: order/download Planet and Umbra.

- [ ] **6. Log in tracker**  
  - Add a row in `data/study_area_tracker.csv` for this fire with planet_item_id, planet_date, umbra_item_id, umbra_date, landsat_id, landsat_date, sentinel2_id, sentinel2_date.

- [ ] **7. Build the slide**  
  - Map: that fire’s perimeter. Imagery: Planet + Umbra + Landsat + Sentinel.
