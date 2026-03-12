# CSDA Fire Product — Project Plan

## Goal

Create a **single, self-contained PowerPoint slide** that is aesthetically pleasing and visually appealing:

| Left side | Right side |
|-----------|------------|
| Map of fire-affected perimeter from CAL FIRE shapefile (California inset and/or US inset) | 5 satellite images for the **same day** (or closest available) showing post-fire conditions: **Planet**, **Satellogic**, **Umbra**, **ICEYE**, **Landsat** |

- **Map**: Made in **QGIS** (perimeter + insets).
- **Imagery**: Sourced via [CSDAP Satellite Data Explorer](https://csdap.earthdata.nasa.gov/explore/) (Planet, Satellogic, Umbra, ICEYE) and **Google Earth Engine** (Landsat).
- **Fire perimeters**: [California Fire Perimeters (all)](https://gis.data.ca.gov/datasets/CALFIRE-Forestry::california-fire-perimeters-all) — shapefile for study area and date.

---

## Biggest Challenges

1. **Data intersection** — Finding dates and locations where all 5 sources (Planet, Satellogic, Umbra, ICEYE, Landsat) have imagery.
2. **Case study choice** — Picking a fire that is visually striking and has good coverage.
3. **CSDAP usability** — Map shows availability by tile, not by image footprint; hard to see exact spatial extent. Thumbnails/metadata (e.g. JSON) on click may help; [Data Acquisition Request System](https://csdap.earthdata.nasa.gov/user-guide/#data-acquisition-request-system) is relevant. Current account may lack download permissions (waiting on boss’s credentials).
4. **Site selection** — From CAL FIRE shapefile: sort by **year**, **size (area)**, and prioritize fires with **data availability** across sources.

---

## Core Method: Hybrid Shortlist → Intersection (Fundamental)

This project uses one workflow end-to-end: **shortlist candidate fires first**, then **find cross-source imagery intersections** for each candidate until one fire/date satisfies the 5-source requirement.

### Why this is fundamental

- The primary risk is **multi-source intersection** (Planet + Satellogic + Umbra + ICEYE + Landsat).
- A single-shot selection strategy wastes time if one source is missing.
- A pure catalog strategy is blocked by limited footprint visibility and current credential constraints.

### Availability-driven year heuristic (important)

The intersection step is limited by the *scarcest* sources. Based on CSDA “records over time” histograms captured in `data/data_availability/`:

- **Umbra** and **Satellogic** density is heavily concentrated in **2025** (much lower in 2024).
- **ICEYE** density is strongest in **2023–2024**, but still has some **2025** coverage.
- **Planet** is abundant and rarely limiting.

**Practical consequence**: start intersection scouting with **2025 fires** first (to satisfy Umbra + Satellogic), then confirm ICEYE and Landsat for the same/closest day.

### Hybrid workflow (the only workflow used)

1. **Shortlist fires from CAL FIRE** (recent + large): use `scripts/rank_fires.py` to generate candidates with fire name, year, acres, alarm/control date (if present), and a WGS84 bbox.
2. **Choose 2–3 candidates (not 1)** and add them to `data/study_area_tracker.csv`.
3. **Lock a target post-fire date window**: aim for the same day across sources; otherwise use the closest available date(s) within a defined tolerance.
4. **Populate the 5-source matrix** for each candidate:
   - **Landsat** via GEE (scene ID + date)
   - **Planet / Satellogic / Umbra / ICEYE** via CSDAP (item ID + date + overlap evidence)
5. **Select the winner row**: the candidate with all 5 sources present and the strongest visual story, then produce the slide.

### Exit criteria for selection

A candidate is “ready” when `study_area_tracker.csv` has one row where:

- The fire perimeter and bbox are finalized (map extent locked).
- One image ID per source is recorded (or explicitly marked “closest date”).
- Dates are documented so the slide can state “same day” or “closest available day”.

---

## Groundwork Checklist (Before Full Credentials)

- [ ] **CAL FIRE data**: Download shapefile from [California Fire Perimeters (all)](https://gis.data.ca.gov/datasets/CALFIRE-Forestry::california-fire-perimeters-all) (or [California Open Data](https://data.ca.gov/dataset/cal-fire)) and run `scripts/rank_fires.py` to get a candidate list.
- [ ] **Study area**: Choose 1–3 candidate fires (name, date, bbox); add to `data/study_area_tracker.csv`.
- [ ] **Landsat**: In GEE, find scene IDs for the chosen fire(s) and date(s); add to tracker.
- [ ] **CSDAP**: When you have access, for each candidate fire/date: browse by location/date, use “copy item ID” and layer toggle to confirm footprint; fill Planet, Satellogic, Umbra, ICEYE IDs and dates in tracker.
- [ ] **Final choice**: Pick the fire/date with all 5 IDs and best visual; note “same day” or “closest day” in the slide.

---

## Data Sources

| Source | Purpose | Access |
|--------|---------|--------|
| [CAL FIRE — California Fire Perimeters (all)](https://gis.data.ca.gov/datasets/CALFIRE-Forestry::california-fire-perimeters-all) | Fire perimeter geometry, name, date, area | Download shapefile / inspect in QGIS |
| [CSDAP — Satellite Data Explorer](https://csdap.earthdata.nasa.gov/explore/) | Planet, Satellogic, Umbra, ICEYE imagery | Browse; copy item IDs; request data when credentials allow |
| [CSDAP — Data Acquisition Request System](https://csdap.earthdata.nasa.gov/user-guide/#data-acquisition-request-system) | How to request/download imagery | After permissions |
| Google Earth Engine | Landsat imagery | Use for same bbox/date; export scene IDs |

---

## CSDAP Workarounds (Until Footprints Are Clear)

- Use **“Copy item ID to clipboard”** and **toggle layer on map** to see which tiles overlap your fire.
- Check **thumbnail and metadata (JSON)** on click to infer date and approximate coverage.
- Record **item IDs** in the tracker so that once you have download access, you can request by ID without re-browsing.

---

## Deliverables

1. **QGIS map**: Fire perimeter + California (and/or US) inset; export as image for left side of slide.
2. **Five images**: One each from Planet, Satellogic, Umbra, ICEYE, Landsat (same or closest date); same geographic area.
3. **PowerPoint slide**: Left = map; right = 5-panel imagery; clean, self-contained, visually appealing.

---

## Repo Structure

```
csda-fire-product/
├── README.md
├── PROJECT_PLAN.md          ← this file
├── data/
│   ├── study_area_tracker.csv   ← candidate fires + image IDs per source
│   └── calfire_perimeters/      ← (you add) downloaded shapefile/GeoJSON
├── scripts/
│   └── rank_fires.py        ← sort CAL FIRE by year/area; output candidates
└── docs/                    ← (optional) screenshots, notes, CSDAP metadata samples
```
