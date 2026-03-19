# Report: Satellogic / ICEYE + NIFC + GEE workflow

**Purpose of this document:** A clear record of what was built, how it works, what was observed, and what to do next — for burn-area verification using CSDAP (Satellogic, ICEYE) and Google Earth Engine (Landsat, Sentinel-2).

---

## 1. Objective

- **Start from CSDAP** where possible: find fires whose **NIFC perimeter** overlaps **Satellogic** or **ICEYE** footprints, with **time alignment** (scene within fire discovery + 60 days).
- **Verify optical imagery** over the **same area** in **Google Earth Engine** (Landsat + Sentinel-2) for slides comparing commercial/SAR footprints with public optical data.
- If **no automated match**, report **NONE** and move to the next mission (Satellogic → ICEYE → manual CSDAP / Umbra / Planet).

---

## 2. What was built

### 2.1 Python pipeline (`scripts/`)

| Script | Role |
|--------|------|
| **`find_fires_intersecting_satellogic.py`** | Core: fetch CSDAP STAC footprints for **`satellogic`** or **`iceye`** (`--collection`), intersect with NIFC (or CAL FIRE) perimeters. **Default match rule:** spatial overlap **and** scene time in **[discovery, discovery + 60 days]**. Wide STAC window default: `2019-01-01/2027-12-31`, `max_items=15000`. |
| **`find_fires_intersecting_iceye.py`** | Wrapper: same script with `--collection iceye`. |
| **`run_find_fire_for_gee.py`** | Runs **Satellogic** then **ICEYE** in sequence (after NIFC download if needed). |
| **`download_nifc_perimeters.py`** | Pulls WFIGS GeoJSON into `data/nifc_perimeters/`. |
| **`export_satellogic_footprints.py`** | Exports all Satellogic footprints (+ optional union) to GeoJSON for QGIS/GEE. |
| **`run_conus_satellogic.bat`** | Windows helper: `.venv` or Anaconda Python + pipeline / install. |

**Flags (main script):** `--spatial-only` (no temporal filter), `--temporal-days N`, `--min-acres`, `--california`, `--perimeters path`, `--sample-footprint` (only when no match), `--collection satellogic|iceye`.

### 2.2 Google Earth Engine (`gee_verify_burn_area_landsat_s2.js`)

- **AOI** = Satellogic (or ICEYE) **scene footprint** bbox pasted from CSDAP.
- **Landsat** L8/L9 L2: **100% AOI overlap**, cloud &lt; threshold.
- **Sentinel-2:** **≥50% AOI overlap** (tiles rarely cover 100% of large AOIs).
- Layers added via **evaluate + getMapId** (avoids ComputedObject / empty-image issues).
- **Console:** scene IDs, dates, CSDAP-style bbox for re-search.
- **Export:** optional `Export.image.toDrive` for chosen Landsat/S2 dates.
- **Header** points to `RUN_FIRST_THEN_GEE.md` and this workflow.

### 2.3 Documentation

| Doc | Content |
|-----|---------|
| **`docs/VERIFY_BURN_SATELLOGIC_LANDSAT_S2.md`** | Full workflow: CONUS fire test → CSDAP → GEE. |
| **`RUN_FIRST_THEN_GEE.md`** | Short runner steps. |
| **`docs/FIX_ANACONDA_SSL.md`** | Fix “SSL module not available” on Windows Anaconda. |
| **`scripts/README.md`** | Script index including Satellogic/ICEYE. |

---

## 3. How matching works (technical)

1. **Footprints:** CSDAP STAC returns **full scene polygons** (not centroids).
2. **Spatial:** Fire perimeter ∩ footprint ≠ ∅.
3. **Temporal:** Scene acquisition **≥ fire discovery** and **≤ discovery + 60 days** (NIFC: `attr_FireDiscoveryDateTime` ms, else `poly_PolygonDateTime`).
4. **Implementation:** `geopandas.sjoin` (fires × scenes) + per-fire temporal check; avoids row-wise Python loops where possible.

---

## 4. What we observed (your runs)

