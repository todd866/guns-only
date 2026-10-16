# Playtest Lab — beat 7

Generated 2026-10-16 · 90 runs · seed 0 · 70535.2s perceived / 73221.2s simulated · 145.2×× wall speed

## At a glance

| pilot | runs | complete | censored | win rate | mean perceived | mean simulated | flags |
|---|---:|---:|---:|---:|---:|---:|---:|
| ace | 30 | 30 | 0 | 100% | 496.6s | 536.8s | 100 |
| clone | 30 | 30 | 0 | 0% | 50.8s | 50.8s | 30 |
| novice | 30 | 30 | 0 | 0% | 1803.7s | 1853.0s | 57 |

Flag count: **187**

## Reproduction

- Command: `tools/playtest-lab/run '--beat' '7' '--seeds' '30' '--out' 'analysis/playtest/2026-10-16-beat7-rtb/land'`
- Source commit: `ecbba84190b6ba7f356d536d1f653045d745f3eb`
- Clone SHA-256: `a1ac519084ac414a873933838e4cd00dc816ed9c92fcd4a2b962fad56ba039ef`
- Wall time: 504.1388784s
- Configured max seconds: 3600

## Notes

- Experience proxies, not a claim to measure human feelings. 120 Hz production simulation; perceived-second bins preserve tick events and factor-weighted phase/dead-air durations. Perceived seconds = sum(fixed dt / pre-tick kernel factor); simulated seconds remain separate. Continuous factor-weighted experience, not exact browser frame timing or CPU WallSeconds. No renderer or wall-clock pacing.
- Fresh director per sortie; no progression imported. Seeds deterministically vary reaction latency, aim bias, and opening hands-off time; mission geometry/damage/AI rules stay authored. Paired seeds use the same perturbation draws for each pilot.
- Clone is the committed owner-pilot-clone policy (canonical features and reference-case validation), held at its training cadence of 20 Hz. Novice adapts BanditPressureReport's pursuit pilot. Ace adapts FirstMergeOpeningAcceptanceTests.HudPilot with delayed body-frame cue observations and bounded analog controls. Shared recovery and terrain escape use the existing scripted command seam; this is not a human usability study.
- Threat: live bandit within 2500 m and nose within 35 degrees, or firing; includes wingmen. Gun target: selected live target with authorized ballistic solution. Dead air: no threat, no gun opportunity, no player shot, decision, spectacle or near miss. Initial begin is not counted as a decision.
- Shot near miss: unique hostile gun round's swept separation within 25 m outside its hit radius; counted only on passage, not repeated ticks. Ground near miss: entry below 100 m AGL with 25 m hysteresis, excluding configured recovery/contact. Explosions are labelled destruction/impact proxies from session events, not renderer effects.
- RTB choice: combat complete, bingo, empty gun, or 600s combat budget, through TryRequestReturnToBase. Recovery/navigation follows the published RTB cue, releases steering during eligible 8x transit, then uses a conventional straight-in join. This is not learned owner behaviour or an overhead-pattern model. End-after-combat=False: TryEndSortie at the first eligible pilot update, without recovery credit. A 3600 simulated-second limit is censored, never a win or fabricated landing.
- Tension heuristic: 0.35 proximity + 0.15 positive closure (within threat range) + 0.25 threat + 0.15 damage-risk under threat + 0.10 low-clearance risk; clamped 0..1, near shots at least 0.85 and hits at least 0.95. Engagement means exclude RTB and terminal wreck descent. Phase percentages include wreck/debrief time.
- Default native terrain is the session's authored/default surface, without the browser's streamed terrain atlas. Ground-clearance results describe that substrate. CASEVAC uses semantic navigation for all profiles; fixed-wing clone/gun/G metrics do not apply. Generic pilots attempt every built-in beat; specialist mission failures and timeouts remain visible.

## Pilot metrics

Timing pairs are perceived / simulated; rates use perceived minutes.

| pilot | kills | hits given/taken | near misses | decisions/min | first action | dead air perceived/sim (max) | perceived/sim sortie | combat share perceived/sim | outcome distribution | entropy | paired e1→e2 | rising | mean Δ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|
| ace | 30 | 90/0 | 0 | 1.05 | 2.7s / 2.7s (0 missing) | 14619.5s / 15825.2s (max 218.8s / 266.2s) | 496.6s / 536.8s | 3.7% / 3.4% | win:30, loss:0, crash:0, recovered:0, draw:0 | -0.00 | 30 | 100% | +0.16 |
| clone | 0 | 0/0 | 30 | 4.72 | 1.5s / 1.5s (0 missing) | 1457.2s / 1457.2s (max 38.0s / 38.0s) | 50.8s / 50.8s | 88.5% / 88.5% | win:0, loss:0, crash:30, recovered:0, draw:0 | -0.00 | 0 | — | — |
| novice | 0 | 0/17 | 48 | 0.29 | 4.0s / 4.0s (0 missing) | 51887.0s / 53367.1s (max 1657.8s / 1709.6s) | 1803.7s / 1853.0s | 30.4% / 29.5% | win:0, loss:4, crash:0, recovered:26, draw:0 | 0.24 | 0 | — | — |

