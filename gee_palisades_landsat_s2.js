// GEE: export these two PALISADES scenes. Run in Code Editor; run tasks from the Tasks tab.

// ========== PALISADES AOI ==========
var PALISADES_BBOX = [-118.6859, 34.0298, -118.5006, 34.1294];
var aoi = ee.Geometry.Rectangle(PALISADES_BBOX, 'EPSG:4326', false);

// ========== Two scenes (by ID) ==========
var LANDSAT_SCENE_ID = 'LANDSAT/LC09/C02/T1_L2/LC09_041036_20250215';   // 2025-02-15
var S2_SCENE_ID = 'COPERNICUS/S2_SR_HARMONIZED/20250201T183631_20250201T184431_T11SLT';  // 2025-02-01

var exportL = ee.Image(LANDSAT_SCENE_ID);
var exportS2 = ee.Image(S2_SCENE_ID);

Map.centerObject(aoi, 10);
Map.addLayer(aoi, { color: 'red' }, 'PALISADES AOI');

// Scale Landsat L2 reflectance: 0.0000275, offset -0.2
function scaleL2(img) {
  return img.select(['SR_B4', 'SR_B3', 'SR_B2']).multiply(0.0000275).add(-0.2).clamp(0, 1);
}

Map.addLayer(scaleL2(exportL), { min: 0, max: 0.3 }, 'Landsat 2025-02-15', true);
Map.addLayer(exportS2.select(['B4', 'B3', 'B2']), { min: 0, max: 3000 }, 'S2 2025-02-01', true);

// ========== Export to Drive (full scene, visual stretch so QGIS looks like GEE) ==========
// No clip: export whole scene. Stretch: same as map (Landsat 0–0.3 reflectance, S2 0–3000) → 0–255 Byte.
var landsatRefl = scaleL2(exportL);
var landsatVisual = landsatRefl.divide(0.3).clamp(0, 1).multiply(255).toByte().rename(['red', 'green', 'blue']);
var s2Visual = exportS2.select(['B4', 'B3', 'B2']).divide(3000).clamp(0, 1).multiply(255).toByte().rename(['red', 'green', 'blue']);

var regionL = exportL.geometry();
var regionS2 = exportS2.geometry();

Export.image.toDrive({
  image: landsatVisual,
  description: 'Landsat_PALISADES_20250215_visual',
  folder: 'GEE_PALISADES',
  fileNamePrefix: 'landsat_palisades_LC09_20250215_visual',
  region: regionL,
  scale: 30,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});

Export.image.toDrive({
  image: s2Visual,
  description: 'S2_PALISADES_20250201_visual',
  folder: 'GEE_PALISADES',
  fileNamePrefix: 's2_palisades_20250201_T11SLT_visual',
  region: regionS2,
  scale: 10,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});
