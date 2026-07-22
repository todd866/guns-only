# Telemetry v2 — per-decision transition capture (design)

Status: Sim-side foundation implemented, 2026-07-22 · Implements the data-capture foundation of
[adaptive-teacher-design.md](adaptive-teacher-design.md) ("Sequencing — the first slice").
Synthesises the design with an independent Codex architecture consult (Claude has lead; Codex's
corrections are marked ⟐). Naming trap: the existing `TELEMETRY_SCHEMA_VERSION "2.0.0"` is the
browser *chunk-envelope* version — **not** this. This doc introduces a distinct
`decision_schema_version`.

## Implementation status

Implemented in the simulation assembly:

- `ActorObservation` is now the target-input type consumed by every `IBandit` policy.
- Trainable `ReactiveBandit` actors expose their exact maneuver-selection trace, fixed candidate
  ordering/scores, selection sequence, applied command, and actor-visible policy memory.
- `DecisionRecorder` is a preallocated circular stream with global sequences, idempotent cursor
  reads, bounded batches, explicit overflow-gap metadata, and sequenced restart boundaries. Capture
  is a staged-sortie setting, so it cannot create an unmarked mid-episode hole. The session records
  trigger intent at tick rate and marks maneuver selection only on the policy's real cadence.
- Seeded headless production-gun episodes can emit auditable transition/reward components as
  `guns-only.combat-transition.v1` JSON Lines for an external trainer. The wire format uses explicit
  DTOs and versions its config, scenario, observation, action, reward, policy, and seed generator;
  it carries effective reward weights and marks the not-yet-supplied artifact hash as incomplete.
- Both live and headless transitions preserve an exact `next_observation == observation` chain.
  Maneuver selection/application and fire evaluation/consumption/authorization are separate facts,
  including on terminal gun ticks. Every micro-transition retains the policy skill identity even
  when a high-tier actor is holding a prior selection, and both paths share the same
  weapon-authorized firing-envelope reward predicate.

Still intentionally pending: browser draining/packing and durable transport; the separately keyed
privileged-truth materialization; a real artifact/build hash; retention/export of referenced sparse
events beyond the presentation ring; and a policy adapter for applying learned actions. `RailBandit`
scripted content is outside the trainable actor stream.

## Goal

Capture, from real sorties, the transitions an off-policy learner needs — each AI decision's
observation, action, elapsed span, and outcome — **without** mixing privileged truth into the
actor's input, losing transitions to browser sampling, or perturbing the deterministic sim.
The same stream yields the honest human win% signal the self-play harness structurally cannot
(see the win% harness finding: self-play over-rates the AI; only real fights measure a human).

## Architecture — hybrid, kernel-authored data plane (⟐)

Rejected: adding a `Decision` type to the `SessionEvent` bus. That bus is a 64-entry bounded
ring (~0.53s at 120Hz) for *sparse authoritative outcomes*; flooding it with per-tick decisions
would evict real outcomes, bloat every snapshot, and spam the event-triggered sampler.

Chosen: a **dedicated, continuously-drained `DecisionRecorder` in the kernel** as the data
plane; `SessionEvent` stays sparse (outcomes/lifecycle) and transitions *reference* the relevant
event-sequence range for reward assembly. Not IncidentReplay-style (⟐): that recorder is
frozen/one-shot, which biases long sorties toward their final records. This one is a
preallocated circular buffer with **globally monotonic sequence numbers**, drained incrementally.

- **Export:** `ReadDecisionsAfter(sequence, max)` → an idempotent bounded batch **plus explicit
  gap metadata** (`oldest_sequence`, `latest_sequence`, dropped sequence/tick ranges). Never a
  one-shot consume. Never join an episode across a gap.
- **Emitter split:** the browser remains the *network* emitter (reusing the idempotent Blob
  upload machinery) but **drains kernel-authored records after `Advance`** — it must never
  reconstruct decisions from the 20Hz snapshot. `GetState` carries at most a small
  decision-stream *watermark*, never the rich records.

## Honesty is a type boundary, not a log convention (⟐)

Separate JSON subobjects aid audit but do **not** enforce honesty — `IBandit.Step` today receives
the full authoritative `AircraftState`, and nothing stops future code reading mass/attitude/rates
or a newly-added truth field.

- Introduce an **immutable `ActorObservation`** carrying only permitted, timestamped features.
  The policy consumes *that exact object*; the recorder retains *that same object*.
- `SimulationSession` attaches **privileged truth afterward, outside the policy**. Actor and
  privileged data are **materialised as separate datasets keyed by transition id**; the deployed
  actor feature-loader accepts **only** the actor schema.
- Honesty test (from the parent design): holding the actor's observation history constant while
  changing hidden truth must leave its actions identical.
- Also log actor-visible **policy memory / sufficient history** (⟐): tactic timers, cached-action
  age, cadence phase, confidence, sensor age, reset boundaries. Isolated tuples are insufficient
  for a partially-observable/recurrent policy.

## Cadence = every real action-selection boundary (⟐ — corrects a 10Hz-uniform error)

A uniform ~10Hz sample is **dishonest for Novice/Competent**, which genuinely recompute their
command every tick — a 12-tick sample buries 11 real actions in "the environment," so the logged
`(o_t, a_t, r, o_{t+k})` is not a valid transition.

- **Novice/Competent maneuver selection:** every tick (`duration_ticks = 1`).
- **Veteran/Ace maneuver selection:** every 12 ticks (`duration_ticks = 12`, shortened at
  termination); candidate scores recorded **only when the lookahead actually recomputes**.
