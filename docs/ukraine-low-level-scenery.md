# Fictional Ukraine 2030s theatre and medevac foundation

## Decision

Use one synthetic 2030s Ukraine theatre for the whole programme. Aircraft and mission content may
change, but regional flight, the Soniachne low-level cell, the coastal recovery cell, and the fixed
Rapier strip all publish the same theatre, world-frame, and terrain identity. They are nested
fidelity bands or mission-local instances, not separate settings.

The setting, mission locations, strips, clinics, formations and targets are fictional. The current
regional presentation substrate is a source-locked Copernicus DEM atlas, but it is not a current
tactical map and carries no real base, unit, target, casualty or operational claim. Authored
mission features bind to the theatre's local metre frame rather than publishing real-world
coordinates.

The first low-level slice is mission 8, **Low-Level Drone Intercept**: an F-22 public-data
surrogate intercepts four sequential fictional airborne raiders over the Soniachne detail cell.
The regional slice also supports the Rapier's fixed-strip launch, climb, guns-only intercept, and
hook recovery. Neither mission is a player-controlled attack drone or a ground-attack mission yet.

## World layers

```mermaid
flowchart TD
    A["Regional macro truth<br/>262.144 km at 256 m"] --> B["Soniachne detail override<br/>16.384 km at 32 m"]
    B --> C["Authored mission-feature packs<br/>stable visual IDs; unassessed by default"]
    C --> D["Future authoritative LZ patches<br/>1–2 m surfaces and obstacles"]
    C --> E["Guns-only mission entities"]
    D --> F["Rotorcraft + emergency medicine scenario"]
    A --> G["Altitude-aware presentation<br/>macro terrain and atmosphere"]
    B --> H["Low-level micro presentation<br/>fields, settlements, utilities"]
    C --> H
    E --> H
```

The renderer can decorate authoritative data, but it cannot invent gameplay facts. A procedural
house may look good and still be only ambient scenery. It becomes targetable, collidable or usable
as medical cover only after a stable feature entity exists in simulation truth.

## Current terrain contract

- Theatre extent: geodetic **rapier-range** atlas on real Copernicus DEM (`33.0–38.4°E`,
  `46.6–50.2°N`, ~393 km class), sized for jet range. Fictional eastern strip at reference origin
  `38.0°E`, `48.5°N`. Country-scale D2 envelope is declared in the Ukraine source lock for expansion.
- Streamed truth: schema-v2 range-addressable atlas pages (32 m finest LOD); Copernicus water mask
  supplies coast / lake / river classification.
- Legacy synthetic Soniachne (`soniachne-steppe.*`) remains on disk for comparison but is not the
  Rapier / environment-lab default.
- Nested authority: atlas DEM is flight-continuity and visual truth for regional sorties. Future
  finer hero / LZ patches can override locally without inventing a second theatre.
- Rendering: macro/atlas terrain is required. Ambient micro scenery uses `ukraine-modern` and may
  shed at high altitude with hysteresis.
- Mission placement: Rapier corridor and other missions are local instances on this geodetic frame;
  they reject the multiplayer room origin until protocol v3.

The atlas layer is flight-continuity truth, not landing-zone truth. Authored 1–2 m hero cells are
still required before rotorcraft LZ validation.

Sharing a physical theatre identity does not currently mean sharing one live flight instance.
Presence protocol v2 does not attach authoritative world-frame and mission-instance identity to
every remote contact, and its sector assignment is unaware of this terrain product's finite bounds.
The browser therefore suppresses remote aircraft and bogeys in all current Ukraine missions while
retaining room connection/count status. Multiplayer scene sharing remains gated on protocol v3:
frame and instance identity on each contact, terrain-aware assignment, and verified agreement
between simulation sampling and rendered placement.

## Implemented mission cells

- **Regional frame:** the common source-locked Copernicus substrate and macro visual for the
  fictional 2030s programme.
- **Soniachne detail cell:** mandatory nearby micro scenery for the low-level drone intercept.
- **Soniachne clinic A:** a hash-bound, presentation-only human-island pack with stable building,
  fence, pole, wire and candidate-LZ identities. Its LZ status is **unassessed**; it makes no safe
  approach, obstacle-clearance or medical-capability claim.
