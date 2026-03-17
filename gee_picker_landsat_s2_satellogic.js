// GEE picker (RGB-only): given an AOI bbox + ALARM_DATE,
// pick 1 clear Landsat RGB + 1 clear Sentinel-2 RGB BEFORE,
// and 1 clear Landsat RGB + 1 clear Sentinel-2 RGB AFTER.
//
// How to use:
// 1) Paste AOI_BBOX + SAT_ACQ_ISO (and optional SAT_ITEM_ID) from:
//    data/data_availability/satellogic_postburn_best_gee.txt
// 2) Run. Toggle layers to visually confirm the post-burn scar.
//
// Notes:
// - Satellogic imagery itself is not in GEE (this script aligns Landsat/S2 around the same footprint/date).
// - This is meant for quick retrieval/verification, not a full burn severity workflow.

// =========================
// Inputs (edit these)
// =========================
var PLACE_LABEL = 'PASTE_PLACE_OR_FIRE_NAME'; // e.g. "Dragon Bravo (AZ)"
var ALARM_DATE = '2025-07-04'; // Fire alarm/discovery date (YYYY-MM-DD). PRE = before this, POST = after this.
var SAT_ITEM_ID = 'PASTE_SAT_ITEM_ID';
var SAT_ACQ_ISO = '2025-11-24T17:28:57Z'; // Satellogic acquisition datetime (UTC)
var AOI_BBOX = [-112.207725, 35.749920, -112.137619, 36.500074]; // [minLon, minLat, maxLon, maxLat]

// How far to search for a single clear PRE and POST image (relative to ALARM_DATE)
var PRE_LOOKBACK_DAYS = 45;   // search [ALARM_DATE - PRE_LOOKBACK_DAYS, ALARM_DATE - 1]
var POST_LOOKAHEAD_DAYS = 90; // search [ALARM_DATE + 1, ALARM_DATE + POST_LOOKAHEAD_DAYS]

// Cloud filters (metadata-based first; masks also applied for previews)
var LANDSAT_CLOUD_MAX = 25; // percent
var S2_CLOUD_MAX = 20;      // percent
var SHOW_TOP_N = 5;         // add top N candidates per sensor

// Visualization
var RGB_LANDSAT_MAX = 0.30; // reflectance range after scaling
var RGB_S2_MAX = 3000;      // DN range for S2 SR

// =========================
// Derived dates / geometry
// =========================
var aoi = ee.Geometry.Rectangle(AOI_BBOX, 'EPSG:4326', false);
var satDate = ee.Date(SAT_ACQ_ISO);
var alarm = ee.Date(ALARM_DATE);
var preStart = alarm.advance(-PRE_LOOKBACK_DAYS, 'day');
var preEnd = alarm.advance(-1, 'day');
var postStart = alarm.advance(1, 'day');
var postEnd = alarm.advance(POST_LOOKAHEAD_DAYS, 'day');

print('Place / label', PLACE_LABEL);
print('Satellogic item', SAT_ITEM_ID);
print('Satellogic acq (UTC)', SAT_ACQ_ISO);
print('Alarm date (UTC day)', ALARM_DATE);
print('AOI bbox', AOI_BBOX);
print('PRE search window', preStart.format('YYYY-MM-dd'), 'to', preEnd.format('YYYY-MM-dd'));
print('POST search window', postStart.format('YYYY-MM-dd'), 'to', postEnd.format('YYYY-MM-dd'));

// Nearest place name for quick reporting (best-effort; may be null in remote areas)
var pt = aoi.centroid(1);
print('AOI centroid lon/lat', pt.coordinates());
var nearestPlace = ee.FeatureCollection('TIGER/2018/Places')
  .filterBounds(pt.buffer(100000)) // 100 km
  .map(function(f) { return f.set('dist_m', f.geometry().distance(pt)); })
  .sort('dist_m')
  .first();
var state = ee.FeatureCollection('TIGER/2018/States').filterBounds(pt).first();
print('Nearest place (TIGER/2018/Places)', ee.Feature(nearestPlace).get('NAME'));
print('State (TIGER/2018/States)', ee.Feature(state).get('NAME'));

// =========================
// Landsat 8/9 C2 L2 helpers
// =========================
function lsScaleSR(img) {
  // Landsat C2 L2 SR scale/offset
  // https://developers.google.com/earth-engine/datasets/catalog/LANDSAT_LC08_C02_T1_L2
  return img.select(['SR_B2','SR_B3','SR_B4','SR_B5','SR_B7'])
    .multiply(0.0000275)
    .add(-0.2)
    .clamp(0, 1);
}

