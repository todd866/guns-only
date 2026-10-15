# Playtest Lab — beat 7

Generated 2026-10-16 · 90 runs · seed 0 · 70014.1s simulated · 103.9× wall speed

## At a glance

| pilot | runs | complete | censored | win rate | mean length | spread | flags |
|---|---:|---:|---:|---:|---:|---:|---:|
| ace | 30 | 30 | 0 | 100% | 570.4s | 259.2s | 100 |
| clone | 30 | 30 | 0 | 0% | 50.8s | 1.9s | 30 |
| novice | 30 | 30 | 0 | 0% | 1712.5s | 2196.2s | 56 |

Flag count: **186**

## Reproduction

- Command: `tools/playtest-lab/run '--beat' '7' '--seeds' '30' '--out' 'analysis/playtest/2026-10-16-beat7'`
- Source commit: `2cc258ff24f8a8d08f62066f4b0c08655b5fe89c`
- Clone SHA-256: `a1ac519084ac414a873933838e4cd00dc816ed9c92fcd4a2b962fad56ba039ef`
- Wall time: 673.7431473s
- Configured max seconds: 3600

## Notes

- Experience proxies, not a claim to measure human feelings. 120 Hz production simulation; per-second bins preserve tick events and exact phase/dead-air durations. No renderer or wall-clock pacing.
- Fresh director per sortie; no progression imported. Seeds deterministically vary reaction latency, aim bias, and opening hands-off time; mission geometry/damage/AI rules stay authored. Paired seeds use the same perturbation draws for each pilot.
- Clone is the committed owner-pilot-clone policy (canonical features and reference-case validation), held at its training cadence of 20 Hz. Novice adapts BanditPressureReport's pursuit pilot. Ace adapts FirstMergeOpeningAcceptanceTests.HudPilot with delayed body-frame cue observations and bounded analog controls. Shared recovery and terrain escape use the existing scripted command seam; this is not a human usability study.
- Threat: live bandit within 2500 m and nose within 35 degrees, or firing; includes wingmen. Gun target: selected live target with authorized ballistic solution. Dead air: no threat, no gun opportunity, no player shot, decision, spectacle or near miss. Initial begin is not counted as a decision.
- Shot near miss: unique hostile gun round's swept separation within 25 m outside its hit radius; counted only on passage, not repeated ticks. Ground near miss: entry below 100 m AGL with 25 m hysteresis, excluding configured recovery/contact. Explosions are labelled destruction/impact proxies from session events, not renderer effects.
- RTB choice: combat complete, bingo, empty gun, or 600s combat budget, through TryRequestReturnToBase. Recovery/navigation is a shared scripted pilot, with a conventional straight-in join, not learned owner behaviour or an overhead-pattern model. A 3600s limit is censored, never a win or fabricated landing.
- Tension heuristic: 0.35 proximity + 0.15 positive closure (within threat range) + 0.25 threat + 0.15 damage-risk under threat + 0.10 low-clearance risk; clamped 0..1, near shots at least 0.85 and hits at least 0.95. Engagement means exclude RTB and terminal wreck descent. Phase percentages include wreck/debrief time.
- Default native terrain is the session's authored/default surface, without the browser's streamed terrain atlas. Ground-clearance results describe that substrate. CASEVAC uses semantic navigation for all profiles; fixed-wing clone/gun/G metrics do not apply. Generic pilots attempt every built-in beat; specialist mission failures and timeouts remain visible.

## Pilot metrics

| pilot | kills | hits given/taken | near misses | decisions/min | first action | dead air (total/max) | outcome distribution | entropy | paired e1→e2 | rising | mean Δ |
|---|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|
| ace | 30 | 90/0 | 0 | 1.20 | 2.7s (0 missing) | 16834.2s / 195.2s | win:30, loss:0, crash:0, recovered:0, draw:0 | -0.00 | 30 | 100% | +0.16 |
| clone | 0 | 0/0 | 30 | 4.72 | 1.4s (0 missing) | 1457.2s / 38.1s | win:0, loss:0, crash:30, recovered:0, draw:0 | -0.00 | 0 | — | — |
| novice | 0 | 0/17 | 48 | 0.22 | 4.0s (0 missing) | 49148.2s / 836.2s | win:0, loss:4, crash:0, recovered:26, draw:0 | 0.24 | 0 | — | — |

