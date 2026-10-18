# Blacksite RC local prototype

Branch `feature/rc-blacksite`, based on clean `2ebac652`. This is a requested new prototype, not a change to public release status. No deployment or push.

## Play

From a running Guns Only build, press Escape, choose **RC base**, then **Take the transmitter**. The shell retains the current mission and adds its own `rc` pause reason; O / Return to flight destroys the RC frame and removes only that reason. The original pause menu remains in control. Entry also appears in the aircraft selector and debrief. This is a bounded base excursion, not a seamless transfer of the aircraft into the RC map.

For a lightweight local entry without compiling WASM, serve `web/wwwroot` and open `/rc/` (return goes to Guns Only). Example: `python3 -m http.server 8878 --directory web/wwwroot`.

W/S accelerate, brake into reverse; A/D steer; arrows also work. Space releases lateral grip and brakes; R recovers at the last checkpoint with a three-second penalty. Esc pauses. Touch controls have pointer capture and cancellation. Losing focus pauses and clears controls.

Eight sequential gates run through quarters, apron, open hangar, containment interior and service exit back to motor pool. Three original alien specimens reward exploration. Time trial records a local best and offers retry or continued exploration. Plywood ramps provide optional jumps. Houses, hangar/lab walls and perimeter bounds collide. Aircraft, poles and small dressing currently do not collide; the route permits driving beneath the parked aircraft.

## Engineering

The existing Indoor experience establishes the browser-only fixed-step pattern. `rc/sim.mjs` owns fixed 120 Hz vehicle state, collision, race time and discovery; Three.js only presents it. Vehicle dimensions, spring response, grip, acceleration and steering are **fiction**, tuned for a roughly 1:10 electric toy (0.75 m body, 11 m/s maximum), not measured RC physics. Suspension is an authored ground-height spring/ride-height model with visible pitch/roll and wheel movement, not a four-ray rigid-body suspension solver. No new package dependencies.

Seven Node tests cover pause ownership, iframe exit validation/disposal and deterministic tape replay, forward/reverse limits, steering, braking, wall collision, ballistic ramp jump/landing, full route completion by a steering controller without teleportation, recovery penalty and unique specimen discovery. Run `node --test web/wwwroot/rc/*.test.mjs`.

A bounded 960×640 headless Chromium smoke drove 12.88 m using W/D, advanced the housing gate and paused correctly; zero page errors. Renderer reported ANGLE Metal / Apple M5. This is not a performance benchmark. Evidence: `evidence/rc-driving.png` and `evidence/rc-smoke.json`.

Full .NET publish, release gate and integrated shell browser acceptance are pending the shared heavy-build slot. Direct RC browser smoke is separate evidence and does not certify the WASM shell integration or hardware performance.

## Asset and license record

All RC geometry, palette, signs, aliens, car, buildings, planes, track, UI and synthesized motor audio were authored procedurally for this feature and are covered by the repository MIT license. No downloads or generated external assets. Existing vendored Three.js retains its existing MIT notice. Re-Volt is inspiration only: no Re-Volt/RVGL code, trademarks in UI, tracks, sounds, textures or models are included. No cannon-es or Godot dependency.
