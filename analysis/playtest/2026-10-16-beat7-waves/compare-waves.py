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
from statistics import median

PILOTS = ("clone", "novice", "ace")
SEEDS = range(30)
PHASES = ("merge", "fight", "defensive")
TARGETS = {
    "ace_mean_perceived_low": 300.0,
    "ace_mean_perceived_high": 480.0,
    "combat_share_pct": 40.0,
    "active_dead_air_max": 30.0,
    "ace_survive_low": 40.0,
    "ace_survive_high": 70.0,
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
    # Discontinued is represented by the simulation outcome on older observer
    # tapes, whose presentation outcome is simply incomplete.
    if str(run.get("simOutcome", "")) == "Discontinued":
        outcome = "discontinued"
    events = run.get("events") or []
    destroyed_at = min((number(e.get("second"), float("inf")) for e in events
                        if e.get("kind") == "Destroyed" and e.get("target") == "Player"),
                       default=float("inf"))
    # The tapes do not emit a standalone PlayerRtbRequested event. The pilot's
    # RTB mode transition is observable request evidence, separate from
    # successful terminal survival.
    rtb_requested_at = min((number(e.get("second"), float("inf")) for e in events
                            if (str(e.get("kind", "")).startswith("decision:RTB:")
                                or str(e.get("kind", "")).endswith("->RTB"))),
                           default=float("inf"))
    rtb_request = rtb_requested_at < float("inf") and destroyed_at > rtb_requested_at
    completed = bool(run.get("completed", False))
    landed = bool(run.get("landed", False))
    successful_end = completed and (outcome in {"win", "recovered"}
                                    or (landed and outcome not in {"loss", "crash", "draw"}))
    recovered = outcome == "recovered" or landed
    censored = not completed
    contacts = run.get("waveContacts") or []
    warnings = [number(c.get("warningSeconds"), float("nan")) for c in contacts
                if c.get("warningSeconds") is not None]
    uncanceled = [c for c in contacts if not c.get("canceledForRtb", False)]
    lead_times = [number(c.get("firstThreatSimSecond")) - number(c.get("previousWinSimSecond"))
                  for c in uncanceled if c.get("firstThreatSimSecond") is not None
                  and c.get("previousWinSimSecond") is not None]
    return {
        "perceived": duration(run), "simulated": duration(run, False),
        "raw_dead": raw, "active_dead": active,
        "hit_taken": number(run.get("hitsTaken")) > 0,
        "hit_given": number(run.get("hitsGiven")) > 0,
        "outcome": outcome, "landed": landed,
        "waves": won,
        "score": None if "combatScore" not in run else number(run.get("combatScore")),
        "bounce": None if "rtbBounceSpawned" not in run else bool(run.get("rtbBounceSpawned")),
        "rtb_request": rtb_request,
        "successful_end": successful_end,
        "recovered": recovered,
        "censored": censored,
        "warning_min": min(warnings, default=None), "warning_max": max(warnings, default=None),
        "lead_times": lead_times,
        "lead_missing": sum(c.get("firstThreatSimSecond") is None for c in uncanceled),
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
    ace_survivors = sum(v["successful_end"] for v in values)
    rtb_requests = sum(v["rtb_request"] for v in values)
    recovered = sum(v["recovered"] for v in values)
    lengths = [v["perceived"] for v in values]
    lengths_sorted = sorted(lengths)
    def percentile(p):
        if not lengths_sorted:
            return 0
        return median(lengths_sorted) if p == .5 else lengths_sorted[min(len(lengths_sorted) - 1, int((len(lengths_sorted) - 1) * p))]
    leads = [lead for v in values for lead in v["lead_times"]]
    warning_mins = [v["warning_min"] for v in values if v["warning_min"] is not None]
    warning_maxes = [v["warning_max"] for v in values if v["warning_max"] is not None]
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
        "outcomes": {key: outcomes.get(key, 0) for key in ("loss", "crash", "win", "draw", "recovered", "incomplete", "discontinued")},
        "landed": sum(v["landed"] for v in values),
        "waves_mean": sum(v["waves"] for v in values) / len(values) if values else 0,
        "waves_max": max((v["waves"] for v in values), default=0),
        "score_mean": sum(scores) / len(scores) if scores else None,
        "bounce": sum(bounces) if bounces else None,
        "first_two": completed_first_two,
        "any_wave_win": any(v["waves"] > 0 for v in values),
        "wave1": sum(v["waves"] >= 1 for v in values),
        "wave2": sum(v["waves"] >= 2 for v in values),
        "ace_survive_to_rtb": ace_survivors,
        "ace_survive_to_rtb_pct": 100 * ace_survivors / len(values) if values else 0,
        "rtb_request": rtb_requests,
        "rtb_request_pct": 100 * rtb_requests / len(values) if values else 0,
        "recovered": recovered,
        "length_below_300": sum(v < 300 for v in lengths),
        "length_300_480": sum(300 <= v <= 480 for v in lengths),
        "length_above_480": sum(v > 480 for v in lengths),
        "length_p50": percentile(.5),
        "length_p90": percentile(.9),
        "censored": sum(v["censored"] for v in values),
        "warning_min": min(warning_mins, default=None), "warning_max": max(warning_maxes, default=None),
        "lead_max": max(leads, default=None), "lead_count": len(leads),
        "lead_missing": sum(v["lead_missing"] for v in values),
    }


def gate(label, value, target):
    if value is None:
        return f"{label}: N/A (field absent)"
    return f"{label}: {'PASS' if target else 'MISS'} ({value})"


def gate_lines(wave_by_pilot, label="waves"):
    ace = wave_by_pilot["ace"]
    novice = wave_by_pilot["novice"]
    active_gate = ("ace maximum active dead air target ≤30 s: N/A (field absent)"
                   if ace["max_active_dead"] is None else
                   gate("ace maximum active dead air target ≤30 s", f"{ace['max_active_dead']:.1f}s",
                        ace["max_active_dead"] <= TARGETS["active_dead_air_max"]))
    return [
        f"## Gates ({label}; actual versus targets)",
        "",
        gate("ace mean perceived sortie target 300–480 s", f"{ace['mean_perceived']:.1f}s",
             TARGETS["ace_mean_perceived_low"] <= ace["mean_perceived"] <= TARGETS["ace_mean_perceived_high"]),
        f"Individual ace sorties in 300–480 s band: {ace['length_in_band']}/{ace['runs']}; range {ace['length_min']:.1f}–{ace['length_max']:.1f}s. The mean gate does not imply every seed meets the band.",
        gate("ace combat share target ≥40%", f"{ace['combat_share']:.1f}%",
             ace["combat_share"] >= TARGETS["combat_share_pct"]),
        active_gate,
        f"ace hit evidence (player hits taken): {ace['hit_runs']}/{ace['runs']} ({ace['hit_share']:.1f}%) — majority target is >50%",
        gate("ace survive-to-RTB target 40–70%", f"{ace['ace_survive_to_rtb_pct']:.1f}% ({ace['ace_survive_to_rtb']}/{ace['runs']})",
             TARGETS["ace_survive_low"] <= ace["ace_survive_to_rtb_pct"] <= TARGETS["ace_survive_high"]),
        f"ace successful terminal survival (completed win/recovered or qualifying landed End): {ace['ace_survive_to_rtb']}/{ace['runs']}",
        f"ace RTB-request evidence (not survival): {ace['rtb_request']}/{ace['runs']} ({ace['rtb_request_pct']:.1f}%)",
        f"ace combat loss evidence: {ace['outcomes']['loss']} loss runs",
        f"ace crash evidence: {ace['outcomes']['crash']} crash runs",
        f"novice wave 1 / wave 2 completion: {novice['wave1']}/{novice['wave2']} (wave 2 >0: {'PASS' if novice['wave2'] > 0 else 'MISS'})",
    ]


def comparison(wave_path: Path, baseline_path: Path, iteration2_path: Path | None = None):
    waves, wave_manifest, wave_errors = load_cohort(wave_path)
    baseline, baseline_manifest, baseline_errors = load_cohort(baseline_path)
    errors = [("baseline", e) for e in baseline_errors] + [("waves", e) for e in wave_errors]
    errors.extend(("pair", e) for e in validate_pair(baseline_manifest, wave_manifest, baseline_path, wave_path))
    iteration2 = iteration2_manifest = None
    iteration2_errors = []
    if iteration2_path is not None:
        iteration2, iteration2_manifest, iteration2_errors = load_cohort(iteration2_path)
        errors.extend(("iteration2", e) for e in iteration2_errors)
        errors.extend(("iteration2-pair", e) for e in validate_pair(
            baseline_manifest, iteration2_manifest, baseline_path, iteration2_path))
    if errors:
        raise ValueError("cohort validation failed: " + "; ".join(f"{label}: {error}" for label, error in errors))
    grouped = {}
    cohorts = [("baseline", baseline, True), ("waves", waves, False)]
    if iteration2 is not None:
        cohorts.insert(0, ("iteration2", iteration2, False))
    for label, runs, is_baseline in cohorts:
        grouped[label] = {pilot: aggregate([r for r in runs if r.get("pilot") == pilot], is_baseline) for pilot in PILOTS}
    gate_label = "iteration2" if iteration2 is not None else "waves"
    gate_group = grouped[gate_label]
    ace_gate = gate_group["ace"]
    novice_gate = gate_group["novice"]
    def actual(value, suffix=""):
        return "N/A" if value is None else f"{value:.1f}{suffix}"
    warning_status = (ace_gate["warning_min"] is not None and ace_gate["warning_max"] is not None
                      and 20 - 1 / 120 - 1e-7 <= ace_gate["warning_min"] <= 30 + 1e-7
                      and 20 - 1 / 120 - 1e-7 <= ace_gate["warning_max"] <= 30 + 1e-7)
    lead_status = ace_gate["lead_missing"] == 0 and ace_gate["lead_max"] is not None and ace_gate["lead_max"] <= 30
    lines = [
        "# Beat 7 wave cohort comparison", "",
        "Validation contract and test counts: [validation.md](validation.md). Counts include censored/incomplete runs explicitly; baseline wave fields are inferred as two wins only when `combatComplete` is true. Outcome counts sum to 30; landed is a separate overlapping count. [Iteration-1 per-seed ace gates](ace-gates.png).", "",
        f"## Gate table ({gate_label}; actual versus targets)", "",
        "| gate | actual | target | status |", "|---|---:|---:|---|",
        f"| ace combat share | {gate_group['ace']['combat_share']:.1f}% | ≥40% | {'PASS' if gate_group['ace']['combat_share'] >= TARGETS['combat_share_pct'] else 'MISS'} |",
        f"| ace active dead air maximum | {gate_group['ace']['max_active_dead']:.1f}s | ≤30s | {'PASS' if gate_group['ace']['max_active_dead'] is not None and gate_group['ace']['max_active_dead'] <= TARGETS['active_dead_air_max'] else 'MISS'} |",
        f"| ace successful terminal survival | {gate_group['ace']['ace_survive_to_rtb_pct']:.1f}% | 40–70% | {'PASS' if TARGETS['ace_survive_low'] <= gate_group['ace']['ace_survive_to_rtb_pct'] <= TARGETS['ace_survive_high'] else 'MISS'} |",
        f"| ace hits taken | {gate_group['ace']['hit_share']:.1f}% | >50% | {'PASS' if gate_group['ace']['hit_share'] > 50 else 'MISS'} |",
        f"| novice wave 1 | {novice_gate['wave1']}/{novice_gate['runs']} ({100*novice_gate['wave1']/novice_gate['runs'] if novice_gate['runs'] else 0:.1f}%) | meaningful share | — |",
        f"| novice wave 2 | {novice_gate['wave2']}/{novice_gate['runs']} ({100*novice_gate['wave2']/novice_gate['runs'] if novice_gate['runs'] else 0:.1f}%) | >0 | {'PASS' if novice_gate['wave2'] > 0 else 'MISS'} |",
        f"| ace sortie mean length | {ace_gate['mean_perceived']:.1f}s | 300–480s | {'PASS' if TARGETS['ace_mean_perceived_low'] <= ace_gate['mean_perceived'] <= TARGETS['ace_mean_perceived_high'] else 'MISS'} |",
        f"| ace length distribution | {ace_gate['length_below_300']}/{ace_gate['length_300_480']}/{ace_gate['length_above_480']} (<300/in/ >480; range {ace_gate['length_min']:.1f}–{ace_gate['length_max']:.1f}s, p50 {ace_gate['length_p50']:.1f}, p90 {ace_gate['length_p90']:.1f}) | reported | — |",
        f"| all-pilot active dead air maximum | {actual(max((a['max_active_dead'] for a in gate_group.values() if a['max_active_dead'] is not None), default=None),'s')} | ≤30s | {'PASS' if max((a['max_active_dead'] for a in gate_group.values() if a['max_active_dead'] is not None), default=999) <= 30 else 'MISS'} |",
        f"| ace warning seconds min/max | {actual(ace_gate['warning_min'],'s')} / {actual(ace_gate['warning_max'],'s')} | 20–30s | {'PASS' if warning_status else 'MISS'} |",
        f"| ace win-to-first-threat max | {actual(ace_gate['lead_max'],'s')} ({ace_gate['lead_count']} observed; {ace_gate['lead_missing']} missing) | ≤30s, no missing | {'PASS' if lead_status else 'MISS'} |",
        "",
        "Warnings are sampled at tick end (up to 1/120 s after creation); the authored 20 s lower bound permits that measurement offset. Survival requires a completed survivable outcome, not merely requesting RTB. [Metric definitions](validation.md).", "",
        "| pilot | cohort | mean perceived / sim | length <300 / 300–480 / >480 (p50/p90) | censored | combat share (pooled phase seconds) | max raw dead air | max active dead air (RTB AP excluded) | hits taken runs | successful terminal survival | loss/crash/win/draw/recovered/incomplete/discontinued | landed | waves mean/max | score mean | bounce actual |",
        "|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|",
    ]
    for pilot in PILOTS:
        for label, _, _ in cohorts:
            a = grouped[label][pilot]
            active = "N/A" if a["max_active_dead"] is None else f"{a['max_active_dead']:.1f}s"
            o = a["outcomes"]
            score = "N/A" if a["score_mean"] is None else f"{a['score_mean']:.1f}"
            bounce = "N/A" if a["bounce"] is None else str(a["bounce"])
            lengths = f"{a['length_below_300']}/{a['length_300_480']}/{a['length_above_480']} ({a['length_p50']:.1f}/{a['length_p90']:.1f}s)"
            lines.append(f"| {pilot} | {label} | {a['mean_perceived']:.1f}s / {a['mean_simulated']:.1f}s | {lengths} | {a['censored']}/{a['runs']} | {a['combat_share']:.1f}% | {a['max_raw_dead']:.1f}s | {active} | {a['hit_runs']}/{a['runs']} ({a['hit_share']:.1f}%) | {a['ace_survive_to_rtb']}/{a['runs']} ({a['ace_survive_to_rtb_pct']:.1f}%) | {o['loss']}/{o['crash']}/{o['win']}/{o['draw']}/{o['recovered']}/{o['incomplete']}/{o['discontinued']} | {a['landed']} | {a['waves_mean']:.2f}/{a['waves_max']} | {score} | {bounce} |")
    gate_label = "iteration2" if iteration2 is not None else "waves"
    gates = gate_lines(grouped[gate_label], gate_label)
    lines += ["", *gates[:2], *(f"- {entry}" for entry in gates[2:])]
    gate_group = grouped[gate_label]
    maximum = max((a['max_active_dead'] for a in gate_group.values() if a['max_active_dead'] is not None), default=0)
    lines += [f"- All-pilot maximum dead air excluding actual RTB AP ({gate_label}): {maximum:.1f}s versus ≤30 s target."]
    return "\n".join(lines) + "\n"


def self_check():
    assert not row({"hitsGiven": 1, "hitsTaken": 0})["hit_taken"]
    sample_run = {"events": [{"second": 10, "kind": "decision:RTB:bingo"}],
                  "simOutcome": "Discontinued", "completed": False,
                  "perceivedSeconds": 301, "seconds": 301, "wavesWon": 1}
    sample_row = row(sample_run)
    assert sample_row["rtb_request"] and not sample_row["successful_end"] and sample_row["censored"]
    assert sample_row["outcome"] == "discontinued"
    sample_stats = aggregate([sample_run, {"perceivedSeconds": 500, "seconds": 500, "wavesWon": 2}])
    assert (sample_stats["wave1"], sample_stats["wave2"]) == (2, 1)
    assert (sample_stats["length_300_480"], sample_stats["length_above_480"]) == (1, 1)
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
    default_iteration2 = Path(__file__).parent / "iteration2"
    parser.add_argument("--iteration2", type=Path, default=default_iteration2 if (default_iteration2 / "manifest.json").exists() else None)
    parser.add_argument("--out", type=Path, default=Path(__file__).parent / "comparison.md")
    parser.add_argument("--self-check", action="store_true")
    args = parser.parse_args()
    if args.self_check:
        self_check()
        print("self-check: ok")
        return
    try:
        text = comparison(args.waves, args.baseline, args.iteration2)
    except ValueError as exc:
        parser.error(str(exc))
    args.out.write_text(text, encoding="utf-8")
    print(f"wrote {args.out}")


if __name__ == "__main__":
    main()
