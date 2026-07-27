# 10 — Geometry

← [00 — Mission and flight regime](00-mission-and-ops.md) · Next: [20 — Thermal and materials](20-thermal-and-materials.md)

Geometry follows from the regime in [00](00-mission-and-ops.md): a fast pass and a trap, not a
sustained turning fight, sized around a duct-dominated body rather than a fat fighter fuselage.

## Envelope (closed — from mesh + params)

| Quantity | Value | Derivation / rationale |
| --- | --- | --- |
| Length | **13 m** | Fuselage loft `z ∈ [-6.5, 6.5]`; sensor fuselage name |
| Span | **7.35 m** | `WingSpanM = sqrt(AR 3.0 × 18 m²)`; planform tip ±3.675 m |
| Wing area | **18.0 m²** | High wing loading by choice |
| Aspect ratio | **~3.0** | Low-AR supersonic wing; `CLAlpha` 3.60 |
| Wing loading @ cat mass | **~436 kg/m²** | Cruise / dash beats low-speed sustained turn |
| Frontal / duct | ~duct-dominated | `RamCaptureAreaM2 = 1.2` — aircraft is substantially inlet, D-21-like |

## Why this planform

- **High wing loading.** The fight is a fast pass and a trap, not a sustained dogfight. Instantaneous
  G exists in a **fast, low box at the bottom of a dive**; after that the aircraft is slow, low, and
  out of ideas — by design.
- **Thin sharp wing.** `MCrit` 0.94, wave-drag peak ~M1.18, `WaveDragK` 20 — the transonic rise is
  real but meant to be **pushed through**, not used as a wall (contrast subsonic siblings walled at
  ~M0.85).
- **Area-ruled body.** `CD0` 0.0175, `InducedK` 0.105 — slender OML, small high-speed wing;
  the presentation loft is a pinched ellipse sequence, not a fat fighter fuselage.
- **Twin fins + tip accents.** Directional stability at altitude; accents are readability, not
  stores.

## Inlet / nozzle placement (from `createRapier`, mesh frame)

| Feature | Placement (mesh frame) | Why |
| --- | --- | --- |
| Blended ventral inlet | ring ~r 0.29–0.55 at `(0, −0.22, −3.72)`, scaleY 0.72 | Single capture for TBCC; keep duct under spine |
| Propulsion tunnel | loft under belly −3.68 → 6.1 | Continuous core-bypass path; one nozzle |
| Exhaust | torus r~0.34 at `(0, −0.10, 6.12)` | Aft hot zone; CMC fairing |
| Opaque escape/sensor spine | loft above body, no canopy | No windscreen; crew behind sensors |

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

## Gallery clearance check (basing ↔ geometry)

Span 7.35 m in a 14×8 m bore ⇒ **~2.7% blockage** — deliberate: bore size beats vacuum (see
[80 — Basing and ground](80-basing-and-ground.md) and `icds/basing-arrest.md`). Geometry must not
grow span without revisiting the launcher.

## Epistemic

All dimensions above are **closed**, tied to concrete repo constants (`FlightModel.RapierPublicDataSurrogate`,
`createRapier` in `scene_builders.js`, `TurboRamjetPerformanceMap.RamCaptureAreaM2`). This chapter is
readable without the JSON Airframe Definition — the definition is a 1:1 migration of these same
numbers, not a separate source of truth.

