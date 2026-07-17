# Guns Only — Design Spec

*2026-07-16 · working title "Guns Only" (rename at will) · v2, revised after adversarial review (4 Claude lenses + Codex, 2026-07-16) · status: awaiting author review*

## 1. Vision

A flat-screen, laptop-native, **guns-only 1v1 jet dogfight** — F-86 Sabre vs MiG-15 over Korea — flown on a **full aerodynamic model** through a novel **doctrine-detent keyboard control scheme**, presented as a **sight fight** (padlock done right), and debriefed like a real sortie.

**One sentence:** the vibes of dogfighting a jet, on the machine you already own, with no joystick, no switchology, and no missiles.

**Product hypothesis (evidenced, not proven — see `docs/research/2026-07-16-prior-art-survey.md`):** a guns-only pure-BFM game with an honest energy model exists and is loved in VR (Virtual Fighter Maneuvers, 95% positive on a small review base). The survey found no flat-screen equivalent: no shipped game combines a real energy model + guns-first BFM + a first-class flat-screen camera answer. This project combines them, and adds two things the survey found nowhere: a non-cheating doctrine-driven AI and a control scheme designed for a laptop rather than ported to one.

### Design pillars (tie-breakers for every future decision)

1. **The physics never lies.** Player and AI fly the same model; energy is never faked; the sight is honest.
2. **Delegate the stick-waggling, never the decisions.** Automation handles execution precision; every tactical choice — pursuit geometry, the forks, the shot — belongs to the player. Operational test: **if the debrief would annotate it as a choice, the detent may never make it.**
3. **Losing sight must be scary — for both pilots.** The sight fight is the emotional core; no magic sensors on either side of the merge.
4. **The whole fight, nothing but the fight.** Merge → BFM → guns → debrief. Anything that isn't that is out.
5. **Anti-study-sim.** Zero mandatory switchology. If a control exists, it matters in the fight.

## 2. Non-goals (v1)

- No missiles, ever (identity, not scope).
- No campaign, no missions, no multiplayer, no VR, no HOTAS requirement (HOTAS may *work* later; it is never assumed).
- No clickable-cockpit systems depth: the only cockpit interactions are ones that matter mid-fight (sight ranging, cage/uncage, flaps/boards).
- No carrier ops, no takeoff/landing in v1 — fights start in the air.
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

## 4. Aircraft & era — one documented configuration each

Per review: "F-86E/F" is not one aircraft. The modeled pair is pinned:

- **F-86F-25/-30, "6-3" hard wing, J47-GE-27, A-4 sight + AN/APG-30 ranging radar, 1953 configuration, pilot wearing a G-suit.** (The 6-3 wing was introduced specifically to close the MiG's high-altitude advantage; NACA found it retains moderate pitch-up — that goes in the tables, not under the rug.)
- **MiG-15bis, VK-1, ASP-3N sight (manual stadiametric ranging), 1953 configuration, no G-suit.** The G-suit asymmetry is historical and feeds the physiology model directly.
- CAC Avon Sabre as a possible heritage variant later (note: 2× 30mm ADEN — it inverts the gun asymmetry; a design job for that day, not this one).

The historical asymmetry is the game balance: the MiG owns the vertical (climb, ceiling, thrust-to-weight); the Sabre owns transonic handling, roll rate (hydraulically boosted controls — the very thing Soviet study of captured Sabres flagged to copy), and the gunsight. Neither jet has an afterburner; energy is earned.

Armament: Sabre 6× AN/M3 .50 (high rate, low per-hit damage) vs MiG 2× NR-23 + 1× N-37 (low rate, devastating hits, harder to land).

## 5. Flight Dynamics Model (FDM)

**Custom 6DOF rigid body, table-driven aerodynamics.** Force/moment coefficients vs alpha, beta, Mach, and control deflections; mass/inertia/fuel-burn; engine thrust vs Mach/altitude with spool dynamics.

- **Data provenance (corrected in review — the original claim was wrong):**
  - *Sabre:* NACA/NASA flight-test reports (buffet, maneuver time-histories, gun-tracking, lateral damping — abundant though scattered) + USAF flight-handbook performance charts.
  - *MiG:* the **published Soviet technical description** (*Самолет МиГ-15бис. Техническое описание, Книга 1 — Лётные характеристики*, 1953, freely available) + Soviet/Czech/Polish flight manuals. The 1953–54 **USAF evaluation of the defected airframe (Kadena / Wright-Patterson / Eglin — a USAF program; NACA never touched it and NTRS holds zero MiG-15 documents)** provides *validation targets*, not coefficients: snaking onset ≈ M0.86, buffet ≈ M0.91, pitch-up ≈ M0.93, ~M0.98 attained with roll-control loss. Exact staging resolved from primary documents during table authoring.
  - **This is parameter identification, not transcription:** digitize scattered charts (WebPlotDigitizer-class tooling), reconcile axis/reference/CG conventions, fill unpublished dimensions, tune free parameters against *declared fit-target* cards, validate against *held-out* cards. A **source-to-parameter coverage audit is the first FDM work item** — know what's measured, what's derived, what's `tuned` before authoring begins. Every gap-filled value is labeled `tuned` in the data files.
- **Compressibility is gameplay:** the MiG's staged transonic degradation vs the Sabre's controllable transonic dive must emerge from the tables.
- **Departures and spins:** post-stall table extensions and departure tendencies modeled. The MiG-15's spin record is genuinely vicious ("a flying booby trap" — Yeager; dozens of witnessed combat spin entries): recovery is modeled as **uncertain** — correct rudder-led inputs give a real chance, some entry modes are unrecoverable (eject), all of it labeled `tuned`. Departures are a weapon you force the other guy into precisely *because* the outcome is not guaranteed.
- **Physiology:** G-effects (grey-out → tunnel → blackout, onset-time behavior per IL-2's published physiology numbers as the starting point) hit the player's view/audio and the AI's *perception state* (§6). G-suit vs no-G-suit is a tolerance offset. Doctrine outputs are physiology-aware: **the coach never recommends a G that would black you out.**
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
