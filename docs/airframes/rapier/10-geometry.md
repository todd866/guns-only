# 10 — Geometry

← [00 — Mission and flight regime](00-mission-and-ops.md) ·
Next: [11 — Visual identity and buried crew capsule](11-visual-identity-and-buried-capsule.md) ·
Related: [13 — Directional stability and tail trade](13-directional-stability-and-tail-trade.md)

Geometry follows from the regime in [00](00-mission-and-ops.md): a fast pass and a trap, not a
sustained turning fight, sized around a duct-dominated body rather than a fat fighter fuselage.

## Envelope (closed — from mesh + params)

| Quantity | Value | Derivation / rationale |
| --- | --- | --- |
| Length | **13 m** | Fuselage loft `z ∈ [-6.5, 6.5]`; sensor fuselage name |
| Span | **7.35 m** | `WingSpanM = sqrt(AR 3.0 × 18 m²)`; planform tip ±3.675 m |
| Wing area | **18.0 m²** | High wing loading by choice |
| Rendered solid planform | **24.3173 m²** | Mesh polygon including body carry-through / overlap |
| Non-reference residual | **6.3173 m²** | Named body-overlap geometry; not lift area |
| Aspect ratio | **~3.0** | Low-AR supersonic wing; `CLAlpha` 3.60 |
| Wing loading @ cat mass | **~436 kg/m²** | Cruise / dash beats low-speed sustained turn |
| Frontal / duct | **duct-dominated** | `RamCaptureAreaM2 = 1.9` (1.55 m) — the aircraft is substantially inlet, D-21-like. Grown from 1.2 m² when M4 proved unreachable at max weight on the old duct; there is no canopy or cockpit bump to package around, so the capture is limited by aerodynamics and mass, not by seating a pilot. |

## Why this planform

- **High wing loading.** The fight is a fast pass and a trap, not a sustained dogfight. Instantaneous
  G exists in a **fast, low box at the bottom of a dive**; after that the aircraft is slow, low, and
  out of ideas — by design.
- **Thin sharp wing.** `MCrit` 0.94, wave-drag peak ~M1.18, `WaveDragK` 20 — the transonic rise is
  real but meant to be **pushed through**, not used as a wall (contrast subsonic siblings walled at
  ~M0.85).
- **Area-ruled body.** `CD0` 0.0175, `InducedK` 0.105 — slender OML, small high-speed wing;
  the presentation loft is a pinched ellipse sequence, not a fat fighter fuselage.
- **Directional-control solution + tip accents.** Directional stability and yaw control remain
  requirements; the current enormous twin-fin polygon is a visual surrogate, not an aerodynamic
  sizing result. Fin count and geometry are reopened in [13](13-directional-stability-and-tail-trade.md).
  Accents are readability, not stores.

## Inlet / nozzle placement (from `createRapier`, mesh frame)

| Feature | Placement (mesh frame) | Why |
| --- | --- | --- |
| Blended ventral inlet | ring ~r 0.29–0.55 at `(0, −0.22, −3.72)`, scaleY 0.72 | Single capture for TBCC; keep duct below the forward centrebody/capsule package |
| Propulsion tunnel | loft under belly −3.68 → 6.1 | Continuous core-bypass path; one nozzle |
| Exhaust | torus r~0.34 at `(0, −0.10, 6.12)` | Aft hot zone; CMC fairing |
| Buried opaque crew capsule | inside the forward centrebody, no canopy or exterior bump | Owner direction; current raised `escapePodSpine` is superseded pending synchronized geometry revision |

**Frame convention (closed):** the Three.js Rapier space uses +Z aft (nose toward −Z). The capture
kit documents this as `frameConvention: "threejs-createRapier-v1"` so plates and JSON do not flip the
aircraft. See `docs/airframes/README.md` for how the definition captures this.

## Planform seed (authoritative — closed)

```text
[0,-3.8], [-0.74,-3.1], [-3.675,0.05], [-3.48,0.92],
[-1.04,0.46], [-0.72,3.5], [0,4.05], [0.72,3.5],
[1.04,0.46], [3.48,0.92], [3.675,0.05], [0.74,-3.1]
```

Thickness / camber params match `createPlanformGeometry(..., 0.16, 0.044)`. Fuselage and tunnel loft
stations copy `createRapier` exactly in Phase 1 — geometry first principles are already encoded
there; the capture kit freezes them, it does not re-derive them.

The solid polygon and aerodynamic S are deliberately different. See
[12 — Aerodynamics and control allocation](12-aerodynamics-and-controls.md) for the force/moment
contract and why the 6.3173 m² residual must never silently become additional wing reference area.

## Gallery clearance check (basing ↔ geometry)

Span 7.35 m in a 14×8 m bore ⇒ **~2.7% blockage** — deliberate: bore size beats vacuum (see
[80 — Basing and ground](80-basing-and-ground.md) and `icds/basing-arrest.md`). Geometry must not
grow span without revisiting the launcher.

## Epistemic

The 13 m length, 7.35 m span, 18 m² aerodynamic reference area, authored wing planform, inlet and
nozzle are the controlling closed starting constraints tied to concrete repo constants
(`FlightModel.RapierPublicDataSurrogate`, `createRapier` in `scene_builders.js`,
`TurboRamjetPerformanceMap.RamCaptureAreaM2`). Local centrebody/capsule and tail geometry are
**reopened**: the checked-in definition still contains the superseded raised spine and an unsized
twin-fin surrogate. This chapter remains readable without the JSON Airframe Definition; the
definition records the current implementation and must now be revised with the engineering
evidence, not treated as authority against the newer owner direction.
