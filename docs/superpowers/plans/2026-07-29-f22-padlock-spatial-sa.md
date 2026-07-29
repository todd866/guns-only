# F-22 Padlock Spatial SA Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the padlock lift director visible under Space, cue an energy/terrain preferred plane near dead six (cue only), and add Falcon-style F-22 canopy glass (mid-axis + mild pilot reflection).

**Architecture:** Split padlock **geometry publication** from **SAS eligibility** inside `PadlockRollAssist`. Add a pure `PadlockPreferredPlane` selector for near-six gates. Snapshot/hot-frame carries preferred-plane fields; HUD draws them with presentation capture independent of assist capture. A lightweight Three.js canopy group is F-22-only.

**Tech Stack:** C# kernel (`sim/`), hot-frame bridge (`web/SnapshotHotFrame.cs`), canvas HUD (`web/wwwroot/hud.js`), Three.js presentation (`web/wwwroot/render/presentation/`), xUnit + `node --test`.

## Global Constraints

- Presentation geometry ≠ control eligibility (Space yields SAS only).
- Preferred plane is **cue only** — never initiates the opening roll.
- Canopy glass is **F-22 only** (`aircraft.f22a.public-data-surrogate.v1`); Rapier asserts absent.
- Keep `PRODUCTION_AUTHORED_COCKPIT_ENABLED = false`.
- No new command text (`ROLL LEFT` / etc.).
- Hot-frame layout bump required when adding slots (`LayoutVersion` 17 → 18).
- Cold instruments stay projectively true; canopy must not occlude HUD symbology.

## File map

| File | Responsibility |
|---|---|
| `sim/PadlockRollAssist.cs` | Geometry always when selected+LOS; SAS only when eligible |
| `sim/PadlockPreferredPlane.cs` | Pure near-six energy/terrain gate selector |
| `sim.Tests/PadlockRollAssistTests.cs` | Override-stable geometry + preferred-plane unit cases |
| `sim.Tests/PadlockPreferredPlaneTests.cs` | Pure selector cases |
| `sim.Tests/PadlockRollAssistSessionTests.cs` | Space-held session geometry still valid |
| `web/SnapshotHotFrame.cs` | New preferred-plane slots; layout 18 |
| `web/SnapshotProjection.cs` | Mirror preferred-plane in cold JSON if other padlock fields live there |
| `sim.Tests/SnapshotHotFrameTests.cs` | Expect layout 18 + new slot names |
| `web/wwwroot/hud.js` | Presentation capture; preferred-plane director |
| `web/wwwroot/render/hud/tests/harness/scenarios.js` | Override + energy near-six scenarios |
| `web/wwwroot/render/presentation/f22_canopy_glass.js` | Centerline + reflection group |
| `web/wwwroot/render/presentation/tests/f22_canopy_glass.test.mjs` | F-22 vs Rapier visibility contract |
| `web/wwwroot/app.js` | Attach/update/visibility for canopy glass |
| `docs/hud-symbology-notes.md` | One short pointer to the new spec (optional, with Task 5) |

---

### Task 1: Override-stable padlock geometry

**Files:**
- Modify: `sim/PadlockRollAssist.cs`
- Modify: `sim.Tests/PadlockRollAssistTests.cs`
- Modify: `sim.Tests/PadlockRollAssistSessionTests.cs` (if Space path covered; else add)

**Interfaces:**
- Consumes: existing `Step(..., bool eligible, ...)`
- Produces: when `selected` and LOS finite, `State.GeometryValid == true` and `RollErrorRad` / `PlaneMagnitude` / `AnyPlane` populated even if `eligible == false`; `SasRollControl == 0`, `Active == false`, assist `Captured == false` when ineligible; `Command` bit-for-bit unchanged when ineligible

- [ ] **Step 1: Write the failing test**

In `PadlockRollAssistTests.cs`, add (and adjust `IneligiblePathIsBitForBitTransparentAndResetsCapture`):

