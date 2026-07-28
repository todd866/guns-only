# 40 — Mass and CG

← [30 — Propulsion and inlet](30-propulsion-and-inlet.md) · Next: [50 — Crew, escape, FBW](50-crew-escape-fbw.md)

## Closed mass statement

| Item | Mass | Note |
| --- | --- | --- |
| Airframe fuel-free | **5150 kg** | Structure, systems, pod, empty tanks |
| Design stowed drones | **1440 kg** | 4 × 360 kg gun-drone (trade C) |
| Fuel-free (published) | **6590 kg** | Airframe + design bay |
| Max fuel | **4500 kg** (~9920 lb) | Capacity |
| Gross (design) | **11090 kg** | `MassKg` |
| Fuel fraction vs airframe | **~47%** | Vs design gross ~41% |
| Alert launch fuel | **3600 lb** (~1633 kg) | Intercept beat: narrow trap reserve after design-bay climb burn |
| Bingo / min / emerg | 1000 / 600 / 300 lb | Doctrine thresholds |

Grounded in `FlightModel.RapierPublicDataSurrogate` (`MassKg` / `FuelFreeMassKg` include design bay)
and `Doctrine.Beats.RapierIntercept` (alert fuel 3,600 lb, bingo 1,000 lb). Session mass sync
uses actual `RapierDogfightingDronesRemaining` so clean / 2-drone / empty-bay launches are lighter.

SR-71-class fraction is ~59%; airframe-relative 47% is "what this profile needs," not mimicry.

## Why the weight is affordable

Every landing is an **automation-assisted trap**. Launch heavy off the catapult; arrive light. Gear
and wire see **recovery weight**, not cat gross (see [70 — Landing gear, arrest](70-landing-gear-arrest.md)).
That single basing choice unlocks interceptor fuel fraction on a small airframe.

Cat end speed ~110 m/s remains ~1.5+ Vs at gross — flying off the rail, not clinging.

## Wing loading and "G"

436 kg/m² was the clean-cat figure; design gross with four drones is **~616 kg/m²**.
**Cruise still wins.** Instantaneous structural G (12 qualified / 15 override) is
for the dive pass, not for a turning war at altitude. Opponent doctrine: survive the pass, then hunt.

## CG / stores (provisional where unclosed)

| Condition | CG intent |
| --- | --- |
| Empty | forward of aft duct mass; spine/crew mid-forward |
| Alert fuelled | fuel stations keep CG in FBW envelope |
| After drone release | aft/mid belly −1440 kg · CG shifts forward/up (order-of-magnitude) |
| Near bingo | light, recovery CG |

Ownship ammo (480 rounds): second-order. Gun-drone load: **preferred four cells** (trade C) at
**1440 kg** stowed — included in published `MassKg` / `FuelFreeMassKg`; shed on release.

Inertias in params (`Ixx` 9.5e3, `Iyy` 6.2e4, `Izz` 6.8e4) are geometry-derived for the ~13 m / 7.3 m
class and still approximately a ~8 t article — **provisional** vs 11 t design gross.

## Epistemic

Mass statement, fuel fraction, design bay load, and doctrine thresholds are **closed**. CG travel
after drone release remains **provisional** — named here so Phase 2 packaging trades can close
moments without silently overwriting this table.

