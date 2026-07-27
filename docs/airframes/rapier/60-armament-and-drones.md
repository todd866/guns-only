# 60 — Armament and drones

← [50 — Crew, escape, FBW](50-crew-escape-fbw.md) · Next: [70 — Landing gear, arrest](70-landing-gear-arrest.md)

*Systems chapter. Constraints from area-ruled body ([10](10-geometry.md)) and thermal
([20](20-thermal-and-materials.md)). Packaging trade below is **provisional** — preferred geometry
for fiction-compatible carriage, not a closed OEM bay design.*

## Ownship guns (closed)

Guns-only, **480 rounds** (`CombatConfig.ModernVisualMerge` / `ModernDroneDefense`,
`PlayerAmmo: 480`) — one pass, not a magazine war. Ammunition mass is small relative to fuel and is
not tracked as a first-order CG term (see [40 — Mass and CG](40-mass-and-cg.md)).

## Gun-drone airframe (surrogate, closed as params)

Each drone uses `FlightModel.RapierGunDroneSurrogate`:

| Quantity | Value | Tag |
| --- | --- | --- |
| Mass gross / fuel-free / fuel | 360 / 280 / 80 kg | surrogate |
| Wing area / span | 4.0 m² / 5.5 m | surrogate |
| Skin limit | 593.15 K (~320 °C) | surrogate — **far below** Rapier CMC |
| Structural G | 6 G | surrogate |

Release must respect **drone** skin, not Rapier's. Do not lob a stainless-class article into a CMC
dash soak.

## Packaging trade (provisional — preferred option selected)

Cell volume is bounded by the area-ruled belly under the propulsion tunnel (stations z≈−0.6…+2.9,
half-width ≈0.6–0.7 m). A 5.5 m span drone does **not** fit unfolded; cells hold a **folded /
stowed** article with wings deploying after clear.

| Option | Cells | Stow mass (4×360 if full) | Fit in belly envelope | Mission fit | Verdict |
| --- | --- | --- | --- | --- | --- |
| A · Two cells | 2 | 720 kg | Comfortable; deeper doors | Under-matches 4-ship + egress screen | Reject for gameplay load |
| B · Three cells | 3 | 1080 kg | Tight but plausible | Awkward vs four-ship script | Hold as fallback |
| **C · Four cells** | **4** | **1440 kg** | **Tight; 2×2 belly grid** | Matches authored load | **Preferred (provisional)** |

**Preferred: C — four belly cells in a 2×2 grid** at definition sockets
`(±0.55, −0.35, 0.5)` and `(±0.55, −0.35, 1.8)` m (frame `threejs-createRapier-v1`). Lateral
spacing keeps doors clear of the 1.2 m² duct; longitudinal pair keeps CG travel under ~0.4 m when
all four leave (order-of-magnitude, provisional).

### Mass / CG consequences (provisional)

| State | Approx mass | Notes |
| --- | --- | --- |
| Alert Rapier alone (today's params) | 6556 kg class | Fuel partially filled |
| + 4 stowed drones | **+1440 kg** | **Not yet in `AircraftParams.MassKg`** — open binding gap |
| After full release | −1440 kg | CG shifts forward/up as aft-belly mass leaves |

Until the flight model carries drone mass, the intercept OFT is **optimistic** on climb and dash.
Track as overperformance sibling to wet T/W.

### Release envelope (provisional)

| Gate | Bound | Why |
| --- | --- | --- |
| Max release Mach | ≤ **M1.6** (RAM LIGHT cue) | Drone skin 320 °C; avoid full-ram soak |
| Min altitude | Pattern / attack window only | Separation + pickup geometry |
| Doors | Bottom-hinge, positive retention | Density at FL700 forbids casual open |

Pickup remains off Rapier's arresting strip (`rapier-glide-drone` vertical slice) — no in-flight
recovery.

## What remains open

Gun calibre/ammo/recoil on the drone, datalink EMCON, swarm allocation, turnaround labour, and
whether “reusable” survives landing-gear mass — see `docs/rapier-gun-drone-system.md`. Cell
coordinates may move when a vertical-slice mesh proves separation; bump `rapier.v1.json` revision
when they do.

## Epistemic

| Claim | Tag |
| --- | --- |
| Ownship 480 rounds | closed |
| Four-drone gameplay load | closed (mission) |
| Four-cell belly geometry | **provisional** (preferred trade) |
| Drone 360 kg params | surrogate |
| Carrier mass includes drones | **open finding** (not in FlightModel yet) |
