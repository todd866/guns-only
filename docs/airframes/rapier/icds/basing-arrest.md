# ICD — Basing ↔ arrest

Interface control between the aircraft (catapult shuttle interface, hook) and the ground
infrastructure ([70 — Landing gear, arrest](../70-landing-gear-arrest.md),
[80 — Basing and ground](../80-basing-and-ground.md)).

## Closed interface points

| Interface | Value | Owner chapter |
| --- | --- | --- |
| Catapult stroke / end speed | 520 m / ~110 m/s | [70](../70-landing-gear-arrest.md) |
| Rail geometry | 360 m flat + 160 m arc to 12°, rise ~16.7 m at 3 G | [70](../70-landing-gear-arrest.md) |
| Gallery bore vs aircraft span | 14 × 8 m bore, 7.35 m span ⇒ ~2.7% blockage | [10](../10-geometry.md), [80](../80-basing-and-ground.md) |
| Handoff height | `AirborneHeightM + RampRiseM` ≈ 20.7 m | [70](../70-landing-gear-arrest.md) |
| Arrestor rated energy | **35 MJ** (`ArrestmentCapabilityProfile.ProvisionalRapierLandStrip.RatedEnergyJ`) | [70](../70-landing-gear-arrest.md) |

Bore size is chosen to beat vacuum (generous clearance plus vents), not to seal tightly around the
airframe — this interface must not be re-optimised toward a tighter bore without re-deriving the
blockage/drag argument in [80 — Basing and ground](../80-basing-and-ground.md).

## Open findings at this boundary

> **open finding.** The land-strip arrestor's 35 MJ rating comfortably exceeds the buried-tube design
> record's hand-estimated ~12–15 MJ recovery energy requirement at Rapier's recovery weight — there is
> **no closed engineering mismatch** at this boundary. What remains open is that the ~12–15 MJ
> requirement itself is hand arithmetic, not yet checked against the flight integrator. (An earlier
> draft of this ICD incorrectly cited 10.8 MJ for the arrestor rating — that value belongs to
> `ArrestmentCapabilityProfile.ProvisionalKoreaJet`, a different aircraft's profile, not Rapier's.)
> Radius-of-action arithmetic that sizes how far the basing complex sits from the front (see
> [80](../80-basing-and-ground.md)) is separately hand calculation, not integrator-verified.
> `ProvisionalRapierLandStrip` is named provisional in the sim because gear geometry and the recovery
> requirement estimate remain open, not because its energy rating is in doubt.

## Epistemic

Catapult and gallery geometry, and the arrestor's rated energy (35 MJ), are **closed**. The recovery
energy *requirement* estimate and radius-of-action arithmetic are **open findings** pending
integrator verification.

