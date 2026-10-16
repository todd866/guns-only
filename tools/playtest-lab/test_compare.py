import sys
import unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent))
import compare

def runs():
    return [{"pilot": p, "seed": s, "outcome": "recovered", "timeline": [{"duration": 1, "simDuration": 8, "phase": "fight"}], "phaseSeconds": {"fight": 1}, "simPhaseSeconds": {"fight": 8}, "sortieEndedEarly": p == "ace"} for p in ("clone", "novice", "ace") for s in range(30)]

def manifest(mode=None, commit="new"):
    m = {"schemaVersion": 2, "beat": 7, "seeds": 30, "startSeed": 0, "maxSeconds": 3600, "rtbAfterSeconds": 600, "cloneSha256": "clone", "sourceCommit": commit, "options": {"beat": 7, "seeds": 30, "startSeed": 0, "maxSeconds": 3600, "rtbAfterSeconds": 600, "threatRangeM": 2500, "shotMissM": 25, "groundMissM": 100}}
    if mode is not None: m["options"]["endAfterCombat"] = mode
    return m

class CompareTests(unittest.TestCase):
    def test_row_matches_header_order(self):
        line, _ = compare.row("x", runs())
        fields = [x.strip() for x in line.strip("|").split("|")]
        self.assertEqual(fields[:7], ["x", "90", "90", "0", "90", "0", "30"])

    def test_manifest_guard_rejects_duplicate_and_wrong_options(self):
        rs = runs(); rs[-1] = dict(rs[-2])
        errors = compare.validate("x", manifest(), rs)
        self.assertTrue(any("duplicate" in x for x in errors)); self.assertTrue(any("pilot/seed" in x for x in errors))

    def test_new_modes_require_explicit_matching_option(self):
        self.assertTrue(any("missing" in x for x in compare.validate("landing", manifest(), runs(), False)))
        self.assertFalse(compare.validate("landing", manifest(False), runs(), False))
        self.assertTrue(any("must be True" in x for x in compare.validate("end", manifest(False), runs(), True)))

    def test_comparison_tables_have_consistent_columns(self):
        text = compare.compare(Path("/missing"), Path("/missing2"), Path("/missing3"))
        rows = [line for line in text.splitlines() if line.startswith("|") and line.endswith("|")]
        counts = [line.count("|") - 1 for line in rows]
        self.assertEqual(counts[0], counts[1]); self.assertEqual(counts[2], counts[3])

if __name__ == "__main__": unittest.main()
