#!/usr/bin/env python3

from __future__ import annotations

import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
from scipy.io import wavfile

sys.path.insert(0, str(Path(__file__).resolve().parent))

import jet_library  # noqa: E402


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
        catalog = {
            "schema_version": jet_library.CATALOG_VERSION,
            "sources": [{
                "id": "test.source",
                "title": "Test source",
                "url": "https://example.test/video",
                "provider": "test",
                "distribution": {"tier": "reference_local"},
                "subject": {"perspective": "cockpit_airframe"},
                "tags": ["cockpit"],
                "segments": [{
                    "id": "test.source.old",
                    "start_s": 1,
                    "end_s": 2,
                }],
            }],
        }
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
        catalog = {
            "schema_version": jet_library.CATALOG_VERSION,
            "sources": [{
                "id": "test.source",
                "title": "Test source",
                "url": "https://example.test/video",
                "provider": "test",
                "distribution": {"tier": "reference_local"},
                "subject": {"perspective": "cockpit_airframe"},
                "tags": ["cockpit"],
                "segments": [],
            }],
        }
        with self.assertRaisesRegex(ValueError, "unknown source"):
            jet_library.merge_annotation_export(catalog, {
                "schema_version": jet_library.ANNOTATION_EXPORT_VERSION,
                "sources": [{"id": "missing.source", "segments": []}],
            })

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


if __name__ == "__main__":
    unittest.main()
