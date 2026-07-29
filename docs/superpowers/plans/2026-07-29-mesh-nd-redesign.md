# Mesh ND Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `#nav-console` with a map-first Mesh ND (pan/zoom/follow, drag dest, tour), thin solution strip, recovery procedure select (Overhead / Downwind rejoin / Straight-in) wired to HUD flythrough boxes and Rapier energy gates.

**Architecture:** Kernel owns `MeshTour` + `RecoveryProcedureDirector` (gate schedules + energy). WebBridge exports setters. ND JS (`mesh_nav_map.js` + new chrome) is map-first; `circuitGatePresentation` generalizes to recovery-gate presentation. Strip legacy TF rows from nav DOM/`updateNavConsole`.

**Tech Stack:** C# (.NET 8), vanilla ESM JS, node:test, existing WASM WebBridge.

**Spec:** `docs/superpowers/specs/2026-07-29-mesh-nd-redesign-design.md`

## Global Constraints

- Branch `pivot-hardening`; stage **explicit paths only**, never `git add -A`.
- C# tests: `DOTNET_ROOT="$HOME/.dotnet" "$HOME/.dotnet/dotnet" test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~Mesh|FullyQualifiedName~RecoveryProcedure" --nologo`
- JS: `node --test web/wwwroot/render/nav/tests/` and `node --check web/wwwroot/app.js`
- Snapshot bumps if hot slots added: LayoutVersion 17→18, schema 1.22.0→1.23.0, both korea pack pins.
- ANCA stays view-only; interactive surface is `#nav-console` only.
- North-up map v1; Follow vs Free modes.
- Concurrent agents may touch radio/ANCA — do not revert their files.

## File map

| File | Role |
| --- | --- |
| `sim/RecoveryProcedure.cs` | Kind enum, gate records, director + three schedules |
| `sim/MeshNav.cs` | Extend with Tour list APIs |
| `sim/SimulationSession.cs` | Wire directors; StageBeat reset |
| `web/WebBridge.cs` | Procedure + tour exports |
| `web/Snapshot*.cs` / `MeshSnapshot.cs` | Project procedure + tour |
| `web/wwwroot/index.html` | ND chrome DOM; kill legacy outputs |
| `web/wwwroot/app.js` | Wire ND; slim `updateNavConsole` |
| `web/wwwroot/render/nav/mesh_nav_map.js` | Pan/zoom/follow/drag/tour/overlay |
| `web/wwwroot/render/nav/mesh_nd_chrome.js` | Toolbar + solution strip helpers |
| `web/wwwroot/render/mission/rapier_guidance.js` | Recovery gate presentation |

---

### Task 1: Strip nav DOM to ND chrome + solution strip

**Files:**
- Modify: `web/wwwroot/index.html` (`#nav-console` body)
- Modify: `web/wwwroot/app.js` (`updateNavConsole`, remove dead `navUi` keys)
- Create: `web/wwwroot/render/nav/mesh_nd_chrome.js`
- Test: `web/wwwroot/render/nav/tests/mesh_nd_chrome.test.mjs`

**Produces:** Toolbar placeholders + larger map + strip fields only: dest, brg, rng, eta, fuel aboard, triad, reserve, proc.

- [ ] **Step 1:** Rewrite `#nav-console .tf-body` HTML: toolbar (`#nav-nd-follow`, `#nav-nd-free`, procedure chips, `#nav-nd-tour-add`, `#nav-nd-clear`), canvas taller (min 220px), solution strip outputs only. Delete handoff/relief/gross/thrust/skin/contact nodes.
- [ ] **Step 2:** `mesh_nd_chrome.js` — `bindNavNdChrome(root)` returns element refs; `formatSolutionStrip(mesh, fuelLb, procedureLabel)`.
- [ ] **Step 3:** Slim `updateNavConsole` to use chrome + existing mesh presentation; map draw still works.
- [ ] **Step 4:** `node --test web/wwwroot/render/nav/tests/` + `node --check web/wwwroot/app.js`
- [ ] **Step 5:** Commit `Strip nav console to Mesh ND chrome and solution strip.`

---

### Task 2: Map pan / zoom / follow / drag ActiveDest

**Files:**
- Modify: `web/wwwroot/render/nav/mesh_nav_map.js`
- Test: `web/wwwroot/render/nav/tests/mesh_nav_map.test.mjs`

**Produces:** `createMeshNavMap` options `{ onSelectPlace, onFreeFix, onDragDest, onModeChange }`; internal `mode: follow|free`, `spanNm`, centre; pointer handlers.

