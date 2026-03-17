// GEE: Park Fire (CA) quick visualization — Landsat 8/9 + Sentinel-2
// Run in Google Earth Engine Code Editor (JavaScript).
//
// Output:
// - Pick 1 best PRE + 1 best POST scene for Landsat and Sentinel-2
// - True color (RGB) only
//
// Notes:
// - Perimeter is optional: if you have a perimeter FeatureCollection asset, paste it into PERIMETER_FC.
// - AOI is a conservative bbox around the Park Fire area; adjust if you want tighter framing.

// =========================
// Inputs (edit these)
// =========================
var PLACE_LABEL = 'Park Fire (CA)';

// Fire discovery/ignition date (UTC day). Used as PRE/POST split.
// Park Fire ignition is commonly cited as 2024-07-24 (local). Keep this as YYYY-MM-DD.
var ALARM_DATE = '2024-07-24';

// Date windows (days) to search around ALARM_DATE.
var PRE_LOOKBACK_DAYS = 45;    // PRE: [ALARM_DATE - PRE_LOOKBACK_DAYS, ALARM_DATE - 1]
var POST_LOOKAHEAD_DAYS = 90; // POST: [ALARM_DATE + 1, ALARM_DATE + POST_LOOKAHEAD_DAYS]
// End date is exclusive in filterDate; set to next day to include 2024-08-16.
var POST_END_OVERRIDE = '2024-08-17'; // set '' to disable and use POST_LOOKAHEAD_DAYS

// CAL FIRE perimeter source (provided by you)
var PERIMETERS_ASSET = 'projects/earthengine-441016/assets/California_Fire_Perimeters';

// Pick the perimeter record (update if needed)
var PERIM_FIRE_NAME = 'Park';
var PERIM_YEAR = 2024;

// If CAL FIRE asset upload is slow/unavailable, set this true to use a fixed bbox AOI instead.
// This bbox was derived from `powerpoint/shapefile/calfire.geojson` feature FIRE_NAME=PARK, YEAR_=2024.
// Format: [minLon, minLat, maxLon, maxLat] in EPSG:4326
var USE_FIXED_BBOX_INSTEAD_OF_PERIMETER = true;
var FIXED_BBOX_4326 = [-122.06409013345086, 39.77097499992151, -121.49483900726958, 40.39459980151912];

// Optional debug/info lookup (some GEE accounts no longer have TIGER/2016 assets)
var ENABLE_TIGER_PLACE_LOOKUP = false;

// Ensure selected scenes fully cover the AOI (recommended for clean exports)
var REQUIRE_FULL_AOI_COVERAGE = true;
// Sentinel-2 granules often won't "contain" a big AOI bbox; for S2, prefer intersects.
var REQUIRE_FULL_AOI_COVERAGE_S2 = false;

// (Disabled) median composites
var USE_MEDIAN_COMPOSITES = false;
var COMPOSITE_DAYS_PRE = 20;  // days ending at ALARM_DATE (exclusive)
var COMPOSITE_DAYS_POST = 30; // days starting at ALARM_DATE (inclusive-ish)

// Output focus
var POST_ONLY = true;
var LIST_ALL_POST_CLOUDS = true;
var MAX_LIST = 300; // cap printing to avoid huge console payloads
var MAP_ALL_POST_IMAGES = true;
var MAX_MAP_LAYERS = 80; // keep the map responsive

// Holes come from QA masks even when scene cloud% is low.
// Set false for "no holes" quicklooks (clouds will remain visible).
var APPLY_PIXEL_CLOUD_MASKS = true;

// Optional: expand view a bit beyond perimeter for nicer framing (meters)
var PERIM_BUFFER_M = 15000;

// Cloud filters (metadata-based); masks are applied for visualization.
// For clean figure-quality outputs, keep POST very strict.
var LANDSAT_CLOUD_MAX_PRE = 10;  // percent
var LANDSAT_CLOUD_MAX_POST = 5; // percent
var S2_CLOUD_MAX_PRE = 10;       // percent
var S2_CLOUD_MAX_POST = 5;      // percent

// How many candidates to add as optional layers (off by default)
var SHOW_TOP_N = 0;

