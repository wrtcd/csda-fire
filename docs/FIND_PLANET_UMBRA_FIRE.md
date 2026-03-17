# Find a CAL FIRE fire with Planet and Umbra (spatial + temporal)

We only use **2024 and 2025**: both the **imagery** (Planet/Umbra scenes) and the **fires** (CAL FIRE alarm or containment date must be in 2024 or 2025). **CSDA coverage over California:** ICEYE runs 2019–early 2024 then stops; Umbra only appears from **late 2024** into 2025; Satellogic is very limited (late Nov/Dec 2025 and 2026). There is **no period where ICEYE and Umbra both have images** for this region. **Strongest multi-sensor combo for California is Planet + Umbra + Landsat.** You need a fire where Planet and Umbra both have imagery at the same place; for Umbra that means a post-fire date in **late 2024–2025**. Acquisition dates can be the same or close (within a week is acceptable).

**Footprints:** The script uses the **original scene footprints** from STAC (polygon outline of each image on the ground). The GeoJSON features are `"type": "Polygon"` — the coordinates are the polygon vertices, not centroids. Overlap is **fire polygon intersects footprint polygon**. An optional small buffer (default 0.01°) is applied to the fire geometry so near-miss edges still count; you can set `FIRE_BUFFER_DEGREES = 0` in the script to disable it.

---

## Steps

**1. Fetch Planet and Umbra footprints (2024–2025 only)**

```text
python scripts/csdap_planet_umbra_footprints.py
```
(script: [csdap_planet_umbra_footprints.py](../scripts/csdap_planet_umbra_footprints.py))

This writes [planet_footprints_ca.geojson](../data/data_availability/planet_footprints_ca.geojson), [umbra_footprints_ca.geojson](../data/data_availability/umbra_footprints_ca.geojson) (and CSVs) in [data/data_availability/](../data/data_availability/) for California. Per-collection date ranges: **Planet** 2024–2025; **ICEYE** 2019–early 2024; **Umbra** late 2024–2025; **Satellogic** late Nov 2025 + 2026. No ICEYE–Umbra temporal overlap.

**2. Build the overlap table**

```text
python scripts/fire_planet_umbra_overlap.py
```
(script: [fire_planet_umbra_overlap.py](../scripts/fire_planet_umbra_overlap.py))

The script:

- Keeps only footprint scenes in **2024 and 2025**, and only **CAL FIRE fires whose alarm or containment date is 2024 or 2025**.
- Finds dates when **both** Planet and Umbra have at least one scene.
- For each Planet scene date, looks for Umbra scenes within **±7 days** (same date not required). Finds CAL FIRE fires that **intersect** both (spatial + temporal: dates can be a few days apart).
- Writes **[fire_planet_umbra_overlap.csv](../data/data_availability/fire_planet_umbra_overlap.csv)**.

**3. (Optional) Rank and list imagery dates**

To rank by likelihood and optionally list which dates have Planet/Umbra coverage:

```text
python scripts/rank_fire_planet_umbra.py                    # rank only
python scripts/rank_fire_planet_umbra.py --list-dates      # rank + list dates for top 10
python scripts/rank_fire_planet_umbra.py --fire EATON --alarm 2025-01-08   # list dates for one fire
```
(script: [rank_fire_planet_umbra.py](../scripts/rank_fire_planet_umbra.py))

This writes **fire_planet_umbra_ranked.csv** (all candidates, ordered by score), **fire_planet_umbra_top10.csv** (first 10), and with `--list-dates` or `--fire`/`--alarm` also **fire_planet_umbra_ranked_with_dates.csv** (includes planet_dates, umbra_dates). Use **date_range** in CSDAP when searching.

**4. Inspect the table**

Open **[fire_planet_umbra_overlap.csv](../data/data_availability/fire_planet_umbra_overlap.csv)** (or the ranked/top10 CSVs above). Columns:

| Column          | Meaning |
|-----------------|--------|
| fire_name       | CAL FIRE fire name |
| alarm_date      | Alarm date |
| cont_date       | Containment date |
| imagery_date    | Planet scene date; Umbra can be within ±7 days of this date |
| bbox            | min_lon, min_lat, max_lon, max_lat (for CSDAP / GEE) |

The **ranked** CSV adds **nw_lon**, **nw_lat**, **se_lon**, **se_lat** (northwest and southeast corners) and **planet_count**, **umbra_count**.

Each row is a fire that **coincides with available Planet and Umbra** (same place, same time window). Use one row’s **bbox** and **imagery_date** in CSDAP and GEE to pull Planet, Umbra, and Landsat (strongest CA combo; add Sentinel where available) for your slide.

---

## You always get a table — a California story is doable

The script first looks for **strict** overlap: same fire, Planet and Umbra both covering it within 7 days. If that returns no rows (e.g. due to how dates line up in the footprint data), the script **still writes a table**: every CAL FIRE fire whose perimeter **intersects both** Planet and Umbra coverage (any date in 2024–2025). For those rows, **imagery_date** is a date range (e.g. `2024-01-01 to 2025-12-31`). Use [fire_planet_umbra_overlap.csv](../data/data_availability/fire_planet_umbra_overlap.csv):

1. Pick a fire (e.g. EATON, LAKE, MOUNTAIN, FRANKLIN).
2. In [CSDAP Explorer](https://csdap.earthdata.nasa.gov/explore/), search the fire’s **bbox** and a **date range** (e.g. one week or one month after the fire’s cont_date).
3. Confirm Planet and Umbra both return scenes; pick specific scene dates for your slide.
4. Use the same bbox and date in GEE for Landsat + Sentinel.

So it is **not** impossible to show a California story — you get a list of candidate fires and verify in CSDAP. If the strict check ever finds rows, those are ready-to-use; otherwise the candidate list is your starting point.
