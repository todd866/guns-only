#!/usr/bin/env python3
"""Build paged, source-resolution Korean terrain for bounded browser streaming."""

from __future__ import annotations

import argparse
from collections import OrderedDict, defaultdict
import hashlib
import json
import math
from pathlib import Path
import re

import numpy as np
import PIL
from PIL import Image
from scipy.ndimage import map_coordinates

from build_korea_terrain import (
    QUANTIZATION_METRES,
    WATER_SENTINEL,
    sha256_bytes,
    sha256_file,
    utm_to_wgs84,
    wgs84_to_utm,
)


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LOCK = ROOT / "content/sources/korea-terrain-source-lock.json"
DEFAULT_OUTPUT = ROOT / "content/packs/korea-1950s/environment/terrain-atlas"
TILE_SPAN_METRES = 8_192.0
PAGE_SPAN_METRES = 131_072.0
LOD_SAMPLES = (257, 129, 65, 33)
CELL_PATTERN = re.compile(r"^N(?P<latitude>\d{2})E(?P<longitude>\d{3})$")


def stable_seed(namespace: str) -> int:
    return int.from_bytes(hashlib.sha256(namespace.encode("utf-8")).digest()[:4], "little")


def quantize(height: np.ndarray, water: np.ndarray) -> np.ndarray:
    quantized = np.rint(height / QUANTIZATION_METRES)
    if np.any(quantized < -32767) or np.any(quantized > 32767):
        raise ValueError("height exceeds signed 16-bit decimetre runtime encoding")
    result = quantized.astype("<i2")
    result[water] = WATER_SENTINEL
    return result


def parse_cell(cell: str) -> tuple[int, int]:
    match = CELL_PATTERN.fullmatch(cell)
    if not match:
        raise ValueError(f"unsupported Copernicus cell identifier: {cell}")
    return int(match.group("latitude")), int(match.group("longitude"))


def cell_name(latitude: int, longitude: int) -> str:
    return f"N{latitude:02d}E{longitude:03d}"


def coverage_cells(aoi_wgs84: list[float]) -> list[str]:
    west, south, east, north = aoi_wgs84
    return [
        cell_name(latitude, longitude)
        for latitude in range(math.floor(south), math.ceil(north))
        for longitude in range(math.floor(west), math.ceil(east))
    ]


def region_from_lock(source_lock: dict[str, object], region_id: str) -> dict[str, object]:
    region = next(
        (item for item in source_lock["runtimeRegions"] if item["id"] == region_id),
        None,
    )
    if region is not None:
        return region
    coverage = source_lock["canonicalCoverage"]
    if coverage["id"] != region_id:
        raise ValueError(f"unknown runtime region or canonical coverage: {region_id}")
    return {
        "id": region_id,
        "displayName": "Korean peninsula",
        "aoiWgs84": coverage["aoiWgs84"],
        # Preserve the already-shipped central-front local frame across every streamed page.
        "referenceOriginWgs84": [127.15, 38.3],
        "workingCrs": "EPSG:32652",
        "verticalCrs": "EPSG:3855",
        "acquisitionCells": coverage_cells(coverage["aoiWgs84"]),
    }


def projected_region(region: dict[str, object], tile_span_m: float):
    west, south, east, north = region["aoiWgs84"]
    corner_latitude = np.array([south, south, north, north])
    corner_longitude = np.array([west, east, west, east])
    corner_east, corner_north = wgs84_to_utm(corner_latitude, corner_longitude)
    reference_longitude, reference_latitude = region["referenceOriginWgs84"]
    reference_east, reference_north = wgs84_to_utm(reference_latitude, reference_longitude)
    local_bounds = (
        math.floor((float(corner_east.min()) - reference_east) / tile_span_m) * tile_span_m,
        math.floor((float(corner_north.min()) - reference_north) / tile_span_m) * tile_span_m,
        math.ceil((float(corner_east.max()) - reference_east) / tile_span_m) * tile_span_m,
        math.ceil((float(corner_north.max()) - reference_north) / tile_span_m) * tile_span_m,
    )
    return local_bounds, float(reference_east), float(reference_north)


