# ICD — Carrier ↔ drone cell

Interface control between the Rapier airframe and gun-drone carriage
([60 — Armament and drones](../60-armament-and-drones.md), `docs/rapier-gun-drone-system.md`).

## Closed / preferred interface points

| Interface | Value | Tag | Owner |
| --- | --- | --- | --- |
| Gameplay load | four reusable gun-drones | closed (mission) | [60](../60-armament-and-drones.md) |
| Preferred cell count | **4** in 2×2 belly grid | provisional | [60](../60-armament-and-drones.md) |
| Socket positions | `(±0.55, −0.35, 0.5)` / `(±0.55, −0.35, 1.8)` m | provisional | `airframes/rapier.v1.json` |
| Cell clear box (stowed) | ~1.0 × 0.55 × 1.1 m per cell | provisional | plate-06 |
| Drone skin limit | 593.15 K | surrogate | `RapierGunDroneSurrogate` |
| Max release Mach | ≤ M1.6 | provisional | [60](../60-armament-and-drones.md) |
| Body volume constraint | inside area-ruled OML | closed geometry constraint | [10](../10-geometry.md) |
| Recovery | quiet strip pickup, not Rapier | closed (doctrine) | glide-drone slice |

Carrier owns: retention, conditioning, mission data, release authority, separation.
Carrier does **not** own: in-flight recovery, rearm, post-release flight control.

## Open findings

- Drone mass closed Build 163: the 1,440 kg four-cell bay is in `MassKg`/`FuelFreeMassKg`; the session sheds 360 kg per release
- Door kinematics, ejector impulse, inlet-interaction CFD
- Gun/ammo package on the drone; datalink EMCON; swarm FMECA

## Epistemic

Preferred four-cell geometry is **provisional**. Gameplay load and thermal mismatch are **closed**
facts about the current system.
