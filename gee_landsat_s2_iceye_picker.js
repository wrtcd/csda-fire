// GEE: Landsat + Sentinel-2 "post-burn picker" to verify an ICEYE scene.
// Run in Google Earth Engine Code Editor.
//
// What you provide:
// - ICEYE_ITEM_ID: for labeling (optional; paste from CSDAP STAC)
// - ICEYE_DATETIME_UTC: the ICEYE acquisition time (UTC)
// - ICEYE_BBOX: the ICEYE item bbox [W,S,E,N] in EPSG:4326
//
// What it does (simple RGB-only):
// - You provide an event/alarm datetime and bbox
// - It finds 1 clear RGB Landsat + 1 clear RGB Sentinel-2 BEFORE the event
// - It finds 1 clear RGB Landsat + 1 clear RGB Sentinel-2 AFTER the event
// - It prints bbox/place/date/IDs in the Console and adds 4 RGB layers

// =========================
// User inputs (edit these)
// =========================
var ICEYE_ITEM_ID = 'ICEYE_X7_SLC_SM_3563434_20240317T193449';
// Treat this as the alarm/event split time (before vs after).
var ALARM_DATETIME_UTC = '2024-03-17T19:34:49Z';
var ICEYE_BBOX = [-100.98457503171919, 35.56934433414841, -100.34328445017006, 36.2560560906972];

// Search window sizes around alarm/event split (days)
var PRE_DAYS = 30;   // search back this many days
var POST_DAYS = 30;  // search forward this many days

// Candidate limits / filters
var SHOW_TOP_N = 5;
var LANDSAT_MAX_CLOUD = 40; // percent (metadata CLOUD_COVER)
var S2_MAX_CLOUD = 40;      // percent (metadata CLOUDY_PIXEL_PERCENTAGE)

// =========================
// AOI + time windows
// =========================
var aoi = ee.Geometry.Rectangle(ICEYE_BBOX, 'EPSG:4326', false);
var alarmTime = ee.Date(ALARM_DATETIME_UTC);
var preStart = alarmTime.advance(-PRE_DAYS, 'day');
var preEnd = alarmTime; // exclusive is fine
var postStart = alarmTime;
var postEnd = alarmTime.advance(POST_DAYS, 'day');

print('ICEYE item', ICEYE_ITEM_ID);
print('Alarm/event datetime (UTC)', ALARM_DATETIME_UTC);
print('AOI bbox', ICEYE_BBOX);
print('PRE window', preStart, preEnd);
print('POST window', postStart, postEnd);

// =========================
// AOI description (place name)
// =========================
var pt = aoi.centroid(1);
var ptLonLat = ee.List(pt.coordinates());
var places = ee.FeatureCollection('TIGER/2018/Places')
  .filterBounds(pt.buffer(100000)); // 100 km search radius
var nearestPlace = ee.Feature(places.map(function(f) {
  return f.set('dist_m', f.geometry().distance(pt));
}).sort('dist_m').first());

var states = ee.FeatureCollection('TIGER/2018/States').filterBounds(pt);
var state = ee.Feature(states.first());

print('AOI centroid lon/lat', ptLonLat);
print('Nearest place (TIGER/2018/Places)', nearestPlace.get('NAME'));
print('State (TIGER/2018/States)', state.get('NAME'));

// =========================
// Landsat helpers
// =========================
function lsScale(img, bandName) {
  // Landsat Collection 2 L2 SR scale/offset
  return img.select(bandName).multiply(0.0000275).add(-0.2);
}

function lsRgb(img) {
  return ee.Image.cat([lsScale(img, 'SR_B4'), lsScale(img, 'SR_B3'), lsScale(img, 'SR_B2')])
    .clamp(0, 1)
    .rename(['R', 'G', 'B']);
}

function lsMaskClouds(img) {
  // QA_PIXEL bits: cloud(3), cloud shadow(4), snow(5), dilated cloud(1)
  var qa = img.select('QA_PIXEL');
  var mask = qa.bitwiseAnd(1 << 3).eq(0)
    .and(qa.bitwiseAnd(1 << 4).eq(0))
    .and(qa.bitwiseAnd(1 << 5).eq(0))
    .and(qa.bitwiseAnd(1 << 1).eq(0));
  return img.updateMask(mask);
}

function landsatCol(start, end) {
  return ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
    .merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'))
    .filterBounds(aoi)
    .filterDate(start, end)
    .filter(ee.Filter.lte('CLOUD_COVER', LANDSAT_MAX_CLOUD));
}

// =========================
// Sentinel-2 helpers
// =========================
function s2Rgb(img) {
  // S2 SR is scaled by 1e4
  return img.select(['B4', 'B3', 'B2']).divide(3000).clamp(0, 1).rename(['R', 'G', 'B']);
}

function s2MaskClouds(img) {
  // Simple QA60 mask: bits 10 & 11 are clouds/cirrus
  var qa = img.select('QA60');
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0).and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  return img.updateMask(mask);
}

function s2Col(start, end) {
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(aoi)
    .filterDate(start, end)
    .filter(ee.Filter.lte('CLOUDY_PIXEL_PERCENTAGE', S2_MAX_CLOUD));
}

