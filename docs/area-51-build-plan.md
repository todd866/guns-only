# Area 51½ — build plan (2026-10-21)

Current product/level specification: [Saucer Springs master design](design/saucer-springs/master-design.md). The separate-scene and 30-second hub proposals below are historical and superseded by the connected large-world/portal design.

Direction history: `area-51-and-a-half.md`. This doc covers how we build it to Re-Volt standards.

## What "Re-Volt standard" means, concretely

Re-Volt feels the way it does because of five engineering choices. We copy the choices, not
the code or data:

1. **A real rigid body, not a planar car.** The car has mass, an inertia tensor, linear and
   angular velocity, and a full orientation. It can pitch, roll, flip, tumble and land on its
   roof. The prototype's `stepCar` (planar velocity, faked pitch/roll, `y` clamped to a
   heightfield) can do none of this. **It is replaced, not tuned.**
2. **Four independent spring-damper wheels.** Each wheel casts along the car's down axis
   against the world mesh. Its spring and damper push the body at that corner. That is where
   the bounce, body roll, wheelies and landings come from.
3. **A friction tyre per wheel.** Grip holds until static friction is exceeded, then the tyre
   slides at kinetic friction. Re-Volt cars carry separate static/kinetic values per axle;
   that gap is the "it suddenly lets go" feel. Surfaces scale it (a gym floor is slippery,
   grass is draggy).
4. **Toy scale in a full-size world.** The car is a 1:10 toy (≈0.42 m long, ≈5 cm wheel
   radius, ≈1.8 kg) in real-sized rooms and streets, with real gravity. Light mass, stiff
   springs and low inertia make it skittish and bouncy. A kerb is a jump and a desk is a
   building.
5. **Triangle-mesh worlds with surface types.** Tracks are authored meshes with a separate
   collision mesh tagged by surface, plus authored metadata: gates, racing line, pickups and
   start grid.

