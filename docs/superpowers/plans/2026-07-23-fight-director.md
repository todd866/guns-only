# Fight Director Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> **Execution note (this run):** tasks are offloaded to Codex exec (write-mode, this worktree) in three
> sequential groups — Group A = Tasks 1–2, Group B = Tasks 3–5, Group C = Tasks 6–7 — with Claude
> reviewing and gating between groups. Codex has repo access; tests below are behavioural contracts
> plus key assertions, and Codex writes the full TDD cycle around them (failing test first, then
> implementation, then green, then commit — per step checkboxes).

**Goal:** Implement `docs/superpowers/specs/2026-07-23-fight-director-design.md` — defensive lookahead (Layer 1), LearnerModel V0 + pacing director (Layer 2), honest cat-and-mouse boss (Layer 3) — for infinite-spawn continuous combat.

**Architecture:** Layer 1 extends `ReactiveBandit`'s lookahead candidate set/scoring with threat-aware defensive terms gated by the existing dead profile flags. Layer 2 adds `sim/Doctrine/FightDirector.cs` (+ per-engagement report assembly in `SimulationSession`) replacing `BanditSkillProfile.ForEngagement` at its reserved seam. Layer 3 adds a boss overlay (stalk/commit) on the Ace profile inside `ReactiveBandit`.

