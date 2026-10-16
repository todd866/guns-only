# Playtest Lab — beat 7

Generated 2026-10-16 · 90 runs · seed 0 · 56322.6s perceived / 57803.0s simulated · 117.8×× wall speed

## At a glance

| pilot | runs | complete | censored | win rate | mean perceived | mean simulated | flags |
|---|---:|---:|---:|---:|---:|---:|---:|
| ace | 30 | 30 | 0 | 100% | 22.9s | 22.9s | 1 |
| clone | 30 | 30 | 0 | 0% | 50.8s | 50.8s | 30 |
| novice | 30 | 30 | 0 | 0% | 1803.7s | 1853.0s | 57 |

Flag count: **88**

## Reproduction

- Command: `tools/playtest-lab/run '--beat' '7' '--seeds' '30' '--end-after-combat' '--out' 'analysis/playtest/2026-10-16-beat7-rtb/end-after-combat'`
- Source commit: `ecbba84190b6ba7f356d536d1f653045d745f3eb`
- Clone SHA-256: `a1ac519084ac414a873933838e4cd00dc816ed9c92fcd4a2b962fad56ba039ef`
- Wall time: 490.8542329s
- Configured max seconds: 3600

## Notes

- Experience proxies, not a claim to measure human feelings. 120 Hz production simulation; perceived-second bins preserve tick events and factor-weighted phase/dead-air durations. Perceived seconds = sum(fixed dt / pre-tick kernel factor); simulated seconds remain separate. Continuous factor-weighted experience, not exact browser frame timing or CPU WallSeconds. No renderer or wall-clock pacing.
- Fresh director per sortie; no progression imported. Seeds deterministically vary reaction latency, aim bias, and opening hands-off time; mission geometry/damage/AI rules stay authored. Paired seeds use the same perturbation draws for each pilot.
- Clone is the committed owner-pilot-clone policy (canonical features and reference-case validation), held at its training cadence of 20 Hz. Novice adapts BanditPressureReport's pursuit pilot. Ace adapts FirstMergeOpeningAcceptanceTests.HudPilot with delayed body-frame cue observations and bounded analog controls. Shared recovery and terrain escape use the existing scripted command seam; this is not a human usability study.
- Threat: live bandit within 2500 m and nose within 35 degrees, or firing; includes wingmen. Gun target: selected live target with authorized ballistic solution. Dead air: no threat, no gun opportunity, no player shot, decision, spectacle or near miss. Initial begin is not counted as a decision.
- Shot near miss: unique hostile gun round's swept separation within 25 m outside its hit radius; counted only on passage, not repeated ticks. Ground near miss: entry below 100 m AGL with 25 m hysteresis, excluding configured recovery/contact. Explosions are labelled destruction/impact proxies from session events, not renderer effects.
- RTB choice: combat complete, bingo, empty gun, or 600s combat budget, through TryRequestReturnToBase. Recovery/navigation follows the published RTB cue, releases steering during eligible 8x transit, then uses a conventional straight-in join. This is not learned owner behaviour or an overhead-pattern model. End-after-combat=True: TryEndSortie at the first eligible pilot update, without recovery credit. A 3600 simulated-second limit is censored, never a win or fabricated landing.
- Tension heuristic: 0.35 proximity + 0.15 positive closure (within threat range) + 0.25 threat + 0.15 damage-risk under threat + 0.10 low-clearance risk; clamped 0..1, near shots at least 0.85 and hits at least 0.95. Engagement means exclude RTB and terminal wreck descent. Phase percentages include wreck/debrief time.
- Default native terrain is the session's authored/default surface, without the browser's streamed terrain atlas. Ground-clearance results describe that substrate. CASEVAC uses semantic navigation for all profiles; fixed-wing clone/gun/G metrics do not apply. Generic pilots attempt every built-in beat; specialist mission failures and timeouts remain visible.

## Pilot metrics

Timing pairs are perceived / simulated; rates use perceived minutes.

