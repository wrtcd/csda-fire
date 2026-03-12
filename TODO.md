## CSDA Fire Product – Priority TODOs

1. **Download 1 Planet scene for a California fire (PALISADES first)**  
   - Use the PALISADES bbox and post-fire window in the CSDAP Explorer, filter to Planet, and successfully download one post-fire scene.

2. **Record the Planet download in `study_area_tracker.csv`**  
   - Fill `planet_item_id` and `planet_date` (and, if useful, local path in `notes`) for PALISADES once the download succeeds.

3. **Request additional CSDA authorizations (ICEYE, Umbra, Satellogic)**  
   - Use `https://csdap.earthdata.nasa.gov/signup/` to request ICEYE, Umbra, and Satellogic access with justification tied to this fire-comparison work.

4. **Download 1–2 Umbra scenes for the same California fire (after authorization)**  
   - Once approved, repeat the PALISADES search for Umbra and download at least one post-fire scene; log IDs/dates in the tracker.

5. **Populate Landsat + Sentinel‑2 for the California case study**  
   - Use GEE (and/or Copernicus) to identify Landsat and Sentinel‑2 scenes for the chosen fire/date, and record their IDs/dates in `study_area_tracker.csv`.

6. **Identify and log CSDA coverage for Southeastern U.S. fires (including Alabama)**  
   - Search CSDAP for tiles/sites intersecting Southeastern fire locations; for each match, record Planet/Satellogic/Umbra/ICEYE item IDs and dates in a table or extended tracker.

7. **Select final examples and build the slide**  
   - Choose (a) the California fire/date to feature with Landsat + Sentinel‑2 (+ Planet + Umbra when available) and (b) any ICEYE‑vs‑Sentinel/Landsat examples from the Southeast, then assemble the final QGIS map and imagery panels into the PowerPoint slide.

