# Adaptive-teacher AI + data flywheel (design)

Status: Design, 2026-07-22 · Parent design for the AI direction. Sits above
[roguelite-loop-design.md](roguelite-loop-design.md) and the ace-AI plan, and refines
[ADR-0001](adr-0001-f22-first-arcade-pivot.md). Synthesises the design conversation with an
independent Codex architecture review (Claude has lead; Codex's material sharpenings are marked).

## Thesis

**Guns Only is an educational tool pretending to be a video game.** Its real purpose is to *teach* —
real BFM and air-combat decision-making now, a broader decision-simulation substrate later — and the
F-22 arcade roguelite is the delivery vehicle that makes people *want* to learn it. This is what the
README always claimed; it is now the explicit organising principle, and it resolves the audit's
tension: **the honest sim + evidence-based debrief are the education (the point); the arcade roguelite
is the engagement (the delivery).** Two halves of one product.

## The objective (and a correction to "track win%")

The opponent AI is an **adaptive teacher** (an intelligent tutoring system) in a dogfight costume. Its
objective is **learning-via-engagement**:

- **Goal (the reward):** measurable *skill acquisition and transfer* — the learner gets better and it
  generalises to new fights.
- **Mechanism + guardrail:** engagement/retention. A quitter learns nothing, so keep them in flow —
  but retention is a **floor to satisfy, never a reward to maximise.**

> **Codex's decisive correction — "success = player win%" is INVALID as the primary metric.** An
> adaptive teacher controls both the lesson and the apparent test: it can manufacture *any* win rate by
> throwing fights, and retention can rise without any learning. So the two signals you named — "still
> playing" and "getting better" — are real, but **win% and retention are guardrails and mechanism, not
> the objective.** The objective is durable learning measured *independently of the teacher* (below).
> Domination is a bug; so is a retained-but-untaught learner.

## What "getting better" means, measured honestly

Learning must be measured by instruments the teacher does **not** control (this is the crux — see
Risks):

- **Frozen pre/post skill probes:** fixed, scripted evaluation encounters (never adapted) run before
  and after instruction — the standardized test.
- **Held-out transfer encounters:** the *same concept* in a **new geometry / aircraft / opponent
  doctrine** the teacher didn't drill — did the skill generalise, or was it memorised?
- **Delayed re-tests** to check durability, not one-session spikes.
- Secondary, reported but never optimised directly: win% *over completed eligible sorties* (quits
  reported separately), time-to-first-shot (with censoring for sorties that never got one),
  technique markers (used the vertical, managed energy, defended a gun solution).

## The design language is learning science

| Pedagogy | Mechanic it drives |
|---|---|
| Zone of proximal development / flow | Adaptive difficulty at the edge of *this* learner's ability |
| Scaffolding | The roguelite unlock order — one BFM concept at a time |
| Deliberate practice | Targeted encounters that drill the current weakness |
| Mastery learning | The gauntlet gate — don't escalate until demonstrated |
| Formative feedback | The existing evidence-based debrief |
| Transfer | "Same concept, new geometry/aircraft/era" held-out checks |

## Architecture — two policies, not one (Codex)

Keeping one network do everything conflates *skill* with *teaching*. Separate them:

1. **Combat policy (a skill oracle).** Trained by **self-play RL** to fly well, then **constrained /
   distilled into honest competence tiers** (novice→ace — this is what the `PilotSkill` ladder
   becomes). Self-play optimises *winning*, which is correct for an oracle but wrong as the shipped
   objective, so it is only the source of capability.
2. **Tutor policy.** Chooses the scenario, opponent doctrine, difficulty, and interventions from a
   **learner model**, and is optimised for **improvement on the frozen probes + transfer**, *subject
   to an engagement/retention floor* — retention gets **no unbounded positive reward** (that is
   exactly the retain-but-don't-teach failure). The tutor sets curriculum **between** sorties; it must
   not feed hidden player state into tactical actions.

Human data: **behavioural cloning from *current* users is a trap** — it imitates novices (and their
errors) responding to a harmless opponent. Use BC only from **expert demonstrations against
representative shooting opponents**, or via iterative on-policy correction.

## Training integration & runtime (Codex, leverage-ranked)

- **Keep the C# kernel authoritative; do NOT port dynamics to Python** (a second simulator diverges
  and invalidates evaluation). Expose a **batched, headless native environment to Python via IPC** for
  training.
- **A frozen float policy is NOT enough for native↔WASM reproducibility.** Ship a **small,
  quantization-aware, hand-rolled integer MLP** with specified scaling, rounding, saturation, feature
  quantization, and action thresholds. ONNX only with pinned kernels + demonstrated parity. Validate
  **golden inference vectors + closed-loop replays on native and every supported WASM engine.**
- **Honesty is testable.** Privileged truth lives only in an **offline critic/grader**, never in the
  deployed actor, which receives exclusively its timestamped belief state. The honesty unit test:
  **hold the actor's belief history constant, change the hidden truth → its actions must be
  identical.** Audit normalizers, derived features, recurrent-state init, and difficulty logic for
  leakage. Hash cadence/seeds/preprocessing/weights/rounding/recurrent-resets into every replay.

## Sequencing — the first slice is SIMULTANEOUS, not "data first" (Codex)

"Capture data, then train" is wrong: it just accumulates more of the *unusable* non-shooting
distribution. The smallest valuable slice ships together:

1. **Telemetry v2** — versioned per-decision-tick transition records: belief-state observation +
   confidence, player/AI controls, shot opportunities / fires / hits / overshoots / reversals / energy
   errors, termination reason, and context (build, policy, curriculum, seed, difficulty, exposure
   history). **Ground truth logged separately for grading + honesty audits, never as a policy
   feature.** Pseudonymous IDs, consent, deletion, limited retention.
2. **A belief-limited heuristic opponent that actually SHOOTS** and uses elementary energy/geometry —
   good enough to be a real threat, so the telemetry it generates is representative. (A short-horizon
   lookahead stopgap qualifies *only if* it rolls forward from the opponent's own belief state and
   obeys the same aircraft/control limits.)
3. **A short scripted BFM curriculum** (the first few teachable concepts).
4. **Fixed skill probes** (the frozen pre/post + transfer instruments).

Together these immediately improve play, start the flywheel on *relevant* data, and let us measure
learning — all before any learned policy ships. Only then train the combat oracle + tutor.

## Risks

- **Circular evaluation (Codex's #1 unseen risk).** The teacher controls both instruction and the
  apparent test, so rising win rate can just be easier matchmaking, rising retention can be
  frustration/manipulation/survivor-bias, and "improvement" can be memorising one opponent. **Fix:
  frozen pre/post evaluators, delayed tests, held-out geometries + opponent doctrines, randomized
  curriculum comparisons (A/B), and intent-to-treat reporting that includes quitters. Promote a tutor
  only when it improves TRANSFER versus a control while keeping engagement above a predefined floor.**
- **Engagement ≠ learning (Goodhart).** Give retention unbounded reward and you build a slot machine.
  Retention is a constraint; transfer is the objective.
- **Off-policy bootstrap** — non-shooting telemetry is the wrong distribution; hence the shooting
  stopgap in the first slice.
- **Native↔WASM determinism drift** — hence integer inference + golden-vector/cross-engine validation.
- **A bad learning metric optimised well is worse than none** — validate the probe/transfer metric
  before optimising against it.

## Relationship to the other docs

- **ADR-0001** — the F-22 arcade pivot: the *delivery* this teaches through.
- **roguelite-loop-design.md** — the loop is the *curriculum structure* (scaffolding → mastery →
  transfer); the sidegrade meta is pilot augmentation, i.e. the learner's growing skillset.
- **ace-AI plan (2026-07-22-ace-ai.md)** — the ace is the *mastery check*; its interesting vertical
  play is what makes the lesson engaging and legible. Its Task-8 win%-tuning becomes the
  **flow-band/engagement floor**, not the success metric. The shooting heuristic stopgap in the first
  slice is the near-term deliverable there.

## Next concrete step

Write the **"first slice" implementation plan** (telemetry v2 + shooting belief-limited stopgap +
scripted curriculum + frozen probes) as a sibling in `docs/superpowers/plans/`, and land the shooting
stopgap + telemetry v2 first so the flywheel starts on representative data.
