# Guns Only — M0 "Grammar Slice" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A playable slice — fly a placeholder-but-energy-honest jet over a flat sea against a scripted bandit through the full doctrine-detent keyboard grammar (both valley-depth variants), with padlock/gun view states, stick indicator, and suggestion prompts — plus the four hardware spikes, ending at the M0 feel gate.

**Architecture:** Pure C# float64 sim kernel (`sim/` classlib, zero Godot references, tested headless via `dotnet test`) containing the flight model, integrator, key grammar, detent layer, canned doctrine laws, camera solver, and prompt logic. A thin C# `SimBridge` Godot node steps the kernel at 120 Hz and exposes state; GDScript owns scenes, input forwarding, camera rig, and HUD rendering. The scripted bandit flies the same kernel from a command timeline — proving the "AI uses the player's model through the player's control layer" architecture in miniature.

**Tech Stack:** Godot 4.7.x .NET edition (macOS, Apple Silicon), .NET SDK 8+, xUnit, GDScript for scenes/UI.

## Global Constraints (from spec — every task inherits these)

- Godot **4.7.x .NET edition**; game runs on the user's MacBook (Apple Silicon), trackpad + built-in keyboard only.
- Sim kernel: **float64 end-to-end, no Godot types in `sim/`**, fixed-timestep RK4 at **120 Hz**, deterministic (no wall clock, no unseeded RNG in sim).
- Sim world frame: **X = east, Y = up, Z = north**; heading χ = 0 at north, positive toward east. Bridge maps sim (x,y,z) → Godot (x, y, −z).
- Controls: arrows = pull/unload + roll, W/S throttle, A/D rudder, F trigger (dry in M0), Space padlock, K knock-it-off, R restart, F1 valley-variant toggle, 1/2/3 beat select. **No mandatory chord exceeds 3 keys.**
- All tap/hold semantics from the game's own timers on raw events; OS key-repeat echoes filtered.
- Both valley-depth variants (A doctrine-deep / B physics-only) behind the F1 toggle.
- G vocabulary (spec §7): valley G ≤ max-perform G (protection boundary) ≤ aero/structural max. Placeholder tiers: protection = min(0.92·nzAero, 6.0); hard max = min(nzAero, 7.33).
- Commit after every green test cycle. Placeholder flight-model numbers are labeled `PLACEHOLDER` in code comments — M1 replaces them; the *shape* (induced-drag energy bleed, corner speed, buffet band) is the deliverable.

**Execution note:** Tasks 1–8 are pure-kernel and need only `dotnet test` (no Godot). Tasks 9–14 touch Godot scenes; visual steps say exactly what to look at. Task 13 (chord test) needs the user's hands for 5 minutes.

---

### Task 0: Environment + project skeleton

**Files:**
- Create: `bin/godot` (wrapper script), `.gitignore`, `project.godot` (via editor), `GunsOnly.sln`, `GunsOnly.csproj` (via Godot), `sim/GunsOnly.Sim.csproj`, `sim.Tests/GunsOnly.Sim.Tests.csproj`, `sim/Placeholder.cs`, `sim.Tests/PlaceholderTests.cs`

**Interfaces:**
- Produces: working `dotnet test` cycle; `bin/godot` runs the 4.7 .NET editor/game; `GunsOnly.csproj` references `sim/GunsOnly.Sim.csproj`.

- [ ] **Step 1: Install toolchain** (Godot on this machine is 4.5.1 standard — wrong build)

```bash
brew install --cask dotnet-sdk
brew install --cask godot-mono   # installs /Applications/Godot_mono.app (4.7.x .NET)
dotnet --version                  # expect 8.x or 9.x
/Applications/Godot_mono.app/Contents/MacOS/Godot --version   # expect 4.7.x.stable.mono
```
If `godot-mono` delivers < 4.7, run `brew upgrade --cask godot-mono` first; do not proceed on 4.6 or lower.

- [ ] **Step 2: Repo-local wrapper + .gitignore**

