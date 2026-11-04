import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {courseFromGlb, parseGlb, walkNodes} from './physics/district.mjs';
import {createSession, stepSession} from './physics/session.mjs';
import {carUp, placeCar, rideHeight} from './physics/car.mjs';

import {PARK_HIP_LINE, bankLocal, bankPoint} from './open-world/park-lines.mjs';
import {loadOpenWorld} from './open-world/runtime.js';
import {RESIDENTIAL_PARK, parkPoint} from './open-world/residential-frame.mjs';

const bytes = fs.readFileSync(new URL('./assets/districts/skatepark.glb', import.meta.url));
const course = courseFromGlb(bytes);

test('skatepark GLB includes the east bowl-to-quarter hip and separate modules', () => {
  const names = [];
  walkNodes(parseGlb(bytes), n => {
    if (n.name) names.push(n.name);
  });
  assert.ok(names.includes('COL_concrete_bowl_quarter_hip'));
  assert.ok(names.includes('COL_concrete_west_quarter'));
  assert.ok(names.includes('COL_concrete_central_high_table'));
  // The east hip is a sloping convex junction, not a vertical wall. Its
  // lower toe and upper ridge both have collision coverage in the exported GLB.
  const lowOrigin = bankPoint(6.35, 6.85);
  lowOrigin[1] = 3;
  const faceOrigin = bankPoint(7.1, 7.6);
  faceOrigin[1] = 3;
  const low = course.world.raycast(lowOrigin, [0, -1, 0], 4);
  const face = course.world.raycast(faceOrigin, [0, -1, 0], 4);
  assert.ok(low && face, 'east hip has continuous collision coverage');
  assert.ok(face.normal[1] > 0.55 && face.normal[1] < 0.99, `hip normal ${face.normal}`);
  assert.ok(face.point[1] > low.point[1] + 0.02, 'hip rises from its toe');
});

test('park modules share the floor without sealing the bowl hollow', () => {
  const ground = (u, v, height = 3) => {
    const p = bankPoint(u, v);
    p[1] = height;
    return course.world.raycast(p, [0, -1, 0], 4);
  };
  // These are the ordinary driving lanes between the photographed west,
  // central and east modules. They must remain continuous ground, not hidden
  // collision walls or gaps at the authored seams.
  for (const [u, v] of [
    [-11.8, 0],
    [-8.4, 6.2],
    [3.4, 4.2],
    [5.8, 9.9]
  ]) {
    const hit = ground(u, v);
    assert.ok(hit && hit.normal[1] > 0.85, `flat bypass at ${u},${v}`);
  }
  for (const u of [9, 10.8, 12.6])
    for (const v of [9, 10, 11.5]) {
      const hollow = ground(u, v);
      assert.ok(hollow && Math.abs(hollow.point[1] - 0.14) < 0.015, `bowl hollow remains low at ${u},${v}`);
    }
  const deck = ground(16, 10.2);
  assert.ok(deck, 'adjoining upper deck has collision');
  assert.ok(deck.point[1] > 0.8, `upper deck rises above hollow (${deck.point[1]})`);
  for (const u of [6.4, 7, 7.6, 8]) {
    const a = ground(u, 6.7 - 0.001),
      b = ground(u, 6.7 + 0.001);
    assert.ok(a && b && Math.abs(a.point[1] - b.point[1]) < 0.015, 'quarter/hip join has no ledge or hole');
  }
  for (const v of [6.9, 7.5, 8.1, 8.5]) {
    const a = ground(8.2 - 0.001, v),
      b = ground(8.2 + 0.001, v);
    assert.ok(a && b && Math.abs(a.point[1] - b.point[1]) < 0.015, 'hip/bowl join has no ledge or hole');
  }
  for (const v of [7.2, 8.2, 12.3, 13.3]) {
    const a = ground(13.4 - 0.001, v),
      b = ground(13.4 + 0.001, v);
    assert.ok(a && b && Math.abs(a.point[1] - b.point[1]) < 0.015, 'rounded bowl corner joins the wall');
  }
});

