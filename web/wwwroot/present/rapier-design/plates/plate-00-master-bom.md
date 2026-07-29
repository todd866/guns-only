# Plate 00 — Master BOM & build order

Title block: `rapier.public-data-surrogate.v1` @ **1.4.0** · epistemic: **provisional** masses  
Source: mass statement + packaging trade C + FlightModel class comment

## Top-level modules (build units)

| ID | Module | Approx mass (kg) | Material class | Mate |
| --- | --- | --- | --- | --- |
| A | Forward fuselage + sensor/gun bay | 420 | composite + CMC LE | → B |
| B | Escape-pod spine (crew module) | 380 | opaque composite | onto A–C backbone |
| C | Centre fuselage / wing carry-through | 980 | composite + CMC LE | spars → wings |
| D | Wing pair (complete) | 640 | composite skins, CMC LE | left/right to C |
| E | Propulsion tunnel + CMC duct + core | 1100 | CMC hot + mounts | through C–F |
| F | Aft fuselage + nozzle + RCS bottles | 520 | CMC fairing + composite | → E |
| G | Twin fins + tip accents | 90 | composite | on F |
| H | Landing gear set (NL+ML) | 280 | steel/Ti class | into A/C |
| I | Arresting hook + actuators | 45 | steel | F belly |
| J | Fuel system dry (tanks/plumbing) | 310 | bladder/composite bladder | in C–F |
| K | Avionics / FBW / electrical | 220 | — | spine + racks |
| L | Drone bay structure (empty) | 160 | composite | belly C |
| — | **Fuel-free sum (target)** | **≈5150** | — | must match `RapierAirframeFuelFreeMassKg` (published `FuelFreeMassKg` adds the 1440 kg bay) |
| M | Usable fuel | 4500 | JP-class | — |
| N | 4× gun-drones (stowed, design load) | 1440 | — | in `MassKg`/`FuelFreeMassKg` since Build 163; session sheds 360 kg per release |

Masses are **provisional allocations** summing to 5,145 kg against the closed 5,150 kg airframe fuel-free target (5 kg unallocated margin, inside the ±50 kg rule). Redistribute inside
the OML; do not change gross without bumping the definition and FlightModel together.

## Assembly sequence (see plate 19)

1. Join A–C–F keel / longerons (primary backbone).  
2. Drop in E propulsion tunnel; seal CMC duct joints.  
3. Mate B escape spine; verify camera socket.  
4. Attach D wings; set dihedral/incidence 0 (flat).  
5. Install J fuel, K avionics, L bays, H gear, I hook.  
6. Mate G fins; paint accents.  
7. Functional: leak, FBW BIT, bay doors, hook drop, gallery clearance.

## Tooling / basing interfaces required to “build and fly”

| Interface | Spec | Plate |
| --- | --- | --- |
| Gallery bore | 14×8 m, ~2.7% blockage at 7.35 m span | 10 |
| Ramp | 12°, 520 m run | 10 / bible 80 |
| Arrestor | 35 MJ `ProvisionalRapierLandStrip` | 10 / 14 |
| Drone quiet strip | Separate from Rapier wire | 06 / doctrine |

## Drawing revision

Bump this plate whenever module masses or mate order change. Keep sum(A…L) = 5150 ±50 kg.
