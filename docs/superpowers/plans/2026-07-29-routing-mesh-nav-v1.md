# Routing Mesh v1 (shared geography + nav map) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship kernel-owned ActiveDest / HomePlate Mesh navigation with Open Segment vs mission-gated selectability, fuel triad + reserve-on-return-to-home projection, a curated free-fly Place catalog, and a clickable moving map under `#nav-console`.

**Architecture:** Pure Mesh types + `MeshNavDirector` in `sim/` own ActiveDest and solution math (reusing `FuelModel.ProjectRecoveryTo` / `GuidanceTo`). Places load from a versioned free-fly JSON catalog plus beat HomePlate. `WebBridge` exports select/clear/free-fix commands. Snapshot projects Mesh fields; `#nav-console` gains a canvas map module that clicks Places/Free Fixes. Scenery richness is **out of scope** (follow-on plan per spec).

**Tech Stack:** C# (.NET 8, `~/.dotnet`), vanilla ESM JS under `web/wwwroot/render/`, node:test, existing WASM WebBridge `JSExport` pattern.

**Spec:** `docs/superpowers/specs/2026-07-29-shared-geography-nav-fabric-design.md`  
**Canon:** `docs/nav-fabric-canon.md`

## Global Constraints

- Branch `pivot-hardening`. Concurrent agents share this tree: stage **explicit paths only**, never `git add -A`.
- Gate: `PATH="/opt/homebrew/bin:$PATH" GUNS_DOTNET_CLI="$HOME/.dotnet" DOTNET_ROOT="$HOME/.dotnet" DOTNET_MULTILEVEL_LOOKUP=0 ./bin/check` (full gate at end; per-task use focused tests).
- C# quick loop: `DOTNET_ROOT="$HOME/.dotnet" "$HOME/.dotnet/dotnet" test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~MeshNav" --nologo`
- JS quick loop: `node --test web/wwwroot/render/nav/tests/` and `node --check web/wwwroot/app.js`
- Snapshot ritual: `SnapshotHotFrame.LayoutVersion` 16 → **17**; `SnapshotProjection` schema `"1.21.0"` → `"1.22.0"`; both `content/packs/korea-1950s/pack.json` and `web/wwwroot/content/packs/korea-1950s/pack.json` `snapshotSchemaVersion`; update any harness pins that assert layout 16 / schema 1.21.0.
- C# style: file-scoped `namespace GunsOnly.Sim;`, 4-space indent, K&R braces, `readonly` fields without `private`.
- JS style: snake_case filenames, camelCase functions, SCREAMING_SNAKE consts, snake_case wire fields, `Object.freeze` on view objects, `tests/*.test.mjs`.
- Doctrine: ANCA Navigate stays view-only; interactive selection lives on `#nav-console` + map only.
- No Jeppesen cosplay; Free Fixes never bind scenery.
- YAGNI: no Tour multi-leg UI, no Published Procedure following, no scenery hero enrichment in this plan.

## File map

| File | Responsibility |
| --- | --- |
| `sim/MeshNav.cs` | Place roles, selectability, ActiveDest, director, solution projection helpers |
| `sim.Tests/MeshNavTests.cs` | Unit tests for selectability + solution math |
| `content/packs/ukraine-modern/environment/mesh/free-fly-places.v1.json` | Curated Open Segment Places (and wwwroot copy) |
| `sim/Doctrine/Beats.cs` | `OpenSegmentNav` (or equivalent) on setups that allow free-fly |
| `sim/SimulationSession.cs` | Own director; reset on StageBeat; wire HomePlate from RecoveryPlan |
| `web/WebBridge.cs` | `SetMeshActivePlace`, `SetMeshFreeFix`, `ClearMeshActiveDest` |
| `web/SnapshotHotFrame.cs` / `SnapshotProjection.cs` | Project Mesh + dest/home fuel fields |
| `web/wwwroot/render/nav/mesh_nav_presentation.js` | Pure JS presentation of Mesh snapshot fields |
| `web/wwwroot/render/nav/mesh_nav_map.js` | Canvas moving map + click hit-testing |
| `web/wwwroot/index.html` / `app.js` | Map mount under nav console; bridge calls; fuel/dest wiring |
| `web/wwwroot/render/nav/tests/*.test.mjs` | Presentation + map math tests |

---

### Task 1: MeshNav core — roles, selectability, ActiveDest, solution

**Files:**
- Create: `sim/MeshNav.cs`
- Test: `sim.Tests/MeshNavTests.cs`