// Visualization tuning
// For publication-style rendering, prefer AOI-based percentile stretch + gamma (below),
// rather than fixed min/max. Fixed max values are kept as fallback.
var LS_RGB_MAX = 0.30; // reflectance (after scaling) fallback
var S2_RGB_MAX = 3000; // Sentinel-2 SR DN fallback

// "Journal look" render controls (AOI-based)
var STRETCH_PCT_LOW = 2;
var STRETCH_PCT_HIGH = 98;
var RGB_GAMMA = 1.08;

// Export controls (optional; exports rendered 8-bit RGB)
var EXPORT_FOLDER = 'GEE_fire';
var EXPORT_PREFIX = 'park_fire';
var EXPORT_CRS = 'EPSG:3857'; // good for figures; switch to UTM if you prefer
var EXPORT_SCALE_LS = 30;
var EXPORT_SCALE_S2 = 10;

// =========================
// Derived dates / geometry
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
  // Note: if the asset is missing or filter returns 0 features, perim will be null and you'll get errors.
  // In that case, switch USE_FIXED_BBOX_INSTEAD_OF_PERIMETER to true.
  perim = ee.Feature(perimFc.first());
  perimGeom = perim.geometry();
  // Use perimeter bounds (+ buffer) as the viewing AOI.
  aoi = perimGeom.buffer(PERIM_BUFFER_M).bounds();
}

function geomToBbox4326(geom) {
  var b = geom.bounds(1, ee.Projection('EPSG:4326'));
  var ring = ee.List(b.coordinates().get(0));
  var xs = ring.map(function(c) { return ee.Number(ee.List(c).get(0)); });
  var ys = ring.map(function(c) { return ee.Number(ee.List(c).get(1)); });
  var minX = ee.Number(xs.reduce(ee.Reducer.min()));
  var maxX = ee.Number(xs.reduce(ee.Reducer.max()));
  var minY = ee.Number(ys.reduce(ee.Reducer.min()));
  var maxY = ee.Number(ys.reduce(ee.Reducer.max()));
  return ee.List([minX, minY, maxX, maxY]);
}
var AOI_BBOX_4326 = geomToBbox4326(aoi);

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
print('Using fixed bbox instead of perimeter?', USE_FIXED_BBOX_INSTEAD_OF_PERIMETER);
print('Fixed bbox (EPSG:4326)', FIXED_BBOX_4326);
print('AOI bbox [W,S,E,N] (EPSG:4326)', AOI_BBOX_4326);
// Avoid touching perimeter properties (can hard-fail when perimeter is null).
print('PRE window', preStart.format('YYYY-MM-dd'), 'to', preEnd.format('YYYY-MM-dd'));
print('POST window', postStart.format('YYYY-MM-dd'), 'to', postEnd.format('YYYY-MM-dd'));

// AOI centroid (place/state lookup is optional and may change across EE catalog versions).
var pt = aoi.centroid(1);
print('AOI centroid lon/lat', pt.coordinates());

// Best-effort nearest place + state name (won't block the script if TIGER vintages change).
// If you ever see a "not found" error again, you can comment this whole block out safely.
if (ENABLE_TIGER_PLACE_LOOKUP) {
  var nearestPlace = ee.FeatureCollection('TIGER/2018/Places')
    .filterBounds(pt.buffer(150000)) // 150 km
    .map(function(f) { return f.set('dist_m', f.geometry().distance(pt)); })
    .sort('dist_m')
    .first();
  var state = ee.FeatureCollection('TIGER/2018/States')
    .filterBounds(pt)
    .first();
  print('Nearest place (TIGER/2018/Places)', ee.Feature(nearestPlace).get('NAME'));
  print('State (TIGER/2018/States)', ee.Feature(state).get('NAME'));
}

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
  // Keep simple: only mask definite cloud + cloud shadow (less "holey" than aggressive masking)
  // QA_PIXEL bits: cloud (3), cloud shadow (4)
  var qa = img.select('QA_PIXEL');
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
  // Keep simple: QA60 mask (cloud + cirrus)
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
  // Scale to reflectance-ish 0-1 range
  img = ee.Image(img);
  if (APPLY_PIXEL_CLOUD_MASKS) img = s2MaskClouds(img);
  return img.select(['B4','B3','B2']).divide(10000).clamp(0, 1).rename(['R','G','B']);
}

