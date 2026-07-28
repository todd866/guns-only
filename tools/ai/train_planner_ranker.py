#!/usr/bin/env python3
"""Train a tiny deterministic ranker from planner-distillation JSONL.

The teacher remains the authoritative planner.  This tool learns its selected
candidate with masked listwise classification, evaluates on whole-seed splits,
and exports a small integer inference manifest suitable for a shadow ranker.
"""

from __future__ import annotations

import argparse
from collections import Counter
from dataclasses import dataclass
import hashlib
import json
import math
from pathlib import Path
import sys
from typing import Any, Callable, Iterable, Mapping, Sequence

import numpy as np


DATASET_SCHEMA = "guns-only.planner-distillation.v1"
MODEL_SCHEMA = "guns-only.planner-ranker.int8.v1"
TRAINER_SCHEMA = "guns-only.planner-ranker-trainer.v2"
ROUTING_CALIBRATION_SCHEMA = "guns-only.planner-routing-calibration.v1"
SPLIT_SALT = DATASET_SCHEMA
CANDIDATE_COUNT = 9
HIDDEN_UNIT_COUNT = 16
MAXIMUM_BIAS_MAGNITUDE = 1_000_000_000
MAXIMUM_SCALE_SHIFT = 30
DEFAULT_SEED = 20260728
DEFAULT_ROUTING_COVERAGES = (0.25, 0.50, 0.75, 0.90, 1.0)


@dataclass(frozen=True)
class Sample:
    scenario_schema: str
    seed: int | str
    features: np.ndarray
    available: np.ndarray
    relative_advantage: np.ndarray
    label: int
    margin: float
    boundary: bool
    boundary_weight: float
    stable_key: str

    @property
    def group(self) -> tuple[str, int | str]:
        return (self.scenario_schema, self.seed)


@dataclass(frozen=True)
class Dataset:
    samples: tuple[Sample, ...]
    behavior_airframe_schema: str
    behavior_profile_schema: str
    atmosphere_schema: str
    behavior_policy_id: str
    teacher_execution: str
    flat_terrain: bool
    calm_wind: bool
    formation_mode: str
    doctrine_index: int
    feature_schema: str
    normalization_schema: str
    candidate_schema: str
    score_schema: str
    feature_names: tuple[str, ...]
    candidate_names: tuple[str, ...]
    counts: Mapping[str, int]
    source_sha256: str


@dataclass(frozen=True)
class LinearModel:
    weights: np.ndarray
    biases: np.ndarray

    def logits(self, features: np.ndarray) -> np.ndarray:
        return features @ self.weights + self.biases


@dataclass(frozen=True)
class MlpModel:
    input_weights: np.ndarray
    hidden_biases: np.ndarray
    output_weights: np.ndarray
    output_biases: np.ndarray

    def hidden(self, features: np.ndarray) -> np.ndarray:
        return np.maximum(
            features @ self.input_weights + self.hidden_biases,
            0.0,
        )

    def logits(self, features: np.ndarray) -> np.ndarray:
        return self.hidden(features) @ self.output_weights + self.output_biases


@dataclass(frozen=True)
class QuantizedMlp:
    input_scale: float
    input_weights: np.ndarray
    input_weight_scale: float
    hidden_biases: np.ndarray
    hidden_scale_shift: int
    output_weights: np.ndarray
    output_weight_scale: float
    output_biases: np.ndarray
    output_scale_shift: int

    @property
    def hidden_scale(self) -> float:
        return (
            self.input_scale
            * self.input_weight_scale
            * (2**self.hidden_scale_shift)
        )

    @property
    def output_scale(self) -> float:
        return (
            self.hidden_scale
            * self.output_weight_scale
            * (2**self.output_scale_shift)
        )

    def integer_logits(self, features: np.ndarray) -> np.ndarray:
        input_values = _quantize(
            features / self.input_scale, -32768, 32767
        ).astype(np.int64)
        first_accumulator = (
            input_values @ self.input_weights.astype(np.int64).T
            + self.hidden_biases.astype(np.int64)
        )
        hidden_values = (
            np.maximum(first_accumulator, 0) >> self.hidden_scale_shift
        )
        output_accumulator = (
            hidden_values @ self.output_weights.astype(np.int64).T
            + self.output_biases.astype(np.int64)
        )
        return output_accumulator >> self.output_scale_shift

    def logits(self, features: np.ndarray) -> np.ndarray:
        """Return dequantized logits for calibrated loss and unchanged ranking."""
        return self.integer_logits(features).astype(np.float64) * self.output_scale


def _canonical_json(value: Any) -> str:
    return json.dumps(
        value,
        allow_nan=False,
        ensure_ascii=False,
        separators=(",", ":"),
        sort_keys=True,
    )


def split_for_group(
    scenario_schema: str,
    seed: int | str,
    salt: str = SPLIT_SALT,
) -> str:
    """Return the stable 80/10/10 assignment for one scenario/seed group."""
    identity = _canonical_json([salt, scenario_schema, seed]).encode("utf-8")
    bucket = int.from_bytes(hashlib.sha256(identity).digest()[:8], "big") % 100
    if bucket < 80:
        return "train"
    if bucket < 90:
        return "validation"
    return "test"


def _optional_names(row: Mapping[str, Any], key: str) -> list[str] | None:
    value = row.get(key)
    if isinstance(value, list) and all(isinstance(item, str) for item in value):
        return list(value)
    if key == "featureNames":
        features = row.get("features")
        if isinstance(features, Mapping):
            value = features.get("names")
            if isinstance(value, list) and all(
                isinstance(item, str) for item in value
            ):
                return list(value)
    return None


def _is_finite_number(value: Any) -> bool:
    return (
        isinstance(value, (int, float))
        and not isinstance(value, bool)
        and math.isfinite(float(value))
    )


def _boundary_flag(row: Mapping[str, Any]) -> bool:
    safety = row.get("safety")
    features = row.get("features")
    sources: Iterable[Mapping[str, Any]] = (
        item for item in (safety, features) if isinstance(item, Mapping)
    )
    keys = (
        "nearBoundary",
        "boundary",
        "outOfDistribution",
        "ood",
    )
    return any(source.get(key) is True for source in sources for key in keys)