**Tech Stack:** C# (.NET 8), `GunsOnly.Sim` kernel, xUnit. Test invocation:
`$HOME/.dotnet/dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~<Name>"`.
Full gate: `PATH="/opt/homebrew/bin:$PATH" GUNS_DOTNET_CLI="$HOME/.dotnet/dotnet" DOTNET_ROOT="$HOME/.dotnet" DOTNET_MULTILEVEL_LOOKUP=0 ./bin/check` (capture bin/check's own exit code).

## Global Constraints

- **Determinism:** no `DateTime`/`Stopwatch`/wall clock/unseeded RNG in any tick. Director + learner + boss state are pure functions of observed fight history and engagement number.
- **Honesty:** bandits read only `ActorObservation`; all firing stays routed through `BanditFireControl`; no deliberate misses; no privileged player state anywhere.
- **Regression:** Novice/Competent behaviour byte-identical (they keep `LookaheadHorizonTicks == 0` and the untouched state machine). Existing `ReactiveBanditTests`, `AceBanditTests`, `AiThreatTests`, determinism suites stay green unchanged.
- **No renderer/browser types in `sim/`.** No `web/wwwroot` production files change (no build-stamp bump).
- **Forbidden files:** `sim/AutoGcas.cs`, `sim.Tests/AutoGcas*` (concurrent session owns them), anything under `web/wwwroot/`.
- **Cold-start parity:** a director with a neutral (no-history) learner must reproduce `ForEngagement`'s Novice→Competent→Veteran→Ace ramp exactly.

---

### Task 1: Threat-aware defensive lookahead (the second act)

**Files:**
- Modify: `sim/Doctrine/ReactiveBandit.cs` (`LookaheadCommand` candidates ~line 635, `ScoreCandidate` ~line 708)
- Modify: `sim/Doctrine/BanditDecisionTrace.cs` (candidate capacity 6 → 9; keep record layout append-only so `DecisionRecorder` serialization stays valid — update its writer accordingly)
- Test: `sim.Tests/FightDirectorBanditTests.cs` (new)

**Interfaces:**
- Consumes: `_profile.ForcesOvershoot`, `_profile.DisengagesWhenLosing` (currently dead flags).
- Produces: no new public API. Three new candidates + two new scoring terms, all inside the lookahead.

**Behaviour contract:**
1. **Threat term.** During the existing rollout in `ScoreCandidate`, accumulate `threatSeconds`: a sample counts when the *predicted player* holds a gun-quality position on the probe — range < `BanditFireControl` max range AND the predicted player's nose error toward the probe < ~12° (compute nose error from the predicted velocity direction (`predChi`/`predGamma`) vs the LOS to `probeState.Position`; all quantities already exist in the rollout — honest, observation-derived). Score `-= threatWeight * threatSeconds` with `threatWeight` ≈ the gun-window reward magnitude (10.0) so escaping a solution competes with gaining one. Active for every lookahead tier (Veteran+); this alone fixes "keeps optimising a hopeless solution while I gun it".
2. **New candidates (append, never reorder existing six — trace indices are telemetry):**
   - *Break* (gate: `ForcesOvershoot`): max-perform pull with lift vector placed on a point perpendicular to the attacker LOS, biased up-and-across (out-of-plane last-ditch).
   - *Orthogonal reverse* (gate: `ForcesOvershoot`): moderate-G pull, lift vector ⊥ LOS on the *opposite* side (gives the scorer both out-of-plane exits).
   - *Separate* (gate: `DisengagesWhenLosing`): ~1.05 G unload, max throttle, bank limited toward the point diametrically away from the player (true extension — the existing "unload/extend" candidate aims *toward* the lead point and must stay as-is).
   Gated-off candidates are recorded as `Available: false` in the trace with `HasScore: false`.
3. **Energy floor on defence:** separation/break candidates keep the existing floor/ceiling penalties (they run through the same `ScoreCandidate`), no special casing.

**Key acceptance assertions (in `FightDirectorBanditTests`, full TDD cycle around them):**

```csharp
// A scripted lead-pursuit attacker saddled 300 m behind: the Ace must force a larger overshoot
// than Competent's jink AND deny any long continuous gun window.
Assert.True(maxAngleOff(PilotSkill.Ace) > maxAngleOff(PilotSkill.Competent) + 0.30);
Assert.True(maxContinuousWindowSeconds(PilotSkill.Ace) < 1.5);
// A losing, energy-disadvantaged Ace opens range past +400 m and later re-points (chi swings back).
// Determinism: identical setup twice ⇒ identical DecisionTrace sequences.
```

- [ ] Steps: failing tests → verify fail → implement → verify pass → re-run `ReactiveBanditTests`+`AceBanditTests`+`AiThreatTests` green → commit `feat(ai): threat-aware defensive lookahead — the bandit gets a second act`

---

### Task 2: Doctrine variety (wire `DoctrineCount`)

**Files:**
- Modify: `sim/Doctrine/ReactiveBandit.cs` (opener bias), `sim/Doctrine/Beats.cs` (`CreateNextBandit` passes engagement number through — it already has it)
- Test: `sim.Tests/FightDirectorBanditTests.cs`

**Behaviour contract:** `_doctrine = (engagementNumber - 1) % _profile.DoctrineCount`, selected at spawn, biases the first ~2 s of lookahead scoring (doctrine 0 = neutral; 1 = one-circle/energy bias — small bonus to moderate/unload candidates; 2 = vertical entry — small bonus to the high-yo-yo candidate). Pure function of engagement number; bias decays to zero by T ≈ 2 s so steady-state scoring is doctrine-independent.

**Key assertions:** ace openers differ across engagement numbers 1/2/3 (tactic/command strings over the first 2 s), identical for the same number twice; Novice/Competent (`DoctrineCount == 1`) unchanged.

- [ ] Steps: failing tests → fail → implement → pass → commit `feat(ai): deterministic opener doctrine variety keyed on engagement number`

---

### Task 3: Per-engagement report assembly in `SimulationSession`

**Files:**
- Create: `sim/Doctrine/EngagementReport.cs`
- Modify: `sim/SimulationSession.cs` (per-engagement counter block + report emission at engagement end)
- Test: `sim.Tests/EngagementReportTests.cs` (new)

**Interfaces:**
- Produces:
```csharp
public readonly record struct EngagementReport(
    int EngagementNumber, PilotSkill OpponentSkill, bool OpponentWasBoss,
    SortieOutcome Outcome,                 // Victory = player killed this bandit, Defeat = player died
    double DurationSeconds,
    double SolutionSecondsConceded,        // ticks OpponentGun.GunSolution was true, * dt
    int HitsTaken, int ShotsTotal, int ShotsInWindow,
    int Overshoots,                        // delta of VisualMergeEvaluation.Overshoots
    double MinimumEnergyKias,              // min over the engagement
    int GcasActivations);                  // delta of AutoGcas activation count
```
- Session exposes `EngagementReport? LastEngagementReport` and an ordered `IReadOnlyList<EngagementReport> EngagementReports` (session-lifetime, cleared on reset).

**Behaviour contract:** counters snapshot at each engagement start (the existing `_engagementNumber` advance site and initial opponent spawn) and the report is emitted when the engagement ends (opponent destroyed, player destroyed, or opponent replaced). Deltas computed against cumulative session counters that already exist (`_shotsTotal`, `_shotsInWindow`, `_opponentGun.HitCount` per-gun instance, `VisualMergeEvaluation.Overshoots`, GCAS activation counter). No new per-tick allocation: one accumulating struct field, report constructed at boundary.

**Key assertions:** scripted session where the bandit holds a solution for K ticks ⇒ `SolutionSecondsConceded ≈ K*dt`; player kill ⇒ `Outcome == Victory` and next report's `EngagementNumber` increments; counters reset between engagements (second report's deltas independent of first).

- [ ] Steps: failing tests → fail → implement → pass → commit `feat(session): per-engagement player-performance reports`

---

### Task 4: `LearnerModel` V0 (banded, hysteretic, deterministic)

**Files:**
- Create: `sim/Doctrine/LearnerModel.cs`
- Test: `sim.Tests/LearnerModelTests.cs` (new)

