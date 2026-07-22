# Guns Only — arcade roguelite loop (design)

Status: Design, 2026-07-22 · Implements the direction in
[ADR-0001](adr-0001-f22-first-arcade-pivot.md) (F-22-first, arcade + roguelite).

## Pitch

Open the app and you are instantly in an F-22 guns-only dogfight that feels great. Play more and it
opens into a roguelite: bounded runs of escalating fights that climax against a genuinely skilled
ace, where you re-earn and extend your **pilot augmentation**. The physics stay honest; *you* get
better. Guns are the heart of every run; a couple of scarce missiles are the only concession, and
they run out fast.

## Design principles (inherited and non-negotiable)

- **Honest causality always.** Real 6DOF physics, time-of-flight ballistics and missiles, seeded
  deterministic world, non-omniscient AI. Nothing below fakes aircraft performance or grants the AI
  hidden truth. This preserves the kernel DNA and the evidence-based debrief.
- **Power is augmentation, never physics.** Every "upgrade" is a flight-control or awareness
  **assist** — it changes what the *pilot* can perceive and execute, modelling improving reflexes and
  skill. This is the disclosed arcade layer; it is transparent, not a lie about the jet.
- **Accessibility up front, depth on a slope.** A first-timer and a returning player both drop
  straight into a good dogfight. The roguelite structure is unlocked/earned, not a wall.
- **Determinism is a feature, not just correctness.** Runs are seeded, so they are reproducible,
  shareable, and leaderboard-friendly (a daily seed is nearly free on this kernel).

## The core loop

### 1. Front door (always available, zero gate)

Launching the app drops the player directly into an augmented F-22 guns-only engagement — no menu
wall, no tutorial gate. A casual player can fly this indefinitely and have fun. This is the
retention hook and the immediate power fantasy the pivot exists to deliver.

### 2. The run (the roguelite, unlocked with play)

A **bounded gauntlet**: a seeded sequence of ~4–6 engagements that escalate to an **ace climax**. The
player either completes the run or is shot down (permadeath — see §4). Between engagements the player
makes one **build choice** (an assist from their unlocked pool — see §3) and there is a brief refit
beat (rearm guns, keep/lose state per mission ruleset).

### 3. Weapons and build choices

- **Guns are the core** — the decisive weapon, present every engagement, the skill test.
- **Missiles are scarce** — the loadout carries only ~2–3. Enemy density is tuned so the player
  spends them on the first/hardest priority threats and is back to guns for the meat of the run.
  Missiles obey honest physics (time of flight, aspect/seeker and range limits); this is the F-22
  fantasy, rationed, and a real "spend now or save it?" decision.
- **Build choices = pilot augmentation assists**, drawn from the player's unlocked pool. Candidate
  assists (all extensions of systems that already exist — see §8):
  - control-law finesse / detent-grammar tiers (finer, faster, more forgiving command shaping);
  - gunnery lead/pipper assist tiers (`GunneryPitchAssist`);
  - padlock / situational-awareness aids (target box quality, threat cues, energy caret);
  - Auto-GCAS sensitivity and G-tolerance / anti-G (`AutoGcas`, `PilotPhysiology`);
  - a small number of clearly-labelled loadout choices (rounds, convergence, +1 missile).
  Assists change what the pilot can do; none alter the airframe's aerodynamics.

### 4. Death economy and meta-progression

- **Permadeath.** Being shot down ends the run.
- **Sidegrade meta.** A run banks a currency based on performance. Between runs the player spends it
  to **unlock more options** — new assists into the draftable pool, new aircraft, harder tiers — and
  restarts fresh. It expands *breadth of choice*, never raw stat power, so skill stays the axis
  (Codex's warning: grinding must not trivialise the sim). Progress persists locally (today
  `campaign_progression.js` localStorage; see §9 authority note).

### 5. Escalation — a seeded difficulty budget

Each run has a rising **difficulty budget** the seed spends per engagement across three axes:

- **Competence** — the pilot skill of the opposition (novice → competent → veteran → ace);
- **Numbers** — 1v1 up to outnumbered;
- **Threat variety** — enemy/airframe/behaviour mix and hazards (weather cells, terrain-adjacent
  fights, drones).

Early engagements are cheap (one dumb drone); later ones spend more (a competent bandit + a wingman +
a hazard). The climax is weighted toward **competence** (a real ace, ± support). Because the seed
chooses *how* it spends the budget, runs differ: one is a numbers gauntlet, another a duel-heavy skill
test, another mixed threats. Escalation and run-variety fall out of the same mechanism. Reuses the
existing seeded machinery (`DifficultyModel.WeatherSeed` / `TurbulenceSeed`).

### 6. Variants unlocked with play (both)

- **Roguelite depth:** smarter enemies up to the ace, the gauntlet itself, the meta economy, and the
  "earn your augmentation back" challenge for engaged players.
- **Aircraft / era variants:** F-35C, then later the historical F-86 and drones per ADR-0001, each
  with its own honest handling (its own dynamics provider, not a reskin).

