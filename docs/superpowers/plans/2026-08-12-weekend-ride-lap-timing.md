# Weekend Ride Lap Timing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the circuit a stopwatch the rider can see — lap times, sectors, a validated personal best, and a live delta worth chasing.

**Architecture:** Extend `WeekendRideMissionRuntime` (which already counts laps and tracks off-track time) with completed-lap records, sector splits and a validity rule; publish them through the existing ride snapshot; draw them on the ride HUD canvas; persist the best in localStorage behind a fail-safe wrapper.

**Tech Stack:** .NET 8 sim (xUnit), vanilla JS + canvas HUD, node 24 tests. Env per `docs/superpowers/plans/2026-08-12-camp-ember-firebase.md`.

## Global Constraints

- **Laptop-first**: no touch/portrait variants ([[laptop-first-mobile-is-a-separate-game]]).
- **A lap ridden off-track never becomes the best**, however fast it was.
- Persistence **fails safe**: unavailable or malformed storage means "no best", never a crash and never a blocked ride.
- Determinism: identical scripted inputs produce identical times.
- Control experiment on every new gate; stage explicit paths.

---

### Task 1: Completed laps, validity, and the personal best

**Files:**
- Modify: `sim/Motorcycle/WeekendRideMissionRuntime.cs` (lap-completion branch near the `_currentLapElapsedSeconds` reset, ~line 118-125)
- Test: `sim.Tests/Motorcycle/WeekendRideMissionRuntimeTests.cs` (create if absent; follow the `CreateDefault()` idiom at `WeekendRideMissionRuntime.cs:60`)

**Interfaces:**
- Produces: `double LastLapSeconds` (0 until a lap completes), `double? BestLapSeconds` (null until a valid lap completes), `bool CurrentLapValid`, `IReadOnlyList<double> CompletedLapSeconds`. Tasks 2-4 read these.

Validity rule: `CurrentLapValid` starts true at each lap start and latches false if `IsOnTrack` is ever false during the lap or the bike tips over/resets. A completed lap updates `BestLapSeconds` only when it is valid AND faster than the current best.

- [ ] **Step 1: Write the failing test:**

```csharp
[Fact]
public void AnOffTrackLapNeverBecomesTheBestHoweverFastItWas()
{
    var runtime = WeekendRideMissionRuntime.CreateDefault();
    runtime.Begin();
    CompleteScriptedLap(runtime, offTrack: false, targetSeconds: 90.0);
    double? cleanBest = runtime.BestLapSeconds;
    Assert.NotNull(cleanBest);
    CompleteScriptedLap(runtime, offTrack: true, targetSeconds: 60.0);
    Assert.Equal(cleanBest, runtime.BestLapSeconds);          // faster, but dirty
    Assert.Equal(60.0, runtime.LastLapSeconds, 1);            // still reported
    Assert.False(runtime.CompletedLapSeconds.Count < 2);
}
```

Write `CompleteScriptedLap` as a real helper in the test file: step the runtime with a fixed throttle/lean command until `LapCount` increments, forcing `IsOnTrack` false for one step when `offTrack` is true (add a test-only `DebugForceOffTrack()` mirroring the existing `DebugForceTipOver()` at line 170).

- [ ] **Step 2: Run — expect FAIL** (`--filter "FullyQualifiedName~AnOffTrackLap"`): members do not exist.
- [ ] **Step 3: Implement** the four members, the validity latch, and the best-lap update.
- [ ] **Step 4: Run the new test + `--filter "FullyQualifiedName~WeekendRide"` — PASS.**
- [ ] **Step 5: Commit** `Record completed laps and refuse a dirty personal best.`

### Task 2: Sectors and the live delta

**Files:**
- Modify: `sim/Motorcycle/WeekendRideMissionRuntime.cs`
- Test: `sim.Tests/Motorcycle/WeekendRideMissionRuntimeTests.cs`

**Interfaces:**
- Consumes: Task 1's members.
- Produces: `IReadOnlyList<double> SectorSeconds` (3, current lap, 0 until each sector closes), `IReadOnlyList<double?> BestSectorSeconds` (3), `double? DeltaToBestSeconds`, and internally a `BestLapSplitProfile` of `SplitSampleCount = 32` elapsed times at evenly spaced arc-length fractions of the lap.

