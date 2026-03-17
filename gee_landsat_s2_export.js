// GEE: export Landsat and Sentinel-2 scenes for an AOI. Run in Code Editor.
// Preset below is set to DRAGON BRAVO (AZ) by default. You can swap AOI_BBOX + dates for any other fire.
// Tip (ICEYE verification): set AOI_BBOX to the ICEYE item bbox (or a slightly expanded bbox), then use
// PRE window before ignition and POST window after containment. Use dNBR layers below to verify burn scar.

var SCENE_LABEL = 'dragon_bravo';

// ========== AOI (Dragon Bravo Fire area; SW lon,lat / NE lon,lat) ==========
// Start with a moderate box around the North Rim. Tighten once you confirm the scar in the map.
var AOI_BBOX = [-112.12, 36.33, -111.93, 36.44];
var aoi = ee.Geometry.Rectangle(AOI_BBOX, 'EPSG:4326', false);

// ========== Cloud filtering ==========
// Tighten these if you still see too many candidates.
var LANDSAT_CLOUD_MAX = 20; // percent
var S2_CLOUD_MAX = 15;      // percent
var SHOW_TOP_N = 5;         // number of candidate layers to add for each stack

// ========== Date windows ==========
// Dragon Bravo burned Jul–Sep 2025. Use pre = early summer 2025, post = mid/late fall 2025.
var PRE_START = '2025-06-01';
var PRE_END = '2025-06-30';
var POST_START = '2025-10-01';
var POST_END = '2025-12-01';

function getLandsatCol(startDate, endDate) {
  // Landsat 8 + 9 Collection 2 L2 (adds resilience if L9 has gaps)
  return ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
    .merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'))
    .filterBounds(aoi)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lte('CLOUD_COVER', LANDSAT_CLOUD_MAX))
    .sort('CLOUD_COVER');
}

function getS2Col(startDate, endDate) {
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(aoi)
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lte('CLOUDY_PIXEL_PERCENTAGE', S2_CLOUD_MAX))
    .sort('CLOUDY_PIXEL_PERCENTAGE');
}

// Scale Landsat L2 reflectance: 0.0000275, offset -0.2
function scaleL2(img) {
  return img.select(['SR_B4', 'SR_B3', 'SR_B2']).multiply(0.0000275).add(-0.2).clamp(0, 1);
}

function landsatNBR(img) {
  // NBR = (NIR - SWIR2) / (NIR + SWIR2) using Landsat C2 L2 bands.
  var nir = img.select('SR_B5').multiply(0.0000275).add(-0.2);
  var swir2 = img.select('SR_B7').multiply(0.0000275).add(-0.2);
  return nir.subtract(swir2).divide(nir.add(swir2)).rename('NBR');
}

function s2NBR(img) {
  // NBR = (NIR - SWIR2) / (NIR + SWIR2) using Sentinel-2 SR bands.
  var nir = img.select('B8').multiply(0.0001);
  var swir2 = img.select('B12').multiply(0.0001);
  return nir.subtract(swir2).divide(nir.add(swir2)).rename('NBR');
}

function addTopNAsLayers(col, n, labelPrefix, viz, mapperFn) {
  var list = col.toList(n);
  col.aggregate_array('system:time_start').evaluate(function(times) {
    if (times && times.length) {
      for (var i = 0; i < Math.min(times.length, n); i++) {
        var d = new Date(times[i]);
        var dateStr = d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
        var img = ee.Image(list.get(i));
        Map.addLayer(mapperFn(img), viz, labelPrefix + ' ' + dateStr, false);
      }
    }
  });
}

function pickFirst(col) {
  return ee.Image(col.first());
}

// Collections for each window
var landsatPreCol = getLandsatCol(PRE_START, PRE_END);
var landsatPostCol = getLandsatCol(POST_START, POST_END);
var s2PreCol = getS2Col(PRE_START, PRE_END);
var s2PostCol = getS2Col(POST_START, POST_END);

print('AOI bbox (SW/NE)', AOI_BBOX);
print('PRE window', PRE_START, PRE_END);
print('POST window', POST_START, POST_END);
print('Cloud filters (max %)', { landsat: LANDSAT_CLOUD_MAX, s2: S2_CLOUD_MAX });

print('Landsat PRE count', landsatPreCol.size());
print('Landsat POST count', landsatPostCol.size());
print('S2 PRE count', s2PreCol.size());
print('S2 POST count', s2PostCol.size());

