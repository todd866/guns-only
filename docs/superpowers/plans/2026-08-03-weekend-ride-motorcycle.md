# Weekend Ride (YZF-R1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a playable, physics-sourced Yamaha YZF-R1 free-ride on a painted circuit over the existing 3,048 m Rapier runway, with WASD bike controls, arrow-key weight shift, and a slightly head-stabilized helmet view.

**Architecture:** Dedicated motorcycle lane parallel to Cobra (not a fixed-wing hack). `YzfR1Dynamics` implements `IPlayerVehicleDynamics` with a new `MotorcyclePilot` command family. `WeekendRideMissionRuntime` owns Ready/Active/Paused/Finished lifecycle, painted-circuit scoring, and tip-over reset. `MotorcycleWebBridge` + a small `/weekend-ride/` web client render sim-authored snapshots. Front-door catalog entry starts as **preview** until the production gate in the spec clears; the picker tile may exist but must not claim finished product early.

**Tech Stack:** C# (.NET 8) `GunsOnly.Sim`, xUnit, Blazor WASM bridge (`[JSExport]`), existing `web/wwwroot` JS render stack. Spec: `docs/superpowers/specs/2026-08-03-weekend-ride-motorcycle-design.md`.

**Test invocation:**
`$HOME/.dotnet/dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~Motorcycle"`
Web smoke later via existing silent browser paths once the route exists.

## Global Constraints

- **Physics-correct, sourced R1:** every numeric claim is `measured` / `surrogate` / `provisional` with a sources file. No silent invented precision.
- **No fixed-wing aero helpers** for bike dynamics. Do not route motorcycle force through `AircraftSim` / `FlightModel`.
- **120 Hz fixed tick** via `PlayerVehicleContract.FixedStepHz` / `FixedDeltaSeconds`. No wall-clock authority in the kernel.
- **Presentation never invents** lean, traction, gear, or tip-over truth; camera head-stabilization is sim-authored.
- **Avoid `SimulationSession.cs` for v1** (contended; prefer new runtime files). Lifecycle *semantics* match Ready/Active/Paused/Finished.
- **Never `git add -A`.** Stage explicit paths. Commit only when the user asks (repo rule); plan “Commit” steps are optional checkpoints.
- **STATUS honesty:** catalog may list Weekend Ride; release state stays **preview** until automation + representative human ride clear the production bar.
- **Desktop keyboard is v1.** Phone controls deferred.
- **Runway geometry:** reuse Rapier strip datums — length `3048` m, width `48` m, centre `(0, RapierLaunchSite.OperatingSurfaceElevationM, 0)`, heading `-π/2` (west), from `Beats.RapierIntercept` / `RapierLaunchSite`.

## File structure

| File | Responsibility |
|---|---|
| `docs/vehicles/yamaha-yzf-r1/00-sources.md` | Epistemic sources bible |
| `docs/vehicles/yamaha-yzf-r1/README.md` | Vehicle profile index |
| `sim/Motorcycle/YzfR1Definition.cs` | Sourced constants + epistemic comments |
| `sim/Motorcycle/MotorcyclePilotCommand.cs` | Semantic bike command + clutch mode |
| `sim/Motorcycle/YzfR1Dynamics.cs` | 120 Hz rider/bike integrator |
| `sim/Motorcycle/MotorcycleTelemetry.cs` | Lean, loads, slip, RPM, gear, view attitude, pitch/knee assists |
| `sim/Motorcycle/RiderReflexAssists.cs` | Pitch-balance reflex + knee-down lean-hold (separate channels) |
| `sim/Motorcycle/PaintedCircuit.cs` | Polyline circuit on runway + lap/off-track |
| `sim/Motorcycle/WeekendRideMissionRuntime.cs` | Mission lifecycle, reset, timing |
| `sim/Vehicles/PlayerVehicleContracts.cs` | Add `Motorcycle` kind + command family |
| `sim.Tests/Motorcycle/*` | Golden paths + determinism |
| `web/MotorcycleWebBridge.cs` | JSExport facade |
| `web/wwwroot/weekend-ride/` | Client: controls, helmet HUD, camera |
| `web/wwwroot/render/progression/campaign_progression.js` | Catalog entry (preview) |
| `docs/STATUS.md` | Matrix row |
| `web/wwwroot/index.html` | Optional front-door tile (preview-gated) |