- **Trigger intent:** evaluated every tick for every tier (see fire/maneuver split below).
- Decision-change *edges* are rejected: state-dependent sampling omits dwell exposure and biases
  toward high-curvature moments. If transport needs 10Hz rows, **pack** the twelve micro-transitions
  into one batch row — do not change their logical cadence.

## Fire and maneuver are not one atomic action (⟐)

`StepWeapons` consumes `WantsToFire` **before** `_bandit.Step` selects the new maneuver, so for
lower tiers fire intent depends partly on the prior tactic state. Either log `fire_intent_consumed`
separately from `maneuver_selected` with their exact ticks (preferred first step), **or** refactor
to one explicit `Decide` boundary — but that is a *policy change* needing a new policy version and
golden regressions. **Do not silently change this ordering while "only adding telemetry."**

## Off-policy usefulness is bounded — log honestly, don't overclaim (⟐)

Current behaviour is near-deterministic (continuous commands), giving little support for
un-taken actions. Candidate scores are **model-based heuristic diagnostics — not behaviour
probabilities and not trustworthy Q-values.** Therefore:

- Log the exact **policy/config/artifact hash**, the full **candidate set + availability mask +
  ordering + selected index + tie-break rule**, and `selection_mode: "deterministic"`. Do **not**
  invent a continuous-action log-probability.
- Offline RL may use this conservatively; unbiased importance-weighted evaluation of materially
  different policies will not be credible without coverage. Any future exploration must draw from
  a fully-logged seeded/counter-based source — **capture itself stays randomness-free.**
- Preserve **all** candidates, not just the winner. Put predicted-player rollouts under actor
  *diagnostics* (they derive from belief), never under truth. `PilotCommand` legitimately holds
  NaNs → encode non-finite fields as explicit `null` + validity flags.
- Log **raw grader facts** (gun-window ticks, rounds, hits, kills, overshoot/reversal edges,
  energy-error integrals) so reward definitions can evolve; keep them separate from candidate scores.
- Treat **opponent replacement as a new actor episode** even when the sortie continues.

## Missingness is not random — censor, don't drop (⟐)

Transport limits (1500 rows / 30s flush) would drop after ~11s at 120Hz decisions + 20Hz state.
Use packed decision batches, a separate byte-bounded queue, shorter flushing, and a **durable
browser outbox** for terminal records. Terminal-record loss on page-close/transport-failure
**correlates with quits, crashes, slow devices, long sessions** — exactly the population a win%
must not silently exclude. So:

- Record **sortie-start eligibility**; distinguish `terminated` / `truncated` / quit / page-close /
  `unknown-missing`.
- Treat an absent terminal upload as **censoring**, never as a completed loss and never as a row
  to exclude. This is the parent design's intent-to-treat guard made concrete.

## Determinism & perf — capture must be provably inert

Fixed-step math is already deterministic, but per-tick allocation/JSON can cause **GC stalls that
change when human input reaches the next `Advance`** (⟐) — perturbing interactive trajectories
without changing the tick math. So: preallocated value-type storage; serialise **only after**
`Advance`; no wall-clock/RNG in capture.

- **Required test:** capture-on vs capture-off over identical tick-stamped inputs must produce
  **bit-identical** state, action, and event hashes. Plus tests for backlog, overflow,
  terminal-before-next-decision, restart, and opponent replacement.

## Record shape (`decision_transition`, abridged)

`id` (sortie_sequence, actor_spawn_sequence, decision_sequence) · `span`
(observation_tick, end_tick_exclusive, duration_ticks, authority_tick_hz) · `policy`
(policy_id, artifact_hash, observation/action/cadence schema versions, selection_mode) ·
`actor` (o_t, o_tp1, source_tick, observation_age_ticks, confidence, memory_reset) ·
`action` (maneuver_requested, maneuver_applied, fire_intent_consumed, fire_authorized,
selected_candidate_id) · `outcome` (reward_spec_version, reward=null-for-now, discount,
components, event_sequence_first/last, terminated, truncated, termination_reason) ·
`diagnostics` (tactic, score_spec_version, **all** candidates, belief rollout) ·
`privileged` (truth_schema_version, s_t, s_tp1, grader_facts) — **materialised separately**.

## Sequencing (collision-aware)

1. **Sim-side foundation (first, collision-free):** the `ActorObservation` type + the
   `DecisionRecorder` (preallocated ring, monotonic sequence, `ReadDecisionsAfter` + gap metadata) +
   per-boundary capture (every-tick low tiers, 12-tick lookahead) + the policy exposing its already-
   computed trace + the **capture-on == capture-off determinism test**. No web, no build-stamp.
2. **Web transport (second, gated on the web tree being clear of the concurrent session):** drain
   after `Advance`, packed batches, the byte-bounded queue + durable outbox, censoring/eligibility
   semantics, `decision_schema_version`. This is where the build-stamp ritual applies.

## What would make this a mistake (⟐ — the tripwires)

One-shot/end-of-sortie export · 10Hz rows mislabelled "per-decision" for the flat tiers · hidden
intra-window actions dropped · belief/truth separated only as sibling JSON while the policy still
gets `AircraftState` · the browser reconstructing records from snapshots · overflow/gaps/terminal-
finalisation/replacement left implicit · candidate scores treated as rewards or off-policy support ·
the 1500-row/30s transport reused unchanged.
