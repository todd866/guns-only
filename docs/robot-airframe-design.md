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

## Not in scope

Player-flyable robot, swarm behavior, and datalink/EW flavor — later. One honest airframe and
one ladder slot first.

## Build order

1. F-22 high-alpha build lands (q-limited allocation, CN/CA schedules) — in flight.
2. `AircraftParams` for the UCAV surrogate + corridor tests (sustained-G at corner, no-physio
   invariants, engine-out authority collapse).
3. `PilotSkill.Machine` + profile + `bandit_skill` token + ladder wiring behind the flagship.
4. Balance pass in the duel harness (enemy max-continuous-window ladder must extend
   monotonically past Ace) before any production exposure.