---

### Task 1: R1 sources bible + definition constants

**Files:**
- Create: `docs/vehicles/yamaha-yzf-r1/00-sources.md`
- Create: `docs/vehicles/yamaha-yzf-r1/README.md`
- Create: `sim/Motorcycle/YzfR1Definition.cs`
- Test: `sim.Tests/Motorcycle/YzfR1DefinitionTests.cs`

**Interfaces:**
- Produces: `YzfR1Definition` static constants consumed by dynamics and tests

- [ ] **Step 1: Write the failing test**

```csharp
namespace GunsOnly.Sim.Tests.Motorcycle;

public sealed class YzfR1DefinitionTests
{
    [Fact]
    public void BindsPublished2020R1Geometry()
    {
        Assert.Equal("yamaha-yzf-r1-2020", YzfR1Definition.VehicleId);
        Assert.Equal(203.2, YzfR1Definition.CurbMassKg, 3);
        Assert.Equal(1.405, YzfR1Definition.WheelbaseM, 3);
        Assert.Equal(24.0 * Math.PI / 180.0, YzfR1Definition.RakeRad, 6);
        Assert.Equal(0.102, YzfR1Definition.TrailM, 3);
        Assert.Equal(200.0 * 745.7, YzfR1Definition.PeakCrankPowerW, 0);
        Assert.Equal(13_500.0, YzfR1Definition.PeakPowerRpm, 0);
        Assert.Equal(6, YzfR1Definition.GearCount);
    }
}
```

- [ ] **Step 2: Run test — expect compile fail**

Run: `$HOME/.dotnet/dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~YzfR1DefinitionTests"`

Expected: type `YzfR1Definition` not found.

- [ ] **Step 3: Write sources + definition**

`00-sources.md` must cite Yamaha/public review figures for the **2020 YZF-R1** profile and label each constant. Use Motorcycle.com / Yamaha published curb weight 448 lb (203.2 kg), wheelbase 55.3 in (1.405 m), rake 24°, trail 4.0 in (102 mm), claimed 200 hp @ 13,500 rpm, 6-speed, suspension travel 119 mm. Mark inertias, tire Pacejka-like coefficients, and rider mass split as `surrogate` / `provisional` with validation targets.

```csharp
namespace GunsOnly.Sim.Motorcycle;

/// <summary>2020 Yamaha YZF-R1 sourced constants. See docs/vehicles/yamaha-yzf-r1/00-sources.md.</summary>
public static class YzfR1Definition
{
    public const string VehicleId = "yamaha-yzf-r1-2020";
    public const string DynamicsProviderId = "yzf-r1-single-track-v1";
    public const double CurbMassKg = 203.2;           // measured (OEM curb)
    public const double RiderMassKg = 80.0;           // provisional default rider
    public const double WheelbaseM = 1.405;           // measured
    public const double RakeRad = 24.0 * Math.PI / 180.0; // measured
    public const double TrailM = 0.102;               // measured
    public const double SeatHeightM = 0.856;          // measured
    public const double FrontSuspensionTravelM = 0.119;
    public const double RearSuspensionTravelM = 0.119;
    public const double PeakCrankPowerW = 200.0 * 745.7; // claimed crank hp → W
    public const double PeakPowerRpm = 13_500.0;
    public const int GearCount = 6;
    public const double RedlineRpm = 14_500.0;        // surrogate pending handbook
    // Additional fields (CG height, inertias, gear ratios, tire radii) as surrogate
    // with comments pointing at 00-sources.md — fill every field dynamics needs.
}
```

- [ ] **Step 4: Run test — expect pass**

- [ ] **Step 5: Commit** (only if user requested commits)

```bash
git add docs/vehicles/yamaha-yzf-r1/00-sources.md docs/vehicles/yamaha-yzf-r1/README.md \
  sim/Motorcycle/YzfR1Definition.cs sim.Tests/Motorcycle/YzfR1DefinitionTests.cs
git commit -m "Add sourced 2020 YZF-R1 vehicle constants for Weekend Ride."
```

---

### Task 2: Motorcycle command family on the player-vehicle seam

**Files:**
- Modify: `sim/Vehicles/PlayerVehicleContracts.cs`
- Create: `sim/Motorcycle/MotorcyclePilotCommand.cs`
- Test: `sim.Tests/Motorcycle/MotorcycleCommandContractTests.cs`

