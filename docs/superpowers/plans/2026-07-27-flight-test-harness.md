# Flight-Test Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build `sim/FlightTest` so `Evaluator.Evaluate(Rapier, interceptor-tbcc-v1)` returns a readable engineering report and fails CI on today’s homesick-angel climb / T/W drift — keeping teaching jets verifiably honest before they are missionized.

**Architecture:** One deep module with four agreeing layers (Identity → Point performance → Dynamic holds → Mission advisory). Small public surface: `Evaluator.Evaluate(AirframeUnderTest, FlightTestProgram) → FlightTestReport`. Gates live in the program, not in the propulsion map. Spec: `docs/superpowers/specs/2026-07-27-flight-test-harness-design.md`.

**Tech Stack:** C# (.NET 8), `GunsOnly.Sim`, xUnit. Test invocation:
`$HOME/.dotnet/dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~FlightTest"`.
Full gate: `PATH="/opt/homebrew/bin:$PATH" GUNS_DOTNET_CLI="$HOME/.dotnet/dotnet" DOTNET_ROOT="$HOME/.dotnet" DOTNET_MULTILEVEL_LOOKUP=0 ./bin/check`.

## Global Constraints

- **Teaching product:** dynamics that survive this harness are what may be missionized into teaching tasks. Fun-but-wrong is a failed lesson, not a balance preference.
- **Aspirational Identity for Rapier v1:** Identity describes a credible interceptor (fail loud). Do not Identity-match the angel to green CI.
- **Mission layer advisory in v1:** Mission closure records findings but does not set `Passed = false` until Dynamic is green and a follow-up promotes it.
- **No web / Blob / renderer types in `sim/FlightTest/`.**
- **No propulsion buffs in this plan.** If gates fail, the report fails; retune Identity or schedule a separate engine branch — do not raise `ThrustMaxN` / burner / ram ratio to pass.
- **Determinism:** no wall clock / unseeded RNG in Evaluate or holds.
- **Family caps (interceptor-tbcc-v1):** augmented T/W at gross ≤ `1.20`; max climb γ while accelerating through M∈[0.9,1.3] ≤ `40°`; Identity↔params mass 2%, T/W 5%, W/S 2%, skin limit exact.
- **Commit only when the user asks** (repo rule); plan steps still say “commit” as optional checkpoints for agent runs that have explicit commit permission.

## File structure

| File | Responsibility |
|---|---|
| `sim/FlightTest/AirframeIdentity.cs` | Identity record + measured-from-params helper |
| `sim/FlightTest/FlightTestTypes.cs` | Subject, Program, Gate, Point, Report, Finding |
| `sim/FlightTest/PointPerformance.cs` | Ps, sustained/aero G, climb γ, corner (drone-derivation arithmetic) |
| `sim/FlightTest/EngineDeck.cs` | Propulsion-map grid samples (turbine/ram when available) |
| `sim/FlightTest/DynamicHolds.cs` | Named `AircraftSim` hold runners |
| `sim/FlightTest/Evaluator.cs` | `Evaluator.Evaluate` orchestration |
| `sim/FlightTest/ReportMarkdown.cs` | `ToMarkdown()` |
| `sim/FlightTest/Programs/InterceptorTbccV1.cs` | Program + aspirational Rapier Identity |
| `sim.Tests/FlightTest/IdentityTests.cs` | Drift / aspirational fail |
| `sim.Tests/FlightTest/PointPerformanceTests.cs` | Arithmetic fixtures |
| `sim.Tests/FlightTest/DynamicHoldTests.cs` | Homesick-angel climb gate |
| `sim.Tests/FlightTest/FlightTestEvaluateTests.cs` | End-to-end report + buff-creep |
| `docs/superpowers/specs/2026-07-27-flight-test-harness-design.md` | Already written; link from open-work if touched |

---

### Task 1: Core types + empty Evaluate

**Files:**
- Create: `sim/FlightTest/FlightTestTypes.cs`
- Create: `sim/FlightTest/AirframeIdentity.cs`
- Create: `sim/FlightTest/Evaluator.cs` (spec name `Evaluator.Evaluate` — class is `Evaluator` to avoid `FlightTest.FlightTest` stutter)
- Test: `sim.Tests/FlightTest/FlightTestEvaluateTests.cs`

**Interfaces:**
- Produces: `AirframeUnderTest`, `FlightTestProgram`, `FlightTestReport`, `Evaluator.Evaluate`

- [ ] **Step 1: Write the failing test**