def _parse_sample(
    row: Mapping[str, Any],
    expected_feature_count: int | None,
    default_scenario_schema: str | None,
    expected_feature_schema: str | None,
    expected_feature_names: Sequence[str] | None,
    expected_candidate_names: Sequence[str] | None,
) -> tuple[Sample | None, str | None]:
    safety = row.get("safety")
    if not isinstance(safety, Mapping):
        return None, "missingSafety"
    if safety.get("teacherEligible") is not True:
        return None, "teacherIneligible"

    scenario_schema = row.get("scenarioSchema", default_scenario_schema)
    seed = row.get("seed")
    if not isinstance(scenario_schema, str) or not scenario_schema:
        return None, "missingScenarioSchema"
    if not (
        isinstance(seed, str)
        or (isinstance(seed, int) and not isinstance(seed, bool))
    ):
        return None, "missingSeed"

    feature_record = row.get("features")
    if (
        not isinstance(feature_record, Mapping)
        or feature_record.get("schema") != expected_feature_schema
    ):
        return None, "featureSchemaMismatch"
    sample_feature_names = feature_record.get("names")
    if (
        sample_feature_names is not None
        and (
            not isinstance(sample_feature_names, list)
            or list(sample_feature_names) != list(expected_feature_names or ())
        )
    ):
        return None, "featureNamesMismatch"
    values = (
        feature_record.get("values")
        if isinstance(feature_record, Mapping)
        else None
    )
    if not isinstance(values, list) or not values:
        return None, "missingFeatures"
    if not all(_is_finite_number(value) for value in values):
        return None, "nonFiniteFeatures"
    if any(abs(float(value)) > 1.0 + 1e-12 for value in values):
        return None, "outOfRangeFeatures"
    if expected_feature_count is not None and len(values) != expected_feature_count:
        return None, "featureLengthMismatch"

    candidates = row.get("candidates")
    if not isinstance(candidates, list) or len(candidates) != CANDIDATE_COUNT:
        return None, "candidateCountMismatch"
    available = np.zeros(CANDIDATE_COUNT, dtype=np.bool_)
    relative_advantage = np.full(CANDIDATE_COUNT, -np.inf, dtype=np.float64)
    selected: list[int] = []
    for index, candidate in enumerate(candidates):
        if not isinstance(candidate, Mapping):
            return None, "invalidCandidate"
        if (
            expected_candidate_names is None
            or candidate.get("id") != index
            or candidate.get("name") != expected_candidate_names[index]
        ):
            return None, "candidateIdentityMismatch"
        is_available = (
            candidate.get("available") is True
            and candidate.get("finiteScore") is True
        )
        available[index] = is_available
        if is_available:
            advantage = candidate.get("relativeAdvantage")
            if not _is_finite_number(advantage):
                return None, "nonFiniteAvailableScore"
            relative_advantage[index] = float(advantage)
        if candidate.get("selected") is True:
            selected.append(index)
    if len(selected) != 1:
        return None, "selectedCountMismatch"
    label = selected[0]
    if not available[label]:
        return None, "selectedUnavailable"

    other_scores = relative_advantage.copy()
    other_scores[label] = -np.inf
    runner_up = float(np.max(other_scores))
    margin = (
        math.inf
        if not math.isfinite(runner_up)
        else float(relative_advantage[label] - runner_up)
    )
    stable_json = _canonical_json(row)
    stable_key = hashlib.sha256(stable_json.encode("utf-8")).hexdigest()
    boundary_weight_value = row.get("boundaryWeight", 1.0)
    boundary_weight = (
        float(boundary_weight_value)
        if _is_finite_number(boundary_weight_value)
        and float(boundary_weight_value) >= 1.0
        else 1.0
    )
    return Sample(
        scenario_schema=scenario_schema,
        seed=seed,
        features=np.asarray(values, dtype=np.float64),
        available=available,
        relative_advantage=relative_advantage,
        label=label,
        margin=margin,
        boundary=_boundary_flag(row) or boundary_weight > 1.0,
        boundary_weight=boundary_weight,
        stable_key=stable_key,
    ), None


def _required_header_string(
    row: Mapping[str, Any],
    key: str,
    path: Path,
    line_number: int,
) -> str:
    value = row.get(key)
    if not isinstance(value, str) or not value:
        raise ValueError(
            f"{path}:{line_number}: schema header requires non-empty {key}"
        )
    return value


