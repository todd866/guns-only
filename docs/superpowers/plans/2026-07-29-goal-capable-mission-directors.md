# Goal-Capable Mission Directors (Intercept v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Rapier Intercept pre-Attack magic-number ladder with a goal-capable `ReachFightDirector` that picks intention + strategy from any state, so FL700/M2.2 are FD targets not admission tickets.

**Architecture:** Keep `RapierMissionDirector.Step` as the public surface. Extract pre-Attack fight progression into `sim/ReachFightDirector.cs`. Outer director still owns Launch / Escape / RTB / Recovery / PatternOnly overrides. Strategies (ClimbBuild, LevelDash, ZoomLob, DirectJoin) map to existing `RapierMissionPhase` labels + PilotCommand switch. Publish `intention` / `strategy` tokens on guidance and cold snapshot JSON.

**Tech Stack:** C# (.NET 8), xUnit (`sim.Tests`), existing OFT / `anca-audit` harnesses, SnapshotProjection cold JSON.

**Spec:** `docs/superpowers/specs/2026-07-29-goal-capable-mission-directors-design.md`

## Global Constraints

- Branch `pivot-hardening`; stage **explicit paths only**, never `git add -A` / `git add .`.
- Concurrent agents may touch radio / Mesh / RecoveryProcedure — do not revert their files.
- Do not change Circuits / PatternOnly / RecoveryProcedure behavior.
- Do not invent a trajectory planner; greedy score + hysteresis only.
- Numbers (FL560, M2.2, FL700, 30 km) remain strategy **targets** / soft floors, never Intercept admission locks.
- C# tests: `DOTNET_ROOT="$HOME/.dotnet" "$HOME/.dotnet/dotnet" test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~ReachFight|FullyQualifiedName~RapierMissionDirector|FullyQualifiedName~RapierZoomLob|FullyQualifiedName~RapierInterceptOft" --nologo`
- Snapshot: cold JSON strings only → bump schema `1.23.0` → `1.24.0` + both korea pack pins; **do not** bump `LayoutVersion` (18 stays) unless a hot slot is unavoidable.
- Prefer `?audioQa=silent` if any browser QA appears; no audible work in this plan.

## File map

| File | Role |
| --- | --- |
| `sim/ReachFightDirector.cs` | **Create.** Intention/strategy enums, decision record, scorer, hysteresis |
| `sim/RapierMission.cs` | Wire ReachFight; drop FL700 prison; guidance Intention/Strategy fields; keep PilotCommand switch |
| `sim/SimulationSession.cs` | Expose `RapierIntention` / `RapierStrategy` accessors |
| `web/SnapshotProjection.cs` | Cold JSON `rapier_intention`, `rapier_strategy`; schema → 1.24.0 |
| `web/SnapshotHotFrame.cs` | Add strings to `ColdFingerprint` only (layout 18 unchanged) |
| `sim.Tests/ReachFightDirectorTests.cs` | **Create.** Unit contract for DirectJoin, no FL700 lock, ZoomLob score, hysteresis |
| `sim.Tests/RapierMissionDirectorTests.cs` | Airborne-attach / soft-handoff cases |
| `sim.Tests/RapierZoomLobDirectorTests.cs` | Must stay green (`ZoomLobProfile: true`) |
| `sim.Tests/RapierInterceptOftTests.cs` | Soften FL700 prison assertions; record intention/strategy in telemetry |
| `sim.Tests/SnapshotProjectionTests.cs` | Schema pin 1.24.0 + new fields present |
| `content/packs/korea-1950s/pack.json` + `web/wwwroot/.../pack.json` | `snapshotSchemaVersion` → 1.24.0 |
| `tools/anca-audit/Scenarios.cs` | Airborne Intercept card: not authored as FL700 camping |
| `tools/anca-audit/WireState.cs` | Optional mirror of intention/strategy if audit JSON includes rapier cues |

---

### Task 1: Characterization extract — `ReachFightDirector` with ladder-equivalent behavior

**Files:**
- Create: `sim/ReachFightDirector.cs`
- Modify: `sim/RapierMission.cs` (pre-Attack block ~871–891 + guidance construction ~1514)
- Create: `sim.Tests/ReachFightDirectorTests.cs`
- Test also: existing `RapierMissionDirectorTests` / `RapierZoomLobDirectorTests` (must stay green)

