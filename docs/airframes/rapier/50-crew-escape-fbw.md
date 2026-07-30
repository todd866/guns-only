# 50 — Crew, escape, FBW

← [40 — Mass and CG](40-mass-and-cg.md) · Next: [60 — Armament and drones](60-armament-and-drones.md)

*Systems chapter. This follows from the thermal and structural decisions in
[20](20-thermal-and-materials.md) and [00](00-mission-and-ops.md) — it does not introduce new
freezes of its own.*

**Controlling owner direction, 2026-07-30:** the fully reclined capsule is completely buried inside
the forward centrebody. There is no cockpit bump, windscreen, canopy, transparency or direct-view
panel. The checked-in raised `escapePodSpine` is superseded. Normal access, emergency rescue and
the proposed flush structural hatch/couch-sled architecture are developed in
[51 — Crew ingress, egress, and rescue](51-crew-ingress-egress-and-rescue.md).

## Why no windscreen

CMC hot structure and Mach-4 stagnation heating make a transparency a liability, not a feature (see
[20 — Thermal and materials](20-thermal-and-materials.md)). The occupant rides reclined inside an
opaque composite escape pod buried under the continuous outer skin; sensors and automation fly the
aircraft and present the outside world. The pod is a sealed shell, not a canopy over a
cockpit—pressure vessel and escape capsule are the same object.

## Structural limit and the reclined thesis

`PositiveStructuralLimitG: 12.0`, `PositiveOverrideLimitG: 12.0` (**closed**, `FlightModel.RapierPublicDataSurrogate`).
Those numbers are structural/control ceilings, not promised load factor everywhere in the envelope:
dynamic pressure and the Mach-scheduled lift curve bind first in the FL700 dash. Where sufficient
aerodynamic authority exists, structure binds before an upright, hydrostatic-limited pilot would.
`PilotPhysiologyProfile.RapierReclinedInterceptor` carries the reclined-occupant physiology
assumption — **this bible does not re-derive that physiology model**, it only asserts that the
airframe's structural ceiling must not be silently capped back down to an upright pilot's limit.
Keep that dependency visible: if the physiology model changes, this chapter's assumption should be
re-checked, not assumed unaffected.

At FL720/M3.5 and design gross, the current provisional wing has only about **2.6 G at its physical
attached-flow break**; ordinary normal-law incidence is lower. The +12 G placard therefore does
not describe an upper-atmosphere turn. See
[12 — Aerodynamics and control allocation](12-aerodynamics-and-controls.md).

## FBW: keyboard flyability is fiction of the same thesis

Firm bank-hold FBW (`RollHoldRateGainNms` 1.2e6, **surrogate** gain — see `FlightModel.cs`) plus
narrow gunnery aim assist together make a keyboard-and-mouse interface plausible for a Mach-4
interceptor: the occupant issues coarse intent, the machine holds attitude and helps aim. FBW and aim
assist do not create lift, thrust, or hits by themselves — they remove the human-interface burden
that a reclined, non-stick-and-rudder occupant could not otherwise clear.

The controller now allocates Rapier moments against `q·S·length·coefficient` capacity. Bank hold
cannot apply a fixed 1.2 MN·m gain through zero q; cold-gas RCS supplies the residual demand in the
lob and consumes gas on all three axes. Symmetric landing elevon droop consumes pitch/roll travel.

## Escape pod jettison — provisional

> **provisional / interface only.** There is no closed jettison sequence, separation dynamics, or
> recovery method for the escape pod in this bible. It exists as an interface (a pod that can, in
> principle, separate from the airframe) until a mission beat needs it to be more than that. Do not
> author a survival-rate number, a chute deployment envelope, or a jettison-Mach limit here without
> first closing this open item.

## Power / avionics — qualitative only (Phase 2 closes watts)

Driven by: distributed flush sensors and buried capsule, FBW, environmental conditioning for drone
cells, cold-gas RCS storage
(see [30 — Propulsion and inlet](30-propulsion-and-inlet.md)), and clinical capsule displays (cold
instruments vs the soft outside world — ADR-0003). **Phase 1 states interfaces only; Phase 2 closes
a power budget table.** Do not publish a watt figure in this chapter until that table exists.

## Epistemic

Structural ceiling and FBW gain constants referenced here are **closed**/**surrogate** and pulled
from `FlightModel.cs`. Escape jettison, physiology model internals, and power watts are explicit
**provisional** / not-yet-started items — see `icds/fbw-crew.md` for the interface boundary this
chapter shares with the physiology and control-law model.