// =========================
// Picker helpers (simple)
// =========================
function safeFirst(col) {
  col = ee.ImageCollection(col);
  var first = ee.Image(col.first());
  return ee.Image(ee.Algorithms.If(col.size().gt(0), first, ee.Image(0).updateMask(ee.Image(0))));
}

function addIfNonEmpty(col, makeImgFn, viz, label, shown) {
  col = ee.ImageCollection(col);
  var img = ee.Image(col.first());
  col.size().evaluate(function(n) {
    if (n && n > 0) Map.addLayer(makeImgFn(img), viz, label, shown);
  });
}

function exportIfNonEmpty(col, makeImgFn, viz, description, scale) {
  col = ee.ImageCollection(col);
  var img = ee.Image(col.first());
  col.size().evaluate(function(n) {
    if (!n || n <= 0) return;
    Export.image.toDrive({
      image: makeImgFn(img).visualize(viz),
      description: description,
      folder: EXPORT_FOLDER,
      fileNamePrefix: description,
      region: img.geometry(),
      scale: scale,
      crs: EXPORT_CRS,
      maxPixels: 1e13
    });
  });
}

function addCompositeIfNonEmpty(col, rgbFn, viz, label, shown) {
  col = ee.ImageCollection(col);
  col.size().evaluate(function(n) {
    if (!n || n <= 0) return;
    var comp = col.map(rgbFn).median().clip(aoi);
    Map.addLayer(comp, viz, label, shown);
  });
}

function exportCompositeIfNonEmpty(col, rgbFn, viz, description, scale) {
  col = ee.ImageCollection(col);
  col.size().evaluate(function(n) {
    if (!n || n <= 0) return;
    var comp = col.map(rgbFn).median();
    Export.image.toDrive({
      image: comp.visualize(viz),
      description: description,
      folder: EXPORT_FOLDER,
      fileNamePrefix: description,
      region: comp.geometry(),
      scale: scale,
      crs: EXPORT_CRS,
      maxPixels: 1e13
    });
  });
}

// Sentinel-2: if AOI spans multiple granules, mosaic granules per UTC day.
// This lets us enforce "100% AOI coverage" using multiple tiles from the same date.
function s2DailyMosaics(col) {
  col = ee.ImageCollection(col);
  var err = ee.ErrorMargin(100); // meters
  var dates = ee.List(col.aggregate_array('system:time_start'))
    .map(function(t) { return ee.Date(t).format('YYYY-MM-dd'); })
    .distinct()
    .sort();

  return ee.ImageCollection(dates.map(function(d) {
    d = ee.String(d);
    var dayStart = ee.Date(d);
    var dayEnd = dayStart.advance(1, 'day');
    var dayCol = col.filterDate(dayStart, dayEnd);

    var mosaic = dayCol.mosaic();
    var cover = dayCol.geometry().contains(aoi, err);
    var cloud = ee.Number(dayCol.aggregate_mean('CLOUDY_PIXEL_PERCENTAGE'));

    return mosaic.set({
      'system:time_start': dayStart.millis(),
      'CLOUDY_PIXEL_PERCENTAGE': cloud,
      'fullCover': cover,
      'nGranules': dayCol.size(),
      'date': d
    });
  }));
}

// =========================
// Build collections + pick ONE PRE and ONE POST per sensor
// =========================
var compPreStart = alarm.advance(-COMPOSITE_DAYS_PRE, 'day');
var compPreEnd = alarm; // exclusive is fine
var compPostStart = alarm;
var compPostEnd = postEnd; // extend through POST_END_OVERRIDE / POST_LOOKAHEAD_DAYS

var lsPreCol = getLandsatCol(compPreStart, compPreEnd, LANDSAT_CLOUD_MAX_PRE);
var lsPostCol = getLandsatCol(compPostStart, compPostEnd, LANDSAT_CLOUD_MAX_POST);
// For "map each image" mode, keep Sentinel-2 as individual granules (no mosaics).
var s2PreColRaw = getS2Col(compPreStart, compPreEnd, S2_CLOUD_MAX_PRE);
var s2PostColRaw = getS2Col(compPostStart, compPostEnd, S2_CLOUD_MAX_POST);
var s2PreCol = s2PreColRaw;
var s2PostCol = s2PostColRaw;