## Flags

- dead air >20s: clone seed 0 (37.5s perceived)
- dead air >20s: clone seed 1 (37.7s perceived)
- dead air >20s: clone seed 2 (37.4s perceived)
- dead air >20s: clone seed 3 (37.4s perceived)
- dead air >20s: clone seed 4 (37.4s perceived)
- dead air >20s: clone seed 5 (37.5s perceived)
- dead air >20s: clone seed 6 (37.4s perceived)
- dead air >20s: clone seed 7 (36.9s perceived)
- dead air >20s: clone seed 8 (37.5s perceived)
- dead air >20s: clone seed 9 (37.4s perceived)
- dead air >20s: clone seed 10 (37.6s perceived)
- dead air >20s: clone seed 11 (37.1s perceived)
- dead air >20s: clone seed 12 (38.0s perceived)
- dead air >20s: clone seed 13 (36.9s perceived)
- dead air >20s: clone seed 14 (37.4s perceived)
- dead air >20s: clone seed 15 (37.4s perceived)
- dead air >20s: clone seed 16 (37.5s perceived)
- dead air >20s: clone seed 17 (37.5s perceived)
- dead air >20s: clone seed 18 (37.6s perceived)
- dead air >20s: clone seed 19 (37.5s perceived)
- dead air >20s: clone seed 20 (37.5s perceived)
- dead air >20s: clone seed 21 (38.0s perceived)
- dead air >20s: clone seed 22 (37.5s perceived)
- dead air >20s: clone seed 23 (37.4s perceived)
- dead air >20s: clone seed 24 (37.6s perceived)
- dead air >20s: clone seed 25 (37.5s perceived)
- dead air >20s: clone seed 26 (37.6s perceived)
- dead air >20s: clone seed 27 (37.5s perceived)
- dead air >20s: clone seed 28 (37.7s perceived)
- dead air >20s: clone seed 29 (37.6s perceived)
- dead air >20s: novice seed 0 (1267.7s perceived)
- dead air >20s: novice seed 1 (400.8s perceived)
- dead air >20s: novice seed 2 (172.5s perceived)
- dead air >20s: novice seed 3 (405.1s perceived)
- dead air >20s: novice seed 4 (532.1s perceived)
- dead air >20s: novice seed 5 (484.8s perceived)
- dead air >20s: novice seed 6 (1295.7s perceived)
- dead air >20s: novice seed 7 (593.4s perceived)
- dead air >20s: novice seed 8 (1187.4s perceived)
- dead air >20s: novice seed 9 (1050.6s perceived)
- dead air >20s: novice seed 10 (824.0s perceived)
- dead air >20s: novice seed 11 (625.3s perceived)
- dead air >20s: novice seed 12 (1206.7s perceived)
- dead air >20s: novice seed 13 (1653.7s perceived)
- dead air >20s: novice seed 14 (457.6s perceived)
- dead air >20s: novice seed 15 (81.3s perceived)
- dead air >20s: novice seed 16 (544.3s perceived)
- dead air >20s: novice seed 17 (397.7s perceived)
- dead air >20s: novice seed 18 (1189.6s perceived)
- dead air >20s: novice seed 19 (1229.3s perceived)
- dead air >20s: novice seed 20 (763.3s perceived)
- dead air >20s: novice seed 21 (417.3s perceived)
- dead air >20s: novice seed 22 (601.5s perceived)
- dead air >20s: novice seed 23 (1180.9s perceived)
- dead air >20s: novice seed 24 (44.3s perceived)
- dead air >20s: novice seed 25 (1279.8s perceived)
- dead air >20s: novice seed 26 (93.0s perceived)
- dead air >20s: novice seed 27 (603.9s perceived)
- dead air >20s: novice seed 28 (1657.8s perceived)
- dead air >20s: novice seed 29 (1243.7s perceived)
- dead air >20s: ace seed 0 (135.7s perceived)
- dead air >20s: ace seed 1 (181.9s perceived)
- dead air >20s: ace seed 2 (145.9s perceived)
- dead air >20s: ace seed 3 (136.9s perceived)
- dead air >20s: ace seed 4 (139.6s perceived)
- dead air >20s: ace seed 5 (186.9s perceived)
- dead air >20s: ace seed 6 (161.8s perceived)
- dead air >20s: ace seed 7 (190.1s perceived)
- dead air >20s: ace seed 8 (180.4s perceived)
- dead air >20s: ace seed 9 (149.3s perceived)
- dead air >20s: ace seed 10 (154.8s perceived)
- dead air >20s: ace seed 11 (138.8s perceived)
- dead air >20s: ace seed 12 (168.2s perceived)
- dead air >20s: ace seed 13 (156.7s perceived)
- dead air >20s: ace seed 14 (175.8s perceived)
- dead air >20s: ace seed 15 (179.5s perceived)
- dead air >20s: ace seed 16 (170.5s perceived)
- dead air >20s: ace seed 17 (149.3s perceived)
- dead air >20s: ace seed 18 (201.8s perceived)
- dead air >20s: ace seed 19 (150.6s perceived)
- dead air >20s: ace seed 20 (155.5s perceived)
- dead air >20s: ace seed 21 (177.0s perceived)
- dead air >20s: ace seed 22 (161.2s perceived)
- dead air >20s: ace seed 23 (183.3s perceived)
- dead air >20s: ace seed 24 (135.4s perceived)
- dead air >20s: ace seed 25 (137.8s perceived)
- dead air >20s: ace seed 26 (158.2s perceived)
- dead air >20s: ace seed 27 (140.4s perceived)
- dead air >20s: ace seed 28 (184.3s perceived)
- dead air >20s: ace seed 29 (218.8s perceived)
- novice win rate 0%
- ace win rate 100%
- RTB longer than fight/defensive/merge: novice seed 0
- RTB longer than fight/defensive/merge: novice seed 1
- RTB longer than fight/defensive/merge: novice seed 3
- RTB longer than fight/defensive/merge: novice seed 4
- RTB longer than fight/defensive/merge: novice seed 5
- RTB longer than fight/defensive/merge: novice seed 6
- RTB longer than fight/defensive/merge: novice seed 7
- RTB longer than fight/defensive/merge: novice seed 8
- RTB longer than fight/defensive/merge: novice seed 9
- RTB longer than fight/defensive/merge: novice seed 10
- RTB longer than fight/defensive/merge: novice seed 11
- RTB longer than fight/defensive/merge: novice seed 12
- RTB longer than fight/defensive/merge: novice seed 13
- RTB longer than fight/defensive/merge: novice seed 14
- RTB longer than fight/defensive/merge: novice seed 16
- RTB longer than fight/defensive/merge: novice seed 17
- RTB longer than fight/defensive/merge: novice seed 18
- RTB longer than fight/defensive/merge: novice seed 19
- RTB longer than fight/defensive/merge: novice seed 20
- RTB longer than fight/defensive/merge: novice seed 21
- RTB longer than fight/defensive/merge: novice seed 22
- RTB longer than fight/defensive/merge: novice seed 23
- RTB longer than fight/defensive/merge: novice seed 25
- RTB longer than fight/defensive/merge: novice seed 27
- RTB longer than fight/defensive/merge: novice seed 28
- RTB longer than fight/defensive/merge: novice seed 29
- RTB longer than fight/defensive/merge: ace seed 0
- approach longer than fight/defensive/merge: ace seed 0
- landing longer than fight/defensive/merge: ace seed 0
- RTB longer than fight/defensive/merge: ace seed 1
- approach longer than fight/defensive/merge: ace seed 1
- RTB longer than fight/defensive/merge: ace seed 2
- approach longer than fight/defensive/merge: ace seed 2
- landing longer than fight/defensive/merge: ace seed 2
- RTB longer than fight/defensive/merge: ace seed 3
- approach longer than fight/defensive/merge: ace seed 3
- landing longer than fight/defensive/merge: ace seed 3
- RTB longer than fight/defensive/merge: ace seed 4
- approach longer than fight/defensive/merge: ace seed 4
- RTB longer than fight/defensive/merge: ace seed 5
- approach longer than fight/defensive/merge: ace seed 5
- RTB longer than fight/defensive/merge: ace seed 6
- approach longer than fight/defensive/merge: ace seed 6
- RTB longer than fight/defensive/merge: ace seed 7
- approach longer than fight/defensive/merge: ace seed 7
- RTB longer than fight/defensive/merge: ace seed 8
- approach longer than fight/defensive/merge: ace seed 8
- RTB longer than fight/defensive/merge: ace seed 9
- approach longer than fight/defensive/merge: ace seed 9
- landing longer than fight/defensive/merge: ace seed 9
- RTB longer than fight/defensive/merge: ace seed 10
- approach longer than fight/defensive/merge: ace seed 10
- landing longer than fight/defensive/merge: ace seed 10
- RTB longer than fight/defensive/merge: ace seed 11
- approach longer than fight/defensive/merge: ace seed 11
- RTB longer than fight/defensive/merge: ace seed 12
- approach longer than fight/defensive/merge: ace seed 12
- RTB longer than fight/defensive/merge: ace seed 13
- approach longer than fight/defensive/merge: ace seed 13
- RTB longer than fight/defensive/merge: ace seed 14
- approach longer than fight/defensive/merge: ace seed 14
- RTB longer than fight/defensive/merge: ace seed 15
- approach longer than fight/defensive/merge: ace seed 15
- RTB longer than fight/defensive/merge: ace seed 16
- approach longer than fight/defensive/merge: ace seed 16
- RTB longer than fight/defensive/merge: ace seed 17
- approach longer than fight/defensive/merge: ace seed 17
- landing longer than fight/defensive/merge: ace seed 17
- RTB longer than fight/defensive/merge: ace seed 18
- approach longer than fight/defensive/merge: ace seed 18
- RTB longer than fight/defensive/merge: ace seed 19
- approach longer than fight/defensive/merge: ace seed 19
- RTB longer than fight/defensive/merge: ace seed 20
- approach longer than fight/defensive/merge: ace seed 20
- RTB longer than fight/defensive/merge: ace seed 21
- approach longer than fight/defensive/merge: ace seed 21
- RTB longer than fight/defensive/merge: ace seed 22
- approach longer than fight/defensive/merge: ace seed 22
- RTB longer than fight/defensive/merge: ace seed 23
- approach longer than fight/defensive/merge: ace seed 23
- RTB longer than fight/defensive/merge: ace seed 24
- approach longer than fight/defensive/merge: ace seed 24
- landing longer than fight/defensive/merge: ace seed 24
- RTB longer than fight/defensive/merge: ace seed 25
- approach longer than fight/defensive/merge: ace seed 25
- landing longer than fight/defensive/merge: ace seed 25
- RTB longer than fight/defensive/merge: ace seed 26
- approach longer than fight/defensive/merge: ace seed 26
- RTB longer than fight/defensive/merge: ace seed 27
- approach longer than fight/defensive/merge: ace seed 27
- landing longer than fight/defensive/merge: ace seed 27
- RTB longer than fight/defensive/merge: ace seed 28
- approach longer than fight/defensive/merge: ace seed 28
- RTB longer than fight/defensive/merge: ace seed 29
- approach longer than fight/defensive/merge: ace seed 29

