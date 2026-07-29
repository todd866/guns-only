# 95 — Cost ledger

← [90 — Failure modes](90-failure-modes.md) · Back to [README](README.md)

*Consequence of CMC hot structure ([20](20-thermal-and-materials.md)) and duct-dominated body
([30](30-propulsion-and-inlet.md)). Numbers are **surrogate order-of-magnitude**, not a bid.*

## Flyaway (surrogate)

| Line | Order | Basis |
| --- | --- | --- |
| Structure (CMC hot + composite cold) | ~$5–6M | CMC premium vs stainless counterfactual |
| TBCC core + duct + inlet | ~$2–3M | single stream, no TVC |
| Avionics / opaque sensor spine / FBW | ~$0.8–1.2M | reclined capsule, no HUD glass boat |
| Escape pod / seat / life support | ~$0.4–0.6M | |
| **Flyaway class** | **~$9M** | Matches `FlightModel` class comment |

**Stainless counterfactual (refused):** ~$4–5M flyaway class, dies at M4-class stagnation — incoherent
with the CMC freeze. Do not cost the product as stainless.

## Consumables / life (provisional)

| Item | Note |
| --- | --- |
| Fuel | Alert 3,600 LB (raised from 3,100 when design gross absorbed the drone bay); ram burn still lever-modelled (open finding) |
| Ownship ammo | 480 rounds — negligible $ vs fuel |
| Structural life | Hard 12/15 G pulls eat CMC life; ~2% life @ ~$180k was the comment's pricing sketch |
| Gun-drone attrition | Four × attritable fighterettes; reuse only if quiet-strip pickup closes |

## Infrastructure (per lane, not per airframe)

Buried gallery earthworks, 520 m strip, 35 MJ arrestor, catapult — **per basing lane**. Amortise
across the alert inventory, not into flyaway.

## Epistemic

~$9M flyaway class **surrogate**. Itemised rows above are Phase 2 sketch for planning — not a
contract cost. Per-sortie $ remains open until fuel model is instrument-true.
