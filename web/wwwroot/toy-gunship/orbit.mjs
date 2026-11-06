// Toy Gunship orbit: the chunky toy cargo plane circles the backyard on a
// mostly authored path — the pilot steers the ORBIT (radius, speed, altitude),
// not the plane, so the gunner always has a steady scene. Also here: the
// bedroom-window searchlight the pilot dodges, and the supply-crate drops.
// Pure logic, deterministic; the view renders it.

export const ORBIT = Object.freeze({
  radiusMin: 14, radiusMax: 34, radiusRate: 6,   // units, units/s at full stick
  altMin: 10, altMax: 24, altRate: 4,
  speedMin: 0.1, speedMax: 0.45, speedRate: 0.22, // rad/s of orbit angle
  start: Object.freeze({radius: 22, alt: 16, speed: 0.22}),
});

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export function createOrbit() {
  return {
    angle: Math.PI,            // start over the sandpit side
    radius: ORBIT.start.radius,
    alt: ORBIT.start.alt,
    speed: ORBIT.start.speed,
  };
}

/** cmd = {radiusRate, altRate, speedRate} each -1..1. hold = LB steady orbit. */
export function stepOrbit(orbit, cmd = {}, dt, hold = false) {
  const step = Math.max(0, Math.min(0.05, Number(dt) || 0));
  if (!hold) {
    orbit.radius = clamp(orbit.radius + (Number(cmd.radiusRate) || 0) * ORBIT.radiusRate * step, ORBIT.radiusMin, ORBIT.radiusMax);
    orbit.alt = clamp(orbit.alt + (Number(cmd.altRate) || 0) * ORBIT.altRate * step, ORBIT.altMin, ORBIT.altMax);
    orbit.speed = clamp(orbit.speed + (Number(cmd.speedRate) || 0) * ORBIT.speedRate * step, ORBIT.speedMin, ORBIT.speedMax);
  }
  orbit.angle = (orbit.angle + orbit.speed * step) % (Math.PI * 2);
  return orbit;
}

/** World pose of the plane: position, tangent heading, a little bank with speed. */
export function orbitPose(orbit) {
  return {
    x: Math.sin(orbit.angle) * orbit.radius,
    y: orbit.alt,
    z: Math.cos(orbit.angle) * orbit.radius,
    heading: orbit.angle + Math.PI / 2,
    bank: -clamp(orbit.speed * orbit.radius * 0.055, 0, 0.5),
  };
}

// ---------- the bedroom-window searchlight ----------
// A beam from the house window sweeps a slow figure over the yard sky. If the
// plane sits inside the sweep circle it is SPOTTED: the toy camera washes out
// and the plane wobbles until the pilot changes the orbit. Nothing fails.

export const SEARCHLIGHT = Object.freeze({
  window: Object.freeze({x: -34, y: 9, z: -34}), // the bedroom window
  beamR: 7,
  sweepX: 0.17, sweepZ: 0.11,                     // rad/s of the lissajous sweep
  reachX: 24, reachZ: 26,
});

export function createSearchlight() {
  return {caught: false, caughtS: 0, totalSpottedS: 0};
}

/** Where the beam meets the orbit band right now. */
export function searchlightAim(now) {
  return {
    x: Math.sin(now * SEARCHLIGHT.sweepX * Math.PI * 2) * SEARCHLIGHT.reachX,
    z: Math.cos(now * SEARCHLIGHT.sweepZ * Math.PI * 2) * SEARCHLIGHT.reachZ,
    r: SEARCHLIGHT.beamR,
  };
}

/** Returns true on the frame the light first catches the plane. */
export function stepSearchlight(light, planePose, dt, now) {
  const step = Math.max(0, Number(dt) || 0);
  const aim = searchlightAim(now);
  const inBeam = Math.hypot(planePose.x - aim.x, planePose.z - aim.z) <= aim.r;
  const newly = inBeam && !light.caught;
  light.caught = inBeam;
  if (inBeam) {
    light.caughtS += step;
    light.totalSpottedS += step;
  } else {
    light.caughtS = 0;
  }
  return newly;
}

// ---------- supply crates for the toy squad ----------

export const CRATE = Object.freeze({
  cooldownS: 6, gravity: 9, chuteVy: -6, onTargetR: 7, restS: 6,
});

let crateSeq = 0;
export function resetCrateIds() { crateSeq = 0; }

/** Drop a crate from the plane. Returns null while the bay is reloading. */
export function dropCrate(crates, pose, now, lastDropAt = -Infinity) {
  if (now - lastDropAt < CRATE.cooldownS) return null;
  const crate = {
    id: `crate-${(crateSeq += 1)}`,
    x: pose.x, y: pose.y, z: pose.z, vy: 0,
    landed: false, landedAt: null, onTarget: false,
  };
  crates.push(crate);
  return crate;
}

/**
 * Crates fall under a toy parachute; on landing near the squad lead they count
 * ON TARGET (the squad cheers, pilot stat). Landed crates rest a while for the
 * view, then clean up. Returns crates that landed this step.
 */
export function stepCrates(crates, dt, squadLead, now) {
  const step = Math.max(0, Number(dt) || 0);
  const landedNow = [];
  for (const crate of crates) {
    if (crate.landed) continue;
    crate.vy = Math.max(CRATE.chuteVy, crate.vy - CRATE.gravity * step);
    crate.y += crate.vy * step;
    if (crate.y <= 0.5) {
      crate.y = 0.5;
      crate.landed = true;
      crate.landedAt = now;
      crate.onTarget = squadLead
        ? Math.hypot(crate.x - squadLead.x, crate.z - squadLead.z) <= CRATE.onTargetR
        : false;
      landedNow.push(crate);
    }
  }
  for (let i = crates.length - 1; i >= 0; i -= 1) {
    if (crates[i].landed && now - crates[i].landedAt > CRATE.restS) crates.splice(i, 1);
  }
  return landedNow;
}
