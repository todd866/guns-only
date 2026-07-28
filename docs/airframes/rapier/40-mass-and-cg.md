# 40 — Mass and CG

← [30 — Propulsion and inlet](30-propulsion-and-inlet.md) · Next: [50 — Crew, escape, FBW](50-crew-escape-fbw.md)

## Closed mass statement

| Item | Mass | Note |
| --- | --- | --- |
| Fuel-free | **5150 kg** | Structure, systems, pod, empty tanks |
| Max fuel | **4500 kg** (~9920 lb) | Capacity |
| Gross | **9650 kg** | `MassKg` |
| Fuel fraction | **~47%** | Was 34% (fighter fraction) — too short for interceptor leg |
| Alert launch fuel | **3100 lb** (~1406 kg) | Intercept beat: narrow trap reserve, not free cruise |
| Bingo / min / emerg | 1000 / 600 / 300 lb | Doctrine thresholds |

Grounded in `FlightModel.RapierPublicDataSurrogate` (`MassKg: 9650.0`, `FuelFreeMassKg: 5150.0`) and
`Doctrine.Beats.RapierIntercept` (alert fuel 3,100 lb, bingo 1,000 lb).

SR-71-class fraction is ~59%; 47% is "what this profile needs," not mimicry.

## Why the weight is affordable

Every landing is an **automation-assisted trap**. Launch heavy off the catapult; arrive light. Gear
and wire see **recovery weight**, not cat gross (see [70 — Landing gear, arrest](70-landing-gear-arrest.md)).
That single basing choice unlocks interceptor fuel fraction on a small airframe.

Cat end speed ~110 m/s remains ~1.5+ Vs at gross — flying off the rail, not clinging.

## Wing loading and "G"

436 kg/m² at cat mass: **cruise wins**. Instantaneous structural G (12 qualified / 15 override) is
for the dive pass, not for a turning war at altitude. Opponent doctrine: survive the pass, then hunt.

## CG / stores (provisional where unclosed)

| Condition | CG intent |
| --- | --- |
| Empty | forward of aft duct mass; spine/crew mid-forward |
| Alert fuelled | fuel stations keep CG in FBW envelope |
| After drone release | aft/mid belly −1440 kg · CG shifts forward/up (order-of-magnitude) |
| Near bingo | light, recovery CG |

Ownship ammo (480 rounds): second-order. Gun-drone load: **preferred four cells** (trade C) at
**1440 kg** stowed — see [60](60-armament-and-drones.md). That mass is **not yet** in
`FlightModel.MassKg` (open finding / optimistic OFT).

Inertias in params (`Ixx` 9.5e3, `Iyy` 6.2e4, `Izz` 6.8e4) are geometry-derived for the ~13 m / 7.3 m
/ ~7.85 t class — keep consistent with any future OML revision.

## Epistemic

Mass statement, fuel fraction, and doctrine thresholds are **closed**. CG travel after drone release
and the drone/ammo mass contribution are **provisional** — named here so Phase 2's drone-packaging
trade (see `docs/rapier-gun-drone-system.md` and `icds/gun-drone-carriage.md`) has a place to close
them without silently overwriting this table.

