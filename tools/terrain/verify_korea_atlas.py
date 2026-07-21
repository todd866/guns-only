#!/usr/bin/env python3
"""Verify hashes, ranges, and browser budgets for a built Korea terrain atlas."""

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path


ROOT_MANIFEST_BUDGET = 64 * 1024
PAGE_MANIFEST_BUDGET = 512 * 1024
PAGE_BUNDLE_BUDGET = 64 * 1024 * 1024
LOD0_RECORD_BUDGET = 256 * 1024


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)


def verify(root_path: Path) -> dict[str, object]:
    require(root_path.stat().st_size <= ROOT_MANIFEST_BUDGET,
            f"root manifest exceeds {ROOT_MANIFEST_BUDGET} bytes")
    root = json.loads(root_path.read_text())
    require(root.get("schemaVersion") == "2.0.0", "root manifest is not terrain atlas v2")
    page_ids = set()
    chunk_ids = set()
    total_bundle_bytes = 0
    total_records = 0
    maximum_page_manifest_bytes = 0
    maximum_page_bundle_bytes = 0
    maximum_lod0_record_bytes = 0
    finest_spacing_m = float("inf")
    for descriptor in root["pages"]:
        page_id = descriptor["id"]
        require(page_id not in page_ids, f"duplicate page id: {page_id}")
        page_ids.add(page_id)
        manifest_path = root_path.parent / descriptor["manifest"]["uri"]
        require(manifest_path.is_file(), f"missing page manifest: {manifest_path}")
        require(manifest_path.stat().st_size == descriptor["manifest"]["byteLength"],
                f"page manifest byte mismatch: {page_id}")
        require(sha256_file(manifest_path) == descriptor["manifest"]["sha256"],
                f"page manifest hash mismatch: {page_id}")
        require(manifest_path.stat().st_size <= PAGE_MANIFEST_BUDGET,
                f"page manifest exceeds browser budget: {page_id}")
        maximum_page_manifest_bytes = max(maximum_page_manifest_bytes, manifest_path.stat().st_size)
        page = json.loads(manifest_path.read_text())
        require(page.get("schemaVersion") == "1.0.0", f"invalid page schema: {page_id}")
        bundle_path = manifest_path.parent / page["bundle"]["uri"]
        require(bundle_path.is_file(), f"missing page bundle: {bundle_path}")
        require(bundle_path.stat().st_size == page["bundle"]["byteLength"],
                f"page bundle byte mismatch: {page_id}")
        require(sha256_file(bundle_path) == page["bundle"]["sha256"],
                f"page bundle hash mismatch: {page_id}")
        require(bundle_path.stat().st_size <= PAGE_BUNDLE_BUDGET,
                f"page bundle exceeds Range-fallback budget: {page_id}")
        maximum_page_bundle_bytes = max(maximum_page_bundle_bytes, bundle_path.stat().st_size)
        total_bundle_bytes += bundle_path.stat().st_size
        with bundle_path.open("rb") as bundle:
            page_records = 0
            for chunk in page["chunks"]:
                require(chunk["id"] not in chunk_ids, f"duplicate chunk id: {chunk['id']}")
                chunk_ids.add(chunk["id"])
                generation = chunk.get("generation", {})
                require(isinstance(generation.get("seed"), int),
                        f"chunk lacks deterministic scenery seed: {chunk['id']}")
                for record in chunk["lods"]:
                    expected_length = record["sampleCount"] ** 2 * 2
                    require(record["byteLength"] == expected_length,
                            f"invalid range length: {chunk['id']} LOD{record['level']}")
                    require(record["byteOffset"] + record["byteLength"] <= page["bundle"]["byteLength"],
                            f"range overruns bundle: {chunk['id']} LOD{record['level']}")
                    bundle.seek(record["byteOffset"])
                    value = bundle.read(record["byteLength"])
                    require(hashlib.sha256(value).hexdigest() == record["sha256"],
                            f"range hash mismatch: {chunk['id']} LOD{record['level']}")
                    if record["level"] == 0:
                        maximum_lod0_record_bytes = max(
                            maximum_lod0_record_bytes, record["byteLength"]
                        )
                        finest_spacing_m = min(finest_spacing_m, record["spacingM"])
                        require(record["byteLength"] <= LOD0_RECORD_BUDGET,
                                f"LOD0 record exceeds browser budget: {chunk['id']}")
                    page_records += 1
        require(page_records == page["bundle"]["recordCount"],
                f"record count mismatch: {page_id}")
        total_records += page_records
    require(finest_spacing_m <= 32.0,
            f"atlas does not preserve source-resolution terrain: {finest_spacing_m} m")
    return {
        "terrainId": root["terrainId"],
        "pages": len(page_ids),
        "chunks": len(chunk_ids),
        "records": total_records,
        "bundleBytes": total_bundle_bytes,
        "finestSpacingM": finest_spacing_m,
        "maximumRootManifestBytes": root_path.stat().st_size,
        "maximumPageManifestBytes": maximum_page_manifest_bytes,
        "maximumPageBundleBytes": maximum_page_bundle_bytes,
        "maximumLod0RecordBytes": maximum_lod0_record_bytes,
        "sceneryProfiles": root.get("scenery", {}).get("supportedProfiles", []),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    arguments = parser.parse_args()
    print(json.dumps(verify(arguments.manifest), indent=2))


if __name__ == "__main__":
    main()