test('starter route stays on the low bypass lanes', () => {
  // Read the exported route used by the game, including every segment between
  // its samples. The car envelope is checked on both sides of the centreline.
  for (let i = 0; i < course.ai.length; i++) {
    const a = course.ai[i].pos,
      b = course.ai[(i + 1) % course.ai.length].pos;
    const dx = b[0] - a[0],
      dz = b[2] - a[2],
      length = Math.hypot(dx, dz);
    for (let d = 0; d <= length; d += 0.2)
      for (const side of [-0.3, 0, 0.3]) {
        const p = [
          a[0] + (dx * d) / length - (dz / length) * side,
          2,
          a[2] + (dz * d) / length + (dx / length) * side
        ];
        const hit = course.world.raycast(p, [0, -1, 0], 3);
        assert.ok(hit && hit.normal[1] > 0.8, `exported route has supported ground at ${p}`);
        assert.ok(hit.point[1] < 0.35, `exported route avoids a forced ramp: ${hit.point[1]}`);
        const wall = course.world.raycast(
          [p[0], hit.point[1] + 0.12, p[2]],
          [dx / length, 0, dz / length],
          0.2
        );
        assert.ok(!wall || wall.normal[1] > 0.8, 'ordinary route does not cross a collision skirt');
      }
  }
});

test('the optional hip line also has a clear landing in the complete open world', async () => {
  const oldFetch = globalThis.fetch;
  let world;
  globalThis.fetch = async url => new Response(fs.readFileSync(new URL(String(url), import.meta.url)));
  try {
    world = await loadOpenWorld('');
    const session = createSession(world.course, {mode: 'kid'});
    session.roam = true;
    placeCar(
      session.car,
      parkPoint([PARK_HIP_LINE.entry[0], 0.14 + rideHeight(), PARK_HIP_LINE.entry[2]]),
      PARK_HIP_LINE.yaw - RESIDENTIAL_PARK.yaw
    );
    const {anchor, yaw} = RESIDENTIAL_PARK,
      c = Math.cos(yaw),
      s = Math.sin(yaw);
    const local = p => [
      (p[0] - anchor[0]) * c - (p[2] - anchor[2]) * s,
      p[1],
      (p[0] - anchor[0]) * s + (p[2] - anchor[2]) * c
    ];
    let flight = 0,
      longest = 0,
      landing = false,
      landingUp = 0,
      landingSpeed = 0;
    for (let frame = 0; frame < 360; frame++) {
      stepSession(session, {throttle: 0.65, steer: 0}, 1 / 120);
      if (!session.car.grounded) flight++;
      else {
        longest = Math.max(longest, flight);
        if (flight > 24) {
          landing = true;
          landingUp = carUp(session.car)[1];
          landingSpeed = session.car.speed;
          break;
        }
        flight = 0;
      }
    }
    const position = bankLocal(local(session.car.pos));
    assert.ok(longest > 24 && landing, 'ordinary throttle crosses the hip in the complete world');
    assert.ok(position[0] > 8.2 && position[1] > 8.2, 'the adjoining bowl/quarter has a clear runout');
    assert.ok(landingUp > 0.9 && landingSpeed > 2, 'complete world hip lands upright with momentum');
    for (let frame = 0; frame < 60; frame++) {
      stepSession(session, {throttle: 0, steer: 0, brake: true}, 1 / 120);
      assert.ok(carUp(session.car)[1] > 0.9, 'complete-world landing remains upright under braking');
    }
    assert.equal(session.recoveries, 0);
    assert.equal(session.hits, 0);
  } finally {
    world?.dispose();
    globalThis.fetch = oldFetch;
  }
});

