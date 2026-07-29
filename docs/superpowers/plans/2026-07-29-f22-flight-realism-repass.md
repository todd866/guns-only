# F-22 Flight Realism Re-pass Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-measure F-22 public-data corridors, name M2.5 as out-of-claim with an executable negative-Ps gate, and fix only honesty mismatches (notably detent thrust estimate vs √density turbofan).

**Architecture:** Keep `F22SupersonicPerformanceTests` as the claim ledger. Extract the turbofan thrust-lapse factor used by `AircraftSim` into a shared helper; route `DetentLayer.ThrottleForRequiredThrust` through it for afterburning-turbofan airframes. Refresh `docs/f22-performance-audit.md` with live numbers and an explicit M2.5 section.

**Tech Stack:** C# kernel (`sim/`), xUnit (`sim.Tests/`), existing atmosphere/air-data helpers.

## Global Constraints

- Do **not** retune `WaveDragPeakMach` / `WaveDragK` / `ThrustMaxN` to chase M2.5.
- M2.5 at FL500 full AB must show **negative** Ps (named contract).
- Public anchors stay: dry M1.5 @ 40k/50k positive Ps; AB M2.0 @ 50k positive Ps; AB M2.3 @ 50k negative Ps; FL450 dynamic bands unchanged.
- Prefer one shared lapse helper; no third duplicated formula.
- F-22 surrogate only for claim docs; shared helper may serve other turbofan users.
- Epistemic labels: surrogate corridors, not OEM decks.

## File map

| File | Responsibility |
|---|---|
| `sim/Propulsion/TurbofanPublicDataSurrogate.cs` (or equivalent small helper colocated with propulsion) | Shared √density × Mach ram factor matching `AircraftSim` |
| `sim/AircraftSim.cs` | Call shared helper for afterburning-turbofan lapse |
| `sim/DetentLayer.cs` | `ThrottleForRequiredThrust` uses shared available thrust for turbofan models |
| `sim.Tests/F22SupersonicPerformanceTests.cs` | Add M2.5 negative-Ps; keep existing corridors |
| `sim.Tests/TurbofanThrustEstimateTests.cs` (new) | Detent estimate tracks kernel lapse at altitude |
| `docs/f22-performance-audit.md` | Refresh numbers + M2.5 out-of-claim section |

---

### Task 1: Name M2.5 as out-of-claim (test + re-measure)

**Files:**
- Modify: `sim.Tests/F22SupersonicPerformanceTests.cs`
- Test: same

**Produces:** Theory/inline case FL500 / M2.5 / power 1.35 → `shouldExceedBoundary: false` with `boundaryPsMps: 0.0` (negative Ps). Existing M2.0/M2.3 rows unchanged.

- [ ] **Step 1: Write the failing-or-documenting test**

Extend `LevelFlightExcessPowerMatchesBroadPublicCorridor`:

```csharp
[InlineData(50_000.0, 2.50, 1.35, 0.0, false)]
```

If this already fails green (Ps already negative), the test should **pass** on first run — that is success (locking the claim). If Ps is unexpectedly positive, **do not** retune drag; stop and report `NEEDS_CONTEXT` (would mean the upper bound is wrong vs the audit thesis).

- [ ] **Step 2: Run**

```bash
source ./bin/dotnet-env
"$dotnet_cli" test sim.Tests/GunsOnly.Sim.Tests.csproj \
  --filter FullyQualifiedName~F22SupersonicPerformanceTests -v n
```

Expected: all green, including M2.5 negative Ps. Record Ps at M2.0 and M2.5 from assertion messages or a one-off diagnostic in the test output for the audit (optional `Console`/`ITestOutputHelper` dump in a dedicated fact is fine if kept deterministic).

- [ ] **Step 3: Commit**

```bash
git add sim.Tests/F22SupersonicPerformanceTests.cs
git commit -m "$(cat <<'EOF'
Assert F-22 FL500 M2.5 augmented excess power stays negative.

EOF
)"
```

---

### Task 2: Align detent thrust estimate with turbofan √density lapse

**Files:**
- Create: `sim/Propulsion/TurbofanPublicDataSurrogate.cs` (name may match repo propulsion folder style)
- Modify: `sim/AircraftSim.cs` (replace inline lapse with helper call)
- Modify: `sim/DetentLayer.cs` (`ThrottleForRequiredThrust` non-J47 branch)
- Create: `sim.Tests/TurbofanThrustEstimateTests.cs`

**Interfaces:**

```csharp
public static class TurbofanPublicDataSurrogate {
    /// <summary>
    /// Matches AircraftSim afterburning-turbofan gross-thrust lapse:
    /// clamp(sqrt(densityRatio) * (1 + 0.10 * clamp(mach, 0, 1.5)), 0, 1.05).
    /// </summary>
    public static double ThrustLapse(double densityRatio, double mach);

    public static double AvailableThrustN(
        double seaLevelStaticThrustN,
        double densityRatio,
        double mach,
        double thrustFraction) =>
        thrustFraction * seaLevelStaticThrustN * ThrustLapse(densityRatio, mach);
}
```

