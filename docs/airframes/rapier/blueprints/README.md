# Rapier blueprints (Phase 1)

Hand plates derived from **`airframes/rapier.v1.json`** revision **`1.0.0`** (`rapier.public-data-surrogate.v1`).

Geometry numbers must match the JSON. If the definition revision bumps, regenerate or re-check every plate before claiming plates are current.

## Frame

`threejs-createRapier-v1`: **+Z aft**, +Y up, +X right. Drawings that put the nose at the top or left document that mapping in the plate title block.

## Plate index

| Plate | File | Binds to |
| --- | --- | --- |
| 01 Three-view | [plate-01-three-view.svg](plate-01-three-view.svg) | `dimensionsM`, wing planform, fuselage/spine envelopes |
| 02 Wing planform | [plate-02-wing-planform.svg](plate-02-wing-planform.svg) | `wing.planform`, `wing.areaM2`, AR, thickness, bevel |
| 03 Loft stations | [plate-03-loft-stations.md](plate-03-loft-stations.md) | `fuselage` / `escapePodSpine` / `propulsionTunnel` stations |
| 04 Inlet · duct · nozzle | [plate-04-inlet-duct-nozzle.svg](plate-04-inlet-duct-nozzle.svg) | `intake`, `exhaust`, `propulsionTunnel`, `propulsion.ramCaptureAreaM2` |
| 05 Escape-pod spine | [plate-05-escape-spine.svg](plate-05-escape-spine.svg) | `escapePodSpine`, `sockets.cockpitCamera` |
| 06 Drone bay | [plate-06-drone-bay.svg](plate-06-drone-bay.svg) | `sockets.droneBay` · trade C 2×2 |
| 07 Systems arrangement | [plate-07-systems-arrangement.svg](plate-07-systems-arrangement.svg) | spine · duct · bays · fuel · hook |
| 08 Thermal zones | [plate-08-thermal-zones.svg](plate-08-thermal-zones.svg) | `materialZones`, `thermal`, `palette` |
| 09 Performance envelope | [plate-09-performance-envelope.svg](plate-09-performance-envelope.svg) | OFT peak Mach · T/W · fiction M4 · open fuel |
| 10 Basing interface | [plate-10-basing-interface.svg](plate-10-basing-interface.svg) | `dimensionsM.span` + bible §70/§80 gallery (14×8 m, ~2.7%, 12° ramp) |

Current definition revision: **1.1.0**.

## Epistemic labels

| Claim | Tag on plates |
| --- | --- |
| OML length / span / planform / lofts | **closed** (surrogate geometry-of-record) |
| `ramCaptureAreaM2 = 1.2` | **closed** capture; propulsion performance **provisional** |
| CMC skin limit 1473.15 K | **surrogate** materials freeze |
| Mach-4 design dash | **fiction** (OFT peak ~3.69 **measured**) |
| Gallery 14×8 / ~2.7% / 12° | **closed** ground geometry (bible); theatre siting **fiction** |
| Drone bays / hook | **provisional** (JSON sockets; omit or label if drawn) |

## Regenerate checklist (on revision bump)

1. Diff `airframes/rapier.v1.json` against previous revision.
2. Update plate title blocks to the new `revision`.
3. Re-run coordinate extract for planform + loft tables (do not freehand).
4. Cross-check three SoT numbers on plate 01 and plate 04: `length`, `span`, `ramCaptureAreaM2`.
5. Sync embedded renderer copy if geometry changed (`web/wwwroot/airframes/rapier_v1.embedded.js`).

## Phase 1 method

Hand SVG / MD authored from the JSON (and, for plate 10 only, closed gallery numbers from `docs/airframes/rapier/70-…` / `80-…`). No automated plate generator in Phase 1.