## Flags

- dead air >20s: clone seed 0 (37.5s)
- dead air >20s: clone seed 1 (37.7s)
- dead air >20s: clone seed 2 (37.3s)
- dead air >20s: clone seed 3 (37.3s)
- dead air >20s: clone seed 4 (37.3s)
- dead air >20s: clone seed 5 (37.5s)
- dead air >20s: clone seed 6 (37.3s)
- dead air >20s: clone seed 7 (36.9s)
- dead air >20s: clone seed 8 (37.5s)
- dead air >20s: clone seed 9 (37.3s)
- dead air >20s: clone seed 10 (37.6s)
- dead air >20s: clone seed 11 (37.1s)
- dead air >20s: clone seed 12 (38.0s)
- dead air >20s: clone seed 13 (36.8s)
- dead air >20s: clone seed 14 (37.3s)
- dead air >20s: clone seed 15 (37.3s)
- dead air >20s: clone seed 16 (37.5s)
- dead air >20s: clone seed 17 (37.4s)
- dead air >20s: clone seed 18 (37.5s)
- dead air >20s: clone seed 19 (37.4s)
- dead air >20s: clone seed 20 (37.4s)
- dead air >20s: clone seed 21 (38.1s)
- dead air >20s: clone seed 22 (37.5s)
- dead air >20s: clone seed 23 (37.3s)
- dead air >20s: clone seed 24 (37.5s)
- dead air >20s: clone seed 25 (37.5s)
- dead air >20s: clone seed 26 (37.6s)
- dead air >20s: clone seed 27 (37.5s)
- dead air >20s: clone seed 28 (37.6s)
- dead air >20s: clone seed 29 (37.6s)
- dead air >20s: novice seed 0 (772.9s)
- dead air >20s: novice seed 1 (614.3s)
- dead air >20s: novice seed 2 (172.5s)
- dead air >20s: novice seed 3 (617.5s)
- dead air >20s: novice seed 4 (634.9s)
- dead air >20s: novice seed 5 (688.0s)
- dead air >20s: novice seed 6 (630.5s)
- dead air >20s: novice seed 7 (438.9s)
- dead air >20s: novice seed 8 (671.0s)
- dead air >20s: novice seed 9 (622.0s)
- dead air >20s: novice seed 10 (704.0s)
- dead air >20s: novice seed 11 (503.8s)
- dead air >20s: novice seed 12 (651.6s)
- dead air >20s: novice seed 13 (646.3s)
- dead air >20s: novice seed 14 (676.5s)
- dead air >20s: novice seed 15 (81.3s)
- dead air >20s: novice seed 16 (532.6s)
- dead air >20s: novice seed 17 (654.2s)
- dead air >20s: novice seed 18 (618.2s)
- dead air >20s: novice seed 19 (697.9s)
- dead air >20s: novice seed 20 (479.8s)
- dead air >20s: novice seed 21 (417.3s)
- dead air >20s: novice seed 22 (195.8s)
- dead air >20s: novice seed 23 (640.1s)
- dead air >20s: novice seed 24 (44.3s)
- dead air >20s: novice seed 25 (610.6s)
- dead air >20s: novice seed 26 (93.0s)
- dead air >20s: novice seed 27 (732.0s)
- dead air >20s: novice seed 28 (836.2s)
- dead air >20s: novice seed 29 (583.1s)
- dead air >20s: ace seed 0 (184.6s)
- dead air >20s: ace seed 1 (194.2s)
- dead air >20s: ace seed 2 (194.9s)
- dead air >20s: ace seed 3 (194.6s)
- dead air >20s: ace seed 4 (194.6s)
- dead air >20s: ace seed 5 (194.2s)
- dead air >20s: ace seed 6 (194.1s)
- dead air >20s: ace seed 7 (194.6s)
- dead air >20s: ace seed 8 (193.7s)
- dead air >20s: ace seed 9 (195.2s)
- dead air >20s: ace seed 10 (194.2s)
- dead air >20s: ace seed 11 (194.2s)
- dead air >20s: ace seed 12 (193.9s)
- dead air >20s: ace seed 13 (194.3s)
- dead air >20s: ace seed 14 (194.1s)
- dead air >20s: ace seed 15 (195.0s)
- dead air >20s: ace seed 16 (193.6s)
- dead air >20s: ace seed 17 (195.2s)
- dead air >20s: ace seed 18 (194.4s)
- dead air >20s: ace seed 19 (194.3s)
- dead air >20s: ace seed 20 (194.6s)
- dead air >20s: ace seed 21 (194.2s)
- dead air >20s: ace seed 22 (193.9s)
- dead air >20s: ace seed 23 (195.0s)
- dead air >20s: ace seed 24 (194.3s)
- dead air >20s: ace seed 25 (194.7s)
- dead air >20s: ace seed 26 (194.4s)
- dead air >20s: ace seed 27 (194.8s)
- dead air >20s: ace seed 28 (193.9s)
- dead air >20s: ace seed 29 (194.0s)
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

