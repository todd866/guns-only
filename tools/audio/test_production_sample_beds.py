#!/usr/bin/env python3

from __future__ import annotations

from array import array
import hashlib
import json
import math
from pathlib import Path
import sys
import unittest
import wave


ROOT = Path(__file__).resolve().parents[2]
DISCLAIMER = (
    "The appearance of U.S. Department of War (DoW) visual information does not "
    "imply or constitute DoW endorsement."
)
ALLOWED_SAMPLE_RATES = {22_050, 48_000}

ASSETS = (
    {
        "path": "web/wwwroot/render/audio/samples/jet/fa18_cockpit_f14_surrogate_loop.wav",
        "sources": "web/wwwroot/render/audio/samples/jet/SOURCES.md",
        "airframe_sources": "docs/airframes/f-14a/00-sources.md",
        "source_id": "dvids.342602",
        "source_url": "https://www.dvidshub.net/video/342602/f-18-cockpit-b-roll",
        "source_sha256": "71f280415131d3df76fdbdf0b9431dd62f78958951d6e5f9103c007e81e54e9a",
        "sha256": "4f6312519c9f78ef2896efe19b52fc1d68ec0bbb3caef14d9f22ea4bf939e659",
        "bytes": 1_048_364,
        "sample_rate": 48_000,
        "frames": 524_160,
        "mean_dbfs": -20.0,
        "maximum_dbfs": -7.0,
        "start_s": 47.5,
        "end_s": 58.5,
        "true_aircraft": "F/A-18",
        "surrogate_aircraft": "F-14",
        "virin": "140611-M-ZP289-002",
        "dod_id": "DOD_101732906",
    },
    {
        "path": "web/wwwroot/render/audio/samples/rotorcraft/uh1h_t53_ah1g_surrogate_loop.wav",
        "sources": "web/wwwroot/render/audio/samples/rotorcraft/SOURCES.md",
        "airframe_sources": "docs/airframes/ah-1g-cobra/00-sources.md",
        "source_id": "dvids.71253",
        "source_url": "https://www.dvidshub.net/video/71253/iraqi-air-force-helicopter-flight-part-2",
        "source_sha256": "478542e624bf6496f53123efe6b449b870cac5c744ec2226d13110a75f1ab0df",
        "sha256": "8f6f109ba68a0727c202f82de82852ee2c71d91bcbe1a9350e30c41a3017aed4",
        "bytes": 485_178,
        "sample_rate": 22_050,
        "frames": 242_550,
        "mean_dbfs": -20.3,
        "maximum_dbfs": -6.3,
        "start_s": 130.0,
        "end_s": 141.0,
        "true_aircraft": "UH-1H",
        "surrogate_aircraft": "AH-1G",
        "virin": "091010-F-6972C-002",
        "dod_id": "DOD_100055558",
    },
)


def _pcm16(path: Path) -> tuple[wave._wave_params, array]:
    with wave.open(str(path), "rb") as audio:
        params = audio.getparams()
        payload = audio.readframes(params.nframes)
    samples = array("h")
    samples.frombytes(payload)
    if sys.byteorder != "little":
        samples.byteswap()
    return params, samples


def _dbfs(amplitude: float) -> float:
    return 20.0 * math.log10(max(amplitude, 1e-12))