**Interfaces:**
- Consumes: current phase, alt/Mach/q/γ, contact range, fuel/reserve, `zoomLobPreferred`, lob skip / already-in-zoom
- Produces:

```csharp
namespace GunsOnly.Sim;

public enum MissionIntention {
    SurviveAviate = 0,
    ReachFightGeometry = 1,
    Employ = 2,
    Separate = 3,
    Recover = 4,
}

public enum ReachFightStrategy {
    None = 0,
    ClimbBuild = 1,
    LevelDash = 2,
    ZoomLob = 3,
    DirectJoin = 4,
}

public readonly record struct ReachFightDecision(
    MissionIntention Intention,
    ReachFightStrategy Strategy,
    RapierMissionPhase SuggestedPhase,
    string PhaseReason);

public sealed class ReachFightDirector {
    // Named constants (same numeric values as today's ladder targets):
    // ClimbTopM = 56000*0.3048, CruiseAltitudeM = 70000*0.3048,
    // AttackRangeM = 30000, AccelMach = 2.2, SoftEmployMach = 0.9
    public ReachFightDecision Decide(
        RapierMissionPhase currentPhase,
        double altitudeM,
        double mach,
        double qPa,
        double gammaRad,
        double contactRangeM,
        double fuelLb,
        double reserveFuelLb,
        bool zoomLobPreferred,
        int lobSkip,
        bool inZoomPhases);
}
```

Token strings for guidance/snapshot (stable):

| Enum | Token |
| --- | --- |
| ReachFightGeometry | `reach_fight` |
| Employ | `employ` |
| ClimbBuild | `climb_build` |
| LevelDash | `level_dash` |
| ZoomLob | `zoom_lob` |
| DirectJoin | `direct_join` |

- [ ] **Step 1: Write failing characterization tests** that pin **today’s** ladder behavior (will temporarily expect prison behavior until Task 2):

```csharp
[Fact]
public void Characterization_BelowCruiseAfterAccel_StillSuggestsRamClimb() {
    var d = new ReachFightDirector();
    // FL650, M2.5, contact 120 km — today's ladder would RamClimb
    ReachFightDecision dec = d.Decide(
        RapierMissionPhase.Accelerate,
        altitudeM: 65_000.0 * 0.3048,
        mach: 2.5,
        qPa: 5_000.0,
        gammaRad: 0.05,
        contactRangeM: 120_000.0,
        fuelLb: 2_400.0,
        reserveFuelLb: 1_200.0,
        zoomLobPreferred: false,
        lobSkip: 0,
        inZoomPhases: false);
    Assert.Equal(MissionIntention.ReachFightGeometry, dec.Intention);
    Assert.Equal(ReachFightStrategy.ClimbBuild, dec.Strategy);
    Assert.Equal(RapierMissionPhase.RamClimb, dec.SuggestedPhase);
    Assert.Equal("ram_climb_to_fl700", dec.PhaseReason);
}

[Fact]
public void Characterization_AtCruise_SuggestsInterceptDash() {
    var d = new ReachFightDirector();
    ReachFightDecision dec = d.Decide(
        RapierMissionPhase.RamClimb,
        altitudeM: 70_000.0 * 0.3048,
        mach: 3.0,
        qPa: 4_000.0,
        gammaRad: 0.0,
        contactRangeM: 80_000.0,
        fuelLb: 2_400.0,
        reserveFuelLb: 1_200.0,
        zoomLobPreferred: false,
        lobSkip: 0,
        inZoomPhases: false);
    Assert.Equal(ReachFightStrategy.LevelDash, dec.Strategy);
    Assert.Equal(RapierMissionPhase.Intercept, dec.SuggestedPhase);
    Assert.Equal("intercept_dash", dec.PhaseReason);
}

[Fact]
public void Characterization_ContactInside30km_HandsOffEmploy() {
    var d = new ReachFightDirector();
    ReachFightDecision dec = d.Decide(
        RapierMissionPhase.Intercept,
        altitudeM: 12_000.0,
        mach: 1.2,
        qPa: 8_000.0,
        gammaRad: 0.0,
        contactRangeM: 20_000.0,
        fuelLb: 2_000.0,
        reserveFuelLb: 1_200.0,
        zoomLobPreferred: false,
        lobSkip: 0,
        inZoomPhases: false);
    Assert.Equal(MissionIntention.Employ, dec.Intention);
    Assert.Equal(RapierMissionPhase.Attack, dec.SuggestedPhase);
    Assert.Equal("contact_leq_30km", dec.PhaseReason);
}
```

