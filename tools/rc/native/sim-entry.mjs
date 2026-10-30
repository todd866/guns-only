// The RC car physics for the native build: the browser's own physics modules, bundled into one
// script for JavaScriptCore (tools/rc/native/bundle-sim.sh). The native app hands over the
// exported collision triangles and steps the same session the browser steps, at 120 Hz.
import { createWorld } from '../../../web/wwwroot/rc/physics/world.mjs';
import { createSession, stepSession, readout, recover } from '../../../web/wwwroot/rc/physics/session.mjs';
import { toggleFlight } from '../../../web/wwwroot/rc/physics/flight.mjs';

let s = null, world = null;
globalThis.RCSim = {
  // tris: Float32Array (9 per triangle), surf: Uint8Array (index per triangle), surfaces: names.
  load(tris, surf, surfaces, flatGround, spawn, yaw) {
    world = createWorld();
    for (let i = 0, n = surf.length; i < n; i++) {
      const o = i * 9;
      world.addTri([tris[o], tris[o + 1], tris[o + 2]], [tris[o + 3], tris[o + 4], tris[o + 5]], [tris[o + 6], tris[o + 7], tris[o + 8]], surfaces[surf[i]]);
    }
    // Outside the residential terrain the browser's stream adds a virtual flat ground at y = 0.
    if (flatGround) { const [x, , z] = spawn, R = 3000; world.addQuad([x - R, 0, z - R], [x - R, 0, z + R], [x + R, 0, z + R], [x + R, 0, z - R], 'asphalt'); }
    s = createSession({ world, start: { pos: spawn, yaw }, checkpoints: [[spawn[0], spawn[2] - 500, 'finish']], secrets: [] }, { mode: 'kid' });
    s.roam = true; s.autoUnstick = true;
    return world.tris.length;
  },
  // Inputs in -1..1; steps fixed 1/120 s substeps covering dt.
  // Flight keys follow the guns-only jet: pitch (+ pull), roll (+ right), yaw, power, burner.
  step(throttle, steer, brake, drift, boost, pitch, roll, yaw, power, burner, dt) {
    if (!s) return;
    this.acc = (this.acc ?? 0) + Math.min(dt, .1);
    const flight = { pitch, roll, yaw, power, burner: !!burner };
    while (this.acc >= 1 / 120) { stepSession(s, { throttle, steer, brake: !!brake, drift: !!drift, boost, flight }, 1 / 120); this.acc -= 1 / 120; }
  },
  pose() { const c = s.car, r = readout(s); return [...c.pos, ...c.q, r.speed, r.yaw, s.flight.mode === 'fly' ? 1 : s.flight.mode === 'chute' ? 2 : 0]; },
  fly() { return toggleFlight(s.flight, s.car, { roam: true }); },
  // Distance to the first surface along a ray, or -1: the chase camera pulls in front of walls.
  raycast(ox, oy, oz, dx, dy, dz, max) { const h = world?.raycast([ox, oy, oz], [dx, dy, dz], max); return h ? h.dist : -1; },
  recover() { recover(s); },
};
