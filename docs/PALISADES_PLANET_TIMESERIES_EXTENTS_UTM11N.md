# Palisades Planet timeseries crop extents (UTM 11N)

This note records the exact rectangular clip bounds (`gdalwarp -te`) used to crop Planet mosaics for the Palisades fire time series.

CRS: **EPSG:32611** (WGS 84 / UTM zone 11N), units: **meters**.

## 1) 5 km buffer (rectangular clip) - used for the “working” 9043×7014 outputs

GDAL `-te` extent (xmin, ymin, xmax, ymax):

```text
339430.161454  3761512.314136  366559.081503  3782555.078483
```

Example clip command (rectangular crop to same study window):

```bash
gdalwarp -srcalpha -dstalpha -r bilinear ^
  -te 339430.161454 3761512.314136 366559.081503 3782555.078483 ^
  -te_srs EPSG:32611 -t_srs EPSG:32611 ^
  -of GTiff -co COMPRESS=DEFLATE -co TILED=YES -co BIGTIFF=IF_SAFER ^
  -co BLOCKXSIZE=256 -co BLOCKYSIZE=256 ^
  input.tif output.tif
```

## 2) 20 km buffer (rectangular clip) - earlier larger window (bigger files)

GDAL `-te` extent (xmin, ymin, xmax, ymax):

```text
324430.370400  3746516.750019  381555.598909  3797551.544512
```

## How the bounds were derived (conceptual)

1. Start from `palisades-perimeter.shp`
2. Reproject to EPSG:32611
3. Buffer by either **20,000 m** or **5,000 m**
4. Take the buffered geometry’s **axis-aligned bounding box** to form the rectangle
5. Crop rasters to that rectangle using `gdalwarp -te`

