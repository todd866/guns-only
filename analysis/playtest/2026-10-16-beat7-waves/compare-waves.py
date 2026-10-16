#!/usr/bin/env python3
"""Compare the beat-7 escalating-wave cohort with the older RTB cohort.

This is deliberately separate from the historical RTB comparison: wave fields are
optional on old tapes, while the paired pilot/seed contract remains exact.
"""
from __future__ import annotations

import argparse
import gzip
import json
from collections import Counter
from pathlib import Path

PILOTS = ("clone", "novice", "ace")
SEEDS = range(30)
PHASES = ("merge", "fight", "defensive")
TARGETS = {
    "ace_mean_perceived_low": 300.0,
    "ace_mean_perceived_high": 480.0,
    "combat_share_pct": 40.0,
    "active_dead_air_max": 30.0,
}


def number(value, default=0.0):
    try:
        return float(value)
    except (TypeError, ValueError):
        return default


def duration(run, perceived=True):
    key = "perceivedSeconds" if perceived else "seconds"
    if key in run:
        return number(run[key])
    field = "duration" if perceived else "simDuration"
    return sum(number(b.get(field, b.get("duration", 0))) for b in run.get("timeline", []))


def load_cohort(path: Path):
    manifest_path = path / "manifest.json"
    if not manifest_path.exists():
        return [], {}, [f"missing manifest: {path}"]
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    errors = validate_manifest(manifest, path)
    runs = []
    for relative in manifest.get("runs", []):
        tape = path / relative
        if not tape.exists():
            errors.append(f"missing tape: {tape}")
            continue
        with gzip.open(tape, "rt", encoding="utf-8") as stream:
            runs.append(json.load(stream))
    errors.extend(validate_keys(runs, path))
    return runs, manifest, errors


def validate_manifest(manifest, path):
    errors = []
    if manifest.get("beat") != 7:
        errors.append(f"{path}: beat is not 7")
    if manifest.get("seeds") != 30 or manifest.get("startSeed") != 0:
        errors.append(f"{path}: expected the documented 30 seeds starting at 0")
    options = manifest.get("options") or {}
    if options.get("pilots", ",".join(PILOTS)) != ",".join(PILOTS):
        errors.append(f"{path}: expected pilots clone,novice,ace")
    return errors


def manifest_value(manifest, key):
    return (manifest.get("options") or {}).get(key, manifest.get(key))


def validate_pair(baseline, waves, baseline_path, waves_path):
    errors = []
    if not baseline.get("cloneSha256") or baseline.get("cloneSha256") != waves.get("cloneSha256"):
        errors.append(f"cloneSha256 differs or is missing ({baseline_path} versus {waves_path})")
    for key in ("maxSeconds", "rtbAfterSeconds", "endAfterCombat", "threatRangeM", "shotMissM", "groundMissM"):
        left, right = manifest_value(baseline, key), manifest_value(waves, key)
        if left != right:
            errors.append(f"option {key} differs: baseline={left!r}, waves={right!r}")
    return errors


def validate_keys(runs, path):
    expected = {(pilot, seed) for pilot in PILOTS for seed in SEEDS}
    actual = {(run.get("pilot"), run.get("seed")) for run in runs}
    errors = []
    if actual != expected:
        missing = sorted(expected - actual)
        extra = sorted(actual - expected)
        if missing:
            errors.append(f"{path}: missing pilot/seed rows: {missing[:5]}")
        if extra:
            errors.append(f"{path}: unexpected pilot/seed rows: {extra[:5]}")
    if len(runs) != len(expected):
        errors.append(f"{path}: expected {len(expected)} rows, found {len(runs)}")
    return errors


def waves_won(run, baseline=False):
    value = run.get("wavesWon")
    if value is not None:
        return int(number(value))
    # Old tapes predate the ladder fields. Their finite combat contract was two
    # wins; preserve that evidence without claiming later waves.
    return 2 if baseline and run.get("combatComplete") is True else 0


def phase_totals(run):
    phases = run.get("phaseSeconds") or {}
    return sum(number(phases.get(p)) for p in PHASES), sum(number(v) for v in phases.values())


