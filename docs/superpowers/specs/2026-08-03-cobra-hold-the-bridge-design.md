# Cobra Canyon — Hold the Bridge

Date: 2026-08-03  
Status: approved for implementation  
Base: [ground war design](./2026-08-03-cobra-canyon-ground-war-design.md) + `feature/cobra-canyon-ground-war`

## Product

One playable Guns Only mission on the Cobra Canyon map. Not a world lab.

**Mission name:** Hold the Bridge  
**Airframe:** AH-1G (finite M134, AI gunner on Tab/F)  
**Map:** River Gorge basin (existing planner + ground-war sites)

### Loop

1. Spawn over the river approach with a living ground fight already in progress.
2. Tab selects hostiles; hold F for gunner consent; tip control toward friendly.
3. Dry magazine → return to Camp Ember pad to rearm.
4. **Win:** control ≥ +0.55 and held for 45 continuous seconds.
5. **Lose:** control ≤ −0.75 for 30 continuous seconds, or airframe destroyed / mission terminal wreck.

Debrief shows kills, peak control, rearm count, time airborne, and win/lose reason.

## Presentation (same game contract as F-22)

- Full-bleed `#scene` + compact `#hud` canvas. No persistent lab sidebar in the play path.
- Objective strip: mission name, control meter, ammo, FOB cue when bingo.
- Lab inspection chrome (quality/tour/metrics) only behind `?lab=1`.
- Honesty: AH-1G dynamics remain disclosed foundation; ground units are `fiction`/`provisional`.

## Non-goals

- Multiple mission packages or route picker as the front door
- Rockets / TOW / bombs
- Weekend Ride productization (separate track)
- Embedding Cobra inside `index.html` this pass (standalone `/cobra-lab/` stays)

## Delivery order

1. Rebase/land ground-war kernel onto current `main`.
2. Add win/lose hold timers + debrief fields in sim + bridge.
3. Productize cobra-lab shell (play default, lab optional).
4. Contracts + stamp + deploy.

## Success test

A fresh player opens Cobra from the hangar, sees a fight, understands factions, shoots hostiles, tips the meter, rearms at Camp Ember if needed, and either wins Hold the Bridge or loses with a clear reason — without opening a debug panel.
