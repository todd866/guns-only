# 95 — Cost ledger

← [90 — Failure modes](90-failure-modes.md) · Back to [README](README.md)

*Systems chapter — consequence of the CMC hot structure and duct-dominated body chosen in
[20](20-thermal-and-materials.md) and [30](30-propulsion-and-inlet.md).*

## What is closed

Flyaway assumes the CMC premium, not a stainless counterfactual: the airframe class comment in
`FlightModel.RapierPublicDataSurrogate` puts the aircraft at roughly a **$9M-class** flyaway once CMC
hot structure is priced in (~2% structural life at ~$180k premium contributes to that figure — see
[20 — Thermal and materials](20-thermal-and-materials.md)). **Stainless is a "aircraft we refused"
counterfactual row, not the product** — do not cost this airframe as if it were the retired stainless
story.

## What is not closed

> **provisional — Phase 2 closes this table.** There is no itemised flyaway breakdown (airframe
> structure, engine, avionics/sensor spine, escape pod, CMC hot-section premium as its own line),
> no per-sortie consumable costing (fuel, ammunition, structural-life consumption from a hard pull),
> and no infrastructure ledger (launch tube earthworks, catapult, arrestor installation — these are
> per-lane infrastructure, not per-sortie or per-airframe cost, per
> [80 — Basing and ground](80-basing-and-ground.md)). Do not publish a per-round, per-pull, or
> per-sortie dollar figure in this chapter until it is derived from `AircraftParams` or a sibling
> cost record, not asserted here first.

## Epistemic

The ~$9M-class flyaway order of magnitude and the "CMC not stainless" cost story are **surrogate**
(grounded in the airframe-class comment in `FlightModel.cs`). An itemised ledger, per-sortie
consumable costing, and infrastructure amortisation are **open findings** — Phase 2 work, not
Phase 1.

