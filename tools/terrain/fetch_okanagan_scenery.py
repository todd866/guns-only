#!/usr/bin/env python3
"""Author Okanagan terrain and Peachland scenery from public RDCO GIS services.

Requires Python 3, numpy and Pillow. Network responses are cached by request hash.
No aerial imagery, addresses, owner details or editor identities are imported.
Run from any directory; review the two content copies and source manifest afterward.
"""
from __future__ import annotations

import hashlib
import io
import json
import math
import os
from pathlib import Path
import tempfile
import time
import urllib.parse
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed

import numpy as np
from PIL import Image
from shapely.geometry import Polygon, LineString, box
from shapely.prepared import prep
from scipy.ndimage import distance_transform_edt, map_coordinates

ROOT = Path(__file__).resolve().parents[2]
CACHE = Path(os.environ.get("OKANAGAN_GIS_CACHE", Path(tempfile.gettempdir()) / "guns-okanagan-rdco-v1"))
BASE = "https://www.rdcogis.com/arcgis/rest/services/"
PCH = BASE + "DataDownload/PCH_DataDownload/MapServer/"
LIDAR = BASE + "ElevationSources/RDCO_Elevations_LiDAR2018/ImageServer"
LICENSE = "https://gis-rdco.hub.arcgis.com/pages/open-data-license"
ATTRIBUTION = "Contains information licensed under the Open Government License – Regional District of Central Okanagan."
BOUNDS = dict(south=49.68, north=50.08, west=-119.86, east=-119.24)
REQUESTS = []


def cdem_grid(bounds, rows=257, columns=257):
    """Regional coverage comes from CDEM; the municipal LiDAR has coverage holes outside town."""
    endpoint = "https://geogratis.gc.ca/services/elevation/cdem/profile"
    heights = [None] * rows
    def row_profile(row):
        latitude = bounds["south"] + (bounds["north"] - bounds["south"]) * row / (rows - 1)
        params = dict(path=f"LINESTRING({bounds['west']} {latitude:.7f},{bounds['east']} {latitude:.7f})", steps=columns - 1)
        body = fetch(endpoint + "?" + urllib.parse.urlencode(params))
        if not isinstance(body, list) or len(body) < columns - 2:
            raise ValueError("Incomplete CDEM profile")
        coordinates = np.array([sample["geometry"]["coordinates"] for sample in body])
        elevations = np.array([sample["altitude"] for sample in body], dtype=float)
        gaps = np.diff(coordinates[:, 0])
        if not np.isfinite(elevations).all() or (np.abs(coordinates[:, 1] - latitude) > 0.00006).any():
            raise ValueError("Missing CDEM elevation or wrong row latitude")
        if (gaps <= 0).any() or gaps.max() > (bounds["east"] - bounds["west"]) / (columns - 1) * 1.5:
            raise ValueError("CDEM profile has unordered or missing coordinates")
        if abs(coordinates[0, 0] - bounds["west"]) > 0.00006 or abs(coordinates[-1, 0] - bounds["east"]) > 0.00006:
            raise ValueError("CDEM profile does not cover the requested bounds")
        # The service rounds coordinates and sometimes adds a point. Use its actual coordinates.
        return row, np.round(np.interp(np.linspace(bounds["west"], bounds["east"], columns), coordinates[:, 0], elevations), 1).tolist()
    with ThreadPoolExecutor(max_workers=4) as pool:
        futures = [pool.submit(row_profile, row) for row in range(rows)]
        for completed, future in enumerate(as_completed(futures), 1):
            row, values = future.result()
            heights[row] = values
            if completed % 16 == 0 or completed == rows:
                print(f"CDEM {completed}/{rows} rows", flush=True)
    return dict(bounds=bounds, rows=rows, columns=columns, elevationsM=heights)


def fetch(url, *, binary=False):
    CACHE.mkdir(parents=True, exist_ok=True)
    key = hashlib.sha256(url.encode()).hexdigest()
    target = CACHE / key
    if not target.exists():
        for attempt in range(4):
            try:
                request = urllib.request.Request(url, headers={"User-Agent": "GunsOnly-SceneryAuthoring/1"})
                with urllib.request.urlopen(request, timeout=90) as response:
                    data = response.read(32 * 1024 * 1024 + 1)
                if len(data) > 32 * 1024 * 1024:
                    raise ValueError("Public dataset response exceeded 32 MiB limit")
                if not binary and "error" in json.loads(data):
                    raise ValueError(data.decode()[:500])
                target.write_bytes(data)
                break
            except Exception:
                if attempt == 3:
                    raise
                time.sleep(1 + attempt * 2)
    data = target.read_bytes()
    REQUESTS.append(dict(url=url, sha256=hashlib.sha256(data).hexdigest(), bytes=len(data)))
    return data if binary else json.loads(data)


