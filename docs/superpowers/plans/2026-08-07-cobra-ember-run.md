# Ember Run Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one tight Hold-the-Bridge sortie (Ember Run): pad → sky path → readable hostiles → hold/lose → RTB debrief, with corridor scenery and heavier haze.

**Architecture:** Sim owns act transitions and path anchors; bridge snapshots them; cobra-lab draws soft gates via existing `guidance_path` grammar, silhouette ground-war meshes, and visual-profile haze. Objective copy is pure functions driven by act + control/ammo.

**Tech Stack:** C# sim (`CobraMissionRuntime`), Blazor bridge JSON, Three.js cobra-lab, node:test, xunit.

## Global Constraints

- Public title remains **Hold the Bridge**; Ember Run is the working name for this slice.
- M134 only — no new weapons.
- Renderer never invents combat truth, wins, or kills.
- Path gates are soft volumes (probable region), not precision rails — reuse `guidance_path.js` doctrine.
- Scenery pass is **corridor + bridge site only**, not full basin.
- Weather is atmosphere (fog/haze/cloud shadow ± light mist), not new FM authority.
- Stamp / `?v=` pins must sweep `web/wwwroot` **and** `web/smoke`.
- Multi-agent: `bin/claim`, never `git add -A`, prefer new files over contended ones.
- Include Build 271 urgency copy (losing on pad) from day-one objective work.

## File map

| File | Role |
| --- | --- |
| `sim/Cobra/CobraMissionAct.cs` (new) | Act enum + transition helpers |
| `sim/Cobra/CobraMissionRuntime.cs` | Advance act from position/control/pad/outcome |
| `web/CobraWebBridge.cs` | Snapshot `mission_act`, path gates |
| `web/wwwroot/render/cobra/cobra_objective_copy.js` | Act + urgency copy (already started) |
| `web/wwwroot/render/cobra/cobra_ember_path.js` (new) | Map route/act → guidance gates |
| `web/wwwroot/render/scene/guidance_path.js` | Reuse as-is |
| `web/wwwroot/render/cobra/cobra_ground_war.js` | Silhouette meshes + hostile color |
| `web/wwwroot/render/cobra/cobra_canyon_asset_kit.js` / presentation | Corridor canopy fix |
| `web/wwwroot/render/cobra/cobra_canyon_visual_profile.js` | Heavier haze / weather knobs |
| `web/wwwroot/cobra-lab/main.js` | Wire path, acts, copy |
| Tests beside each module | node:test + xunit |

---

### Task 1: Objective urgency + act-ready copy

**Files:**
- Create: `web/wwwroot/render/cobra/cobra_objective_copy.js` (may already exist on branch)
- Create: `web/wwwroot/render/cobra/tests/cobra_objective_copy.test.mjs`
- Modify: `web/wwwroot/cobra-lab/main.js` — call `cobraObjectiveCopy`
- Modify: lab FOB metric to NM via `formatAviationRange`

**Interfaces:**
- Produces: `cobraObjectiveCopy(war, { selectedTargetId, playerHasInteracted, act? }) → { line, detail }`
- Losing / over_fob tipping hostile outranks tip-friendly; ammo_dry still wins

- [ ] **Step 1:** Ensure failing tests for pad-losing / tipping-hostile / ammo-dry priority
- [ ] **Step 2:** Implement copy; wire `updateObjectiveHud`
- [ ] **Step 3:** `node --test web/wwwroot/render/cobra/tests/cobra_objective_copy.test.mjs`
- [ ] **Step 4:** Commit `feat(cobra): objective urgency when the bridge is falling`

---

### Task 2: Mission act state in sim

**Files:**
- Create: `sim/Cobra/CobraMissionAct.cs` — enum `Depart, Ingress, Engage, Hold, Rtb, Complete`
- Modify: `sim/Cobra/CobraMissionRuntime.cs` — track act; transition rules
- Create/Modify: `sim.Tests/Cobra/CobraMissionActTests.cs`

**Interfaces:**
- Produces: `CobraMissionAct Act { get; }` on runtime; transitions:
  - Depart → Ingress: AGL above pad + groundspeed or distance from pad
  - Ingress → Engage: within bridge site radius OR first hostile in gun envelope
  - Engage → Hold: control ≥ victory threshold (hold timer already exists)
  - Hold/Engage → Rtb: victory hold complete OR ammo dry after engage OR explicit RTB after lose start
  - Rtb → Complete: over FOB pad + skids/near-hover after RTB armed
- Keep existing win/lose timers authoritative for Victory/Defeat status

