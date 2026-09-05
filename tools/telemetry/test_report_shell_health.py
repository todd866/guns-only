#!/usr/bin/env python3
"""Offline regressions for shell_health_summary chunk deduplication."""

from __future__ import annotations

import gzip
import json
import os
import shutil
import sys
import tempfile
import unittest
from unittest import mock

TELEMETRY_DIR = os.path.dirname(os.path.abspath(__file__))
if TELEMETRY_DIR not in sys.path:
    sys.path.insert(0, TELEMETRY_DIR)

import report


def write_chunk(path: str, rows: list[dict]) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with gzip.open(path, "wt", encoding="utf-8") as handle:
        for row in rows:
            handle.write(json.dumps(row, separators=(",", ":")) + "\n")


class ShellHealthSummaryTests(unittest.TestCase):
    def setUp(self) -> None:
        self.tmp = tempfile.mkdtemp()
        self.cache = os.path.join(self.tmp, "cache")
        self.addCleanup(shutil.rmtree, self.tmp)
        self.cache_patch = mock.patch.object(report, "CACHE", self.cache)
        self.cache_patch.start()
        self.addCleanup(self.cache_patch.stop)

    def _chunk_path(self, pathname: str) -> str:
        return os.path.join(self.cache, "chunks", pathname.replace("/", "_"))

    def test_deduplicates_milestones_and_fatals_across_uploaded_chunks(self) -> None:
        session = "shell-1700000000000-123"
        pathname_a = f"telemetry/{session}/batch-a.jsonl.gz"
        pathname_b = f"telemetry/{session}/batch-b.jsonl.gz"
        header = {"k": "hdr", "platform": "ios", "arrival": "threads"}
        write_chunk(
            self._chunk_path(pathname_a),
            [
                header,
                {
                    "k": "in",
                    "type": "shell_health",
                    "code": "milestone",
                    "milestone": "script_load",
                    "t": 10,
                },
                {
                    "k": "in",
                    "type": "shell_health",
                    "code": "milestone",
                    "milestone": "bridge_ready",
                    "t": 50,
                },
            ],
        )
        write_chunk(
            self._chunk_path(pathname_b),
            [
                header,
                {
                    "k": "in",
                    "type": "shell_health",
                    "code": "milestone",
                    "milestone": "script_load",
                    "t": 10,
                },
                {
                    "k": "in",
                    "type": "shell_health",
                    "code": "milestone",
                    "milestone": "bridge_ready",
                    "t": 50,
                },
                {
                    "k": "in",
                    "type": "shell_health",
                    "code": "milestone",
                    "milestone": "webgl_ok",
                    "t": 200,
                },
                {
                    "k": "in",
                    "type": "shell_health",
                    "code": "fatal",
                    "reason": "webgl",
                    "t": 300,
                },
                {
                    "k": "in",
                    "type": "shell_health",
                    "code": "fatal",
                    "reason": "webgl",
                    "t": 300,
                },
            ],
        )

        sessions = {
            session: [
                {"pathname": pathname_a, "url": "http://example/a", "size": 1, "etag": "a"},
                {"pathname": pathname_b, "url": "http://example/b", "size": 1, "etag": "b"},
            ]
        }
        result = report.shell_health_summary(sessions, [session], refresh=False)

        self.assertEqual(result["sessions"], 1)
        self.assertEqual(result["milestones"]["script_load"], 1)
        self.assertEqual(result["milestones"]["bridge_ready"], 1)
        self.assertEqual(result["milestones"]["webgl_ok"], 1)
        self.assertEqual(result["fatals"]["webgl"], 1)
        self.assertEqual(result["farthest"]["webgl_ok"], 1)

    def test_counts_distinct_sessions_and_preserves_farthest_milestone(self) -> None:
        session_a = "shell-1700000000000-111"
        session_b = "shell-1700000000000-222"
        header = {"k": "hdr", "platform": "android", "arrival": "chrome"}
        write_chunk(
            self._chunk_path(f"telemetry/{session_a}/batch-a.jsonl.gz"),
            [
                header,
                {
                    "k": "in",
                    "type": "shell_health",
                    "code": "milestone",
                    "milestone": "script_load",
                    "t": 1,
                },
            ],
        )
        write_chunk(
            self._chunk_path(f"telemetry/{session_b}/batch-b.jsonl.gz"),
            [
                header,
                {
                    "k": "in",
                    "type": "shell_health",
                    "code": "milestone",
                    "milestone": "script_load",
                    "t": 1,
                },
                {
                    "k": "in",
                    "type": "shell_health",
                    "code": "milestone",
                    "milestone": "bridge_ready",
                    "t": 2,
                },
                {
                    "k": "in",
                    "type": "shell_health",
                    "code": "milestone",
                    "milestone": "webgl_ok",
                    "t": 3,
                },
            ],
        )

        sessions = {
            session_a: [
                {
                    "pathname": f"telemetry/{session_a}/batch-a.jsonl.gz",
                    "url": "http://example/a",
                    "size": 1,
                    "etag": "a",
                }
            ],
            session_b: [
                {
                    "pathname": f"telemetry/{session_b}/batch-b.jsonl.gz",
                    "url": "http://example/b",
                    "size": 1,
                    "etag": "b",
                }
            ],
        }
        result = report.shell_health_summary(
            sessions,
            [session_a, session_b],
            refresh=False,
        )

        self.assertEqual(result["sessions"], 2)
        self.assertEqual(result["milestones"]["script_load"], 2)
        self.assertEqual(result["milestones"]["bridge_ready"], 1)
        self.assertEqual(result["milestones"]["webgl_ok"], 1)
        self.assertEqual(result["farthest"]["script_load"], 1)
        self.assertEqual(result["farthest"]["webgl_ok"], 1)


if __name__ == "__main__":
    unittest.main()
