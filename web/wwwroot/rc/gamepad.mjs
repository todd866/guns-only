// Standard layout for the 8BitDo Ultimate 2 (Xbox letters, Gamepad API "standard" indices):
// A0 B1 X2 Y3 LB4 RB5 LT6 RT7 Select8 Start9 L3 10 R3 11, d-pad 12-15,
// axes 0/1 left stick, 2/3 right stick.
// The left stick is never both steering and throttle. Where RT is the throttle,
// pushing the stick up does nothing to the speed.
export const STICK_DEAD = 0.15;

export function stickAxis(v) {
  v = Number.isFinite(v) ? Math.max(-1, Math.min(1, v)) : 0;
  return Math.abs(v) < STICK_DEAD ? 0 : (Math.sign(v) * (Math.abs(v) - STICK_DEAD)) / (1 - STICK_DEAD);
}

// plane / gunship / chopper / chute share the arcade row: stick up climbs, shoulders yaw.
export function normalizeForm(form) {
  if (form === 'robot' || form === 'foot' || form === 'walk') return 'robot';
  if (form === 'board' || form === 'skate') return 'board';
  if (form === 'chopper') return 'chopper';
  if (form === 'fly' || form === 'plane' || form === 'gunship' || form === 'chute') return 'fly';
  return 'car';
}

const button = (p, i) => Math.max(0, Math.min(1, p?.buttons?.[i]?.value ?? 0));
const down = (p, i) => button(p, i) > 0.5;

/**
 * One pad, one form. Sticks are analog (−1..1). Face buttons are held, not edges.
 * Left stick Y is positive when the stick is pushed up (the API's axis 1 is the other way).
 * Right stick Y is positive when the stick is pushed up: look up, no inversion.
 * Flight pitch is positive for nose up. Stick up climbs; invert is applied later.
 */
export function mapPad(form, p) {
  const f = normalizeForm(form),
    lx = stickAxis(p?.axes?.[0]),
    ly = stickAxis(-(p?.axes?.[1] ?? 0)),
    rx = stickAxis(p?.axes?.[2]),
    ry = stickAxis(-(p?.axes?.[3] ?? 0)),
    rt = button(p, 7),
    lt = button(p, 6),
    air = f === 'fly' || f === 'chopper',
    out = {
      form: f,
      moveX: lx,
      moveY: ly,
      lookX: rx,
      lookY: ry,
      rt,
      lt,
      throttle: 0,
      steer: 0,
      brake: false,
      drift: false,
      fireHeld: false,
      jumpHeld: false,
      boostHeld: false,
      morphHeld: down(p, 1),
      punch: false,
      aim: false,
      sprint: false,
      recentreHeld: down(p, 11),
      pauseHeld: down(p, 9),
      mapHeld: down(p, 8),
      flyHeld: down(p, 4),
      pitch: 0,
      roll: 0,
      yaw: 0,
      power: 0,
      strafe: 0,
      climb: 0,
      loopHeld: false
    };
  if (f === 'robot') {
    out.fireHeld = rt > 0.5;
    out.aim = lt > 0.5;
    out.jumpHeld = down(p, 0);
    out.punch = down(p, 2);
    out.boostHeld = down(p, 3);
    out.sprint = down(p, 10);
    return out;
  }
  if (f === 'chopper' || f === 'fly') {
    // Stick up climbs. LB/RB are fine yaw, not roll and not take-off. A flies up, Y loops, B lands.
    out.pitch = ly;
    out.roll = lx;
    out.yaw = (down(p, 5) ? 1 : 0) - (down(p, 4) ? 1 : 0);
    out.power = rt - lt;
    out.climb = ly;
    out.jumpHeld = down(p, 0);
    out.loopHeld = down(p, 3);
    out.boostHeld = down(p, 2);
    return out;
  }
  // Car and skateboard: left stick steers only. RT goes, LT brakes then reverses.
  out.steer = lx;
  out.throttle = rt > 0 ? rt : lt > 0 ? -lt : 0;
  out.drift = down(p, 3) || down(p, 5);
  out.jumpHeld = !air && down(p, 0);
  out.boostHeld = down(p, 2);
  return out;
}

/** Left stick into a world XZ move, relative to the camera's yaw (the way it is looking). */
export function cameraMove(camYaw, lx, ly) {
  const yaw = Number.isFinite(camYaw) ? camYaw : 0,
    fwdX = Math.sin(yaw),
    fwdZ = -Math.cos(yaw),
    rightX = Math.cos(yaw),
    rightZ = Math.sin(yaw);
  return {x: lx * rightX + ly * fwdX, z: lx * rightZ + ly * fwdZ};
}

/**
 * LB starts flight on the press while you're on the ground.
 * In the air a short tap opens the chute; holding LB rolls (the mapping's roll) and does not land you.
 */
