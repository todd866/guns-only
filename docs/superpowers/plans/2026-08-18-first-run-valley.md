# First-run valley implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this session; the user said go). Steps use checkbox syntax.

**Goal:** First visit skips the picker, flies the Soniachne draw, pops out onto two jets, Fire dumps two AIM-9s then becomes guns, and hands into the live Guns Only fight.

**Architecture:** A factory overlay on first-merge (`Beats.ModernVisualMergeFirstRun`) plus `FirstRunValleyRuntime` (phase + AIM-9 + parked opening pair). Beat 7 stays guns-only. The shell auto-starts via `WebBridge.StartFirstRunValley` once.

**Tech Stack:** C# sim kernel, xUnit, JS shell (`app.js`), node:test source contracts.

**Spec:** [`docs/superpowers/specs/2026-08-18-first-run-valley-design.md`](../specs/2026-08-18-first-run-valley-design.md)

**Test command:** `DOTNET_ROOT="$HOME/.dotnet" DOTNET_MULTILEVEL_LOOKUP=0 "$HOME/.dotnet/dotnet" test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~FirstRunValley"`

## Global Constraints

- Do not change `Beats.ModernVisualMerge()` spawn, ROE, or AIM-9 (beat 7 stays guns-only).
- Do not raise `Beats.LastBuiltInIndex`.
- AIM-9 is `Aim9Surrogate` (same toy as Top Gun). No new missile model.
- One Fire path: `GKey.Trigger`. Top Gun keeps R for Fox-2.
- Deterministic: no wall clock, no RNG in the runtime.
- Playwright keeps the picker unless `?firstRun=1`.

## File structure

| File | Responsibility |
| --- | --- |
| `sim/Doctrine/FirstRunValleyRuntime.cs` | Phase, AIM-9 magazine, pop-out gate |
| `sim/Doctrine/Beats.cs` | `FirstRunValleyConfig` + `ModernVisualMergeFirstRun()` |
| `sim/SimulationSession.cs` | Stage runtime, park opponents, Fire routing, AIM-9 step |
| `web/WebBridge.cs` | `StartFirstRunValley` |
| `web/SnapshotProjection.cs` / `SnapshotHotFrame.cs` | `aim9_*` live on this beat |
| `web/wwwroot/render/onboarding/first_run_valley.js` | storage + auto-start predicate |
| `web/wwwroot/app.js` / `index.html` | skip picker, stage/launch, HUD cue |
| `web/wwwroot/render/top-gun/aim9_presentation.js` | draw heaters whenever pose is live |

---

### Task 1: Beat factory

**Files:**
- Create: `sim.Tests/FirstRunValleyBeatTests.cs`
- Modify: `sim/Doctrine/Beats.cs`
- Test: `sim.Tests/FirstRunValleyBeatTests.cs`

- [ ] Failing tests for mission id, spawn, hero cell, two-heater config, beat 7 unchanged
- [ ] Implement `FirstRunValleyConfig` + `Beats.ModernVisualMergeFirstRun()`
- [ ] Tests pass

### Task 2: Runtime + Fire routing

**Files:**
- Create: `sim/Doctrine/FirstRunValleyRuntime.cs`, `sim.Tests/FirstRunValleyRuntimeTests.cs`
- Modify: `sim/SimulationSession.cs`

- [ ] Valley: Trigger does not fire guns or AIM-9; opponents stay parked
- [ ] Crossing pop-out northing arms weapons; Trigger launches AIM-9 until empty
- [ ] Empty magazine: Trigger is guns
- [ ] Beat 7 Trigger is still guns with `aim9_remaining` null

### Task 3: Bridge + snapshot

**Files:**
- Modify: `web/WebBridge.cs`, `web/SnapshotProjection.cs`, `web/SnapshotHotFrame.cs`
- Test: `sim.Tests/FirstRunValleySnapshotTests.cs`

- [ ] `StartFirstRunValley` JSExport
- [ ] First-run snapshot publishes `aim9_remaining = 2`; beat 7 still null

### Task 4: Shell auto-start + HUD

**Files:**
- Create: `web/wwwroot/render/onboarding/first_run_valley.js` + tests
- Modify: `web/wwwroot/app.js`, aim9 presentation test

- [ ] Auto-start predicate (menu/webdriver/program/`firstRun=1`)
- [ ] `enterReady` stages `StartFirstRunValley` when auto-starting
- [ ] Stamp seen on first successful begin
- [ ] AIM-9 presentation visible whenever pose is live

### Task 5: Verify

- [ ] Delete `sim.Tests/FirstRunValleySurvey.cs`
- [ ] `FirstRunValley` filter green
- [ ] `ModernVisualMergeOmitsTopGunFields` still green
- [ ] Related JS contracts green
