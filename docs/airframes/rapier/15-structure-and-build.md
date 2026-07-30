# 15 — Structure and build

← [10 — Geometry](10-geometry.md) · Related: [blueprints/](blueprints/README.md)

How the controlling OML becomes a physical article. Detail lives on plates **00, 11–12, 18–20**;
this chapter states the build rules. The wing planform and principal envelope remain the starting
constraints; the forward centrebody/capsule access and tail are reopened and may not be described
as frozen until their coordinated definition revision lands.

## Rules

1. **OML changes are controlled.** Wing planform and principal dimensions remain closed starting
   constraints. The raised `escapePodSpine` is superseded by the buried-capsule direction, and the
   current fins are unsized. Those local changes require one definition + structure + gallery +
   mass/CG revision; concept art alone cannot move the skin.
2. **Load paths.** Catapult → NLG/keel → longerons → wing carry-through → spar. Hook → keel →
   FS+2.9/+5.55. Gear → frames → longerons. Never through the CMC duct liner.
3. **Hot vs cold.** CMC owns LE, lip, duct, nozzle. Composite owns everything else. Isolate fasteners
   across the hot/cold boundary (plate 20).
4. **Mass.** Module BOM (plate 00) must sum to **5150 kg** airframe fuel-free. Published
   `FuelFreeMassKg` / `MassKg` add the design **+1440 kg** bay; session sheds on release.
5. **Mate order.** Plate 19 currently seals the duct before centrebody closure, mates wings after
   the capsule zone closes, and installs the tail last. The sequence is provisional until capsule
   ingress/removal and the removable propulsion-module split prove maintainability.

## Primary structure (provisional)

- Four longerons (upper/lower × left/right) from forward bulkhead to aft frame.
- Bulkheads at loft stations (plate 03 / 11).
- Carry-through box roughly z ∈ [−1.0, +1.5] m.
- Aft directional-control attachment structure sized only after the tail trade selects an
  architecture; current twin-fin posts are a provisional topology.

## Acceptance before “built”

| Check | Source |
| --- | --- |
| Span 7.35 · length 13 · capture 1.2 | plates 01/04 · JSON |
| Empty mass ≈ 5150 kg | plate 00 · FlightModel |
| Gallery fit 14×8 | plate 10 |
| FBW BIT + hook drop + bay doors | plate 19 gates |
| No acceptance on Mach-4 sustain or wet T/W ≤1.20 until sim matches | plate 09 · realism audit |

## Epistemic

Build *process* is provisional; the principal envelope, wing planform and basing interfaces are the
closed starting constraints. The centrebody/capsule cut-out and tail attachment are reopened.
Claiming “we did realism” requires those revisions and the soft performance items to leave the
fiction/provisional columns—blueprints alone do not finish that job, but they are required before
the claim.
