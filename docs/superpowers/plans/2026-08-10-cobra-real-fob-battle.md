# Real Camp Ember FOB + airborne path + Iron Bell fight — Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox syntax.

**Goal:** Land FOB Depart at Camp Ember, airborne soft gates down the gorge, destroyable fight at Iron Bell.

**Architecture:** Move Camp Ember landmark + route starts onto measured land; raise path gates to `PathAltitudeM + TargetAglM`; densify Iron Bell hostiles and kill presentation. Keep dual authority (C# definition ↔ world JSON) in sync.

**Tech Stack:** C# sim (`CobraCanyonDefinition`, ground war), JS presentation (`cobra_canyon_presentation`, `cobra_ember_path`, `cobra_ground_war`), node/dotnet tests.

## Global Constraints

- Never `git add -A`; stage explicit paths.
- Do not retune shared `guidance_path.js` defaults (F-22 recovery).
- Camp Ember is shared by all three Cobra routes — update every route `.00` + world JSON.
- Prefer new presentation helpers over editing contended presence files when possible.

---

### Task 1: Land Camp Ember + spawn on dry pad

**Files:**
- Modify: `sim/Cobra/CobraCanyonDefinition.cs`
- Modify: `content/packs/cobra-vietnam/environment/cobra-canyon.world.json`
- Modify: `web/wwwroot/content/packs/cobra-vietnam/environment/cobra-canyon.world.json`
- Modify: `sim.Tests/Cobra/CobraCanyonDefinitionTests.cs`
- Modify: `sim.Tests/Cobra/CobraMissionRuntimeTests.cs`
- Modify: `web/wwwroot/render/cobra/cobra_canyon_presentation.js`

**Coords:** Camp Ember `(-6775, 218, -6200)`; river-gorge inserts join point `(-6500, 162, -6200)` as `.01` (shift former points).

- [ ] **Step 1:** Failing test — Camp Ember terrain sample is `Land` and height ≥ 185 m; default spawn is not `Water`.
- [ ] **Step 2:** Move landmark + all three route `.00` points; add river join on River Gorge; sync both world JSON copies; rebuild FOB landmark placements (pads/berms/mast, no giant green mass).
- [ ] **Step 3:** Tests green.

### Task 2: Airborne soft gates

**Files:**
- Modify: `sim/Cobra/CobraMissionActProgress.cs` (`BuildPathGates`)
- Modify: `sim.Tests/Cobra/CobraMissionActTests.cs`
- Modify: `web/wwwroot/render/cobra/cobra_ember_path.js`
- Modify: `web/wwwroot/cobra-lab/main.js` (opacity/half only)

- [ ] **Step 1:** Failing test — Depart gate `UpM ≈ PathAltitudeM + TargetAglM` (within 1 m).
- [ ] **Step 2:** Implement airborne UpM; tighten Ember visual half (~24 m) and keep look-through opacity.
- [ ] **Step 3:** Tests green.

### Task 3: Iron Bell shootable fight

**Files:**
- Modify: `sim/Cobra/GroundWar/CobraGroundWarRuntime.cs`
- Modify: `sim.Tests/Cobra/GroundWar/CobraGroundWarRuntimeTests.cs`
- Modify: `web/wwwroot/render/cobra/cobra_ground_war.js`

- [ ] **Step 1:** Failing test — Iron Bell seeds ≥1 hostile hard-point + ≥2 soft vehicles living at t=0 (non-FOB).
- [ ] **Step 2:** Seed denser Iron Bell hostiles; longer wreck retain; stronger kill FX.
- [ ] **Step 3:** Tests green.

### Task 4: Stamp + STATUS candidate

- [ ] Stamp Build 301; queue STATUS next candidate; push PR.