## Phase share

Each cell is perceived / simulated.

| pilot | setup | transit | merge | fight | defensive | RTB | approach | landing | dead | finished |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| ace | 0.2% / 0.2% | 0.7% / 0.7% | 0.8% / 0.8% | 1.4% / 1.3% | 1.5% / 1.4% | 70.9% / 73.0% | 21.2% / 19.6% | 3.3% / 3.1% | 0.0% / 0.0% | 0.0% / 0.0% |
| clone | 2.0% / 2.0% | 0.0% / 0.0% | 21.7% / 21.7% | 66.9% / 66.9% | 0.0% / 0.0% | 0.0% / 0.0% | 0.0% / 0.0% | 0.0% / 0.0% | 9.5% / 9.5% | 0.0% / 0.0% |
| novice | 0.1% / 0.1% | 0.0% / 0.0% | 0.6% / 0.6% | 25.7% / 25.0% | 4.1% / 4.0% | 60.2% / 61.2% | 8.0% / 7.8% | 0.8% / 0.8% | 0.6% / 0.6% | 0.0% / 0.0% |

## Runs by pilot

Timing pairs are perceived / simulated.

### ace

| seed | outcome | length | first action | dead air | longest dead air | decisions/min | e1/e2 tension | kills | rounds fired | hits given/taken | shot/ground near misses |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | win | 457.5s / 485.0s | 1.5s / 1.5s | 449.2s / 476.6s | 135.7s / 135.7s | 1.05 | 0.27 / 0.44 | 1 | 60 | 3/0 | 0/0 |
| 1 | win | 482.0s / 509.8s | 1.9s / 1.9s | 473.5s / 501.3s | 181.9s / 209.7s | 1.00 | 0.27 / 0.43 | 1 | 59 | 3/0 | 0/0 |
| 2 | win | 469.0s / 496.0s | 2.2s / 2.2s | 460.7s / 487.7s | 145.9s / 172.9s | 1.02 | 0.27 / 0.44 | 1 | 59 | 3/0 | 0/0 |
| 3 | win | 469.1s / 496.8s | 2.6s / 2.6s | 460.7s / 488.4s | 136.9s / 163.4s | 1.02 | 0.27 / 0.44 | 1 | 59 | 3/0 | 0/0 |
| 4 | win | 503.5s / 549.2s | 2.9s / 2.9s | 494.7s / 540.4s | 139.6s / 141.7s | 1.19 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 5 | win | 525.6s / 576.5s | 3.3s / 3.3s | 515.0s / 565.9s | 186.9s / 234.0s | 1.03 | 0.27 / 0.42 | 1 | 58 | 3/0 | 0/0 |
| 6 | win | 511.5s / 564.5s | 3.6s / 3.6s | 500.2s / 553.2s | 161.8s / 208.7s | 1.06 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 7 | win | 533.6s / 578.2s | 4.0s / 4.0s | 522.8s / 567.4s | 190.1s / 230.6s | 1.01 | 0.27 / 0.43 | 1 | 55 | 3/0 | 0/0 |
| 8 | win | 478.6s / 506.1s | 1.5s / 1.5s | 470.2s / 497.7s | 180.4s / 207.8s | 1.00 | 0.27 / 0.43 | 1 | 60 | 3/0 | 0/0 |
| 9 | win | 464.0s / 491.2s | 1.9s / 1.9s | 455.7s / 482.9s | 149.3s / 176.5s | 1.03 | 0.27 / 0.44 | 1 | 59 | 3/0 | 0/0 |
| 10 | win | 467.3s / 494.6s | 2.2s / 2.2s | 459.0s / 486.3s | 154.8s / 182.0s | 1.03 | 0.27 / 0.44 | 1 | 59 | 3/0 | 0/0 |
| 11 | win | 495.3s / 540.0s | 2.6s / 2.6s | 486.5s / 531.3s | 138.8s / 177.3s | 1.21 | 0.27 / 0.43 | 1 | 59 | 3/0 | 0/0 |
| 12 | win | 514.8s / 568.9s | 2.9s / 2.9s | 504.2s / 558.3s | 168.2s / 216.2s | 1.05 | 0.27 / 0.42 | 1 | 58 | 3/0 | 0/0 |
| 13 | win | 514.4s / 567.2s | 3.3s / 3.3s | 504.4s / 557.2s | 156.7s / 204.3s | 1.05 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 14 | win | 517.6s / 572.7s | 3.6s / 3.6s | 507.0s / 562.1s | 175.8s / 225.1s | 1.04 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 15 | win | 536.3s / 580.5s | 4.0s / 4.0s | 525.4s / 569.6s | 179.5s / 218.2s | 1.01 | 0.27 / 0.43 | 1 | 54 | 3/0 | 0/0 |
| 16 | win | 480.7s / 508.1s | 1.5s / 1.5s | 472.2s / 499.7s | 170.5s / 197.9s | 1.00 | 0.27 / 0.43 | 1 | 60 | 3/0 | 0/0 |
| 17 | win | 464.0s / 491.2s | 1.9s / 1.9s | 455.7s / 482.9s | 149.3s / 176.5s | 1.03 | 0.27 / 0.44 | 1 | 59 | 3/0 | 0/0 |
| 18 | win | 484.2s / 513.3s | 2.2s / 2.2s | 475.5s / 504.5s | 201.8s / 229.9s | 0.99 | 0.27 / 0.43 | 1 | 59 | 3/0 | 0/0 |
| 19 | win | 516.6s / 572.4s | 2.6s / 2.6s | 506.8s / 562.5s | 150.6s / 198.3s | 1.05 | 0.27 / 0.43 | 1 | 59 | 3/0 | 0/0 |
| 20 | win | 503.8s / 549.3s | 2.9s / 2.9s | 495.0s / 540.6s | 155.5s / 195.7s | 1.19 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 21 | win | 514.3s / 571.8s | 3.3s / 3.3s | 504.0s / 561.4s | 177.0s / 230.0s | 1.05 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 22 | win | 508.4s / 559.9s | 3.6s / 3.6s | 499.6s / 551.1s | 161.2s / 204.9s | 1.06 | 0.27 / 0.43 | 1 | 57 | 3/0 | 0/0 |
| 23 | win | 537.7s / 581.8s | 4.0s / 4.0s | 526.6s / 570.8s | 183.3s / 222.4s | 1.00 | 0.27 / 0.43 | 1 | 54 | 3/0 | 0/0 |
| 24 | win | 455.5s / 483.9s | 1.5s / 1.5s | 447.2s / 475.6s | 135.4s / 148.3s | 1.05 | 0.27 / 0.44 | 1 | 60 | 3/0 | 0/0 |
| 25 | win | 471.6s / 498.9s | 1.9s / 1.9s | 463.2s / 490.5s | 137.8s / 152.3s | 1.02 | 0.27 / 0.44 | 1 | 59 | 3/0 | 0/0 |
| 26 | win | 507.0s / 557.4s | 2.2s / 2.2s | 498.3s / 548.7s | 158.2s / 201.5s | 1.07 | 0.27 / 0.42 | 1 | 59 | 3/0 | 0/0 |
| 27 | win | 460.4s / 485.2s | 2.6s / 2.6s | 451.9s / 476.6s | 140.4s / 165.2s | 1.04 | 0.27 / 0.45 | 1 | 59 | 3/0 | 0/0 |
| 28 | win | 526.9s / 576.9s | 2.9s / 2.9s | 516.5s / 566.5s | 184.3s / 230.6s | 1.02 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 29 | win | 528.0s / 577.8s | 3.3s / 3.3s | 517.8s / 567.5s | 218.8s / 266.2s | 1.02 | 0.27 / 0.42 | 1 | 58 | 3/0 | 0/0 |

