#!/usr/bin/env python3
"""Hydrate the gitignored Rapier terrain atlas from an explicit trusted origin.

The tracked root manifest is the release authority. Hydration accepts remote page
data only when the remote root is byte-identical to that tracked file, verifies
every declared page manifest and bundle, then transactionally replaces the
content and wwwroot atlas trees from the verified cache.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import tempfile
from typing import BinaryIO
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen
import uuid

from verify_korea_atlas import verify as verify_atlas_contract


ROOT_MANIFEST_NAME = "rapier-range.atlas.manifest.json"
DOWNLOAD_CHUNK_BYTES = 1024 * 1024
MANIFEST_DOWNLOAD_LIMIT = 1024 * 1024
REPO_ROOT = Path(__file__).resolve().parents[2]
DEFAULT_CONTENT_ATLAS = (
    REPO_ROOT / "content/packs/ukraine-modern/environment/terrain-atlas"
)
DEFAULT_WEB_ATLAS = (
    REPO_ROOT / "web/wwwroot/content/packs/ukraine-modern/environment/terrain-atlas"
)
DEFAULT_TRACKED_ROOT = DEFAULT_CONTENT_ATLAS / ROOT_MANIFEST_NAME
DEFAULT_CACHE = REPO_ROOT / ".cache/terrain-atlas"


class AtlasHydrationError(RuntimeError):
    """Raised when the remote or local atlas cannot satisfy release integrity."""


def _sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(DOWNLOAD_CHUNK_BYTES), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _require(condition: bool, message: str) -> None:
    if not condition:
        raise AtlasHydrationError(message)


def _metadata(value: object, label: str) -> tuple[int, str]:
    _require(isinstance(value, dict), f"{label} metadata is not an object")
    length = value.get("byteLength")
    digest = value.get("sha256")
    _require(isinstance(length, int) and length >= 0, f"{label} has invalid byteLength")
    _require(
        isinstance(digest, str)
        and len(digest) == 64
        and all(character in "0123456789abcdef" for character in digest),
        f"{label} has invalid sha256",
    )
    return length, digest


def _relative_uri(value: object, label: str) -> PurePosixPath:
    _require(isinstance(value, str) and value != "", f"{label} has no URI")
    parsed = urlsplit(value)
    _require(
        not parsed.scheme and not parsed.netloc and not parsed.query and not parsed.fragment,
        f"{label} URI must be an unadorned relative path: {value}",
    )
    relative = PurePosixPath(parsed.path)
    _require(
        not relative.is_absolute()
        and relative.parts
        and all(part not in ("", ".", "..") for part in relative.parts),
        f"{label} URI escapes the atlas root: {value}",
    )
    return relative


def _join_relative(parent: PurePosixPath, child_value: object, label: str) -> PurePosixPath:
    child = _relative_uri(child_value, label)
    combined = parent / child
    _require(
        all(part not in ("", ".", "..") for part in combined.parts),
        f"{label} URI escapes the atlas root: {child_value}",
    )
    return combined


def _load_json(value: bytes, label: str) -> dict[str, object]:
    try:
        parsed = json.loads(value.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError) as error:
        raise AtlasHydrationError(f"{label} is not valid UTF-8 JSON: {error}") from error
    _require(isinstance(parsed, dict), f"{label} root is not an object")
    return parsed


def _read_url(url: str, *, maximum_bytes: int) -> bytes:
    request = Request(url, headers={"User-Agent": "guns-only-atlas-hydrator/1"})
    try:
        with urlopen(request, timeout=60) as response:
            chunks: list[bytes] = []
            received = 0
            while True:
                chunk = response.read(min(DOWNLOAD_CHUNK_BYTES, maximum_bytes + 1 - received))
                if not chunk:
                    break
                chunks.append(chunk)
                received += len(chunk)
                _require(received <= maximum_bytes, f"remote file exceeds {maximum_bytes} bytes: {url}")
            return b"".join(chunks)
    except AtlasHydrationError:
        raise
    except Exception as error:
        raise AtlasHydrationError(f"could not fetch {url}: {error}") from error


def _valid_file(path: Path, expected_length: int, expected_sha256: str) -> bool:
    try:
        return path.is_file() and path.stat().st_size == expected_length \
            and _sha256_file(path) == expected_sha256
    except OSError:
        return False


def _stream_verified(
    source: BinaryIO,
    destination: Path,
    *,
    expected_length: int,
    expected_sha256: str,
    label: str,
) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="wb",
            prefix=f".{destination.name}.",
            suffix=".download",
            dir=destination.parent,
            delete=False,
        ) as output:
            temporary = Path(output.name)
            digest = hashlib.sha256()
            received = 0
            while True:
                chunk = source.read(DOWNLOAD_CHUNK_BYTES)
                if not chunk:
                    break
                received += len(chunk)
                _require(received <= expected_length, f"{label} exceeds declared byteLength")
                output.write(chunk)
                digest.update(chunk)
            output.flush()
            os.fsync(output.fileno())
        _require(received == expected_length, f"{label} byte mismatch: {received} != {expected_length}")
        actual_sha256 = digest.hexdigest()
        _require(
            actual_sha256 == expected_sha256,
            f"{label} hash mismatch: {actual_sha256} != {expected_sha256}",
        )
        os.replace(temporary, destination)
        temporary = None
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


def _download_verified(
    url: str,
    destination: Path,
    *,
    expected_length: int,
    expected_sha256: str,
    label: str,
) -> None:
    request = Request(url, headers={"User-Agent": "guns-only-atlas-hydrator/1"})
    try:
        with urlopen(request, timeout=120) as response:
            _stream_verified(
                response,
                destination,
                expected_length=expected_length,
                expected_sha256=expected_sha256,
                label=label,
            )
    except AtlasHydrationError:
        raise
    except Exception as error:
        raise AtlasHydrationError(f"could not fetch {url}: {error}") from error


def _copy_file(source: Path, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(source, destination)


def _copy_static_tree(source_atlas: Path, staged_atlas: Path) -> None:
    def copy_directory(source_directory: Path, destination_directory: Path, *, root: bool) -> None:
        destination_directory.mkdir(parents=True, exist_ok=True)
        for source in source_directory.iterdir():
            if root and source.name == "pages":
                continue
            _require(not source.is_symlink(), f"atlas source contains a symlink: {source}")
            destination = destination_directory / source.name
            if source.is_dir():
                copy_directory(source, destination, root=False)
            elif source.is_file():
                _copy_file(source, destination)
            else:
                raise AtlasHydrationError(f"atlas source contains a non-file entry: {source}")

    copy_directory(source_atlas, staged_atlas, root=True)


def _stage_install(
    destination: Path,
    tracked_atlas: Path,
    cache_root: Path,
    dependency_paths: list[PurePosixPath],
) -> Path:
    destination.parent.mkdir(parents=True, exist_ok=True)
    staged = Path(tempfile.mkdtemp(prefix=f".{destination.name}.hydrate-", dir=destination.parent))
    try:
        _copy_static_tree(tracked_atlas, staged)
        for relative in dependency_paths:
            _copy_file(cache_root.joinpath(*relative.parts), staged.joinpath(*relative.parts))
        verify_atlas_contract(staged / ROOT_MANIFEST_NAME)
        return staged
    except Exception:
        shutil.rmtree(staged, ignore_errors=True)
        raise


def _install_transaction(staged: list[tuple[Path, Path]]) -> None:
    transaction = uuid.uuid4().hex
    replaced: list[tuple[Path, Path | None]] = []
    try:
        for destination, source in staged:
            backup = destination.parent / f".{destination.name}.backup-{transaction}"
            if destination.exists():
                os.replace(destination, backup)
            else:
                backup = None
            try:
                os.replace(source, destination)
            except Exception:
                if backup is not None:
                    os.replace(backup, destination)
                raise
            replaced.append((destination, backup))
    except Exception:
        for destination, backup in reversed(replaced):
            if destination.exists():
                shutil.rmtree(destination)
            if backup is not None and backup.exists():
                os.replace(backup, destination)
        raise
    else:
        for _, backup in replaced:
            if backup is not None:
                shutil.rmtree(backup)
    finally:
        for _, source in staged:
            if source.exists():
                shutil.rmtree(source, ignore_errors=True)


def verify_installed(atlas_dir: Path, tracked_root: Path = DEFAULT_TRACKED_ROOT) -> dict[str, object]:
    root_path = atlas_dir / ROOT_MANIFEST_NAME
    _require(tracked_root.is_file(), f"tracked root manifest is missing: {tracked_root}")
    _require(root_path.is_file(), f"atlas root manifest is missing: {root_path}")
    tracked_bytes = tracked_root.read_bytes()
    installed_bytes = root_path.read_bytes()
    _require(
        installed_bytes == tracked_bytes,
        "atlas root manifest differs from the tracked release authority "
        f"({_sha256_bytes(installed_bytes)} != {_sha256_bytes(tracked_bytes)})",
    )
    try:
        return verify_atlas_contract(root_path)
    except (OSError, KeyError, TypeError, ValueError, json.JSONDecodeError) as error:
        raise AtlasHydrationError(f"atlas verification failed at {root_path}: {error}") from error


def hydrate(
    *,
    base_url: str,
    cache_dir: Path = DEFAULT_CACHE,
    tracked_root: Path = DEFAULT_TRACKED_ROOT,
    content_atlas: Path = DEFAULT_CONTENT_ATLAS,
    web_atlas: Path = DEFAULT_WEB_ATLAS,
) -> dict[str, object]:
    _require(base_url != "", "an explicit atlas base URL is required")
    parsed_base = urlsplit(base_url)
    _require(parsed_base.scheme in ("https", "http", "file"), "atlas base URL must use https, http, or file")
    if not base_url.endswith("/"):
        base_url += "/"
    _require(tracked_root.is_file(), f"tracked root manifest is missing: {tracked_root}")
    tracked_bytes = tracked_root.read_bytes()
    tracked_sha256 = _sha256_bytes(tracked_bytes)
    remote_root_url = urljoin(base_url, ROOT_MANIFEST_NAME)
    remote_bytes = _read_url(remote_root_url, maximum_bytes=MANIFEST_DOWNLOAD_LIMIT)
    _require(
        remote_bytes == tracked_bytes,
        "remote root manifest is not byte-identical to the tracked release authority "
        f"({_sha256_bytes(remote_bytes)} != {tracked_sha256})",
    )
    root = _load_json(tracked_bytes, "tracked root manifest")
    pages = root.get("pages")
    _require(isinstance(pages, list) and pages, "tracked root manifest declares no pages")

    cache_root = cache_dir / tracked_sha256
    cache_root.mkdir(parents=True, exist_ok=True)
    cached_root = cache_root / ROOT_MANIFEST_NAME
    cached_root_bytes = cached_root.read_bytes() if cached_root.is_file() else None
    if cached_root_bytes != tracked_bytes:
        temporary_root = cache_root / f".{ROOT_MANIFEST_NAME}.{uuid.uuid4().hex}"
        temporary_root.write_bytes(tracked_bytes)
        os.replace(temporary_root, cached_root)

    dependencies: list[PurePosixPath] = []
    seen: set[PurePosixPath] = set()
    reused = 0
    downloaded = 0
    for index, descriptor_value in enumerate(pages):
        _require(isinstance(descriptor_value, dict), f"page descriptor {index} is not an object")
        descriptor = descriptor_value
        page_id = descriptor.get("id")
        _require(isinstance(page_id, str) and page_id, f"page descriptor {index} has no id")
        manifest_value = descriptor.get("manifest")
        _require(isinstance(manifest_value, dict), f"page {page_id} has no manifest metadata")
        manifest_relative = _relative_uri(manifest_value.get("uri"), f"page {page_id} manifest")
        _require(manifest_relative.parts[0] == "pages", f"page {page_id} manifest is outside pages/")
        _require(manifest_relative not in seen, f"duplicate atlas dependency: {manifest_relative}")
        manifest_length, manifest_sha256 = _metadata(manifest_value, f"page {page_id} manifest")
        manifest_cache = cache_root.joinpath(*manifest_relative.parts)
        if _valid_file(manifest_cache, manifest_length, manifest_sha256):
            reused += 1
        else:
            _download_verified(
                urljoin(base_url, manifest_relative.as_posix()),
                manifest_cache,
                expected_length=manifest_length,
                expected_sha256=manifest_sha256,
                label=f"page {page_id} manifest",
            )
            downloaded += 1
        dependencies.append(manifest_relative)
        seen.add(manifest_relative)

        page = _load_json(manifest_cache.read_bytes(), f"page {page_id} manifest")
        _require(page.get("pageId") == page_id, f"page manifest identity mismatch: {page_id}")
        bundle_value = page.get("bundle")
        _require(isinstance(bundle_value, dict), f"page {page_id} has no bundle metadata")
        bundle_relative = _join_relative(
            manifest_relative.parent,
            bundle_value.get("uri"),
            f"page {page_id} bundle",
        )
        _require(bundle_relative.parts[0] == "pages", f"page {page_id} bundle is outside pages/")
        _require(bundle_relative not in seen, f"duplicate atlas dependency: {bundle_relative}")
        bundle_length, bundle_sha256 = _metadata(bundle_value, f"page {page_id} bundle")
        bundle_cache = cache_root.joinpath(*bundle_relative.parts)
        if _valid_file(bundle_cache, bundle_length, bundle_sha256):
            reused += 1
        else:
            _download_verified(
                urljoin(base_url, bundle_relative.as_posix()),
                bundle_cache,
                expected_length=bundle_length,
                expected_sha256=bundle_sha256,
                label=f"page {page_id} bundle",
            )
            downloaded += 1
        dependencies.append(bundle_relative)
        seen.add(bundle_relative)

    tracked_atlas = tracked_root.parent
    destinations = []
    seen_destinations: set[Path] = set()
    for destination in (content_atlas, web_atlas):
        resolved = destination.resolve()
        if resolved in seen_destinations:
            continue
        seen_destinations.add(resolved)
        destinations.append(destination)
    staged: list[tuple[Path, Path]] = []
    try:
        for destination in destinations:
            staged.append((
                destination,
                _stage_install(destination, tracked_atlas, cache_root, dependencies),
            ))
    except Exception:
        for _, staged_atlas in staged:
            shutil.rmtree(staged_atlas, ignore_errors=True)
        raise
    _install_transaction(staged)
    return {
        "rootSha256": tracked_sha256,
        "pages": len(pages),
        "dependencies": len(dependencies),
        "downloaded": downloaded,
        "reused": reused,
        "installed": [str(destination) for destination in destinations],
    }


def _parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    subparsers = parser.add_subparsers(dest="command", required=True)
    hydrate_parser = subparsers.add_parser("hydrate", help="download, verify, and install the atlas")
    hydrate_parser.add_argument("--base-url", required=True)
    hydrate_parser.add_argument("--cache-dir", type=Path, default=DEFAULT_CACHE)
    hydrate_parser.add_argument("--tracked-root", type=Path, default=DEFAULT_TRACKED_ROOT)
    hydrate_parser.add_argument("--content-atlas", type=Path, default=DEFAULT_CONTENT_ATLAS)
    hydrate_parser.add_argument("--web-atlas", type=Path, default=DEFAULT_WEB_ATLAS)
    verify_parser = subparsers.add_parser("verify", help="verify an installed or published atlas")
    verify_parser.add_argument("--atlas-dir", type=Path, required=True)
    verify_parser.add_argument("--tracked-root", type=Path, default=DEFAULT_TRACKED_ROOT)
    return parser


def main() -> None:
    arguments = _parser().parse_args()
    try:
        if arguments.command == "hydrate":
            result = hydrate(
                base_url=arguments.base_url,
                cache_dir=arguments.cache_dir,
                tracked_root=arguments.tracked_root,
                content_atlas=arguments.content_atlas,
                web_atlas=arguments.web_atlas,
            )
        else:
            result = verify_installed(arguments.atlas_dir, arguments.tracked_root)
    except AtlasHydrationError as error:
        raise SystemExit(f"hydrate-rapier-atlas: {error}") from error
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