class SourceCellCatalog:
    """Verified on-demand COG cell sampler with a bounded decoded-raster working set."""

    def __init__(self, source_lock: dict[str, object], region: dict[str, object], cache: Path,
                 maximum_loaded_cells: int = 4):
        cells = set(region["acquisitionCells"])
        self.aoi_wgs84 = tuple(float(value) for value in region["aoiWgs84"])
        self.implicit_water_cells = set(
            source_lock.get("canonicalCoverage", {}).get("implicitWaterCells", [])
        )
        self.entries = {
            (item["cell"], item["kind"]): item
            for product in source_lock["products"]
            for item in product["objects"]
            if item["cell"] in cells
        }
        missing = sorted(
            (cell, kind)
            for cell in cells
            for kind in ("dem", "water-mask")
            if cell not in self.implicit_water_cells and (cell, kind) not in self.entries
        )
        if missing:
            preview = ", ".join(f"{cell}/{kind}" for cell, kind in missing[:6])
            raise ValueError(
                f"source lock is missing {len(missing)} required objects ({preview}); "
                "lock and fetch the canonical cells before building"
            )
        self.cache_path = cache
        self.maximum_loaded_cells = max(1, maximum_loaded_cells)
        self.loaded: OrderedDict[str, tuple[np.ndarray, np.ndarray]] = OrderedDict()

    def load_cell(self, cell: str) -> tuple[np.ndarray, np.ndarray]:
        cached = self.loaded.get(cell)
        if cached is not None:
            self.loaded.move_to_end(cell)
            return cached
        arrays = []
        for kind in ("dem", "water-mask"):
            entry = self.entries[(cell, kind)]
            path = self.cache_path / entry["file"]
            if not path.is_file():
                raise FileNotFoundError(
                    f"missing {path}; run tools/terrain/fetch_copernicus.py first"
                )
            if path.stat().st_size != int(entry["bytes"]) or sha256_file(path) != entry["sha256"]:
                raise ValueError(f"locked source verification failed: {path}")
            array = np.asarray(Image.open(path))
            if array.shape != (3600, 3600):
                raise ValueError(f"unexpected source raster shape {array.shape}: {path}")
            arrays.append(array)
        result = (arrays[0].astype(np.float32, copy=False), arrays[1].astype(np.uint8, copy=False))
        self.loaded[cell] = result
        while len(self.loaded) > self.maximum_loaded_cells:
            self.loaded.popitem(last=False)
        return result

    def sample(self, easting: np.ndarray, northing: np.ndarray):
        latitude, longitude = utm_to_wgs84(easting, northing)
        west, south, east, north = self.aoi_wgs84
        inside = (
            (longitude >= west) & (longitude < east)
            & (latitude >= south) & (latitude < north)
        )
        latitude_cell = np.floor(latitude).astype(np.int16)
        longitude_cell = np.floor(longitude).astype(np.int16)
        height = np.zeros(latitude.shape, dtype=np.float32)
        water = np.ones(latitude.shape, dtype=bool)
        pairs = np.unique(
            np.stack((latitude_cell[inside], longitude_cell[inside]), axis=1), axis=0
        )
        for latitude_index, longitude_index in pairs:
            mask = (
                inside
                & (latitude_cell == latitude_index)
                & (longitude_cell == longitude_index)
            )
            cell = cell_name(int(latitude_index), int(longitude_index))
            if cell in self.implicit_water_cells:
                height[mask] = 0
                water[mask] = True
                continue
            dem, water_mask = self.load_cell(cell)
            x = (longitude[mask] - longitude_index) * 3600.0 - 0.5
            y = (latitude_index + 1.0 - latitude[mask]) * 3600.0 - 0.5
            height[mask] = map_coordinates(
                dem, (y, x), order=1, mode="nearest", prefilter=False
            ).astype(np.float32)
            water[mask] = map_coordinates(
                water_mask, (y, x), order=0, mode="nearest", prefilter=False
            ) > 0
        return height, water


