# ICD — Propulsion ↔ airframe

Interface control between the TBCC propulsion system ([30 — Propulsion and inlet](../30-propulsion-and-inlet.md))
and the airframe structure it lives inside ([10 — Geometry](../10-geometry.md),
[20 — Thermal and materials](../20-thermal-and-materials.md)).

## Closed interface points

| Interface | Value | Owner chapter |
| --- | --- | --- |
| Capture area | 1.2 m² (`RamCaptureAreaM2`) | [30](../30-propulsion-and-inlet.md) |
| Inlet placement | ring ~r 0.29–0.55 at `(0, −0.22, −3.72)`, mesh frame | [10](../10-geometry.md) |
| Exhaust placement | torus r~0.34 at `(0, −0.10, 6.12)`, mesh frame | [10](../10-geometry.md) |
| Skin thermal limit at hot-section boundary | 1473.15 K | [20](../20-thermal-and-materials.md) |
| Core SLS dry / augmentor | 85 kN / 1.55 | [30](../30-propulsion-and-inlet.md) |

The duct and nozzle fairings are CMC ([20](../20-thermal-and-materials.md)); the propulsion model
assumes that boundary survives its own exhaust and inlet thermal environment without a separate
active-cooling interface. No thrust-vectoring actuator crosses this interface (see
[30 — Propulsion and inlet](../30-propulsion-and-inlet.md), "Why no thrust vectoring").

## Open findings at this boundary

> **open finding.** Per-stream fuel: the propulsion model currently lets the turbine draw fuel while
> contributing no thrust, which understates the "idle the core, cruise on the duct" behaviour the
> airframe is built around. This is a propulsion-model gap, not an airframe-geometry gap, but it
> lives at this interface because the airframe's fuel tankage and CG assumptions
> ([40 — Mass and CG](../40-mass-and-cg.md)) implicitly assume the intended (not yet modelled)
> fuel story.

## Epistemic

Interface geometry and thermal limit are **closed**. Per-stream fuel accounting across this boundary
is an **open finding**.
