#!/usr/bin/env python3
"""Derive simulation terrain truth from the exact records used by a terrain atlas.

The browser streams quantized LOD records from page bundles.  The simulation uses the smaller
GOKTRN1 grid contract.  This tool joins selected atlas records into that contract without
resampling or inventing a second elevation source:

* the regional grid uses every coarsest-LOD record;
* an optional detail grid uses the finest records intersecting an inclusive local-metre bounds;
* root page-manifest hashes, consumed record hashes, quantization, overlap samples, and output
  hashes are all checked or recorded.

Page manifests and bundles may come from a local atlas export.  For a published atlas,
``--remote-pages-base`` performs sparse HTTP range reads, so deriving a 256 m kernel grid does not
require downloading every 32/64/128 m renderer record.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import os
from pathlib import Path
import re
import struct
import tempfile
from typing import Iterable
from urllib.request import Request, urlopen


TRUTH_MAGIC = b"GOKTRN1\0"
TRUTH_VERSION = 1
TRUTH_HEADER = struct.Struct("<8sIIIddddh10x")
CONTENT_RANGE = re.compile(r"bytes\s+(\d+)-(\d+)/(\d+|\*)", re.IGNORECASE)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def load_json_bytes(data: bytes, label: str) -> dict:
    try:
        value = json.loads(data)
    except (UnicodeDecodeError, json.JSONDecodeError) as exc:
        raise ValueError(f"{label} is not valid UTF-8 JSON") from exc
    if not isinstance(value, dict):
        raise ValueError(f"{label} root must be an object")
    return value


def read_url(url: str, range_header: str | None = None) -> tuple[bytes, dict[str, str]]:
    headers = {"User-Agent": "guns-only-atlas-truth-builder/1"}
    if range_header is not None:
        headers["Range"] = range_header
    with urlopen(Request(url, headers=headers), timeout=120) as response:
        body = response.read()
        response_headers = {key.lower(): value for key, value in response.headers.items()}
    return body, response_headers


def parse_multipart_ranges(
    body: bytes,
    content_type: str,
) -> dict[tuple[int, int], bytes]:
    boundary_match = re.search(
        r"boundary=(?:\"([^\"]+)\"|([^;\s]+))",
        content_type,
        re.IGNORECASE,
    )
    if boundary_match is None:
        raise ValueError("multipart range response has no boundary")
    boundary = (boundary_match.group(1) or boundary_match.group(2)).encode("ascii")
    marker = b"--" + boundary
    records: dict[tuple[int, int], bytes] = {}
    for part in body.split(marker):
        part = part.strip(b"\r\n")
        if not part or part == b"--":
            continue
        header_end = part.find(b"\r\n\r\n")
        if header_end < 0:
            raise ValueError("multipart range part has no header terminator")
        header_bytes = part[:header_end].decode("ascii", errors="strict")
        payload = part[header_end + 4 :]
        if payload.endswith(b"\r\n"):
            payload = payload[:-2]
        content_range_line = next(
            (
                line.split(":", 1)[1].strip()
                for line in header_bytes.split("\r\n")
                if line.lower().startswith("content-range:")
            ),
            None,
        )
        match = CONTENT_RANGE.fullmatch(content_range_line or "")
        if match is None:
            raise ValueError("multipart range part has an invalid Content-Range")
        start, end = int(match.group(1)), int(match.group(2))
        if len(payload) != end - start + 1:
            raise ValueError(
                f"range {start}-{end} returned {len(payload)} bytes, "
                f"expected {end - start + 1}"
            )
        records[(start, end)] = payload
    return records


def fetch_ranges(
    url: str,
    ranges: list[tuple[int, int]],
    full_length: int,
    full_sha256: str,
) -> dict[tuple[int, int], bytes]:
    if not ranges:
        return {}
    requested = ",".join(f"{start}-{end}" for start, end in ranges)
    body, headers = read_url(url, f"bytes={requested}")
    content_type = headers.get("content-type", "")
    # Some CDNs advertise byte ranges yet ignore multipart Range. Accept that response only when it
    # is the complete, bundle-manifest-locked object; one verified full fetch is still deterministic
    # and is safer than silently treating a partial or cache error as terrain.
    if headers.get("content-range") is None and len(body) == full_length:
        actual_sha = sha256(body)
        if actual_sha != full_sha256:
            raise ValueError(
                f"{url} full-bundle SHA-256 {actual_sha} does not match {full_sha256}"
            )
        return {(start, end): body[start : end + 1] for start, end in ranges}
    if len(ranges) == 1 and "multipart/byteranges" not in content_type.lower():
        content_range = headers.get("content-range", "")
        match = CONTENT_RANGE.fullmatch(content_range)
        if match is None:
            raise ValueError(f"{url} ignored or malformed the requested byte range")
        start, end = int(match.group(1)), int(match.group(2))
        if (start, end) != ranges[0] or len(body) != end - start + 1:
            raise ValueError(f"{url} returned the wrong byte range")
        return {(start, end): body}
    if "multipart/byteranges" not in content_type.lower():
        raise ValueError(
            f"{url} did not return a multipart byte-range response "
            f"(content-type={content_type!r}, content-range="
            f"{headers.get('content-range')!r}, bytes={len(body)})"
        )
    result = parse_multipart_ranges(body, content_type)
    missing = set(ranges) - set(result)
    extra = set(result) - set(ranges)
    if missing or extra:
        raise ValueError(
            f"{url} range response mismatch: {len(missing)} missing, {len(extra)} extra"
        )
    return result


def validate_root_manifest(root: dict) -> None:
    bounds = root.get("boundsLocalM")
    if (
        not isinstance(bounds, list)
        or len(bounds) != 4
        or not all(isinstance(value, (int, float)) and math.isfinite(value) for value in bounds)
        or bounds[2] <= bounds[0]
        or bounds[3] <= bounds[1]
    ):
        raise ValueError("atlas root has invalid boundsLocalM")
    if not isinstance(root.get("pages"), list) or not root["pages"]:
        raise ValueError("atlas root has no pages")


def load_page_manifest(
    root_dir: Path,
    page: dict,
    pages_dir: Path | None,
    remote_pages_base: str | None,
) -> tuple[dict, bytes]:
    descriptor = page.get("manifest")
    if not isinstance(descriptor, dict):
        raise ValueError(f"page {page.get('id')} has no manifest descriptor")
    uri = descriptor.get("uri")
    expected_length = descriptor.get("byteLength")
    expected_sha = descriptor.get("sha256")
    if not isinstance(uri, str) or not isinstance(expected_length, int) or not isinstance(
        expected_sha, str
    ):
        raise ValueError(f"page {page.get('id')} manifest descriptor is invalid")

    candidates: list[Path] = []
    if pages_dir is not None:
        candidates.append(pages_dir / Path(uri).name)
    candidates.append(root_dir / uri)
    manifest_bytes: bytes | None = None
    for candidate in candidates:
        if candidate.is_file():
            manifest_bytes = candidate.read_bytes()
            break
    if manifest_bytes is None:
        if remote_pages_base is None:
            raise FileNotFoundError(
                f"missing {uri}; provide --pages-dir or --remote-pages-base"
            )
        manifest_bytes, _ = read_url(
            f"{remote_pages_base.rstrip('/')}/{Path(uri).name}"
        )
    if len(manifest_bytes) != expected_length:
        raise ValueError(
            f"{uri} length {len(manifest_bytes)} does not match locked {expected_length}"
        )
    actual_sha = sha256(manifest_bytes)
    if actual_sha != expected_sha:
        raise ValueError(f"{uri} SHA-256 {actual_sha} does not match locked {expected_sha}")
    return load_json_bytes(manifest_bytes, uri), manifest_bytes


def selected_records(
    manifest: dict,
    regional_level: int,
    detail_level: int | None,
    detail_bounds: tuple[float, float, float, float] | None,
) -> list[tuple[dict, dict, str]]:
    selected: list[tuple[dict, dict, str]] = []
    for chunk in manifest.get("chunks", []):
        lod_by_level = {
            int(lod["level"]): lod
            for lod in chunk.get("lods", [])
            if isinstance(lod, dict) and isinstance(lod.get("level"), int)
        }
        if regional_level not in lod_by_level:
            raise ValueError(
                f"{manifest.get('pageId')} chunk {chunk.get('id')} "
                f"has no LOD {regional_level}"
            )
        selected.append((chunk, lod_by_level[regional_level], "regional"))
        if detail_level is None or detail_bounds is None:
            continue
        west, south, east, north = map(float, chunk["boundsLocalM"])
        detail_west, detail_south, detail_east, detail_north = detail_bounds
        # Inclusive grids require records touching a requested boundary.
        intersects = not (
            east < detail_west
            or west > detail_east
            or north < detail_south
            or south > detail_north
        )
        if intersects:
            if detail_level not in lod_by_level:
                raise ValueError(
                    f"{manifest.get('pageId')} chunk {chunk.get('id')} "
                    f"has no detail LOD {detail_level}"
                )
            selected.append((chunk, lod_by_level[detail_level], "detail"))
    return selected


def load_record_bytes(
    page_manifest: dict,
    records: list[tuple[dict, dict, str]],
    pages_dir: Path | None,
    remote_pages_base: str | None,
) -> dict[tuple[int, int], bytes]:
    bundle = page_manifest.get("bundle")
    if not isinstance(bundle, dict) or not isinstance(bundle.get("uri"), str):
        raise ValueError(f"{page_manifest.get('pageId')} has an invalid bundle descriptor")
    bundle_name = Path(bundle["uri"]).name
    local_bundle = pages_dir / bundle_name if pages_dir is not None else None
    ranges = sorted(
        {
            (
                int(lod["byteOffset"]),
                int(lod["byteOffset"]) + int(lod["byteLength"]) - 1,
            )
            for _, lod, _ in records
        }
    )
    if local_bundle is not None and local_bundle.is_file():
        bundle_bytes = local_bundle.read_bytes()
        if len(bundle_bytes) != int(bundle["byteLength"]):
            raise ValueError(f"{bundle_name} has the wrong byte length")
        if sha256(bundle_bytes) != bundle["sha256"]:
            raise ValueError(f"{bundle_name} has the wrong SHA-256")
        return {
            (start, end): bundle_bytes[start : end + 1] for start, end in ranges
        }
    if remote_pages_base is None:
        raise FileNotFoundError(
            f"missing {bundle_name}; provide local bundles or --remote-pages-base"
        )
    return fetch_ranges(
        f"{remote_pages_base.rstrip('/')}/{bundle_name}",
        ranges,
        int(bundle["byteLength"]),
        str(bundle["sha256"]),
    )


class GridAssembler:
    def __init__(
        self,
        bounds: tuple[float, float, float, float],
        spacing_m: float,
        metres_per_unit: float,
        water_sentinel: int,
    ) -> None:
        west, south, east, north = bounds
        width_float = (east - west) / spacing_m
        height_float = (north - south) / spacing_m
        if abs(width_float - round(width_float)) > 1e-9 or abs(
            height_float - round(height_float)
        ) > 1e-9:
            raise ValueError("output bounds are not aligned to spacing")
        self.bounds = bounds
        self.spacing_m = spacing_m
        self.metres_per_unit = metres_per_unit
        self.water_sentinel = water_sentinel
        self.width = int(round(width_float)) + 1
        self.height = int(round(height_float)) + 1
        self.values = [water_sentinel] * (self.width * self.height)
        self.written = bytearray(self.width * self.height)
        self.consumed: list[dict] = []

    def add(self, chunk: dict, lod: dict, data: bytes, page_id: str) -> None:
        expected_sha = str(lod["sha256"])
        actual_sha = sha256(data)
        if actual_sha != expected_sha:
            raise ValueError(
                f"{page_id}/{chunk.get('id')}/LOD{lod.get('level')} SHA-256 "
                f"{actual_sha} does not match {expected_sha}"
            )
        sample_count = int(lod["sampleCount"])
        expected_length = sample_count * sample_count * 2
        if len(data) != expected_length:
            raise ValueError(
                f"{page_id}/{chunk.get('id')} record length {len(data)} "
                f"does not match {expected_length}"
            )
        spacing = float(lod["spacingM"])
        if abs(spacing - self.spacing_m) > 1e-9:
            raise ValueError("record spacing does not match output grid")
        chunk_west, chunk_south, _, _ = map(float, chunk["boundsLocalM"])
        values = struct.unpack(f"<{sample_count * sample_count}h", data)
        output_west, output_south, output_east, output_north = self.bounds
        for row in range(sample_count):
            north = chunk_south + row * spacing
            if north < output_south - 1e-9 or north > output_north + 1e-9:
                continue
            output_row = int(round((north - output_south) / spacing))
            for column in range(sample_count):
                east = chunk_west + column * spacing
                if east < output_west - 1e-9 or east > output_east + 1e-9:
                    continue
                output_column = int(round((east - output_west) / spacing))
                output_index = output_row * self.width + output_column
                value = values[row * sample_count + column]
                if self.written[output_index]:
                    existing = self.values[output_index]
                    if (
                        existing != value
                        and existing != self.water_sentinel
                        and value != self.water_sentinel
                    ):
                        raise ValueError(
                            f"atlas overlap mismatch at ({east}, {north}): "
                            f"{existing} != {value}"
                        )
                    if existing == self.water_sentinel and value != self.water_sentinel:
                        self.values[output_index] = value
                else:
                    self.values[output_index] = value
                    self.written[output_index] = 1
        self.consumed.append(
            {
                "pageId": page_id,
                "chunkId": chunk["id"],
                "level": int(lod["level"]),
                "spacingM": spacing,
                "sha256": expected_sha,
            }
        )

    def bytes(self) -> bytes:
        west, south, _, _ = self.bounds
        header = TRUTH_HEADER.pack(
            TRUTH_MAGIC,
            TRUTH_VERSION,
            self.width,
            self.height,
            self.spacing_m,
            west,
            south,
            self.metres_per_unit,
            self.water_sentinel,
        )
        return header + struct.pack(f"<{len(self.values)}h", *self.values)


def atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    try:
        with os.fdopen(descriptor, "wb") as output:
            output.write(data)
        os.replace(temporary_name, path)
    except BaseException:
        try:
            os.unlink(temporary_name)
        except FileNotFoundError:
            pass
        raise


def parse_bounds(values: Iterable[str]) -> tuple[float, float, float, float]:
    bounds = tuple(float(value) for value in values)
    if len(bounds) != 4:
        raise ValueError("bounds require west south east north")
    west, south, east, north = bounds
    if not all(math.isfinite(value) for value in bounds) or east <= west or north <= south:
        raise ValueError("invalid bounds")
    return west, south, east, north


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--atlas-manifest", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--regional-level", type=int, default=3)
    parser.add_argument("--detail-output", type=Path)
    parser.add_argument("--detail-level", type=int, default=0)
    parser.add_argument(
        "--detail-bounds",
        nargs=4,
        metavar=("WEST", "SOUTH", "EAST", "NORTH"),
    )
    parser.add_argument("--pages-dir", type=Path)
    parser.add_argument("--remote-pages-base")
    parser.add_argument("--provenance-output", type=Path)
    args = parser.parse_args()

    root_bytes = args.atlas_manifest.read_bytes()
    root = load_json_bytes(root_bytes, str(args.atlas_manifest))
    validate_root_manifest(root)
    root_dir = args.atlas_manifest.parent
    regional_bounds = parse_bounds(map(str, root["boundsLocalM"]))
    detail_bounds = (
        parse_bounds(args.detail_bounds) if args.detail_bounds is not None else None
    )
    if (args.detail_output is None) != (detail_bounds is None):
        parser.error("--detail-output and --detail-bounds must be supplied together")

    regional: GridAssembler | None = None
    detail: GridAssembler | None = None
    locked_page_manifests: list[dict] = []
    for page in root["pages"]:
        page_manifest, page_manifest_bytes = load_page_manifest(
            root_dir,
            page,
            args.pages_dir,
            args.remote_pages_base,
        )
        locked_page_manifests.append(
            {
                "pageId": page_manifest.get("pageId"),
                "sha256": sha256(page_manifest_bytes),
            }
        )
        quantization = page_manifest.get("quantization", {})
        if (
            quantization.get("storage") != "little-endian-signed-int16"
            or quantization.get("rowOrder") != "south-to-north"
        ):
            raise ValueError(
                f"{page_manifest.get('pageId')} uses unsupported quantization ordering"
            )
        metres_per_unit = float(quantization["metresPerUnit"])
        water_sentinel = int(quantization["waterSentinel"])
        selected = selected_records(
            page_manifest,
            args.regional_level,
            args.detail_level if detail_bounds is not None else None,
            detail_bounds,
        )
        regional_lod = next(
            lod for _, lod, target in selected if target == "regional"
        )
        if regional is None:
            regional = GridAssembler(
                regional_bounds,
                float(regional_lod["spacingM"]),
                metres_per_unit,
                water_sentinel,
            )
        detail_lods = [lod for _, lod, target in selected if target == "detail"]
        if detail_bounds is not None and detail is None and detail_lods:
            detail = GridAssembler(
                detail_bounds,
                float(detail_lods[0]["spacingM"]),
                metres_per_unit,
                water_sentinel,
            )
        record_bytes = load_record_bytes(
            page_manifest,
            selected,
            args.pages_dir,
            args.remote_pages_base,
        )
        for chunk, lod, target in selected:
            start = int(lod["byteOffset"])
            end = start + int(lod["byteLength"]) - 1
            assembler = regional if target == "regional" else detail
            if assembler is None:
                raise ValueError("detail bounds did not intersect any atlas record")
            assembler.add(
                chunk,
                lod,
                record_bytes[(start, end)],
                str(page_manifest.get("pageId")),
            )

    if regional is None:
        raise ValueError("atlas contained no regional records")
    regional_bytes = regional.bytes()
    atomic_write(args.output, regional_bytes)
    outputs = {
        "regional": {
            "path": str(args.output),
            "byteLength": len(regional_bytes),
            "sha256": sha256(regional_bytes),
            "boundsLocalM": list(regional.bounds),
            "spacingM": regional.spacing_m,
            "sourceLevel": args.regional_level,
            "sourceRecordCount": len(regional.consumed),
        }
    }
    if args.detail_output is not None:
        if detail is None:
            raise ValueError("atlas contained no detail records")
        detail_bytes = detail.bytes()
        atomic_write(args.detail_output, detail_bytes)
        outputs["detail"] = {
            "path": str(args.detail_output),
            "byteLength": len(detail_bytes),
            "sha256": sha256(detail_bytes),
            "boundsLocalM": list(detail.bounds),
            "spacingM": detail.spacing_m,
            "sourceLevel": args.detail_level,
            "sourceRecordCount": len(detail.consumed),
            "sourceRecords": detail.consumed,
        }
    provenance = {
        "schemaVersion": "1.0.0",
        "sourceAtlasManifest": {
            "terrainId": root.get("terrainId"),
            "sha256": sha256(root_bytes),
        },
        "lockedPageManifests": locked_page_manifests,
        "outputs": outputs,
    }
    if args.provenance_output is not None:
        atomic_write(
            args.provenance_output,
            (json.dumps(provenance, indent=2, sort_keys=True) + "\n").encode("utf-8"),
        )
    print(json.dumps(provenance, indent=2, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