class ProductionSampleBedTests(unittest.TestCase):
    def test_exact_identity_and_pcm_contract(self) -> None:
        for asset in ASSETS:
            with self.subTest(asset=asset["path"]):
                path = ROOT / asset["path"]
                payload = path.read_bytes()
                self.assertEqual(len(payload), asset["bytes"])
                self.assertEqual(hashlib.sha256(payload).hexdigest(), asset["sha256"])

                params, samples = _pcm16(path)
                self.assertEqual(params.nchannels, 1)
                self.assertEqual(params.sampwidth, 2)
                self.assertEqual(params.comptype, "NONE")
                self.assertIn(params.framerate, ALLOWED_SAMPLE_RATES)
                self.assertEqual(params.framerate, asset["sample_rate"])
                self.assertEqual(params.nframes, asset["frames"])
                self.assertEqual(len(samples), params.nframes)
                duration = params.nframes / params.framerate
                self.assertGreaterEqual(duration, 8.0)
                self.assertLessEqual(duration, 12.0)

    def test_signal_is_non_silent_unclipped_and_loop_safe(self) -> None:
        for asset in ASSETS:
            with self.subTest(asset=asset["path"]):
                _, samples = _pcm16(ROOT / asset["path"])
                peak = max(abs(sample) for sample in samples)
                rms = math.sqrt(sum(sample * sample for sample in samples) / len(samples))
                rms_dbfs = _dbfs(rms / 32_768.0)
                peak_dbfs = _dbfs(peak / 32_768.0)

                self.assertGreater(rms_dbfs, -45.0, "production bed is effectively silent")
                self.assertAlmostEqual(rms_dbfs, asset["mean_dbfs"], delta=0.15)
                self.assertAlmostEqual(peak_dbfs, asset["maximum_dbfs"], delta=0.15)
                self.assertLess(peak, 32_767, "production bed reaches PCM full scale")
                self.assertFalse(any(sample in (-32_768, 32_767) for sample in samples))

                internal_steps = sorted(
                    abs(samples[index] - samples[index - 1]) / 32_768.0
                    for index in range(1, len(samples))
                )
                percentile_99 = internal_steps[int(0.99 * (len(internal_steps) - 1))]
                seam = abs(samples[0] - samples[-1]) / 32_768.0
                self.assertLessEqual(
                    seam,
                    max(0.02, percentile_99 * 1.5),
                    f"hard loop wrap ({seam:.6f} vs p99 {percentile_99:.6f})",
                )

    def test_catalog_and_source_ledgers_preserve_provenance_limits(self) -> None:
        catalog = json.loads(
            (ROOT / "audio/jet-library/catalog.json").read_text(encoding="utf-8")
        )
        indexed = {source["id"]: source for source in catalog["sources"]}
        for asset in ASSETS:
            with self.subTest(asset=asset["path"]):
                source = indexed[asset["source_id"]]
                self.assertEqual(source["url"], asset["source_url"])
                self.assertEqual(source["source_media"]["sha256"], asset["source_sha256"])
                self.assertEqual(source["distribution"]["license_expression"], "PD-USGov")
                self.assertIn("PUBLIC DOMAIN", source["distribution"]["source_claim"])
                self.assertEqual(source["distribution"]["disclaimer"], DISCLAIMER)
                self.assertEqual(source["virin"], asset["virin"])
                self.assertEqual(source["dod_id"], asset["dod_id"])

                segment = source["segments"][0]
                self.assertEqual(segment["start_s"], asset["start_s"])
                self.assertEqual(segment["end_s"], asset["end_s"])
                self.assertIn("no obvious speech or music", segment["screening"])
                self.assertIn("final human listen remains required", segment["screening"])

                derivative = next(
                    item for item in source["production_derivatives"]
                    if item["path"] == asset["path"]
                )
                self.assertEqual(derivative["sha256"], asset["sha256"])
                self.assertEqual(derivative["bytes"], asset["bytes"])
                self.assertEqual(derivative["epistemic"], "surrogate")
                self.assertIn(asset["true_aircraft"], derivative["identity_claim"])
                self.assertIn(f"not an {asset['surrogate_aircraft']} recording", derivative["identity_claim"])

                source_ledger = (ROOT / asset["sources"]).read_text(encoding="utf-8")
                airframe_ledger = (ROOT / asset["airframe_sources"]).read_text(encoding="utf-8")
                combined = source_ledger + "\n" + airframe_ledger
                for required in (
                    Path(asset["path"]).name,
                    asset["source_url"],
                    asset["source_sha256"],
                    asset["sha256"],
                    asset["true_aircraft"],
                    asset["surrogate_aircraft"],
                    asset["virin"],
                    asset["dod_id"],
                    "PUBLIC DOMAIN",
                    "https://www.dvidshub.net/about/copyright",
                    DISCLAIMER,
                    "audio-only",
                    "not relicensed",
                    "No source visuals",
                    "reasonable safe-use assessment, not a legal warranty",
                    "final human listen",
                ):
                    self.assertIn(required, combined)

    def test_raw_candidates_are_excluded_across_all_sample_families(self) -> None:
        gitignore = (ROOT / ".gitignore").read_text(encoding="utf-8")
        project = (ROOT / "web/GunsOnly.Web.csproj").read_text(encoding="utf-8")
        for pattern in (
            "web/wwwroot/render/audio/samples/**/_*.wav",
            "web/wwwroot/render/audio/samples/**/_*.flac",
            "web/wwwroot/render/audio/samples/**/*.flac",
        ):
            self.assertIn(pattern, gitignore)
        for pattern in (
            "wwwroot/render/audio/samples/**/_*.wav",
            "wwwroot/render/audio/samples/**/_*.flac",
            "wwwroot/render/audio/samples/**/*.flac",
        ):
            self.assertIn(pattern, project)


if __name__ == "__main__":
    unittest.main()