def load_dataset(path: Path) -> Dataset:
    counters: Counter[str] = Counter()
    samples: list[Sample] = []
    feature_names: list[str] | None = None
    candidate_names: list[str] | None = None
    scenario_schema: str | None = None
    feature_schema: str | None = None
    normalization_schema: str | None = None
    candidate_schema: str | None = None
    score_schema: str | None = None
    behavior_airframe_schema: str | None = None
    behavior_profile_schema: str | None = None
    atmosphere_schema: str | None = None
    behavior_policy_id: str | None = None
    teacher_execution: str | None = None
    flat_terrain: bool | None = None
    calm_wind: bool | None = None
    formation_mode: str | None = None
    doctrine_index: int | None = None
    expected_feature_count: int | None = None
    header_seen = False
    source_hash = hashlib.sha256()

    with path.open("rb") as source:
        for line_number, raw_line in enumerate(source, 1):
            source_hash.update(raw_line)
            try:
                line = raw_line.decode("utf-8")
            except UnicodeDecodeError as error:
                raise ValueError(
                    f"{path}:{line_number}: input is not UTF-8: {error}"
                ) from error
            if not line.strip():
                counters["blankRows"] += 1
                continue
            try:
                row = json.loads(line)
            except json.JSONDecodeError as error:
                raise ValueError(
                    f"{path}:{line_number}: invalid JSON: {error}"
                ) from error
            if not isinstance(row, Mapping):
                raise ValueError(f"{path}:{line_number}: row must be an object")
            declared_schema = row.get("schema")
            if (
                declared_schema is not None
                and declared_schema != DATASET_SCHEMA
            ):
                raise ValueError(
                    f"{path}:{line_number}: unsupported schema "
                    f"{declared_schema!r}"
                )
            if row.get("type") == "schema":
                if header_seen:
                    raise ValueError(
                        f"{path}:{line_number}: duplicate schema header"
                    )
                if declared_schema != DATASET_SCHEMA:
                    raise ValueError(
                        f"{path}:{line_number}: schema header must declare "
                        f"{DATASET_SCHEMA!r}"
                    )
                header_seen = True
                scenario_schema = _required_header_string(
                    row, "scenarioSchema", path, line_number
                )
                feature_schema = _required_header_string(
                    row, "featureSchema", path, line_number
                )
                normalization_schema = _required_header_string(
                    row, "normalizationSchema", path, line_number
                )
                candidate_schema = _required_header_string(
                    row, "candidateSchema", path, line_number
                )
                score_schema = _required_header_string(
                    row, "scoreSchema", path, line_number
                )
                behavior_airframe_schema = _required_header_string(
                    row, "behaviorAirframeSchema", path, line_number
                )
                behavior_profile_schema = _required_header_string(
                    row, "behaviorProfileSchema", path, line_number
                )
                atmosphere_schema = _required_header_string(
                    row, "atmosphereSchema", path, line_number
                )
                behavior_policy_id = _required_header_string(
                    row, "behaviorPolicyId", path, line_number
                )
                teacher_execution = _required_header_string(
                    row, "teacherExecution", path, line_number
                )
                formation_mode = _required_header_string(
                    row, "formationMode", path, line_number
                )
                flat_terrain = row.get("flatTerrain")
                calm_wind = row.get("calmWind")
                doctrine_index = row.get("doctrineIndex")
                if not isinstance(flat_terrain, bool):
                    raise ValueError(
                        f"{path}:{line_number}: flatTerrain must be boolean"
                    )
                if not isinstance(calm_wind, bool):
                    raise ValueError(
                        f"{path}:{line_number}: calmWind must be boolean"
                    )
                if (
                    not isinstance(doctrine_index, int)
                    or isinstance(doctrine_index, bool)
                    or doctrine_index < 0
                ):
                    raise ValueError(
                        f"{path}:{line_number}: doctrineIndex must be "
                        "a non-negative integer"
                    )
                if row.get("splitSalt") != SPLIT_SALT:
                    raise ValueError(
                        f"{path}:{line_number}: unsupported split salt "
                        f"{row.get('splitSalt')!r}"
                    )
                feature_names = _optional_names(row, "featureNames")
                candidate_names = _optional_names(row, "candidateNames")
                expected_feature_count = row.get("featureCount")
                candidate_count = row.get("candidateCount")
                if (
                    not isinstance(expected_feature_count, int)
                    or isinstance(expected_feature_count, bool)
                    or expected_feature_count <= 0
                ):
                    raise ValueError(
                        f"{path}:{line_number}: invalid featureCount"
                    )
                if candidate_count != CANDIDATE_COUNT:
                    raise ValueError(
                        f"{path}:{line_number}: expected candidateCount "
                        f"{CANDIDATE_COUNT}"
                    )
                if (
                    feature_names is None
                    or len(feature_names) != expected_feature_count
                    or any(not name for name in feature_names)
                    or len(set(feature_names)) != len(feature_names)
                ):
                    raise ValueError(
                        f"{path}:{line_number}: invalid featureNames"
                    )
                if (
                    candidate_names is None
                    or len(candidate_names) != CANDIDATE_COUNT
                    or any(not name for name in candidate_names)
                    or len(set(candidate_names)) != len(candidate_names)
                ):
                    raise ValueError(
                        f"{path}:{line_number}: invalid candidateNames"
                    )
                counters["ignoredMetadataRows"] += 1
                continue

            row_scenario_schema = row.get("scenarioSchema")
            if isinstance(row_scenario_schema, str):
                if (
                    scenario_schema is not None
                    and scenario_schema != row_scenario_schema
                ):
                    raise ValueError(
                        f"{path}:{line_number}: scenario schema changed "
                        "within dataset"
                    )
                scenario_schema = row_scenario_schema
            row_split_salt = row.get("splitSalt")
            if row_split_salt is not None and row_split_salt != SPLIT_SALT:
                raise ValueError(
                    f"{path}:{line_number}: unsupported split salt "
                    f"{row_split_salt!r}"
                )

            if not isinstance(row.get("features"), Mapping) or not isinstance(
                row.get("candidates"), list
            ):
                counters["ignoredMetadataRows"] += 1
                continue
            if not header_seen:
                raise ValueError(
                    f"{path}:{line_number}: sample precedes schema header"
                )
            counters["sampleRows"] += 1
            sample, rejection = _parse_sample(
                row,
                expected_feature_count,
                scenario_schema,
                feature_schema,
                feature_names,
                candidate_names,
            )
            if sample is None:
                counters[f"rejected.{rejection}"] += 1
                continue
            if expected_feature_count is None:
                expected_feature_count = int(sample.features.size)
            samples.append(sample)
            counters["eligibleSamples"] += 1

    if not header_seen:
        raise ValueError(f"{path}: missing schema header")
    if not samples:
        raise ValueError(f"{path}: no teacher-eligible samples")
    samples.sort(
        key=lambda sample: (
            sample.scenario_schema,
            _canonical_json(sample.seed),
            sample.stable_key,
        )
    )
    feature_count = int(samples[0].features.size)
    if feature_names is None or len(feature_names) != feature_count:
        raise ValueError(
            f"{path}: invalid feature names for "
            f"{feature_count} values"
        )
    if candidate_names is None or len(candidate_names) != CANDIDATE_COUNT:
        raise ValueError(
            f"{path}: invalid candidate names"
        )
    assert feature_schema is not None
    assert normalization_schema is not None
    assert candidate_schema is not None
    assert score_schema is not None
    assert behavior_airframe_schema is not None
    assert behavior_profile_schema is not None
    assert atmosphere_schema is not None
    assert behavior_policy_id is not None
    assert teacher_execution is not None
    assert flat_terrain is not None
    assert calm_wind is not None
    assert formation_mode is not None
    assert doctrine_index is not None
    return Dataset(
        samples=tuple(samples),
        behavior_airframe_schema=behavior_airframe_schema,
        behavior_profile_schema=behavior_profile_schema,
        atmosphere_schema=atmosphere_schema,
        behavior_policy_id=behavior_policy_id,
        teacher_execution=teacher_execution,
        flat_terrain=flat_terrain,
        calm_wind=calm_wind,
        formation_mode=formation_mode,
        doctrine_index=doctrine_index,
        feature_schema=feature_schema,
        normalization_schema=normalization_schema,
        candidate_schema=candidate_schema,
        score_schema=score_schema,
        feature_names=tuple(feature_names),
        candidate_names=tuple(candidate_names),
        counts=dict(sorted(counters.items())),
        source_sha256=source_hash.hexdigest(),
    )