// Require complete overlap: scene footprint must fully contain the fire perimeter.
var COVER_ERR = ee.ErrorMargin(100); // meters
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

if (REQUIRE_FULL_AOI_COVERAGE) {
  // Always enforce full coverage of the AOI (bbox or perimeter bounds+buffer).
  lsPreCol = requireFullCoverage(lsPreCol, aoi);
  lsPostCol = requireFullCoverage(lsPostCol, aoi);
}

if (REQUIRE_FULL_AOI_COVERAGE_S2) {
  s2PreCol = requireFullCoverage(s2PreCol, aoi);
  s2PostCol = requireFullCoverage(s2PostCol, aoi);
} else {
  s2PreCol = requireIntersectCoverage(s2PreCol, aoi);
  s2PostCol = requireIntersectCoverage(s2PostCol, aoi);
}

print('Landsat PRE count', lsPreCol.size());
print('Landsat POST count', lsPostCol.size());
print('Sentinel-2 PRE count (raw)', s2PreColRaw.size());
print('Sentinel-2 POST count (raw)', s2PostColRaw.size());
print('Sentinel-2 PRE count (after AOI filter)', s2PreCol.size());
print('Sentinel-2 POST count (after AOI filter)', s2PostCol.size());
print('Composite PRE window', compPreStart.format('YYYY-MM-dd'), 'to', compPreEnd.format('YYYY-MM-dd'));
print('Composite POST window', compPostStart.format('YYYY-MM-dd'), 'to', compPostEnd.format('YYYY-MM-dd'));

function addTimeDiffDays(col, refDate) {
  col = ee.ImageCollection(col);
  return col.map(function(img) {
    var d = ee.Date(img.get('system:time_start'));
    var diff = d.difference(refDate, 'day').abs();
    return img.set('timeDiffDays', diff);
  });
}

function listPostClouds(col, dateProp, cloudProp, extraProps, label) {
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

// Prioritize: closest date to ALARM_DATE on each side, then lowest cloud.
lsPreCol = addTimeDiffDays(lsPreCol, alarm).sort('CLOUD_COVER').sort('timeDiffDays');
s2PreCol = addTimeDiffDays(s2PreCol, alarm).sort('CLOUDY_PIXEL_PERCENTAGE').sort('timeDiffDays');
lsPostCol = addTimeDiffDays(lsPostCol, alarm).sort('CLOUD_COVER').sort('timeDiffDays');
s2PostCol = addTimeDiffDays(s2PostCol, alarm).sort('CLOUDY_PIXEL_PERCENTAGE').sort('timeDiffDays');

if (LIST_ALL_POST_CLOUDS) {
  listPostClouds(lsPostCol, 'system:time_start', 'CLOUD_COVER', ['LANDSAT_PRODUCT_ID'], 'Landsat POST candidates');
  listPostClouds(s2PostCol, 'system:time_start', 'CLOUDY_PIXEL_PERCENTAGE', ['PRODUCT_ID'], 'Sentinel-2 POST candidates');
}

// =========================
// Specific scenes of interest (user picks)
// =========================
// Landsat: 2024-08-12, CLOUD_COVER ~0.06 (6%)
var LS_TARGET_DATE = '2024-08-12';
var lsTargetCol = lsPostCol.filterDate(ee.Date(LS_TARGET_DATE), ee.Date(LS_TARGET_DATE).advance(1, 'day'));

// Sentinel-2: 2024-08-16, two granules with CLOUDY_PIXEL_PERCENTAGE ~0.01 and ~0.32
var S2_TARGET_DATE = '2024-08-16';
var s2TargetCol = s2PostCol.filterDate(ee.Date(S2_TARGET_DATE), ee.Date(S2_TARGET_DATE).advance(1, 'day'));

var lsPre = safeFirst(lsPreCol);
var lsPost = safeFirst(lsPostCol);
var s2Pre = safeFirst(s2PreCol);
var s2Post = safeFirst(s2PostCol);

function fmtDate(img) {
  var t = img.get('system:time_start');
  return ee.String(ee.Algorithms.If(t, ee.Date(t).format('YYYY-MM-dd'), 'N/A'));
}

function safeGetString(img, prop) {
  var v = img.get(prop);
  return ee.String(ee.Algorithms.If(v, v, 'N/A'));
}

function safeGetNumber(img, prop) {
  var v = img.get(prop);
  return ee.Number(ee.Algorithms.If(v, v, null));
}

function printChosen(tag, img, idProp, cloudProp) {
  print(tag + ' date', fmtDate(img));
  print(tag + ' id', safeGetString(img, idProp));
  print(tag + ' cloud', safeGetNumber(img, cloudProp));
}

print('--- Chosen PRE scenes (before ALARM_DATE) ---');
if (!POST_ONLY) {
  printChosen('Landsat PRE', lsPre, 'LANDSAT_PRODUCT_ID', 'CLOUD_COVER');
  printChosen('Sentinel-2 PRE', s2Pre, 'PRODUCT_ID', 'CLOUDY_PIXEL_PERCENTAGE');
}

print('--- Chosen POST scenes (after ALARM_DATE) ---');
printChosen('Landsat POST', lsPost, 'LANDSAT_PRODUCT_ID', 'CLOUD_COVER');
printChosen('Sentinel-2 POST', s2Post, 'PRODUCT_ID', 'CLOUDY_PIXEL_PERCENTAGE');

// Add Top-N candidates as optional layers (off by default), with IDs in names
function addTopNAsLayers(col, n, labelPrefix, viz, mapFn, idProp) {
  col = ee.ImageCollection(col);
  var list = col.toList(n);
  ee.List.sequence(0, n - 1).evaluate(function(ixs) {
    if (!ixs) return;
    ixs.forEach(function(i) {
      var img = ee.Image(list.get(i));
      var dateStr = fmtDate(img);
      var idStr = safeGetString(img, idProp);
      var label = ee.String(labelPrefix)
        .cat(' ')
        .cat(dateStr)
        .cat(' | ')
        .cat(idStr);
      label.evaluate(function(lbl) {
        Map.addLayer(mapFn(img), viz, lbl, false);
      });
    });
  });
}

function addAllPostAsLayers(col, viz, makeRgbFn, labelPrefix, cloudProp, idProp) {
  col = ee.ImageCollection(col).sort(cloudProp).sort('system:time_start');
  var n = col.size();
  print(labelPrefix + ' total (after filters)', n);

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
      // Capture per-iteration image for async callback.
      (function(localImg, localLabel) {
        localLabel.evaluate(function(lbl) {
          // add layers off by default; user can toggle
          Map.addLayer(makeRgbFn(localImg), viz, lbl, false);
        });
      })(img, label);
    }
  });
}

