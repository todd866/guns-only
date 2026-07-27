# Eastern Authority Points Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Re-orient Rapier home plate to launch west from the eastern Ukraine-theatre edge, and ship a thin deterministic points ledger on debrief — per `docs/superpowers/specs/2026-07-27-eastern-authority-points-design.md`.

**Architecture:** Beat geometry owns eastern basing (`headingRad` + contact offsets). A pure `PointsLedger` scores only facts already on the finished-sortie snapshot/record. Web debrief renders a municipal ledger slip; campaign profile stores running balance and next-sortie clearance. No clinic/medevac UI; no kernel physics changes.

**Tech Stack:** C# `sim` + `sim.Tests` (xUnit), WebAssembly bridge snapshot fields, browser debrief JS (`sortie_result.js` / `app.js`), `node --test` for presentation units, `./bin/check` gate.

## Global Constraints

- Spec: sortie-only; Ghibli soft world / cold instruments (ADR-0003); Yurchak municipal copy — not Soviet costume drama.
- Ledger scores only evidence already on the sortie record (no invented geofence/collateral/fatigue rows in v1).
- Ledger must not rewrite physical outcomes or buff airframe performance.
- `headingRad` uses sim east/up/north: west launch = `-π/2` (`Fwd = (-1,0,0)`).
- Commit only when the user asks (repo rule); plan commit steps are optional checkpoints.
- Keep `./bin/check` green; HUD projective truth unchanged.
- Fiction labels: eastern authority / rate card are `fiction`.

## File map

| File | Responsibility |
| --- | --- |
| `sim/Doctrine/Beats.cs` | RapierIntercept / RapierCircuits strip heading, contact geometry |
| `sim/PointsLedger.cs` | Pure rate-card evaluation over `SortieLedgerFacts` |
| `sim.Tests/PointsLedgerTests.cs` | Unit tests for credits/debits/clearance |
| `sim.Tests/RapierEasternBasingTests.cs` | Strip heading + bandit west-of-home assertions |
| `web/SnapshotProjection.cs` (and hot frame if needed) | Project ledger slip fields when finished |
| `web/wwwroot/render/debrief/points_ledger.js` | Present ledger slip from snapshot |
| `web/wwwroot/render/debrief/tests/points_ledger.test.mjs` | Presentation unit tests |
| `web/wwwroot/render/debrief/sortie_result.js` | Municipal kicker/title hooks for Rapier |
| `web/wwwroot/app.js` | Wire slip into finished debrief UI; mission brief copy |
| `web/wwwroot/render/progression/campaign_progression.js` | Persist `pointsBalance` + apply clearance |
| `docs/superpowers/specs/2026-07-27-eastern-authority-points-design.md` | Mark status accepted after ship |

---

### Task 1: Eastern strip heading + contact geometry

**Files:**
- Modify: `sim/Doctrine/Beats.cs` (`RapierIntercept`, `RapierCircuits`)
- Create: `sim.Tests/RapierEasternBasingTests.cs`

**Interfaces:**
- Consumes: `Carrier.HeadingRad`, `Carrier.Fwd`, existing `BeatSetup` bandit placement
- Produces: Rapier strip `headingRad == -π/2`; intercept bandit west of home along −X; Circuits park bandit still non-mergeable relative to new axis

**Geometry lock (do not invent alternatives in-task):**

| Quantity | Value |
| --- | --- |
| Strip `headingRad` | `-Math.PI / 2` (west) |
| Strip `deckCentre` | keep `(0, 120.5, 0)` for v1 (eastern *fiction* = launch axis into theatre; terrain-anchor shift is follow-on) |
| Intercept bandit position | `(-680_000, 18_000, 18_000)` — far west, same range class as today’s 680 km |
| Intercept bandit heading | `Math.PI / 2` (eastbound / closing toward home) |
| Intercept bandit speed | keep `210` m/s |
| Circuits bandit park | `(-400_000, 24_000, 0)` speed `200` — west of home, pattern-only still never merges |

- [ ] **Step 1: Write failing tests**