// Add top candidates (toggle on Map to pick visually if desired)
addTopNAsLayers(landsatPreCol, SHOW_TOP_N, 'Landsat PRE', { min: 0, max: 0.3 }, scaleL2);
addTopNAsLayers(landsatPostCol, SHOW_TOP_N, 'Landsat POST', { min: 0, max: 0.3 }, scaleL2);
addTopNAsLayers(s2PreCol, SHOW_TOP_N, 'S2 PRE', { min: 0, max: 3000 }, function(img) { return img.select(['B4','B3','B2']); });
addTopNAsLayers(s2PostCol, SHOW_TOP_N, 'S2 POST', { min: 0, max: 3000 }, function(img) { return img.select(['B4','B3','B2']); });

// Auto-pick the lowest-cloud scene in each window (first after sorting)
var landsatPreChosen = pickFirst(landsatPreCol);
var landsatPostChosen = pickFirst(landsatPostCol);
var s2PreChosen = pickFirst(s2PreCol);
var s2PostChosen = pickFirst(s2PostCol);

print('Chosen Landsat PRE product', landsatPreChosen.get('LANDSAT_PRODUCT_ID'));
print('Chosen Landsat POST product', landsatPostChosen.get('LANDSAT_PRODUCT_ID'));
print('Chosen S2 PRE product', s2PreChosen.get('PRODUCT_ID'));
print('Chosen S2 POST product', s2PostChosen.get('PRODUCT_ID'));

Map.addLayer(scaleL2(landsatPreChosen), { min: 0, max: 0.3 }, 'Chosen Landsat PRE', true);
Map.addLayer(scaleL2(landsatPostChosen), { min: 0, max: 0.3 }, 'Chosen Landsat POST', true);
Map.addLayer(s2PreChosen.select(['B4', 'B3', 'B2']), { min: 0, max: 3000 }, 'Chosen S2 PRE', false);
Map.addLayer(s2PostChosen.select(['B4', 'B3', 'B2']), { min: 0, max: 3000 }, 'Chosen S2 POST', true);

// Burn-scar verification: dNBR (pre - post). Higher values generally indicate burned areas.
var landsat_dNBR = landsatNBR(landsatPreChosen).subtract(landsatNBR(landsatPostChosen)).rename('dNBR');
var s2_dNBR = s2NBR(s2PreChosen).subtract(s2NBR(s2PostChosen)).rename('dNBR');

var dNBR_viz = { min: -0.1, max: 0.8, palette: ['#1a9850', '#91cf60', '#d9ef8b', '#fee08b', '#fc8d59', '#d73027'] };
Map.addLayer(landsat_dNBR, dNBR_viz, 'Landsat dNBR (PRE-POST)', true);
Map.addLayer(s2_dNBR, dNBR_viz, 'S2 dNBR (PRE-POST)', false);

Map.centerObject(aoi, 10);
Map.addLayer(aoi, { color: 'red' }, 'AOI');

// ========== Export: chosen scenes as visual RGB (matching map look) ==========
function landsatToByteRgb(img) {
  return scaleL2(img).divide(0.3).clamp(0, 1).multiply(255).toByte().rename(['red', 'green', 'blue']);
}

function s2ToByteRgb(img) {
  return img.select(['B4', 'B3', 'B2']).divide(3000).clamp(0, 1).multiply(255).toByte().rename(['red', 'green', 'blue']);
}

Export.image.toDrive({
  image: landsatToByteRgb(landsatPreChosen),
  description: SCENE_LABEL + '_Landsat_PRE_' + PRE_START + '_' + PRE_END,
  folder: 'GEE_fire',
  fileNamePrefix: SCENE_LABEL + '_landsat_pre_' + PRE_START + '_' + PRE_END,
  region: aoi,
  scale: 30,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});

Export.image.toDrive({
  image: landsatToByteRgb(landsatPostChosen),
  description: SCENE_LABEL + '_Landsat_POST_' + POST_START + '_' + POST_END,
  folder: 'GEE_fire',
  fileNamePrefix: SCENE_LABEL + '_landsat_post_' + POST_START + '_' + POST_END,
  region: aoi,
  scale: 30,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});

Export.image.toDrive({
  image: s2ToByteRgb(s2PreChosen),
  description: SCENE_LABEL + '_S2_PRE_' + PRE_START + '_' + PRE_END,
  folder: 'GEE_fire',
  fileNamePrefix: SCENE_LABEL + '_s2_pre_' + PRE_START + '_' + PRE_END,
  region: aoi,
  scale: 10,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});

Export.image.toDrive({
  image: s2ToByteRgb(s2PostChosen),
  description: SCENE_LABEL + '_S2_POST_' + POST_START + '_' + POST_END,
  folder: 'GEE_fire',
  fileNamePrefix: SCENE_LABEL + '_s2_post_' + POST_START + '_' + POST_END,
  region: aoi,
  scale: 10,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});
