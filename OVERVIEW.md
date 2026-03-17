# CSDA Fire Product – Overview

**Goal:** One slide: fire perimeter map + post-fire imagery for the same place and time.

- **California:** **Planet + Umbra + Landsat** is the **strongest multi-sensor combination** actually available in CSDA data for California fires; all three have consistent coverage in post-fire windows. Add Sentinel where available.
- **ICEYE and Satellogic** from CSDA are used elsewhere (e.g. Southeast / Alabama). Over California, there is **no single fire/date** with full Planet + Satellogic + Umbra + ICEYE + Landsat in the post-fire period — for every candidate fire and a ±30-day window, at least one of Umbra, ICEYE, or Satellogic is always missing.

---

## Slide priority (sensors in post-fire imagery)

You always have **Landsat and Sentinel** (GEE). CSDA adds Planet, Umbra, ICEYE, Satellogic.

- **Best (6):** Planet + Umbra + Satellogic + ICEYE + Landsat + Sentinel. **Intersection with Satellogic may not be possible** over California (limited, late 2025+).
- **Second best (5):** e.g. **Planet + Umbra + ICEYE + Landsat + Sentinel**. Something with Planet + Umbra + ICEYE is OK.
- **Otherwise (4):** **Planet + Umbra + Landsat + Sentinel** is OK.

So: aim for 6; if not possible, 5 (Planet+Umbra+ICEYE+Landsat+Sentinel); else 4 (Planet+Umbra+Landsat+Sentinel).

---

## CSDA temporal coverage (API-driven)

**`scripts/csdap_planet_umbra_footprints.py`** pings the CSDAP STAC API for each collection’s **temporal extent** (start/end dates) and uses those when available; otherwise it uses fallback ranges. It writes **`data/data_availability/collection_temporal_extent.json`** with the dates used (source: `api` or `fallback`). So start/end for Umbra, Planet, Satellogic, and ICEYE are discovered from the API where the collection metadata provides them.

- **ICEYE:** 2019 through early 2024 in practice; no temporal overlap with Umbra.
- **Umbra:** Late 2024 into 2025 (API may report exact interval).
- **Satellogic:** Very limited over California; late 2025 and 2026; collection extent may be open (null), so script uses fallback.
- **Planet + Landsat:** Have data across the range. **Strongest combo for California: Planet + Umbra + Landsat** (and Sentinel where available).

---

## Plan

- **Main slide:** A **California fire** where **Planet, Umbra, and Landsat** (and Sentinel where available) have coverage. Use **`data/data_availability/fire_planet_umbra_overlap.csv`** (fires that coincide with Planet and Umbra in 2024–2025). GEE for Landsat (+ Sentinel); CSDAP for Planet + Umbra. Log in tracker; build slide.
- **Southeast / Alabama:** Search CSDAP; use ICEYE/Satellogic as needed; if no multi-mission match, single-site vs Sentinel/Landsat in GEE.
- **Slide:** California = one fire with **Planet + Umbra + Landsat** (strongest combo); add Sentinel if available. Southeast example if ready.

---

## Finding the fire (Planet + Umbra + Landsat)

- **Overlap:** Run **`scripts/fire_planet_umbra_overlap.py`** to get fires where **CAL FIRE ∩ Planet ∩ Umbra** (spatially and temporally; Umbra late 2024–2025). Table: `fire_planet_umbra_overlap.csv`.
- **Spatial inspection:** Use Umbra tile maps and overlay **fire perimeters** (e.g. [California Fire Perimeters](https://gis.data.ca.gov/datasets/CALFIRE-Forestry::california-fire-perimeters-all)). Confirm Planet + Umbra for that fire’s bbox in **CSDAP Explorer**.
- **Footprints:** Run **`scripts/csdap_planet_umbra_footprints.py`** to fetch each collection’s temporal extent from the API (or fallback), write **`collection_temporal_extent.json`**, and write `planet_footprints_ca.geojson`, `umbra_footprints_ca.geojson` (and ICEYE, Satellogic) into `data/data_availability/`. Open in QGIS with CAL FIRE perimeters to see which fires intersect Planet and Umbra and on which dates.
- **Workflow:**
  1. Pick a **fire** where Planet and Umbra both have coverage (late 2024–2025 for Umbra).
  2. Use that fire’s **bbox** and a **post-fire date** when Planet and Umbra both have acquisitions.
  3. **Landsat (+ Sentinel):** In GEE, use that bbox and date.
  4. **Planet + Umbra:** In CSDAP for the same bbox and date.
  5. Build the slide (perimeter + Planet + Umbra + Landsat, and Sentinel if available).

So: **strongest California combo is Planet + Umbra + Landsat.** Choose a fire that overlaps both Planet and Umbra (late 2024–2025); then GEE for Landsat (+ Sentinel) and CSDAP for Planet + Umbra.

---

## Reference

- **Where/when data exists:** `data/data_availability/` — tile maps and histograms; see `BEST_PLACE_FOR_SLIDE.md` there.
- **Fire perimeters:** CAL FIRE (e.g. [California Fire Perimeters](https://gis.data.ca.gov/datasets/CALFIRE-Forestry::california-fire-perimeters-all)).
- **CSDAP:** [Explorer](https://csdap.earthdata.nasa.gov/explore/).
