# Separate worlds: how the light world, the dark world and the underground load

Design note, 31 Oct 2026. Status: proposal for the next session's refactor; nothing here is built.

## The ruling this answers

Owner: "light world and dark world should both have the same playable spaces. If that extends past
the base, no problem, just make a bigger world", and "but dark and light worlds *are* separate".
And for the underground: "we want the underground to be like minecraft, with stuff you can dig up,
crafting, and these portals that randomly appear. The only difference tho is that not everything
is persistent between sessions … But the underground cavern setup will always be the same", and
"eventually we can make a thing where you can reinforce your mine shaft and then it becomes
persistent."

So the dark world is its own world over the same extent as the light world, which you cross
into. It isn't the light world with layers hidden and swapped. The model built on 31 Oct does
exactly what is ruled out: one physics world with `era-dam` / `era-farm` collision gates,
visibility toggled by `setEra()`, and the past limited to the mountain by
`pastHolds = inMountain`.

## The choice: separate world instances at the same coordinates

Considered:

- **A. Separate instances, same coordinates** (chosen). Each world owns its scene root, stream,
  terrain recipe, collision, water, navigation and recovery, actors and state. Crossing makes the
  other world active. Content is authored in natural coordinates, so "the same spot in the other
  world" is the identity mapping.
- **B. An offset region.** A second copy of the land would sit at x + D in the one shared
  world. This reuses today's plumbing at first, but it spreads a second coordinate system through
  terrain, bounds, recovery, navigation, saves and water, and it collides with the existing
  `x > 9000` alien-world checks. The alien pocket shows that remote coordinates can hold
  scenery. Its scattered range checks are evidence against scaling that approach to two
  full-size valleys.

Codex advised on 31 Oct and agreed on A, with one warning that this note adopts: **A is more than
"two roots and a collision-pointer swap."** A world also owns its environmental queries, actor
state, asynchronous loading and lifecycle.

## What a world is

```
World { id: 'light' | 'dark' (later 'alien', 'underground:<world>')
        root                      scene group; only the active world's root is in the scene
        recipe                    elevation, surface classes, cutouts, water bodies, bounds, tile features
        stream                    tiles + authored collision built from the recipe (no shared tile objects)
        services                  ground/water/recovery/navigation queries, bound to this world
        modules                   content with activate() / suspend() / dispose()
        state                     per-world entities and mutations (saved by world id) }
```

- **Terrain recipe, not a copy of the light stream.** `stream.mjs` hardcodes the modern world:
  district terrain cuts, water basins, mine and sewer geometry, and dam and drowned-town
  collision. A second stream built the same way would leave invisible structures and holes in
  the dark world. Each world supplies its own recipe. Common geography (the heightfield, the
  mountain) is shared; each world builds its own final ground.
- **Modules belong to a world.** Today about 22 modules attach straight to `scene`, with 31
  references to `stream.world` in `runtime.js`. Light-world modules attach under the light
  root and the light stream. Player-facing queries (camera rays, water, recovery, physics) go
  through the active world's services. There is no globally switching `addTri`, so a late
  light-world load can never put geometry into dark collision.
- **Residency is bounded.** Both worlds exist logically; only the active world and a prepared
  destination area are loaded. Budget the peak during a crossing (source plus destination
  collision, render data and uploads), not just the steady state. Inactive worlds suspend: no
  update loops, audio, timers or spawning. Preparation starts early, when you're near a gate or
  digging towards the portal layer.
- **Actors have a world.** The player body, the parked car, mounts and herds each carry a world
  id. The stream follows the active body; today it follows the car even on foot, which is a
  latent bug to fix in the extraction. The car either stays behind in its world or becomes the
  destination world's mount. That is decided per crossing type, never left implicit.

## Crossing: one coordinator for every way across

Gates, digging, the place list and save restoration all use one coordinator:

`request → prepare destination → validate arrival → commit at a simulation boundary → resume`

