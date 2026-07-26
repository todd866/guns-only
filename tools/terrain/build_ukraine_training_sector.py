#!/usr/bin/env python3
"""Build the fictional multi-resolution Soniachne 2030s Ukraine theatre.

The product is deliberately synthetic and has no real coordinates. A 262.144 km regional truth
layer supports high-altitude/Rapier missions, while the existing 16.384 km, 32 m Soniachne cell is
nested byte-for-byte at its centre for low-level flight. Future 1-2 m combat and medevac hero cells
can override the same frame without changing mission coordinates.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import platform
import shutil
import struct
import sys
from array import array
from pathlib import Path
from typing import Callable


SECTOR_ID = "soniachne-steppe"
TERRAIN_ID = "terrain.ukraine.soniachne-theatre.v2"
TERRAIN_VERSION = "soniachne-synthetic-theatre-v2"

DETAIL_MINIMUM_M = -8_192.0
DETAIL_MAXIMUM_M = 8_192.0
DETAIL_SPACING_M = 32.0
DETAIL_POINT_COUNT = 513
DETAIL_TILE_SPAN_M = 8_192.0
DETAIL_TILE_POINT_COUNT = 257

REGIONAL_MINIMUM_M = -131_072.0
REGIONAL_MAXIMUM_M = 131_072.0
REGIONAL_SPACING_M = 256.0
REGIONAL_POINT_COUNT = 1_025
REGIONAL_CHUNK_POINT_COUNT = 257
REGIONAL_BOUNDARIES_M = (
    REGIONAL_MINIMUM_M,
    -65_536.0,
    DETAIL_MINIMUM_M,
    DETAIL_MAXIMUM_M,
    65_536.0,
    REGIONAL_MAXIMUM_M,
)
DETAIL_TO_REGIONAL_BLEND_M = 16_384.0

LOD_STRIDES = (1, 2, 4, 8)
METRES_PER_UNIT = 0.1
WATER_SENTINEL = -32_768
TRUTH_MAGIC = b"GOKTRN1\0"


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("content/packs/ukraine-modern/environment/terrain"),
        help="canonical generated terrain directory",
    )
    parser.add_argument(
        "--web-output",
        default="web/wwwroot/content/packs/ukraine-modern/environment/terrain",
        help="staged browser mirror; pass an empty string to skip",
    )
    return parser.parse_args()


def terrain_height_m(east_m: float, north_m: float) -> float:
    """Authored 32 m Soniachne lowland relief used by the detailed central cell."""

    macro_roll = 13.5 * math.sin(east_m / 7_600.0 + 0.35) * math.cos(north_m / 9_800.0)
    diagonal_roll = 8.0 * math.sin((east_m + north_m) / 4_900.0 - 0.8)
    field_scale_relief = 3.8 * math.cos((east_m - 1.7 * north_m) / 2_650.0)
    drainage_east_m = -2_500.0 + 1_650.0 * math.sin(north_m / 6_400.0)
    drainage_east_m += 420.0 * math.sin(north_m / 1_900.0 + 0.6)
    drainage_distance_m = abs(east_m - drainage_east_m)
    drainage = -19.0 * math.exp(-((drainage_distance_m / 920.0) ** 2))
    floodplain = -6.5 * math.exp(-((drainage_distance_m / 2_900.0) ** 4))
    eastern_escarpment = 25.0 * math.exp(
        -(((east_m - 5_600.0) / 3_500.0) ** 2)
        - (((north_m + 1_200.0) / 7_200.0) ** 2)
    )
    height_m = (
        118.0
        + macro_roll
        + diagonal_roll
        + field_scale_relief
        + drainage
        + floodplain
        + eastern_escarpment
    )
    return min(188.0, max(72.0, height_m))


def regional_shore_coordinate_m(east_m: float, north_m: float) -> float:
    """Positive inland, negative over the fictional southwest coastal water cell."""

    return north_m + 0.4 * east_m + 105_000.0


def regional_surface_m(east_m: float, north_m: float) -> float | None:
    """Coarse regional surface; ``None`` is water.

    The first 16.384 km outside the detail square blends from the exact clamped detail edge. This
    makes both visual and physics products meet the 32 m cell without a perimeter cliff.
    """

    if (
        DETAIL_MINIMUM_M <= east_m <= DETAIL_MAXIMUM_M
        and DETAIL_MINIMUM_M <= north_m <= DETAIL_MAXIMUM_M
    ):
        return terrain_height_m(east_m, north_m)

    shore_m = regional_shore_coordinate_m(east_m, north_m)
    if shore_m <= 0.0:
        return None

    inland_rise = min(86.0, shore_m * 0.00048)
    broad_roll = 19.0 * math.sin(east_m / 37_000.0 + 0.45) * math.cos(
        north_m / 46_000.0 - 0.2
    )
    diagonal = 11.0 * math.sin((east_m + 0.72 * north_m) / 24_000.0)
    river_corridor_east_m = 18_000.0 * math.sin(north_m / 52_000.0 - 0.6)
    river_distance_m = abs(east_m - river_corridor_east_m)
    river = -13.0 * math.exp(-((river_distance_m / 7_500.0) ** 2))
    regional_height = max(4.0, 34.0 + inland_rise + broad_roll + diagonal + river)

    source_east_m = min(DETAIL_MAXIMUM_M, max(DETAIL_MINIMUM_M, east_m))
    source_north_m = min(DETAIL_MAXIMUM_M, max(DETAIL_MINIMUM_M, north_m))
    outside_east_m = east_m - source_east_m
    outside_north_m = north_m - source_north_m
    outside_distance_m = math.hypot(outside_east_m, outside_north_m)
    if outside_distance_m >= DETAIL_TO_REGIONAL_BLEND_M:
        return regional_height

    fraction = max(0.0, min(1.0, outside_distance_m / DETAIL_TO_REGIONAL_BLEND_M))
    fraction = fraction * fraction * (3.0 - 2.0 * fraction)
    detail_edge_height = terrain_height_m(source_east_m, source_north_m)
    return detail_edge_height + (regional_height - detail_edge_height) * fraction


def quantize(height_m: float) -> int:
    value = round(height_m / METRES_PER_UNIT)
    if value <= WATER_SENTINEL or value > 32_767:
        raise ValueError(f"height {height_m} m cannot be represented")
    return value


def regional_value(east_m: float, north_m: float) -> int:
    height_m = regional_surface_m(east_m, north_m)
    return WATER_SENTINEL if height_m is None else quantize(height_m)


def little_endian_bytes(values: list[int]) -> bytes:
    encoded = array("h", values)
    if sys.byteorder != "little":
        encoded.byteswap()
    return encoded.tobytes()


def sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def build_grid(
    origin_m: float,
    spacing_m: float,
    point_count: int,
    sampler: Callable[[float, float], int],
) -> list[int]:
    values: list[int] = []
    for north_index in range(point_count):
        north_m = origin_m + north_index * spacing_m
        for east_index in range(point_count):
            east_m = origin_m + east_index * spacing_m
            values.append(sampler(east_m, north_m))
    return values


def sample(grid: list[int], point_count: int, east_index: int, north_index: int) -> int:
    return grid[north_index * point_count + east_index]


def chunk_seed(chunk_id: str) -> int:
    digest = hashlib.sha256(f"{TERRAIN_VERSION}:{chunk_id}".encode("utf-8")).digest()
    return int.from_bytes(digest[:4], "little")


def height_range(values: list[int]) -> tuple[float, float]:
    land = [value for value in values if value != WATER_SENTINEL]
    if not land:
        return (0.0, 0.0)
    return min(land) * METRES_PER_UNIT, max(land) * METRES_PER_UNIT


def append_chunk(
    bundle: bytearray,
    chunks: list[dict[str, object]],
    *,
    chunk_id: str,
    east_index: int,
    north_index: int,
    bounds: tuple[float, float, float, float],
    point_count: int,
    sampler: Callable[[float, float], int],
) -> None:
    minimum_east_m, minimum_north_m, maximum_east_m, maximum_north_m = bounds
    base_values: list[int] = []
    for local_north in range(point_count):
        north_fraction = local_north / (point_count - 1)
        north_m = minimum_north_m + (maximum_north_m - minimum_north_m) * north_fraction
        for local_east in range(point_count):
            east_fraction = local_east / (point_count - 1)
            east_m = minimum_east_m + (maximum_east_m - minimum_east_m) * east_fraction
            base_values.append(sampler(east_m, north_m))

    lods: list[dict[str, object]] = []
    for level, stride in enumerate(LOD_STRIDES):
        sample_count = (point_count - 1) // stride + 1
        values = [
            base_values[north * point_count + east]
            for north in range(0, point_count, stride)
            for east in range(0, point_count, stride)
        ]
        payload = little_endian_bytes(values)
        byte_offset = len(bundle)
        bundle.extend(payload)
        minimum_height_m, maximum_height_m = height_range(values)
        lods.append(
            {
                "level": level,
                "sampleCount": sample_count,
                "spacingM": max(
                    maximum_east_m - minimum_east_m,
                    maximum_north_m - minimum_north_m,
                )
                / (sample_count - 1),
                "byteOffset": byte_offset,
                "byteLength": len(payload),
                "sha256": sha256_bytes(payload),
                "minimumHeightM": minimum_height_m,
                "maximumHeightM": maximum_height_m,
            }
        )

    chunks.append(
        {
            "id": chunk_id,
            "eastIndex": east_index,
            "northIndex": north_index,
            "boundsLocalM": list(bounds),
            "generation": {
                "seed": chunk_seed(chunk_id),
                "landFraction": sum(value != WATER_SENTINEL for value in base_values)
                / len(base_values),
                "fidelityBand": "detail" if chunk_id.startswith("e") else "macro",
            },
            "lods": lods,
        }
    )


def build_bundle() -> tuple[bytes, list[dict[str, object]]]:
    bundle = bytearray()
    chunks: list[dict[str, object]] = []

    # Preserve the original four detailed chunks first. Their payload remains byte-identical to
    # the v1 bundle, which makes the new regional layer an additive world change.
    for north_tile in range(2):
        for east_tile in range(2):
            minimum_east_m = DETAIL_MINIMUM_M + east_tile * DETAIL_TILE_SPAN_M
            minimum_north_m = DETAIL_MINIMUM_M + north_tile * DETAIL_TILE_SPAN_M
            append_chunk(
                bundle,
                chunks,
                chunk_id=f"e{east_tile:02d}-n{north_tile:02d}",
                east_index=east_tile,
                north_index=north_tile,
                bounds=(
                    minimum_east_m,
                    minimum_north_m,
                    minimum_east_m + DETAIL_TILE_SPAN_M,
                    minimum_north_m + DETAIL_TILE_SPAN_M,
                ),
                point_count=DETAIL_TILE_POINT_COUNT,
                sampler=lambda east_m, north_m: quantize(terrain_height_m(east_m, north_m)),
            )

    # Twenty-four coarse chunks surround (but never overlap) the detailed square.
    for north_index in range(len(REGIONAL_BOUNDARIES_M) - 1):
        for east_index in range(len(REGIONAL_BOUNDARIES_M) - 1):
            if east_index == 2 and north_index == 2:
                continue
            append_chunk(
                bundle,
                chunks,
                chunk_id=f"macro-e{east_index:02d}-n{north_index:02d}",
                east_index=east_index,
                north_index=north_index,
                bounds=(
                    REGIONAL_BOUNDARIES_M[east_index],
                    REGIONAL_BOUNDARIES_M[north_index],
                    REGIONAL_BOUNDARIES_M[east_index + 1],
                    REGIONAL_BOUNDARIES_M[north_index + 1],
                ),
                point_count=REGIONAL_CHUNK_POINT_COUNT,
                sampler=regional_value,
            )
    return bytes(bundle), chunks


def build_truth(
    grid: list[int],
    *,
    point_count: int,
    spacing_m: float,
    origin_m: float,
) -> bytes:
    header = struct.pack(
        "<8sIIIddddh10s",
        TRUTH_MAGIC,
        1,
        point_count,
        point_count,
        spacing_m,
        origin_m,
        origin_m,
        METRES_PER_UNIT,
        WATER_SENTINEL,
        b"\0" * 10,
    )
    if len(header) != 64:
        raise AssertionError(f"truth header is {len(header)} bytes, expected 64")
    return header + little_endian_bytes(grid)


def write_preview(
    path: Path,
    grid: list[int],
    *,
    point_count: int,
) -> None:
    try:
        from PIL import Image
    except ImportError as error:
        raise RuntimeError("Pillow is required to build the terrain QA preview") from error

    land = [value for value in grid if value != WATER_SENTINEL]
    minimum = min(land)
    maximum = max(land)
    pixels: list[tuple[int, int, int]] = []
    for north_index in reversed(range(point_count)):
        for east_index in range(point_count):
            value = sample(grid, point_count, east_index, north_index)
            if value == WATER_SENTINEL:
                pixels.append((47, 83, 112))
                continue
            normalized = (value - minimum) / max(1, maximum - minimum)
            west = sample(grid, point_count, max(0, east_index - 1), north_index)
            east = sample(grid, point_count, min(point_count - 1, east_index + 1), north_index)
            south = sample(grid, point_count, east_index, max(0, north_index - 1))
            north = sample(grid, point_count, east_index, min(point_count - 1, north_index + 1))
            neighbours = [item if item != WATER_SENTINEL else value for item in (west, east, south, north)]
            shade = max(
                0.68,
                min(1.22, 0.96 + (neighbours[0] - neighbours[1]
                    + neighbours[2] - neighbours[3]) / 135.0),
            )
            low = (104, 120, 55)
            high = (157, 139, 88)
            pixels.append(
                tuple(
                    max(
                        0,
                        min(
                            255,
                            int((low[channel] + (high[channel] - low[channel]) * normalized) * shade),
                        ),
                    )
                    for channel in range(3)
                )
            )
    image = Image.new("RGB", (point_count, point_count))
    image.putdata(pixels)
    image.save(path, optimize=True)


def write_product(output: Path) -> list[Path]:
    output.mkdir(parents=True, exist_ok=True)
    detail_grid = build_grid(
        DETAIL_MINIMUM_M,
        DETAIL_SPACING_M,
        DETAIL_POINT_COUNT,
        lambda east_m, north_m: quantize(terrain_height_m(east_m, north_m)),
    )
    regional_grid = build_grid(
        REGIONAL_MINIMUM_M,
        REGIONAL_SPACING_M,
        REGIONAL_POINT_COUNT,
        regional_value,
    )
    bundle, chunks = build_bundle()
    detail_truth = build_truth(
        detail_grid,
        point_count=DETAIL_POINT_COUNT,
        spacing_m=DETAIL_SPACING_M,
        origin_m=DETAIL_MINIMUM_M,
    )
    regional_truth = build_truth(
        regional_grid,
        point_count=REGIONAL_POINT_COUNT,
        spacing_m=REGIONAL_SPACING_M,
        origin_m=REGIONAL_MINIMUM_M,
    )

    bundle_name = f"{SECTOR_ID}.terrain"
    detail_truth_name = f"{SECTOR_ID}.truth"
    regional_truth_name = "soniachne-region.truth"
    detail_preview_name = f"{SECTOR_ID}-preview.png"
    regional_preview_name = "soniachne-theatre-preview.png"
    manifest_name = f"{SECTOR_ID}.manifest.json"

    (output / bundle_name).write_bytes(bundle)
    (output / detail_truth_name).write_bytes(detail_truth)
    (output / regional_truth_name).write_bytes(regional_truth)
    write_preview(
        output / detail_preview_name,
        detail_grid,
        point_count=DETAIL_POINT_COUNT,
    )
    write_preview(
        output / regional_preview_name,
        regional_grid,
        point_count=REGIONAL_POINT_COUNT,
    )
    detail_preview = (output / detail_preview_name).read_bytes()
    regional_preview = (output / regional_preview_name).read_bytes()

    manifest = {
        "schemaVersion": "1.0.0",
        "terrainId": TERRAIN_ID,
        "terrainVersion": TERRAIN_VERSION,
        "displayName": "Soniachne 2030s — fictional Ukraine theatre",
        "horizontalCrs": "LOCAL_METRES_EAST_NORTH",
        "verticalCrs": "LOCAL_FICTIONAL_DATUM",
        "boundsLocalM": [
            REGIONAL_MINIMUM_M,
            REGIONAL_MINIMUM_M,
            REGIONAL_MAXIMUM_M,
            REGIONAL_MAXIMUM_M,
        ],
        "tileSpanM": 65_536.0,
        "referenceOrigin": {
            "kind": "fictional-local-grid",
            "eastM": 0.0,
            "northM": 0.0,
        },
        "fidelityBands": [
            {
                "id": "theatre-macro",
                "boundsLocalM": [
                    REGIONAL_MINIMUM_M,
                    REGIONAL_MINIMUM_M,
                    REGIONAL_MAXIMUM_M,
                    REGIONAL_MAXIMUM_M,
                ],
                "simulationSpacingM": REGIONAL_SPACING_M,
                "suitableFor": [
                    "high-altitude scenery continuity",
                    "collision and Auto-GCAS continuity",
                    "Rapier mission routing",
                ],
            },
            {
                "id": "soniachne-detail",
                "boundsLocalM": [
                    DETAIL_MINIMUM_M,
                    DETAIL_MINIMUM_M,
                    DETAIL_MAXIMUM_M,
                    DETAIL_MAXIMUM_M,
                ],
                "simulationSpacingM": DETAIL_SPACING_M,
                "suitableFor": [
                    "low-level fixed-wing missions",
                    "authored target routes",
                ],
                "notSuitableFor": ["medevac landing-zone assessment"],
            },
        ],
        "source": {
            "kind": "synthetic-fictional-composite",
            "suitableFor": [
                "renderer integration",
                "collision and Auto-GCAS integration",
                "fictional entertainment and training missions",
            ],
            "notSuitableFor": [
                "real navigation",
                "real-world tactical use",
                "claims about a real Ukrainian locality",
            ],
        },
        "build": {
            "builder": "tools/terrain/build_ukraine_training_sector.py",
            "builderVersion": 2,
            "pythonVersion": platform.python_version(),
        },
        "quantization": {
            "storage": "little-endian-signed-int16",
            "rowOrder": "south-to-north",
            "metresPerUnit": METRES_PER_UNIT,
            "waterSentinel": WATER_SENTINEL,
        },
        "bundle": {
            "uri": bundle_name,
            "byteLength": len(bundle),
            "recordCount": sum(len(chunk["lods"]) for chunk in chunks),
            "sha256": sha256_bytes(bundle),
        },
        "simulationTruth": {
            "uri": detail_truth_name,
            "byteLength": len(detail_truth),
            "sha256": sha256_bytes(detail_truth),
            "spacingM": DETAIL_SPACING_M,
            "pointCount": [DETAIL_POINT_COUNT, DETAIL_POINT_COUNT],
        },
        "regionalSimulationTruth": {
            "uri": regional_truth_name,
            "byteLength": len(regional_truth),
            "sha256": sha256_bytes(regional_truth),
            "spacingM": REGIONAL_SPACING_M,
            "pointCount": [REGIONAL_POINT_COUNT, REGIONAL_POINT_COUNT],
        },
        "preview": {
            "uri": detail_preview_name,
            "byteLength": len(detail_preview),
            "sha256": sha256_bytes(detail_preview),
        },
        "regionalPreview": {
            "uri": regional_preview_name,
            "byteLength": len(regional_preview),
            "sha256": sha256_bytes(regional_preview),
        },
        "chunks": chunks,
    }
    manifest_path = output / manifest_name
    manifest_path.write_text(
        json.dumps(manifest, indent=2, sort_keys=False) + "\n",
        encoding="utf-8",
    )
    return [
        output / bundle_name,
        output / detail_truth_name,
        output / regional_truth_name,
        output / detail_preview_name,
        output / regional_preview_name,
        manifest_path,
    ]


def main() -> None:
    args = parse_args()
    generated = write_product(args.output)
    if args.web_output:
        web_output = Path(args.web_output)
        web_output.mkdir(parents=True, exist_ok=True)
        for source in generated:
            shutil.copy2(source, web_output / source.name)
    for path in generated:
        print(f"{path} {path.stat().st_size} bytes")


if __name__ == "__main__":
    main()
