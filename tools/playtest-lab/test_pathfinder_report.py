import gzip
import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).parent))
import pathfinder_report as pf
import report


def run(pilot="hunter-ace", seed=1, *, first=12, gap=18, hunt=300, censored=False,
        passes=4, envelope=1, kills=2, relays=2, denied=0, events=None, attempts=1,
        releases=1, non_loop_gap=None, loops=0):
    p = {
        "firstGunWindowSeconds": first, "longestGunWindowGapSeconds": gap,
        "longestNonLoopGunWindowGapSeconds": gap if non_loop_gap is None else non_loop_gap,
        "deliberateLoopSeconds": loops,
        "gunWindowSeconds": 16, "gunWindows": 3, "huntSeconds": hunt,
        "huntCensored": censored, "passes": passes, "envelopeOnlyPasses": envelope,
        "envelopeOnlyPassPct": 100 * envelope / passes if passes else None,
        "missedPasses": 0, "gondolaKills": kills, "droneReleases": releases,
        "droneKills": 0, "droneReleaseAttempts": attempts, "droneReleaseRejected": 0,
        "roeDecisions": 3, "roeViolations": 0, "sectorsDenied": denied,
        "relayCount": relays, "safeKills": kills,
    }
    return {"pilot": pilot, "seed": seed, "pathfinder": p, "events": events or []}


class PathfinderReportTests(unittest.TestCase):
    def test_targets_flags_and_zero_kill_denominator(self):
        r = run(first=None, gap=31, hunt=100, kills=0, passes=0, attempts=0)
        flags = pf.flags([r])
        self.assertTrue(any("first gun window" in x for x in flags))
        self.assertTrue(any("drought" in x for x in flags))
        self.assertTrue(any("hunt outside" in x for x in flags))
        self.assertEqual(pf.aggregate([r])["envelopeOnlyPassPct"], None)
        self.assertEqual(pf.aggregate([r])["kills"], 0)
        self.assertTrue(any("Zero-kill" in x for x in pf.top_problems([r])))

    def test_loop_excluded_gap_drives_target_flag_but_raw_gap_is_retained(self):
        r = run(gap=90, non_loop_gap=18, loops=72)
        self.assertFalse(any("drought" in x for x in pf.flags([r])))
        a = pf.aggregate([r])
        self.assertEqual(a["longestGunWindowGapSeconds"], 90)
        self.assertEqual(a["longestNonLoopGunWindowGapSeconds"], 18)

    def test_censored_hunt_is_excluded_from_hunt_target_denominator(self):
        a = pf.aggregate([run(hunt=300), run(seed=2, hunt=999, censored=True)])
        self.assertEqual(a["complete"], 1)
        self.assertEqual(a["censored"], 1)
        self.assertEqual(a["huntTargetPct"], 100)

    def test_coverage_flags_for_novice_and_ace(self):
        novice = [run("hunter-novice", seed=i, denied=0) for i in range(2)]
        ace = [run("hunter-ace", seed=i, kills=2, relays=2, denied=2) for i in range(2)]
        fs = pf.flags(novice + ace)
        self.assertTrue(any("novice denied no relay in 2-run sample" in x for x in fs))
        self.assertTrue(any("ace cleared every" in x for x in fs))

    def test_events_are_bucketed_and_svg_has_exact_tooltips(self):
        events = [
            {"kind": "pathfinder:relay-in-view", "second": 1.25, "target": "relay:1", "count": 1},
            {"kind": "pathfinder:gun-window-open", "seconds": 61.5, "target": "relay:1", "count": 1},
            {"kind": "pathfinder:gun-window-closed", "seconds": 64.0, "target": "relay:1", "count": 1},
        ]
        r = run(events=events)
        rows = pf.minute_events([r])
        self.assertEqual(len(rows), 5)  # quiet hunt minutes are retained
        self.assertEqual(rows[0]["relay-in-view"], 1)
        self.assertEqual(rows[1]["gun-window-open"], 1)
        self.assertAlmostEqual(rows[1]["gunWindowSeconds"], 2.5)
        svg = pf.svg_timeline([r])
        self.assertTrue(svg.startswith("<svg "))
        self.assertIn("t=1.250s", svg)
        self.assertIn("relay-in-view", svg)
        self.assertIn("<title>", svg)
        self.assertIn("gun window 61.500s–64.000s", svg)

    def test_no_window_markdown_is_renderable(self):
        r = run(first=None, censored=True, hunt=None, passes=0, attempts=0)
        text = pf.markdown([r])
        self.assertIn("first sight window mean", text)
        self.assertIn("—", text)
        self.assertIn("0/1", text)  # complete/censored hunt counts

    def test_markdown_has_headline_verdict_and_minute_table(self):
        text = pf.markdown([run(events=[{"kind": "pathfinder:egress", "seconds": 240}])], {"beat": 15})
        self.assertIn("Headline metrics vs targets", text)
        self.assertIn("Fun verdict", text)
        self.assertIn("Opportunities/events by minute", text)
        self.assertIn("timeline.svg", text)

    def test_missing_windows_count_against_observed_target_rate(self):
        a = pf.aggregate([run(first=12), run(first=None)])
        self.assertEqual(a["firstGunWindowTargetPct"], 50)
        self.assertFalse(any("ace cleared every" in f for f in pf.flags([run(censored=True)])))

    def test_window_crossing_minute_boundary_splits_duration(self):
        r = run(events=[{"kind":"pathfinder:gun-window-open", "second":59.5},
                        {"kind":"pathfinder:gun-window-closed", "second":60.5}])
        rows = pf.minute_events([r])
        self.assertEqual(rows[0]["gunWindowSeconds"], .5)
        self.assertEqual(rows[1]["gunWindowSeconds"], .5)

    def test_generic_report_exposes_pathfinder_summary_json(self):
        with tempfile.TemporaryDirectory() as d:
            root = Path(d); (root / "runs").mkdir()
            with gzip.open(root / "runs" / "r.json.gz", "wt") as f: json.dump(run(), f)
            (root / "manifest.json").write_text(json.dumps({"beat": 15, "runs": ["runs/r.json.gz"]}))
            summary, text = report.make_report(root)
            self.assertIn("pathfinderFlags", summary)
            self.assertIn("hunter-ace", summary["pathfinderPilots"])
            self.assertLess(text.index("Headline metrics vs targets"), text.index("At a glance"))


if __name__ == "__main__":
    unittest.main()
