# Plate 18 — Station cross-sections

Title: `rapier.public-data-surrogate.v1` @ **1.4.0**  
OML radii **closed** (loft tables). Internal packing **provisional**.

Frame: +Z aft. Sections looking forward (−Z direction).

## FS −5.65 (nose / sensor)

| Item | Value |
| --- | --- |
| OML | rx≈0.34 · ry≈0.30 |
| Contents | EO/IR / radar aperture volume, gun barrels to muzzles at z≈−5.55 |
| Structure | Forward bulkhead, NLG attach behind this cut |

## FS −3.72 (inlet lip)

| Item | Value |
| --- | --- |
| OML | approaching rx≈0.60 |
| Capture | Ring inner/outer 0.29/0.55 · scaleY 0.72 · **1.2 m²** schedule |
| Note | Do not obstruct with stores; drone cells aft of this station |

## FS −0.6 (max body / carry-through)

| Item | Value |
| --- | --- |
| OML | rx≈0.76 · ry≈0.66 (**widest**) |
| Contents | Wing carry-through box, centre fuel, FBW racks above duct |
| Duct | Propulsion tunnel under floor · keep CMC clear of spar bolts |
| Bays | Fwd drone pair centres at z=+0.5 (just aft) |

## FS +1.8 (aft drone pair)

| Item | Value |
| --- | --- |
| OML | tapering from max |
| Contents | Aft drone cells (±0.55, −0.35), fuel transfer gallery |
| Clear | Each cell ~1.0×0.55×1.1 m (provisional) |

## FS +4.2 (hook)

| Item | Value |
| --- | --- |
| Hook socket | (0, −0.55, +4.2) provisional |
| Loads | Into keel longerons / FS+2.9 and FS+5.55 frames |

## FS +6.12 (nozzle)

| Item | Value |
| --- | --- |
| Exhaust | Torus r≈0.34 |
| Thermal | CMC fairing · no composite in plume |

## Build rule

If an internal item violates the closed OML ellipse at that station, **move the item** — do not grow
the loft without a definition revision and gallery re-clearance.
