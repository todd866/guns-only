# 60 — Armament and drones

← [50 — Crew, escape, FBW](50-crew-escape-fbw.md) · Next: [70 — Landing gear, arrest](70-landing-gear-arrest.md)

*Systems chapter. Constraints below come from the area-ruled body ([10](10-geometry.md)) and thermal
limits ([20](20-thermal-and-materials.md)); this chapter does not re-derive geometry or thermal
freezes.*

## Ownship guns (closed)

Guns-only, **480 rounds** (`CombatConfig.ModernVisualMerge` / `ModernDroneDefense`,
`PlayerAmmo: 480`) — one pass, not a magazine war. Ammunition mass is small relative to fuel and is
not tracked as a first-order CG term (see [40 — Mass and CG](40-mass-and-cg.md)).

## Gun-drones — gameplay load is closed, physical packaging is not

Four reusable gun-drones are the **gameplay** load (`ScriptedInterceptConfig.DogfightingDrones`,
`docs/rapier-gun-drone-system.md`). That number is a mission/gameplay commitment, not yet an
engineering claim about what physically fits inside the aircraft. **Physical packaging (cells,
doors, thermal soak, CG, release envelope at dash Mach) remains the open SE trade.**

Constraints inherited from earlier chapters that any packaging solution must respect:

- Cells must live inside the area-ruled body ([10](10-geometry.md)) without wrecking wave drag.
- Release Mach/altitude must respect **drone** skin limits, not only Rapier's CMC limit
  (`RapierGunDroneSurrogate.SkinTemperatureLimitK = 593.15`, i.e. ~320 °C — far below Rapier's
  1473.15 K). Do not release a drone into a thermal environment its own skin cannot survive.
- Pickup is off Rapier's arresting strip, per the glide-drone vertical-slice design — Rapier does not
  recover drones in flight.

## What is not closed here

> **provisional / open finding.** Packaged mass, volume, CG travel, cell count (2 vs 3 vs 4), doors,
> release-speed envelope, gun calibre/ammo/recoil for the drones themselves, drone propulsion and
> endurance, sensor apertures, datalink topology, and swarm coordination are all explicitly open —
> see `docs/rapier-gun-drone-system.md` §"Questions that remain open" for the full list. **Do not
> invent a closed drone mass, cell dimension, or release-speed number in this chapter or in the JSON
> Airframe Definition to make the packaging trade look finished.** The vertical slice
> (`docs/superpowers/specs/2026-07-27-rapier-glide-drone-vertical-slice-design.md`) owns proving the
> first physical drone; this bible owns the geometry envelope constraint the packaging trade must
> satisfy.

## Epistemic

Ownship round count is **closed**. The four-drone gameplay load is **closed as a mission
commitment** but **provisional as an engineering fact** — see `icds/gun-drone-carriage.md` for the
carrier/drone interface boundary.

