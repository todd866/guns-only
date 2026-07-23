# Low-level drone war: the valleys get a job

*2026-07-23. Owner direction: "start thinking about low-level drone attacks and how that's
gonna work." Anchors: docs/low-level-playground.md (carved valleys, wires),
docs/world-backstory-research.md (the 2030s drone proxy war), docs/robot-airframe-design.md
(the Machine tier), docs/art-direction.md (TF2-clean 2030s).*

## The mode: valley intercept

Attritable strike drones ingress THROUGH the carved valleys — terrain-masking below the ridge
lines, navigating the drainage network toward defended targets — and the player hunts them in
the weeds. This gives the low-level playground its combat purpose: the terrain the pilot loves
flying is the terrain the enemy uses.

- **The targets**: slow-to-mid-speed attritable airframes (120–200 kt), low RCS fiction,
  flying deterministic valley-following routes with occasional pop-up/ridge-crossing legs.
  Waves escalate in count and route cunning, not in airframe performance — the Machine tier
  (docs/robot-airframe-design.md) stays the air-to-air apex; these are prey with consequences.
- **The stakes**: leakers reach the defended point and score against you (the existing
  drone-raid evaluation machinery generalizes) — but per the Build-79 rule, they NEVER
  evaporate: a leaker flies its attack profile to the end, visibly.
- **The hunt**: guns only, in valleys, under wires. Every low-level system built today is the
  skill ceiling: the 20 ft stable floor, GCAS deferring to the attentive pilot, corner hold,
  the funnel. Killing a terrain-masker in a 500 m-wide valley at 450 kt IS the game.
- **The counter-thread (later)**: the campaign dossier already stages the player INTO an
  attritable drone at low level (content-governance worked example). Same valleys, opposite
  seat — rung-1 assisted controls make the drone-operator framing literal.

## How it works technically

1. **Routes are terrain-derived**: the valley carve produces a drainage graph; drone routes are
   deterministic paths over that graph (seeded selection, fixed per wave). No new pathfinding
   kernel — RailBandit timelines generated from the graph at staging.
2. **Detection is honest**: low targets in ground clutter resolve late — reuse the belief/
   observation layer so padlock acquisition range shrinks against terrain-masked targets.
3. **Waves live in the continuous-combat frame**: the infinite-enemies front door alternates
   air-to-air merges with inbound raid waves as escalation proceeds — one session, one fight,
   varied prey.
4. **Presentation**: 2030s illustrative rules apply — clean stylized kills at every altitude
   (the doctrine IS the horror), wire/pylon silhouettes bold, drone silhouettes chunky and
   team-readable.

## Build order

After the valley carve (which this depends on): route graph + wave staging → detection/belief
tuning → debrief scorecard (leakers, lowest kill, time-in-valley) → the drone-seat inversion.