**Interfaces:**
- Consumes: `PlayerVehicleCommand`, `VehicleCommandFamily`, `PlayerVehicleKind`
- Produces: `MotorcyclePilotCommand`, `PlayerVehicleCommand.FromMotorcycle(...)`, `PlayerVehicleKind.Motorcycle`, `VehicleCommandFamily.MotorcyclePilot`

- [ ] **Step 1: Write the failing test**

```csharp
using GunsOnly.Sim.Motorcycle;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Motorcycle;

public sealed class MotorcycleCommandContractTests
{
    [Fact]
    public void FromMotorcycleSetsCommandFamily()
    {
        var cmd = new MotorcyclePilotCommand(
            Throttle: 0.4,
            Brake: 0.0,
            Steer: -0.2,
            RiderLateral: 0.5,
            RiderForeAft: -0.25,
            GearShiftRequest: 1,
            Clutch: 1.0,
            ClutchMode: MotorcycleClutchMode.Auto);
        PlayerVehicleCommand envelope = PlayerVehicleCommand.FromMotorcycle(cmd);
        Assert.Equal(VehicleCommandFamily.MotorcyclePilot, envelope.Family);
        Assert.Equal(0.4, envelope.Motorcycle.Throttle);
        Assert.Equal(MotorcycleClutchMode.Auto, envelope.Motorcycle.ClutchMode);
    }
}
```

- [ ] **Step 2: Run — expect fail/compile error**

- [ ] **Step 3: Extend contracts**

Add to enums:

```csharp
public enum PlayerVehicleKind {
    FixedWing,
    VerticalLift,
    Motorcycle
}

public enum VehicleCommandFamily {
    None,
    FixedWingPilot,
    VerticalLiftPilot,
    MotorcyclePilot
}
```

Add command + factory (keep existing constructors source-compatible by adding the new field with default at the end of `PlayerVehicleCommand`, or rebuild all `new PlayerVehicleCommand(...)` call sites — grep and update FixedWing/VerticalLift factories):

```csharp
namespace GunsOnly.Sim.Motorcycle;

public enum MotorcycleClutchMode { Auto, Manual }

public readonly record struct MotorcyclePilotCommand(
    double Throttle,       // 0..1
    double Brake,          // 0..1
    double Steer,          // -1..1 bar
    double RiderLateral,   // -1..1 (right positive)
    double RiderForeAft,   // -1..1 (forward positive)
    int GearShiftRequest,  // -1, 0, +1 per tick edge (runtime latches)
    double Clutch,         // 0 disengaged .. 1 engaged (Manual mode)
    MotorcycleClutchMode ClutchMode);
```

```csharp
// In PlayerVehicleCommand — add Motorcycle field; factories:
public static PlayerVehicleCommand FromMotorcycle(in MotorcyclePilotCommand command) =>
    new(VehicleCommandFamily.MotorcyclePilot, default, default, command);
```

Update `FromFixedWing` / `FromVerticalLift` to pass `default` motorcycle command.

- [ ] **Step 4: Run contract tests + existing vehicle tests that construct `PlayerVehicleCommand`**

Run: `$HOME/.dotnet/dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~Motorcycle|FullyQualifiedName~Ah1gCobra|FullyQualifiedName~PlayerVehicle"`

- [ ] **Step 5: Commit** (if requested)

---

### Task 3: Longitudinal dynamics on the runway plane

**Files:**
- Create: `sim/Motorcycle/MotorcycleTelemetry.cs`
- Create: `sim/Motorcycle/YzfR1Dynamics.cs` (skeleton: drive/brake, no lean yet)
- Test: `sim.Tests/Motorcycle/YzfR1LongitudinalTests.cs`

**Interfaces:**
- Consumes: `YzfR1Definition`, `MotorcyclePilotCommand`, `IPlayerVehicleDynamics`
- Produces: `YzfR1Dynamics.Advance` updating `PlayerVehicleState` on a horizontal surface

- [ ] **Step 1: Write the failing test**

