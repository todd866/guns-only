# Rapier Approach-Stabilisation Solver Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Compute, every tick and from any aircraft state, a flyable path to a stabilised approach, and publish it — so the pilot can judge an efficient approach instead of flying an invisible slalom.

**Architecture:** A pure `sim/Recovery/` module with no I/O, called from `SimulationSession.UpdateRecoveryProcedure`, published through `SnapshotProjection`/`SnapshotHotFrame`. The approach is always flyable: excess energy lengthens the path rather than failing a check. Presentation is a later plan and consumes only the published solution.

**Tech Stack:** C# / .NET 8, xUnit (`sim.Tests`), deterministic fixed-step kernel. No new dependencies.

## Global Constraints

- Target framework net8.0; no new NuGet dependencies.
- `sim/` is pure: no I/O, no clock reads, no randomness. Determinism is a hard requirement.
- All angles in radians internally; all distances in metres; speeds in m/s. Knots only at the presentation boundary.
- Namespace `GunsOnly.Sim.Recovery` for new files; existing `GunsOnly.Sim` types stay where they are.
- Repo gate is `bin/check`. Full .NET suite: `bin/dotnet-env` then `dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj`.
- Commit style: imperative subject, no trailing period, plus the repo's Co-Authored-By/Claude-Session trailers.
- **Deviation from spec, recorded deliberately:** the spec lists S-turns as a distinct extension device between downwind extension and a 360. This plan implements `None` / `ExtendDownwind` / `Orbit360` only. An S-turn is the same energy device as a downwind extension with worse map legibility; folding it in avoids a third geometry with no distinct pilot decision. Revisit if the extension band proves too coarse in flight.

---

### Task 1: Energy core

The physics the whole solver rests on. Energy height `Es = h + V²/2g`; excess energy divided by a drag-to-weight ratio gives the track distance needed to shed it (from `D·s = W·ΔEs`).

**Files:**
- Create: `sim/Recovery/ApproachEnergy.cs`
- Test: `sim.Tests/Recovery/ApproachEnergyTests.cs`

**Interfaces:**
- Consumes: nothing.
- Produces: `GunsOnly.Sim.Recovery.ApproachEnergy.SpecificEnergyM(double altitudeM, double trueAirspeedMps) -> double`; `ApproachEnergy.TrackDistanceRequiredM(double excessEnergyHeightM, double dragToWeight) -> double`; `const double ApproachEnergy.GravityMps2`.

- [ ] **Step 1: Write the failing test**

```csharp
using GunsOnly.Sim.Recovery;
using Xunit;

namespace GunsOnly.Sim.Tests.Recovery;

public class ApproachEnergyTests {
    [Fact]
    public void SpecificEnergyAddsTheHeightSpeedCouldBuy() {
        // 100 m/s trades to 100^2 / (2 * 9.80665) = 509.86 m of height.
        Assert.Equal(509.86, ApproachEnergy.SpecificEnergyM(0.0, 100.0), precision: 2);
        Assert.Equal(1509.86, ApproachEnergy.SpecificEnergyM(1000.0, 100.0), precision: 2);
        Assert.Equal(1000.0, ApproachEnergy.SpecificEnergyM(1000.0, 0.0), precision: 6);
    }

    [Fact]
    public void TrackDistanceIsExcessEnergyOverDragToWeight() {
        // D*s = W*dEs  =>  s = dEs / (D/W). 1000 m of excess at 0.10 needs 10 km.
        Assert.Equal(10_000.0, ApproachEnergy.TrackDistanceRequiredM(1000.0, 0.10), precision: 6);
        Assert.Equal(4_000.0, ApproachEnergy.TrackDistanceRequiredM(1000.0, 0.25), precision: 6);
    }

    [Fact]
    public void NoExcessNeedsNoTrackAndDegenerateDragCannotDivideByZero() {
        Assert.Equal(0.0, ApproachEnergy.TrackDistanceRequiredM(0.0, 0.1));
        Assert.Equal(0.0, ApproachEnergy.TrackDistanceRequiredM(-500.0, 0.1));
        Assert.True(double.IsFinite(ApproachEnergy.TrackDistanceRequiredM(1000.0, 0.0)));
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `. bin/dotnet-env && "$dotnet_cli" test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~ApproachEnergyTests"`
Expected: FAIL — build error, `ApproachEnergy` does not exist.

