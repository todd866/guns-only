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

`--beat` accepts every built-in id, 1–15, and rejects unknown ids. Other options:
`--pilots clone,novice,ace`, `--seeds 30`, `--start-seed 0`, `--max-seconds 3600`,
`--rtb-after 600`, `--threat-km 2.5`, `--near-miss-m 25`, `--ground-m 100`, `--out DIR`.
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

Each tape contains `timeline` one-second bins (including the final fractional second),
`events` with tick-derived timestamps, exact phase-duration totals, engagement tension
summaries, and sortie counters. Bin booleans mean “at any tick in this second”; continuous
G/energy/tension are means, clearance is the minimum. Phase colour is the dominant phase
of the bin; `phaseSeconds` retains subsecond transitions. Heading, speed, altitude and
recovery gate and runway-frame position at the end of each bin help distinguish pilot
failure from mission pacing.
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
all 15 beat ids, and physical full-stop recoveries including formerly stuck novice/ace
join cases, without teleporting the aircraft.
The Python tests check metric/flag aggregation, paired escalation, partial bins,
censoring, and parseable SVG. Run a small full sortie before large cohorts when
changing a controller. Inspect the SVG as well as the summary: a green build is not
evidence that a pilot can shoot or recover.

## Pathfinders — beat 15

```sh
tools/playtest-lab/run --beat 15 --seeds 30 --out analysis/playtest/2026-10-16-beat15
```

Beat 15 defaults to `hunter-novice,hunter-ace,reckless`; these names are restricted
by the CLI to beat 15. Each paired seed varies pilot reaction/start/aim and the
production `FirstLight(seed)` relay drift. Spawn spacing, weather layers, hit
volumes, ammunition and flight physics stay authored. The manifest records the
source commit, runtime and lab/sim assembly hashes. Commit source before collecting
a release-candidate cohort so its commit identifies the measured code.

- **hunter-novice:** delayed, partial lead, lower power/bank limits, overshooting
  passes and imperfect aim. A seeded 65% of profiles initially mistake envelopes
  for the target; after a pass they attempt the gondola. The profile can fail.
- **hunter-ace:** sets up altitude before the pass, anticipates ballistic cue motion,
  maintains ram energy, cycles live relays and skips populated/unknown debris
  footprints. On hard geometry it chooses a drone, if that capability exists.
- **reckless:** uses the same navigation competence as the ace, fires more broadly
  at forward contacts, and never consults the ROE classification.

All three hunt using public `SetAnalogPitchControl`, `SetAnalogRollControl`,
`SetAnalogThrottleControl`, `SetPlayerGunTargetSlot`, `FeedKey(Trigger)` and
`TryRequestReturnToBase`. There is no state adoption, direct `Engage`, fabricated
kill, QA pause, reload or forced finish in a cohort. The inherited recovery pilot
still uses the lab's scripted command seam. An ace label is a control policy,
not a validated human expert benchmark.

**Phase 1 capability gap:** its four drones are mass only. The public Trigger
route explicitly excludes Pathfinder from the legacy drone/formation sweep.
The lab records `drone-release-rejected` for a *blocked policy choice*, with source
`policy:capability-unavailable`; no release API call was made. Actual drone release
and drone kill event classes are structurally unobserved in this build. This must
remain visible in the verdict; adding a fake kill would defeat the experiment.

| Pathfinder measure | Definition |
|---|---|
| Relay in view | Live relay within 30 km and a 60° body-nose cone; headless visibility proxy, not rendered perception. |
| Gun window | Selected live gondola, range ≤900 m, authorized loaded gun, instantaneous ballistic sight solution. Uses the gun's conservative cue volume, not the HUD's 0.08 s qualification dwell. Dispersion/box contacts can kill without this cue. |
| First window | First observed opening; null is missing, never zero. Target ≤20 s. |
| Longest window gap | Longest hunt interval without a window, including leading/trailing edges. Target ≤30 s; censored hunts retain their observed gap. |
| Pass | Selected live relay enters 6 km; closes on kill, outward exit beyond 6.5 km, or actual hunt egress/loss. A selected proximity encounter is a proxy for an attack pass. Open passes at observation cutoff are counted separately as censored. |
| Envelope-only | Completed pass with physical envelope hits and no gondola kill. Percentage denominator is completed passes, including misses. Zero is absent teaching; >50% is a **provisional** dominance threshold. |
| Passes/physical kill | Completed passes divided by gondola + drone kills, including ROE-invalid kills. Null when no kills. Safe kills are separate. |
| ROE decisions | New footprint classifications per selected relay (`clear` or `skip-town`), counted once per classification transition. The reckless pilot makes none. |
| Hunt length | Airborne start to actual RTB handoff or aircraft loss. Target 240–360 s. Route exhaustion, bingo, empty gun and a 600 s combat budget are distinct end reasons. This does not declare a completed/recovered sortie. |
| Sortie length | Full production lifecycle to `Finished`, or censored emergency limit (default 3600 s), including shared scripted recovery. |
| Outcome spread | Novice sometimes denies ≥1 sector; ace must not trivially deny every relay every run. Report physical denial, safe kills, full-sortie outcome and censoring separately. |

The exact tape adds `pathfinder:` events for relay-in-view, gun-window-open/closed,
envelope-hit, gondola-kill, sector-denied, ROE decision/violation, pass-ended/missed,
blocked drone choice, bingo and egress. Hits use swept contact times, not rounded
one-second bins. The report leads with headline targets and three evidence-backed
problems, then per-minute opportunities, per-run metrics and the existing generic
metrics/flags. Its hunt SVG shows one aligned row per run; tooltips retain event
kind, target, source and exact timestamp. A quiet minute remains in the report.

`--self-test` additionally checks deterministic hunter replays, physical envelope
and ROE-violating gondola fixtures, pass/event conservation, missing-window
censoring, all 15 beat IDs and the absence of synthetic drones. Fixture starting
positions exist only in tests, never in the cohort runner.
