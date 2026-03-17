// GEE: Lake Fire (CA) — Landsat 8/9 + Sentinel-2 (RGB-only)
// Goal:
// - Manually inspect all POST candidates by toggling layers
// - List (date, cloud%, id) in Console
// - No exports locked in until you pick

var PLACE_LABEL = 'Lake Fire (CA)';
var ALARM_DATE = '2024-07-05';
var PRE_LOOKBACK_DAYS = 45;
var POST_LOOKAHEAD_DAYS = 90;
var POST_END_OVERRIDE = ''; // set e.g. '2024-08-20' (end is exclusive in filterDate); '' disables override

var PERIMETERS_ASSET = 'projects/earthengine-441016/assets/California_Fire_Perimeters';
var PERIM_FIRE_NAME = 'Lake';
var PERIM_YEAR = 2024;
var PERIM_BUFFER_M = 8000;

// If perimeter asset is slow/unavailable, use fixed bbox AOI instead.
// This bbox was derived from `powerpoint/shapefile/calfire.geojson` feature FIRE_NAME=LAKE, YEAR_=2024, ALARM_DATE=2024-07-05.
// Format: [minLon, minLat, maxLon, maxLat] in EPSG:4326
var USE_FIXED_BBOX_INSTEAD_OF_PERIMETER = true;
var FIXED_BBOX_4326 = [-120.16163020580632, 34.67971588707021, -119.908080000008, 34.844792472762954];

// Output focus
var POST_ONLY = true;
var LIST_ALL_POST_CLOUDS = true;
var MAX_LIST = 300;
var MAP_ALL_POST_IMAGES = true;
var MAX_MAP_LAYERS = 120;

// Coverage rules
var REQUIRE_FULL_AOI_COVERAGE_LANDSAT = false;
var REQUIRE_FULL_AOI_COVERAGE_S2 = false; // S2 granules often won't contain a big AOI bbox; default to intersects

// Cloud filters (metadata-based)
var LANDSAT_CLOUD_MAX_POST = 20;
var S2_CLOUD_MAX_POST = 5;

// Pixel QA masks (holes are expected when true)
var APPLY_PIXEL_CLOUD_MASKS = true;

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
print('Perimeter match', 'FIRE_NAME=' + PERIM_FIRE_NAME, 'YEAR_=' + PERIM_YEAR);
print('AOI bbox [W,S,E,N] (EPSG:4326)', AOI_BBOX_4326);
print('Using fixed bbox instead of perimeter?', USE_FIXED_BBOX_INSTEAD_OF_PERIMETER);
print('Fixed bbox (EPSG:4326)', FIXED_BBOX_4326);
print('PRE window', preStart.format('YYYY-MM-dd'), 'to', preEnd.format('YYYY-MM-dd'));
print('POST window', postStart.format('YYYY-MM-dd'), 'to', postEnd.format('YYYY-MM-dd'));

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
    // Some builds/catalogs expose CLOUD_COVER_LAND more reliably than CLOUD_COVER.
    // Normalize to a single property for filtering/sorting.
    .map(function(img) {
      var cc = ee.Number(img.get('CLOUD_COVER'));
      var ccl = ee.Number(img.get('CLOUD_COVER_LAND'));
      var cloudPct = ee.Number(ee.Algorithms.If(img.get('CLOUD_COVER'), cc, ccl));
      return img.set('cloudPct', cloudPct);
    })
    .filter(ee.Filter.lte('cloudPct', cloudMax));
}
function lsRgb(img) {
  img = ee.Image(img);
  if (APPLY_PIXEL_CLOUD_MASKS) img = lsMaskClouds(img);
  var sr = lsScaleSR(img);
  return sr.select(['SR_B4','SR_B3','SR_B2']).rename(['R','G','B']);
}

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
  // Keep native SR DN (scaled by 10000)
  return img.select(['B4','B3','B2']).rename(['R','G','B']);
}
function safeFirst(col) {
  col = ee.ImageCollection(col);
  var first = ee.Image(col.first());
  return ee.Image(ee.Algorithms.If(col.size().gt(0), first, ee.Image(0).updateMask(ee.Image(0))));
}
function addTimeDiffDays(col, refDate) {
  col = ee.ImageCollection(col);
  return col.map(function(img) {
    var d = ee.Date(img.get('system:time_start'));
    return img.set('timeDiffDays', d.difference(refDate, 'day').abs());
  });
}
var COVER_ERR = ee.ErrorMargin(100);
function requireFullCoverage(col, geom) {
  col = ee.ImageCollection(col);
  return col.map(function(img) {
    return img.set('fullCover', img.geometry().contains(geom, COVER_ERR));
  }).filter(ee.Filter.eq('fullCover', true));
}
function fmtDate(img) {
  return ee.Date(img.get('system:time_start')).format('YYYY-MM-dd');
}
function printChosen(tag, img, idProp, cloudProp) {
  print(tag + ' date', fmtDate(img));
  print(tag + ' id', img.get(idProp));
  print(tag + ' cloud', img.get(cloudProp));
}

