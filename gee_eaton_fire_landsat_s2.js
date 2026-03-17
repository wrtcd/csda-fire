// GEE: Eaton Fire (CA) — Landsat 8/9 + Sentinel-2 (RGB-only, publication-style rendering)
// Run in Google Earth Engine Code Editor (JavaScript).
//
// Workflow (same as Park):
// - Load CAL FIRE perimeter from your asset
// - Filter to cloud <= 10%
// - Require full footprint coverage (scene contains perimeter)
// - Pick 1 best PRE + 1 best POST (closest to ALARM_DATE, then lowest cloud)
// - Add rendered RGB layers with date + image ID in the layer name

// =========================
// Inputs (edit these)
// =========================
var PLACE_LABEL = 'Eaton Fire (CA)';
var ALARM_DATE = '2025-01-08'; // discovery/ignition date (UTC day)

// Date windows (days) to search around ALARM_DATE.
var PRE_LOOKBACK_DAYS = 45; // PRE: [ALARM_DATE - PRE_LOOKBACK_DAYS, ALARM_DATE - 1]
var POST_LOOKAHEAD_DAYS = 90; // POST: [ALARM_DATE + 1, ALARM_DATE + POST_LOOKAHEAD_DAYS]

// CAL FIRE perimeter source (provided by you)
var PERIMETERS_ASSET = 'projects/earthengine-441016/assets/California_Fire_Perimeters';
var PERIM_FIRE_NAME = 'Eaton';
var PERIM_YEAR = 2025;
var PERIM_BUFFER_M = 15000;

// If CAL FIRE asset upload is slow/unavailable, use fixed bbox AOI instead.
// This bbox was derived from `powerpoint/shapefile/calfire.geojson` feature FIRE_NAME=EATON, YEAR_=2025.
// Format: [minLon, minLat, maxLon, maxLat] in EPSG:4326
var USE_FIXED_BBOX_INSTEAD_OF_PERIMETER = true;
var FIXED_BBOX_4326 = [-118.16207000018734, 34.16189200001266, -118.01305199999895, 34.23783206453789];

// Cloud filters (metadata-based)
var LANDSAT_CLOUD_MAX_PRE = 10;
var LANDSAT_CLOUD_MAX_POST = 10;
var S2_CLOUD_MAX_PRE = 10;
var S2_CLOUD_MAX_POST = 10;

// Optional candidate layers (off by default)
var SHOW_TOP_N = 0;

// "Journal look" render controls (AOI-based)
var STRETCH_PCT_LOW = 2;
var STRETCH_PCT_HIGH = 98;
var RGB_GAMMA = 1.08;

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

// Print bbox [W,S,E,N] in EPSG:4326 for slide/table use
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

// =========================
// Dates
// =========================
var alarm = ee.Date(ALARM_DATE);
var preStart = alarm.advance(-PRE_LOOKBACK_DAYS, 'day');
var preEnd = alarm.advance(-1, 'day');
var postStart = alarm.advance(1, 'day');
var postEnd = alarm.advance(POST_LOOKAHEAD_DAYS, 'day');

print('Place / label', PLACE_LABEL);
print('Alarm date (UTC day)', ALARM_DATE);
print('Perimeter asset', PERIMETERS_ASSET);
print('Perimeter match', 'FIRE_NAME=' + PERIM_FIRE_NAME, 'YEAR_=' + PERIM_YEAR);
print('AOI bbox [W,S,E,N] (EPSG:4326)', AOI_BBOX_4326);
print('Using fixed bbox instead of perimeter?', USE_FIXED_BBOX_INSTEAD_OF_PERIMETER);
print('Fixed bbox (EPSG:4326)', FIXED_BBOX_4326);
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
  var mask = qa.bitwiseAnd(1 << 1).eq(0)
    .and(qa.bitwiseAnd(1 << 3).eq(0))
    .and(qa.bitwiseAnd(1 << 4).eq(0))
    .and(qa.bitwiseAnd(1 << 5).eq(0));
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
  var sr = lsScaleSR(lsMaskClouds(img));
  return sr.select(['SR_B4','SR_B3','SR_B2']).rename(['R','G','B']);
}

// =========================
// Sentinel-2 SR helpers
// =========================
function s2MaskClouds(img) {
  var scl = img.select('SCL');
  var bad = scl.eq(3).or(scl.eq(8)).or(scl.eq(9)).or(scl.eq(10)).or(scl.eq(11));
  return img.updateMask(bad.not());
}

function getS2Col(start, end, cloudMax) {
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(perimGeom)
    .filterDate(start, end)
    .filter(ee.Filter.lte('CLOUDY_PIXEL_PERCENTAGE', cloudMax));
}

function s2Rgb(img) {
  return s2MaskClouds(img).select(['B4','B3','B2']).rename(['R','G','B']);
}