export function flyShoulder(state, {flying, down: held, now}) {
  const prev = state ?? {down: false, at: 0, tookOff: false},
    next = {down: !!held, at: prev.at, tookOff: prev.tookOff};
  let takeoff = false,
    chute = false;
  if (held && !prev.down) {
    next.at = now;
    next.tookOff = !flying;
    if (!flying) takeoff = true;
  }
  if (!held && prev.down) {
    if (flying && !prev.tookOff && now - prev.at <= 220) chute = true;
    next.tookOff = false;
  }
  return {state: next, takeoff, chute};
}

const stronger = (a, b) => (Math.abs(b) > Math.abs(a) ? b : a);
const IDLE = {
  throttle: 0,
  steer: 0,
  brake: false,
  drift: false,
  fire: false,
  fireHeld: false,
  start: false,
  boost: false,
  boostHeld: false,
  jump: false,
  jumpHeld: false,
  morph: false,
  morphHeld: false,
  map: false,
  recentre: false,
  lookX: 0,
  lookY: 0,
  moveX: 0,
  moveY: 0,
  aim: false,
  sprint: false,
  punch: false,
  flyHeld: false,
  pitch: 0,
  roll: 0,
  yaw: 0,
  power: 0,
  strafe: 0,
  climb: 0,
  loopHeld: false,
  joined: null
};

export function padGuide(id = '') {
  return /sn30|snes|sf30|nes30|super ?famicom/i.test(id)
    ? 'Green controller: left stick steers · right stick looks · R go · L brake · B jump · A morph · Y boost · X drift'
    : /ultimate|xbox|xinput|x-?box/i.test(id)
      ? 'Black controller: left stick steers · right stick looks · RT go · LT brake · A jump · B morph · X boost · Y drift'
      : 'Controller: left stick steers · right stick looks · right trigger goes · left trigger brakes · bottom button jumps';
}

const busy = p => p.buttons?.some(b => (b?.value ?? 0) > 0.5) || p.axes?.some(a => Math.abs(a ?? 0) > 0.5);

export function createGamepadInput() {
  let fire = false,
    start = false,
    boost = false,
    jump = false,
    morph = false,
    map = false,
    recentre = false;
  const seen = new Set();
  return (pads, form = 'car') => {
    const live = Array.from(pads ?? []).filter(p => p?.connected),
      all = live.map(p => mapPad(form, p)),
      fresh = live.find(p => !seen.has(p.id) && busy(p));
    if (fresh) seen.add(fresh.id);
    if (!all.length) {
      fire = start = boost = jump = morph = map = recentre = false;
      return {...IDLE};
    }
    const m = all.reduce((a, b) => ({
      throttle: stronger(a.throttle, b.throttle),
      steer: stronger(a.steer, b.steer),
      brake: a.brake || b.brake,
      drift: a.drift || b.drift,
      fireHeld: a.fireHeld || b.fireHeld,
      jumpHeld: a.jumpHeld || b.jumpHeld,
      boostHeld: a.boostHeld || b.boostHeld,
      morphHeld: a.morphHeld || b.morphHeld,
      recentreHeld: a.recentreHeld || b.recentreHeld,
      pauseHeld: a.pauseHeld || b.pauseHeld,
      mapHeld: a.mapHeld || b.mapHeld,
      flyHeld: a.flyHeld || b.flyHeld,
      lookX: stronger(a.lookX, b.lookX),
      lookY: stronger(a.lookY, b.lookY),
      moveX: stronger(a.moveX, b.moveX),
      moveY: stronger(a.moveY, b.moveY),
      aim: a.aim || b.aim,
      sprint: a.sprint || b.sprint,
      punch: a.punch || b.punch,
      pitch: stronger(a.pitch, b.pitch),
      roll: stronger(a.roll, b.roll),
      yaw: stronger(a.yaw, b.yaw),
      power: stronger(a.power, b.power),
      strafe: stronger(a.strafe, b.strafe),
      climb: stronger(a.climb, b.climb),
      loopHeld: a.loopHeld || b.loopHeld
    }));
    const out = {
      ...m,
      fire: m.fireHeld && !fire,
      start: m.pauseHeld && !start,
      boost: m.boostHeld && !boost,
      jump: m.jumpHeld && !jump,
      morph: m.morphHeld && !morph,
      map: m.mapHeld && !map,
      recentre: m.recentreHeld && !recentre,
      joined: fresh?.id ?? null
    };
    fire = m.fireHeld;
    start = m.pauseHeld;
    boost = m.boostHeld;
    jump = m.jumpHeld;
    morph = m.morphHeld;
    map = m.mapHeld;
    recentre = m.recentreHeld;
    return out;
  };
}
