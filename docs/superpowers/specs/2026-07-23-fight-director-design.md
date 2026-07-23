# Fight Director — the adversary as pacing engine (design)

Status: Design approved 2026-07-23 · Child of [adaptive-teacher-design.md](../../adaptive-teacher-design.md)
(the tutor-policy V0) and successor to the ace-AI plan's escalation curve. Synthesises the design
conversation with a Codex architecture consult (Claude has lead; Codex corrections folded in).

## Thesis

The primary play mode is **infinite-spawn continuous combat**, and its enemy stream is today a fixed
curve (`BanditSkillProfile.ForEngagement`, flagged in-source as interim). Two problems, one design:

1. **The fight is boring.** Veteran/Ace bandits take the lookahead early-return
   (`ReactiveBandit.cs`, `LookaheadHorizonTicks > 0`) which bypasses `SelectTactic` — they have **no
   defensive game**. A player on their six faces an opponent that keeps optimising its own (hopeless)
   firing position. `ForcesOvershoot`, `DisengagesWhenLosing`, `DoctrineCount` are dead profile flags.
2. **The pacing is blind.** Nothing reads the player. A player who never loses gets bored; a player
   who always loses quits. Both are engagement failures the adaptive-teacher design treats as a floor.

The fix is three layers, bottom-up, each shippable and testable alone. The user-stated goal:
*"calibrated to maximize learning and engagement… and occasionally gun their brains out to show
dominance"* — a cat-playing-with-mouse ace when, and only when, the player has been cruising.

## Layer 1 — the second act (defensive lookahead)

Extend the lookahead's candidate set and scoring so defence **emerges from scoring** exactly as the
vertical offence already does. No scripted branches.

- **Candidates added:** break turn into the attacker's line of sight; out-of-plane last-ditch (lift
  vector ⊥ attacker LOS, biased up-and-across); unload-and-extend (separation at ~0.9 G, max power).
- **Scoring terms added:** threat penalty for projected time in the player's gun window
  (`CameraSolver.GunWindow` geometry from the *player's* side); overshoot-forcing reward (attacker
  angle-off growth + closure sign flip across the horizon); an energy-floor term so defence cannot
  spiral the bandit into the ground or to zero smash (respects the existing terrain awareness).
- **Profile flags become weights:** `ForcesOvershoot` → out-of-plane/overshoot scoring enabled;
  `DisengagesWhenLosing` → separation candidate enabled. Veteran defends; Ace defends *and*
  separates/re-engages. Novice/Competent keep the legacy state machine **tick-for-tick unchanged**.
- **`DoctrineCount` wired:** opening-game bias keyed on engagement number (pure function; e.g.
  nose-to-nose / one-circle-energy / vertical entry) so openers are not memorisable.

**Acceptance (BfmDuel harness):** a scripted lead-pursuit attacker saddled on a Veteran/Ace must
(a) be forced past an overshoot threshold the Competent jink does not reach, and (b) be denied any
continuous gun window longer than a bounded number of seconds. A losing Ace must open range and
later re-point (separate → re-engage). Existing `ReactiveBanditTests` stay green unchanged.

## Layer 2 — LearnerModel V0 + pacing director (session-scale cat-and-mouse)

A deterministic intensity cycle replaces `ForEngagement` at its reserved seam. States:

**CALM → BUILD → BOSS → RELEASE → (repeat)**

- **`LearnerModel` (V0 = banded estimator, not Bayesian).** Three concept axes — *gunnery*
  (shots-in-window ratio, rounds-per-kill), *energy* (`VisualMergeEvaluation.MinimumEnergyKias`,
  closure discipline), *defensive BFM* (solution-seconds conceded via `OpponentGun.GunSolution`,
  hits taken, GCAS activations) — each mapped to a small integer band with hysteresis and
  opportunity-normalised markers (a marker with no opportunity contributes nothing). Codex
  corrections adopted: no single scalar skill; no uncalibrated IRT (false precision); pure integer /
  fixed-threshold arithmetic only (native↔WASM safe); placement evidence never doubles as learning
  evidence.