function exportRenderedRgb(renderedByteRgb, description, region, scale) {
  Export.image.toDrive({
    image: renderedByteRgb,
    description: description,
    folder: EXPORT_FOLDER,
    fileNamePrefix: description,
    region: region,
    scale: scale,
    crs: EXPORT_CRS,
    maxPixels: 1e13
  });
}

function exportAllInCollection(col, rgbFn, viz, descriptionPrefix, scale, maxExports) {
  col = ee.ImageCollection(col).sort('system:time_start');
  var n = col.size();
  print(descriptionPrefix + ' exports (count)', n);

  var toExport = col.limit(maxExports);
  var list = toExport.toList(maxExports);

  ee.Number(toExport.size()).evaluate(function(k) {
    if (!k || k <= 0) return;
    for (var i = 0; i < k; i++) {
      var img = ee.Image(list.get(i));
      // capture img per-iteration for async callback
      (function(localImg) {
        var dateStr = fmtDate(localImg);
        var idStr = safeGetString(localImg, 'PRODUCT_ID');
        var desc = ee.String(descriptionPrefix).cat('_').cat(dateStr).cat('_').cat(idStr);
        desc.evaluate(function(d) {
          Export.image.toDrive({
            image: rgbFn(localImg).visualize(viz),
            description: d,
            folder: EXPORT_FOLDER,
            fileNamePrefix: d,
            region: localImg.geometry(),
            scale: scale,
            crs: EXPORT_CRS,
            maxPixels: 1e13
          });
        });
      })(img);
    }
  });
}

// =========================
// Map display
// =========================
Map.centerObject(perimGeom, 9);
Map.addLayer(aoi, {color: 'red'}, 'AOI (perimeter bounds + buffer)', false);
if (!USE_FIXED_BBOX_INSTEAD_OF_PERIMETER) {
  Map.addLayer(perim.style({color: 'FF4D4D', fillColor: '00000000', width: 2}), {}, 'Fire perimeter', true);
}

