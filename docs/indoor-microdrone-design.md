# Indoor microdrone: fibre in, radio out

*2026-07-26. Owner direction: the next drone rung is inside large facilities — small remotely
controlled aircraft, a fibre-protected approach, smooth breakaway when the line catches, then a
short radio phase. Control should feel like Guns Only: W/S forward and back, A/D strafe, arrow keys
look and turn.*

## The playable thesis

The fibre is not a permanent leash. It is a protected ingress channel with an explicit bill:

1. **Optical ingress** is quiet and resistant to interference, but the route, reel length and
   snag tension constrain how the player flies.
2. **Breakaway** is continuous. A deliberate release or an overloaded coupler moves the same
   airframe into radio control without resetting velocity, aim or camera.
3. **Radio action** unlocks the gun and freedom of movement, exposes the relay, and starts a
   forty-five-second reliable operator-control window. As reception thins, command authority
   blends progressively into onboard flight assistance.
4. **Autonomous fallback** begins if the relay or command window is lost. The operator sees a
   choppy, increasingly stale video feed while the same airframe stabilizes, avoids nearby
   geometry, follows authored route nodes, aims and uses its remaining rounds against the next
   live objective.

The first facility is deliberately fictional and illustrative. Its vertical atrium bulkhead makes
the six-degree-of-freedom premise matter immediately; the precleared route climbs over it before
descending into the core rooms. Three abstract control cores and two unmanned sentries create a
complete first run without copying a real building or system.

## Controls

| Action | Input |
|---|---|
| Forward / reverse | **W / S** |
| Strafe left / right | **A / D** |
| Look up / down | **↑ / ↓** |
| Turn left / right | **← / →** |
| Climb / descend | **Space / Left Shift** |
| Gun | **F** or primary pointer |
| Fibre breakaway | **X** |

Mouse look is optional rather than captured at launch. Touch uses separate move/look pads with
height, fire and detach controls; gamepad uses the same translation/look split.

## Architecture

Indoor owns a small deterministic JavaScript kernel at `web/wwwroot/indoor/sim.js`. It shares the
fixed-step, presentation-independent values of the main simulation but does not pretend that a
microdrone is another fixed-wing `SimulationSession` beat. `FACILITY` is the immutable boundary
between the kernel and Three.js presentation: the same AABBs drive collision, projectile
occlusion, walls, doors and the local map.

The main catalogue links to `/indoor/` as a fourth experience. It deliberately has no
`data-program-node` or numeric beat, so the established aircraft mission lifecycle stays intact.

## What the first slice includes

- deterministic 3D movement, sliding collision and projectiles;
- fibre payout, snag zones, tension and automatic or manual breakaway;
- finite RF signal, relay integrity, a choppy held-frame video downlink and operator-control clock;
- deterministic flight-assist and best-effort autonomous objective pursuit after link loss;
- three control-core objectives, two sentries, limited ammunition and battery;
- route rings, live fibre, link/battery/integrity instruments and local geometry map;
- synthesized motor, reel, handoff, gun, hit, alarm and outcome audio;
- keyboard, pointer, touch and gamepad controls;
- success/failure debrief and automated kernel/browser contracts.

## Honest deferrals

The fibre is a bounded breadcrumb-and-tension model, not rope physics. Radio is a readable game
resource, not propagation analysis. The onboard controller is a deterministic route-and-objective
seeker with short collision probes, not general AI or a full navigation mesh. The relay is
represented through integrity and time pressure; a separately playable station defence,
procedural facilities, multiplayer teams and a shared WASM kernel are later rungs.
