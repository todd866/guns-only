#!/usr/bin/env python3
"""Extend the measured Okanagan scenery to the valley's ski mountains.

Run fetch_okanagan_scenery.py first. Requires numpy, scipy, Pillow, shapely,
tifffile and pyproj. OSM-derived resort data remains a separate ODbL database.
No map service is contacted by the game at runtime.
"""
from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import time
import urllib.parse
import urllib.request
import zipfile

import numpy as np
from pyproj import Transformer
from scipy.ndimage import map_coordinates
import tifffile
from shapely.geometry import Polygon, LineString, box

import fetch_okanagan_scenery as scenery

TILE_CACHE = Path(os.environ.get("OKANAGAN_CDEM_TILE_CACHE", "/tmp"))
ROOT_BOUNDS = dict(south=49.08, north=50.48, west=-119.995625, east=-118.755625)
ROWS, COLUMNS = 449, 257
RESORTS = [
    dict(id="big-white", name="Big White", rowStart=192, rowEnd=228, columnStart=196, columnEnd=236,
         mapUrl="https://www.bigwhite.com/sites/default/files/inline-files/BWSR-Alpine-Trail-Map-2025-WEB.pdf",
         villageUrl="https://www.bigwhite.com/sites/default/files/inline-files/BW-25-RS-452-Village-Map-Full-Web.pdf"),
    dict(id="silverstar", name="SilverStar", rowStart=392, rowEnd=424, columnStart=176, columnEnd=220,
         mapUrl="https://www.skisilverstar.com/the-mountain/mountain-maps/"),
    dict(id="apex", name="Apex Mountain", rowStart=80, rowEnd=112, columnStart=4, columnEnd=28,
         mapUrl="https://apexresort.com/wp-content/uploads/2023/11/Trail-Map.pdf"),
    dict(id="baldy", name="Baldy Mountain", rowStart=12, rowEnd=44, columnStart=144, columnEnd=172,
         mapUrl="https://baldyresort.com/"),
]


class CdemTiles:
    def __init__(self):
        self.tiles = {}
        self.sources = []
        self.projection = Transformer.from_crs(4326, 4617, always_xy=True)
        for tile in ["082E", "082L"]:
            url = f"https://ftp.maps.canada.ca/pub/nrcan_rncan/elevation/cdem_mnec/082/cdem_dem_{tile}_tif.zip"
            archive = TILE_CACHE / f"okanagan-cdem-{tile}.zip"
            if not archive.exists():
                TILE_CACHE.mkdir(parents=True, exist_ok=True)
                with urllib.request.urlopen(url, timeout=120) as response:
                    raw = response.read(64 * 1024 * 1024 + 1)
                if len(raw) > 64 * 1024 * 1024:
                    raise ValueError("CDEM archive exceeded the download limit")
                archive.write_bytes(raw)
            tiff = TILE_CACHE / f"okanagan-cdem-{tile}.tif"
            if not tiff.exists():
                with zipfile.ZipFile(archive) as z:
                    tiff.write_bytes(z.read(f"cdem_dem_{tile}.tif"))
            with tifffile.TiffFile(tiff) as t:
                page = t.pages[0]
                scale, tie = page.tags[33550].value, page.tags[33922].value
                keys = page.tags[34735].value
                key_values = {keys[i]: keys[i + 3] for i in range(4, len(keys), 4) if keys[i + 1] == 0}
                if key_values.get(2048) != 4617 or key_values.get(1025) != 1:
                    raise ValueError("Unexpected CDEM CRS or pixel interpretation")
                # RasterPixelIsArea: first sample is half a pixel inside the northwest corner.
                self.tiles[tile] = (page.asarray(), tie[3] + scale[0] / 2, tie[4] - scale[1] / 2, scale[0], scale[1])
            self.sources.append(dict(url=url, sha256=hashlib.sha256(archive.read_bytes()).hexdigest()))

    def grid(self, bounds, rows, columns):
        latitude, longitude = np.meshgrid(np.linspace(bounds["south"], bounds["north"], rows),
                                         np.linspace(bounds["west"], bounds["east"], columns), indexing="ij")
        lon, lat = self.projection.transform(longitude, latitude)
        heights = np.empty((rows, columns), dtype=float)
        for key, mask in [("082E", lat < 50), ("082L", lat >= 50)]:
            pixels, west, north, dx, dy = self.tiles[key]
            x, y = (lon[mask] - west) / dx, (north - lat[mask]) / dy
            if len(x) == 0:
                continue
            if min(x.min(), y.min()) < 0 or x.max() > pixels.shape[1] - 1 or y.max() > pixels.shape[0] - 1:
                raise ValueError("Requested terrain lies outside the source CDEM tiles")
            heights[mask] = map_coordinates(pixels, [y, x], order=1, output=np.float64, prefilter=False)
        if not np.isfinite(heights).all() or heights.min() < 250 or heights.max() > 3000:
            raise ValueError("Resort terrain contains missing or invalid elevation samples")
        return dict(bounds=bounds, rows=rows, columns=columns, elevationsM=np.round(heights, 1).tolist())


