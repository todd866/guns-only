# Rapier Airframe SE + Jet Kit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Freeze Rapier’s first-principles engineering (regime, geometry, materials, propulsion, mass) into an SE bible and a versioned Airframe Definition that drives blueprints and the in-game mesh — without redesigning the aircraft.

**Architecture:** Part I decisions from the design spec become `docs/airframes/rapier/` prose and `airframes/rapier.v1.json` (1:1 from today’s `createRapier` + `FlightModel`). A definition-driven builder rebuilds the mesh from that JSON; `createRapier` becomes a thin loader. Later phases deepen SE trades (drone packaging, CG, cost) and prove the kit on a second airframe. Engineering leads; schemas capture.

**Tech Stack:** Markdown SE bible, JSON Schema + `rapier.v1.json`, vanilla ES modules / Three.js (`scene_builders.js`), `node --test` presentation tests, optional light C# comment/pointer on `FlightModel`, `./bin/check` gate.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-27-rapier-airframe-se-and-jet-kit-design.md` (approved first-principles rewrite)
- **Part I first:** bible chapters and JSON numbers encode regime → geometry → thermal → propulsion → mass before infrastructure polish
- Authored freezes: Mach-4 thin-air dash; CMC `SkinTemperatureLimitK = 1473.15`; map `DesignMach = 2.6` is normaliser only; stainless/M2.6 airframe story superseded
- Geometry lock Phase 1: length 13 m, span 7.35 m, wing 18 m², AR 3; mass 5150 / 4500 / 9650 kg; duct `RamCaptureAreaM2 = 1.2`
- No silent OML redesign — migrate `createRapier` numbers 1:1
- Four `droneBay` sockets provisional; do not claim packaging closed
- Per-stream fuel remains an open finding — name it, do not fake-fix in this plan
- ADR-0003: Ghibli stills are `fiction` refs, not runtime SoT
- TDD for code tasks; keep existing `rapier_presentation.test.mjs` green; full gate `PATH="/opt/homebrew/bin:$PATH" GUNS_DOTNET_CLI="$HOME/.dotnet/dotnet" DOTNET_ROOT="$HOME/.dotnet" DOTNET_MULTILEVEL_LOOKUP=0 ./bin/check`
- Commit steps are for the executing engineer when the user has allowed commits; skip commits if the user has not asked

### Closed numbers card (Phase 1 — do not invent)

| Quantity | Value |
| --- | --- |
| Length / span / S / AR | 13 m / 7.35 m / 18 m² / 3.0 |
| Mass empty / fuel / gross | 5150 / 4500 / 9650 kg |
| Core SLS dry / augmentor | 85 kN / 1.55 |
| Skin limit | 1473.15 K |
| Ram capture area | 1.2 m² |
| Presentation id | `presentation.vehicle.rapier.public-data-surrogate.v1` |
| Airframe id | `rapier.public-data-surrogate.v1` |
| Frame | `threejs-createRapier-v1` (+Z aft) |

---

## File map

| File | Responsibility |
| --- | --- |
| `docs/airframes/README.md` | Jet-kit how-to: Part I first, then JSON/plates |
| `docs/airframes/_template/*` | Empty SE chapter stubs for future jets |
| `docs/airframes/rapier/README.md` | Index, freezes, epistemic banner, pointer to design spec |
| `docs/airframes/rapier/00`–`95` + `icds/` | SE bible chapters (Phase 1: §§1–5 closed; §6 provisional) |
| `docs/airframes/rapier/blueprints/*` | Hand SVG/MD plates from JSON |
| `airframes/schema/airframe-definition.schema.json` | JSON Schema for definitions |
| `airframes/_template/airframe.v1.json` | Empty template |
| `airframes/rapier.v1.json` | Geometry-of-record |
| `web/wwwroot/airframes/rapier.v1.json` | Browser-reachable copy (same bytes as repo root definition) |
| `web/wwwroot/render/scene/airframe_from_definition.js` | `createAirframeFromDefinition` |
| `web/wwwroot/render/scene/scene_builders.js` | Thin `createRapier` wrapper; keep loft helpers exported |
| `web/wwwroot/render/presentation/tests/rapier_presentation.test.mjs` | Existing silhouette tests stay green |
| `web/wwwroot/render/presentation/tests/airframe_definition.test.mjs` | Definition load + golden sockets/bbox |
| `analysis/art-refs/rapier/index.json` | Provenance cards (binaries gitignored OK) |
| `sim/FlightModel.cs` | Comment pointer to definition + stainless supersession note |
| `docs/2026-07-26-open-work-and-findings.md` | Short note: M4/CMC decision locked by airframe SE spec |

