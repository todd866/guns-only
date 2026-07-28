# Rapier blueprints — construction package

**Airframe:** `rapier.public-data-surrogate.v1` · **Definition revision:** `1.2.0`  
**Frame:** `threejs-createRapier-v1` (+Z aft, +Y up, +X right) · Nose toward −Z  
**Authority:** OML from `airframes/rapier.v1.json`. Internals fit that OML; tagged per plate.

This is the in-repo **build package**: geometry, materials, systems, and assembly order to reconstruct
the article without reading `scene_builders.js`. Not an OEM certified set.

**Read first:** [REALISM-AND-OVERPERFORMANCE.md](../REALISM-AND-OVERPERFORMANCE.md) · teaching deck
`/present/rapier-design/`.

## Plate index

| # | Plate | File | Purpose | Epistemic |
| --- | --- | --- | --- | --- |
| 00 | Master BOM & build order | [plate-00-master-bom.md](plate-00-master-bom.md) | Modules, masses, mate sequence | provisional masses |
| 01 | Three-view | [plate-01-three-view.svg](plate-01-three-view.svg) | OML envelope | closed geom |
| 02 | Wing planform | [plate-02-wing-planform.svg](plate-02-wing-planform.svg) | Planform vertices | closed geom |
| 03 | Loft stations | [plate-03-loft-stations.md](plate-03-loft-stations.md) | Fuselage/spine/tunnel tables | closed geom |
| 04 | Inlet · duct · nozzle | [plate-04-inlet-duct-nozzle.svg](plate-04-inlet-duct-nozzle.svg) | Capture 1.2 m² path | closed capture |
| 05 | Escape-pod spine | [plate-05-escape-spine.svg](plate-05-escape-spine.svg) | Crew module OML | closed geom |
| 06 | Drone bay | [plate-06-drone-bay.svg](plate-06-drone-bay.svg) | 2×2 belly cells | provisional |
| 07 | Systems arrangement | [plate-07-systems-arrangement.svg](plate-07-systems-arrangement.svg) | Nose→tail zones | surrogate |
| 08 | Thermal / materials zones | [plate-08-thermal-zones.svg](plate-08-thermal-zones.svg) | CMC vs composite | surrogate |
| 09 | Performance envelope | [plate-09-performance-envelope.svg](plate-09-performance-envelope.svg) | Honest Mach/T/W | mixed |
| 10 | Basing interface | [plate-10-basing-interface.svg](plate-10-basing-interface.svg) | Gallery / strip ICD | closed ground |
| 11 | Primary structure | [plate-11-primary-structure.svg](plate-11-primary-structure.svg) | Frames, longerons, carry-through | provisional |
| 12 | Wing structure | [plate-12-wing-structure.svg](plate-12-wing-structure.svg) | Spars, ribs, hinges | provisional |
| 13 | Fuel system | [plate-13-fuel-system.svg](plate-13-fuel-system.svg) | Tanks, 4500 kg usable | provisional |
| 14 | Landing gear & hook | [plate-14-landing-gear-hook.svg](plate-14-landing-gear-hook.svg) | Gear + arrest | provisional |
| 15 | Flight controls | [plate-15-flight-controls.svg](plate-15-flight-controls.svg) | Surfaces, actuators, FBW | provisional |
| 16 | Electrical & FBW | [plate-16-electrical-fbw.svg](plate-16-electrical-fbw.svg) | Power, buses, computers | provisional |
| 17 | Propulsion install | [plate-17-propulsion-install.svg](plate-17-propulsion-install.svg) | Mounts, CMC duct, RCS | provisional |
| 18 | Station cross-sections | [plate-18-station-cross-sections.md](plate-18-station-cross-sections.md) | Cuts at key z | closed OML + provisional guts |
| 19 | Assembly sequence | [plate-19-assembly-sequence.svg](plate-19-assembly-sequence.svg) | Mate order | provisional |
| 20 | Materials & gauges | [plate-20-materials-gauges.md](plate-20-materials-gauges.md) | Thicknesses, fastener class | provisional |

## Closed vs soft

**Closed today:** OML, loft stations, capture area, basing gallery/arrest energy, mass statement
5150 airframe + 1440 design drones / 4500 fuel / 11090 gross, 84 kN · aug T/W ≤1.20, CMC skin
limit, per-stream fuel in the propulsion map.  
**Still soft:** structural gauges, actuator rates, inertia rescale for 11 t gross, honest dash Mach —
labelled, not papered over.

## Regenerate on revision bump

1. Diff `airframes/rapier.v1.json`.  
2. Update title blocks to new `revision`.  
3. Re-extract planform + loft tables (no freehand OML).  
4. Cross-check length 13 · span 7.35 · capture 1.2 on plates 01/04.  
5. Sync `web/wwwroot/airframes/rapier_v1.embedded.js`.
