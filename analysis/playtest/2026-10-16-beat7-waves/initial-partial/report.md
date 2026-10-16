# Playtest Lab — beat 7

Generated 2026-10-16 · 66 runs · seed 0 · 73677.3s perceived / 87181.4s simulated · 111.1×× wall speed

## At a glance

| pilot | runs | complete | censored | win rate | mean perceived | mean simulated | flags |
|---|---:|---:|---:|---:|---:|---:|---:|
| ace | 6 | 6 | 0 | 0% | 315.2s | 315.2s | 6 |
| clone | 30 | 30 | 0 | 0% | 50.8s | 50.8s | 30 |
| novice | 30 | 10 | 20 | 0% | 2342.0s | 2792.2s | 64 |

Flag count: **100**

## Reproduction

- Command: `tools/playtest-lab/run '--beat' '7' '--seeds' '30' '--out' 'analysis/playtest/2026-10-16-beat7-waves/land-autopilot'`
- Source commit: `b8504825fc35a5064074f3d2c61f13bdace6f5c7`
- Clone SHA-256: `a1ac519084ac414a873933838e4cd00dc816ed9c92fcd4a2b962fad56ba039ef`
- Wall time: 784.4601385s
- Configured max seconds: 3600

## Notes

- Experience proxies, not a claim to measure human feelings. 120 Hz production simulation; perceived-second bins preserve tick events and factor-weighted phase/dead-air durations. Perceived seconds = sum(fixed dt / pre-tick kernel factor); simulated seconds remain separate. Continuous factor-weighted experience, not exact browser frame timing or CPU WallSeconds. No renderer or wall-clock pacing.
- Fresh director per sortie; no progression imported. Seeds deterministically vary pilot reaction latency, aim bias, opening hands-off time, escalating-wave geometry/doctrine, and seeded RTB bounce. Paired seeds use the same perturbation draws for each pilot.
- Clone is the committed owner-pilot-clone policy (canonical features and reference-case validation), held at its training cadence of 20 Hz. Novice adapts BanditPressureReport's pursuit pilot. Ace adapts FirstMergeOpeningAcceptanceTests.HudPilot with delayed body-frame cue observations and bounded analog controls. Shared recovery and terrain escape use the existing scripted command seam; this is not a human usability study.
- Threat: live bandit within 2500 m and nose within 35 degrees, or firing; includes wingmen. Gun target: selected live target with authorized ballistic solution. Dead air: no threat, no gun opportunity, no player shot, decision, spectacle or near miss. Initial begin is not counted as a decision.
- Shot near miss: unique hostile gun round's swept separation within 25 m outside its hit radius; counted only on passage, not repeated ticks. Ground near miss: entry below 100 m AGL with 25 m hysteresis, excluding configured recovery/contact. Explosions are labelled destruction/impact proxies from session events, not renderer effects.
- RTB choice: combat complete, bingo, empty gun, or 600s combat budget, through TryRequestReturnToBase. Recovery/navigation follows the published RTB cue, releases steering during eligible 8x transit, then uses a conventional straight-in join. This is not learned owner behaviour or an overhead-pattern model. End-after-combat=False: TryEndSortie at the first eligible pilot update, without recovery credit. A 3600 simulated-second limit is censored, never a win or fabricated landing.
- Tension heuristic: 0.35 proximity + 0.15 positive closure (within threat range) + 0.25 threat + 0.15 damage-risk under threat + 0.10 low-clearance risk; clamped 0..1, near shots at least 0.85 and hits at least 0.95. Engagement means exclude RTB and terminal wreck descent. Phase percentages include wreck/debrief time.
- Default native terrain is the session's authored/default surface, without the browser's streamed terrain atlas. Ground-clearance results describe that substrate. CASEVAC uses semantic navigation for all profiles; fixed-wing clone/gun/G metrics do not apply. Generic pilots attempt every built-in beat; specialist mission failures and timeouts remain visible.

