import gzip, json, tempfile, unittest
from pathlib import Path
import sys
sys.path.insert(0, str(Path(__file__).parent))
import report

def run(seed=1, pilot="novice", outcome="loss", e2=True):
    tl = [{"second":0,"duration":0.5,"phase":"setup","engagement":0,"tension":0,"deadAirSeconds":0}, {"second":1,"duration":1,"phase":"fight","engagement":1,"tension":.2,"deadAirSeconds":21,"kills":1,"hitsGiven":2}, {"second":2,"duration":1,"phase":"fight","engagement":2 if e2 else 0,"tension":.1,"deadAirSeconds":0}]
    return {"pilot":pilot,"seed":seed,"outcome":outcome,"timeline":tl,"timeToFirstAction":31,"deadAirSeconds":21,"longestDeadAirSeconds":21,"phaseSeconds":{"fight":2,"RTB":3},"kills":1,"hitsGiven":2,"hitsTaken":1,"nearMisses":0,"shotNearMisses":2,"groundNearMisses":1,"engagementTensions":[{"engagement":1,"seconds":4,"mean":.8},{"engagement":2,"seconds":1,"mean":.2}] if e2 else []}

class ReportTests(unittest.TestCase):
    def test_flags_and_missing_engagement(self):
        self.assertTrue(any("dead air" in x for x in report.flags([run()])))
        self.assertTrue(any("first action" in x for x in report.flags([run()])))
        self.assertFalse(any("tension not rising" in x for x in report.flags([run(e2=False)])))

    def test_exact_engagement_summary_and_weighted_fallback(self):
        r = run()
        self.assertEqual(report.tension(r, 1), .8)
        r.pop("engagementTensions")
        self.assertAlmostEqual(report.tension(r, 1), .2, places=3)

    def test_aggregate_metrics(self):
        a = report.aggregate([run(outcome="win"), run(seed=2, outcome="crash")])
        self.assertEqual(a["hitsGiven"], 4); self.assertEqual(a["hitsTaken"], 2)
        self.assertEqual(a["shotNearMisses"], 4); self.assertAlmostEqual(a["decisionsPerMinute"], 0)
        self.assertEqual(a["outcomes"], {"win": 1, "loss": 0, "crash": 1, "recovered": 0, "draw": 0})
        self.assertEqual(a["escalationPaired"], 2); self.assertEqual(a["escalationRisingPct"], 0)

    def test_all_censored_flag_and_paired_escalation(self):
        r1, r2 = run(outcome="incomplete"), run(seed=2, outcome="incomplete")
        self.assertTrue(any("all runs censored" in x for x in report.flags([r1, r2])))
        r2["engagementTensions"][1]["mean"] = .9
        a = report.aggregate([r1, r2])
        self.assertEqual(a["escalationPaired"], 2); self.assertEqual(a["escalationRisingPct"], 50)
        self.assertAlmostEqual(a["escalationMeanDelta"], -.25)

    def test_outcome_denominator_ignores_incomplete(self):
        a = report.aggregate([run(outcome="win"), run(seed=2, outcome="incomplete")])
        self.assertEqual(a["complete"], 1); self.assertEqual(a["censored"], 1); self.assertEqual(a["winRate"], 1)

    def test_svg_xml_escaping_and_partial_duration(self):
        r = run(pilot="<novice>"); s = report.svg_strip([r])
        self.assertTrue(s.startswith("<svg ")); self.assertIn("&lt;novice&gt;", s); self.assertIn('width="182.00"', s)
        self.assertIn("one-second bin counts", s); self.assertIn("polyline", s)

    def test_cli_artifacts(self):
        with tempfile.TemporaryDirectory() as d:
            root=Path(d); (root/"runs").mkdir(); p=root/"runs"/"r.json.gz"
            with gzip.open(p,"wt") as f: json.dump(run(),f)
            (root/"manifest.json").write_text(json.dumps({"schemaVersion":1,"date":"x","beat":7,"runs":["runs/r.json.gz"]}))
            summary, md=report.make_report(root); (root/"report.md").write_text(md); self.assertTrue("Pilot metrics" in md); self.assertEqual(summary["runs"],1)

if __name__ == "__main__": unittest.main()