```csharp
// sim.Tests/RapierEasternBasingTests.cs
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using Xunit;

public class RapierEasternBasingTests {
    [Fact]
    public void RapierIntercept_LaunchesWest_FromEasternHomePlate() {
        BeatSetup beat = Beats.RapierIntercept();
        Carrier strip = Assert.IsType<Carrier>(beat.Carrier);
        Assert.Equal(-Math.PI / 2, strip.HeadingRad, precision: 10);
        Assert.True(strip.Fwd.X < -0.99);
        Assert.True(Math.Abs(strip.Fwd.Z) < 1e-9);

        Assert.True(beat.Bandit.Position.X < -600_000);
        Assert.True(beat.Bandit.Position.X < strip.Position.X);
        Assert.Equal(Math.PI / 2, beat.Bandit.Psi, precision: 10);
    }

    [Fact]
    public void RapierCircuits_KeepsSameWestStrip_ParksContactOffMerge() {
        BeatSetup circuits = Beats.RapierCircuits();
        BeatSetup intercept = Beats.RapierIntercept();
        Assert.Equal(intercept.Carrier!.HeadingRad, circuits.Carrier!.HeadingRad, precision: 10);
        Assert.True(circuits.Bandit.Position.X < -100_000);
        Assert.Equal(0, circuits.ScriptedIntercept!.FormationSize);
    }
}
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
dotnet test sim.Tests/sim.Tests.csproj --filter FullyQualifiedName~RapierEasternBasingTests
```

Expected: FAIL (heading still `0`, bandit still +Z).

- [ ] **Step 3: Minimal implementation in `Beats.RapierIntercept`**

Change the fixed strip constructor to `headingRad: -Math.PI / 2`.  
Change bandit to `new AircraftState(new Vec3D(-680_000, 18_000, 18_000), 210, 0, Math.PI / 2, 0, …)`.  
In `RapierCircuits`, set bandit park to `new Vec3D(-400_000, 24_000, 0)`.  
Update comments that say “north” / “deep rear” to “west into theatre / eastern home plate.”

- [ ] **Step 4: Run tests — expect PASS**

```bash
dotnet test sim.Tests/sim.Tests.csproj --filter "FullyQualifiedName~RapierEasternBasingTests|FullyQualifiedName~RapierTests|FullyQualifiedName~RapierMissionTests|FullyQualifiedName~UkraineTerrainTruthTests"
```

Fix any assertions that hard-coded +Z bandit or heading `0` for Rapier only (do not flip carrier-sea beats).

- [ ] **Step 5: Manual smoke note** — Rapier Circuits: launch should climb out toward −X; HUD home bearing after launch should read back toward +X (east).

---

### Task 2: Municipal Rapier mission copy

**Files:**
- Modify: `web/wwwroot/app.js` (`MISSION_BRIEFS` / `rapier-intercept` and `rapier-circuits` entries)
- Modify: `web/wwwroot/render/progression/campaign_progression.js` short objectives for those nodes

**Copy register (exact tone):**
- Kickers: `Eastern corridor · allocation posted` (not “deep-rear dispersed basing” patriotism).
- Short, procedural. No freedom speech. No Soviet costume words.

- [ ] **Step 1: Update briefs**

`rapier-intercept` kicker → `"Eastern corridor · guns-only"`.  
Brief opening sentence may stay operational (Mach profile) but replace “Mission automation owns…” framing with municipal permanence where it talks about basing — e.g. home plate is the eastern strip; recovery is mandatory asset return.

`rapier-circuits` (find its brief entry / campaign node): kicker → `"Eastern corridor · pattern only"`; shortObjective mentions eastern strip trap practice.

- [ ] **Step 2: Smoke** — open mission list; Rapier cards show new kickers; no “motherland” / banner language.

---

### Task 3: Pure `PointsLedger` (C#)

**Files:**
- Create: `sim/PointsLedger.cs`
- Create: `sim.Tests/PointsLedgerTests.cs`

**Interfaces:**

```csharp
namespace GunsOnly.Sim;

public enum SortieClearance : byte {
    Cleared = 0,
    Deferred = 1,
    Grounded = 2,
}

public readonly record struct SortieLedgerFacts(
    bool Finished,
    bool PlayerAlive,
    bool BanditDestroyed,   // opponent not alive / splash
    bool CleanRecovery,     // trap + arrest stopped (or RecoveryCompletesSortie win path)
    double FuelBurnedLb,    // max(0, initial - remaining); 0 if unknown
    bool PlayerLost);       // defeat / player not alive

public readonly record struct LedgerLine(string Code, string Label, int Points);

public sealed record PointsLedgerSlip(
    IReadOnlyList<LedgerLine> Lines,
    int SortieNet,
    int BalanceBefore,
    int BalanceAfter,
    SortieClearance Clearance);

public static class PointsLedger {
    // v1 magnitudes (fiction rate card)
    public const int CreditKill = 100;
    public const int CreditCleanRecovery = 50;
    public const int DebitLoss = -200;
    public const int FuelDebitPerTenLb = -1; // floor(burnedLb / 10) * -1
    public const int DeferredBelow = 0;
    public const int GroundedBelow = -150;

    public static PointsLedgerSlip Evaluate(SortieLedgerFacts facts, int balanceBefore);
}
```

