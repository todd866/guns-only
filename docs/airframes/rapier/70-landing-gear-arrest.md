# 70 — Landing gear, arrest

← [60 — Armament and drones](60-armament-and-drones.md) · Next: [80 — Basing and ground](80-basing-and-ground.md)

*Systems chapter. The mass rationale (launch heavy, recover light) is established in
[40 — Mass and CG](40-mass-and-cg.md); this chapter covers the launch and recovery hardware that
makes that rationale true.*

## Catapult (closed geometry)

- **520 m rail stroke**, ~110 m/s end speed, **433.86 m** flat gallery + **86.14 m** arc to
  **12°**, radius **411.29 m**, rise **8.99 m** at 3 G rail normal.
- Angle chosen from the aircraft's capability and pilot/structure load, not from terrain — see
  `docs/2026-07-26-buried-launch-tube-and-the-ukraine-theatre.md` for the full derivation (12° is the
  same angle Kuznetsov and Invincible use; the jet itself sustains a far steeper climb, so the arc,
  not the engine, sets the number).
- Handoff support plane: rail head 0.15 m + `RampRiseM` 8.99 m +
  `AirborneHeightM` 4.0 m ≈ **13.14 m above the slab**. The aircraft reference is another
  provisional 0.85 m above its loaded support plane, ≈ **13.99 m above the slab**.

The 360 m flat + 160 m arc, 765 m radius, and 16.7 m rise were the superseded **150 m/s**
study. Applying them to the live 110 m/s launcher is physically inconsistent.

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

> **provisional.** The live kernel uses an explicit 0.85 m aircraft-reference-to-loaded-support
> height consistently for launch and fixed-strip recovery. Detailed gear geometry (strut travel,
> tyre/wheel sizing, arresting hook engagement
> envelope) is not closed in this bible. The ~12–15 MJ recovery energy requirement itself is hand
> arithmetic from the buried-tube design record, not yet checked against the flight integrator. Do
> not state a closed *requirement* number here until that estimate is integrator-verified — the
> arrestor's own rating, 35 MJ, is closed.

## Epistemic

Catapult stroke, speed, and ramp geometry are **closed** (grounded in `CatapultLaunchModel` and the
buried-tube design record). The arrestor's rated energy (35 MJ) is **closed**, grounded in
`sim/ArrestmentCapabilityProfile.cs`. The 0.85 m support/reference height, landing gear detail,
and the recovery energy *requirement*
estimate are **provisional / open finding** — the strip itself is named provisional in the sim
(`ProvisionalRapierLandStrip`).