### clone

| seed | outcome | length | first action | dead air | longest dead air | decisions/min | e1/e2 tension | kills | rounds fired | hits given/taken | shot/ground near misses |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | crash | 50.8s / 50.8s | 1.2s / 1.2s | 48.5s / 48.5s | 37.5s / 37.5s | 4.73 | — | 0 | 266 | 0/0 | 0/1 |
| 1 | crash | 51.2s / 51.2s | 1.8s / 1.8s | 48.9s / 48.9s | 37.7s / 37.7s | 4.69 | — | 0 | 266 | 0/0 | 0/1 |
| 2 | crash | 50.9s / 50.9s | 1.5s / 1.6s | 48.6s / 48.6s | 37.4s / 37.4s | 4.72 | — | 0 | 266 | 0/0 | 0/1 |
| 3 | crash | 50.6s / 50.6s | 1.1s / 1.1s | 48.3s / 48.3s | 37.4s / 37.4s | 4.74 | — | 0 | 266 | 0/0 | 0/1 |
| 4 | crash | 50.9s / 50.9s | 1.5s / 1.6s | 48.6s / 48.6s | 37.4s / 37.4s | 4.72 | — | 0 | 266 | 0/0 | 0/1 |
| 5 | crash | 50.8s / 50.8s | 1.2s / 1.2s | 48.5s / 48.5s | 37.5s / 37.5s | 4.73 | — | 0 | 266 | 0/0 | 0/1 |
| 6 | crash | 50.9s / 50.9s | 1.5s / 1.6s | 48.6s / 48.6s | 37.4s / 37.4s | 4.72 | — | 0 | 266 | 0/0 | 0/1 |
| 7 | crash | 49.7s / 49.8s | 0.9s / 0.9s | 47.5s / 47.5s | 36.9s / 36.9s | 4.82 | — | 0 | 266 | 0/0 | 0/1 |
| 8 | crash | 50.8s / 50.8s | 1.2s / 1.2s | 48.5s / 48.5s | 37.5s / 37.5s | 4.73 | — | 0 | 266 | 0/0 | 0/1 |
| 9 | crash | 50.6s / 50.6s | 1.1s / 1.1s | 48.3s / 48.3s | 37.4s / 37.4s | 4.74 | — | 0 | 266 | 0/0 | 0/1 |
| 10 | crash | 51.0s / 51.0s | 1.3s / 1.3s | 48.7s / 48.7s | 37.6s / 37.6s | 4.70 | — | 0 | 266 | 0/0 | 0/1 |
| 11 | crash | 50.2s / 50.2s | 1.1s / 1.1s | 47.9s / 47.9s | 37.1s / 37.1s | 4.78 | — | 0 | 266 | 0/0 | 0/1 |
| 12 | crash | 51.6s / 51.6s | 1.9s / 1.9s | 49.3s / 49.3s | 38.0s / 38.0s | 4.65 | — | 0 | 266 | 0/0 | 0/1 |
| 13 | crash | 49.7s / 49.7s | 0.9s / 0.9s | 47.4s / 47.4s | 36.9s / 36.9s | 4.83 | — | 0 | 266 | 0/0 | 0/1 |
| 14 | crash | 50.6s / 50.6s | 1.1s / 1.1s | 48.3s / 48.3s | 37.4s / 37.4s | 4.74 | — | 0 | 266 | 0/0 | 0/1 |
| 15 | crash | 50.8s / 50.8s | 1.5s / 1.5s | 48.5s / 48.5s | 37.4s / 37.4s | 4.73 | — | 0 | 266 | 0/0 | 0/1 |
| 16 | crash | 51.0s / 51.0s | 1.8s / 1.8s | 48.8s / 48.8s | 37.5s / 37.5s | 4.70 | — | 0 | 266 | 0/0 | 0/1 |
| 17 | crash | 51.0s / 51.0s | 1.7s / 1.7s | 48.7s / 48.7s | 37.5s / 37.5s | 4.71 | — | 0 | 266 | 0/0 | 0/1 |
| 18 | crash | 51.0s / 51.0s | 1.4s / 1.4s | 48.7s / 48.7s | 37.6s / 37.6s | 4.70 | — | 0 | 271 | 0/0 | 0/1 |
| 19 | crash | 50.9s / 50.9s | 1.7s / 1.8s | 48.6s / 48.6s | 37.5s / 37.5s | 4.72 | — | 0 | 266 | 0/0 | 0/1 |
| 20 | crash | 50.9s / 50.9s | 1.7s / 1.8s | 48.6s / 48.6s | 37.5s / 37.5s | 4.72 | — | 0 | 266 | 0/0 | 0/1 |
| 21 | crash | 51.6s / 51.6s | 2.0s / 2.0s | 49.4s / 49.4s | 38.0s / 38.0s | 4.65 | — | 0 | 261 | 0/0 | 0/1 |
| 22 | crash | 50.9s / 50.9s | 1.3s / 1.4s | 48.7s / 48.7s | 37.5s / 37.5s | 4.71 | — | 0 | 266 | 0/0 | 0/1 |
| 23 | crash | 50.8s / 50.8s | 1.5s / 1.5s | 48.5s / 48.5s | 37.4s / 37.4s | 4.73 | — | 0 | 266 | 0/0 | 0/1 |
| 24 | crash | 51.0s / 51.0s | 1.4s / 1.4s | 48.7s / 48.7s | 37.6s / 37.6s | 4.71 | — | 0 | 266 | 0/0 | 0/1 |
| 25 | crash | 51.0s / 51.0s | 1.8s / 1.8s | 48.8s / 48.8s | 37.5s / 37.5s | 4.70 | — | 0 | 266 | 0/0 | 0/1 |
| 26 | crash | 51.0s / 51.0s | 1.3s / 1.3s | 48.7s / 48.7s | 37.6s / 37.6s | 4.70 | — | 0 | 266 | 0/0 | 0/1 |
| 27 | crash | 51.0s / 51.0s | 1.6s / 1.6s | 48.7s / 48.7s | 37.5s / 37.5s | 4.71 | — | 0 | 266 | 0/0 | 0/1 |
| 28 | crash | 51.2s / 51.2s | 1.6s / 1.6s | 49.0s / 49.0s | 37.7s / 37.7s | 4.68 | — | 0 | 266 | 0/0 | 0/1 |
| 29 | crash | 51.0s / 51.0s | 1.3s / 1.3s | 48.7s / 48.7s | 37.6s / 37.6s | 4.70 | — | 0 | 266 | 0/0 | 0/1 |