```csharp
using GunsOnly.Sim;
using GunsOnly.Sim.FlightTest;

namespace GunsOnly.Sim.Tests.FlightTest;

public class FlightTestEvaluateTests {
    [Fact]
    public void EvaluateReturnsAReportWithSubjectId() {
        var subject = new AirframeUnderTest(
            Id: "rapier",
            Air: FlightModel.RapierPublicDataSurrogate,
            Propulsion: PropulsionModelKind.TurboRamjetPublicDataSurrogate);
        var program = new FlightTestProgram(
            Id: "interceptor-tbcc-v1",
            Version: "0",
            Gates: Array.Empty<FlightTestGate>(),
            Points: Array.Empty<FlightTestPoint>());

        FlightTestReport report = Evaluator.Evaluate(subject, program);

        Assert.Equal("rapier", report.SubjectId);
        Assert.Equal("interceptor-tbcc-v1", report.ProgramId);
    }
}
```

- [ ] **Step 2: Run test — expect compile/fail**

Run: `$HOME/.dotnet/dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~FlightTestEvaluateTests.EvaluateReturnsAReportWithSubjectId"`

- [ ] **Step 3: Minimal types + Evaluate stub**

```csharp
// sim/FlightTest/FlightTestTypes.cs
namespace GunsOnly.Sim.FlightTest;

public readonly record struct AirframeUnderTest(
    string Id,
    AircraftParams Air,
    PropulsionModelKind Propulsion,
    AirframeIdentity? Identity = null,
    Doctrine.BeatSetup? Mission = null);

public readonly record struct FlightTestGate(
    string Id,
    bool Blocking,
    string Description);

public readonly record struct FlightTestPoint(
    string Id,
    string Description);

public sealed record FlightTestFinding(
    string GateId,
    bool Blocking,
    string Message);

public sealed record FlightTestReport(
    string SubjectId,
    string ProgramId,
    string ProgramVersion,
    bool Passed,
    AirframeIdentity Identity,
    IReadOnlyList<FlightTestFinding> Findings) {
    public string ToMarkdown() => ReportMarkdown.Render(this);
}

public sealed record FlightTestProgram(
    string Id,
    string Version,
    IReadOnlyList<FlightTestGate> Gates,
    IReadOnlyList<FlightTestPoint> Points,
    MissionClosureSpec? MissionClosure = null);

public readonly record struct MissionClosureSpec(string BeatName);
```

```csharp
// sim/FlightTest/AirframeIdentity.cs
namespace GunsOnly.Sim.FlightTest;

public readonly record struct AirframeIdentity(
    string Role,
    double FuelFreeMassKg,
    double GrossMassKg,
    double WingLoadingKgM2,
    double DryThrustToWeight,
    double AugmentedThrustToWeight,
    double SkinTemperatureLimitK,
    string ComparisonFamily,
    double MaxClimbGammaDegWhileAcceleratingThroughMach1,
    double MinSustainedVsAeroGGap,
    string SourceDoc);
```

```csharp
// sim/FlightTest/Evaluator.cs
namespace GunsOnly.Sim.FlightTest;

public static class Evaluator {
    public static FlightTestReport Evaluate(
        AirframeUnderTest subject, FlightTestProgram program) {
        AirframeIdentity identity = subject.Identity
            ?? IdentityMeasurement.FromParams(subject.Air, inferred: true);
        return new FlightTestReport(
            subject.Id, program.Id, program.Version,
            Passed: true,
            identity,
            Findings: Array.Empty<FlightTestFinding>());
    }
}
```

Add a temporary `ReportMarkdown.Render` stub returning `""`, and `IdentityMeasurement.FromParams` that fills from `AircraftParams` (gross = `MassKg`, fuel-free = `FuelFreeMassKg` if > 0 else `MassKg`, W/S = gross/`WingAreaM2`, dry T/W = `ThrustMaxN/(gross*g)`, augmented = dry × `MaxThrustFraction`). Mark inferred identities with `SourceDoc: "(inferred)"` and empty comparison family / zero γ cap for now.

- [ ] **Step 4: Test passes**

- [ ] **Step 5: Commit (if permitted)** `feat(flight-test): add Evaluate stub and core types`

---

### Task 2: Identity measurement + drift gates

**Files:**
- Modify: `sim/FlightTest/AirframeIdentity.cs` (add `IdentityMeasurement`)
- Modify: `sim/FlightTest/Evaluator.cs` (run drift gates)
- Create: `sim/FlightTest/Programs/InterceptorTbccV1.cs`
- Test: `sim.Tests/FlightTest/IdentityTests.cs`

