#!/usr/bin/env python3
"""Fetch and lock every Copernicus cell in the canonical Korea atlas envelope."""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import copy
import hashlib
import json
import os
from pathlib import Path
import tempfile
import urllib.error
import urllib.request

from build_korea_atlas import coverage_cells


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LOCK = ROOT / "content/sources/korea-terrain-source-lock.json"
BASE_URL = "https://copernicus-dem-30m.s3.amazonaws.com"


def object_descriptor(cell: str, kind: str) -> dict[str, object]:
    latitude = cell[1:3]
    longitude = cell[4:7]
    stem = f"Copernicus_DSM_COG_10_N{latitude}_00_E{longitude}_00"
    directory = f"{stem}_DEM"
    if kind == "dem":
        filename = f"{stem}_DEM.tif"
        url = f"{BASE_URL}/{directory}/{filename}"
    elif kind == "water-mask":
        filename = f"{stem}_WBM.tif"
        url = f"{BASE_URL}/{directory}/AUXFILES/{filename}"
    else:
        raise ValueError(f"unknown Copernicus object kind: {kind}")
    return {"cell": cell, "kind": kind, "file": filename, "url": url}


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def fetch_and_lock(descriptor: dict[str, object], cache: Path) -> dict[str, object]:
    target = cache / descriptor["file"]
    if not target.is_file():
        cache.mkdir(parents=True, exist_ok=True)
        file_descriptor, temporary_name = tempfile.mkstemp(
            prefix=f".{target.name}.", dir=cache
        )
        os.close(file_descriptor)
        temporary = Path(temporary_name)
        try:
            request = urllib.request.Request(
                descriptor["url"], headers={"User-Agent": "GunsOnlyTerrainBuilder/2.0"}
            )
            try:
                with urllib.request.urlopen(request, timeout=120) as response, temporary.open("wb") as output:
                    while block := response.read(1024 * 1024):
                        output.write(block)
            except urllib.error.HTTPError as error:
                if error.code == 404:
                    print(f"absent {descriptor['cell']}/{descriptor['kind']} (implicit ocean)",
                          flush=True)
                    return {**descriptor, "availability": "absent"}
                raise
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
    result = dict(descriptor)
    result["bytes"] = target.stat().st_size
    result["sha256"] = digest(target)
    print(f"locked {descriptor['cell']}/{descriptor['kind']} {result['bytes']} bytes", flush=True)
    return result


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lock", type=Path, default=DEFAULT_LOCK)
    parser.add_argument("--cache", type=Path)
    parser.add_argument("--output", type=Path)
    parser.add_argument("--workers", type=int, default=6)
    parser.add_argument("--dry-plan", action="store_true")
    arguments = parser.parse_args()

    source_lock = json.loads(arguments.lock.read_text())
    cells = coverage_cells(source_lock["canonicalCoverage"]["aoiWgs84"])
    descriptors = [
        object_descriptor(cell, kind)
        for cell in cells
        for kind in ("dem", "water-mask")
    ]
    known_implicit_water = set(
        source_lock.get("canonicalCoverage", {}).get("implicitWaterCells", [])
    )
    existing = {
        (item["cell"], item["kind"]): item
        for product in source_lock["products"]
        for item in product["objects"]
    }
    if arguments.dry_plan:
        print(json.dumps({
            "cells": len(cells),
            "objects": len(descriptors),
            "alreadyLocked": sum(
                (item["cell"], item["kind"]) in existing
                or item["cell"] in known_implicit_water
                for item in descriptors
            ),
            "remaining": sum(
                (item["cell"], item["kind"]) not in existing
                and item["cell"] not in known_implicit_water
                for item in descriptors
            ),
        }, indent=2))
        return
    if arguments.cache is None or arguments.output is None:
        raise SystemExit("--cache and --output are required unless --dry-plan is used")

    results: list[dict[str, object]] = [
        {**descriptor, "availability": "absent"}
        for descriptor in descriptors
        if descriptor["cell"] in known_implicit_water
    ]
    descriptors_to_fetch = [
        descriptor for descriptor in descriptors
        if descriptor["cell"] not in known_implicit_water
    ]
    with ThreadPoolExecutor(max_workers=max(1, arguments.workers)) as executor:
        futures = {
            executor.submit(fetch_and_lock, descriptor, arguments.cache): descriptor
            for descriptor in descriptors_to_fetch
        }
        for future in as_completed(futures):
            results.append(future.result())
    unavailable = {
        item["cell"]: {
            candidate["kind"] for candidate in results
            if candidate["cell"] == item["cell"] and candidate.get("availability") == "absent"
        }
        for item in results if item.get("availability") == "absent"
    }
    partial = {cell: kinds for cell, kinds in unavailable.items() if len(kinds) != 2}
    if partial:
        raise RuntimeError(f"Copernicus cell is only partially available: {partial}")
    implicit_water_cells = sorted(unavailable)
    locked = [item for item in results if item.get("availability") != "absent"]
    locked.sort(key=lambda item: (item["cell"], item["kind"]))

    result = copy.deepcopy(source_lock)
    result["sourceLockId"] = "source-lock.korea-terrain.peninsula.v1"
    result["checkedAt"] = __import__("datetime").date.today().isoformat()
    result["canonicalCoverage"]["implicitWaterCells"] = implicit_water_cells
    result["products"][0]["objects"] = locked
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(json.dumps(result, indent=2, sort_keys=False) + "\n")
    print(f"wrote {len(locked)} locked objects to {arguments.output}")


if __name__ == "__main__":
    main()
