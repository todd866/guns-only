# Playtest Lab — beat 7

Generated 2026-10-16 · 90 runs · seed 0 · 33039.4s perceived / 72790.9s simulated · 193.9×× wall speed

## At a glance

| pilot | runs | complete | censored | win rate | mean perceived | mean simulated | flags |
|---|---:|---:|---:|---:|---:|---:|---:|
| ace | 30 | 30 | 0 | 100% | 206.3s | 530.2s | 102 |
| clone | 30 | 30 | 0 | 0% | 50.8s | 50.8s | 30 |
| novice | 30 | 30 | 0 | 0% | 844.2s | 1845.3s | 31 |

Flag count: **163**

## Reproduction

- Command: `tools/playtest-lab/run '--beat' '7' '--seeds' '30' '--out' 'analysis/playtest/2026-10-16-beat7-rtb/land-autopilot'`
- Source commit: `ee5853bc7c81e86fa990b6bff0ac3e5924a8e150`
- Clone SHA-256: `a1ac519084ac414a873933838e4cd00dc816ed9c92fcd4a2b962fad56ba039ef`
- Wall time: 375.4298589s
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
| ace | 30 | 90/0 | 0 | 2.52 | 2.7s / 2.7s (0 missing) | 5910.0s / 15627.7s (max 66.1s / 331.6s) | 206.3s / 530.2s | 8.9% / 3.5% | win:30, loss:0, crash:0, recovered:0, draw:0 | -0.00 | 30 | 100% | +0.16 |
| clone | 0 | 0/0 | 30 | 4.72 | 1.5s / 1.5s (0 missing) | 1457.2s / 1457.2s (max 38.0s / 38.0s) | 50.8s / 50.8s | 88.5% / 88.5% | win:0, loss:0, crash:30, recovered:0, draw:0 | -0.00 | 0 | — | — |
| novice | 0 | 0/17 | 48 | 0.40 | 4.0s / 4.0s (0 missing) | 23112.9s / 53135.2s (max 532.1s / 1866.2s) | 844.2s / 1845.3s | 64.9% / 29.7% | win:0, loss:4, crash:0, recovered:26, draw:0 | 0.24 | 0 | — | — |

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
- dead air >20s: novice seed 0 (260.3s perceived)
- dead air >20s: novice seed 1 (262.9s perceived)
- dead air >20s: novice seed 2 (172.5s perceived)
- dead air >20s: novice seed 3 (324.2s perceived)
- dead air >20s: novice seed 4 (532.1s perceived)
- dead air >20s: novice seed 5 (194.9s perceived)
- dead air >20s: novice seed 6 (284.8s perceived)
- dead air >20s: novice seed 7 (308.4s perceived)
- dead air >20s: novice seed 8 (324.1s perceived)
- dead air >20s: novice seed 9 (412.6s perceived)
- dead air >20s: novice seed 10 (249.0s perceived)
- dead air >20s: novice seed 11 (357.7s perceived)
- dead air >20s: novice seed 12 (448.1s perceived)
- dead air >20s: novice seed 13 (332.1s perceived)
- dead air >20s: novice seed 14 (390.3s perceived)
- dead air >20s: novice seed 15 (81.3s perceived)
- dead air >20s: novice seed 16 (224.9s perceived)
- dead air >20s: novice seed 17 (260.5s perceived)
- dead air >20s: novice seed 18 (246.3s perceived)
- dead air >20s: novice seed 19 (229.5s perceived)
- dead air >20s: novice seed 20 (437.3s perceived)
- dead air >20s: novice seed 21 (169.2s perceived)
- dead air >20s: novice seed 22 (169.2s perceived)
- dead air >20s: novice seed 23 (458.9s perceived)
- dead air >20s: novice seed 24 (44.3s perceived)
- dead air >20s: novice seed 25 (242.0s perceived)
- dead air >20s: novice seed 26 (93.0s perceived)
- dead air >20s: novice seed 27 (238.7s perceived)
- dead air >20s: novice seed 28 (271.4s perceived)
- dead air >20s: novice seed 29 (373.4s perceived)
- dead air >20s: ace seed 0 (64.9s perceived)
- dead air >20s: ace seed 1 (65.1s perceived)
- dead air >20s: ace seed 2 (64.7s perceived)
- dead air >20s: ace seed 3 (65.4s perceived)
- dead air >20s: ace seed 4 (65.1s perceived)
- dead air >20s: ace seed 5 (65.5s perceived)
- dead air >20s: ace seed 6 (65.2s perceived)
- dead air >20s: ace seed 7 (65.1s perceived)
- dead air >20s: ace seed 8 (65.5s perceived)
- dead air >20s: ace seed 9 (64.9s perceived)
- dead air >20s: ace seed 10 (64.7s perceived)
- dead air >20s: ace seed 11 (65.1s perceived)
- dead air >20s: ace seed 12 (65.7s perceived)
- dead air >20s: ace seed 13 (64.9s perceived)
- dead air >20s: ace seed 14 (65.8s perceived)
- dead air >20s: ace seed 15 (65.1s perceived)
- dead air >20s: ace seed 16 (65.6s perceived)
- dead air >20s: ace seed 17 (64.9s perceived)
- dead air >20s: ace seed 18 (65.3s perceived)
- dead air >20s: ace seed 19 (66.1s perceived)
- dead air >20s: ace seed 20 (65.2s perceived)
- dead air >20s: ace seed 21 (66.0s perceived)
- dead air >20s: ace seed 22 (65.2s perceived)
- dead air >20s: ace seed 23 (65.1s perceived)
- dead air >20s: ace seed 24 (64.7s perceived)
- dead air >20s: ace seed 25 (64.5s perceived)
- dead air >20s: ace seed 26 (65.1s perceived)
- dead air >20s: ace seed 27 (64.3s perceived)
- dead air >20s: ace seed 28 (65.5s perceived)
- dead air >20s: ace seed 29 (65.4s perceived)
- novice win rate 0%
- ace win rate 100%
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
- landing longer than fight/defensive/merge: ace seed 8
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
- landing longer than fight/defensive/merge: ace seed 16
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
| ace | 0.5% / 0.2% | 1.7% / 0.7% | 2.0% / 0.8% | 3.3% / 1.3% | 3.7% / 1.4% | 51.4% / 81.1% | 28.7% / 11.2% | 8.7% / 3.4% | 0.0% / 0.0% | 0.0% / 0.0% |
| clone | 2.0% / 2.0% | 0.0% / 0.0% | 21.7% / 21.7% | 66.9% / 66.9% | 0.0% / 0.0% | 0.0% / 0.0% | 0.0% / 0.0% | 0.0% / 0.0% | 9.5% / 9.5% | 0.0% / 0.0% |
| novice | 0.1% / 0.1% | 0.0% / 0.0% | 1.3% / 0.6% | 54.9% / 25.1% | 8.7% / 4.0% | 23.7% / 65.1% | 8.3% / 3.8% | 1.7% / 0.8% | 1.3% / 0.6% | 0.0% / 0.0% |

