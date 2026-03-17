# Scripts

## 1. Planet + Umbra footprints (2024–2025)

**Script:** `csdap_planet_umbra_footprints.py`

Fetches Planet and Umbra footprints over California from the CSDAP STAC API (date range **2024-01-01 to 2025-12-31**). Writes:

- `data/data_availability/planet_footprints_ca.geojson`, `umbra_footprints_ca.geojson`
- `planet_footprints_ca.csv`, `umbra_footprints_ca.csv` (id, datetime, bbox)

**Run:** `pip install pystac-client` then `python scripts/csdap_planet_umbra_footprints.py`

---

## 2. CAL FIRE × Planet × Umbra overlap table

**Script:** `fire_planet_umbra_overlap.py`

Finds CAL FIRE fires that **spatially and temporally** coincide with Planet and Umbra: same place, same date (or within a few days). Uses only 2024 and 2025 footprint data. Writes:

- **`data/data_availability/fire_planet_umbra_overlap.csv`** — columns: `fire_name`, `alarm_date`, `cont_date`, `imagery_date`, `bbox`

**Run:** After step 1, run `pip install geopandas` then `python scripts/fire_planet_umbra_overlap.py`

**Use:** Open the CSV; pick a fire and use its `bbox` and `imagery_date` in CSDAP (Planet + Umbra) and GEE (Landsat + Sentinel). See `docs/FIND_PLANET_UMBRA_FIRE.md`.
