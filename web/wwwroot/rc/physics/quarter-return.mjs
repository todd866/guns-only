// Arcade transition response, deliberately authored for play rather than realism.
// Head-on up a straight quarter: slow rolls onto the deck, fast gets one up/turn/return.
// A bowl wall always returns. Leaving the coping near vertical zeroes the across-ramp
// velocity (vert lock): straight up, 180° to face back down the same wall. A stick held
// toward the next ramp is still a transfer. The hip stays a bounded hop.
// An oblique launch off a quarter or the hip is a transfer: a bounded hop that faces
// along its travel and meets the face below. No repeat boosts.
import {dot, cross, add, sub, scale, norm, rotate, unrotate, quatAxisAngle} from './math.mjs';
import {alignCar, carForward, carUp, rideHeight} from './car.mjs';
import {TRANSITION_SURFACES} from './world.mjs';
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const horizontal = v => norm([v[0], 0, v[2]]);
// Where a ballistic hop from here first meets the world, traced with the car's centre: close
// enough to judge which face it comes down on.
function landing(world, pos, vel) {
  let p = pos;
  for (let t = 0.04; t < 2.4; t += 0.04) {
    const q = [pos[0] + vel[0] * t, pos[1] + vel[1] * t - 4.905 * t * t, pos[2] + vel[2] * t],
      d = sub(q, p),
      len = Math.hypot(...d);
    const hit = len > 1e-6 && world.raycast(p, scale(d, 1 / len), len);
    if (hit) return hit;
    p = q;
  }
  return null;
}
// A transfer must come down on floor, a deck or a face sloping away along its travel, never
// into a wall ahead. Shorten it first, then turn it a little, until it does.
function safeTransfer(world, pos, vel) {
  const good = v => {
    const h = landing(world, pos, v);
    return h && (h.normal[1] > 0.9 || dot(horizontal(h.normal), horizontal(v)) > 0.3);
  };
  for (const k of [0.9, 0.8, 0.7, 0.55, 0.4])
    for (const a of [0, 0.26, -0.26, 0.52, -0.52]) {
      const c = Math.cos(a),
        s = Math.sin(a),
        v = [(vel[0] * c - vel[2] * s) * k, vel[1], (vel[0] * s + vel[2] * c) * k];
      if (good(v)) return v;
    }
  return vel;
}
// Height of the flat deck beyond this lip, above the car. The hub bowl's deck is
// a few decimetres up. A pool coping is still about a metre above when the face
// is steep enough to pop, and that air has to reach it.
function deckAbove(world, car, inward) {
  const h = Math.hypot(inward[0], inward[2]) || 1,
    out = [-inward[0] / h, 0, -inward[2] / h];
  for (const step of [0.35, 0.7, 1.05]) {
    const origin = [car.pos[0] + out[0] * step, car.pos[1] + 2, car.pos[2] + out[2] * step],
      hit = world.raycast(origin, [0, -1, 0], 2.6);
    if (!hit) continue;
    const ny = hit.face?.[1] ?? hit.normal[1];
    if (ny > 0.85 && !TRANSITION_SURFACES.has(hit.surface)) return origin[1] - hit.dist - car.pos[1];
  }
  return 2;
}
export function stepQuarterReturn(state, car, raw, dt, world) {
  const wheels = car.wheels.filter(w => w.contact && TRANSITION_SURFACES.has(w.surface) && w.contactNormal);
  if (!state.arc) {
    // Kick turn: a car that stalls nose-up on a bowl or vert wall pops off it and turns to face
    // back down, instead of sliding back fakie into a throttle that drives it up again.
    const wall = wheels.filter(w => w.surface === 'bowl' || w.surface === 'vert');
    if (wall.length >= 2 && !state.armed && (raw.throttle ?? 0) > 0.2 && !raw.brake) {
      const n = norm(wall.reduce((sum, w) => add(sum, w.contactNormal), [0, 0, 0])),
        inward = horizontal(n);
      if (
        n[1] < 0.85 &&
        n[1] > 0.05 &&
        dot(horizontal(carForward(car)), inward) < -0.5 &&
        car.forwardSpeed < 0.5 &&
        car.vel[1] < 0.3
      ) {
        car.vel = add(scale(inward, 1.2), scale(n, 1.4));
        state.arc = {
          kind: 'return',
          returning: true,
          kick: true,
          yaw: Math.atan2(-inward[0], inward[2]),
          turn: raw.steer < -0.15 ? -1 : 1,
          time: 0
        };
      }
    }
  }
  if (!state.arc) {
    if (wheels.length >= 2 && car.forwardSpeed > 1) {
      const n = norm(wheels.reduce((sum, w) => add(sum, w.contactNormal), [0, 0, 0]));
      const inward = horizontal(n),
        forward = horizontal(carForward(car));
      // At the steep upper transition and climbing. A quarter returns only within ~25 degrees
      // of head-on; on a bowl wall any climb counts, since a car carving up at an angle points
      // sideways by the time it is vertical.
      const vert = wheels.some(w => w.surface === 'vert'),
        bowl = vert || wheels.some(w => w.surface === 'bowl'),
        hip = wheels.some(w => w.surface === 'hip');
      if (n[1] < 0.72 && n[1] > 0.01 && car.vel[1] > 1) {
        const kind = bowl ? 'return' : !hip && dot(forward, inward) < -0.9 ? 'face' : 'transfer';
        // The bowl collider meets the hip at the lip. A hip transfer stays a
        // transfer; rewriting it into a bowl vert strips the carry into the bowl.
        // Any other line is re-read, so a quarter that straightens becomes a return.
        // A head-on quarter stays a return even if the lip's normal turns.
        // A hip transfer stays a transfer when the bowl collider takes over.
        const keep =
          state.armed?.kind === 'face' ||
          (state.armed?.kind === 'transfer' && (state.armed.hip || kind === 'return'));
        if (!keep)
          state.armed = {
            kind,
            vert,
            hip,
            inward,
            normalY: n[1],
            yaw: Math.atan2(-inward[0], inward[2]),
            speed: Math.max(0, car.forwardSpeed),
            age: 0
          };
      } else if (hip && (!state.armed || state.armed.hip) && car.vel[1] > 0.15 && car.forwardSpeed > 2.5) {
        // The hip's low corner is gentle: rolled over at speed it still launches a real transfer.
        state.armed = {kind: 'transfer', hip: true, inward, normalY: n[1], yaw: 0, speed: car.forwardSpeed, age: 0};
      }
    }
    if (state.armed) {
      const nNow =
        wheels.length >= 2 ? norm(wheels.reduce((sum, w) => add(sum, w.contactNormal), [0, 0, 0])) : null;
      if (nNow && nNow[1] > 0.02) {
        state.armed.normalY = nNow[1];
        state.armed.inward = horizontal(nNow);
        if (state.armed.kind !== 'transfer') state.armed.yaw = Math.atan2(-state.armed.inward[0], state.armed.inward[2]);
      }
      // Stay armed for the whole climb. The old 0.25 s window assumed the car
      // bounced off as soon as the wall got steep.
      if (wheels.length >= 2 && car.vel[1] > 0) state.armed.age = 0;
      else state.armed.age += dt;
      const commit = (raw.throttle ?? 0) >= 0.48 || state.armed.speed > 7 || car.forwardSpeed > 7;
      // The hub bowl's lip is the upper wall, under the flat deck. Letting go
      // only once the face is past 70° rides some lines over the coping and out.
      const lipCut = state.armed.kind === 'return' && !state.armed.vert ? 0.5 : 0.4;
      const lip = !!(
        nNow &&
        commit &&
        state.armed.kind !== 'transfer' &&
        nNow[1] < lipCut &&
        car.vel[1] > 0.3 &&
        wheels.length >= 2
      );
      const fallingOff = car.vel[1] < (state.armed.hip ? -0.8 : 0);
      if ((state.armed.age > 0.25 && wheels.length < 2) || fallingOff) state.armed = null;
      else if (car.contacts === 0 || lip) {
        const a = state.armed;
        const deliberate = Math.abs(raw.steer || 0) > 0.45;
        if (a.kind === 'transfer' || deliberate) {
          // Keep the horizontal carry, cap the rise: the hop lands on the adjoining face or
          // floor rather than sailing across the bowl into the far wall.
          car.vel[1] = clamp(car.vel[1], a.hip ? 2.4 : 1.6, 3.2);
          if (world) car.vel = safeTransfer(world, car.pos, car.vel);
          state.arc = {kind: 'transfer', yaw: Math.atan2(car.vel[0], -car.vel[2]), time: 0};
          car.lipHold = 0.18;
        } else {
          const committed = (raw.throttle ?? 0) >= 0.48 || a.speed > 7 || car.forwardSpeed > 7;
          // A light car at a trickle can exceed 41% of its own top speed and
          // still be the slow run that should roll onto the deck.
          const returning =
              a.kind === 'return' ||
              (committed && a.speed >= Math.min(5.8, car.params.topSpeed * 0.41)),
            bowl = a.kind === 'return';
          const nearVert = (a.normalY ?? 1) < 0.5 || !!a.vert || (bowl && (a.normalY ?? 1) < 0.7);
          if (returning && nearVert && a.inward && (a.inward[0] || a.inward[2])) {
            // Vert lock: drop the into-wall speed so the pop is straight up.
            // A small along-lip remainder stays, or a carve at the corner is
            // frozen over the hip's gap box and scores a second transfer.
            const across = a.inward[0] * car.vel[0] + a.inward[2] * car.vel[2];
            car.vel[0] -= a.inward[0] * across;
            car.vel[2] -= a.inward[2] * across;
            // Hub bowl only: its deck is right there. A coping with a metre of
            // deck still above it, and a vert ramp, keep their along-lip speed.
            const room = world && a.inward ? deckAbove(world, car, a.inward) : 0;
            // The hub apron is a few decimetres above the lip. A brick bank's
            // coping is further, and the short hub pop never makes its air.
            const hubBowl = bowl && !a.vert && room < 0.62;
            if (hubBowl) {
              const along = Math.hypot(car.vel[0], car.vel[2]);
              if (along > 1.2) {
                car.vel[0] *= 1.2 / along;
                car.vel[2] *= 1.2 / along;
              }
            }
            // The hub lip is already near the deck, so that pop stays short enough
            // to come back down the same wall. A deep coping clears its lip at
            // 5.5. Flat-out on a vert is a two-second hang; under 9.5 m/s it
            // never gets there, which is what the old seam kick was faking.
            // Part throttle stays lower, or the hangar's off-centre tape stops
            // being a full-speed line.
            const flatOut = (raw.throttle ?? 0) >= 0.9 || a.speed > 10;
            const [lo, hi] = a.vert ? (flatOut ? [9.5, 11] : [5.5, 8]) : !hubBowl ? [5.5, 8] : [3.4, 4.2];
            car.vel[1] = clamp(Math.max(car.vel[1], 0), lo, hi);
            state.arc = {
              kind: 'return',
              returning: true,
              yaw: a.yaw,
              turn: raw.steer < -0.15 ? -1 : 1,
              time: 0,
              inward: a.inward,
              apex: car.vel[1] / 9.81,
              vert: true,
              // The half-pipe pose and the lip snap are for the hub bowl.
              // A vert ramp (the hangar) keeps the quarter return.
              bowl: bowl && !a.vert
            };
            car.lipHold = 0.22;
            // The hub bowl's ignore is short so the same wall can catch the
            // descent; 0.95 s fell through that floor. A full vert hang has to
            // stay off the face it just left until the parabola comes back.
            car.vertAir = a.vert ? (flatOut ? 1.85 : 0.95) : 0.42;
            car.pos = add(car.pos, scale(a.inward, 0.07));
          } else {
            const tangent = sub([car.vel[0], 0, car.vel[2]], scale(a.inward, dot(car.vel, a.inward)));
            const carry = bowl ? 0.5 : 1.2,
              drift = Math.hypot(...tangent) > carry ? scale(norm(tangent), carry) : tangent;
            const sideways = returning ? 0.65 : -1.8;
            const [lo, hi] = a.vert ? [5.5, 8] : bowl ? [4.2, 5.45] : returning ? [5.5, 8.5] : [2.2, 3.4];
            car.vel = [
              drift[0] + a.inward[0] * sideways,
              clamp(car.vel[1], lo, hi),
              drift[2] + a.inward[2] * sideways
            ];
            state.arc = {
              kind: returning ? 'return' : 'exit',
              returning,
              yaw: a.yaw,
              turn: raw.steer < -0.15 ? -1 : 1,
              time: 0,
              inward: a.inward,
              apex: car.vel[1] / 9.81,
              vert: returning && !(bowl && !a.vert)
            };
            car.lipHold = 0.16;
          }
        }
        state.armed = null;
      }
    }
  }
  const arc = state.arc;
  if (!arc) return null;
  if (arc.kind === 'transfer') car.transferSettle = true;
  arc.time += dt;
  arc.supported = car.contacts >= 2 ? (arc.supported ?? 0) + dt : 0;
  if ((arc.time > 0.16 && arc.supported > 0.22) || arc.time > 3) {
    state.arc = null;
    car.vertAir = 0;
    car.lipHold = 0;
    return null;
  }
  // After the pop the launch frame stays across-free. Once falling, ease back
  // onto the same face. A hard 3.4 m/s shove carried the bowl air off the wall
  // and into the flat floor, where the impact dumped the speed.
  if (arc.vert && arc.inward && car.vel[1] < 0.8 && world) {
    const below = world.raycast([car.pos[0], car.pos[1] + 0.15, car.pos[2]], [0, -1, 0], 8);
    // A gentle bank is not the wall. Cancelling the fall there left the car
    // hovering down a brick slope instead of finishing the air.
    const overFace = below && TRANSITION_SURFACES.has(below.surface) && below.normal[1] < 0.72;
    if (overFace && below.dist < 1.4) {
      const n = below.normal,
        vn = n[0] * car.vel[0] + n[1] * car.vel[1] + n[2] * car.vel[2];
      if (vn < 0) {
        car.vel[0] -= n[0] * vn;
        car.vel[2] -= n[2] * vn;
      }
      const along = arc.inward[0] * car.vel[0] + arc.inward[2] * car.vel[2];
      if (along < 3) {
        const blend = 1 - Math.exp(-5 * dt);
        car.vel[0] += arc.inward[0] * (3 - along) * blend;
        car.vel[2] += arc.inward[2] * (3 - along) * blend;
      }
    } else {
      const want = 1.6,
        have = arc.inward[0] * car.vel[0] + arc.inward[2] * car.vel[2],
        blend = 1 - Math.exp(-4 * dt);
      car.vel[0] += arc.inward[0] * (want - have) * blend;
      car.vel[2] += arc.inward[2] * (want - have) * blend;
    }
  }
  let yaw = arc.yaw;
  if (arc.kind === 'return') {
    const t = clamp(arc.time / (arc.bowl ? 0.65 : 0.45), 0, 1);
    yaw += Math.PI * arc.turn * t * t * (3 - 2 * t);
  }
  // A transfer faces along its travel, so it meets the landing face nose-down the slope.
  else if (arc.kind === 'transfer' && Math.hypot(car.vel[0], car.vel[2]) > 0.8)
    yaw = arc.yaw = Math.atan2(car.vel[0], -car.vel[2]);
  let targetUp = [0, 1, 0],
    aligning = false,
    clear = Infinity;
  if (world && arc.kind !== 'exit' && car.vel[1] < 0) {
    const ground = world.raycast(add(car.pos, [0, 0.3, 0]), [0, -1, 0], 8);
    if (ground && ground.normal[1] > 0.35) {
      targetUp = ground.normal;
      aligning = true;
      const clearance = (clear = ground.dist - 0.3 - rideHeight(car.params));
      // A tilted deck touches one wheel first. The bowl test counts that as the
      // end of the air and then misses the real four-wheel landing. Set the
      // whole car down once it is close and already above a gentle face.
      if (arc.vert && clearance < 0.16 && ground.normal[1] > 0.82 && arc.inward) {
        alignCar(car, ground.normal);
        car.ang = [0, 0, 0];
        const nrm = ground.normal,
          vn = dot(car.vel, nrm);
        if (vn < 0) {
          car.vel[0] -= nrm[0] * vn;
          car.vel[1] -= nrm[1] * vn;
          car.vel[2] -= nrm[2] * vn;
        }
        car.pos = [car.pos[0], ground.point[1] + rideHeight(car.params) + 0.004, car.pos[2]];
        // Only steer back down the launch wall when that direction still meets
        // the bowl. Past the far wall the same shove exits the park. A vert
        // ramp needs it too: the air's yaw otherwise lands facing along the
        // coping, and a straight run walks off the end.
        const dir = [arc.inward[0], 0, arc.inward[2]],
          ahead = world.raycast(add(car.pos, [0, 0.25, 0]), dir, 6);
        if (ahead && TRANSITION_SURFACES.has(ahead.surface)) {
          const yaw = Math.atan2(arc.inward[0], -arc.inward[2]);
          car.q = quatAxisAngle([0, 1, 0], -yaw);
          alignCar(car, ground.normal);
          const spd = Math.max(3.4, Math.hypot(car.vel[0], car.vel[2]));
          car.vel = [arc.inward[0] * spd, 0.15, arc.inward[2] * spd];
        }
      } else if (arc.returning && clearance < 0.8 && !arc.vert) {
        // Soften the last part of the descent and carry the saved approach energy
        // down the transition. This prevents a toy-suspension bounce from undoing
        // the turn; gravity and the real ramp still determine contact and position.
        car.vel[1] = Math.max(car.vel[1], -(2.4 + Math.max(0, clearance) * 3));
        const inward = [-Math.sin(arc.yaw), 0, Math.cos(arc.yaw)],
          blend = 1 - Math.exp(-7 * dt);
        car.vel[0] += (inward[0] * 3 - car.vel[0]) * blend;
        car.vel[2] += (inward[2] * 3 - car.vel[2]) * blend;
      }
    }
  }
  let forward = [Math.sin(yaw), 0, -Math.cos(yaw)];
  // Vert air (owner, 2026-10-30): out of a wall the car leaves nose-up with its wheels to the ramp,
  // turns left or right about its own up axis at the top, and comes back nose-down onto the wall,
  // the way a skater's frontside or backside air does. Steer chooses the side; the wheels stay
  // facing the ramp throughout, so it lands rolling.
  // The landing alignment takes over only in the last metre above the ramp.
  if (arc.bowl && arc.vert && arc.inward && !arc.kick && (car.vel[1] > 0 || !aligning || clear > 1.1)) {
    const s0 = clamp((arc.time - arc.apex * 0.45) / (arc.apex * 0.85), 0, 1),
      k = s0 * s0 * (3 - 2 * s0),
      side = scale(cross([0, 1, 0], arc.inward), arc.turn);
    forward = norm(add(scale([0, 1, 0], Math.cos(Math.PI * k)), scale(side, Math.sin(Math.PI * k))));
    // Falling back in, the nose tips from straight down toward the ramp's slope, so it re-enters
    // rolling down the transition rather than spearing it.
    const fall = clamp(-car.vel[1] / 7, 0, 1) * k;
    forward = norm(add(forward, scale(arc.inward, fall * 0.4)));
    targetUp = norm(add(arc.inward, scale([0, 1, 0], fall * 0.4)));
  }
  const targetForward = norm(sub(forward, scale(targetUp, dot(forward, targetUp))));
  const error = scale(add(cross(carForward(car), targetForward), cross(carUp(car), targetUp)), 0.5);
  // Bounded attitude acceleration: visibly rotate in flight and align to the landing face.
  let acceleration = sub(scale(error, 144), scale(car.ang, 20));
  // A vert air turns half a circle in about half a second: it gets more authority than a flat return.
  const cap = arc.vert ? 180 : 100,
    size = Math.hypot(...acceleration);
  if (size > cap) acceleration = scale(acceleration, cap / size);
  return rotate(
    car.q,
    unrotate(car.q, acceleration).map((v, i) => v / car.invInertia[i])
  );
}

