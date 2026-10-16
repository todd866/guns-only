"""Audit the new default-land AP cohort and its paired combat provenance."""
import json
import runpy
import sys
from pathlib import Path

root = Path(__file__).resolve().parent
sys.path.insert(0, str(root.parents[2] / "tools/playtest-lab"))
import compare
import report

# Keep the same per-tick clock, counter and lifecycle audit as the prior cohorts.
prior = runpy.run_path(str(root / "audit.py"))
runs = prior["audit"](root / "land-autopilot")
manifest = json.loads((root / "land-autopilot/manifest.json").read_text())
assert not compare.validate("land-autopilot", manifest, list(runs.values()), False)
old_manifest = json.loads((root / "land/manifest.json").read_text())
assert manifest["cloneSha256"] == old_manifest["cloneSha256"]
assert manifest["sourceCommit"] == "ee5853bc7c81e86fa990b6bff0ac3e5924a8e150"

for key, run in runs.items():
    old = prior["land"][key]
    # Recovery ownership may alter the trajectory only after the RTB handoff.
    # Discrete combat outcomes/counters must still agree for each paired seed.
    for field in ("kills", "hitsGiven", "roundsFired", "combatComplete"):
        assert run[field] == old[field], (key, field)
    for phase in ("merge", "fight", "defensive"):
        prior["near"](run["simPhaseSeconds"].get(phase, 0),
                      old["simPhaseSeconds"].get(phase, 0), (key, phase))
    assert not run["sortieEndedEarly"], key

for pilot in ("all", "clone", "novice", "ace"):
    selected = [r for r in runs.values() if pilot == "all" or r["pilot"] == pilot]
    a = report.aggregate(selected)
    print(pilot, json.dumps({
        "meanPerceivedSeconds": a["meanPerceivedLength"],
        "meanSimulatedSeconds": a["meanSimulatedLength"],
        "rtbPercent": a["phasePct"]["RTB"],
        "combatPercent": a["combatShare"],
        "landed": a["landed"], "censored": a["censored"],
        "runsAt8x": sum(r["compressionSimSeconds"].get("8", 0) > 0 for r in selected),
    }, sort_keys=True))
a = report.aggregate(list(runs.values()))
text = (root / "comparison.md").read_text()
assert f"| Land + RTB autopilot | {a['meanPerceivedLength']:.1f} / {a['meanSimulatedLength']:.1f} |" in text
assert f"| {a['combatShare']:.1f} / {a['simCombatShare']:.1f} | {a['phasePct']['RTB']:.1f} / {a['simPhasePct']['RTB']:.1f} |" in text
print("Paired combat durations/counters unchanged; default-land, source and comparison row guards passed.")