```csharp
[Fact]
public void FullThrottleFromRestExceedsTwentyMpsWithinFiveSeconds()
{
    var bike = YzfR1Dynamics.AtRestOnRunway(
        id: "r1",
        position: new Vec3D(0.0, RapierLaunchSite.OperatingSurfaceElevationM, 0.0),
        headingRad: -Math.PI / 2.0);
    var cmd = new MotorcyclePilotCommand(1.0, 0.0, 0.0, 0.0, 0.0, 0, 1.0, MotorcycleClutchMode.Auto);
    for (long tick = 0; tick < 120 * 5; tick++)
        bike.Advance(YzfR1TestInput.Of(tick, cmd));
    Assert.True(bike.State.GroundVelocityMps.Length > 20.0,
        $"speed={bike.State.GroundVelocityMps.Length:F2}");
    Assert.Equal(VehicleContactKind.StableSurfaceContact, bike.State.Contact.Kind);
}
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement longitudinal skeleton**

`YzfR1Dynamics` implements `IPlayerVehicleDynamics`:

- Capability: `PlayerVehicleKind.Motorcycle`, `VehicleCommandFamily.MotorcyclePilot`, `VehicleContactAuthority.IntegratedSkidContact` (wheel contact owned here), fidelity disclosure naming single-track + sourced R1.
- Surface from `input.Environment.Surface` when known; else flat plane at spawn height with runway friction.
- First gear / auto-clutch simplified torque → rear longitudinal force; brake force split front/rear surrogate 70/30; integrate velocity on plane; keep wheels on surface (no flight yet).
- Telemetry exposes `SpeedMps`, `Rpm`, `Gear`, `Throttle`, `Brake`.

- [ ] **Step 4: Run longitudinal tests — pass**

- [ ] **Step 5: Commit** (if requested)

---

### Task 4: Steer + rider lateral CG → lean

**Files:**
- Modify: `sim/Motorcycle/YzfR1Dynamics.cs`
- Modify: `sim/Motorcycle/MotorcycleTelemetry.cs`
- Test: `sim.Tests/Motorcycle/YzfR1LeanTests.cs`

**Interfaces:**
- Produces: `Telemetry.LeanRad`, yaw rate from lean/steer, head-stabilized view quaternion

- [ ] **Step 1: Write the failing test**

```csharp
[Fact]
public void SustainedRightSteerAndWeightShiftProducesNegativeRollInBodyFrame()
{
    // Convention: body roll follows aircraft-style right-hand; document chosen sign in telemetry.
    var bike = YzfR1Dynamics.AtRestOnRunway("lean", ...);
    // accelerate to ~25 m/s first, then hold steer + lateral weight
    ...
    Assert.True(bike.Telemetry.LeanRad * Math.Sign(expected) > 0.15);
    Assert.True(Math.Abs(bike.Telemetry.ViewAttitude. ... roll ...) <
                Math.Abs(bike.Telemetry.LeanRad)); // head stabilization damps roll
}
```

Pick and document one lean sign convention in `MotorcycleTelemetry` XML docs; tests lock it.

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement single-track lean**

Minimum honest model for v1:

- States: planar position, yaw, lean φ, lean rate, wheel speeds.
- Steer δ from bar + trail/rake geometry contribution.
- Rider lateral offset shifts combined CG; steady turn approximates `v²/(ρ g) ≈ tan φ` with transient lag from roll inertia.
- Head-stabilized view: `viewRoll = lean * (1 - HeadStabilizationFraction)` with `HeadStabilizationFraction = 0.25` (provisional), yaw/pitch from chassis; publish as quaternion on telemetry.

- [ ] **Step 4: Pass lean tests**

- [ ] **Step 5: Commit** (if requested)

---

### Task 5: Suspension + braking load transfer

**Files:**
- Modify: `sim/Motorcycle/YzfR1Dynamics.cs`
- Test: `sim.Tests/Motorcycle/YzfR1LoadTransferTests.cs`

**Interfaces:**
- Produces: `Telemetry.FrontNormalForceN`, `RearNormalForceN`

- [ ] **Step 1: Failing test — hard braking increases front normal load**

```csharp
[Fact]
public void HardBrakingTransfersLoadToFrontContact()
{
    // bring to speed, sample cruise normals, then Brake=1 for 0.5 s
    Assert.True(brakeFrontN > cruiseFrontN + 200.0);
    Assert.True(brakeRearN < cruiseRearN);
}
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Add pitch suspension states**

