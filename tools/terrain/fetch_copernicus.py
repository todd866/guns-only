#!/usr/bin/env python3
"""Fetch and verify the immutable Copernicus inputs declared by the Korea source lock."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import tempfile
import urllib.request


ROOT = Path(__file__).resolve().parents[2]
DEFAULT_LOCK = ROOT / "content/sources/korea-terrain-source-lock.json"


def digest(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(chunk)
    return value.hexdigest()


def fetch_object(entry: dict[str, object], cache: Path) -> None:
    target = cache / str(entry["file"])
    expected_bytes = int(entry["bytes"])
    expected_digest = str(entry["sha256"])
    if target.is_file() and target.stat().st_size == expected_bytes:
        if digest(target) == expected_digest:
            print(f"verified {target.name}")
            return
        raise RuntimeError(f"existing cache object has the wrong digest: {target}")

    cache.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{target.name}.", dir=cache)
    os.close(descriptor)
    temporary = Path(temporary_name)
    try:
        request = urllib.request.Request(
            str(entry["url"]),
            headers={"User-Agent": "GunsOnlyTerrainBuilder/1.0"},
        )
        with urllib.request.urlopen(request, timeout=90) as response, temporary.open("wb") as output:
            while block := response.read(1024 * 1024):
                output.write(block)
        if temporary.stat().st_size != expected_bytes:
            raise RuntimeError(
                f"byte count mismatch for {target.name}: "
                f"{temporary.stat().st_size} != {expected_bytes}"
            )
        actual_digest = digest(temporary)
        if actual_digest != expected_digest:
            raise RuntimeError(
                f"digest mismatch for {target.name}: {actual_digest} != {expected_digest}"
            )
        temporary.replace(target)
        print(f"fetched {target.name}")
    finally:
        temporary.unlink(missing_ok=True)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--lock", type=Path, default=DEFAULT_LOCK)
    parser.add_argument("--cache", type=Path, required=True)
    parser.add_argument("--region", default="central-front")
    arguments = parser.parse_args()

    source_lock = json.loads(arguments.lock.read_text())
    region = next(
        (item for item in source_lock["runtimeRegions"] if item["id"] == arguments.region),
        None,
    )
    if region is None:
        raise SystemExit(f"unknown runtime region: {arguments.region}")
    cells = set(region["acquisitionCells"])
    objects = [
        item
        for product in source_lock["products"]
        for item in product["objects"]
        if item["cell"] in cells
    ]
    if not objects:
        raise SystemExit(f"source lock has no objects for {arguments.region}")
    for entry in objects:
        fetch_object(entry, arguments.cache)


if __name__ == "__main__":
    main()