- [ ] **Step 1:** Write failing act-transition tests
- [ ] **Step 2:** Implement minimal act machine
- [ ] **Step 3:** `dotnet test --filter CobraMissionAct`
- [ ] **Step 4:** Commit `feat(cobra): Ember Run mission act machine`

---

### Task 3: Bridge snapshot — act + path gates

**Files:**
- Modify: `web/CobraWebBridge.cs`
- Modify/Create: smoke or unit test that asserts JSON fields present

**Interfaces:**
- Produces snapshot fields: `mission_act`, `path_gates: [{ east_m, up_m, north_m, radius_m, active }]`
- Gate list derived from selected route points for current act (ingress forward; rtb reverse toward Ember)

- [ ] **Step 1:** Failing test/assert on snapshot shape
- [ ] **Step 2:** Publish act + gates
- [ ] **Step 3:** Verify
- [ ] **Step 4:** Commit `feat(cobra): snapshot Ember Run act and path gates`

---

### Task 4: Draw golden path in cobra-lab

**Files:**
- Create: `web/wwwroot/render/cobra/cobra_ember_path.js`
- Create: `web/wwwroot/render/cobra/tests/cobra_ember_path.test.mjs`
- Modify: `web/wwwroot/cobra-lab/main.js` — `createGuidancePath` + sync each frame from authority

**Interfaces:**
- Consumes: bridge `path_gates`
- Produces: scene group updated via `guidance_path` helpers
- Produces: act-aware objective lines when `act` passed into `cobraObjectiveCopy`

- [ ] **Step 1:** Failing tests for gate mapping / act labels
- [ ] **Step 2:** Wire draw + objective act strings
- [ ] **Step 3:** `node --test …cobra_ember_path.test.mjs` + objective tests
- [ ] **Step 4:** Commit `feat(cobra): Ember Run golden path in the gorge`

---

### Task 5: Readable hostile silhouettes

**Files:**
- Modify: `web/wwwroot/render/cobra/cobra_ground_war.js`
- Modify: `web/wwwroot/render/cobra/tests/*ground_war*` (or create)

**Interfaces:**
- Hostiles: hotter red-orange; role meshes (box stacks / wedge truck / pit) still presentation-only
- Selection ring unchanged
- Tracers/smoke keep event path

- [x] **Step 1:** Failing presentation test for hostile color / role geometry choice
- [x] **Step 2:** Implement silhouettes
- [x] **Step 3:** Run presentation tests
- [x] **Step 4:** Commit `feat(cobra): hostiles that look like they need shooting` (Build 292)

---

### Task 6: Corridor canopy + weather haze

**Files:**
- Modify: `web/wwwroot/render/cobra/cobra_canyon_asset_kit.js` and/or canopy materials
- Modify: `web/wwwroot/render/cobra/cobra_canyon_visual_profile.js` — denser fog, stronger cloud shadow
- Modify: profile wiring tests if constants asserted

**Interfaces:**
- Near-path canopy no longer reads as shard crystal at typical AGL
- Fog density / haze within theatre band already enforced by `cobra_canyon_scene_profile_wiring.test.mjs`

- [ ] **Step 1:** Note current canopy failure mode; adjust geometry/material
- [ ] **Step 2:** Bump haze/cloudShadowStrength within allowed band
- [ ] **Step 3:** Run profile wiring tests
- [ ] **Step 4:** Commit `feat(cobra): Ember Run corridor canopy and haze`

---

### Task 7: RTB complete + stamp Build 272

**Files:**
- Modify: act machine Complete → debrief (Task 2 may already land)
- Stamp release identity / `?v=` sweep including `web/smoke`
- Update `docs/STATUS.md` next candidate

- [ ] **Step 1:** Harness or mission test: pad touchdown after Rtb → Complete
- [ ] **Step 2:** `bin/stamp-release` (or project ritual) to **272**
- [ ] **Step 3:** Focused Ah1g/Cobra + node cobra tests green
- [ ] **Step 4:** Commit `Stamp Build 272: Ember Run Hold the Bridge`
- [ ] **Step 5:** PR → Verify → merge → deploy (owner confirm if policy requires)

---

## Verification

- `node --test web/wwwroot/render/cobra/tests/cobra_objective_copy.test.mjs`
- `node --test web/wwwroot/render/cobra/tests/cobra_ember_path.test.mjs`
- `dotnet test --filter "FullyQualifiedName~CobraMissionAct|FullyQualifiedName~CobraCrewChain|FullyQualifiedName~Ah1gCobraLanding"`
- Owner flight: cold Ember Run — path visible, hostiles readable, hold or lose clear, land pad, debrief