**Interfaces:**
- Consumes: `AirframeIdentity`, `AircraftParams`
- Produces: `InterceptorTbccV1.Program`, `InterceptorTbccV1.RapierAspirationalIdentity`, drift findings

- [ ] **Step 1: Failing tests**

```csharp
[Fact]
public void RapierParamsDisagreeWithAspirationalIdentity() {
    AirframeIdentity claim = InterceptorTbccV1.RapierAspirationalIdentity;
    AirframeIdentity measured = IdentityMeasurement.FromParams(
        FlightModel.RapierPublicDataSurrogate, inferred: false);

    // Aspirational augmented T/W at gross is ≤ 1.20; measured is ~1.39
    Assert.True(measured.AugmentedThrustToWeight > claim.AugmentedThrustToWeight + 0.05);
}

[Fact]
public void EvaluateFailsWhenIdentityDriftsFromParams() {
    var subject = new AirframeUnderTest(
        "rapier",
        FlightModel.RapierPublicDataSurrogate,
        PropulsionModelKind.TurboRamjetPublicDataSurrogate,
        Identity: InterceptorTbccV1.RapierAspirationalIdentity);
    FlightTestReport report = Evaluator.Evaluate(subject, InterceptorTbccV1.Program);
    Assert.False(report.Passed);
    Assert.Contains(report.Findings, f => f.GateId == "identity-tw-augmented" && f.Blocking);
}
```

- [ ] **Step 2: Run — expect fail**

- [ ] **Step 3: Implement aspirational Identity + drift checks**

`InterceptorTbccV1.RapierAspirationalIdentity`:

| Field | Value | Rationale |
|---|---|---|
| Role | `"dispersed TBCC interceptor"` | design record |
| FuelFreeMassKg | `5150` | matches kernel fuel-free |
| GrossMassKg | `9650` | matches `MassKg` |
| WingLoadingKgM2 | `9650/18` | match |
| DryThrustToWeight | `85000/(9650*9.80665)` ≈ `0.898` | match dry |
| AugmentedThrustToWeight | `1.15` | **aspirational** F-15-class; kernel is ~1.39 |
| SkinTemperatureLimitK | `1473.15` | match CMC claim |
| ComparisonFamily | `"turbine: F-15-class climb (aug T/W≤1.20); ram: SR-71-class dash claims"` | |
| MaxClimbGammaDegWhileAcceleratingThroughMach1 | `40` | homesick-angel catch |
| MinSustainedVsAeroGGap | `3.0` | energy game (drone brief) |
| SourceDoc | `"docs/superpowers/specs/2026-07-27-flight-test-harness-design.md"` | |

Drift gates in Evaluate (blocking): compare measured vs Identity for mass, W/S, dry T/W, **augmented T/W**, skin limit using Global Constraints tolerances. Gate ids: `identity-mass`, `identity-ws`, `identity-tw-dry`, `identity-tw-augmented`, `identity-skin`.

Also add program gate `tw-augmented-gross`: measured augmented T/W at gross ≤ `1.20` (blocking) — fails even if someone “fixes” Identity to match the angel without raising the family cap (finding must still fire `comparison-family-review` when Identity.Augmented > 1.20).

- [ ] **Step 4: Tests pass**

- [ ] **Step 5: Commit (if permitted)** `test(flight-test): aspirational Rapier Identity fails augmented T/W drift`

---

### Task 3: Point performance arithmetic

**Files:**
- Create: `sim/FlightTest/PointPerformance.cs`
- Test: `sim.Tests/FlightTest/PointPerformanceTests.cs`

**Interfaces:**
- Produces: `PointPerformance.AeroMaxG`, `SustainedG`, `SpecificExcessPowerMps`, `MaxClimbGammaDeg`, `CornerSpeedMps`

Use ISA via `StandardAtmosphere1976.Instance`. Weight W = m g. Dynamic pressure q = ½ ρ V².