var COVER_ERR = ee.ErrorMargin(100);
function requireIntersectCoverage(col, geom) {
  col = ee.ImageCollection(col);
  return col.map(function(img) {
    return img.set('intersectsAOI', img.geometry().intersects(geom, COVER_ERR));
  }).filter(ee.Filter.eq('intersectsAOI', true));
}

var lsPostCol = getLandsatCol(postStart, postEnd, LANDSAT_CLOUD_MAX_POST);
var s2PostCol = getS2Col(postStart, postEnd, S2_CLOUD_MAX_POST);

if (REQUIRE_FULL_AOI_COVERAGE_LANDSAT) lsPostCol = requireFullCoverage(lsPostCol, aoi);
if (REQUIRE_FULL_AOI_COVERAGE_S2) s2PostCol = requireFullCoverage(s2PostCol, aoi);
else s2PostCol = requireIntersectCoverage(s2PostCol, aoi);

lsPostCol = lsPostCol.sort('CLOUD_COVER').sort('system:time_start');
s2PostCol = s2PostCol.sort('CLOUDY_PIXEL_PERCENTAGE').sort('system:time_start');

print('Landsat POST count', lsPostCol.size());
print('Sentinel-2 POST count', s2PostCol.size());

function listPostClouds(col, cloudProp, idProp, label) {
  col = ee.ImageCollection(col);
  var rows = col.limit(MAX_LIST).map(function(img) {
    return ee.Feature(null, {
      date: ee.Date(img.get('system:time_start')).format('YYYY-MM-dd'),
      cloud: img.get(cloudProp),
      id: img.get(idProp)
    });
  });
  print(label + ' (first ' + MAX_LIST + ')', rows);
}

if (LIST_ALL_POST_CLOUDS) {
  listPostClouds(lsPostCol, 'cloudPct', 'LANDSAT_PRODUCT_ID', 'Landsat POST (date, cloud, id)');
  listPostClouds(s2PostCol, 'CLOUDY_PIXEL_PERCENTAGE', 'PRODUCT_ID', 'Sentinel-2 POST (date, cloud, id)');
}

function safeGetString(img, prop) {
  var v = img.get(prop);
  return ee.String(ee.Algorithms.If(v, v, 'N/A'));
}

function addAllAsLayers(col, viz, mapFn, labelPrefix, cloudProp, idProp, maxLayers) {
  col = ee.ImageCollection(col).sort(cloudProp).sort('system:time_start');
  var toAdd = col.limit(maxLayers);
  var list = toAdd.toList(maxLayers);
  ee.Number(toAdd.size()).evaluate(function(k) {
    if (!k || k <= 0) return;
    for (var i = 0; i < k; i++) {
      var img = ee.Image(list.get(i));
      var dateStr = ee.Date(img.get('system:time_start')).format('YYYY-MM-dd');
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
          Map.addLayer(mapFn(localImg), viz, lbl, false);
        });
      })(img, label);
    }
  });
}

