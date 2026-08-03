# Weekend Ride: YZF-R1 on the 10,000 ft runway

Date: 2026-08-03  
Status: accepted design, not yet implemented

Related: [product north star](../../product-north-star.md),
[platform architecture](../../platform-architecture.md),
[systems simulation](../../systems-simulation.md),
[STATUS](../../STATUS.md),
Rapier runway contract in `docs/airframes/rapier-v2/`

## Problem / opportunity

Guns Only’s distinctive control idea is split authority: one hand (or key cluster) flies the
machine, another shapes the body/attitude demand that makes the machine work at the limit. A
liter-bike maps cleanly onto that split—WASD for throttle, brake, and steering; arrow keys for
rider weight shift—while a helmet-first view at high lean angles forces the same spatial skill the
aircraft HUD already trains.

The fiction fits without inventing a new theatre: fighter pilots ride on weekends; the existing
3,048 m (10,000 ft) runway becomes a painted circuit for an off-duty ride.

## Product slice

**Weekend Ride** is a third production front-door mode beside F-22 Guns Only and Rapier Intercept:

- free-drive a sourced Yamaha YZF-R1;
- painted circuit on the existing Rapier-strip runway pavement;
- no combat, economy, AI traffic, or campaign layer in v1;
- soft outcomes only (optional lap timing, off-track feedback, tip-over reset).

Intended release class is **production** (aircraft picker). Promotion still obeys STATUS: the mode
may exist in-tree, but it is not advertised as finished until physics, controls, HUD, automation,
and a representative human ride clear the same bar as the other production modes.

## Approach

Dedicated motorcycle lane (not a fixed-wing hack, not a feel-first arcade prototype):

| Piece | Ownership |
| --- | --- |
| Rider/bike dynamics | `sim/Motorcycle/` at fixed 120 Hz |
| Vehicle sources / epistemics | `docs/vehicles/yamaha-yzf-r1/` |
| Mission | painted-circuit free ride on existing runway origin/heading |
| Presentation contract | bike-specific snapshot fields |
| Helmet HUD + camera | `web/` consumes snapshots only |

Shared with the platform: runway/terrain geography, `SimulationSession` lifecycle, semantic input,
snapshot/render pipeline, determinism tests. Not shared: fixed-wing aero, combat, padlock, gun
symbology.

## Controls

| Input | Action |
| --- | --- |
| W / S | throttle / brake |
| A / D | steering (bar) |
| ← / → | lateral rider weight shift |
| ↑ / ↓ | fore/aft rider weight shift |
| Q / E | sequential gear down / up |
| Left Shift (advanced) | manual clutch when enabled |

Powertrain modes:

1. **Default** — sequential gears with auto-clutch.
2. **Advanced setting** — manual clutch + same shift keys.

Mode is authoritative in the simulation and published on the snapshot/HUD.

Desktop keyboard is the v1 production path. Phone two-stick mapping is deferred until the physics
and HUD are honest.

## Camera

First-person helmet view only in v1:

- primarily bike-fixed so high lean visibly banks the world;
- slight head stabilization damps a fraction of roll for readability;
- no chase camera.

Lean is learned through the view; HUD lean readout is confirmatory, not an autopilot director.

## Physics (Yamaha YZF-R1)

v1 models a full rider/bike system:

1. **Chassis** — mass, inertia, wheelbase, rake/trail, CG height; quaternion attitude; float64
   state at 120 Hz.
2. **Rider mass** — first-class CG offsets from arrow keys; lateral shift couples into lean/steer;
   fore/aft into normal load and pitch (including wheelie/stoppie at the limit).
3. **Suspension** — front fork and rear shock with travel limits, spring/damper, and enough
   brake/throttle pitch coupling to matter.
4. **Tires** — load-sensitive grip, camber thrust, combined slip; lowsides/highsides emerge from
   the contact model, not scripted fails.
5. **Powertrain** — engine map, sequential gearbox, final drive; auto-clutch default; optional
   manual clutch with real engagement.
6. **Ground** — runway plane as hard surface; painted track is course geometry and feedback, not a
   different material in v1.

Every numeric claim carries an epistemic label (`measured` / `surrogate` / `provisional`) and a
sources record. Missing OEM numbers stay explicitly unknown or surrogate with a validation target;
silent invented precision is forbidden.

### Rider reflex assists (two separate channels)

These are small, explicit simulation aids that stand in for rider neuromuscular reflexes. They are
not ABS/TC electronics packs and must publish their contribution on the snapshot.

1. **Pitch-balance reflex (wheelie / stoppie)** — When pitch is near the rear-wheel (wheelie) or
   front-wheel (stoppie) balance point, apply bounded pitch-rate damping so the bike can be held
   briefly the way a rider’s wrists and body micro-correct. Far from the balance point the assist
   is zero; at the point it peaks at a modest fraction of authority. It never invents free energy
   or prevents a committed loop-out / endo.