```csharp
public static class PointPerformance {
    public static double AeroMaxG(double massKg, AircraftParams air, double q) {
        double w = massKg * 9.80665;
        return q * air.WingAreaM2 * air.CLMax / w;
    }

    // Solve CD0 + k*CL^2 = T/(q*S) for CL, then n = q*S*CL/W. If T too small, return < 1.
    public static double SustainedG(double massKg, AircraftParams air, double q, double thrustN) { ... }

    public static double SpecificExcessPowerMps(
        double massKg, double thrustN, double dragN, double speedMps) {
        return speedMps * (thrustN - dragN) / (massKg * 9.80665);
    }

    public static double MaxClimbGammaDeg(double thrustN, double dragN, double weightN) {
        double ratio = (thrustN - dragN) / weightN;
        if (ratio >= 1.0) return 90.0;
        if (ratio <= -1.0) return -90.0;
        return Math.Asin(ratio) * (180.0 / Math.PI);
    }

    public static double LevelDragN(AircraftParams air, double q, double cl) {
        double cd = air.CD0 + air.InducedK * cl * cl;
        // Caller adds wave drag when Mach provided — see WaveDrag helper matching FlightModel.
        return cd * q * air.WingAreaM2;
    }
}
```

- [ ] **Step 1: Failing test — Sabre-like fixture from drone-derivation-brief**

At 10k ft, 467 kt, m=6900, T=26300, S=26.8, CD0=0.018, k=0.083, CLmax=1.10: aero-max G ≈ 11.4, sustained ≈ 3.6. Use `FlightModel.Sabre` if numbers match; otherwise construct a local `AircraftParams` copy in the test with those fields only if Sabre differs — prefer asserting against Sabre’s own measured envelope within 10% rather than inventing a second airframe.

```csharp
[Fact]
public void SustainedGIsThrustLimitedWellBelowAeroMaxAtCornerBand() {
    AircraftParams air = FlightModel.Sabre;
    double altM = 10_000.0 * 0.3048;
    double rho = StandardAtmosphere1976.Instance.Sample(altM).DensityKgM3;
    double speed = 467.0 * 0.514444; // kt → m/s
    double q = 0.5 * rho * speed * speed;
    double aero = PointPerformance.AeroMaxG(air.MassKg, air, q);
    double thrust = air.ThrustMaxN; // mil dry for Sabre/J47 path — use map if needed
    double sustained = PointPerformance.SustainedG(air.MassKg, air, q, thrust);
    Assert.True(aero > sustained + 2.0);
    Assert.True(sustained > 1.0);
}
```

- [ ] **Step 2–4: Implement until green**

- [ ] **Step 5: Commit (if permitted)** `feat(flight-test): point-performance Ps and sustained-G arithmetic`

---

### Task 4: Engine deck sampling + point-layer gates in Evaluate

**Files:**
- Create: `sim/FlightTest/EngineDeck.cs`
- Modify: `sim/FlightTest/Evaluator.cs`
- Modify: `sim/FlightTest/FlightTestReport` to carry engine/energy summaries (optional nested records)
- Test: extend `FlightTestEvaluateTests.cs`

**Interfaces:**
- Consumes: `TurboRamjetPerformanceMap.Evaluate`, `AircraftParams.ThrustMaxN`
- Produces: findings `tw-augmented-gross`, `energy-game-gap`, `ram-light-band`

```csharp
public static class EngineDeck {
    public static EngineOperatingPoint SampleTurboRamjet(
        AircraftParams air, double lever, double altitudeM, double mach) {
        var atm = StandardAtmosphere1976.Instance.Sample(altitudeM);
        return TurboRamjetPerformanceMap.Evaluate(
            lever, air.ThrustMaxN, mach,
            atm.TemperatureK, atm.DensityKgM3,
            air.GenericIdleFuelFlowLbPerMinute,
            air.GenericMilitaryFuelFlowLbPerMinute,
            air.GenericAfterburnerFuelFlowLbPerMinute,
            air.MaxThrustFraction);
    }
}
```

Confirm property names for generic fuel flows on `AircraftParams` against `FlightModel.cs` before coding; use the same fields `AircraftSim` passes into the map.

Gates:

1. `tw-augmented-gross` — `IdentityMeasurement` augmented T/W ≤ 1.20  
2. `energy-game-gap` — at 10k ft corner-ish speed, `AeroMaxG - SustainedG` ≥ Identity.MinSustainedVsAeroGGap (use AB thrust = `ThrustMaxN * MaxThrustFraction` for Rapier)  
3. `ram-light-band` — at M=1.5 / FL400, ram share of net thrust < 0.1 (if map exposes split; if only total thrust available, skip with advisory finding `ram-split-unavailable` until map surface exists)

- [ ] **Step 1: Test that Evaluate on Rapier fails `tw-augmented-gross`**

