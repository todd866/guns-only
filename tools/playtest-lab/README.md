# Playtest Lab

From this worktree, run the full beat 7 sweep (30 paired seeds for each of three pilots):

```sh
tools/playtest-lab/run --beat 7
```

Requires the repo's .NET 8 SDK (`~/.dotnet`, selected automatically) and Python 3.
No browser, NuGet test runner, model service, telemetry download, push or deployment.
The command builds a small console host, flies the production session at 120 Hz without
wall-clock pacing, and generates `analysis/playtest/<local-date>-beat7/report.md` plus
`timeline.svg`, `summary.json`, `manifest.json`, and compressed per-run JSON tapes.
It refuses to overwrite a nonempty output directory; use `--out` for another experiment.

```sh
tools/playtest-lab/run --beat 9 --seeds 10 --start-seed 100 --out /tmp/ace-duel
tools/playtest-lab/run --beat 7 --pilots clone --seeds 3 --max-seconds 600 --out /tmp/clone-short
tools/playtest-lab/run --self-test
python3 -m unittest discover -s tools/playtest-lab -p 'test_*.py'
python3 tools/playtest-lab/report.py analysis/playtest/2026-10-16-beat7
```

`--beat` accepts every built-in id, 1–14, and rejects unknown ids. Other options:
`--pilots clone,novice,ace`, `--seeds 30`, `--start-seed 0`, `--max-seconds 3600`,
`--rtb-after 600`, `--end-after-combat`, `--threat-km 2.5`, `--near-miss-m 25`, `--ground-m 100`, `--out DIR`.
The time limit and combat RTB budget are simulated seconds for baseline continuity.
The time limit is an emergency bound, not an instruction to declare a sortie finished.
The manifest checkpoints after every run; an interrupted batch can still be reported.
When Ian's installed battery guard is present, the launcher checks before building
and before each new sortie. `PLAYTEST_POWER_GUARD` can point to the same guard with
a writable state location in a sandbox; a refusal stops the batch with evidence saved.
Compare only runs with matching options, source commit and clone hash. A replay is
deterministic on the same runtime/build; floating-point identity across architectures
is not promised. Wall times are excluded from replay comparisons.

## What flies

Each run starts a fresh `SimulationSession(beat)` and fresh director, calls `Begin`,
then advances through combat, RTB, approach, physical landing/crash and `Finished`.
With `--end-after-combat`, the pilot instead calls `TryEndSortie()` on its first
eligible update. It banks completed combat and records `sortieEndedEarly=true`,
without a landing or recovery credit. Before combat completion (including novice
RTB and clone crashes), behavior is unchanged.
There are no forced kills, damage changes, teleports, fake landing credits, restarts,
or physics shortcuts. Bounded runs are `incomplete`, with censored outcome rates.
Some beats finish their authored lifecycle without a recovery leg; the lab does not
invent a runway for them. Generic controllers attempt specialist beats too: a crash
or timeout must be inspected as possible controller failure before blaming mission design.

- **clone:** `ClonedPilotPolicy` loads the existing `analysis/owner-pilot-clone.json`,
  verifies its feature version and trainer reference cases, and runs through canonical
  `CombatPolicyObservation` / `HumanPilotFeatures` at 20 Hz. No retraining. The source
  model was trained from the owner's 204 engagements; it is an engagement clone, not
  a claim that landing or mission selection has been learned.
- **novice:** adapts `BanditPressureReport.ScriptedPlayer`: 0.8–1.4 s reaction delay,
  2–5 s opening hesitation, 3.2 G / 65° bank limit, partial lead, aim error, poor energy
  discipline and low power. It can miss, stall or run out of useful combat time.
- **ace:** adapts `FirstMergeOpeningAcceptanceTests.HudPilot`: delayed body-frame HUD
  lead cue, bounded analog stick movement, solution-gated firing, and terrain escape.
  The authored opening trim is retained. “Ace” names a good scripted control profile,
  not a guarantee of winning or a model of an expert human.