**Clearance rules:**
- `BalanceAfter >= 0` → `Cleared`
- `GroundedBelow <= BalanceAfter < 0` → `Deferred`
- `BalanceAfter < GroundedBelow` → `Grounded`
- If `!facts.Finished` → empty lines, net 0, clearance from `balanceBefore` only (no-op slip)

- [ ] **Step 1: Write failing tests**

```csharp
[Fact]
public void KillAndTrap_CreditsOutweighFuel() {
    var slip = PointsLedger.Evaluate(new SortieLedgerFacts(
        Finished: true, PlayerAlive: true, BanditDestroyed: true,
        CleanRecovery: true, FuelBurnedLb: 800, PlayerLost: false), 0);
    Assert.Contains(slip.Lines, l => l.Code == "KILL" && l.Points == 100);
    Assert.Contains(slip.Lines, l => l.Code == "RECOVERY" && l.Points == 50);
    Assert.Contains(slip.Lines, l => l.Code == "FUEL" && l.Points == -80);
    Assert.Equal(70, slip.SortieNet);
    Assert.Equal(SortieClearance.Cleared, slip.Clearance);
}

[Fact]
public void Loss_GroundsFromZero() {
    var slip = PointsLedger.Evaluate(new SortieLedgerFacts(
        Finished: true, PlayerAlive: false, BanditDestroyed: false,
        CleanRecovery: false, FuelBurnedLb: 100, PlayerLost: true), 0);
    Assert.True(slip.BalanceAfter < PointsLedger.GroundedBelow);
    Assert.Equal(SortieClearance.Grounded, slip.Clearance);
}

[Fact]
public void NegativeButAboveFloor_Defers() {
    var slip = PointsLedger.Evaluate(new SortieLedgerFacts(
        Finished: true, PlayerAlive: true, BanditDestroyed: false,
        CleanRecovery: false, FuelBurnedLb: 200, PlayerLost: false), 0);
    Assert.Equal(SortieClearance.Deferred, slip.Clearance);
}
```

- [ ] **Step 2: Run — expect FAIL** (`PointsLedger` missing)

- [ ] **Step 3: Implement `sim/PointsLedger.cs`** — build lines only for applicable facts; sum; apply clearance.

- [ ] **Step 4: Run — expect PASS**

```bash
dotnet test sim.Tests/sim.Tests.csproj --filter FullyQualifiedName~PointsLedgerTests
```

---

### Task 4: Project ledger onto finished snapshot + persist balance

**Files:**
- Modify: `web/SnapshotProjection.cs` (cold JSON path that already emits `sortie_outcome` / `finished`)
- Modify: `web/SnapshotHotFrame.cs` only if finished debrief reads hot frame for these fields — prefer cold/full projection used by pause UI
- Modify: `web/wwwroot/render/progression/campaign_progression.js`
- Modify: `web/wwwroot/app.js` (`renderPauseUi` finished branch)

**Fact mapping from session/snapshot (v1):**

| Fact | Source |
| --- | --- |
| Finished | `finished == true` |
| PlayerAlive | `player_alive !== false` and terminal not destroyed |
| BanditDestroyed | `bandit_alive === false` or fight splash / victory path |
| CleanRecovery | `recovery === "TRAP"` or `arrest_phase === "STOPPED"` |
| FuelBurnedLb | If `fuel_initial_lb` exists use delta; else `0` (do not invent). Add `fuel_initial_lb` to projection from beat `Fuel.InitialFuelLb` if missing |
| PlayerLost | `sortie_outcome === "DEFEAT"` or `player_alive === false` |
| balanceBefore | `campaignProfile.pointsBalance` (default 0) |

**Snapshot fields to emit when finished (and Rapier mission family, or always — always is fine; UI shows only when lines present):**

```text
points_sortie_net, points_balance_before, points_balance_after,
points_clearance ("CLEARED"|"DEFERRED"|"GROUNDED"),
points_lines: [{code,label,points}, ...]
```

Prefer evaluating ledger in C# inside projection from session facts so JS cannot drift. If projection cannot easily see initial fuel, add `Session.Beat.Fuel.InitialFuelLb` read in projection.