**Interfaces:**
- Produces:
  - `enum MeshPlaceRole { Home = 0, Destination = 1, Landmark = 2, SceneryAnchor = 3, ProcedureFix = 4 }`
  - `enum MeshNavTransitMode { MissionGated = 0, OpenSegment = 1 }`
  - `readonly record struct MeshPlace(string PlaceId, string DisplayName, double EastM, double NorthM, double? UpM, MeshPlaceRole Role)`
  - `readonly record struct MeshFreeFix(double EastM, double NorthM, string? Label)`
  - `readonly record struct MeshActiveDest(bool IsPlace, string? PlaceId, string DisplayName, double EastM, double NorthM, double? UpM)`
  - `static class MeshSelectability` with `static bool CanSelect(MeshPlaceRole role, MeshNavTransitMode mode, bool phaseAllows)`
  - `sealed class MeshNavDirector` with `Reset()`, `Configure(MeshNavTransitMode mode, MeshPlace? homePlate, IReadOnlyList<MeshPlace> catalog)`, `bool TrySelectPlace(string placeId, bool phaseAllows)`, `bool TrySetFreeFix(double eastM, double northM, string? label)`, `void ClearActiveDestToHome()`, `MeshActiveDest? Active`, `MeshPlace? HomePlate`, `MeshNavTransitMode Mode`
  - `static MeshNavSolution ProjectSolution(FuelModel fuel, in Vec3D position, in Vec3D groundVelocity, double headingRad, in MeshActiveDest dest, in Vec3D home, double? reserveTargetLb)` returning dest guidance + fuel-to-dest + fuel-on-arrival-dest + fuel-dest-to-home + reserve-margin-on-return (reuse `ProjectRecoveryTo` for dest leg; price dest→home at current LB/NM × range when inbound-to-dest fuel is known, else nulls per honesty rules)

- [ ] **Step 1: Write the failing tests**

```csharp
using GunsOnly.Sim;
using Xunit;

namespace GunsOnly.Sim.Tests;

public sealed class MeshNavTests {
    static MeshPlace Home() => new(
        "recovery.rapier.eastern-dispersed-strip.v1",
        "Eastern dispersed strip",
        0, 0, 20.0, MeshPlaceRole.Home);

    static MeshPlace Crimea() => new(
        "place.ukraine.crimea-coast-survey.v1",
        "Crimea coast survey",
        -280_000, -380_000, null, MeshPlaceRole.Destination);

    static MeshPlace Landmark() => new(
        "place.ukraine.landmark-only.v1",
        "Quiet ridge",
        10_000, 10_000, null, MeshPlaceRole.Landmark);

    [Fact]
    public void LandmarkNeverSelectable_DestinationNeedsOpenSegmentOrMissionGate() {
        Assert.False(MeshSelectability.CanSelect(
            MeshPlaceRole.Landmark, MeshNavTransitMode.OpenSegment, phaseAllows: true));
        Assert.False(MeshSelectability.CanSelect(
            MeshPlaceRole.Destination, MeshNavTransitMode.MissionGated, phaseAllows: true));
        Assert.True(MeshSelectability.CanSelect(
            MeshPlaceRole.Destination, MeshNavTransitMode.OpenSegment, phaseAllows: true));
        Assert.True(MeshSelectability.CanSelect(
            MeshPlaceRole.Home, MeshNavTransitMode.MissionGated, phaseAllows: true));
        Assert.False(MeshSelectability.CanSelect(
            MeshPlaceRole.Home, MeshNavTransitMode.MissionGated, phaseAllows: false));
    }

    [Fact]
    public void OpenSegmentAllowsCatalogPlaceAndFreeFix_MissionGatedRejectsFreeFix() {
        var director = new MeshNavDirector();
        director.Configure(MeshNavTransitMode.OpenSegment, Home(), new[] { Home(), Crimea() });
        Assert.True(director.TrySelectPlace(Crimea().PlaceId, phaseAllows: true));
        Assert.Equal(Crimea().PlaceId, director.Active?.PlaceId);
        Assert.True(director.TrySetFreeFix(-1000, 2000, "FIX"));
        Assert.False(director.Active?.IsPlace);

        director.Configure(MeshNavTransitMode.MissionGated, Home(), new[] { Home() });
        Assert.False(director.TrySetFreeFix(-1000, 2000, "FIX"));
        Assert.False(director.TrySelectPlace(Crimea().PlaceId, phaseAllows: true));
    }

    [Fact]
    public void SolutionPricesDestThenReserveOnReturnToHome() {
        var fuel = new FuelModel(capacityLb: 5000, initialFuelLb: 4000, bingoLb: 600);
        // Seed smoothed burn via public API used elsewhere in FuelModelTests — mirror that pattern.
        // After seeding ~100 lb/min and ~600 KT groundspeed eastbound toward dest at +60 NM:
        // expect fuel-to-dest finite, fuel-on-arrival-dest = aboard - toDest,
        // fuel-dest-to-home finite, reserve margin = arrivalHome - 600.
        // Exact fixtures: copy burn-seed helper from FuelModelTests; assert signs and ordering:
        // fuelOnArrivalDest > fuelOnArrivalHome when dest is between aircraft and home is farther.
        Assert.True(true); // replace with real seeded assertion in implementation
    }
}
```