- [ ] **Step 2–4: Implement**

- [ ] **Step 5: Commit (if permitted)** `feat(flight-test): point-layer family gates for TBCC interceptor`

---

### Task 5: Dynamic hold — AB climb through Mach 1

**Files:**
- Create: `sim/FlightTest/DynamicHolds.cs`
- Test: `sim.Tests/FlightTest/DynamicHoldTests.cs`
- Modify: `Evaluator.Evaluate` to run program points

**Interfaces:**
- Produces: `DynamicHolds.AbClimbThroughMach1(AircraftParams) → ClimbHoldResult`
- Gate: `ab-climb-through-m1` blocking when max γ while accelerating in band > Identity cap (40°)

```csharp
public readonly record struct ClimbHoldResult(
    double MaxGammaDegWhileAccelerating,
    double PeakAugmentedThrustToWeight,
    double MachAtMaxGamma,
    double AltFtAtMaxGamma);

public static class DynamicHolds {
    public static ClimbHoldResult AbClimbThroughMach1(AircraftParams air) {
        // Initial: M0.85 at 10_000 ft, mass = FuelFreeMassKg + mid fuel or MassKg
        // Command: full AB lever (1.0 * use MaxThrustFraction via PilotCommand),
        //          pitch to seek high climb — use a simple hold: command pitch toward 90°
        //          or pull for max γ (PilotCommand with pitch rate / stick as used elsewhere).
        // Integrate 30 s at AircraftSim.TickHz.
        // Track max gamma_deg among samples where mach in [0.9,1.3] and mach increased vs prior.
        ...
    }
}
```

Mirror command style from `EnergyZoomRepro` / `FlightModelTests` — read an existing pitch-up loop and copy the `PilotCommand` shape exactly (do not invent a new control path).

- [ ] **Step 1: Failing test**

```csharp
[Fact]
public void RapierAbClimbThroughMach1ExceedsFamilyGammaCap() {
    ClimbHoldResult r = DynamicHolds.AbClimbThroughMach1(
        FlightModel.RapierPublicDataSurrogate);
    Assert.True(r.MaxGammaDegWhileAccelerating > 40.0,
        $"expected homesick-angel γ, got {r.MaxGammaDegWhileAccelerating:F1}");
}

[Fact]
public void EvaluateFailsAbClimbGateForRapier() {
    var subject = new AirframeUnderTest(
        "rapier", FlightModel.RapierPublicDataSurrogate,
        PropulsionModelKind.TurboRamjetPublicDataSurrogate,
        Identity: InterceptorTbccV1.RapierAspirationalIdentity);
    FlightTestReport report = Evaluator.Evaluate(subject, InterceptorTbccV1.Program);
    Assert.Contains(report.Findings,
        f => f.GateId == "ab-climb-through-m1" && f.Blocking);
    Assert.False(report.Passed);
}
```

- [ ] **Step 2–4: Implement hold + wire into Evaluate when program Lists the point**

- [ ] **Step 5: Commit (if permitted)** `test(flight-test): Rapier AB climb through M1 fails 40° γ gate`

---

### Task 6: Markdown report (the teaching artifact)

**Files:**
- Create: `sim/FlightTest/ReportMarkdown.cs`
- Extend report with sections filled by Evaluate (engine samples, energy spots, climb result)
- Test: `FlightTestEvaluateTests` asserts markdown contains Identity / Findings headings and the γ number

```csharp
public static class ReportMarkdown {
    public static string Render(FlightTestReport report) {
        // Sections in order: Purpose one-liner, Identity table, Engine, Energy,
        // Flight-test points, Mission (advisory), Findings.
        // Include teaching line: "This report is the physics contract for teaching sorties."
    }
}
```

- [ ] **Step 1: Test markdown contains `## Findings` and `ab-climb-through-m1`**

- [ ] **Step 2–4: Implement**

- [ ] **Step 5: Commit (if permitted)** `feat(flight-test): markdown engineering report`

---

### Task 7: Buff-creep regression + program completeness

**Files:**
- Test: `sim.Tests/FlightTest/FlightTestEvaluateTests.cs`
- Modify: `InterceptorTbccV1.Program` to list all v1 gates/points

- [ ] **Step 1: Tests**

