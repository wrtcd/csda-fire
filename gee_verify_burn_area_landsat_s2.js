// =============================================================================
// GEE: Landsat + Sentinel-2 over a Satellogic footprint (start from CSDAP)
// =============================================================================
//
// Workflow: START FROM SATELLOGIC IN CSDAP, then use that footprint here.
//
// CONUS fire test (find a fire that has Satellogic, then get its scene footprint):
//   See RUN_FIRST_THEN_GEE.md and docs/VERIFY_BURN_SATELLOGIC_LANDSAT_S2.md
//   Run:  python scripts/run_find_fire_for_gee.py
//   Then in CSDAP pick the Satellogic scene for that fire; use its footprint below.
//
// Or: In CSDAP (https://csdap.earthdata.nasa.gov/explore/) find a Satellogic scene,
//     note its footprint (bbox) and date, paste below, then run this script in GEE.
//
// Map: pre + individual Landsat and Sentinel-2. Console: scene IDs/dates + CSDAP bounds.
// =============================================================================

// ---------- CONFIG: paste from CSDAP — Satellogic scene footprint (bbox) and date range ----------
// Bbox: west, south, east, north (from the Satellogic scene in CSDAP).
// Pre window: before the Satellogic date; post window: around the Satellogic date (±weeks).
var FIRE_NAME      = 'Satellogic footprint';   // Label (e.g. scene ID or "Satellogic footprint")
var FIRE_BBOX      = [-101.35, 35.55, -100.15, 36.55];  // Satellogic footprint: west, south, east, north
var PRE_FIRE_START = '2023-06-01';
var PRE_FIRE_END   = '2024-02-25';
var POST_START     = '2024-04-01';
var POST_END       = '2024-05-31';

var MAX_CLOUD = 5;
var MIN_OVERLAP = 1;  // 100% overlap only

var aoi = ee.Geometry.Rectangle(FIRE_BBOX, 'EPSG:4326', false);
Map.centerObject(aoi, 8);
Map.addLayer(aoi, { color: 'red', width: 2 }, FIRE_NAME + ' — AOI', true);

var aoiArea = aoi.area(1);
function addOverlapRatio(img) {
  var inter = ee.Image(img).geometry().intersection(aoi, 1);
  var ratio = inter.area(1).divide(aoiArea);
  return ee.Image(img).set('overlap_ratio', ratio);
}

function scaleL2(img) {
  return img.select(['SR_B4', 'SR_B3', 'SR_B2']).multiply(0.0000275).add(-0.2).clamp(0, 1);
}

// ---------- Landsat LC08 + LC09 L2 ----------
function landsatCollection(start, end) {
  return ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')
    .merge(ee.ImageCollection('LANDSAT/LC08/C02/T1_L2'))
    .filterBounds(aoi).filterDate(start, end)
    .filter(ee.Filter.lt('CLOUD_COVER', MAX_CLOUD))
    .map(addOverlapRatio).filter(ee.Filter.gte('overlap_ratio', MIN_OVERLAP))
    .sort('CLOUD_COVER');
}

// ---------- Sentinel-2 L2A ----------
var S2_MIN_OVERLAP = 0.5;  // S2 tiles often don't cover 100% of AOI; use >=50% so layers appear
function s2Collection(start, end, minOverlap) {
  if (minOverlap === undefined) minOverlap = MIN_OVERLAP;
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(aoi).filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', MAX_CLOUD))
    .map(addOverlapRatio).filter(ee.Filter.gte('overlap_ratio', minOverlap))
    .sort('CLOUDY_PIXEL_PERCENTAGE');
}

var landVis = { min: 0, max: 0.4 };
var s2Vis = { min: 0, max: 3000 };

var landPre = landsatCollection(PRE_FIRE_START, PRE_FIRE_END);
var s2Pre = s2Collection(PRE_FIRE_START, PRE_FIRE_END, S2_MIN_OVERLAP);
var landPost = landsatCollection(POST_START, POST_END);
var s2Post = s2Collection(POST_START, POST_END, S2_MIN_OVERLAP);

