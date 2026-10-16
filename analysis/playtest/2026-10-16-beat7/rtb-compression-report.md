# F-22 fun fix 1: RTB compression and End sortie

Implemented on `fun/rtb-compress`, based on `65b7d88666e4336bcafac0e54a3bfdeb70212617`.
The evidence remains on `playtest/lab` (`7ee711918a92c0d8d4d4e8616689986bf0d69305`),
`analysis/playtest/2026-10-16-beat7/report.md`: 90 sorties, competent-pilot combat
about 18 seconds versus roughly nine minutes returning and landing. That branch
was read, not merged or edited. No new 90-sortie result is claimed here.

## Files

| Files | Change |
|---|---|
| `sim/SimulationSession.RtbCompression.cs` (new) | F-22 RTB eligibility, threat/final/configuration guards, `CanEndSortie`, `TryEndSortie`, `SortieEndedEarly` |
| `sim/SimulationSession.cs` | Enable the existing compression loop for this mission; cap fast-time catch-up credit at the same 250 ms real-time bound; reset new sortie state |
| `sim/SimulationSession.Controls.cs`, `sim/DetentLayer.cs`, `sim/KeyGrammar.cs` | Edge-triggered toggle, raw analog deadband check, between-tick input hand-back |
| `sim/TimeCompression.cs` | Explicit `RecoveryFinal` inhibit reason; existing Rapier policy retained |
| `web/WebBridge.cs`, `web/SnapshotProjection.cs` | `EndSortie()` bridge and authoritative end eligibility/result fields |
| `web/wwwroot/app.js` | Existing pause RTB slot becomes End after completed combat; typed acceptance and rejected-action pause restoration |
| `web/wwwroot/hud.js`, `web/wwwroot/render/telemetry/time_compression.js` | One active cell: `▸▸ 8×` (or actual factor), including touch HUD; no idle indicator |
| `web/wwwroot/render/settings/player_settings.js` | Configurable Y, append-only GKey ordinal 25; existing T alias retained |
| `web/wwwroot/render/debrief/f22_sortie_result.js` | Intentional early End has no invented landing lesson; physical LAND instrument stays incomplete |
| `sim.Tests/RtbCompressionTests.cs` (new) | 32 cases covering physics equality, eligibility, hand-backs, early End, snapshot invalidation, native timing |
| Node tests in `render/input/tests/player_action_contract.test.mjs`, `render/hud/tests/time_compression_hud.test.mjs`, `render/settings/tests/player_settings.test.mjs`, `render/debrief/tests/f22_result_instrument.test.mjs`, `render/debrief/tests/f22_sortie_result.test.mjs`, `render/progression/tests/pilot_logbook.test.mjs` | Binding, indicator, End/debrief and no recovery-credit contracts |

## Behavior and scope

Beat 7's mission identity (including custom lab fixtures derived from it) gains
8× RTB compression. Practice, first-run valley, carrier and other missions retain
their existing eligibility. Combat must be complete or RTB requested. The normal
120 Hz production integrator runs extra ticks; dt, aircraft physics, fuel burn,
combat simulation and landing equations are unchanged.

There is **no F-22 route autopilot**. The specified fallback is implemented:
heading must be within 5° of the first published `ApproachGuidancePlan` gate and
bank within 5° of level. Guidance is read, not rewritten. Losing alignment drops
to normal time. The pilot must still steer turns and manage descent/power.

Every tick rechecks safety. Compression drops to 1× for a live hostile within
10,000 m (primary, wingman or detached live actor); active hostile gun solutions
or rounds in flight, including rounds surviving their shooter; 3 NM horizontal
range to the runway threshold, final/threshold/groove guidance or runway contact;
pitch/roll outside the 0.02 deadband, held control inputs, gear/flap changes,
gear out or moving, GCAS activity/lead, a non-flying player, or an inactive session.
Scripted pilot overrides inhibit the fallback: they are pilot steering, not an
F-22 autopilot. A brief input pulse between ticks also hands back before fast time
can resume. No unused fast-time credit survives a safety hand-back.

