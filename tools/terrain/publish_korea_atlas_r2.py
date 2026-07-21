#!/usr/bin/env python3
"""Publish a verified, immutable Korea atlas tree to Cloudflare R2."""

from __future__ import annotations

import argparse
from concurrent.futures import ThreadPoolExecutor, as_completed
import hashlib
import json
from pathlib import Path
import shlex
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request

from verify_korea_atlas import verify


CACHE_CONTROL = "public, max-age=31536000, immutable"


def sha256_file(path: Path) -> str:
    value = hashlib.sha256()
    with path.open("rb") as handle:
        for block in iter(lambda: handle.read(1024 * 1024), b""):
            value.update(block)
    return value.hexdigest()


def publication_files(root_path: Path):
    root = json.loads(root_path.read_text())
    files = []
    for page in root["pages"]:
        manifest_path = root_path.parent / page["manifest"]["uri"]
        manifest = json.loads(manifest_path.read_text())
        bundle_path = manifest_path.parent / manifest["bundle"]["uri"]
        files.append((manifest_path, manifest_path.relative_to(root_path.parent), "application/json"))
        files.append((bundle_path, bundle_path.relative_to(root_path.parent), "application/octet-stream"))
    # The root is the publication marker. Upload it last so a new immutable prefix cannot expose
    # a manifest whose page dependencies are still missing.
    files.append((root_path, Path(root_path.name), "application/json"))
    return files


def object_key(prefix: str, item) -> str:
    _, relative, _ = item
    return f"{prefix.strip('/')}/{relative.as_posix()}"


def upload(command: list[str], bucket: str, prefix: str, item, retries: int) -> str:
    source, relative, content_type = item
    key = object_key(prefix, item)
    for attempt in range(retries + 1):
        try:
            subprocess.run([
                *command,
                "r2", "object", "put", f"{bucket}/{key}",
                "--remote",
                "--file", str(source),
                "--content-type", content_type,
                "--cache-control", CACHE_CONTROL,
            ], check=True)
            break
        except subprocess.CalledProcessError:
            if attempt >= retries:
                raise
            delay_seconds = min(8, 2 ** attempt)
            print(
                f"retrying {key} in {delay_seconds}s "
                f"({attempt + 1}/{retries})",
                flush=True,
            )
            time.sleep(delay_seconds)
    return key


def public_object_exists(base_url: str, key: str, source: Path) -> bool:
    url = base_url.rstrip("/") + "/" + urllib.parse.quote(key, safe="/")
    request = urllib.request.Request(url, headers={
        "Range": "bytes=0-0",
        "User-Agent": "GunsOnlyTerrainPublisher/1.0",
    })
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return (
                response.status == 206
                and response.headers.get("Content-Range", "").endswith(
                    f"/{source.stat().st_size}"
                )
            )
    except urllib.error.HTTPError as error:
        if error.code == 404:
            return False
        # The public development hostname can rate-limit a HEAD sweep. An inconclusive check must
        # never block publication; uploading the same immutable key again is safe.
        if error.code in {403, 429} or error.code >= 500:
            return False
        raise


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("manifest", type=Path)
    parser.add_argument("--bucket", default="guns-only-terrain-prod")
    parser.add_argument("--prefix")
    parser.add_argument("--wrangler-command", default="npx wrangler")
    parser.add_argument("--workers", type=int, default=3)
    parser.add_argument("--retries", type=int, default=4)
    parser.add_argument("--resume-state", type=Path)
    parser.add_argument("--resume-public-base-url")
    parser.add_argument("--resume-check-workers", type=int, default=8)
    parser.add_argument("--execute", action="store_true")
    arguments = parser.parse_args()

    summary = verify(arguments.manifest)
    root_hash = sha256_file(arguments.manifest)
    region = summary["terrainId"].split(".")[2]
    prefix = arguments.prefix or f"korea-v1-{region}-atlas-{root_hash[:16]}"
    files = publication_files(arguments.manifest)
    plan = {
        "bucket": arguments.bucket,
        "prefix": prefix,
        "rootObject": f"{prefix}/{arguments.manifest.name}",
        "objects": len(files),
        "bytes": sum(source.stat().st_size for source, _, _ in files),
        "rootSha256": root_hash,
        "verified": summary,
    }
    print(json.dumps(plan, indent=2), flush=True)
    if not arguments.execute:
        return

    completed = set()
    if arguments.resume_state is not None and arguments.resume_state.is_file():
        state = json.loads(arguments.resume_state.read_text())
        if state.get("rootSha256") != root_hash or state.get("prefix") != prefix:
            raise ValueError("R2 resume state belongs to another immutable atlas")
        completed.update(state.get("completed", []))
    if arguments.resume_public_base_url:
        with ThreadPoolExecutor(max_workers=max(1, arguments.resume_check_workers)) as executor:
            checks = {
                executor.submit(
                    public_object_exists,
                    arguments.resume_public_base_url,
                    object_key(prefix, item),
                    item[0],
                ): item
                for item in files
                if object_key(prefix, item) not in completed
            }
            for future in as_completed(checks):
                item = checks[future]
                if future.result():
                    completed.add(object_key(prefix, item))

    def mark_completed(key: str) -> None:
        completed.add(key)
        if arguments.resume_state is None:
            return
        arguments.resume_state.parent.mkdir(parents=True, exist_ok=True)
        temporary = arguments.resume_state.with_suffix(arguments.resume_state.suffix + ".tmp")
        temporary.write_text(json.dumps({
            "rootSha256": root_hash,
            "prefix": prefix,
            "completed": sorted(completed),
        }, indent=2) + "\n")
        temporary.replace(arguments.resume_state)

    command = shlex.split(arguments.wrangler_command)
    dependencies, root_marker = files[:-1], files[-1]
    dependencies = [
        item for item in dependencies if object_key(prefix, item) not in completed
    ]
    if completed:
        print(f"resuming after {len(completed)} completed objects", flush=True)
    with ThreadPoolExecutor(max_workers=max(1, arguments.workers)) as executor:
        futures = {
            executor.submit(
                upload,
                command,
                arguments.bucket,
                prefix,
                item,
                max(0, arguments.retries),
            ): item
            for item in dependencies
        }
        for future in as_completed(futures):
            key = future.result()
            mark_completed(key)
            print(f"uploaded {key}", flush=True)
    root_key = object_key(prefix, root_marker)
    if root_key not in completed:
        root_key = upload(command, arguments.bucket, prefix, root_marker,
                          max(0, arguments.retries))
        mark_completed(root_key)
        print(f"uploaded {root_key}", flush=True)


if __name__ == "__main__":
    main()
