# 15 — Structure and build

← [10 — Geometry](10-geometry.md) · Related: [blueprints/](blueprints/README.md)

How the closed OML becomes a physical article. Detail lives on plates **00, 11–12, 18–20**; this
chapter states the build rules.

## Rules

1. **OML is law.** Loft stations and planform are closed. Internals move; the skin does not grow
   without a definition + gallery revision.
2. **Load paths.** Catapult → NLG/keel → longerons → wing carry-through → spar. Hook → keel →
   FS+2.9/+5.55. Gear → frames → longerons. Never through the CMC duct liner.
3. **Hot vs cold.** CMC owns LE, lip, duct, nozzle. Composite owns everything else. Isolate fasteners
   across the hot/cold boundary (plate 20).
4. **Mass.** Module BOM (plate 00) must sum to **5150 kg** fuel-free. Stowed drones (+1440 kg) are a
   separate load state — not yet in `FlightModel.MassKg`.
5. **Mate order.** Plate 19. Duct sealed before spine; wings after spine; fins last.

## Primary structure (provisional)

- Four longerons (upper/lower × left/right) from forward bulkhead to aft frame.
- Bulkheads at loft stations (plate 03 / 11).
- Carry-through box roughly z ∈ [−1.0, +1.5] m.
- Twin-fin posts on aft fuselage.

## Acceptance before “built”

| Check | Source |
| --- | --- |
| Span 7.35 · length 13 · capture 1.2 | plates 01/04 · JSON |
| Empty mass ≈ 5150 kg | plate 00 · FlightModel |
| Gallery fit 14×8 | plate 10 |
| FBW BIT + hook drop + bay doors | plate 19 gates |
| No acceptance on Mach-4 sustain or wet T/W ≤1.20 until sim matches | plate 09 · realism audit |

## Epistemic

Build *process* is provisional; OML and basing interfaces are closed. Claiming “we did realism”
requires the soft performance items to leave the fiction/provisional columns — blueprints alone do
not finish that job, but they are required before the claim.
