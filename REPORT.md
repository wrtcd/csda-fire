# CSDA Fire Product – Work Summary and Findings

## Objective

- Build a single, self-contained slide showing:
  - **Left**: CAL FIRE fire perimeter map created in QGIS.
  - **Right**: post-fire imagery from **Planet, Satellogic, Umbra, ICEYE, Landsat** on the same or closest date.
- Use:
  - **Fire perimeters** from CAL FIRE “California Fire Perimeters (all)”.
  - **Imagery** from CSDAP Satellite Data Explorer (Planet, Satellogic, Umbra, ICEYE) and Google Earth Engine (Landsat).

---

## Data Preparation

- Downloaded `California_Fire_Perimeters_(all).shp` into `data/calfire_perimeters/`.
- Implemented `scripts/rank_fires.py` to:
  - Read CAL FIRE perimeters via GeoPandas.
  - Detect year and acreage columns.
  - Filter fires by minimum year and minimum acres (defaults: year ≥ 2018, acres ≥ 5000).
  - Output `data/candidate_fires_ranked.csv` with:
    - `fire_name`, `year`, `acres`, `alarm_date`, `bbox_wgs84` (WGS84 bounding box).

---

## 2024 Fire Candidates Tested

Initial focus: 2024 fires in the Central Valley / Southern California corridor with large areas.

- **BRIDGE (2024-09-08)**  
  - Bbox: `-117.7965,34.1987,-117.6190,34.4219`  
  - AOI: fire bbox (and padded variants).  
  - Time windows tested: alarm_date → alarm_date + 30 days; extended to ~60–90 days.  
  - Observed availability:
    - Planet: post-fire scenes present.
    - Landsat: post-fire coverage (checked via GEE).
    - Umbra: 0 scenes returned for these AOIs/windows.
    - ICEYE: 0 scenes.
    - Satellogic: 0 scenes.

- **LINE (2024-09-06)**  
  - Bbox: `-117.1851,34.0921,-116.9398,34.2177`  
  - Same AOI and time-window pattern as BRIDGE.  
  - Observed availability:
    - Planet: post-fire scenes present.
    - Landsat: post-fire coverage.
    - Umbra: 0 scenes.
    - ICEYE: 0 scenes.
    - Satellogic: 0 scenes.

- **AIRPORT (2024-09-09)**  
  - Bbox: `-117.5707,33.6174,-117.3867,33.7280`  
  - Same AOI and time-window pattern.  
  - Observed availability:
    - Planet: post-fire scenes present.
    - Landsat: post-fire coverage.
    - Umbra: 0 scenes.
    - ICEYE: 0 scenes.
    - Satellogic: 0 scenes.

These three 2024 fires were removed from the active tracker but are documented here and in `PROJECT_PLAN.md` as rejected candidates due to lack of Umbra/ICEYE/Satellogic intersection.

---

## Availability Tiles and Histograms

To understand archive structure beyond individual fires, CSDAP “data availability” visualizations were captured and stored in `data/data_availability/`:

- Tile overlays (counts per grid tile over California):
  - `satellogic.png`
  - `iceye.png`
  - `umbra.png`
- Yearly “records over time” histograms:
  - `planet_hist.png`
  - `satellogic_hist.png`
  - `umbra_hist.png`
  - `iceye_hist.png`

Qualitative observations from the histograms:

- **Umbra**:
  - Significant bar in **2025**.
  - Smaller activity in **2024**.
- **Satellogic**:
  - Strong bar in **2025**.
  - Smaller bars in **2023–2024**.
- **ICEYE**:
  - Activity visible for **2019–2024**.
  - **No visible bar for 2025** in the captured histogram.
- **Planet**:
  - High volume in multiple years (especially around 2018–2020), with continued but lower activity later.

Spatially, tile plots indicate higher counts for Umbra/ICEYE/Satellogic along a diagonal corridor roughly from Fresno to the Southern California region (including near Los Angeles and San Diego).

---

## 2025 Fire Candidates Tested

Based on the availability histograms (strong Umbra and Satellogic activity in 2025), three 2025 fires were selected from the ranked list and added to `data/study_area_tracker.csv`:

- **PALISADES (2025-01-07)**  
  - Bbox: `-118.6859,34.0298,-118.5006,34.1294`.
  - AOI: bbox (with small padding in some tests).
  - Primary time window: 2025-01-07 → 2025-02-06.
  - Extended window: up to ~60 days after alarm date.
  - Observed availability (qualitative counts from CSDAP search results):
    - Planet: ≈ 49 post-fire scenes.
    - Umbra: ≈ 30 scenes.
    - ICEYE: 0 scenes.
    - Satellogic: 0 scenes.

- **EATON (2025-01-08)**  
  - Bbox: `-118.1621,34.1619,-118.0131,34.2378`.
  - Time windows as for PALISADES.
  - Observed availability:
    - Planet: ≈ 67 post-fire scenes.
    - Umbra: ≈ 36 scenes.
    - ICEYE: 0 scenes.
    - Satellogic: 0 scenes.

- **HUGHES (2025-01-22)**  
  - Bbox: `-118.6269,34.4754,-118.5402,34.5814`.
  - Time windows as above.
  - Observed availability:
    - Planet: post-fire scenes present (not counted explicitly, but known available).
    - Umbra: ≈ 6 scenes.
    - ICEYE: 0 scenes.
    - Satellogic: 0 scenes.

In all 2025 tests, Planet and Umbra showed archive coverage; ICEYE and Satellogic did not return any scenes for these AOIs and date ranges, consistent with ICEYE having no visible 2025 bar in `iceye_hist.png`.

---

## Summary of Findings

- **CAL FIRE shortlist** generation via `scripts/rank_fires.py` produced a set of recent, large fires with known alarm dates and bounding boxes; this drove candidate selection.
- **2024 SoCal fires (BRIDGE, LINE, AIRPORT)**:
  - Planet and Landsat: post-fire coverage present.
  - Umbra, ICEYE, Satellogic: 0 archival scenes in the tested AOIs/date windows.
- **CSDAP availability visualizations**:
  - Umbra and Satellogic archives are densest in **2025**.
  - ICEYE shows activity from 2019–2024 but **no 2025 bar** in the captured histogram.
  - Spatially, high-count tiles align along a Fresno–SoCal corridor.
- **2025 SoCal fires (PALISADES, EATON, HUGHES)**:
  - Planet: tens of post-fire scenes.
  - Umbra: multiple scenes (PALISADES ≈ 30, EATON ≈ 36, HUGHES ≈ 6).
  - ICEYE: 0 scenes for the tested AOIs and windows.
  - Satellogic: 0 scenes for the tested AOIs and windows.

Overall, within the region and periods tested:

- A complete intersection of **Planet + Satellogic + Umbra + ICEYE + Landsat** over a single fire/date was **not observed**.
- The most consistent multi-source combination observed for 2025 SoCal fires is **Planet + Umbra (plus Landsat from GEE)**, with ICEYE and Satellogic absent from the accessible archives for those specific AOIs and time ranges.