## Pilot metrics

Timing pairs are perceived / simulated; rates use perceived minutes. Raw dead air includes deliberate RTB autopilot transit; the `active dead air` value excludes those ticks.

| pilot | kills | hits given/taken | waves / score | bounce runs | near misses | decisions/min | first action | dead air raw active (max) | perceived/sim sortie | combat share perceived/sim | outcome distribution | entropy | paired e1→e2 | rising | mean Δ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|
| ace | 8 | 18/22 | 13 / 1350 | 0 | 72 | 11.74 | 2.4s / 2.4s (0 missing) | 1493.8s / 1493.8s (max 74.3s / 74.3s) | 315.2s / 315.2s | 81.8% / 81.8% | win:0, loss:6, crash:0, recovered:0, draw:0 | -0.00 | 6 | 100% | +0.17 |
| clone | 0 | 0/0 | 0 / 0 | 0 | 30 | 4.72 | 1.5s / 1.5s (0 missing) | 1457.2s / 1457.2s (max 38.0s / 38.0s) | 50.8s / 50.8s | 88.5% / 88.5% | win:0, loss:0, crash:30, recovered:0, draw:0 | -0.00 | 0 | — | — |
| novice | 0 | 0/23 | 0 / 0 | 10 | 63 | 0.22 | 4.0s / 4.0s (0 missing) | 66797.9s / 64870.3s (max 2380.4s / 2380.4s) | 2342.0s / 2792.2s | 94.1% / 78.9% | win:0, loss:6, crash:0, recovered:4, draw:0 | 0.42 | 10 | 40% | +0.08 |

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
- dead air >20s: novice seed 0 (79.7s perceived)
- dead air >20s: novice seed 1 (923.3s perceived)
- dead air >20s: novice seed 2 (172.5s perceived)
- dead air >20s: novice seed 3 (198.8s perceived)
- dead air >20s: novice seed 4 (58.9s perceived)
- dead air >20s: novice seed 5 (1380.2s perceived)
- dead air >20s: novice seed 6 (2380.4s perceived)
- dead air >20s: novice seed 7 (308.4s perceived)
- dead air >20s: novice seed 8 (484.9s perceived)
- dead air >20s: novice seed 9 (894.0s perceived)
- dead air >20s: novice seed 10 (628.6s perceived)
- dead air >20s: novice seed 11 (838.6s perceived)
- dead air >20s: novice seed 12 (2128.1s perceived)
- dead air >20s: novice seed 13 (535.0s perceived)
- dead air >20s: novice seed 14 (991.7s perceived)
- dead air >20s: novice seed 15 (92.8s perceived)
- dead air >20s: novice seed 16 (650.3s perceived)
- dead air >20s: novice seed 17 (1253.2s perceived)
- dead air >20s: novice seed 18 (2114.4s perceived)
- dead air >20s: novice seed 19 (1181.1s perceived)
- dead air >20s: novice seed 20 (1587.2s perceived)
- dead air >20s: novice seed 21 (723.4s perceived)
- dead air >20s: novice seed 22 (982.8s perceived)
- dead air >20s: novice seed 23 (772.9s perceived)
- dead air >20s: novice seed 24 (40.0s perceived)
- dead air >20s: novice seed 25 (129.3s perceived)
- dead air >20s: novice seed 26 (112.9s perceived)
- dead air >20s: novice seed 27 (855.8s perceived)
- dead air >20s: novice seed 28 (1166.6s perceived)
- dead air >20s: novice seed 29 (745.0s perceived)
- dead air >20s: ace seed 0 (74.3s perceived)
- dead air >20s: ace seed 1 (50.0s perceived)
- dead air >20s: ace seed 2 (33.4s perceived)
- dead air >20s: ace seed 3 (32.0s perceived)
- dead air >20s: ace seed 4 (32.5s perceived)
- dead air >20s: ace seed 5 (35.8s perceived)
- novice win rate 0%
- RTB longer than fight/defensive/merge: novice seed 0
- approach longer than fight/defensive/merge: novice seed 0
- incomplete/censored: novice seed 1
- RTB longer than fight/defensive/merge: novice seed 3
- RTB longer than fight/defensive/merge: novice seed 4
- approach longer than fight/defensive/merge: novice seed 4
- tension not rising: novice seed 5 (0.03→0.01)
- incomplete/censored: novice seed 5
- incomplete/censored: novice seed 6
- incomplete/censored: novice seed 7
- incomplete/censored: novice seed 8
- incomplete/censored: novice seed 10
- incomplete/censored: novice seed 11
- tension not rising: novice seed 12 (0.02→0.02)
- incomplete/censored: novice seed 12
- incomplete/censored: novice seed 14
- tension not rising: novice seed 16 (0.05→0.01)
- incomplete/censored: novice seed 16
- incomplete/censored: novice seed 17
- tension not rising: novice seed 18 (0.02→0.01)
- incomplete/censored: novice seed 18
- incomplete/censored: novice seed 19
- incomplete/censored: novice seed 20
- incomplete/censored: novice seed 21
- incomplete/censored: novice seed 22
- incomplete/censored: novice seed 23
- RTB longer than fight/defensive/merge: novice seed 25
- approach longer than fight/defensive/merge: novice seed 25
- tension not rising: novice seed 27 (0.04→0.01)
- incomplete/censored: novice seed 27
- tension not rising: novice seed 28 (0.05→0.02)
- incomplete/censored: novice seed 28
- incomplete/censored: novice seed 29