for (const throttle of [0.45, 0.65, 1])
  test(`ordinary throttle ${throttle} transfers across the hip and drives out`, t => {
    const session = createSession(course, {mode: 'kid'});
    session.roam = true;
    const {entry, yaw} = PARK_HIP_LINE;
    placeCar(session.car, [entry[0], 0.14 + rideHeight(), entry[2]], yaw);
    let previous = false,
      flight = null,
      transfer = null,
      peakClearance = 0;
    for (let frame = 0; frame < 360; frame++) {
      stepSession(session, {throttle, steer: 0}, 1 / 120);
      const car = session.car,
        p = car.pos,
        local = bankLocal(p);
      if (previous && !car.grounded && !transfer) {
        const onHip = local[0] > 6.2 && local[0] < 8.25 && local[1] > 6.65 && local[1] < 8.75;
        if (onHip) flight = {frame, from: [...p], local, speed: car.speed};
      }
      if (flight && !car.grounded) {
        const ground = course.world.raycast([p[0], p[1] + 0.1, p[2]], [0, -1, 0], 4);
        if (ground) peakClearance = Math.max(peakClearance, p[1] - ground.point[1] - rideHeight());
      }
      if (flight && car.grounded && car.contacts >= 2) {
        transfer = {
          ...flight,
          to: [...p],
          landing: local,
          air: (frame - flight.frame) / 120,
          speedAfter: car.speed,
          upright: carUp(car)[1]
        };
        flight = null;
        break;
      }
      previous = car.grounded;
    }
    assert.ok(transfer, 'the full exported collider produces a transfer');
    const distance = Math.hypot(transfer.to[0] - transfer.from[0], transfer.to[2] - transfer.from[2]);
    t.diagnostic(
      JSON.stringify({
        throttle,
        distance,
        from: transfer.from,
        to: transfer.to,
        air: transfer.air,
        landing: transfer.landing
      })
    );
    assert.ok(distance > 1.1 && distance < 6, 'a transfer spans several car lengths, not a seam bounce');
    assert.ok(
      transfer.air > 0.2 && transfer.air < 0.8,
      'continuous airborne interval is a visible, controlled hop'
    );
    assert.ok(peakClearance > 0.16, 'the car clears the bank');
    assert.ok(transfer.local[0] > 6.2 && transfer.local[1] > 6.65, 'launches from the east hip');
    if (throttle < 1)
      assert.ok(
        transfer.landing[0] > 8.2 && transfer.landing[1] > 8.2,
        'moderate throttle lands beyond the east hip'
      );
    assert.ok(
      transfer.speedAfter > transfer.speed * 0.8 && transfer.speedAfter > 2,
      'landing preserves momentum'
    );
    assert.ok(transfer.upright > 0.9, `stable landing up=${transfer.upright}`);
    const hitsAtLanding = session.hits,
      recoveriesAtLanding = session.recoveries;
    let stableFrames = 0,
      longestStable = 0;
    for (let frame = 0; frame < 120; frame++) {
      stepSession(session, {throttle: 0, steer: 0, brake: true}, 1 / 120);
      const up = carUp(session.car),
        p = session.car.pos;
      const support = course.world.raycast([p[0], p[1] + 0.3, p[2]], [0, -1, 0], 2);
      const aligned = support ? up.reduce((sum, x, i) => sum + x * support.normal[i], 0) : up[1];
      assert.ok(up[1] > 0.75 && aligned > 0.85, 'landing follows the bowl surface while braking');
      stableFrames = session.car.grounded && session.car.contacts >= 2 ? stableFrames + 1 : 0;
      longestStable = Math.max(longestStable, stableFrames);
    }
    assert.ok(
      longestStable >= 60,
      `landing settles into a continuous half-second of support (${longestStable}/60 frames)`
    );
    assert.equal(session.hits, hitsAtLanding, 'braked runout has no hull impact');
    assert.equal(session.recoveries, recoveriesAtLanding, 'braked runout needs no recovery');
    assert.equal(session.recoveries, 0);
    assert.equal(session.hits, 0, 'clear runout without hull strikes');
    t.diagnostic(
      JSON.stringify({throttle, distance, air: transfer.air, peakClearance, upright: transfer.upright})
    );
  });