```csharp
[Fact]
public void IneligibleStillPublishesGeometryAndZerosSas() {
    AircraftState aircraft = State();
    Vec3D target = TargetPosition(aircraft, 25.0);
    var assist = new PadlockRollAssist();
    Capture(assist, aircraft, TargetPosition(aircraft, 7.0));
    PilotCommand command = NeutralCommand(0.12) with {
        SasRollControl = -0.04,
        Rudder = 0.2,
        GDemand = 4.0
    };

    PadlockRollAssistResult result = Step(assist, aircraft, target,
        rawPilotRoll: 0.12, command: command, eligible: false);

    Assert.Equal(command, result.Command);
    Assert.True(result.State.Selected);
    Assert.True(result.State.GeometryValid);
    Assert.False(result.State.AnyPlane);
    Assert.False(result.State.Captured);
    Assert.False(result.State.Active);
    Assert.Equal(0.0, result.State.SasRollControl, 12);
    Assert.InRange(result.State.RollErrorRad,
        20.0 * DegreesToRadians, 30.0 * DegreesToRadians);
}
```

Update `IneligiblePathIsBitForBitTransparentAndResetsCapture` to also assert `GeometryValid` and finite `RollErrorRad` (keep command transparency + Captured/Active/SAS zero).

- [ ] **Step 2: Run test to verify it fails**

Run: `dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj --filter FullyQualifiedName~PadlockRollAssistTests.IneligibleStillPublishesGeometry -v n`

Expected: FAIL because ineligible path still `Reset()` → `GeometryValid == false`.

- [ ] **Step 3: Implement minimal geometry/eligibility split**

In `PadlockRollAssist.Step`:

1. Keep the hard reset only for `!selected`, `dt <= 0`, non-finite attitude/rates, or non-finite/zero LOS.
2. Always compute `planeMagnitude`, `rollError` / any-plane branch as today.
3. If `!eligible`: clear assist latches (`_captured`, dwell, rate filter, `_sasRollControl`), publish `GeometryValid` (true when off-axis or aft any-plane), `Captured: false`, `Active: false`, `SasRollControl: 0`, return **unmodified** `command`.
4. If `eligible`: existing capture + SAS path unchanged.

Do **not** add preferred-plane fields in this task.

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj --filter FullyQualifiedName~PadlockRollAssist -v n`

Expected: PASS (all padlock assist unit + session tests).

- [ ] **Step 5: Commit**

```bash
git add sim/PadlockRollAssist.cs sim.Tests/PadlockRollAssistTests.cs sim.Tests/PadlockRollAssistSessionTests.cs
git commit -m "$(cat <<'EOF'
Keep padlock lift-plane geometry publishing when SAS is ineligible.

EOF
)"
```

---

### Task 2: Energy/terrain preferred plane (kernel)

**Files:**
- Create: `sim/PadlockPreferredPlane.cs`
- Create: `sim.Tests/PadlockPreferredPlaneTests.cs`
- Modify: `sim/PadlockRollAssist.cs` (state fields + near-six call)
- Modify: `sim.Tests/PadlockRollAssistTests.cs` (`LongitudinalAxisNeverInventsAutomaticRoll` expectations)

**Interfaces:**
- Consumes: body attitude, airspeed m/s, corner speed m/s (or kias pair), radar altitude m, GCAS warning/active, plane magnitude, target forward, current body-up
- Produces:

```csharp
public readonly record struct PadlockPreferredPlaneResult(
    bool Valid,
    double GateRadFromLift, // 0 = pull current lift; same sign convention as RollErrorRad
    bool AnyPlaneFallback);

public static class PadlockPreferredPlane {
    public const double TerrainFloorM = 2000.0 * 0.3048; // 2000 ft AGL
    public const double EnergyCornerFraction = 0.85;
    public const double HysteresisSeconds = 0.25;
    // Vertical opening = gate within this of pure sky/dirt pull (±0 or ±π from skyward)
    public const double VerticalHalfWidthRad = 35.0 * Math.PI / 180.0;

    public static PadlockPreferredPlaneResult Select(
        in QuaternionD bodyAttitude,
        double trueAirspeedMps,
        double cornerSpeedMps,
        double radarAltitudeM,
        bool gcasWarningOrActive,
        double planeMagnitude,
        double targetForward,
        double previousGateRad,
        bool hadPrevious,
        double deltaSeconds);
}
```

Extend `PadlockRollAssistState` with `bool PreferredPlaneValid` and `double PreferredPlaneRad`. Default both inactive in `Inactive(...)`.

Wire `Select` only when `planeMagnitude < SingularPlaneMagnitude` and `targetForward < 0`. Pass TAS/corner/radar/GCAS into `Step` **or** compute preferred plane in `SimulationSession.ApplyBanditPadlockRollAssist` and merge into published state — prefer extending `Step` with an options struct to avoid signature sprawl:

```csharp
public readonly record struct PadlockRollAssistEnergy(
    double TrueAirspeedMps,
    double CornerSpeedMps,
    double RadarAltitudeM,
    bool GcasWarningOrActive);
