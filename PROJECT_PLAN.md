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

## Approach: Hybrid (Top-Down + Bottom-Up)

| Approach | Pros | Cons |
|----------|------|------|
| **Top-down** | Pick a famous/large fire → get perimeter/date → search each source. | Risk: no overlap for that fire. |
| **Bottom-up** | Get catalogs per source → find overlapping areas/dates → match to CAL FIRE. | Needs catalog/API access; CSDAP doesn’t expose footprints easily. |

**Recommended: hybrid**

1. **Shortlist fires** from CAL FIRE (script in this repo): sort by **year** (e.g. recent) and **area** (large = more likely visible and interesting). Export a small list of candidate fires with name, date, bbox, acreage.
2. **For each candidate**: note fire name, alarm/control dates, bounding box (for CSDAP/GEE search). When you have credentials, search each source by **location + date** and record **image IDs** in the tracker (see `data/study_area_tracker.csv`).
3. **Overlap check**: Use CSDAP “copy item ID to clipboard” and “visually toggle layer on map” to see which tiles/layers overlap; use GEE for Landsat over the same bbox/date to confirm Landsat availability.
4. **Pick the best site** where all 5 sources have at least one image (same day or closest day) and the scene looks good.

This way you **constrain the problem** (few candidate fires) and **fill in the matrix** (which image IDs per source) as access becomes available.

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
