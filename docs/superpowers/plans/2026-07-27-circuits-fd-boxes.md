# Circuits FD + flythrough boxes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Rapier Circuits teach a launch → pattern T&G → arrested landing with flythrough boxes for margin and a flight director for stick/power guidance.

**Architecture:** Kernel director publishes a Circuits leg token plus FD targets (bank, target KTAS); HUD draws labeled flythrough boxes and FD needles; quiet mode line uses CIRCUITS · LEG · action (no Intercept combat copy).

**Tech Stack:** C# `RapierMissionDirector`, snapshot projection/hot frame, `rapier_guidance.js`, `hud.js`, node tests.

## Global Constraints

- PatternOnly Circuits only; Intercept combat HUD unchanged.
- Hook-down always communicated on recovery legs.
- SHORT FINAL = go around before mid-runway gear; WIRE FINAL = accept arrest.
- Do not require player flight for CI; keep OFT harness green.
- Spec: `docs/superpowers/specs/2026-07-27-circuits-fd-boxes-design.md`.

---

## File map

| File | Responsibility |
|---|---|
| `sim/RapierMission.cs` | Leg token + Circuits cues + FD target values on guidance |
| `sim/SimulationSession.cs` | Expose new guidance fields |
| `web/SnapshotProjection.cs` / `web/SnapshotHotFrame.cs` | Publish `rapier_circuit_leg`, `rapier_fd_*` |
| `web/wwwroot/render/mission/rapier_guidance.js` | Presentation: mode line, FD model, box label |
| `web/wwwroot/hud.js` | Draw FD + box label |
| `web/wwwroot/render/mission/tests/rapier_guidance.test.mjs` | Presentation tests |
| `sim.Tests/RapierCircuitOftTests.cs` / director tests | Leg + cue asserts |

---

### Task 1: Director publishes circuit leg + FD targets

- [ ] Extend `RapierMissionGuidance` (or session accessors) with `CircuitLeg` string/enum and FD bank deg + target KTAS.
- [ ] In `patternOnly` recovery/climb/launch, set leg: DEPART / DOWNWIND / BASE / SHORT_FINAL / WIRE_FINAL from existing marshal/lineup/final flags + gate.
- [ ] Rewrite patternOnly cues to CIRCUITS · LEG · action (SHORT FINAL go-around before gear; WIRE FINAL accept wire; hook down).
- [ ] Test: Circuits director at marshal/lineup/final emits expected leg + cue substrings.

### Task 2: Snapshot fields

- [ ] Project `rapier_circuit_leg`, `rapier_fd_bank_deg`, `rapier_fd_target_ktas` (and keep existing waypoint/gate/targets).
- [ ] Hot frame + JSON projection stay in sync.
- [ ] Snapshot test or OFT tick includes new fields when pattern only.

### Task 3: HUD presentation + FD draw

- [ ] `rapierGuidancePresentation` uses leg for Circuits mode line; never Intercept attack text when pattern_only.
- [ ] Export `rapierFlightDirectorPresentation(state)` → bank error, pitch/alt error, speed call, boxLabel.
- [ ] `drawRapierGuidance`: label active box; draw simple FD (bank pointer + pitch caret + speed bug) when pattern_only.
- [ ] Node tests for presentation strings and FD outputs.

### Task 4: Ocean far-field (opportunistic)

- [ ] Hide decision-support sea when Ukraine theatre has land apron / inland Rapier (far field must not read as ocean).
- [ ] Wiring assert if one exists.

### Task 5: Verify

- [ ] `node --test` mission guidance tests.
- [ ] Filtered `dotnet test` for Rapier Circuits / director.
- [ ] Manual: Circuits on Build — boxes labeled, FD moves, mode line teaches legs.