**Out of Phase 1:** plate generator tool, C# binding CI asserts, drone mass closure, second airframe, retiring all procedural paths beyond Rapier wrapper.

---

## Phase 1 — Geometry-of-record + bible skeleton + blueprints + renderer

### Task 1: SE bible skeleton (Part I prose)

**Files:**
- Create: `docs/airframes/rapier/README.md`
- Create: `docs/airframes/rapier/00-mission-and-ops.md`
- Create: `docs/airframes/rapier/10-geometry.md`
- Create: `docs/airframes/rapier/20-thermal-and-materials.md`
- Create: `docs/airframes/rapier/30-propulsion-and-inlet.md`
- Create: `docs/airframes/rapier/40-mass-and-cg.md`
- Create: `docs/airframes/rapier/50-crew-escape-fbw.md`
- Create: `docs/airframes/rapier/60-armament-and-drones.md`
- Create: `docs/airframes/rapier/70-landing-gear-arrest.md`
- Create: `docs/airframes/rapier/80-basing-and-ground.md`
- Create: `docs/airframes/rapier/90-failure-modes.md`
- Create: `docs/airframes/rapier/95-cost-ledger.md`
- Create: `docs/airframes/rapier/icds/propulsion-airframe.md`
- Create: `docs/airframes/rapier/icds/fbw-crew.md`
- Create: `docs/airframes/rapier/icds/gun-drone-carriage.md`
- Create: `docs/airframes/rapier/icds/basing-arrest.md`
- Create: `docs/airframes/README.md`

**Interfaces:**
- Consumes: design spec Part I (§§1–6) numbers and freezes
- Produces: readable bible; `README.md` states airframe id `rapier.public-data-surrogate.v1`

- [x] **Step 1: Write `docs/airframes/rapier/README.md`** with epistemic banner, Mach-4/CMC freeze, stainless supersession, link to design spec, chapter index in Part I order (mission → geometry → thermal → propulsion → mass → systems…).

- [x] **Step 2: Fill chapters 00, 10, 20, 30, 40** by lifting closed tables from the design spec (regime boxes, geometry envelope, CMC zones, TBCC handover constants including `RamCaptureAreaM2 = 1.2` and `DesignMach = 2.6` normaliser, mass 5150/4500/9650). Each chapter must be readable without the JSON schema.

- [x] **Step 3: Stub chapters 50–95 and ICDs** with short prose + explicit `provisional` / open-finding callouts (drone packaging, per-stream fuel, escape jettison, power watts). Do not invent closed drone masses.

- [x] **Step 4: Write `docs/airframes/README.md`** — future-jet path: write Part I first, then copy template JSON, then plates; no bespoke `createFoo` without exception note.

- [x] **Step 5: Sanity check** — open README + 00/10/20/30/40; confirm no “schema-first” lead and stainless is marked superseded.

- [x] **Step 6: Commit (if permitted)** — skipped (user forbade commits)

---

### Task 2: JSON Schema + Rapier definition (geometry-of-record)

**Files:**
- Create: `airframes/schema/airframe-definition.schema.json`
- Create: `airframes/_template/airframe.v1.json`
- Create: `airframes/rapier.v1.json`
- Create: `web/wwwroot/airframes/rapier.v1.json` (byte-identical copy)
- Test: `web/wwwroot/render/presentation/tests/airframe_definition.test.mjs`

**Interfaces:**
- Consumes: loft/planform/fin/socket numbers from `createRapier` in `scene_builders.js` (~1505–1598); span/area/mass from `FlightModel.RapierPublicDataSurrogate`
- Produces: `AirframeDefinition` JSON with `schema: "guns-only.airframe-definition.v1"`, `id: "rapier.public-data-surrogate.v1"`, `revision: "1.0.0"`, `frameConvention: "threejs-createRapier-v1"`

- [ ] **Step 1: Write failing test** in `airframe_definition.test.mjs`:

