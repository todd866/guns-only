#!/usr/bin/env python3
"""Estimate one browser terrain working set from a verified Korea atlas."""

from __future__ import annotations

import argparse
import json
import math
from pathlib import Path


TIERS = {
    "mobile": {"distancesM": (10_000, 25_000, 58_000), "density": 0.34,
               "treeLimit": 180, "buildingLimit": 18, "fieldLimit": 18,
               "fieldRowLimit": 96, "roadSegmentLimit": 32,
               "railSegmentLimit": 12, "powerPoleLimit": 10,
               "runwaySegmentLimit": 6},
    "balanced": {"distancesM": (16_000, 42_000, 88_000), "density": 0.68,
                 "treeLimit": 480, "buildingLimit": 48, "fieldLimit": 46,
                 "fieldRowLimit": 240, "roadSegmentLimit": 72,
                 "railSegmentLimit": 28, "powerPoleLimit": 28,
                 "runwaySegmentLimit": 10},
    "desktop": {"distancesM": (24_000, 60_000, 118_000), "density": 1.0,
                "treeLimit": 900, "buildingLimit": 90, "fieldLimit": 90,
                "fieldRowLimit": 480, "roadSegmentLimit": 128,
                "railSegmentLimit": 48, "powerPoleLimit": 52,
                "runwaySegmentLimit": 16},
}
SCENERY = {
    "1950s": {"treesPerKm2": 34, "buildingsPerKm2": 2.2,
              "fieldsPerKm2": 7.5, "treeLimitScale": 0.55,
              "buildingLimitScale": 0.35, "fieldLimitScale": 1.0},
    "modern": {"treesPerKm2": 58, "buildingsPerKm2": 7.5,
               "fieldsPerKm2": 4.2, "treeLimitScale": 1.0,
               "buildingLimitScale": 1.0, "fieldLimitScale": 0.82},
}
RANGE_CACHE_RECORDS_PER_PAGE = 8


def distance_to_bounds(east_m: float, north_m: float, bounds: list[float]) -> float:
    delta_east = bounds[0] - east_m if east_m < bounds[0] else (
        east_m - bounds[2] if east_m > bounds[2] else 0
    )
    delta_north = bounds[1] - north_m if north_m < bounds[1] else (
        north_m - bounds[3] if north_m > bounds[3] else 0
    )
    return math.hypot(delta_east, delta_north)