Compression is enabled by default and resumes when eligible. Y toggles the
persistent pilot preference; T remains compatible with existing users. The
settings table and HUD legend show Y. The host offers at most 8× using its existing
measured simulation-cost budget; expensive frames lower that offer to 4× (and,
under heavier pressure, 2× or 1×).

End is available only after completed combat while the player is still alive.
It finishes with the already-earned combat victory and emits one sortie-finished
event. It does not call `CompletePlayerRecovery`, change the runway/handoff phase,
or manufacture contact. LAND remains `–` / Not landed, with no landing fuel facts
or recovered logbook credit. There is no separate F-22 landing-points bonus
implementation to invoke. The normal gear/contact/rollout/full-stop path is
unchanged and its tests pass.

## C# API and playtest/lab integration

Public production seams (no reflection or browser required):

```csharp
session.TryRequestReturnToBase();       // existing authoritative RTB request
session.SetTimeCompressionEnabled(true); // request; does not bypass safety
int selected = session.Advance(realElapsedSeconds, maximumCompressionFactor: 8);
// selected is the factor at entry, NOT a promise all extra ticks executed.
long tick = session.Tick;               // authoritative number of completed ticks
int factor = session.TimeCompressionFactor;
bool eligible = session.TimeCompressionEligible;
TimeCompressionInhibitReason reason = session.TimeCompressionInhibitReason;

bool available = session.CanEndSortie;
bool accepted = session.TryEndSortie();  // active or paused; false before completion
bool endedWithoutRecovery = session.SortieEndedEarly;
bool landed = session.ConventionalRtbRecoveryCompleted; // unchanged physical truth
```

`Advance(double)` deliberately remains 1× for existing callers. The lab must use
the two-argument overload to offer 8×/4×. `Advance(0, 8)` refreshes authoritative
eligibility and the host ceiling without advancing a tick. `StepFixed()` still
means exactly one ordinary production tick, never eight.

The current lab (`LabPilot.cs`, `Program.cs`, `ExperienceObserver.cs`) uses a
scripted straight-in recovery pilot and assumes one observer call per fixed tick.
Its integration needs the following changes **on playtest/lab**, not a merge here:

1. In the recovery pilot, use the published RTB steering cue for quiet transit.
   Once aligned and wings level, release pitch/roll, clear
   `Controls.ScriptedPilotOverride`, and request compression. Stop re-sending the
   unchanged throttle setter every tick: that setter represents pilot interaction
   and intentionally hands back. When alignment/safety is lost, resume steering
   at 1×. Do not force eligibility or teleport to the cue.
2. For browser-equivalent frame scheduling, call `Advance(realDt, 8)` and record
   `Tick`/`TimeSeconds` before and after. A boundary can discard part of the batch;
   multiplying realDt by the returned entry factor is not valid simulation-time
   accounting. Keep simulated seconds and player-experienced seconds separate.
3. To retain the existing exact per-tick near-miss/event observer without adding
   an observer callback to the kernel, the native lab can negotiate with
   `Advance(0, 8)`, call `BeforeStep`, `StepFixed`, then `Observe` for each physics
   tick. Accumulate experienced duration as `FixedDeltaSeconds / entryFactor`
   separately from the existing simulated-duration metrics. Hold the pilot
   neutral while compressed. This measures continuous factor-weighted experience;
   label it as such rather than exact browser frame timing (hand-back frame
   quantization differs). Never overwrite CPU `WallSeconds` with experience time.
4. Do not keep the old `Observe` arithmetic unchanged while skipping it across
   eight-tick batches: it hardcodes one `Dt` per invocation and would undercount
   simulation duration and miss physical events. Preserve both clocks and phase
   shares in the updated report.
5. The return/landing pilot should continue to land for the paired RTB study.
   Exercise `TryEndSortie()` separately; do not label an early End as a landing.

Browser fields are `time_compression_*` (existing), `can_end_sortie` and
`sortie_ended_early` (new). The bridge exports `EndSortie()`. Lifecycle/event
changes already invalidate the cold snapshot; a new regression proves this.

