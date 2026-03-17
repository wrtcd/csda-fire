// GEE: Eaton Fire (CA) — Landsat 8/9 + Sentinel-2 (RGB-only)
// Run in Google Earth Engine Code Editor (JavaScript).
//
// Goal:
// - Quickly inspect all POST candidates by toggling layers
// - No medians/composites
// - No exports locked in (we can add targeted exports after you pick)

// =========================
// Inputs (edit these)
// =========================
var PLACE_LABEL = 'Eaton Fire (CA)';
var ALARM_DATE = '2025-01-08'; // discovery/ignition date (UTC day)

// Date windows around ALARM_DATE.
var PRE_LOOKBACK_DAYS = 45;    // PRE: [ALARM_DATE - PRE_LOOKBACK_DAYS, ALARM_DATE - 1]
var POST_LOOKAHEAD_DAYS = 90;  // POST: [ALARM_DATE + 1, ALARM_DATE + POST_LOOKAHEAD_DAYS]
var POST_END_OVERRIDE = '';    // set e.g. '2025-03-01' (exclusive end handled below); '' disables override

// CAL FIRE perimeter source (provided by you)
var PERIMETERS_ASSET = 'projects/earthengine-441016/assets/California_Fire_Perimeters';
var PERIM_FIRE_NAME = 'Eaton';
var PERIM_YEAR = 2025;
var PERIM_BUFFER_M = 15000;

// If perimeter asset is slow/unavailable, set true and provide bbox.
// Format: [minLon, minLat, maxLon, maxLat] in EPSG:4326
var USE_FIXED_BBOX_INSTEAD_OF_PERIMETER = false;
var FIXED_BBOX_4326 = [-118.30, 34.10, -117.80, 34.50]; // TODO: update if you enable fixed bbox mode

// Output focus
var POST_ONLY = true;
var LIST_ALL_POST_CLOUDS = true;
var MAX_LIST = 300;
var MAP_ALL_POST_IMAGES = true;
var MAX_MAP_LAYERS = 120; // keep map responsive

// Coverage rules
var REQUIRE_FULL_AOI_COVERAGE_LANDSAT = true;
var REQUIRE_FULL_AOI_COVERAGE_S2 = false; // S2 granules often won't contain a big AOI bbox; default to intersects

// Cloud filters (metadata-based)
var LANDSAT_CLOUD_MAX_POST = 5; // percent
var S2_CLOUD_MAX_POST = 5;      // percent

// Pixel QA masks (holes are expected when true)
var APPLY_PIXEL_CLOUD_MASKS = true;

// =========================
// Perimeter + AOI
// =========================
var perim = null;
var perimGeom = null;
var aoi = null;

if (USE_FIXED_BBOX_INSTEAD_OF_PERIMETER) {
  perimGeom = ee.Geometry.Rectangle(FIXED_BBOX_4326, 'EPSG:4326', false);
  aoi = perimGeom;
} else {
  var perimFc = ee.FeatureCollection(PERIMETERS_ASSET)
    .filter(ee.Filter.eq('FIRE_NAME', PERIM_FIRE_NAME))
    .filter(ee.Filter.eq('YEAR_', PERIM_YEAR))
    .sort('GIS_ACRES', false);
  perim = ee.Feature(perimFc.first());
  perimGeom = perim.geometry();
  aoi = perimGeom.buffer(PERIM_BUFFER_M).bounds();
}

// =========================
// Dates
// =========================
var alarm = ee.Date(ALARM_DATE);
var preStart = alarm.advance(-PRE_LOOKBACK_DAYS, 'day');
var preEnd = alarm.advance(-1, 'day');
var postStart = alarm.advance(1, 'day');
var postEnd = ee.Date(ee.Algorithms.If(
  ee.String(POST_END_OVERRIDE).length().gt(0),
  POST_END_OVERRIDE,
  alarm.advance(POST_LOOKAHEAD_DAYS, 'day')
));

print('Place / label', PLACE_LABEL);
print('Alarm date (UTC day)', ALARM_DATE);
print('Perimeter asset', PERIMETERS_ASSET);
print('Perimeter match', 'FIRE_NAME=' + PERIM_FIRE_NAME, 'YEAR_=' + PERIM_YEAR);
print('PRE window', preStart.format('YYYY-MM-dd'), 'to', preEnd.format('YYYY-MM-dd'));
print('POST window', postStart.format('YYYY-MM-dd'), 'to', postEnd.format('YYYY-MM-dd'));

// =========================
// Landsat 8/9 C2 L2 helpers
// =========================
function lsScaleSR(img) {
  return img.select(['SR_B2','SR_B3','SR_B4','SR_B5','SR_B7'])
    .multiply(0.0000275)
    .add(-0.2)
    .clamp(0, 1);
}

function lsMaskClouds(img) {
  var qa = img.select('QA_PIXEL');
  // Keep simple: cloud(3) + shadow(4)
  var mask = qa.bitwiseAnd(1 << 3).eq(0)
    .and(qa.bitwiseAnd(1 << 4).eq(0));
  return img.updateMask(mask);
}

function getLandsatCol(start, end, cloudMax) {
  return ee.ImageCollection('LANDSAT/LC08/C02/T1_L2')
    .merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'))
    .filterBounds(perimGeom)
    .filterDate(start, end)
    .filter(ee.Filter.lte('CLOUD_COVER', cloudMax));
}

function lsRgb(img) {
  img = ee.Image(img);
  if (APPLY_PIXEL_CLOUD_MASKS) img = lsMaskClouds(img);
  var sr = lsScaleSR(img);
  return sr.select(['SR_B4','SR_B3','SR_B2']).rename(['R','G','B']);
}