Replace the placeholder `SolutionPricesDestThenReserveOnReturnToHome` body with a real fixture copied from `sim.Tests/FuelModelTests.cs` burn-seed patterns before running (do not leave `Assert.True(true)`).

- [ ] **Step 2: Run tests — expect FAIL (types missing)**

```bash
DOTNET_ROOT="$HOME/.dotnet" "$HOME/.dotnet/dotnet" test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~MeshNavTests" --nologo
```

- [ ] **Step 3: Implement `sim/MeshNav.cs` minimally to pass**

Selectability table:

| Role | MissionGated + phaseAllows | OpenSegment + phaseAllows |
| --- | --- | --- |
| Home | yes | yes |
| Destination | no (unless place is also in mission list — director only offers listed places) | yes |
| Landmark / SceneryAnchor / ProcedureFix | no | no |

`TrySelectPlace`: find in configured catalog; require `CanSelect(role, mode, phaseAllows)`; set Active.  
`TrySetFreeFix`: require `mode == OpenSegment` and finite coords inside ±500_000 m of origin (theatre sandbox clamp); reject otherwise.  
`ClearActiveDestToHome`: set Active to HomePlate when known.  
`ProjectSolution`:  
1. `destNav = fuel.ProjectRecoveryTo(pos, vel, hdg, destPos, reserveTargetLb: null, active: true)` for dest leg fields.  
2. `rangeDestHomeM` = horizontal range dest→home.  
3. If destNav has fuel-on-arrival and nm/min from groundspeed > 0.01 and burn known: `fuelDestHome = (rangeDestHomeM / 1852) / nmPerMin * lbPerMin`; `fuelAfterHome = fuelOnArrivalDest - fuelDestHome`; `margin = fuelAfterHome - reserveTarget`.  
4. Else null the return-leg fuel fields (honesty).

- [ ] **Step 4: Re-run tests — expect PASS**

- [ ] **Step 5: Commit**

```bash
git add sim/MeshNav.cs sim.Tests/MeshNavTests.cs
git commit -m "$(cat <<'EOF'
Add MeshNav director with Open Segment selectability and reserve-on-return math.

EOF
)"
```

---

### Task 2: Free-fly Place catalog + beat Open Segment flag

**Files:**
- Create: `content/packs/ukraine-modern/environment/mesh/free-fly-places.v1.json`
- Create: `web/wwwroot/content/packs/ukraine-modern/environment/mesh/free-fly-places.v1.json` (byte-identical)
- Modify: `sim/Doctrine/Beats.cs` — add `bool OpenSegmentNav = false` to `BeatSetup`; set `true` on `RapierGoFly` and `RapierCircuits`
- Modify: `sim/SimulationSession.cs` — on StageBeat/StartBeat, `MeshNav.Configure(...)` with HomePlate from `RecoveryPlan` and catalog loaded for Open Segment beats
- Test: extend `MeshNavTests` or add `sim.Tests/MeshNavCatalogTests.cs` for JSON parse

**Interfaces:**
- Consumes: `MeshNavDirector.Configure`
- Produces: `MeshPlaceCatalog.Parse(string json)` → `IReadOnlyList<MeshPlace>`; session property `MeshNavDirector MeshNav { get; }`

Catalog v1 entries (theatre local metres; fictional Mesh IDs):

```json
{
  "schemaVersion": "1.0.0",
  "catalogId": "mesh-catalog.ukraine-modern.free-fly.v1",
  "places": [
    {
      "placeId": "place.ukraine.crimea-coast-survey.v1",
      "displayName": "Crimea coast survey",
      "eastM": -320000,
      "northM": -390000,
      "role": "destination"
    },
    {
      "placeId": "place.ukraine.soniachne-clinic-a.v1",
      "displayName": "Soniachne clinic A",
      "eastM": -4208,
      "northM": 4096,
      "upM": 212.5,
      "role": "destination"
    },
    {
      "placeId": "place.ukraine.dnipro-bend-survey.v1",
      "displayName": "Dnipro bend survey",
      "eastM": -180000,
      "northM": 40000,
      "role": "destination"
    },
    {
      "placeId": "place.ukraine.quiet-ridge-label.v1",
      "displayName": "Quiet ridge",
      "eastM": 25000,
      "northM": -15000,
      "role": "landmark"
    }
  ]
}
```