def split_dataset(
    samples: Sequence[Sample],
) -> dict[str, tuple[Sample, ...]]:
    splits: dict[str, list[Sample]] = {
        "train": [],
        "validation": [],
        "test": [],
    }
    group_assignments: dict[tuple[str, int | str], str] = {}
    for sample in samples:
        assignment = split_for_group(*sample.group)
        previous = group_assignments.setdefault(sample.group, assignment)
        if previous != assignment:
            raise AssertionError("one group received multiple split assignments")
        splits[assignment].append(sample)
    return {name: tuple(rows) for name, rows in splits.items()}


def _arrays(
    samples: Sequence[Sample],
) -> tuple[np.ndarray, np.ndarray, np.ndarray]:
    if not samples:
        return (
            np.empty((0, 0), dtype=np.float64),
            np.empty((0, CANDIDATE_COUNT), dtype=np.bool_),
            np.empty(0, dtype=np.int64),
        )
    return (
        np.stack([sample.features for sample in samples]),
        np.stack([sample.available for sample in samples]),
        np.asarray([sample.label for sample in samples], dtype=np.int64),
    )


def importance_probabilities(
    samples: Sequence[Sample],
) -> tuple[np.ndarray, float]:
    positive_margins = np.asarray(
        [
            sample.margin
            for sample in samples
            if math.isfinite(sample.margin) and sample.margin > 1e-12
        ],
        dtype=np.float64,
    )
    margin_scale = (
        float(np.median(positive_margins))
        if positive_margins.size
        else 0.1
    )
    margin_scale = max(margin_scale, 1e-6)
    weights = np.asarray(
        [
            (
                1.0
                if not math.isfinite(sample.margin)
                else 1.0 + 2.0 / (1.0 + max(sample.margin, 0.0) / margin_scale)
            )
            * sample.boundary_weight
            for sample in samples
        ],
        dtype=np.float64,
    )
    return weights / float(np.sum(weights)), margin_scale


def _masked_softmax(
    logits: np.ndarray,
    availability: np.ndarray,
) -> np.ndarray:
    masked = np.where(availability, logits, -np.inf)
    maximum = np.max(masked, axis=1, keepdims=True)
    exponentials = np.where(availability, np.exp(masked - maximum), 0.0)
    return exponentials / np.sum(exponentials, axis=1, keepdims=True)


class _Adam:
    def __init__(self, parameters: Sequence[np.ndarray]) -> None:
        self.step = 0
        self.first = [np.zeros_like(value) for value in parameters]
        self.second = [np.zeros_like(value) for value in parameters]

    def update(
        self,
        parameters: Sequence[np.ndarray],
        gradients: Sequence[np.ndarray],
        learning_rate: float,
    ) -> None:
        self.step += 1
        for index, (parameter, gradient) in enumerate(
            zip(parameters, gradients, strict=True)
        ):
            self.first[index] = (
                0.9 * self.first[index] + 0.1 * gradient
            )
            self.second[index] = (
                0.999 * self.second[index] + 0.001 * gradient * gradient
            )
            corrected_first = self.first[index] / (1.0 - 0.9**self.step)
            corrected_second = self.second[index] / (1.0 - 0.999**self.step)
            parameter -= (
                learning_rate
                * corrected_first
                / (np.sqrt(corrected_second) + 1e-8)
            )


def _draw_batches(
    rng: np.random.Generator,
    probabilities: np.ndarray,
    batch_size: int,
) -> Iterable[np.ndarray]:
    indices = rng.choice(
        probabilities.size,
        size=probabilities.size,
        replace=True,
        p=probabilities,
    )
    for start in range(0, indices.size, batch_size):
        yield indices[start : start + batch_size]


def train_linear(
    samples: Sequence[Sample],
    epochs: int,
    batch_size: int,
    learning_rate: float,
    seed: int,
    l2: float = 1e-5,
) -> LinearModel:
    features, availability, labels = _arrays(samples)
    if features.shape[0] == 0:
        raise ValueError("the training split is empty")
    probabilities, _ = importance_probabilities(samples)
    weights = np.zeros(
        (features.shape[1], CANDIDATE_COUNT), dtype=np.float64
    )
    biases = np.zeros(CANDIDATE_COUNT, dtype=np.float64)
    optimizer = _Adam((weights, biases))
    rng = np.random.default_rng(seed)
    for _ in range(epochs):
        for indices in _draw_batches(rng, probabilities, batch_size):
            batch_features = features[indices]
            batch_labels = labels[indices]
            probabilities_batch = _masked_softmax(
                batch_features @ weights + biases,
                availability[indices],
            )
            probabilities_batch[
                np.arange(indices.size), batch_labels
            ] -= 1.0
            probabilities_batch /= indices.size
            optimizer.update(
                (weights, biases),
                (
                    batch_features.T @ probabilities_batch + l2 * weights,
                    np.sum(probabilities_batch, axis=0),
                ),
                learning_rate,
            )
    return LinearModel(weights.copy(), biases.copy())