| pilot | setup | transit | merge | fight | defensive | RTB | approach | landing | dead | finished |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| ace | 0.2% | 0.6% | 0.7% | 1.2% | 1.3% | 62.9% | 30.2% | 3.0% | 0.0% | 0.0% |
| clone | 2.0% | 0.0% | 21.7% | 66.9% | 0.0% | 0.0% | 0.0% | 0.0% | 9.5% | 0.0% |
| novice | 0.1% | 0.0% | 0.6% | 27.1% | 4.3% | 57.6% | 8.9% | 0.8% | 0.7% | 0.0% |

## Runs by pilot

### ace

| seed | outcome | length | first action | dead air | longest dead air | decisions/min | e1/e2 tension | kills | rounds fired | hits given/taken | shot/ground near misses |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | win | 404.5s | 1.5s | 396.2s | 184.6s | 1.33 | 0.27 / 0.44 | 1 | 60 | 3/0 | 0/0 |
| 1 | win | 619.6s | 1.9s | 611.1s | 194.2s | 1.07 | 0.27 / 0.43 | 1 | 59 | 3/0 | 0/0 |
| 2 | win | 656.4s | 2.2s | 648.0s | 194.9s | 1.01 | 0.27 / 0.44 | 1 | 59 | 3/0 | 0/0 |
| 3 | win | 646.1s | 2.6s | 637.7s | 194.6s | 1.02 | 0.27 / 0.44 | 1 | 59 | 3/0 | 0/0 |
| 4 | win | 591.6s | 2.9s | 582.8s | 194.6s | 1.32 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 5 | win | 565.0s | 3.2s | 553.5s | 194.2s | 1.27 | 0.27 / 0.42 | 1 | 58 | 3/0 | 0/0 |
| 6 | win | 569.4s | 3.6s | 560.8s | 194.1s | 1.26 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 7 | win | 562.2s | 3.9s | 553.6s | 194.6s | 1.28 | 0.27 / 0.43 | 1 | 55 | 3/0 | 0/0 |
| 8 | win | 629.5s | 1.5s | 621.0s | 193.7s | 1.05 | 0.27 / 0.43 | 1 | 60 | 3/0 | 0/0 |
| 9 | win | 657.4s | 1.9s | 649.1s | 195.2s | 1.00 | 0.27 / 0.44 | 1 | 59 | 3/0 | 0/0 |
| 10 | win | 403.7s | 2.2s | 395.4s | 194.2s | 1.34 | 0.27 / 0.44 | 1 | 59 | 3/0 | 0/0 |
| 11 | win | 598.8s | 2.6s | 590.0s | 194.2s | 1.30 | 0.27 / 0.43 | 1 | 59 | 3/0 | 0/0 |
| 12 | win | 568.8s | 2.9s | 558.2s | 193.9s | 1.27 | 0.27 / 0.42 | 1 | 58 | 3/0 | 0/0 |
| 13 | win | 573.4s | 3.2s | 560.9s | 194.3s | 1.26 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 14 | win | 564.9s | 3.6s | 550.9s | 194.1s | 1.27 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 15 | win | 563.3s | 3.9s | 554.7s | 195.0s | 1.28 | 0.27 / 0.43 | 1 | 54 | 3/0 | 0/0 |
| 16 | win | 627.5s | 1.5s | 619.1s | 193.6s | 1.05 | 0.27 / 0.43 | 1 | 60 | 3/0 | 0/0 |
| 17 | win | 657.4s | 1.9s | 649.1s | 195.2s | 1.00 | 0.27 / 0.44 | 1 | 59 | 3/0 | 0/0 |
| 18 | win | 612.3s | 2.2s | 603.5s | 194.4s | 1.08 | 0.27 / 0.43 | 1 | 59 | 3/0 | 0/0 |
| 19 | win | 573.8s | 2.6s | 565.1s | 194.3s | 1.25 | 0.27 / 0.43 | 1 | 59 | 3/0 | 0/0 |
| 20 | win | 591.6s | 2.9s | 582.8s | 194.6s | 1.32 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 21 | win | 569.9s | 3.2s | 552.8s | 194.2s | 1.26 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 22 | win | 574.1s | 3.6s | 565.3s | 193.9s | 1.25 | 0.27 / 0.43 | 1 | 57 | 3/0 | 0/0 |
| 23 | win | 563.4s | 3.9s | 554.7s | 195.0s | 1.28 | 0.27 / 0.43 | 1 | 54 | 3/0 | 0/0 |
| 24 | win | 404.6s | 1.5s | 396.3s | 194.3s | 1.33 | 0.27 / 0.44 | 1 | 60 | 3/0 | 0/0 |
| 25 | win | 648.9s | 1.9s | 640.5s | 194.7s | 1.02 | 0.27 / 0.44 | 1 | 59 | 3/0 | 0/0 |
| 26 | win | 588.4s | 2.2s | 579.7s | 194.4s | 1.22 | 0.27 / 0.42 | 1 | 59 | 3/0 | 0/0 |
| 27 | win | 398.1s | 2.6s | 389.6s | 194.8s | 1.36 | 0.27 / 0.45 | 1 | 59 | 3/0 | 0/0 |
| 28 | win | 564.9s | 2.9s | 556.2s | 193.9s | 1.27 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 29 | win | 563.9s | 3.2s | 555.3s | 194.0s | 1.28 | 0.27 / 0.42 | 1 | 58 | 3/0 | 0/0 |

