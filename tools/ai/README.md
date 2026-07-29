# Planner ranker distillation

`train_planner_ranker.py` trains a deterministic shadow ranker from
`guns-only.planner-distillation.v1` JSONL. It keeps every
`(scenarioSchema, seed)` group in one stable 80/10/10 split, learns only from
teacher-eligible samples, masks unavailable candidates, and reports unweighted
held-out top-1, top-3, and relative-regret metrics. Runtime confidence
thresholds are selected only from the validation split. Each reported
operating point keeps equal integer margins together and chooses no more than
its requested student coverage; held-out test quality is then reported at the
frozen threshold.

The exported model is a compact int16-input/int8-weight MLP manifest. It does
not replace the exact planner or its safety checks. The manifest pins the
trainer and feature/scoring schemas, the SHA-256 of the exact source JSONL
bytes, and a separately verifiable hash of its canonical model payload.

```sh
dotnet run --project tools/planner-teacher-export -- \
  --output planner-teacher.jsonl \
  --first-seed 4096 --episodes 64 --seconds 8 \
  --reference-skill veteran --behavior-skill ace

python3 tools/ai/train_planner_ranker.py planner-teacher.jsonl \
  --output planner-ranker.json \
  --metrics planner-ranker.metrics.json

dotnet run --project tools/planner-ranker-verify -- \
  planner-ranker.json planner-teacher.jsonl

python3 -m unittest tools/ai/test_train_planner_ranker.py
```

The first supported domain is deliberately narrow: the Su-27S Ace profile,
standard atmosphere, flat terrain, calm wind, independent formation role, and
doctrine zero. Those facts and every feature/candidate schema are pinned in
the artifact. `PlannerShadowEvaluator` rejects a mismatched domain, stale or
low-confidence contact, clipped feature, incomplete score table, or malformed
selection. It reports a candidate comparison only and cannot return or alter a
`PilotCommand`.

An illustrative 64-seed, 5,120-decision run reached 92.9% held-out top-1,
99.9% top-3, and 0.00222 mean normalized teacher regret after int8
quantization. This establishes feasibility for shadow evaluation; it is not a
runtime-control promotion result because the dataset covers only the domain
above.

A longer 128-seed, 15,360-decision stress run exposed why confidence routing
is mandatory: using the student for every held-out decision fell to 87.7%
top-1. A threshold chosen only from its validation split instead handled 46.9%
of test decisions at 99.6% top-1, 100% top-3, and 0.0000021 mean regret; the
remaining 53.1% are exact-planner fallbacks. The validation-calibrated 75%
point reached 71.9% held-out coverage at 97.4% top-1 and 0.00069 mean regret.
These are diagnostic results from the current narrow domain, not promotion
thresholds for another artifact.

The model manifest's `routingCalibration` block is advisory input to
`AdaptivePlannerRouting`, not permission to bypass the exact planner. It
reports, for 25%, 50%, 75%, 90%, and 100% target student coverage, the raw
integer best-versus-runner-up threshold, attained validation coverage, exact
fallback fraction, and held-out accuracy/regret. Margin ties fail toward more
exact work rather than silently exceeding the requested coverage.

The runtime shadow path is split into deliberately narrow pieces:

- `PlannerShadowEvaluator` produces top-1/top-3 agreement, integer confidence,
  and normalized exact-score regret without returning a command.
- `PlannerShadowTelemetry` keeps saturating lifetime counters and OOD/mask
  diagnostics.
- `AdaptivePlannerAuditWindow` retains a fixed-size recent exact-audit window.
- `AdaptivePlannerRouting` applies calibrated load tiers, hysteresis, and an
  exact-audit cadence; its uncalibrated default is fail-closed.
- `PlannerShadowRoutingCoordinator` combines those pieces for counterfactual
  shadow evaluation and uses only prior audit history for each route.

All hot-path pieces are covered by allocation tests. The coordinator still
runs after an exact trace in this phase, so a `StudentCandidate` result means
“would have been admissible”; it does not alter the authoritative command.