def query(layer, fields, where="1=1"):
    """Follow pagination, ordered by stable object IDs, and reject incomplete geometry."""
    features = []
    while True:
        params = dict(f="geojson", where=where, outFields=fields, outSR=4326,
                      orderByFields="OBJECTID", resultOffset=len(features), resultRecordCount=1000)
        body = fetch(layer + "/query?" + urllib.parse.urlencode(params))
        batch = body.get("features", [])
        features.extend(batch)
        more = body.get("exceededTransferLimit") or body.get("properties", {}).get("exceededTransferLimit")
        if not more:
            break
        if not batch:
            raise ValueError(f"Empty truncated page from {layer}")
    ids = [feature["properties"]["OBJECTID"] for feature in features]
    if len(set(ids)) != len(ids) or any(not feature.get("geometry") for feature in features):
        raise ValueError(f"Duplicate IDs or missing geometry from {layer}")
    print(f"{layer.rsplit('/', 1)[-1]}: {len(features)} features", flush=True)
    return features


def raster_grid(bounds, rows, columns):
    """Ask for pixel centres at grid nodes, including both boundary nodes (no half-cell shift)."""
    dx = (bounds["east"] - bounds["west"]) / (columns - 1)
    dy = (bounds["north"] - bounds["south"]) / (rows - 1)
    bbox = [bounds["west"] - dx / 2, bounds["south"] - dy / 2,
            bounds["east"] + dx / 2, bounds["north"] + dy / 2]
    params = dict(f="json", bbox=",".join(map(str, bbox)), bboxSR=4326, imageSR=4326,
                  size=f"{columns},{rows}", format="tiff", pixelType="F32",
                  interpolation="RSP_BilinearInterpolation", renderingRule='{"rasterFunction":"None"}',
                  adjustAspectRatio="false")
    metadata = fetch(LIDAR + "/exportImage?" + urllib.parse.urlencode(params))
    actual = metadata["extent"]
    for key, expected in zip(["xmin", "ymin", "xmax", "ymax"], bbox):
        if abs(actual[key] - expected) > 1e-8:
            raise ValueError("Elevation service changed the requested raster extent")
    if (metadata["width"], metadata["height"]) != (columns, rows):
        raise ValueError("Elevation service changed the requested raster dimensions")
    image = Image.open(io.BytesIO(fetch(metadata["href"], binary=True)))
    if image.mode != "F" or image.size != (columns, rows):
        raise ValueError("Expected a single-band float elevation raster, not a rendered image")
    # GeoTIFF tie point is its northwest corner; row zero in our format is SOUTH.
    scale = image.tag_v2[33550]
    tie = image.tag_v2[33922]
    if abs(scale[0] - dx) > 1e-9 or abs(scale[1] - dy) > 1e-9:
        raise ValueError("GeoTIFF pixel size disagrees with the request")
    if abs(tie[3] + dx / 2 - bounds["west"]) > 1e-8 or abs(tie[4] - dy / 2 - bounds["north"]) > 1e-8:
        raise ValueError("GeoTIFF pixel centres do not align with terrain nodes")
    heights = np.flipud(np.asarray(image, dtype=np.float64))
    if not np.isfinite(heights).all() or heights.min() < 300 or heights.max() > 3000:
        raise ValueError("Elevation raster contains NoData or out-of-range heights")
    print(f"LiDAR {rows}×{columns}: {heights.min():.1f}–{heights.max():.1f} m", flush=True)
    return dict(bounds=bounds, rows=rows, columns=columns, elevationsM=np.round(heights, 1).tolist())


def rounded(value):
    if isinstance(value, list):
        return [rounded(child) for child in value]
    return round(value, 7) if isinstance(value, (int, float)) else value


def polygons(feature):
    geometry = feature["geometry"]
    if geometry["type"] == "Polygon":
        return [rounded(geometry["coordinates"])]
    if geometry["type"] == "MultiPolygon":
        return rounded(geometry["coordinates"])
    raise ValueError(f"Expected polygon, got {geometry['type']}")