`ThrottleForRequiredThrust` for `AfterburningTurbofanPublicDataSurrogate`:

```csharp
double densityRatio = atmosphere.Sample(altitudeM).DensityKgM3 / AirData.SeaLevelDensityKgM3;
double availableAtStop = TurbofanPublicDataSurrogate.AvailableThrustN(
    parameters.ThrustMaxN, densityRatio, mach, stop);
return availableAtStop <= 1e-9 ? stop
    : Math.Clamp(requiredThrustN / availableAtStop, 0.0, stop);
```

Leave `GenericDensityScaled` / other non-J47 models on linear density unless they already share the turbofan enum (F-22 uses `AfterburningTurbofanPublicDataSurrogate`).

- [ ] **Step 1: Failing test** — at FL450, F-22, required thrust = kernel available thrust at power `p`, detent estimate of throttle ≈ `p` within tight tolerance; and linear-density estimate would disagree (document via computing both in the test before the fix if useful).

```csharp
[Fact]
public void F22DetentThrottleEstimateTracksSqrtDensityTurbofanAtAltitude() {
    // Arrange FL450, M1.5, power 0.85; compute required = AvailableThrustN(..., 0.85)
    // Act: DetentLayer path / ThrottleForRequiredThrust via public test hook or AssistedThrottle helper
    // Assert: estimated throttle ≈ 0.85 ± 0.02
}
```

If `ThrottleForRequiredThrust` is private, test through the existing public speed-hold / assisted-throttle API on `DetentLayer`, or make the helper public and unit-test `AvailableThrustN` + a package-visible invert — prefer testing the public detent API the pilot path uses.

- [ ] **Step 2: Run — expect FAIL** (linear density overstates available thrust → underestimates throttle)

- [ ] **Step 3: Extract helper; wire AircraftSim + DetentLayer**

- [ ] **Step 4: Run F22 + new turbofan estimate tests — PASS**

```bash
"$dotnet_cli" test sim.Tests/GunsOnly.Sim.Tests.csproj \
  --filter "FullyQualifiedName~F22Supersonic|FullyQualifiedName~TurbofanThrust" -v n
```

Also run any existing DetentLayer tests:

```bash
"$dotnet_cli" test sim.Tests/GunsOnly.Sim.Tests.csproj \
  --filter FullyQualifiedName~DetentLayer -v n
```

- [ ] **Step 5: Commit**

```bash
git add sim/Propulsion/TurbofanPublicDataSurrogate.cs sim/AircraftSim.cs sim/DetentLayer.cs \
  sim.Tests/TurbofanThrustEstimateTests.cs
git commit -m "$(cat <<'EOF'
Align F-22 detent thrust estimates with the turbofan density lapse.

EOF
)"
```

---

### Task 3: Refresh performance audit doc

**Files:**
- Modify: `docs/f22-performance-audit.md`

- [ ] **Step 1:** Add section **“M2.5 out of claim”** — USAF Mach-two class; gates at M2.0 positive / M2.3 & M2.5 negative Ps @ FL500 AB; pointer to `F22SupersonicPerformanceTests`.
- [ ] **Step 2:** Update findings table: mark speed-hold feed-forward as **fixed** (or still open if Task 2 found no public path) with evidence; paste re-measured Ps ballpark numbers from Task 1.
- [ ] **Step 3:** Commit

```bash
git add docs/f22-performance-audit.md
git commit -m "$(cat <<'EOF'
Refresh F-22 performance audit with M2.5 out-of-claim and live corridors.

EOF
)"
```

---

### Task 4: Verify

- [ ] **Step 1:**

```bash
source ./bin/dotnet-env
"$dotnet_cli" test sim.Tests/GunsOnly.Sim.Tests.csproj \
  --filter "FullyQualifiedName~F22Supersonic|FullyQualifiedName~TurbofanThrust|FullyQualifiedName~DetentLayer" -v n
```

- [ ] **Step 2:** Note any unrelated suite failures; do not retune dash to clear them.

- [ ] **Step 3:** No extra commit unless a doc typo fix is needed.

---

## Spec coverage

| Spec item | Task |
|---|---|
| Re-measure corridors | 1, 4 |
| M2.5 negative-Ps named contract | 1 |
| Keep M1.5 / M2.0 / M2.3 / FL450 gates | 1, 4 |
| Detent √density honesty fix | 2 |
| Shared lapse helper | 2 |
| No wave-drag retune for M2.5 | Global |
| Audit refresh + M2.5 section | 3 |

## Self-review notes

- Task 1 may be green on first run; that locks the claim rather than forcing a red→green drama.
- Task 2 is the only expected code fix unless re-measure finds a broken public anchor (then stop and escalate — do not invent M2.5).
