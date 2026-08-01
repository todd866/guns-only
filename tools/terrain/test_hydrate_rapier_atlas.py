#!/usr/bin/env python3

from __future__ import annotations

import hashlib
import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parent))

from hydrate_rapier_atlas import (  # noqa: E402
    AtlasHydrationError,
    ROOT_MANIFEST_NAME,
    _install_transaction,
    hydrate,
    verify_installed,
)


def _json_bytes(value: object) -> bytes:
    return (json.dumps(value, indent=2, sort_keys=True) + "\n").encode("utf-8")


def _sha256(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def _write_fixture(root: Path, *, bundle_bytes: bytes = b"\x04\x00") -> Path:
    pages = root / "pages"
    pages.mkdir(parents=True)
    declared_bundle = b"\x04\x00"
    page = {
        "boundsLocalM": [0.0, 0.0, 1.0, 1.0],
        "build": {"builder": "test", "builderVersion": 1},
        "bundle": {
            "byteLength": len(declared_bundle),
            "recordCount": 1,
            "sha256": _sha256(declared_bundle),
            "uri": "page-test.terrain",
        },
        "chunks": [
            {
                "id": "e0000-n0000",
                "generation": {"seed": 7},
                "lods": [
                    {
                        "byteLength": len(declared_bundle),
                        "byteOffset": 0,
                        "level": 0,
                        "sampleCount": 1,
                        "sha256": _sha256(declared_bundle),
                        "spacingM": 32.0,
                    }
                ],
            }
        ],
        "pageId": "page-test",
        "quantization": {},
        "schemaVersion": "1.0.0",
        "source": {},
        "terrainId": "terrain.test.atlas.v1",
        "tileSpanM": 1.0,
    }
    page_bytes = _json_bytes(page)
    root_manifest = {
        "pages": [
            {
                "id": "page-test",
                "manifest": {
                    "byteLength": len(page_bytes),
                    "sha256": _sha256(page_bytes),
                    "uri": "pages/page-test.manifest.json",
                },
            }
        ],
        "schemaVersion": "2.0.0",
        "terrainId": "terrain.test.atlas.v1",
    }
    (pages / "page-test.manifest.json").write_bytes(page_bytes)
    (pages / "page-test.terrain").write_bytes(bundle_bytes)
    root_path = root / ROOT_MANIFEST_NAME
    root_path.write_bytes(_json_bytes(root_manifest))
    (root / "release.truth").write_text("tracked ancillary truth\n")
    return root_path


class RapierAtlasHydratorTests(unittest.TestCase):
    def test_hydrates_both_trees_and_reuses_verified_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            remote_root = _write_fixture(work / "remote")
            tracked_root = work / "tracked" / ROOT_MANIFEST_NAME
            tracked_root.parent.mkdir()
            tracked_root.write_bytes(remote_root.read_bytes())
            (tracked_root.parent / "release.truth").write_text("tracked ancillary truth\n")
            content_atlas = work / "install/content/terrain-atlas"
            web_atlas = work / "install/web/terrain-atlas"
            cache = work / "cache"

            first = hydrate(
                base_url=(remote_root.parent.as_uri() + "/"),
                cache_dir=cache,
                tracked_root=tracked_root,
                content_atlas=content_atlas,
                web_atlas=web_atlas,
            )
            self.assertEqual(first["downloaded"], 2)
            self.assertEqual(first["reused"], 0)
            self.assertEqual(verify_installed(content_atlas, tracked_root)["pages"], 1)
            self.assertEqual(verify_installed(web_atlas, tracked_root)["pages"], 1)
            self.assertEqual(
                (content_atlas / "release.truth").read_bytes(),
                (web_atlas / "release.truth").read_bytes(),
            )

            (remote_root.parent / "pages/page-test.manifest.json").unlink()
            (remote_root.parent / "pages/page-test.terrain").unlink()
            second = hydrate(
                base_url=(remote_root.parent.as_uri() + "/"),
                cache_dir=cache,
                tracked_root=tracked_root,
                content_atlas=content_atlas,
                web_atlas=web_atlas,
            )
            self.assertEqual(second["downloaded"], 0)
            self.assertEqual(second["reused"], 2)
            self.assertEqual(verify_installed(content_atlas, tracked_root)["pages"], 1)

    def test_rejects_remote_root_mismatch_without_touching_install(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            tracked_root = _write_fixture(work / "tracked")
            remote_root = _write_fixture(work / "remote")
            remote_root.write_bytes(remote_root.read_bytes() + b" ")
            content_atlas = work / "install/content/terrain-atlas"
            content_atlas.mkdir(parents=True)
            sentinel = content_atlas / "sentinel"
            sentinel.write_text("keep")

            with self.assertRaisesRegex(AtlasHydrationError, "not byte-identical"):
                hydrate(
                    base_url=(remote_root.parent.as_uri() + "/"),
                    cache_dir=work / "cache",
                    tracked_root=tracked_root,
                    content_atlas=content_atlas,
                    web_atlas=work / "install/web/terrain-atlas",
                )
            self.assertEqual(sentinel.read_text(), "keep")

    def test_rejects_corrupt_remote_bundle_before_install(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            remote_root = _write_fixture(work / "remote", bundle_bytes=b"\x05\x00")
            tracked_root = work / "tracked" / ROOT_MANIFEST_NAME
            tracked_root.parent.mkdir()
            tracked_root.write_bytes(remote_root.read_bytes())
            (tracked_root.parent / "release.truth").write_text("tracked ancillary truth\n")
            content_atlas = work / "install/content/terrain-atlas"

            with self.assertRaisesRegex(AtlasHydrationError, "bundle hash mismatch"):
                hydrate(
                    base_url=(remote_root.parent.as_uri() + "/"),
                    cache_dir=work / "cache",
                    tracked_root=tracked_root,
                    content_atlas=content_atlas,
                    web_atlas=work / "install/web/terrain-atlas",
                )
            self.assertFalse(content_atlas.exists())

    def test_rejects_unsafe_dependency_uris_without_touching_install(self):
        for unsafe_uri in (
            "../escape.manifest.json",
            "/pages/page-test.manifest.json",
            "pages/page-test.manifest.json?candidate=other",
        ):
            with self.subTest(uri=unsafe_uri), tempfile.TemporaryDirectory() as directory:
                work = Path(directory)
                remote_root = _write_fixture(work / "remote")
                root = json.loads(remote_root.read_text())
                root["pages"][0]["manifest"]["uri"] = unsafe_uri
                remote_root.write_bytes(_json_bytes(root))
                tracked_root = work / "tracked" / ROOT_MANIFEST_NAME
                tracked_root.parent.mkdir()
                tracked_root.write_bytes(remote_root.read_bytes())
                content_atlas = work / "install/content/terrain-atlas"
                content_atlas.mkdir(parents=True)
                sentinel = content_atlas / "sentinel"
                sentinel.write_text("keep")

                with self.assertRaisesRegex(AtlasHydrationError, "URI"):
                    hydrate(
                        base_url=(remote_root.parent.as_uri() + "/"),
                        cache_dir=work / "cache",
                        tracked_root=tracked_root,
                        content_atlas=content_atlas,
                        web_atlas=work / "install/web/terrain-atlas",
                    )
                self.assertEqual(sentinel.read_text(), "keep")

    def test_second_destination_failure_rolls_back_first_destination(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            first = work / "first"
            second = work / "second"
            first.mkdir()
            second.mkdir()
            (first / "value").write_text("old-first")
            (second / "value").write_text("old-second")
            staged_first = work / "staged-first"
            staged_second = work / "staged-second"
            staged_first.mkdir()
            staged_second.mkdir()
            (staged_first / "value").write_text("new-first")
            (staged_second / "value").write_text("new-second")
            real_replace = os.replace

            def replace_with_second_failure(source, destination):
                if Path(source) == staged_second and Path(destination) == second:
                    raise OSError("injected second-destination failure")
                return real_replace(source, destination)

            with patch("hydrate_rapier_atlas.os.replace", side_effect=replace_with_second_failure):
                with self.assertRaisesRegex(OSError, "second-destination"):
                    _install_transaction([
                        (first, staged_first),
                        (second, staged_second),
                    ])
            self.assertEqual((first / "value").read_text(), "old-first")
            self.assertEqual((second / "value").read_text(), "old-second")

    def test_rejects_nested_static_symlink_before_install(self):
        if not hasattr(os, "symlink"):
            self.skipTest("symlinks are unavailable")
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            remote_root = _write_fixture(work / "remote")
            tracked_root = work / "tracked" / ROOT_MANIFEST_NAME
            tracked_root.parent.mkdir()
            tracked_root.write_bytes(remote_root.read_bytes())
            nested = tracked_root.parent / "static/nested"
            nested.mkdir(parents=True)
            outside = work / "outside"
            outside.write_text("must not be imported")
            os.symlink(outside, nested / "leak")
            content_atlas = work / "install/content/terrain-atlas"
            content_atlas.mkdir(parents=True)
            sentinel = content_atlas / "sentinel"
            sentinel.write_text("keep")

            with self.assertRaisesRegex(AtlasHydrationError, "symlink"):
                hydrate(
                    base_url=(remote_root.parent.as_uri() + "/"),
                    cache_dir=work / "cache",
                    tracked_root=tracked_root,
                    content_atlas=content_atlas,
                    web_atlas=work / "install/web/terrain-atlas",
                )
            self.assertEqual(sentinel.read_text(), "keep")

    def test_verify_fails_when_installed_bundle_is_missing_or_corrupt(self):
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            tracked_root = _write_fixture(work / "tracked")
            atlas = work / "atlas"
            _write_fixture(atlas)
            verify_installed(atlas, tracked_root)

            bundle = atlas / "pages/page-test.terrain"
            bundle.write_bytes(b"\x05\x00")
            with self.assertRaisesRegex(AtlasHydrationError, "bundle hash mismatch"):
                verify_installed(atlas, tracked_root)
            bundle.unlink()
            with self.assertRaisesRegex(AtlasHydrationError, "missing page bundle"):
                verify_installed(atlas, tracked_root)


if __name__ == "__main__":
    unittest.main()