### novice

| seed | outcome | length | first action | dead air | longest dead air | decisions/min | e1/e2 tension | kills | rounds fired | hits given/taken | shot/ground near misses |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | recovered | 2462.7s / 2478.8s | 3.3s / 3.3s | 2391.9s / 2408.0s | 1267.7s / 1283.8s | 0.19 | — | 0 | 0 | 0/1 | 0/0 |
| 1 | recovered | 1752.6s / 1882.0s | 5.0s / 5.0s | 1665.8s / 1795.2s | 400.8s / 400.8s | 0.45 | — | 0 | 0 | 0/0 | 0/0 |
| 2 | loss | 465.3s / 465.3s | 4.2s / 4.2s | 373.4s / 373.4s | 172.5s / 172.5s | 0.13 | — | 0 | 0 | 0/3 | 11/0 |
| 3 | recovered | 1601.5s / 1896.7s | 3.2s / 3.2s | 1541.3s / 1836.3s | 405.1s / 405.1s | 1.39 | — | 0 | 0 | 0/2 | 7/0 |
| 4 | recovered | 1580.5s / 1753.1s | 4.2s / 4.2s | 1545.8s / 1718.3s | 532.1s / 532.1s | 0.68 | — | 0 | 0 | 0/1 | 0/0 |
| 5 | recovered | 1903.6s / 1905.6s | 3.3s / 3.3s | 1815.4s / 1817.3s | 484.8s / 484.8s | 0.25 | — | 0 | 0 | 0/0 | 3/0 |
| 6 | recovered | 2223.9s / 2236.9s | 4.2s / 4.2s | 2157.2s / 2170.2s | 1295.7s / 1308.7s | 0.16 | — | 0 | 0 | 0/0 | 0/0 |
| 7 | recovered | 2224.7s / 2311.9s | 2.7s / 2.7s | 2165.0s / 2252.1s | 593.4s / 678.3s | 0.30 | — | 0 | 0 | 0/0 | 0/0 |
| 8 | recovered | 2152.2s / 2157.8s | 3.3s / 3.3s | 2074.6s / 2080.2s | 1187.4s / 1193.0s | 0.17 | — | 0 | 0 | 0/0 | 0/0 |
| 9 | recovered | 2131.9s / 2141.3s | 3.2s / 3.2s | 2075.3s / 2084.7s | 1050.6s / 1060.0s | 0.17 | — | 0 | 0 | 0/0 | 0/0 |
| 10 | recovered | 2104.0s / 2114.8s | 3.5s / 3.5s | 1993.4s / 2004.2s | 824.0s / 834.8s | 0.23 | — | 0 | 0 | 0/0 | 0/0 |
| 11 | recovered | 2060.0s / 2060.0s | 3.1s / 3.1s | 2009.4s / 2009.4s | 625.3s / 625.3s | 0.17 | — | 0 | 0 | 0/0 | 16/0 |
| 12 | recovered | 2105.9s / 2129.3s | 5.3s / 5.2s | 2040.6s / 2064.0s | 1206.7s / 1230.1s | 0.17 | — | 0 | 0 | 0/0 | 3/0 |
| 13 | recovered | 2525.1s / 2577.6s | 2.5s / 2.5s | 2487.9s / 2540.3s | 1653.7s / 1706.1s | 0.19 | — | 0 | 0 | 0/0 | 3/0 |
| 14 | recovered | 1714.7s / 1965.8s | 3.2s / 3.2s | 1652.6s / 1903.7s | 457.6s / 457.6s | 0.59 | — | 0 | 0 | 0/0 | 0/0 |
| 15 | loss | 137.0s / 137.0s | 4.1s / 4.1s | 103.8s / 103.8s | 81.3s / 81.3s | 0.44 | — | 0 | 0 | 0/3 | 1/0 |
| 16 | recovered | 1869.8s / 1869.8s | 4.8s / 4.8s | 1757.7s / 1757.7s | 544.3s / 544.3s | 0.22 | — | 0 | 0 | 0/0 | 2/0 |
| 17 | recovered | 1558.1s / 1788.9s | 4.5s / 4.5s | 1503.5s / 1734.3s | 397.7s / 397.7s | 0.89 | — | 0 | 0 | 0/0 | 0/0 |
| 18 | recovered | 2112.0s / 2123.4s | 3.8s / 3.8s | 2044.3s / 2055.6s | 1189.6s / 1201.0s | 0.17 | — | 0 | 0 | 0/0 | 0/0 |
| 19 | recovered | 2275.0s / 2285.6s | 4.7s / 4.7s | 2175.8s / 2186.4s | 1229.3s / 1239.9s | 0.16 | — | 0 | 0 | 0/0 | 1/0 |
| 20 | recovered | 2312.5s / 2317.0s | 4.8s / 4.8s | 2259.7s / 2264.2s | 763.3s / 767.8s | 0.21 | — | 0 | 0 | 0/0 | 0/0 |
| 21 | recovered | 1567.2s / 1617.0s | 5.5s / 5.5s | 1465.0s / 1514.8s | 417.3s / 417.3s | 0.42 | — | 0 | 0 | 0/0 | 0/0 |
| 22 | recovered | 1531.0s / 1532.1s | 3.7s / 3.7s | 1412.7s / 1413.8s | 601.5s / 602.6s | 0.24 | — | 0 | 0 | 0/0 | 0/0 |
| 23 | recovered | 2151.1s / 2165.1s | 4.1s / 4.1s | 2094.3s / 2108.3s | 1180.9s / 1194.9s | 0.17 | — | 0 | 0 | 0/0 | 0/0 |
| 24 | loss | 70.3s / 70.3s | 3.9s / 3.9s | 65.7s / 65.7s | 44.3s / 44.3s | 0.85 | — | 0 | 0 | 0/3 | 0/0 |
| 25 | recovered | 2267.4s / 2288.9s | 4.8s / 4.8s | 2167.0s / 2188.4s | 1279.8s / 1301.3s | 0.16 | — | 0 | 0 | 0/1 | 1/0 |
| 26 | loss | 521.9s / 521.9s | 3.6s / 3.6s | 357.9s / 357.9s | 93.0s / 93.0s | 0.11 | — | 0 | 0 | 0/3 | 0/0 |
| 27 | recovered | 1973.6s / 1973.6s | 4.3s / 4.3s | 1923.6s / 1923.6s | 603.9s / 603.9s | 0.36 | — | 0 | 0 | 0/0 | 0/0 |
| 28 | recovered | 2548.9s / 2603.5s | 4.5s / 4.5s | 2424.2s / 2478.8s | 1657.8s / 1709.6s | 0.12 | — | 0 | 0 | 0/0 | 0/0 |
| 29 | recovered | 2206.3s / 2220.3s | 3.5s / 3.5s | 2142.2s / 2156.3s | 1243.7s / 1257.8s | 0.16 | — | 0 | 0 | 0/0 | 0/0 |

## Timeline strip

![Per-run timeline strip](timeline.svg)

The strip uses one row per run; phase colour, dead-air shading, event symbols, and the tension trace are defined in the SVG legend.