Front/rear spring-damper within `FrontSuspensionTravelM` / `RearSuspensionTravelM`; static load from CG; longitudinal accel couples through CG height into normals. Fore/aft rider input shifts CG longitudinally.

- [ ] **Step 4: Pass**

- [ ] **Step 5: Commit** (if requested)

---

### Task 6: Tire grip envelope + tip-over

**Files:**
- Modify: `sim/Motorcycle/YzfR1Dynamics.cs`
- Test: `sim.Tests/Motorcycle/YzfR1TireAndTipOverTests.cs`

**Interfaces:**
- Produces: grip/slip summary; `Flyable=false` / tip-over flag; recoverable via runtime reset (Task 9)

- [ ] **Step 1: Failing tests**

```csharp
[Fact]
public void ExcessiveLeanAtLowSpeedTipsOver()
{
    // force large lean / lateral demand near walking speed
    Assert.True(bike.Telemetry.IsTippedOver);
    Assert.False(bike.State.Flyable);
}

[Fact]
public void CombinedSlipReducesAvailableLateralForce()
{
    // compare lateral force at brake=0 vs brake=0.9 at same lean demand
    Assert.True(latWithBrake < latCoast * 0.85);
}
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Friction-circle tire**

Surrogate µ(load) with combined slip limiter; when lean demand or lateral accel exceeds available friction, slide and/or tip. Tip-over latches `IsTippedOver` until reset. No scripted “fail animations” — latch follows dynamics.

- [ ] **Step 4: Pass**

- [ ] **Step 5: Commit** (if requested)

---

### Task 7: Sequential gearbox + auto/manual clutch

**Files:**
- Modify: `sim/Motorcycle/YzfR1Dynamics.cs`
- Modify: `sim/Motorcycle/YzfR1Definition.cs` (gear ratios surrogate table)
- Test: `sim.Tests/Motorcycle/YzfR1PowertrainTests.cs`

**Interfaces:**
- Consumes: `GearShiftRequest`, `ClutchMode`, `Clutch`
- Produces: gear 1..6, RPM, clutch engagement

- [ ] **Step 1: Failing tests**

```csharp
[Fact]
public void AutoClutchUpshiftRaisesGearAndDropsRpm() { ... }

[Fact]
public void ManualClutchBlocksDriveWhenDisengaged()
{
    var cmd = new MotorcyclePilotCommand(1.0, 0, 0, 0, 0, 0, Clutch: 0.0, MotorcycleClutchMode.Manual);
    // after 2 s still near rest
    Assert.True(bike.State.GroundVelocityMps.Length < 2.0);
}
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implement powertrain**

- 6 ratios + final drive (surrogate table documented in sources).
- Auto: ignore clutch axis; engage for launch; allow shifts when RPM in window.
- Manual: engine torque × clutch engagement; stall if clutch dumps at low RPM (simple threshold).
- Rev limiter at `RedlineRpm`.

- [ ] **Step 4: Pass**

- [ ] **Step 5: Commit** (if requested)

---

### Task 8: Pitch-balance reflex + knee-down lean-hold (separate channels)

**Files:**
- Create: `sim/Motorcycle/RiderReflexAssists.cs`
- Modify: `sim/Motorcycle/YzfR1Dynamics.cs`
- Modify: `sim/Motorcycle/MotorcycleTelemetry.cs`
- Test: `sim.Tests/Motorcycle/RiderReflexAssistTests.cs`

**Interfaces:**
- Consumes: pitch / normal loads, lean, rider lateral offset
- Produces: `WheelieBalance`, `StoppieBalance` in (−1..+1), `PitchReflexAuthority`, `KneeDown`, `LeanHoldAuthority`

These channels must not share state machines. Wheelie/stoppie are pitch/load. Knee-down is cornering (lean + weight shift) only.

- [ ] **Step 1: Write the failing tests**

