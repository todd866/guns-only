# Robot airframe: the post-Ace ladder tier

*2026-07-23. Direction from the pilot-user: "we eventually need to add a robot airplane with
higher G-limits and no physiological limitations." Design anchor; implementation follows the
F-22 high-alpha flight-model build (its q-limited control allocation is a prerequisite for an
airframe whose whole identity is the corners of the envelope).*

## What it is

An uncrewed opponent tier above Ace for the continuous-combat ladder: a UCAV surrogate whose
advantage is not smarter BFM but a wider physical envelope, honestly simulated.

- **No pilot physiology.** The kernel already parameterizes physiology per actor
  (`pilot_physiology_profile_id`, and the player's own "machine" precedent:
  `systems.modern-airborne.not-simulated.v1`). The robot flies sustained 12–15 G with zero
  G-LOC, zero AGSM decay, zero vision narrowing. The PLAYER still has all of those — that
  asymmetry IS the fight.
- **Airframe params, not cheats.** A distinct `AircraftParams` set: structural limit ~15 G,
  higher CLmax margin, thrust class below the F-22 (a drone trades engine for expendability) —
  it out-turns you and out-lasts you at corner, you out-accelerate and out-climb it. All through
  the same 6DOF kernel; no kinematic shortcuts (house rule).
- **Skill plumbing.** `PilotSkill.Machine` above Ace in `BanditSkillProfile` (lookahead horizon
  ~180 ticks, MaxAcquireG from the airframe, FireConeDeg 3.0 — machine discipline), fielded by
  `ForEngagement` once the performance-based ramp replaces the interim curve, or as the flagship
  gauntlet's climax wave.
- **Teaching goal (adaptive-teacher frame).** The robot punishes rate-fight habits and rewards
  energy tactics: you cannot win a circle against it, so the lesson is vertical fighting, energy
  sanctuaries, and one-pass discipline. Debrief should say so explicitly.

## Status (2026-07-23, machine-spike build)

Implemented as a **FightDirector spike flavour**, not a fixed ladder rung: `PilotSkill.Machine`
+ `FlightModel.UcavInterceptorSurrogate` (15 G structural, CLMax 1.70, thrust class ~0.59 T/W,
no TVC claim), served when the spike trigger fires AND the learner's **energy band is strictly
the weakest axis** — the machine is deliberate practice for the exact player it punishes.
`EnergyRetentionWeight 0.45` makes it spend smash for angles through the ordinary lookahead;
the same aero that grants its corner melts ~13 kt/s holding it, so the vulnerability window is
physics, not scripting. Corridor tests: `sim.Tests/MachineBanditTests.cs` (15 G reachable in
the fight band, sustained-pull energy collapse, ladder-monotonic solution seconds past Ace,
spike-flavour selection, bit determinism).

## Become the machine (design sketch — approved direction, not yet built)

Pilot-user direction (2026-07-23): *"if you get gunned by one then maybe you become the thing
you can't kill otherwise."* The honesty story writes itself: the player's G boundary was always
the body aboard — flying a **captured machine remotely** removes the body, so the player pulls
the same honest 15 G with zero G-LOC, and learns the machine's weakness from inside it.

- **Capture, not reward-for-dying.** Dying to the machine must not be the unlock (perverse
  incentive: players feed themselves to it). Gate the capture on having fought it WELL before
  losing — e.g. survived its first commit window, or forced N overshoots — and frame it as
  salvage/telemetry capture in the debrief.
- **A bounded loan, not a permanent airframe.** One sortie (or one gauntlet segment) in the
  machine, then back to the jet. It is a lesson and a release valve, not a new main.
- **What you fight as the machine** is the dominance display inverted: ordinary human tiers you
  now execute — and the energy lesson lands from the other side when YOU stall out of a 15 G
  cone and get gunned by a Competent who kept their smash.
- **Touches:** player airframe swap at staging, physiology profile swap (the remote pilot needs
  the existing `systems.modern-airborne.not-simulated.v1`-style machine precedent), progression
  persistence, HUD labelling. Own spec + plan when picked up.

## Not in scope

Swarm behavior and datalink/EW flavor — later.

## Build order

1. F-22 high-alpha build lands (q-limited allocation, CN/CA schedules) — in flight.
2. `AircraftParams` for the UCAV surrogate + corridor tests (sustained-G at corner, no-physio
   invariants, engine-out authority collapse).
3. `PilotSkill.Machine` + profile + `bandit_skill` token + ladder wiring behind the flagship.
4. Balance pass in the duel harness (enemy max-continuous-window ladder must extend
   monotonically past Ace) before any production exposure.