Map.centerObject(perimGeom, 12);
Map.addLayer(aoi, {color: 'red'}, 'AOI', false);
if (!USE_FIXED_BBOX_INSTEAD_OF_PERIMETER) {
  Map.addLayer(perim.style({color: 'FF4D4D', fillColor: '00000000', width: 2}), {}, 'Fire perimeter', true);
}

var LS_VIZ = {min: 0, max: 0.30};
var S2_VIZ = {min: 0, max: 3000};
if (MAP_ALL_POST_IMAGES) {
  addAllAsLayers(lsPostCol, LS_VIZ, lsRgb, 'Landsat POST', 'cloudPct', 'LANDSAT_PRODUCT_ID', MAX_MAP_LAYERS);
  addAllAsLayers(s2PostCol, S2_VIZ, s2Rgb, 'Sentinel-2 POST', 'CLOUDY_PIXEL_PERCENTAGE', 'PRODUCT_ID', MAX_MAP_LAYERS);
}

// =========================
// Targeted exports (visual, full footprint, full scale)
// =========================
var LS_EXPORT_DATE = '2024-07-29'; // 1 Landsat scene you picked
var S2_EXPORT_DATE = '2024-07-24'; // 2 Sentinel-2 granules you picked

var lsExportCol = lsPostCol.filterDate(ee.Date(LS_EXPORT_DATE), ee.Date(LS_EXPORT_DATE).advance(1, 'day'));
var s2ExportCol = s2PostCol.filterDate(ee.Date(S2_EXPORT_DATE), ee.Date(S2_EXPORT_DATE).advance(1, 'day'))
  .sort('CLOUDY_PIXEL_PERCENTAGE')
  .limit(2);

function exportFirstIfExists(col, rgbFn, viz, description, scale) {
  col = ee.ImageCollection(col);
  var img = ee.Image(col.first());
  col.size().evaluate(function(n) {
    if (!n || n <= 0) return;
    Export.image.toDrive({
      image: rgbFn(img).visualize(viz),
      description: description,
      folder: 'GEE_fire',
      fileNamePrefix: description,
      region: img.geometry(),
      scale: scale,
      crs: 'EPSG:3857',
      maxPixels: 1e13
    });
  });
}

function exportAll(col, rgbFn, viz, descriptionPrefix, scale, maxExports) {
  col = ee.ImageCollection(col).sort('system:time_start');
  var toExport = col.limit(maxExports);
  var list = toExport.toList(maxExports);
  ee.Number(toExport.size()).evaluate(function(k) {
    if (!k || k <= 0) return;
    for (var i = 0; i < k; i++) {
      var img = ee.Image(list.get(i));
      (function(localImg) {
        var dateStr = ee.Date(localImg.get('system:time_start')).format('YYYY-MM-dd');
        var idStr = ee.String(localImg.get('PRODUCT_ID'));
        var desc = ee.String(descriptionPrefix).cat('_').cat(dateStr).cat('_').cat(idStr);
        desc.evaluate(function(d) {
          Export.image.toDrive({
            image: rgbFn(localImg).visualize(viz),
            description: d,
            folder: 'GEE_fire',
            fileNamePrefix: d,
            region: localImg.geometry(),
            scale: scale,
            crs: 'EPSG:3857',
            maxPixels: 1e13
          });
        });
      })(img);
    }
  });
}

// Run exports:
exportFirstIfExists(lsExportCol, lsRgb, LS_VIZ, 'lake_landsat_' + LS_EXPORT_DATE, 30);
exportAll(s2ExportCol, s2Rgb, S2_VIZ, 'lake_s2_' + S2_EXPORT_DATE, 10, 2);

