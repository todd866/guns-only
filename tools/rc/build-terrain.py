#!/usr/bin/env python3
"""Convert the approved USGS 3DEP float DEM into the small RC terrain asset."""
import argparse, hashlib, json, math
from pathlib import Path
from PIL import Image

URL = "https://elevation.nationalmap.gov/arcgis/rest/services/3DEPElevation/ImageServer/exportImage?bbox=-115.22%2C36.08%2C-114.86%2C36.40&bboxSR=4326&imageSR=4326&size=257%2C257&format=tiff&pixelType=F32&renderingRule=%7B%22rasterFunction%22%3A+%22None%22%7D&interpolation=RSP_BilinearInterpolation&f=pjson"
ORIGIN = (36.241303, -115.04465775)
R = 6371008.8
DATUM = 569.1

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('input'); ap.add_argument('output'); ap.add_argument('--source', default='terrain-source.json'); ap.add_argument('--retrieved', required=True); a = ap.parse_args()
    im = Image.open(a.input); w, h = im.size
    if (w, h) != (257, 257) or im.mode != 'F': raise SystemExit('expected 257x257 float32 TIFF')
    px = list(im.getdata())
    if not all(math.isfinite(v) for v in px): raise SystemExit('non-finite DEM samples')
    tie, scale = im.tag_v2[33922], im.tag_v2[33550]
    west, north = tie[3] - tie[0]*scale[0], tie[4] + tie[1]*scale[1]
    dlon, dlat = scale[:2]; east, south = west+w*dlon, north-h*dlat
    lat = math.radians(ORIGIN[0]); dx = R*math.cos(lat)*math.radians(dlon); dz = R*math.radians(dlat)
    values = [round(float(v) - DATUM, 1) for v in px]
    out = {'version': 1, 'width': w, 'height': h, 'quantizationM': 0.1, 'units': 'metres relative to airfield OSM datum', 'datumM': DATUM, 'origin': {'lat': ORIGIN[0], 'lon': ORIGIN[1], 'xM': 0, 'southZM': 0}, 'pixelCenter': {'lat': north - dlat/2, 'lon': west + dlon/2}, 'stepM': {'eastX': dx, 'southZ': dz}, 'valuesM': values}
    Path(a.output).write_text(json.dumps(out, separators=(',', ':')) + '\n')
    src = {'source': 'USGS 3DEP Elevation', 'url': URL, 'retrieved': a.retrieved, 'sourceSHA256': hashlib.sha256(Path(a.input).read_bytes()).hexdigest(), 'actualExtent': {'xmin': west, 'ymin': south, 'xmax': east, 'ymax': north, 'spatialReference': 'EPSG:4326'}, 'width': w, 'height': h, 'pixelCenterGeoreferencing': True, 'units': 'metres', 'quantizationM': 0.1, 'datum': '569.1 m airfield OSM datum', 'epistemic': 'surrogate', 'note': 'DEM is USGS 3DEP terrain, not a survey; datum is the airfield OSM reference.'}
    Path(a.source).write_text(json.dumps(src, indent=2) + '\n')
if __name__ == '__main__': main()
