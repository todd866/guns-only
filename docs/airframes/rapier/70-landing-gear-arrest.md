# 70 — Landing gear, arrest

← [60 — Armament and drones](60-armament-and-drones.md) · Next: [80 — Basing and ground](80-basing-and-ground.md)

*Systems chapter. The mass rationale (launch heavy, recover light) is established in
[40 — Mass and CG](40-mass-and-cg.md); this chapter covers the launch and recovery hardware that
makes that rationale true.*

## Catapult (closed geometry)

- **520 m stroke**, ~110 m/s end speed, **360 m** flat gallery + **160 m** arc to **12°** ramp, rise
  ~16.7 m at 3 G rail normal.
- Angle chosen from the aircraft's capability and pilot/structure load, not from terrain — see
  `docs/2026-07-26-buried-launch-tube-and-the-ukraine-theatre.md` for the full derivation (12° is the
  same angle Kuznetsov and Invincible use; the jet itself sustains a far steeper climb, so the arc,
  not the engine, sets the number).
- Handoff at ramp top: `AirborneHeightM + RampRiseM` ≈ 20.7 m.

Full detail on the launch tube, gallery, and bore sizing lives in
[80 — Basing and ground](80-basing-and-ground.md) and `icds/basing-arrest.md`; this chapter's
concern is the aircraft-side gear and hook, not the tube.

## Recovery (provisional)

Hook recovery on a purpose-built land strip (`ProvisionalRapierLandStrip` — name itself flags the
status). Gear and arresting hook are sized for **recovery weight**, not catapult gross mass
(see [40 — Mass and CG](40-mass-and-cg.md)) — that is the design choice that makes the 47% fuel
fraction affordable at all.

`ArrestmentCapabilityProfile.ProvisionalRapierLandStrip` (`sim/ArrestmentCapabilityProfile.cs`) is
rated `ratedEnergyJ: 35_000_000.0` — **35 MJ (closed)**. That comfortably clears the buried-tube
design record's hand-estimated ~12–15 MJ recovery energy requirement, so there is **no arrestor
energy mismatch** for Rapier. (An earlier draft of this chapter incorrectly cited 10.8 MJ, which is
`ArrestmentCapabilityProfile.ProvisionalKoreaJet` — a different aircraft's profile, not Rapier's.)

> **provisional.** Gear geometry (strut travel, tyre/wheel sizing, arresting hook engagement
> envelope) is not closed in this bible. The ~12–15 MJ recovery energy requirement itself is hand
> arithmetic from the buried-tube design record, not yet checked against the flight integrator. Do
> not state a closed *requirement* number here until that estimate is integrator-verified — the
> arrestor's own rating, 35 MJ, is closed.

## Epistemic

Catapult stroke, speed, and ramp geometry are **closed** (grounded in `CatapultLaunchModel` and the
buried-tube design record). The arrestor's rated energy (35 MJ) is **closed**, grounded in
`sim/ArrestmentCapabilityProfile.cs`. Landing gear detail and the recovery energy *requirement*
estimate are **provisional / open finding** — the strip itself is named provisional in the sim
(`ProvisionalRapierLandStrip`).