| pilot | kills | hits given/taken | near misses | decisions/min | first action | dead air perceived/sim (max) | perceived/sim sortie | combat share perceived/sim | outcome distribution | entropy | paired e1→e2 | rising | mean Δ |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---|---:|---:|---:|---:|
| ace | 30 | 90/0 | 0 | 14.86 | 2.7s / 2.7s (0 missing) | 432.6s / 432.6s (max 7.5s / 7.5s) | 22.9s / 22.9s | 80.3% / 80.3% | win:30, loss:0, crash:0, recovered:0, draw:0 | -0.00 | 30 | 100% | +0.16 |
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

## Phase share

Each cell is perceived / simulated.

| pilot | setup | transit | merge | fight | defensive | RTB | approach | landing | dead | finished |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| ace | 4.3% / 4.3% | 15.3% / 15.3% | 17.6% / 17.6% | 29.4% / 29.4% | 33.3% / 33.3% | 0.0% / 0.0% | 0.0% / 0.0% | 0.0% / 0.0% | 0.0% / 0.0% | 0.0% / 0.0% |
| clone | 2.0% / 2.0% | 0.0% / 0.0% | 21.7% / 21.7% | 66.9% / 66.9% | 0.0% / 0.0% | 0.0% / 0.0% | 0.0% / 0.0% | 0.0% / 0.0% | 9.5% / 9.5% | 0.0% / 0.0% |
| novice | 0.1% / 0.1% | 0.0% / 0.0% | 0.6% / 0.6% | 25.7% / 25.0% | 4.1% / 4.0% | 60.2% / 61.2% | 8.0% / 7.8% | 0.8% / 0.8% | 0.6% / 0.6% | 0.0% / 0.0% |

## Runs by pilot

Timing pairs are perceived / simulated.

### ace

