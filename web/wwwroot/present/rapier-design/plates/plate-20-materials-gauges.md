# Plate 20 — Materials & gauges

Title: `rapier.public-data-surrogate.v1` @ **1.4.0** · epistemic: **provisional** gauges  
Skin limit **1473.15 K** closed as materials freeze constant.

## Zone schedule

| Zone | Material | Gauge / note | Plate |
| --- | --- | --- | --- |
| Wing / fin LE | SiC/SiC CMC | Leading insert to ~15% chord | 08, 12 |
| Inlet lip + duct liner | SiC/SiC CMC | Continuous hot path; thermal gaps at joints | 04, 17 |
| Nozzle fairing | SiC/SiC CMC | Plume-facing | 17 |
| Upper/lower skins | Polymer composite sandwich | Cold/warm structure | 08, 11 |
| Escape spine | Opaque composite | No transparencies | 05 |
| Carry-through | Composite / hybrid | Sized for 12 G dive | 11, 12 |
| Gear / hook | Steel / Ti-class | Recovery-weight loads | 14 |
| Fasteners in CMC | Ceramic-compatible / isolated | No cold-work steel through hot liner | 17 |

## Provisional skin gauges (starting point)

| Location | Start gauge | Rationale |
| --- | --- | --- |
| Wing skins | 2–4 mm face + core | Stiffness vs mass for AR 3 |
| Fuselage cold skins | 2–3 mm sandwich | Cabin rule + pressurization of spine only |
| CMC LE | as printable insert | Thermal, not primary bending |
| Keel longeron | section TBD | Carry cat + hook + gear |

**Do not treat these gauges as closed.** They are shop-start numbers so the BOM has something to
iterate; validate against 12 G dive and catapult loads before claiming build realism.

## Coatings / finish

| Area | Finish |
| --- | --- |
| Outer airframe | Weathered grey-green (presentation palette) — not VLO claim |
| Hot zones | CMC as-fired / thermal barrier as required |
| Accents | Tip paint only (readability) |

## Epistemic

CMC temperature capability is the **materials freeze**. Printed CMC as a 2030s trajectory is
**surrogate**. Gauges and fastener specs are **provisional** until a structural sizing pass closes them.