```csharp
[Fact]
public void PitchReflexPeaksNearWheelieBalanceAndIsIdleWhenBothWheelsLoaded()
{
    // Build a state near rear-only contact vs a cruise state with both normals high.
    Assert.InRange(nearBalance.PitchReflexAuthority, 0.4, 1.0);
    Assert.Equal(0.0, cruise.PitchReflexAuthority, 3);
}

[Fact]
public void KneeDownRequiresHighLeanAndLateralWeightShiftNotPitch()
{
    var pitchedUpright = /* wheelie-ish pitch, lean≈0, rider lateral≈0 */;
    Assert.False(pitchedUpright.KneeDown);

    var carved = /* lean > threshold, rider lateral toward inside, both wheels down */;
    Assert.True(carved.KneeDown);
    Assert.True(carved.LeanHoldAuthority > carvedWithoutKnee.LeanHoldAuthority);
}
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement assists**

```csharp
public readonly record struct RiderReflexSample(
    double WheelieBalance,   // -1 far / 0 approaching / +1 at-or-past rear balance
    double StoppieBalance,   // same for front
    double PitchReflexAuthority, // 0..1 damping scale applied to pitch rate
    bool KneeDown,
    double KneeProximity,    // 0..1 how close knee is to pavement
    double LeanHoldAuthority);

public static class RiderReflexAssists
{
    public static RiderReflexSample Evaluate(
        double frontNormalN,
        double rearNormalN,
        double pitchRateRadps,
        double leanRad,
        double riderLateral,
        bool previousKneeDown);
}
```

- Pitch reflex: map unloaded-contact proximity to a balance band; apply `pitchRate *= (1 - k * authority)` inside dynamics (document `k`).
- Knee-down: latch when `|lean|` and inside-direction `|riderLateral|` exceed thresholds and pavement knee gap (from lean geometry) is small; hysteresis on exit; raise roll-rate damping only while latched.
- Publish all fields on telemetry for HUD.

- [ ] **Step 4: Pass tests**

- [ ] **Step 5: Commit** (if requested)

---

### Task 9: Painted circuit on the Rapier strip

**Files:**
- Create: `sim/Motorcycle/PaintedCircuit.cs`
- Test: `sim.Tests/Motorcycle/PaintedCircuitTests.cs`

**Interfaces:**
- Produces: `PaintedCircuit.RapierStripWeekend()` with centreline polyline, width, start/finish, sector gates; `Query(position) → onTrack, progressM, lapIndex events`

- [ ] **Step 1: Failing test**

```csharp
[Fact]
public void RapierStripCircuitFitsInside3048By48Pavement()
{
    var circuit = PaintedCircuit.RapierStripWeekend();
    Assert.True(circuit.BoundingLengthM <= 3048.0);
    Assert.True(circuit.BoundingWidthM <= 48.0);
    foreach (var p in circuit.Centreline)
        Assert.InRange(p.Y, RapierLaunchSite.OperatingSurfaceElevationM - 0.01,
            RapierLaunchSite.OperatingSurfaceElevationM + 0.01);
}
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Author polyline**

Use runway frame: centre along heading `-π/2`, width 48 m. Paint a closed circuit with long straights on the strip and esses/hairpin/chicanes that stay on pavement. Publish points for HUD map. Track paint does not change surface friction in v1.

- [ ] **Step 4: Pass + progress/lap crossing unit test**

- [ ] **Step 5: Commit** (if requested)

---

### Task 10: WeekendRideMissionRuntime

**Files:**
- Create: `sim/Motorcycle/WeekendRideMissionRuntime.cs`
- Test: `sim.Tests/Motorcycle/WeekendRideMissionRuntimeTests.cs`

**Interfaces:**
- Consumes: `YzfR1Dynamics`, `PaintedCircuit`, `MotorcyclePilotCommand`
- Produces: lifecycle, lap timing, off-track time, `ResetToGrid()` after tip-over

- [ ] **Step 1: Failing tests**

```csharp
[Fact]
public void BeginThenStepIsDeterministic()
{
    var a = WeekendRideMissionRuntime.CreateDefault();
    var b = WeekendRideMissionRuntime.CreateDefault();
    a.Begin(); b.Begin();
    var cmd = /* steady throttle */;
    for (int i = 0; i < 600; i++) { a.StepFixed(cmd); b.StepFixed(cmd); }
    Assert.Equal(a.Bike.State, b.Bike.State);
}

[Fact]
public void TipOverResetReturnsToGrid()
{
    var runtime = WeekendRideMissionRuntime.CreateDefault();
    runtime.Begin();
    runtime.DebugForceTipOver();
    runtime.ResetToGrid();
    Assert.False(runtime.Bike.Telemetry.IsTippedOver);
    Assert.Equal(runtime.GridPosition, runtime.Bike.State.PositionWorldM);
}
```

