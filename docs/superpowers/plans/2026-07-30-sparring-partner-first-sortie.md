# Sparring Partner First Sortie Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the first engagement a winnable join-up against a co-operative sparring partner, so that a first-time visitor can reach guns range and score.

**Architecture:** A new `BanditTactic.Present` makes the opening bandit fly a stable, non-defending reference line at close range. The bandit graduates itself out of `Present` when the player holds a gun position for 2.0 s — a pure function of kernel state, computed inside `ReactiveBandit`, so `FightDirector`'s determinism contract (state advances only in `Observe`, phase commits only at `NextSpawn`) is untouched.

**Tech Stack:** C# / .NET (deterministic sim kernel), xUnit (`sim.Tests`), JSON snapshot projection to a browser client.

Design spec: [`docs/superpowers/specs/2026-07-30-sparring-partner-first-sortie-design.md`](../specs/2026-07-30-sparring-partner-first-sortie-design.md)

## Global Constraints

- **Determinism is the kernel's core contract.** No wall clock, no random source, no kinematic shortcuts enter the sim. Identical inputs must reproduce identical tactic sequences tick-for-tick.
- **`FightDirector` must not counter-pick mid-fight.** Director state advances only in `Observe` (completed engagements); phase commitment happens only at the `NextSpawn` boundary. Nothing in this plan may add mid-fight director state.
- **Engagement numbering starts at 1.** `ReactiveBandit`'s constructor and `SpawnForMerge` both `throw ArgumentOutOfRangeException` when `engagementNumber < 1`. "The first engagement" always means `engagementNumber == 1`.
- **Assistance changes who moves a control, never what the world does** (complexity ladder). No change to ballistics, flight model, terrain, or damage.
- **Withdrawal is one-way within a sortie.** Once the partner leaves `Present`, it never returns to it for that bandit instance.
- **Tick rate:** `AircraftSim.TickHz`; tests use `const double Dt = 1.0 / AircraftSim.TickHz;`.
- **Test command:** `dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj`

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `sim/Doctrine/PilotSkill.cs` | Opponent tiers + the cold-start ladder | Modify `ForEngagement` |
| `sim/Doctrine/ReactiveBandit.cs` | Bandit behaviour + tactic state machine | Add `Present` tactic, `PresentCommand`, withdrawal rule |
| `sim/Doctrine/FightDirector.cs` | Chooses what spawns, at the spawn boundary only | Mark the first engagement as a sparring spawn |
| `web/SnapshotProjection.cs` | Sim state → JSON for the browser | Emit `bandit_tactic`, `bandit_presenting` |
| `sim.Tests/SparringPartnerTests.cs` | All new behaviour | Create |

---

### Task 1: Restore a beatable opening rung

The degenerate ternary is the single highest-value line in this plan: it currently hands every cold-start visitor an Ace. This task is independently shippable and worth deploying before the rest lands.

**Files:**
- Modify: `sim/Doctrine/PilotSkill.cs:113-114`
- Test: `sim.Tests/SparringPartnerTests.cs`

**Interfaces:**
- Consumes: nothing.
- Produces: `BanditSkillProfile.ForEngagement(int engagementNumber) -> PilotSkill` returning a rising ladder rather than a constant. (Declared in `PilotSkill.cs`, on the `BanditSkillProfile` record struct — not on `PilotSkill`.)

- [ ] **Step 1: Write the failing test**

Create `sim.Tests/SparringPartnerTests.cs`:

```csharp
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using Xunit;

namespace GunsOnly.Sim.Tests;

public class SparringPartnerTests {
    const double Dt = 1.0 / AircraftSim.TickHz;

    static AircraftState State(double x, double y, double z, double speed, double chi = 0.0) =>
        new(new Vec3D(x, y, z), speed, 0.0, chi, 0.0, FlightModel.Sabre.MassKg);

    [Fact]
    public void TheOpeningEngagementIsNotAnAce() {
        Assert.Equal(PilotSkill.Novice, BanditSkillProfile.ForEngagement(1));
    }

    [Fact]
    public void TheLadderRisesToAce() {
        Assert.Equal(PilotSkill.Competent, BanditSkillProfile.ForEngagement(2));
        Assert.Equal(PilotSkill.Veteran, BanditSkillProfile.ForEngagement(3));
        Assert.Equal(PilotSkill.Ace, BanditSkillProfile.ForEngagement(4));
        Assert.Equal(PilotSkill.Ace, BanditSkillProfile.ForEngagement(9));
    }
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "TheOpeningEngagementIsNotAnAce"`
Expected: FAIL — `Assert.Equal() Failure: Expected: Novice, Actual: Ace`

- [ ] **Step 3: Restore the ramp**

In `sim/Doctrine/PilotSkill.cs`, replace lines 113-114:

```csharp
    public static PilotSkill ForEngagement(int engagementNumber) => engagementNumber switch {
        <= 1 => PilotSkill.Novice,
        2 => PilotSkill.Competent,
        3 => PilotSkill.Veteran,
        _ => PilotSkill.Ace,
    };
```

Also update the doc comment immediately above it. The existing comment argues that a cold start against a Novice was a non-event because the Novice was capped at 2.40 G and could not convert. That argument still stands **and is the reason Task 2 exists** — the opening bandit is no longer relying on being a weak fighter, it is a co-operative one. Add:

```
    /// The opening rung is beatable again because the sparring partner (BanditTactic.Present)
    /// now carries the introduction: engagement 1 opens co-operative and graduates itself on
    /// demonstrated tracking. The tier ladder no longer has to be the whole curriculum, so the
    /// old objection (a 2.40 G Novice is a non-event) is answered by behaviour, not by tier.
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "SparringPartnerTests"`
Expected: PASS (2 tests)

- [ ] **Step 5: Run the full sim suite for regressions**

Run: `dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj`
Expected: PASS. `FightDirectorTests` asserts the cold-start path reproduces `ForEngagement` exactly — if a test there pins `Ace` at engagement 1, it was pinning the bug; update it to the ladder and note why in the commit.

- [ ] **Step 6: Commit**

```bash
git add sim/Doctrine/PilotSkill.cs sim.Tests/SparringPartnerTests.cs
git commit -m "Give the opening engagement a beatable rung again"
```

---

### Task 2: The `Present` tactic and its withdrawal rule

**Files:**
- Modify: `sim/Doctrine/ReactiveBandit.cs` (enum at :146, tactic gate in the update path near :855-865, command helpers near :1383)
- Test: `sim.Tests/SparringPartnerTests.cs`

**Interfaces:**
- Consumes: `BanditSkillProfile.ForEngagement` (Task 1).
- Produces:
  - `BanditTactic.Present` — new enum member.
  - `ReactiveBandit.Presenting { get; }` → `bool`, true while the partner is co-operating.
  - `ReactiveBandit(..., bool presenting = false)` — opt-in constructor flag; default `false` keeps every existing call site behaving exactly as today.
  - `ReactiveBandit.PresentHoldSeconds` → `const double` = 2.0.

- [ ] **Step 1: Write the failing tests**

Append to `sim.Tests/SparringPartnerTests.cs`:

```csharp
    static ReactiveBandit SparringPartner() =>
        new(State(1000.0, 1000.0, 0.0, 180.0), FlightModel.Sabre,
            PilotSkill.Novice, terrain: null, engagementNumber: 1,
            profile: null, doctrineIndex: null, presenting: true);

    [Fact]
    public void TheSparringPartnerOpensCooperative() {
        var bandit = SparringPartner();
        Assert.True(bandit.Presenting);
        Assert.Equal(BanditTactic.Present, bandit.Tactic);
    }

    [Fact]
    public void HoldingAGunPositionGraduatesThePartner() {
        var bandit = SparringPartner();
        // Player parked 500 m directly astern: inside the 900 m funnel envelope, near zero angle-off.
        var player = State(500.0, 1000.0, 0.0, 180.0);
        for (int i = 0; i < (int)(3.0 * AircraftSim.TickHz); i++) bandit.Step(player, Dt);
        Assert.False(bandit.Presenting);
        Assert.NotEqual(BanditTactic.Present, bandit.Tactic);
    }

    [Fact]
    public void StayingOutOfRangeDoesNotGraduateThePartner() {
        var bandit = SparringPartner();
        // Player 4 km back: outside the funnel envelope entirely.
        var player = State(-3000.0, 1000.0, 0.0, 180.0);
        for (int i = 0; i < (int)(10.0 * AircraftSim.TickHz); i++) bandit.Step(player, Dt);
        Assert.True(bandit.Presenting);
    }

    [Fact]
    public void WithdrawalIsOneWay() {
        var bandit = SparringPartner();
        var close = State(500.0, 1000.0, 0.0, 180.0);
        for (int i = 0; i < (int)(3.0 * AircraftSim.TickHz); i++) bandit.Step(close, Dt);
        Assert.False(bandit.Presenting);
        var far = State(-5000.0, 1000.0, 0.0, 180.0);
        for (int i = 0; i < (int)(5.0 * AircraftSim.TickHz); i++) bandit.Step(far, Dt);
        Assert.False(bandit.Presenting);   // scaffolding does not come back
    }

    [Fact]
    public void PresentingIsDeterministic() {
        var a = SparringPartner();
        var b = SparringPartner();
        var player = State(700.0, 1000.0, 0.0, 175.0);
        for (int i = 0; i < (int)(4.0 * AircraftSim.TickHz); i++) {
            a.Step(player, Dt);
            b.Step(player, Dt);
            Assert.Equal(a.Tactic, b.Tactic);
            Assert.Equal(a.Presenting, b.Presenting);
        }
    }

    [Fact]
    public void DefaultConstructionIsUnchangedByThisFeature() {
        var bandit = new ReactiveBandit(State(0.0, 1000.0, 0.0, 165.0), FlightModel.Sabre);
        Assert.False(bandit.Presenting);
        Assert.Equal(BanditTactic.Acquire, bandit.Tactic);
    }
```

The per-tick entry point is `public void Step(in ActorObservation player, double dt)` at `ReactiveBandit.cs:809`. An `AircraftState` converts implicitly, so passing the `State(...)` helper's result directly is correct — `AceBanditTests.cs:21` does exactly this.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "SparringPartnerTests"`
Expected: FAIL to compile — `BanditTactic` has no member `Present`, `ReactiveBandit` has no `Presenting`.

- [ ] **Step 3: Add the enum member**

`sim/Doctrine/ReactiveBandit.cs:146`:

```csharp
/// Present is the co-operative opening tactic: a stable reference line the player joins up on.
/// It is not a weak fighter — it is a bandit deliberately not fighting yet. One-way: once a
/// player demonstrates a gun position the partner graduates and never presents again.
public enum BanditTactic { Acquire, Defend, Energy, Return, Present }
```

- [ ] **Step 4: Add the presenting state and the withdrawal rule**

Add fields beside `Tactic` (near :588):

```csharp
    /// Two burst lengths of sustained tracking. The reciprocal judgement about the bandit's own
    /// gun uses FightDirector.WalkoverSolutionSecondsConceded = 0.75; this is the player-side
    /// equivalent with margin. Primary tuning knob for the whole introduction.
    public const double PresentHoldSeconds = 2.0;
    const double PresentFunnelRangeM = 900.0;      // gun_funnel.js EFFECTIVE_CEILING_M
    const double PresentFunnelAngleRad = 0.2094;   // 12 deg, matching CameraSolver.GunWindow

    public bool Presenting { get; private set; }
    double _presentHeldSeconds;
```

Set `Presenting` from the new constructor parameter, and when it is true also set `Tactic = BanditTactic.Present` at construction.

Add the withdrawal evaluator:

```csharp
    /// Pure function of kernel state: range, angle-off and accumulated time. No director state,
    /// no wall clock, no randomness — so replays reproduce and FightDirector never counter-picks.
    void UpdatePresentWithdrawal(in ActorObservation player, double dt) {
        double range = Geometry.Range(_sim.State, player);
        double angleOff = Geometry.AngleOff(player, _sim.State);
        bool tracking = range <= PresentFunnelRangeM && angleOff <= PresentFunnelAngleRad;
        _presentHeldSeconds = tracking ? _presentHeldSeconds + dt : 0.0;
        if (_presentHeldSeconds >= PresentHoldSeconds) Presenting = false;
    }
```

`Geometry.AngleOff(a, b)` is the angle from `a`'s nose to `b` — check the argument order used at `CameraSolver.cs:7` (`Geometry.AngleOff(own, bandit)`) and mirror it so this measures the *player's* nose onto the bandit, which is what "the player is tracking me" means.

- [ ] **Step 5: Gate the update path**

Insert immediately before the `if (_profile.LookaheadHorizonTicks > 0)` branch (around :859), so it short-circuits both the lookahead and simple paths:

```csharp
        if (Presenting) {
            UpdatePresentWithdrawal(player, dt);
            if (Presenting) {
                Tactic = BanditTactic.Present;
                LastCommand = PresentCommand();
                RecordSingleCandidateDecision(LastCommand);
                _sim.Step(LastCommand, dt);
                T += dt;
                return;
            }
        }
```

Once `Presenting` flips false the method falls through to the normal machine on that same tick and every tick after — the one-way property comes free from never setting it back to true.

- [ ] **Step 6: Add `PresentCommand`**

Beside `ReturnCommand()` (near :1383). Read `ReturnCommand()` first for the exact positional meaning of `PilotCommand`'s four arguments — the class default is `new(1.0, 0.0, 0.85, 0.0)` — then write the presenting command in that idiom. Behaviour required:

- **a shallow, constant bank** giving a gentle, predictable curving line (target ~15° bank, well under 2 G) so the player has a stable reference to join on and a turn to pull inside of;
- **throttle holding roughly the spawn speed (~180 m/s)** so a player at combat power closes rather than falls behind;
- **no reaction to the player at all** — the parameter is unused by design; this is what makes it presenting rather than defending.

Do not fire: confirm `BanditFireControl` is gated on the tactic, and add `Present` to whatever suppresses firing so the partner cannot shoot back.

- [ ] **Step 7: Run tests to verify they pass**

Run: `dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "SparringPartnerTests"`
Expected: PASS (8 tests)

- [ ] **Step 8: Run the full suite**

Run: `dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj`
Expected: PASS. `DefaultConstructionIsUnchangedByThisFeature` plus the existing `CompetentProfileReproducesTheDefaultBanditTickForTick` together prove the default path is untouched.

- [ ] **Step 9: Commit**

```bash
git add sim/Doctrine/ReactiveBandit.cs sim.Tests/SparringPartnerTests.cs
git commit -m "Add the co-operative Present tactic and its one-way withdrawal"
```

---

### Task 3: Open the first merge at 1,000 m

**Files:**
- Modify: `sim/Doctrine/ReactiveBandit.cs` — `SpawnForMerge` (:326+), where `alongM = 2200.0 + variation * 220.0`
- Test: `sim.Tests/SparringPartnerTests.cs`

**Interfaces:**
- Consumes: `ReactiveBandit.Presenting` (Task 2).
- Produces: `SpawnForMerge(..., bool presenting = false)` — when `presenting` is true, spawns at 1,000 m and returns a bandit already in `Present`.

- [ ] **Step 1: Write the failing test**

```csharp
    [Fact]
    public void TheSparringMergeOpensInsideVisualRange() {
        var player = State(0.0, 1000.0, 0.0, 180.0);
        var bandit = ReactiveBandit.SpawnForMerge(
            player, FlightModel.Sabre, engagementNumber: 1,
            speedMps: 180.0, skill: PilotSkill.Novice, presenting: true);
        double range = Geometry.Range(player, bandit.State);
        Assert.InRange(range, 900.0, 1150.0);
        Assert.True(bandit.Presenting);
    }

    [Fact]
    public void TheOrdinaryMergeGeometryIsUnchanged() {
        var player = State(0.0, 1000.0, 0.0, 180.0);
        var bandit = ReactiveBandit.SpawnForMerge(
            player, FlightModel.Sabre, engagementNumber: 1, speedMps: 180.0);
        Assert.False(bandit.Presenting);
        Assert.InRange(Geometry.Range(player, bandit.State), 2000.0, 2600.0);
    }
```