def train_mlp(
    samples: Sequence[Sample],
    hidden_size: int,
    epochs: int,
    batch_size: int,
    learning_rate: float,
    seed: int,
    l2: float = 1e-5,
) -> MlpModel:
    features, availability, labels = _arrays(samples)
    if features.shape[0] == 0:
        raise ValueError("the training split is empty")
    probabilities, _ = importance_probabilities(samples)
    rng = np.random.default_rng(seed)
    input_limit = math.sqrt(6.0 / (features.shape[1] + hidden_size))
    output_limit = math.sqrt(6.0 / (hidden_size + CANDIDATE_COUNT))
    input_weights = rng.uniform(
        -input_limit, input_limit, (features.shape[1], hidden_size)
    )
    hidden_biases = np.zeros(hidden_size, dtype=np.float64)
    output_weights = rng.uniform(
        -output_limit, output_limit, (hidden_size, CANDIDATE_COUNT)
    )
    output_biases = np.zeros(CANDIDATE_COUNT, dtype=np.float64)
    parameters = (
        input_weights,
        hidden_biases,
        output_weights,
        output_biases,
    )
    optimizer = _Adam(parameters)
    for _ in range(epochs):
        for indices in _draw_batches(rng, probabilities, batch_size):
            batch_features = features[indices]
            batch_labels = labels[indices]
            hidden_pre = batch_features @ input_weights + hidden_biases
            hidden = np.maximum(hidden_pre, 0.0)
            output_gradient = _masked_softmax(
                hidden @ output_weights + output_biases,
                availability[indices],
            )
            output_gradient[
                np.arange(indices.size), batch_labels
            ] -= 1.0
            output_gradient /= indices.size
            hidden_gradient = (output_gradient @ output_weights.T) * (
                hidden_pre > 0.0
            )
            optimizer.update(
                parameters,
                (
                    batch_features.T @ hidden_gradient + l2 * input_weights,
                    np.sum(hidden_gradient, axis=0),
                    hidden.T @ output_gradient + l2 * output_weights,
                    np.sum(output_gradient, axis=0),
                ),
                learning_rate,
            )
    return MlpModel(
        input_weights.copy(),
        hidden_biases.copy(),
        output_weights.copy(),
        output_biases.copy(),
    )


def _margin_bucket(margin: float) -> str:
    if not math.isfinite(margin):
        return "singleCandidate"
    if margin <= 1e-9:
        return "tieOrNegative"
    if margin <= 0.02:
        return "zeroTo0.02"
    if margin <= 0.10:
        return "0.02To0.10"
    if margin <= 0.50:
        return "0.10To0.50"
    return "above0.50"


def evaluate(
    samples: Sequence[Sample],
    logits_function: Callable[[np.ndarray], np.ndarray],
) -> dict[str, Any]:
    if not samples:
        return {
            "count": 0,
            "coverage": 0.0,
            "crossEntropy": None,
            "meanPositiveRelativeRegret": None,
            "top1Accuracy": None,
            "top3Accuracy": None,
            "marginBuckets": {},
        }
    features, availability, labels = _arrays(samples)
    logits = np.asarray(logits_function(features))
    if logits.shape != availability.shape:
        raise ValueError(
            f"logits shape {logits.shape} does not match {availability.shape}"
        )
    probabilities = _masked_softmax(logits, availability)
    losses = -np.log(
        np.maximum(probabilities[np.arange(len(samples)), labels], 1e-300)
    )
    top1_hits: list[float] = []
    top3_hits: list[float] = []
    regrets: list[float] = []
    bucket_values: dict[str, list[tuple[float, float, float]]] = {}
    for index, sample in enumerate(samples):
        masked = np.where(sample.available, logits[index], -np.inf)
        order = np.argsort(-masked, kind="stable")
        order = order[sample.available[order]]
        predicted = int(order[0])
        top1 = float(predicted == sample.label)
        top3 = float(sample.label in order[:3])
        regret = max(
            0.0,
            float(
                sample.relative_advantage[sample.label]
                - sample.relative_advantage[predicted]
            ),
        )
        top1_hits.append(top1)
        top3_hits.append(top3)
        regrets.append(regret)
        bucket_values.setdefault(_margin_bucket(sample.margin), []).append(
            (top1, top3, regret)
        )

    def bucket_metrics(
        values: Sequence[tuple[float, float, float]],
    ) -> dict[str, Any]:
        return {
            "count": len(values),
            "meanPositiveRelativeRegret": float(
                np.mean([value[2] for value in values])
            ),
            "top1Accuracy": float(np.mean([value[0] for value in values])),
            "top3Accuracy": float(np.mean([value[1] for value in values])),
        }

    return {
        "count": len(samples),
        "coverage": 1.0,
        "crossEntropy": float(np.mean(losses)),
        "meanPositiveRelativeRegret": float(np.mean(regrets)),
        "top1Accuracy": float(np.mean(top1_hits)),
        "top3Accuracy": float(np.mean(top3_hits)),
        "marginBuckets": {
            name: bucket_metrics(values)
            for name, values in sorted(bucket_values.items())
        },
    }


def _confidence_outcomes(
    samples: Sequence[Sample],
    logits_function: Callable[[np.ndarray], np.ndarray],
) -> tuple[tuple[int, float, float, float], ...]:
    """Return runtime integer margin and quality for each eligible sample."""
    if not samples:
        return ()
    features, availability, _ = _arrays(samples)
    logits = np.asarray(logits_function(features))
    if logits.shape != availability.shape:
        raise ValueError(
            f"logits shape {logits.shape} does not match {availability.shape}"
        )
    if not np.issubdtype(logits.dtype, np.integer):
        raise ValueError("routing calibration requires raw integer logits")

    outcomes: list[tuple[int, float, float, float]] = []
    for index, sample in enumerate(samples):
        integer_logits = logits[index].astype(np.int64, copy=False)
        order = np.argsort(-integer_logits, kind="stable")
        order = order[sample.available[order]]
        predicted = int(order[0])
        margin = (
            int(integer_logits[order[0]]) - int(integer_logits[order[1]])
            if order.size > 1
            else 0
        )
        top1 = float(predicted == sample.label)
        top3 = float(sample.label in order[:3])
        regret = max(
            0.0,
            float(
                sample.relative_advantage[sample.label]
                - sample.relative_advantage[predicted]
            ),
        )
        outcomes.append((margin, top1, top3, regret))
    return tuple(outcomes)


