# Cobra Canyon Ground War

Date: 2026-08-03  
Status: accepted design; v1 implemented in `sim/Cobra/GroundWar/` + cobra-lab

Related: [AH-1G Cobra](../../airframes/ah-1g-cobra/README.md),
[platform architecture](../../platform-architecture.md),
[STATUS](../../STATUS.md),
Cobra Canyon definition in `sim/Cobra/CobraCanyonDefinition.cs`

## Problem / opportunity

Cobra Canyon today is an honest nap-of-earth flight lab: routes, landmarks, obstacles, and
threat-observer masking. From altitude the basin still reads empty. The long-term product cue is
Battlefield Vietnam — not as an infantry FPS clone, but as a **generation method** so a Cobra
sortie looks like a round of combined-arms war that a civilian can read at a glance.

## Product slice

One map (Cobra Canyon), one loop:

1. Friendly and hostile **ground units** fight each other continuously at contested landmarks.
2. A **control balance** drifts with that fight and tips harder when the Cobra destroys hostiles.
3. The AH-1G carries a **finite M134 magazine**; rearm only at Camp Ember (FOB).
4. Presentation uses BF-Vietnam-legible grammar: two factions, contested sites, vehicles and
   infantry clumps, smoke/tracers driven by sim events, a clear “who is winning.”

This is single-player, sim-owned. It does not wait on multiplayer combat authority.

## Non-goals (v1)

- Player on foot, enter/exit vehicles, boats/tanks as player vehicles
- Server-authoritative multiplayer ground war
- Rockets, TOW, bombs (Guns Only; M134 turret path only)
- Full ticket UI, class kits, spawn menus
- Replacing fixed-wing Guns Only or the Cohort north star

## Architecture

```text
CobraMissionRuntime.Advance
  → Ah1gCobraDynamics
  → CobraGroundWarRuntime.Advance (units fight, balance drifts, reinforce)
  → optional gunner fire consumes magazine and damages selected unit
  → FOB pad restores magazine when skids are inside the volume
Snapshot / CobraWebBridge exposes ground_war { control, units, sites, ammo, fob, debrief }
Presentation renders faction markers from that block only
```

### Ground units

| Field | Meaning |
| --- | --- |
| Id | Stable string per instance |
| Faction | Friendly / Hostile |
| Role | InfantryClump / SoftVehicle / HardPoint |
| Health | 0…MaxHealth; 0 = wreck (kept briefly for presentation) |
| Position | World ENU on terrain |
| Intent | Advance / Hold / EngageNearest |

Spawn and reinforce around contested sites pinned to existing landmarks (Iron Bell Bridge,
Plantation Water Tower / Red Earth Quarry, Camp Ember approach). Hard entity budget keeps
determinism and frame cost honest (tens of units, not hundreds of individuals).

Mutual combat: each living unit engages the nearest opposite-faction unit in range with simple
horizontal range checks (terrain LOS optional; v1 may use range-only for speed). No pathfinding
masterpiece — waypoint lanes between sites are enough.

Epistemic label for ground-unit combat performance: `fiction` / `provisional`. AH-1G remains
source-backed per the airframe bible.

### Control balance

- Scalar `control` in `[-1, +1]` (hostile … friendly) plus a short trend for HUD.
- Drift each tick from relative alive combat power near contested sites.
- Player-inflicted hostile losses apply a stronger pulse toward friendly.
- AI gunner inhibits friendly targets by default (`FriendlyTarget`).
- v1 default outcome: **endless shifting war** with debrief stats (hostile kills, friendly kills,
  peak friendly control, FOB rearm count, time airborne). Soft win/lose thresholds are optional
  later.

### Combat economy

- Selected target → `CobraAiGunner` → fire authorization → magazine drain + damage on the
  selected ground unit when authorized.
- Dry guns do not invent damage. Balance continues from the ground fight alone.
- **FOB resupply:** skids inside Camp Ember pad volume restore the magazine to full. No mid-map
  rearm. Fuel restore is out of scope for v1.

### Presentation

- Friendly olive / hostile dark silhouette language (fiction pack, not IP).
- Site control markers from local or global balance.
- Smoke, tracers, wrecks are presentation of sim events only.
- HUD: balance meter, ammo, FOB bearing/range when bingo, selected target cue.

## Delivery order

1. Ground war kernel (unarmed watch): spawn, fight, balance, snapshot.
2. Gunner + soft targets: finite magazine, Tab/F, damage → balance pulses.
3. FOB resupply + sortie debrief stats.
4. Legibility polish: markers, smoke/tracers, HUD cues in cobra-lab.

## Success test

A new player flies River Gorge, sees a fight at the bridge, understands which side is which,
empties the guns into hostiles, watches the balance tip, goes dry, returns to Camp Ember, rearms,
and comes back to a war that moved while they were gone.

## File ownership

| Piece | Path |
| --- | --- |
| Ground war kernel | `sim/Cobra/GroundWar/` |
| Mission wiring | `sim/Cobra/CobraMissionRuntime.cs` |
| Bridge snapshot | `web/CobraWebBridge.cs` |
| Lab presentation / HUD | `web/wwwroot/render/cobra/`, `web/wwwroot/cobra-lab/` |
| Tests | `sim.Tests/Cobra/GroundWar/` |