def clip_ring(ring, bounds):
    """Sutherland–Hodgman clipping to the rectangular flight region."""
    points = ring[:-1] if ring[0] == ring[-1] else ring[:]
    for axis, edge, sign in [(0, bounds["west"], 1), (0, bounds["east"], -1),
                             (1, bounds["south"], 1), (1, bounds["north"], -1)]:
        result = []
        for i, b in enumerate(points):
            a = points[i - 1]
            a_in, b_in = (a[axis] - edge) * sign >= 0, (b[axis] - edge) * sign >= 0
            if a_in != b_in:
                t = (edge - a[axis]) / (b[axis] - a[axis])
                result.append([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])])
            if b_in:
                result.append(b)
        points = result
    return rounded(points)


def shoreline_topology(grid, shoreline, islands=()):
    """Clip only coastal cells. This stops steep land triangles protruding through the lake."""
    lake = Polygon(shoreline, islands)
    if not lake.is_valid:
        raise ValueError("Mapped lake polygon is invalid")
    boundary = prep(lake.boundary)
    water = prep(lake)
    b, rows, columns = grid["bounds"], grid["rows"], grid["columns"]
    dx, dy = (b["east"] - b["west"]) / (columns - 1), (b["north"] - b["south"]) / (rows - 1)
    coast, submerged = [], []
    for row in range(rows - 1):
        south = b["south"] + row * dy
        for column in range(columns - 1):
            west = b["west"] + column * dx
            cell = box(west, south, west + dx, south + dy)
            key = row * (columns - 1) + column
            if boundary.intersects(cell):
                land = cell.difference(lake)
                parts = [land] if land.geom_type == "Polygon" else list(land.geoms)
                rings = []
                for part in parts:
                    if part.geom_type != "Polygon" or part.area < 1e-14:
                        continue
                    rings.append(rounded([list(map(list, part.exterior.coords))]
                                         + [list(map(list, ring.coords)) for ring in part.interiors]))
                coast.append([key, rings])
            elif water.contains(cell):
                submerged.append(key)
    grid["shoreCells"] = coast
    grid["waterCells"] = submerged
    print(f"Coast topology {rows}×{columns}: {len(coast)} clipped cells, {len(submerged)} submerged cells", flush=True)


def orthophoto(bounds, rows, columns):
    service = BASE + "Orthos/Orthos_2024/ImageServer"
    params = dict(f="json", bbox=",".join(str(bounds[key]) for key in ["west", "south", "east", "north"]),
                  bboxSR=4326, imageSR=4326, size="4096,4096", format="jpg", compressionQuality=92,
                  bandIds="0,1,2", adjustAspectRatio="false")
    metadata = fetch(service + "/exportImage?" + urllib.parse.urlencode(params))
    for key, source_key in [("xmin", "west"), ("ymin", "south"), ("xmax", "east"), ("ymax", "north")]:
        if abs(metadata["extent"][key] - bounds[source_key]) > 1e-8:
            raise ValueError("Orthophoto extent does not match the terrain patch")
    data = fetch(metadata["href"], binary=True)
    with Image.open(io.BytesIO(data)) as image:
        if image.size != (4096, 4096):
            raise ValueError("Unexpected orthophoto dimensions")
        rgb = np.asarray(image.convert("RGB"))
        coverage = distance_transform_edt(np.max(rgb, axis=2) > 8)
        # Public orthophotos stop at their flown coverage. Fade to regional ground colours over
        # ~150 m at NoData edges; never turn missing imagery into black terrain.
        yy, xx = np.meshgrid(np.linspace(4095, 0, rows), np.linspace(0, 4095, columns), indexing="ij")
        coverage = np.round(np.clip(map_coordinates(coverage, [yy, xx], order=1) / 50, 0, 1) * 255).astype(int).tolist()
    for prefix in ["content", "web/wwwroot/content"]:
        (ROOT / prefix / "packs/okanagan-fire/environment/peachland-2024.jpg").write_bytes(data)
    fallback_service = BASE + "Orthos/Orthos_2018/ImageServer"
    fallback_meta = fetch(fallback_service + "/exportImage?" + urllib.parse.urlencode(params))
    for key, source_key in [("xmin", "west"), ("ymin", "south"), ("xmax", "east"), ("ymax", "north")]:
        if abs(fallback_meta["extent"][key] - bounds[source_key]) > 1e-8:
            raise ValueError("Fallback orthophoto extent does not match the terrain patch")
    fallback_data = fetch(fallback_meta["href"], binary=True)
    with Image.open(io.BytesIO(fallback_data)) as fallback_image:
        if fallback_image.size != (4096, 4096) or np.mean(np.max(np.asarray(fallback_image), axis=2) > 8) < 0.995:
            raise ValueError("2018 fallback must cover the full Peachland patch")
    for prefix in ["content", "web/wwwroot/content"]:
        (ROOT / prefix / "packs/okanagan-fire/environment/peachland-2018.jpg").write_bytes(fallback_data)
    return dict(url="/content/packs/okanagan-fire/environment/peachland-2024.jpg", bounds=bounds,
                source=service, imageryYear=2024, width=4096, height=4096,
                sha256=hashlib.sha256(data).hexdigest(), license=LICENSE, attribution=ATTRIBUTION,
                coverage=coverage,
                fallback=dict(url="/content/packs/okanagan-fire/environment/peachland-2018.jpg", source=fallback_service,
                              imageryYear=2018, sha256=hashlib.sha256(fallback_data).hexdigest()),
                processing="RDCO georeferenced RGB orthophoto export, bilinear reprojection to WGS84; approximately 3 m per pixel.")