const REENTRY = Math.cos(Math.PI / 4);
// A re-entry within about 45° of the surface snaps the deck down and keeps speed.
// Steeper than that is a short cartoon bail: a hop and a spin, then back on the wheels.
// Never a wedge and never a teleport home.
export function stepReentry(state, car, world, dt) {
  if (state.bail > 0) {
    state.bail -= dt;
    state.arc = null;
    car.vertAir = 0;
    if (state.bail > 0.14) {
      car.ang = [1.2, 7, 0.6];
      if (car.vel[1] < 1.4) car.vel[1] = 1.4;
      car.lipHold = 0.05;
      return true;
    }
    const g = world?.raycast([car.pos[0], car.pos[1] + 0.8, car.pos[2]], [0, -1, 0], 14);
    const n = g && g.normal[1] > 0.35 ? g.normal : [0, 1, 0];
    alignCar(car, n[1] > 0.75 ? n : [0, 1, 0]);
    if (g) car.pos = [car.pos[0], g.point[1] + rideHeight(car.params) + 0.04, car.pos[2]];
    const spd = Math.hypot(car.vel[0], car.vel[2]);
    const keep = Math.max(2.4, spd * 0.7);
    const fwd = carForward(car);
    const flat = Math.hypot(fwd[0], fwd[2]) || 1;
    const dir = spd > 0.4 ? [car.vel[0] / spd, 0, car.vel[2] / spd] : [fwd[0] / flat, 0, fwd[2] / flat];
    car.vel = [dir[0] * keep, 0.2, dir[2] * keep];
    car.ang = [0, 0, 0];
    car.lipHold = 0;
    state.bail = 0;
    state.bailed = true;
    state.airborne = 0;
    return true;
  }
  // Hub bowls sit near y = 0, so a body below that with nothing under it has
  // fallen through the shell. Grass around the neighbourhood park, and venues
  // whose datum is below zero, are down there on purpose. A hop still has a
  // surface within a few metres. The old 0.6 m ray only meant "standing on it",
  // so every air below zero looked like a fall. Nothing for 8 m is a fall.
  // A ceiling on the roof, with no floor under the wheels, is the shell itself.
  const under =
    world && world.raycast([car.pos[0], car.pos[1] + 0.15, car.pos[2]], [0, -1, 0], 8);
  const ceiling =
    world && world.raycast([car.pos[0], car.pos[1] + 0.02, car.pos[2]], [0, 1, 0], 0.35);
  const throughShell = !!(ceiling && ceiling.dist < 0.2 && (!under || under.dist > 0.5));
  if (car.pos[1] < -0.05 && (!under || throughShell)) {
    state.bail = 0.4;
    state.arc = null;
    car.vertAir = 0;
    car.lipHold = 0;
    return false;
  }
  if (car.contacts === 0) {
    state.airborne = (state.airborne ?? 0) + dt;
    // A steep deck over a transition bails before air-levelling can hide the angle
    // and before the car flies off the lip into a wedge. An arc owns its own landing.
    if (!state.arc && state.airborne > 0.04 && world) {
      const below = world.raycast([car.pos[0], car.pos[1] + 0.05, car.pos[2]], [0, -1, 0], 1.15);
      if (
        below &&
        below.dist < 1.05 &&
        TRANSITION_SURFACES.has(below.surface) &&
        // Upright over a steep wall is a fly-by, not a re-entry. The bad case
        // is a pitched deck (up.y around 0.6) aimed into the face.
        carUp(car)[1] < 0.75 &&
        dot(carUp(car), below.normal) < 0
      ) {
        state.bail = 0.42;
        state.armed = null;
      }
    }
    return false;
  }
  const was = state.airborne ?? 0;
  state.airborne = 0;
  if (was < 0.1 || state.arc) return false;
  const wheels = car.wheels.filter(w => w.contact && w.contactNormal);
  if (!wheels.some(w => TRANSITION_SURFACES.has(w.surface))) return false;
  const n = norm(wheels.reduce((s, w) => add(s, w.contactNormal), [0, 0, 0]));
  // Within about 75° the deck snaps down and keeps its speed. Only a deck
  // that is sideways or worse bails. The 45° bowl case is caught in the air,
  // before the wheels touch; a hip landing is often steeper than 45° and must ride.
  if (dot(carUp(car), n) >= 0.25) {
    alignCar(car, n);
    const vn = dot(car.vel, n);
    if (vn < 0) car.vel = sub(car.vel, scale(n, vn));
    return false;
  }
  state.bail = 0.42;
  state.armed = null;
  return false;
}