- [ ] **Step 3: Write minimal implementation**

```csharp
namespace GunsOnly.Sim.Recovery;

/// Energy bookkeeping for a recovery. Energy height is the single currency: altitude and speed are
/// interchangeable, and drag is the only way to spend either. Pure; no aircraft state is held here.
public static class ApproachEnergy {
    public const double GravityMps2 = 9.80665;

    /// Energy height: the altitude reachable by trading all airspeed for height.
    public static double SpecificEnergyM(double altitudeM, double trueAirspeedMps) =>
        altitudeM + trueAirspeedMps * trueAirspeedMps / (2.0 * GravityMps2);

    /// Track distance needed to shed an energy-height excess, from D*s = W*dEs. dragToWeight is
    /// the achievable drag-to-weight ratio in the configuration actually available.
    public static double TrackDistanceRequiredM(double excessEnergyHeightM, double dragToWeight) {
        if (!(excessEnergyHeightM > 0.0) || !double.IsFinite(excessEnergyHeightM)) return 0.0;
        double ratio = System.Math.Max(dragToWeight, 1e-3);
        return excessEnergyHeightM / ratio;
    }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `. bin/dotnet-env && "$dotnet_cli" test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~ApproachEnergyTests"`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add sim/Recovery/ApproachEnergy.cs sim.Tests/Recovery/ApproachEnergyTests.cs
git commit -m "Add the recovery energy core"
```

---

### Task 2: Path synthesis

Turn "I need more track than I have" into a specific, drawable path. Never returns "impossible".

**Files:**
- Create: `sim/Recovery/ApproachPath.cs`
- Test: `sim.Tests/Recovery/ApproachPathTests.cs`

**Interfaces:**
- Consumes: Task 1 (not directly — callers pass distances in).
- Produces: `enum ApproachExtensionKind { None, ExtendDownwind, Orbit360 }`; `readonly record struct ApproachPathSolution(ApproachExtensionKind Kind, double DownwindExtensionM, int Orbits, double TotalTrackM)`; `ApproachPath.Solve(double directTrackM, double requiredTrackM, double turnRadiusM) -> ApproachPathSolution`; `const double ApproachPath.MaxDownwindExtensionM`.

- [ ] **Step 1: Write the failing test**

```csharp
using System;
using GunsOnly.Sim.Recovery;
using Xunit;

namespace GunsOnly.Sim.Tests.Recovery;

public class ApproachPathTests {
    [Fact]
    public void EnoughTrackFlownDirectNeedsNoExtension() {
        var s = ApproachPath.Solve(directTrackM: 20_000.0, requiredTrackM: 12_000.0, turnRadiusM: 2_000.0);
        Assert.Equal(ApproachExtensionKind.None, s.Kind);
        Assert.Equal(0.0, s.DownwindExtensionM);
        Assert.Equal(0, s.Orbits);
        Assert.Equal(20_000.0, s.TotalTrackM, precision: 6);
    }

    [Fact]
    public void ASmallDeficitExtendsTheDownwindByHalfTheDeficit() {
        // Extending downwind by d adds 2d of track: out and back.
        var s = ApproachPath.Solve(directTrackM: 10_000.0, requiredTrackM: 14_000.0, turnRadiusM: 2_000.0);
        Assert.Equal(ApproachExtensionKind.ExtendDownwind, s.Kind);
        Assert.Equal(2_000.0, s.DownwindExtensionM, precision: 6);
        Assert.Equal(14_000.0, s.TotalTrackM, precision: 6);
    }

    [Fact]
    public void ADeficitBeyondTheDownwindCapAddsWholeOrbits() {
        double cap = 2.0 * ApproachPath.MaxDownwindExtensionM;
        double orbit = 2.0 * Math.PI * 2_000.0;
        // Deficit one metre past the cap must buy exactly one orbit, not a fractional one.
        var s = ApproachPath.Solve(10_000.0, 10_000.0 + cap + 1.0, 2_000.0);
        Assert.Equal(ApproachExtensionKind.Orbit360, s.Kind);
        Assert.Equal(ApproachPath.MaxDownwindExtensionM, s.DownwindExtensionM, precision: 6);
        Assert.Equal(1, s.Orbits);
        Assert.Equal(10_000.0 + cap + orbit, s.TotalTrackM, precision: 3);
    }