### clone

| seed | outcome | length | first action | dead air | longest dead air | decisions/min | e1/e2 tension | kills | rounds fired | hits given/taken | shot/ground near misses |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | crash | 50.8s | 1.1s | 48.5s | 37.5s | 4.73 | — | 0 | 266 | 0/0 | 0/1 |
| 1 | crash | 51.2s | 1.8s | 48.9s | 37.7s | 4.69 | — | 0 | 266 | 0/0 | 0/1 |
| 2 | crash | 50.9s | 1.6s | 48.6s | 37.3s | 4.72 | — | 0 | 266 | 0/0 | 0/1 |
| 3 | crash | 50.6s | 1.1s | 48.3s | 37.3s | 4.74 | — | 0 | 266 | 0/0 | 0/1 |
| 4 | crash | 50.9s | 1.6s | 48.6s | 37.3s | 4.72 | — | 0 | 266 | 0/0 | 0/1 |
| 5 | crash | 50.8s | 1.1s | 48.5s | 37.5s | 4.73 | — | 0 | 266 | 0/0 | 0/1 |
| 6 | crash | 50.9s | 1.6s | 48.6s | 37.3s | 4.72 | — | 0 | 266 | 0/0 | 0/1 |
| 7 | crash | 49.8s | 0.9s | 47.5s | 36.9s | 4.82 | — | 0 | 266 | 0/0 | 0/1 |
| 8 | crash | 50.8s | 1.1s | 48.5s | 37.5s | 4.73 | — | 0 | 266 | 0/0 | 0/1 |
| 9 | crash | 50.6s | 1.1s | 48.3s | 37.3s | 4.74 | — | 0 | 266 | 0/0 | 0/1 |
| 10 | crash | 51.0s | 1.3s | 48.7s | 37.6s | 4.70 | — | 0 | 266 | 0/0 | 0/1 |
| 11 | crash | 50.2s | 1.1s | 47.9s | 37.1s | 4.78 | — | 0 | 266 | 0/0 | 0/1 |
| 12 | crash | 51.6s | 1.9s | 49.3s | 38.0s | 4.65 | — | 0 | 266 | 0/0 | 0/1 |
| 13 | crash | 49.7s | 0.8s | 47.4s | 36.8s | 4.83 | — | 0 | 266 | 0/0 | 0/1 |
| 14 | crash | 50.6s | 1.1s | 48.3s | 37.3s | 4.74 | — | 0 | 266 | 0/0 | 0/1 |
| 15 | crash | 50.8s | 1.5s | 48.5s | 37.3s | 4.73 | — | 0 | 266 | 0/0 | 0/1 |
| 16 | crash | 51.0s | 1.8s | 48.8s | 37.5s | 4.70 | — | 0 | 266 | 0/0 | 0/1 |
| 17 | crash | 51.0s | 1.7s | 48.7s | 37.4s | 4.71 | — | 0 | 266 | 0/0 | 0/1 |
| 18 | crash | 51.0s | 1.4s | 48.7s | 37.5s | 4.70 | — | 0 | 271 | 0/0 | 0/1 |
| 19 | crash | 50.9s | 1.8s | 48.6s | 37.4s | 4.72 | — | 0 | 266 | 0/0 | 0/1 |
| 20 | crash | 50.9s | 1.8s | 48.6s | 37.4s | 4.72 | — | 0 | 266 | 0/0 | 0/1 |
| 21 | crash | 51.6s | 2.0s | 49.4s | 38.1s | 4.65 | — | 0 | 261 | 0/0 | 0/1 |
| 22 | crash | 50.9s | 1.4s | 48.7s | 37.5s | 4.71 | — | 0 | 266 | 0/0 | 0/1 |
| 23 | crash | 50.8s | 1.5s | 48.5s | 37.3s | 4.73 | — | 0 | 266 | 0/0 | 0/1 |
| 24 | crash | 51.0s | 1.4s | 48.7s | 37.5s | 4.71 | — | 0 | 266 | 0/0 | 0/1 |
| 25 | crash | 51.0s | 1.8s | 48.8s | 37.5s | 4.70 | — | 0 | 266 | 0/0 | 0/1 |
| 26 | crash | 51.0s | 1.3s | 48.7s | 37.6s | 4.70 | — | 0 | 266 | 0/0 | 0/1 |
| 27 | crash | 51.0s | 1.6s | 48.7s | 37.5s | 4.71 | — | 0 | 266 | 0/0 | 0/1 |
| 28 | crash | 51.2s | 1.6s | 49.0s | 37.6s | 4.68 | — | 0 | 266 | 0/0 | 0/1 |
| 29 | crash | 51.0s | 1.3s | 48.7s | 37.6s | 4.70 | — | 0 | 266 | 0/0 | 0/1 |

