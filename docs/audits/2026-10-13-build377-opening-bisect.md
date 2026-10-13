# Build 377 opening regression: isolated, not fixed

2026-10-13, Codex. Base `d597b366`, branch `release/build-377`.
Experiments ran in a new detached `.worktrees/scratch-bisect` within the release worktree.
**No flight-law change is landed. The integrated opening still fails.**

The regression comes from the F-22 analog cubic shaping introduced by `138d74aa`,
specifically `AnalogRollCentreExpo = 0.65`. Removing only that parameter restores
8/8 O1 kernel conversions and 2/2 published real-touch receipts, but breaks the
required fine-roll bound. The assist arbitration change and a1 review fixes are
not appropriate reverts.

## Controlled comparisons

All other release changes, pilot gains, reaction delays, gun geometry, physical
ballistics, and acceptance thresholds stayed unchanged in these comparisons.
The seven-test selection is `FirstMergeOpeningAcceptanceTests` plus
`O1ConvertsThenStagesD1WithoutMovingThePlayer`.

| Scratch change from the base | O1 conversions | Selected tests |
| --- | ---: | ---: |
| None | 1/8 | 6 pass, 1 fail |
| Expo 0, retain a3 hold deadband .005 | 8/8 | 7/7 pass |
| Expo 0 and old hold deadband .05 | 8/8 | 7/7 pass |
| Restore shaped-command assist arbitration only | 1/8 | 6 pass, 1 fail |
| Revert `3b209f49` BodyForward tracking only | 0/8 | 5 pass, 2 fail |

The first three conversion counts were also measured in a single parameterized
matrix using the same staged seed perturbations. Tightening the Present tracking
angle from 3 to 1 degree still gives 1/8. Reducing the authored lead bank from
15 to 10 or 5 degrees gives 0/8 or 2/8. Those changes were discarded.

## Mechanism

At stick .35, the cubic returns .15037: 57% less aileron demand. F-22's
`RollHoldAttitudeGainNmRad` is zero, so its detent aileron share here is **1.0**,
not the .38 used by airframes with attitude hold. Neither the lateral gunnery aid
(its F-22 gains are zero) nor unselected padlock adds roll in this encounter.

A second experiment recorded seed 0's stick/trigger history and replayed those
identical inputs through both laws. At 2.008 seconds:

| Measurement | Expo .65 | Expo 0 |
| --- | ---: | ---: |
| Raw roll / pitch | .17880 / .00959 | .17880 / .00959 |
| Applied roll command | .06629 | .17880 |
| Bank | 7.949 degrees | 21.090 degrees |
| Body roll rate | 12.592 degrees/s | 33.379 degrees/s |
| SAS roll | 0 | 0 |
| Pitch assist / Present | ACTIVE_FULL / true | ACTIVE_FULL / true |

The differing roll response precedes the later cue/assist feedback. The hold
damper is already inactive at these command magnitudes. With the delayed HUD
pilot running normally, slow banking lets the cue fall below the gun line; the
pilot commands an unload and the pitch assist correctly yields. Subsequent
reversals arrive late. This is not evidence for removing unload ownership,
BodyForward tracking, the external Present handoff, or the c8 ladder.

## Why the obvious fix was not landed

Measured with the existing fine-roll rig, at 354 KCAS / 10,000 ft:

| Law | 35% stick | 50% stick | Full stick | Worst 1 px step, first 15 px |
| --- | ---: | ---: | ---: | ---: |
| Release cubic .65 / hold .005 | 29.11 deg/s | 49.66 deg/s | 196.85 deg/s | 1.688 deg/s |
| No expo / hold .005 | 67.90 deg/s | 97.23 deg/s | 196.85 deg/s | 3.933 deg/s |

Simply softening the cubic did not satisfy both gates. A half-gain centre through
.17 stick, smoothly recovering identity by .25–.30, with hold .001, passes the
centre bound (1.964 deg/s/px) but converts only 6/8. Finishing that recovery by
.22 converts 7/8, yet moves a worse gain jump just beyond the measured region:
15, 16, 17 and 18 px yield 16.26, 23.77, 37.73 and 44.34 deg/s. The 16→17 px
increase is **13.96 deg/s**. This was rejected despite passing the narrow numeric
centre criterion. A gradual transition to a constant outer slope also failed
conversion (at best 5/8). No acceptance test or pilot gain was weakened.

These experiments do not prove that an acceptable control law is impossible.
They establish that no tested minimal curve change preserves all the requested
intent. A principled next implementation would need a broader control-response
design and verification, including acquisition, reversal and fine tracking—not
another arbitrarily placed gain shoulder. No such implementation is claimed here.

## Browser evidence and landed diagnostics

The **experimental no-expo publish**, not the release branch, passes the unchanged
receipt in both orientations: first hits at 3.175 s portrait and 3.300 s landscape;
coarse windows 2.900/2.950 s; 32/42 rounds; one physical kill each; zero page errors.
Fresh storage, wordless public door, real CDP touch, headless full Chromium,
silent audio, ANGLE Metal / Apple M5. Both first-hit screenshots were inspected.
This is automated functional evidence, not human-phone acceptance.

The landed changes only expose raw, shaped and applied control values in the
opt-in opening trace and tighten O1 acceptance from 5/8 to the requested 7/8.
`roll=requested/applied` means detent command / command entering AircraftSim;
`rollRate` is the resulting physical response. No runtime code changed.
Final focused validation: **15 pass / 1 fail / 16 total**; O1 remains 1/8.
All nine existing fine-roll tests pass. The complete release gate remains open.

Evidence root: `~/.local/state/guns-only-improve/`:

- `impl-logs/rel377-bisect-{baseline,no-expo,old-roll,shaped-arbitration,no-body-review}.log`
- `impl-logs/rel377-bisect-{matrix,local-curve,curves,short-curve,dual-rate,track1,bank10,bank5}.log`
- `impl-logs/rel377-bisect-{replay,rates,final}.log`
- `impl-logs/rel377-bisect-no-expo-{publish,receipt}.log`
- `shots/impl-rel377-bisect/no-expo/first-merge-receipt/{portrait,landscape}/first-hit.png`

The append-only `handoff/rel377-merge.md` bisect section contains exact commands,
fresh baseline receipt results, commit, cleanup and review dispositions.
