#!/usr/bin/env python3

from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

import numpy as np
from scipy.io import wavfile

sys.path.insert(0, str(Path(__file__).resolve().parent))

import cockpit_palette  # noqa: E402


class CockpitPaletteTests(unittest.TestCase):
    def setUp(self) -> None:
        self.profile = {
            "version": cockpit_palette.PROFILE_VERSION,
            "bands_hz": [
                [low, high]
                for low, high in cockpit_palette.BANDS_HZ
            ],
            "regimes": {
                regime: {
                    "band_energy_fraction": [0.24, 0.28, 0.25, 0.15, 0.08],
                    "dominant_low_peaks_hz": [48.0, 96.0, 224.0],
                }
                for regime in cockpit_palette.REGIME_QUANTILES
            },
        }

    def test_stereo_integer_pcm_is_normalized_before_downmix(self) -> None:
        stereo = np.asarray([
            [32767, 32767],
            [-32768, -32768],
            [32767, -32768],
        ], dtype=np.int16)
        mono = cockpit_palette._float_mono(stereo)
        self.assertAlmostEqual(float(mono[0]), 32767 / 32768)
        self.assertEqual(float(mono[1]), -1.0)
        self.assertAlmostEqual(float(mono[2]), -0.5 / 32768)

    def test_seeded_synthesis_has_a_repeatable_digest(self) -> None:
        first = cockpit_palette._synthesize_regime(
            self.profile, "mil", 8_000, 1.0, 20260728, -20.5
        )
        repeated = cockpit_palette._synthesize_regime(
            self.profile, "mil", 8_000, 1.0, 20260728, -20.5
        )
        changed = cockpit_palette._synthesize_regime(
            self.profile, "mil", 8_000, 1.0, 20260729, -20.5
        )
        first_digest = hashlib.sha256(
            np.asarray(first, dtype="<f8").tobytes()
        ).hexdigest()
        repeated_digest = hashlib.sha256(
            np.asarray(repeated, dtype="<f8").tobytes()
        ).hexdigest()
        self.assertEqual(first_digest, repeated_digest)
        self.assertFalse(np.array_equal(first, changed))
        self.assertEqual(first.size, 8_000)
        self.assertTrue(np.all(np.isfinite(first)))
        self.assertLessEqual(float(np.max(np.abs(first))), 0.92)

    def test_synthesize_command_writes_the_three_expected_pcm_beds(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch)
            profile_path = root / "profile.json"
            profile_path.write_text(json.dumps(self.profile), encoding="utf-8")
            output = root / "output"
            cockpit_palette.synthesize(argparse.Namespace(
                profile=profile_path,
                output_dir=output,
                prefix="test",
                suffix="alt",
                sample_rate=8_000,
                seconds=1.0,
                seed=41,
                target_rms_dbfs="-24,-20.5,-18.5",
            ))
            for regime in ("idle", "mil", "grit"):
                sample_rate, pcm = wavfile.read(
                    output / f"test_{regime}_alt_loop.wav"
                )
                self.assertEqual(sample_rate, 8_000)
                self.assertEqual(pcm.dtype, np.int16)
                self.assertEqual(pcm.size, 8_000)
                self.assertGreater(int(np.max(np.abs(pcm))), 0)

    def test_tracked_profiles_reproduce_every_shipped_alternate_bed(self) -> None:
        sample_root = (
            Path(__file__).resolve().parents[2]
            / "web/wwwroot/render/audio/samples/jet"
        )
        configurations = (
            ("f22_palette_profile.json", "f22", "alt", 20260728, "-16,-14.5,-13.5"),
            (
                "rapier_cockpit_profile.json",
                "rapier",
                "cockpit",
                20260729,
                "-30,-30,-22",
            ),
        )
        with tempfile.TemporaryDirectory() as scratch:
            output = Path(scratch)
            for profile, prefix, suffix, seed, levels in configurations:
                cockpit_palette.synthesize(argparse.Namespace(
                    profile=sample_root / profile,
                    output_dir=output,
                    prefix=prefix,
                    suffix=suffix,
                    sample_rate=44_100,
                    seconds=6.0,
                    seed=seed,
                    target_rms_dbfs=levels,
                ))
                for regime in ("idle", "mil", "grit"):
                    name = f"{prefix}_{regime}_{suffix}_loop.wav"
                    self.assertEqual(
                        (output / name).read_bytes(),
                        (sample_root / name).read_bytes(),
                        f"{name} is not reproducible from its tracked profile",
                    )

    def test_condition_loop_repairs_a_hard_wrap_and_is_idempotent(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch)
            sample_rate = 8_000
            time = np.arange(sample_rate, dtype=np.float64) / sample_rate
            hard_wrap = np.int16(
                np.clip(np.sin(2 * np.pi * 123.4 * time), -1.0, 1.0) * 20_000
            )
            source = root / "hard.wav"
            output = root / "conditioned.wav"
            wavfile.write(source, sample_rate, hard_wrap)
            arguments = argparse.Namespace(
                input=source,
                output=output,
                crossfade_ms=80.0,
                seam_ratio=1.5,
                min_jump=0.02,
            )
            cockpit_palette.condition_loop(arguments)
            _, conditioned = wavfile.read(output)
            seam, internal = cockpit_palette._seam_discontinuity(conditioned)
            self.assertLessEqual(seam, max(0.02, internal * 1.5))
            first_digest = hashlib.sha256(output.read_bytes()).hexdigest()
            arguments.input = output
            cockpit_palette.condition_loop(arguments)
            self.assertEqual(first_digest, hashlib.sha256(output.read_bytes()).hexdigest())

    def test_primary_beds_have_no_wrap_discontinuity(self) -> None:
        sample_root = (
            Path(__file__).resolve().parents[2]
            / "web/wwwroot/render/audio/samples/jet"
        )
        primary_beds = {
            "idle_loop.wav": 192_000,
            "mil_loop.wav": 192_000,
            "grit_loop.wav": 192_000,
            "f22_idle_loop.wav": 44_100,
            "f22_mil_loop.wav": 44_100,
            "f22_grit_loop.wav": 44_100,
        }
        for name, expected_sample_rate in primary_beds.items():
            sample_rate, pcm = wavfile.read(sample_root / name)
            self.assertEqual(sample_rate, expected_sample_rate, name)
            self.assertEqual(pcm.dtype, np.int16, name)
            self.assertEqual(pcm.ndim, 1, name)
            seam, internal = cockpit_palette._seam_discontinuity(pcm)
            self.assertLessEqual(
                seam,
                max(0.02, internal * 1.5),
                f"{name} has a hard loop wrap ({seam:.6f} vs {internal:.6f})",
            )

    def test_analyze_rejects_an_effectively_silent_reference(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch)
            source = root / "silent.wav"
            wavfile.write(source, 8_000, np.zeros(8_000, dtype=np.int16))
            with self.assertRaisesRegex(ValueError, "effectively silent"):
                cockpit_palette.analyze(argparse.Namespace(
                    input=source,
                    output=root / "profile.json",
                    source_id="test.silent",
                    source_url="",
                ))


if __name__ == "__main__":
    unittest.main()
