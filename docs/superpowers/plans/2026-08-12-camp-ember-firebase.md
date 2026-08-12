# Camp Ember Real Firebase (Build 313) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Camp Ember reads as a real Vietnam firebase from the air and the pad (per the photo dossier), with three Cobras on the ramp and a bird-swap loop for damaged airframes.

**Architecture:** Presentation-region work (laterite scar, berm ring, rosettes, tracks, fringe) extends the existing single-draw firebase parts system and basin material regions without touching the authority contact surface. The airframe pool and swap live in `CobraMissionRuntime` as a replaceable `_cobra` field plus a three-slot pool record, sharing the FOB pad detection that rearm already uses. Parked birds render as static `ah1g_presence` instances.

**Tech Stack:** .NET 8 sim + xUnit; three.js presentation; node 24 tests; env per the fights-back plan (`~/.dotnet`, `~/.nvm/versions/node/v24.18.1/bin`).

## Global Constraints

- The 58 m contact apron, spawn safety volume, and kernel terrain mirror are UNCHANGED; every visual addition is presentation-side. If any contact boundary moves, the C# mirror moves with it (golden-pinned).
- All new firebase parts pass the existing safety-volume AABB test in `cobra_camp_ember_firebase.test.mjs`.
- House style: illustrative structure/massing/palette (laterite, sandbag tan, olive, burned black); no photorealism, no saturated accents on terrain.
- Determinism throughout; control experiments on every new gate; explicit-path staging only.
- Branch `feature/camp-ember-firebase`, worktree `.worktrees/cobra-hud-waterline-launchpad`.

---

### Task 1: Airframe pool + bird swap in the mission runtime

**Files:**
- Modify: `sim/Cobra/CobraMissionRuntime.cs` (`_cobra` construction ~line 424; pad-rate block near `TryResupplyAtFob` ~line 560)
- Modify: `sim/Vehicles/Rotorcraft/Ah1gCobraDynamics.cs` (no behavior change — expose `IsCrippled => GearDamaged || LastContactFailureCause != VehicleContactFailureCause.None || !State.Flyable`)
- Test: `sim.Tests/Cobra/CobraMissionRuntimeTests.cs`

**Interfaces:**
- Produces: `CobraAirframeSlot` (record: `Id` string, `ParkedPoseWorld` (Vec3D position + yaw), `State` enum `Ready|PlayerFlying|Crippled|Destroyed`), `IReadOnlyList<CobraAirframeSlot> AirframePool` on the runtime, `int AirframeSwaps` on the debrief, mission status `FobCombatIneffective` when no Ready/PlayerFlying slot remains, and the swap rule below. Task 2 reads `AirframePool` for presentation; Task 3 bridges it.

Swap rule (owner contract, BF:V): while `Status == Active`, the player's bird is crippled (`IsCrippled`), contact is `StableSurfaceContact`, and the position is inside the FOB resupply zone (same gate `TryResupplyAtFob` uses), and a `Ready` slot exists → swap automatically: mark the flown slot `Crippled` (or `Destroyed` if not flyable) with its current pose; construct a fresh `Ah1gCobraDynamics` at the Ready slot's parked pose (existing constructor, `vehicleId: "cobra-canyon.player"`); mark that slot `PlayerFlying`; increment `AirframeSwaps`. If the player bird dies away from the pad, its slot becomes `Destroyed` where it fell; mission ends (existing `VehicleAuthorityLost`) UNLESS a restart-at-FOB decision is out of scope — restarts keep full pool (R restarts the mission, existing behavior).