def row(run, baseline=False):
    raw = number(run.get("longestDeadAirSeconds", run.get("simLongestDeadAirSeconds", 0)))
    active_value = run.get("longestDeadAirExcludingRtbAutopilotSeconds")
    active = None if active_value is None and baseline else number(active_value, raw)
    won = waves_won(run, baseline)
    outcome = str(run.get("outcome", "incomplete"))
    return {
        "perceived": duration(run), "simulated": duration(run, False),
        "raw_dead": raw, "active_dead": active,
        "hit_taken": number(run.get("hitsTaken")) > 0,
        "hit_given": number(run.get("hitsGiven")) > 0,
        "outcome": outcome, "landed": bool(run.get("landed", False)),
        "waves": won,
        "score": None if "combatScore" not in run else number(run.get("combatScore")),
        "bounce": None if "rtbBounceSpawned" not in run else bool(run.get("rtbBounceSpawned")),
    }


def aggregate(runs, baseline=False):
    values = [row(run, baseline) for run in runs]
    outcomes = Counter(v["outcome"] for v in values)
    completed_first_two = sum(v["waves"] >= 2 for v in values)
    active = [v["active_dead"] for v in values if v["active_dead"] is not None]
    combat_seconds = sum(phase_totals(run)[0] for run in runs)
    phase_seconds = sum(phase_totals(run)[1] for run in runs)
    scores = [v["score"] for v in values if v["score"] is not None]
    bounces = [v["bounce"] for v in values if v["bounce"] is not None]
    return {
        "runs": len(values),
        "mean_perceived": sum(v["perceived"] for v in values) / len(values) if values else 0,
        "mean_simulated": sum(v["simulated"] for v in values) / len(values) if values else 0,
        "length_min": min((v["perceived"] for v in values), default=0),
        "length_max": max((v["perceived"] for v in values), default=0),
        "length_in_band": sum(300 <= v["perceived"] <= 480 for v in values),
        "combat_share": 100 * combat_seconds / phase_seconds if phase_seconds else 0,
        "max_raw_dead": max((v["raw_dead"] for v in values), default=0),
        "max_active_dead": max(active) if active else None,
        "hit_runs": sum(v["hit_taken"] for v in values),
        "hit_share": 100 * sum(v["hit_taken"] for v in values) / len(values) if values else 0,
        "hit_given_runs": sum(v["hit_given"] for v in values),
        "outcomes": {key: outcomes.get(key, 0) for key in ("loss", "crash", "win", "draw", "recovered", "incomplete")},
        "landed": sum(v["landed"] for v in values),
        "waves_mean": sum(v["waves"] for v in values) / len(values) if values else 0,
        "waves_max": max((v["waves"] for v in values), default=0),
        "score_mean": sum(scores) / len(scores) if scores else None,
        "bounce": sum(bounces) if bounces else None,
        "first_two": completed_first_two,
        "any_wave_win": any(v["waves"] > 0 for v in values),
    }


def gate(label, value, target):
    if value is None:
        return f"{label}: N/A (field absent)"
    return f"{label}: {'PASS' if target else 'MISS'} ({value})"


def gate_lines(wave_by_pilot):
    ace = wave_by_pilot["ace"]
    novice = wave_by_pilot["novice"]
    active_gate = ("ace maximum active dead air target ≤30 s: N/A (field absent)"
                   if ace["max_active_dead"] is None else
                   gate("ace maximum active dead air target ≤30 s", f"{ace['max_active_dead']:.1f}s",
                        ace["max_active_dead"] <= TARGETS["active_dead_air_max"]))
    return [
        "## Gates (actual versus targets)",
        "",
        gate("ace mean perceived sortie target 300–480 s", f"{ace['mean_perceived']:.1f}s",
             TARGETS["ace_mean_perceived_low"] <= ace["mean_perceived"] <= TARGETS["ace_mean_perceived_high"]),
        f"Individual ace sorties in 300–480 s band: {ace['length_in_band']}/{ace['runs']}; range {ace['length_min']:.1f}–{ace['length_max']:.1f}s. The mean gate does not imply every seed meets the band.",
        gate("ace combat share target ≥40%", f"{ace['combat_share']:.1f}%",
             ace["combat_share"] >= TARGETS["combat_share_pct"]),
        active_gate,
        f"ace hit evidence (player hits taken): {ace['hit_runs']}/{ace['runs']} ({ace['hit_share']:.1f}%) — meaningful share is reported for judgment; no arbitrary pass cutoff is applied",
        f"ace combat loss evidence: {ace['outcomes']['loss']} loss runs",
        f"ace crash evidence: {ace['outcomes']['crash']} crash runs",
        f"novice first-two completion count target >0: {'PASS' if novice['first_two'] > 0 else 'MISS'} ({novice['first_two']})",
        f"novice at-least-one-wave-win: {'PASS' if novice['any_wave_win'] else 'MISS'}",
    ]


