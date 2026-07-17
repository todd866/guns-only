# Guns Only — Design Spec

*2026-07-16 · working title "Guns Only" (rename at will) · v3, reframed to jet drones after live feel-testing (2026-07-17); v2 was adversarially reviewed (4 Claude lenses + Codex) and those hardenings are preserved · status: in build (M0)*

## 1. Vision

A flat-screen, laptop-native, **guns-only 1v1 jet-drone dogfight** — flown on a **full aerodynamic model** through a novel **doctrine-detent keyboard control scheme**, presented first-person through the drone's **sensor feed** with a glass combat HUD, and debriefed like a real sortie.

**One sentence:** the vibes of dogfighting a jet, on the machine you already own, with no joystick, no switchology, and no missiles of your own.

**Why drones (the 2026-07-17 reframe, and it is load-bearing):** the gameplay is *derived from the physics*, so the fiction is a skin — a guns fight between two jet drones and a guns fight between a Sabre and a MiG are the same BFM, because energy, pursuit geometry and gun solutions all fall out of aerodynamics that don't care whether there's a pilot aboard. Choosing drones therefore costs nothing in gameplay and pays three ways: no cockpit art dependency (the view is a sensor feed, which is what the HUD already is), a purely **structural** G-limit (no pilot to black out — matching the "bare arrows can never depart" grammar), and fictional airframes (no licensing, no rivet-counters, no switchology).

**Why guns, derived (this is the premise the whole game rests on):**
1. **Cost-exchange.** A $2M interceptor against a $50k drone loses the war economically even while winning engagements. At scale you need a ~$10 per-shot weapon. That's a gun.
2. **Magazine depth.** 2–4 missiles versus ~hundreds of rounds = dozens of passes. In an attrition war, depth beats per-shot quality.
3. **Un-jammable.** Mature counter-seeker EW collapses missile Pk; you cannot jam a bullet. Passive EO/IR sensor + gun is the kill chain that survives heavy EW — which is also why the view is a passive sensor feed and why *seeing him* is a real mechanic.

**Who the player is: an AI — and the premise forces it, it isn't a flourish.** The EW that justifies guns (seeker denial) equally severs the datalink to any remote human operator; a human on the loop was quietly inconsistent with the reason guns exist. So the tactical brain is **onboard**, and it isn't a person. Three things we had already built become diegetic for free:
- **The HUD is not an instrument — it's attention.** An AI wouldn't read a pitch ladder; but what the sensor feed and glass symbology *depict* is what the mind is attending to. The TD box is attention on the bandit; the ladder is proprioception. The UI is the character's phenomenology.
- **The detent grammar is a model of mind.** The valleys are not an assist and not an autopilot being supervised — they are **reflexes** (System 1). The player is the deliberative layer (System 2) modulating off its own instincts, and the spacebar override (§7) is the mind overruling its own envelope protection.
- **The debrief is you reviewing your own death** (§11), and `R` is not a restart but the **next instance**. The retention loop (daily seeded fight, "beat your own grade") becomes successive minds flying the same problem and learning.

This also gives the Tier-2 manned fighter (§3a) its real payload: not "cheap beats expensive" but a $50k expendable *mind* against a $100M protected *body*, and the question of which the war actually values. **Cost to build: zero — it is fiction and touches no code.** Written as premise; the *delivery* (stated flatly vs revealed) is a narrative problem for a much later day.