- [ ] **Step 1: Write failing tests** in `CobraMissionRuntimeTests` (follow that file's existing runtime construction idiom): (a) pool starts as three slots, one `PlayerFlying`, two `Ready`, parked poses inside the FOB and outside the spawn safety volume footprint; (b) scripted flight: damage the gear (drop the runtime's vehicle hard onto the pad via scripted collective — reuse the dynamics-level scripts adapted to runtime inputs), land stable on the pad → `AirframeSwaps == 1`, player at the spare's parked pose, old slot `Crippled` at the pad; (c) cripple all three → `FobCombatIneffective` terminal.
- [ ] **Step 2: Run — expect FAIL** (missing members).
- [ ] **Step 3: Implement** per the swap rule. Parked poses: two revetment stations flanking the secondary pad, authored constants in `CobraCanyonDefinition` (mirror-neutral — they are mission data, not terrain).
- [ ] **Step 4: Run new tests + full `FullyQualifiedName~CobraMissionRuntime` filter — PASS, no regressions.**
- [ ] **Step 5: Commit.**

### Task 2: Parked Cobras + firebase read (presentation)

**Files:**
- Modify: `web/wwwroot/render/cobra/cobra_camp_ember_firebase.js` (extend `campEmberFirebaseParts()`; berm ring, ring road, two rosettes, bunker mounds with PSP-glint tops)
- Modify: `web/wwwroot/cobra-lab/main.js` (instantiate two static `ah1g_presence` models at the pool's parked poses from the bridge state; tint/tilt a `Crippled` slot)
- Modify: `web/wwwroot/render/cobra/cobra_canyon_presentation.js` + `cobra_canyon_plan.js` (laterite scar region: irregular apron material blob + track ribbons + two burn patches + defoliated fringe ring — presentation-side region test)
- Test: `web/wwwroot/render/cobra/tests/cobra_camp_ember_firebase.test.mjs` (part counts, families, safety volume — extend), `cobra_canyon_presentation.test.mjs` (scar region facts)

- [ ] **Step 1: Failing tests first** — new part families (`berm`, `rosette`, `bunker`) with counts, every part still outside the safety volume; scar region: sampled surface color inside the apron blob differs from basin green and matches the laterite family; track ribbons use the road role (no emissive).
- [ ] **Step 2-4: Implement to green** (geometry via the existing box/prism/revetment/cylinder builders; rosette = ring of revetment segments around a shallow pit disc; berm = trapezoid segments on a ring with a gap at the departure mouth).
- [ ] **Step 5: Rendered-frame QA (doctrine)** — republish, scenery-gate shots + a pad-level frame; READ them against Sedgwick/Granite: scar-not-rectangle, berm ring, rosettes, parked Cobras visible from the pad. Iterate until it reads.
- [ ] **Step 6: Commit.**

### Task 3: Pool state to the page + debrief

**Files:**
- Modify: `web/CobraWebBridge.cs` (snapshot: `airframe_pool` array of `{id, state}`, `airframe_swaps`), `web/wwwroot/cobra-lab/main.js` (radio/status cue on swap: reuse the existing R/T call pattern; debrief line "birds lost/swapped"), `web/wwwroot/render/cobra/cobra_terminal_causes.js` (+`fob-combat-ineffective` card copy)
- Test: extend `cobra_terminal_causes.test.mjs`; bridge compile via dynamics filter run

- [ ] Steps: failing test → implement → green → commit (same TDD cadence as Build 312's Task 3).

### Task 4: Ship Build 313

- [ ] Live-page QA: land damaged on the pad → swap observed with the radio cue; cripple all three → FOB INEFFECTIVE card; aerial screenshot vs the dossier.
- [ ] Adversarial review (Cursor with test files in bundle; Codex web-scoped, no-dotnet warning).
- [ ] STATUS reconcile → stamp 313 LAST → full gate → PR → CI → merge → deploy → verify build-info 313.

## Self-review notes

- Spec coverage: scar+fringe (T2), berm/rosettes/tracks/bunkers (T2), ramp birds (T1/T2), swap loop + pool terminal (T1/T3), acceptance (T4). Out-of-scope items honored.
- The swap is automatic on stable pad contact with a crippled bird — zero new input surface; the radio call carries legibility.
- Type names used once: `CobraAirframeSlot`, `AirframePool`, `AirframeSwaps`, `FobCombatIneffective`, slug `fob-combat-ineffective`.
