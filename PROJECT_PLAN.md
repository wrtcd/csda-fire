# CSDA Fire Product — Project Plan

## Goal

Create a **single, self-contained PowerPoint slide** that is aesthetically pleasing and visually appealing, aligned with current guidance from KPV:

| Left side | Right side |
|-----------|------------|
| Map of fire-affected perimeter from CAL FIRE shapefile (California inset and/or US inset) | **Phase 1 (now)**: Landsat + Sentinel‑2 post-fire images for a California fire. **Phase 2 (later, once CSDA access is confirmed)**: add Planet + Umbra panels for the same California fire, and, where possible, single-site CSDA examples over Southeastern states (e.g., ICEYE over an Alabama fire) for comparison with Sentinel/Landsat. |

- **Map**: Made in **QGIS** (perimeter + insets).
- **Imagery**:
  - **Now**: **Landsat** and **Sentinel‑2** via Google Earth Engine (and/or Copernicus Open Access Hub / NASA services) for California fires.
  - **Later (pending CSDA reply)**: Planet + Umbra for the same California fires, and other CSDA missions (e.g., ICEYE, Satellogic) where they intersect study sites in the Southeastern states (including Alabama).
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

### Availability-driven heuristic (important)

The intersection step is limited by the *scarcest* sources. Based on CSDA “records over time” histograms and 2024-only histograms captured in `data/data_availability/`:

- **Umbra** density is concentrated in **late 2024 (Sep–Dec)** and **2025**.
- **ICEYE** density is strongest in **2019–2024**, with **no 2025 entries** visible in the examined California catalogs.
- Within **2024**, ICEYE scenes occur in **Jan–Jul**, while Umbra scenes occur in **Sep–Dec** → there is **no temporal overlap** between Umbra and ICEYE in 2024 for this region.
- **Satellogic** scenes for 2025 over California are effectively limited to **Nov–Dec 2025** (plus a small January contribution).
- **Planet** is abundant and rarely limiting.

**Practical consequence for California**: with the currently accessible CSDA archives there is **no year/month window where Umbra, ICEYE, and Satellogic all overlap in time**, so a true five-mission intersection (Planet + Satellogic + Umbra + ICEYE + Landsat/Sentinel‑2) is not achievable there. This motivates a **phased strategy**:

- **Phase 1 (California)**: focus on **Landsat + Sentinel‑2** (plus Planet/Umbra when available) for a well-chosen CAL FIRE perimeter.
- **Phase 2 (Southeastern U.S., including Alabama)**: search CSDA holdings for sites that intersect relevant fires; if there is no multi-mission intersection, use **single-site examples** such as **ICEYE over an Alabama fire**, compared against **Sentinel‑2 or Landsat**.

### Hybrid workflow (the only workflow used)

1. **Shortlist fires from CAL FIRE** (recent + large): use `scripts/rank_fires.py` to generate candidates with fire name, year, acres, alarm/control date (if present), and a WGS84 bbox.
2. **Choose 2–3 California fire candidates (not 1)** and add them to `data/study_area_tracker.csv`.
3. **Lock a target post-fire date window**: aim for the same day across sources; otherwise use the closest available date(s) within a defined tolerance.
4. **Phase 1 (immediate, California)**:
   - Populate **Landsat** and **Sentinel‑2** entries for each candidate (scene ID + date).
   - Where CSDA access already allows, also populate **Planet** and **Umbra** entries.
5. **Phase 2 (CSDA-driven, Southeastern U.S.)**:
   - Use CSDAP to look for **CSDA sites in Southeastern states (including Alabama)** that intersect fire events of interest.
   - If there is an intersection, populate **Planet / Satellogic / Umbra / ICEYE** entries (item ID + date + overlap evidence) in the tracker or a derivative table.
   - If there is *no* multi-mission intersection, identify **single-site examples** (e.g., **ICEYE** over an Alabama fire) and plan comparisons to **Sentinel‑2 or Landsat**.
6. **Select the winner row / example set**:
   - For California, choose a fire/date with at least **Landsat + Sentinel‑2** (and optionally Planet + Umbra) and the strongest visual story for the main slide.
   - For Southeastern/Alabama examples, choose one or more ICEYE‑vs‑Sentinel/Landsat comparisons to highlight as supporting examples.

