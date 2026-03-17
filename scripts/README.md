# Scripts

## 1. Footprints (2024–2025)

**`csdap_planet_umbra_footprints.py`** — Fetches Planet, Umbra, ICEYE, Satellogic footprints over California from the CSDAP STAC API. **Pings the API for each collection’s temporal extent** (start/end dates) and uses those when available; otherwise uses fallback ranges. Writes **`collection_temporal_extent.json`** (dates per collection) and GeoJSON + CSV under `data/data_availability/`.

Run: `pip install pystac-client` then `python scripts/csdap_planet_umbra_footprints.py`

## 2. Overlap table

**`fire_planet_umbra_overlap.py`** — CAL FIRE fires that **spatially and temporally** coincide with Planet and Umbra (same place, within ±7 days). Writes `fire_planet_umbra_overlap.csv` (fire_name, alarm_date, cont_date, imagery_date, bbox).

Run after step 1: `python scripts/fire_planet_umbra_overlap.py`

## 3. Rank and list dates

**`rank_fire_planet_umbra.py`** — Ranks fires by Planet/Umbra scene counts; optionally lists imagery dates.

- `python scripts/rank_fire_planet_umbra.py` — rank only (writes `fire_planet_umbra_ranked.csv`, `fire_planet_umbra_top10.csv`)
- `python scripts/rank_fire_planet_umbra.py --list-dates` — rank + list dates for top 10 (also writes `fire_planet_umbra_ranked_with_dates.csv`)
- `python scripts/rank_fire_planet_umbra.py --fire EATON --alarm 2025-01-08` — list dates for one fire

See `docs/FIND_PLANET_UMBRA_FIRE.md` for the full workflow.