An explicit integer PRNG varies reaction/hesitation/aim per seed. Seeds are paired
between profiles, and do not mutate mission geometry, opponent skill, hits-to-kill,
or the director. All pilots request RTB on combat completion, bingo, empty ammunition,
or the combat-time budget, using `TryRequestReturnToBase`. They share a scripted
recovery pilot based on the production recovery schedule and
`RecoveryProfileFlightTests` pitch/speed feedback. Conventional runway navigation uses
a documented outbound/inbound cross-track join and straight-in final, with a missed
approach retry; it is not an overhead-pattern human pilot model.
The recovery pilot requests `SetTimeCompressionEnabled(true)` on RTB and after
any safety drop. Successful engagement transfers control to the kernel's RTB
autopilot; the lab writes no stick, throttle or scripted command while AP is
active, even if the host caps its factor. A cleared drop is retried on the next
pilot update. The shared `RecoverySteering` controller follows the published
moving ingress cue outside 14 km, then the established straight-in join. AP
leaves configuration to the player and yields at threats, final (~3 NM),
configuration change, AUTO-GCAS lead, or fresh pilot input beyond an 8% deadband.
Manual lab recovery resumes after a drop using the same steering module. Route
and control ownership change versus earlier cohorts, so baseline deltas include
trajectory differences as well as time weighting.
Gear/hook/flap commands and actual runway/carrier contact remain normal session inputs.
Beat 13 uses shared CASEVAC navigation controls for every profile; it never feeds the
fighter clone into a rotary-wing vehicle. G is null there.

## Measurement contract

These are observable experience proxies, not measured human emotion or physics validation.
The report repeats the thresholds and provenance so the numbers travel with their meaning.

| Measure | Definition |
|---|---|
| Threat | Live primary/wingman within X m and pointing within 35°; or firing. This is visible threat geometry even during a presentation pass. |
| Gun target | Live selected target, authorized player weapon, ballistic `GunSolution`. A distant contact alone is not a shot opportunity. |
| Meaningful action | Threat, gun opportunity, player firing, stable controller decision, spectacle or near miss. Staging/initial target selection does not count. |
| Dead air | Every 120 Hz tick lacking all the above. Total and longest contiguous durations are exact to one tick, including wreck descent until debrief. |
| Decisions | Tactical mode changes stable for 0.5 s, successor target acquisition, bingo acknowledgement, RTB choice/acceptance. These are controller decisions, not every servo update or human cognitive workload. |
| Shot near miss | A unique hostile gun round's swept relative-world separation passes within Y m but outside its effective hit radius. Count once on recession; exclude impact rounds and relief-targeted rounds. |
| Ground near miss | Entry below Z m clearance, reset above Z+25 m; exclude configured approach/contact and terminal wrecks. The native session terrain/default ground is used, not browser-streamed atlas geometry. |
| Spectacle | Authoritative hit, kill, destruction and impact events. Destruction/impact are labelled explosion **proxies**; no renderer is running. |
| Energy | Specific mechanical energy height `altitude + speed²/(2g)`, in metres. |
| Tension | Clamped 0–1 weighted proximity, closure, pointing/firing, damage risk, low clearance; near shot ≥0.85, hit taken ≥0.95. One-second curve is the tick mean. |
| Escalation | Compare exact combat-only mean tension in engagements 1 and 2 within the same run. Report paired counts, rising share and mean difference; missing engagement 2 is N/A. |
| Outcome | `win`, `loss`, `crash`, `recovered` (early RTB), `draw`, or `incomplete`. A shot-down wreck is a combat loss. Combat completion and physical landing are also recorded separately. |

Schema 2 uses **player wall-clock seconds** for every experience duration, phase
share, first action, dead-air streak and rate. The runner negotiates `Advance(0, 8)`
before each `StepFixed()`, observes that one ordinary 120 Hz production tick, and
adds `FixedDeltaSeconds / entryFactor` to the perceived clock. This documented
native seam preserves near-miss/event observation. It models continuous factor-
weighted experience; it does not reproduce browser frame quantization or a
renderer cost governor. The host always offers a ceiling of 8; safety can select 1.
`WallSeconds` remains execution elapsed time, separate from both player and sim.