**Why it converges on a 1950s envelope (and why that's a result, not nostalgia):** removing the pilot removes the ~9G physiological cap, but induced drag scales with G², so *sustained* turn performance is thrust-limited, not structure-limited. You can snap a harder instantaneous break; you cannot hold it. The energy game is therefore unchanged. Add economics — cheap ⇒ light structure (~12G, not 20) ⇒ transonic, not supersonic — and the derived envelope lands F-86-shaped from first principles.

**Product hypothesis (evidenced, not proven — see `docs/research/2026-07-16-prior-art-survey.md`):** a guns-only pure-BFM game with an honest energy model exists and is loved in VR (Virtual Fighter Maneuvers, 95% positive on a small review base). The survey found no flat-screen equivalent: no shipped game combines a real energy model + guns-first BFM + a first-class flat-screen view answer. This project combines them, and adds two things the survey found nowhere: a non-cheating doctrine-driven AI and a control scheme designed for a laptop rather than ported to one. Note the survey's own finding that the healthiest games in this niche (Nuclear Option, VFM) use **fictional airframes** — the drone reframe lands us there deliberately.

### Design pillars (tie-breakers for every future decision)

1. **The physics never lies.** Player and AI fly the same model; energy is never faked; the sight is honest.
2. **Delegate the stick-waggling, never the decisions.** Automation handles execution precision; every tactical choice — pursuit geometry, the forks, the shot — belongs to the player. Operational test: **if the debrief would annotate it as a choice, the detent may never make it.**
3. **Losing sight must be scary — for both pilots.** The sight fight is the emotional core; no magic sensors on either side of the merge.
4. **The whole fight, nothing but the fight.** Merge → BFM → guns → debrief. Anything that isn't that is out.
5. **Anti-study-sim.** Zero mandatory switchology. If a control exists, it matters in the fight.

## 2. Non-goals (v1)

- **You never carry missiles — ever (identity, not scope).** Note the clarification: *guns-only describes YOUR loadout, not the threat environment.* Facing incoming missiles is not a contradiction — it is the entire reason the cost-exchange argument exists — but modelling them (seekers, RWR, notching, countermeasures) is a whole milestone and is **roadmap, not v1** (§3a).
- No campaign, no multiplayer, no VR, no HOTAS requirement (HOTAS may *work* later; it is never assumed). Scripted **drills/missions** are permitted only where they reuse existing machinery and close a known gap — see the Shahed drill in §3a.
- No clickable systems depth: the only mid-fight interactions are ones that matter in the fight (sensor ranging, gimbal/padlock, flaps/boards).
- No cockpit interior, no takeoff/landing in v1 — the view is the drone's nose sensor feed and fights start airborne.
- **No gimbaled gun.** A drone *could* gimbal its gun, and doing so would delete BFM entirely (fly past, shoot sideways, no geometry). We take the fixed-forward-gun branch deliberately, defensibly (gimbal mass/cost/ammo-feed on an attritable; boresight rigidity; recoil through the CG) — but it is a **choice**, not something the derivation forced. Written down so nobody re-derives it away later.
- **The detents are the control scheme, non-optional** (see §7). In-fiction they are the drone's own flight AI; the player is the tactical brain on the loop.
- **The detents are the control scheme, non-optional.** The assist slider (§7) fades the *suggestion UI* only. There is no "raw mode" to balance against (the rejected autonomy dial stays rejected).

## 3. Player experience — the loop

**Setup → Fight → Debrief → again.**

- **Setup screen:** choose jet (Sabre or MiG-15), starting geometry (offensive perch / defensive perch / neutral merge / butterfly), altitude/airspeed presets, **fuel preset (the round timer)**, AI tier. One screen, launch in seconds.
- **Fight:** the 1v1, from setup until one of the **defined endings** below. Typical duration 1–5 minutes.
- **Debrief:** replay with flight-path ribbons, energy traces, doctrine annotations, gun camera. `R` restarts instantly.

**Fight endings — every one has an owner and a score:**
- **Kill** (or mutual, or pilot ejection on unrecoverable departure).
- **Hard deck** (briefed floor): bust it and the fight ends as a loss annotation — exactly like the training rules the sortie is modeled on.
- **Bingo:** the fuel preset reaching bingo forces the AI to disengage honestly and ends the fight; scored from the continuous advantage metric (§11).
- **Auto knock-it-off:** N seconds of neutral separation beyond X km ends the fight as a draw-with-grade. Player can also call KIO manually (`K`).
- The AI's willingness to accept risk **rises as fuel falls** (a doctrine-engine term), so two conservative pilots converge instead of orbiting a lufbery forever.

**Flight school (onboarding, in-architecture):** 6–10 canned drills, each one P-825 atom — hold lag, convert the overshoot, defend guns, work the ranging brackets — flown against the scripted drone with the doctrine annotations *live* instead of post-hoc. Plus a one-screen concept card per doctrine term (one-circle, lag, corner speed…), linked from the debrief the first time each term appears. The suggestion UI teaches *what to press*; flight school teaches *why*; the debrief teaches *what happened*.

**Retention hook (v1, nearly free given determinism):** a **daily seeded fight** — same setup + AI seed for everyone that day, shareable debrief — and a graded sortie score computed from the doctrine engine's continuous advantage metric ("beat your own BFM grade").

The whole game honors a 10-minute laptop session: lid open → fighting inside 30 seconds.

## 3a. The threat ladder and delivery (roadmap spine — ORDER MATTERS, see §15.7)

The fiction supplies a difficulty ramp without a campaign. **None of this precedes the M0 feel gate**; it is banked here so it isn't lost, and ordered so it can't sprawl (the niche's named killers are CAP2's decade of execution starvation and TCA's content drought — the antidote is ordering ideas, not refusing them).

**The ladder teaches one pillar per tier — and it fell out of the fiction rather than being designed top-down, which is why it's better than a bolted-on tutorial:**

- **Tier 0 — junk-drone hunting (Shahed-types) → teaches GUNNERY.** Slow, non-maneuvering, defenceless. Closure, ranging, burst discipline — the gun's whole language learned somewhere that cannot kill you. **This is the onboarding fix** for the review's finding that nothing teaches before the first twenty deaths, and it is **nearly free**: `RailBandit` already flies scripted non-maneuvering targets on a timeline. Cheapest high-value item on the roadmap; build it when flight school (§3) is built.
- **Tier 0.5 — the glider strike (balloon → U-2 altitude → tanker/AWACS) → teaches ENERGY, and teaches it better than anything else in the game.** Strip the engine and you strip the thing that papers over energy mistakes: with no throttle, **every turn is a withdrawal from an account you can never pay back into.** One pass, no re-attack, then you're a falling wing. The concept lands in the gut instead of in a debrief annotation. Physically honest: ~70k ft is ~4% sea-level density (huge energy account, almost no q to spend it with — you go straight and build speed), a decent L/D buys hundreds of km of range, a dive goes transonic; no engine means no IR plume and no intake return, which is *why* it can reach a tanker. Doctrinally right target: the enablers are enormous, undefended, and cannot dodge — killing them is how an air campaign actually breaks. **Cost to build: thrust = 0.** The FDM needs no new system.
- **Tier 1 — gun-drone BFM → teaches GEOMETRY.** The core game. Everything else in this spec.
- **Tier 2 — the manned 4th/5th-gen fighter.** Thematically the payoff: you are the cheap thing, he is the $100M thing, and you win by economics rather than superiority. **The framing that saves this from becoming a swarm-AI project:** he already spent his missiles on the four drones ahead of you — you're the fifth. Now it's guns, 1v1, and *he* is the one who can't afford to trade. Same story, zero multi-ship AI, 1v1 core intact. Modelling *incoming* missiles (seekers, RWR, notching, countermeasures) is a real milestone in its own right and stays behind the core fight.

**Delivery — balloon drop.** Cheap drones don't need runways: loft one under a balloon and cut it loose at ~60,000 ft. This (a) makes "fights start airborne" **diegetic** rather than a scope dodge, (b) solves the range/logistics problem for a 30-minute attritable, and (c) is a genuinely interesting *start condition* rather than a gift — at 60k the air is ~7% of sea-level density, so you have enormous potential energy and almost **no q to pull against**. You're a brick with a plan, converting height into speed and *earning* maneuverability as you fall into thicker air, against an opponent who has q but nothing in the bank. Costs the sim **nothing but an initial condition** — the FDM already models density → q → G-available and thrust lapse. A high-altitude drop start is a setup preset, not a feature.

## 4. Airframes — a derived family, two built first

**The generating principle:** cheap attritables *invert the multirole logic*. A manned 5th-gen must be multirole because it costs $100M and has to amortise across every mission; a $50k drone has no such pressure, so you build **narrow specialists**. The ecosystem is therefore a family, and every future airframe is justified by a mission economics argument rather than invented. The design axes that actually trade against each other: **thrust vs wing** (energy vs angles), **high vs low altitude** (wing area for thin air vs strong small wing for gust loads), **speed**, and **range/endurance**. These map onto BFM archetypes *and* onto the threat ladder (§3a), because Shaheds are low, gun-drones are mid, and manned fighters cruise high — so *where you can fight is what you built*, and choosing the fight's altitude becomes strategy one level above BFM.

**The M1 pair** (the archetypal BFM split — energy vs angles — built first because it's the fight's core dichotomy):

- **Type 1 — energy/vertical.** Cheapest possible kill: climb, convert height, snapshot, leave. T/W ~0.95, small high-loaded wing (~350 kg/m²), light structure. **Owns:** climb, acceleration, zoom, ceiling, the vertical. **Suffers:** sustained turn (bleeds viciously), sloppy slow, unforgiving. **Gun:** single ~30 mm cannon, ~600 rpm, ~90 rounds — one hit kills; a snapshot weapon. **Sensor:** cheap — narrow gimbal (~±90°), manual/stadiametric ranging (the player works the range). **Silhouette:** stubby, short-span, big intake, blunt — a flying engine with a cannon. Ugly and cheap.
- **Type 2 — angles/turn.** Air-superiority attritable: win the turning fight. T/W ~0.75, big wing (~220 kg/m²). **Owns:** sustained rate and radius, low-speed handling, transonic manners. **Suffers:** climb, acceleration, ceiling. **Gun:** ~20 mm rotary, ~3000 rpm, ~400 rounds — forgiving, but needs tracking *time*. **Sensor:** better — wide gimbal (~±150°), active ranging, computed gun solution. **Silhouette:** cleaner, longer swept wing, slimmer, prominent sensor ball where a canopy would be.

*Note where that landed:* vertical + heavy cannon + crude sight vs turn + fast light gun + good sight is **MiG-15 vs F-86, arrived at from cost and aerodynamics with zero historical input.** The design space really is that constrained. The old Sabre/MiG matchup's design equity therefore survives the reframe intact — including the sensor asymmetry as the MiG-style mastery track (§9).

**Ammo is a live trade, and near-symmetric by accident:** 90 rds @ 600 rpm ≈ 9 s of trigger; 400 @ 3000 rpm ≈ 8 s. Both sides get ~8 seconds of gun per sortie. Burst discipline matters; more ammo costs mass costs performance.

**Shared envelope** (strawman, tunable): 5–7 m, 1500–3000 kg, single small turbojet, structural ~12G but sustained ~6G (thrust-limited — §1), M0.85–0.92, 20–40 min endurance (fuel = the bingo round-timer, §3). No afterburner; energy is earned.

**Expansion axes (roadmap, not M1):** high-altitude specialist (big wing, altitude-lapsed engine — nearly free, the FDM already models density → q → G-available), low-altitude point-defence (small strong wing, gust loads), long-range hunter (fuel fraction vs knife-fight weight), short-range sprinter. **Delivery is a design axis too:** a balloon-lofted drone needs *no climb performance at all* (it's dropped at altitude — §3a), so it can spend that mass on wing or gun.

## 5. Flight Dynamics Model (FDM)

**Custom 6DOF rigid body, table-driven aerodynamics.** Force/moment coefficients vs alpha, beta, Mach, and control deflections; mass/inertia/fuel-burn; engine thrust vs Mach/altitude with spool dynamics.

- **Data provenance — DERIVED, not archival (v3 change, and it is a simplification).** The airframes are fictional, so there are no NACA/Soviet documents to identify parameters from and no rivet-counters to satisfy. Instead we **author each airframe to its derived envelope** (§4): pick wing/thrust/mass/structure from the mission-economics argument, then generate coefficient tables that hit the stated envelope. This *removes* the v2 plan's archival burden (chart digitisation, axis/CG-convention reconciliation, source-to-parameter coverage audit) — all of which existed only to serve historical fidelity we no longer claim.
  - **What replaces "is it historically right?" is "is it physically honest?":** every table must be internally consistent aerodynamics (sane polars, real induced-drag scaling, honest transonic rise), not curves reverse-fitted to make a fight fun. The §5 flight-test cards below remain the gate — they just assert the *derived* envelope instead of a published one.
  - **The integrator/machinery validation stays exactly as specified:** validate the table machinery against the public **NASA TP-1538 F-16 model** (full tables, published check cases, JSBSim as cross-oracle) *before* authoring either airframe. That step was never about the Sabre; it settles "is my sim right" independent of "is my data right," and it matters more now that the data has no external oracle.
  - Real-aircraft data (F-86/MiG-15 published performance) remains useful as a **sanity anchor** — if a derived airframe's numbers drift far from any jet that ever flew this envelope, that's a smell worth investigating.
- **Compressibility is gameplay:** staged transonic degradation (snaking → buffet → pitch-up → control loss) must emerge from the tables, and is a per-airframe character trait — a cheap airframe with crude aerodynamics degrades earlier and nastier than a refined one. This is now a *design lever* rather than a historical fact to reproduce.
- **Departures and spins:** post-stall table extensions and departure tendencies modeled. Per the control grammar (§7), **bare arrows can never depart** — the drone's flight AI holds the envelope. Departure is reachable *only* by holding the override (spacebar), and then recovery is **uncertain**: correct rudder-led inputs give a real chance, some entry modes are unrecoverable. Departures are a weapon you bait the other guy into precisely *because* the outcome is not guaranteed.
- **G-limit: structural, not physiological.** No pilot aboard — the ~9G human cap is gone and the limiter is the airframe (~12G structural, ~6G sustained/thrust-limited, §1). This deletes the v2 physiology model (grey-out/blackout/G-suit asymmetry) entirely: a cheaper, more honest model that matches the "the limit is the airframe" grammar. **Consequence for the AI:** its constraint is airframe and *sensor* (§6 belief state), never pilot tolerance — so difficulty remains behavior-only (§10) with no physiology dial.
- **Two models, one truth:** the full 6DOF drives the live fight. A **reduced-order companion model** (point-mass energy/geometry, the same approach the real-time NASA AML used) drives doctrine rollouts (§6); an M1 test asserts the reduced model's predictions track the 6DOF within stated bounds on the maneuver library.
- **Integration:** own fixed-timestep RK4 (120 Hz baseline), sim state **float64 end-to-end** with hand-rolled vector math inside the pure module (Godot's float32 Vector3 never touches sim state); Godot appears only in the render/collision bridge, which also owns world-frame rebasing. Jolt handles collision queries only — and anything sim-authoritative (ground, projectile hits) uses deterministic data queries, never camera-dependent physics.

### FDM validation — the flight test cards

Two stages, so a red card is debuggable:

1. **Integrator/machinery validation (before any Sabre data exists):** run the table machinery against a *complete public dataset with published check cases* — the NASA TP-1538 F-16 model — with JSBSim as a cross-oracle. Settles "is my sim right" independent of "is my data right."
2. **Aircraft cards:** level accel, max speed vs altitude, sustained turn rate/radius, climb schedules, transonic staging (per jet), stall speeds — split into declared fit-targets and held-out validation. Spin cards are **qualitative** (recovers with correct inputs at plausible rates; sane altitude loss; entry modes match accounts).

Cards run headless in CI on every FDM/data change. Feel work (buffet, audio, shake) is authored on top of the validated model, never by bending it.

## 6. Doctrine Engine — one brain, two layers, three consumers

The component that knows *the textbook move*. Review exposed two missing pieces — the perception boundary and the selector/execution split — both now load-bearing:

**Layer 1 — the selector (slow, ~1–2 Hz):** NASA-AML-lineage trial-maneuver selection: generate candidates from a Shaw/P-825-derived maneuver library, forward-simulate a few seconds on the **reduced-order model** (never the full 6DOF — that's how the real AML was real-time), score on relative geometry + energy, output the best candidate *and* the live forks. Pinned budget (tuned at M3, enforced in CI): ~8–12 candidates, 3–5 s horizon, 10–20 Hz rollout step, opponent modeled as extrapolate-current-maneuver (never nested best-response — that squares the cost).

**Layer 2 — the execution laws (fast, every physics tick):** each maneuver in the library carries a cheap closed-form control law (G-command / pursuit law / lift-vector schedule) that turns the selected maneuver into per-tick recommended inputs. This is what the detents settle into, what the reflex baseline flies, what rollout candidates use internally, and what the AI actuates. Without this layer a 2 Hz selector would stair-step the detent valley; with it, the valley is smooth and the rollouts are cheap.

**The perception boundary (pillar 3 made architecture):** the engine consumes a **belief state, not ground truth** — own-ship truth + a bandit estimate gated by the same visual rules the player lives under (tally/no-tally via pilot-eye line of sight, masking by own airframe, sun, haze, range/contrast; memory decay and growing position uncertainty while no-tally; G-effects degrade acquisition). **All three consumers eat the belief state.** The AI can genuinely lose sight of you; sun-blind reversals work because the architecture makes them work.

**Outputs:** (1) recommended per-tick control input (the valley), (2) named tactical context ("lag for spacing," "solution developing"), (3) **the forks, surfaced not chosen** — where doctrine genuinely branches (one/two-circle, rate vs radius), the engine returns *multiple selectable valleys*.

**The player decision taxonomy (pillar 2 made explicit):**
- **Player-owned, always:** fork commits, pursuit-geometry selection (lead/pure/lag), shot decisions, disengage/KIO, over-limit demands.
- **Reflex-owned:** AoA/G protection, coordination, roll quantization, terminal pipper damping (§9), holding the *player's chosen* geometry between decisions.
- **Fork commitment mechanism:** at a surfaced fork the current valley holds a neutral "maintain" solution; the player commits by *flying* — a committing input toward one option (roll direction at the merge, pull-vs-unload at the rate/radius branch) selects it, and the suggestion UI confirms which branch is now live. The inference rule is: sustained input toward an option = selection; ambiguous input keeps "maintain."
- Consumer scoping: the *AI* consumer picks its own forks (that's its personality, §10); "never auto-picks" governs the two player-facing consumers.

**Open design question — valley depth (the review's deepest challenge, resolved by test at M0):** do the valleys encode *doctrine* (hold = the recommended maneuver's G — the original "reflexes toward the optimal move" concept) or *physics only* (valleys = limiter/coordination/airmanship; doctrine lives in the suggestion UI plus weak magnetism)? Two reviewers argue doctrine-deep valleys risk War-Thunder-Instructor syndrome — riding the baseline unpunished below the top AI tier, with the fight's feel collapsing to ~10 decisions and spectating between them. The counter-position: shallow valleys may discard exactly the "modulate off the reflex" feel the game is founded on. **Both variants ship in the M0 grammar slice behind a debug toggle; the feel gate decides.** Either way, the spec adds the requirement the challenge exposed: **deviation from doctrine must pay legibly at every AI tier** (the sortie grade rewards deviation quality; mid-tiers punish repeated patterns within a fight, not just Honcho across fights).

**Determinism:** doctrine evaluation is deterministic given belief state + seeded personality RNG; the selector runs on a worker thread with results applied at a **fixed tick offset** — and since AI control streams are recorded like the player's (§11), replay never re-runs the doctrine engine at all.

## 7. Control system — the local-minima grammar

**Mental model:** the virtual stick lives in a potential landscape whose valleys are the recommended inputs (§6 execution laws). Keys express *intent*; the stick settles into the nearest valley; perturb off it and it relaxes back on release. Assistance as detents in control space — never autopilot. **You must actually press; the game never plays itself.** A small always-on **stick-position indicator** shows the valley and your perturbation (non-optional — the valley must always be legible, or settling reads as "the game fighting my inputs").

**The G vocabulary, defined (review: three quantities were conflated):**
1. **Valley G** — what the selected maneuver's execution law recommends (≤ 2 below).
2. **Max-perform G** — best honest available performance right now (the reflex layer's AoA/G protection boundary — "the limiter" is this assist boundary; neither 1953 jet has one).
3. **The hard limits** — aero/structural/physiological truth. Beyond 2 lies buffet, departure, blackout.

### Key grammar (v0.2 — locked at the M0 feel gate)

| Input | Function | Grammar |
|---|---|---|
| **↑** | **Pull** | hold = valley G · **while holding, ↓-taps ease in −0.5G sticky steps** (release-and-recommit to undo) · **double-tap-hold = demand past protection** (buffet → departure if you insist) · release = settle back to baseline. *Positive off-valley modulation is deliberately absent in variant A — review-proven impossible on one key, since tap-tap-hold is already the over-demand gesture; variant B covers the upward range by riding max-perform and easing down. This asymmetry is itself an A/B feel-gate question.* |
| **↓** | **Unload** | hold = ~0G · double-tap-hold = push negative (guns-defense jink) |
| **← / →** | **Roll** | tap = intent-quantized roll (lift vector on / deliberately past the bandit; at a surfaced fork, roll direction = fork commitment) · hold = continuous |
| **A / D** | Rudder | coordination reflex untouched; manual for guns defense, scissors, spin recovery |
| **W / S** | Throttle | detented: idle ↔ cruise ↔ mil |
| **F** | Guns | fire |
| **X** | Cage/uncage sight | cages the gyro to the fixed cross during hard maneuvering — real LCOS discipline, affects the sight model (§9) |
| **C / B** | Flaps / speed brakes | discrete, honest speed limits |
| **Space** | Padlock toggle / reacquire | eyeball-honesty rules (§8) |
| **K** | Knock it off | ends the fight, straight to debrief |
| **R** | Restart setup | instant "again" |
| **Trackpad drag** | Freelook | scanning when not padlocked |
| **Two-finger scroll** | View zoom | never modal, never contextual |
| **Ranging (MiG)** | **Dedicated detented input** | discrete span brackets with snap + audio tick (see §9) — deliberately *not* hover-contextual scroll (a modal-input error factory at 5G); exact binding chosen at M0 with hands on hardware |

No gear key in v1 (fights start and end airborne; pillar 5 cuts it — key reserved). Arrows are **pull/unload, not nose-up/down** — the invert-Y debate cannot exist. In no-tally flight the modifiers keep their meaning against pure airmanship valleys (max-perform, past-protection, 0G); only the doctrine content drops out.

### Hardware honesty (new, from review)

- **Chord budget: no mandatory simultaneous combination exceeds 3 keys.** Apple internal keyboards can electrically ghost on 3–4 key chords with no software fix; the actual grammar table gets a **day-one chord test on the target MacBook**, and the first-run calibration screen includes a rollover self-test.
- All tap/hold semantics run off the game's own timers on raw key events (OS key-repeat echoes filtered); trackpad gestures get a momentum deadband (macOS inertial scrolling keeps emitting deltas after finger-lift).

### Design principles

- **Pull is the default state of a dogfight;** the skill is modulation — when not to pull, when to demand more than the protection wants to give.
- **The interaction budget exists because the baseline flies.** With keys released the reflex holds competent, doctrine-shaped, *predictable* flight (it never shoots, never picks forks). Mid-fight trackpad work is legitimate, like trimming then reaching for the map.
- **The suggestion UI is a coach, not a pilot:** ghost key-prompts and fork options, fading with a player-set assist level down to off. The assist level touches the UI only — never the detents, never the indicator.
- **No tally, no doctrine:** without a padlocked bandit the detents relax to plain airmanship and the arrows become straightforward pitch/roll verbs.

## 8. Sight system — the flat-screen camera answer

- **Tally is computed at the pilot's eyes, not the camera** — one rule for both pilots (§6 belief state): line of sight, airframe masking, sun, haze, range/contrast, G-degradation. Padlock engages only with plausible tally; **breaks after a few seconds masked or blacked out**; reacquisition needs the bandit back in your visual field. Losing sight is real and loses fights.
- **The presentation sells the fiction (review: cockpit rules + external camera don't compose unless you make them):** in the external view, a bandit your *pilot* can't see **visually degrades — drops smart-scaling, fades into haze —** even if the raw geometry would put him on screen. What you see always agrees with what your pilot knows. This is an explicit M2 gate criterion.
- **Two view states, one seam (review: the camera and the gunsight must meet):** the **maneuver view** — own-ship-anchored external framing, your jet on screen as the attitude anchor while the camera orbits toward the bandit (the arcade convergence; it doesn't disorient) — and the **gun view** — as a firing solution develops (range + angular-error thresholds), the camera auto-blends over the nose into an honest collimated-sight frame for the terminal tracking and the shot, blending back out as the solution collapses. Firing is allowed from any view; *aimed* fire happens through the sight.
- **SA strip** (Falcon 4 descendant): nose vs eyes vs bandit — and it **ages and suppresses its bandit cue when tally is lost** (a stale, widening "last seen" arc, not a live position — otherwise the strip is the magic sensor pillar 3 bans).
- **Smart scaling** so detection/tally distances match human eyes rather than pixels. Haze, sun and the one optional cloud layer are fight variables, not cosmetics; sun-blind reversals work (§6 makes them real).
- **G-physiology on the view:** grey-out narrows the usable screen; blackout drops padlock.

## 9. Gunnery & damage — earned kills

- **Sabre (A-4 + APG-30):** radar supplies range automatically (historically true); wingspan is auto-set in a known 1v1 (a ritual with no decision is not a control — pillar 5). The pipper **lags and settles like a real LCOS**; caged/uncaged (X) is a real skill with real sight behavior.
- **MiG (ASP-3N):** manual stadiametric ranging as a **chunky, detented bracket mechanic** — discrete span brackets, snap + audio tick, readable at 5G — worked through the fight (historically it lived on the throttle twist grip, which is why it pairs naturally with the left hand). **The intended rhythm is written down: range in lag, refine approaching the saddle, shoot.** Ranging quality is scored in the debrief; a well-ranged N-37 hit is the game's single most spectacular event, with its own gun-camera treatment. The MiG is positioned in the setup screen as the mastery track. Hand-feasibility of the full MiG loop is an M0 gate item.
- **No always-correct lead line, ever** (the War Thunder de-skiller is the named anti-pattern).
- **Terminal damping, with a written authority envelope (review: "steady hand, not aimbot" must be defined, not asserted):** inside a small angular error with a developing solution, the reflex may **damp player-commanded tracking oscillation only** — it never adds lead, never acquires, corrects at a bounded rate, and only acts while the player is actively tracking. The player's contribution to a kill is the geometry *and* the tracking; the assist removes hand-tremor the real pilot's arm never had, nothing else.
- **Ballistics:** integrated projectiles (gravity drop, velocity inheritance, per-gun dispersion), pooled and substepped **in the native kernel** (a burst is ~150 live projectiles — a second hot path, budgeted, not discovered). Tracers render honestly and tip off the defender, as they did in Korea.
- **Damage:** per-part — engine, controls (per-surface), structure, fuel (leak/fire), pilot. A short well-placed burst is decisive; a spray is nothing; the 37mm hit that removes a wing is allowed to be what it is.
- **Guns defense is a real skill:** out-of-plane jinks (↓ push, rudder) against a tracking solution, physics deciding what saves you.

## 10. Adversary AI — the actual product

- **Doctrine engine + personality layer**, consuming the **belief state** (§6) — the AI maintains tally like you do, loses you behind its own tail, gets sun-blinded, and its G-tolerance degrades its perception before its controls.
- Personality: **decision quality** (how often it picks the best candidate vs plausible-inferior), **fork character** (aggressive/conservative at the branches), **timing error** (reaction latency), **gunnery error** (aim noise, burst discipline, range judgment), **G-tolerance** (physiology, human ranges — the no-G-suit MiG pilot is historically softer here), **KIO/disengage policy** (per tier, plus the fuel-driven risk-acceptance term from §3).
- **Difficulty tiers are behavior, never *airframe* performance:** Rookie → Veteran → Ace → Honcho. All tiers bleed energy identically because they fly the same FDM through the same control layer. Mid-tiers punish *repeated patterns within a fight*; Honcho reads your habits — persistently across fights as a stretch goal, making the top tier a rival, not a setting.
- **M3 acceptance gates, telemetry-verified: the AI never energy-cheats *and never information-cheats*** (its shot/maneuver decisions are reproducible from its logged belief state, never from ground truth it shouldn't have).
- **No RL.** AlphaDogfight behaviors (frame-perfect forward-quarter snapshots, zero self-preservation) are what makes an opponent feel cheap. Scripted doctrine + personality noise is the design.

## 11. Debrief — the other half of the sortie

- **Replay = recorded control streams for both aircraft + seed** (the AI's stream recorded exactly like the player's — replay never re-runs the doctrine engine), with periodic snapshots **for scrubbing/seek, not correction**. Replays are stamped with sim-build + data-table hashes; the determinism guarantee is scoped (same build, same machine — CI runs replay-hash tests; cross-version playback resyncs from snapshots).
- **Debrief view:** 3D flight-path ribbons colored by specific energy, timeline scrubber, gun events with hit maps, G/AoA/airspeed/altitude traces, **input overlay on by default** (deviation moments must read — also the marketing answer to "it looks like it plays itself": the trailer is the debrief and the gun camera, not live externals).
- **Doctrine annotations:** advantage-flip markers, named maneuvers, the fork where you chose wrong — the anti-"died without knowing why" system. First appearance of each term links its concept card (§3). Non-kill endings are scored from the continuous advantage metric.
- **Gun camera film** for kills, because it's Korea.

## 12. World, shell, and presentation

- **Arena: bounded, fixed-origin** (review: Terrain3D cannot be origin-shifted — feature declined by its maintainers; the original origin-shifting plan was internally contradictory). Fights start near map center; the fight bubble (±~20 km, enforced by the §3 separation rules) keeps float32 render error sub-visible — verified by a ULP check in the M0 slice. Sim state is float64 world-frame regardless (§5); the bridge owns any future rebasing.
- Korea-flavored coastal terrain (mountains, river mouth, coast), one optional cloud layer, time-of-day presets. Terrain look-from-altitude prototyped in M0.
- **Look:** clean and legible over photoreal — "1950s gun camera meets modern indie clarity." Bandit readability beats scenery, always.
- **Sound is half the physics feel:** spool, airflow vs IAS, buffet onset, G-strain breathing, gunfire with distance-appropriate report. Stylize where real data reads flat (the AC7 lesson).
- **Shell:** setup → fight → debrief, flight school drills, daily seeded fight, options (assist level, remap, first-run calibration incl. rollover self-test). Nothing else in v1.

## 13. Technical architecture

- **Engine:** Godot 4.7.x, macOS-native (Apple Silicon primary), open-source stack.
- **Languages (review: the hot-path arithmetic condemns GDScript-only *now*, not after profiling):** the **sim kernel — FDM, reduced-order model, rollouts, execution laws, ballistics — ships in C# from day one** (Godot .NET runs fine on Apple Silicon; no scons/godot-cpp toolchain pain), with float64 state and hand-rolled vector math. GDScript orchestrates: game shell, UI, camera, input grammar, doctrine *personality* glue. The kernel is a pure module (plain data in/out, headless-runnable); the whole rollout loop lives on one side of the language boundary (per-call marshalling 1,600× per decision is the trap).
- **Sim loop:** fixed-timestep kernel decoupled from render with interpolation; selector on a worker thread, decisions applied at fixed tick offsets (§6).
- **Headless-first testing:** flight-test cards; doctrine CI asserts **invariants + statistical envelopes over many seeds** (no energy/information cheats, limits respected, fights terminate, no NaNs — never single-fight outcome envelopes, which are flaky by construction in a chaotic system), with explicit re-baselining when tables intentionally change. Replay-hash tests. Screenshot rig for UI/camera later.
- **Determinism discipline:** seeded RNG everywhere, no wall clock in sim, fixed iteration order, recorded input streams as the replay format, scoped guarantee (§11).
- **Repo:** `~/Projects/guns-only`; this spec + the research survey + review findings committed.

## 14. Milestones — feel risk first, fidelity second (review: the original order gated the core bet behind three milestones that didn't test it)

- **M0 — the grammar slice (THE feel gate).** Placeholder reduced-order flight model (honest energy *shape*, no table fidelity), flat sea arena, scripted-rail bandit, **hand-authored doctrine stream** (canned execution laws for 3–4 scenario beats: perch attack, break defense, saddle + shot), full detent grammar, padlock + both view states, stick indicator, suggestion prompts. Plus the hardware spikes: **chord/ghosting test on the target MacBook, gesture momentum spike, terrain-from-altitude look, render ULP check.** **Gate: combat detents feel like flying BFM — tested in both valley-depth variants (§6) — and the hands physically work on the keyboard. Nothing else gets built until this gate passes; explicit willingness to redesign the grammar here.**
- **M1 — the honest airplane.** M1a: kernel + table machinery validated against the public NASA F-16 dataset with JSBSim cross-oracle. M1b: source-to-parameter coverage audit → Sabre tables → fit-target + held-out cards green. Reduced-order model fidelity test vs the 6DOF. Swap into the slice; **re-gate feel** (the grammar must survive contact with the real airplane).
- **M2 — the sight fight.** Eyeball-honesty rules, belief-state tally (player side), presentation-sells-masking, SA strip with aging cue, smart scaling, canned-maneuver drone. Flight school drills ride this milestone (same machinery). *Gate: losing sight is scary; what you see always matches what your pilot knows.*
- **M3 — the brain.** Two-layer doctrine engine (selector + execution laws), belief state for the AI, personality tiers, fork surfacing/commitment. *Gates: an honest AI you beat by out-deciding; energy-cheat AND information-cheat telemetry clean; rollout budget holds real-time.*
- **M4 — the kill.** Both sights (A-4 auto-range + caging; ASP bracket ranging), ballistics, damage, guns defense, debrief with doctrine annotations + input overlay + gun camera.
- **M5 — the matchup.** MiG-15 tables + cards, physiology asymmetry, setup screen, fight-ending rules tuned, daily seeded fight, sortie grading, sound/feel polish.

## 15. Risks

1. **The detent grammar is unproven anywhere.** Now retired at **M0** (was M1, which couldn't test it — triangulated by three reviewers). Fallbacks if the gate fails: shallower valleys, continuous-hold analog emulation, coarser detents. The one-brain architecture survives any grammar outcome.
2. **Valley depth is an open design question** (doctrine-deep vs physics-only): resolved by A/B at the M0 gate; the requirement that deviation pays at every tier stands regardless.
3. **MiG data is parameter identification against Soviet-manual + USAF-narrative sources** — real archival and tuning work with a declared audit, fit/held-out split, and `tuned` labeling. (The original spec claimed a NACA dataset that does not exist.)
4. **Solo-scope honesty:** M0's slice is deliberately the *whole product in miniature* (fly, fight, shoot, debrief against a scripted bandit) so the project is a playable game at every milestone, never a physics library waiting for a game. The survey's Godot existence proofs don't include this combination; that's why the slice comes first.
5. **Godot 4 has no shipped jet-combat precedent**; the scary parts (fixed-origin bounded arena, clipmap terrain, .NET kernel) all get de-risked inside M0/M1 spikes.
6. **Market timing:** *Korea. IL-2* (Steam, 4 Aug 2026) will define "Korean air war" publicly — it's a study sim; this is the anti-study-sim. Differentiation stays sharp via pillars 2 and 5; the trailer is the debrief, not the externals.
7. **Scope creep:** the non-goals list is the contract; revisit only after M5.

## 16. Grounding & provenance

Prior art, camera-solution catalog, engine assessment, sources: `docs/research/2026-07-16-prior-art-survey.md` (note: the CNATRA P-825 official URL is dead; use the mirrored PDF or a web.archive capture — P-825 Rev 07-14 verified real and as described). Doctrine sources: Shaw, *Fighter Combat*; CNATRA P-825; NASA CR-4160 (AML lineage — note the real-time AML used a reduced 5DOF model, which is exactly what §6 adopts); Andy Bush's SimHQ Air Combat Corner. MiG data: Soviet Technical Description Book 1 (1953) + flight manuals; USAF 1953–54 evaluation narratives as validation targets.

Adversarially reviewed 2026-07-16 by four Claude lenses (coherence, feasibility, domain accuracy, game design) + Codex (gpt-5.6-sol): 1 data-provenance blocker, ~14 majors folded into this revision; full findings in the conversation record.