| Step | Result |
|------|--------|
| **Satellogic STAC** (CONUS, wide dates) | Hundreds of footprints returned (e.g. 531 with 15k cap; 409 in an earlier narrow window). |
| **Satellogic + NIFC (spatial+temporal)** | **NONE** — no NIFC perimeter in your dataset matched both space and time. |
| **ICEYE + NIFC (spatial+temporal)** | **NONE** — same. |
| **Reasons (likely)** | (1) **2026 WFIGS** fires vs **2025-heavy** Satellogic archive; (2) footprints concentrated in **different regions** than current large fires; (3) **60-day** window is strict; (4) **max_items** cap may drop some scenes. |
| **Export footprints** | `data/satellogic_footprints.geojson` + `satellogic_footprints_union.geojson` — 409 scenes (narrow date run). |

When a mission returns **NONE**, the script prints a boxed line (**`SATELLOGIC + NIFC: NONE`** / **`ICEYE + NIFC: NONE`**) and the **next command** (e.g. ICEYE after Satellogic).

---

## 5. Operational lessons

- **PowerShell:** Use **`;`** between `cd` and `python`, or run on **two lines**. Avoid pasting `cd "path"C:\...\python.exe` as one token.
- **Anaconda SSL:** Add **`Anaconda3\Library\bin`** to PATH (see `FIX_ANACONDA_SSL.md`) if HTTPS fails.
- **GEE:** Do not pass **`ee.Algorithms.If(...)`** to `Map.addLayer`; use **evaluate + getMapId**. **`getMapId`** returns **`.mapid` / `.token`**, not **`.get('mapid')`**.

---

## 6. Recommended next steps (for the slide)

1. **Relax automation:**  
   `python scripts/find_fires_intersecting_iceye.py --spatial-only`  
   (and/or Satellogic with same flag, lower `--min-acres`, or `--temporal-days 120`).
2. **Manual CSDAP:** **Umbra** / **Planet** over your target bbox and dates — often better burn overlap than Satellogic/ICEYE for a given fire.
3. **GEE:** Paste **any** chosen scene footprint bbox into **`gee_verify_burn_area_landsat_s2.js`**; run for Landsat + Sentinel-2 layers and exports.
4. **Tracker:** Log fire name, bbox, and per-source item IDs in **`data/study_area_tracker.csv`** (existing project convention).

---

## 7. File inventory (this thread)

```
gee_verify_burn_area_landsat_s2.js    # GEE: AOI, L8/L9 + S2, exports, console
scripts/find_fires_intersecting_satellogic.py  # Satellogic + ICEYE logic
scripts/find_fires_intersecting_iceye.py
scripts/run_find_fire_for_gee.py
scripts/export_satellogic_footprints.py
scripts/download_nifc_perimeters.py
run_conus_satellogic.bat
data/nifc_perimeters/wfigs_current.geojson   # NIFC input
data/satellogic_footprints*.geojson          # optional export outputs
docs/VERIFY_BURN_SATELLOGIC_LANDSAT_S2.md
docs/FIX_ANACONDA_SSL.md
docs/REPORT_SATELLOGIC_ICEYE_NIFC_GEE.md     # this file
RUN_FIRST_THEN_GEE.md
```

---

## 8. Summary (one paragraph)

We implemented an **NIFC-driven pipeline** that queries **CSDAP** for **Satellogic** and **ICEYE** scene footprints over **CONUS** (wide time window), matches fires **spatially** and **within 60 days of discovery**, and prints **NONE** with a clear handoff when no fire qualifies. **Google Earth Engine** script **`gee_verify_burn_area_landsat_s2.js`** layers **Landsat and Sentinel-2** on the **same bbox** as a chosen CSDAP footprint for comparison slides. **Your current NIFC file and archive geometry/time** yielded **no Satellogic or ICEYE matches** under the strict rule; **footprint GeoJSON export** and **relaxed flags** or **Umbra/Planet** in CSDAP are the practical paths forward.

---

*Report generated for project workflow documentation. Update Section 4 as new runs complete.*