def select_integer_margin_threshold(
    margins: Sequence[int],
    target_coverage: float,
) -> int:
    """Choose the largest attainable coverage that does not exceed the target.

    Margin ties are kept together. If the highest-margin tie alone exceeds the
    requested coverage, the threshold is placed above it and the resulting
    student coverage is zero. This deliberately fails toward more exact work.
    """
    if not margins:
        raise ValueError("at least one validation margin is required")
    if (
        not math.isfinite(target_coverage)
        or target_coverage <= 0.0
        or target_coverage > 1.0
    ):
        raise ValueError("target coverage must be in (0, 1]")

    ordered = sorted((int(value) for value in margins), reverse=True)
    best_threshold = ordered[0] + 1
    best_coverage = 0.0
    for threshold in sorted(set(ordered), reverse=True):
        coverage = sum(value >= threshold for value in ordered) / len(ordered)
        if coverage <= target_coverage and coverage >= best_coverage:
            best_threshold = threshold
            best_coverage = coverage
    return best_threshold


def _covered_metrics(
    outcomes: Sequence[tuple[int, float, float, float]],
    minimum_margin: int,
) -> dict[str, Any]:
    covered = [row for row in outcomes if row[0] >= minimum_margin]
    count = len(covered)
    total = len(outcomes)
    if count == 0:
        return {
            "count": 0,
            "coverage": 0.0,
            "exactFallbackFraction": 1.0 if total else 0.0,
            "meanPositiveRelativeRegret": None,
            "top1Accuracy": None,
            "top3Accuracy": None,
        }
    coverage = count / total
    return {
        "count": count,
        "coverage": coverage,
        "exactFallbackFraction": 1.0 - coverage,
        "meanPositiveRelativeRegret": float(
            np.mean([row[3] for row in covered])
        ),
        "top1Accuracy": float(np.mean([row[1] for row in covered])),
        "top3Accuracy": float(np.mean([row[2] for row in covered])),
    }


def calibrate_confidence_routing(
    validation_samples: Sequence[Sample],
    test_samples: Sequence[Sample],
    integer_logits_function: Callable[[np.ndarray], np.ndarray],
    target_coverages: Sequence[float] = DEFAULT_ROUTING_COVERAGES,
) -> dict[str, Any]:
    """Calibrate runtime confidence only on validation, then report test risk."""
    if not validation_samples:
        return {
            "schema": ROUTING_CALIBRATION_SCHEMA,
            "status": "unavailable",
            "reason": "validation-split-empty",
            "operatingPoints": [],
        }
    validation = _confidence_outcomes(
        validation_samples, integer_logits_function
    )
    test = _confidence_outcomes(test_samples, integer_logits_function)
    margins = [row[0] for row in validation]
    points: list[dict[str, Any]] = []
    for target in target_coverages:
        threshold = select_integer_margin_threshold(margins, float(target))
        points.append({
            "targetCoverage": float(target),
            "minimumIntegerMargin": threshold,
            "validation": _covered_metrics(validation, threshold),
            "test": _covered_metrics(test, threshold),
        })
    return {
        "schema": ROUTING_CALIBRATION_SCHEMA,
        "status": "calibrated",
        "confidence": "best-minus-runner-up-raw-int32-logit",
        "thresholdSource": "validation-only",
        "tiePolicy": "keep-equal-margins-together-conservative-coverage",
        "operatingPoints": points,
    }


def _quantize(
    values: np.ndarray,
    minimum: int,
    maximum: int,
) -> np.ndarray:
    return np.clip(np.rint(values), minimum, maximum)


def _int32(values: np.ndarray, name: str) -> np.ndarray:
    rounded = np.rint(values)
    info = np.iinfo(np.int32)
    if np.any(rounded < info.min) or np.any(rounded > info.max):
        raise ValueError(f"{name} exceeds int32 accumulator range")
    return rounded.astype(np.int32)


def _hidden_shift(
    weights: np.ndarray,
    biases: np.ndarray,
) -> int:
    maxima: list[int] = []
    for hidden_index in range(weights.shape[0]):
        minimum = int(biases[hidden_index])
        maximum = int(biases[hidden_index])
        for weight in weights[hidden_index]:
            integer_weight = int(weight)
            if integer_weight >= 0:
                minimum += -32768 * integer_weight
                maximum += 32767 * integer_weight
            else:
                minimum += 32767 * integer_weight
                maximum += -32768 * integer_weight
        if minimum < np.iinfo(np.int32).min or maximum > np.iinfo(np.int32).max:
            raise ValueError("hidden accumulator exceeds int32 range")
        maxima.append(max(maximum, 0))
    for shift in range(MAXIMUM_SCALE_SHIFT + 1):
        if all((maximum >> shift) <= 32767 for maximum in maxima):
            return shift
    raise ValueError("hidden activations cannot be represented as int16")


def _validate_output_bounds(
    weights: np.ndarray,
    biases: np.ndarray,
    hidden_maxima: np.ndarray,
) -> None:
    for candidate_index in range(weights.shape[0]):
        minimum = int(biases[candidate_index])
        maximum = int(biases[candidate_index])
        for hidden_index, weight in enumerate(weights[candidate_index]):
            product = int(hidden_maxima[hidden_index]) * int(weight)
            if int(weight) >= 0:
                maximum += product
            else:
                minimum += product
        if minimum < np.iinfo(np.int32).min or maximum > np.iinfo(np.int32).max:
            raise ValueError("output accumulator exceeds int32 range")