// Owner, 2026-10-28: "fairly simple to drive back and forth on the halfpipe, especially the hip
// transfer". Scripted kid drivers hold one throttle and never steer.
const parkYaw = (du, dv) => {
  const a = bankPoint(du, dv),
    o = bankPoint(0, 0);
  return Math.atan2(a[0] - o[0], -(a[2] - o[2]));
};
function holdThrottle(u, v, du, dv, throttle, seconds) {
  const s = createSession(course, {mode: 'kid'});
  s.roam = true;
  const p = bankPoint(u, v);
  p[1] = course.world.raycast([p[0], 4, p[2]], [0, -1, 0], 6).point[1] + rideHeight() + 0.01;
  placeCar(s.car, p, parkYaw(du, dv));
  let air = 0,
    minUp = 1;
  const landings = [];
  for (let frame = 0; frame < seconds * 120; frame++) {
    stepSession(s, {throttle, steer: 0}, 1 / 120);
    if (!s.car.grounded) {
      air++;
      continue;
    }
    minUp = Math.min(minUp, carUp(s.car)[1]);
    if (air > 20) landings.push({at: bankLocal(s.car.pos), up: carUp(s.car)[1], speed: s.car.speed});
    air = 0;
  }
  return {s, landings, minUp, end: bankLocal(s.car.pos)};
}
const inBowl = ([u, v]) => u > 7.8 && u < 15.4 && v > 6.7 && v < 13.8;

for (const throttle of [0.5, 0.7, 1])
  test(`held throttle ${throttle} rides the bowl back and forth`, () => {
    const {s, landings} = holdThrottle(10.8, 10.25, 0, -1, throttle, 11);
    assert.ok(landings.length >= 4, `four wall-to-wall returns in 11 s (${landings.length})`);
    for (const l of landings) {
      assert.ok(inBowl(l.at), `returns land back in the bowl ${l.at}`);
      assert.ok(
        l.up > 0.85 && l.speed > 2.5,
        'each return lands wheels-down with speed to reach the far wall'
      );
    }
    const walls = landings.map(l => (l.at[1] < 10.25 ? 'south' : 'north'));
    assert.ok(
      walls.every((w, i) => !i || w !== walls[i - 1]),
      `alternates walls: ${walls}`
    );
    assert.equal(s.hits, 0);
    assert.equal(s.recoveries, 0);
  });

test('a high transfer over the hip lands in the bowl and keeps riding it', () => {
  // Up the east quarter at an angle toward the hip corner, across speeds and lines.
  for (const angle of [35, 45, 55])
    for (const aim of [3.5, 5.5])
      for (const throttle of [0.6, 1]) {
        const a = (angle * Math.PI) / 180,
          du = Math.cos(a),
          dv = Math.sin(a);
        const {s, landings, minUp, end} = holdThrottle(7.4 - du * 4.5, aim - dv * 4.5, du, dv, throttle, 6);
        const label = `${angle}° aim ${aim} throttle ${throttle}`;
        assert.ok(landings.length && inBowl(landings[0].at), `${label}: transfer lands in the bowl`);
        assert.ok(minUp > 0, `${label}: never rolls over (${minUp})`);
        assert.ok(inBowl(end), `${label}: still riding the bowl at the end ${end}`);
        assert.equal(s.hits, 0, label);
        assert.equal(s.recoveries, 0, label);
      }
});

test('the plaza is cut into a slope: lawn meets the coping behind the bowl, quarter and deck', () => {
  // Owner, 2026-10-28: "the top of the bowl is basically level with the grass".
  const ground = (u, v) => {
    const p = bankPoint(u, v);
    p[1] = 4;
    return course.world.raycast(p, [0, -1, 0], 6);
  };
  for (const [u, v] of [
    [11, 15.6],
    [18.2, 10],
    [-18.4, 0],
    [18.5, 5]
  ]) {
    const hit = ground(u, v);
    assert.ok(
      hit && Math.abs(hit.point[1] - 1.54) < 0.12,
      `lawn at coping height behind the park at ${u},${v}: ${hit?.point[1]}`
    );
  }
  for (const [u, v] of [
    [0, -6],
    [3, 8],
    [-8, -1]
  ])
    assert.ok(Math.abs(ground(u, v).point[1] - 0.14) < 0.01, `plaza floor stays level at ${u},${v}`);
});
