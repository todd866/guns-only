#!/usr/bin/env python3
"""Compare playtest cohorts while keeping paired-seed provenance explicit."""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import report

def cohort(path: Path):
    manifest_path = path / "manifest.json"
    if not path.exists() or not manifest_path.exists(): return [], {}, ["missing manifest"]
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    try: runs = report.load_runs(path, manifest)
    except (OSError, ValueError, KeyError) as exc: return [], manifest, [f"cannot load runs: {exc}"]
    return runs, manifest, []

def validate(name, manifest, runs, expected_mode=None):
    errors = []
    options = manifest.get("options") or {}
    if manifest.get("beat") != 7 or options.get("beat", manifest.get("beat")) != 7: errors.append("beat must be 7")
    if manifest.get("schemaVersion", 1) not in (1, 2): errors.append("unsupported schemaVersion")
    if manifest.get("seeds") != 30 or options.get("seeds", manifest.get("seeds")) != 30: errors.append("seeds must be 30")
    if manifest.get("startSeed") != 0 or options.get("startSeed", manifest.get("startSeed")) != 0: errors.append("startSeed must be 0")
    if manifest.get("maxSeconds", options.get("maxSeconds")) != 3600: errors.append("maxSeconds must be 3600")
    if manifest.get("rtbAfterSeconds", options.get("rtbAfterSeconds")) != 600: errors.append("rtbAfterSeconds must be 600")
    for key, expected in (("threatRangeM", 2500), ("shotMissM", 25), ("groundMissM", 100)):
        if options.get(key, manifest.get(key)) != expected: errors.append(f"{key} must be {expected}")
    if len(runs) != 90: errors.append(f"expected 90 runs, found {len(runs)}")
    keys = [(r.get("pilot"), r.get("seed")) for r in runs]
    if len(set(keys)) != len(keys): errors.append("duplicate pilot/seed rows")
    pilots = {p for p, _ in keys}; seeds = {s for _, s in keys}
    expected_keys = {(p, s) for p in ("clone", "novice", "ace") for s in range(30)}
    if set(keys) != expected_keys: errors.append("expected exact clone/novice/ace × seeds 0..29")
    if expected_mode is not None:
        mode = options.get("endAfterCombat", manifest.get("endAfterCombat"))
        if mode is None: errors.append("endAfterCombat mode is missing")
        elif bool(mode) != expected_mode: errors.append(f"endAfterCombat must be {expected_mode}")
    return errors

def row(label, runs):
    a = report.aggregate(runs)
    phase = ", ".join(f"{p} {a['phasePct'][p]:.1f}%/{a['simPhasePct'][p]:.1f}%" for p in report.PHASES if a['phasePct'][p] or a['simPhasePct'][p])
    return (f"| {label} | {a['runs']} | {a['complete']} | {a['censored']} | {a['recovered']} | {a['landed']} | {a['endedEarly']} | "
            f"{a['meanPerceivedLength']:.1f}s / {a['meanSimulatedLength']:.1f}s | "
            f"{a['longestDeadAirSeconds']:.1f}s / {a['simLongestDeadAirSeconds']:.1f}s; active {a['longestDeadAirExcludingRtbAutopilotSeconds']:.1f}s | "
            f"{a['wavesWon']:.0f} / {a['combatScore']:.0f} / {a['bounceRuns']} | "
            f"{a['combatShare']:.1f}% / {a['simCombatShare']:.1f}% | {phase} |"), a

