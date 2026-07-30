# 95 — Cost ledger

← [90 — Failure modes](90-failure-modes.md) ·
[force economy](../../air-war-economy-and-force-management.md) · Back to [README](README.md)

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
| Cold-structure mechanical life | Depends on the full load spectrum, dynamic pressure, mass/configuration, reversals, damage, and inspection—not peak G or sortie count alone |
| CMC hot-shipset life | Local peak temperature, gradient, dwell, thermal cycles, oxidation/coating, impact, attachment, and joint history; independent of cold-shell mechanical life |
| Propulsion life | Turbine starts/cycles/hours and ram hot-kit cycles/dwell/exceedances are serialized separately and exchanged or overhauled |
| Launch/recovery life | Launch impulse, touchdown sink/side load, hook load, arrest energy, and bolter history accrue to their fittings and structure |
| Capsule and rotables | Pressure/calendar/escape-system lives and component histories survive transfer between shells |
| Gun-drone attrition | Four × attritable fighterettes; reuse only if quiet-strip pickup closes |

## Lifecycle charging (provisional)

The former `$9M × 2% = $180k` line is rejected as circular whole-aircraft accounting. A completed
sortie receives no flat life charge. The planning equation is:

```text
fuel + ammunition + lost stores
+ inspections and maintenance performed
+ confirmed repair, replacement, and combat loss
- confirmed salvage credit
```

Raw exposure, modelled damage, approved limit, maintenance state, and cost remain separate. A hard
pull may eventually order an inspection before residual strength or cost is known. A cool,
low-load balloon mission is expected to record lower exposure in several channels than a full-hot,
high-load profile, but receives no damage fraction or cost until `SME-v0` and the assessment models
exist.

Replacement value multiplied by an uncertainty-bounded damage estimate may appear in a separate
reserve scenario. It is never booked as actual sortie cost before inspection, repair, replacement,
loss, or an evidence-backed accounting rule makes the cost real.

No valid per-sortie life amortisation can yet be calculated. The physical mission mix, `SME-v0`
reference spectrum, qualified component lives, inspections, repair yield, rotables, and recovered
value must exist first.

[85 — Service life, maintenance, and telemetry](85-service-life-maintenance-and-telemetry.md)
defines the controlling component ledger, inactive 50/250/500/1,000 severe-equivalent programme
labels, and telemetry boundary.

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
planning studies—not contract costs. Per-sortie cost remains open until fuel is instrument-true
and component life, maintenance, repair, and salvage models are evidence-backed.