def resort_bounds(r):
    b = ROOT_BOUNDS
    dx, dy = (b["east"] - b["west"]) / (COLUMNS - 1), (b["north"] - b["south"]) / (ROWS - 1)
    return dict(south=round(b["south"] + r["rowStart"] * dy, 9), north=round(b["south"] + r["rowEnd"] * dy, 9),
                west=round(b["west"] + r["columnStart"] * dx, 9), east=round(b["west"] + r["columnEnd"] * dx, 9))


def osm_data(resort, bounds):
    cache = Path(os.environ.get("OKANAGAN_OSM_CACHE", "/tmp")) / f"okanagan-{resort['id']}-osm.json"
    if not cache.exists():
        bbox = ",".join(str(bounds[key]) for key in ["south", "west", "north", "east"])
        query = f'[out:json][timeout:45];(way["aerialway"]({bbox});way["piste:type"]({bbox});way["building"]({bbox});way["highway"]({bbox}););out tags geom;'
        request = urllib.request.Request("https://overpass-api.de/api/interpreter",
            data=urllib.parse.urlencode(dict(data=query)).encode(),
            headers={"User-Agent": "GunsOnly-SceneryAuthoring/1", "Accept": "application/json"})
        with urllib.request.urlopen(request, timeout=70) as response:
            raw = response.read(12 * 1024 * 1024 + 1)
        if len(raw) > 12 * 1024 * 1024:
            raise ValueError("Resort map exceeded the bounded query limit")
        cache.write_bytes(raw)
        time.sleep(30)  # Public Overpass authoring only; no concurrent scripts or runtime queries.
    raw = cache.read_bytes()
    source = json.loads(raw)
    if source.get("remark") or not source.get("elements"):
        raise ValueError(f"Incomplete OSM extract for {resort['name']}")
    result = dict(id=resort["id"], name=resort["name"], bounds=bounds, buildings=[], roads=[], runs=[], lifts=[],
                  source=dict(authority="OpenStreetMap contributors", license="https://opendatacommons.org/licenses/odbl/1-0/",
                              attribution="© OpenStreetMap contributors", timestamp=source["osm3s"]["timestamp_osm_base"],
                              responseSha256=hashlib.sha256(raw).hexdigest(), operatorMap=resort["mapUrl"]),
                  limitations="Mapped geometry, not a survey. Building heights, roof forms, run widths and intermediate lift towers are visual surrogates unless tagged in the source.")
    for feature in source["elements"]:
        tags = feature.get("tags", {})
        points = [[p["lon"], p["lat"]] for p in feature.get("geometry", [])]
        if len(points) < 2:
            continue
        if "building" in tags and len(points) >= 4 and points[0] == points[-1]:
            height = tags.get("height")
            try:
                height = float(str(height).removesuffix(" m"))
            except ValueError:
                height = 9 if tags["building"] in ["hotel", "apartments", "commercial"] else 6
            height = min(40, max(2, height))
            result["buildings"].append(dict(id=feature["id"], name=tags.get("name", ""), kind=tags["building"],
                polygons=[[points]], heightM=height, heightEpistemic="mapped" if "height" in tags else "surrogate"))
        if "highway" in tags and tags["highway"] not in ["path", "footway", "steps", "cycleway"]:
            result["roads"].append(dict(id=feature["id"], name=tags.get("name", "Resort access"), paths=[points],
                widthM=5 if tags["highway"] == "track" else 8, widthEpistemic="surrogate"))
        if tags.get("piste:type") in ["downhill", "nordic"]:
            result["runs"].append(dict(id=feature["id"], name=tags.get("name", "Ski run"), points=points,
                kind=tags["piste:type"], widthM=8 if tags["piste:type"] == "nordic" else 38,
                widthEpistemic="surrogate", area=tags.get("area") == "yes"))
        if tags.get("aerialway") in ["chair_lift", "gondola", "t-bar", "rope_tow", "magic_carpet"]:
            result["lifts"].append(dict(id=feature["id"], name=tags.get("name", "Lift"), kind=tags["aerialway"], points=points))
    # Overpass returns complete ways intersecting the query. Long access roads must stop at the
    # authored detail boundary instead of draping clamped heights outside the mapped patch.
    extent = box(bounds["west"], bounds["south"], bounds["east"], bounds["north"])
    def clip_line(points):
        clipped = LineString(points).intersection(extent)
        parts = [clipped] if clipped.geom_type == "LineString" else list(getattr(clipped, "geoms", []))
        return [scenery.rounded(list(map(list, part.coords))) for part in parts if part.geom_type == "LineString" and not part.is_empty]
    for road in result["roads"]:
        road["paths"] = [part for path in road["paths"] for part in clip_line(path)]
    result["roads"] = [road for road in result["roads"] if road["paths"]]
    result["runs"] = [run if run["area"] else dict(run, points=part, part=index)
                      for run in result["runs"]
                      for index, part in enumerate([run["points"]] if run["area"] else clip_line(run["points"]))]
    result["source"]["processing"] = "Cached Overpass way geometry; access-road and run lines clipped to the authored bounds. Bounds describe the rendered patch, not a claim of complete mapping coverage."
    print(resort["name"], {key:len(result[key]) for key in ["buildings", "roads", "runs", "lifts"]}, flush=True)
    return result


