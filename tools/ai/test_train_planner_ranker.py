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

sys.path.insert(0, str(Path(__file__).resolve().parent))

import train_planner_ranker as ranker  # noqa: E402


FEATURE_SCHEMA = "guns-only.synthetic-features.v1"
NORMALIZATION_SCHEMA = "guns-only.synthetic-normalization.v1"
CANDIDATE_SCHEMA = "guns-only.synthetic-candidates-9.v1"
SCORE_SCHEMA = "guns-only.synthetic-score.v1"
BEHAVIOR_AIRFRAME_SCHEMA = "guns-only.synthetic-airframe.v1"
BEHAVIOR_PROFILE_SCHEMA = "guns-only.synthetic-profile.v1"
ATMOSPHERE_SCHEMA = "guns-only.synthetic-atmosphere.v1"
BEHAVIOR_POLICY_ID = "guns-only.synthetic-policy.v1:ace"


def _seed_for_split(name: str, start: int = 0) -> int:
    seed = start
    while ranker.split_for_group("synthetic.v1", seed) != name:
        seed += 1
    return seed


def _sample_row(seed: int, label: int, repetition: int) -> dict:
    features = [
        -1.0 + label / 4.0,
        1.0 if label % 2 else -1.0,
        repetition / 10.0,
        (label + 1) / 9.0,
    ]
    candidates = []
    for index in range(ranker.CANDIDATE_COUNT):
        available = index != 8
        candidates.append({
            "id": index,
            "name": f"maneuver-{index}",
            "available": available,
            "finiteScore": available,
            "relativeAdvantage": (
                -abs(index - label) * 0.1 if available else None
            ),
            "selected": index == label,
        })
    return {
        "schema": ranker.DATASET_SCHEMA,
        "type": "sample",
        "seed": seed,
        "boundaryWeight": 2.0 if repetition == 0 else 1.0,
        "safety": {
            "nearBoundary": repetition == 0,
            "teacherEligible": True,
        },
        "features": {
            "schema": FEATURE_SCHEMA,
            "names": ["position", "parity", "phase", "candidateHint"],
            "values": features,
        },
        "candidates": candidates,
    }


def _write_synthetic(path: Path) -> None:
    rows = [{
        "schema": ranker.DATASET_SCHEMA,
        "type": "schema",
        "scenarioSchema": "synthetic.v1",
        "splitSalt": ranker.SPLIT_SALT,
        "featureSchema": FEATURE_SCHEMA,
        "normalizationSchema": NORMALIZATION_SCHEMA,
        "candidateSchema": CANDIDATE_SCHEMA,
        "scoreSchema": SCORE_SCHEMA,
        "behaviorAirframeSchema": BEHAVIOR_AIRFRAME_SCHEMA,
        "behaviorProfileSchema": BEHAVIOR_PROFILE_SCHEMA,
        "atmosphereSchema": ATMOSPHERE_SCHEMA,
        "behaviorPolicyId": BEHAVIOR_POLICY_ID,
        "teacherExecution": "synchronous-full",
        "flatTerrain": True,
        "calmWind": True,
        "formationMode": "independent",
        "doctrineIndex": 0,
        "featureCount": 4,
        "candidateCount": ranker.CANDIDATE_COUNT,
        "featureNames": ["position", "parity", "phase", "candidateHint"],
        "candidateNames": [f"maneuver-{i}" for i in range(9)],
    }]
    starts = {"train": 0, "validation": 10_000, "test": 20_000}
    for split_name in ("train", "validation", "test"):
        for group_offset in range(3):
            seed = _seed_for_split(split_name, starts[split_name] + group_offset)
            for repetition in range(4):
                label = (group_offset + repetition) % 8
                rows.append(_sample_row(seed, label, repetition))
    rows.append({
        "schema": ranker.DATASET_SCHEMA,
        "type": "episode",
        "seed": 12,
    })
    rows.append({
        **_sample_row(_seed_for_split("train", 99_000), 1, 0),
        "safety": {"teacherEligible": False},
    })
    path.write_text(
        "".join(
            json.dumps(row, separators=(",", ":"), sort_keys=True) + "\n"
            for row in rows
        ),
        encoding="utf-8",
    )


