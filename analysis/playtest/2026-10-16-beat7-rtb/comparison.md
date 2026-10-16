# Beat 7: perceived RTB comparison

Each cohort is **3 pilots × 30 paired seeds (0–29)**. Every cell with a slash is **perceived / simulated**. Length is the mean; dead air is the longest contiguous streak across the cohort. Shares pool durations; combat = merge + fight + defensive. Baseline ran at 1×.

| Cohort | Mean sortie (s) | Longest dead air (s) | Combat % | RTB % | Approach % | Landing % | Other % |
|---|---:|---:|---:|---:|---:|---:|---:|
| Baseline | 777.9 / 777.9 | 836.2 / 836.2 | 26.2 / 26.2 | 57.6 / 57.6 | 13.9 / 13.9 | 1.3 / 1.3 | 1.0 / 1.0 |
| Land + compression | 783.7 / 813.6 | 1657.8 / 1709.6 | 26.0 / 25.0 | 61.1 / 62.6 | 10.6 / 10.2 | 1.3 / 1.3 | 1.0 / 0.9 |
| End after combat | 625.8 / 642.3 | 1657.8 / 1709.6 | 32.5 / 31.7 | 57.8 / 58.9 | 7.7 / 7.5 | 0.8 / 0.7 | 1.2 / 1.2 |
| Land + RTB autopilot | 367.1 / 808.8 | 532.1 / 1866.2 | 55.5 / 25.2 | 27.8 / 67.2 | 11.8 / 5.3 | 2.9 / 1.3 | 2.1 / 0.9 |

The new default-land AP cohort averages **367.1 perceived seconds**, with **27.8% RTB** and **55.5% combat**. Against the earlier landing/compression cohort, perceived length falls **783.7 → 367.1 s** (53.2%).

**Tests: 184 xUnit + 50 node + 12 Python passed; 0 failures.** The lab self-test also passed, including hands-off AP, safety drop and cleared-condition retry. See [autopilot validation](autopilot-validation.md).

| Pilot / cohort | Mean sortie (s) | Longest dead air (s) | Combat % | Landed | Ended early |
|---|---:|---:|---:|---:|---:|
| clone / Baseline | 50.8 / 50.8 | 38.1 / 38.1 | 88.5 / 88.5 | 0 | 0 |
| clone / Land + compression | 50.8 / 50.8 | 38.0 / 38.0 | 88.5 / 88.5 | 0 | 0 |
| clone / End after combat | 50.8 / 50.8 | 38.0 / 38.0 | 88.5 / 88.5 | 0 | 0 |
| clone / Land + RTB autopilot | 50.8 / 50.8 | 38.0 / 38.0 | 88.5 / 88.5 | 0 | 0 |
| novice / Baseline | 1712.5 / 1712.5 | 836.2 / 836.2 | 32.0 / 32.0 | 26 | 0 |
| novice / Land + compression | 1803.7 / 1853.0 | 1657.8 / 1709.6 | 30.4 / 29.5 | 26 | 0 |
| novice / End after combat | 1803.7 / 1853.0 | 1657.8 / 1709.6 | 30.4 / 29.5 | 26 | 0 |
| novice / Land + RTB autopilot | 844.2 / 1845.3 | 532.1 / 1866.2 | 64.9 / 29.7 | 26 | 0 |
| ace / Baseline | 570.4 / 570.4 | 195.2 / 195.2 | 3.2 / 3.2 | 30 | 0 |
| ace / Land + compression | 496.6 / 536.8 | 218.8 / 266.2 | 3.7 / 3.4 | 30 | 0 |
| ace / End after combat | 22.9 / 22.9 | 7.5 / 7.5 | 80.3 / 80.3 | 0 | 30 |
| ace / Land + RTB autopilot | 206.3 / 530.2 | 66.1 / 331.6 | 8.9 / 3.5 | 30 | 0 |

Ace mean: **570.4 → 496.6 → 206.3 perceived seconds** (baseline → manual compression → hands-off AP). The latest ace cohort has 30/30 physical landings. End-after-combat remains a separate earlier experiment: 22.9 s, with no landing credit.

AP reaches 8× in **56/90 runs**. Time weighting removes **441.7 seconds per sortie** on the new flown trajectories, versus 29.8 s previously. Mean simulated length changes **813.6 → 808.8 s**. AP uses the existing ingress/straight-in steering continuously and hands landing configuration back at final; ownership changes the trajectory, so the baseline delta is not compression alone.

Latest cohort: **90/90 Finished, 0 timeouts, 56 physical landings, 0 early Ends**. Longest dead air is **532.1 perceived seconds**, versus 1657.8 s in the earlier landing cohort. Clone still crashes in all 30 seeds; its short duration is not a successful experience or evidence about the owner's human performance.

Every new tape passed [the AP audit](audit-autopilot.py): exact pilot/seed coverage; continuous player/sim bins; factor, phase, counter and event conservation; default land mode; source and clone hash; and unchanged paired combat durations, kills, hits given, rounds fired and combat completion. Full individual phases and raw tapes are linked below.

Perceived time is continuous native tick weighting (`dt / pre-tick factor`), not measured browser frame timing. `wallSeconds` remains execution elapsed time. No HUD viewport screenshot pass is claimed: sandbox permissions blocked headless Chromium.

- [Baseline report](../2026-10-16-beat7/report.md), source `2cc258ff`.
- [Earlier land + compression](land/report.md) and [End after combat](end-after-combat/report.md), source `ecbba84190b6ba7f356d536d1f653045d745f3eb`.
- [New land + RTB autopilot](land-autopilot/report.md), source `ee5853bc7c81e86fa990b6bff0ac3e5924a8e150`.
- All cohorts retain clone SHA-256 `a1ac519084ac414a873933838e4cd00dc816ed9c92fcd4a2b962fad56ba039ef`.
- [Earlier validation and measurement limits](validation.md); [AP validation](autopilot-validation.md).