**Interfaces:**
```csharp
public enum SkillBand { Struggling = 0, Steady = 1, Sharp = 2, Dominant = 3 }
public readonly record struct LearnerBands(SkillBand Gunnery, SkillBand Energy, SkillBand DefensiveBfm) {
    public SkillBand Overall { get; }      // min-biased blend: median of the three, rounded down
}
public sealed class LearnerModel {         // deterministic; owns a bounded window of reports
    public void Observe(in EngagementReport report);
    public LearnerBands Bands { get; }
    public int WinStreak { get; }          // consecutive Victory reports
    public int LossStreak { get; }
    public double SecondsSinceLastDefeat { get; } // sums report durations since last Defeat
    public void Reset();
}
```
**Behaviour contract:** per-axis integer scores over a sliding window of the last N=4 reports, opportunity-normalised (e.g. shots-in-window ratio only when `ShotsTotal > 0`; overshoot credit only when the opponent tier can force one, i.e. Veteran+). Band moves at most one step per `Observe`, with hysteresis (a band change requires the raw score to cross the boundary by a margin, both directions). Fixed integer thresholds only — no floats in band decisions beyond fixed comparisons, no RNG. Boss-fight reports (`OpponentWasBoss`) update streaks/timers but are *excluded* from band scoring (an expected loss must not crater the estimate — Codex-consult rule).

**Key assertions:** four dominant reports ⇒ `Overall == Dominant` reached one step at a time; oscillating borderline input does not flap bands (hysteresis); boss defeat leaves bands unchanged but resets `SecondsSinceLastDefeat`; identical report sequence ⇒ identical bands.

- [ ] Steps: failing tests → fail → implement → pass → commit `feat(ai): LearnerModel V0 — banded per-concept skill estimate`

---

### Task 5: `FightDirector` (CALM → BUILD → BOSS → RELEASE)

**Files:**
- Create: `sim/Doctrine/FightDirector.cs`
- Test: `sim.Tests/FightDirectorTests.cs` (new)

**Interfaces:**
```csharp
public enum DirectorPhase { Calm, Build, Boss, Release }
public readonly record struct SpawnSpec(PilotSkill Skill, int DoctrineIndex, bool Boss, string Reason);
public sealed class FightDirector {        // owns a LearnerModel internally
    public void Observe(in EngagementReport report);
    public SpawnSpec NextSpawn(int engagementNumber);   // pure given observed history
    public DirectorPhase Phase { get; }
    public void Reset();
}
```
**Behaviour contract:**
- **Cold start / parity:** with no observations, `NextSpawn(n)` returns exactly `ForEngagement(n)`'s tier with `DoctrineIndex = (n-1) % DoctrineCount`, `Boss = false`. (The regression guarantee; assert against the existing table.)
- **BUILD:** tier tracks `LearnerBands.Overall` (Struggling→Novice … Dominant→Ace), moving at most one tier per spawn, hysteresis inherited from the bands.
- **BOSS trigger:** `WinStreak >= 3` AND `SecondsSinceLastDefeat >= 240` AND `Overall >= Sharp` AND at least 4 engagements since the last boss (cooldown) ⇒ next spawn is `Boss = true` with `Skill = Ace`. The decision is made only at spawn boundaries (never mid-fight) — commitment before any player choice point.
- **RELEASE:** the spawn after a boss fight (either outcome) drops two tiers below the pre-boss tier (floor Novice) for 2 engagements, then BUILD resumes. Boss *victory* by the player shortens RELEASE to 1 engagement.
- **Easing:** `LossStreak >= 2` in ordinary fights ⇒ drop one tier below the band mapping until a Victory.
- `Reason` is a short human string for debrief/telemetry (e.g. `"boss: 3-win streak, 285s unbeaten"`).

**Key assertions:** scripted histories drive exact phase walks — the boss fires at exactly the threshold crossing (not one fight earlier, honouring cooldown); post-boss release is served both after boss win and boss loss; loss-streak easing; cold-start parity table; identical history ⇒ identical `SpawnSpec` sequence.

- [ ] Steps: failing tests → fail → implement → pass → commit `feat(ai): FightDirector — performance-driven pacing with boss trigger`

---

### Task 6: Session integration — the director drives continuous-combat spawns

**Files:**
- Modify: `sim/SimulationSession.cs` (own a `FightDirector`, feed it reports, consult at the replacement-spawn site), `sim/Doctrine/Beats.cs` (`CreateNextBandit` accepts a `SpawnSpec`; `ModernVisualMerge` unchanged first fight)
- Test: `sim.Tests/FightDirectorSessionTests.cs` (new)