def sample_tile(catalog: SourceCellCatalog, reference_east: float, reference_north: float,
                minimum_east: float, minimum_north: float, tile_span_m: float,
                sample_count: int):
    east = np.linspace(reference_east + minimum_east,
                       reference_east + minimum_east + tile_span_m, sample_count)
    north = np.linspace(reference_north + minimum_north,
                        reference_north + minimum_north + tile_span_m, sample_count)
    east_grid, north_grid = np.meshgrid(east, north)
    return catalog.sample(east_grid, north_grid)


def terrain_metrics(height: np.ndarray, water: np.ndarray, spacing_m: float,
                    seed_namespace: str) -> dict[str, object]:
    land = height[~water]
    if not land.size:
        return {
            "seed": stable_seed(seed_namespace),
            "landFraction": 0.0,
            "meanHeightM": 0.0,
            "ruggednessM": 0.0,
            "meanSlope": 0.0,
        }
    filled = height.copy()
    filled[water] = float(land.mean())
    north_gradient, east_gradient = np.gradient(filled, spacing_m, spacing_m)
    slope = np.hypot(east_gradient, north_gradient)[~water]
    return {
        "seed": stable_seed(seed_namespace),
        "landFraction": round(float((~water).mean()), 6),
        "meanHeightM": round(float(land.mean()), 1),
        "ruggednessM": round(float(land.std()), 1),
        "meanSlope": round(float(slope.mean()), 6),
    }


def encoded_lods(height: np.ndarray, water: np.ndarray, lod_samples: tuple[int, ...]):
    highest = lod_samples[0]
    encoded = quantize(height, water)
    for level, sample_count in enumerate(lod_samples):
        step = (highest - 1) // (sample_count - 1)
        if (highest - 1) % (sample_count - 1):
            raise ValueError("LOD sample counts must be exact power-of-two subdivisions")
        yield level, height[::step, ::step], water[::step, ::step], encoded[::step, ::step]


def page_id(east_index: int, north_index: int) -> str:
    east = f"p{east_index:03d}" if east_index >= 0 else f"m{abs(east_index):03d}"
    north = f"p{north_index:03d}" if north_index >= 0 else f"m{abs(north_index):03d}"
    return f"page-e{east}-n{north}"