- [ ] **Step 2: Run — fail**

- [ ] **Step 3: Implement runtime**

```csharp
public enum WeekendRidePhase { Ready, Active, Paused, Finished }

public sealed class WeekendRideMissionRuntime
{
    public WeekendRidePhase Phase { get; private set; }
    public YzfR1Dynamics Bike { get; }
    public PaintedCircuit Circuit { get; }
    public Vec3D GridPosition { get; }
    public double LapTimeSeconds { get; }
    public int LapCount { get; }
    public double OffTrackSeconds { get; }

    public static WeekendRideMissionRuntime CreateDefault() { ... }
    public void Begin() { ... }
    public void Pause() { ... }
    public void Resume() { ... }
    public void Finish() { ... }
    public void StepFixed(in MotorcyclePilotCommand command) { ... }
    public void ResetToGrid() { ... }
    public WeekendRideSnapshot Snapshot() { ... } // values for bridge JSON
}
```

Grid: near threshold of Rapier strip, heading down the runway. Surface sample = horizontal runway at operating elevation.

- [ ] **Step 4: Pass**

- [ ] **Step 5: Commit** (if requested)

---

### Task 11: MotorcycleWebBridge + snapshot JSON

**Files:**
- Create: `web/MotorcycleWebBridge.cs`
- Test: `sim.Tests/Motorcycle/WeekendRideSnapshotTests.cs` (pure snapshot builder in `sim/Motorcycle/WeekendRideSnapshot.cs` if that keeps web free of tests; bridge only serializes)

**Interfaces:**
- Produces: JSON keys — `px,py,pz`, `vx,vy,vz`, `lean_rad`, `view_qw,view_qx,view_qy,view_qz`, `rider_lateral`, `rider_fore_aft`, `gear`, `clutch_mode`, `clutch`, `rpm`, `throttle`, `brake`, `front_normal_n`, `rear_normal_n`, `slip_front`, `slip_rear`, `wheelie_balance`, `stoppie_balance`, `pitch_reflex`, `knee_down`, `knee_proximity`, `lean_hold`, `lap`, `lap_time_s`, `off_track_s`, `tipped`, `phase`, `circuit` polyline for map

- [ ] **Step 1: Failing test on snapshot DTO in sim**

```csharp
[Fact]
public void SnapshotIncludesLeanAndHeadStabilizedView()
{
    var runtime = WeekendRideMissionRuntime.CreateDefault();
    runtime.Begin();
    // step with lean demand...
    var snap = runtime.Snapshot();
    Assert.True(Math.Abs(snap.LeanRad) > 0.0);
    Assert.True(Math.Abs(snap.ViewRollRad) < Math.Abs(snap.LeanRad));
}
```

- [ ] **Step 2: Implement `WeekendRideSnapshot` + bridge**

Mirror `CobraWebBridge` patterns: `Start()`, `SetControls(...)`, `SetClutchMode(int)`, `FeedShift(int)`, `Advance(double dt)`, `GetState(): string`, pause/reset exports. Clamp all inputs. Accumulator at 120 Hz with max frame delta 0.1 s.

- [ ] **Step 3: Ensure `web/GunsOnly.Web.csproj` compiles the new bridge (same pattern as Cobra)**

- [ ] **Step 4: Pass tests + `dotnet build web/GunsOnly.Web.csproj`

- [ ] **Step 5: Commit** (if requested)

---

### Task 12: Helmet HUD + keyboard client

**Files:**
- Create: `web/wwwroot/weekend-ride/index.html`
- Create: `web/wwwroot/weekend-ride/main.js`
- Create: `web/wwwroot/weekend-ride/styles.css`
- Create: `web/wwwroot/render/motorcycle/helmet_hud.js` (or inline if tiny)
- Modify: preview acknowledgement pattern from `cobra-lab` as needed

**Interfaces:**
- Consumes: bridge `GetState()` JSON
- Produces: first-person view using `view_*` quaternion; HUD numerals for speed, RPM/shift lights, gear, lean, throttle/brake, clutch mode, track map, pitch-balance tape, knee-down cue

- [ ] **Step 1: Keyboard map in `main.js`**