- [ ] **Step 2: Run tests — expect FAIL** (type missing)

```bash
DOTNET_ROOT="$HOME/.dotnet" "$HOME/.dotnet/dotnet" test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~ReachFightDirectorTests" --nologo
```

Expected: compile fail / type not found.

- [ ] **Step 3: Implement `ReachFightDirector` as a pure port of today’s ladder** (no scoring yet):

```csharp
// Pseudocode order matching RapierMission.cs pre-Attack block:
if (contactRangeM <= AttackRangeM && (!zoomLobPreferred || currentPhase >= DipRelight || inZoomPhases done))
    → Employ / Attack / contact_leq_30km
else if (altitudeM < ClimbTopM - 40 && currentPhase <= Climb)
    → ClimbBuild / Climb / climb_to_fl560
else if (mach < 2.2 && currentPhase <= Accelerate)
    → ClimbBuild / Accelerate / accel_to_m2.2
else if (altitudeM < CruiseAltitudeM - 200 && currentPhase <= RamClimb && !inZoomPhases)
    → ClimbBuild / RamClimb / ram_climb_to_fl700   // prison still here in Task 1
else if (zoomLobPreferred || inZoomPhases)
    → ZoomLob / (caller still runs UpdateZoomLobPhase for sub-phases)
    // For Decide-only: if preferred and not in zoom yet → ZoomPull / zoom_pull_entry
else
    → LevelDash / Intercept / intercept_dash
```

For ZoomLob sub-phases, Task 1 may return `Strategy=ZoomLob` + `SuggestedPhase=currentPhase` and leave `UpdateZoomLobPhase` in `RapierMissionDirector` (caller advances ZoomPull→…→DipRelight). Document that split in a short comment on `Decide`.

- [ ] **Step 4: Wire into `RapierMissionDirector`**

In the pre-Attack branch (not pattern/escape/rtb/catapult), call `_reachFight.Decide(...)`, then `EnterPhase(dec.SuggestedPhase, dec.PhaseReason)`. Store `_intention` / `_strategy` fields; pass through `RapierMissionGuidance` as new optional fields:

```csharp
// On RapierMissionGuidance:
string Intention = "",
string Strategy = "",
```

Map enums → tokens via small static helpers on `ReachFightDirector` (`Token(MissionIntention)`, `Token(ReachFightStrategy)`).

Zoom path: if `dec.Strategy == ZoomLob`, still call existing `UpdateZoomLobPhase(...)` so skip logic stays intact.

- [ ] **Step 5: Run characterization + existing director/zoom tests — expect PASS**

```bash
DOTNET_ROOT="$HOME/.dotnet" "$HOME/.dotnet/dotnet" test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~ReachFight|FullyQualifiedName~RapierMissionDirector|FullyQualifiedName~RapierZoomLob" --nologo
```

- [ ] **Step 6: Commit**

```bash
git add sim/ReachFightDirector.cs sim/RapierMission.cs sim.Tests/ReachFightDirectorTests.cs
git commit -m "$(cat <<'EOF'
Extract ReachFightDirector with ladder-equivalent Intercept behavior.

EOF
)"
```

---

### Task 2: DirectJoin + remove FL700 admission lock

**Files:**
- Modify: `sim/ReachFightDirector.cs`
- Modify: `sim.Tests/ReachFightDirectorTests.cs`
- Modify: `sim.Tests/RapierMissionDirectorTests.cs`

**Interfaces:** Same `Decide` signature. Behavior change only.

**New eligibility (named constants on `ReachFightDirector`):**

```csharp
const double LevelDashMinAltM = ClimbTopM;          // FL560 — thin enough after accel
const double LevelDashMinMach = 2.2;
const double DirectJoinMinMach = 2.0;
const double SoftEmployMach = 0.9;
// Employ handoff: contactRangeM <= AttackRangeM && mach >= SoftEmployMach
// (if mach < SoftEmployMach but range ok, stay ReachFight / DirectJoin or ClimbBuild — do not Attack dead-slow)
```

**Lock removal rule:** Never force RamClimb solely because `altitudeM < CruiseAltitudeM - 200` when LevelDash or DirectJoin is eligible.

Replace the prison branch with:

```csharp
bool levelDashEligible = mach >= LevelDashMinMach && altitudeM >= LevelDashMinAltM - 40.0;
bool directJoinEligible = levelDashEligible
    || currentPhase is RapierMissionPhase.Intercept
        or RapierMissionPhase.Attack
    || inZoomPhases && currentPhase >= RapierMissionPhase.DipRelight;

// After climb/accel needs are met:
if (employHandoff) → Employ...
else if (needsClimbTop) → Climb / climb_to_fl560
else if (needsAccel) → Accelerate / accel_to_m2.2
else if (zoomLobPreferred || inZoomPhases) → ZoomLob path
else if (directJoinEligible && contactRangeM <= 100_000.0)
    → DirectJoin / Intercept / "direct_join"
else if (levelDashEligible)
    → LevelDash / Intercept / "intercept_dash"
else
    → ClimbBuild / RamClimb / "ram_climb_to_fl700"  // only when NOT levelDashEligible
```

- [ ] **Step 1: Rewrite the FL650 characterization test to the new contract** and add DirectJoin cases:

```csharp
[Fact]
public void Fl650AfterAccel_SelectsLevelDashNotRamClimbPrison() {
    var d = new ReachFightDirector();
    ReachFightDecision dec = d.Decide(
        RapierMissionPhase.Accelerate,
        altitudeM: 65_000.0 * 0.3048,
        mach: 2.5,
        qPa: 5_000.0,
        gammaRad: 0.05,
        contactRangeM: 120_000.0,
        fuelLb: 2_400.0,
        reserveFuelLb: 1_200.0,
        zoomLobPreferred: false,
        lobSkip: 0,
        inZoomPhases: false);
    Assert.Equal(ReachFightStrategy.LevelDash, dec.Strategy);
    Assert.Equal(RapierMissionPhase.Intercept, dec.SuggestedPhase);
    Assert.Equal("intercept_dash", dec.PhaseReason);
}

[Fact]
public void AirborneAttachMidDash_DirectJoinIntercept() {
    var d = new ReachFightDirector();
    ReachFightDecision dec = d.Decide(
        RapierMissionPhase.Launch, // cold start mid-air attach
        altitudeM: 70_000.0 * 0.3048,
        mach: 2.8,
        qPa: 4_000.0,
        gammaRad: 0.0,
        contactRangeM: 80_000.0,
        fuelLb: 2_200.0,
        reserveFuelLb: 1_200.0,
        zoomLobPreferred: false,
        lobSkip: 0,
        inZoomPhases: false);
    Assert.Equal(ReachFightStrategy.DirectJoin, dec.Strategy);
    Assert.Equal(RapierMissionPhase.Intercept, dec.SuggestedPhase);
    Assert.Equal("direct_join", dec.PhaseReason);
}

[Fact]
public void LowAndSlow_StillClimbBuild() {
    var d = new ReachFightDirector();
    ReachFightDecision dec = d.Decide(
        RapierMissionPhase.Launch,
        altitudeM: 5_000.0,
        mach: 0.9,
        qPa: 20_000.0,
        gammaRad: 0.2,
        contactRangeM: 200_000.0,
        fuelLb: 2_400.0,
        reserveFuelLb: 1_200.0,
        zoomLobPreferred: false,
        lobSkip: 0,
        inZoomPhases: false);
    Assert.Equal(ReachFightStrategy.ClimbBuild, dec.Strategy);
    Assert.Equal(RapierMissionPhase.Climb, dec.SuggestedPhase);
}
```

- [ ] **Step 2: Run — expect FAIL** on FL650 / DirectJoin assertions.

- [ ] **Step 3: Implement eligibility + lock removal** in `Decide` as above.

- [ ] **Step 4: Integration test on `RapierMissionDirector`**

```csharp
[Fact]
public void AirborneFl650_ReachesInterceptWithoutRamClimbReason() {
    var director = new RapierMissionDirector();
    RapierMissionGuidance g = default;
    for (int i = 0; i < 6; i++) {
        g = StepDash(director, FlightModel.RapierPublicDataSurrogate,
            altitudeM: 65_000.0 * 0.3048, mach: 2.5, contactRangeM: 120_000.0);
    }
    Assert.Equal(RapierMissionPhase.Intercept, g.Phase);
    Assert.NotEqual("ram_climb_to_fl700", g.PhaseReason);
    Assert.Equal("level_dash", g.Strategy); // or direct_join if contact band hits that rule — assert NotEqual climb_build
}
```

Adjust expected Strategy token to match the exact rule chosen (`level_dash` for 120 km / FL650).