```javascript
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "../../../airframes");

test("rapier.v1.json publishes closed geometry and identity", () => {
  const def = JSON.parse(readFileSync(join(root, "rapier.v1.json"), "utf8"));
  assert.equal(def.schema, "guns-only.airframe-definition.v1");
  assert.equal(def.id, "rapier.public-data-surrogate.v1");
  assert.equal(def.presentationId, "presentation.vehicle.rapier.public-data-surrogate.v1");
  assert.equal(def.flightModelBinding, "FlightModel.RapierPublicDataSurrogate");
  assert.equal(def.frameConvention, "threejs-createRapier-v1");
  assert.equal(def.dimensionsM.length, 13);
  assert.equal(def.dimensionsM.span, 7.35);
  assert.equal(def.wing.areaM2, 18);
  assert.equal(def.wing.aspectRatio, 3);
  assert.equal(def.massKg.fuelFree, 5150);
  assert.equal(def.massKg.fuelCapacity, 4500);
  assert.equal(def.massKg.gross, 9650);
  assert.equal(def.propulsion.ramCaptureAreaM2, 1.2);
  assert.equal(def.thermal.skinTemperatureLimitK, 1473.15);
  assert.equal(def.wing.planform.length, 12);
  assert.equal(def.fuselage.stations.length, 7);
  assert.ok(def.sockets.cockpitCamera);
  assert.ok(def.sockets.muzzleLeft);
  assert.ok(def.sockets.muzzleRight);
  assert.equal(def.sockets.droneBay.length, 4);
  assert.equal(def.sockets.droneBay[0].epistemic, "provisional");
});
```

- [ ] **Step 2: Run test — expect FAIL** (file missing)

```bash
node --test web/wwwroot/render/presentation/tests/airframe_definition.test.mjs
```

Expected: `ENOENT` or assertion failure on missing file.

- [ ] **Step 3: Author `airframe-definition.schema.json`** with required fields: `schema`, `id`, `revision`, `presentationId`, `flightModelBinding`, `epistemic`, `frameConvention`, `dimensionsM`, `wing` (incl. `planform` array of `[y,z]`), `fuselage.stations` (`z,rx,ry,y`), optional `escapePodSpine`, `propulsionTunnel`, `intake`, `exhaust`, `fins`, `accents`, `sockets`, `materialZones`, `palette`, `propulsion.ramCaptureAreaM2`, `thermal.skinTemperatureLimitK`, `massKg`.

- [ ] **Step 4: Write `airframes/rapier.v1.json`** migrating exact planform polyline, loft stations, spine, tunnel, intake, exhaust, fins, tip accents, palette hexes, and today’s three sockets from `createRapier`; add `hook` + four `droneBay` sockets with `"epistemic": "provisional"` and placeholder positions under the belly (document as provisional in `notes`); set `materialZones` for `leadingEdges`/`hotSectionFairing` = CMC, skins = composite, spine = sensor.

- [ ] **Step 5: Copy** to `web/wwwroot/airframes/rapier.v1.json` (identical content). Add `airframes/_template/airframe.v1.json` with empty arrays and `"epistemic": "provisional"`.

- [ ] **Step 6: Run test — expect PASS**

```bash
node --test web/wwwroot/render/presentation/tests/airframe_definition.test.mjs
```

- [ ] **Step 7: Commit (if permitted)** `feat(airframes): Rapier v1 geometry-of-record definition`

---

### Task 3: Definition-driven mesh builder

**Files:**
- Create: `web/wwwroot/render/scene/airframe_from_definition.js`
- Modify: `web/wwwroot/render/scene/scene_builders.js` (`createRapier`)
- Test: `web/wwwroot/render/presentation/tests/airframe_definition.test.mjs`
- Test: `web/wwwroot/render/presentation/tests/rapier_presentation.test.mjs` (must stay green)

**Interfaces:**
- Consumes: `createPlanformGeometry`, `createLoftGeometry`, `createFinGeometry`, `makeMaterial` / `addSemanticSocket` / `annotateProceduralFallback` from `scene_builders.js` (export any helper `createRapier` needs that is not already exported)
- Produces: `export function createAirframeFromDefinition(def, context = {})` → `THREE.Group` with same object names and `userData.dimensionsM` / `userData.sockets` / `userData.airframeId` / `userData.definitionRevision` as today’s Rapier

- [x] **Step 1: Extend failing tests** — after loading def, build mesh and assert golden contract:

```javascript
import { createAirframeFromDefinition } from "../../scene/airframe_from_definition.js";
import * as THREE from "../../../vendor/three.module.js";

test("definition-built Rapier matches silhouette contract", () => {
  const def = JSON.parse(readFileSync(join(root, "rapier.v1.json"), "utf8"));
  const rapier = createAirframeFromDefinition(def);
  const size = new THREE.Box3().setFromObject(rapier).getSize(new THREE.Vector3());
  assert.equal(rapier.name, "RAPIER_HIGH_ALTITUDE_INTERCEPTOR_SURROGATE");
  assert.ok(Math.abs(size.z - 13) < 0.02);
  assert.deepEqual(rapier.userData.dimensionsM, { length: 13, span: 7.35 });
  assert.equal(rapier.userData.airframeId, "rapier.public-data-surrogate.v1");
  assert.ok(rapier.getObjectByName("RAPIER_OPAQUE_ESCAPE_POD_SPINE"));
  assert.equal(rapier.userData.sockets.cockpitCamera.name, "SOCKET_CAMERA_COCKPIT");
  assert.equal(rapier.children.some((c) => /canopy/i.test(c.name)), false);
});

test("createAirframeFromDefinition refuses incomplete geometry", () => {
  assert.throws(
    () => createAirframeFromDefinition({ schema: "guns-only.airframe-definition.v1", id: "x" }),
    /planform|fuselage|required/i,
  );
});
```

- [x] **Step 2: Run** `node --test web/wwwroot/render/presentation/tests/airframe_definition.test.mjs` → FAIL (module missing).

- [x] **Step 3: Implement `createAirframeFromDefinition`** — map `def.wing.planform` → `createPlanformGeometry`; stations → lofts; fins/intake/exhaust/accents; materials from `def.palette` + `materialZones`; sockets via `addSemanticSocket`; set `userData`; on missing `wing.planform` or `fuselage.stations`, throw `Error` naming `def.id` (no fallback mesh).

- [x] **Step 4: Rewrite `createRapier`** to load the published JSON synchronously for tests (readFile is node-only) **or** accept optional `context.definition`; default path for browser: fetch/cache. Minimal Phase 1 approach that keeps tests green:

```javascript
// Preferred Phase 1: createRapier imports a bundled snapshot OR reads via context
export function createRapier(context = {}) {
  const def = context.definition ?? getEmbeddedRapierDefinition();
  return createAirframeFromDefinition(def, context);
}
```

Where `getEmbeddedRapierDefinition` either `import`s JSON (if bundler/node test supports import assertions) or duplicates load from `../../../airframes/rapier.v1.json` in tests via `context.definition`. **Do not leave two divergent OMLs** — production path must use the same JSON file contents as `web/wwwroot/airframes/rapier.v1.json`.

Practical Phase 1 pattern for this repo (no bundler):

```javascript
import { createAirframeFromDefinition } from "./airframe_from_definition.js";

let cachedRapierDef = null;
export async function loadRapierDefinition() {
  if (cachedRapierDef) return cachedRapierDef;
  const res = await fetch("/airframes/rapier.v1.json");
  if (!res.ok) throw new Error(`Rapier definition missing: ${res.status}`);
  cachedRapierDef = await res.json();
  return cachedRapierDef;
}

export function createRapier(context = {}) {
  if (!context.definition) {
    throw new Error(
      "createRapier requires context.definition in Phase 1; pass loadRapierDefinition() result",
    );
  }
  return createAirframeFromDefinition(context.definition, context);
}
```

If that breaks `app.js` call sites that use `createRapier()` with no args, **instead** embed a sync fallback: `createRapier` tries `context.definition`, else uses a module-level `RAPIER_V1` object imported from a generated `rapier_v1.embedded.js` that is a checked-in `export default { ... }` copy of the JSON (regenerate when JSON changes). Prefer embedded sync export for zero `app.js` churn:

- Create: `web/wwwroot/airframes/rapier_v1.embedded.js` — `export default` the same object
- `createRapier()` uses embedded by default; tests may pass overrides

- [x] **Step 5: Wire `app.js` only if needed** — if sync embedded default works, no registry change beyond imports. If async load chosen, update the presentation factory to await `loadRapierDefinition` once at boot.

- [x] **Step 6: Run presentation tests**

```bash
node --test web/wwwroot/render/presentation/tests/airframe_definition.test.mjs \
  web/wwwroot/render/presentation/tests/rapier_presentation.test.mjs
```

Expected: PASS both files. Fix tolerances only if bevel/span drift is from shared helpers (must stay within existing 12 cm span / 2 cm length contracts).

- [ ] **Step 7: Commit (if permitted)** `feat(render): build Rapier mesh from airframe definition` — **skipped** (user: do not commit)

---

### Task 4: Blueprint plates (Phase 1 set)