- The source world stays usable until preparation succeeds. Competing requests are serialised;
  stale completions are rejected. Progress (first crossing, place unlocks) and the saved
  location are committed only after success. Today's time-gate handler switches the era first
  and returns a trip even when preparation fails; that's a bug the coordinator removes.
- **Arrival rules.** A crossing names its mapping: identity (digging comes out at the same x,z) or
  linked (a gate may join two different places: the plaza gate to the lake floor is the owner's
  own idea and stays). The arrival is then validated: support underfoot, clearance for the body
  that arrives (the dinosaur is bigger than the cowboy), water (surface or bottom, said
  explicitly), and an allowed vertical adjustment. Digging never slides sideways silently; the
  destination world guarantees an emergence surface at every x,z (see the underground below).
- **Physics handover starts stopped.** Keep the heading; reset linear and angular velocity, and
  clear flight, grind, contact, recovery, interpolation and the camera's previous position. Moving
  between a car and a dinosaur body changes the vehicle parameters, so copying velocity blind is
  wrong. Portals that keep momentum can come later as an explicit rule.

## Saves

Global (unlocks, inventory, gold, Dino Book, herd) is kept apart from per-world (entities,
mutations, reinforced shafts) and the current `{worldId, body, position}`. The schema is
versioned. The legacy `timeCrossed` means "unlocked", never "currently in the dark world". A save
is a committed snapshot, never half a crossing.

## The underground

Each world has an underground beneath it, Minecraft-like: blocks you dig up, ore and finds,
crafting, and portals that appear at random.

- **The cavern layout is deterministic and permanent.** It's generated from a fixed seed per world
  and region, so the same caves, seams and caverns are always there.
- **Excavations are per session.** Blocks you remove live in session state and aren't saved: dig a
  hole that wrecks the base, and next time it may be back.
- **Reinforced shafts persist** (later): reinforcing a shaft writes it to the per-world save.
- **The portal layer is the floor of every underground.** Digging through it is an identity
  crossing into the other world's underground ceiling, emerging at the surface above, so every
  x,z has somewhere to come out.
- **Random portals** are session-seeded, so they appear in different places each visit.
- Persistence follows directly from the world model: deterministic layout (recipe), session
  mutations (session state), and persistent reinforcements (per-world save).

## Migration order

1. **World identity and crossing rules.** Stable ids; locations, recovery points, actors and saved
   positions become `{worldId, …}`; the coordinator's rules are written down, including which
   body crosses and what a failed arrival does.
2. **Extract the light world without changing its behaviour.** Root, stream and recipe,
   services, module lifecycle and state; make streaming follow the active body; audit captured
   references to `stream.world` and `course.world`. Prove the light world behaves exactly as it
   did before the dark world exists as an instance.
3. **One transition coordinator** used by gates, digging (with a waiting state at the portal
   layer), the place list and loading.
4. **A sparse dark world over the full shared extent.** Correct ground, collision, water, bounds,
   and one crossing; no modern district holes, no dam, no mountain-edge fade. Test ordinary points
   and the outer bounds, then bring in today's content as dark-world modules: the Lake Town, the
   farm, outlaws, herds, the nest, and the rc-adventure meadow
   (feature/rc-odyssey-next 46ce70de).
5. **Persistence and bounded residency before content grows** (the save split above; suspend and
   evict inactive worlds; keep a bounded return area).
6. **The underground** as a per-world layer on the same model.
7. **The alien pocket** last: first isolated behind an adapter, then its own world, replacing
   the `x > 9000` checks.

## Tests to require before content grows

Failed and cancelled loading; rapid repeated crossings; on-foot travel far from the parked car;
destinations at different elevations; underwater and obstructed arrivals; save and reload after
a crossing; world-local recovery; repeated round trips without leaking resources; underground
determinism (the same seed gives the same caverns) and per-session reset of excavations.