HomePlate is **not** duplicated in the catalog JSON; session injects it from `RecoveryPlan` into the director catalog on configure.

For MissionGated beats: catalog = HomePlate only (plus any future mission Places). Phase gate v1: `phaseAllows = true` always except when you already have a clear “no recovery yet” flag — use `Lifecycle == Active` as phaseAllows for Home; Open Segment destination selection allowed whenever Active.

Embed catalog JSON as a C# resource **or** load via `File.ReadAllText` from content pack path used by other Ukraine assets — follow whatever pattern `UkraineTerrainTruth.Load` uses. Prefer the existing pack-load pattern; if awkward in WASM, embed as `const string` in `MeshPlaceCatalog.cs` generated from the JSON at build time is acceptable for v1 **only if** wwwroot JSON remains the presentation SoT and stays byte-synced.

- [ ] **Step 1: Add failing catalog parse test**
- [ ] **Step 2: Add JSON files + parser + BeatSetup flag + session Configure on stage**
- [ ] **Step 3: Tests PASS**
- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
Wire free-fly Mesh catalog and Open Segment on Rapier go-fly/circuits.

EOF
)"
```

---

### Task 3: WebBridge commands + snapshot projection

**Files:**
- Modify: `web/WebBridge.cs`
- Modify: `web/SnapshotHotFrame.cs` (LayoutVersion 17; new doubles/bools/strings in cold or hot as appropriate)
- Modify: `web/SnapshotProjection.cs` (schema 1.22.0)
- Modify: both korea-1950s `pack.json` snapshotSchemaVersion pins
- Modify: any tests asserting layout 16 / 1.21.0
- Test: `sim.Tests` snapshot tests + new Mesh bridge behavior via session

**JSExport API:**

```csharp
[JSExport] public static bool SetMeshActivePlace(string placeId) =>
    Session.MeshNav.TrySelectPlace(placeId, phaseAllows: Session.Lifecycle == LifecycleState.Active);

[JSExport] public static bool SetMeshFreeFix(double eastM, double northM, string? label) =>
    Session.MeshNav.TrySetFreeFix(eastM, northM, label);

[JSExport] public static void ClearMeshActiveDest() =>
    Session.MeshNav.ClearActiveDestToHome();
```

**Snapshot fields (snake_case):**

| Field | Meaning |
| --- | --- |
| `mesh_transit_mode` | `"mission_gated"` \| `"open_segment"` |
| `mesh_home_place_id` / `mesh_home_display_name` | HomePlate |
| `mesh_home_east_m` / `mesh_home_north_m` | |
| `mesh_active_is_place` | bool |
| `mesh_active_place_id` | nullable string |
| `mesh_active_display_name` | |
| `mesh_active_east_m` / `mesh_active_north_m` | |
| `mesh_dest_range_nm` / `mesh_dest_bearing_deg` / `mesh_dest_turn_deg` | ActiveDest geometry |
| `mesh_dest_closure_kts` / `mesh_dest_eta_min` | honesty-gated |
| `mesh_fuel_to_dest_lb` / `mesh_fuel_on_arrival_dest_lb` | |
| `mesh_fuel_dest_to_home_lb` / `mesh_fuel_on_arrival_home_via_dest_lb` | |
| `mesh_reserve_margin_via_dest_lb` | reserve after dest→home |
| `mesh_place_catalog_json` | compact JSON array of visible places `{id,name,east,north,role,selectable}` for the map (cold / low-freq OK) |

Keep existing `rtb_*` / `fuel_to_home_*` as **HomePlate-direct** recovery projection (unchanged meaning). Nav console destination line switches to ActiveDest Mesh fields when ActiveDest is set; when ActiveDest is Home, Mesh dest fields may mirror RTB.

Default on StageBeat: ActiveDest = HomePlate (ClearActiveDestToHome).

- [ ] **Step 1: Failing snapshot test for new fields after SelectPlace**
- [ ] **Step 2: Implement bridge + projection + version bump**
- [ ] **Step 3: Tests PASS**
- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
Project Mesh ActiveDest and reserve-via-dest fuel on snapshot layout 17.

EOF
)"
```

---

### Task 4: Nav console presentation + fuel aboard prominence