| seed | outcome | length | first action | dead air | longest dead air | decisions/min | e1/e2 tension | kills | rounds fired | hits given/taken | shot/ground near misses |
|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 0 | win | 19.4s / 19.4s | 1.5s / 1.5s | 11.1s / 11.1s | 4.6s / 4.6s | 15.50 | 0.27 / 0.44 | 1 | 60 | 3/0 | 0/0 |
| 1 | win | 22.8s / 22.8s | 1.9s / 1.9s | 14.4s / 14.4s | 7.5s / 7.5s | 13.18 | 0.27 / 0.43 | 1 | 59 | 3/0 | 0/0 |
| 2 | win | 20.1s / 20.1s | 2.2s / 2.2s | 11.8s / 11.8s | 4.6s / 4.6s | 14.95 | 0.27 / 0.44 | 1 | 59 | 3/0 | 0/0 |
| 3 | win | 20.4s / 20.4s | 2.6s / 2.6s | 12.1s / 12.1s | 4.5s / 4.5s | 14.70 | 0.27 / 0.44 | 1 | 59 | 3/0 | 0/0 |
| 4 | win | 24.1s / 24.1s | 2.9s / 2.9s | 15.4s / 15.4s | 4.5s / 4.5s | 17.42 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 5 | win | 24.6s / 24.6s | 3.3s / 3.3s | 16.1s / 16.1s | 4.0s / 4.0s | 14.65 | 0.27 / 0.42 | 1 | 58 | 3/0 | 0/0 |
| 6 | win | 25.1s / 25.1s | 3.6s / 3.6s | 16.5s / 16.5s | 4.9s / 4.9s | 14.36 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 7 | win | 25.1s / 25.1s | 4.0s / 4.0s | 16.6s / 16.6s | 4.3s / 4.3s | 14.33 | 0.27 / 0.43 | 1 | 55 | 3/0 | 0/0 |
| 8 | win | 22.3s / 22.3s | 1.5s / 1.5s | 13.9s / 13.9s | 7.4s / 7.4s | 13.46 | 0.27 / 0.43 | 1 | 60 | 3/0 | 0/0 |
| 9 | win | 19.7s / 19.7s | 1.9s / 1.9s | 11.5s / 11.5s | 4.6s / 4.6s | 15.22 | 0.27 / 0.44 | 1 | 59 | 3/0 | 0/0 |
| 10 | win | 20.1s / 20.1s | 2.2s / 2.2s | 11.8s / 11.8s | 4.6s / 4.6s | 14.96 | 0.27 / 0.44 | 1 | 59 | 3/0 | 0/0 |
| 11 | win | 23.7s / 23.7s | 2.6s / 2.6s | 15.0s / 15.0s | 4.8s / 4.8s | 17.72 | 0.27 / 0.43 | 1 | 59 | 3/0 | 0/0 |
| 12 | win | 24.3s / 24.3s | 2.9s / 2.9s | 15.7s / 15.7s | 3.9s / 3.9s | 14.82 | 0.27 / 0.42 | 1 | 58 | 3/0 | 0/0 |
| 13 | win | 24.7s / 24.7s | 3.3s / 3.3s | 16.1s / 16.1s | 4.7s / 4.7s | 14.58 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 14 | win | 24.8s / 24.8s | 3.6s / 3.6s | 16.3s / 16.3s | 4.0s / 4.0s | 14.54 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 15 | win | 25.2s / 25.2s | 4.0s / 4.0s | 16.7s / 16.7s | 4.3s / 4.3s | 14.26 | 0.27 / 0.43 | 1 | 54 | 3/0 | 0/0 |
| 16 | win | 22.4s / 22.4s | 1.5s / 1.5s | 14.0s / 14.0s | 7.5s / 7.5s | 13.42 | 0.27 / 0.43 | 1 | 60 | 3/0 | 0/0 |
| 17 | win | 19.7s / 19.7s | 1.9s / 1.9s | 11.5s / 11.5s | 4.6s / 4.6s | 15.22 | 0.27 / 0.44 | 1 | 59 | 3/0 | 0/0 |
| 18 | win | 23.3s / 23.3s | 2.2s / 2.2s | 14.6s / 14.6s | 7.3s / 7.3s | 12.89 | 0.27 / 0.43 | 1 | 59 | 3/0 | 0/0 |
| 19 | win | 24.0s / 24.0s | 2.6s / 2.6s | 15.4s / 15.4s | 4.0s / 4.0s | 14.99 | 0.27 / 0.43 | 1 | 59 | 3/0 | 0/0 |
| 20 | win | 24.1s / 24.1s | 2.9s / 2.9s | 15.4s / 15.4s | 4.5s / 4.5s | 17.43 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 21 | win | 24.5s / 24.5s | 3.3s / 3.3s | 16.0s / 16.0s | 3.9s / 3.9s | 14.70 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 22 | win | 25.0s / 25.0s | 3.6s / 3.6s | 16.4s / 16.4s | 5.2s / 5.2s | 14.40 | 0.27 / 0.43 | 1 | 57 | 3/0 | 0/0 |
| 23 | win | 25.2s / 25.2s | 4.0s / 4.0s | 16.7s / 16.7s | 4.3s / 4.3s | 14.26 | 0.27 / 0.43 | 1 | 54 | 3/0 | 0/0 |
| 24 | win | 19.3s / 19.4s | 1.5s / 1.5s | 11.1s / 11.1s | 4.6s / 4.6s | 15.50 | 0.27 / 0.44 | 1 | 60 | 3/0 | 0/0 |
| 25 | win | 19.7s / 19.7s | 1.9s / 1.9s | 11.5s / 11.5s | 4.6s / 4.6s | 15.21 | 0.27 / 0.44 | 1 | 59 | 3/0 | 0/0 |
| 26 | win | 23.6s / 23.6s | 2.2s / 2.2s | 15.0s / 15.0s | 4.8s / 4.8s | 15.22 | 0.27 / 0.42 | 1 | 59 | 3/0 | 0/0 |
| 27 | win | 20.4s / 20.4s | 2.6s / 2.6s | 11.9s / 11.9s | 4.4s / 4.4s | 14.68 | 0.27 / 0.45 | 1 | 59 | 3/0 | 0/0 |
| 28 | win | 24.3s / 24.3s | 2.9s / 2.9s | 15.7s / 15.7s | 4.0s / 4.0s | 14.79 | 0.27 / 0.43 | 1 | 58 | 3/0 | 0/0 |
| 29 | win | 24.6s / 24.6s | 3.3s / 3.3s | 16.1s / 16.1s | 4.0s / 4.0s | 14.61 | 0.27 / 0.42 | 1 | 58 | 3/0 | 0/0 |

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