// =========================
// Sentinel-2 SR helpers
// =========================
function s2MaskClouds(img) {
  // QA60 mask (cloud + cirrus)
  var qa = img.select('QA60');
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0).and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  return img.updateMask(mask);
}

function getS2Col(start, end, cloudMax) {
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(perimGeom)
    .filterDate(start, end)
    .filter(ee.Filter.lte('CLOUDY_PIXEL_PERCENTAGE', cloudMax));
}

function s2Rgb(img) {
  img = ee.Image(img);
  if (APPLY_PIXEL_CLOUD_MASKS) img = s2MaskClouds(img);
  return img.select(['B4','B3','B2']).divide(10000).clamp(0, 1).rename(['R','G','B']);
}

// =========================
// Coverage helpers
// =========================
var COVER_ERR = ee.ErrorMargin(100);
function requireFullCoverage(col, geom) {
  col = ee.ImageCollection(col);
  return col.map(function(img) {
    var full = img.geometry().contains(geom, COVER_ERR);
    return img.set('fullCover', full);
  }).filter(ee.Filter.eq('fullCover', true));
}

function requireIntersectCoverage(col, geom) {
  col = ee.ImageCollection(col);
  return col.map(function(img) {
    var ok = img.geometry().intersects(geom, COVER_ERR);
    return img.set('intersectsAOI', ok);
  }).filter(ee.Filter.eq('intersectsAOI', true));
}

// =========================
// Collections (POST)
// =========================
var lsPostCol = getLandsatCol(postStart, postEnd, LANDSAT_CLOUD_MAX_POST);
var s2PostCol = getS2Col(postStart, postEnd, S2_CLOUD_MAX_POST);

if (REQUIRE_FULL_AOI_COVERAGE_LANDSAT) {
  lsPostCol = requireFullCoverage(lsPostCol, aoi);
}
if (REQUIRE_FULL_AOI_COVERAGE_S2) {
  s2PostCol = requireFullCoverage(s2PostCol, aoi);
} else {
  s2PostCol = requireIntersectCoverage(s2PostCol, aoi);
}

print('Landsat POST count', lsPostCol.size());
print('Sentinel-2 POST count', s2PostCol.size());

function listPostClouds(col, cloudProp, extraProps, label) {
  col = ee.ImageCollection(col);
  var limited = col.sort(cloudProp).limit(MAX_LIST);
  var rows = limited.map(function(img) {
    var row = ee.Feature(null, {
      date: ee.Date(img.get('system:time_start')).format('YYYY-MM-dd'),
      cloud: img.get(cloudProp)
    });
    row = ee.Feature(extraProps.reduce(function(acc, p) {
      return ee.Feature(acc).set(p, img.get(p));
    }, row));
    return row;
  });
  print(label + ' (sorted by cloud, limited to ' + MAX_LIST + ')', rows);
}

if (LIST_ALL_POST_CLOUDS) {
  listPostClouds(lsPostCol, 'CLOUD_COVER', ['LANDSAT_PRODUCT_ID'], 'Landsat POST candidates');
  listPostClouds(s2PostCol, 'CLOUDY_PIXEL_PERCENTAGE', ['PRODUCT_ID'], 'Sentinel-2 POST candidates');
}

function fmtDate(img) {
  var t = img.get('system:time_start');
  return ee.String(ee.Algorithms.If(t, ee.Date(t).format('YYYY-MM-dd'), 'N/A'));
}

function safeGetString(img, prop) {
  var v = img.get(prop);
  return ee.String(ee.Algorithms.If(v, v, 'N/A'));
}

function addAllPostAsLayers(col, viz, makeRgbFn, labelPrefix, cloudProp, idProp) {
  col = ee.ImageCollection(col).sort(cloudProp).sort('system:time_start');
  print(labelPrefix + ' total (after filters)', col.size());

  var toAdd = col.limit(MAX_MAP_LAYERS);
  var list = toAdd.toList(MAX_MAP_LAYERS);

  ee.Number(toAdd.size()).evaluate(function(k) {
    if (!k || k <= 0) return;
    for (var i = 0; i < k; i++) {
      var img = ee.Image(list.get(i));
      var dateStr = fmtDate(img);
      var cloudStr = ee.Number(img.get(cloudProp)).format('%.2f');
      var idStr = safeGetString(img, idProp);
      var label = ee.String(labelPrefix)
        .cat(' ')
        .cat(dateStr)
        .cat(' | cloud=')
        .cat(cloudStr)
        .cat(' | ')
        .cat(idStr);
      (function(localImg, localLabel) {
        localLabel.evaluate(function(lbl) {
          Map.addLayer(makeRgbFn(localImg), viz, lbl, false);
        });
      })(img, label);
    }
  });
}

// =========================
// Map display
// =========================
Map.centerObject(perimGeom, 11);
Map.addLayer(aoi, {color: 'red'}, 'AOI', false);
if (!USE_FIXED_BBOX_INSTEAD_OF_PERIMETER) {
  Map.addLayer(perim.style({color: 'FF4D4D', fillColor: '00000000', width: 2}), {}, 'Fire perimeter', true);
}

var LS_VIZ = {min: 0, max: 0.30};
var S2_VIZ = {min: 0, max: 0.30};

if (MAP_ALL_POST_IMAGES) {
  addAllPostAsLayers(lsPostCol, LS_VIZ, lsRgb, 'Landsat POST', 'CLOUD_COVER', 'LANDSAT_PRODUCT_ID');
  addAllPostAsLayers(s2PostCol, S2_VIZ, s2Rgb, 'Sentinel-2 POST', 'CLOUDY_PIXEL_PERCENTAGE', 'PRODUCT_ID');
}

