# CSDAP & Data Discovery Notes

## CSDAP Satellite Data Explorer

- **URL**: [https://csdap.earthdata.nasa.gov/explore/](https://csdap.earthdata.nasa.gov/explore/)
- **User guide / Data Acquisition**: [https://csdap.earthdata.nasa.gov/user-guide/#data-acquisition-request-system](https://csdap.earthdata.nasa.gov/user-guide/#data-acquisition-request-system)

### Limitations (as of now)

- Map shows availability **by tile**, not by **image footprint** → hard to see exact spatial extent.
- Thumbnail and metadata (e.g. JSON) may be available when clicking an asset — use to confirm date and coverage.
- Copy **item ID to clipboard** and **toggle layer on map** to see which tiles overlap your fire; use this to infer overlap between sources.
- Download may require elevated credentials (waiting on boss).

### Workflow until you have download access

1. In **study_area_tracker.csv**: fix fire name, year, alarm_date, bbox from CAL FIRE (or from `candidate_fires_ranked.csv`).
2. In CSDAP: search by location (bbox) and date (post-fire; same or closest day).
3. For each source (Planet, Satellogic, Umbra, ICEYE): copy item ID to clipboard, toggle layer, note date; paste ID and date into tracker.
4. In GEE: same bbox/date → get Landsat scene ID → add to tracker.
5. Pick the fire/date row where all 5 sources have IDs and imagery looks good.

### Metadata / JSON

- If an asset has JSON or metadata export, use it to get:
  - Acquisition date/time
  - Footprint (bounds or geometry) to confirm overlap with fire perimeter
  - Scene ID for requests

---

## CAL FIRE Perimeters

- **Primary**: [California Fire Perimeters (all)](https://gis.data.ca.gov/datasets/CALFIRE-Forestry::california-fire-perimeters-all)
- **California Open Data**: [cal-fire dataset](https://data.ca.gov/dataset/cal-fire) (Shapefile, GeoJSON, etc.)

Put downloaded shapefile or GeoJSON in `data/calfire_perimeters/` and run `scripts/rank_fires.py` to get a ranked candidate list.