### novice

| seed | outcome | length | first action | dead air | longest dead air | decisions/min | e1/e2 tension | kills | rounds fired | hits given/taken | shot/ground near misses |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | recovered | 2148.0s | 3.3s | 2077.2s | 772.9s | 0.22 | — | 0 | 0 | 0/1 | 0/0 |
| 1 | recovered | 1909.3s | 5.0s | 1822.6s | 614.3s | 0.19 | — | 0 | 0 | 0/0 | 0/0 |
| 2 | loss | 465.3s | 4.2s | 373.4s | 172.5s | 0.13 | — | 0 | 0 | 0/3 | 11/0 |
| 3 | recovered | 1914.1s | 3.2s | 1854.0s | 617.5s | 0.19 | — | 0 | 0 | 0/2 | 7/0 |
| 4 | recovered | 1898.4s | 4.2s | 1863.7s | 634.9s | 0.19 | — | 0 | 0 | 0/1 | 0/0 |
| 5 | recovered | 1964.0s | 3.3s | 1875.8s | 688.0s | 0.24 | — | 0 | 0 | 0/0 | 3/0 |
| 6 | recovered | 1935.9s | 4.2s | 1869.2s | 630.5s | 0.19 | — | 0 | 0 | 0/0 | 0/0 |
| 7 | recovered | 2136.8s | 2.7s | 2077.1s | 438.9s | 0.34 | — | 0 | 0 | 0/0 | 0/0 |
| 8 | recovered | 1960.9s | 3.3s | 1883.3s | 671.0s | 0.18 | — | 0 | 0 | 0/0 | 0/0 |
| 9 | recovered | 1930.7s | 3.1s | 1874.1s | 622.0s | 0.19 | — | 0 | 0 | 0/0 | 0/0 |
| 10 | recovered | 1984.6s | 3.5s | 1874.0s | 704.0s | 0.24 | — | 0 | 0 | 0/0 | 0/0 |
| 11 | recovered | 1985.6s | 3.0s | 1935.2s | 503.8s | 0.18 | — | 0 | 0 | 0/0 | 16/0 |
| 12 | recovered | 1948.2s | 5.3s | 1883.0s | 651.6s | 0.18 | — | 0 | 0 | 0/0 | 3/0 |
| 13 | recovered | 2017.7s | 2.5s | 1980.5s | 646.3s | 0.24 | — | 0 | 0 | 0/0 | 3/0 |
| 14 | recovered | 1961.5s | 3.2s | 1899.5s | 676.5s | 0.18 | — | 0 | 0 | 0/0 | 0/0 |
| 15 | loss | 137.0s | 4.1s | 103.8s | 81.3s | 0.44 | — | 0 | 0 | 0/3 | 1/0 |
| 16 | recovered | 1838.9s | 4.8s | 1722.8s | 532.6s | 0.20 | — | 0 | 0 | 0/0 | 2/0 |
| 17 | recovered | 2003.2s | 4.5s | 1948.7s | 654.2s | 0.24 | — | 0 | 0 | 0/0 | 0/0 |
| 18 | recovered | 1919.1s | 3.8s | 1851.4s | 618.2s | 0.19 | — | 0 | 0 | 0/0 | 0/0 |
| 19 | recovered | 2013.5s | 4.7s | 1914.4s | 697.9s | 0.18 | — | 0 | 0 | 0/0 | 1/0 |
| 20 | recovered | 1889.5s | 4.8s | 1836.7s | 479.8s | 0.25 | — | 0 | 0 | 0/0 | 0/0 |
| 21 | recovered | 1643.2s | 5.5s | 1540.9s | 417.3s | 0.37 | — | 0 | 0 | 0/0 | 0/0 |
| 22 | recovered | 1061.0s | 3.7s | 942.8s | 195.8s | 0.34 | — | 0 | 0 | 0/0 | 0/0 |
| 23 | recovered | 1928.6s | 4.1s | 1871.8s | 640.1s | 0.19 | — | 0 | 0 | 0/0 | 0/0 |
| 24 | loss | 70.3s | 3.9s | 65.7s | 44.3s | 0.85 | — | 0 | 0 | 0/3 | 0/0 |
| 25 | recovered | 1908.7s | 4.8s | 1808.2s | 610.6s | 0.19 | — | 0 | 0 | 0/1 | 1/0 |
| 26 | loss | 521.9s | 3.6s | 357.9s | 93.0s | 0.11 | — | 0 | 0 | 0/3 | 0/0 |
| 27 | recovered | 2134.9s | 4.3s | 2084.9s | 732.0s | 0.34 | — | 0 | 0 | 0/0 | 0/0 |
| 28 | recovered | 2266.5s | 4.5s | 2141.8s | 836.2s | 0.16 | — | 0 | 0 | 0/0 | 0/0 |
| 29 | recovered | 1878.2s | 3.5s | 1814.2s | 583.1s | 0.19 | — | 0 | 0 | 0/0 | 0/0 |

## Timeline strip

![Per-run timeline strip](timeline.svg)

The strip uses one row per run; phase colour, dead-air shading, event symbols, and the tension trace are defined in the SVG legend.