// Keep it simple: add plain RGB layers (skip if empty).
var LS_VIZ = {min: 0, max: 0.30};
var S2_VIZ = {min: 0, max: 0.30};
if (USE_MEDIAN_COMPOSITES) {
  if (!POST_ONLY) addCompositeIfNonEmpty(lsPreCol, lsRgb, LS_VIZ, 'Landsat PRE RGB (median composite)', false);
  addCompositeIfNonEmpty(lsPostCol, lsRgb, LS_VIZ, 'Landsat POST RGB (median composite)', true);
  if (!POST_ONLY) addCompositeIfNonEmpty(s2PreCol, s2Rgb, S2_VIZ, 'Sentinel-2 PRE RGB (median composite)', false);
  addCompositeIfNonEmpty(s2PostCol, s2Rgb, S2_VIZ, 'Sentinel-2 POST RGB (median composite)', true);
} else {
  if (!POST_ONLY) addIfNonEmpty(lsPreCol, lsRgb, LS_VIZ, 'Landsat PRE RGB', false);
  addIfNonEmpty(lsPostCol, lsRgb, LS_VIZ, 'Landsat POST RGB', true);
  if (!POST_ONLY) addIfNonEmpty(s2PreCol, s2Rgb, S2_VIZ, 'Sentinel-2 PRE RGB', false);
  addIfNonEmpty(s2PostCol, s2Rgb, S2_VIZ, 'Sentinel-2 POST RGB', true);
}

// Explicit user-requested scenes
if (MAP_ALL_POST_IMAGES) {
  // Landsat: 2024-08-12
  addAllPostAsLayers(lsTargetCol, LS_VIZ, lsRgb, 'Landsat POST 2024-08-12', 'CLOUD_COVER', 'LANDSAT_PRODUCT_ID');
  // Sentinel-2: 2024-08-16 (two granules)
  addAllPostAsLayers(s2TargetCol, S2_VIZ, s2Rgb, 'Sentinel-2 POST 2024-08-16', 'CLOUDY_PIXEL_PERCENTAGE', 'PRODUCT_ID');
}

if (MAP_ALL_POST_IMAGES) {
  addAllPostAsLayers(lsPostCol, LS_VIZ, lsRgb, 'Landsat POST', 'CLOUD_COVER', 'LANDSAT_PRODUCT_ID');
  addAllPostAsLayers(s2PostCol, S2_VIZ, s2Rgb, 'Sentinel-2 POST', 'CLOUDY_PIXEL_PERCENTAGE', 'PRODUCT_ID');
}

// Optional: candidate layers (off by default)
addTopNAsLayers(lsPreCol, SHOW_TOP_N, 'Landsat PRE candidate', {min: 0, max: LS_RGB_MAX}, function(img) { return lsRgb(img); }, 'LANDSAT_PRODUCT_ID');
addTopNAsLayers(lsPostCol, SHOW_TOP_N, 'Landsat POST candidate', {min: 0, max: LS_RGB_MAX}, function(img) { return lsRgb(img); }, 'LANDSAT_PRODUCT_ID');
addTopNAsLayers(s2PreCol, SHOW_TOP_N, 'Sentinel-2 PRE candidate', {min: 0, max: S2_RGB_MAX}, function(img) { return s2Rgb(img); }, 'PRODUCT_ID');
addTopNAsLayers(s2PostCol, SHOW_TOP_N, 'Sentinel-2 POST candidate', {min: 0, max: S2_RGB_MAX}, function(img) { return s2Rgb(img); }, 'PRODUCT_ID');

// =========================
// Optional exports (uncomment the ones you want)
// =========================
// Exports: exactly what you asked for (full footprint, full scale)
// - Landsat: 1 scene on 2024-08-12
// - Sentinel-2: 2 granules on 2024-08-16
exportIfNonEmpty(lsTargetCol, lsRgb, LS_VIZ, EXPORT_PREFIX + '_landsat_2024-08-12', EXPORT_SCALE_LS);
exportAllInCollection(s2TargetCol, s2Rgb, S2_VIZ, EXPORT_PREFIX + '_s2_2024-08-16', EXPORT_SCALE_S2, 2);