**Campaign profile extension:**

```js
// createCampaignProfile adds:
pointsBalance: Math.trunc(Number(source.pointsBalance) || 0),
```

On finished Rapier debrief (mission id contains `rapier`), after computing/receiving slip:  
`campaignProfile = saveCampaignProfile({ ...campaignProfile, pointsBalance: slip.BalanceAfter })`.

Clearance UI: if `GROUNDED`, disable “Fly again” primary until balance recovers — **v1 soft gate:** still allow Fly again but show clearance line `Exception denied · grounded pending allocation` and set `readyHint` accordingly. (Hard lock is follow-on; soft gate matches “clear incentive scheme” without trapping testers.)

- [ ] **Step 1: Add `fuel_initial_lb` to snapshot if absent**; wire C# `PointsLedger.Evaluate` in projection when `finished`.

- [ ] **Step 2: Persist `pointsBalance` in campaign profile**; apply after Rapier finished debrief render once per sortie (guard with a session flag / last finished tick so re-renders do not double-debit).

- [ ] **Step 3: Unit-test profile round-trip** in existing progression tests if present; else add `campaign_progression` test for `pointsBalance` default 0.

---

### Task 5: Debrief ledger slip presentation

**Files:**
- Create: `web/wwwroot/render/debrief/points_ledger.js`
- Create: `web/wwwroot/render/debrief/tests/points_ledger.test.mjs`
- Modify: `web/wwwroot/app.js` finished branch (`readyConfig` / `readyControls`)
- Modify: `web/wwwroot/render/debrief/sortie_result.js` — Rapier municipal kicker when points present

**Produces:**

```js
pointsLedgerPresentation(state) → null | {
  kicker: "Allocation posted",
  lines: [{ label, pointsText }], // e.g. "Verified splash · +100"
  netText: "Sortie net · +70",
  balanceText: "Balance · 70",
  clearanceText: "Norm fulfilled · cleared", // or deferred/grounded municipal phrasing
}
```

Clearance copy map:
- CLEARED → `Norm fulfilled · cleared`
- DEFERRED → `Allocation deferred`
- GROUNDED → `Exception denied · grounded pending allocation`

- [ ] **Step 1: Failing node tests** for kill+trap slip formatting and grounded phrasing.

- [ ] **Step 2: Implement presentation**; import in `app.js`; when finished and presentation non-null, set `readyConfig` to net/balance/clearance one-liner and append line list into `readyControls` (or `readyBrief` suffix). Keep cold instrument tone.

- [ ] **Step 3:**

```bash
node --test web/wwwroot/render/debrief/tests/points_ledger.test.mjs
```

Expected: PASS.

---

### Task 6: Gate + spec status

**Files:**
- Modify: `docs/superpowers/specs/2026-07-27-eastern-authority-points-design.md` status → `accepted`

- [ ] **Step 1: Run**

```bash
./bin/check
```

Expected: green (or only pre-existing failures unrelated to this work — do not land new red).

- [ ] **Step 2: Manual fly-check checklist**
  - Rapier Circuits: launch west; trap still works; ledger shows fuel debit + optional recovery if finished path fires (Circuits may not finish on trap — if unfinished, ledger no-op; acceptable).
  - Rapier Intercept: contact west; splash + trap → positive slip; crash → grounded/deferred language.
  - Mission cards: eastern corridor kickers.

- [ ] **Step 3: Mark spec accepted**; note follow-ons (terrain-anchor eastern shift, hard clearance lock, FightDirector coupling, geofence rows) remain out of pass.

---

## Spec coverage check

| Spec requirement | Task |
| --- | --- |
| Eastern launch / west axis | Task 1 |
| Contact west of home / Circuits same strip | Task 1 |
| Municipal / Yurchak copy | Task 2, 5 |
| Thin points ledger on debrief | Tasks 3–5 |
| Evidence-only scoring | Task 3–4 |
| Running balance + clearance | Task 4–5 |
| No clinic/medevac | Global constraint |
| ADR-0003 / HUD truth untouched | Global constraint |
| Success criteria fly-check | Task 6 |

## Placeholder / consistency review

- Heading locked to `-π/2` (west), not `π` (south).
- Rate-card magnitudes named as constants in Task 3; UI must use projected numbers, not re-hardcode.
- Circuits may not emit a finished ledger every trap — documented acceptable for v1.
- Soft clearance gate (copy only) avoids trapping CI/manual testers; hard lock is follow-on.