def author():
    directory = scenery.ROOT / "content/packs/okanagan-fire/environment"
    existing = json.loads((directory / "okanagan-central.cdem.json").read_text())
    central = next(grid for grid in existing["details"] if grid["id"] == "central-okanagan") if existing.get("id") == "okanagan-valley" else existing
    tiles = CdemTiles()
    terrain = tiles.grid(ROOT_BOUNDS, ROWS, COLUMNS)
    terrain.update(schema="guns-only.terrain.cdem-grid.v1", terrainId="terrain.canada.okanagan-central.cdem.v1", id="okanagan-valley",
                   anchor=dict(latitude=49.88, longitude=-119.5),
                   source=dict(authority="Natural Resources Canada", product="Canadian Digital Elevation Model", archives=tiles.sources,
                       horizontalDatum="NAD83(CSRS), EPSG:4617", verticalUnit="metre", epistemic="measured",
                       processing="GeoTIFF pixel-centre sampling; WGS84 coordinates projected to source CRS; bilinear interpolation; rounded to 0.1 m."))
    central.update(id="central-okanagan", blendCells=1, parentWindow=dict(rowStart=192,rowEnd=320,columnStart=28,columnEnd=156))
    terrain["details"] = [central]
    world = json.loads((directory / "okanagan-central.world.json").read_text())
    raw_lake = scenery.query(scenery.BASE + "Basemaps/RDCO_Basemap/MapServer/41", "OBJECTID,Lake_Name", "Lake_Name LIKE '%Okanagan%'")[0]
    rings = scenery.polygons(raw_lake)[0]
    lake = Polygon(rings[0], rings[1:]).intersection(box(ROOT_BOUNDS["west"],ROOT_BOUNDS["south"],ROOT_BOUNDS["east"],ROOT_BOUNDS["north"]))
    lake = lake.simplify(0.00004, preserve_topology=True)
    world["lake"]["shoreline"] = scenery.rounded(list(map(list,lake.exterior.coords)))[:-1]
    world["lake"]["islands"] = [scenery.rounded(list(map(list,ring.coords)))[:-1] for ring in lake.interiors]
    shoreline, islands = world["lake"]["shoreline"], world["lake"]["islands"]
    scenery.shoreline_topology(terrain, shoreline, islands)
    resorts = []
    for r in RESORTS:
        bounds = resort_bounds(r)
        rows = (r["rowEnd"] - r["rowStart"]) * 6 + 1
        columns = (r["columnEnd"] - r["columnStart"]) * 6 + 1
        detail = tiles.grid(bounds, rows, columns)
        detail.update(id=r["id"], blendCells=1, parentWindow={key:r[key] for key in ["rowStart","rowEnd","columnStart","columnEnd"]})
        scenery.shoreline_topology(detail, shoreline, islands)
        terrain["details"].append(detail)
        resorts.append(osm_data(r, bounds))
    database = dict(schema="guns-only.okanagan-resorts.v1", license="https://opendatacommons.org/licenses/odbl/1-0/",
                    attribution="© OpenStreetMap contributors", resorts=resorts)
    world["sources"]["valleyTerrain"] = terrain["source"]
    world["sources"]["resorts"] = dict(url="okanagan-resorts.osm.json", license=database["license"], attribution=database["attribution"])
    for prefix in ["content", "web/wwwroot/content"]:
        destination = scenery.ROOT / prefix / "packs/okanagan-fire/environment"
        for filename, data in [("okanagan-central.cdem.json",terrain), ("okanagan-central.world.json",world), ("okanagan-resorts.osm.json",database)]:
            target = destination / filename
            temporary = target.with_suffix(".json.tmp")
            temporary.write_text(json.dumps(data,separators=(",",":"),ensure_ascii=False)+"\n")
            temporary.replace(target)


if __name__ == "__main__":
    author()