- **Coastal cell:** a mission-local land/sea instance for recovery sorties in the same theatre.
- **Rapier corridor:** a mission-local regional instance with a stationary fictional
  catapult-and-arresting strip. The platform is fixed in simulation and presentation and does not
  inherit ship motion, maritime wind effects, hull, or island geometry.

All current combat in this theatre is guns-only. There are no bombs, missiles, renderer-owned
ground kills, or real-world target locations.

## Art direction

Use the Ghibli-adjacent soft-world / cold-instruments language from
[ADR-0003](adr-0003-ghibli-adjacent-world-presentation.md) and [art-direction.md](art-direction.md):
painterly light, warm cultivated lowlands, dark shelterbelts, soft atmospheric distance, and
strong silhouettes for safety. Instruments stay clinical. Do not copy Studio Ghibli or Valve
characters, textures or props.

The regional grammar is:

- large rectangular agricultural fields rather than Korean valley terraces;
- long shelterbelts and sparse tree groups;
- linear villages, farm compounds and occasional apartment blocks;
- roads, rail and power lines that persist across tile boundaries;
- red, grey and muted blue roofs;
- low rolling steppe with broad drainage and modest eastern relief.

Ambient buildings carry stable IDs plus `role: "ambient"` and `targetable: false`. Macro terrain
cannot be shed. Soniachne micro scenery is required for the low-level mission; elsewhere the
altitude-aware renderer may omit ambient micro density when it contributes no usable visual
reference. Mission entities and future LZ obstacles remain essential layers.

## Next combat slice

Implement these in order:

1. Extend the first presentation-only feature pack with simulation-owned collider, affiliation,
   damage and target bindings; do not infer these from its render primitives.
2. Expand the authored Soniachne hero cell: village edge, road,
   treeline, power line, bridge/culvert and two clearly fictional enemy emplacements.
3. Add a player-controlled fictional gun UCAV using a public, reduced-order aerodynamic model.
4. Add a ground-entity target adapter to the existing gun projectile/damage authority. Do not make
   decorative building instances hittable by raycast.
5. Stage one short attack route with safe boundaries, civilian exclusion zones and explicit
   guns-only loadout. No bombs, missiles or real-world coordinates.
6. Add authored damaged/destroyed visual states, dust, tracers and impact evidence driven only by
   simulation events.

This produces the requested drone-on-soft-world-enemy mission without creating a renderer-only
shooting gallery, a second Ukraine theatre, or contaminated medical truth.

## Medium-term integrated roadmap

| milestone | playable result | new authority |
|---|---|---|
| 1. Regional foundation | guns-only sorties share one 262.144 km theatre | 256 m macro truth, nested 32 m detail, AGL, weather, streaming |
| 2. Fixed-strip sortie | Rapier launches and recovers from a stationary fictional strip | fixed platform truth, regional route, altitude-aware presentation |
| 3. Gun-UCAV hero cell | player attacks fictional emplacements in one authored 4 km cell | feature IDs, colliders, damage, exclusion zones |
| 4. Medevac LZ stage | reconnaissance and LZ assessment in the same hero-cell system | 1–2 m surfaces, obstacles, corridors, access and LZ status |
| 5. Rotorcraft flight model | approach, hover, landing and departure constrained by conditions | mass/CG, rotor/engine maps, wind, density altitude and power margin |
| 6. Emergency-care model | assess, treat, package and transport a deteriorating casualty | injury state, interventions, contraindications and time-to-care |
| 7. Integrated missions | aviation decisions change medical outcomes and vice versa | shared scenario clock, event log, debrief and instructor evidence |

The graphics pipeline follows the same progression. Regional macro terrain carries high-altitude
continuity; procedural fields and villages provide low-level background in the current detail cell;
the 4 km combat/medevac hero cells then receive authored modular buildings, vegetation, utilities,
surface decals, damaged states and seasonal material variants. Every hero-cell review includes
cockpit-height, hover-height and ground-level captures plus a frame-time budget. Visual polish
cannot promote an ambient prop into an obstacle, target, medical facility, or safe landing surface;
those bindings always originate in simulation truth.