```

Add overload or optional parameter `PadlockRollAssistEnergy? energy = null`. When `null`, near-six keeps legacy any-plane behaviour (tests that don't pass energy stay green). Session always passes energy.

**Selection algorithm (normative):**

```text
skywardGate = atan2(worldUp·bodyRight, worldUp·bodyUp)   // roll that puts lift on world-up
flatGate    = shortest ±(π/2) from current lift (0) toward horizontal lift
              // i.e. +π/2 or −π/2, pick smaller |angle|

terrainBlocksDown = radarAltitudeM < TerrainFloorM || gcasWarningOrActive
energyBlocksVertical = cornerSpeedMps > 1 && trueAirspeedMps < EnergyCornerFraction * cornerSpeedMps

candidates:
  - gate 0 (current lift) if not (terrainBlocksDown && pullAt(0) is more down than skyward)
    and not (energyBlocksVertical && |wrap(0 - skywardGate)| < VerticalHalfWidthRad
              && |wrap(flatGate - skywardGate)| > VerticalHalfWidthRad)
  - skywardGate if terrainBlocksDown (preferred when low)
  - flatGate if energyBlocksVertical

If no candidate survives → AnyPlaneFallback=true, Valid=false
If only one → Valid=true, Gate=that
If several → prefer skyward when terrainBlocksDown, else flat when energyBlocksVertical, else 0
Apply hysteresis: if hadPrevious && |wrap(gate - previous)| small change within dwell, keep previous
```

`pullAt(gate)` down-ness: world-Y of body-up rotated by `gate` about body-forward; more negative = more into ground.

- [ ] **Step 1: Write failing pure tests** in `PadlockPreferredPlaneTests.cs`:
  - High alt, on-corner speed, dead-six → Valid, Gate≈0, not any-plane fallback
  - Low radar alt, nose attitude that makes gate 0 earthward → prefers skywardGate
  - Slow vs corner, high alt → prefers flatGate (≈±90°), not pure vertical
  - Low + slow with both hemispheres bad → AnyPlaneFallback
  - Hysteresis holds gate across a small LOS wobble for `HysteresisSeconds`

- [ ] **Step 2: Run pure tests — expect FAIL** (type missing)

Run: `dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj --filter FullyQualifiedName~PadlockPreferredPlaneTests -v n`

- [ ] **Step 3: Implement `PadlockPreferredPlane.cs`**

- [ ] **Step 4: Wire into `PadlockRollAssist` + session**

Near-six branch: call selector; if `Valid`, set `PreferredPlaneValid=true`, `PreferredPlaneRad=Gate`, `AnyPlane=false`, `RollErrorRad=Gate` (so HUD gate works), `Captured=false`, `Active=false`, `Sas=0`. If fallback, keep today's any-plane presentation (`AnyPlane=true`, `PreferredPlaneValid=false`).

Update `LongitudinalAxisNeverInventsAutomaticRoll` for 180°: with energy passed (on-speed, high), expect `PreferredPlaneValid` and `!AnyPlane` and `Sas==0`; without energy arg, legacy any-plane still allowed for unit isolation.

Session: build `PadlockRollAssistEnergy` from player TAS, corner, radar alt, GCAS flags when calling Step.

- [ ] **Step 5: Run padlock tests — PASS**

Run: `dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj --filter FullyQualifiedName~Padlock -v n`

- [ ] **Step 6: Commit**

```bash
git add sim/PadlockPreferredPlane.cs sim/PadlockRollAssist.cs sim/SimulationSession.cs \
  sim.Tests/PadlockPreferredPlaneTests.cs sim.Tests/PadlockRollAssistTests.cs
git commit -m "$(cat <<'EOF'
Cue an energy and terrain preferred lift plane near dead six.

EOF
)"
```

---

### Task 3: Snapshot + HUD director

**Files:**
- Modify: `web/SnapshotHotFrame.cs` (layout 18; add after existing padlock slots)
- Modify: `sim.Tests/SnapshotHotFrameTests.cs` (+ `MeshNavSnapshotTests.cs` if it hardcodes 17)
- Modify: `web/SnapshotProjection.cs` if cold JSON exposes padlock assist fields
- Modify: `web/wwwroot/hud.js`
- Modify: `web/wwwroot/render/hud/tests/harness/scenarios.js` (+ assertions if needed)

**Hot-frame slots to add:**

```csharp
Bool("padlock_preferred_plane_valid");
Num("padlock_preferred_plane_deg", 3);
```

Writer:

```csharp
w.Bool("padlock_preferred_plane_valid", padlockRollAssist.PreferredPlaneValid);
w.Num("padlock_preferred_plane_deg",
    padlockRollAssist.PreferredPlaneRad * 57.29577951308232, 3);