`bin/godot`:
```bash
#!/bin/sh
exec /Applications/Godot_mono.app/Contents/MacOS/Godot "$@"
```
```bash
chmod +x bin/godot
```
`.gitignore`:
```
.godot/
.DS_Store
bin/obj-*
**/obj/
**/bin/Debug/
**/bin/Release/
*.tsbuildinfo
```
(Note: repo `bin/` holds the wrapper; C# build output dirs are `**/obj`, `**/bin/Debug|Release` — both ignored, wrapper is not.)

- [ ] **Step 3: Create the Godot project**

Run `bin/godot --path . -e --headless --quit` after writing a minimal `project.godot`:
```ini
; project.godot
config_version=5

[application]
config/name="Guns Only"
config/features=PackedStringArray("4.7", "C#", "Forward Plus")
run/main_scene="res://game/main.tscn"

[dotnet]
project/assembly_name="GunsOnly"

[physics]
common/physics_ticks_per_second=60

[rendering]
renderer/rendering_method="forward_plus"
```
(`game/main.tscn` arrives in Task 10; until then run tests, not the game.)

- [ ] **Step 4: Solution + projects**

```bash
dotnet new sln -n GunsOnly
dotnet new classlib -o sim -n GunsOnly.Sim -f net8.0
rm sim/Class1.cs
dotnet new xunit -o sim.Tests -n GunsOnly.Sim.Tests -f net8.0
dotnet sln add sim/GunsOnly.Sim.csproj sim.Tests/GunsOnly.Sim.Tests.csproj
dotnet add sim.Tests/GunsOnly.Sim.Tests.csproj reference sim/GunsOnly.Sim.csproj
```
`GunsOnly.csproj` (the Godot-generated game project — create it now so the reference exists; Godot regenerates/uses it when C# is first built):
```xml
<Project Sdk="Godot.NET.Sdk/4.7.0">
  <PropertyGroup>
    <TargetFramework>net8.0</TargetFramework>
    <EnableDynamicLoading>true</EnableDynamicLoading>
    <RootNamespace>GunsOnly</RootNamespace>
  </PropertyGroup>
  <ItemGroup>
    <ProjectReference Include="sim/GunsOnly.Sim.csproj" />
  </ItemGroup>
</Project>
```
```bash
dotnet sln add GunsOnly.csproj
```
(If the installed Godot is 4.7.1, set the Sdk version to match what `bin/godot` reports.)

- [ ] **Step 5: Prove the test cycle** — `sim/Placeholder.cs`:
```csharp
namespace GunsOnly.Sim;
public static class Placeholder { public static int Two() => 2; }
```
`sim.Tests/PlaceholderTests.cs`:
```csharp
using GunsOnly.Sim;
using Xunit;
public class PlaceholderTests { [Fact] public void TwoIsTwo() => Assert.Equal(2, Placeholder.Two()); }
```
Run: `dotnet test` → expect `Passed! - 1 test`.

- [ ] **Step 6: Commit**
```bash
git add -A && git commit -m "chore: Godot 4.7 .NET project skeleton + sim classlib + test cycle"
```

---

### Task 1: Kernel foundations — Vec3D, Atmosphere, AircraftState

**Files:**
- Create: `sim/Vec3D.cs`, `sim/Atmosphere.cs`, `sim/AircraftState.cs`
- Test: `sim.Tests/Vec3DTests.cs`, `sim.Tests/AtmosphereTests.cs`
- Delete: `sim/Placeholder.cs`, `sim.Tests/PlaceholderTests.cs`

**Interfaces:**
- Produces: `Vec3D(double X, double Y, double Z)` with `+ - * Dot Cross Length Normalized()`; `Atmosphere.Density(double altM)`, `Atmosphere.SpeedOfSound(double altM)`; `AircraftState` record struct `(Vec3D Position, double Speed, double Gamma, double Chi, double Bank, double Mass)` plus `Vec3D VelocityVector()` and `Vec3D ForwardDir()`.

- [ ] **Step 1: Failing tests** — `sim.Tests/Vec3DTests.cs`:
```csharp
using GunsOnly.Sim; using Xunit;
public class Vec3DTests {
    [Fact] public void CrossOfUnitXAndUnitYIsUnitZ() {
        var c = new Vec3D(1,0,0).Cross(new Vec3D(0,1,0));
        Assert.Equal(0, c.X, 12); Assert.Equal(0, c.Y, 12); Assert.Equal(1, c.Z, 12);
    }
    [Fact] public void NormalizedHasLengthOne() {
        Assert.Equal(1.0, new Vec3D(3,4,12).Normalized().Length, 12);
    }
    [Fact] public void DotOfOrthogonalIsZero() {
        Assert.Equal(0.0, new Vec3D(1,0,0).Dot(new Vec3D(0,5,0)), 12);
    }
}
```
`sim.Tests/AtmosphereTests.cs`:
```csharp
using GunsOnly.Sim; using Xunit;
public class AtmosphereTests {
    [Fact] public void SeaLevelDensityIsISA() => Assert.Equal(1.225, Atmosphere.Density(0), 3);
    [Fact] public void DensityFallsWithAltitude() => Assert.True(Atmosphere.Density(6000) < 0.7 * Atmosphere.Density(0));
    [Fact] public void SeaLevelSpeedOfSound() => Assert.InRange(Atmosphere.SpeedOfSound(0), 335, 345);
    [Fact] public void VelocityVectorMatchesHeadingConvention() {
        // chi=0 => north(+Z); chi=pi/2 => east(+X); gamma>0 => climbing(+Y)
        var s = new AircraftState(Vec3D.Zero, 100, 0, 0, 0, 5000);
        var v = s.VelocityVector();
        Assert.Equal(100, v.Z, 9); Assert.Equal(0, v.X, 9);
        var e = s with { Chi = System.Math.PI/2 };
        Assert.Equal(100, e.VelocityVector().X, 9);
    }
}
```

- [ ] **Step 2: Run to verify failure** — `dotnet test` → FAIL (types not defined).

- [ ] **Step 3: Implement** — `sim/Vec3D.cs`:
```csharp
namespace GunsOnly.Sim;
public readonly record struct Vec3D(double X, double Y, double Z) {
    public static Vec3D Zero => new(0, 0, 0);
    public static Vec3D operator +(Vec3D a, Vec3D b) => new(a.X+b.X, a.Y+b.Y, a.Z+b.Z);
    public static Vec3D operator -(Vec3D a, Vec3D b) => new(a.X-b.X, a.Y-b.Y, a.Z-b.Z);
    public static Vec3D operator *(Vec3D a, double s) => new(a.X*s, a.Y*s, a.Z*s);
    public double Dot(Vec3D b) => X*b.X + Y*b.Y + Z*b.Z;
    public Vec3D Cross(Vec3D b) => new(Y*b.Z - Z*b.Y, Z*b.X - X*b.Z, X*b.Y - Y*b.X);
    public double Length => System.Math.Sqrt(Dot(this));
    public Vec3D Normalized() { var l = Length; return l < 1e-12 ? Zero : this * (1.0/l); }
}
```
`sim/Atmosphere.cs`:
```csharp
namespace GunsOnly.Sim;
public static class Atmosphere {
    // ISA troposphere, simplified. PLACEHOLDER fidelity is fine for M0.
    public static double Density(double altM) {
        double t = 288.15 - 0.0065 * altM;
        double p = 101325.0 * System.Math.Pow(t / 288.15, 5.2561);
        return p / (287.05 * t);
    }
    public static double SpeedOfSound(double altM) {
        double t = 288.15 - 0.0065 * altM;
        return System.Math.Sqrt(1.4 * 287.05 * t);
    }
}
```
`sim/AircraftState.cs`:
```csharp
namespace GunsOnly.Sim;
/// World frame: X east, Y up, Z north. Chi: 0 = north, positive toward east. Angles in radians, SI units.
public record struct AircraftState(Vec3D Position, double Speed, double Gamma, double Chi, double Bank, double Mass) {
    public Vec3D VelocityVector() => ForwardDir() * Speed;
    public Vec3D ForwardDir() => new(
        System.Math.Sin(Chi) * System.Math.Cos(Gamma),
        System.Math.Sin(Gamma),
        System.Math.Cos(Chi) * System.Math.Cos(Gamma));
}
```

- [ ] **Step 4: Run** — `dotnet test` → all PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(sim): Vec3D, ISA atmosphere, aircraft state with heading convention"`

---

### Task 2: Reduced flight model + RK4 stepper

**Files:**
- Create: `sim/PilotCommand.cs`, `sim/FlightModel.cs`, `sim/AircraftSim.cs`
- Test: `sim.Tests/FlightModelTests.cs`

**Interfaces:**
- Consumes: Task 1 types.
- Produces: `PilotCommand(double GDemand, double BankTarget, double Throttle, double Rudder)`; `FlightModel` with static `AircraftParams Sabre` (`record AircraftParams(double MassKg, double WingAreaM2, double ThrustMaxN, double CD0, double InducedK, double CLMax, double RollRateMaxRad, double BankTau)`) and `Derivatives(in AircraftState, in PilotCommand, in AircraftParams)` returning `StateDeriv`; `FlightModel.NzAeroMax(in AircraftState, in AircraftParams)`; `AircraftSim` class: ctor `(AircraftState initial, AircraftParams p)`, `void Step(in PilotCommand cmd, double dt)` (RK4), `AircraftState State {get;}`, `double LastNz {get;}`, `bool Buffet {get;}`, `const double TickHz = 120.0`.

- [ ] **Step 1: Failing tests** — `sim.Tests/FlightModelTests.cs`:
```csharp
using GunsOnly.Sim; using Xunit;
public class FlightModelTests {
    static AircraftState Level(double speed = 180, double alt = 3000) =>
        new(new Vec3D(0, alt, 0), speed, 0, 0, 0, FlightModel.Sabre.MassKg);
    static PilotCommand Cruise => new(1.0, 0.0, 0.85, 0.0);

    [Fact] public void LevelOneGFlightHoldsAltitudeApproximately() {
        var sim = new AircraftSim(Level(), FlightModel.Sabre);
        for (int i = 0; i < 1200; i++) sim.Step(Cruise, 1.0/AircraftSim.TickHz); // 10 s
        Assert.InRange(sim.State.Position.Y, 2900, 3100);
    }
    [Fact] public void SustainedMaxGBleedsSpeed() { // energy honesty: induced drag beats thrust at high G
        var sim = new AircraftSim(Level(220), FlightModel.Sabre);
        var pull = new PilotCommand(6.0, 1.2, 1.0, 0.0);
        double v0 = sim.State.Speed;
        for (int i = 0; i < 960; i++) sim.Step(pull, 1.0/AircraftSim.TickHz); // 8 s
        Assert.True(sim.State.Speed < v0 - 25, $"speed only fell {v0 - sim.State.Speed:F1} m/s");
    }
    [Fact] public void UnloadedDiveGainsSpeed() {
        var start = Level(160) with { Gamma = -0.20 };
        var sim = new AircraftSim(start, FlightModel.Sabre);
        var unload = new PilotCommand(0.2, 0.0, 1.0, 0.0);
        double v0 = sim.State.Speed;
        for (int i = 0; i < 600; i++) sim.Step(unload, 1.0/AircraftSim.TickHz); // 5 s
        Assert.True(sim.State.Speed > v0 + 15);
    }
    [Fact] public void GAvailableIsLowWhenSlowHighWhenFast() {
        Assert.True(FlightModel.NzAeroMax(Level(90), FlightModel.Sabre) < 2.5);
        Assert.True(FlightModel.NzAeroMax(Level(260), FlightModel.Sabre) > 6.0);
    }
    [Fact] public void BuffetFlagsNearAeroLimit() {
        var sim = new AircraftSim(Level(140), FlightModel.Sabre);
        var hard = new PilotCommand(9.0, 0.0, 1.0, 0.0); // demands far beyond available
        for (int i = 0; i < 120; i++) sim.Step(hard, 1.0/AircraftSim.TickHz);
        Assert.True(sim.Buffet);
    }
    [Fact] public void BankApproachesTargetAtFiniteRate() {
        var sim = new AircraftSim(Level(), FlightModel.Sabre);
        var roll = new PilotCommand(1.0, 1.5708, 0.85, 0.0);
        sim.Step(roll, 1.0/AircraftSim.TickHz);
        Assert.True(sim.State.Bank < 0.10); // one tick cannot snap to 90 deg
        for (int i = 0; i < 240; i++) sim.Step(roll, 1.0/AircraftSim.TickHz); // 2 s
        Assert.InRange(sim.State.Bank, 1.35, 1.60);
    }
    [Fact] public void DeterministicGivenSameInputs() {
        var a = new AircraftSim(Level(), FlightModel.Sabre);
        var b = new AircraftSim(Level(), FlightModel.Sabre);
        var cmd = new PilotCommand(4.0, 0.9, 1.0, 0.0);
        for (int i = 0; i < 1000; i++) { a.Step(cmd, 1.0/AircraftSim.TickHz); b.Step(cmd, 1.0/AircraftSim.TickHz); }
        Assert.Equal(a.State, b.State);
    }
}
```

- [ ] **Step 2: Run to verify failure** — `dotnet test` → FAIL.

- [ ] **Step 3: Implement** — `sim/PilotCommand.cs`:
```csharp
namespace GunsOnly.Sim;
/// The actuated per-tick command (post-detent). GDemand in g, BankTarget rad, Throttle 0..1, Rudder -1..1.
public readonly record struct PilotCommand(double GDemand, double BankTarget, double Throttle, double Rudder);
```
`sim/FlightModel.cs`:
```csharp
namespace GunsOnly.Sim;
public record AircraftParams(double MassKg, double WingAreaM2, double ThrustMaxN,
    double CD0, double InducedK, double CLMax, double RollRateMaxRad, double BankTau);

public readonly record struct StateDeriv(Vec3D DPos, double DSpeed, double DGamma, double DChi, double DBank);

public static class FlightModel {
    public const double G0 = 9.80665;
    // PLACEHOLDER Sabre-shaped numbers. M1 replaces with table-driven 6DOF. Shape > fidelity here.
    public static readonly AircraftParams Sabre = new(
        MassKg: 6900, WingAreaM2: 26.8, ThrustMaxN: 26300,
        CD0: 0.0180, InducedK: 0.083, CLMax: 1.10,
        RollRateMaxRad: 2.1, BankTau: 0.18);

    public static double NzAeroMax(in AircraftState s, in AircraftParams p) {
        double q = 0.5 * Atmosphere.Density(s.Position.Y) * s.Speed * s.Speed;
        return q * p.WingAreaM2 * p.CLMax / (s.Mass * G0);
    }
    static double MachDragFactor(double mach) =>              // PLACEHOLDER transonic drag rise
        mach < 0.85 ? 1.0 : 1.0 + 8.0 * (mach - 0.85) * (mach - 0.85);
    static double ThrustLapse(double altM) => Atmosphere.Density(altM) / 1.225;

    public static StateDeriv Derivatives(in AircraftState s, in PilotCommand c, in AircraftParams p) {
        double rho = Atmosphere.Density(s.Position.Y);
        double q = 0.5 * rho * s.Speed * s.Speed;
        double nzAvail = q * p.WingAreaM2 * p.CLMax / (s.Mass * G0);
        double nz = System.Math.Clamp(c.GDemand, -1.5, System.Math.Min(nzAvail, 7.33));
        double cl = nz * s.Mass * G0 / System.Math.Max(q * p.WingAreaM2, 1e-6);
        double mach = s.Speed / Atmosphere.SpeedOfSound(s.Position.Y);
        double cd = p.CD0 * MachDragFactor(mach) + p.InducedK * cl * cl;
        double drag = q * p.WingAreaM2 * cd + System.Math.Abs(c.Rudder) * 0.15 * q * p.WingAreaM2 * p.CD0;
        double thrust = System.Math.Clamp(c.Throttle, 0, 1) * p.ThrustMaxN * ThrustLapse(s.Position.Y);

        double dSpeed = (thrust - drag) / s.Mass - G0 * System.Math.Sin(s.Gamma);
        double dGamma = (G0 / System.Math.Max(s.Speed, 20)) * (nz * System.Math.Cos(s.Bank) - System.Math.Cos(s.Gamma));
        double dChi = G0 * nz * System.Math.Sin(s.Bank) / (System.Math.Max(s.Speed, 20) * System.Math.Cos(s.Gamma))
                      + c.Rudder * 0.06; // PLACEHOLDER rudder yaw-jink authority
        double bankErr = c.BankTarget - s.Bank;
        double dBank = System.Math.Clamp(bankErr / p.BankTau, -p.RollRateMaxRad, p.RollRateMaxRad);
        return new StateDeriv(s.VelocityVector(), dSpeed, dGamma, dChi, dBank);
    }
}
```
`sim/AircraftSim.cs`:
```csharp
namespace GunsOnly.Sim;
public sealed class AircraftSim {
    public const double TickHz = 120.0;
    public AircraftState State { get; private set; }
    public double LastNz { get; private set; } = 1.0;
    public bool Buffet { get; private set; }
    readonly AircraftParams _p;
    public AircraftSim(AircraftState initial, AircraftParams p) { State = initial; _p = p; }

    public void Step(in PilotCommand cmd, double dt) {
        var s = State;
        var k1 = FlightModel.Derivatives(s, cmd, _p);
        var k2 = FlightModel.Derivatives(Apply(s, k1, dt/2), cmd, _p);
        var k3 = FlightModel.Derivatives(Apply(s, k2, dt/2), cmd, _p);
        var k4 = FlightModel.Derivatives(Apply(s, k3, dt), cmd, _p);
        State = new AircraftState(
            s.Position + (k1.DPos + (k2.DPos + k3.DPos)*2 + k4.DPos) * (dt/6),
            s.Speed  + (k1.DSpeed + 2*(k2.DSpeed + k3.DSpeed) + k4.DSpeed) * (dt/6),
            s.Gamma  + (k1.DGamma + 2*(k2.DGamma + k3.DGamma) + k4.DGamma) * (dt/6),
            Wrap(s.Chi + (k1.DChi + 2*(k2.DChi + k3.DChi) + k4.DChi) * (dt/6)),
            s.Bank   + (k1.DBank + 2*(k2.DBank + k3.DBank) + k4.DBank) * (dt/6),
            s.Mass);
        double nzAvail = FlightModel.NzAeroMax(State, _p);
        LastNz = System.Math.Clamp(cmd.GDemand, -1.5, System.Math.Min(nzAvail, 7.33));
        Buffet = cmd.GDemand > 0.85 * nzAvail;
        if (State.Speed < 40) State = State with { Speed = 40, Gamma = State.Gamma - 0.002 }; // PLACEHOLDER mush floor
    }
    static AircraftState Apply(in AircraftState s, in StateDeriv d, double h) => new(
        s.Position + d.DPos*h, s.Speed + d.DSpeed*h, s.Gamma + d.DGamma*h,
        s.Chi + d.DChi*h, s.Bank + d.DBank*h, s.Mass);
    static double Wrap(double a) { while (a > System.Math.PI) a -= 2*System.Math.PI; while (a < -System.Math.PI) a += 2*System.Math.PI; return a; }
}
```

- [ ] **Step 4: Run** — `dotnet test` → all PASS. If `LevelOneGFlightHoldsAltitudeApproximately` fails on trim drift, widen throttle to hold 180 m/s at 3 km (adjust `Cruise` throttle, not the model), and re-run; if `SustainedMaxGBleedsSpeed` fails, raise `InducedK` a notch — these are the placeholder's two tuning screws and the tests define "honest shape."
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(sim): reduced 3DOF flight model with honest energy shape + RK4 stepper"`

---

### Task 3: Protection layer — the G tiers

**Files:**
- Create: `sim/Protection.cs`
- Test: `sim.Tests/ProtectionTests.cs`

**Interfaces:**
- Consumes: `FlightModel.NzAeroMax`, `AircraftState`, `AircraftParams`.
- Produces: `Protection.MaxPerformG(in AircraftState, in AircraftParams)` (= min(0.92·nzAero, 6.0), floor 1.2); `Protection.HardMaxG(in AircraftState, in AircraftParams)` (= min(nzAero, 7.33)); enum `DemandTier { Baseline, Valley, MaxPerform, OverDemand }`.

- [ ] **Step 1: Failing tests** — `sim.Tests/ProtectionTests.cs`:
```csharp
using GunsOnly.Sim; using Xunit;
public class ProtectionTests {
    static AircraftState At(double speed) => new(new Vec3D(0,3000,0), speed, 0, 0, 0, FlightModel.Sabre.MassKg);
    [Fact] public void ProtectionBelowHardMax() {
        var s = At(240);
        Assert.True(Protection.MaxPerformG(s, FlightModel.Sabre) < Protection.HardMaxG(s, FlightModel.Sabre));
    }
    [Fact] public void ProtectionCapsAtSixG() => Assert.Equal(6.0, Protection.MaxPerformG(At(400), FlightModel.Sabre), 6);
    [Fact] public void HardMaxCapsAtStructural() => Assert.Equal(7.33, Protection.HardMaxG(At(400), FlightModel.Sabre), 6);
    [Fact] public void SlowFlightProtectionIsAeroLimited() {
        var s = At(110);
        Assert.True(Protection.MaxPerformG(s, FlightModel.Sabre) < 3.0);
        Assert.Equal(0.92 * FlightModel.NzAeroMax(s, FlightModel.Sabre), Protection.MaxPerformG(s, FlightModel.Sabre), 6);
    }
}
```
- [ ] **Step 2: Run to verify failure** — `dotnet test` → FAIL.
- [ ] **Step 3: Implement** — `sim/Protection.cs`:
```csharp
namespace GunsOnly.Sim;
public enum DemandTier { Baseline, Valley, MaxPerform, OverDemand }
public static class Protection {
    public static double MaxPerformG(in AircraftState s, in AircraftParams p) =>
        System.Math.Max(1.2, System.Math.Min(0.92 * FlightModel.NzAeroMax(s, p), 6.0));
    public static double HardMaxG(in AircraftState s, in AircraftParams p) =>
        System.Math.Min(FlightModel.NzAeroMax(s, p), 7.33);
}
```
- [ ] **Step 4: Run** — `dotnet test` → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(sim): protection layer G tiers (max-perform vs hard max)"`

---

### Task 4: KeyGrammar — tap / hold / double-tap-hold classifier

**Files:**
- Create: `sim/KeyGrammar.cs`
- Test: `sim.Tests/KeyGrammarTests.cs`

**Interfaces:**
- Consumes: nothing (pure).
- Produces: `enum GKey { PullUp, PushDown, RollLeft, RollRight, RudderLeft, RudderRight, ThrottleUp, ThrottleDown, Trigger, Padlock, KnockItOff, Restart }`; `enum KeyPhase { Idle, Held, DoubleHeld }`; `class KeyGrammar` with `void Feed(GKey key, bool pressed, double timeMs)` (callers must pre-filter OS echo repeats), `KeyPhase Phase(GKey key)`, `int TakeTaps(GKey key, double nowMs)` (completed taps whose double-window expired; deterministic in nowMs), and tunables `TapMaxMs = 180`, `DoubleGapMs = 250`.

Semantics (spec §7): press→release within `TapMaxMs` = one **tap**; press held past `TapMaxMs` = **Held**; press, release, re-press within `DoubleGapMs` and held = **DoubleHeld** (past-protection demand); release always returns to Idle.

- [ ] **Step 1: Failing tests** — `sim.Tests/KeyGrammarTests.cs`:
```csharp
using GunsOnly.Sim; using Xunit;
public class KeyGrammarTests {
    [Fact] public void QuickPressReleaseIsATap() {
        var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 1000); g.Feed(GKey.PullUp, false, 1100);
        Assert.Equal(1, g.TakeTaps(GKey.PullUp));
        Assert.Equal(KeyPhase.Idle, g.Phase(GKey.PullUp));
    }
    [Fact] public void LongPressIsHeldNotTap() {
        var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 1000);
        Assert.Equal(KeyPhase.Held, g.PhaseAt(GKey.PullUp, 1300));
        g.Feed(GKey.PullUp, false, 1500);
        Assert.Equal(0, g.TakeTaps(GKey.PullUp));
    }
    [Fact] public void TapThenQuickRepressAndHoldIsDoubleHeld() {
        var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 1000); g.Feed(GKey.PullUp, false, 1080);
        g.Feed(GKey.PullUp, true, 1200); // within DoubleGapMs of release
        Assert.Equal(KeyPhase.DoubleHeld, g.PhaseAt(GKey.PullUp, 1450));
        Assert.Equal(0, g.TakeTaps(GKey.PullUp)); // the tap was consumed by the double
    }
    [Fact] public void SlowRepressIsJustANewHold() {
        var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 1000); g.Feed(GKey.PullUp, false, 1080);
        g.Feed(GKey.PullUp, true, 1600); // beyond DoubleGapMs
        Assert.Equal(KeyPhase.Held, g.PhaseAt(GKey.PullUp, 1900));
        Assert.Equal(1, g.TakeTaps(GKey.PullUp)); // first tap stands
    }
    [Fact] public void TwoQuickTapsCountTwo() {
        var g = new KeyGrammar();
        g.Feed(GKey.RollLeft, true, 0); g.Feed(GKey.RollLeft, false, 90);
        g.Feed(GKey.RollLeft, true, 400); g.Feed(GKey.RollLeft, false, 480);
        Assert.Equal(2, g.TakeTaps(GKey.RollLeft));
    }
    [Fact] public void KeysAreIndependent() {
        var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 0);
        Assert.Equal(KeyPhase.Idle, g.Phase(GKey.RollLeft));
    }
}
```
(Note `PhaseAt(key, nowMs)` — phase queries need "now" to promote press→Held; `Phase(key)` returns last computed phase for Idle checks.)

- [ ] **Step 2: Run to verify failure** — `dotnet test` → FAIL.
- [ ] **Step 3: Implement** — `sim/KeyGrammar.cs`:
```csharp
using System.Collections.Generic;
namespace GunsOnly.Sim;
public enum GKey { PullUp, PushDown, RollLeft, RollRight, RudderLeft, RudderRight, ThrottleUp, ThrottleDown, Trigger, Padlock, KnockItOff, Restart }
public enum KeyPhase { Idle, Held, DoubleHeld }

public sealed class KeyGrammar {
    public double TapMaxMs = 180, DoubleGapMs = 250;
    sealed class KS { public bool Down; public double PressT = double.NegativeInfinity, ReleaseT = double.NegativeInfinity; public bool DoubleArmed; public bool IsDouble; public int Taps; }
    readonly Dictionary<GKey, KS> _k = new();
    KS S(GKey k) => _k.TryGetValue(k, out var s) ? s : _k[k] = new KS();

    public void Feed(GKey key, bool pressed, double timeMs) {
        var s = S(key);
        if (pressed && !s.Down) {
            s.Down = true;
            s.IsDouble = s.DoubleArmed && (timeMs - s.ReleaseT) <= DoubleGapMs;
            if (s.IsDouble) { s.Taps = System.Math.Max(0, s.Taps - 1); } // consume the arming tap
            s.PressT = timeMs;
        } else if (!pressed && s.Down) {
            s.Down = false; s.ReleaseT = timeMs;
            bool wasTap = (timeMs - s.PressT) <= TapMaxMs && !s.IsDouble;
            if (wasTap) { s.Taps++; s.DoubleArmed = true; } else s.DoubleArmed = false;
            s.IsDouble = false;
        }
    }
    public KeyPhase PhaseAt(GKey key, double nowMs) {
        var s = S(key);
        if (!s.Down) return KeyPhase.Idle;
        if (s.IsDouble) return KeyPhase.DoubleHeld;
        return KeyPhase.Held; // held from the moment of press; taps are recognized on release
    }
    public KeyPhase Phase(GKey key) => S(key).Down ? (S(key).IsDouble ? KeyPhase.DoubleHeld : KeyPhase.Held) : KeyPhase.Idle;
    public int TakeTaps(GKey key) { var s = S(key); int t = s.Taps; s.Taps = 0; return t; }
}
```
(Design note: a press reads as `Held` immediately — the detent layer treats a short press-release as a tap retroactively via `TakeTaps`, which is what "tap = nudge" needs; nothing user-visible latches on press alone.)

- [ ] **Step 4: Run** — `dotnet test` → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(sim): key grammar classifier (tap/hold/double-tap-hold, per-key state)"`

---

### Task 5: Doctrine geometry + canned execution laws

**Files:**
- Create: `sim/Doctrine/DoctrineAdvice.cs`, `sim/Doctrine/Geometry.cs`, `sim/Doctrine/Laws.cs`
- Test: `sim.Tests/DoctrineTests.cs`

**Interfaces:**
- Consumes: Tasks 1–3.
- Produces: `record DoctrineAdvice(double RecommendedG, double RecommendedBank, string Context)`; `static class Geometry` with `double AngleOff(in AircraftState own, in AircraftState bandit)` (angle between own forward and LOS, rad), `double Range(in own, in bandit)`, `double BankToPlaceLiftVectorOn(in own, Vec3D worldTarget)`; `interface IExecutionLaw { DoctrineAdvice Advise(in AircraftState own, in AircraftState bandit, in AircraftParams p); }`; `class PurePursuitLaw : IExecutionLaw`; `class BreakLaw : IExecutionLaw` (`BreakLaw(int direction)`, +1 = break right); `class GunsSaddleLaw : IExecutionLaw` (leads the target by bullet time-of-flight, `BulletSpeed = 870.0` m/s).

- [ ] **Step 1: Failing tests** — `sim.Tests/DoctrineTests.cs`:
```csharp
using GunsOnly.Sim; using GunsOnly.Sim.Doctrine; using Xunit;
public class DoctrineTests {
    static AircraftState At(Vec3D pos, double chi, double speed = 180) =>
        new(pos, speed, 0, chi, 0, FlightModel.Sabre.MassKg);

    [Fact] public void BankLawZeroWhenTargetDirectlyAbovePathAndZeroBank() {
        var own = At(Vec3D.Zero, 0);
        double bank = Geometry.BankToPlaceLiftVectorOn(own, new Vec3D(0, 1000, 500));
        Assert.InRange(System.Math.Abs(bank), 0, 0.05);
    }
    [Fact] public void BankLawNinetyWhenTargetAbeamRight() {
        var own = At(Vec3D.Zero, 0);
        double bank = Geometry.BankToPlaceLiftVectorOn(own, new Vec3D(1000, 0, 200));
        Assert.InRange(bank, 1.35, 1.75); // ~ +90 deg
    }
    [Fact] public void PurePursuitReducesAngleOff() {
        var own = At(Vec3D.Zero, 0, 200);
        var bandit = At(new Vec3D(800, 150, 1500), 0.6, 170);
        var ownSim = new AircraftSim(own, FlightModel.Sabre);
        var banditSim = new AircraftSim(bandit, FlightModel.Sabre);
        var law = new PurePursuitLaw();
        double a0 = Geometry.AngleOff(ownSim.State, banditSim.State);
        for (int i = 0; i < 1200; i++) { // 10 s
            var adv = law.Advise(ownSim.State, banditSim.State, FlightModel.Sabre);
            ownSim.Step(new PilotCommand(adv.RecommendedG, adv.RecommendedBank, 1.0, 0), 1.0/AircraftSim.TickHz);
            banditSim.Step(new PilotCommand(1.0, 0, 0.8, 0), 1.0/AircraftSim.TickHz);
        }
        Assert.True(Geometry.AngleOff(ownSim.State, banditSim.State) < a0 * 0.5,
            "pursuit law failed to halve angle-off in 10 s");
    }
    [Fact] public void BreakLawCommandsMaxPerformIntoDirection() {
        var own = At(Vec3D.Zero, 0, 220);
        var adv = new BreakLaw(+1).Advise(own, At(new Vec3D(0, 100, -900), 0), FlightModel.Sabre);
        Assert.Equal(Protection.MaxPerformG(own, FlightModel.Sabre), adv.RecommendedG, 3);
        Assert.InRange(adv.RecommendedBank, 1.2, 1.6); // hard right bank
    }
    [Fact] public void GunsLawAimsAheadOfCrossingTarget() {
        var own = At(Vec3D.Zero, 0, 220);
        var bandit = At(new Vec3D(0, 0, 600), System.Math.PI/2, 170); // 600 m ahead, crossing right
        var pure = new PurePursuitLaw().Advise(own, bandit, FlightModel.Sabre);
        var guns = new GunsSaddleLaw().Advise(own, bandit, FlightModel.Sabre);
        Assert.True(guns.RecommendedBank > pure.RecommendedBank - 0.35, "lead should bank toward the crossing side at least as much");
        Assert.NotEqual(pure.RecommendedBank, guns.RecommendedBank, 3);
    }
}
```
- [ ] **Step 2: Run to verify failure** — `dotnet test` → FAIL.
- [ ] **Step 3: Implement** — `sim/Doctrine/DoctrineAdvice.cs`:
```csharp
namespace GunsOnly.Sim.Doctrine;
public record DoctrineAdvice(double RecommendedG, double RecommendedBank, string Context);
public interface IExecutionLaw { DoctrineAdvice Advise(in AircraftState own, in AircraftState bandit, in AircraftParams p); }
```
`sim/Doctrine/Geometry.cs`:
```csharp
namespace GunsOnly.Sim.Doctrine;
public static class Geometry {
    public static double Range(in AircraftState own, in AircraftState bandit) => (bandit.Position - own.Position).Length;
    public static double AngleOff(in AircraftState own, in AircraftState bandit) {
        var los = (bandit.Position - own.Position).Normalized();
        double d = System.Math.Clamp(own.ForwardDir().Dot(los), -1, 1);
        return System.Math.Acos(d);
    }
    /// Bank (rad, world-relative) that rotates the lift vector into the plane containing velocity and the target.
    public static double BankToPlaceLiftVectorOn(in AircraftState own, Vec3D worldTarget) {
        var vhat = own.ForwardDir();
        var los = (worldTarget - own.Position).Normalized();
        var e = los - vhat * los.Dot(vhat);              // LOS component perpendicular to path
        if (e.Length < 1e-6) return own.Bank;             // dead ahead: keep current bank
        var eHat = e.Normalized();
        var up = new Vec3D(0, 1, 0);
        // World basis (east, up, north) is LEFT-handed: physical direction products
        // take reversed operand order vs the standard determinant Cross (see Vec3D docs).
        var right0 = up.Cross(vhat);                      // level-right basis (physical vhat x up)
        if (right0.Length < 1e-6) return own.Bank;        // vertical path: bank undefined, hold
        right0 = right0.Normalized();
        var upPerp0 = vhat.Cross(right0).Normalized();    // "wings-level lift" direction
        return System.Math.Atan2(eHat.Dot(right0), eHat.Dot(upPerp0));
    }
}
```
`sim/Doctrine/Laws.cs`:
```csharp
namespace GunsOnly.Sim.Doctrine;
public sealed class PurePursuitLaw : IExecutionLaw {
    public DoctrineAdvice Advise(in AircraftState own, in AircraftState bandit, in AircraftParams p) {
        double bank = Geometry.BankToPlaceLiftVectorOn(own, bandit.Position);
        double err = Geometry.AngleOff(own, bandit);
        double g = System.Math.Clamp(1.0 + 9.0 * err, 1.0, Protection.MaxPerformG(own, p));
        return new DoctrineAdvice(g, bank, "pure pursuit");
    }
}
public sealed class BreakLaw : IExecutionLaw {
    readonly int _dir; public BreakLaw(int direction) => _dir = direction >= 0 ? 1 : -1;
    public DoctrineAdvice Advise(in AircraftState own, in AircraftState bandit, in AircraftParams p) =>
        new(Protection.MaxPerformG(own, p), _dir * 1.45, "break");
}
public sealed class GunsSaddleLaw : IExecutionLaw {
    public const double BulletSpeed = 870.0; // m/s, PLACEHOLDER .50 M3-ish
    public DoctrineAdvice Advise(in AircraftState own, in AircraftState bandit, in AircraftParams p) {
        double tof = Geometry.Range(own, bandit) / (BulletSpeed + own.Speed);
        var aim = bandit.Position + bandit.VelocityVector() * tof;
        double bank = Geometry.BankToPlaceLiftVectorOn(own, aim);
        var vhatDot = System.Math.Clamp(own.ForwardDir().Dot((aim - own.Position).Normalized()), -1, 1);
        double err = System.Math.Acos(vhatDot);
        double g = System.Math.Clamp(1.0 + 9.0 * err, 1.0, Protection.MaxPerformG(own, p));
        return new DoctrineAdvice(g, bank, "guns solution");
    }
}
```
- [ ] **Step 4: Run** — `dotnet test` → PASS. (If `BankLawNinetyWhenTargetAbeamRight` fails on sign, the `Atan2` argument order or `right0` handedness is flipped — fix the code, not the test: positive bank must roll right toward a target at +X when heading north.)
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(sim): doctrine geometry + canned execution laws (pursuit, break, guns lead)"`

---

### Task 6: DetentLayer — the local-minima grammar core

**Files:**
- Create: `sim/DetentLayer.cs`
- Test: `sim.Tests/DetentLayerTests.cs`

**Interfaces:**
- Consumes: `KeyGrammar` (phases + taps), `Protection`, `DoctrineAdvice`, `AircraftState/Params`.
- Produces: `enum ValleyVariant { DoctrineDeep, PhysicsOnly }`; `class DetentLayer` with `ValleyVariant Variant`, `void Tick(KeyGrammar keys, double nowMs, in AircraftState s, in AircraftParams p, DoctrineAdvice advice, double dt)`, outputs `PilotCommand Command {get;}`, `double StickyOffsetG {get;}`, `DemandTier Tier {get;}`, `double ValleyG {get;}`, `double ValleyBank {get;}`. Throttle detents: `double Throttle {get;}` stepping {0.0, 0.55, 0.85, 1.0} on ThrottleUp/Down taps. Roll: taps set BankTarget to advice.RecommendedBank (variant-independent quantized intent), hold = continuous rate (BankTarget += ±rollRate·dt while held); rudder keys pass ±0.6.

Behavior (spec §7, both variants):
- No pull/push input → **Baseline**: G target 1.0 (maintain), bank target holds last commanded.
- `PullUp` Held → **Valley** tier: target = `ValleyG + StickyOffsetG`, where `ValleyG` = advice.RecommendedG (DoctrineDeep) or `Protection.MaxPerformG` (PhysicsOnly). Cap: MaxPerformG.
- `PullUp` DoubleHeld → **OverDemand**: cap raised to `HardMaxG`; target = cap + StickyOffsetG (clamped).
- `PullUp` taps while held: each tap +0.5 G sticky; `PushDown` taps while pulling: −0.5 G sticky. Sticky persists while held, resets on release to Idle.
- `PushDown` Held → target 0.0 G; DoubleHeld → −1.0 G.
- Stick settles: `gCmd += (target − gCmd) · dt/τ`, τ = 0.22 s.

- [ ] **Step 1: Failing tests** — `sim.Tests/DetentLayerTests.cs`:
```csharp
using GunsOnly.Sim; using GunsOnly.Sim.Doctrine; using Xunit;
public class DetentLayerTests {
    static AircraftState Fast => new(new Vec3D(0,3000,0), 240, 0, 0, 0, FlightModel.Sabre.MassKg);
    static DoctrineAdvice Advice => new(4.2, 0.9, "test");
    static DetentLayer Run(DetentLayer d, KeyGrammar g, double fromMs, double toMs, AircraftState s) {
        for (double t = fromMs; t < toMs; t += 1000.0/AircraftSim.TickHz)
            d.Tick(g, t, s, FlightModel.Sabre, Advice, 1.0/AircraftSim.TickHz);
        return d;
    }
    [Fact] public void BaselineIsOneG() {
        var d = new DetentLayer(); var g = new KeyGrammar();
        Run(d, g, 0, 2000, Fast);
        Assert.Equal(1.0, d.Command.GDemand, 1);
        Assert.Equal(DemandTier.Baseline, d.Tier);
    }
    [Fact] public void HoldPullSettlesToDoctrineValleyInVariantA() {
        var d = new DetentLayer { Variant = ValleyVariant.DoctrineDeep }; var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 0);
        Run(d, g, 0, 1500, Fast);
        Assert.Equal(4.2, d.Command.GDemand, 1);
        Assert.Equal(DemandTier.Valley, d.Tier);
    }
    [Fact] public void HoldPullSettlesToMaxPerformInVariantB() {
        var d = new DetentLayer { Variant = ValleyVariant.PhysicsOnly }; var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 0);
        Run(d, g, 0, 1500, Fast);
        Assert.Equal(Protection.MaxPerformG(Fast, FlightModel.Sabre), d.Command.GDemand, 1);
    }
    [Fact] public void StickyTapRaisesHeldG() {
        var d = new DetentLayer { Variant = ValleyVariant.DoctrineDeep }; var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 0);
        Run(d, g, 0, 1000, Fast);
        // quick extra tap while... taps arrive via a second key? No: tap PullUp requires release.
        // Sticky adjustments while pulling come from PushDown taps (ease) and re-taps after micro-release:
        g.Feed(GKey.PushDown, true, 1000); g.Feed(GKey.PushDown, false, 1080); // ease tap
        Run(d, g, 1080, 2500, Fast);
        Assert.Equal(3.7, d.Command.GDemand, 1); // 4.2 - 0.5
        Assert.Equal(-0.5, d.StickyOffsetG, 6);
    }
    [Fact] public void ReleaseSettlesBackToBaselineAndClearsSticky() {
        var d = new DetentLayer { Variant = ValleyVariant.DoctrineDeep }; var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 0);
        Run(d, g, 0, 1200, Fast);
        g.Feed(GKey.PullUp, false, 1200);
        Run(d, g, 1200, 3200, Fast);
        Assert.Equal(1.0, d.Command.GDemand, 1);
        Assert.Equal(0.0, d.StickyOffsetG, 6);
    }
    [Fact] public void DoubleTapHoldGoesPastProtection() {
        var d = new DetentLayer { Variant = ValleyVariant.DoctrineDeep }; var g = new KeyGrammar();
        g.Feed(GKey.PullUp, true, 0); g.Feed(GKey.PullUp, false, 100);   // tap
        g.Feed(GKey.PullUp, true, 250);                                   // double-held
        Run(d, g, 250, 2250, Fast);
        Assert.Equal(DemandTier.OverDemand, d.Tier);
        Assert.True(d.Command.GDemand > Protection.MaxPerformG(Fast, FlightModel.Sabre) + 0.4);
        Assert.True(d.Command.GDemand <= Protection.HardMaxG(Fast, FlightModel.Sabre) + 1e-6);
    }
    [Fact] public void RollTapAdoptsAdviceBank() {
        var d = new DetentLayer(); var g = new KeyGrammar();
        g.Feed(GKey.RollRight, true, 0); g.Feed(GKey.RollRight, false, 90);
        Run(d, g, 90, 600, Fast);
        Assert.Equal(0.9, d.Command.BankTarget, 2);
    }
    [Fact] public void ThrottleTapsStepDetents() {
        var d = new DetentLayer(); var g = new KeyGrammar();
        Assert.Equal(0.85, d.Throttle, 6); // default cruise... spec detents idle/cruise/mil
        g.Feed(GKey.ThrottleUp, true, 0); g.Feed(GKey.ThrottleUp, false, 80);
        Run(d, g, 80, 500, Fast); // tap commits after the 250 ms double window
        Assert.Equal(1.0, d.Throttle, 6);
    }
}
```
- [ ] **Step 2: Run to verify failure** — `dotnet test` → FAIL.
- [ ] **Step 3: Implement** — `sim/DetentLayer.cs`:
```csharp
using GunsOnly.Sim.Doctrine;
namespace GunsOnly.Sim;
public enum ValleyVariant { DoctrineDeep, PhysicsOnly }

public sealed class DetentLayer {
    public ValleyVariant Variant = ValleyVariant.DoctrineDeep;
    public PilotCommand Command { get; private set; } = new(1.0, 0.0, 0.85, 0.0);
    public double StickyOffsetG { get; private set; }
    public DemandTier Tier { get; private set; } = DemandTier.Baseline;
    public double ValleyG { get; private set; } = 1.0;
    public double ValleyBank { get; private set; }
    public double Throttle { get; private set; } = 0.85;

    static readonly double[] ThrottleDetents = { 0.0, 0.55, 0.85, 1.0 };
    int _throttleIdx = 2;
    double _gCmd = 1.0, _bankTarget;
    const double Tau = 0.22, StickyStepG = 0.5, RollHoldRate = 1.6; // rad/s while roll key held

    public void Tick(KeyGrammar keys, double nowMs, in AircraftState s, in AircraftParams p, DoctrineAdvice advice, double dt) {
        double maxPerform = Protection.MaxPerformG(s, p);
        double hardMax = Protection.HardMaxG(s, p);
        ValleyG = Variant == ValleyVariant.DoctrineDeep ? System.Math.Min(advice.RecommendedG, maxPerform) : maxPerform;
        ValleyBank = advice.RecommendedBank;

        var pull = keys.PhaseAt(GKey.PullUp, nowMs);
        var push = keys.PhaseAt(GKey.PushDown, nowMs);
        int pullTaps = keys.TakeTaps(GKey.PullUp, nowMs), pushTaps = keys.TakeTaps(GKey.PushDown, nowMs);

        double target; DemandTier tier;
        if (pull == KeyPhase.DoubleHeld) { tier = DemandTier.OverDemand; StickyOffsetG += (pullTaps - pushTaps) * StickyStepG; target = System.Math.Clamp(hardMax + StickyOffsetG, System.Math.Min(1.0, hardMax), hardMax); }
        else if (pull != KeyPhase.Idle)  { tier = DemandTier.Valley;     StickyOffsetG += (pullTaps - pushTaps) * StickyStepG; target = System.Math.Clamp(ValleyG + StickyOffsetG, System.Math.Min(1.0, maxPerform), maxPerform); }
        else if (push == KeyPhase.DoubleHeld) { tier = DemandTier.OverDemand; target = -1.0; }
        else if (push != KeyPhase.Idle)  { tier = DemandTier.Valley;     target = 0.0; }
        else { tier = DemandTier.Baseline; StickyOffsetG = 0; target = 1.0; if (pullTaps > 0) target = System.Math.Min(1.0 + pullTaps * StickyStepG, maxPerform); }
        Tier = tier;
        _gCmd += (target - _gCmd) * System.Math.Min(1.0, dt / Tau);

        // Roll: taps adopt the advice bank (quantized intent); holds slew continuously.
        int rTaps = keys.TakeTaps(GKey.RollRight, nowMs), lTaps = keys.TakeTaps(GKey.RollLeft, nowMs);
        if (rTaps > 0 || lTaps > 0) _bankTarget = ValleyBank;
        if (keys.PhaseAt(GKey.RollRight, nowMs) != KeyPhase.Idle) _bankTarget += RollHoldRate * dt;
        if (keys.PhaseAt(GKey.RollLeft, nowMs) != KeyPhase.Idle)  _bankTarget -= RollHoldRate * dt;
        _bankTarget = System.Math.Clamp(_bankTarget, -System.Math.PI, System.Math.PI);

        int thUp = keys.TakeTaps(GKey.ThrottleUp, nowMs), thDn = keys.TakeTaps(GKey.ThrottleDown, nowMs);
        _throttleIdx = System.Math.Clamp(_throttleIdx + thUp - thDn, 0, ThrottleDetents.Length - 1);
        Throttle = ThrottleDetents[_throttleIdx];

        double rudder = 0;
        if (keys.PhaseAt(GKey.RudderRight, nowMs) != KeyPhase.Idle) rudder += 0.6;
        if (keys.PhaseAt(GKey.RudderLeft, nowMs) != KeyPhase.Idle)  rudder -= 0.6;

        Command = new PilotCommand(_gCmd, _bankTarget, Throttle, rudder);
    }
}
```
- [ ] **Step 4: Run** — `dotnet test` → PASS. (`StickyTapRaisesHeldG` documents a real grammar subtlety the M0 gate must feel: while pulling, *ease* taps come from ↓ and *harder* taps require the double-tap grammar or micro-release re-tap — if that feels wrong in the cockpit, the fix lands here and in this test.)
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(sim): detent layer — valleys, sticky offsets, tiers, both variants"`

---

### Task 7: Beats + rail bandit + prompt logic

**Files:**
- Create: `sim/Doctrine/Beats.cs`, `sim/PromptLogic.cs`
- Test: `sim.Tests/BeatsTests.cs`, `sim.Tests/PromptLogicTests.cs`

**Interfaces:**
- Consumes: Tasks 1–6.
- Produces: `record BeatSetup(string Name, AircraftState Player, AircraftState Bandit, IExecutionLaw Law, System.Collections.Generic.List<(double T, PilotCommand Cmd)> BanditTimeline)`; `static class Beats` with `BeatSetup Perch()`, `BeatSetup BreakDefense()`, `BeatSetup Saddle()` (initial geometries per spec §14 M0: offensive perch 500 m back / 300 m above; defensive threat at 700 m six o'clock; saddle 250 m dead six of a weaving bandit); `class RailBandit { RailBandit(AircraftState initial, AircraftParams p, List<(double,PilotCommand)> timeline); void Step(double dt); AircraftState State {get;} double T {get;} }`; `enum PromptCue { None, Pull, Ease, Unload, RollLeft, RollRight }`; `static PromptLogic.Cue(DoctrineAdvice advice, in PilotCommand actual, DemandTier tier)`.

- [ ] **Step 1: Failing tests** — `sim.Tests/BeatsTests.cs`:
```csharp
using GunsOnly.Sim; using GunsOnly.Sim.Doctrine; using Xunit;
public class BeatsTests {
    [Fact] public void PerchStartsPlayerBehindAndAbove() {
        var b = Beats.Perch();
        var rel = b.Player.Position - b.Bandit.Position;
        Assert.True(rel.Y > 200);                       // above
        Assert.True(rel.Dot(b.Bandit.ForwardDir()) < -300); // behind
    }
    [Fact] public void RailBanditIsDeterministic() {
        var b = Beats.Perch();
        var r1 = new RailBandit(b.Bandit, FlightModel.Sabre, b.BanditTimeline);
        var r2 = new RailBandit(b.Bandit, FlightModel.Sabre, b.BanditTimeline);
        for (int i = 0; i < 2400; i++) { r1.Step(1.0/AircraftSim.TickHz); r2.Step(1.0/AircraftSim.TickHz); }
        Assert.Equal(r1.State, r2.State);
    }
    [Fact] public void PerchBanditEventuallyTurns() {
        var b = Beats.Perch();
        var r = new RailBandit(b.Bandit, FlightModel.Sabre, b.BanditTimeline);
        double chi0 = r.State.Chi;
        for (int i = 0; i < 1800; i++) r.Step(1.0/AircraftSim.TickHz); // 15 s
        Assert.True(System.Math.Abs(r.State.Chi - chi0) > 0.5);
    }
    [Fact] public void AllThreeBeatsConstruct() {
        Assert.NotNull(Beats.Perch()); Assert.NotNull(Beats.BreakDefense()); Assert.NotNull(Beats.Saddle());
    }
}
```
`sim.Tests/PromptLogicTests.cs`:
```csharp
using GunsOnly.Sim; using GunsOnly.Sim.Doctrine; using Xunit;
public class PromptLogicTests {
    [Fact] public void UnderPullingPromptsPull() =>
        Assert.Equal(PromptCue.Pull, PromptLogic.Cue(new DoctrineAdvice(5.0, 0, "x"), new PilotCommand(2.0, 0, 1, 0), DemandTier.Baseline));
    [Fact] public void OverPullingPromptsEase() =>
        Assert.Equal(PromptCue.Ease, PromptLogic.Cue(new DoctrineAdvice(3.0, 0, "x"), new PilotCommand(5.5, 0, 1, 0), DemandTier.Valley));
    [Fact] public void BankErrorPromptsRoll() =>
        Assert.Equal(PromptCue.RollRight, PromptLogic.Cue(new DoctrineAdvice(2.0, 1.2, "x"), new PilotCommand(2.0, 0.2, 1, 0), DemandTier.Valley));
    [Fact] public void OnAdviceIsQuiet() =>
        Assert.Equal(PromptCue.None, PromptLogic.Cue(new DoctrineAdvice(4.0, 0.9, "x"), new PilotCommand(3.9, 0.95, 1, 0), DemandTier.Valley));
}
```
- [ ] **Step 2: Run to verify failure** — `dotnet test` → FAIL.
- [ ] **Step 3: Implement** — `sim/Doctrine/Beats.cs`:
```csharp
using System.Collections.Generic;
namespace GunsOnly.Sim.Doctrine;
public record BeatSetup(string Name, AircraftState Player, AircraftState Bandit, IExecutionLaw Law,
    List<(double T, PilotCommand Cmd)> BanditTimeline);

public sealed class RailBandit {
    readonly AircraftSim _sim; readonly List<(double T, PilotCommand Cmd)> _tl;
    public double T { get; private set; }
    public AircraftState State => _sim.State;
    public RailBandit(AircraftState initial, AircraftParams p, List<(double, PilotCommand)> timeline) {
        _sim = new AircraftSim(initial, p); _tl = timeline;
    }
    public void Step(double dt) {
        var cmd = _tl[0].Cmd;
        for (int i = _tl.Count - 1; i >= 0; i--) if (T >= _tl[i].T) { cmd = _tl[i].Cmd; break; }
        _sim.Step(cmd, dt); T += dt;
    }
}

public static class Beats {
    const double Alt = 3000;
    static AircraftState S(double x, double y, double z, double chi, double v) =>
        new(new Vec3D(x, y, z), v, 0, chi, 0, FlightModel.Sabre.MassKg);

    public static BeatSetup Perch() => new("Perch attack",
        Player: S(0, Alt + 300, -500, 0, 200),
        Bandit: S(0, Alt, 0, 0, 180),
        Law: new PurePursuitLaw(),
        BanditTimeline: new() {
            (0.0, new PilotCommand(1.0, 0.0, 0.85, 0)),
            (5.0, new PilotCommand(4.0, -1.10, 1.0, 0)),   // 4G left turn
            (25.0, new PilotCommand(1.0, 0.0, 0.85, 0)),
        });

    public static BeatSetup BreakDefense() => new("Break defense",
        Player: S(0, Alt, 0, 0, 190),
        Bandit: S(80, Alt + 120, -700, 0, 230),           // high six, closing
        Law: new BreakLaw(+1),
        BanditTimeline: new() {
            (0.0, new PilotCommand(2.0, 0.35, 1.0, 0)),    // gentle lag curve toward player
            (8.0, new PilotCommand(4.5, 0.9, 1.0, 0)),
            (20.0, new PilotCommand(1.0, 0.0, 0.7, 0)),
        });

    public static BeatSetup Saddle() => new("Saddle + shot",
        Player: S(0, Alt, -250, 0, 185),
        Bandit: S(0, Alt, 0, 0, 175),
        Law: new GunsSaddleLaw(),
        BanditTimeline: new() {
            (0.0, new PilotCommand(2.0, 0.55, 0.9, 0)),    // lazy weave
            (4.0, new PilotCommand(2.0, -0.55, 0.9, 0)),
            (8.0, new PilotCommand(2.0, 0.55, 0.9, 0)),
            (12.0, new PilotCommand(2.0, -0.55, 0.9, 0)),
            (16.0, new PilotCommand(2.0, 0.55, 0.9, 0)),
            (20.0, new PilotCommand(2.0, -0.55, 0.9, 0)),
        });
}
```
`sim/PromptLogic.cs`:
```csharp
using GunsOnly.Sim.Doctrine;
namespace GunsOnly.Sim;
public enum PromptCue { None, Pull, Ease, Unload, RollLeft, RollRight }
public static class PromptLogic {
    public static PromptCue Cue(DoctrineAdvice advice, in PilotCommand actual, DemandTier tier) {
        double bankErr = advice.RecommendedBank - actual.BankTarget;
        if (System.Math.Abs(bankErr) > 0.44) return bankErr > 0 ? PromptCue.RollRight : PromptCue.RollLeft;
        double gErr = advice.RecommendedG - actual.GDemand;
        if (gErr > 0.8) return PromptCue.Pull;
        if (gErr < -0.8) return PromptCue.Ease;
        return PromptCue.None;
    }
}
```
- [ ] **Step 4: Run** — `dotnet test` → PASS.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(sim): three canned beats, deterministic rail bandit, prompt logic"`

---

### Task 8: CameraSolver — maneuver / gun framing math

**Files:**
- Create: `sim/CameraSolver.cs`
- Test: `sim.Tests/CameraSolverTests.cs`

**Interfaces:**
- Consumes: `AircraftState`, `Vec3D`, `Geometry`.
- Produces: `enum CameraMode { Free, Maneuver, Gun }`; `record CameraPose(Vec3D Position, Vec3D LookAt, Vec3D Up)`; `static CameraSolver.Solve(CameraMode mode, in AircraftState own, in AircraftState bandit)`; `static CameraSolver.GunWindow(in own, in bandit)` → bool (range < 800 m && angle-off < 12°); smoothing lives Godot-side.

- [ ] **Step 1: Failing tests** — `sim.Tests/CameraSolverTests.cs`:
```csharp
using GunsOnly.Sim; using Xunit;
public class CameraSolverTests {
    static AircraftState At(Vec3D p, double chi) => new(p, 180, 0, chi, 0, 6900);
    static double AngleFrom(CameraPose pose, Vec3D target) {
        var f = (pose.LookAt - pose.Position).Normalized();
        var t = (target - pose.Position).Normalized();
        return System.Math.Acos(System.Math.Clamp(f.Dot(t), -1, 1));
    }
    [Theory]
    [InlineData(300, 0, 400)] [InlineData(-800, 200, 1200)] [InlineData(50, -100, 150)]
    public void ManeuverModeKeepsBothShipsInsideSixtyDegreeCone(double bx, double by, double bz) {
        var own = At(new Vec3D(0, 3000, 0), 0);
        var bandit = At(new Vec3D(bx, 3000 + by, bz), 0.5);
        var pose = CameraSolver.Solve(CameraMode.Maneuver, own, bandit);
        Assert.True(AngleFrom(pose, own.Position) < 0.55, "own ship out of frame");
        Assert.True(AngleFrom(pose, bandit.Position) < 0.55, "bandit out of frame");
    }
    [Fact] public void GunModeLooksAlongOwnNose() {
        var own = At(new Vec3D(0, 3000, 0), 0);
        var bandit = At(new Vec3D(0, 3000, 600), 0);
        var pose = CameraSolver.Solve(CameraMode.Gun, own, bandit);
        var f = (pose.LookAt - pose.Position).Normalized();
        Assert.True(f.Dot(own.ForwardDir()) > 0.995);
    }
    [Fact] public void GunWindowRequiresRangeAndAngle() {
        var own = At(new Vec3D(0, 3000, 0), 0);
        Assert.True(CameraSolver.GunWindow(own, At(new Vec3D(20, 3010, 500), 0)));
        Assert.False(CameraSolver.GunWindow(own, At(new Vec3D(20, 3010, 1500), 0)));   // too far
        Assert.False(CameraSolver.GunWindow(own, At(new Vec3D(600, 3010, 300), 0)));   // too wide
    }
}
```
- [ ] **Step 2: Run to verify failure** — `dotnet test` → FAIL.
- [ ] **Step 3: Implement** — `sim/CameraSolver.cs`:
```csharp
using GunsOnly.Sim.Doctrine;
namespace GunsOnly.Sim;
public enum CameraMode { Free, Maneuver, Gun }
public readonly record struct CameraPose(Vec3D Position, Vec3D LookAt, Vec3D Up);

public static class CameraSolver {
    public static bool GunWindow(in AircraftState own, in AircraftState bandit) =>
        Geometry.Range(own, bandit) < 800 && Geometry.AngleOff(own, bandit) < 0.2094; // 12 deg

    public static CameraPose Solve(CameraMode mode, in AircraftState own, in AircraftState bandit) {
        var up = new Vec3D(0, 1, 0);
        if (mode == CameraMode.Gun) {
            var pos = own.Position - own.ForwardDir() * 9 + up * 2.5;
            return new CameraPose(pos, own.Position + own.ForwardDir() * 200, up);
        }
        // Maneuver: camera behind own ship, biased opposite the bandit so both frame.
        var los = (bandit.Position - own.Position);
        var losDir = los.Normalized();
        var back = (own.ForwardDir() * 0.35 + losDir * 0.65).Normalized();
        var pos2 = own.Position - back * 26 + up * 7;
        var lookAt = own.Position + los * 0.45;
        return new CameraPose(pos2, lookAt, up);
    }
}
```
- [ ] **Step 4: Run** — `dotnet test` → PASS. (If a Theory case fails the cone check, widen the camera distance `26` / raise height `7` until all pass — those two constants are the framing knobs; do not loosen the 0.55 rad assertion, it encodes "both ships visible in a 63° half-FOV.")
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(sim): camera solver — maneuver dual-framing + gun view + gun window"`

---

### Task 9: SimBridge — the Godot ↔ kernel seam

**Files:**
- Create: `bridge/SimBridge.cs`
- Test: `tests/smoke_test.gd` (headless Godot smoke)

**Interfaces:**
- Consumes: everything in `sim/`.
- Produces (called from GDScript): Godot `Node` class `SimBridge` with: `void StartBeat(int index)` (1=Perch, 2=BreakDefense, 3=Saddle); `void FeedKey(int gkey, bool pressed, double timeMs)`; `void SetVariant(int v)` (0 doctrine-deep / 1 physics-only); `int GetVariant()`; `Transform3D GetPlayerTransform()`, `Transform3D GetBanditTransform()` (sim→Godot frame: `(x, y, -z)`, orientation from γ/χ/φ); `Godot.Collections.Dictionary GetHud()` with keys: `speed_kts, alt_ft, g_actual, g_cmd, g_valley, g_maxperform, g_hardmax, sticky, tier (int), variant (int), buffet (bool), prompt (int), context (String), angle_off_deg, range_m, gun_window (bool), beat (String)`; `void Trigger(bool down)` (dry — logs shot events with in-window flag); fixed 120 Hz stepping accumulated in `_PhysicsProcess`.

- [ ] **Step 1: Implement** — `bridge/SimBridge.cs`:
```csharp
using Godot;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly;

public partial class SimBridge : Node {
    AircraftSim _player = null!;
    RailBandit _bandit = null!;
    BeatSetup _beat = null!;
    readonly KeyGrammar _keys = new();
    readonly DetentLayer _detents = new();
    DoctrineAdvice _advice = new(1.0, 0.0, "free");
    double _acc, _simTimeMs;
    const double Dt = 1.0 / AircraftSim.TickHz;
    int _shotsInWindow, _shotsTotal;
    bool _triggerDown;

    public override void _Ready() => StartBeat(1);

    public void StartBeat(int index) {
        _beat = index switch { 2 => Beats.BreakDefense(), 3 => Beats.Saddle(), _ => Beats.Perch() };
        _player = new AircraftSim(_beat.Player, FlightModel.Sabre);
        _bandit = new RailBandit(_beat.Bandit, FlightModel.Sabre, _beat.BanditTimeline);
        _simTimeMs = 0; _acc = 0; _shotsInWindow = 0; _shotsTotal = 0;
    }
    public void FeedKey(int gkey, bool pressed, double timeMs) => _keys.Feed((GKey)gkey, pressed, _simTimeMs);
    public void SetVariant(int v) => _detents.Variant = v == 1 ? ValleyVariant.PhysicsOnly : ValleyVariant.DoctrineDeep;
    public int GetVariant() => _detents.Variant == ValleyVariant.PhysicsOnly ? 1 : 0;
    public void Trigger(bool down) {
        if (down && !_triggerDown) { _shotsTotal++; if (CameraSolver.GunWindow(_player.State, _bandit.State)) _shotsInWindow++; }
        _triggerDown = down;
    }

    public override void _PhysicsProcess(double delta) {
        _acc += delta;
        while (_acc >= Dt) {
            _advice = _beat.Law.Advise(_player.State, _bandit.State, FlightModel.Sabre);
            _detents.Tick(_keys, _simTimeMs, _player.State, FlightModel.Sabre, _advice, Dt);
            _player.Step(_detents.Command, Dt);
            _bandit.Step(Dt);
            _simTimeMs += Dt * 1000.0; _acc -= Dt;
        }
    }

    static Transform3D ToGodot(in AircraftState s) {
        var origin = new Vector3((float)s.Position.X, (float)s.Position.Y, (float)(-s.Position.Z));
        var fwdSim = s.ForwardDir();
        var fwd = new Vector3((float)fwdSim.X, (float)fwdSim.Y, (float)(-fwdSim.Z));
        var basis = Basis.LookingAt(fwd, Vector3.Up).Rotated(fwd, (float)(-s.Bank));
        return new Transform3D(basis, origin);
    }
    public Transform3D GetPlayerTransform() => ToGodot(_player.State);
    public Transform3D GetBanditTransform() => ToGodot(_bandit.State);

    public Godot.Collections.Dictionary GetHud() {
        var s = _player.State;
        return new Godot.Collections.Dictionary {
            {"speed_kts", s.Speed * 1.94384}, {"alt_ft", s.Position.Y * 3.28084},
            {"g_actual", _player.LastNz}, {"g_cmd", _detents.Command.GDemand},
            {"g_valley", _detents.ValleyG},
            {"g_maxperform", Protection.MaxPerformG(s, FlightModel.Sabre)},
            {"g_hardmax", Protection.HardMaxG(s, FlightModel.Sabre)},
            {"sticky", _detents.StickyOffsetG}, {"tier", (int)_detents.Tier},
            {"variant", GetVariant()}, {"buffet", _player.Buffet},
            {"prompt", (int)PromptLogic.Cue(_advice, _detents.Command, _detents.Tier)},
            {"context", _advice.Context},
            {"angle_off_deg", Geometry.AngleOff(s, _bandit.State) * 57.2958},
            {"range_m", Geometry.Range(s, _bandit.State)},
            {"gun_window", CameraSolver.GunWindow(s, _bandit.State)},
            {"beat", _beat.Name},
            {"shots_total", _shotsTotal}, {"shots_in_window", _shotsInWindow},
        };
    }
    // Camera access for the rig (GDScript): returns [pos, lookat] as Vector3 pair for the given mode.
    public Godot.Collections.Array GetCameraPose(int mode) {
        var pose = CameraSolver.Solve((CameraMode)mode, _player.State, _bandit.State);
        return new Godot.Collections.Array {
            new Vector3((float)pose.Position.X, (float)pose.Position.Y, (float)(-pose.Position.Z)),
            new Vector3((float)pose.LookAt.X, (float)pose.LookAt.Y, (float)(-pose.LookAt.Z)),
        };
    }
}
```
- [ ] **Step 2: Build via Godot** — `dotnet build GunsOnly.csproj` → expect success (this compiles the game assembly against Godot.NET.Sdk).
- [ ] **Step 3: Headless smoke test** — `tests/smoke_test.gd`:
```gdscript
extends SceneTree
# Run: bin/godot --headless -s res://tests/smoke_test.gd
func _initialize() -> void:
    var bridge = load("res://bridge/SimBridge.cs").new()
    root.add_child(bridge)
    bridge.StartBeat(1)
    bridge.FeedKey(0, true, 0.0)  # GKey.PullUp held
    for i in range(600):          # ~10 s of physics at 60 Hz callbacks
        bridge._PhysicsProcess(1.0 / 60.0)
    var hud = bridge.GetHud()
    assert(hud["g_cmd"] > 1.5, "pull hold should raise commanded G")
    assert(hud["speed_kts"] > 100.0, "aircraft should still be flying")
    var t: Transform3D = bridge.GetPlayerTransform()
    assert(t.origin.length() > 100.0, "aircraft should have moved")
    print("SMOKE OK  gcmd=%.2f speed=%.0f" % [hud["g_cmd"], hud["speed_kts"]])
    quit(0)
```
Run: `bin/godot --headless -s res://tests/smoke_test.gd` → expect `SMOKE OK ...`, exit 0.
- [ ] **Step 4: Commit** — `git add -A && git commit -m "feat(bridge): SimBridge node — 120Hz stepping, transforms, HUD dict, headless smoke"`

---

### Task 10: World scene — sea, sky, two jets, flight rendering

**Files:**
- Create: `game/main.tscn`, `game/main.gd`, `game/jet_mesh.tscn`

**Interfaces:**
- Consumes: `SimBridge` (Task 9).
- Produces: runnable game scene; `main.gd` exposes `$SimBridge`, `$PlayerJet`, `$BanditJet`, `$CameraRig` (rig arrives Task 11 — until then a static chase camera).

- [ ] **Step 1: Jet placeholder mesh** — `game/jet_mesh.tscn`: a `Node3D` root named `Jet` with three `CSGBox3D` children (fuselage 1×1×8 m, wing 8×0.15×1.8 m at z=+0.5, tail 3×0.15×1 m at z=−3.4, all `StandardMaterial3D` albedo `#c8ccd0`) and a `CSGBox3D` fin (0.15×1.2×1 m at z=−3.4, y=+0.6). Orientation: nose toward **−Z** (Godot forward). Save as scene.

- [ ] **Step 2: Main scene** — `game/main.tscn` structure (create in editor or as text):
```
Main (Node3D)                        script: game/main.gd
├── SimBridge (Node)                 script: bridge/SimBridge.cs
├── Sea (MeshInstance3D)             PlaneMesh 60000×60000 m, material: albedo #1b3a4a, metallic 0.1, roughness 0.35
├── Sun (DirectionalLight3D)         rotation (-35°, 40°, 0), energy 1.2, shadows on
├── Env (WorldEnvironment)           ProceduralSkyMaterial (sky_top #3a6ea5, horizon #b8c6cc), fog enabled, fog_density 0.00012, fog_aerial_perspective 0.6
├── PlayerJet (instance of jet_mesh.tscn)
├── BanditJet (instance of jet_mesh.tscn)  (albedo #7a2020 on fuselage for identification)
└── ChaseCam (Camera3D)              fov 63, far 40000
```
- [ ] **Step 3: main.gd** —
```gdscript
extends Node3D

@onready var bridge = $SimBridge
@onready var player: Node3D = $PlayerJet
@onready var bandit: Node3D = $BanditJet
@onready var cam: Camera3D = $ChaseCam

func _process(_delta: float) -> void:
    player.global_transform = bridge.GetPlayerTransform()
    bandit.global_transform = bridge.GetBanditTransform()
    # Temporary chase camera until Task 11's rig:
    var pose: Array = bridge.GetCameraPose(1)  # Maneuver
    cam.global_position = cam.global_position.lerp(pose[0], 0.08)
    cam.look_at(pose[1], Vector3.UP)
```
- [ ] **Step 4: Run visual check** — `bin/godot --path .` then play. Expected: two jets over a blue sea, player descending from perch toward the bandit, which turns left after 5 s; camera keeps both framed. **Look for:** stable horizon, no camera flips when the bandit crosses overhead, sea plane visible to the horizon with fog haze.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(game): world scene — sea, sky, jets, sim-driven flight rendering"`

---

### Task 11: Input adapter + camera rig + view states

**Files:**
- Create: `game/input_adapter.gd`, `game/camera_rig.gd`
- Modify: `game/main.tscn` (add InputAdapter node, replace ChaseCam script wiring), `game/main.gd`

**Interfaces:**
- Consumes: `SimBridge.FeedKey/Trigger/StartBeat/SetVariant/GetCameraPose`, `GetHud()["gun_window"]`.
- Produces: full key map live (spec §7); camera modes: Maneuver (default), Gun (auto-blend in window), Free (trackpad drag orbits, Space toggles padlock-maneuver back on).

- [ ] **Step 1: input_adapter.gd** —
```gdscript
extends Node
# Maps physical keys to GKey ints (must match sim/KeyGrammar.cs GKey order):
# PullUp=0 PushDown=1 RollLeft=2 RollRight=3 RudderLeft=4 RudderRight=5
# ThrottleUp=6 ThrottleDown=7 Trigger=8 Padlock=9 KnockItOff=10 Restart=11
const MAP := {
    KEY_UP: 0, KEY_DOWN: 1, KEY_LEFT: 2, KEY_RIGHT: 3,
    KEY_A: 4, KEY_D: 5, KEY_W: 6, KEY_S: 7,
    KEY_F: 8, KEY_SPACE: 9, KEY_K: 10, KEY_R: 11,
}
@onready var bridge = get_parent().get_node("SimBridge")
signal padlock_toggled
signal restart_requested
signal beat_selected(index: int)
signal variant_toggled

func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventKey and not event.echo:
        var code := event.keycode
        if code == KEY_F1 and event.pressed: variant_toggled.emit(); return
        if code in [KEY_1, KEY_2, KEY_3] and event.pressed:
            beat_selected.emit(code - KEY_1 + 1); return
        if MAP.has(code):
            var g: int = MAP[code]
            bridge.FeedKey(g, event.pressed, Time.get_ticks_msec())
            if g == 8: bridge.Trigger(event.pressed)
            if g == 9 and event.pressed: padlock_toggled.emit()
            if g == 11 and event.pressed: restart_requested.emit()
```
- [ ] **Step 2: camera_rig.gd** —
```gdscript
extends Camera3D
enum Mode { FREE, MANEUVER, GUN }
var mode: int = Mode.MANEUVER
var free_yaw := 0.0
var free_pitch := -0.2
var gun_blend := 0.0
@onready var bridge = get_parent().get_node("SimBridge")
@onready var player: Node3D = get_parent().get_node("PlayerJet")

func _unhandled_input(event: InputEvent) -> void:
    if event is InputEventPanGesture and mode == Mode.FREE:
        free_yaw -= event.delta.x * 0.01
        free_pitch = clampf(free_pitch - event.delta.y * 0.01, -1.2, 1.2)

func toggle_padlock() -> void:
    mode = Mode.MANEUVER if mode == Mode.FREE else Mode.FREE

func _process(delta: float) -> void:
    var hud: Dictionary = bridge.GetHud()
    var want_gun: bool = hud["gun_window"] and mode != Mode.FREE
    gun_blend = move_toward(gun_blend, 1.0 if want_gun else 0.0, delta * 2.5)
    if mode == Mode.FREE:
        var d := 30.0
        var off := Vector3(sin(free_yaw) * cos(free_pitch), -sin(free_pitch), cos(free_yaw) * cos(free_pitch)) * d
        global_position = global_position.lerp(player.global_position + off, 0.15)
        look_at(player.global_position, Vector3.UP)
        return
    var man: Array = bridge.GetCameraPose(1)
    var gun: Array = bridge.GetCameraPose(2)
    var pos: Vector3 = (man[0] as Vector3).lerp(gun[0], gun_blend)
    var tgt: Vector3 = (man[1] as Vector3).lerp(gun[1], gun_blend)
    global_position = global_position.lerp(pos, 0.12)
    look_at(tgt, Vector3.UP)
```
- [ ] **Step 3: Wire in main** — replace ChaseCam node with `CameraRig (Camera3D)` using `camera_rig.gd`; add `InputAdapter (Node)`; update `main.gd`:
```gdscript
extends Node3D
@onready var bridge = $SimBridge
@onready var player: Node3D = $PlayerJet
@onready var bandit: Node3D = $BanditJet
@onready var rig: Camera3D = $CameraRig
@onready var inp = $InputAdapter

func _ready() -> void:
    inp.padlock_toggled.connect(rig.toggle_padlock)
    inp.restart_requested.connect(func(): bridge.StartBeat(1))
    inp.beat_selected.connect(func(i): bridge.StartBeat(i))
    inp.variant_toggled.connect(func(): bridge.SetVariant(1 - bridge.GetVariant()))

func _process(_delta: float) -> void:
    player.global_transform = bridge.GetPlayerTransform()
    bandit.global_transform = bridge.GetBanditTransform()
```
- [ ] **Step 4: Visual check** — play. Expected: **hold ↑** = jet pulls toward the doctrine solution and the fight closes; **tap →** = bank snaps to the advice bank; **Space** = freelook orbit with two-finger trackpad pan; approaching dead-six inside 800 m auto-blends over the nose (gun view), sliding back out as you overshoot. **1/2/3** switch beats, **R** restarts, **F1** toggles variant (verify: in variant B, hold ↑ pulls noticeably harder than variant A on the perch — B rides max-perform).
- [ ] **Step 5: Commit** — `git add -A && git commit -m "feat(game): input adapter (full key map) + camera rig with maneuver/gun/free states"`

---

### Task 12: HUD — stick indicator, tapes, prompts

**Files:**
- Create: `game/hud.gd`
- Modify: `game/main.tscn` (add HUD CanvasLayer)

**Interfaces:**
- Consumes: `SimBridge.GetHud()` (all keys from Task 9).
- Produces: on-screen: G tape with valley notch / protection line / hard-max line / commanded bar / sticky readout; speed & altitude; beat name + variant badge (A/B); tier color (Baseline grey, Valley green, OverDemand amber + BUFFET flash); prompt arrows ("PULL ↑", "EASE ↓", "ROLL ◀/▶"); gun-window pipper cross + shots-in-window tally.

- [ ] **Step 1: HUD scene + script** — add to `main.tscn`: `HUD (CanvasLayer)` → `Root (Control, full rect)` with script `game/hud.gd`:
```gdscript
extends Control
@onready var bridge = get_node("/root/Main/SimBridge")
const TIER_COLORS := [Color(0.7,0.7,0.7), Color(0.3,0.9,0.4), Color(0.3,0.9,0.4), Color(1.0,0.7,0.2)]
const PROMPTS := ["", "PULL ↑", "EASE ↓", "UNLOAD ↓", "◀ ROLL", "ROLL ▶"]

func _process(_d): queue_redraw()

func _draw() -> void:
    var hud: Dictionary = bridge.GetHud()
    var sz := size
    # --- G tape (left edge): 0..8 G vertical ---
    var x := 40.0; var top := sz.y*0.25; var h := sz.y*0.5
    draw_line(Vector2(x, top), Vector2(x, top+h), Color(1,1,1,0.5), 2.0)
    for gval in range(0, 9):
        var y := top + h - (gval/8.0)*h
        draw_line(Vector2(x-4, y), Vector2(x+4, y), Color(1,1,1,0.4), 1.0)
    var gy = func(g: float) -> float: return top + h - (clampf(g, 0, 8)/8.0)*h
    draw_line(Vector2(x-14, gy.call(hud["g_maxperform"])), Vector2(x+14, gy.call(hud["g_maxperform"])), Color(0.3,0.9,0.4,0.9), 2.0)
    draw_line(Vector2(x-14, gy.call(hud["g_hardmax"])), Vector2(x+14, gy.call(hud["g_hardmax"])), Color(1.0,0.3,0.2,0.9), 2.0)
    draw_rect(Rect2(x-10, gy.call(hud["g_valley"])-3, 20, 6), Color(0.4,0.7,1.0,0.9))      # valley notch
    var tier: int = hud["tier"]
    draw_circle(Vector2(x, gy.call(hud["g_cmd"])), 7.0, TIER_COLORS[mini(tier, 3)])          # commanded
    draw_circle(Vector2(x, gy.call(hud["g_actual"])), 3.5, Color(1,1,1))                     # actual
    # --- readouts ---
    var f := ThemeDB.fallback_font; var fs := 16
    draw_string(f, Vector2(x+24, gy.call(hud["g_cmd"])+5), "%.1fG %+0.1f" % [hud["g_cmd"], hud["sticky"]], HORIZONTAL_ALIGNMENT_LEFT, -1, fs)
    draw_string(f, Vector2(20, 40), "%d kt   %d ft" % [hud["speed_kts"], hud["alt_ft"]], HORIZONTAL_ALIGNMENT_LEFT, -1, fs)
    draw_string(f, Vector2(20, 64), "%s   [variant %s]   %s" % [hud["beat"], "A" if hud["variant"]==0 else "B", hud["context"]], HORIZONTAL_ALIGNMENT_LEFT, -1, fs)
    if hud["buffet"]:
        draw_string(f, Vector2(sz.x/2-40, sz.y*0.2), "BUFFET", HORIZONTAL_ALIGNMENT_LEFT, -1, 22, Color(1.0,0.6,0.1))
    # --- prompt ---
    var p: int = hud["prompt"]
    if p > 0: draw_string(f, Vector2(sz.x/2-50, sz.y*0.82), PROMPTS[p], HORIZONTAL_ALIGNMENT_LEFT, -1, 26, Color(0.5,0.85,1.0))
    # --- gun window pipper + tally ---
    if hud["gun_window"]:
        var c := sz/2
        draw_line(c+Vector2(-12,0), c+Vector2(12,0), Color(1,0.9,0.2), 2.0)
        draw_line(c+Vector2(0,-12), c+Vector2(0,12), Color(1,0.9,0.2), 2.0)
    draw_string(f, Vector2(sz.x-220, 40), "range %dm  off %d°  hits %d/%d" % [hud["range_m"], hud["angle_off_deg"], hud["shots_in_window"], hud["shots_total"]], HORIZONTAL_ALIGNMENT_LEFT, -1, fs)
```
- [ ] **Step 2: Visual check** — play beat 3 (Saddle). Expected: valley notch rides just above the commanded dot when idle; hold ↑ and the dot climbs to the notch (variant A) or the green protection line (variant B); ↓-tap while pulling shows sticky `−0.5` and the dot eases; double-tap-hold ↑ pushes the dot into the amber zone with BUFFET flashing; prompts appear when you're off the advice; pipper cross lights inside 800 m/12° and F clicks count `hits n/m`.
- [ ] **Step 3: Commit** — `git add -A && git commit -m "feat(game): HUD — stick indicator with valley/tiers, tapes, prompts, dry-fire tally"`

---

### Task 13: Hardware spikes (chord test needs the user)

**Files:**
- Create: `spikes/chord_test.gd`, `spikes/chord_test.tscn`, `spikes/gesture_spike.gd`, `spikes/gesture_spike.tscn`, `spikes/altitude_look.tscn`, `spikes/ulp_check.gd`, `docs/spikes.md`

**Interfaces:** none downstream; results recorded in `docs/spikes.md` and consumed by the M0 gate.

- [ ] **Step 1: Chord/ghosting test** — `spikes/chord_test.gd` (attach to a Control in `chord_test.tscn`):
```gdscript
extends Control
var pressed := {}
func _unhandled_input(e: InputEvent) -> void:
    if e is InputEventKey and not e.echo:
        if e.pressed: pressed[e.keycode] = true
        else: pressed.erase(e.keycode)
        queue_redraw()
func _draw() -> void:
    var names := []
    for k in pressed: names.append(OS.get_keycode_string(k))
    names.sort()
    draw_string(ThemeDB.fallback_font, Vector2(40, 60), "HELD (%d): %s" % [names.size(), ", ".join(names)], HORIZONTAL_ALIGNMENT_LEFT, -1, 24)
    draw_string(ThemeDB.fallback_font, Vector2(40, 120), "Test chords: ↑+→+F | ↑+→+A | ↑+→+A+F | ↑+←+D+W | ↓+←+F", HORIZONTAL_ALIGNMENT_LEFT, -1, 16)
```
Run: `bin/godot --path . spikes/chord_test.tscn`. **USER TASK (5 min, on the target MacBook's internal keyboard):** hold each listed chord; record in `docs/spikes.md` which registered all keys. **Acceptance: every ≤3-key fight chord registers; note any 4-key failures (spec tolerates them — no mandatory chord exceeds 3).**
- [ ] **Step 2: Gesture momentum spike** — `spikes/gesture_spike.gd` (Control in its tscn):
```gdscript
extends Control
var log_lines: Array[String] = []
var last_event_ms := 0
func _unhandled_input(e: InputEvent) -> void:
    if e is InputEventPanGesture:
        var now := Time.get_ticks_msec()
        var gap := now - last_event_ms
        last_event_ms = now
        log_lines.push_front("pan d=(%.2f, %.2f) gap=%dms" % [e.delta.x, e.delta.y, gap])
        if log_lines.size() > 30: log_lines.pop_back()
        queue_redraw()
    if e is InputEventMagnifyGesture:
        log_lines.push_front("magnify f=%.3f" % e.factor); queue_redraw()
func _draw() -> void:
    for i in log_lines.size():
        draw_string(ThemeDB.fallback_font, Vector2(30, 40 + i*20), log_lines[i], HORIZONTAL_ALIGNMENT_LEFT, -1, 14)
```
Run it; two-finger scroll then **lift fingers**. Record in `docs/spikes.md`: how many ms the delta tail continues after lift (macOS momentum). Decision recorded: deadband/damping value for M-later ranging input (spec §7).
- [ ] **Step 3: Altitude look spike** — `spikes/altitude_look.tscn`: Node3D with a `MeshInstance3D` (PlaneMesh 100000×100000, `ShaderMaterial` displacing Y by `texture(noise, uv)*800.0` from a `NoiseTexture2D`), same WorldEnvironment settings as main, camera at (0, 6000, 0) pitched −15°, `far = 80000`. Fly-around with simple WASD script optional. **Judge by eye:** does haze + scale read as "20,000 ft over Korea" or as a miniature? Record verdict + screenshot in `docs/spikes.md`.
- [ ] **Step 4: ULP check** — `spikes/ulp_check.gd`:
```gdscript
extends SceneTree
# Run: bin/godot --headless -s res://spikes/ulp_check.gd
func _initialize() -> void:
    for dist in [5000.0, 20000.0, 40000.0]:
        var f := float(dist)          # float64 -> float32 via Godot single-precision Vector3
        var v := Vector3(f, 0, 0)
        var next := Vector3(nextafterf_up(f), 0, 0)
        print("at %.0f m: float32 step = %.6f m" % [dist, next.x - v.x])
    quit(0)
func nextafterf_up(x: float) -> float:
    var step := x * 1.19209e-7  # ~1 ULP for float32
    return x + step
```
Run; expected output ≈ `0.0006 / 0.0024 / 0.0048 m`. Record: at ±20 km the render-frame quantum is ~2.4 mm — invisible at jet scale; the bounded ±20 km arena stands. Log in `docs/spikes.md`.
- [ ] **Step 5: Commit** — `git add -A && git commit -m "spike: chord/ghosting, gesture momentum, altitude look, ULP check + results log"`

---

### Task 14: The M0 feel gate

**Files:**
- Create: `docs/m0-gate.md`

- [ ] **Step 1: Write the gate checklist** — `docs/m0-gate.md`:
```markdown
# M0 Feel Gate — the project's go/no-go

Fly each beat (1 Perch, 2 Break, 3 Saddle) in BOTH variants (F1). Answer honestly.

## Grammar
- [ ] Hold-↑ toward the bandit feels like *flying BFM*, not watching an autopilot. (A? B? both? neither?)
- [ ] Tap-to-ease (↓ while pulling) is discoverable and useful mid-fight.
- [ ] Double-tap-hold into buffet feels like a deliberate demand, not an accident. False-trigger rate acceptable?
- [ ] Quantized roll taps put the lift vector where your eyes already were.
- [ ] Release-to-settle never fights an input you meant to keep.
- [ ] Verdict: variant A / variant B / a hybrid / redesign (spec §15.1 fallbacks).

## Camera & views
- [ ] Maneuver view: never disorienting through a full turning fight; horizon always recoverable.
- [ ] Gun blend: arrives when wanted, leaves when the solution collapses, never surprises.
- [ ] Freelook + Space padlock round-trip doesn't lose the bandit.

## Hardware (from docs/spikes.md)
- [ ] All ≤3-key fight chords register on the internal keyboard.
- [ ] Gesture momentum tail measured; deadband decision recorded.
- [ ] Altitude look verdict recorded; ULP numbers recorded.

## Gate decision
- [ ] PASS → proceed to M1 (honest airplane). Record variant decision + grammar tuning notes below.
- [ ] FAIL → iterate grammar HERE (thresholds in KeyGrammar/DetentLayer; test-first), nothing else gets built.

Notes:
```
- [ ] **Step 2: USER TASK — fly the gate.** Play all three beats, both variants, fill in `docs/m0-gate.md`. This is the milestone's exit and the user's call, not the implementer's.
- [ ] **Step 3: Commit** — `git add -A && git commit -m "docs: M0 feel gate checklist + results"`

---

## Self-review (performed at planning time)

1. **Spec coverage (M0 scope, §14):** C# kernel float64 headless ✓ (Tasks 0–8, `dotnet test`); placeholder reduced FM ✓ (T2); flat sea arena ✓ (T10); scripted rail bandit ✓ (T7); hand-authored doctrine for 3 beats ✓ (T5/T7); full detent grammar with both variants + toggle ✓ (T4/T6/T11); padlock + maneuver/gun view states ✓ (T8/T11); stick indicator ✓ (T12); suggestion prompts ✓ (T7/T12); four spikes ✓ (T13); feel gate ✓ (T14). Deliberately deferred per spec: eyeball-honesty padlock rules (M2), SA strip (M2), real doctrine selector (M3), guns/ballistics (M4 — M0 trigger is dry with in-window tally).
2. **Placeholder scan:** all `PLACEHOLDER` markers are in code comments labeling M1-replaceable *values*, per Global Constraints — no plan-level TBDs remain.
3. **Type consistency:** `GKey` enum order matches `input_adapter.gd` MAP comment; `GetCameraPose(1/2)` matches `CameraMode.Maneuver/Gun` ordinals (Free=0); HUD dict keys in T9 match T12 usage; `PhaseAt` vs `Phase` usage consistent between T4 tests and T6 implementation.
```
