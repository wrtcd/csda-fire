// GEE: Park Fire (POST burn scar visible) - Landsat + Sentinel-2
// Run in Google Earth Engine Code Editor.
//
// Outputs:
// - Chosen POST RGB (Landsat + Sentinel-2)
// - dNBR (PRE median vs chosen POST) to make burn scar pop

// =========================
// Fire inputs
// =========================
var FIRE_NAME = 'Park';
var AOI_BBOX = [-108.87018869235, 33.3277119963856, -108.869877161999, 33.3280893571179]; // [W,S,E,N]
var FIRE_DISCOVERY_UTC = '2025-07-02';
var FIRE_CONTAIN_UTC = '2025-07-03';

// Windows (days around discovery/containment)
var PRE_DAYS = 30;
var POST_DAYS = 30;

// Candidate limits / filters
var SHOW_TOP_N = 5;
var LANDSAT_MAX_CLOUD = 40; // metadata CLOUD_COVER (%)
var S2_MAX_CLOUD = 40;      // metadata CLOUDY_PIXEL_PERCENTAGE (%)

// =========================
// AOI + time windows
// =========================
var aoi = ee.Geometry.Rectangle(AOI_BBOX, 'EPSG:4326', false);
var tDiscovery = ee.Date(FIRE_DISCOVERY_UTC);
var tContain = ee.Date(FIRE_CONTAIN_UTC);
var preStart = tDiscovery.advance(-PRE_DAYS, 'day');
var preEnd = tDiscovery;
var postStart = tContain;
var postEnd = tContain.advance(POST_DAYS, 'day');

print('Fire', FIRE_NAME);
print('AOI bbox', AOI_BBOX);
print('PRE window', preStart, preEnd);
print('POST window', postStart, postEnd);

// =========================
// Landsat helpers
// =========================
function lsScale(img, bandName) {
  return img.select(bandName).multiply(0.0000275).add(-0.2);
}

function lsRgb(img) {
  return ee.Image.cat([lsScale(img, 'SR_B4'), lsScale(img, 'SR_B3'), lsScale(img, 'SR_B2')])
    .clamp(0, 1)
    .rename(['R', 'G', 'B']);
}

function lsNBR(img) {
  var nir = lsScale(img, 'SR_B5');
  var swir2 = lsScale(img, 'SR_B7');
  return nir.subtract(swir2).divide(nir.add(swir2)).rename('NBR');
}

function lsMaskClouds(img) {
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
  return img.select(['B4', 'B3', 'B2']).divide(3000).clamp(0, 1).rename(['R', 'G', 'B']);
}

function s2NBR(img) {
  var nir = img.select('B8').multiply(0.0001);
  var swir2 = img.select('B12').multiply(0.0001);
  return nir.subtract(swir2).divide(nir.add(swir2)).rename('NBR');
}