function lsMaskClouds(img) {
  // QA_PIXEL bits: cloud (bit 3), cloud shadow (bit 4), snow (bit 5)
  var qa = img.select('QA_PIXEL');
  var cloud = qa.bitwiseAnd(1 << 3).neq(0);
  var shadow = qa.bitwiseAnd(1 << 4).neq(0);
  var snow = qa.bitwiseAnd(1 << 5).neq(0);
  var mask = cloud.or(shadow).or(snow).not();
  return img.updateMask(mask);
}

// (No NBR/dNBR: RGB-only picker)

function getLandsatCol(start, end) {
  return ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
    .merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'))
    .filterBounds(aoi)
    .filterDate(start, end)
    .filter(ee.Filter.lte('CLOUD_COVER', LANDSAT_CLOUD_MAX))
    .sort('CLOUD_COVER');
}

// =========================
// Sentinel-2 SR helpers
// =========================
function s2MaskClouds(img) {
  // Use SCL to remove cloud/shadow/snow; keep vegetation/bare/charred.
  // SCL codes: 3=cloud shadow, 8=cloud medium prob, 9=cloud high prob, 10=thin cirrus, 11=snow/ice
  var scl = img.select('SCL');
  var bad = scl.eq(3).or(scl.eq(8)).or(scl.eq(9)).or(scl.eq(10)).or(scl.eq(11));
  return img.updateMask(bad.not());
}

// (No NBR/dNBR: RGB-only picker)

function getS2Col(start, end) {
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(aoi)
    .filterDate(start, end)
    .filter(ee.Filter.lte('CLOUDY_PIXEL_PERCENTAGE', S2_CLOUD_MAX))
    .sort('CLOUDY_PIXEL_PERCENTAGE');
}

// =========================
// Utility: add Top-N candidates
// =========================
function addTopNAsLayers(col, n, labelPrefix, viz, mapFn) {
  var list = col.toList(n);
  col.aggregate_array('system:time_start').evaluate(function(times) {
    if (!times || !times.length) return;
    for (var i = 0; i < Math.min(times.length, n); i++) {
      var d = new Date(times[i]);
      var dateStr = d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
      var img = ee.Image(list.get(i));
      Map.addLayer(mapFn(img), viz, labelPrefix + ' ' + dateStr, false);
    }
  });
}

function pickFirst(col) {
  return ee.Image(col.first());
}

function safeFirst(col) {
  col = ee.ImageCollection(col);
  var first = ee.Image(col.first());
  // If empty, return a constant masked image so downstream ops don't hard-fail.
  return ee.Image(ee.Algorithms.If(col.size().gt(0), first, ee.Image(0).updateMask(ee.Image(0))));
}

function fmtDate(img) {
  return ee.Date(img.get('system:time_start')).format('YYYY-MM-dd');
}

function printChosen(tag, img, idProp, cloudProp) {
  print(tag + ' date', fmtDate(img));
  print(tag + ' id', img.get(idProp));
  print(tag + ' cloud', img.get(cloudProp));
}

function addTimeDiffDays(col, refDate) {
  col = ee.ImageCollection(col);
  return col.map(function(img) {
    var d = ee.Date(img.get('system:time_start'));
    var diff = d.difference(refDate, 'day').abs();
    return img.set('timeDiffDays', diff);
  });
}

// =========================
// Build collections and choose ONE PRE and ONE POST
// =========================
// POST should be after ALARM_DATE. If SAT_ACQ_ISO is far after, we still pick a clear post-fire scene
// but we bias toward dates closer to Satellogic acquisition to better match the scar state.
var lsPreCol = getLandsatCol(preStart, preEnd);
var s2PreCol = getS2Col(preStart, preEnd);
var lsPostCol = getLandsatCol(postStart, postEnd);
var s2PostCol = getS2Col(postStart, postEnd);

lsPreCol = addTimeDiffDays(lsPreCol, alarm).sort('CLOUD_COVER').sort('timeDiffDays');
s2PreCol = addTimeDiffDays(s2PreCol, alarm).sort('CLOUDY_PIXEL_PERCENTAGE').sort('timeDiffDays');

lsPostCol = addTimeDiffDays(lsPostCol, satDate).sort('CLOUD_COVER').sort('timeDiffDays');
s2PostCol = addTimeDiffDays(s2PostCol, satDate).sort('CLOUDY_PIXEL_PERCENTAGE').sort('timeDiffDays');

print('Landsat PRE candidates', lsPreCol.size());
print('S2 PRE candidates', s2PreCol.size());
print('Landsat POST candidates', lsPostCol.size());
print('S2 POST candidates', s2PostCol.size());