- [ ] **Step 5: Run director + zoom + ReachFight filters — PASS**

- [ ] **Step 6: Commit**

```bash
git add sim/ReachFightDirector.cs sim.Tests/ReachFightDirectorTests.cs sim.Tests/RapierMissionDirectorTests.cs sim/RapierMission.cs
git commit -m "$(cat <<'EOF'
Allow Intercept DirectJoin and LevelDash without FL700 admission lock.

EOF
)"
```

---

### Task 3: Greedy scoring — default Intercept may ZoomLob; hysteresis

**Files:**
- Modify: `sim/ReachFightDirector.cs`
- Modify: `sim.Tests/ReachFightDirectorTests.cs`
- Modify: `sim.Tests/RapierZoomLobDirectorTests.cs` (still force path via `zoomLobPreferred`)

**Interfaces:** Same public `Decide`. Internal incumbent strategy field on the director instance.

**Scoring (v1 — concrete):**

Only when ClimbBuild is **not** required (past climb/accel floors) and `zoomLobPreferred` is false and not already `inZoomPhases`:

```csharp
double ScoreLevelDash(contactRangeM, mach, fuelLb, reserveFuelLb) =>
    // Prefer closing now: higher when range moderate and fuel OK
    (200_000.0 - contactRangeM) / 1_000.0
    + (mach - 2.2) * 10.0
    + (fuelLb > reserveFuelLb ? 20.0 : -50.0);

double ScoreZoomLob(contactRangeM, mach, fuelLb, reserveFuelLb, lobSkip) =>
    // Prefer long range + energy + fuel for skip
    (contactRangeM > 90_000.0 ? 80.0 : -40.0)
    + (mach >= 2.2 ? 30.0 : -100.0)
    + (fuelLb > reserveFuelLb + 200.0 ? 25.0 : -80.0)
    + (lobSkip >= 3 ? -100.0 : 0.0);

double ScoreDirectJoin(...) =>
    contactRangeM <= 100_000.0 && mach >= DirectJoinMinMach ? 60.0 + (100_000.0 - contactRangeM) / 2_000.0 : -100.0;
```

Pick max among eligible. **Hysteresis:** keep incumbent unless challenger score ≥ incumbent score + `15.0` (named `StrategySwitchMargin`).

When `zoomLobPreferred` is true: force ZoomLob (existing Go Fly) until post-lob Intercept — no contest.

When already `inZoomPhases`: stick ZoomLob (caller advances sub-phases).

- [ ] **Step 1: Failing tests**

```csharp
[Fact]
public void LongRangeHighEnergy_DefaultInterceptMayPickZoomLob() {
    var d = new ReachFightDirector();
    ReachFightDecision dec = d.Decide(
        RapierMissionPhase.RamClimb,
        altitudeM: 21_500.0,
        mach: 3.5,
        qPa: 4_000.0,
        gammaRad: 0.05,
        contactRangeM: 200_000.0,
        fuelLb: 2_400.0,
        reserveFuelLb: 1_200.0,
        zoomLobPreferred: false,
        lobSkip: 0,
        inZoomPhases: false);
    Assert.Equal(ReachFightStrategy.ZoomLob, dec.Strategy);
    Assert.Equal(RapierMissionPhase.ZoomPull, dec.SuggestedPhase);
}

[Fact]
public void Hysteresis_PreventsFlipFlopOnTinyScoreDelta() {
    var d = new ReachFightDirector();
    // First decision locks ZoomLob at 200 km
    _ = d.Decide(..., contactRangeM: 200_000.0, ...);
    // Nudge range so LevelDash would barely win without margin
    ReachFightDecision second = d.Decide(..., contactRangeM: 95_000.0, ...);
    Assert.Equal(ReachFightStrategy.ZoomLob, second.Strategy);
}

[Fact]
public void ZoomLobPreferred_StillForced() {
    var d = new ReachFightDirector();
    ReachFightDecision dec = d.Decide(
        ...,
        contactRangeM: 80_000.0, // would often be LevelDash
        zoomLobPreferred: true,
        ...);
    Assert.Equal(ReachFightStrategy.ZoomLob, dec.Strategy);
}
```

Fill `...` with the same Step helper args as Task 1 (FL shelf / M3.5 / fuel 2400).

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement scores + incumbent + margin**; when ZoomLob wins and not yet in zoom phases, return `ZoomPull` / `zoom_pull_entry` (then caller’s `UpdateZoomLobPhase` continues).