def author():
    base = cdem_grid(BOUNDS)
    # Boundaries align exactly with coarse rows 24..88 and columns 12..84.
    # The sixfold interior subdivision samples Peachland at about 29–30 m.
    detail_bounds = dict(south=49.7175, north=49.8175, west=-119.8309375, east=-119.6565625)
    detail = raster_grid(detail_bounds, 385, 433)
    detail.update(id="peachland", blendCells=1,
                  parentWindow=dict(rowStart=24, rowEnd=88, columnStart=12, columnEnd=84))
    source = dict(authority="Regional District of Central Okanagan; OBWB; GeoBC",
                  product="2018–2019 LiDAR bare-earth elevation", service=LIDAR,
                  retrievedUtc=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                  verticalUnit="metre", verticalDatum="CGVD2013", epistemic="measured",
                  processing="Bilinear float raster export; grid nodes at pixel centres; rows flipped south-to-north; rounded to 0.1 m. Sampling spacing is not survey accuracy.",
                  license=LICENSE, attribution=ATTRIBUTION)
    terrain = dict(schema="guns-only.terrain.cdem-grid.v1", terrainId="terrain.canada.okanagan-central.cdem.v1",
                   source=dict(authority="Natural Resources Canada", product="Canadian Digital Elevation Model",
                               service="https://geogratis.gc.ca/services/elevation/cdem/profile", epistemic="measured",
                               retrievedUtc=source["retrievedUtc"], verticalUnit="metre",
                               processing="East-west profiles resampled using returned coordinates; heights rounded to 0.1 m."),
                   anchor=dict(latitude=49.88, longitude=-119.5), **base, details=[detail])
    detail["source"] = source
    detail["texture"] = orthophoto(detail_bounds, detail["rows"], detail["columns"])
    buildings = query(PCH + "6", "OBJECTID,TYPE,TYPE_DETAIL,BUILDING_HEIGHT,BUILDING_GROUND_ELEVATION")
    roads = query(PCH + "2", "OBJECTID,FullName,StreetType")
    parks = query(PCH + "18", "OBJECTID,PARK_NAME")
    highways = query(BASE + "GIS_App/GIS_App_BASE/MapServer/20", "OBJECTID,ROADNAME", "ROADNAME LIKE '%97%'")
    lakes = query(BASE + "Basemaps/RDCO_Basemap/MapServer/41", "OBJECTID,Lake_Name", "Lake_Name LIKE '%Okanagan%'")
    if len(lakes) != 1:
        raise ValueError("Expected exactly one Okanagan Lake feature")
    lake_rings = max(polygons(lakes[0]), key=lambda polygon: len(polygon[0]))
    lake_geometry = Polygon(lake_rings[0], lake_rings[1:]).intersection(
        box(BOUNDS["west"], BOUNDS["south"], BOUNDS["east"], BOUNDS["north"]))
    # Keep island holes, including Rattlesnake Island opposite Peachland.
    lake_geometry = lake_geometry.simplify(0.00004, preserve_topology=True)
    shoreline = rounded(list(map(list, lake_geometry.exterior.coords)))[:-1]
    islands = [rounded(list(map(list, ring.coords)))[:-1] for ring in lake_geometry.interiors]
    shoreline_topology(terrain, shoreline, islands)
    shoreline_topology(detail, shoreline, islands)
    mapped_buildings = []
    for feature in buildings:
        p = feature["properties"]
        height = p.get("BUILDING_HEIGHT")
        measured_height = isinstance(height, (int, float)) and math.isfinite(height) and 1 < height < 100
        mapped_buildings.append(dict(id=p["OBJECTID"], kind=p["TYPE"], polygons=polygons(feature),
                                     heightM=round(height, 1) if measured_height else (3 if p["TYPE"] == "Outbuilding" else 7),
                                     heightEpistemic="measured" if measured_height else "surrogate"))
    mapped_roads = []
    for feature in roads:
        p, g = feature["properties"], feature["geometry"]
        paths = [g["coordinates"]] if g["type"] == "LineString" else g["coordinates"]
        name = p["FullName"] or "Local road"
        mapped_roads.append(dict(id=p["OBJECTID"], name=name, paths=rounded(paths),
                                 widthM=16 if "97" in name else 8, widthEpistemic="surrogate"))
    peachland = dict(epistemic="measured", sources=dict(buildings=PCH + "6", roads=PCH + "2", parks=PCH + "18"),
                     license=LICENSE, attribution=ATTRIBUTION, bounds=detail_bounds,
                     buildings=mapped_buildings, roads=mapped_roads,
                     parks=[dict(id=f["properties"]["OBJECTID"], name=f["properties"]["PARK_NAME"], polygons=polygons(f)) for f in parks],
                     limitations="Footprints and valid heights are mapped; roof forms, materials and road widths are visual surrogates. Elevation is 2018–2019 LiDAR; this is not a live survey.")
    world_path = ROOT / "content/packs/okanagan-fire/environment/okanagan-central.world.json"
    world = json.loads(world_path.read_text())
    highway = next(road for road in world["roads"] if road["id"] == "highway-97")
    highway.pop("points", None)
    highway["epistemic"] = "measured"
    highway["widthEpistemic"] = "surrogate"
    highway["source"] = BASE + "GIS_App/GIS_App_BASE/MapServer/20"
    highway["paths"] = []
    clip = box(BOUNDS["west"], BOUNDS["south"], BOUNDS["east"], BOUNDS["north"])
    for feature in highways:
        if feature["properties"]["ROADNAME"] != "97":
            continue
        for line in feature["geometry"]["coordinates"]:
            clipped = LineString(line).intersection(clip)
            parts = [clipped] if clipped.geom_type == "LineString" else list(clipped.geoms)
            for part in parts:
                if part.geom_type == "LineString" and not part.is_empty:
                    highway["paths"].append(rounded(list(map(list, part.coords))))
    world["peachland"] = peachland
    world["lake"]["shoreline"] = shoreline
    world["lake"]["islands"] = islands
    world["sources"]["shoreline"] = "Regional District of Central Okanagan mapped Okanagan Lake"
    world["sources"]["shorelineUrl"] = BASE + "Basemaps/RDCO_Basemap/MapServer/41"
    world["sources"]["terrain"] = terrain["source"]
    world["sources"]["peachlandTerrain"] = source
    world["sources"]["peachlandLandCover"] = {key:value for key,value in detail["texture"].items() if key != "coverage"}
    world["sources"]["attribution"] = ATTRIBUTION
    world["sources"]["license"] = LICENSE
    world["sources"]["vegetation"] = "Procedural approximation of BC dry-interior ponderosa pine and Douglas-fir ecology; not mapped tree positions."
    for prefix in ["content", "web/wwwroot/content"]:
        directory = ROOT / prefix / "packs/okanagan-fire/environment"
        for name, data in [("okanagan-central.cdem.json", terrain), ("okanagan-central.world.json", world)]:
            target = directory / name
            temporary = target.with_suffix(".json.tmp")
            temporary.write_text(json.dumps(data, separators=(",", ":"), ensure_ascii=False) + "\n")
            temporary.replace(target)
    manifest = dict(retrievedUtc=source["retrievedUtc"], requests=REQUESTS,
                    counts=dict(buildings=len(buildings), roads=len(roads), parks=len(parks), shorelineVertices=len(shoreline)),
                    license=LICENSE, attribution=ATTRIBUTION)
    (CACHE / "manifest.json").write_text(json.dumps(manifest, indent=2) + "\n")
    print(json.dumps(manifest["counts"]), flush=True)
    print(f"Source response hashes: {CACHE / 'manifest.json'}", flush=True)


if __name__ == "__main__":
    author()