// Optional: inspect a few candidates (off by default)
addTopNAsLayers(lsPreCol, SHOW_TOP_N, 'Landsat PRE RGB', {min: 0, max: RGB_LANDSAT_MAX}, function(img) {
  return lsScaleSR(lsMaskClouds(img)).select(['SR_B4','SR_B3','SR_B2']);
});

addTopNAsLayers(s2PreCol, SHOW_TOP_N, 'S2 PRE RGB', {min: 0, max: RGB_S2_MAX}, function(img) {
  return s2MaskClouds(img).select(['B4','B3','B2']);
});

addTopNAsLayers(lsPostCol, SHOW_TOP_N, 'Landsat POST RGB', {min: 0, max: RGB_LANDSAT_MAX}, function(img) {
  return lsScaleSR(lsMaskClouds(img)).select(['SR_B4','SR_B3','SR_B2']);
});

addTopNAsLayers(s2PostCol, SHOW_TOP_N, 'S2 POST RGB', {min: 0, max: RGB_S2_MAX}, function(img) {
  return s2MaskClouds(img).select(['B4','B3','B2']);
});

var lsPre = safeFirst(lsPreCol);
var s2Pre = safeFirst(s2PreCol);
var lsPost = safeFirst(lsPostCol);
var s2Post = safeFirst(s2PostCol);

print('--- Chosen PRE (before ALARM_DATE) ---');
printChosen('Landsat PRE', lsPre, 'LANDSAT_PRODUCT_ID', 'CLOUD_COVER');
printChosen('S2 PRE', s2Pre, 'PRODUCT_ID', 'CLOUDY_PIXEL_PERCENTAGE');

print('--- Chosen POST (after ALARM_DATE) ---');
printChosen('Landsat POST', lsPost, 'LANDSAT_PRODUCT_ID', 'CLOUD_COVER');
printChosen('S2 POST', s2Post, 'PRODUCT_ID', 'CLOUDY_PIXEL_PERCENTAGE');

// =========================
// Display exactly 4 RGB layers (1 per sensor per side)
// =========================
Map.addLayer(
  lsScaleSR(lsMaskClouds(lsPre)).select(['SR_B4','SR_B3','SR_B2']),
  {min: 0, max: RGB_LANDSAT_MAX},
  'Landsat PRE RGB (1)',
  true
);
Map.addLayer(
  s2MaskClouds(s2Pre).select(['B4','B3','B2']),
  {min: 0, max: RGB_S2_MAX},
  'S2 PRE RGB (1)',
  true
);
Map.addLayer(
  lsScaleSR(lsMaskClouds(lsPost)).select(['SR_B4','SR_B3','SR_B2']),
  {min: 0, max: RGB_LANDSAT_MAX},
  'Landsat POST RGB (1)',
  true
);
Map.addLayer(
  s2MaskClouds(s2Post).select(['B4','B3','B2']),
  {min: 0, max: RGB_S2_MAX},
  'S2 POST RGB (1)',
  true
);

Map.centerObject(aoi, 10);
Map.addLayer(aoi, {color: 'red'}, 'Satellogic footprint bbox');

// =========================
// Optional exports (toggle on if needed)
// =========================
// Uncomment to export chosen RGB quicklooks to Drive.
// function lsToByteRgb(img) {
//   return lsScaleSR(lsMaskClouds(img)).select(['SR_B4','SR_B3','SR_B2'])
//     .divide(RGB_LANDSAT_MAX).clamp(0, 1).multiply(255).toByte()
//     .rename(['red','green','blue']);
// }
// function s2ToByteRgb(img) {
//   return s2MaskClouds(img).select(['B4','B3','B2'])
//     .divide(RGB_S2_MAX).clamp(0, 1).multiply(255).toByte()
//     .rename(['red','green','blue']);
// }
// Export.image.toDrive({
//   image: lsToByteRgb(lsBest),
//   description: 'sat_picker_landsat_rgb_' + SAT_ITEM_ID,
//   folder: 'GEE_fire',
//   fileNamePrefix: 'sat_picker_landsat_rgb_' + SAT_ITEM_ID,
//   region: aoi,
//   scale: 30,
//   crs: 'EPSG:4326',
//   maxPixels: 1e13
// });
// Export.image.toDrive({
//   image: s2ToByteRgb(s2Best),
//   description: 'sat_picker_s2_rgb_' + SAT_ITEM_ID,
//   folder: 'GEE_fire',
//   fileNamePrefix: 'sat_picker_s2_rgb_' + SAT_ITEM_ID,
//   region: aoi,
//   scale: 10,
//   crs: 'EPSG:4326',
//   maxPixels: 1e13
// });