| Key | Command field |
|---|---|
| W / S | throttle / brake |
| A / D | steer |
| Arrows | rider lateral / fore-aft |
| Q / E | gear shift request edges |
| Left Shift | clutch axis when Manual |
| C | toggle Auto/Manual clutch mode |
| R | reset to grid |
| Esc | pause/resume |

- [ ] **Step 2: Camera**

Build view matrix from snapshot `view_*` quaternion + position; do **not** apply extra roll in JS. Horizon banks with sim view attitude.

- [ ] **Step 3: HUD**

Canvas/DOM overlay:

- speed (km/h or kt—pick one and label), RPM bar + redline, gear, lean degrees, throttle/brake bars, clutch mode, mini map from `circuit` + ownship;
- **pitch-balance tape** from `wheelie_balance` / `stoppie_balance` with a visible band where `pitch_reflex > 0`;
- **knee-down cue** only when `knee_down` is true (cornering), scaled by `knee_proximity` / `lean_hold` — never shown from pitch/wheelie state alone.

No gun funnel / padlock.

- [ ] **Step 4: Manual smoke**

Serve publish or local wasm; verify lean banks horizon; tip-over + R reset works; balance tape moves on wheelie/stoppie; knee cue appears only in a deep coordinated carve.

- [ ] **Step 5: Commit** (if requested)

---

### Task 13: Catalog, STATUS, and promotion gate (preview first)

**Files:**
- Modify: `web/wwwroot/render/progression/campaign_progression.js`
- Modify: `docs/STATUS.md`
- Modify: `web/wwwroot/index.html` (tile with preview acknowledgement)
- Optional: `README.md` controls blurb only after promotion

**Interfaces:**
- Produces: experience id `weekend-ride`, `route: "/weekend-ride/"`, release state **preview** until gate

- [ ] **Step 1: Add catalog entry as preview**

```js
"weekend-ride": {
  title: "YZF-R1 · Weekend Ride",
  route: "/weekend-ride/",
  mission: null,
  // release state: preview
}
```

- [ ] **Step 2: STATUS row**

Document: preview; automation golden paths; missing representative human ride for production.

- [ ] **Step 3: Front-door tile**

Visible only with the same preview acknowledgement pattern used by other non-production experiences—or clearly labelled preview. Do **not** set `EXPERIENCE_RELEASE_STATE` to production in this task.

- [ ] **Step 4: Acceptance checklist (human)**

Record in STATUS when done:

1. Straight acceleration feels geared and revs correctly  
2. Helmet view banks hard but remains readable  
3. Weight shift materially changes turn-in  
4. Tip-over + reset works  
5. Full painted lap completable without leaving pavement intentionally  
6. Wheelie/stoppie balance tape reads near the hold point; reflex is subtle  
7. Knee-down cue only in a deep carve with weight shift; lean feels steadier when latched  

- [ ] **Step 5: Commit** (if requested)

---

## Spec coverage self-review

| Spec requirement | Task |
|---|---|
| Dedicated `sim/Motorcycle/` lane | 3–10 |
| `docs/vehicles/yamaha-yzf-r1/` sources | 1 |
| WASD bike / arrows rider / Q-E gears / Shift clutch | 2, 7, 12 |
| Auto + manual clutch modes | 7, 12 |
| Head-stabilized FP helmet cam | 4, 11, 12 |
| Full rider/bike: chassis, rider CG, suspension, tires, powertrain | 3–7 |
| Pitch-balance reflex + HUD tape (wheelie/stoppie) | 8, 11, 12 |
| Knee-down lean-hold + cue (cornering only) | 8, 11, 12 |
| Painted circuit on 3048 m runway | 9–10 |
| Soft outcomes, grid reset | 10 |
| Helmet HUD instruments | 12 |
| Snapshot fields | 11 |
| Determinism + golden path tests | 3–10 |
| Production picker only after gate | 13 (preview first) |
| No phone v1 / no combat | Global + non-goals |

## Placeholder / consistency notes

- Lean sign convention is locked in Task 4 tests and telemetry docs.
- `PlayerVehicleCommand` construction sites must all be updated when the motorcycle field is added (Task 2).
- Gear ratios and tire µ are surrogate until handbook rows land—Task 1 sources file must say so.
- v1 uses a dedicated runtime (Cobra-like), not `SimulationSession`, to avoid merge collisions; lifecycle names stay aligned with the spec.