    [Fact]
    public void MoreExcessNeverReturnsAShorterPath() {
        double previous = 0.0;
        for (double required = 5_000.0; required <= 200_000.0; required += 2_500.0) {
            var s = ApproachPath.Solve(10_000.0, required, 2_000.0);
            Assert.True(s.TotalTrackM >= previous - 1e-6,
                $"path shortened at required={required}: {s.TotalTrackM} < {previous}");
            Assert.True(s.TotalTrackM >= required - 1e-6, "path must cover the requirement");
            previous = s.TotalTrackM;
        }
    }

    [Fact]
    public void DegenerateInputsStillProduceAFlyablePath() {
        var s = ApproachPath.Solve(double.NaN, 50_000.0, 0.0);
        Assert.True(double.IsFinite(s.TotalTrackM));
        Assert.True(s.TotalTrackM >= 0.0);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `. bin/dotnet-env && "$dotnet_cli" test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~ApproachPathTests"`
Expected: FAIL — `ApproachPath` does not exist.

- [ ] **Step 3: Write minimal implementation**

```csharp
using System;

namespace GunsOnly.Sim.Recovery;

public enum ApproachExtensionKind { None, ExtendDownwind, Orbit360 }

/// The synthesised path: how the required track distance is actually bought.
public readonly record struct ApproachPathSolution(
    ApproachExtensionKind Kind,
    double DownwindExtensionM,
    int Orbits,
    double TotalTrackM);

/// Buys track distance. There is no infeasible case: excess energy lengthens the path, exactly as
/// vectoring extends a downwind or issues a 360. Fuel, priced elsewhere, is the real limit.
public static class ApproachPath {
    /// Beyond this the downwind stops being a pattern and becomes a departure; orbits take over.
    public const double MaxDownwindExtensionM = 9_260.0; // 5 NM

    public static ApproachPathSolution Solve(
        double directTrackM, double requiredTrackM, double turnRadiusM) {
        double direct = Finite(directTrackM, 0.0);
        double required = Finite(requiredTrackM, 0.0);
        double radius = Math.Max(Finite(turnRadiusM, 0.0), 1.0);

        double deficit = required - direct;
        if (deficit <= 0.0)
            return new ApproachPathSolution(ApproachExtensionKind.None, 0.0, 0, direct);

        // Extending the downwind by d adds 2d of track: outbound and inbound.
        double cap = 2.0 * MaxDownwindExtensionM;
        if (deficit <= cap)
            return new ApproachPathSolution(
                ApproachExtensionKind.ExtendDownwind, deficit / 2.0, 0, direct + deficit);

        double orbitM = 2.0 * Math.PI * radius;
        int orbits = (int)Math.Ceiling((deficit - cap) / orbitM);
        return new ApproachPathSolution(
            ApproachExtensionKind.Orbit360,
            MaxDownwindExtensionM,
            orbits,
            direct + cap + orbits * orbitM);
    }

    static double Finite(double value, double fallback) =>
        double.IsFinite(value) ? Math.Max(value, 0.0) : fallback;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `. bin/dotnet-env && "$dotnet_cli" test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~ApproachPathTests"`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add sim/Recovery/ApproachPath.cs sim.Tests/Recovery/ApproachPathTests.cs
git commit -m "Buy recovery track distance instead of failing an approach"
```

---

### Task 3: The solver

Assembles energy and path into the published solution, and derives the gates along it.

**Files:**
- Create: `sim/Recovery/ApproachSolver.cs`
- Test: `sim.Tests/Recovery/ApproachSolverTests.cs`

**Interfaces:**
- Consumes: `ApproachEnergy`, `ApproachPath` (Tasks 1–2), and `GunsOnly.Sim.Vec3D`.
- Produces: `readonly record struct ApproachSolverInput(Vec3D Position, double TrueAirspeedMps, Vec3D Threshold, double StabilisationAltitudeM, double StabilisationSpeedMps, double DragToWeight, double TurnRadiusM)`; `readonly record struct ApproachGate(string Id, string Label, double DistanceToGoM, double TargetAltitudeM, double TargetSpeedMps, bool DirtyConfig)`; `readonly record struct ApproachSolution(bool Valid, double ExcessEnergyM, double TrackRequiredM, double TrackAvailableM, ApproachPathSolution Path, System.Collections.Generic.IReadOnlyList<ApproachGate> Gates)`; `ApproachSolver.Solve(in ApproachSolverInput input) -> ApproachSolution`.

- [ ] **Step 1: Write the failing test**

```csharp
using GunsOnly.Sim;
using GunsOnly.Sim.Recovery;
using Xunit;

namespace GunsOnly.Sim.Tests.Recovery;

public class ApproachSolverTests {
    static ApproachSolverInput Input(double altitudeM, double tasMps, double rangeM) => new(
        Position: new Vec3D(0.0, altitudeM, rangeM),
        TrueAirspeedMps: tasMps,
        Threshold: new Vec3D(0.0, 0.0, 0.0),
        StabilisationAltitudeM: 152.0,   // 500 ft
        StabilisationSpeedMps: 90.0,     // ~175 kt
        DragToWeight: 0.12,
        TurnRadiusM: 2_000.0);

    [Fact]
    public void AnOnProfileArrivalNeedsNoExtension() {
        var s = ApproachSolver.Solve(Input(altitudeM: 900.0, tasMps: 110.0, rangeM: 30_000.0));
        Assert.True(s.Valid);
        Assert.Equal(ApproachExtensionKind.None, s.Path.Kind);
        Assert.True(s.TrackRequiredM <= s.TrackAvailableM);
    }

    [Fact]
    public void HighAndFastAndCloseBuysTrackRatherThanFailing() {
        var s = ApproachSolver.Solve(Input(altitudeM: 12_000.0, tasMps: 320.0, rangeM: 15_000.0));
        Assert.True(s.Valid, "the solver must never refuse an approach");
        Assert.NotEqual(ApproachExtensionKind.None, s.Path.Kind);
        Assert.True(s.Path.TotalTrackM >= s.TrackRequiredM - 1e-6);
        Assert.True(s.ExcessEnergyM > 0.0);
    }

    [Fact]
    public void GatesDescendAndDecelerateTowardTheThreshold() {
        var s = ApproachSolver.Solve(Input(6_000.0, 200.0, 40_000.0));
        Assert.NotEmpty(s.Gates);
        for (int i = 1; i < s.Gates.Count; i++) {
            Assert.True(s.Gates[i].DistanceToGoM < s.Gates[i - 1].DistanceToGoM,
                "gates must sequence toward the threshold");
            Assert.True(s.Gates[i].TargetAltitudeM <= s.Gates[i - 1].TargetAltitudeM + 1e-6);
            Assert.True(s.Gates[i].TargetSpeedMps <= s.Gates[i - 1].TargetSpeedMps + 1e-6);
        }
        ApproachGate last = s.Gates[^1];
        Assert.Equal(152.0, last.TargetAltitudeM, precision: 3);
        Assert.Equal(90.0, last.TargetSpeedMps, precision: 3);
        Assert.True(last.DirtyConfig, "the stabilisation gate is flown dirty");
    }

    [Fact]
    public void TheSolverIsDeterministic() {
        var a = ApproachSolver.Solve(Input(8_000.0, 250.0, 25_000.0));
        var b = ApproachSolver.Solve(Input(8_000.0, 250.0, 25_000.0));
        Assert.Equal(a.TrackRequiredM, b.TrackRequiredM, precision: 9);
        Assert.Equal(a.Path.TotalTrackM, b.Path.TotalTrackM, precision: 9);
        Assert.Equal(a.Gates.Count, b.Gates.Count);
    }

    [Fact]
    public void NonFiniteStateIsReportedInvalidRatherThanThrowing() {
        var s = ApproachSolver.Solve(Input(double.NaN, 200.0, 20_000.0));
        Assert.False(s.Valid);
        Assert.Empty(s.Gates);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `. bin/dotnet-env && "$dotnet_cli" test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~ApproachSolverTests"`
Expected: FAIL — `ApproachSolver` does not exist.

- [ ] **Step 3: Write minimal implementation**

```csharp
using System;
using System.Collections.Generic;

namespace GunsOnly.Sim.Recovery;

public readonly record struct ApproachSolverInput(
    Vec3D Position,
    double TrueAirspeedMps,
    Vec3D Threshold,
    double StabilisationAltitudeM,
    double StabilisationSpeedMps,
    double DragToWeight,
    double TurnRadiusM);

/// A point on the solved profile. DistanceToGoM is measured along the path, not straight-line.
public readonly record struct ApproachGate(
    string Id,
    string Label,
    double DistanceToGoM,
    double TargetAltitudeM,
    double TargetSpeedMps,
    bool DirtyConfig);

public readonly record struct ApproachSolution(
    bool Valid,
    double ExcessEnergyM,
    double TrackRequiredM,
    double TrackAvailableM,
    ApproachPathSolution Path,
    IReadOnlyList<ApproachGate> Gates);

/// Continuously answers "how do I stabilise from here". Pure and deterministic: same input, same
/// solution, every tick. Never refuses — surplus energy is spent as track distance.
public static class ApproachSolver {
    const int GateCount = 4;
    static readonly IReadOnlyList<ApproachGate> NoGates = Array.Empty<ApproachGate>();

    public static ApproachSolution Solve(in ApproachSolverInput input) {
        if (!input.Position.IsFinite || !input.Threshold.IsFinite
            || !double.IsFinite(input.TrueAirspeedMps)
            || !double.IsFinite(input.StabilisationAltitudeM)
            || !double.IsFinite(input.StabilisationSpeedMps))
            return new ApproachSolution(false, 0.0, 0.0, 0.0, default, NoGates);

        double dx = input.Position.X - input.Threshold.X;
        double dz = input.Position.Z - input.Threshold.Z;
        double directTrackM = Math.Sqrt(dx * dx + dz * dz);

        double current = ApproachEnergy.SpecificEnergyM(input.Position.Y, input.TrueAirspeedMps);
        double target = ApproachEnergy.SpecificEnergyM(
            input.StabilisationAltitudeM, input.StabilisationSpeedMps);
        double excess = Math.Max(0.0, current - target);
        double required = ApproachEnergy.TrackDistanceRequiredM(excess, input.DragToWeight);

        ApproachPathSolution path = ApproachPath.Solve(directTrackM, required, input.TurnRadiusM);
        return new ApproachSolution(
            true, excess, required, path.TotalTrackM, path,
            BuildGates(path.TotalTrackM, input));
    }

    /// Gates are outputs of the solution, spaced along the solved path. The last one is the
    /// stabilisation point itself, which is why it carries the stabilisation altitude and speed.
    static IReadOnlyList<ApproachGate> BuildGates(double totalTrackM, in ApproachSolverInput input) {
        double startAltitude = Math.Max(input.Position.Y, input.StabilisationAltitudeM);
        double startSpeed = Math.Max(input.TrueAirspeedMps, input.StabilisationSpeedMps);
        var gates = new List<ApproachGate>(GateCount);
        for (int i = 1; i <= GateCount; i++) {
            double fraction = (double)i / GateCount;          // 0.25 .. 1.0 along the path
            double toGo = Math.Max(0.0, totalTrackM * (1.0 - fraction));
            bool dirty = fraction >= 0.5;
            gates.Add(new ApproachGate(
                $"gate_{i}",
                i == GateCount ? "STABILISE" : $"GATE {i}",
                toGo,
                Lerp(startAltitude, input.StabilisationAltitudeM, fraction),
                Lerp(startSpeed, input.StabilisationSpeedMps, fraction),
                dirty));
        }
        return gates;
    }

    static double Lerp(double from, double to, double t) => from + (to - from) * t;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `. bin/dotnet-env && "$dotnet_cli" test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~ApproachSolverTests"`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add sim/Recovery/ApproachSolver.cs sim.Tests/Recovery/ApproachSolverTests.cs
git commit -m "Solve the recovery approach from any state"
```

---

### Task 4: Retire the sphere-conjunction stall and fix the units defect

`RecoveryProcedure.Step` currently advances only when position, speed and configuration all hold on one tick inside a 250–700 m sphere, so a single missed gate stalls the ladder for the rest of the flight. It also compares an indicated airspeed against a true-airspeed target.

**Files:**
- Modify: `sim/RecoveryProcedure.cs:81-104` (`Step`)
- Modify: `sim/SimulationSession.cs:3158-3166` (`UpdateRecoveryProcedure`)
- Test: `sim.Tests/Recovery/RecoveryProcedureAdvanceTests.cs`

**Interfaces:**
- Consumes: nothing from Tasks 1–3.
- Produces: `RecoveryProcedure.Step(in Vec3D position, double trueAirspeedKnots, bool gearDown, bool flapsDown)` — parameter renamed and now genuinely true airspeed; `RecoveryProcedure.LastGateMissed -> bool`.

- [ ] **Step 1: Write the failing test**

```csharp
using GunsOnly.Sim;
using Xunit;

namespace GunsOnly.Sim.Tests.Recovery;

public class RecoveryProcedureAdvanceTests {
    static RecoveryProcedure StraightIn() {
        var p = new RecoveryProcedure();
        Assert.True(p.TrySet(RecoveryProcedureKind.StraightIn, new Vec3D(0, 0, 0), 0.0));
        return p;
    }

    [Fact]
    public void PassingAGateBadlyStillAdvancesAndIsFlaggedMissed() {
        var p = StraightIn();
        RecoveryGate first = p.Gates[0];
        // Well above the gate and far too fast: under the old sphere conjunction this stalled
        // the ladder permanently.
        var high = new Vec3D(first.EastM, first.UpM + 3_000.0, first.NorthM);
        for (int i = 0; i < 5; i++) p.Step(high, first.TargetKtas + 200.0, false, false);
        Assert.True(p.ActiveIndex > 0, "a missed gate must not stall the ladder");
        Assert.True(p.LastGateMissed);
    }

    [Fact]
    public void FlyingAGateWellAdvancesWithoutBeingFlagged() {
        var p = StraightIn();
        RecoveryGate first = p.Gates[0];
        var onProfile = new Vec3D(first.EastM, first.UpM, first.NorthM);
        p.Step(onProfile, first.TargetKtas, false, false);
        Assert.True(p.ActiveIndex > 0);
        Assert.False(p.LastGateMissed);
    }

    [Fact]
    public void TheLadderReachesTheFinalGate() {
        var p = StraightIn();
        for (int guard = 0; guard < 200 && p.ActiveIndex < p.Gates.Count - 1; guard++) {
            RecoveryGate g = p.Gates[p.ActiveIndex];
            p.Step(new Vec3D(g.EastM, g.UpM, g.NorthM), g.TargetKtas, g.DirtyConfig, g.DirtyConfig);
        }
        Assert.Equal(p.Gates.Count - 1, p.ActiveIndex);
    }
}
```

- [ ] **Step 2: Run test to verify it fails**

Run: `. bin/dotnet-env && "$dotnet_cli" test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~RecoveryProcedureAdvanceTests"`
Expected: FAIL — `LastGateMissed` does not exist; the first test also fails on `ActiveIndex` staying 0.

- [ ] **Step 3: Write minimal implementation**

Replace the body of `Step` in `sim/RecoveryProcedure.cs` (currently lines 81–104) with a
face-crossing capture that always advances, and add the backing property:

```csharp
    /// True when the gate just sequenced was crossed outside its energy or configuration band.
    /// Deviation is reported, never used to block the ladder: a recovery that silently stops
    /// sequencing is indistinguishable from a broken one.
    public bool LastGateMissed { get; private set; }

    public void Step(in Vec3D position, double trueAirspeedKnots, bool gearDown, bool flapsDown) {
        if (_gates.Count == 0 || _kind == RecoveryProcedureKind.None) {
            _inVolume = false;
            _energyOk = false;
            _configOk = false;
            return;
        }

        if (_activeIndex < 0) _activeIndex = 0;
        if (_activeIndex >= _gates.Count) _activeIndex = _gates.Count - 1;
        RecoveryGate gate = _gates[_activeIndex];
        double dx = position.X - gate.EastM;
        double dy = position.Y - gate.UpM;
        double dz = position.Z - gate.NorthM;

        // Lateral capture corridor: vertical error is graded, not gating. Arriving 3,000 m high
        // is a deviation to display, not a reason to stop sequencing.
        double lateralM = System.Math.Sqrt(dx * dx + dz * dz);
        double corridorM = gate.HalfM * CaptureCorridorScale;
        _inVolume = lateralM <= corridorM && System.Math.Abs(dy) <= corridorM;
        _energyOk = System.Math.Abs(trueAirspeedKnots - gate.TargetKtas) <= EnergyBandKtas;
        _configOk = gate.DirtyConfig
            ? gearDown && flapsDown
            : !gearDown && !flapsDown;

        // Sequence on proximity alone. Passing abeam or through, on profile or not, the gate is
        // behind you once you are level with it.
        bool passed = lateralM <= corridorM;
        if (passed && _activeIndex < _gates.Count - 1) {
            LastGateMissed = !(_energyOk && _configOk && System.Math.Abs(dy) <= corridorM);
            _activeIndex++;
        }
    }
```

Add next to `EnergyBandKtas` (line 25):

```csharp
    /// Gate half-widths were authored for a sphere the pilot had to hit. As a lateral corridor
    /// they are the same numbers doing an easier job, widened so sequencing is forgiving.
    public const double CaptureCorridorScale = 2.0;
```

Then fix the caller in `sim/SimulationSession.cs` `UpdateRecoveryProcedure` — it currently passes an
indicated airspeed into a true-airspeed comparison:

```csharp
    void UpdateRecoveryProcedure() {
        if (_recoveryProcedure.Kind == RecoveryProcedureKind.None) return;
        // RecoveryGate.TargetKtas is TRUE airspeed. Player.IndicatedAirspeedMps is not, and the
        // difference is the entire approach band by the top of a recovery.
        double trueAirspeedKnots = Player.State.Speed * AirData.MpsToKnots;
        _recoveryProcedure.Step(
            Player.State.Position,
            trueAirspeedKnots,
            PlayerSystems.AllGearDownAndLocked,
            System.Math.Max(PlayerSystems.LeftFlapDegrees, PlayerSystems.RightFlapDegrees) > 1.0);
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `. bin/dotnet-env && "$dotnet_cli" test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~RecoveryProcedureAdvanceTests"`
Expected: PASS, 3 tests.

Then run the whole suite, because `RecoveryProcedure` is consumed by the Rapier mission and snapshot tests:

Run: `. bin/dotnet-env && "$dotnet_cli" test sim.Tests/GunsOnly.Sim.Tests.csproj`
Expected: PASS. If an existing test asserts the old stalling behaviour, it is asserting the bug — update it and say so in the commit body.

- [ ] **Step 5: Commit**

```bash
git add sim/RecoveryProcedure.cs sim/SimulationSession.cs sim.Tests/Recovery/RecoveryProcedureAdvanceTests.cs
git commit -m "Stop a missed recovery gate from stalling the ladder"
```

---

### Task 5: Publish the solution

Nothing above reaches a pilot until the snapshot carries it. This task only publishes; drawing is the next plan.

**Files:**
- Modify: `sim/SimulationSession.cs` (call the solver in `UpdateRecoveryProcedure`, expose properties)
- Modify: `web/SnapshotProjection.cs` (near the existing `recovery_gate_*` block)
- Modify: `web/SnapshotHotFrame.cs` (mirror the same keys)
- Test: `sim.Tests/SnapshotProjectionTests.cs`

**Interfaces:**
- Consumes: `ApproachSolver.Solve` and `ApproachSolution` (Task 3).
- Produces: snapshot keys `approach_solution_valid` (bool), `approach_excess_energy_m`, `approach_track_required_m`, `approach_track_available_m`, `approach_extension_kind` (string: `none`/`extend_downwind`/`orbit_360`), `approach_orbits` (int); `SimulationSession.ApproachSolution -> ApproachSolution`.

- [ ] **Step 1: Write the failing test**

```csharp
    [Fact]
    public void SnapshotPublishesTheApproachSolution() {
        var session = new SimulationSession(10);
        session.SetTerrainSurface(Assert.IsAssignableFrom<ITerrainSurface>(
            UkraineTerrainTruth.Load()));
        session.Begin();
        for (int tick = 0; tick < AircraftSim.TickHz; tick++) session.StepFixed();

        string json = SnapshotProjection.Project(session);
        Assert.Contains("\"approach_solution_valid\":", json);
        Assert.Contains("\"approach_track_required_m\":", json);
        Assert.Contains("\"approach_track_available_m\":", json);
        Assert.Contains("\"approach_extension_kind\":", json);
        // The solver never refuses, so a live Rapier sortie must always carry a valid solution.
        Assert.Contains("\"approach_solution_valid\":true", json);
    }
```

Add it to `sim.Tests/SnapshotProjectionTests.cs`, matching that file's existing `SnapshotProjection.Project` call convention — read the neighbouring tests first and copy their setup exactly rather than the sketch above if it differs.

- [ ] **Step 2: Run test to verify it fails**

Run: `. bin/dotnet-env && "$dotnet_cli" test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~SnapshotPublishesTheApproachSolution"`
Expected: FAIL — key absent from the projected JSON.

- [ ] **Step 3: Write minimal implementation**

In `SimulationSession`, cache the solution each tick inside `UpdateRecoveryProcedure` and expose it:

```csharp
    ApproachSolution _approachSolution;
    public ApproachSolution ApproachSolution => _approachSolution;
```

Append to `UpdateRecoveryProcedure`, after the existing `_recoveryProcedure.Step(...)` call:

```csharp
        RecoveryGate? last = _recoveryProcedure.Gates.Count > 0
            ? _recoveryProcedure.Gates[^1]
            : null;
        if (last is { } stabilise) {
            _approachSolution = ApproachSolver.Solve(new ApproachSolverInput(
                Player.State.Position,
                Player.State.Speed,
                new Vec3D(stabilise.EastM, stabilise.UpM, stabilise.NorthM),
                StabilisationAltitudeM: stabilise.UpM,
                StabilisationSpeedMps: stabilise.TargetKtas / AirData.MpsToKnots,
                DragToWeight: RecoveryDragToWeight,
                TurnRadiusM: RecoveryTurnRadiusM));
        }
```

Add the two provisional constants next to it, with the honesty the spec asks for:

```csharp
    /// Provisional until fitted from a flown RTB. The Rapier currently overruns its own documented
    /// ceiling, so a decel model derived from arithmetic rather than telemetry would demand
    /// implausible track distance and read as an approach defect rather than a propulsion one.
    const double RecoveryDragToWeight = 0.12;
    const double RecoveryTurnRadiusM = 2_000.0;
```

In `web/SnapshotProjection.cs`, beside the existing `recovery_gate_*` emissions:

```csharp
            + $"\"approach_solution_valid\":{(Session.ApproachSolution.Valid ? "true" : "false")},"
            + $"\"approach_excess_energy_m\":{Num(Session.ApproachSolution.ExcessEnergyM)},"
            + $"\"approach_track_required_m\":{Num(Session.ApproachSolution.TrackRequiredM)},"
            + $"\"approach_track_available_m\":{Num(Session.ApproachSolution.TrackAvailableM)},"
            + $"\"approach_extension_kind\":{SnapshotJson.JsonString(ExtensionKindId(Session.ApproachSolution.Path.Kind))},"
            + $"\"approach_orbits\":{Session.ApproachSolution.Path.Orbits},"
```

using the file's existing numeric formatting helper for `Num` (match the surrounding lines exactly),
plus:

```csharp
    static string ExtensionKindId(ApproachExtensionKind kind) => kind switch {
        ApproachExtensionKind.ExtendDownwind => "extend_downwind",
        ApproachExtensionKind.Orbit360 => "orbit_360",
        _ => "none",
    };
```

Mirror the same six keys in `web/SnapshotHotFrame.cs` beside its `recovery_gate_*` writers, using
that file's `w.Bool` / `w.Num` / `w.Str` convention.

- [ ] **Step 4: Run test to verify it passes**

Run: `. bin/dotnet-env && "$dotnet_cli" test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~Snapshot"`
Expected: PASS, including the existing hot-frame/projection parity tests — they assert the two writers agree, so a key added to one and not the other fails here.

- [ ] **Step 5: Run the full gate and commit**

```bash
bin/check
git add sim/SimulationSession.cs web/SnapshotProjection.cs web/SnapshotHotFrame.cs sim.Tests/SnapshotProjectionTests.cs
git commit -m "Publish the approach solution to the snapshot"
```

---

## Self-review

**Spec coverage.** Energy core → Task 1. Always-flyable/track-miles rule → Task 2. Solver, path synthesis, derived gates, deterministic fixed-step, continuous deviation inputs → Task 3. Sphere-conjunction deletion, capture-by-crossing, always-advance, units defect → Task 4. Publication → Task 5.

**Deliberately deferred to later plans**, each named in the decomposition: HUD and ANCA Navigate wiring; fuel-cost-of-extension surfacing; plan-view ARC mode, altitude range arc and predicted track curve; the vertical situation display; the headless multi-quadrant profile harness (it exercises presentation-independent solver behaviour but belongs with the OFT rigs, and Task 3's determinism and monotonicity tests cover the kernel until then).

**Known deviation:** S-turn extension folded into `ExtendDownwind` — recorded with rationale in Global Constraints.

**Open risk, not resolvable in code:** `RecoveryDragToWeight = 0.12` is a placeholder value, flagged in-source. Fit it from a flown Rapier RTB before trusting any track-distance number the solver reports.