### Exit criteria for selection

A candidate is “ready” when `study_area_tracker.csv` has one row where:

- The fire perimeter and bbox are finalized (map extent locked).
- One image ID per source is recorded (or explicitly marked “closest date”).
- Dates are documented so the slide can state “same day” or “closest available day”.

---

## What We Tried in 2024 (and Why We Pivoted)

Before adopting the 2025-first heuristic, several 2024 fires near the Central Valley / SoCal corridor were tested:

- **BRIDGE (2024-09-08)** — bbox `-117.7965,34.1987,-117.6190,34.4219`
- **LINE (2024-09-06)** — bbox `-117.1851,34.0921,-116.9398,34.2177`
- **AIRPORT (2024-09-09)** — bbox `-117.5707,33.6174,-117.3867,33.7280`

For each fire, CSDAP searches were run with:

- AOI = fire bbox (plus small padding in some tests)
- Time window ≈ alarm_date → alarm_date + 30 days (and extended to 60–90 days in follow-ups)

**Observed availability (qualitative):**

- **Planet** and **Landsat**: multiple post-fire scenes for each candidate.
- **Umbra / ICEYE / Satellogic**: consistently **0 results**, even when:
  - The AOI was expanded to include nearby high-count tiles.
  - The time window was widened beyond the immediate post-fire period.

Combined with the per-year histograms in `data/data_availability/`, this led to the conclusion that **2024 fires are poor intersection candidates given current CSDA holdings and filters**, and motivated the pivot to **2025 fires (PALISADES, EATON, HUGHES)** as the primary shortlist.

These 2024 results remain useful as negative evidence and should be referenced in any final report describing the search strategy and constraints.

---

## Groundwork Checklist (Before Full Credentials)

- [ ] **CAL FIRE data (California)**: Download shapefile from [California Fire Perimeters (all)](https://gis.data.ca.gov/datasets/CALFIRE-Forestry::california-fire-perimeters-all) (or [California Open Data](https://data.ca.gov/dataset/cal-fire)) and run `scripts/rank_fires.py` to get a candidate list.
- [ ] **Study area (California)**: Choose 1–3 candidate California fires (name, date, bbox); add to `data/study_area_tracker.csv`.
- [ ] **Landsat + Sentinel‑2 (California)**: In GEE (and/or Copernicus services), find Landsat and Sentinel‑2 scene IDs for the chosen fire(s) and date(s); add to the tracker.
- [ ] **CSDAP (California, later)**: When you have access, for each candidate fire/date: browse by location/date, use “copy item ID” and layer toggle to confirm footprint; fill Planet and Umbra IDs and dates in the tracker as they become available.
- [ ] **CSDA sites in Southeastern U.S. (including Alabama)**: Use CSDAP to search for tiles/sites that intersect relevant fire locations. If matches exist, record Planet/Satellogic/Umbra/ICEYE IDs and dates; if not, identify single-site examples (e.g., ICEYE over an Alabama fire) for comparison with Sentinel‑2 or Landsat.
- [ ] **Final choice**: Pick (a) the California fire/date to feature with Landsat + Sentinel‑2 (and later Planet + Umbra) and (b) any ICEYE‑vs‑Sentinel/Landsat examples from the Southeast; note “same day” or “closest day” in the slide and report text.

---

## Data Sources

| Source | Purpose | Access |
|--------|---------|--------|
| [CAL FIRE — California Fire Perimeters (all)](https://gis.data.ca.gov/datasets/CALFIRE-Forestry::california-fire-perimeters-all) | Fire perimeter geometry, name, date, area (California) | Download shapefile / inspect in QGIS |
| [CSDAP — Satellite Data Explorer](https://csdap.earthdata.nasa.gov/explore/) | Planet, Satellogic, Umbra, ICEYE imagery (California + Southeastern U.S.) | Browse; copy item IDs; request data when credentials allow |
| [CSDAP — Data Acquisition Request System](https://csdap.earthdata.nasa.gov/user-guide/#data-acquisition-request-system) | How to request/download imagery | After permissions |
| Google Earth Engine | Landsat + Sentinel‑2 imagery | Use for same bbox/date; export scene IDs |

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