Each tape contains `timeline` perceived-second bins (including the final fractional
second), `events` with both clocks, exact phase-duration totals, engagement tension
summaries, and sortie counters. Bin booleans mean “at any tick in this second”; continuous
G/energy/tension are weighted by perceived duration, clearance is the minimum. Phase colour is the dominant phase
of the bin; `phaseSeconds` retains subsecond transitions. Heading, speed, altitude and
recovery gate and runway-frame position at the end of each bin help distinguish pilot
failure from mission pacing.
`seconds` remains simulated sortie length for schema-1 continuity;
`perceivedSeconds` is player length. Bins carry `simSecond`/`simDuration` alongside
`second`/`duration`; run/bin `simPhaseSeconds` and `simDeadAirSeconds` retain simulated
exposure. First action and longest dead air also have `sim` counterparts. Events
retain their authoritative tick time as `simSecond`. First action retains the
baseline convention of the start of its observed tick interval, with at most one
tick of quantization relative to event stamps. A tick crossing a perceived
bin boundary splits durations and weighted values, but its discrete counters are
recorded once. End's between-tick finish event is retained without extra duration.
`compressionSimSeconds` records exposure at each selected factor, and the inhibit
histogram and final-bin cue alignment help explain unavailable compression.
Reports read old tapes as 1× and show both clocks.
SVG event markers are bin counts, not exact ordering; use the event tape for exact times.

Flags cover >20 s dead air, >30 s/missing first action, novice 0% / ace 100% observed
win rates, non-rising paired engagement tension, recovery phases longer than combat,
and incomplete/all-censored samples. Completed-only win rates and outcome entropy are
accompanied by censoring counts; neither treats an interrupted run as a loss or a win.
This is a diagnostic report, so flags do not fail the command.

## Reused code and validation

The lab references `GunsOnly.Sim` directly. Its only simulation addition is friend
assembly access to the existing internal scripted-pilot seam. It reuses
`Beats.BuiltIn`, production lifecycle/weapon/event telemetry, `ClonedPilotPolicy`,
`HumanPilotFeatures`, and the existing pressure/opening/recovery controller patterns.
`tools/ai/train_pilot_clone.py` remains the training authority; the lab only consumes
its committed manifest. It does not depend on xUnit or private telemetry datasets.

`--self-test` checks clone reference outputs, same/different-seed replays, timeout
classification, duration/counter conservation, fast-round passages/hits/filtering,
all 14 beat ids, and physical full-stop recoveries including formerly stuck novice/ace
join cases, without teleporting the aircraft.
The Python tests check metric/flag aggregation, paired escalation, partial bins,
censoring, and parseable SVG. Run a small full sortie before large cohorts when
changing a controller. Inspect the SVG as well as the summary: a green build is not
evidence that a pilot can shoot or recover.

## Paired RTB study

```sh
tools/playtest-lab/run --beat 7 --seeds 30 --out analysis/playtest/2026-10-16-beat7-rtb/land
tools/playtest-lab/run --beat 7 --seeds 30 --end-after-combat --out analysis/playtest/2026-10-16-beat7-rtb/end-after-combat
python3 tools/playtest-lab/compare.py analysis/playtest/2026-10-16-beat7 \
  analysis/playtest/2026-10-16-beat7-rtb/land \
  analysis/playtest/2026-10-16-beat7-rtb/end-after-combat \
  --out analysis/playtest/2026-10-16-beat7-rtb/comparison.md
```

Commit the runner before collecting cohorts so both manifests identify the tested
source. Comparison validates the exact 3×30 pilot/seed set, clone hash, thresholds,
limits and mode; it permits the baseline source revision to differ. Phase shares
are pooled durations, combat is merge + fight + defensive, and longest dead air is
the maximum contiguous run over the cohort, not an average.