## Current scenery implementation contract

- Macro meadow/scrub/woodland structure is a seamless two-channel field baked per terrain vertex
  in the existing mesh worker (1.8 km macro and 360 m meso cells). Coarse LOD interpolation removes
  close breakup naturally; the ground fragment shader does not evaluate the former nested
  land-cover sine stack.
- Terrain, ambient instances, near grass, horizon apron and mission-feature materials share the
  same Ukraine extinction, warm-haze, haze-band and streamed-edge uniforms by reference. The
  Environment Lab therefore exercises the production atmosphere even without `scene.fog`.
- The clinic/LZ presentation is one mission-selected child of the terrain root, never one
  procedurally generated site per chunk. Its wall shells generate deterministic plinth, opening,
  porch, awning and chimney subinstances in the same five batches; static matrices have no
  steady-state update loop. The candidate-LZ cue is a broken meadow ring rather than a polished
  certified-helipad mark.
- Ambient trees, buildings, fields, infrastructure and camera-local grass consume the feature
  pack's presentation exclusion zones. They do not own or reinterpret the feature identities.
- Per active feature pack, render ceilings are 6/7/10 renderer submissions, 256/512/768 instances
  and 35k/60k/100k prop triangles for mobile/balanced/desktop. The submission ceiling includes the
  main colour pass plus one possible directional-shadow submission for every casting batch; it is
  not merely a material or mesh count. A pack may not allocate a second grass pool.
- Clinic A plus its authored road and shelterbelt costs six main-pass submissions on every tier.
  Mobile and balanced receive world shadows but cast no authored shadows, so their total remains
  six. Desktop lets four compact solid batches cast while the transparent LZ marking and broad
  canopy batch do not, for ten worst-case submissions. The village road is split at exact LOD0
  triangle crossings and the canonical shelterbelt carries sampled stand bases, so neither
  presentation layer is left on one false flat grade. Instance counts are 199/233/279 and submitted
  prop triangles are 4,300/5,068/9,080 on mobile/balanced/desktop; desktop is 5,980 main-pass plus
  3,100 authored-shadow triangles. These terrain-derived visuals remain non-authoritative and do
  not replace the future 1–2 m medevac surface/obstacle product. Non-Ukraine terrain skips the
  optional land-cover bake and attribute, avoiding a cross-theatre CPU and memory regression.
- `unassessed` is a hard semantic state, not disclaimer prose. Promotion requires matching
  high-resolution surface truth and simulation-authoritative obstacles.

## 60 fps presentation contract

The performance target applies to foreground, hardware-accelerated WebGL2 devices within the
supported mobile, balanced and desktop tiers. It is not a promise that every historical, software-
rendered or background-throttled device will sustain 60 fps. Combat, carrier and replay
presentation target 60 fps; the Environment Lab gate records a bounded 600-frame foreground
sample and reports p95, p99 and the fraction of frames slower than the production governor's
18.5 ms threshold. It passes only at 59+ measured fps, p95 at or below 18.5 ms, p99 at or below
22 ms, and no more than 3% late frames.

| tier | render-pixel ceiling | ambient-scenery radius | cloud-heavy hero result |
|---|---:|---:|---|
| desktop | 3.7 MP | 6 km | 59.1 fps; p95 17.6 ms; p99 17.7 ms; 0.7% >18.5 ms at 3.14 MP |
| balanced | 2.1 MP | 12 km | 60.0 fps; p95 18.2 ms; p99 18.6 ms; 2.0% >18.5 ms at 2.10 MP |
| mobile | 1.3 MP | 8 km | 60.0 fps; p95 17.8 ms; p99 18.5 ms; 0.5% >18.5 ms at 1.29 MP |

These measurements are from one development host and prove the bounded scene and instrumentation,
not the full supported hardware matrix. Device-lab coverage remains required. Adaptive resolution,
terrain/scenery LOD and the ambient budget may shed decorative density to hold the frame contract,
but the selected mission-authored feature pack is never shed. Camera-local grass is hidden above
120 m AGL. Former-field bands and access-track variation are baked into the existing terrain
land-cover attribute in the mesh worker, so their regional visual structure adds no texture or draw
call. Visual scenery remains presentation only and can never declare an LZ safe.