class PlannerRankerTests(unittest.TestCase):
    def test_group_split_is_stable_and_keeps_a_seed_together(self) -> None:
        seed = _seed_for_split("validation")
        assignments = {
            ranker.split_for_group("synthetic.v1", seed) for _ in range(20)
        }
        self.assertEqual(assignments, {"validation"})
        rows = [
            ranker.Sample(
                scenario_schema="synthetic.v1",
                seed=seed,
                features=np.zeros(2),
                available=np.ones(9, dtype=np.bool_),
                relative_advantage=np.zeros(9),
                label=0,
                margin=0.0,
                boundary=False,
                boundary_weight=1.0,
                stable_key=str(index),
            )
            for index in range(5)
        ]
        splits = ranker.split_dataset(rows)
        self.assertEqual(len(splits["validation"]), 5)
        self.assertFalse(splits["train"])
        self.assertFalse(splits["test"])

    def test_unavailable_candidate_is_masked_from_metrics(self) -> None:
        sample = ranker.Sample(
            scenario_schema="synthetic.v1",
            seed=1,
            features=np.asarray([0.25, -0.5]),
            available=np.asarray(
                [True, True, False, False, False, False, False, False, False]
            ),
            relative_advantage=np.asarray(
                [0.0, -0.4, -np.inf, -np.inf, -np.inf, -np.inf, -np.inf,
                 -np.inf, -np.inf]
            ),
            label=0,
            margin=0.4,
            boundary=False,
            boundary_weight=1.0,
            stable_key="sample",
        )

        def logits(_: np.ndarray) -> np.ndarray:
            values = np.zeros((1, 9), dtype=np.float64)
            values[0, 2] = 1_000_000.0
            values[0, 0] = 1.0
            return values

        metrics = ranker.evaluate([sample], logits)
        self.assertEqual(metrics["top1Accuracy"], 1.0)
        self.assertEqual(metrics["meanPositiveRelativeRegret"], 0.0)

    def test_margin_threshold_keeps_ties_together_and_fails_exact(self) -> None:
        margins = [10, 10, 5, 1]

        self.assertEqual(
            ranker.select_integer_margin_threshold(margins, 0.25),
            11,
        )
        self.assertEqual(
            ranker.select_integer_margin_threshold(margins, 0.50),
            10,
        )
        self.assertEqual(
            ranker.select_integer_margin_threshold(margins, 0.75),
            5,
        )
        self.assertEqual(
            ranker.select_integer_margin_threshold(margins, 1.0),
            1,
        )

    def test_loader_filters_ineligible_rows_and_preserves_fixed_masks(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            path = Path(scratch) / "dataset.jsonl"
            _write_synthetic(path)
            dataset = ranker.load_dataset(path)
            source_sha256 = hashlib.sha256(path.read_bytes()).hexdigest()
        self.assertEqual(len(dataset.samples), 36)
        self.assertEqual(dataset.feature_schema, FEATURE_SCHEMA)
        self.assertEqual(dataset.normalization_schema, NORMALIZATION_SCHEMA)
        self.assertEqual(dataset.candidate_schema, CANDIDATE_SCHEMA)
        self.assertEqual(dataset.score_schema, SCORE_SCHEMA)
        self.assertEqual(
            dataset.behavior_airframe_schema, BEHAVIOR_AIRFRAME_SCHEMA
        )
        self.assertEqual(
            dataset.behavior_profile_schema, BEHAVIOR_PROFILE_SCHEMA
        )
        self.assertEqual(dataset.atmosphere_schema, ATMOSPHERE_SCHEMA)
        self.assertEqual(dataset.behavior_policy_id, BEHAVIOR_POLICY_ID)
        self.assertEqual(dataset.teacher_execution, "synchronous-full")
        self.assertTrue(dataset.flat_terrain)
        self.assertTrue(dataset.calm_wind)
        self.assertEqual(dataset.formation_mode, "independent")
        self.assertEqual(dataset.doctrine_index, 0)
        self.assertEqual(dataset.source_sha256, source_sha256)
        self.assertEqual(dataset.counts["sampleRows"], 37)
        self.assertEqual(dataset.counts["rejected.teacherIneligible"], 1)
        self.assertTrue(all(sample.available.shape == (9,) for sample in dataset.samples))
        self.assertTrue(all(not sample.available[8] for sample in dataset.samples))

    def test_training_and_integer_export_are_byte_deterministic(self) -> None:
        with tempfile.TemporaryDirectory() as scratch:
            root = Path(scratch)
            dataset_path = root / "dataset.jsonl"
            first_path = root / "first.json"
            second_path = root / "second.json"
            _write_synthetic(dataset_path)

            def arguments(output: Path) -> argparse.Namespace:
                return argparse.Namespace(
                    input=dataset_path,
                    output=output,
                    metrics=None,
                    seed=4242,
                    hidden_size=ranker.HIDDEN_UNIT_COUNT,
                    batch_size=8,
                    linear_epochs=12,
                    mlp_epochs=18,
                    linear_learning_rate=0.025,
                    mlp_learning_rate=0.006,
                )

            first = ranker.train(arguments(first_path))
            second = ranker.train(arguments(second_path))
            self.assertEqual(first_path.read_bytes(), second_path.read_bytes())
            self.assertEqual(first, second)
            manifest = json.loads(first_path.read_text(encoding="utf-8"))
            self.assertEqual(manifest["schema"], ranker.MODEL_SCHEMA)
            self.assertEqual(manifest["trainerSchema"], ranker.TRAINER_SCHEMA)
            self.assertEqual(
                manifest["sourceDatasetSha256"],
                hashlib.sha256(dataset_path.read_bytes()).hexdigest(),
            )
            self.assertEqual(
                manifest["sourceContracts"],
                {
                    "atmosphereSchema": ATMOSPHERE_SCHEMA,
                    "behaviorAirframeSchema": BEHAVIOR_AIRFRAME_SCHEMA,
                    "behaviorPolicyId": BEHAVIOR_POLICY_ID,
                    "behaviorProfileSchema": BEHAVIOR_PROFILE_SCHEMA,
                    "calmWind": True,
                    "candidateNames": [f"maneuver-{i}" for i in range(9)],
                    "candidateSchema": CANDIDATE_SCHEMA,
                    "datasetSchema": ranker.DATASET_SCHEMA,
                    "doctrineIndex": 0,
                    "flatTerrain": True,
                    "formationMode": "independent",
                    "featureNames": [
                        "position", "parity", "phase", "candidateHint"
                    ],
                    "featureSchema": FEATURE_SCHEMA,
                    "normalizationSchema": NORMALIZATION_SCHEMA,
                    "scoreSchema": SCORE_SCHEMA,
                    "teacherExecution": "synchronous-full",
                },
            )
            model = manifest["model"]
            payload_hash = model.pop("payloadSha256")
            self.assertEqual(model["payloadHashAlgorithm"], "sha256")
            self.assertEqual(
                payload_hash,
                hashlib.sha256(
                    ranker._canonical_json(model).encode("utf-8")
                ).hexdigest(),
            )
            self.assertEqual(
                model["quantization"]["input"]["dtype"], "int16"
            )
            self.assertEqual(
                model["quantization"]["inputToHiddenWeights"]["dtype"], "int8"
            )
            self.assertEqual(
                model["quantization"]["hiddenToOutputWeights"]["dtype"], "int8"
            )
            self.assertTrue(model["availabilityMaskRequired"])
            self.assertEqual(
                model["hiddenUnitCount"], ranker.HIDDEN_UNIT_COUNT
            )
            self.assertEqual(
                len(model["inputToHiddenWeights"]),
                ranker.HIDDEN_UNIT_COUNT * model["inputCount"],
            )
            self.assertEqual(
                len(model["hiddenToOutputWeights"]),
                ranker.CANDIDATE_COUNT * ranker.HIDDEN_UNIT_COUNT,
            )
            self.assertGreater(
                model["quantization"]["input"]["scale"], 0.0
            )
            self.assertGreater(
                model["quantization"]["hiddenRealScale"], 0.0
            )
            self.assertGreater(
                model["quantization"]["output"]["scale"], 0.0
            )
            split_counts = manifest["training"]["groupSplit"]["splitCounts"]
            self.assertTrue(all(split_counts[name]["groups"] > 0 for name in (
                "train", "validation", "test"
            )))
            calibration = manifest["routingCalibration"]
            self.assertEqual(
                calibration["schema"],
                ranker.ROUTING_CALIBRATION_SCHEMA,
            )
            self.assertEqual(calibration["status"], "calibrated")
            self.assertEqual(
                calibration["thresholdSource"],
                "validation-only",
            )
            self.assertEqual(
                [point["targetCoverage"] for point in calibration[
                    "operatingPoints"
                ]],
                list(ranker.DEFAULT_ROUTING_COVERAGES),
            )
            for point in calibration["operatingPoints"]:
                self.assertLessEqual(
                    point["validation"]["coverage"],
                    point["targetCoverage"],
                )
                self.assertGreaterEqual(point["minimumIntegerMargin"], 0)


if __name__ == "__main__":
    unittest.main()