Wire: default Intercept (`zoomLobProfile: false`) must call `UpdateZoomLobPhase` whenever strategy is ZoomLob (not only when flag true).

- [ ] **Step 4: Run ReachFight + ZoomLob + MissionDirector filters — PASS**

- [ ] **Step 5: Commit**

```bash
git add sim/ReachFightDirector.cs sim/RapierMission.cs sim.Tests/ReachFightDirectorTests.cs
git commit -m "$(cat <<'EOF'
Score ReachFight strategies so default Intercept may zoom-lob.

EOF
)"
```

---

### Task 4: Snapshot + session tokens (schema 1.24.0)

**Files:**
- Modify: `sim/RapierMission.cs` (`RapierMissionGuidance` Intention/Strategy — if not already from Task 1)
- Modify: `sim/SimulationSession.cs`
- Modify: `web/SnapshotProjection.cs`
- Modify: `web/SnapshotHotFrame.cs` (`ColdFingerprint` + `Capture`)
- Modify: `sim.Tests/SnapshotProjectionTests.cs`
- Modify: `content/packs/korea-1950s/pack.json`
- Modify: `web/wwwroot/content/packs/korea-1950s/pack.json`
- Grep/update any harness pins asserting `1.23.0` (e.g. `g_tolerance_bridge_contract.test.mjs` if present)

**Produces:**
- `Session.RapierIntention` / `Session.RapierStrategy` strings
- Cold JSON: `"rapier_intention":"..."`, `"rapier_strategy":"..."` next to `rapier_phase_reason`
- Schema `1.24.0`; LayoutVersion stays **18**

- [ ] **Step 1: Failing projection assertion**

```csharp
Assert.Equal("1.24.0", /* schema from BuildState / test helper */);
Assert.Contains("\"rapier_intention\"", json);
Assert.Contains("\"rapier_strategy\"", json);
```

- [ ] **Step 2: Implement accessors + JSON + ColdFingerprint fields**

```csharp
// SimulationSession
public string RapierIntention => _rapierMissionGuidance.Intention ?? "";
public string RapierStrategy => _rapierMissionGuidance.Strategy ?? "";
```

ColdFingerprint: add `string RapierIntention, string RapierStrategy` beside `RapierPhaseReason`; include in `Capture(...)`.

Bump `SnapshotSchemaVersion` to `"1.24.0"` and both pack pins.

- [ ] **Step 3: Run snapshot + physiology/schema contract tests that pin version**

```bash
DOTNET_ROOT="$HOME/.dotnet" "$HOME/.dotnet/dotnet" test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~SnapshotProjection" --nologo
# plus any node contract that pins schema — update pins to 1.24.0
```

- [ ] **Step 4: Commit**

```bash
git add sim/RapierMission.cs sim/SimulationSession.cs web/SnapshotProjection.cs web/SnapshotHotFrame.cs \
  sim.Tests/SnapshotProjectionTests.cs \
  content/packs/korea-1950s/pack.json web/wwwroot/content/packs/korea-1950s/pack.json
# plus any updated contract test pins
git commit -m "$(cat <<'EOF'
Publish rapier intention/strategy tokens on snapshot schema 1.24.0.

EOF
)"
```

---

### Task 5: Soften OFT + anca-audit Intercept card

**Files:**
- Modify: `sim.Tests/RapierInterceptOftTests.cs`
- Modify: `tools/anca-audit/Scenarios.cs` (`AirborneInterceptCard`)
- Modify: `tools/anca-audit/WireState.cs` (optional: include intention/strategy in sample JSON if rapier cue fields are listed)
- Possibly: `sim.Tests/RapierMissionTests.cs` if it asserts RamClimb as mandatory for every path — keep for **full launch** card only

**OFT changes:**

- Keep Launch→…→Intercept energy-ladder card for the **catapult full profile** (RamClimb may still appear as ClimbBuild targets).
- Soften assertions that treat FL700 as the only path to Intercept:
  - `reasons.Contains("intercept_dash")` → also accept `direct_join` / `zoom_pull_entry` / `post_lob_intercept` as success reasons for reaching Intercept.
  - Dash altitude band `68_000–71_000` stays as **curriculum corridor when LevelDash/ClimbBuild flew the classic profile**; if the card starts from catapult and still climbs there, keep the band. Do **not** fail a separate airborne-attach unit path for sitting at FL650.