def quantize_mlp(
    model: MlpModel,
    calibration_features: np.ndarray,
) -> QuantizedMlp:
    if model.hidden_biases.size != HIDDEN_UNIT_COUNT:
        raise ValueError(
            f"integer runtime requires exactly {HIDDEN_UNIT_COUNT} hidden units"
        )
    input_peak = max(float(np.max(np.abs(calibration_features))), 1.0)
    input_scale = input_peak / 32767.0

    input_output_major = model.input_weights.T
    input_weight_peak = max(float(np.max(np.abs(input_output_major))), 1e-12)
    input_weight_scale = input_weight_peak / 127.0
    input_weights = _quantize(
        input_output_major / input_weight_scale, -127, 127
    ).astype(np.int8)
    hidden_biases = _int32(
        model.hidden_biases / (input_scale * input_weight_scale),
        "hidden biases",
    )
    if np.any(np.abs(hidden_biases.astype(np.int64)) > MAXIMUM_BIAS_MAGNITUDE):
        raise ValueError("hidden biases exceed runtime model bound")
    hidden_scale_shift = _hidden_shift(input_weights, hidden_biases)
    hidden_scale = (
        input_scale * input_weight_scale * (2**hidden_scale_shift)
    )

    output_output_major = model.output_weights.T
    output_weight_peak = max(float(np.max(np.abs(output_output_major))), 1e-12)
    output_weight_scale = output_weight_peak / 127.0
    output_weights = _quantize(
        output_output_major / output_weight_scale, -127, 127
    ).astype(np.int8)
    output_biases = _int32(
        model.output_biases / (hidden_scale * output_weight_scale),
        "output biases",
    )
    if np.any(np.abs(output_biases.astype(np.int64)) > MAXIMUM_BIAS_MAGNITUDE):
        raise ValueError("output biases exceed runtime model bound")
    hidden_maxima = np.empty(HIDDEN_UNIT_COUNT, dtype=np.int64)
    for hidden_index in range(HIDDEN_UNIT_COUNT):
        maximum = int(hidden_biases[hidden_index])
        for weight in input_weights[hidden_index]:
            integer_weight = int(weight)
            maximum += (
                32767 * integer_weight
                if integer_weight >= 0
                else -32768 * integer_weight
            )
        hidden_maxima[hidden_index] = max(maximum, 0) >> hidden_scale_shift
    _validate_output_bounds(output_weights, output_biases, hidden_maxima)
    return QuantizedMlp(
        input_scale=input_scale,
        input_weights=input_weights,
        input_weight_scale=input_weight_scale,
        hidden_biases=hidden_biases,
        hidden_scale_shift=hidden_scale_shift,
        output_weights=output_weights,
        output_weight_scale=output_weight_scale,
        output_biases=output_biases,
        output_scale_shift=0,
    )


def _group_counts(
    splits: Mapping[str, Sequence[Sample]],
) -> dict[str, dict[str, int]]:
    return {
        name: {
            "groups": len({sample.group for sample in samples}),
            "samples": len(samples),
        }
        for name, samples in splits.items()
    }


def build_manifest(
    dataset: Dataset,
    splits: Mapping[str, Sequence[Sample]],
    linear: LinearModel,
    mlp: MlpModel,
    quantized: QuantizedMlp,
    arguments: argparse.Namespace,
    margin_scale: float,
) -> dict[str, Any]:
    train_features, _, _ = _arrays(splits["train"])
    metrics = {
        split_name: {
            "linear": evaluate(rows, linear.logits),
            "mlpFloat": evaluate(rows, mlp.logits),
            "mlpInt8": evaluate(rows, quantized.logits),
        }
        for split_name, rows in splits.items()
    }
    routing_calibration = calibrate_confidence_routing(
        splits["validation"],
        splits["test"],
        quantized.integer_logits,
    )
    input_count = int(train_features.shape[1])
    hidden_count = int(quantized.input_weights.shape[0])
    sample_rows = dataset.counts.get("sampleRows", 0)
    eligible_samples = dataset.counts.get("eligibleSamples", 0)
    manifest = {
        "schema": MODEL_SCHEMA,
        "trainerSchema": TRAINER_SCHEMA,
        "sourceDatasetSchema": DATASET_SCHEMA,
        "sourceDatasetSha256": dataset.source_sha256,
        "sourceContracts": {
            "atmosphereSchema": dataset.atmosphere_schema,
            "behaviorAirframeSchema": dataset.behavior_airframe_schema,
            "behaviorPolicyId": dataset.behavior_policy_id,
            "behaviorProfileSchema": dataset.behavior_profile_schema,
            "calmWind": dataset.calm_wind,
            "candidateNames": list(dataset.candidate_names),
            "candidateSchema": dataset.candidate_schema,
            "datasetSchema": DATASET_SCHEMA,
            "doctrineIndex": dataset.doctrine_index,
            "flatTerrain": dataset.flat_terrain,
            "formationMode": dataset.formation_mode,
            "featureNames": list(dataset.feature_names),
            "featureSchema": dataset.feature_schema,
            "normalizationSchema": dataset.normalization_schema,
            "scoreSchema": dataset.score_schema,
            "teacherExecution": dataset.teacher_execution,
        },
        "model": {
            "architecture": "dense-relu-dense",
            "availabilityMaskRequired": True,
            "candidateCount": CANDIDATE_COUNT,
            "candidateNames": list(dataset.candidate_names),
            "featureNames": list(dataset.feature_names),
            "hiddenBiases": quantized.hidden_biases.tolist(),
            "hiddenScaleShift": quantized.hidden_scale_shift,
            "hiddenToOutputWeights": (
                quantized.output_weights.reshape(-1).tolist()
            ),
            "hiddenUnitCount": hidden_count,
            "inputCount": input_count,
            "inputToHiddenWeights": (
                quantized.input_weights.reshape(-1).tolist()
            ),
            "outputBiases": quantized.output_biases.tolist(),
            "outputScaleShift": quantized.output_scale_shift,
            "quantization": {
                "hiddenRealScale": quantized.hidden_scale,
                "input": {
                    "clip": [-32768, 32767],
                    "dtype": "int16",
                    "rounding": "nearest-even",
                    "scale": quantized.input_scale,
                    "zeroPoint": 0,
                },
                "inputToHiddenWeights": {
                    "dtype": "int8",
                    "layout": "hidden-major",
                    "scale": quantized.input_weight_scale,
                    "zeroPoint": 0,
                },
                "output": {
                    "dtype": "int32",
                    "scale": quantized.output_scale,
                    "zeroPoint": 0,
                },
                "hiddenToOutputWeights": {
                    "dtype": "int8",
                    "layout": "candidate-major",
                    "scale": quantized.output_weight_scale,
                    "zeroPoint": 0,
                },
            },
            "runtimeContract": {
                "accumulator": "int32",
                "activation": "relu",
                "hiddenActivation": "int16",
                "input": "int16",
                "negativeRightShift": "arithmetic-floor",
                "outputRanking": "descending-int32",
                "tieBreak": "lowest-candidate-index",
                "weights": "int8",
            },
        },
        "training": {
            "batchSize": arguments.batch_size,
            "datasetCounts": dict(dataset.counts),
            "eligibleCoverage": (
                eligible_samples / sample_rows if sample_rows else 0.0
            ),
            "epochs": {
                "linear": arguments.linear_epochs,
                "mlp": arguments.mlp_epochs,
            },
            "groupSplit": {
                "algorithm": "sha256-first64-mod100",
                "salt": SPLIT_SALT,
                "splitCounts": _group_counts(splits),
                "thresholds": {
                    "test": [90, 100],
                    "train": [0, 80],
                    "validation": [80, 90],
                },
            },
            "importanceSampling": {
                "boundaryWeightSource": (
                    "sample.boundaryWeight (minimum 1.0); defaults to 1.0"
                ),
                "marginScale": margin_scale,
                "policy": (
                    "weight=(1+2/(1+max(margin,0)/marginScale))"
                    "*boundaryWeight; single-candidate margin factor=1"
                ),
            },
            "loss": "availability-masked-listwise-cross-entropy",
            "modelSelection": "one-hidden-layer-mlp",
            "seed": arguments.seed,
        },
        "routingCalibration": routing_calibration,
        "metrics": metrics,
    }
    model_payload = manifest["model"]
    model_payload["payloadHashAlgorithm"] = "sha256"
    model_payload["payloadHashScope"] = (
        "canonical-json-model-without-payloadSha256"
    )
    model_payload["payloadSha256"] = hashlib.sha256(
        _canonical_json(model_payload).encode("utf-8")
    ).hexdigest()
    return manifest


