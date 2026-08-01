from array import array
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
import wave


MODULE_PATH = Path(__file__).with_name("rt_performance.py")
SPEC = importlib.util.spec_from_file_location("rt_performance", MODULE_PATH)
rt = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(rt)


def profiles():
    return rt.load_profiles()


def write_packet(
    path: Path,
    parts: list[tuple[float, int]],
    *,
    rate: int = 10_000,
) -> None:
    samples = array("h")
    for seconds, amplitude in parts:
        samples.extend([amplitude] * round(seconds * rate))
    with wave.open(str(path), "wb") as audio:
        audio.setnchannels(1)
        audio.setsampwidth(2)
        audio.setframerate(rate)
        audio.writeframes(samples.tobytes())


class RtPerformanceTests(unittest.TestCase):
    def test_timed_packet_exposes_relative_pace_changes(self):
        result = rt.analyze_timed_packet({
            "id": "pattern-example",
            "units": [
                {
                    "label": "identity",
                    "text": "Ghost One",
                    "startSeconds": 0.0,
                    "endSeconds": 0.6,
                },
                {
                    "label": "configuration",
                    "text": "base gear down",
                    "startSeconds": 0.65,
                    "endSeconds": 1.15,
                },
                {
                    "label": "intention",
                    "text": "full stop",
                    "startSeconds": 1.2,
                    "endSeconds": 1.8,
                },
            ],
        })

        self.assertAlmostEqual(233.3, result["wholePacketWordsPerMinute"], places=1)
        self.assertEqual(360.0, result["units"][1]["wordsPerMinute"])
        self.assertEqual(
            80.0,
            result["units"][1]["paceChangeFromPreviousPercent"],
        )
        self.assertEqual(
            -44.4,
            result["units"][2]["paceChangeFromPreviousPercent"],
        )
        self.assertEqual(0.05, result["maximumPauseSeconds"])

    def test_timed_packet_rejects_overlapping_units(self):
        with self.assertRaisesRegex(ValueError, "overlap"):
            rt.analyze_timed_packet({
                "id": "overlap",
                "units": [
                    {
                        "label": "first",
                        "text": "Ghost One",
                        "startSeconds": 0.0,
                        "endSeconds": 0.8,
                    },
                    {
                        "label": "second",
                        "text": "base",
                        "startSeconds": 0.7,
                        "endSeconds": 1.0,
                    },
                ],
            })

    def test_profile_targets_must_stay_inside_hard_envelope(self):
        document = profiles()
        document["profiles"]["high-workload"][
            "targetMaximumInternalPauseMilliseconds"
        ] = 900
        with self.assertRaisesRegex(ValueError, "target pause exceeds"):
            rt.validate_profiles(document)

    def test_word_count_preserves_contractions_and_numbers(self):
        self.assertEqual(
            8,
            rt.word_count("Ghost One One—I'm at two-zero-zero."),
        )

    def test_connected_high_workload_packet_passes(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "connected.wav"
            write_packet(path, [
                (0.08, 0),
                (1.35, 5_000),
                (0.12, 0),
                (1.25, 5_000),
                (0.10, 0),
            ])
            result = rt.analyze_wav(
                path,
                "Lead, Two. I hit a cable. Right wing's damaged.",
                "high-workload",
                profiles(),
            )
        self.assertEqual("pass", result["status"])
        self.assertAlmostEqual(186.2, result["wholePacketWordsPerMinute"], places=1)
        self.assertAlmostEqual(0.12, result["longestInternalPauseSeconds"], places=2)

    def test_theatrical_pause_fails_high_workload_profile(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "theatrical.wav"
            write_packet(path, [
                (0.08, 0),
                (1.1, 5_000),
                (0.55, 0),
                (1.45, 5_000),
                (0.10, 0),
            ])
            result = rt.analyze_wav(
                path,
                "Lead, Two. I hit a cable. Right wing's damaged.",
                "high-workload",
                profiles(),
            )
        self.assertEqual("fail", result["status"])
        self.assertIn(
            "internal-pause-long",
            {problem["code"] for problem in result["issues"]},
        )
        self.assertIn(
            "internal-silence-above-target",
            {problem["code"] for problem in result["issues"]},
        )

    def test_target_miss_requires_review_without_blocking(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "review.wav"
            write_packet(path, [
                (0.08, 0),
                (1.25, 5_000),
                (0.32, 0),
                (1.15, 5_000),
                (0.10, 0),
            ])
            result = rt.analyze_wav(
                path,
                "Lead, Two. I hit a cable. Right wing's damaged.",
                "high-workload",
                profiles(),
            )
        self.assertEqual("review", result["status"])
        self.assertEqual(0, result["errorCount"])
        self.assertGreater(result["warningCount"], 0)

    def test_acknowledgement_skips_meaningless_wpm_gate(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "ack.wav"
            write_packet(path, [
                (0.05, 0),
                (0.65, 4_000),
                (0.08, 0),
            ])
            result = rt.analyze_wav(
                path,
                "Ghost One One.",
                "acknowledgement",
                profiles(),
            )
        self.assertEqual("pass", result["status"])
        self.assertGreater(result["wholePacketWordsPerMinute"], 200)
        self.assertNotIn(
            "cadence-fast",
            {problem["code"] for problem in result["issues"]},
        )

    def test_clipped_packet_fails(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "clipped.wav"
            write_packet(path, [(1.0, 32_767)])
            result = rt.analyze_wav(
                path,
                "Ghost One One.",
                "acknowledgement",
                profiles(),
            )
        self.assertEqual("fail", result["status"])
        self.assertIn(
            "clipping-high",
            {problem["code"] for problem in result["issues"]},
        )

    def test_audit_spec_resolves_relative_paths_and_counts_failures(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            write_packet(root / "pass.wav", [
                (0.05, 0),
                (0.65, 4_000),
                (0.08, 0),
            ])
            write_packet(root / "fail.wav", [
                (0.4, 0),
                (0.6, 4_000),
                (0.08, 0),
            ])
            spec_path = root / "audit.json"
            spec_path.write_text(json.dumps({
                "schemaVersion": "1.0.0",
                "items": [
                    {
                        "id": "pass",
                        "path": "pass.wav",
                        "text": "Ghost One One.",
                        "profile": "acknowledgement",
                    },
                    {
                        "id": "fail",
                        "path": "fail.wav",
                        "text": "Ghost One One.",
                        "profile": "acknowledgement",
                    },
                ],
            }), encoding="utf-8")
            report = rt.audit_spec(spec_path, profiles())
        self.assertEqual("fail", report["status"])
        self.assertEqual(1, report["passedCount"])
        self.assertEqual(1, report["failedCount"])


if __name__ == "__main__":
    unittest.main()
