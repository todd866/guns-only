# 95 — Cost ledger

← [90 — Failure modes](90-failure-modes.md) · Back to [README](README.md)

*Consequence of CMC hot structure ([20](20-thermal-and-materials.md)) and duct-dominated body
([30](30-propulsion-and-inlet.md)). Numbers are **surrogate order-of-magnitude**, not a bid.*

## Flyaway (surrogate)

| Line | Order | Basis |
| --- | --- | --- |
| Structure (CMC hot + composite cold) | ~$5–6M | CMC premium vs stainless counterfactual |
| TBCC core + duct + inlet | ~$2–3M | single stream, no TVC |
| Avionics / distributed opaque sensors / FBW | ~$0.8–1.2M | buried reclined capsule; no windscreen or glass cockpit |
| Escape pod / seat / life support | ~$0.4–0.6M | |
| **Flyaway class** | **~$9M** | Matches `FlightModel` class comment |

**Stainless counterfactual (refused):** ~$4–5M flyaway class, dies at M4-class stagnation — incoherent
with the CMC freeze. Do not cost the product as stainless.

## Consumables / life (provisional)

| Item | Note |
| --- | --- |
| Fuel | Alert 3,600 LB (raised from 3,100 when design gross absorbed the drone bay); ram burn still lever-modelled (open finding) |
| Ownship ammo | 480 rounds — negligible $ vs fuel |
| Structural life | Hard 12 G pulls still consume CMC life; no over-limit repeatability is granted without a residual-strength/fatigue model |
| Gun-drone attrition | Four × attritable fighterettes; reuse only if quiet-strip pickup closes |

## Infrastructure (per lane, not per airframe)

Buried gallery earthworks, **520 m launcher**, 1,200 m recovery surface, 35 MJ arrestor, utilities,
and support works are **per basing lane**. Amortise them across the alert inventory, not into
flyaway.

[82 — Launch-gallery engineering basis](82-launch-gallery-engineering-basis.md) carries the
documented Class 4/5 2026-USD assumptions:

| Scope | Concept planning range | Exclusions/status |
| --- | ---: | --- |
| Gallery + electromagnetic catapult | **$130–430M** | low-definition parametric study; not a bid |
| Complete basing lane | **$190–650M** | adds recovery surface, arrestor, revetments, utilities, support areas |

The ranges exclude land, aircraft, off-site generation/transmission, extraordinary ground or
groundwater, defined-threat combat hardening, wartime logistics, and post-2026 escalation. Burial is
not a costed guarantee against cratering.

## Epistemic

~$9M flyaway class **surrogate**. Itemised rows above and the linked infrastructure ranges are
planning studies — not contract costs. Per-sortie $ remains open until fuel model is
instrument-true.