```csharp
[Fact]
public void RaisingThrustMaxNWithoutIdentityUpdateFailsIdentityGate() {
    AircraftParams buffed = FlightModel.RapierPublicDataSurrogate with {
        ThrustMaxN = FlightModel.RapierPublicDataSurrogate.ThrustMaxN * 1.20
    };
    var subject = new AirframeUnderTest(
        "rapier-buffed", buffed,
        PropulsionModelKind.TurboRamjetPublicDataSurrogate,
        Identity: InterceptorTbccV1.RapierAspirationalIdentity);
    FlightTestReport report = Evaluator.Evaluate(subject, InterceptorTbccV1.Program);
    Assert.False(report.Passed);
    Assert.Contains(report.Findings, f => f.GateId.StartsWith("identity-tw") && f.Blocking);
}

[Fact]
public void MatchingIdentityToBuffStillFailsFamilyTwCap() {
    AircraftParams buffed = FlightModel.RapierPublicDataSurrogate with {
        ThrustMaxN = FlightModel.RapierPublicDataSurrogate.ThrustMaxN * 1.20
    };
    AirframeIdentity matched = IdentityMeasurement.FromParams(buffed, inferred: false) with {
        AugmentedThrustToWeight = /* measured augmented */,
        MaxClimbGammaDegWhileAcceleratingThroughMach1 = 90,
        ComparisonFamily = "admitted homesick angel — not a teaching airframe",
        SourceDoc = "deliberate-admit"
    };
    // Recompute matched properly in test body from IdentityMeasurement
    var subject = new AirframeUnderTest("rapier-admitted", buffed,
        PropulsionModelKind.TurboRamjetPublicDataSurrogate, Identity: matched);
    FlightTestReport report = Evaluator.Evaluate(subject, InterceptorTbccV1.Program);
    Assert.Contains(report.Findings, f => f.GateId == "tw-augmented-gross");
}
```

- [ ] **Step 2–4: Green**

- [ ] **Step 5: Commit (if permitted)** `test(flight-test): buff-creep and family-cap regressions`

---

### Task 8: Mission layer stub (advisory only)

**Files:**
- Create: `sim/FlightTest/MissionClosure.cs`
- Modify: Evaluate to append advisory finding when `subject.Mission` is null: `mission-not-attached`
- When mission attached, run a **short** sanity (session begins, 2 s) and record phase name — full sortie closure is a follow-up plan; v1 only proves the seam exists without blocking

- [ ] **Step 1: Test advisory finding present, `Passed` still driven only by blocking gates**

- [ ] **Step 2–4: Stub**

- [ ] **Step 5: Commit (if permitted)** `feat(flight-test): advisory mission-closure seam`

---

### Task 9: Open-work pointer + acceptance check

**Files:**
- Modify: `docs/2026-07-26-open-work-and-findings.md` — short bullet under open work: flight-test harness spec/plan; Rapier fails γ/T/W until Identity or motor is deliberate
- Run full filtered suite + confirm acceptance criteria from the spec

- [ ] **Step 1: Run**

```bash
$HOME/.dotnet/dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~FlightTest"
```

Expected: all FlightTest tests green; at least one test documents Rapier `Passed == false` under aspirational Identity.

- [ ] **Step 2: Manual** — print one report to stdout in a test or small `tools/` is **not** required; asserting `ToMarkdown()` content is enough.

- [ ] **Step 3: Commit docs (if permitted)**

---

## Spec coverage checklist

| Spec requirement | Task |
|---|---|
| `Evaluate(subject, program) → report` | 1, 4, 5, 6 |
| Identity drift gates | 2 |
| Aspirational Rapier Identity / fail loud | 2, 7 |
| Point Ps / sustained / climb γ | 3, 4 |
| Family T/W ≤ 1.20 | 2, 4, 7 |
| Dynamic AB climb γ ≤ 40° | 5 |
| Markdown teaching artifact | 6 |
| Buff-creep +20% ThrustMaxN | 7 |
| Mission advisory only in v1 | 8 |
| No web dependency | all under `sim/FlightTest` |
| Teaching purpose upstream of missionization | Global Constraints + Task 6 one-liner |

## Out of plan (follow-ups)

- Promote Mission closure to blocking; full automation sortie energy budget
- Per-stream fuel → blocking `ram-cruise-lb-nm`
- Score production telemetry against the same program
- Deliberate engine detune branch once harness is red for the right reasons
- Sabre / F-22 programs for the broader teaching fleet

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-07-27-flight-test-harness.md`.

**Two execution options:**

1. **Subagent-Driven (recommended)** — fresh subagent per task, review between tasks  
2. **Inline Execution** — this session, executing-plans with checkpoints  

Which approach?
