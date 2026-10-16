import importlib.util
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch


SCRIPT = Path(__file__).with_name("compare-waves.py")
spec = importlib.util.spec_from_file_location("compare_waves", SCRIPT)
compare_waves = importlib.util.module_from_spec(spec)
spec.loader.exec_module(compare_waves)


def run(pilot, seed, **extra):
    value = {
        "pilot": pilot, "seed": seed, "completed": True,
        "outcome": "win", "perceivedSeconds": 360, "seconds": 360,
        "phaseSeconds": {"fight": 1}, "wavesWon": 1,
    }
    value.update(extra)
    return value


class CompareWavesTests(unittest.TestCase):
    def test_successful_end_is_survival_and_end_after_combat_is_not_censored(self):
        stats = compare_waves.aggregate([
            run("ace", 0, outcome="win", sortieEndedEarly=True),
            run("ace", 1, outcome="loss", completed=False),
        ])
        self.assertEqual(stats["ace_survive_to_rtb"], 1)
        self.assertEqual(stats["censored"], 1)

    def test_rtb_request_evidence_does_not_count_as_survival_after_later_defeat(self):
        stats = compare_waves.aggregate([run(
            "ace", 0, outcome="loss",
            events=[{"second": 10, "kind": "decision:RTB:bingo"},
                    {"second": 20, "kind": "Destroyed", "target": "Player"}],
        )])
        self.assertEqual(stats["rtb_request"], 1)
        self.assertEqual(stats["ace_survive_to_rtb"], 0)

    def test_explicit_missing_iteration2_is_rejected(self):
        with self.assertRaises(ValueError):
            compare_waves.comparison(Path("/missing/waves"), Path("/missing/base"), Path("/missing/iteration2"))

    def test_iteration2_option_mismatch_is_rejected(self):
        base = {"cloneSha256": "same", "options": {"threatRangeM": 2500}}
        iteration = {"cloneSha256": "same", "options": {"threatRangeM": 3000}}
        errors = compare_waves.validate_pair(base, iteration, Path("base"), Path("iteration2"))
        self.assertTrue(any("threatRangeM" in error for error in errors))

    def test_iteration2_is_first_cohort_and_pairs_with_baseline(self):
        rows = [run(pilot, seed) for pilot in compare_waves.PILOTS for seed in compare_waves.SEEDS]
        manifests = ({"beat": 7, "seeds": 30, "startSeed": 0,
                      "cloneSha256": "same", "options": {"pilots": "clone,novice,ace"}},) * 3
        with tempfile.TemporaryDirectory() as temp:
            base, waves, iteration = (Path(temp) / name for name in ("base", "waves", "iteration2"))
            with patch.object(compare_waves, "load_cohort", side_effect=[(rows, manifests[0], []),
                                                                            (rows, manifests[1], []),
                                                                            (rows, manifests[2], [])]), \
                 patch.object(compare_waves, "validate_pair", return_value=[]):
                text = compare_waves.comparison(waves, base, iteration)
        self.assertLess(text.index("| clone | iteration2 |"), text.index("| clone | baseline |"))
        self.assertLess(text.index("## Gate table"), text.index("| pilot | cohort |"))


if __name__ == "__main__":
    unittest.main()