**Files:**
- Create: `web/wwwroot/render/nav/mesh_nav_presentation.js`
- Create: `web/wwwroot/render/nav/package.json` (`{"type":"module"}`)
- Create: `web/wwwroot/render/nav/tests/mesh_nav_presentation.test.mjs`
- Modify: `web/wwwroot/app.js` — `updateNavConsole` uses Mesh presentation when `mesh_active_display_name` present; always show `fuel_lb` as Fuel aboard
- Modify: `web/wwwroot/index.html` — add labels for “Fuel to dest”, “Dest→home”, “Reserve via dest” if not mappable onto existing outputs; prefer remapping existing outputs:
  - Destination ← `mesh_active_display_name`
  - Bearing/Range/ETA/Turn ← mesh_dest_*
  - Fuel required ← `mesh_fuel_to_dest_lb`
  - On arrival ← `mesh_fuel_on_arrival_dest_lb`
  - Reserve margin ← `mesh_reserve_margin_via_dest_lb` (text `BELOW/ABOVE RES …`)
  - Keep Fuel aboard ← `fuel_lb` (ensure not hidden when console relevant)

When Mesh fields absent (old snapshots / non-Ukraine), fall back to existing `recoveryNavigationPresentation`.

- [ ] **Step 1: Failing presentation tests**
- [ ] **Step 2: Implement + wire app.js**
- [ ] **Step 3: `node --test web/wwwroot/render/nav/tests/` PASS**
- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
Bind nav console to Mesh ActiveDest solution and keep fuel aboard live.

EOF
)"
```

---

### Task 5: Moving map under `#nav-console`

**Files:**
- Create: `web/wwwroot/render/nav/mesh_nav_map.js`
- Create: `web/wwwroot/render/nav/tests/mesh_nav_map.test.mjs`
- Modify: `web/wwwroot/index.html` — `<canvas id="nav-mesh-map" …>` inside `#nav-console .tf-body` **above** indications (or directly under summary per “under the nav thing” — place map **below** the title/summary and **above** the numeric grid)
- Modify: `web/wwwroot/app.js` — init map; each nav update pass aircraft east/north from snapshot (`position` / theatre locals already used elsewhere — use same east/north as terrain placement); on click call bridge SetMeshActivePlace or SetMeshFreeFix

**Map behavior (v1):**
- Soft-world palette background (warm haze fill), not a second art bible.
- Draw Places as dots + short labels; HomePlate distinct; ActiveDest ring.
- Ownship triangle at aircraft east/north; map centred on aircraft with scale ~120 NM across (constant), north-up.
- Click nearest selectable Place within 8 px, else if `open_segment` create Free Fix at click lat/lon equivalent (east/north).
- Landmark clicks: no-op (optional one-line status later — skip v1).
- No Tour UI.

Pure functions to test: `worldToCanvas`, `canvasToWorld`, `hitTestPlace`.

- [ ] **Step 1: Failing map math tests**
- [ ] **Step 2: Implement canvas map + wire clicks through exported bridge wrappers already used in app.js for other JSExport calls**
- [ ] **Step 3: Tests PASS; `node --check web/wwwroot/app.js`**
- [ ] **Step 4: Commit**

```bash
git commit -m "$(cat <<'EOF'
Add clickable Mesh moving map under the navigation console.

EOF
)"
```

---

### Task 6: Stamp + gate + mark specs accepted

**Files:**
- Modify: release stamp files if production wwwroot changed (`release_identity.js`, `api/build-info.js`, `index.html` `?v=`, `service-worker.js`) — follow repo ritual
- Modify: spec/canon status lines → `accepted`
- Run focused then full check

- [ ] **Step 1: Bump release stamp for wwwroot changes**
- [ ] **Step 2: Mark canon + design spec status accepted**
- [ ] **Step 3: Run `./bin/check` (or document residual failures owned by other concurrent WIP)**
- [ ] **Step 4: Commit stamp + status**

```bash
git commit -m "$(cat <<'EOF'
Stamp Mesh nav map build and accept Routing Mesh geography specs.

EOF
)"
```

---

## Spec coverage check

| Spec requirement | Task |
| --- | --- |
| Place / Free Fix / HomePlate / ActiveDest | 1–2 |
| Roles + phase gates | 1 |
| Open Segment vs mission gated | 1–2 |
| Free-fly catalog + free click | 2, 5 |
| Reserve on return to HomePlate | 1, 3–4 |
| Fuel aboard first-class | 4 |
| Map under nav console | 5 |
| No scenery enrichment | deferred (explicit) |
| Hard Route stub only | deferred (explicit) |
| Tour multi-leg | deferred (YAGNI) |

## Follow-on plans (do not implement here)

1. Soft-world scenery richness on Place footprints  
2. Tour multi-leg UI  
3. Published Procedure / Hard Route following  