def build_page(catalog: SourceCellCatalog, source_lock: dict[str, object],
               region: dict[str, object], reference_east: float, reference_north: float,
               tile_specs: list[dict[str, object]], page_bounds: tuple[float, float, float, float],
               output: Path, tile_span_m: float, lod_samples: tuple[int, ...],
               identifier: str):
    payload = bytearray()
    chunks = []
    for tile in tile_specs:
        height, water = sample_tile(
            catalog, reference_east, reference_north,
            tile["minimumEastM"], tile["minimumNorthM"], tile_span_m, lod_samples[0],
        )
        if bool(water.all()):
            continue
        chunk = {
            "id": tile["id"],
            "eastIndex": tile["eastIndex"],
            "northIndex": tile["northIndex"],
            "boundsLocalM": [
                tile["minimumEastM"], tile["minimumNorthM"],
                tile["minimumEastM"] + tile_span_m,
                tile["minimumNorthM"] + tile_span_m,
            ],
            "generation": terrain_metrics(
                height, water, tile_span_m / (lod_samples[0] - 1),
                f"{source_lock['sourceLockId']}:{region['id']}:{tile['id']}",
            ),
            "lods": [],
        }
        for level, lod_height, lod_water, lod_encoded in encoded_lods(
            height, water, lod_samples
        ):
            while len(payload) % 16:
                payload.append(0)
            value = lod_encoded.tobytes(order="C")
            offset = len(payload)
            payload.extend(value)
            land = lod_height[~lod_water]
            chunk["lods"].append({
                "level": level,
                "sampleCount": lod_encoded.shape[0],
                "spacingM": tile_span_m / (lod_encoded.shape[0] - 1),
                "byteOffset": offset,
                "byteLength": len(value),
                "sha256": sha256_bytes(value),
                "minimumHeightM": round(float(land.min()), 1) if land.size else 0.0,
                "maximumHeightM": round(float(land.max()), 1) if land.size else 0.0,
                "waterFraction": round(float(lod_water.mean()), 6),
            })
        chunks.append(chunk)
    if not chunks:
        return None

    pages_path = output / "pages"
    pages_path.mkdir(parents=True, exist_ok=True)
    bundle_path = pages_path / f"{identifier}.terrain"
    bundle_path.write_bytes(payload)
    source_product = source_lock["products"][0]
    manifest = {
        "schemaVersion": "1.0.0",
        "terrainId": f"terrain.korea.{region['id']}.{identifier}.v1",
        "pageId": identifier,
        "boundsLocalM": list(page_bounds),
        "tileSpanM": tile_span_m,
        "quantization": {
            "storage": "little-endian-signed-int16",
            "metresPerUnit": QUANTIZATION_METRES,
            "waterSentinel": WATER_SENTINEL,
            "rowOrder": "south-to-north",
        },
        "bundle": {
            "uri": bundle_path.name,
            "byteLength": len(payload),
            "sha256": sha256_bytes(payload),
            "recordCount": sum(len(chunk["lods"]) for chunk in chunks),
        },
        "chunks": chunks,
        "source": {
            "sourceLockId": source_lock["sourceLockId"],
            "productId": source_product["id"],
            "edition": source_product["edition"],
            "modifiedData": True,
            "requiredNotices": source_product["licence"]["requiredNotices"],
        },
        "build": {
            "builder": "tools/terrain/build_korea_atlas.py",
            "builderVersion": 1,
            "numpyVersion": np.__version__,
            "pillowVersion": PIL.__version__,
        },
    }
    manifest_path = pages_path / f"{identifier}.manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    return {
        "id": identifier,
        "boundsLocalM": list(page_bounds),
        "chunkCount": len(chunks),
        "manifest": {
            "uri": f"pages/{manifest_path.name}",
            "byteLength": manifest_path.stat().st_size,
            "sha256": sha256_file(manifest_path),
        },
    }


def tile_plan(local_bounds: tuple[float, float, float, float], tile_span_m: float,
              page_span_m: float):
    minimum_east, minimum_north, maximum_east, maximum_north = local_bounds
    count_east = round((maximum_east - minimum_east) / tile_span_m)
    count_north = round((maximum_north - minimum_north) / tile_span_m)
    pages = defaultdict(list)
    for north_index in range(count_north):
        for east_index in range(count_east):
            tile_east = minimum_east + east_index * tile_span_m
            tile_north = minimum_north + north_index * tile_span_m
            page_east = math.floor(tile_east / page_span_m)
            page_north = math.floor(tile_north / page_span_m)
            pages[(page_east, page_north)].append({
                "id": f"e{east_index:04d}-n{north_index:04d}",
                "eastIndex": east_index,
                "northIndex": north_index,
                "minimumEastM": tile_east,
                "minimumNorthM": tile_north,
            })
    return pages