// Add layers in evaluate callback: pre-fire (1) + each post-fire Landsat and S2 as individual images.
ee.Dictionary({
  nLandPre: landPre.size(),
  nS2Pre: s2Pre.size(),
  nLandPost: landPost.size(),
  nS2Post: s2Post.size(),
  landDates: landPost.aggregate_array('DATE_ACQUIRED'),
  s2Times: s2Post.aggregate_array('system:time_start')
}).evaluate(function(stats) {
  var nLandPre = stats.nLandPre || 0, nS2Pre = stats.nS2Pre || 0;
  var nLandPost = stats.nLandPost || 0, nS2Post = stats.nS2Post || 0;
  var landDates = stats.landDates || [];
  var s2Times = stats.s2Times || [];
  var m, i, dateStr;
  if (nLandPre > 0) {
    m = scaleL2(landPre.first()).getMapId(landVis);
    Map.addLayer({ mapId: m.mapid, token: m.token }, {}, FIRE_NAME + ' — Pre-fire', true);
  } else if (nS2Pre > 0) {
    m = s2Pre.first().select(['B4', 'B3', 'B2']).multiply(1 / 3000).clamp(0, 1).getMapId(landVis);
    Map.addLayer({ mapId: m.mapid, token: m.token }, {}, FIRE_NAME + ' — Pre-fire', true);
  }
  for (i = 0; i < nLandPost; i++) {
    dateStr = landDates[i] || ('L' + (i + 1));
    m = scaleL2(ee.Image(landPost.toList(nLandPost).get(i))).getMapId(landVis);
    Map.addLayer({ mapId: m.mapid, token: m.token }, {}, FIRE_NAME + ' — Landsat ' + (i + 1) + ' — ' + dateStr, false);
  }
  for (i = 0; i < nS2Post; i++) {
    dateStr = s2Times[i] ? new Date(s2Times[i]).toISOString().slice(0, 10) : ('S' + (i + 1));
    m = ee.Image(s2Post.toList(nS2Post).get(i)).select(['B4', 'B3', 'B2']).getMapId(s2Vis);
    Map.addLayer({ mapId: m.mapid, token: m.token }, {}, FIRE_NAME + ' — Sentinel-2 ' + (i + 1) + ' — ' + dateStr, false);
  }
});

// ---------- Console: scene IDs and dates (refer by date or ID for exporting / slides) ----------
print('=== ' + FIRE_NAME + ' — Landsat: 100% overlap. Sentinel-2: >=50% overlap. Cloud < ' + MAX_CLOUD + '% ===');
print('Pre-fire:', PRE_FIRE_START, 'to', PRE_FIRE_END);
print('Post-fire:', POST_START, 'to', POST_END);
// CSDAP search: use this date range and bounds in https://csdap.earthdata.nasa.gov/explore/
// FIRE_BBOX is [west, south, east, north] = [minLon, minLat, maxLon, maxLat]
print('');
print('--- CSDAP (Satellogic) search — date range and bounds ---');
print('Date range (post-fire):', POST_START, 'to', POST_END);
print('Northwest corner (lon, lat):', FIRE_BBOX[0], FIRE_BBOX[3]);
print('Southeast corner (lon, lat):', FIRE_BBOX[2], FIRE_BBOX[1]);
print('Bbox (west, south, east, north):', FIRE_BBOX.join(', '));
print('');

print('--- Landsat post-fire (individual scenes — use date or scene ID to export) ---');
var landTable = landPost.toList(100).map(function(img) {
  var im = ee.Image(img);
  return ee.Feature(null, {
    date: im.get('DATE_ACQUIRED'),
    scene_id: im.get('LANDSAT_SCENE_ID'),
    cloud: im.get('CLOUD_COVER')
  });
});
print(ee.FeatureCollection(landTable));
print('Landsat dates:', landPost.aggregate_array('DATE_ACQUIRED'));
print('Landsat scene IDs:', landPost.aggregate_array('LANDSAT_SCENE_ID'));

print('');
print('--- Sentinel-2 post-fire (>=50% overlap; use date or system:index to export) ---');
var s2Table = s2Post.toList(100).map(function(img) {
  var im = ee.Image(img);
  return ee.Feature(null, {
    date: ee.Date(im.get('system:time_start')).format('YYYY-MM-dd'),
    scene_id: im.get('system:index'),
    cloud: im.get('CLOUDY_PIXEL_PERCENTAGE')
  });
});
print(ee.FeatureCollection(s2Table));
print('Sentinel-2 dates:', s2Post.aggregate_array('system:time_start'));
print('Sentinel-2 scene IDs:', s2Post.aggregate_array('system:index'));

print('');
print('Use dates or scene IDs above when exporting. Map layers: Pre-fire + individual Landsat and Sentinel-2 post-fire (dates in layer names).');

// ---------- Export to Google Drive: Landsat 04-04, Sentinel-2 04-11 ----------
// Run script, then open Tasks tab and click Run for each export.
var exportYear = POST_START.slice(0, 4);
var landExportDate = exportYear + '-04-04';
var s2ExportDate = exportYear + '-04-11';

var landExportImg = landPost.filter(ee.Filter.eq('DATE_ACQUIRED', landExportDate)).first();
var s2ExportImg = s2Post.filterDate(s2ExportDate, ee.Date(s2ExportDate).advance(1, 'day')).first();

Export.image.toDrive({
  image: landExportImg.select(['SR_B4', 'SR_B3', 'SR_B2']),
  description: FIRE_NAME.replace(/\s+/g, '_') + '_Landsat_' + landExportDate,
  folder: 'GEE_exports',
  region: aoi,
  scale: 30,
  fileFormat: 'GeoTIFF',
  maxPixels: 1e13
});

Export.image.toDrive({
  image: s2ExportImg.select(['B4', 'B3', 'B2']),
  description: FIRE_NAME.replace(/\s+/g, '_') + '_Sentinel2_' + s2ExportDate,
  folder: 'GEE_exports',
  region: aoi,
  scale: 10,
  fileFormat: 'GeoTIFF',
  maxPixels: 1e13
});

print('Export tasks created: Landsat ' + landExportDate + ', Sentinel-2 ' + s2ExportDate + '. Open Tasks tab (right panel) and click Run for each.');
