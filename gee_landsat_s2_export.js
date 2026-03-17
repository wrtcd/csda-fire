// GEE: export Landsat and Sentinel-2 scenes for a fire AOI. Run in Code Editor; run tasks from the Tasks tab.
// PALISADES fire: alarm 2025-01-07, cont 2025-01-31. Search post-fire window.

// ========== PALISADES Fire AOI ==========
var FIRE_BBOX = [-118.6859, 34.0298, -118.5006, 34.1294];  // SW long,lat / NE long,lat
var aoi = ee.Geometry.Rectangle(FIRE_BBOX, 'EPSG:4326', false);

// ========== Date range (Jan 10–20, 2025) ==========
var START_DATE = '2025-01-10';
var END_DATE = '2025-01-20';

// ========== Search Landsat 9 L2 ==========
var landsatCol = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
  .filterBounds(aoi)
  .filterDate(START_DATE, END_DATE)
  .sort('CLOUD_COVER');
var landsatList = landsatCol.toList(20);

// ========== Search Sentinel-2 ==========
var s2Col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterBounds(aoi)
  .filterDate(START_DATE, END_DATE)
  .sort('CLOUDY_PIXEL_PERCENTAGE');
var s2List = s2Col.toList(20);

print('Landsat scene count', landsatCol.size());
print('S2 scene count', s2Col.size());

// Image IDs in same order as map layers (index 0 = first layer, etc.)
print('Landsat product IDs (order = map layer order)', landsatCol.aggregate_array('LANDSAT_PRODUCT_ID'));
print('S2 product IDs (order = map layer order)', s2Col.aggregate_array('PRODUCT_ID'));

// Scale Landsat L2 reflectance: 0.0000275, offset -0.2
function scaleL2(img) {
  return img.select(['SR_B4', 'SR_B3', 'SR_B2']).multiply(0.0000275).add(-0.2).clamp(0, 1);
}

// ========== Add each scene as a layer with date in name (toggle in map to choose) ==========
// Layer order matches the printed product ID lists (index 0 = first layer).
landsatCol.aggregate_array('system:time_start').evaluate(function(landsatTimes) {
  if (landsatTimes && landsatTimes.length) {
    for (var i = 0; i < landsatTimes.length; i++) {
      var d = new Date(landsatTimes[i]);
      var dateStr = d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
      var img = ee.Image(landsatList.get(i));
      Map.addLayer(scaleL2(img), { min: 0, max: 0.3 }, 'Landsat ' + dateStr, false);
    }
  }
});

s2Col.aggregate_array('system:time_start').evaluate(function(s2Times) {
  if (s2Times && s2Times.length) {
    for (var i = 0; i < s2Times.length; i++) {
      var d = new Date(s2Times[i]);
      var dateStr = d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
      var img = ee.Image(s2List.get(i));
      Map.addLayer(img.select(['B4', 'B3', 'B2']), { min: 0, max: 3000 }, 'S2 ' + dateStr, false);
    }
  }
});

// ========== Explicitly add just the chosen Landsat + Sentinel-2 scenes ==========
var landsatChosen = landsatCol
  .filter(ee.Filter.eq('LANDSAT_PRODUCT_ID', 'LC09_L2SP_041036_20250114_20250115_02_T1'))
  .first();
Map.addLayer(
  scaleL2(landsatChosen),
  { min: 0, max: 0.3 },
  'Landsat LC09_L2SP_041036_20250114_20250115_02_T1',
  true
);

var s2Chosen = s2Col
  .filter(ee.Filter.eq('PRODUCT_ID', 'S2A_MSIL2A_20250112T183731_N0511_R027_T11SLT_20250112T222951'))
  .first();
Map.addLayer(
  s2Chosen.select(['B4', 'B3', 'B2']),
  { min: 0, max: 3000 },
  'S2 S2A_MSIL2A_20250112T183731_N0511_R027_T11SLT_20250112T222951',
  true
);

Map.centerObject(aoi, 10);
Map.addLayer(aoi, { color: 'red' }, 'Fire AOI');

// ========== Export: chosen Landsat + Sentinel-2 scenes as visual RGB (matching map look) ==========
var exportL = landsatChosen;
var exportS2 = s2Chosen;
var landsatVisual = scaleL2(exportL).divide(0.3).clamp(0, 1).multiply(255).toByte().rename(['red', 'green', 'blue']);
var s2Visual = exportS2.select(['B4', 'B3', 'B2']).divide(3000).clamp(0, 1).multiply(255).toByte().rename(['red', 'green', 'blue']);

Export.image.toDrive({
  image: landsatVisual,
  description: 'Landsat_visual_2025-01-14_LC09_L2SP_041036_20250114',
  folder: 'GEE_fire',
  fileNamePrefix: 'landsat_visual_2025-01-14_LC09_L2SP_041036_20250114',
  region: exportL.geometry(),
  scale: 30,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});

Export.image.toDrive({
  image: s2Visual,
  description: 'S2_visual_2025-01-12_T11SLT_20250112',
  folder: 'GEE_fire',
  fileNamePrefix: 's2_visual_2025-01-12_T11SLT_20250112',
  region: exportS2.geometry(),
  scale: 10,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});