```

Bump `LayoutVersion` to **18**. Update every test that asserts `layout_version == 17`.

**HUD steering construction** (`hud.js` ~2769):

```js
const kernelRollErrorDeg = Number(state.padlock_roll_error_deg);
const preferredValid = state.padlock_preferred_plane_valid === true;
const assistCaptured = state.padlock_roll_assist_captured === true;
const presentationCaptured = steeringAvailable && Number.isFinite(kernelRollErrorDeg)
  && Math.abs(kernelRollErrorDeg) * DEG <= 11 * DEG; // enter; retain with 18° via existing latch helper if present
// Prefer: geometry error within band OR assistCaptured; do not require assistCaptured under override
const captured = preferredValid
  ? presentationCaptured
  : (assistCaptured || presentationCaptured);
```

Exact retain hysteresis: mirror 11°/18° with `this._padlockLiftCaptured` already present — set captured true when `|error|<=11`, keep until `|error|>18`, **even when** `padlock_roll_assist_captured` is false.

When `preferredValid && anyPlane` would conflict: trust kernel (`any_plane` false when preferred valid per Task 2).

Director draw path already uses `rollErrorRad` for gate — with Task 2 writing preferred into `RollErrorRad`, chevrons work without a second code path. Still read `padlock_preferred_plane_*` in debug probes.

**Harness scenarios to add:**

```js
{
  name: "padlock-override-keeps-lift-director",
  about: "Envelope override held: lift tick + gate remain; assist may be inactive.",
  // padlock TRACK, bandit 40° right, state.requested_envelope_override or document via
  // padlock_roll_assist_geometry_valid true, padlock_roll_assist_active false,
  // padlock_roll_error_deg finite
},
{
  name: "padlock-dead-six-low-prefers-skyward",
  about: "Near six, low radar alt: preferred plane toward skyward, not neutral any-plane.",
  // state: padlock_preferred_plane_valid true, preferred deg near skyward, radar_alt_ft 900
},
{
  name: "padlock-dead-six-slow-prefers-flat",
  about: "Near six, slow vs corner: preferred gate near ±90°, not pure vertical.",
}
```

Update `padlock-bandit-dead-six` about-text if behaviour becomes preferred-gate-0 rather than any-plane ring.

- [ ] **Step 1: Failing hot-frame layout test** (expect 18 + new names)
- [ ] **Step 2: Implement hot-frame + projection**
- [ ] **Step 3: Failing HUD harness scenarios** (override keeps director; preferred cases)
- [ ] **Step 4: HUD presentation-capture + scenario state**
- [ ] **Step 5: Run**

```bash
dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj --filter FullyQualifiedName~SnapshotHotFrame -v n
node --test web/wwwroot/render/hud/tests/harness/*.mjs
# or the repo's documented harness entry — match existing padlock harness command
```

- [ ] **Step 6: Commit**

```bash
git add web/SnapshotHotFrame.cs web/SnapshotProjection.cs \
  sim.Tests/SnapshotHotFrameTests.cs sim.Tests/MeshNavSnapshotTests.cs \
  web/wwwroot/hud.js web/wwwroot/render/hud/tests/harness/scenarios.js
git commit -m "$(cat <<'EOF'
Publish preferred-plane cues and keep the padlock director under override.

EOF
)"
```

---

### Task 4: F-22 canopy glass (mid-axis + pilot reflection)

**Files:**
- Create: `web/wwwroot/render/presentation/f22_canopy_glass.js`
- Create: `web/wwwroot/render/presentation/tests/f22_canopy_glass.test.mjs`
- Modify: `web/wwwroot/render/presentation/index.js` (export)
- Modify: `web/wwwroot/app.js` (create, update pose, visibility)
- Modify: `web/wwwroot/render/visual/tests/production_graphics_wiring.test.mjs` if it freezes cockpit wiring contracts

**Interfaces:**

```js
export function isF22CanopyGlassAirframe(state) {
  return String(state?.player_aircraft_id || "")
    .includes("aircraft.f22a.public-data-surrogate");
}

export function createF22CanopyGlass(THREE) {
  // Returns { group, setVisible(bool), dispose() }
  // group: translucent dome/shell, mid-axis Line/Mesh along local +Z,
  //        soft pilot reflection Mesh (low opacity, double-sided)
}

export function updateF22CanopyGlass(glass, {
  position,      // player eye world position
  quaternion,    // player body attitude
  lookQuaternion,// camera quaternion — shifts reflection on glass
  visible,
}) { ... }
```

**Pose:** Parent `group` to `scene` (not camera). Each frame: copy player eye position + body quaternion so the shell is aircraft-fixed while padlock look moves the camera inside it. Mid-axis etch = dark/light thin strip along canopy centreline (body forward). Reflection = soft silhouette quad on the inner glass; offset its UV/position slightly from look azimuth so aft views still read “which way I’m facing.”

**Visibility:**

```js
visible = isF22CanopyGlassAirframe(state)
  && state.replay_external !== true
  && String(state.replay_camera || "CHASE") !== "CHASE"; // cockpit/padlock only
```

Never show for Rapier ids. Do not enable `PRODUCTION_AUTHORED_COCKPIT_ENABLED`.

**Material:** low opacity (~0.06–0.12 glass, ~0.08–0.15 reflection), no emissive glow chrome; depthWrite false; renderOrder below HUD canvas.

- [ ] **Step 1: Failing unit tests** — `isF22CanopyGlassAirframe` true/false; `createF22CanopyGlass` exposes centerline + reflection children; Rapier id → not visible contract helper
- [ ] **Step 2: Implement module**
- [ ] **Step 3: Wire into FlightView / app.js update loop** near cockpit head update
- [ ] **Step 4: Run**

```bash
node --test web/wwwroot/render/presentation/tests/f22_canopy_glass.test.mjs
node --test web/wwwroot/render/visual/tests/production_graphics_wiring.test.mjs
```

- [ ] **Step 5: Commit**

```bash
git add web/wwwroot/render/presentation/f22_canopy_glass.js \
  web/wwwroot/render/presentation/tests/f22_canopy_glass.test.mjs \
  web/wwwroot/render/presentation/index.js web/wwwroot/app.js \
  web/wwwroot/render/visual/tests/production_graphics_wiring.test.mjs
git commit -m "$(cat <<'EOF'
Add F-22 canopy mid-axis etch and mild pilot reflection.

EOF
)"
```

---

### Task 5: Verify + doc pointer

**Files:**
- Modify: `docs/hud-symbology-notes.md` — short “see also” link to `docs/superpowers/specs/2026-07-29-f22-padlock-spatial-sa-design.md` under the aft-hemisphere section

- [ ] **Step 1: Run focused verification**

```bash
dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj --filter FullyQualifiedName~Padlock -v n
dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj --filter FullyQualifiedName~SnapshotHotFrame -v n
node --test web/wwwroot/render/presentation/tests/f22_canopy_glass.test.mjs
node --test web/wwwroot/render/hud/tests/harness/*.mjs
```

- [ ] **Step 2: Run `./bin/check`** (or time-boxed subset then full gate before stamp)

Expected: green, or only pre-existing failures unrelated to this branch — do not stamp over new failures from these tasks.

- [ ] **Step 3: Commit doc pointer**

```bash
git add docs/hud-symbology-notes.md
git commit -m "$(cat <<'EOF'
Point HUD symbology notes at the F-22 padlock spatial SA spec.

EOF
)"
```

---

## Spec coverage

| Spec item | Task |
|---|---|
| Space yields SAS only; geometry stays | 1, 3 |
| Presentation capture without assist capture | 3 |
| Energy/terrain preferred plane, cue only | 2, 3 |
| Hysteresis / veto order | 2 |
| F-22 canopy mid-axis + reflection | 4 |
| Rapier canopy absent | 4 |
| Harness: override, preferred, F-22 vs Rapier | 3, 4, 5 |
| Rapier synthetic SA follow-up | Non-goal (documented in spec only) |

## Self-review notes

- No TBD placeholders; thresholds are named constants in Task 2.
- Layout 17→18 called out; MeshNav snapshot test included.
- Preferred plane written into `RollErrorRad` near six so Task 3 HUD changes stay small.
- Canopy is aircraft-fixed (not camera-parented) so padlock look still reads the glass.
