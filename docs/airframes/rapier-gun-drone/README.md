# Rapier gun-drone (second airframe · jet kit proof)

**Airframe id:** `rapier-gun-drone.public-data-surrogate.v1`  
**Definition:** `airframes/rapier-gun-drone.v1.json`  
**Flight model:** `FlightModel.RapierGunDroneSurrogate`  
**Carrier bible:** [`../rapier/60-armament-and-drones.md`](../rapier/60-armament-and-drones.md)

## Part I (short)

| Topic | Claim |
| --- | --- |
| Mission | Attritable gun fighterette released from Rapier; fights then RTB to quiet strip |
| Geometry | ~3.2 m × 5.5 m span · 4 m² · kit OML (simplified) |
| Materials | Cheap structure · skin 593.15 K |
| Propulsion | 1.8 kN dry · no AB |
| Mass | 280 / 80 / 360 kg |

Gameplay mesh `createRapierGunDrone` keeps cheek gun pods (loft-schema exception). Kit path is proven by `createAirframeFromDefinition` tests.