**Behaviour contract:** at the existing successor-spawn site (`_engagementNumber` advance), the session emits the finished `EngagementReport` to the director, then requests `NextSpawn(nextEngagement)` and spawns accordingly (skill + doctrine; `Boss` selects the Task-7 profile). `ForEngagement` remains only as the director's cold-start table (single source: director calls it; `Beats` call sites route through the director). Director decision (`SpawnSpec.Reason`, phase, bands) is exposed on the session for debrief/telemetry (read-only properties; snapshot wiring is deferred — no web changes in this plan).

**Key assertions:** an integration test through `SimulationSession` continuous combat: a player scripted to dominate (kills each bandit fast, concedes nothing) sees tiers climb and then a boss spawn flagged `Boss == true` with the cooldown respected; a session reset clears director state; capture-on vs capture-off determinism unchanged (existing suite).

- [ ] Steps: failing tests → fail → implement → pass → full `sim.Tests` suite green → commit `feat(session): FightDirector drives continuous-combat spawns`

---

### Task 7: The boss — honest stalk/commit overlay

**Files:**
- Modify: `sim/Doctrine/PilotSkill.cs` (boss profile factory), `sim/Doctrine/ReactiveBandit.cs` (stalk/commit state; fire-gate + scoring-weight switch)
- Test: `sim.Tests/BossBanditTests.cs` (new)

**Interfaces:**
```csharp
// PilotSkill.cs — enum UNCHANGED (telemetry-safe). Boss is a profile overlay:
public static BanditSkillProfile Boss() => For(PilotSkill.Ace) with {
    FireConeDeg = 1.8,                     // stalk-phase quality bar (commit restores 3.5)
    IsBoss = true };
// new profile members: bool IsBoss = false; double CommitDominanceSeconds = 8.0;
```
**Behaviour contract (all inside `ReactiveBandit`, gated on `_profile.IsBoss`):**
- **Stalk:** standard Ace lookahead, plus a positive scoring bias for holding an energy reserve (terminal speed term weight raised) and the tight `FireConeDeg` on the trigger gate — it declines marginal shots but keeps flying dominant geometry.
- **Commit trigger (deterministic, observation-only):** fires when any holds — (a) observed player speed < ~140 kt-equivalent m/s while the boss holds ≥ +30 m/s energy margin; (b) player nose-off > 60° at range < 1200 m; (c) dominance held continuously ≥ `CommitDominanceSeconds` (dominance = boss behind the player's 3-9 line, closing or matching, not itself threatened — computable from `ActorObservation`). Once fired, commit is latched for the engagement.
- **Commit:** fire cone widens to the Ace 3.5°, scoring reverts to standard Ace aggression (stalk biases removed). No other change — the kill is earned by the same honest lookahead + `BanditFireControl`.
- `ReactiveBandit` exposes `public bool BossCommitted { get; }` for debrief.

**Key assertions:** pre-commit stalk fires fewer rounds per solution-second than a plain Ace in the same scripted geometry while holding ≥ its solution-seconds (declines marginal shots, keeps dominance); a scripted player energy collapse trips the commit within a bounded time and rounds follow; commit latches; tick-for-tick determinism; a non-boss Ace is byte-identical to before this task.

- [ ] Steps: failing tests → fail → implement → pass → re-run full `sim.Tests` → commit `feat(ai): honest cat-and-mouse boss — stalk, commit trigger, roll-in`

---

### Task 8: Full gate

- [ ] Run the full gate (command in the header; capture bin/check's own exit code). Expected green: all new suites + `ReactiveBanditTests`/`AceBanditTests`/`AiThreatTests`/determinism unchanged. No `web/wwwroot` diffs ⇒ no build-stamp bump.
- [ ] Commit any tidy-ups. Worktree branch `fight-director` is the deliverable; merge into `pivot-hardening` is a separate reviewed step (main tree has concurrent uncommitted work).

## Self-Review

- **Spec coverage:** Layer 1 → Tasks 1–2; Layer 2 → Tasks 3–6 (reports → learner → director → wiring); Layer 3 → Task 7; verification → per-task assertions + Task 8. Deferred items in the spec have no tasks (correct).
- **Placeholder scan:** behaviour contracts carry exact thresholds, formulas, and gate conditions; Codex writes full test bodies around the stated assertions (declared deviation, noted in the header).
- **Type consistency:** `EngagementReport` (T3) is the sole input to `LearnerModel.Observe` (T4); `LearnerBands`/streak fields (T4) are exactly what `FightDirector` reads (T5); `SpawnSpec` (T5) is what `CreateNextBandit` consumes (T6); `IsBoss`/`Boss()` (T7) is what `SpawnSpec.Boss` selects (T6→T7 ordering note: T6 may stub `Boss` to plain Ace until T7 lands — stub must be removed in T7).
