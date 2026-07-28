#!/usr/bin/env python3

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest import mock

import numpy as np
from scipy.io import wavfile

sys.path.insert(0, str(Path(__file__).resolve().parent))

import jet_library  # noqa: E402


def _minimal_catalog_source(source_id: str = "test.source", segments: list | None = None) -> dict:
    return {
        "schema_version": jet_library.CATALOG_VERSION,
        "sources": [{
            "id": source_id,
            "title": "Test source",
            "url": "https://example.test/video",
            "provider": "test",
            "distribution": {"tier": "reference_local"},
            "subject": {"perspective": "cockpit_airframe"},
            "tags": ["cockpit"],
            "segments": segments if segments is not None else [],
        }],
    }


class JetLibraryTests(unittest.TestCase):
    def test_tracked_catalog_is_valid_and_unique(self) -> None:
        catalog = json.loads(
            jet_library.DEFAULT_CATALOG.read_text(encoding="utf-8")
        )
        self.assertEqual(jet_library.validate_catalog(catalog), [])
        ids = [source["id"] for source in catalog["sources"]]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertGreaterEqual(len(ids), 25)
        self.assertTrue(any("tu-95" in source["tags"] for source in catalog["sources"]))
        self.assertTrue(
            any(source["subject"]["perspective"] == "external_near"
                for source in catalog["sources"])
        )

    def test_unsafe_ids_are_rejected_before_becoming_paths(self) -> None:
        for value in ("../../escape", "/absolute", "has spaces", "", "slash/path"):
            with self.assertRaises(ValueError):
                jet_library.source_slug(value)

    def test_segment_profile_preserves_annotations_without_pcm(self) -> None:
        sample_rate = 8_000
        time = np.arange(sample_rate * 2, dtype=np.float64) / sample_rate
        signal = 0.16 * np.sin(2 * np.pi * 96 * time)
        signal += 0.04 * np.sin(2 * np.pi * 400 * time)
        pcm = np.int16(np.clip(signal, -1, 1) * 32767)
        source = {
            "id": "test.source",
            "title": "test",
            "url": "https://example.test/source",
        }
        segment = {
            "id": "test.source.high-g",
            "start_s": 0.25,
            "end_s": 1.75,
            "states": {
                "engine_power": "military",
                "dynamic_pressure": "high",
                "g_load": "positive-high",
            },
            "events": ["g_onset"],
            "evidence": {"kind": "visible_hud", "confidence": 0.8},
            "contaminants": ["camera_agc"],
        }
        with tempfile.TemporaryDirectory() as scratch:
            path = Path(scratch) / "source.wav"
            wavfile.write(path, sample_rate, pcm)
            profile = jet_library.profile_segment(source, path, segment)
        self.assertEqual(profile["segment_id"], segment["id"])
        self.assertEqual(
            profile["annotations"]["states"]["g_load"],
            "positive-high",
        )
        self.assertFalse(profile["source_pcm_embedded"])
        self.assertEqual(profile["measurement"]["calibration"], "relative_only")
        self.assertGreater(profile["measurement"]["frame_count"], 2)

    def test_segment_past_media_duration_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            path = Path(scratch) / "short.wav"
            wavfile.write(
                path,
                8_000,
                np.full(8_000, 1_000, dtype=np.int16),
            )
            with self.assertRaisesRegex(ValueError, "beyond media duration"):
                jet_library.profile_segment(
                    {"id": "test.short", "title": "short", "url": "https://example.test"},
                    path,
                    {
                        "id": "test.short.segment",
                        "start_s": 0,
                        "end_s": 2,
                    },
                )

    def test_review_index_keeps_media_local_and_searchable(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch)
            vault = root / "vault"
            media = vault / "media" / "test.source.mp4"
            media.parent.mkdir(parents=True)
            media.touch()
            inventory = vault / "inventory" / "test.source.json"
            inventory.parent.mkdir(parents=True)
            inventory.write_text(json.dumps({
                "source_id": "test.source",
                "media": {
                    "path": str(media),
                },
                "analysis_audio": None,
            }), encoding="utf-8")
            catalog = {
                "sources": [{
                    "id": "test.source",
                    "title": "Cockpit & close pass",
                    "url": "https://example.test/video",
                    "distribution": {"tier": "reference_local"},
                    "subject": {"perspective": "cockpit_airframe"},
                    "tags": ["cockpit", "fighter"],
                    "notes": "Visual evidence only.",
                }],
            }
            output = vault / "review.html"
            previous_root = jet_library.REPO_ROOT
            try:
                jet_library.REPO_ROOT = Path("/")
                stats = jet_library.generate_review_index(catalog, vault, output)
            finally:
                jet_library.REPO_ROOT = previous_root
            page = output.read_text(encoding="utf-8")
        self.assertEqual(stats["fetched"], 1)
        self.assertIn("<video controls", page)
        self.assertIn("Cockpit &amp; close pass", page)
        self.assertIn("Raw media is local reference evidence", page)
        self.assertIn("Export annotations", page)
        self.assertIn("Mark IN", page)
        self.assertIn(jet_library.ANNOTATION_EXPORT_VERSION, page)
        self.assertNotIn("data:video", page)

    def test_annotation_export_merges_by_segment_id_and_validates(self) -> None:
        catalog = _minimal_catalog_source(segments=[{
            "id": "test.source.old",
            "start_s": 1,
            "end_s": 2,
        }])
        exported = {
            "schema_version": jet_library.ANNOTATION_EXPORT_VERSION,
            "sources": [{
                "id": "test.source",
                "segments": [{
                    "id": "test.source.new",
                    "start_s": 3.25,
                    "end_s": 4.75,
                    "states": {
                        "engine_power": "military",
                        "dynamic_pressure": "high",
                        "g_load": "positive-high",
                    },
                    "events": ["g_onset"],
                    "evidence": {"kind": "visible_hud", "confidence": 0.85},
                    "contaminants": [],
                }],
            }],
        }
        merged, changed = jet_library.merge_annotation_export(catalog, exported)
        self.assertEqual(changed, 1)
        self.assertEqual(
            [segment["id"] for segment in merged["sources"][0]["segments"]],
            ["test.source.old", "test.source.new"],
        )
        self.assertEqual(jet_library.validate_catalog(merged), [])
        self.assertEqual(catalog["sources"][0]["segments"][0]["id"], "test.source.old")

    def test_annotation_export_rejects_unknown_source(self) -> None:
        catalog = _minimal_catalog_source()
        with self.assertRaisesRegex(ValueError, "unknown source"):
            jet_library.merge_annotation_export(catalog, {
                "schema_version": jet_library.ANNOTATION_EXPORT_VERSION,
                "sources": [{"id": "missing.source", "segments": []}],
            })

    def test_annotation_export_rejects_duplicate_segment_ids_before_merge(self) -> None:
        """Duplicate IDs must fail closed — never dict-overwrite into one survivor."""
        catalog = _minimal_catalog_source(segments=[{
            "id": "test.source.tracked",
            "start_s": 0,
            "end_s": 1,
        }])
        duplicate = {
            "id": "test.source.military-01",
            "start_s": 1.0,
            "end_s": 2.0,
            "states": {
                "engine_power": "military",
                "dynamic_pressure": "high",
                "g_load": "one-g",
            },
            "events": [],
            "evidence": {"kind": "visible_hud", "confidence": 0.7},
            "contaminants": [],
        }
        overwritten = {
            **duplicate,
            "start_s": 3.0,
            "end_s": 4.0,
            "states": {
                "engine_power": "afterburner",
                "dynamic_pressure": "high",
                "g_load": "positive-high",
            },
        }
        with self.assertRaisesRegex(ValueError, "duplicate segment id"):
            jet_library.merge_annotation_export(catalog, {
                "schema_version": jet_library.ANNOTATION_EXPORT_VERSION,
                "sources": [{
                    "id": "test.source",
                    "segments": [duplicate, overwritten],
                }],
            })
        self.assertEqual(
            [segment["id"] for segment in catalog["sources"][0]["segments"]],
            ["test.source.tracked"],
        )

    def test_annotation_export_changed_count_two_does_not_silently_keep_one(self) -> None:
        """Regression: two payload rows with one id must not report changed=2 and keep one."""
        catalog = _minimal_catalog_source()
        first = {
            "id": "test.source.pass-01",
            "start_s": 1.0,
            "end_s": 2.0,
            "states": {
                "engine_power": "military",
                "dynamic_pressure": "medium",
                "g_load": "one-g",
            },
            "events": ["pass"],
            "evidence": {"kind": "visible_manoeuvre", "confidence": 0.6},
            "contaminants": [],
        }
        second = {
            **first,
            "start_s": 5.0,
            "end_s": 6.5,
            "events": ["flyby"],
        }
        with self.assertRaisesRegex(ValueError, "duplicate segment id"):
            jet_library.merge_annotation_export(catalog, {
                "schema_version": jet_library.ANNOTATION_EXPORT_VERSION,
                "sources": [{"id": "test.source", "segments": [first, second]}],
            })
        self.assertEqual(catalog["sources"][0]["segments"], [])

    def test_next_annotation_segment_id_stays_unique_after_deletion(self) -> None:
        # Tracked already owns -01; a length-based draft counter would collide.
        self.assertEqual(
            jet_library.next_annotation_segment_id(
                "test.source",
                "military",
                {"test.source.military-01"},
            ),
            "test.source.military-02",
        )
        # After deleting draft -01 while -02 remains, length+1 would reuse -02.
        # Occupied-set allocation must skip the surviving id (may reuse freed -01).
        allocated = jet_library.next_annotation_segment_id(
            "test.source",
            "military",
            {"test.source.military-02", "test.source.tracked-01"},
        )
        self.assertNotEqual(allocated, "test.source.military-02")
        self.assertNotIn(allocated, {
            "test.source.military-02",
            "test.source.tracked-01",
        })
        self.assertEqual(allocated, "test.source.military-01")

    def test_review_index_avoids_length_based_segment_id_reuse(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            vault = Path(scratch) / "vault"
            vault.mkdir()
            catalog = {
                "sources": [{
                    "id": "test.source",
                    "title": "Test",
                    "url": "https://example.test/video",
                    "distribution": {"tier": "reference_local"},
                    "subject": {"perspective": "cockpit_airframe"},
                    "tags": ["cockpit"],
                    "segments": [{
                        "id": "test.source.military-01",
                        "start_s": 1,
                        "end_s": 2,
                    }],
                    "notes": "",
                }],
            }
            output = vault / "review.html"
            jet_library.generate_review_index(catalog, vault, output)
            page = output.read_text(encoding="utf-8")
        self.assertIn("occupiedIds", page)
        self.assertIn("tracked", page)
        self.assertNotIn(
            "const sequence = (draft[sourceId] || []).length + 1;",
            page,
        )

    def test_yt_dlp_format_selector_respects_max_video_height(self) -> None:
        self.assertEqual(
            jet_library.yt_dlp_format_selector(480),
            "bv*[height<=480]+ba/b[height<=480]/b",
        )
        self.assertEqual(
            jet_library.yt_dlp_format_selector(720),
            "bv*[height<=720]+ba/b[height<=720]/b",
        )
        self.assertEqual(jet_library.yt_dlp_format_selector(0), "bv*+ba/b")
        self.assertEqual(jet_library.yt_dlp_format_selector(-1), "bv*+ba/b")

    def test_fetch_source_passes_max_video_height_into_yt_dlp_format(self) -> None:
        source = {
            "id": "test.source",
            "title": "Test",
            "url": "https://example.test/video",
            "provider": "youtube",
            "distribution": {"tier": "reference_local"},
        }
        captured: list[list[str]] = []

        def fake_run(command: list[str]) -> None:
            captured.append(command)

        with tempfile.TemporaryDirectory() as scratch:
            vault = Path(scratch)
            media = vault / "media" / "test.source.mp4"
            media.parent.mkdir(parents=True)
            media.write_bytes(b"fake")
            inventory = {
                "schema_version": "guns-only.jet-audio-local-inventory.v1",
                "source_id": "test.source",
                "media": {"path": str(media), "sha256": "x", "bytes": 4, "probe": {}},
                "analysis_audio": None,
            }
            with mock.patch.object(jet_library, "run_checked", side_effect=fake_run), \
                 mock.patch.object(jet_library, "find_media", side_effect=[None, media]), \
                 mock.patch.object(
                     jet_library, "normalize_fetched_video_height", return_value=media
                 ), \
                 mock.patch.object(jet_library, "extract_analysis_audio"), \
                 mock.patch.object(jet_library, "write_inventory", return_value=inventory):
                jet_library.fetch_source(
                    source, vault, force=False, maximum_video_height=720
                )
        self.assertTrue(captured)
        format_index = captured[0].index("--format")
        self.assertEqual(
            captured[0][format_index + 1],
            "bv*[height<=720]+ba/b[height<=720]/b",
        )

    def test_fetch_source_zero_height_uses_unconstrained_yt_dlp_format(self) -> None:
        source = {
            "id": "test.source",
            "title": "Test",
            "url": "https://example.test/video",
            "provider": "youtube",
            "distribution": {"tier": "reference_local"},
        }
        captured: list[list[str]] = []

        def fake_run(command: list[str]) -> None:
            captured.append(command)

        with tempfile.TemporaryDirectory() as scratch:
            vault = Path(scratch)
            media = vault / "media" / "test.source.mp4"
            media.parent.mkdir(parents=True)
            media.write_bytes(b"fake")
            inventory = {
                "schema_version": "guns-only.jet-audio-local-inventory.v1",
                "source_id": "test.source",
                "media": {"path": str(media), "sha256": "x", "bytes": 4, "probe": {}},
                "analysis_audio": None,
            }
            with mock.patch.object(jet_library, "run_checked", side_effect=fake_run), \
                 mock.patch.object(jet_library, "find_media", side_effect=[None, media]), \
                 mock.patch.object(
                     jet_library, "normalize_fetched_video_height", return_value=media
                 ), \
                 mock.patch.object(jet_library, "extract_analysis_audio"), \
                 mock.patch.object(jet_library, "write_inventory", return_value=inventory):
                jet_library.fetch_source(
                    source, vault, force=False, maximum_video_height=0
                )
        format_index = captured[0].index("--format")
        self.assertEqual(captured[0][format_index + 1], "bv*+ba/b")

    def test_video_height_check_does_not_trust_missing_provider_metadata(self) -> None:
        self.assertEqual(jet_library.maximum_video_height({
            "streams": [
                {"codec_type": "audio", "sample_rate": "48000"},
                {"codec_type": "video", "height": 1080},
                {"codec_type": "video", "height": 480},
            ],
        }), 1080)
        self.assertEqual(jet_library.maximum_video_height({
            "streams": [{"codec_type": "video", "height": None}],
        }), 0)

    def test_video_height_publish_failure_preserves_original_source(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch)
            media = root / "reference.webm"
            media.write_bytes(b"original-reference")
            temporary = root / ".reference.height-480.mp4"

            def fake_transcode(command: list[str]) -> None:
                Path(command[-1]).write_bytes(b"complete-transcode")

            with mock.patch.object(
                jet_library,
                "ffprobe",
                return_value={"streams": [{"codec_type": "video", "height": 1080}]},
            ), mock.patch.object(
                jet_library,
                "run_checked",
                side_effect=fake_transcode,
            ), mock.patch.object(
                Path,
                "replace",
                side_effect=OSError("publish failed"),
            ):
                with self.assertRaisesRegex(OSError, "publish failed"):
                    jet_library.normalize_fetched_video_height(media, 480)

            self.assertEqual(media.read_bytes(), b"original-reference")
            self.assertFalse(temporary.exists(), "failed publish temporary should be cleaned")


if __name__ == "__main__":
    unittest.main()