- **`TutorPolicy` (V0 = the director).** Consumes the bands + run context; emits the next spawn's
  `PilotSkill`, doctrine index, and merge geometry. Rules: one tier move at a time; hysteresis both
  directions; **BOSS trigger** = time-since-last-player-death and dominance margin (win streak +
  low solution-seconds conceded) crossing thresholds, gated by a cooldown; **RELEASE** after a boss
  fight (either outcome) serves confidence-restoring easier spawns before BUILD resumes; a losing
  streak in ordinary fights eases tiers instead. The decision for the next spawn is **committed
  before any player choice point** — the director never counter-picks a build/assist choice.
- **Determinism.** Director + learner state are pure functions of session-observable fight history
  and engagement number. No RNG, no wall clock. The full decision (bands, state, chosen spawn,
  reason) is exposed for debrief/telemetry.

**Acceptance:** synthetic fight histories drive unit tests — dominance streak enters BOSS exactly at
threshold (not before, honouring cooldown); loss streak eases; hysteresis prevents oscillation;
identical history ⇒ identical decisions; the interim `ForEngagement` curve is reproduced by the
director's neutral cold-start (regression guarantee for players who perform exactly at expectation).

## Layer 3 — the boss (fight-scale cat-and-mouse, honest)

An Ace-lookahead bandit with a **conservative-dominant profile** — the cat that never throws:

- **Tease = refusal to gamble.** Maintains an energy reserve above the player, prefers slashing
  passes and nose denial, and carries a **raised fire-control quality bar** (tighter cone/range than
  the standard Ace) so it holds fire in marginal windows. Reads as toying; is honest.
- **Commit trigger (deterministic):** player energy below a threshold, player caught nose-off
  beyond a threshold, or dominance held for N continuous seconds → the quality bar drops to normal
  Ace and scoring weights flip to max-aggression; it rolls in for the kill.
- **Honesty invariants:** fire stays routed through `BanditFireControl` (same ballistics the player
  faces); no deliberate misses; no privileged state — it reads only the `ActorObservation` every
  bandit gets. Debrief attributes the encounter (the player should know they met *the* ace).

**Acceptance:** while dominant pre-commit, the boss's rounds-fired per solution-second is materially
lower than a standard Ace's (it declines marginal shots) yet its positional dominance (solution-
seconds, energy margin) is at least as high; after a scripted player energy collapse, the commit
trigger fires within a bounded time and rounds follow; a boss duel is deterministic tick-for-tick.

## Constraints (kernel invariants, restated)

Float64 RK4 kernel at 120 Hz; no wall-clock / unseeded RNG anywhere in a tick; no renderer types in
`sim/`; no hidden truth (bandits consume `ActorObservation` only); `BanditFireControl` owns all
firing; Novice/Competent behaviour byte-identical to today; existing test suites stay green.

## Deferred (explicitly out of scope)

Frozen pre/post skill probes and transfer instruments (adaptive-teacher first slice); cross-session
learner persistence (fast-follow once bands prove out in-session); any learned tutor (needs
randomised assignment + probe labels per the Codex consult); AV dressing for the boss (livery,
radio, music) — presentation layer, separate effort; roguelite 5-fight-run integration (the
director's seam supports it, but infinite-spawn is the primary mode and ships first).

## Relationship to other docs

- **adaptive-teacher-design.md** — this is that doc's tutor-policy V0 + learner-model V0, scoped to
  infinite-spawn pacing; probes remain the learning metric when they land.
- **2026-07-22-ace-ai.md** — Tasks 4–6 (overshoot defence, disengage, doctrine variety) are
  delivered here via lookahead scoring instead of state-machine branches; Task 7's ladder is
  superseded by the director.
- **DifficultyModel.cs (carrier)** — the house precedent: baseline/floor/ease/spike with hysteresis;
  the director is that pattern, generalised and made performance-driven.
