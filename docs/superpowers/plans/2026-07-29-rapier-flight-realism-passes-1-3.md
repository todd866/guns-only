# Rapier Flight Realism Passes 1–3 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close Passes 1–3 of the approved flight+sound realism program so Rapier’s dash story, handling mass, and one envelope failure match measured/surrogate truth. Pass 4 deferred unless residual evidenced wrong-feel remains.

**Architecture:** Kernel owns truth. Pass 1 renames mission dash to measured ~M3.55 (below spill death; OFT-class) and retires commanded M4. Pass 2 rescales inertias to design gross and replaces Mach-only normal-law α with a mass/q floor under physical/inlet caps. Pass 3 adds a restartable inlet-unstart seed and a V-q awareness cue. Audio/HUD consume published fields; no FDM bent for ear candy.

**Tech Stack:** C# sim (`RapierMission`, `RapierAerodynamics`, `FlightModel`, propulsion map), xUnit, snapshot projection, living audit markdown.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-29-rapier-flight-sound-realism-design.md`
- Keep `DesignMach = 2.6` as normaliser only — no silent ram-ratio buffs
- Stage explicit paths only; concurrent agents on `pivot-hardening`
- Prefer guidance/profile fixes over engine buffs
- Pass order: 1 → 2 → 3; do not skip exits
- Pass 4 (full aero tables / reentry rush) only if 1–3 leave evidenced gaps

### Pass 1 freeze (decision)

**Retune commands to measured dash**, do not keep commanding M4:
- `RapierMission.MeasuredDashMach = 3.55` (OFT-class; below `RamSpillCompleteMach` 3.8; above climb M3.15)
- Intercept + Escape `targetMach` use `MeasuredDashMach`, not 4.0
- Aspirational M4 remains **fiction** in SE bible / Identity comparison prose only — never a mission command
- Publish `rapier_design_dash_mach` from kernel for briefing/HUD
- Briefing: measured dash ~M3.6; stop “command M4” cues

### Pass 2 freeze

- Scale Rapier `Ixx/Iyy/Izz` by `11090/7850` (design gross / prior ~7.85 t class) and document
- `NormalLawAlphaLimitRad(mach, massKg, qPa)` (or FlightModel wrapper): at least the α for ~1.05 g level flight when that is below physical break and inlet-friendly cap; never exceed physical `AlphaAeroMax`
- Re-run aero unit tests + a FL720/M3.5 level-flight feasibility assert

### Pass 3 freeze

- Inlet unstart seed: above ram regime, if combined flow angle exceeds a tested threshold (soft NASA-inspired), recovery collapses to a floor and a `rapier_inlet_unstart` flag stays true until α/β small for a dwell
- V-q awareness: when q exceeds an authored high-q placard, set `rapier_over_q` (or reuse buffet path) for HUD/audio cue — no persistent structural damage model yet
- One OFT or unit scenario proves unstart + recovery

---

### Task 1: Pass 1 — Measured dash constant + mission retune

**Files:** `sim/RapierMission.cs`, tests under `sim.Tests/RapierMissionTests.cs` / intercept OFT as needed, `web/SnapshotProjection.cs` (+ hot frame if required), briefing `app.js`, living audit

- [ ] Add `public const double MeasuredDashMach = 3.55;`
- [ ] Intercept/Escape use it; cue strings use the constant not `4.0`
- [ ] Publish `rapier_design_dash_mach`
- [ ] Briefing/config copy: measured dash, M4 fiction not commanded
- [ ] Tests: intercept authored/commanded ≤ MeasuredDashMach + epsilon (skin aside)
- [ ] Commit

### Task 2: Pass 2 — Inertias + mass/q normal law

**Files:** `sim/FlightModel.cs` (Rapier params), `sim/RapierAerodynamics.cs`, `sim/FlightModel.cs` PositiveNormalLawAlphaMax, `sim.Tests/RapierAerodynamicsTests.cs`

- [ ] Rescale inertias; comment cites 11 090 kg design gross
- [ ] Normal-law API takes mass + q; floor for level flight
- [ ] Tests: FL720/M3.5 design gross ordinary law ≥ ~1.0 g available; physical still binds ~few g
- [ ] Commit

### Task 3: Pass 3 — Unstart seed + V-q cue

**Files:** `sim/RapierAerodynamics.cs` or inlet helper, propulsion install path, snapshot fields, minimal HUD/audio cue hook, tests

- [ ] Unstart state machine (start/clear) with unit tests
- [ ] Wire into installed thrust recovery
- [ ] Over-q flag from authored q placard
- [ ] Commit + update REALISM audit Pass 1–3 exited

### Task 4: Docs exit + Pass 4 gate

- [ ] Update REALISM-AND-OVERPERFORMANCE + program design pass table
- [ ] Pass 4: only schedule if OFT/feel still wrong; otherwise mark deferred

---

## Exit criteria

| Pass | Exit |
| ---: | --- |
| 1 | Mission never commands M4; published design dash = 3.55; briefing agrees; OFT still climbs |
| 2 | Inertias match ~11 t; ordinary law can hold FL720 at mission mass; tests green |
| 3 | Unstart recoverable in test; over-q visible; no full aeroelastic model required |
