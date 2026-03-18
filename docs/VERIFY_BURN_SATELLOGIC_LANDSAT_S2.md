# Start from Satellogic in CSDAP, then Landsat + Sentinel-2 in GEE

**The workflow starts from a Satellogic footprint in CSDAP.** You pick a Satellogic scene, copy its bounds and date, then use that same AOI in GEE to get Landsat and Sentinel-2 for your slide.

---

## Full workflow: test a fire in CONUS that has Satellogic

To get a **named fire** in the USA that actually has Satellogic coverage, then use that fire’s Satellogic scene in GEE:

### A. Get NIFC perimeters and find fires that intersect Satellogic

From the project root:

```bash
pip install pystac-client geopandas requests
python scripts/run_find_fire_for_gee.py
```

Or run the steps separately:

```bash
python scripts/download_nifc_perimeters.py   # downloads WFIGS to data/nifc_perimeters/
python scripts/find_fires_intersecting_satellogic.py
```

- **NIFC data:** Put a WFIGS GeoJSON in `data/nifc_perimeters/` (e.g. from [NIFC WFIGS Interagency Fire Perimeters](https://data-nifc.opendata.arcgis.com/datasets/wfigs-2025-interagency-fire-perimeters-to-date) or current year).
- **California only:** `python scripts/find_fires_intersecting_satellogic.py --california` (uses `data/calfire_perimeters/`).
- **Custom bbox/date:** `python scripts/find_fires_intersecting_satellogic.py --bbox west,south,east,north --date YYYY-MM-DD/YYYY-MM-DD`

The script prints a list of fires. Each block looks like:

```
  FIRE_NAME  (XXXX acres)
    FIRE_NAME = '...';
    FIRE_BBOX = [min_lon, min_lat, max_lon, max_lat];  // fire perimeter bbox
    START_DATE = '...'; END_DATE = '...';
```

Default date range is **2025-11-01/2025-12-15** (Satellogic 2025 archive). Copy one fire’s **FIRE_NAME**, **FIRE_BBOX**, **START_DATE**, **END_DATE**.

See also: **`RUN_FIRST_THEN_GEE.md`** (repo root) and **`scripts/README.md`** (section 4).

### B. In CSDAP, get the Satellogic scene for that fire

1. Open **[CSDAP Satellite Data Explorer](https://csdap.earthdata.nasa.gov/explore/)**.
2. Enter the fire’s **bbox** (or draw the area) and set **date range** = START_DATE to END_DATE.
3. Filter by **Satellogic**, search.
4. Pick a **Satellogic scene** that covers (or overlaps) the fire. Note:
   - The **scene’s footprint** (bounds): bbox = [west, south, east, north].
   - The **acquisition date**.

### C. Paste the Satellogic footprint into the GEE script

1. Open **Google Earth Engine Code Editor**: https://code.earthengine.google.com/
2. Open **`gee_verify_burn_area_landsat_s2.js`** (repo root).
3. In the CONFIG at the top set:
   - **FIRE_BBOX** = the **Satellogic scene footprint** from step B (not the whole fire bbox).
   - **POST_START** / **POST_END** = window around the Satellogic date (e.g. START_DATE to END_DATE, or that day ± 60 days).
   - **PRE_FIRE_START** / **PRE_FIRE_END** = a window before that (for the one pre-fire image).
   - **FIRE_NAME** = fire name or `"Satellogic footprint"`.
4. Run the script.

### D. Use the map and console in GEE

- **Map:** AOI (red) + pre-fire image + individual Landsat and Sentinel-2 post-fire images (dates in layer names).
- **Console:** Scene IDs and dates; CSDAP search line (bounds) to re-use in CSDAP.

You then have **one Satellogic scene (from CSDAP)** and **Landsat + Sentinel-2 over the same footprint (from GEE)** for your slide.

---

## Short path: you already have a Satellogic scene

If you already found a Satellogic scene in CSDAP (without using the CONUS fire list):

1. Note the scene’s **footprint** (bbox) and **acquisition date**.
2. Paste into the GEE script CONFIG as in **C** above (FIRE_BBOX = footprint, POST_* / PRE_* around that date).
3. Run the script in GEE.

---

## Reference

| Step | Where | What |
|------|--------|------|
| CONUS fires that intersect Satellogic | `scripts/run_find_fire_for_gee.py` or `find_fires_intersecting_satellogic.py` | Fire name, bbox, START_DATE, END_DATE |
| One-shot runner | **`RUN_FIRST_THEN_GEE.md`** | Download NIFC → find fires → paste into GEE (then use CSDAP for footprint) |
| Scripts overview | **`scripts/README.md`** | Section 4: fires intersecting Satellogic (USA / California) |
| GEE script | **`gee_verify_burn_area_landsat_s2.js`** | CONFIG: FIRE_BBOX = Satellogic footprint, POST_* / PRE_* dates |

Summary: **Start from Satellogic in CSDAP** (either by testing CONUS fires first, or by searching CSDAP directly) **→ copy the scene footprint + date → paste into GEE.**
