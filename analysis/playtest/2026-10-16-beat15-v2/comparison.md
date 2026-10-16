| Measure / target | Original cohort | V2: 30 paired seeds per pilot | Assessment |
|---|---|---|---|
| First sight window ≤20 s | Ace 18/30; novice 0/30; reckless 18/30 | Ace **10/30**; novice **30/30**; reckless **10/30** | Novice meets; ace/reckless regress on the strict cue metric |
| First range encounter near 15 s | Mean 17.6 s for each pilot | Mean **14.9–15.0 s**, present in 90/90 runs | Geometry meets; proximity is not a sight solution |
| Longest window gap ≤30 s, except deliberate loops | Worst **600.0 s** | Worst **300.0 s raw**, **232.6 s excluding loops**; 0/90 meet | **Unmet** |
| Miss-and-loop cost about 60–90 s | No useful follow-up lane | First completed return to 12 km: novice **100.0–171.3 s**, reckless **98.1–209.2 s** | **Unmet**, even before a new firing pass |
| Hunt 4–6 min | Ace/reckless mean 600.0 s; novice 548.3 s | **84/90** reach the 300 s deadline; six reckless losses end hunts at 200.1–231.2 s | Mostly meets duration, through a deadline rather than sustained action |
| Ace denies 2–3 most runs, not always 3 | Exactly 1 in 30/30 | Exactly **2 in 30/30**: one player-gun kill and one drone kill | Meets count; still no variation in ace denial total |
| Novice denies ≥1 in a meaningful share | **3/30 (10%)** | **13/30 (43%)** | Improved |
| Novice envelope-only passes present | **0** | **17 passes in 17/30 runs**; 17/82 completed passes | Present |
| Reckless ROE violations; ace makes a real choice | **0** violations; no blocked-town encounter | Reckless **4 violations in 4 runs**; ace **30 town declines**, 90 classification decisions, **0 violations** | Present |
| Drone kills >0 | 0 releases / 0 kills | **30 releases / 30 own-gun kills** | Meets |
| Phase 1 ends in debrief | 0/90 finished; all censored at 3600 s | **90/90 finished**, 0 censored: 84 deadline endings plus six physical losses | Meets completion; recovery was not simulated as a success |

The requested mechanics are implemented, but the pacing acceptance is **not met**. The forward
chain removes the impossible lateral chase: the three authored relays are 17 km from the short
start, then 28 km apart, with small bends and seeded drift. It produces an opening encounter at
15 seconds and two physical ace denials. It does not solve the long quiet tail after the ace
declines the town relay, or establish a 60–90 second physical reattack.

These are automated controller observations, not a human fun verdict. Both cohorts use beat 15,
the same three pilot names and paired seeds 0–29. V2 changes mission geometry, controller behavior,
drone availability and the end condition together; the comparison does not isolate a single cause.
The original emergency limit was 3600 seconds; V2 uses 360 seconds, beyond its 300-second deadline.

The strict sight-window definition is unchanged: selected live gondola, loaded/authorized gun,
instantaneous ballistic cue, range ≤900 m. Dispersed projectiles can hit the component box without
meeting that conservative cue. That happened repeatedly here: the ace killed relay 1 in all 30
runs, but saw an opening strict cue in only ten. No dwell-qualified HUD cue was observed inside
900 m. The
range-only cross-check is reported separately and is not substituted for the failed sight metric.

| Pilot | Longest gap: raw / excluding loops | Mean hunt | Denial distribution | ROE violations | Sortie outcome |
|---|---:|---:|---|---:|---|
| Ace | 300.0 / 232.6 s | 300.0 s | 2: 30 runs | 0 | 30 wins |
| Novice | 284.6 / 136.1 s | 300.0 s | 0: 17; 1: 13 | 0 | 13 wins; 17 draws |
| Reckless | 300.0 / 137.6 s | 283.8 s | 1: 26; 2: 4 | 4 | 20 wins; 4 draws; 6 crashes |

The novice first aims at the envelope centroid, reacts to visible leak feedback after a seeded
delay, and tries the gondola on subsequent passes. Its 13 denials are first-pass physical hits
while firing that burst, not evidence that the later gondola correction is learned successfully.
The other 17 runs retain the intended envelope-only lesson. None of these kills or leaks is
injected by the lab.

Relay 2's debris is populated at the default arrival around H+40 seconds. Fixed town districts
leave a nominal H+85–110 second clear interval; tests cover blocked → clear → blocked timing and
an actual default-lane arrival. The ace declines this relay and never returns during the clear
interval. The decision is real, but the controller currently turns that skip into idle time
after its drone kills relay 3 around H+67–70 seconds. That is the largest remaining pacing defect.

Loop intervals begin on a public override turn command and end on forward reacquisition inside
12 km, not on a timer. The first completed intervals have medians of 129.1 seconds for novice and
158.2 seconds for reckless. Thirteen reckless loops remain open when the hunt ends by deadline or
loss. The ace's 30 short loop intervals are cancelled by its drone killing the assigned relay;
they are not successful reattacks. Raw gaps remain visible so loop exclusion cannot conceal the
overall inactivity. Banking before pulling improved energy retention, but the tested controller
still loses too much energy and altitude on some turns; six reckless sorties crash.

The next tuning pass needs a useful decision after a town decline, an energy-preserving physical
return to the lane, and agreement between the sight cue and a shootable gondola pass. The fixed
three-relay count, 25–35 second forward spacing and immediate all-resolved ending also permit a
clean hunt much shorter than four minutes. Extending a successful hunt with idle flight would
not satisfy the pacing intent.

Evidence: [full V2 report](report.md), [timeline](timeline.svg), [summary](summary.json),
[manifest and run list](manifest.json), [validation](validation.md),
[original report](../2026-10-16-beat15/report.md). V2 source is
`df8fc8808824d100f7150e59f06032df8e5717d0`; original source is
`f534aa8218bd0adb31bef0f044b17f94901d5028`. Assembly hashes are in the manifest.