**Files:**
- Create: `docs/airframes/rapier/blueprints/README.md`
- Create: `docs/airframes/rapier/blueprints/plate-01-three-view.svg` (or `.md` with embedded SVG)
- Create: `docs/airframes/rapier/blueprints/plate-02-wing-planform.svg`
- Create: `docs/airframes/rapier/blueprints/plate-03-loft-stations.md` (table + simple SVG sections OK)
- Create: `docs/airframes/rapier/blueprints/plate-04-inlet-duct-nozzle.svg`
- Create: `docs/airframes/rapier/blueprints/plate-05-escape-spine.svg`
- Create: `docs/airframes/rapier/blueprints/plate-08-thermal-zones.svg`
- Create: `docs/airframes/rapier/blueprints/plate-10-basing-interface.svg`

**Interfaces:**
- Consumes: `airframes/rapier.v1.json` revision `1.0.0`
- Produces: plates each titled with `rapier.public-data-surrogate.v1` @ `1.0.0`

- [x] **Step 1: Write `blueprints/README.md`** — plates derive from JSON only; regenerate checklist when revision bumps; hand SVG is Phase 1.

- [x] **Step 2: Author plates 01–05, 08, 10** using definition numbers (13×7.35, planform polyline, loft table, 1.2 m² duct callout, CMC vs composite map, gallery 14×8 m / 2.7% blockage / 12° ramp). Mark drone bays provisional if shown.

- [x] **Step 3: Cross-check** — pick three numbers from plate-01 and plate-04; confirm they match JSON (`length`, `span`, `ramCaptureAreaM2`).

- [ ] **Step 4: Commit (if permitted)** `docs(airframes): Rapier Phase 1 blueprint plates from definition` — **skipped** (user: do not commit)

---

### Task 5: Ghibli ref pipeline scaffold + FlightModel pointer

**Files:**
- Create: `analysis/art-refs/rapier/index.json`
- Create: `analysis/art-refs/README.md` (if missing) — binaries gitignored; index tracked
- Modify: `sim/FlightModel.cs` — Rapier docstring: point at `airframes/rapier.v1.json` and `docs/airframes/rapier/`; replace “Steel where the heat is” wording with CMC freeze (doc comment only)
- Modify: `docs/2026-07-26-open-work-and-findings.md` — short locked-decision note under the stainless/M4 concern pointing at the SE spec

**Interfaces:**
- Produces: provenance schema example; no requirement to generate PNG in CI

- [x] **Step 1: Write `analysis/art-refs/rapier/index.json`:**

```json
{
  "airframeId": "rapier.public-data-surrogate.v1",
  "refs": [],
  "notes": "Add fiction-tagged stills (opaque spine, buried-strip reveal, weathered TBCC). ADR-0003: not runtime SoT."
}
```

- [x] **Step 2: Update `FlightModel.RapierPublicDataSurrogate` leading comments** — CMC hot structure (already true in body); remove contradictory “Steel where the heat is” opener; add `// Geometry-of-record: airframes/rapier.v1.json · bible: docs/airframes/rapier/`.

- [x] **Step 3: Patch open-findings** with one paragraph: decision = accept M4 + CMC per `2026-07-27-rapier-airframe-se-and-jet-kit-design.md`; stainless story superseded; `DesignMach` 2.6 remains map normaliser.

- [x] **Step 4: Optional** — generate 1–3 stills into `analysis/art-refs/rapier/` and add provenance cards to `index.json` (`date`, `model`, `promptNudges`, `epistemic: "fiction"`). Skip if no image tool in session; scaffold alone is enough for Phase 1 gate.

- [x] **Step 5: Run** `dotnet test` filter not required for comment-only; run presentation tests again + `./bin/check` if touching C#. — comment/docs only; full `./bin/check` deferred to Task 6

- [ ] **Step 6: Commit (if permitted)** `docs(rapier): lock M4/CMC narrative; art-ref scaffold` — **skipped** (user: do not commit)

---

### Task 6: Phase 1 acceptance gate

**Files:** none new

- [x] **Step 1: Checklist against design §15**

  - [x] Bible §§ mission–mass readable without schema docs
  - [x] Mach-4 + CMC freeze + stainless supersession explicit in README (M4 fiction-labelled)
  - [x] `DesignMach` 2.6 called normaliser in propulsion chapter
  - [x] Geometry table matches FlightModel + definition
  - [x] Definition ↔ mesh golden tests pass
  - [x] Plates cite revision; duct 1.2 m² on plate 04; plate 09 performance honesty
  - [x] Per-stream fuel + drone packaging called open
  - [x] Teaching deck at `present/rapier-design/`

