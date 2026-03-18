# Get a fire that intersects Satellogic (CONUS), then run in GEE

This is the **CONUS fire test** workflow: find fires whose perimeter intersects a Satellogic footprint, then use one fire’s Satellogic scene in GEE. Full details: **`docs/VERIFY_BURN_SATELLOGIC_LANDSAT_S2.md`**.

## 1. Create `data/nifc_perimeters/` and add WFIGS

The folder `data/nifc_perimeters/` should exist. Add a current WFIGS perimeter file (e.g. **wfigs_current.geojson**) from [NIFC WFIGS Interagency Fire Perimeters](https://data-nifc.opendata.arcgis.com/datasets/wfigs-2025-interagency-fire-perimeters-to-date) (or current year).

## 2. Run the CONUS fire-finding workflow

From the project root:

```bash
pip install pystac-client geopandas requests
python scripts/run_find_fire_for_gee.py
```

Or run the steps separately:

```bash
python scripts/download_nifc_perimeters.py
python scripts/find_fires_intersecting_satellogic.py
```

The last script prints one or more fires. Each block looks like:

```
  FIRE_NAME  (XXXX acres)
    FIRE_NAME = '...';
    FIRE_BBOX = [min_lon, min_lat, max_lon, max_lat];
    START_DATE = '...'; END_DATE = '...';
```

Copy **FIRE_NAME**, **FIRE_BBOX**, **START_DATE**, **END_DATE** from one fire (e.g. the first).

## 3. In CSDAP, get the Satellogic scene for that fire

1. Open **[CSDAP Satellite Data Explorer](https://csdap.earthdata.nasa.gov/explore/)**.
2. Enter the fire’s **bbox** and **date range** (START_DATE to END_DATE). Filter by **Satellogic**, search.
3. Pick a **Satellogic scene** that overlaps the fire. Note its **footprint** (scene bbox: west, south, east, north) and **acquisition date**.

## 4. Paste into GEE and run

1. Open **Google Earth Engine Code Editor**: https://code.earthengine.google.com/
2. Open **`gee_verify_burn_area_landsat_s2.js`** from this repo (copy contents into the editor).
3. At the top, set:
   - **FIRE_BBOX** = the **Satellogic scene footprint** from step 3 (not the fire bbox).
   - **POST_START** = START_DATE, **POST_END** = END_DATE (or a window around the Satellogic date).
   - **PRE_FIRE_START** / **PRE_FIRE_END** = a window before that (e.g. same year, earlier months).
   - **FIRE_NAME** = the fire name or a label.
4. Click **Run**. You’ll see the AOI (red), pre-fire image, and individual Landsat + Sentinel-2 post-fire images; the Console shows scene IDs, dates, and a CSDAP search line.

You then have one burn area with **Satellogic** (from CSDAP, step 3) **+ Landsat + Sentinel-2** (from GEE, step 4). See **`docs/VERIFY_BURN_SATELLOGIC_LANDSAT_S2.md`** for the full workflow and optional (California, custom bbox/date).