def build_atlas(source_lock: dict[str, object], region: dict[str, object], cache: Path,
                output: Path, tile_span_m: float = TILE_SPAN_METRES,
                page_span_m: float = PAGE_SPAN_METRES,
                lod_samples: tuple[int, ...] = LOD_SAMPLES):
    if region["workingCrs"] != "EPSG:32652":
        raise ValueError("the atlas builder currently implements WGS 84 / UTM zone 52N only")
    if page_span_m % tile_span_m:
        raise ValueError("page span must be an exact multiple of tile span")
    local_bounds, reference_east, reference_north = projected_region(region, tile_span_m)
    plan = tile_plan(local_bounds, tile_span_m, page_span_m)
    catalog = SourceCellCatalog(source_lock, region, cache)
    pages = []
    for (page_east, page_north), tiles in sorted(plan.items(), key=lambda item: (item[0][1], item[0][0])):
        bounds = (
            max(local_bounds[0], page_east * page_span_m),
            max(local_bounds[1], page_north * page_span_m),
            min(local_bounds[2], (page_east + 1) * page_span_m),
            min(local_bounds[3], (page_north + 1) * page_span_m),
        )
        built = build_page(
            catalog, source_lock, region, reference_east, reference_north,
            tiles, bounds, output, tile_span_m, lod_samples,
            page_id(page_east, page_north),
        )
        if built:
            pages.append(built)
    if not pages:
        raise ValueError("atlas contains no land-bearing terrain pages")

    reference_longitude, reference_latitude = region["referenceOriginWgs84"]
    root = {
        "schemaVersion": "2.0.0",
        "terrainId": f"terrain.korea.{region['id']}.atlas.v1",
        "displayName": region["displayName"],
        "canonicalCoverageId": source_lock["canonicalCoverage"]["id"],
        "aoiWgs84": region["aoiWgs84"],
        "horizontalCrs": region["workingCrs"],
        "verticalCrs": region["verticalCrs"],
        "referenceOrigin": {
            "latitude": reference_latitude,
            "longitude": reference_longitude,
            "eastingM": round(reference_east, 6),
            "northingM": round(reference_north, 6),
        },
        "boundsLocalM": list(local_bounds),
        "tileSpanM": tile_span_m,
        "pageSpanM": page_span_m,
        "pages": pages,
        "streaming": {
            "strategy": "velocity-ahead-bounded-window",
        },
        "scenery": {
            "generator": "korea-procedural-scenery-v1",
            "seedNamespace": f"{source_lock['sourceLockId']}:{region['id']}",
            "defaultProfile": "1950s",
            "supportedProfiles": ["1950s", "modern"],
            "chunkInputs": "generation",
        },
        "build": {
            "builder": "tools/terrain/build_korea_atlas.py",
            "builderVersion": 1,
            "numpyVersion": np.__version__,
            "pillowVersion": PIL.__version__,
        },
    }
    output.mkdir(parents=True, exist_ok=True)
    root_path = output / f"{region['id']}.atlas.manifest.json"
    root_path.write_text(json.dumps(root, indent=2, sort_keys=True) + "\n")
    return root_path, root


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lock", type=Path, default=DEFAULT_LOCK)
    parser.add_argument("--cache", type=Path)
    parser.add_argument("--region", default="central-front")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    parser.add_argument("--tile-span-m", type=float, default=TILE_SPAN_METRES)
    parser.add_argument("--page-span-m", type=float, default=PAGE_SPAN_METRES)
    parser.add_argument("--dry-plan", action="store_true")
    arguments = parser.parse_args()

    source_lock = json.loads(arguments.lock.read_text())
    region = region_from_lock(source_lock, arguments.region)
    local_bounds, _, _ = projected_region(region, arguments.tile_span_m)
    plan = tile_plan(local_bounds, arguments.tile_span_m, arguments.page_span_m)
    tile_count = sum(len(tiles) for tiles in plan.values())
    bytes_per_tile = sum(sample * sample * 2 for sample in LOD_SAMPLES)
    if arguments.dry_plan:
        print(json.dumps({
            "region": region["id"],
            "boundsLocalM": local_bounds,
            "tiles": tile_count,
            "pages": len(plan),
            "rawHeightBytes": tile_count * bytes_per_tile,
            "acquisitionCells": len(region["acquisitionCells"]),
        }, indent=2))
        return
    if arguments.cache is None:
        raise SystemExit("--cache is required unless --dry-plan is used")
    root_path, root = build_atlas(
        source_lock, region, arguments.cache, arguments.output,
        arguments.tile_span_m, arguments.page_span_m,
    )
    total_bytes = sum(
        (arguments.output / "pages" / f"{page['id']}.terrain").stat().st_size
        for page in root["pages"]
    )
    print(
        f"built {len(root['pages'])} pages at {root_path}; "
        f"{total_bytes / 1024 / 1024:.2f} MiB range bundles"
    )


if __name__ == "__main__":
    main()
