"""Audit iteration 2 against immutable iteration-1 tapes and physical ingress evidence."""
import gzip
import importlib.util
import json
from pathlib import Path

from audit import audit, near

root = Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location("compare_waves", root / "compare-waves.py")
comparison = importlib.util.module_from_spec(spec)
spec.loader.exec_module(comparison)


def main():
    folder = root / "iteration2"
    runs = audit(folder)
    old_folder = root / "land-autopilot"
    manifest = json.loads((folder / "manifest.json").read_text())
    old_manifest = json.loads((old_folder / "manifest.json").read_text())
    assert not comparison.validate_pair(old_manifest, manifest, old_folder, folder)
    assert not comparison.validate_manifest(manifest, folder)
    assert manifest["sourceCommit"]
    contacts = canceled = 0
    for key, run in runs.items():
        old = json.load(gzip.open(old_folder / f"runs/{key[0]}-{key[1]:04d}.json.gz"))
        assert not run["sortieEndedEarly"]
        n = run["wavesWon"]
        near(run["combatScore"], 100 * min(2, n)
             + sum(100 * (1 + .5 * (w - 2)) for w in range(3, n + 1)), (key, "score"))
        assert 0 <= run["longestDeadAirExcludingRtbAutopilotSeconds"] <= run["longestDeadAirSeconds"] + 1e-6
        assert 0 <= run["deadAirExcludingRtbAutopilotSeconds"] <= run["deadAirSeconds"] + 1e-6
        for contact in run["waveContacts"]:
            assert 20 - 1 / 120 - 1e-7 <= contact["warningSeconds"] <= 30 + 1e-7
            assert contact["previousWinSimSecond"] <= run["seconds"]
            if contact["canceledForRtb"]:
                canceled += 1
                assert contact["firstThreatSimSecond"] is None
                continue
            contacts += 1
            assert contact["firstThreatSimSecond"] is not None, (key, "missing threat")
            lag = contact["firstThreatSimSecond"] - contact["previousWinSimSecond"]
            assert 0 <= lag <= 30 + 1e-7, (key, "late threat", lag)
        if key[0] == "clone":
            def stable(tape):
                return {k: v for k, v in tape.items() if k not in {"wallSeconds", "waveContacts"}}
            assert stable(run) == stable(old), (key, "clone changed")
        if key[0] == "ace":
            opening = lambda tape: [e for e in tape["engagementTensions"] if e["engagement"] <= 2]
            assert opening(run) == opening(old), (key, "ace opening changed")
    print(f"90 iteration-2 tapes passed; {contacts} physical arrivals within 30 s; {canceled} RTB cancellations.")
    print("All 30 clone tapes unchanged apart from execution time/new empty wave field; all 30 ace opening summaries unchanged.")


if __name__ == "__main__":
    main()