- [ ] **Step 1:** Failing tests for zoom span clamp (15–400 NM), follow recentre, drag vs click threshold (6 px).
- [ ] **Step 2:** Implement wheel zoom, free pan, follow lock, dest-pip drag calling `onDragDest(east, north)`.
- [ ] **Step 3:** Wire toolbar Follow/Free in `app.js`; drag → `SetMeshFreeFix`.
- [ ] **Step 4:** Tests pass; commit `Add Mesh ND pan, zoom, follow, and ActiveDest drag.`

---

### Task 3: Kernel Mesh Tour

**Files:**
- Modify: `sim/MeshNav.cs`
- Modify: `sim/SimulationSession.cs`, `web/WebBridge.cs`, snapshots
- Test: `sim.Tests/MeshNavTourTests.cs`

**Produces:**
- `MeshNavDirector`: `IReadOnlyList<MeshActiveDest> Tour`, `bool TryTourAppendPlace(...)`, `bool TryTourAppendFreeFix(...)`, `void ClearTour()`, `void AdvanceTourIfArrived(rangeM)` optional v1 skip auto-advance
- Bridge: `MeshTourAppendPlace`, `MeshTourAppendFreeFix`, `ClearMeshTour`
- Snapshot: `mesh_tour_json` (cold string), `mesh_tour_count`

- [ ] **Step 1:** Failing tests append/clear/order; reserve math uses remaining stops (extend `MeshNavProjection` or tour helper).
- [ ] **Step 2:** Implement + session/bridge/snapshot.
- [ ] **Step 3:** ND TOUR+ arms append-on-click; draw polyline.
- [ ] **Step 4:** Commit `Add kernel Mesh tour list and ND tour arming.`

---

### Task 4: RecoveryProcedure director + three schedules

**Files:**
- Create: `sim/RecoveryProcedure.cs`
- Test: `sim.Tests/RecoveryProcedureTests.cs`
- Modify: `SimulationSession`, `WebBridge`, snapshots

**Produces:**
```csharp
enum RecoveryProcedureKind { None=0, Overhead=1, DownwindRejoin=2, StraightIn=3 }
readonly record struct RecoveryGate(string Id, string Label, double EastM, double NorthM, double UpM, double HalfM, double TargetKtas, bool DirtyConfig);
sealed class RecoveryProcedureDirector {
  void Reset();
  bool TrySet(RecoveryProcedureKind kind, in Vec3D home, double homeHeadingRad);
  RecoveryProcedureKind Kind { get; }
  IReadOnlyList<RecoveryGate> Gates { get; }
  int ActiveIndex { get; }
  void Step(in Vec3D position, in Vec3D velocity, double ktas, bool gearDown, bool flapsDown);
  bool InVolume { get; }
  bool EnergyOk { get; }
  bool ConfigOk { get; }
  RecoveryGate? ActiveGate { get; }
}
```

Schedules (HomePlate-relative, heading = recovery landing heading or 0):
- **Overhead:** DEPART, INITIAL, BREAK, DOWNWIND, BASE, SHORT_FINAL, WIRE_FINAL — geometry ballpark from circuits SA spec; KTAS ~300→180 shed
- **DownwindRejoin:** JOIN_DOWNWIND, BASE, SHORT_FINAL, WIRE_FINAL
- **StraightIn:** FINAL_8NM, FINAL_4NM, SHORT_FINAL, WIRE_FINAL — lower KTAS earlier

Energy band: `|ktas - target| <= 25` (v1) when in volume; config dirty/clean per gate flag.

Bridge: `SetRecoveryProcedure(int)`.

- [ ] **Step 1–4:** TDD director; wire session Step each tick near radio/checklist; project fields; commit `Add RecoveryProcedure director with three Rapier schedules.`

---

### Task 5: HUD + ND procedure overlay

**Files:**
- Modify: `web/wwwroot/render/mission/rapier_guidance.js` — `recoveryGatePresentation(state)` wrapping circuits when pattern-only Overhead else new snapshot fields
- Modify: `hud.js` if it only calls `circuitGatePresentation`
- Modify: `mesh_nav_map.js` draw procedure polyline/gates
- Modify: `app.js` chip handlers → `SetRecoveryProcedure`

- [ ] **Step 1:** Tests for presentation accent under straight-in fixture state
- [ ] **Step 2:** Implement overlay + chips (disabled without home)
- [ ] **Step 3:** Commit `Wire recovery procedures into HUD gates and Mesh ND overlay.`

---

### Task 6: Stamp + accept specs

- Bump RELEASE_BUILD if wwwroot stamped; mark ND design accepted; run Mesh/RecoveryProcedure tests + nav JS tests; commit stamp.

---

## Spec coverage

| Spec item | Task |
| --- | --- |
| Strip TF cruft / solution strip | 1 |
| Pan/zoom/follow/drag | 2 |
| Tour | 3 |
| Procedure select + schedules | 4 |
| HUD boxes/energy + ND overlay | 5 |