## Validation

- **176 C# xUnit cases passed, 0 failed, 0 skipped**, including all **32 new RTB
  cases**, existing time-compression cases, finite F-22 sorties, combat handoff,
  conventional runway physics/pattern, hot snapshots, key grammar and Rapier
  economy. Same seeded fixture at 1× and 8× has bit-identical aircraft state,
  fuel, events and simulation time at equal tick counts. Exact 16 ticks per
  1/60-second quiet frame and mid-batch 3 NM hand-back are tested separately.
- **295 Node tests passed, 0 failed** across input contracts, HUD, settings,
  debrief, logbook and measured compression budget. Y is unique/rebindable and
  the exact `▸▸ 8×` string is asserted.
- Native test build and `dotnet build web/GunsOnly.Web.csproj --no-restore -m:1
  /nodeReuse:false`: **0 warnings, 0 errors**. This compiles the JS-exported bridge;
  it does not render or publish the app.
- VSTest was attempted and blocked by `SocketException (13): Permission denied`
  at `TcpListener.Start`. Tests ran through xUnit's in-process executor using the
  repository runner source, with a scratch project referencing only sim.Tests
  (no server/arena assemblies). All packages restored from the local cache.
- No browser was started. Screenshots/viewport inspection belong to Claude as
  instructed; no rendered acceptance is claimed. Suggested checks: desktop and
  phone active chip at 8×/4×; no chip at 1×; pause before/after combat; End into
  `FIGHT ✓ / LAND –`; a real gear-down landing still records `LAND ✓`.

Reproduce the C# selection with the repository helper:

```sh
PATH="$HOME/.dotnet:$PATH" DOTNET_ROOT="$HOME/.dotnet" bin/test-in-process \
  RtbCompressionTests TimeCompressionTests F22FiniteSortieTests CombatHandoffTests \
  ConventionalRunwayRecoveryTests ConventionalRunwayPatternRecoveryTests \
  SnapshotHotFrameTests KeyGrammarTests RapierEconomyTests
```

Node selection:

```sh
node --test web/wwwroot/render/input/tests/player_action_contract.test.mjs \
  web/wwwroot/render/hud/tests/*.test.mjs \
  web/wwwroot/render/settings/tests/*.test.mjs \
  web/wwwroot/render/debrief/tests/*.test.mjs \
  web/wwwroot/render/progression/tests/pilot_logbook.test.mjs \
  web/wwwroot/render/telemetry/tests/time_compression_budget.test.mjs
```

## Performance and review

On this arm64 Mac, native Debug, 120 batches of 16 production ticks (1,920 ticks,
16 simulated seconds), final standalone timing was **4.676 ms median, 7.119 ms
p95, 9.947 ms max** per batch. An earlier focused run measured 1.880 / 2.695 /
9.223 ms. In the concurrent 176-test run, p95 reached 21.595 ms: machine load
matters. These are kernel workload measurements, without WASM, JS interop,
rendering or a claim about sustained browser FPS.

8× at 60 Hz costs 16 fixed ticks/frame; the standalone p95 fits the existing
8 ms simulation budget. Keep the existing measured-cost host governor: at a
0.5 ms/tick estimate it can afford 8×, above that it offers 4× when affordable,
and it can reduce further instead of accumulating unbounded catch-up. The initial
1 ms/tick estimate starts conservatively at 4× at 60 Hz. Do not replace this with
an unconditional 8× multiplier based on the native benchmark. Full sortie time
savings remain for the updated lab and Claude's browser work to measure.

The standing refuter's objections were addressed: wider hostile inventory,
pre-shot gun solutions, exact rate and mid-batch cancellation tests, explicit
pilot-chosen RTB coverage, and an assertion that End preserves the earned combat
victory without recovery. Direct inspection also caught held analog input and
misleading early-End approach advice; both have regressions. A Cursor opinion
was attempted, but its capacity guard refused because it could not verify helper
process identity; no Cursor findings are claimed.

No push, deployment, release stamp, lab merge or browser operation was performed.
