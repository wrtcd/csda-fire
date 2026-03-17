# CSDA Fire Product – Overview

**Goal:** One slide: fire perimeter map + post-fire imagery for the same place and time.

- **California:** **Planet + Landsat + Sentinel** (and Umbra where it has coverage). We have CSDA access.
- **ICEYE and Satellogic** from CSDA are used elsewhere (e.g. Southeast / Alabama).

---

## Plan

- **Main slide:** A **California fire** where **Planet, Umbra, Landsat, and Sentinel** all have coverage. Use **`data/data_availability/fire_planet_umbra_overlap.csv`** (fires that coincide with Planet and Umbra in 2024–2025, same place and time). Then GEE for Landsat + Sentinel, CSDAP for Planet + Umbra. Log in tracker; build slide.
- **Southeast / Alabama:** Search CSDAP; use ICEYE/Satellogic as needed; if no multi-mission match, single-site vs Sentinel/Landsat in GEE.
- **Slide:** California = one fire with Planet + Umbra + Landsat + Sentinel. Southeast example if ready.

---

## Finding the fire (Planet + Umbra + Landsat + Sentinel)

- **Umbra temporal (your observation):** roughly **Oct 2024 – Dec 2025**. Pick a post-fire date in that window.
- **Overlap:** Run **`scripts/fire_planet_umbra_overlap.py`** to get fires where **CAL FIRE ∩ Planet ∩ Umbra** (spatially and temporally in 2024–2025). Table: `fire_planet_umbra_overlap.csv`.
- **Spatial inspection:** Use Umbra tile maps (`data/data_availability/umbra_2024.png`, `umbra_2025.png`, `umbra.png`) and overlay or compare with **fire perimeters** (e.g. [California Fire Perimeters](https://gis.data.ca.gov/datasets/CALFIRE-Forestry::california-fire-perimeters-all)) to see which fires intersect Umbra tiles. Confirm Planet + Umbra for that fire’s bbox in **CSDAP Explorer**.
- **Easier: grab all footprints with dates from CSDAP.** Run **`scripts/csdap_planet_umbra_footprints.py`** (uses the public CSDAP STAC API; no login for search). It writes `planet_footprints_ca.geojson` and `umbra_footprints_ca.geojson` (plus CSV) into `data/data_availability/`. Open those in QGIS, overlay CAL FIRE perimeters, and see which fires intersect Planet and Umbra coverage and on which dates.
- **Workflow:**
  1. **Fire ∩ Umbra ∩ Planet:** Inspect Umbra tile maps and fire perimeters (or CSDAP) to pick a **fire** whose location has Umbra and Planet coverage.
  2. **Bbox + date:** Use that fire’s bbox and a **post-fire date** in Oct 2024–Dec 2025 when Planet and Umbra both have acquisitions.
  3. **Landsat + Sentinel:** In GEE, use that fire bbox and date to search and export Landsat + Sentinel.
  4. **Planet + Umbra:** In CSDAP, download Planet + Umbra for that same bbox and date.
  5. Build the slide (perimeter + four sources).

So: **choose where a fire overlaps Umbra (and Planet) using tile maps + fire perimeters; fix post-fire date in Oct 2024–Dec 2025; then GEE for L+S2 and CSDAP for P+U.**

---

## Reference

- **Where/when data exists:** `data/data_availability/` — tile maps and histograms; see `BEST_PLACE_FOR_SLIDE.md` there.
- **Fire perimeters:** CAL FIRE (e.g. [California Fire Perimeters](https://gis.data.ca.gov/datasets/CALFIRE-Forestry::california-fire-perimeters-all)).
- **CSDAP:** [Explorer](https://csdap.earthdata.nasa.gov/explore/).