- Add tick fields `"intention"` / `"strategy"` from session accessors when present.

**anca-audit `AirborneInterceptCard`:**

- Retarget comment + setup: start at **FL650 / M2.5** (or FL700−500 only if radio rising-edge still needs it — prefer DirectJoin-friendly start + rely on MissionRadio init-commit if already present).
- Contact range still ~120 km so Attack does not fire immediately.
- Require scenario still reaches Intercept / CONTROL without camping FL700.

- [ ] **Step 1: Adjust OFT assert**

```csharp
bool reachedIntercept = phases.Contains(RapierMissionPhase.Intercept);
bool okReason = reasons.Contains("intercept_dash")
    || reasons.Contains("direct_join")
    || reasons.Contains("post_lob_intercept");
bool ok = phases.Contains(RapierMissionPhase.Accelerate)
    && phases.Contains(RapierMissionPhase.RamClimb) // full catapult card still climbs
    && reachedIntercept
    && rangeAtDashM > 40_000.0
    && okReason;
```

Only keep `RamClimb` required on the **full launch** OFT card. If you add a second airborne OFT later, omit RamClimb there — not required in v1.

- [ ] **Step 2: Rewrite `AirborneInterceptCard` altitude/speed** to FL650/M2.5; update comment to match DirectJoin/LevelDash.

- [ ] **Step 3: Run**

```bash
DOTNET_ROOT="$HOME/.dotnet" "$HOME/.dotnet/dotnet" test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~RapierInterceptOft" --nologo
./bin/anca-audit --self-test-full
```

Expected: PASS (or document one intentional radio rising-edge follow-up if init-commit missing — fix MissionRadio only if audit fails for that reason).

- [ ] **Step 4: Commit**

```bash
git add sim.Tests/RapierInterceptOftTests.cs tools/anca-audit/Scenarios.cs tools/anca-audit/WireState.cs
git commit -m "$(cat <<'EOF'
Retune Intercept OFT and anca-audit for goal-capable ReachFight.

EOF
)"
```

---

### Task 6: Verification gate

**Files:** none new — run harnesses

- [ ] **Step 1: Director unit suite**

```bash
DOTNET_ROOT="$HOME/.dotnet" "$HOME/.dotnet/dotnet" test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~ReachFight|FullyQualifiedName~RapierMissionDirector|FullyQualifiedName~RapierZoomLob|FullyQualifiedName~RapierInterceptOft|FullyQualifiedName~SnapshotProjection" --nologo
```

Expected: all PASS.

- [ ] **Step 2: anca-audit**

```bash
./bin/anca-audit --self-test-full
```

Expected: all scenarios ok.

- [ ] **Step 3: Broader check if time / CI expects it**

```bash
./bin/check
```

If concurrent agents break unrelated trees, report the failure; do not revert their work. Goal-director paths must be green.

- [ ] **Step 4: Final commit only if Step 3 left dirty fixes** — otherwise done.

Acceptance mapped to spec:

| Spec acceptance | Task |
| --- | --- |
| FL400 / FL650 / M3 dash / mid-zoom reach Employ without FL700 prison | 2 + 3 + tests |
| Default Intercept may ZoomPull | 3 |
| Zoom-lob beds green | 3 (ZoomLobPreferred) |
| OFT soft curriculum | 5 |
| anca-audit not FL700 camp | 5 |
| Intention/strategy tokens | 4 |
| `./bin/check` subset green | 6 |

---

## Spec coverage self-check

| Spec section | Plan task |
| --- | --- |
| Intention picker + strategies | 1–3 |
| ReachFight module deep boundary | 1 |
| Remove FL700 admission lock / DirectJoin | 2 |
| ZoomLob as strategy; `ZoomLobProfile` force | 3 |
| Hysteresis | 3 |
| Employ soft energy floor | 2 (`SoftEmployMach`) |
| Snapshot tokens | 4 |
| OFT / anca-audit | 5 |
| Non-goals (no Circuits/planner/physics) | honored throughout |
| Airborne attach | 2 |

## Placeholder / consistency notes

- Phase reasons: keep existing strings where behavior matches; new reason `direct_join` only for DirectJoin.
- `UpdateZoomLobPhase` remains on `RapierMissionDirector` in v1 (sub-phase machine); ReachFight only selects ZoomLob / entry phase.
- Token names locked in Task 1 table — snapshot and tests must use the same strings.