Run `node tools/perf/ukraine_hero_gate.mjs` on every supported hardware class. It loads the same
cloud-heavy 90 m AGL approach sequentially at mobile, balanced and desktop quality and exits
non-zero when any warmed 600-frame window misses the contract. It also verifies that desktop
actually renders the production 2,048 px PCF-soft land-combat shadow volume and four authored
shadow batches, while constrained tiers keep that pass disabled. The device gate defaults to
headed Chromium so macOS does not silently substitute SwiftShader for the hardware GPU.

The next art milestone is an authored 4 km combat/medevac hero cell, supported by reusable modular
settlement, road and seasonal asset sets. Richness should concentrate there while the regional
terrain retains its bounded macro grammar and frame-time contract.

## Medevac fidelity gate

Neither the 256 m regional substrate nor the 32 m Soniachne override is sufficient to select or
grade an LZ. A medically and aerodynamically credible medevac cell needs:

- 1–2 m terrain/surface patches around candidate LZs;
- slope, local relief, roughness, bearing strength and surface material;
- individual wires, poles, trees, fences, structures and rotor-clearance volumes;
- approach/departure corridors, wind exposure, downwash, dust/snow and visibility;
- road/trail access, extraction distance, lighting and time-to-care;
- casualty state, injury mechanism, interventions, contraindications and deterioration over time;
- aircraft mass/CG, rotor/engine performance, density altitude, translational lift, vortex-ring and
  settling risks, power margin and one-engine-inoperative limits where applicable.

Medevac detail therefore arrives in stages: regional routing and weather; an authored 4 km hero
cell; 1–2 m candidate-LZ surfaces; individual obstacle and rotor-clearance truth; then medical
scenario state. An LZ is eligible only when its high-resolution surface and obstacle set are both
loaded and validated. Otherwise the mission must label it **unassessed**, never infer safety from a
macro mesh, the 32 m detail grid, or decorative scenery.

## Acceptance gates

- Balanced/mobile retain nearby scenery at their selectable LOD instead of silently showing none.
- Regional and detailed terrain/collision truth use the same metre scale, datum and theatre frame.
- The preserved 16.384 km/32 m Soniachne cell overrides, rather than replaces or resamples, the
  regional truth.
- High-altitude missions retain macro terrain while ambient micro scenery follows the
  altitude-aware load policy.
- A theatre change reloads the correct terrain product; it cannot merely recolour Korea.
- No current built-in mission can inherit the multiplayer room offset or publish itself as a
  shared multiplayer terrain instance.
- Remote aircraft and bogeys remain presentation-suppressed until protocol v3 proves compatible
  frame/instance identity and terrain-aware assignment.
- The Rapier platform remains a fixed land strip with no maritime presentation or motion.
- The detailed cell edge is not visible as ocean/void during the mission.
- Ambient scenery is never targetable or collision-authoritative.
- A required mission-feature pack is selected by stable ID and SHA-256; load/hash failure blocks
  the required visual layer instead of silently substituting a random procedural site.
- Mission-authored feature presentation remains within its tier renderer-submission,
  instance and triangle ceilings, including any enabled authored shadow pass.
- The first clinic candidate remains `unassessed` until a matching surface patch and obstacle
  authority are loaded.
- Mission 8 remains a disclosed staged stream with one authoritative airborne target at a time.
- The next ground-attack slice cannot ship until target, collider and damage identities are
  simulation-owned.
- A medevac LZ cannot ship until its 1–2 m surface and obstacle truth pass their own validation.

## Fictionalization and use boundary

The 2030s Ukraine fiction, Soniachne identity, settlements, corridors, strip, clinic and future
hero cells are synthetic composites laid over a source-locked regional terrain substrate. They
carry no real formations, bases, targets or claim to current battlefield conditions. The pack is
for entertainment and training-system development, not real navigation, targeting or operational
planning.