function s2MaskClouds(img) {
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
// PRE reference (median NBR)
// =========================
function medianNBR(col, maskFn, nbrFn) {
  return col.map(maskFn).map(nbrFn).median();
}

var lsPreCol = landsatCol(preStart, preEnd);
var s2PreCol = s2Col(preStart, preEnd);

print('Landsat PRE count', lsPreCol.size());
print('S2 PRE count', s2PreCol.size());

var lsPreNBR = medianNBR(lsPreCol, lsMaskClouds, lsNBR);
var s2PreNBR = medianNBR(s2PreCol, s2MaskClouds, s2NBR);

// =========================
// Score POST candidates
// =========================
function scorePost(img, sensor) {
  var cloud = ee.Number(
    ee.Algorithms.If(
      sensor === 'Landsat',
      ee.Number(img.get('CLOUD_COVER')),
      ee.Number(img.get('CLOUDY_PIXEL_PERCENTAGE'))
    )
  );

  var postNBR = ee.Image(
    ee.Algorithms.If(
      sensor === 'Landsat',
      lsNBR(lsMaskClouds(img)),
      s2NBR(s2MaskClouds(img))
    )
  );
  var dNBR = ee.Image(
    ee.Algorithms.If(
      sensor === 'Landsat',
      lsPreNBR.subtract(postNBR),
      s2PreNBR.subtract(postNBR)
    )
  );

  var mean = ee.Number(
    dNBR.reduceRegion({
      reducer: ee.Reducer.mean(),
      geometry: aoi,
      scale: sensor === 'Landsat' ? 90 : 30,
      bestEffort: true,
      maxPixels: 1e10
    }).get('NBR')
  );

  var score = mean.subtract(cloud.multiply(0.01));
  return img.set({ 'sensor': sensor, 'dNBR_mean': mean, 'score': score });
}

var lsPostCol = landsatCol(postStart, postEnd).map(function(img) { return scorePost(img, 'Landsat'); });
var s2PostCol = s2Col(postStart, postEnd).map(function(img) { return scorePost(img, 'Sentinel-2'); });

print('Landsat POST count', lsPostCol.size());
print('S2 POST count', s2PostCol.size());

lsPostCol = lsPostCol.sort('score', false);
s2PostCol = s2PostCol.sort('score', false);

var lsChosen = ee.Image(lsPostCol.first());
var s2Chosen = ee.Image(s2PostCol.first());

print('Chosen Landsat product', lsChosen.get('LANDSAT_PRODUCT_ID'));
print('Chosen Landsat time', ee.Date(lsChosen.get('system:time_start')));
print('Chosen Landsat score/dNBR/cloud', lsChosen.get('score'), lsChosen.get('dNBR_mean'), lsChosen.get('CLOUD_COVER'));

print('Chosen S2 product', s2Chosen.get('PRODUCT_ID'));
print('Chosen S2 time', ee.Date(s2Chosen.get('system:time_start')));
print('Chosen S2 score/dN/cloud', s2Chosen.get('score'), s2Chosen.get('dNBR_mean'), s2Chosen.get('CLOUDY_PIXEL_PERCENTAGE'));

// =========================
// Visualize (POST-focused)
// =========================
Map.centerObject(aoi, 14);
Map.addLayer(aoi, { color: 'red' }, FIRE_NAME + ' AOI');

var rgbViz = { min: 0, max: 0.35 };
Map.addLayer(lsRgb(lsChosen), rgbViz, FIRE_NAME + ' Landsat RGB (POST)', true);
Map.addLayer(s2Rgb(s2Chosen), rgbViz, FIRE_NAME + ' Sentinel-2 RGB (POST)', true);

var dnbrViz = { min: -0.1, max: 0.8, palette: ['#1a9850', '#91cf60', '#d9ef8b', '#fee08b', '#fc8d59', '#d73027'] };
var lsChosen_dNBR = lsPreNBR.subtract(lsNBR(lsMaskClouds(lsChosen))).rename('dNBR');
var s2Chosen_dNBR = s2PreNBR.subtract(s2NBR(s2MaskClouds(s2Chosen))).rename('dNBR');

Map.addLayer(lsChosen_dNBR, dnbrViz, FIRE_NAME + ' Landsat dNBR (PRE-POST)', true);
Map.addLayer(s2Chosen_dNBR, dnbrViz, FIRE_NAME + ' Sentinel-2 dNBR (PRE-POST)', true);

function addTopN(col, n, toRgb, labelPrefix) {
  var list = col.toList(n);
  ee.List.sequence(0, n - 1).evaluate(function(ixs) {
    ixs.forEach(function(i) {
      var img = ee.Image(list.get(i));
      Map.addLayer(toRgb(img), rgbViz, labelPrefix + ' #' + (i + 1), false);
    });
  });
}

addTopN(lsPostCol, SHOW_TOP_N, function(img) { return lsRgb(img); }, FIRE_NAME + ' Landsat POST candidate');
addTopN(s2PostCol, SHOW_TOP_N, function(img) { return s2Rgb(img); }, FIRE_NAME + ' S2 POST candidate');