def profile(root_path: Path, east_m: float = 0, north_m: float = 0) -> dict[str, object]:
    root = json.loads(root_path.read_text())
    pages = []
    chunks = []
    for descriptor in root["pages"]:
        page_path = root_path.parent / descriptor["manifest"]["uri"]
        page = json.loads(page_path.read_text())
        pages.append((descriptor, page_path.stat().st_size))
        chunks.extend(page["chunks"])
    area_km2 = root["tileSpanM"] ** 2 / 1_000_000
    result = {}
    for tier_name, tier in TIERS.items():
        distances = tier["distancesM"]
        load_radius_m = distances[-1] + root["tileSpanM"] * math.sqrt(2)
        evict_radius_m = load_radius_m + 56_000
        loaded_pages = [
            (descriptor, manifest_bytes)
            for descriptor, manifest_bytes in pages
            if distance_to_bounds(east_m, north_m, descriptor["boundsLocalM"]) <= load_radius_m
        ]
        retained_pages = [
            descriptor for descriptor, _ in pages
            if distance_to_bounds(east_m, north_m, descriptor["boundsLocalM"]) <= evict_radius_m
        ]
        lod_counts = [0, 0, 0, 0]
        record_bytes = 0
        vertices = 0
        maximum_triangles = 0
        scenery = {era: {"trees": 0, "buildings": 0, "fields": 0}
                   for era in SCENERY}
        closest_lod_chunks = 0
        for chunk in chunks:
            bounds = chunk["boundsLocalM"]
            distance_m = math.hypot(
                (bounds[0] + bounds[2]) * 0.5 - east_m,
                (bounds[1] + bounds[3]) * 0.5 - north_m,
            )
            if distance_m > load_radius_m:
                continue
            level = next((index for index, limit in enumerate(distances)
                          if distance_m < limit), len(distances))
            level = min(level, len(chunk["lods"]) - 1)
            lod_counts[level] += 1
            record = chunk["lods"][level]
            sample_count = record["sampleCount"]
            perimeter = 4 * sample_count - 4
            record_bytes += record["byteLength"]
            vertices += sample_count ** 2 + perimeter * 2
            maximum_triangles += 2 * (sample_count - 1) ** 2 + perimeter * 2
            if level != 0:
                continue
            closest_lod_chunks += 1
            land_fraction = max(0, min(1, float(chunk["generation"]["landFraction"])))
            for era, density in SCENERY.items():
                scenery[era]["trees"] += min(
                    round(tier["treeLimit"] * density["treeLimitScale"]),
                    round(density["treesPerKm2"] * area_km2 * land_fraction * tier["density"]),
                )
                scenery[era]["buildings"] += min(
                    round(tier["buildingLimit"] * density["buildingLimitScale"]),
                    round(density["buildingsPerKm2"] * area_km2 * land_fraction
                          * tier["density"]),
                )
                scenery[era]["fields"] += min(
                    round(tier["fieldLimit"] * density["fieldLimitScale"]),
                    round(density["fieldsPerKm2"] * area_km2 * land_fraction
                          * tier["density"]),
                )
        closest_lod_caps = {}
        for era in SCENERY:
            road_segments = closest_lod_chunks * tier["roadSegmentLimit"]
            rail_segments = closest_lod_chunks * tier["railSegmentLimit"]
            power_poles = closest_lod_chunks * tier["powerPoleLimit"]
            field_rows = closest_lod_chunks * tier["fieldRowLimit"]
            runway_surfaces = closest_lod_chunks * tier["runwaySegmentLimit"]
            road_markings = road_segments if era == "modern" else 0
            draw_batches_per_chunk = 12 if era == "modern" else 11
            maximum_instance_matrices = (
                scenery[era]["trees"] * 2
                + scenery[era]["buildings"]
                + scenery[era]["fields"]
                + field_rows
                + road_segments
                + road_markings
                + rail_segments * 3
                + power_poles * 2
                + runway_surfaces
            )
            closest_lod_caps[era] = {
                "fieldRows": field_rows,
                "roadSurfaces": road_segments,
                "roadMarkings": road_markings,
                "railBeds": rail_segments,
                "individualRails": rail_segments * 2,
                "powerPoles": power_poles,
                "powerLines": power_poles,
                "runwaySurfaces": runway_surfaces,
                "maximumInstanceMatrices": maximum_instance_matrices,
                "maximumInstanceMatrixBytes": maximum_instance_matrices * 64,
                "maximumDrawBatchesPerChunk": draw_batches_per_chunk,
                "maximumDrawBatchesAcrossClosestRing": (
                    closest_lod_chunks * draw_batches_per_chunk
                ),
            }
        result[tier_name] = {
            "loadRadiusM": round(load_radius_m),
            "evictRadiusM": round(evict_radius_m),
            "residentPages": len(loaded_pages),
            "maximumRetainedPagesAtPosition": len(retained_pages),
            "pageManifestBytes": sum(value for _, value in loaded_pages),
            "residentChunks": sum(lod_counts),
            "lodChunks": {f"lod{index}": count for index, count in enumerate(lod_counts)},
            "heightRecordBytes": record_bytes,
            "terrainVerticesIncludingSkirts": vertices,
            "maximumTerrainTriangles": maximum_triangles,
            "maximumRangeCacheBytes": (
                len(retained_pages) * RANGE_CACHE_RECORDS_PER_PAGE * 132_098
            ),
            "sceneryInstances": scenery,
            "closestLodChunks": closest_lod_chunks,
            "sceneryClosestLodCaps": closest_lod_caps,
        }
    return {
        "terrainId": root["terrainId"],
        "positionLocalM": [east_m, north_m],
        "tiers": result,
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--east-m", type=float, default=0)
    parser.add_argument("--north-m", type=float, default=0)
    arguments = parser.parse_args()
    print(json.dumps(profile(arguments.manifest, arguments.east_m, arguments.north_m), indent=2))


if __name__ == "__main__":
    main()