## The ace AI (flagship deliverable)

The gauntlet is only as good as its climax, and the current `ReactiveBandit` tops out well short of a
credible top-end pilot. A believable **ace** is the headline engineering goal. "Smart" here means
tactically sound BFM against an honest energy model — not perfect aim or hidden information.

**A competence ladder** (the escalation's competence axis), each tier a superset of the last:

1. **Drone / novice** — flies a predictable track, poor gun discipline, does not defend. (Roughly
   today's simplest behaviour; deliberately dumb.)
2. **Competent bandit** — reactive pursuit, reasonable turns, fires with a plausible solution.
   (Roughly today's `ReactiveBandit`.)
3. **Veteran** — manages energy, uses the vertical, occasional gun defence and extension.
4. **Ace** — the climax pilot. Distinguishing behaviours to build:
   - **Energy fighter.** Preserves and trades energy deliberately; uses the vertical (high/low yo-yo,
     zoom, unloaded extension) rather than only turning in-plane; refuses to bleed to a corner it
     can't recover from.
   - **Forces overshoots / gun-defends.** When the player gains a gun solution, breaks out-of-plane to
     spoil it and drive an overshoot, then reverses for advantage — the player must fly disciplined
     BFM, not saddle up and hose.
   - **Honest gun discipline.** Fires only with a real, converging solution (same ballistics the
     player faces); no perfect-aim cheat.
   - **Doesn't suicide.** Recognises a losing position and **disengages/extends**, then **re-engages
     when it has regained advantage** — separations and re-merges, not a fight to a scripted death.
   - **Uses its scarce missile** at range/aspect when it has one, then guns.
   - **Not a pattern.** Varies its opening game plan and mid-fight decisions across a bounded set of
     doctrines so the player can't memorise a single script; feints and rate/radius changes.
   - **Perception-limited.** Consumes only its own belief state (aspect, range, closure, energy); no
     access to the player's exact private state. Its edge is decision quality, not omniscience.

Approach: extend the `sim/Doctrine/` layer (`ReactiveBandit`, `Beats`, `GunKill`,
`NeutralMergeBandit`) with an energy/geometry-aware decision layer and a small doctrine set, gated by
competence tier so the same code produces the dumb→ace range. Validate with headless BFM scenarios
(pursuit, defensive, neutral merge, disengage/re-engage) asserting the ace behaviours emerge and stay
deterministic.

## Honesty boundary (explicit)

| Honest (never faked) | Disclosed arcade layer (allowed) |
|---|---|
| 6DOF physics, drag/energy, structural & G limits | Flight-control **augmentation** assists (pilot skill) |
| Gun & missile time-of-flight, dispersion, aspect/seeker limits | Aim/lead, SA, threat cues, Auto-GCAS/anti-G assist tiers |
| Non-omniscient AI (belief state only) | Scarce missiles as a rationed resource |
| Evidence-based debrief on designated sim sorties | Arcade run scoring on outcome/style/survival/improvement |
| Deterministic seeded world | Seeded run variety, daily seed leaderboard |

Assists and missiles are surfaced to the player as what they are; the game never claims a boosted
result is authentic F-22 behaviour.

## Mapping to what already exists

- **Reuse:** `SimulationSession` lifecycle; `sim/Doctrine/*` bandit AI; `DifficultyModel` seeds;
  `DetentLayer` / `KeyGrammar` control augmentation; `GunneryPitchAssist`; `AutoGcas`;
  `PilotPhysiology`; `campaign_progression.js` (progression persistence); the F-22A / F-35C flight
  models.
- **New:** run/gauntlet orchestration (seeded budget → engagement sequence + climax); the assist
  **pool + draft** (unlock, per-run pick, apply); the **sidegrade meta** currency/unlock store; the
  **ace decision layer** and competence-tier gating; scarce-**missile** weapon + loadout; front-door
  instant-action entry; run scoring.

## Success criteria (the falsifiable-fun gate from ADR-0001)

Before funding the full loop, validate with real first-touch players that the **front-door F-22 gun
dogfight is fun inside the first minute**, and that a completed **ace fight reads as a real skill
test** (not luck, not a bullet-sponge). Measure time-to-first-kill, ace win-rate curve, missile-spend
timing, and voluntary second-run rate. If newcomers fail on controls/awareness/aiming rather than
aircraft, fix those first.

## Non-goals (for this loop)

- No fake aircraft-performance power-ups or hidden-truth AI.
- No historical-governance / dossier machinery on the arcade loop (deferred per ADR-0001).
- No node-map meta-layer (bounded gauntlet chosen over branching route).
- No multiplayer combat (presence-only stays as is).

## Open questions (resolve during planning)

- Exact assist list and their tier curves; how many build picks per run.
- Meta currency shape and unlock ordering; anti-grind guard.
- Whether the climax ace can bring a wingman, and enemy-missile / missile-defence scope.
- Progression authority once a leaderboard attaches (localStorage is a trusted-client surface).