Delta rule: at the rider's current lap arc-length fraction, linearly interpolate the best lap's split profile and subtract from the current lap elapsed. Null when no best exists.

- [ ] **Step 1: Write the failing test:** three sector times sum to the lap time within 0.05 s; a rider ahead of the best pace at the same circuit fraction yields a negative `DeltaToBestSeconds` and behind yields positive; delta is null before any best exists.
- [ ] **Step 2: Run — expect FAIL.**
- [ ] **Step 3: Implement** sector boundaries by arc-length fraction, the 32-sample profile captured on a new best, and the interpolated delta.
- [ ] **Step 4: Run — PASS, plus the full WeekendRide filter.**
- [ ] **Step 5: Commit** `Split the lap into sectors and publish a live delta to the best.`

### Task 3: The numbers reach the rider

**Files:**
- Modify: the ride bridge that already publishes `ride_lap` (find with `rg -n "ride_lap" web/`) — add `ride_last_lap_s`, `ride_best_lap_s`, `ride_delta_s`, `ride_sector_s`, `ride_lap_valid`
- Modify: `web/wwwroot/weekend-ride/main.js` (HUD canvas draw)
- Create: `web/wwwroot/render/ride/ride_timing_readout.js` (pure: timing state → drawable strings/colours)
- Create: `web/wwwroot/render/ride/tests/ride_timing_readout.test.mjs`

**Interfaces:**
- Produces: `rideTimingReadout({ lapSeconds, lastLapSeconds, bestLapSeconds, deltaSeconds, lapValid })` → `{ lap: "1:23.45", last, best, delta: {text: "-0.32", ahead: true}, invalid: false }`. Formatting only; no canvas.

- [ ] **Step 1: Failing test:** `1:23.45` formatting including sub-minute and hour-less padding; a null best renders `--:--.--`; delta sign/colour flag; `invalid: true` when the lap is dirty.
- [ ] **Step 2: Run (`node --test`) — expect FAIL.**
- [ ] **Step 3: Implement** the module, the bridge fields, and the HUD draw (current lap large, last/best beneath, delta prominent and coloured, invalid marker).
- [ ] **Step 4: Node test + `node --check web/wwwroot/weekend-ride/main.js` PASS; then publish and READ the rendered HUD.**
- [ ] **Step 5: Commit** `Put lap, best and delta on the rider's HUD.`

### Task 4: The best survives a reload

**Files:**
- Create: `web/wwwroot/render/ride/ride_best_lap_store.js` + test
- Modify: `web/wwwroot/weekend-ride/main.js` (load on boot, save on new best, seed the runtime's best via the bridge)

**Interfaces:**
- Produces: `loadRideBest(storage)` → `{bestLapSeconds, splitProfile, bestSectorSeconds} | null`; `saveRideBest(storage, record)` → boolean. Versioned key `guns-only.ride.best.v1`.

- [ ] **Step 1: Failing test:** a saved record round-trips; a throwing storage yields null from load and false from save **without throwing**; malformed JSON yields null; a record with a non-finite time is rejected.
- [ ] **Step 2-4:** implement, verify, and confirm in the live page that a best survives a reload.
- [ ] **Step 5: Commit** `Remember the best lap across reloads, failing safe.`

### Task 5: Ship

- [ ] Live-page QA: ride two laps, watch the timer, cross the line, see last/best populate and the delta move; reload and confirm the best persists. Screenshot.
- [ ] Adversarial review: `cursor-opinion` with the changed files AND tests in the bundle; Codex scoped to `sim/Motorcycle/*.cs`, `--effort xhigh`, explicit no-dotnet warning.
- [ ] STATUS reconcile → stamp LAST → full `bin/check` ("Guns Only checks passed") → PR → CI → merge → deploy → verify `/api/build-info`.

## Self-review notes

- Spec coverage: completed laps + validity + best (T1), sectors + delta (T2), HUD (T3), persistence (T4), acceptance/ship (T5). The cut ghost bike appears in no task.
- Names used once and reused: `LastLapSeconds`, `BestLapSeconds`, `CurrentLapValid`, `CompletedLapSeconds`, `SectorSeconds`, `BestSectorSeconds`, `DeltaToBestSeconds`, `SplitSampleCount`, `rideTimingReadout`, `loadRideBest`/`saveRideBest`.
- The validity rule is enforced in the sim, not the HUD, so a dirty best cannot enter through any other caller.
