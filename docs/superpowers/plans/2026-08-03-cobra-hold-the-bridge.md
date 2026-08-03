# Hold the Bridge Implementation Plan

> **For agentic workers:** Required sub-skill: using-superpowers:test-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship one playable Cobra Canyon mission (Hold the Bridge) with living ground war, win/lose, and a full-bleed play shell.

**Architecture:** Extend `CobraGroundWarRuntime` with hold-timer win/lose; expose via `CobraWebBridge`; default `/cobra-lab/` to immersive play UI (`?lab=1` keeps inspection chrome).

**Tech stack:** C# sim + Blazor bridge, Three.js cobra presentation, existing ground-war branch.

## File map

| Responsibility | Path |
| --- | --- |
| Ground war + outcome | `sim/Cobra/GroundWar/*`, `CobraMissionRuntime.cs` |
| Bridge snapshot | `web/CobraWebBridge.cs` |
| Play shell | `web/wwwroot/cobra-lab/{index.html,main.js,styles.css}` |
| Markers / HUD | `web/wwwroot/render/cobra/cobra_ground_war.js` (+ small HUD helper if needed) |
| Tests | `sim.Tests/Cobra/GroundWar/`, `web/wwwroot/render/cobra/tests/` |

### Task 1: Land ground-war onto main

- [x] Branch from `origin/main`, merge `origin/feature/cobra-canyon-ground-war`, resolve stamp/Blazor conflicts in favor of current main + keep ground-war gameplay.
- [x] `dotnet test` filter GroundWar; node tests for cobra_ground_war.

### Task 2: Win/lose (TDD)

- [x] Failing test: control ≥ 0.55 for 45s → victory; ≤ −0.75 for 30s → defeat.
- [x] Implement timers + debrief reason on ground-war / mission runtime.
- [x] Bridge exposes `mission.outcome` / hold progress.

### Task 3: Play shell

- [x] Default immersive layout; gate lab chrome with `?lab=1`.
- [x] Objective HUD: control, ammo, hold progress, FOB cue.
- [x] Update wiring/quarantine/product_truth contracts.

### Task 4: Ship

- [x] Stamp Build 252.
- [ ] Verify, merge, deploy with clean tree.
