#!/usr/bin/env python3
"""Build deterministic, range-addressable Korean terrain from locked Copernicus COGs."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
from pathlib import Path
import struct

import numpy as np
import PIL
from PIL import Image
from scipy.ndimage import map_coordinates


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LOCK = ROOT / "content/sources/korea-terrain-source-lock.json"
DEFAULT_OUTPUT = ROOT / "content/packs/korea-1950s/environment/terrain"
MAGIC = b"GOKTRN1\0"
QUANTIZATION_METRES = 0.1
WATER_SENTINEL = -32768
TILE_SPAN_METRES = 16_384.0
LOD_SAMPLES = (257, 129, 65, 33)
SIM_SPACING_METRES = 128.0
TERRAIN_VERSION = "central-front-carved-valleys-v3"
VALLEY_SEED = 0x56414C4C455932
MAXIMUM_VALLEY_WALL_RISE_METRES = 1800.0
WATER_ROUTE_PENALTY_METRES = 10_000.0
HIGH_GROUND_ROUTE_REWARD = 4.0
ROUTE_FLANK_MARGIN_METRES = 1_000.0

WGS84_A = 6_378_137.0
WGS84_F = 1.0 / 298.257223563
WGS84_E2 = WGS84_F * (2.0 - WGS84_F)
WGS84_EP2 = WGS84_E2 / (1.0 - WGS84_E2)
UTM_K0 = 0.9996
UTM_ZONE = 52
UTM_CENTRAL_MERIDIAN = math.radians(UTM_ZONE * 6 - 183)

# The drainage graph is authored in the stable central-front local frame. The seed moves interior
# control points by bounded metre offsets and selects every floor width / wall angle; explicit
# node elevations make every named run descend to the one coastal outlet. Routes share graph
# nodes, so junctions are one rounded distance field instead of crossing, visual-only trenches.
VALLEY_NODE_BASES = {
    "coast-outlet": (-46_000, -56_000, 0.0),
    "lower-mouth-approach": (-38_000, -50_000, 2.0),
    "lower-west": (-37_000, -45_000, 6.0),
    "lower-bend": (-27_000, -40_000, 12.0),
    "lower-mid": (-27_000, -35_000, 18.0),
    "lower-upper": (-22_000, -28_000, 22.0),
    "central-junction": (-5_000, -20_000, 25.0),
    "marquee-lower": (4_000, -12_000, 40.0),
    "marquee-mid": (15_000, 5_000, 60.0),
    "marquee-upper": (20_000, 21_000, 80.0),
    "marquee-ridge": (25_000, 29_000, 100.0),
    "marquee-head": (40_000, 29_000, 120.0),
    "south-lower": (5_000, -18_000, 110.0),
    "south-mid": (20_000, -21_000, 220.0),
    "south-head": (35_000, -25_000, 250.0),
    "north-lower": (-12_000, 4_000, 80.0),
    "north-mid": (-8_000, 22_000, 140.0),
    "north-head": (-12_000, 38_000, 160.0),
}

VALLEY_RUN_NODE_IDS = {
    "marquee-east-to-coast": (
        "marquee-head", "marquee-ridge", "marquee-upper", "marquee-mid",
        "marquee-lower", "central-junction", "lower-upper", "lower-mid", "lower-bend",
        "lower-west", "lower-mouth-approach", "coast-outlet",
    ),
    "southern-tributary-to-coast": (
        "south-head", "south-mid", "south-lower", "central-junction",
        "lower-upper", "lower-mid", "lower-bend", "lower-west",
        "lower-mouth-approach", "coast-outlet",
    ),
    "northern-tributary-to-coast": (
        "north-head", "north-mid", "north-lower", "central-junction",
        "lower-upper", "lower-mid", "lower-bend", "lower-west",
        "lower-mouth-approach", "coast-outlet",
    ),
}


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def seeded_integer(seed: int, label: str, minimum: int, maximum: int) -> int:
    if minimum > maximum:
        raise ValueError("seeded integer bounds are reversed")
    digest = hashlib.sha256(f"{seed:016x}:{label}".encode("ascii")).digest()
    value = int.from_bytes(digest[:8], "little")
    return minimum + value % (maximum - minimum + 1)


def build_valley_network(seed: int = VALLEY_SEED, sample_local=None) -> dict[str, object]:
    nodes: dict[str, dict[str, float | str]] = {}
    fixed_nodes = {"coast-outlet"}
    for node_id, (base_east, base_north, floor_height) in VALLEY_NODE_BASES.items():
        jitter_east = 0 if node_id in fixed_nodes else seeded_integer(
            seed, f"{node_id}:east", -650, 650)
        jitter_north = 0 if node_id in fixed_nodes else seeded_integer(
            seed, f"{node_id}:north", -650, 650)
        nodes[node_id] = {
            "id": node_id,
            "eastM": float(base_east + jitter_east),
            "northM": float(base_north + jitter_north),
            "floorHeightM": floor_height,
            "floorWidthM": float(seeded_integer(seed, f"{node_id}:width", 1500, 3000)),
            "wallAngleDegrees": float(seeded_integer(seed, f"{node_id}:wall", 20, 30)),
        }

    if sample_local is not None:
        search_offsets = np.arange(-1_600.0, 1_600.1, 200.0)
        east_offsets, north_offsets = np.meshgrid(search_offsets, search_offsets)
        radial_penalty = np.hypot(east_offsets, north_offsets) * 0.035
        for node_id, node in nodes.items():
            if node_id == "coast-outlet":
                continue
            candidate_east = float(node["eastM"]) + east_offsets
            candidate_north = float(node["northM"]) + north_offsets
            candidate_height, candidate_water = sample_local(
                candidate_east, candidate_north)
            support_distance = (
                0.5 * float(node["floorWidthM"]) + ROUTE_FLANK_MARGIN_METRES
            )
            support_heights = []
            support_water = []
            for support_east, support_north in (
                (-support_distance, 0.0),
                (support_distance, 0.0),
                (0.0, -support_distance),
                (0.0, support_distance),
            ):
                flank_height, flank_water = sample_local(
                    candidate_east + support_east,
                    candidate_north + support_north,
                )
                support_heights.append(flank_height)
                support_water.append(flank_water)
            supported_height = (
                0.25 * candidate_height
                + 0.75 * np.mean(np.stack(support_heights), axis=0)
            )
            candidate_cost = (
                -supported_height * HIGH_GROUND_ROUTE_REWARD
                + radial_penalty
                + np.where(
                    candidate_water | np.any(np.stack(support_water), axis=0),
                    WATER_ROUTE_PENALTY_METRES,
                    0.0,
                )
            )
            best = int(np.argmin(candidate_cost))
            node["eastM"] = float(candidate_east.flat[best])
            node["northM"] = float(candidate_north.flat[best])

    reaches: list[dict[str, object]] = []
    edge_lengths: dict[tuple[str, str], float] = {}
    seen_edges: set[tuple[str, str]] = set()
    for run_id, node_ids in VALLEY_RUN_NODE_IDS.items():
        for upstream_id, downstream_id in zip(node_ids, node_ids[1:]):
            edge = (upstream_id, downstream_id)
            if edge in seen_edges:
                continue
            seen_edges.add(edge)
            upstream = nodes[upstream_id]
            downstream = nodes[downstream_id]
            delta_east = float(downstream["eastM"]) - float(upstream["eastM"])
            delta_north = float(downstream["northM"]) - float(upstream["northM"])
            direct_length = math.hypot(delta_east, delta_north)
            normal_east = -delta_north / direct_length
            normal_north = delta_east / direct_length
            piece_count = max(2, math.ceil(direct_length / 2_200.0))
            amplitude = float(seeded_integer(
                seed, f"{upstream_id}--{downstream_id}:meander-amplitude", 2000, 3000))
            cycles = max(1, round(direct_length / 7_500.0))
            phase = math.radians(seeded_integer(
                seed, f"{upstream_id}--{downstream_id}:meander-phase", 0, 359))
            interior_along = np.arange(1, piece_count, dtype=np.float64) / piece_count
            meander_targets = amplitude * np.sin(math.pi * interior_along) ** 2 * np.sin(
                2.0 * math.pi * cycles * interior_along + phase)
            if sample_local is None:
                selected_lateral = meander_targets
            else:
                lateral_candidates = np.arange(-3_200.0, 3_200.1, 200.0)
                candidate_east = (
                    float(upstream["eastM"]) + interior_along[:, None] * delta_east
                    + lateral_candidates[None, :] * normal_east
                )
                candidate_north = (
                    float(upstream["northM"]) + interior_along[:, None] * delta_north
                    + lateral_candidates[None, :] * normal_north
                )
                candidate_height, candidate_water = sample_local(
                    candidate_east, candidate_north)
                flank_distance = (
                    0.5 * (
                        float(upstream["floorWidthM"])
                        + interior_along * (
                            float(downstream["floorWidthM"])
                            - float(upstream["floorWidthM"])
                        )
                    )
                    + ROUTE_FLANK_MARGIN_METRES
                )
                left_height, left_water = sample_local(
                    candidate_east + flank_distance[:, None] * normal_east,
                    candidate_north + flank_distance[:, None] * normal_north,
                )
                right_height, right_water = sample_local(
                    candidate_east - flank_distance[:, None] * normal_east,
                    candidate_north - flank_distance[:, None] * normal_north,
                )
                supported_height = (
                    0.25 * candidate_height
                    + 0.75 * np.minimum(left_height, right_height)
                )
                local_cost = (
                    -supported_height.astype(np.float64) * HIGH_GROUND_ROUTE_REWARD
                    + 0.045 * np.abs(
                        lateral_candidates[None, :] - meander_targets[:, None])
                    + np.where(
                        candidate_water | left_water | right_water,
                        WATER_ROUTE_PENALTY_METRES,
                        0.0,
                    )
                )
                path_cost = np.empty_like(local_cost)
                previous = np.empty(local_cost.shape, dtype=np.int16)
                path_cost[0] = local_cost[0] + 0.11 * np.abs(lateral_candidates)
                previous[0] = -1
                transition = 0.11 * np.abs(
                    lateral_candidates[:, None] - lateral_candidates[None, :])
                for row in range(1, local_cost.shape[0]):
                    candidates = path_cost[row - 1][:, None] + transition
                    previous[row] = np.argmin(candidates, axis=0)
                    path_cost[row] = local_cost[row] + np.min(candidates, axis=0)
                selected_indices = np.empty(local_cost.shape[0], dtype=np.int16)
                selected_indices[-1] = np.argmin(
                    path_cost[-1] + 0.11 * np.abs(lateral_candidates))
                for row in range(local_cost.shape[0] - 1, 0, -1):
                    selected_indices[row - 1] = previous[row, selected_indices[row]]
                selected_lateral = lateral_candidates[selected_indices]
            centreline: list[dict[str, float | str]] = []
            for index in range(piece_count + 1):
                along = index / piece_count
                if index == 0:
                    centreline.append(upstream)
                    continue
                if index == piece_count:
                    centreline.append(downstream)
                    continue
                lateral = float(selected_lateral[index - 1])
                centreline.append({
                    "id": f"{upstream_id}--{downstream_id}@{index}",
                    "eastM": float(upstream["eastM"]) + along * delta_east
                    + lateral * normal_east,
                    "northM": float(upstream["northM"]) + along * delta_north
                    + lateral * normal_north,
                    "floorHeightM": float(upstream["floorHeightM"]) + along * (
                        float(downstream["floorHeightM"])
                        - float(upstream["floorHeightM"])),
                    "floorWidthM": float(upstream["floorWidthM"]) + along * (
                        float(downstream["floorWidthM"])
                        - float(upstream["floorWidthM"])),
                    "wallAngleDegrees": float(upstream["wallAngleDegrees"]) + along * (
                        float(downstream["wallAngleDegrees"])
                        - float(upstream["wallAngleDegrees"])),
                })
            edge_length = 0.0
            parent_id = f"{upstream_id}--{downstream_id}"
            for index, (piece_start, piece_end) in enumerate(
                    zip(centreline, centreline[1:])):
                edge_length += math.hypot(
                    float(piece_end["eastM"]) - float(piece_start["eastM"]),
                    float(piece_end["northM"]) - float(piece_start["northM"]),
                )
                reaches.append({
                    "id": f"{parent_id}:{index:02d}",
                    "parentId": parent_id,
                    "upstream": piece_start,
                    "downstream": piece_end,
                })
            edge_lengths[edge] = edge_length

    runs: list[dict[str, object]] = []
    for run_id, node_ids in VALLEY_RUN_NODE_IDS.items():
        length = sum(
            edge_lengths[(upstream_id, downstream_id)]
            for upstream_id, downstream_id in zip(node_ids, node_ids[1:])
        )
        runs.append({
            "id": run_id,
            "nodeIds": list(node_ids),
            "lengthM": round(length, 3),
            "outletNodeId": node_ids[-1],
            "floorWidthRangeM": [
                min(float(nodes[node_id]["floorWidthM"]) for node_id in node_ids),
                max(float(nodes[node_id]["floorWidthM"]) for node_id in node_ids),
            ],
            "wallAngleRangeDegrees": [
                min(float(nodes[node_id]["wallAngleDegrees"]) for node_id in node_ids),
                max(float(nodes[node_id]["wallAngleDegrees"]) for node_id in node_ids),
            ],
            "floorHeightsM": [
                float(nodes[node_id]["floorHeightM"]) for node_id in node_ids
            ],
        })
    return {
        "id": TERRAIN_VERSION,
        "seed": f"0x{seed:014x}",
        "algorithm": "seeded-drainage-aligned-connected-u-valley-v3",
        "nodes": nodes,
        "reaches": reaches,
        "runs": runs,
    }


def carve_valley_network(local_east: np.ndarray, local_north: np.ndarray,
                         height: np.ndarray, water: np.ndarray,
                         network: dict[str, object]) -> np.ndarray:
    target = np.full(height.shape, np.inf, dtype=np.float64)
    floor_target = np.full(height.shape, np.inf, dtype=np.float64)
    for reach in network["reaches"]:
        upstream = reach["upstream"]
        downstream = reach["downstream"]
        start_east = float(upstream["eastM"])
        start_north = float(upstream["northM"])
        delta_east = float(downstream["eastM"]) - start_east
        delta_north = float(downstream["northM"]) - start_north
        length_squared = delta_east * delta_east + delta_north * delta_north
        along = np.clip(
            ((local_east - start_east) * delta_east
             + (local_north - start_north) * delta_north) / length_squared,
            0.0,
            1.0,
        )
        closest_east = start_east + along * delta_east
        closest_north = start_north + along * delta_north
        distance = np.hypot(local_east - closest_east, local_north - closest_north)
        floor_height = (
            float(upstream["floorHeightM"])
            + along * (float(downstream["floorHeightM"])
                       - float(upstream["floorHeightM"]))
        )
        half_width = 0.5 * (
            float(upstream["floorWidthM"])
            + along * (float(downstream["floorWidthM"])
                       - float(upstream["floorWidthM"]))
        )
        upstream_slope = math.tan(math.radians(float(upstream["wallAngleDegrees"])))
        downstream_slope = math.tan(math.radians(float(downstream["wallAngleDegrees"])))
        wall_slope = upstream_slope + along * (downstream_slope - upstream_slope)
        wall_distance = np.maximum(0.0, distance - half_width)
        profile = floor_height + wall_distance * wall_slope
        active = wall_distance * wall_slope <= MAXIMUM_VALLEY_WALL_RISE_METRES
        target = np.where(active, np.minimum(target, profile), target)
        floor_target = np.where(
            active & (distance <= half_width),
            np.minimum(floor_target, floor_height),
            floor_target,
        )

    carved = np.minimum(height.astype(np.float64), target)
    # Hydrologically condition the U-floor to its authored downhill grade. This deliberately
    # fills small source-DEM pits as well as cutting intervening rises; otherwise a zero-height
    # pond or noisy river sample can turn the nominally descending route back uphill. The wall
    # field remains cut-only, and the locked water classification is restored below.
    on_floor = np.isfinite(floor_target) & ~water
    carved[on_floor] = floor_target[on_floor]
    carved[water] = height[water]
    return carved.astype(np.float32)


class CarvedTerrainSurface:
    def __init__(self, source: SourceMosaic, reference_east_m: float,
                 reference_north_m: float, seed: int = VALLEY_SEED):
        self.source = source
        self.reference_east_m = reference_east_m
        self.reference_north_m = reference_north_m
        def sample_local(local_east, local_north):
            return source.sample(
                local_east + reference_east_m,
                local_north + reference_north_m,
            )

        self.network = build_valley_network(seed, sample_local)

    def sample(self, easting: np.ndarray, northing: np.ndarray):
        height, water = self.source.sample(easting, northing)
        carved = carve_valley_network(
            easting - self.reference_east_m,
            northing - self.reference_north_m,
            height,
            water,
            self.network,
        )
        return carved, water


def wgs84_to_utm(latitude_deg: np.ndarray | float, longitude_deg: np.ndarray | float):
    latitude = np.radians(latitude_deg)
    longitude = np.radians(longitude_deg)
    sine = np.sin(latitude)
    cosine = np.cos(latitude)
    tangent = np.tan(latitude)
    radius = WGS84_A / np.sqrt(1.0 - WGS84_E2 * sine * sine)
    t = tangent * tangent
    c = WGS84_EP2 * cosine * cosine
    a = cosine * (longitude - UTM_CENTRAL_MERIDIAN)
    e4 = WGS84_E2 * WGS84_E2
    e6 = e4 * WGS84_E2
    meridian = WGS84_A * (
        (1.0 - WGS84_E2 / 4.0 - 3.0 * e4 / 64.0 - 5.0 * e6 / 256.0) * latitude
        - (3.0 * WGS84_E2 / 8.0 + 3.0 * e4 / 32.0 + 45.0 * e6 / 1024.0)
        * np.sin(2.0 * latitude)
        + (15.0 * e4 / 256.0 + 45.0 * e6 / 1024.0) * np.sin(4.0 * latitude)
        - 35.0 * e6 / 3072.0 * np.sin(6.0 * latitude)
    )
    easting = 500_000.0 + UTM_K0 * radius * (
        a + (1.0 - t + c) * a**3 / 6.0
        + (5.0 - 18.0 * t + t * t + 72.0 * c - 58.0 * WGS84_EP2) * a**5 / 120.0
    )
    northing = UTM_K0 * (
        meridian
        + radius * tangent * (
            a * a / 2.0
            + (5.0 - t + 9.0 * c + 4.0 * c * c) * a**4 / 24.0
            + (61.0 - 58.0 * t + t * t + 600.0 * c - 330.0 * WGS84_EP2)
            * a**6 / 720.0
        )
    )
    return easting, northing


def utm_to_wgs84(easting_m: np.ndarray, northing_m: np.ndarray):
    e4 = WGS84_E2 * WGS84_E2
    e6 = e4 * WGS84_E2
    meridian = northing_m / UTM_K0
    mu = meridian / (
        WGS84_A * (1.0 - WGS84_E2 / 4.0 - 3.0 * e4 / 64.0 - 5.0 * e6 / 256.0)
    )
    e1 = (1.0 - math.sqrt(1.0 - WGS84_E2)) / (1.0 + math.sqrt(1.0 - WGS84_E2))
    footprint = (
        mu
        + (3.0 * e1 / 2.0 - 27.0 * e1**3 / 32.0) * np.sin(2.0 * mu)
        + (21.0 * e1 * e1 / 16.0 - 55.0 * e1**4 / 32.0) * np.sin(4.0 * mu)
        + 151.0 * e1**3 / 96.0 * np.sin(6.0 * mu)
        + 1097.0 * e1**4 / 512.0 * np.sin(8.0 * mu)
    )
    sine = np.sin(footprint)
    cosine = np.cos(footprint)
    tangent = np.tan(footprint)
    c1 = WGS84_EP2 * cosine * cosine
    t1 = tangent * tangent
    n1 = WGS84_A / np.sqrt(1.0 - WGS84_E2 * sine * sine)
    r1 = WGS84_A * (1.0 - WGS84_E2) / (1.0 - WGS84_E2 * sine * sine) ** 1.5
    d = (easting_m - 500_000.0) / (n1 * UTM_K0)
    latitude = footprint - (n1 * tangent / r1) * (
        d * d / 2.0
        - (5.0 + 3.0 * t1 + 10.0 * c1 - 4.0 * c1 * c1 - 9.0 * WGS84_EP2)
        * d**4 / 24.0
        + (61.0 + 90.0 * t1 + 298.0 * c1 + 45.0 * t1 * t1
           - 252.0 * WGS84_EP2 - 3.0 * c1 * c1) * d**6 / 720.0
    )
    longitude = UTM_CENTRAL_MERIDIAN + (
        d - (1.0 + 2.0 * t1 + c1) * d**3 / 6.0
        + (5.0 - 2.0 * c1 + 28.0 * t1 - 3.0 * c1 * c1
           + 8.0 * WGS84_EP2 + 24.0 * t1 * t1) * d**5 / 120.0
    ) / cosine
    return np.degrees(latitude), np.degrees(longitude)


class SourceMosaic:
    def __init__(self, source_lock: dict[str, object], region: dict[str, object], cache: Path):
        cells = set(region["acquisitionCells"])
        objects = {
            (item["cell"], item["kind"]): item
            for product in source_lock["products"]
            for item in product["objects"]
            if item["cell"] in cells
        }
        if cells != {"N37E126", "N37E127", "N38E126", "N38E127"}:
            raise ValueError("central-front build currently requires its locked two-by-two envelope")
        self.dem = np.empty((7200, 7200), dtype=np.float32)
        self.water = np.empty((7200, 7200), dtype=np.uint8)
        for latitude in (37, 38):
            for longitude in (126, 127):
                cell = f"N{latitude:02d}E{longitude:03d}"
                row = (38 - latitude) * 3600
                column = (longitude - 126) * 3600
                for kind, destination in (("dem", self.dem), ("water-mask", self.water)):
                    entry = objects[(cell, kind)]
                    path = cache / entry["file"]
                    if not path.is_file():
                        raise FileNotFoundError(
                            f"missing {path}; run tools/terrain/fetch_copernicus.py first"
                        )
                    if path.stat().st_size != int(entry["bytes"]) or sha256_file(path) != entry["sha256"]:
                        raise ValueError(f"locked source verification failed: {path}")
                    image = np.asarray(Image.open(path))
                    if image.shape != (3600, 3600):
                        raise ValueError(f"unexpected source raster shape {image.shape}: {path}")
                    destination[row:row + 3600, column:column + 3600] = image

    def sample(self, easting: np.ndarray, northing: np.ndarray):
        latitude, longitude = utm_to_wgs84(easting, northing)
        x = (longitude - 126.0) * 3600.0 - 0.5
        y = (39.0 - latitude) * 3600.0 - 0.5
        if np.any(x < 0.0) or np.any(x > 7199.0) or np.any(y < 0.0) or np.any(y > 7199.0):
            raise ValueError("runtime tiled extent left the locked acquisition envelope")
        height = map_coordinates(self.dem, (y, x), order=1, mode="nearest", prefilter=False)
        water = map_coordinates(self.water, (y, x), order=0, mode="nearest", prefilter=False) > 0
        return height.astype(np.float32), water


def quantize(height: np.ndarray, water: np.ndarray) -> np.ndarray:
    quantized = np.rint(height / QUANTIZATION_METRES)
    if np.any(quantized < -32767) or np.any(quantized > 32767):
        raise ValueError("height exceeds signed 16-bit decimetre runtime encoding")
    result = quantized.astype("<i2")
    result[water] = WATER_SENTINEL
    return result


def grid(mosaic: SourceMosaic, minimum_east: float, minimum_north: float,
         span_east: float, span_north: float, samples_east: int, samples_north: int):
    east = np.linspace(minimum_east, minimum_east + span_east, samples_east)
    north = np.linspace(minimum_north, minimum_north + span_north, samples_north)
    east_grid, north_grid = np.meshgrid(east, north)
    return mosaic.sample(east_grid, north_grid)


def build_bundle(mosaic: SourceMosaic,
                 projected_bounds: tuple[float, float, float, float],
                 local_bounds: tuple[float, float, float, float], output: Path):
    projected_minimum_east, projected_minimum_north, _, _ = projected_bounds
    minimum_east, minimum_north, maximum_east, maximum_north = local_bounds
    count_east = round((maximum_east - minimum_east) / TILE_SPAN_METRES)
    count_north = round((maximum_north - minimum_north) / TILE_SPAN_METRES)
    records: list[dict[str, object]] = []
    chunks: list[dict[str, object]] = []
    payload = bytearray()
    for north_index in range(count_north):
        for east_index in range(count_east):
            chunk_east = minimum_east + east_index * TILE_SPAN_METRES
            chunk_north = minimum_north + north_index * TILE_SPAN_METRES
            chunk = {
                "id": f"e{east_index:02d}-n{north_index:02d}",
                "eastIndex": east_index,
                "northIndex": north_index,
                "boundsLocalM": [
                    chunk_east,
                    chunk_north,
                    chunk_east + TILE_SPAN_METRES,
                    chunk_north + TILE_SPAN_METRES,
                ],
                "lods": [],
            }
            for level, sample_count in enumerate(LOD_SAMPLES):
                height, water = grid(
                    mosaic,
                    projected_minimum_east + (chunk_east - minimum_east),
                    projected_minimum_north + (chunk_north - minimum_north),
                    TILE_SPAN_METRES,
                    TILE_SPAN_METRES,
                    sample_count,
                    sample_count,
                )
                encoded = quantize(height, water).tobytes(order="C")
                while len(payload) % 16:
                    payload.append(0)
                offset = len(payload)
                payload.extend(encoded)
                land = height[~water]
                record = {
                    "level": level,
                    "sampleCount": sample_count,
                    "spacingM": TILE_SPAN_METRES / (sample_count - 1),
                    "byteOffset": offset,
                    "byteLength": len(encoded),
                    "sha256": sha256_bytes(encoded),
                    "minimumHeightM": round(float(land.min()), 1) if land.size else 0.0,
                    "maximumHeightM": round(float(land.max()), 1) if land.size else 0.0,
                    "waterFraction": round(float(water.mean()), 6),
                }
                chunk["lods"].append(record)
                records.append(record)
            chunks.append(chunk)
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(payload)
    return chunks, {
        "byteLength": len(payload),
        "sha256": sha256_bytes(payload),
        "recordCount": len(records),
    }


def build_truth(mosaic: SourceMosaic,
                projected_bounds: tuple[float, float, float, float],
                local_bounds: tuple[float, float, float, float], output: Path):
    projected_minimum_east, projected_minimum_north, projected_maximum_east, projected_maximum_north = projected_bounds
    minimum_east, minimum_north, maximum_east, maximum_north = local_bounds
    width = round((maximum_east - minimum_east) / SIM_SPACING_METRES) + 1
    height_count = round((maximum_north - minimum_north) / SIM_SPACING_METRES) + 1
    height, water = grid(
        mosaic,
        projected_minimum_east,
        projected_minimum_north,
        projected_maximum_east - projected_minimum_east,
        projected_maximum_north - projected_minimum_north,
        width,
        height_count,
    )
    encoded = quantize(height, water)
    header = struct.pack(
        "<8sIIIddddh10x",
        MAGIC,
        1,
        width,
        height_count,
        SIM_SPACING_METRES,
        minimum_east,
        minimum_north,
        QUANTIZATION_METRES,
        WATER_SENTINEL,
    )
    if len(header) != 64:
        raise AssertionError(f"truth header is {len(header)} bytes, expected 64")
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_bytes(header + encoded.tobytes(order="C"))
    land = height[~water]
    return {
        "width": width,
        "height": height_count,
        "spacingM": SIM_SPACING_METRES,
        "byteLength": output.stat().st_size,
        "sha256": sha256_file(output),
        "minimumHeightM": round(float(land.min()), 1),
        "maximumHeightM": round(float(land.max()), 1),
        "waterFraction": round(float(water.mean()), 6),
    }


def build_preview(mosaic: SourceMosaic, tiled_bounds: tuple[float, float, float, float], output: Path):
    minimum_east, minimum_north, maximum_east, maximum_north = tiled_bounds
    width = 1024
    height_count = max(1, round(width * (maximum_north - minimum_north) / (maximum_east - minimum_east)))
    elevation, water = grid(
        mosaic,
        minimum_east,
        minimum_north,
        maximum_east - minimum_east,
        maximum_north - minimum_north,
        width,
        height_count,
    )
    dy, dx = np.gradient(elevation)
    normal = np.sqrt(dx * dx + dy * dy + 1.0)
    shade = np.clip(((-dx * 0.55 + dy * 0.35 + 1.0) / normal) * 0.62 + 0.38, 0.18, 1.0)
    altitude = np.clip(elevation / 1500.0, 0.0, 1.0)
    low = np.array([116.0, 126.0, 72.0])
    high = np.array([157.0, 151.0, 126.0])
    colour = low + (high - low) * altitude[..., None]
    colour *= shade[..., None]
    colour[water] = np.array([45.0, 91.0, 112.0])
    image = Image.fromarray(np.clip(colour[::-1], 0, 255).astype(np.uint8), "RGB")
    output.parent.mkdir(parents=True, exist_ok=True)
    image.save(output, optimize=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lock", type=Path, default=DEFAULT_LOCK)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--region", default="central-front")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT)
    arguments = parser.parse_args()

    source_lock = json.loads(arguments.lock.read_text())
    region = next(
        (item for item in source_lock["runtimeRegions"] if item["id"] == arguments.region),
        None,
    )
    if region is None:
        raise SystemExit(f"unknown runtime region: {arguments.region}")
    if region["workingCrs"] != "EPSG:32652":
        raise SystemExit("this builder currently implements WGS 84 / UTM zone 52N only")

    west, south, east, north = region["aoiWgs84"]
    corner_latitude = np.array([south, south, north, north])
    corner_longitude = np.array([west, east, west, east])
    corner_east, corner_north = wgs84_to_utm(corner_latitude, corner_longitude)
    reference_longitude, reference_latitude = region["referenceOriginWgs84"]
    reference_east, reference_north = wgs84_to_utm(reference_latitude, reference_longitude)
    local_minimum_east = math.floor((float(corner_east.min()) - reference_east) / TILE_SPAN_METRES) * TILE_SPAN_METRES
    local_maximum_east = math.ceil((float(corner_east.max()) - reference_east) / TILE_SPAN_METRES) * TILE_SPAN_METRES
    local_minimum_north = math.floor((float(corner_north.min()) - reference_north) / TILE_SPAN_METRES) * TILE_SPAN_METRES
    local_maximum_north = math.ceil((float(corner_north.max()) - reference_north) / TILE_SPAN_METRES) * TILE_SPAN_METRES
    local_bounds = (
        local_minimum_east,
        local_minimum_north,
        local_maximum_east,
        local_maximum_north,
    )
    projected_bounds = (
        local_minimum_east + reference_east,
        local_minimum_north + reference_north,
        local_maximum_east + reference_east,
        local_maximum_north + reference_north,
    )

    mosaic = SourceMosaic(source_lock, region, arguments.cache)
    surface = CarvedTerrainSurface(mosaic, float(reference_east), float(reference_north))
    bundle_path = arguments.output / "central-front.terrain"
    truth_path = arguments.output / "central-front.truth"
    preview_path = arguments.output / "central-front-preview.png"
    chunks, bundle = build_bundle(surface, projected_bounds, local_bounds, bundle_path)
    truth = build_truth(surface, projected_bounds, local_bounds, truth_path)
    build_preview(surface, projected_bounds, preview_path)

    source_product = source_lock["products"][0]
    manifest = {
        "schemaVersion": "1.0.0",
        "terrainId": "terrain.korea.central-front.v2",
        "terrainVersion": TERRAIN_VERSION,
        "displayName": region["displayName"],
        "canonicalCoverageId": source_lock["canonicalCoverage"]["id"],
        "aoiWgs84": region["aoiWgs84"],
        "acquisitionCells": region["acquisitionCells"],
        "horizontalCrs": region["workingCrs"],
        "verticalCrs": region["verticalCrs"],
        "referenceOrigin": {
            "latitude": reference_latitude,
            "longitude": reference_longitude,
            "eastingM": round(float(reference_east), 6),
            "northingM": round(float(reference_north), 6),
        },
        "boundsLocalM": list(local_bounds),
        "tileSpanM": TILE_SPAN_METRES,
        "quantization": {
            "storage": "little-endian-signed-int16",
            "metresPerUnit": QUANTIZATION_METRES,
            "waterSentinel": WATER_SENTINEL,
            "rowOrder": "south-to-north",
        },
        "bundle": {
            "uri": bundle_path.name,
            **bundle,
        },
        "simulationTruth": {
            "uri": truth_path.name,
            **truth,
        },
        "preview": {
            "uri": preview_path.name,
            "sha256": sha256_file(preview_path),
            "byteLength": preview_path.stat().st_size,
        },
        "chunks": chunks,
        "carving": {
            "id": surface.network["id"],
            "seed": surface.network["seed"],
            "algorithm": surface.network["algorithm"],
            "junctionNodeIds": ["central-junction"],
            "controlNodes": list(surface.network["nodes"].values()),
            "majorRuns": surface.network["runs"],
            "sharedSurfaceContract":
                "carve-before-renderer-lod-and-kernel-truth-quantization",
        },
        "source": {
            "sourceLockId": source_lock["sourceLockId"],
            "productId": source_product["id"],
            "edition": source_product["edition"],
            "modifiedData": True,
            "requiredNotices": source_product["licence"]["requiredNotices"],
        },
        "build": {
            "builder": "tools/terrain/build_korea_terrain.py",
            "builderVersion": 2,
            "numpyVersion": np.__version__,
            "pillowVersion": PIL.__version__,
        },
    }
    manifest_path = arguments.output / "central-front.manifest.json"
    manifest_path.write_text(json.dumps(manifest, indent=2, sort_keys=True) + "\n")
    print(
        f"built {len(chunks)} chunks, {bundle['byteLength'] / 1024 / 1024:.2f} MiB bundle, "
        f"{truth['byteLength'] / 1024 / 1024:.2f} MiB simulation truth"
    )


if __name__ == "__main__":
    main()