- [x] **Step 2: Run full gate** — executed in oneshot pass

- [ ] **Step 3: Commit (if permitted)** — skipped until user asks

---

## Phase 2 — Deepen SE trades (separate execution pass)

### Task 7: Drone packaging trade + socket revision

**Files:** `docs/airframes/rapier/60-armament-and-drones.md`, `icds/gun-drone-carriage.md`, `airframes/rapier.v1.json` (bump `revision`), plates 06–07, companion `docs/rapier-gun-drone-system.md`

- [ ] **Step 1:** Tabulate 2 vs 3 vs 4 cell mass/volume/CG options; pick preferred geometry for fiction-compatible packaging (may still be provisional physics).
- [ ] **Step 2:** Update `droneBay` positions; bump revision; regenerate affected plates; update embedded JSON copy.
- [ ] **Step 3:** Tests — definition revision asserted; mesh still within silhouette contract.
- [ ] **Step 4:** Commit (if permitted) `docs(airframes): Rapier drone bay packaging trade v1.1`

### Task 8: Binding tests (definition ↔ FlightModel)

**Files:** Create `sim.Tests/AirframeDefinitionBindingTests.cs` (or node test reading both if C# JSON parse is heavier)

- [ ] **Step 1:** Failing test — span 7.35, area 18, skin 1473.15, fuel-free 5150 match definition file checked into repo.
- [ ] **Step 2:** Implement reader + asserts.
- [ ] **Step 3:** Commit (if permitted) `test: bind Rapier definition to FlightModel envelope`

### Task 9: Cost ledger + power budget + FMECA expansion

**Files:** `95-cost-ledger.md`, `40`/`50` extensions, `90-failure-modes.md`

- [ ] Fill CMC vs stainless counterfactual, qualitative→watt table, expand FMECA from OFT notes.
- [ ] Commit (if permitted) when chapters close.

---

## Phase 3 — Kit proof + optional tooling

### Task 10: Second airframe through template

**Files:** `docs/airframes/<name>/`, `airframes/<name>.v1.json`, presentation registration

- [ ] Prefer Rapier gun-drone or one-way attack drone as the second subject (smaller OML).
- [ ] Prove Part I → JSON → `createAirframeFromDefinition` path without bespoke mesh function (exception only if loft schema insufficient).
- [ ] Commit (if permitted).

### Task 11 (optional): Plate generator

**Files:** `tools/airframe-plates/` — JSON → SVG three-view

- [ ] Only if hand plates proved painful in Phase 1–2.

---

## Phase 4 — Optional hardening

### Task 12: Retire procedural-only Rapier path

- [ ] Ensure no duplicate OML literals remain in `scene_builders.js` beyond helpers.
- [ ] Golden tests remain the regression net.

---

## Spec coverage (self-review)

| Spec section | Task(s) |
| --- | --- |
| §1 Mission / regime | Task 1 (00) |
| §2 Geometry | Tasks 1 (10), 2, 3, 4 |
| §3 Materials / thermal | Tasks 1 (20), 2 zones, 4 plate 08 |
| §4 Propulsion | Tasks 1 (30), 2 `ramCaptureAreaM2`, 4 plate 04 |
| §5 Mass / CG | Task 1 (40); Task 7 Phase 2 for drone CG |
| §6 Systems cascade | Task 1 stubs 50–90; Task 7–9 deepen |
| §7–8 Definition / capture | Tasks 2–3 |
| §9 Blueprints | Task 4; 06–07 in Task 7 |
| §10 Renderer | Task 3 |
| §11 Sim binding | Tasks 5, 8 |
| §12 Ghibli | Task 5 |
| §13 Future jets | Task 1 README + template; Task 10 |
| §14 Phases | This plan’s phase structure |
| §15 Acceptance | Task 6 |

**Placeholder scan:** none intentional; Phase 2+ tasks are scoped but thinner by design.

**Type consistency:** `createAirframeFromDefinition(def, context)`, airframe id `rapier.public-data-surrogate.v1`, revision semver on JSON, embedded sync path preferred for `createRapier()`.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-27-rapier-airframe-se-and-jet-kit.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks; use worktree if other agents are on `main` (`using-git-worktrees`).
2. **Inline Execution** — execute tasks in this session with `executing-plans`, checkpoints between tasks.

**Which approach?** Also say whether commits are allowed during execution (plan includes commit steps but they were not requested yet).