// =========================
// Pick 1 clear PRE and 1 clear POST per sensor (RGB only)
// =========================
function pickBestRgb(col, cloudProp, isPre) {
  // isPre: true => closest BEFORE alarm (smaller positive days_before), then lowest cloud
  //        false => closest AFTER alarm (smaller positive days_after), then lowest cloud
  var scored = col.map(function(img) {
    var dt = ee.Date(img.get('system:time_start'));
    var dayDelta = ee.Number(dt.difference(alarmTime, 'day')); // negative pre, positive post
    var metric = ee.Number(
      ee.Algorithms.If(isPre, dayDelta.multiply(-1), dayDelta)
    ); // positive distance from alarm on correct side
    var cloud = ee.Number(img.get(cloudProp));
    // Lower is better: prioritize cloud, then closeness to alarm.
    var score = cloud.multiply(1000).add(metric);
    return img.set({'side_metric_days': metric, 'rgb_pick_score': score});
  }).sort('rgb_pick_score');
  return ee.Image(scored.first());
}

var lsPreCol = landsatCol(preStart, preEnd);
var lsPostCol = landsatCol(postStart, postEnd);
var s2PreCol = s2Col(preStart, preEnd);
var s2PostCol = s2Col(postStart, postEnd);

print('Landsat PRE count', lsPreCol.size());
print('Landsat POST count', lsPostCol.size());
print('S2 PRE count', s2PreCol.size());
print('S2 POST count', s2PostCol.size());

var lsPreChosen = pickBestRgb(lsPreCol, 'CLOUD_COVER', true);
var lsPostChosen = pickBestRgb(lsPostCol, 'CLOUD_COVER', false);
var s2PreChosen = pickBestRgb(s2PreCol, 'CLOUDY_PIXEL_PERCENTAGE', true);
var s2PostChosen = pickBestRgb(s2PostCol, 'CLOUDY_PIXEL_PERCENTAGE', false);

print('--- Chosen PRE scenes (1 each) ---');
print('Landsat PRE product', lsPreChosen.get('LANDSAT_PRODUCT_ID'));
print('Landsat PRE time', ee.Date(lsPreChosen.get('system:time_start')));
print('Landsat PRE cloud', lsPreChosen.get('CLOUD_COVER'));
print('S2 PRE product', s2PreChosen.get('PRODUCT_ID'));
print('S2 PRE time', ee.Date(s2PreChosen.get('system:time_start')));
print('S2 PRE cloud', s2PreChosen.get('CLOUDY_PIXEL_PERCENTAGE'));

print('--- Chosen POST scenes (1 each) ---');
print('Landsat POST product', lsPostChosen.get('LANDSAT_PRODUCT_ID'));
print('Landsat POST time', ee.Date(lsPostChosen.get('system:time_start')));
print('Landsat POST cloud', lsPostChosen.get('CLOUD_COVER'));
print('S2 POST product', s2PostChosen.get('PRODUCT_ID'));
print('S2 POST time', ee.Date(s2PostChosen.get('system:time_start')));
print('S2 POST cloud', s2PostChosen.get('CLOUDY_PIXEL_PERCENTAGE'));

// =========================
// Visualize
// =========================
Map.centerObject(aoi, 10);
Map.addLayer(aoi, {color: 'red'}, 'ICEYE AOI');

var rgbViz = {min: 0, max: 0.35};
Map.addLayer(lsRgb(lsMaskClouds(lsPreChosen)), rgbViz, 'Landsat PRE RGB (1)', true);
Map.addLayer(s2Rgb(s2MaskClouds(s2PreChosen)), rgbViz, 'S2 PRE RGB (1)', true);
Map.addLayer(lsRgb(lsMaskClouds(lsPostChosen)), rgbViz, 'Landsat POST RGB (1)', true);
Map.addLayer(s2Rgb(s2MaskClouds(s2PostChosen)), rgbViz, 'S2 POST RGB (1)', true);

// Also add top-N candidates (off by default)
function addTopN(col, n, toRgb, labelPrefix) {
  var list = col.toList(n);
  ee.List.sequence(0, n - 1).evaluate(function(ixs) {
    ixs.forEach(function(i) {
      var img = ee.Image(list.get(i));
      var t = ee.Date(img.get('system:time_start'));
      var label = labelPrefix + ' #' + (i + 1);
      Map.addLayer(toRgb(img), rgbViz, label, false);
    });
  });
}

addTopN(lsPostCol, SHOW_TOP_N, function(img) { return lsRgb(img); }, 'Landsat POST candidate');
addTopN(s2PostCol, SHOW_TOP_N, function(img) { return s2Rgb(img); }, 'S2 POST candidate');

// =========================
// Optional export (chosen only)
// =========================
// Uncomment if you want immediate Drive exports.
/*
Export.image.toDrive({
  image: lsRgb(lsChosen).multiply(255).toByte(),
  description: ICEYE_ITEM_ID + '_landsat_post_rgb',
  folder: 'GEE_fire',
  fileNamePrefix: ICEYE_ITEM_ID + '_landsat_post_rgb',
  region: aoi,
  scale: 30,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});

Export.image.toDrive({
  image: s2Rgb(s2Chosen).multiply(255).toByte(),
  description: ICEYE_ITEM_ID + '_s2_post_rgb',
  folder: 'GEE_fire',
  fileNamePrefix: ICEYE_ITEM_ID + '_s2_post_rgb',
  region: aoi,
  scale: 10,
  crs: 'EPSG:4326',
  maxPixels: 1e13
});
*/