## Phase share

Each cell is perceived / simulated.

| pilot | setup | transit | merge | fight | defensive | RTB | approach | landing | dead | finished |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| ace | 0.3% / 0.3% | 8.8% / 8.8% | 1.2% / 1.2% | 60.0% / 60.0% | 20.6% / 20.6% | 0.0% / 0.0% | 0.0% / 0.0% | 0.0% / 0.0% | 9.1% / 9.1% | 0.0% / 0.0% |
| clone | 2.0% / 2.0% | 0.0% / 0.0% | 21.7% / 21.7% | 66.9% / 66.9% | 0.0% / 0.0% | 0.0% / 0.0% | 0.0% / 0.0% | 0.0% / 0.0% | 9.5% / 9.5% | 0.0% / 0.0% |
| novice | 0.0% / 0.0% | 0.0% / 0.0% | 0.5% / 0.4% | 88.7% / 74.4% | 4.9% / 4.1% | 4.5% / 19.9% | 0.4% / 0.3% | 0.1% / 0.1% | 0.9% / 0.7% | 0.0% / 0.0% |

## Runs by pilot

Timing pairs are perceived / simulated.

### ace

| seed | outcome | length | first action | dead air | longest dead air | decisions/min | e1/e2 tension | kills | rounds fired | hits given/taken | shot/ground near misses |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | loss | 337.5s / 337.5s | 1.5s / 1.5s | 275.7s / 275.7s | 74.3s / 74.3s | 12.27 | 0.27 / 0.44 | 1 | 60 | 3/3 | 20/0 |
| 1 | loss | 252.1s / 252.1s | 1.9s / 1.9s | 177.6s / 177.6s | 50.0s / 50.0s | 6.19 | 0.27 / 0.43 | 1 | 59 | 3/3 | 10/0 |
| 2 | loss | 269.2s / 269.2s | 2.2s / 2.2s | 183.9s / 183.9s | 33.4s / 33.4s | 17.83 | 0.27 / 0.44 | 1 | 59 | 3/4 | 28/0 |
| 3 | loss | 493.8s / 493.8s | 2.6s / 2.6s | 439.1s / 439.1s | 32.0s / 32.0s | 13.49 | 0.27 / 0.44 | 3 | 76 | 3/6 | 10/0 |
| 4 | loss | 151.3s / 151.3s | 2.9s / 2.9s | 114.9s / 114.9s | 32.5s / 32.5s | 9.12 | 0.27 / 0.43 | 1 | 58 | 3/3 | 4/0 |
| 5 | loss | 387.0s / 387.0s | 3.3s / 3.3s | 302.6s / 302.6s | 35.8s / 35.8s | 9.46 | 0.27 / 0.42 | 1 | 58 | 3/3 | 0/0 |

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
| 0 | recovered | 239.0s / 737.8s | 3.3s / 3.3s | 233.6s / 732.5s | 79.7s / 475.7s | 1.26 | — | 0 | 0 | 0/1 | 0/0 |
| 1 | incomplete | 2829.2s / 3600.0s | 5.0s / 5.0s | 2696.2s / 3467.0s | 923.3s / 923.3s | 0.17 | — | 0 | 0 | 0/0 | 0/0 |
| 2 | loss | 521.6s / 521.6s | 4.2s / 4.2s | 429.6s / 429.6s | 172.5s / 172.5s | 0.23 | — | 0 | 0 | 0/3 | 11/0 |
| 3 | recovered | 885.0s / 1735.9s | 3.2s / 3.2s | 822.1s / 1673.0s | 198.8s / 571.3s | 0.34 | — | 0 | 0 | 0/2 | 7/0 |
| 4 | recovered | 138.8s / 369.0s | 4.2s / 4.2s | 132.4s / 362.6s | 58.9s / 221.6s | 2.16 | — | 0 | 0 | 0/1 | 0/0 |
| 5 | incomplete | 3557.1s / 3600.0s | 3.3s / 3.3s | 3448.3s / 3491.2s | 1380.2s / 1380.2s | 0.19 | 0.03 / 0.01 | 0 | 0 | 0/0 | 3/0 |
| 6 | incomplete | 2812.4s / 3600.0s | 4.2s / 4.2s | 2745.8s / 3533.0s | 2380.4s / 2380.4s | 0.09 | — | 0 | 0 | 0/0 | 0/0 |
| 7 | incomplete | 2878.1s / 3600.0s | 2.7s / 2.7s | 2660.7s / 3381.3s | 308.4s / 557.6s | 0.63 | — | 0 | 0 | 0/0 | 0/0 |
| 8 | incomplete | 2824.0s / 3600.0s | 3.3s / 3.3s | 2720.3s / 3496.3s | 484.9s / 836.7s | 0.13 | — | 0 | 0 | 0/0 | 0/0 |
| 9 | loss | 2894.5s / 3019.6s | 3.2s / 3.2s | 2737.3s / 2862.0s | 894.0s / 894.0s | 0.19 | 0.04 / 0.50 | 0 | 0 | 0/3 | 6/0 |
| 10 | incomplete | 2962.4s / 3600.0s | 3.5s / 3.5s | 2826.7s / 3464.4s | 628.6s / 727.3s | 0.24 | — | 0 | 0 | 0/0 | 0/0 |
| 11 | incomplete | 2813.5s / 3600.0s | 3.1s / 3.1s | 2737.5s / 3524.0s | 838.6s / 838.6s | 0.26 | — | 0 | 0 | 0/0 | 16/0 |
| 12 | incomplete | 3450.1s / 3600.0s | 5.3s / 5.2s | 3366.4s / 3514.3s | 2128.1s / 2128.1s | 0.16 | 0.02 / 0.02 | 0 | 17 | 0/0 | 3/0 |
| 13 | loss | 2940.4s / 3177.6s | 2.5s / 2.5s | 2815.8s / 3053.0s | 535.0s / 535.0s | 0.43 | 0.06 / 0.53 | 0 | 0 | 0/3 | 3/0 |
| 14 | incomplete | 2840.3s / 3600.0s | 3.2s / 3.2s | 2740.9s / 3500.5s | 991.7s / 991.7s | 0.13 | — | 0 | 0 | 0/0 | 0/0 |
| 15 | loss | 359.1s / 381.0s | 4.1s / 4.1s | 243.3s / 265.2s | 92.8s / 92.8s | 1.00 | 0.32 / 0.35 | 0 | 0 | 0/3 | 3/0 |
| 16 | incomplete | 3504.1s / 3600.0s | 4.8s / 4.8s | 3334.5s / 3430.4s | 650.3s / 650.3s | 0.26 | 0.05 / 0.01 | 0 | 0 | 0/0 | 2/0 |
| 17 | incomplete | 2819.8s / 3600.0s | 4.5s / 4.5s | 2754.2s / 3533.6s | 1253.2s / 1253.2s | 0.13 | — | 0 | 0 | 0/0 | 0/0 |
| 18 | incomplete | 3574.3s / 3600.0s | 3.8s / 3.8s | 3488.6s / 3514.4s | 2114.4s / 2114.4s | 0.15 | 0.02 / 0.01 | 0 | 0 | 0/0 | 4/0 |
| 19 | incomplete | 2814.0s / 3600.0s | 4.7s / 4.7s | 2579.9s / 3365.8s | 1181.1s / 1181.1s | 0.13 | — | 0 | 0 | 0/0 | 1/0 |
| 20 | incomplete | 3474.4s / 3600.0s | 4.8s / 4.8s | 3242.4s / 3367.7s | 1587.2s / 1587.2s | 0.22 | 0.04 / 0.04 | 0 | 0 | 0/0 | 0/0 |
| 21 | incomplete | 2813.0s / 3600.0s | 5.5s / 5.5s | 2638.8s / 3425.8s | 723.4s / 835.3s | 0.17 | — | 0 | 0 | 0/0 | 0/0 |
| 22 | incomplete | 2814.5s / 3600.0s | 3.7s / 3.7s | 2674.3s / 3459.5s | 982.8s / 982.8s | 0.13 | — | 0 | 0 | 0/0 | 0/0 |
| 23 | incomplete | 2808.6s / 3600.0s | 4.1s / 4.1s | 2728.3s / 3519.6s | 772.9s / 879.3s | 0.09 | — | 0 | 0 | 0/0 | 0/0 |
| 24 | loss | 73.9s / 73.9s | 3.9s / 3.9s | 69.3s / 69.3s | 40.0s / 40.0s | 1.62 | — | 0 | 0 | 0/3 | 0/0 |
| 25 | recovered | 279.1s / 1227.3s | 4.8s / 4.8s | 243.5s / 1191.8s | 129.3s / 1030.9s | 1.07 | — | 0 | 0 | 0/1 | 0/0 |
| 26 | loss | 521.6s / 521.6s | 3.6s / 3.6s | 358.2s / 358.2s | 112.9s / 112.9s | 0.23 | — | 0 | 0 | 0/3 | 0/0 |
| 27 | incomplete | 3571.5s / 3600.0s | 4.3s / 4.3s | 3418.4s / 3446.8s | 855.8s / 855.8s | 0.32 | 0.04 / 0.01 | 0 | 0 | 0/0 | 4/0 |
| 28 | incomplete | 3394.2s / 3600.0s | 4.5s / 4.5s | 3200.6s / 3404.9s | 1166.6s / 1166.6s | 0.23 | 0.05 / 0.02 | 0 | 0 | 0/0 | 0/0 |
| 29 | incomplete | 2852.6s / 3600.0s | 3.5s / 3.5s | 2710.0s / 3453.7s | 745.0s / 745.0s | 0.08 | — | 0 | 0 | 0/0 | 0/0 |

## Timeline strip

![Per-run timeline strip](timeline.svg)

The strip uses one row per run; phase colour, dead-air shading, event symbols, and the tension trace are defined in the SVG legend.