def comparison(wave_path: Path, baseline_path: Path):
    waves, wave_manifest, wave_errors = load_cohort(wave_path)
    baseline, baseline_manifest, baseline_errors = load_cohort(baseline_path)
    errors = [("baseline", e) for e in baseline_errors] + [("waves", e) for e in wave_errors]
    errors.extend(("pair", e) for e in validate_pair(baseline_manifest, wave_manifest, baseline_path, wave_path))
    if errors:
        raise ValueError("cohort validation failed: " + "; ".join(f"{label}: {error}" for label, error in errors))
    grouped = {}
    for label, runs, is_baseline in (("baseline", baseline, True), ("waves", waves, False)):
        grouped[label] = {pilot: aggregate([r for r in runs if r.get("pilot") == pilot], is_baseline) for pilot in PILOTS}
    lines = [
        "# Beat 7 wave cohort comparison", "",
        "Validation contract and test counts: [validation.md](validation.md). Counts include censored/incomplete runs explicitly; baseline wave fields are inferred as two wins only when `combatComplete` is true. Outcome counts sum to 30; landed is a separate overlapping count. [Per-seed ace gates](ace-gates.png).", "",
        "| pilot | cohort | mean perceived / sim | combat share (pooled phase seconds) | max raw dead air | max active dead air (RTB AP excluded) | hits taken runs | loss/crash/win/draw/recovered/incomplete | landed | waves mean/max | score mean | bounce actual |",
        "|---|---|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|",
    ]
    for pilot in PILOTS:
        for label in ("baseline", "waves"):
            a = grouped[label][pilot]
            active = "N/A" if a["max_active_dead"] is None else f"{a['max_active_dead']:.1f}s"
            o = a["outcomes"]
            score = "N/A" if a["score_mean"] is None else f"{a['score_mean']:.1f}"
            bounce = "N/A" if a["bounce"] is None else str(a["bounce"])
            lines.append(f"| {pilot} | {label} | {a['mean_perceived']:.1f}s / {a['mean_simulated']:.1f}s | {a['combat_share']:.1f}% | {a['max_raw_dead']:.1f}s | {active} | {a['hit_runs']}/{a['runs']} ({a['hit_share']:.1f}%) | {o['loss']}/{o['crash']}/{o['win']}/{o['draw']}/{o['recovered']}/{o['incomplete']} | {a['landed']} | {a['waves_mean']:.2f}/{a['waves_max']} | {score} | {bounce} |")
    gates = gate_lines(grouped["waves"])
    lines += ["", *gates[:2], *(f"- {entry}" for entry in gates[2:])]
    maximum = max(a['max_active_dead'] for a in grouped['waves'].values())
    lines += [f"- All-pilot maximum dead air excluding actual RTB AP: {maximum:.1f}s versus ≤30 s target."]
    return "\n".join(lines) + "\n"


def self_check():
    assert not row({"hitsGiven": 1, "hitsTaken": 0})["hit_taken"]
    sample = [{"phaseSeconds": {"fight": 1}}, {"phaseSeconds": {"fight": 1, "rtb": 9}}]
    pooled = aggregate(sample)["combat_share"]
    assert abs(pooled - (200.0 / 11.0)) < 1e-9
    assert abs(pooled - 55.0) > 1.0
    try:
        comparison(Path("/definitely/missing/waves"), Path("/definitely/missing/base"))
    except ValueError:
        pass
    else:
        raise AssertionError("missing cohort must be rejected")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--waves", type=Path, default=Path(__file__).parent / "land-autopilot")
    parser.add_argument("--baseline", type=Path, default=Path(__file__).parent.parent / "2026-10-16-beat7-rtb" / "land-autopilot")
    parser.add_argument("--out", type=Path, default=Path(__file__).parent / "comparison.md")
    parser.add_argument("--self-check", action="store_true")
    args = parser.parse_args()
    if args.self_check:
        self_check()
        print("self-check: ok")
        return
    try:
        text = comparison(args.waves, args.baseline)
    except ValueError as exc:
        parser.error(str(exc))
    args.out.write_text(text, encoding="utf-8")
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