Calibration: the owner's private RVGL install (`~/Library/Application Support/RVGL/cars/*/
parameters.txt`) documents the **form** of Re-Volt's car model: per-wheel offset, radius,
travel, spring stiffness/damping, axle friction, static vs kinetic friction, grip, steer
rate, top speed and centre of mass. We use those **ratios** to sanity-check our own tuning:
the rear static friction a little below the front's, kinetic about 0.97× static on the
tyres, and a centre of mass low and slightly rearward. No parameter file, model, texture or
sound is copied into this repo.

## Where the physics lives: JS, in the RC page

The car engine is a plain ES module under `web/wwwroot/rc/physics/`. The fixed step stays at
120 Hz, with internal substeps for contacts. It doesn't go in the C# kernel:

- The RC page runs standalone without WASM, which keeps iteration and tests at Node speed
  (no heavy-slot build to change a spring).
- Four wheels plus ~6 hull spheres against a gridded triangle mesh costs microseconds per
  step in JS.
- The flight shell already hosts the RC page in an iframe with clean pause ownership.

**Replacement:** Area 51½ takes the Weekend Ride (YZF-R1) slot on the sortie selector. The bike
leaves the menu; its C# stays in the tree, frozen like the other modes. The prototype's
`stepCar` is deleted once the new car drives the existing base route.

## Physics modules

| Module | Owns |
|---|---|
| `physics/math.mjs` | vec3/quat helpers, no allocations in the hot path |
| `physics/world.mjs` | triangle collision world: uniform XZ grid, segment raycast, sphere-vs-triangle contacts, surface table |
| `physics/car.mjs` | car params, rigid-body integration, suspension, tyres, engine/brake/steer, hull contacts, downforce |
| `physics/assists.mjs` | kid mode: speed-scaled steering, traction help, yaw damping, air levelling, auto-right, free recovery |
| `physics/course-from-boxes.mjs` | turns the prototype's authored boxes/ramps into a triangle world, so the existing route keeps working during the switch |

Assists are honest pilots, as elsewhere in Guns Only: they act through the same inputs and
forces the player has, and **Big Kid** mode turns them off. Physics is never weakened for kid
mode.

## World and asset pipeline (Blender → GLB)

One Blender script per district under `tools/rc/blender/districts/`. Each one builds native,
editable objects and saves a `.blend` to `assets/rc/districts/`. It then exports a single GLB
to `web/wwwroot/rc/assets/districts/<district>.glb`.

Node naming in that GLB is the contract:

| Prefix | Meaning |
|---|---|
| `VIS_*` | rendered geometry |
| `COL_<surface>_*` | collision-only mesh, hidden at load. Surfaces: `asphalt concrete grass dirt wood gymfloor carpet metal tile rubber gravel` |
| `GATE_NN` | empty; position + forward (−Z) = gate centre and direction, scale.x = half width |
| `START_N` | grid slots, player first |
| `AI_NNN` | racing-line nodes in order, scale.x = usable half width |
| `PICKUP_*` | pickup spawn points |
| `SPEC_*` | hidden alien specimen locations |
| `COIN_NN` | challenge coins, exactly `COIN_01`..`COIN_05` per district (Re-Volt's stars). Each sits off the racing line (>= 1.5 m from it) with collision floor no more than 0.6 m below it, so a toy car can drive through it (collected within 0.7 m, `physics/session.mjs`). Extras: `hint`, and `approach_xy` / `return_xy` (Blender XY waypoints from the line to the coin and back) for the driven test |
| `ALT_<name>_NNN` | skill-shortcut racing lines, ordered from `000`; scale.x = half width; extras `speed` (careful driver's m/s for that node) and `gap: true` on the node before a jump gap. First and last nodes sit on the main racing line (within 1 m of an `AI_` node) and no `GATE` lies in the bypassed stretch. Every node and midpoint is over walkable collision with >= 0.55 m of level surface across it. Falling off lands on floor that is, or leads back to, the slower main route |
| `CAM_*` | optional camera hints for tight interiors |

Units are metres at real scale, Blender +Z up, glTF export +Y up. Visuals bake ambient
occlusion into vertex colours (`COLOR_0`), which costs nothing at runtime and does most of
what Re-Volt's vertex lighting did. Budgets per district: ≤250k triangles visual, ≤40k
collision, ≤24 materials, ≤12 MB GLB. Exports run under `heavy-slot` with
`blender --threads 2`, and `tools/rc/validate-assets.mjs` is extended for the district
contract.

## Districts, in build order

1. **Base Housing:** the first full track and the pipeline proof. Cul-de-sac loop with lawns,
   driveways, garage ramp, kerbs, a trampoline and a backyard shortcut.
2. **School:** gym (slippery floor), locker hallway, cafeteria, playground slide.
3. **Flight Line:** reuses the hangar/aircraft kit at the new car scale.
4. **HQ Offices**, then **Commissary**.
5. **Area 51½ secret lab**, unlocked by specimens.

Each district is its own level, picked from a cartoon base map (Re-Volt's track select).

**Skill shortcuts** (owner, 2026-10-21): every district has at least one elevated `ALT_` route
that is narrow (0.8 m), has a braking zone (a dogleg) and a jump (a 12 cm kicker over a 0.8 m
gap), and beats the main line for a careful driver while a flat-out driver falls off. Falls drop
0.6-0.7 m onto floor; where the floor under the route would itself be a short cut, it is a dead
end that opens only back onto the main route. Housing: GARDEN WALL RUN (`ALT_wall`). BX: the
stockroom (`ALT_stockroom`, formerly `SHORTCUT_NNN`) and the FLIGHT SUIT RUNWAY through the
soft-goods block (`ALT_runway`). School: the library diagonal (`ALT_library`) and the PLANTER RUN
across the flagpole planter (`ALT_planter`).

Checks: `tools/rc/validate-district.mjs` (coins, ALT geometry), `tools/rc/coins-reachable.test.mjs`
and `tools/rc/alt-routes.test.mjs` (both drive the real car physics through `tools/rc/drive-path.mjs`).
Free roam between districts waits until the districts themselves are fun.

## Racing systems (after the car feels right)

- **AI:** pure-pursuit along `AI_*` nodes with a curvature speed profile. Opponents stay near
  the player in kid mode (rubber-banding).
- **Pickups:** water balloon, slow homing firework, oil slick, bubble shield, pudding puddle,
  zoom. They wobble or spin a car, never wreck it.
- **Laps and gates:** ordered `GATE_*`, low-altitude only (existing rule). Wrong way is
  detected from gate direction.

## Acceptance, per milestone

- **Node tests** (fast, deterministic): rest sag, natural frequency, 0–top-speed time,
  braking distance, steady-state turn, a slide past static friction, a ramp jump that lands,
  a car dropped upside-down that auto-rights in kid mode and stays upside-down in Big Kid,
  no tunnelling through a 2 cm wall at top speed, energy that doesn't grow over a 60 s bumpy
  run, and the same input tape giving the same trajectory.
- **Feel harness:** the existing course/tape runner, extended with flip/air/tumble metrics.
- **Look:** render real frames from the browser, compare them with the approved concept, and
  inspect both light and dark scenes before calling it done.
- **Kid test:** the owner's six-year-old plays it. Watch for crying. That one test outranks
  the rest.

## Milestones

- **M1 Car — done 2026-10-21.** `web/wwwroot/rc/physics/` replaces the planar `stepCar` (deleted).
  The prototype route is rebuilt as a triangle world (`sim.mjs` `buildBaseWorld`). 24 Node tests pass
  (`node --test web/wwwroot/rc/*.test.mjs tools/rc/harness/*.test.mjs tools/rc/*.test.mjs`). Harness
  metrics: 0–9 m/s 1.17 s, top speed 12.6 m/s, braking 5.1 m from 11.3 m/s, a straight 0.6 m ramp gives
  0.75 s of air and lands upright, gym floor corners on less grip than asphalt. A real-keyboard
  headless lap (`tools/rc/check-lap.cjs`) finished all 10 gates in 29.8 s with 0 hits and 0 page
  errors (favicon 404 only) on ANGLE Metal / Apple M5. Evidence is in `evidence/area51/m1/`.
  Two bugs the harness found and fixed: hull-contact ordering rolled the car on symmetric landings
  (now an iterative accumulated-impulse solve, plus a damped bump rubber), and spawning ignored
  ground height.
  Open: the tuning is unplayed by a human. Body roll is mild (roll centre 0.6). The chase camera is
  new and untested on flips.
- **M2 Housing: driving 2026-10-21.** Liberty Loop (`?track=housing`): a real-keyboard headless
  lap finished in 56.8 s with 0 hits, and rivals lap it in 34–38 s on the physics. v2 under way:
  rolled curbs (the 12 cm vertical kerb trapped a car cutting a corner), a rubber trampoline,
  USAF set dressing.
- **M2 (original goal):** Blender district pipeline with collision and metadata, Base Housing driveable
  with gates.
- **M3 Race: done 2026-10-21.** AI rivals with corner braking, kid rubber-banding and bumping;
  pickups (Afterburner, Water Balloon, Hydraulic Leak, Chaff); the retreat event.
- **M4 Shell:** Area 51½ replaces Weekend Ride on the selector; base-map track select.
- **M5 School: built 2026-10-21.** LITTLE NELLIE ELEMENTARY (`?track=school`,
  `tools/rc/blender/districts/school.py`): lobby, locker hallway, science pocket (ALIEN BIOLOGY 101
  specimen), library shortcut, gym (gymfloor, parachute), cafeteria table tunnel, rubber-mulch
  playground with a racing-slide tabletop jump, monkey bars, sandbox, front walk with the planter
  run. Evidence in `evidence/area51/school/`. Not yet on the brief's track list (`index.html`).
- **M6+:** Flight Line, Offices, Commissary, the secret lab.

## Next direction: free roam, Forza Horizon style (owner, 2026-10-21)

Forza Horizon 5 is the target player's favourite game, so Area 51½ becomes a small open world:

- **Hub (`hub.glb`):** all of Little Nellie AFB, compressed like FH5's Mexico (about 30 s across at toy
  speed). Base roads link the housing streets, the BX car park and doors, the school, the flight line
  apron and the Area 51½ fence. Free driving, no laps.
- **Events:** glowing rings, as `EVENT_<id>` empties. Street races run on hub roads; their gates are
  `RACE_<id>_GATE_NN`, with their own `RACE_<id>_AI_NNN` line. Door events load an interior track
  (`?track=bx|school|housing`), and finishing returns you to the hub at that door (`?track=hub&from=bx`).
- **Discovery:** challenge coins and aliens spread across the hub, landmark boards, and later a
  progress level that unlocks more cars (FH5's collection loop).
- **Skill shortcuts (owner):** harder but faster ALT routes that need braking and throttle control.
  Falling off drops you onto the slower main route, never into a trap. Each has its own driving line,
  and ace rivals take them.