2. **Lean-hold reflex (knee-down)** — Knee-down is a **cornering** state only: high lean plus
   coordinated lateral weight shift with the knee near the pavement. It is not part of wheelies or
   stoppies. While knee-down is latched, increase roll-rate damping / lean confidence so holding a
   deep carve with correct body position is slightly easier than the same lean with the rider
   upright. Leaving the lean/weight window clears the latch with short hysteresis.

3. **Cerebellar skill + CoG envelope** — A physics-sized contact-plane CoG envelope (speed/grip
   shrink it) marks where weight can sit without trouble. Session skill grows from time spent
   inside that envelope without sliding. Skill **mostly** amplifies pitch/lean reflex assist
   inside the envelope (cerebellum), and **only slightly** widens the envelope. Outside, assist
   fades and the tire model still bites. Tip-over penalises skill.

Out of scope for v1: tire temperature/wear campaigns, full rider electronics packs (ABS/TC) unless
later added as optional aids, multi-rider drafting, cross-session damage persistence, grass/dirt
surface models.

## Track and mission loop

- Circuit is **paint on the existing pavement**: centerline, braking markers, esses / hairpin /
  chicanes sized to the strip.
- No new scenery mesh required for v1; existing runway/terrain carry the world.
- Lifecycle: Ready → Active free ride from a grid near the threshold → pause/finish.
- Soft outcomes: optional lap timer, off-track time, tip-over/crash reset to the start grid.
  No combat win/lose.

## HUD

Helmet-first cold instruments:

- speed;
- RPM with shift lights;
- gear and clutch mode;
- lean angle;
- throttle / brake bars;
- simple track map or next-apex cue;
- **pitch-balance tape** — proximity to wheelie (rear) and stoppie (front) balance points, driven
  by sim pitch / normal-load state (e.g. how close the unloaded contact is to leaving the surface).
  The tape shows the balance band where the pitch reflex is active; it does not steer for the
  rider;
- **knee-down cue** — visible only in the cornering regime when the sim latches knee-down; also
  indicates that lean-hold stabilization is elevated. No knee-down symbology during wheelies or
  stoppies;
- **contact-patch instrument** — top-down front/rear contact ellipses with (1) grip-use heatmap
  scaled by normal load, (2) longitudinal and lateral force arrows per patch, and (3) a combined
  bike+rider CoG marker between the patches that moves with weight shift and load transfer.
  Presentation draws only sim-authored patch forces, grip fractions, and CoG offsets.

Aircraft gun funnel, padlock SA, and fight directors do not appear.

## Snapshot contract (minimum)

The presentation snapshot must be able to carry, without presentation inventing truth:

- chassis pose and velocity;
- head-stabilized view attitude (sim-authored);
- lean angle;
- rider CG offset (lateral, fore/aft);
- gear, clutch mode, clutch engagement, RPM, throttle, brake;
- front/rear normal load and a bounded grip/slip summary suitable for HUD/debug;
- per-patch longitudinal and lateral forces, per-patch grip-use fraction (0..1), and contact-plane
  CoG offsets (along-wheelbase from rear axle, lateral);
- pitch-balance metrics: signed proximity to wheelie and stoppie balance points (−1..+1 or
  equivalent), plus the pitch-reflex authority currently applied;
- knee-down latch boolean, knee proximity, and lean-hold reflex authority currently applied;
- track progress / lap timing fields when the mission enables them;
- tip-over / reset state.

## Testing and production gate

Headless fixed-tick tests own:

- mass/inertia response;
- lean under lateral CG shift;
- braking load transfer;
- gear ratios and rev limits;
- auto vs manual clutch paths;
- tip-over and reset;
- pitch-balance reflex engages near wheelie/stoppie equilibrium and is idle far away;
- knee-down latches only with high lean + lateral weight shift, never from pitch alone;
- lean-hold authority rises while knee-down is latched;
- determinism (same seed + inputs → identical snapshots).

Golden paths at minimum: straight acceleration, steady-state lean on a constant radius,
trail-braking entry, tip-over and reset, hold a wheelie near balance with reflex assist,
knee-down latch under coordinated lean and weight shift.

Presentation harness asserts HUD and camera consume snapshot fields only.

Player-path acceptance: one representative human weekend ride on the exact production artifact
before picker promotion. Diagnostics remain opt-in; core play does not require central telemetry.

## Planning tests (north star)

| Question | Answer |
| --- | --- |
| Which role? | Horizontal mastery / playful off-duty craft adjacent to the flyer |
| First-person decision? | Trail-brake, lean, weight shift, and shift timing on a real contact patch |
| World connection? | Same runway geography as the Rapier strip; squadron weekend fiction |
| Beautiful world / cold instruments? | Banked runway world vs helmet instruments |
| Repeatable practice? | Free ride + optional laps; deterministic replays |
| Telemetry? | Opt-in ride traces: lean, slip, inputs, tip-overs, lap sectors |
| Epistemics? | R1 sources bible; no silent fiction |

## Non-goals

- Shipping an arcade bike to “get something playable” and replacing physics later.
- Folding motorcycle dynamics into fixed-wing aero helpers.
- Production picker promotion before the acceptance gate above.
- Phone-first control design in v1.
- Combat, traffic, or economy on the track in v1.