def train(arguments: argparse.Namespace) -> dict[str, Any]:
    dataset = load_dataset(arguments.input)
    splits = split_dataset(dataset.samples)
    if not splits["train"]:
        raise ValueError(
            "stable group split produced no training samples; add more "
            "scenario/seed groups"
        )
    linear = train_linear(
        splits["train"],
        epochs=arguments.linear_epochs,
        batch_size=arguments.batch_size,
        learning_rate=arguments.linear_learning_rate,
        seed=arguments.seed + 11,
    )
    mlp = train_mlp(
        splits["train"],
        hidden_size=arguments.hidden_size,
        epochs=arguments.mlp_epochs,
        batch_size=arguments.batch_size,
        learning_rate=arguments.mlp_learning_rate,
        seed=arguments.seed + 29,
    )
    train_features, _, _ = _arrays(splits["train"])
    quantized = quantize_mlp(mlp, train_features)
    _, margin_scale = importance_probabilities(splits["train"])
    manifest = build_manifest(
        dataset,
        splits,
        linear,
        mlp,
        quantized,
        arguments,
        margin_scale,
    )
    arguments.output.parent.mkdir(parents=True, exist_ok=True)
    arguments.output.write_text(
        _canonical_json(manifest) + "\n",
        encoding="utf-8",
    )
    if arguments.metrics is not None:
        arguments.metrics.parent.mkdir(parents=True, exist_ok=True)
        arguments.metrics.write_text(
            _canonical_json(
                {
                    "schema": "guns-only.planner-ranker.metrics.v1",
                    "metrics": manifest["metrics"],
                    "routingCalibration": manifest["routingCalibration"],
                    "training": manifest["training"],
                }
            )
            + "\n",
            encoding="utf-8",
        )
    return manifest


def parse_arguments(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("input", type=Path, help="planner-distillation JSONL")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--metrics", type=Path)
    parser.add_argument("--seed", type=int, default=DEFAULT_SEED)
    parser.add_argument("--hidden-size", type=int, default=HIDDEN_UNIT_COUNT)
    parser.add_argument("--batch-size", type=int, default=64)
    parser.add_argument("--linear-epochs", type=int, default=160)
    parser.add_argument("--mlp-epochs", type=int, default=240)
    parser.add_argument("--linear-learning-rate", type=float, default=0.025)
    parser.add_argument("--mlp-learning-rate", type=float, default=0.004)
    arguments = parser.parse_args(argv)
    for name in ("hidden_size", "batch_size", "linear_epochs", "mlp_epochs"):
        if getattr(arguments, name) <= 0:
            parser.error(f"--{name.replace('_', '-')} must be positive")
    if arguments.hidden_size != HIDDEN_UNIT_COUNT:
        parser.error(
            f"--hidden-size must be {HIDDEN_UNIT_COUNT} for the C# runtime"
        )
    return arguments


def main(argv: Sequence[str] | None = None) -> int:
    try:
        arguments = parse_arguments(argv)
        manifest = train(arguments)
    except (OSError, ValueError) as error:
        print(f"error: {error}", file=sys.stderr)
        return 2
    test_metrics = manifest["metrics"]["test"]["mlpInt8"]
    print(
        _canonical_json(
            {
                "model": str(arguments.output),
                "testCount": test_metrics["count"],
                "testMeanPositiveRelativeRegret": test_metrics[
                    "meanPositiveRelativeRegret"
                ],
                "testTop1Accuracy": test_metrics["top1Accuracy"],
                "testTop3Accuracy": test_metrics["top3Accuracy"],
            }
        )
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
