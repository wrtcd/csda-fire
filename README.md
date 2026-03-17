# CSDA Fire Product

**Goal:** One slide — fire perimeter + post-fire imagery. **Slide priority:** 6 (all) > 5 (e.g. Planet+Umbra+ICEYE+Landsat+Sentinel) > 4 (Planet+Umbra+Landsat+Sentinel). Landsat and Sentinel always available; Satellogic intersection may not be possible; Planet+Umbra+ICEYE OK; else Planet+Umbra OK. Footprints script fetches each collection’s start/end dates from the CSDAP STAC API and writes `collection_temporal_extent.json`.

- **[OVERVIEW.md](OVERVIEW.md)** — goal, CSDA temporal coverage, and plan
- **[TODO.md](TODO.md)** — next steps (California slide checklist)
- **`docs/FIND_PLANET_UMBRA_FIRE.md`** — how to find Planet + CAL FIRE + Umbra intersection (QGIS + candidate list)
- **`data/data_availability/`** — Planet/Umbra (and ICEYE/Satellogic) footprints and **`fire_planet_umbra_overlap.csv`** = CAL FIRE fires with Planet+Umbra in same place and time (2024–2025)
- **Scripts:** `scripts/csdap_planet_umbra_footprints.py` (fetch footprints); `scripts/fire_planet_umbra_overlap.py` (overlap table); `scripts/rank_fire_planet_umbra.py` (rank fires, optional `--list-dates` or `--fire NAME --alarm DATE`)
- **GEE:** Adapt `gee_landsat_s2_export.js` for your fire’s bbox/date.
- **GEE picker (Satellogic-aligned):** Use `gee_picker_landsat_s2_satellogic.js` to paste a **CSDA Satellogic bbox + acquisition time** and auto-pick the best **Landsat + Sentinel-2** scenes around it for quick post-burn verification.
