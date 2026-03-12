# CSDA Fire Product – Work Summary and Findings

## Objective

| Item            | Description                                                                                 |
|-----------------|---------------------------------------------------------------------------------------------|
| Slide layout    | Left: CAL FIRE fire perimeter map (QGIS). Right: post-fire imagery panels.                 |
| Target missions | Planet, Satellogic, Umbra, ICEYE, Landsat (same or closest acquisition date).              |
| Fire data       | CAL FIRE “California Fire Perimeters (all)” dataset.                                       |
| Imagery access  | CSDAP Satellite Data Explorer (Planet, Satellogic, Umbra, ICEYE) and Google Earth Engine.  |

---

## Data Preparation

| Step | Artifact / Tool                 | Output / Notes                                                                 |
|------|---------------------------------|-------------------------------------------------------------------------------|
| 1    | `California_Fire_Perimeters_(all).shp` | Source fire perimeters from CAL FIRE, stored in `data/calfire_perimeters/`.  |
| 2    | `scripts/rank_fires.py`        | Generates `data/candidate_fires_ranked.csv` with `fire_name`, `year`, `acres`, `alarm_date`, `bbox_wgs84`. Filters by year ≥ 2018 and acres ≥ 5000 by default. |

---

## 2024 Fire Candidates Tested

Initial focus: 2024 fires in the Central Valley / Southern California corridor with large burned areas.

| Fire    | Alarm date | Bbox (minLon,minLat,maxLon,maxLat)                  | Time windows tested                 | Planet | Landsat | Umbra | ICEYE | Satellogic |
|---------|------------|------------------------------------------------------|-------------------------------------|--------|---------|-------|-------|------------|
| BRIDGE  | 2024-09-08 | -117.7965,34.1987,-117.6190,34.4219                 | +30 days, extended to ~+60–90 days | Yes    | Yes     | 0     | 0     | 0          |
| LINE    | 2024-09-06 | -117.1851,34.0921,-116.9398,34.2177                 | +30 days, extended to ~+60–90 days | Yes    | Yes     | 0     | 0     | 0          |
| AIRPORT | 2024-09-09 | -117.5707,33.6174,-117.3867,33.7280                 | +30 days, extended to ~+60–90 days | Yes    | Yes     | 0     | 0     | 0          |

These three 2024 fires were removed from the active tracker but remain documented here and in `PROJECT_PLAN.md` as rejected candidates due to lack of Umbra/ICEYE/Satellogic intersection.

---

## Availability Tiles and Histograms

CSDAP “data availability” visualizations were captured and stored in `data/data_availability/`:

- Tile overlays: `satellogic.png`, `iceye.png`, `umbra.png`.  
- Yearly histograms: `planet_hist.png`, `satellogic_hist.png`, `umbra_hist.png`, `iceye_hist.png`.

### Archive availability by year (qualitative, from histograms)

| Year range | Planet | ICEYE | Umbra | Satellogic | Comment                                 |
|-----------|--------|-------|-------|------------|-----------------------------------------|
| 2019–2020 | High   | Low–M | –     | –          | Early ICEYE, strong Planet              |
| 2021–2022 | Medium | Low–M | –     | Low        | Mixed, not dominant                      |
| 2023–2024 | Medium | High  | Low–M | Medium     | ICEYE strongest here                     |
| 2025      | Low–M  | ~0    | High  | High       | Umbra and Satellogic peaks; ICEYE absent |

Spatially, the tile plots indicate higher counts for Umbra/ICEYE/Satellogic along a diagonal corridor roughly from Fresno to the Southern California region (including near Los Angeles and San Diego).

---

## 2025 Fire Candidates Tested

Based on the histograms (strong Umbra and Satellogic activity in 2025), three 2025 fires were selected from the ranked list and added to `data/study_area_tracker.csv`.

| Fire      | Alarm date | Bbox (minLon,minLat,maxLon,maxLat)              | Time windows tested        | Planet (approx. count) | Umbra (approx. count) | ICEYE | Satellogic |
|-----------|------------|--------------------------------------------------|----------------------------|------------------------|------------------------|-------|------------|
| PALISADES | 2025-01-07 | -118.6859,34.0298,-118.5006,34.1294             | +30 days, extended to ~+60d| ≈49                    | ≈30                    | 0     | 0          |
| EATON     | 2025-01-08 | -118.1621,34.1619,-118.0131,34.2378             | +30 days, extended to ~+60d| ≈67                    | ≈36                    | 0     | 0          |
| HUGHES    | 2025-01-22 | -118.6269,34.4754,-118.5402,34.5814             | +30 days, extended to ~+60d| (present; not counted) | ≈6                     | 0     | 0          |

In all 2025 tests, Planet and Umbra showed archive coverage; ICEYE and Satellogic did not return scenes for these AOIs and date ranges, consistent with ICEYE having no visible 2025 bar in `iceye_hist.png`.

---

## Summary of Findings

### Method and data artifacts

| Aspect            | Evidence / Location                                   |
|-------------------|-------------------------------------------------------|
| Fire shortlist    | `scripts/rank_fires.py`, `data/candidate_fires_ranked.csv` |
| Tracker           | `data/study_area_tracker.csv`                         |
| Availability viz  | `data/data_availability/*.png`                        |

### Per-candidate availability

| Fire (year)        | Planet | Landsat | Umbra | ICEYE | Satellogic | Notes                                      |
|--------------------|--------|---------|-------|-------|------------|--------------------------------------------|
| BRIDGE (2024)      | Yes    | Yes     | 0     | 0     | 0          | SoCal corridor, rejected                   |
| LINE (2024)        | Yes    | Yes     | 0     | 0     | 0          | SoCal corridor, rejected                   |
| AIRPORT (2024)     | Yes    | Yes     | 0     | 0     | 0          | SoCal corridor, rejected                   |
| PALISADES (2025)   | Yes    | Expected| ≈30   | 0     | 0          | Partial: Planet + Umbra                    |
| EATON (2025)       | Yes    | Expected| ≈36   | 0     | 0          | Partial: Planet + Umbra                    |
| HUGHES (2025)      | Yes    | Expected| ≈6    | 0     | 0          | Partial: Planet + Umbra                    |

### Overall

| Aspect                      | Observation                                                                 |
|-----------------------------|-----------------------------------------------------------------------------|
| 5‑mission intersection      | No single fire/date with Planet + Satellogic + Umbra + ICEYE + Landsat observed. |
| 2024 SoCal fires            | Planet + Landsat present; Umbra/ICEYE/Satellogic all 0 for tested AOIs/windows. |
| 2025 SoCal fires            | Planet + Umbra present; ICEYE/Satellogic 0 for tested AOIs/windows.         |
| ICEYE 2025 histogram        | No 2025 bar in `iceye_hist.png` → no 2025 archive entries visible in catalog. |
| Strongest observed combo    | Planet + Umbra (plus Landsat from GEE) for 2025 SoCal candidates.          |