`ReactiveBandit.State` is `public AircraftState State => _sim.State;` at `ReactiveBandit.cs:571`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "Merge"`
Expected: FAIL to compile — `SpawnForMerge` has no `presenting` parameter.

- [ ] **Step 3: Implement**

Add `bool presenting = false` as the final parameter. Inside, replace the fixed along-track distance:

```csharp
        // The introduction opens inside visual range. At 3,700 m an 11.3 m span subtends 1.1 px
        // on a 390 px phone — there is nothing to see, judge, or lead. At 1,000 m it is ~4 px and
        // growing, and reads as an aeroplane with an aspect. The join-up is the lesson.
        double alongM = presenting ? 1000.0 : 2200.0 + variation * 220.0;
```

Pass `presenting` through to the constructor.

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "SparringPartnerTests"`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add sim/Doctrine/ReactiveBandit.cs sim.Tests/SparringPartnerTests.cs
git commit -m "Open the sparring merge inside visual range"
```

---

### Task 4: Field the sparring partner on the first engagement

**Files:**
- Modify: `sim/Doctrine/FightDirector.cs` — `SpawnSpec` (:27-30), `NextSpawn` (:133-136)
- Modify: `sim/SimulationSession.cs:1221` and `sim/Doctrine/Beats.cs:569` — the `SpawnForMerge` call sites
- Test: `sim.Tests/SparringPartnerTests.cs`

**Interfaces:**
- Consumes: `SpawnForMerge(..., bool presenting)` (Task 3).
- Produces: `SpawnSpec.Sparring` → `bool`, defaulted `false`, true only on the cold-start first engagement.

- [ ] **Step 1: Write the failing test**

```csharp
    [Fact]
    public void TheDirectorOpensWithASparringPartner() {
        var director = new FightDirector();
        SpawnSpec first = director.NextSpawn(1);
        Assert.True(first.Sparring);
        Assert.Equal(PilotSkill.Novice, first.Skill);
        Assert.Equal(1, first.FormationSize);
        Assert.False(first.Boss);
    }

    [Fact]
    public void OnlyTheFirstEngagementSpars() {
        var director = new FightDirector();
        Assert.False(director.NextSpawn(2).Sparring);
        Assert.False(director.NextSpawn(5).Sparring);
    }
```

`FightDirector` declares no explicit constructor, so the implicit public parameterless `new FightDirector()` is correct. It constructs its own `LearnerModel`; `_anyObserved` is false until `Observe` is called, which is precisely the cold-start condition this test exercises.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "Director"`
Expected: FAIL to compile — `SpawnSpec` has no `Sparring`.

- [ ] **Step 3: Add `Sparring` to `SpawnSpec`**

```csharp
public readonly record struct SpawnSpec(
    PilotSkill Skill, int DoctrineIndex, bool Boss, string Reason,
    bool Machine = false, BanditMount Mount = BanditMount.Baseline,
    int FormationSize = 1, bool Sparring = false);
```

Defaulted last, so every existing construction site compiles unchanged.

- [ ] **Step 4: Set it on the cold-start branch only**

In `NextSpawn`, the existing warm-up branch at :133-136 becomes:

```csharp
        if (!_anyObserved && _phase == DirectorPhase.Calm)
            return WithDoctrine(BanditSkillProfile.ForEngagement(engagementNumber),
                engagementNumber, boss: false, "warm-up ladder")
                with { Sparring = engagementNumber <= 1 };
```

This is a spawn-boundary decision reading only `_anyObserved` and `_phase`, which the director already commits at this exact point — the determinism contract is untouched. A returning player whose learner estimate exists has `_anyObserved` true and never sees the sparring partner.