def compare(baseline: Path, landing: Path, end: Path) -> str:
    cohorts = [("baseline", baseline), ("land with compression", landing), ("end after combat", end)]
    loaded, manifests = {}, {}
    errors = []
    expected_modes = {"baseline": None, "land with compression": False, "end after combat": True}
    for name, path in cohorts:
        runs, manifest, cohort_errors = cohort(path)
        manifests[name] = manifest; errors.extend(f"- {name}: {error} ({path})" for error in cohort_errors)
        if manifest: errors.extend(f"- {name}: {error}" for error in validate(name, manifest, runs, expected_modes[name]))
        loaded[name] = runs
    if manifests.get("baseline"):
        base_hash = manifests["baseline"].get("cloneSha256")
        for name in ("land with compression", "end after combat"):
            if manifests.get(name) and manifests[name].get("cloneSha256") != base_hash: errors.append(f"- {name}: cloneSha256 differs from baseline")
        new_commits = {manifests[n].get("sourceCommit") for n in ("land with compression", "end after combat") if manifests.get(n)}
        if len(new_commits) > 1: errors.append("- landing and end cohorts have different sourceCommit values")
    lines = ["# Beat 7 RTB comparison", "", "Perceived / simulated seconds are shown as `player / sim`. Phase shares and combat share use the same order. The baseline ran at 1×, so its perceived and simulated clocks coincide. Combat = merge + fight + defensive; shares pool durations across runs. Longest dead air is the maximum contiguous streak.", "",
             "| cohort | runs | complete | censored | recovered | landed | ended early | mean sortie | longest dead air raw / active | waves / score / bounce runs | combat share | phase shares (perceived/sim) |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|" ]
    for name, _ in cohorts:
        if loaded[name]: lines.append(row(name, loaded[name])[0])
        else: lines.append(f"| {name} | unavailable | — | — | — | — | — | — | — | — | — | — |")
    if errors: lines += ["", "## Provenance / data guard", "", *errors]
    for name, _ in cohorts:
        if manifests.get(name):
            m = manifests[name]; lines.append(f"- {name} manifest: schema {m.get('schemaVersion', 1)}, source `{m.get('sourceCommit', '?')}`, clone `{m.get('cloneSha256', '?')}`")
    base_keys = {(r.get("pilot"), r.get("seed")) for r in loaded["baseline"]}
    for name in ("land with compression", "end after combat"):
        keys = {(r.get("pilot"), r.get("seed")) for r in loaded[name]}
        if base_keys and keys != base_keys:
            lines += ["", f"Paired-seed guard: **FAILED** for {name}; cohort rows are not paired with baseline, so no paired delta is reported."]
            errors.append(f"- {name}: pilot/seed set differs from baseline")
        elif base_keys and keys == base_keys:
            lines += ["", f"Paired-seed guard: passed for {name} ({len(keys)} pilot/seed pairs)."]
    lines += ["", "## Pilot rows", "", "| cohort / pilot | runs | complete | censored | recovered | landed | ended early | mean sortie | longest dead air | combat share |", "|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|"]
    for name, _ in cohorts:
        by = {}
        for r in loaded[name]: by.setdefault(r.get("pilot", "?"), []).append(r)
        for pilot, runs in sorted(by.items()):
            a = report.aggregate(runs)
            lines.append(f"| {name} / {pilot} | {a['runs']} | {a['complete']} | {a['censored']} | {a['recovered']} | {a['landed']} | {a['endedEarly']} | {a['meanPerceivedLength']:.1f}s / {a['meanSimulatedLength']:.1f}s | {a['longestDeadAirSeconds']:.1f}s / {a['simLongestDeadAirSeconds']:.1f}s | {a['combatShare']:.1f}% / {a['simCombatShare']:.1f}% |")
    compare.last_errors = errors
    return "\n".join(lines) + "\n"

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("baseline_dir", type=Path); ap.add_argument("landing_dir", type=Path); ap.add_argument("end_dir", type=Path); ap.add_argument("--out", required=True, type=Path)
    args = ap.parse_args(); args.out.write_text(compare(args.baseline_dir, args.landing_dir, args.end_dir), encoding="utf-8")
    invalid = [e for e in getattr(compare, "last_errors", []) if "missing manifest" not in e]
    if invalid:
        ap.exit(2, "comparison guard failed; see output report\n")

if __name__ == "__main__": main()