## Runs by pilot

Timing pairs are perceived / simulated.

### ace

| seed | outcome | length | first action | dead air | longest dead air | decisions/min | e1/e2 tension | kills | rounds fired | hits given/taken | shot/ground near misses |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | win | 187.6s / 481.1s | 1.5s / 1.5s | 179.3s / 472.8s | 64.9s / 195.0s | 2.56 | 0.27 / 0.44 | 1 | 60 | 3/0 | 0/0 |
| 1 | win | 204.8s / 505.5s | 1.9s / 1.9s | 196.3s / 497.0s | 65.1s / 275.3s | 2.34 | 0.27 / 0.43 | 1 | 59 | 3/0 | 0/0 |
| 2 | win | 189.9s / 490.9s | 2.2s / 2.2s | 181.6s / 482.6s | 64.7s / 238.2s | 2.53 | 0.27 / 0.44 | 1 | 59 | 3/0 | 0/0 |
| 3 | win | 190.5s / 492.2s | 2.6s / 2.6s | 182.2s / 483.8s | 65.4s / 228.9s | 2.52 | 0.27 / 0.44 | 1 | 59 | 3/0 | 0/0 |
| 4 | win | 216.5s / 542.4s | 2.9s / 2.9s | 207.7s / 533.6s | 65.1s / 207.8s | 2.77 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 5 | win | 211.2s / 568.4s | 3.3s / 3.3s | 200.7s / 557.8s | 65.5s / 299.5s | 2.56 | 0.27 / 0.42 | 1 | 58 | 3/0 | 0/0 |
| 6 | win | 219.2s / 555.3s | 3.6s / 3.6s | 207.8s / 543.9s | 65.2s / 275.6s | 2.46 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 7 | win | 214.3s / 572.3s | 4.0s / 4.0s | 203.5s / 561.5s | 65.1s / 295.8s | 2.52 | 0.27 / 0.43 | 1 | 55 | 3/0 | 0/0 |
| 8 | win | 201.2s / 500.6s | 1.5s / 1.5s | 192.8s / 492.2s | 65.5s / 273.7s | 2.39 | 0.27 / 0.43 | 1 | 60 | 3/0 | 0/0 |
| 9 | win | 191.4s / 488.2s | 1.9s / 1.9s | 183.1s / 479.9s | 64.9s / 241.8s | 2.51 | 0.27 / 0.44 | 1 | 59 | 3/0 | 0/0 |
| 10 | win | 189.7s / 489.9s | 2.2s / 2.2s | 181.5s / 481.6s | 64.7s / 247.3s | 2.53 | 0.27 / 0.44 | 1 | 59 | 3/0 | 0/0 |
| 11 | win | 208.7s / 533.7s | 2.6s / 2.6s | 200.0s / 524.9s | 65.1s / 243.1s | 2.88 | 0.27 / 0.43 | 1 | 59 | 3/0 | 0/0 |
| 12 | win | 212.2s / 562.7s | 2.9s / 2.9s | 201.5s / 552.1s | 65.7s / 282.5s | 2.55 | 0.27 / 0.42 | 1 | 58 | 3/0 | 0/0 |
| 13 | win | 218.5s / 555.5s | 3.3s / 3.3s | 208.4s / 545.5s | 64.9s / 270.1s | 2.47 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 14 | win | 211.3s / 565.3s | 3.6s / 3.6s | 200.8s / 554.7s | 65.8s / 291.4s | 2.56 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 15 | win | 216.1s / 575.1s | 4.0s / 4.0s | 205.2s / 564.1s | 65.1s / 283.5s | 2.50 | 0.27 / 0.43 | 1 | 54 | 3/0 | 0/0 |
| 16 | win | 200.7s / 501.3s | 1.5s / 1.5s | 192.3s / 492.9s | 65.6s / 263.9s | 2.39 | 0.27 / 0.43 | 1 | 60 | 3/0 | 0/0 |
| 17 | win | 191.4s / 488.2s | 1.9s / 1.9s | 183.1s / 479.9s | 64.9s / 241.8s | 2.51 | 0.27 / 0.44 | 1 | 59 | 3/0 | 0/0 |
| 18 | win | 213.0s / 507.8s | 2.2s / 2.2s | 204.2s / 499.0s | 65.3s / 295.3s | 2.25 | 0.27 / 0.43 | 1 | 59 | 3/0 | 0/0 |
| 19 | win | 221.7s / 563.4s | 2.6s / 2.6s | 211.9s / 553.6s | 66.1s / 264.1s | 2.44 | 0.27 / 0.43 | 1 | 59 | 3/0 | 0/0 |
| 20 | win | 210.8s / 542.4s | 2.9s / 2.9s | 202.0s / 533.6s | 65.2s / 261.7s | 2.85 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 21 | win | 211.5s / 562.5s | 3.3s / 3.3s | 201.2s / 552.2s | 66.0s / 296.4s | 2.55 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 22 | win | 218.5s / 550.8s | 3.6s / 3.6s | 209.7s / 542.0s | 65.2s / 270.8s | 2.47 | 0.27 / 0.43 | 1 | 57 | 3/0 | 0/0 |
| 23 | win | 214.1s / 575.1s | 4.0s / 4.0s | 203.0s / 564.0s | 65.1s / 287.7s | 2.52 | 0.27 / 0.43 | 1 | 54 | 3/0 | 0/0 |
| 24 | win | 187.2s / 480.1s | 1.5s / 1.5s | 178.9s / 471.8s | 64.7s / 213.6s | 2.56 | 0.27 / 0.44 | 1 | 60 | 3/0 | 0/0 |
| 25 | win | 197.4s / 492.2s | 1.9s / 1.9s | 189.1s / 483.8s | 64.5s / 217.1s | 2.43 | 0.27 / 0.44 | 1 | 59 | 3/0 | 0/0 |
| 26 | win | 214.8s / 547.2s | 2.2s / 2.2s | 206.2s / 538.5s | 65.1s / 267.1s | 2.51 | 0.27 / 0.42 | 1 | 59 | 3/0 | 0/0 |
| 27 | win | 190.3s / 480.6s | 2.6s / 2.6s | 181.7s / 472.0s | 64.3s / 230.4s | 2.52 | 0.27 / 0.45 | 1 | 59 | 3/0 | 0/0 |
| 28 | win | 215.8s / 568.0s | 2.9s / 2.9s | 205.4s / 557.6s | 65.5s / 295.9s | 2.50 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 29 | win | 219.3s / 568.7s | 3.3s / 3.3s | 209.0s / 558.4s | 65.4s / 331.6s | 2.46 | 0.27 / 0.42 | 1 | 58 | 3/0 | 0/0 |

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
| 0 | recovered | 941.4s / 2466.7s | 3.3s / 3.3s | 873.0s / 2395.9s | 260.3s / 1443.9s | 0.45 | — | 0 | 0 | 0/1 | 0/0 |
| 1 | recovered | 854.5s / 1874.8s | 5.0s / 5.0s | 767.8s / 1788.1s | 262.9s / 1059.7s | 0.35 | — | 0 | 0 | 0/0 | 0/0 |
| 2 | loss | 465.3s / 465.3s | 4.2s / 4.2s | 373.4s / 373.4s | 172.5s / 172.5s | 0.13 | — | 0 | 0 | 0/3 | 11/0 |
| 3 | recovered | 847.6s / 1838.9s | 3.2s / 3.2s | 787.5s / 1778.9s | 324.2s / 1007.3s | 0.35 | — | 0 | 0 | 0/2 | 7/0 |
| 4 | recovered | 844.4s / 1812.6s | 4.2s / 4.2s | 809.7s / 1777.9s | 532.1s / 993.7s | 0.36 | — | 0 | 0 | 0/1 | 0/0 |
| 5 | recovered | 861.1s / 1867.9s | 3.3s / 3.3s | 772.8s / 1779.7s | 194.9s / 1029.9s | 0.49 | — | 0 | 0 | 0/0 | 3/0 |
| 6 | recovered | 905.4s / 2224.3s | 4.2s / 4.2s | 838.8s / 2157.7s | 284.8s / 1465.5s | 0.33 | — | 0 | 0 | 0/0 | 0/0 |
| 7 | recovered | 1102.2s / 2314.1s | 2.7s / 2.7s | 1045.4s / 2254.3s | 308.4s / 691.0s | 0.71 | — | 0 | 0 | 0/0 | 0/0 |
| 8 | recovered | 896.2s / 2120.7s | 3.3s / 3.3s | 818.6s / 2043.1s | 324.1s / 1389.0s | 0.33 | — | 0 | 0 | 0/0 | 0/0 |
| 9 | recovered | 910.5s / 2130.7s | 3.2s / 3.2s | 853.9s / 2074.1s | 412.6s / 1257.2s | 0.33 | — | 0 | 0 | 0/0 | 0/0 |
| 10 | recovered | 1017.9s / 2093.1s | 3.5s / 3.5s | 907.3s / 1982.5s | 249.0s / 1053.4s | 0.41 | — | 0 | 0 | 0/0 | 0/0 |
| 11 | recovered | 1161.6s / 2176.8s | 3.1s / 3.1s | 1113.3s / 2126.2s | 357.7s / 676.5s | 0.36 | — | 0 | 0 | 0/0 | 16/0 |
| 12 | recovered | 883.4s / 2116.9s | 5.3s / 5.2s | 818.2s / 2051.6s | 448.1s / 1389.6s | 0.34 | — | 0 | 0 | 0/0 | 3/0 |
| 13 | recovered | 968.6s / 2566.2s | 2.5s / 2.5s | 931.3s / 2528.9s | 332.1s / 1866.2s | 0.43 | — | 0 | 0 | 0/0 | 3/0 |
| 14 | recovered | 877.1s / 1874.8s | 3.2s / 3.2s | 815.1s / 1812.8s | 390.3s / 1040.6s | 0.34 | — | 0 | 0 | 0/0 | 0/0 |
| 15 | loss | 137.0s / 137.0s | 4.1s / 4.1s | 103.8s / 103.8s | 81.3s / 81.3s | 0.44 | — | 0 | 0 | 0/3 | 1/0 |
| 16 | recovered | 1040.9s / 1872.2s | 4.8s / 4.8s | 928.7s / 1760.0s | 224.9s / 821.9s | 0.35 | — | 0 | 0 | 0/0 | 2/0 |
| 17 | recovered | 872.5s / 1812.9s | 4.5s / 4.5s | 818.0s / 1758.4s | 260.5s / 991.7s | 0.48 | — | 0 | 0 | 0/0 | 0/0 |
| 18 | recovered | 894.4s / 2111.2s | 3.8s / 3.8s | 826.7s / 2043.5s | 246.3s / 1360.4s | 0.34 | — | 0 | 0 | 0/0 | 0/0 |
| 19 | recovered | 936.2s / 2238.7s | 4.7s / 4.7s | 837.4s / 2139.5s | 229.5s / 1420.5s | 0.32 | — | 0 | 0 | 0/0 | 1/0 |
| 20 | recovered | 997.0s / 2306.1s | 4.8s / 4.8s | 947.4s / 2253.3s | 437.3s / 1008.8s | 0.42 | — | 0 | 0 | 0/0 | 0/0 |
| 21 | recovered | 922.6s / 1633.0s | 5.5s / 5.5s | 820.3s / 1530.7s | 169.2s / 696.6s | 0.72 | — | 0 | 0 | 0/0 | 0/0 |
| 22 | recovered | 877.9s / 1519.5s | 3.7s / 3.7s | 759.7s / 1401.3s | 169.2s / 753.9s | 0.34 | — | 0 | 0 | 0/0 | 0/0 |
| 23 | recovered | 888.4s / 2153.1s | 4.1s / 4.1s | 831.6s / 2096.3s | 458.9s / 1354.5s | 0.34 | — | 0 | 0 | 0/0 | 0/0 |
| 24 | loss | 70.3s / 70.3s | 3.9s / 3.9s | 65.7s / 65.7s | 44.3s / 44.3s | 0.85 | — | 0 | 0 | 0/3 | 0/0 |
| 25 | recovered | 909.8s / 2276.7s | 4.8s / 4.8s | 809.4s / 2176.3s | 242.0s / 1461.2s | 0.33 | — | 0 | 0 | 0/1 | 1/0 |
| 26 | loss | 521.9s / 521.9s | 3.6s / 3.6s | 357.9s / 357.9s | 93.0s / 93.0s | 0.11 | — | 0 | 0 | 0/3 | 0/0 |
| 27 | recovered | 880.3s / 1963.0s | 4.3s / 4.3s | 830.3s / 1913.0s | 238.7s / 1126.1s | 0.75 | — | 0 | 0 | 0/0 | 0/0 |
| 28 | recovered | 929.4s / 2590.8s | 4.5s / 4.5s | 804.7s / 2466.1s | 271.4s / 1775.8s | 0.32 | — | 0 | 0 | 0/0 | 0/0 |
| 29 | recovered | 909.2s / 2208.2s | 3.5s / 3.5s | 845.2s / 2144.2s | 373.4s / 1415.0s | 0.33 | — | 0 | 0 | 0/0 | 0/0 |

## Timeline strip

![Per-run timeline strip](timeline.svg)

The strip uses one row per run; phase colour, dead-air shading, event symbols, and the tension trace are defined in the SVG legend.