- [ ] **Step 5: Thread it to the spawn**

At `sim/SimulationSession.cs:1221` and `sim/Doctrine/Beats.cs:569`, pass the flag through:

```csharp
        ReactiveBandit actor = ReactiveBandit.SpawnForMerge(
            /* ...existing arguments unchanged... */,
            presenting: spec.Sparring);
```

Use whatever local holds the `SpawnSpec` at each site. If a site has no `SpawnSpec` in scope, it is not the director-driven path — leave it alone and it keeps today's behaviour by default.

- [ ] **Step 6: Run tests to verify they pass**

Run: `dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj`
Expected: PASS, whole suite. `FightDirectorTests`' determinism assertions must still hold — if any fail, the `with { Sparring = ... }` has been placed outside the commit boundary.

- [ ] **Step 7: Commit**

```bash
git add sim/Doctrine/FightDirector.cs sim/SimulationSession.cs sim/Doctrine/Beats.cs sim.Tests/SparringPartnerTests.cs
git commit -m "Field the sparring partner on the cold-start first engagement"
```

---

### Task 5: Emit the tactic so the fix is measurable

Without this, `bin/telemetry-report --deep` cannot distinguish "the partner worked" from "the partner never spawned".

**Files:**
- Modify: `web/SnapshotProjection.cs:1327` (beside `bandit_skill`)
- Test: `sim.Tests/SnapshotProjectionTests.cs`

**Interfaces:**
- Consumes: `ReactiveBandit.Tactic`, `ReactiveBandit.Presenting` (Task 2).
- Produces: JSON fields `bandit_tactic` (string, e.g. `"PRESENT"`) and `bandit_presenting` (bool).

- [ ] **Step 1: Write the failing test**

Do not build a new fixture. `sim.Tests/SnapshotProjectionTests.cs:222-225` already walks beats and asserts on `bandit_skill` against a `root` JsonElement:

```csharp
        // Fielded AI tier: doctrine pilots project their tier, scripted rail actors project null.
        JsonElement banditSkill = root.GetProperty("bandit_skill");
        if (beatIndex is 7 or 9) Assert.Equal("ACE", banditSkill.GetString());
        else Assert.Equal(JsonValueKind.Null, banditSkill.ValueKind);
```

Extend that block in place, following the same "doctrine pilots project, rail actors project null" rule:

```csharp
        // Tactic rides alongside the tier: a doctrine pilot always has one, a rail actor does not.
        JsonElement banditTactic = root.GetProperty("bandit_tactic");
        if (beatIndex is 7 or 9) Assert.False(string.IsNullOrEmpty(banditTactic.GetString()));
        else Assert.Equal(JsonValueKind.Null, banditTactic.ValueKind);
        Assert.False(root.GetProperty("bandit_presenting").GetBoolean());
```

`bandit_presenting` is false throughout this fixture because these beats field ordinary doctrine pilots, not the cold-start sparring spawn. The `"PRESENT"` string itself is covered by Task 2's unit tests; what this test protects is that the fields exist, are typed correctly, and follow the same null discipline as `bandit_skill`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "ProjectionCarriesTheBanditTactic"`
Expected: FAIL — property `bandit_tactic` not found.

- [ ] **Step 3: Emit the fields**

Beside line 1327, matching the uppercase convention `bandit_skill` already uses (`"ACE"`, `"NOVICE"`):

```csharp
            + $"\"bandit_tactic\":{banditTacticJson},"
            + $"\"bandit_presenting\":{(banditPresenting ? "true" : "false")},"
```

Build `banditTacticJson` exactly as `banditSkillJson` is built a few lines above — same null handling, same uppercasing, same quoting.

- [ ] **Step 4: Run tests to verify they pass**

Run: `dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj`
Expected: PASS, whole suite.

- [ ] **Step 5: Extend the report to show the introduction**

In `tools/telemetry/report.py`, `deep_funnel()` already replays state rows. Add to the per-session `stats` entry:

```python
        "sparred": False,
        "graduated": False,
```

and inside the state loop:

```python
                    if state.get("bandit_presenting") is True:
                        entry["sparred"] = True
                    elif entry["sparred"] and state.get("bandit_presenting") is False:
                        entry["graduated"] = True
```

Then print two new funnel lines above `fired the guns`:

```python
        print(f"  met a sparring partner  {len([n for n in visitors if stats[n]['sparred']]):>6}")
        print(f"  graduated it            {len([n for n in visitors if stats[n]['graduated']]):>6}")
```

- [ ] **Step 6: Verify the report still runs**

Run: `bin/telemetry-report --days 7`
Expected: the existing report prints unchanged (no visitor has the new fields yet, so both new counters read 0 under `--deep`).

- [ ] **Step 7: Commit**

```bash
git add web/SnapshotProjection.cs sim.Tests/SnapshotProjectionTests.cs tools/telemetry/report.py
git commit -m "Project the bandit tactic so the introduction is measurable"
```

---

### Task 6: The instructor voice

**Files:**
- Modify: `audio/radio/mission/lines.json`, `sim/MissionRadio.cs`
- Test: `sim.Tests/` — follow the existing `MissionRadio` test file if one exists; otherwise add cases to `sim.Tests/SparringPartnerTests.cs`

**Interfaces:**
- Consumes: `ReactiveBandit.Presenting`, `range_m` (Tasks 2-3).
- Produces: three new catalog IDs in the existing `lso` role.

- [ ] **Step 1: Read the catalog contract**

Read `audio/radio/mission/README.md` and `PERFORMANCE-CORPUS.md` in full before editing. Binding rules: the simulation chooses a catalog ID from physical events, the browser never invents dialogue, gameplay consumes authored WAVs only, and every role needs both an equipment profile ID. Silence is a specified property, not an absence.

- [ ] **Step 2: Add three lines in the `lso` role**

Terse, corrective, against a stable reference — the LSO idiom applied to a join-up. Match the exact field set of an existing `lso` entry (`id`, `role`, `text`, `target_duration_s`, `speed`, `description`, `direction`):

| Trigger (physical) | Text |
|---|---|
| `Presenting` and `range_m > 1500` | "You're wide — bring it in." |
| `Presenting` and `range_m <= 900` and not yet tracking | "In range. Steady." |
| `Presenting` flips false (graduation) | "That's it — he's fighting now." |

One call per trigger per sortie. No repetition, no chatter while the player is closing correctly.

- [ ] **Step 3: Validate the catalog**

Run: `python3 tools/audio/radio_voice.py validate`
Expected: PASS. This is a hard gate — the catalog is versioned and validated, and an invalid entry fails the build.

- [ ] **Step 4: Wire the triggers**

In `sim/MissionRadio.cs`, follow the existing event→ID selection for LSO calls. Guard each with a once-per-sortie latch so a player oscillating around 1,500 m does not retrigger.

- [ ] **Step 5: Preview the generation plan**

Run: `python3 tools/audio/radio_voice.py generate --dry-run`
Expected: the three new IDs appear as pending. Actual WAV generation needs a provider credential (keychain `guns-only-voice-providers`) and is a separate deliberate step — do not generate as part of this task.

- [ ] **Step 6: Run the full suite**

Run: `dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add audio/radio/mission/lines.json sim/MissionRadio.cs sim.Tests/SparringPartnerTests.cs
git commit -m "Give the sparring partner an instructor in the LSO idiom"
```

---

## Before shipping

- [ ] Fly it. `bin/preview-web`, take the opening sortie on a phone-sized viewport, and confirm the partner reads as a competent aeroplane flying a line rather than a broken one — then join up, hold it, and feel the graduation.
- [ ] `bin/check` clean.
- [ ] Deploy via `bin/deploy-web --prod`, which refuses a dirty worktree by design. Commit first.
- [ ] **Wait a day, then run `bin/telemetry-report --days 2 --deep`.** Acceptance is `killed something > 0` for a visitor session. Nothing else counts.
