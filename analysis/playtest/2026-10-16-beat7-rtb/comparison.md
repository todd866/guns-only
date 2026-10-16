# Beat 7: perceived RTB comparison

Each cohort is **3 pilots × 30 paired seeds (0–29)**. Every cell with a slash is **perceived / simulated**. The baseline ran at 1×. Length is the mean; dead air is the longest contiguous streak across the cohort. Shares pool durations; combat = merge + fight + defensive.

| Cohort | Mean sortie (s) | Longest dead air (s) | Combat % | RTB % | Approach % | Landing % | Other % |
|---|---:|---:|---:|---:|---:|---:|---:|
| Baseline | 777.9 / 777.9 | 836.2 / 836.2 | 26.2 / 26.2 | 57.6 / 57.6 | 13.9 / 13.9 | 1.3 / 1.3 | 1.0 / 1.0 |
| Land + compression | 783.7 / 813.6 | 1657.8 / 1709.6 | 26.0 / 25.0 | 61.1 / 62.6 | 10.6 / 10.2 | 1.3 / 1.3 | 1.0 / 0.9 |
| End after combat | 625.8 / 642.3 | 1657.8 / 1709.6 | 32.5 / 31.7 | 57.8 / 58.9 | 7.7 / 7.5 | 0.8 / 0.7 | 1.2 / 1.2 |

Other = setup + transit + dead/wreck + finished. Full individual phase shares and raw tapes are in the linked reports below.

| Pilot / cohort | Mean sortie (s) | Longest dead air (s) | Combat % | Landed | Ended early |
|---|---:|---:|---:|---:|---:|
| clone / Baseline | 50.8 / 50.8 | 38.1 / 38.1 | 88.5 / 88.5 | 0 | 0 |
| clone / Land + compression | 50.8 / 50.8 | 38.0 / 38.0 | 88.5 / 88.5 | 0 | 0 |
| clone / End after combat | 50.8 / 50.8 | 38.0 / 38.0 | 88.5 / 88.5 | 0 | 0 |
| novice / Baseline | 1712.5 / 1712.5 | 836.2 / 836.2 | 32.0 / 32.0 | 26 | 0 |
| novice / Land + compression | 1803.7 / 1853.0 | 1657.8 / 1709.6 | 30.4 / 29.5 | 26 | 0 |
| novice / End after combat | 1803.7 / 1853.0 | 1657.8 / 1709.6 | 30.4 / 29.5 | 26 | 0 |
| ace / Baseline | 570.4 / 570.4 | 195.2 / 195.2 | 3.2 / 3.2 | 30 | 0 |
| ace / Land + compression | 496.6 / 536.8 | 218.8 / 266.2 | 3.7 / 3.4 | 30 | 0 |
| ace / End after combat | 22.9 / 22.9 | 7.5 / 7.5 | 80.3 / 80.3 | 0 | 30 |

The ace mean falls **570.4 → 496.6 → 22.9 perceived seconds**; End preserves all 30 combat wins, raises combat share to **80.3%**, and gives **zero landing credits**. All 60 clone/novice tapes match exactly between the two new modes after removing execution elapsed time: none became eligible for End.

Compression itself removes **29.8 seconds per sortie** on the flown landing-cohort trajectories (novice 49.3 s; ace 40.2 s). 8× engages in 53/90 runs: 23 novice and all 30 ace. The revised pilot follows the published ingress until 14 km from the runway, then uses the previous straight-in join. That route/controller change adds **35.6 simulated seconds per sortie** on average versus baseline; the net perceived change is **+5.8 s**. This is not a controlled comparison of compression alone.

The longest dead air worsens **836.2 → 1,657.8 perceived seconds**, from novice seed 28 in the new cohorts. End does not help that pilot because its combat never completes. The existing clone still crashes in all 30 seeds; its short sorties are not a successful experience.

All 180 new sorties reached Finished, with **zero timeouts**. Each cohort has 30 ace wins, 26 novice recoveries, four novice combat losses, and 30 clone crashes. Landing mode has 56 physical landings; End mode has 26 landings plus 30 intentional Ends.

Perceived time is continuous native tick weighting (`dt / pre-tick factor`), not measured browser frame timing. `wallSeconds` remains execution elapsed time. Seed sets, thresholds, clone hash and new-cohort source revisions passed the comparison guard; every raw tape passed [the saved audit](audit.py).

- [Baseline report](../2026-10-16-beat7/report.md), source `2cc258ff`.
- [Land + compression](land/report.md) and [End after combat](end-after-combat/report.md), source `ecbba84190b6ba7f356d536d1f653045d745f3eb`.
- Both cohorts retain clone SHA-256 `a1ac519084ac414a873933838e4cd00dc816ed9c92fcd4a2b962fad56ba039ef`.
- [Validation and measurement limits](validation.md).
