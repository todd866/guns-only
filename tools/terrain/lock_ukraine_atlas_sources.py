#!/usr/bin/env python3
"""Fetch and lock Copernicus cells for the Ukraine geodetic theatre source lock."""

from __future__ import annotations

import argparse
import copy
from concurrent.futures import ThreadPoolExecutor, as_completed
import datetime
import json
from pathlib import Path

from build_korea_atlas import coverage_cells, region_from_lock
from lock_korea_atlas_sources import fetch_and_lock, object_descriptor


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LOCK = ROOT / "content/sources/ukraine-terrain-source-lock.json"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--lock", type=Path, default=DEFAULT_LOCK)
    parser.add_argument("--cache", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--region", default="rapier-range",
                        help="runtime region id, or 'canonical' for full D2 envelope")
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--dry-plan", action="store_true")
    arguments = parser.parse_args()

    source_lock = json.loads(arguments.lock.read_text())
    if arguments.region == "canonical":
        cells = coverage_cells(source_lock["canonicalCoverage"]["aoiWgs84"])
    else:
        region = region_from_lock(source_lock, arguments.region)
        cells = list(region["acquisitionCells"])

    descriptors = [
        object_descriptor(cell, kind)
        for cell in cells
        for kind in ("dem", "water-mask")
    ]
    known_implicit = set(
        source_lock.get("canonicalCoverage", {}).get("implicitWaterCells", [])
    )
    existing = {
        (item["cell"], item["kind"]): item
        for product in source_lock["products"]
        for item in product["objects"]
    }
    if arguments.dry_plan:
        print(json.dumps({
            "region": arguments.region,
            "cells": len(cells),
            "objects": len(descriptors),
            "alreadyLocked": sum(
                (item["cell"], item["kind"]) in existing
                or item["cell"] in known_implicit
                for item in descriptors
            ),
            "remaining": sum(
                (item["cell"], item["kind"]) not in existing
                and item["cell"] not in known_implicit
                for item in descriptors
            ),
        }, indent=2))
        return
    if arguments.cache is None or arguments.output is None:
        raise SystemExit("--cache and --output are required unless --dry-plan is used")

    results: list[dict[str, object]] = [
        {**descriptor, "availability": "absent"}
        for descriptor in descriptors
        if descriptor["cell"] in known_implicit
    ]
    to_fetch = [
        descriptor for descriptor in descriptors
        if descriptor["cell"] not in known_implicit
    ]
    with ThreadPoolExecutor(max_workers=max(1, arguments.workers)) as executor:
        futures = {
            executor.submit(fetch_and_lock, descriptor, arguments.cache): descriptor
            for descriptor in to_fetch
        }
        for future in as_completed(futures):
            results.append(future.result())

    unavailable = {}
    for item in results:
        if item.get("availability") == "absent":
            unavailable.setdefault(item["cell"], set()).add(item["kind"])
    partial = {cell: kinds for cell, kinds in unavailable.items() if len(kinds) != 2}
    if partial:
        raise RuntimeError(f"Copernicus cell is only partially available: {partial}")

    implicit_water_cells = sorted(set(known_implicit) | set(unavailable))
    locked = [item for item in results if item.get("availability") != "absent"]
    # Keep previously locked objects outside this region.
    prior = [
        item for item in source_lock["products"][0]["objects"]
        if item["cell"] not in cells
    ]
    merged = prior + locked
    merged.sort(key=lambda item: (item["cell"], item["kind"]))

    result = copy.deepcopy(source_lock)
    result["checkedAt"] = datetime.date.today().isoformat()
    result["canonicalCoverage"]["implicitWaterCells"] = implicit_water_cells
    result["products"][0]["objects"] = merged
    # Refresh acquisition list to cells that actually locked for this region.
    if arguments.region != "canonical":
        for region in result["runtimeRegions"]:
            if region["id"] == arguments.region:
                region["acquisitionCells"] = sorted({
                    item["cell"] for item in locked
                })
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(json.dumps(result, indent=2, sort_keys=False) + "\n")
    print(f"wrote {len(merged)} locked objects ({len(locked)} in region) to {arguments.output}")


if __name__ == "__main__":
    main()