// =========================
// Render (RGB)
// =========================
function renderRgbAuto(img, bands, region, scale, gamma) {
  var pct = ee.Dictionary(img.select(bands).reduceRegion({
    reducer: ee.Reducer.percentile([STRETCH_PCT_LOW, STRETCH_PCT_HIGH]),
    geometry: region,
    scale: scale,
    bestEffort: true,
    maxPixels: 1e13
  }));

  var b0 = ee.String(ee.List(bands).get(0));
  var b1 = ee.String(ee.List(bands).get(1));
  var b2 = ee.String(ee.List(bands).get(2));

  var min0 = ee.Number(pct.get(b0.cat('_p').cat(ee.Number(STRETCH_PCT_LOW).format())));
  var max0 = ee.Number(pct.get(b0.cat('_p').cat(ee.Number(STRETCH_PCT_HIGH).format())));
  var min1 = ee.Number(pct.get(b1.cat('_p').cat(ee.Number(STRETCH_PCT_LOW).format())));
  var max1 = ee.Number(pct.get(b1.cat('_p').cat(ee.Number(STRETCH_PCT_HIGH).format())));
  var min2 = ee.Number(pct.get(b2.cat('_p').cat(ee.Number(STRETCH_PCT_LOW).format())));
  var max2 = ee.Number(pct.get(b2.cat('_p').cat(ee.Number(STRETCH_PCT_HIGH).format())));

  var safeMax0 = max0.max(min0.add(1e-6));
  var safeMax1 = max1.max(min1.add(1e-6));
  var safeMax2 = max2.max(min2.add(1e-6));

  var scaled = ee.Image.cat([
    img.select([b0]).unitScale(min0, safeMax0),
    img.select([b1]).unitScale(min1, safeMax1),
    img.select([b2]).unitScale(min2, safeMax2)
  ]).clamp(0, 1);

  var g = ee.Number(gamma);
  var gammaCorrected = scaled.pow(ee.Number(1).divide(g));
  return gammaCorrected.multiply(255).toByte();
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
    var diff = d.difference(refDate, 'day').abs();
    return img.set('timeDiffDays', diff);
  });
}

// Require full overlap: scene footprint must fully contain the fire perimeter.
var COVER_ERR = ee.ErrorMargin(100);
function requireFullCoverage(col, geom) {
  col = ee.ImageCollection(col);
  return col.map(function(img) {
    var full = img.geometry().contains(geom, COVER_ERR);
    return img.set('fullCover', full);
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

function addTopNAsLayers(col, n, labelPrefix, viz, mapFn, idProp) {
  if (n <= 0) return;
  col = ee.ImageCollection(col);
  var list = col.toList(n);
  ee.List.sequence(0, n - 1).evaluate(function(ixs) {
    if (!ixs) return;
    ixs.forEach(function(i) {
      var img = ee.Image(list.get(i));
      var dateStr = ee.Date(img.get('system:time_start')).format('YYYY-MM-dd');
      var idStr = ee.String(img.get(idProp));
      var label = ee.String(labelPrefix).cat(' ').cat(dateStr).cat(' | ').cat(idStr);
      label.evaluate(function(lbl) {
        Map.addLayer(mapFn(img), viz, lbl, false);
      });
    });
  });
}

// =========================
// Collections (POST-only list & toggle)
// =========================
// NOTE: S2 granules rarely "contain" a big AOI bbox, so we don't require full coverage for S2 here.
var lsPostCol = requireFullCoverage(getLandsatCol(postStart, postEnd, LANDSAT_CLOUD_MAX_POST), aoi)
  .sort('CLOUD_COVER')
  .sort('system:time_start');
var s2PostCol = getS2Col(postStart, postEnd, S2_CLOUD_MAX_POST)
  .sort('CLOUDY_PIXEL_PERCENTAGE')
  .sort('system:time_start');

print('Landsat POST count', lsPostCol.size());
print('Sentinel-2 POST count', s2PostCol.size());

function listPostClouds(col, cloudProp, idProp, label) {
  col = ee.ImageCollection(col);
  var rows = col.limit(300).map(function(img) {
    return ee.Feature(null, {
      date: ee.Date(img.get('system:time_start')).format('YYYY-MM-dd'),
      cloud: img.get(cloudProp),
      id: img.get(idProp)
    });
  });
  print(label, rows);
}

listPostClouds(lsPostCol, 'CLOUD_COVER', 'LANDSAT_PRODUCT_ID', 'Landsat POST (date, cloud, id)');
listPostClouds(s2PostCol, 'CLOUDY_PIXEL_PERCENTAGE', 'PRODUCT_ID', 'Sentinel-2 POST (date, cloud, id)');

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
      var idStr = ee.String(img.get(idProp));
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

// =========================
// Map display
// =========================
Map.centerObject(perimGeom, 11);
Map.addLayer(aoi, {color: 'red'}, 'AOI (perimeter bounds + buffer)', false);
if (!USE_FIXED_BBOX_INSTEAD_OF_PERIMETER) {
  Map.addLayer(perim.style({color: 'FF4D4D', fillColor: '00000000', width: 2}), {}, 'Fire perimeter', true);
}

// Visual RGB layers (toggle on/off)
var LS_VIZ = {min: 0, max: 0.30};
// Sentinel-2 SR is scaled by 10000; use DN-style viz for stable colors.
var S2_VIZ = {min: 0, max: 3000};
addAllAsLayers(lsPostCol, LS_VIZ, lsRgb, 'Landsat POST', 'CLOUD_COVER', 'LANDSAT_PRODUCT_ID', 200);
addAllAsLayers(s2PostCol, S2_VIZ, s2Rgb, 'Sentinel-2 POST', 'CLOUDY_PIXEL_PERCENTAGE', 'PRODUCT_ID', 200);

// =========================
// Targeted exports (visual, full footprint, full scale)
// =========================
var LS_EXPORT_DATE = '2025-02-23'; // 1 Landsat scene you picked
var S2_EXPORT_DATE = '2025-02-21'; // 2 Sentinel-2 granules you picked

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
exportFirstIfExists(lsExportCol, lsRgb, LS_VIZ, 'eaton_landsat_' + LS_EXPORT_DATE, 30);
exportAll(s2ExportCol, s2Rgb, S2_VIZ, 'eaton_s2_' + S2_EXPORT_DATE, 10, 2);

