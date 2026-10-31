// The walking robot: the same toy unfolded (docs/design/adventure). A kinematic character in the
// shared physics world, in the Ocarina style a 6-year-old can manage:
// - W/S walk along the facing, A/D turn (the car's controls, so switching never changes the keys);
// - steps up kerbs on its own, and auto-climbs a ledge up to chest height when you walk into it;
// - crouches through gaps lower than it is tall, and stands again when there's room;
// - Space jumps; falling is gentle, and there is no fall damage (it's a toy).
import {add, sub, scale, dot, len} from './math.mjs';

export const ROBOT = Object.freeze({
  height: 0.3,
  crouch: 0.16,
  radius: 0.07,
  walk: 1.6,
  crawl: 0.7,
  turn: 3.2,
  accel: 12,
  gravity: 9.81,
  jump: 2.4,
  step: 0.07,
  climbReach: 0.42,
  climbTime: 0.45, // a ledge up to 42 cm above the feet (a toy is ~30 cm tall)
  floorNormal: 0.7
});

export function createRobot(pos, yaw = 0) {
  return {
    pos: [...pos],
    vel: [0, 0, 0],
    yaw,
    grounded: false,
    crouched: false,
    climb: null,
    surface: null,
    walkPhase: 0
  };
}

const fwdOf = yaw => [Math.sin(yaw), 0, -Math.cos(yaw)];
const ground = (world, p, from, reach) => world.raycast([p[0], from, p[2]], [0, -1, 0], reach);

// Is there room to stand (or crouch) at p? Probes a vertical stack of spheres up to `h`.
function clearAt(world, p, h) {
  // At least one probe, however short the span (a crawl space checked above the step height is
  // shorter than the probe's diameter, and an empty loop would always say "clear").
  const r = Math.min(ROBOT.radius * 0.9, Math.max(0.02, h / 2)),
    top = Math.max(r, h - r),
    ys = [];
  for (let y = r; y < top; y += r) ys.push(y);
  ys.push(top);
  for (const y of ys)
    if (world.sphereContacts([p[0], p[1] + y, p[2]], r).some(c => c.depth > 0.01)) return false;
  return true;
}

/** One step. input = { throttle, steer, jump }. Returns events: { climbed, landed }. */
export function stepRobot(r, input = {}, world, dt = 1 / 120) {
  const ev = {};
  // Finishing a ledge climb: an eased lift, then a step onto the top.
  if (r.climb) {
    r.climb.t += dt;
    const k = Math.min(1, r.climb.t / ROBOT.climbTime),
      e = k * k * (3 - 2 * k);
    r.pos = add(r.climb.from, scale(sub(r.climb.to, r.climb.from), e));
    if (k >= 1) {
      r.climb = null;
      r.vel = [0, 0, 0];
      r.grounded = true;
      ev.climbed = true;
    }
    return ev;
  }
  const steer = Math.max(-1, Math.min(1, input.steer || 0)),
    throttle = Math.max(-1, Math.min(1, input.throttle || 0));
  r.yaw += steer * ROBOT.turn * dt * (throttle < 0 ? -1 : 1);
  const fwd = fwdOf(r.yaw),
    speed = (r.crouched ? ROBOT.crawl : ROBOT.walk) * throttle * (throttle < 0 ? 0.6 : 1);
  // Horizontal velocity eases toward the wanted walk; in the air there is a little control.
  const want = scale(fwd, speed),
    a = Math.min(1, ROBOT.accel * dt * (r.grounded ? 1 : 0.25));
  r.vel[0] += (want[0] - r.vel[0]) * a;
  r.vel[2] += (want[2] - r.vel[2]) * a;
  if (r.grounded && input.jump && !r.crouched) {
    r.vel[1] = ROBOT.jump;
    r.grounded = false;
  }
  r.vel[1] -= ROBOT.gravity * dt;

  // Move horizontally, sliding along walls; walking into a ledge within reach starts a climb.
  const next = [r.pos[0] + r.vel[0] * dt, r.pos[1], r.pos[2] + r.vel[2] * dt];
  const fits = (p, h) => clearAt(world, [p[0], p[1] + ROBOT.step, p[2]], h - ROBOT.step);
  // Walk standing if there's room, else duck into a crawl space if that fits.
  const h = fits(next, ROBOT.height) ? ROBOT.height : fits(next, ROBOT.crouch) ? ROBOT.crouch : null;
  if (h === null) {
    const ahead = add(r.pos, scale(fwd, ROBOT.radius * 2.2)),
      top = ground(world, ahead, r.pos[1] + ROBOT.climbReach + 0.05, ROBOT.climbReach + 0.05);
    const rise = top ? top.point[1] - r.pos[1] : 0;
    if (
      throttle > 0.3 &&
      r.grounded &&
      top &&
      top.normal[1] > ROBOT.floorNormal &&
      rise > ROBOT.step &&
      rise <= ROBOT.climbReach &&
      clearAt(world, top.point, ROBOT.crouch)
    ) {
      r.climb = {from: [...r.pos], to: [...top.point], t: 0};
      r.vel = [0, 0, 0];
      ev.climbing = true;
      return ev;
    }
    // Slide: try each axis on its own, then stop.
    const xOnly = [next[0], r.pos[1], r.pos[2]],
      zOnly = [r.pos[0], r.pos[1], next[2]];
    if (fits(xOnly, ROBOT.crouch)) {
      r.pos[0] = next[0];
      r.vel[2] = 0;
    } else if (fits(zOnly, ROBOT.crouch)) {
      r.pos[2] = next[2];
      r.vel[0] = 0;
    } else {
      r.vel[0] = 0;
      r.vel[2] = 0;
    }
  } else {
    r.pos[0] = next[0];
    r.pos[2] = next[2];
  }

  // Vertical: fall, or land on (and step up onto) the ground under the feet.
  const fallTo = r.pos[1] + r.vel[1] * dt,
    hit = ground(
      world,
      r.pos,
      r.pos[1] + ROBOT.step + 0.02,
      ROBOT.step + 0.02 + Math.max(0, -r.vel[1] * dt) + 0.002
    );
  if (hit && hit.normal[1] > ROBOT.floorNormal && r.vel[1] <= 0 && hit.point[1] >= fallTo - 1e-4) {
    if (!r.grounded && r.vel[1] < -1) ev.landed = true;
    r.pos[1] = hit.point[1];
    r.vel[1] = 0;
    r.grounded = true;
    r.surface = hit.surface;
  } else {
    // A ceiling stops a jump.
    if (
      r.vel[1] > 0 &&
      world.raycast(
        [r.pos[0], r.pos[1] + (r.crouched ? ROBOT.crouch : ROBOT.height) - 0.01, r.pos[2]],
        [0, 1, 0],
        r.vel[1] * dt + 0.02
      )
    )
      r.vel[1] = 0;
    r.pos[1] = fallTo;
    r.grounded = false;
  }
  // Crouch when only a crawl space is free above; stand again when there's room.
  // (Overhead only: a wall beside the robot is not a reason to crouch.)
  const head = world.raycast(
    [r.pos[0], r.pos[1] + ROBOT.crouch - 0.02, r.pos[2]],
    [0, 1, 0],
    ROBOT.height - ROBOT.crouch + 0.02
  );
  r.crouched = r.grounded && !!head;
  r.walkPhase += len([r.vel[0], 0, r.vel[2]]) * dt * 9;
  return ev;
}
