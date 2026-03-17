// GEE: export Landsat and Sentinel-2 scenes for a fire AOI. Run in Code Editor; run tasks from the Tasks tab.
// Set FIRE_BBOX from your fire's bbox (min_lon, min_lat, max_lon, max_lat). Set scene IDs or search by date.

// ========== Fire AOI (set from fire_planet_umbra_overlap.csv or ranked CSV) ==========
var FIRE_BBOX = [-118.6859, 34.0298, -118.5006, 34.1294];  // min_lon, min_lat, max_lon, max_lat
var aoi = ee.Geometry.Rectangle(FIRE_BBOX, 'EPSG:4326', false);

// ========== Two scenes (set by ID or replace with date search) ==========
var LANDSAT_SCENE_ID = 'LANDSAT/LC09/C02/T1_L2/LC09_041036_20250215';   // e.g. 2025-02-15
var S2_SCENE_ID = 'COPERNICUS/S2_SR_HARMONIZED/20250201T183631_20250201T184431_T11SLT';  // e.g. 2025-02-01

var exportL = ee.Image(LANDSAT_SCENE_ID);
var exportS2 = ee.Image(S2_SCENE_ID);

Map.centerObject(aoi, 10);
Map.addLayer(aoi, { color: 'red' }, 'Fire AOI');

// Scale Landsat L2 reflectance: 0.0000275, offset -0.2
function scaleL2(img) {
  return img.select(['SR_B4', 'SR_B3', 'SR_B2']).multiply(0.0000275).add(-0.2).clamp(0, 1);
}

Map.addLayer(scaleL2(exportL), { min: 0, max: 0.3 }, 'Landsat', true);
Map.addLayer(exportS2.select(['B4', 'B3', 'B2']), { min: 0, max: 3000 }, 'S2', true);

// ========== Export to Drive (full scene, visual stretch for QGIS) ==========
var landsatRefl = scaleL2(exportL);
var landsatVisual = landsatRefl.divide(0.3).clamp(0, 1).multiply(255).toByte().rename(['red', 'green', 'blue']);
var s2Visual = exportS2.select(['B4', 'B3', 'B2']).divide(3000).clamp(0, 1).multiply(255).toByte().rename(['red', 'green', 'blue']);

var regionL = exportL.geometry();
var regionS2 = exportS2.geometry();

Export.image.toDrive({
  image: landsatVisual,
  description: 'Landsat_fire_visual',
  folder: 'GEE_fire',
  fileNamePrefix: 'landsat_LC09_visual',
  region: regionL,
  scale: 30,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});

Export.image.toDrive({
  image: s2Visual,
  description: 'S2_fire_visual',
  folder: 'GEE_fire',
  fileNamePrefix: 's2_visual',
  region: regionS2,
  scale: 10,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});
