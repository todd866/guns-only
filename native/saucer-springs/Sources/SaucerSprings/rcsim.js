(() => {
  // web/wwwroot/rc/physics/math.mjs
  var add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  var sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  var scale = (a, s2) => [a[0] * s2, a[1] * s2, a[2] * s2];
  var madd = (a, b, s2) => [a[0] + b[0] * s2, a[1] + b[1] * s2, a[2] + b[2] * s2];
  var dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  var cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  var len = (a) => Math.hypot(a[0], a[1], a[2]);
  var norm = (a) => {
    const l = len(a);
    return l > 1e-12 ? scale(a, 1 / l) : [0, 0, 0];
  };
  var quatAxisAngle = (axis, angle) => {
    const s2 = Math.sin(angle / 2), n = norm(axis);
    return [n[0] * s2, n[1] * s2, n[2] * s2, Math.cos(angle / 2)];
  };
  var quatMul = (a, b) => [
    a[3] * b[0] + a[0] * b[3] + a[1] * b[2] - a[2] * b[1],
    a[3] * b[1] - a[0] * b[2] + a[1] * b[3] + a[2] * b[0],
    a[3] * b[2] + a[0] * b[1] - a[1] * b[0] + a[2] * b[3],
    a[3] * b[3] - a[0] * b[0] - a[1] * b[1] - a[2] * b[2]
  ];
  var quatConj = (q) => [-q[0], -q[1], -q[2], q[3]];
  var quatNorm = (q) => {
    const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
    return [q[0] / l, q[1] / l, q[2] / l, q[3] / l];
  };
  function rotate(q, v) {
    const u = [q[0], q[1], q[2]], w = q[3];
    const t = scale(cross(u, v), 2);
    return add(add(v, scale(t, w)), cross(u, t));
  }
  var unrotate = (q, v) => rotate(quatConj(q), v);
  function quatIntegrate(q, w, dt) {
    const dq = quatMul([w[0], w[1], w[2], 0], q);
    return quatNorm([q[0] + dq[0] * dt / 2, q[1] + dq[1] * dt / 2, q[2] + dq[2] * dt / 2, q[3] + dq[3] * dt / 2]);
  }
  var yawOf = (q) => {
    const f = rotate(q, [0, 0, -1]);
    return Math.atan2(f[0], -f[2]);
  };

  // web/wwwroot/rc/physics/world.mjs
  var SURFACES = {
    // Fictional shallow splash-pad response; safe at RC scale, no buoyancy or drowning.
    // Authored quarter pipes use the normal concrete tyre response plus a play assist.
    quarter: { grip: 1, roll: 0.02 },
    bowl: { grip: 1, roll: 0.02 },
    vert: { grip: 1, roll: 0.02 },
    hip: { grip: 1, roll: 0.02 },
    snow: { grip: 0.68, roll: 0.08 },
    ice: { grip: 0.38, roll: 0.015 },
    water: { grip: 0.65, roll: 0.18 },
    asphalt: { grip: 1, roll: 0.02 },
    concrete: { grip: 1, roll: 0.02 },
    wood: { grip: 0.95, roll: 0.025 },
    metal: { grip: 0.8, roll: 0.02 },
    tile: { grip: 0.72, roll: 0.02 },
    gymfloor: { grip: 0.55, roll: 0.015 },
    gravel: { grip: 0.78, roll: 0.07 },
    carpet: { grip: 0.9, roll: 0.07 },
    rubber: { grip: 1, roll: 0.03, bounce: 2.2 },
    grass: { grip: 0.72, roll: 0.09 },
    dirt: { grip: 0.8, roll: 0.06 },
    // Rolled kerbs soften initial damping but retain enough bump damping for the
    // narrow chassis to land without a yawing hull strike.
    kerb: { grip: 1, roll: 0.02, damper: 0.55, bumpDamper: 0.65 },
    // Playground: rubber softfall is grippy and a little soft, sand drags, slide plastic is slick.
    softfall: { grip: 1, roll: 0.035, damper: 1.15 },
    sand: { grip: 0.7, roll: 0.16 },
    slide: { grip: 0.8, roll: 8e-3 }
  };
  var TRANSITION_SURFACES = /* @__PURE__ */ new Set(["quarter", "bowl", "vert", "hip"]);
  function createWorld(cell = 4) {
    const tris = [], grid = /* @__PURE__ */ new Map();
    let stamp = 0;
    const key = (ix, iz) => ix * 73856093 ^ iz * 19349663;
    function cellsOf(minX, minZ, maxX, maxZ, fn) {
      for (let ix = Math.floor(minX / cell); ix <= Math.floor(maxX / cell); ix++)
        for (let iz = Math.floor(minZ / cell); iz <= Math.floor(maxZ / cell); iz++) fn(key(ix, iz));
    }
    function addTri(a, b, c, surface = "concrete") {
      const e1 = sub(b, a), e2 = sub(c, a), n = norm(cross(e1, e2));
      if (len(n) === 0) return;
      const minX = Math.min(a[0], b[0], c[0]), minZ = Math.min(a[2], b[2], c[2]), maxX = Math.max(a[0], b[0], c[0]), maxZ = Math.max(a[2], b[2], c[2]);
      const t = { a, b, c, e1, e2, n, surface, minX, minZ, maxX, maxZ, seen: 0 };
      tris.push(t);
      cellsOf(minX, minZ, maxX, maxZ, (k) => {
        let list = grid.get(k);
        if (!list) grid.set(k, list = []);
        list.push(t);
      });
    }
    const addQuad = (a, b, c, d, s2) => {
      addTri(a, b, c, s2);
      addTri(a, c, d, s2);
    };
    function query(minX, minZ, maxX, maxZ, fn) {
      stamp++;
      cellsOf(minX, minZ, maxX, maxZ, (k) => {
        const list = grid.get(k);
        if (!list) return;
        for (const t of list) if (t.seen !== stamp) {
          t.seen = stamp;
          if (t.maxX + 1e-9 < minX || t.minX - 1e-9 > maxX || t.maxZ + 1e-9 < minZ || t.minZ - 1e-9 > maxZ) continue;
          fn(t);
        }
      });
    }
    function raycast(origin, dir, maxDist) {
      const end = add(origin, scale(dir, maxDist));
      let best = null;
      query(Math.min(origin[0], end[0]), Math.min(origin[2], end[2]), Math.max(origin[0], end[0]), Math.max(origin[2], end[2]), (t) => {
        if (dot(t.n, dir) >= 0) return;
        const p = cross(dir, t.e2), det = dot(t.e1, p);
        if (Math.abs(det) < 1e-12) return;
        const inv = 1 / det, s2 = sub(origin, t.a), u = dot(s2, p) * inv;
        if (u < 0 || u > 1) return;
        const q = cross(s2, t.e1), v = dot(dir, q) * inv;
        if (v < 0 || u + v > 1) return;
        const dist = dot(t.e2, q) * inv;
        if (dist < 0 || dist > maxDist || best && dist >= best.dist) return;
        best = { dist, point: add(origin, scale(dir, dist)), normal: t.n, surface: t.surface };
      });
      return best;
    }
    function sphereContacts(c, r, out = []) {
      query(c[0] - r, c[2] - r, c[0] + r, c[2] + r, (t) => {
        const planeDist = dot(sub(c, t.a), t.n);
        if (planeDist < -r || planeDist > r) return;
        const cp = closestOnTri(c, t), d = sub(c, cp), dl = len(d);
        if (planeDist < 0) {
          const proj = sub(c, scale(t.n, planeDist));
          if (len(sub(closestOnTri(proj, t), proj)) > 1e-6) return;
          out.push({ point: cp, normal: t.n, depth: r - planeDist, surface: t.surface });
        } else if (dl < r) {
          out.push({ point: cp, normal: dl > 1e-9 ? scale(d, 1 / dl) : t.n, depth: r - dl, surface: t.surface });
        }
      });
      return out;
    }
    return { tris, addTri, addQuad, raycast, sphereContacts };
  }
  function closestOnTri(p, t) {
    const { a, b, c } = t, ab = t.e1, ac = t.e2, ap = sub(p, a);
    const d1 = dot(ab, ap), d2 = dot(ac, ap);
    if (d1 <= 0 && d2 <= 0) return a;
    const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
    if (d3 >= 0 && d4 <= d3) return b;
    const vc = d1 * d4 - d3 * d2;
    if (vc <= 0 && d1 >= 0 && d3 <= 0) return add(a, scale(ab, d1 / (d1 - d3)));
    const cpv = sub(p, c), d5 = dot(ab, cpv), d6 = dot(ac, cpv);
    if (d6 >= 0 && d5 <= d6) return c;
    const vb = d5 * d2 - d1 * d6;
    if (vb <= 0 && d2 >= 0 && d6 <= 0) return add(a, scale(ac, d2 / (d2 - d6)));
    const va = d3 * d6 - d5 * d4;
    if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) return add(b, scale(sub(c, b), (d4 - d3) / (d4 - d3 + (d5 - d6))));
    const denom = 1 / (va + vb + vc);
    return add(a, add(scale(ab, vb * denom), scale(ac, vc * denom)));
  }

  // web/wwwroot/rc/physics/car.mjs
  var BUGGY = {
    mass: 1.8,
    size: [0.18, 0.08, 0.42],
    // body box for inertia, metres
    inertiaScale: 1,
    wheelMassFraction: 0.15,
    // Provisional 1:10 envelope: 420 mm long, 280 mm outside wheels, 116 mm tyres.
    wheels: [
      // attach points relative to the centre of mass
      { at: [-0.115, 0, -0.14], front: true },
      { at: [0.115, 0, -0.14], front: true },
      { at: [-0.115, 0, 0.14], front: false },
      { at: [0.115, 0, 0.14], front: false }
    ],
    wheelRadius: 0.058,
    wheelWidth: 0.05,
    restLength: 0.05,
    // attach point to wheel centre at full droop
    spring: 450,
    damper: 12,
    // per wheel, N/m and N·s/m
    bumpAt: 0.032,
    bumpSpring: 4e3,
    bumpDamper: 40,
    // bump rubber: absorbs before the hull touches
    staticFriction: [1.6, 1.52],
    // front, rear (rear a little lower: it lets go first)
    kineticFriction: [1.2, 1.12],
    lateralStiffness: 0.5,
    // fraction of the per-wheel lateral slip removed per substep
    rollCentre: 0.72,
    // tyre forces act this fraction of the way up to the CoM
    driveForce: 26,
    topSpeed: 14,
    reverseSpeed: 5,
    brakeForce: 30,
    maxSteer: 0.5,
    steerRate: 5,
    downforce: 0.04,
    // N per (m/s)²
    linearDrag: 0.012,
    angularDrag: 0.4,
    // Hull: body corners act as bump stops when the suspension bottoms out, plus roof and nose.
    hull: [
      { at: [-0.072, -0.028, -0.15], r: 0.028 },
      { at: [0.072, -0.028, -0.15], r: 0.028 },
      { at: [-0.072, -0.028, 0.15], r: 0.028 },
      { at: [0.072, -0.028, 0.15], r: 0.028 },
      { at: [0, 0.022, -0.18], r: 0.03 },
      { at: [0, 0.022, 0.18], r: 0.03 },
      { at: [0, 0.055, 0], r: 0.04 },
      { at: [-0.06, 0.035, 0], r: 0.03 },
      { at: [0.06, 0.035, 0], r: 0.03 }
    ],
    restitution: 0.25,
    hullFriction: 0.45
  };
  var G = 9.81;
  var SUBSTEPS = 4;
  function createCar(params = BUGGY, pos = [0, 0.1, 0], yaw = 0) {
    const [w, h, l] = params.size, m = params.mass, k = params.inertiaScale;
    const wheelMass = m * (params.wheelMassFraction ?? 0) / params.wheels.length, bodyMass = m - wheelMass * params.wheels.length;
    const inertia = [h * h + l * l, w * w + l * l, w * w + h * h].map((v) => bodyMass * v / 12);
    for (const wheel of params.wheels) {
      const [x, atY, z] = wheel.at, y = atY - params.restLength + m * G / 4 / params.spring;
      const r2 = params.wheelRadius ** 2, radial = (3 * r2 + (params.wheelWidth ?? 0) ** 2) / 12;
      inertia[0] += wheelMass * (y * y + z * z + r2 / 2);
      inertia[1] += wheelMass * (x * x + z * z + radial);
      inertia[2] += wheelMass * (x * x + y * y + radial);
    }
    return {
      params,
      invInertia: inertia.map((i) => 1 / (i * k)),
      pos: [...pos],
      q: quatAxisAngle([0, 1, 0], -yaw),
      vel: [0, 0, 0],
      ang: [0, 0, 0],
      steer: 0,
      wheels: params.wheels.map(() => ({ compression: params.mass * G / 4 / params.spring, contact: false, spin: 0, slip: 0, surface: null })),
      grounded: false,
      contacts: 0,
      impact: 0,
      speed: 0,
      forwardSpeed: 0,
      placement: 0
    };
  }
  function rideHeight(p = BUGGY) {
    const sag = p.mass * G / 4 / p.spring;
    return p.restLength - sag + p.wheelRadius - p.wheels[0].at[1];
  }
  function placeCar(car, pos, yaw) {
    car.placement = (car.placement ?? 0) + 1;
    car.pos = [...pos];
    car.q = quatAxisAngle([0, 1, 0], -yaw);
    car.vel = [0, 0, 0];
    car.ang = [0, 0, 0];
    car.steer = 0;
  }
  var applyInvInertia = (car, v) => rotate(car.q, unrotate(car.q, v).map((x, i) => x * car.invInertia[i]));
  function pointVelocity(car, p) {
    return add(car.vel, cross(car.ang, sub(p, car.pos)));
  }
  function applyImpulse(car, j, at) {
    car.vel = madd(car.vel, j, 1 / car.params.mass);
    car.ang = add(car.ang, applyInvInertia(car, cross(sub(at, car.pos), j)));
  }
  function stepCar(car, input, world2, dt = 1 / 120) {
    const p = car.params;
    const steerTarget = Math.max(-1, Math.min(1, input.steer || 0)) * (input.steerLimit ?? p.maxSteer);
    const sd = steerTarget - car.steer, maxD = p.steerRate * dt;
    car.steer += Math.max(-maxD, Math.min(maxD, sd));
    car.impact = 0;
    car.wallImpact = 0;
    const h = dt / SUBSTEPS;
    for (let i = 0; i < SUBSTEPS; i++) substep(car, input, world2, h);
    car.speed = len(car.vel);
    car.forwardSpeed = dot(car.vel, rotate(car.q, [0, 0, -1]));
  }
  function substep(car, input, world2, dt) {
    const p = car.params, m = p.mass, up = rotate(car.q, [0, 1, 0]), fwd = rotate(car.q, [0, 0, -1]);
    let force = [0, -G * m, 0], torque = [0, 0, 0];
    const addForce = (f, at) => {
      force = add(force, f);
      torque = add(torque, cross(sub(at, car.pos), f));
    };
    const throttle = Math.max(-1, Math.min(1, input.throttle || 0));
    const vFwd = dot(car.vel, fwd);
    const braking = !!input.brake || throttle !== 0 && vFwd * throttle < -0.3;
    let drive = 0;
    const boost = input.boost ?? 1;
    if (!braking && throttle > 0) drive = throttle * p.driveForce * boost * Math.max(0, 1 - vFwd / (p.topSpeed * boost));
    if (!braking && throttle < 0) drive = throttle * p.driveForce * 0.6 * Math.max(0, 1 + vFwd / p.reverseSpeed);
    const grip = input.gripScale ?? 1;
    let contacts = 0;
    car.wheels.forEach((ws, i) => {
      const wp = p.wheels[i], attach = add(car.pos, rotate(car.q, wp.at)), reach = p.restLength + p.wheelRadius;
      const hit = world2.raycast(attach, scale(up, -1), reach);
      if (!hit) {
        ws.contact = false;
        ws.compression = 0;
        ws.surface = null;
        ws.slip = 0;
        ws.contactPoint = null;
        ws.contactNormal = null;
        return;
      }
      contacts++;
      const compression = reach - hit.dist, vAttach = pointVelocity(car, attach);
      const rate = -dot(vAttach, up);
      const surf = SURFACES[hit.surface] || SURFACES.concrete;
      const bump = compression > p.bumpAt, bounce = surf.bounce ?? 1;
      const springF = Math.max(0, p.spring * bounce * compression + (bump ? p.bumpSpring * (compression - p.bumpAt) + (surf.bumpDamper ?? 1) * p.bumpDamper * Math.max(0, rate) / bounce : 0) + (surf.damper ?? 1) * p.damper * rate / (bounce * bounce));
      ws.contact = true;
      ws.compression = compression;
      ws.surface = hit.surface;
      ws.contactPoint = hit.point;
      ws.contactNormal = hit.normal;
      addForce(scale(up, springF), attach);
      const n = hit.normal;
      const steerQ = wp.front ? quatAxisAngle(up, -car.steer) : null;
      let wf = steerQ ? rotate(steerQ, fwd) : fwd;
      wf = norm(sub(wf, scale(n, dot(wf, n))));
      const wl = norm(cross(wf, n));
      const vp = pointVelocity(car, hit.point), vLong = dot(vp, wf), vLat = dot(vp, wl);
      const load = springF, axle = wp.front ? 0 : 1;
      const muS = p.staticFriction[axle] * surf.grip * grip, muK = p.kineticFriction[axle] * surf.grip * grip;
      let fLat = -vLat * (m / 4) / dt * p.lateralStiffness * (input.lateralGripScale ?? 1);
      let fLong = drive / 4 - Math.sign(vLong) * Math.min(1, Math.abs(vLong) * 5) * surf.roll * load;
      if (braking) fLong += -Math.sign(vLong) * Math.min(p.brakeForce / 4, Math.abs(vLong) * (m / 4) / dt * 0.5);
      const total = Math.hypot(fLat, fLong), limitS = muS * load;
      if (total > limitS && total > 0) {
        const s2 = muK * load / total;
        fLat *= s2;
        fLong *= s2;
        ws.slip = 1;
      } else ws.slip = 0;
      const at = add(hit.point, scale(sub(car.pos, hit.point), p.rollCentre));
      addForce(add(scale(wl, fLat), scale(wf, fLong)), at);
      ws.spin += vLong / p.wheelRadius * dt;
    });
    car.contacts = contacts;
    car.grounded = contacts > 0;
    const speed = len(car.vel);
    if (contacts) force = madd(force, up, -p.downforce * speed * speed);
    force = madd(force, car.vel, -p.linearDrag * speed);
    torque = madd(torque, car.ang, -p.angularDrag * 0.01);
    if (input.torque) torque = add(torque, input.torque);
    car.vel = madd(car.vel, force, dt / m);
    car.ang = add(car.ang, scale(applyInvInertia(car, torque), dt));
    car.pos = madd(car.pos, car.vel, dt);
    car.q = quatIntegrate(car.q, car.ang, dt);
    solveHull(car, world2);
  }
  function solveHull(car, world2) {
    const p = car.params, m = p.mass, contacts = [];
    for (const s2 of p.hull) {
      for (const ct of world2.sphereContacts(add(car.pos, rotate(car.q, s2.at)), s2.r)) {
        const twin = contacts.find((f) => dot(f.normal, ct.normal) > 0.99 && len(sub(f.point, ct.point)) < s2.r * 2);
        if (!twin) contacts.push(ct);
        else if (ct.depth > twin.depth) Object.assign(twin, ct);
      }
    }
    if (!contacts.length) return;
    const push = [];
    for (const ct of contacts) {
      const same = push.find((f) => dot(f.normal, ct.normal) > 0.99);
      if (!same) push.push({ normal: ct.normal, depth: ct.depth });
      else same.depth = Math.max(same.depth, ct.depth);
    }
    for (const f of push) car.pos = madd(car.pos, f.normal, f.depth * 0.8);
    for (const ct of contacts) {
      ct.r = sub(ct.point, car.pos);
      ct.kN = 1 / m + dot(ct.normal, cross(applyInvInertia(car, cross(ct.r, ct.normal)), ct.r));
      const vn = dot(pointVelocity(car, ct.point), ct.normal);
      ct.bias = vn < -0.5 ? -p.restitution * vn : 0;
      ct.jn = 0;
      ct.jt = [0, 0, 0];
      car.impact = Math.max(car.impact, -vn);
      if (Math.abs(ct.normal[1]) < 0.5 && !(TRANSITION_SURFACES.has(ct.surface) && ct.normal[1] > 0.05)) car.wallImpact = Math.max(car.wallImpact, -vn);
    }
    for (let it = 0; it < 6; it++) for (const ct of contacts) {
      const vRel = pointVelocity(car, ct.point), vn = dot(vRel, ct.normal);
      const jn = Math.max(0, ct.jn + (ct.bias - vn) / ct.kN), dj = jn - ct.jn;
      ct.jn = jn;
      if (dj) applyImpulse(car, scale(ct.normal, dj), ct.point);
      const v2 = pointVelocity(car, ct.point), vt = sub(v2, scale(ct.normal, dot(v2, ct.normal))), vtl = len(vt);
      if (vtl < 1e-6) continue;
      const t = scale(vt, 1 / vtl), kT = 1 / m + dot(t, cross(applyInvInertia(car, cross(ct.r, t)), ct.r));
      let jt = madd(ct.jt, t, -vtl / kT);
      const jl = len(jt), max = p.hullFriction * ct.jn;
      if (jl > max) jt = scale(jt, max / jl);
      applyImpulse(car, sub(jt, ct.jt), ct.point);
      ct.jt = jt;
    }
  }
  var carUp = (car) => rotate(car.q, [0, 1, 0]);
  var carForward = (car) => rotate(car.q, [0, 0, -1]);
  var carYaw = (car) => yawOf(car.q);

  // web/wwwroot/rc/physics/drift.mjs
  var DRIFT = Object.freeze({
    minSpeed: 3,
    holdSpeed: 2,
    hop: 0.72,
    hopWindow: 0.11,
    maxAirTime: 0.32,
    cooldown: 0.4,
    lateralGripScale: 0.5,
    yawGain: 2.4,
    yawRate: 0.12,
    maxYaw: 1.9,
    // Steering into the drift tightens the arc by up to this much; countersteer widens it.
    trim: 0.45,
    // Seconds of sliding for blue, orange and purple sparks; steering into the drift charges faster.
    tiers: [0.55, 1.2, 2],
    kidCharge: 1.35,
    turbo: [0.5, 0.9, 1.35],
    turboBoost: 1.45,
    turboKick: [0.9, 1.5, 2.2],
    // A kart drift carries its speed through the corner. Below this share of the entry speed the
    // slide is topped up along its own direction of travel, never above the entry speed.
    carry: 0.9,
    carryAccel: 7,
    // The slide settles at this slip angle (radians) instead of swinging ever wider, and a
    // release straightens most of the remaining slip so the turbo points down the road.
    maxSlip: 0.45,
    straighten: 0.7
  });
  function createDrift() {
    return { held: false, active: false, hopTime: 0, airTime: 0, cooldown: 0, direction: 0, charge: 0, tier: 0, turbo: 0, fired: 0 };
  }
  function driftTier(charge) {
    return DRIFT.tiers.reduce((t, at) => charge >= at ? t + 1 : t, 0);
  }
  function stepDrift(state, car, raw = {}, dt = 1 / 120, upright = 1, mode = "bigKid") {
    const pressed = !!raw.drift;
    const edge = pressed && !state.held;
    state.held = pressed;
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.turbo = Math.max(0, state.turbo - dt);
    state.fired = 0;
    let hop = 0, kick = 0;
    if (edge && state.cooldown <= 0 && car.grounded && upright > 0.65 && car.forwardSpeed >= DRIFT.minSpeed) {
      state.active = true;
      state.hopTime = DRIFT.hopWindow;
      state.airTime = 0;
      state.cooldown = DRIFT.cooldown;
      state.direction = Math.sign(raw.steer || 0);
      state.charge = 0;
      state.tier = 0;
      state.entry = car.forwardSpeed;
      hop = DRIFT.hop;
    }
    if (state.active) {
      if (state.direction === 0 && state.hopTime > 0 && raw.steer) state.direction = Math.sign(raw.steer);
      state.hopTime = Math.max(0, state.hopTime - dt);
      if (!car.grounded) state.airTime += dt;
      else state.airTime = 0;
      const into2 = state.direction * Math.max(-1, Math.min(1, raw.steer || 0));
      if (state.direction && car.grounded && state.hopTime <= 0) {
        state.charge += dt * (0.75 + 0.5 * Math.max(0, into2)) * (mode === "kid" ? DRIFT.kidCharge : 1);
        state.tier = driftTier(state.charge);
      }
      const lost = state.airTime > DRIFT.maxAirTime || car.forwardSpeed < DRIFT.holdSpeed || upright < 0.5;
      if (!pressed || lost) {
        if (!pressed && !lost && car.grounded && state.tier > 0) {
          state.turbo = DRIFT.turbo[state.tier - 1];
          state.fired = state.tier;
          kick = DRIFT.turboKick[state.tier - 1];
        }
        state.active = false;
        state.hopTime = 0;
        state.airTime = 0;
        state.direction = 0;
        state.charge = 0;
        state.tier = 0;
      }
    }
    const turbo = state.turbo > 0 ? DRIFT.turboBoost : 1;
    if (!state.active) return { active: false, hop, kick, turbo, fired: state.fired, tier: 0, lateralGripScale: 1, yawTarget: 0, yawGain: 0 };
    const into = state.direction * Math.max(-1, Math.min(1, raw.steer || 0));
    return {
      active: true,
      hop,
      kick,
      turbo,
      fired: 0,
      tier: state.tier,
      carry: state.entry * DRIFT.carry,
      lateralGripScale: DRIFT.lateralGripScale,
      // Car yaw is opposite the body's positive world-Y angular velocity, so assistInput
      // converts this target into a bounded PD torque. A zero direction means no steering bias.
      yawTarget: -state.direction * Math.min(DRIFT.maxYaw, car.forwardSpeed * DRIFT.yawRate) * (1 + DRIFT.trim * into),
      yawGain: DRIFT.yawGain
    };
  }

  // web/wwwroot/rc/physics/quarter-return.mjs
  var clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  var horizontal = (v) => norm([v[0], 0, v[2]]);
  function landing(world2, pos, vel) {
    let p = pos;
    for (let t = 0.04; t < 2.4; t += 0.04) {
      const q = [pos[0] + vel[0] * t, pos[1] + vel[1] * t - 4.905 * t * t, pos[2] + vel[2] * t], d = sub(q, p), len2 = Math.hypot(...d);
      const hit = len2 > 1e-6 && world2.raycast(p, scale(d, 1 / len2), len2);
      if (hit) return hit;
      p = q;
    }
    return null;
  }
  function safeTransfer(world2, pos, vel) {
    const good = (v) => {
      const h = landing(world2, pos, v);
      return h && (h.normal[1] > 0.9 || dot(horizontal(h.normal), horizontal(v)) > 0.3);
    };
    for (const k of [0.9, 0.8, 0.7, 0.55, 0.4]) for (const a of [0, 0.26, -0.26, 0.52, -0.52]) {
      const c = Math.cos(a), s2 = Math.sin(a), v = [(vel[0] * c - vel[2] * s2) * k, vel[1], (vel[0] * s2 + vel[2] * c) * k];
      if (good(v)) return v;
    }
    return vel;
  }
  function stepQuarterReturn(state, car, raw, dt, world2) {
    const wheels = car.wheels.filter((w) => w.contact && TRANSITION_SURFACES.has(w.surface) && w.contactNormal);
    if (!state.arc) {
      const wall = wheels.filter((w) => w.surface === "bowl" || w.surface === "vert");
      if (wall.length >= 2 && !state.armed && (raw.throttle ?? 0) > 0.2 && !raw.brake) {
        const n = norm(wall.reduce((sum, w) => add(sum, w.contactNormal), [0, 0, 0])), inward2 = horizontal(n);
        if (n[1] < 0.85 && n[1] > 0.05 && dot(horizontal(carForward(car)), inward2) < -0.5 && car.forwardSpeed < 0.5 && car.vel[1] < 0.3) {
          car.vel = add(scale(inward2, 1.2), scale(n, 1.4));
          state.arc = { kind: "return", returning: true, kick: true, yaw: Math.atan2(-inward2[0], inward2[2]), turn: raw.steer < -0.15 ? -1 : 1, time: 0 };
        }
      }
    }
    if (!state.arc) {
      if (wheels.length >= 2 && car.forwardSpeed > 1) {
        const n = norm(wheels.reduce((sum, w) => add(sum, w.contactNormal), [0, 0, 0]));
        const inward2 = horizontal(n), forward2 = horizontal(carForward(car));
        const vert = wheels.some((w) => w.surface === "vert"), bowl = vert || wheels.some((w) => w.surface === "bowl"), hip = wheels.some((w) => w.surface === "hip");
        if (n[1] < 0.72 && n[1] > 0.01 && car.vel[1] > 1) {
          const kind = bowl ? "return" : !hip && dot(forward2, inward2) < -0.9 ? "face" : "transfer";
          state.armed = { kind, vert, hip, inward: inward2, yaw: Math.atan2(-inward2[0], inward2[2]), speed: Math.max(0, car.forwardSpeed), age: 0 };
        } else if (hip && (!state.armed || state.armed.hip) && car.vel[1] > 0.4 && car.forwardSpeed > 2.5) {
          state.armed = { kind: "transfer", hip: true, inward: inward2, yaw: 0, speed: car.forwardSpeed, age: 0 };
        }
      }
      if (state.armed) {
        state.armed.age += dt;
        if (state.armed.age > 0.25 || car.vel[1] < (state.armed.hip ? -0.8 : 0)) state.armed = null;
        else if (car.contacts === 0) {
          const a = state.armed;
          if (a.kind === "transfer") {
            car.vel[1] = clamp(car.vel[1], a.hip ? 2.4 : 1.6, 3.2);
            if (world2) car.vel = safeTransfer(world2, car.pos, car.vel);
            state.arc = { kind: "transfer", yaw: Math.atan2(car.vel[0], -car.vel[2]), time: 0 };
          } else {
            const returning = a.kind === "return" || a.speed >= Math.min(5.8, car.params.topSpeed * 0.41), bowl = a.kind === "return";
            const tangent = sub([car.vel[0], 0, car.vel[2]], scale(a.inward, dot(car.vel, a.inward)));
            const carry = bowl ? 0.5 : 1.2, drift = Math.hypot(...tangent) > carry ? scale(norm(tangent), carry) : tangent;
            const sideways = returning ? 0.65 : -1.8;
            const [lo, hi] = a.vert ? [5.5, 8] : bowl ? [4.2, 5.45] : returning ? [5.5, 8.5] : [2.2, 3.4];
            car.vel = [drift[0] + a.inward[0] * sideways, clamp(car.vel[1], lo, hi), drift[2] + a.inward[2] * sideways];
            state.arc = { kind: returning ? "return" : "exit", returning, yaw: a.yaw, turn: raw.steer < -0.15 ? -1 : 1, time: 0 };
          }
          state.armed = null;
        }
      }
    }
    const arc = state.arc;
    if (!arc) return null;
    arc.time += dt;
    arc.supported = car.contacts >= 2 ? (arc.supported ?? 0) + dt : 0;
    if (arc.time > 0.16 && arc.supported > 0.22 || arc.time > 3) {
      state.arc = null;
      return null;
    }
    let yaw = arc.yaw;
    if (arc.kind === "return") {
      const t = clamp(arc.time / 0.65, 0, 1);
      yaw += Math.PI * arc.turn * t * t * (3 - 2 * t);
    } else if (arc.kind === "transfer" && Math.hypot(car.vel[0], car.vel[2]) > 0.8) yaw = arc.yaw = Math.atan2(car.vel[0], -car.vel[2]);
    let targetUp = [0, 1, 0];
    if (world2 && arc.kind !== "exit" && car.vel[1] < 0) {
      const ground = world2.raycast(add(car.pos, [0, 0.3, 0]), [0, -1, 0], 8);
      if (ground && ground.normal[1] > 0.35) {
        targetUp = ground.normal;
        const clearance = ground.dist - 0.3 - rideHeight(car.params);
        if (arc.returning && clearance < 0.8) {
          car.vel[1] = Math.max(car.vel[1], -(2.4 + Math.max(0, clearance) * 3));
          const inward2 = [-Math.sin(arc.yaw), 0, Math.cos(arc.yaw)], blend = 1 - Math.exp(-7 * dt);
          car.vel[0] += (inward2[0] * 3 - car.vel[0]) * blend;
          car.vel[2] += (inward2[2] * 3 - car.vel[2]) * blend;
        }
      }
    }
    const forward = [Math.sin(yaw), 0, -Math.cos(yaw)];
    const targetForward = norm(sub(forward, scale(targetUp, dot(forward, targetUp))));
    const error = scale(add(cross(carForward(car), targetForward), cross(carUp(car), targetUp)), 0.5);
    let acceleration = sub(scale(error, 144), scale(car.ang, 20));
    const size = Math.hypot(...acceleration);
    if (size > 100) acceleration = scale(acceleration, 100 / size);
    return rotate(car.q, unrotate(car.q, acceleration).map((v, i) => v / car.invInertia[i]));
  }

  // web/wwwroot/rc/physics/assists.mjs
  var BALANCE = Object.freeze({ angle: 0.5, omega: 7, lift: 6, hop: 0.3, wheelieThrottle: 0.85, wheelieBoost: 1.9, plant: 14, sink: 0.4, roll: 14, carry: 5 });
  var MODES = {
    kid: { steerFalloff: 0.1, yawHold: 8, airLevel: true, autoRight: true, freeRecovery: true },
    // Big Kid still has a gentle transmitter stabiliser and air attitude help. It rewards a
    // clean line without making precision steering or mid-air correction into homework.
    bigKid: { steerFalloff: 0.035, yawHold: 2.4, airLevel: true, autoRight: false, freeRecovery: false }
  };
  function createAssist(mode = "kid") {
    return { mode, flipTime: 0, righting: 0, airTime: 0, drift: createDrift() };
  }
  function assistInput(a, car, raw, dt, world2) {
    const m = MODES[a.mode], p = car.params, out = { ...raw };
    if (a.placement !== (car.placement ?? 0)) {
      a.placement = car.placement ?? 0;
      a.drift = createDrift();
      a.drift.held = !!raw.drift;
      a.quarter = {};
    }
    const speed = Math.abs(car.forwardSpeed);
    out.steerLimit = p.maxSteer / (1 + m.steerFalloff * speed);
    const up = carUp(car), I = 1 / car.invInertia[0];
    let torque = [0, 0, 0];
    const drift = stepDrift(a.drift, car, raw, dt, up[1], a.mode);
    const quarter = stepQuarterReturn(a.quarter ??= {}, car, raw, dt, world2);
    const wheelGrips = car.wheels.map((w) => SURFACES[w.surface]?.grip ?? 1).filter(Number.isFinite);
    const lowGrip = wheelGrips.length ? Math.min(...wheelGrips) : 1;
    if (m.yawHold && car.contacts >= 3 && (a.mode === "kid" || lowGrip >= 0.72)) {
      const L = Math.abs(p.wheels[0].at[2] - p.wheels[2].at[2]);
      const kinematic = -car.forwardSpeed * Math.tan(car.steer) / L, gripLimit = 1.2 * 9.81 / Math.max(1, Math.abs(car.forwardSpeed));
      const wanted = Math.max(-gripLimit, Math.min(gripLimit, kinematic)), actual = dot(car.ang, up);
      torque = add(torque, scale(up, -m.yawHold * (drift.active ? 0.35 : 1) * (actual - wanted) / car.invInertia[1]));
    }
    if (quarter) {
      torque = add(torque, quarter);
      a.airTime = 0;
    } else if (m.airLevel && car.contacts === 0 && !(raw.wheelie || raw.stoppie)) {
      a.airTime += dt;
      const stable = up[1] > 0.5 && Math.hypot(car.ang[0], car.ang[2]) < 4;
      const transfer = stable && a.airTime >= 0.1 && (Math.abs(raw.steer || 0) > 0.05 || raw.airControl);
      torque = add(torque, levelTorque(car, up, transfer ? 2.2 : 5));
      if (transfer) {
        const fwd = carForward(car), right = rotate(car.q, [1, 0, 0]);
        const iz = 1 / car.invInertia[2];
        const steer = Math.max(-1, Math.min(1, raw.steer || 0));
        const throttle = raw.airControl ? Math.max(-1, Math.min(1, raw.throttle || 0)) : 0;
        torque = add(torque, scale(fwd, steer * iz * 2.4));
        torque = add(torque, scale(right, throttle * I * 1.8));
      }
    } else {
      a.airTime = 0;
    }
    const stuck = up[1] < 0.3 && car.speed < 1.5;
    a.flipTime = stuck ? a.flipTime + dt : 0;
    if (m.autoRight && a.flipTime > 0.8 && a.righting <= 0) {
      a.righting = 0.7;
      car.vel[1] += 2.2;
      a.flipTime = 0;
    }
    if (a.righting > 0) {
      a.righting -= dt;
      torque = add(torque, levelTorque(car, up, 14));
    }
    if (drift.hop) car.vel[1] += drift.hop;
    const keep = drift.active ? DRIFT.maxSlip : drift.fired ? null : void 0;
    if (keep !== void 0 && car.grounded) {
      const f = carForward(car), h = Math.atan2(f[0], f[2]), v = Math.atan2(car.vel[0], car.vel[2]);
      const slip = Math.atan2(Math.sin(h - v), Math.cos(h - v));
      const turn = keep === null ? slip * DRIFT.straighten : Math.sign(slip) * Math.max(0, Math.abs(slip) - keep);
      if (turn && Math.hypot(car.vel[0], car.vel[2]) > 0.5) {
        const c = Math.cos(turn), sn = Math.sin(turn), x = car.vel[0], z = car.vel[2];
        car.vel[0] = x * c + z * sn;
        car.vel[2] = -x * sn + z * c;
      }
    }
    if (drift.kick) {
      const f = carForward(car);
      car.vel = add(car.vel, scale([f[0], 0, f[2]], drift.kick / Math.max(1e-6, Math.hypot(f[0], f[2]))));
    }
    if (drift.turbo > 1) out.boost = (raw.boost ?? 1) * drift.turbo;
    a.driftFired = drift.fired;
    a.driftTier = drift.tier;
    if (drift.fired) a.turbos = (a.turbos ?? 0) + 1;
    if (drift.active) {
      out.lateralGripScale = drift.lateralGripScale;
      const flat = Math.hypot(car.vel[0], car.vel[2]);
      if (car.grounded && (raw.throttle ?? 0) > 0 && flat > 0.5 && flat < drift.carry) {
        const dv = Math.min(drift.carry - flat, DRIFT.carryAccel * dt) / flat;
        car.vel[0] += car.vel[0] * dv;
        car.vel[2] += car.vel[2] * dv;
      }
      if (drift.yawTarget) {
        const actual = dot(car.ang, up);
        torque = add(torque, scale(up, -drift.yawGain * (actual - drift.yawTarget) / car.invInertia[1]));
      }
    }
    const fwdNow = carForward(car), rightNow = rotate(car.q, [1, 0, 0]);
    const trick = raw.wheelie ? 1 : raw.stoppie ? -1 : 0;
    a.balance = 0;
    a.trickAir = trick && car.contacts === 0 ? (a.trickAir ?? 0) + dt : 0;
    if (trick && (car.contacts >= 1 || a.trickAir < BALANCE.hop) && up[1] > 0.4 && (trick < 0 ? car.forwardSpeed > 1.2 : true)) {
      const pitch = Math.asin(Math.max(-1, Math.min(1, fwdNow[1]))), rate = dot(car.ang, rightNow);
      const target = trick * BALANCE.angle, k = BALANCE.omega;
      const arm = Math.abs(p.wheels[0].at[2] - p.wheels[2].at[2]) / 2, hold = trick * p.mass * 9.81 * arm * Math.cos(pitch);
      const pivot = I + p.mass * arm * arm, stiff = pivot * k * k + p.mass * 9.81 * arm * BALANCE.lift;
      torque = add(torque, scale(rightNow, hold + stiff * (target - pitch) - 2 * 0.9 * Math.sqrt(stiff * pivot) * rate));
      if (trick > 0) {
        out.throttle = Math.max(out.throttle ?? 0, BALANCE.wheelieThrottle);
        out.brake = false;
        out.boost = (out.boost ?? 1) * BALANCE.wheelieBoost;
      } else {
        out.throttle = 0;
        out.brake = false;
      }
      const iz = 1 / car.invInertia[2], rollRate = dot(car.ang, fwdNow);
      torque = add(torque, scale(fwdNow, iz * (BALANCE.roll * BALANCE.roll * rightNow[1] - 2 * BALANCE.roll * rollRate)));
      const pivotVy = trick * rate * arm * Math.cos(pitch), sinkVy = car.contacts ? 0 : -BALANCE.sink;
      car.vel[1] += (pivotVy + sinkVy - car.vel[1]) * Math.min(1, BALANCE.plant * dt);
      if (trick > 0) {
        if (!a.trickEntry) a.trickEntry = Math.min(car.params.topSpeed * 0.8, Math.max(0, car.forwardSpeed));
        const flat = Math.hypot(car.vel[0], car.vel[2]), want = Math.max(3, a.trickEntry);
        if (flat < want) {
          const h = Math.hypot(fwdNow[0], fwdNow[2]) || 1, dv = Math.min(want - flat, BALANCE.carry * dt);
          car.vel[0] += fwdNow[0] / h * dv;
          car.vel[2] += fwdNow[2] / h * dv;
        }
      }
      a.balance = Math.abs(pitch) > BALANCE.angle * 0.55 ? trick : 0;
    }
    if (!trick) a.trickEntry = 0;
    a.balanceTime = a.balance ? (a.balanceTime ?? 0) + dt : 0;
    a.skateAir = raw.skate && car.contacts === 0 ? (a.skateAir ?? 0) + dt : 0;
    a.skateSpinning = a.skateAir > 0.12 && raw.drift && Math.abs(raw.steer || 0) > 0.25;
    if (a.skateSpinning) {
      torque[1] = (-raw.steer * 9 - car.ang[1]) * 8 / car.invInertia[1];
    }
    out.torque = torque;
    return out;
  }
  function levelTorque(car, up, omega) {
    let err = cross(up, [0, 1, 0]);
    if (up[1] < 0 && Math.hypot(...err) < 0.3) err = add(err, scale(carForward(car), 0.3));
    const angNoYaw = sub(car.ang, scale([0, 1, 0], car.ang[1]));
    const acceleration = sub(scale(err, omega * omega), scale(angNoYaw, 2 * 0.8 * omega));
    return rotate(car.q, unrotate(car.q, acceleration).map((v, i) => v / car.invInertia[i]));
  }

  // web/wwwroot/rc/physics/grind.mjs
  var clamp2 = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  var horizontal2 = (v) => norm([v[0], 0, v[2]]);
  var grindHeight = (car) => Math.max(...car.params.hull.map((s2) => s2.r - s2.at[1]));
  function createBalance() {
    return { value: 0, time: 0 };
  }
  function stepBalance(b, steer, dt, mode = "kid") {
    b.time += dt;
    const kid = mode === "kid", drift = (kid ? 0.035 : 0.16) + b.time * (kid ? 8e-3 : 0.045);
    b.value += (drift * (1 + Math.abs(b.value)) - (steer || 0) * (kid ? 0.7 : 1.1)) * dt;
    return Math.abs(b.value) < 1;
  }
  function railPoint(r, distance, direction) {
    const seg = (direction > 0 ? r.segments.find((s2) => distance < s2.start + s2.length) : [...r.segments].reverse().find((s2) => distance > s2.start)) ?? (direction > 0 ? r.segments.at(-1) : r.segments[0]);
    return { point: add(seg.a, scale(seg.dir, clamp2(distance - seg.start, 0, seg.length))), tangent: scale(seg.dir, direction) };
  }
  function attitude(car, tangent, sideways = false, pitch = 0) {
    const yaw = Math.atan2(tangent[0], -tangent[2]) + (sideways ? Math.PI / 2 : 0);
    const slope = Math.atan2(tangent[1], Math.hypot(tangent[0], tangent[2]));
    car.q = quatMul(quatAxisAngle([0, 1, 0], -yaw), quatAxisAngle([1, 0, 0], slope + pitch));
    car.ang = [0, 0, 0];
  }
  function clearContacts(car) {
    car.contacts = 0;
    car.grounded = false;
    car.impact = car.wallImpact = 0;
    for (const w of car.wheels) {
      w.contact = false;
      w.compression = 0;
      w.surface = null;
      w.contactNormal = null;
    }
  }
  function inward(world2, point, tangent) {
    const side = norm([tangent[2], 0, -tangent[0]]);
    const height = (sign) => {
      const p = add(point, scale(side, sign * 0.65));
      return world2.raycast(add(p, [0, 0.3, 0]), [0, -1, 0], 10)?.point[1] ?? point[1] - 10;
    };
    return scale(side, height(1) < height(-1) ? 1 : -1);
  }
  function leave(s2, reason, hop) {
    const state = s2.skateRide, g = state.active, car = s2.car;
    const { point, tangent } = railPoint(g.rail, g.distance, g.direction);
    let side = [0, 0, 0];
    if (g.rail.kind === "coping") side = inward(s2.course.world, point, tangent);
    else if (reason !== "end") side = scale(norm([tangent[2], 0, -tangent[0]]), Math.sign(g.balance.value) || 1);
    car.pos = add(add(point, [0, rideHeight(car.params) + 0.03, 0]), scale(side, 0.18));
    car.vel = add(scale(tangent, g.speed), add(scale(side, hop ? 1.3 : 0.9), [0, hop ? 2.6 : 0.65, 0]));
    if (reason === "brake") car.vel = add(scale(car.vel, 0.45), [0, 0.3, 0]);
    attitude(car, Math.hypot(side[0], side[2]) && g.rail.kind === "coping" ? norm(car.vel) : tangent);
    clearContacts(car);
    state.active = null;
    state.cooldown = 0.55;
    s2.assist.quarter = {};
    s2.assist.drift = { ...createDrift(), held: state.held };
  }
  function capture(s2, raw) {
    const state = s2.skateRide, c = s2.car;
    if (state.cooldown > 0 || raw.brake || c.speed < 0.7 || carUp(c)[1] < 0.65) return;
    const forward = horizontal2(carForward(c)), travel = horizontal2(c.vel);
    let best = null;
    for (const r of state.rails) for (const seg of r.segments) {
      const d = sub(seg.b, seg.a), h2 = d[0] ** 2 + d[2] ** 2;
      if (h2 < 1e-3) continue;
      const rel = sub(c.pos, seg.a), t = (rel[0] * d[0] + rel[2] * d[2]) / h2;
      if (t < 0 || t > 1) continue;
      const point = add(seg.a, scale(d, t)), distance = Math.hypot(c.pos[0] - point[0], c.pos[2] - point[2]);
      const clearance = c.pos[1] - grindHeight(c) - point[1];
      if (distance > 0.4 || Math.abs(clearance) > 0.3 || c.contacts > 0 && clearance < -0.12) continue;
      if (r.kind === "rail" && clearance < -0.04) continue;
      const tangent = horizontal2(seg.dir), alignment = Math.abs(dot(forward, tangent)), moving = dot(travel, tangent);
      const sideways = alignment < Math.cos(Math.PI / 4) && c.contacts === 0 && raw.drift;
      if (Math.abs(moving) < Math.cos(40 * Math.PI / 180) || alignment < Math.cos(40 * Math.PI / 180) && !sideways) continue;
      const speed = Math.abs(dot(c.vel, seg.dir)), direction = moving < 0 ? -1 : 1;
      if (c.vel[1] - seg.dir[1] * direction * speed > 0.5) continue;
      if (!best || distance < best.distance) best = { rail: r, distance, along: seg.start + t * seg.length, speed, direction, sideways };
    }
    if (!best) return;
    const name = best.sideways ? "Boardslide" : raw.steer < -0.3 ? "Nosegrind" : raw.steer > 0.3 ? "5-0" : "50-50";
    state.active = { rail: best.rail, distance: best.along, speed: best.speed, direction: best.direction, sideways: best.sideways, name, balance: createBalance(), time: 0, id: ++state.serial };
    state.manual = null;
    s2.assist.quarter = {};
    s2.assist.drift = { ...createDrift(), held: state.held };
  }
  function stepSkateRide(s2, raw, dt) {
    const state = s2.skateRide;
    if (!state) return false;
    const car = s2.car, held = !!(raw.hop || raw.drift), hop = held && !state.held;
    state.held = held;
    if (!raw.drift) state.manualBlocked = false;
    state.cooldown = Math.max(0, state.cooldown - dt);
    if (state.placement !== car.placement) {
      state.placement = car.placement;
      state.active = state.manual = null;
      state.cooldown = 0;
    }
    if (!state.active) capture(s2, raw);
    const g = state.active;
    if (g) {
      if (raw.brake || hop && g.time > 0) {
        leave(s2, raw.brake ? "brake" : "hop", !raw.brake);
        return true;
      }
      g.time += dt;
      if (!stepBalance(g.balance, raw.steer, dt, s2.mode)) {
        leave(s2, "balance", false);
        return true;
      }
      const { tangent } = railPoint(g.rail, g.distance, g.direction);
      g.speed = Math.max(0, g.speed + (-0.18 - 9.81 * tangent[1]) * dt);
      g.distance += g.direction * g.speed * dt;
      if (g.distance <= 0 || g.distance >= g.rail.length || g.speed < 0.35) {
        g.distance = clamp2(g.distance, 0, g.rail.length);
        leave(s2, "end", false);
        return true;
      }
      const next2 = railPoint(g.rail, g.distance, g.direction);
      car.pos = add(next2.point, [0, grindHeight(car), 0]);
      car.vel = scale(next2.tangent, g.speed);
      attitude(car, next2.tangent, g.sideways);
      clearContacts(car);
      car.speed = car.forwardSpeed = g.speed;
      for (const w of car.wheels) w.spin += g.speed / car.params.wheelRadius * dt;
      return true;
    }
    const ground = s2.course.world.raycast(add(car.pos, [0, 0.2, 0]), [0, -1, 0], 0.65);
    const flat = ground?.normal[1] > 0.98 && Math.abs(car.pos[1] - ground.point[1] - rideHeight(car.params)) < 0.18;
    if (!state.manual && !state.manualBlocked && raw.drift && !raw.brake && flat && car.contacts >= 2 && car.speed > 1 && carUp(car)[1] > 0.9) state.manual = { id: ++state.serial, balance: createBalance(), time: 0 };
    const m = state.manual;
    if (!m) return false;
    if (!raw.drift || raw.brake || raw.hop || !flat || car.speed < 0.6 || !stepBalance(m.balance, raw.steer, dt, s2.mode)) {
      state.manual = null;
      state.manualBlocked = true;
      state.cooldown = Math.max(state.cooldown, 0.2);
      s2.assist.drift = { ...createDrift(), held: state.held };
      return false;
    }
    m.time += dt;
    const forward = horizontal2(carForward(car)), speed = clamp2(car.speed + ((raw.throttle || 0) * 5 * (1 - car.speed / car.params.topSpeed) - 0.5) * dt, 0, car.params.topSpeed);
    const next = add(car.pos, scale(forward, speed * dt)), support = s2.course.world.raycast(add(next, [0, 0.25, 0]), [0, -1, 0], 0.75);
    if (!support || support.normal[1] < 0.98 || Math.abs(support.point[1] - ground.point[1]) > 0.06) {
      state.manual = null;
      return false;
    }
    const position = [next[0], support.point[1] + rideHeight(car.params) + 0.035, next[2]];
    if (car.params.hull.some((h) => s2.course.world.sphereContacts(add(position, rotate(car.q, h.at)), h.r).some((c) => Math.abs(c.normal[1]) < 0.7))) {
      state.manual = null;
      state.manualBlocked = true;
      return false;
    }
    car.pos = position;
    car.vel = scale(forward, speed);
    attitude(car, forward, false, 0.22);
    clearContacts(car);
    car.speed = car.forwardSpeed = speed;
    car.contacts = 2;
    car.grounded = true;
    for (let i = 0; i < car.wheels.length; i++) {
      const w = car.wheels[i];
      w.contact = i >= 2;
      w.surface = support.surface;
      w.contactNormal = support.normal;
      w.spin += speed / car.params.wheelRadius * dt;
    }
    s2.assist.quarter = {};
    return true;
  }

  // web/wwwroot/rc/physics/flight.mjs
  var FLIGHT = Object.freeze({
    takeoff: 5,
    climbFor: 0.7,
    minSpeed: 7,
    maxSpeed: 18,
    burner: 26,
    startPower: 0.45,
    powerRate: 0.6,
    accel: 2.2,
    diveGain: 4,
    pitchRate: 1.5,
    rollRate: 2.4,
    yawRate: 0.7,
    bankTurn: 1.3,
    levelRoll: 0.9,
    chuteSink: 1.5,
    chuteDrag: 1.2,
    chuteLevel: 3,
    ceiling: 90,
    land: 0.32,
    burnerBoost: 1.8
  });
  function createFlight() {
    return { mode: null, speed: 0, power: FLIGHT.startPower, climb: 0, flights: 0, chutes: 0 };
  }
  var levelQuat = (car) => quatAxisAngle([0, 1, 0], -yawOf(car.q));
  var groundBelow = (world2, pos, reach = 200) => world2?.raycast?.([pos[0], pos[1] + 0.05, pos[2]], [0, -1, 0], reach) ?? null;
  function toggleFlight(f, car, { roam = true } = {}) {
    if (!roam) return f.mode;
    if (!f.mode) {
      f.mode = "fly";
      f.flights++;
      f.speed = Math.max(FLIGHT.minSpeed + 2, car.forwardSpeed ?? 0);
      f.climb = FLIGHT.climbFor;
      car.vel = add(car.vel, [0, FLIGHT.takeoff, 0]);
      car.ang = [0, 0, 0];
    } else if (f.mode === "fly") {
      f.mode = "chute";
      f.chutes++;
    }
    return f.mode;
  }
  function touchdown(f, car) {
    f.mode = null;
    f.speed = 0;
    car.q = levelQuat(car);
    car.ang = [0, 0, 0];
    car.vel = [car.vel[0] * 0.7, Math.max(-1, car.vel[1]), car.vel[2] * 0.7];
  }
  function stepFlight(f, car, ctl = {}, world2, dt = 1 / 120) {
    if (!f.mode) return false;
    const fwd = rotate(car.q, [0, 0, -1]), right = rotate(car.q, [1, 0, 0]);
    if (f.mode === "fly") {
      f.power = Math.max(0, Math.min(1, f.power + (ctl.power || 0) * FLIGHT.powerRate * dt));
      const target = ctl.burner ? FLIGHT.burner : FLIGHT.minSpeed + f.power * (FLIGHT.maxSpeed - FLIGHT.minSpeed);
      f.speed += ((target - f.speed) * FLIGHT.accel - fwd[1] * FLIGHT.diveGain) * dt;
      f.speed = Math.max(FLIGHT.minSpeed, Math.min(FLIGHT.burner, f.speed));
      const pitch = (ctl.pitch || 0) * FLIGHT.pitchRate * dt, roll = (ctl.roll || 0) * FLIGHT.rollRate * dt, yaw = (ctl.yaw || 0) * FLIGHT.yawRate * dt;
      let q = quatMul(car.q, quatAxisAngle([1, 0, 0], pitch));
      q = quatMul(q, quatAxisAngle([0, 0, 1], -roll));
      q = quatMul(q, quatAxisAngle([0, 1, 0], -yaw));
      const bank = rotate(q, [1, 0, 0])[1];
      q = quatMul(quatAxisAngle([0, 1, 0], bank * FLIGHT.bankTurn * dt), q);
      if (!ctl.roll) q = quatMul(q, quatAxisAngle([0, 0, 1], bank * FLIGHT.levelRoll * dt));
      car.q = quatNorm(q);
      const nose = rotate(car.q, [0, 0, -1]);
      f.climb = Math.max(0, f.climb - dt);
      const vertical = f.climb > 0 ? Math.max(nose[1] * f.speed, FLIGHT.takeoff * f.climb / FLIGHT.climbFor) : nose[1] * f.speed;
      car.vel = [nose[0] * f.speed, vertical, nose[2] * f.speed];
    } else {
      const level = levelQuat(car), k = Math.min(1, FLIGHT.chuteLevel * dt);
      car.q = quatNorm(car.q.map((v, i) => v + (level[i] * Math.sign(dot4(car.q, level) || 1) - v) * k));
      const drag = Math.exp(-FLIGHT.chuteDrag * dt);
      car.vel = [car.vel[0] * drag, car.vel[1] + (-FLIGHT.chuteSink - car.vel[1]) * Math.min(1, 3 * dt), car.vel[2] * drag];
    }
    car.ang = [0, 0, 0];
    const step = scale(car.vel, dt), dist = len(step);
    if (dist > 1e-6) {
      const dir = scale(step, 1 / dist), hit = world2?.raycast?.(car.pos, dir, dist + 0.2);
      if (hit && hit.dist <= dist + 0.2) {
        const n = hit.normal ?? [0, 1, 0];
        car.pos = madd(car.pos, dir, Math.max(0, hit.dist - 0.2));
        if (n[1] > 0.6 && car.vel[1] <= 0) {
          touchdown(f, car);
          return true;
        }
        car.vel = scale(sub(car.vel, scale(n, 1.4 * dot(car.vel, n))), 0.3);
        f.mode = "chute";
        f.chutes++;
      } else car.pos = add(car.pos, step);
    }
    const below = groundBelow(world2, car.pos);
    if (below) {
      const clear = below.dist;
      if (clear < FLIGHT.land && car.vel[1] <= 0.05 && f.climb <= 0) {
        touchdown(f, car);
        return true;
      }
      if (clear > FLIGHT.ceiling && car.vel[1] > 0) car.vel[1] = 0, car.pos[1] -= clear - FLIGHT.ceiling;
    }
    car.speed = len(car.vel);
    car.forwardSpeed = dot(car.vel, rotate(car.q, [0, 0, -1]));
    car.grounded = false;
    car.contacts = 0;
    return true;
  }
  var dot4 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];

  // web/wwwroot/rc/physics/session.mjs
  function createSession(course, { mode = "kid", params = BUGGY } = {}) {
    const { pos, yaw } = course.start;
    const car = createCar(params, [pos[0], groundBelow2(course.world, pos) + rideHeight(params), pos[2]], yaw);
    return {
      course,
      car,
      assist: createAssist(mode),
      flight: createFlight(),
      mode,
      time: 0,
      gate: 0,
      running: false,
      finished: false,
      lap: 1,
      laps: Math.max(1, Math.floor(course.laps ?? 1)),
      lapTimes: [],
      lapStartedAt: 0,
      hits: 0,
      found: 0,
      seen: [],
      coins: [],
      travel: 0,
      recoveries: 0,
      stuckTime: 0,
      autoUnstick: mode === "kid"
    };
  }
  function throughGate(a, b, g) {
    if (Math.hypot(b[0] - g[0], b[2] - g[1]) < (g[3] ?? 2.4)) return true;
    const f = g[4];
    if (!f || !a) return false;
    const d0 = (a[0] - g[0]) * f[0] + (a[2] - g[1]) * f[1], d1 = (b[0] - g[0]) * f[0] + (b[2] - g[1]) * f[1];
    if (!(d0 < 0 && d1 >= 0)) return false;
    const t = d0 / (d0 - d1), x = a[0] + (b[0] - a[0]) * t, z = a[2] + (b[2] - a[2]) * t;
    return Math.abs((x - g[0]) * -f[1] + (z - g[1]) * f[0]) < (g[3] ?? 2.4) + 1.5;
  }
  function groundBelow2(world2, pos) {
    const hit = world2.raycast([pos[0], pos[1] + 0.5, pos[2]], [0, -1, 0], 1) ?? world2.raycast([pos[0], pos[1] + 20, pos[2]], [0, -1, 0], 40);
    return hit ? hit.point[1] : pos[1];
  }
  var above = (s2, maxDrop) => s2.course.world.raycast(s2.car.pos, [0, -1, 0], maxDrop);
  function stepSession(s2, raw, dt = 1 / 120) {
    const before = [...s2.car.pos];
    s2.prevPos = before;
    if (!s2.roam && s2.flight.mode) s2.flight.mode = null;
    if (stepFlight(s2.flight, s2.car, raw.flight, s2.course.world, dt)) {
    } else if (!stepSkateRide(s2, raw, dt)) stepCar(s2.car, assistInput(s2.assist, s2.car, s2.skateRide ? { ...raw, skate: true } : raw, dt, s2.course.world), s2.course.world, dt);
    s2.travel += len(sub(s2.car.pos, before));
    if (s2.car.wallImpact > 1.5) s2.hits++;
    const pushing = Math.abs(raw.throttle || 0) > 0.4 && s2.car.speed < 0.3 && s2.car.grounded;
    s2.stuckTime = pushing ? s2.stuckTime + dt : 0;
    if (s2.autoUnstick && s2.stuckTime > 2.5) {
      s2.stuckTime = 0;
      recover(s2);
    }
    if (s2.course.outOfBounds?.(s2.car.pos)) recover(s2);
    if (s2.running) s2.time += dt;
    const [x, , z] = s2.car.pos, low = !!above(s2, 1.6);
    const cps = s2.course.checkpoints;
    if (!s2.roam && !s2.finished && low && s2.gate > 0 && s2.gate + 1 < cps.length && !throughGate(s2.prevPos, s2.car.pos, cps[s2.gate]) && throughGate(s2.prevPos, s2.car.pos, cps[s2.gate + 1])) {
      const a = cps[s2.gate - 1], b = cps[s2.gate], c = cps[s2.gate + 1];
      if (s2.travel - (s2.gateTravel ?? 0) >= 0.6 * (Math.hypot(b[0] - a[0], b[1] - a[1]) + Math.hypot(c[0] - b[0], c[1] - b[1]))) {
        s2.gate++;
        s2.missedGates = (s2.missedGates ?? 0) + 1;
      }
    }
    const g = cps[s2.gate];
    if (!s2.roam && !s2.finished && low && throughGate(s2.prevPos, s2.car.pos, g)) {
      if (!s2.running) {
        s2.running = true;
        s2.time = 0;
      }
      s2.gate++;
      s2.gateTravel = s2.travel;
      if (s2.gate === cps.length) {
        s2.lapTimes.push(s2.time - s2.lapStartedAt);
        s2.lapStartedAt = s2.time;
        if (s2.lap < s2.laps) {
          s2.lap++;
          s2.gate = 1;
        } else {
          s2.running = false;
          s2.finished = true;
          s2.gate = cps.length - 1;
        }
      }
    }
    for (const c of s2.course.coins ?? [])
      if (!s2.coins.includes(c.name) && Math.hypot(x - c.x, z - c.z) < 0.7 && Math.abs(s2.car.pos[1] - c.y) < 0.8) s2.coins.push(c.name);
    s2.course.secrets.forEach((p, i) => {
      if (low && !s2.seen.includes(i) && Math.hypot(x - p.x, z - p.z) < 3.3) {
        s2.seen.push(i);
        s2.found++;
      }
    });
  }
  function recover(s2) {
    s2.flight.mode = null;
    if (s2.roam) return recoverInPlace(s2);
    const cps = s2.course.checkpoints, last = cps[Math.max(0, s2.gate - 1)], next = cps[Math.min(cps.length - 1, s2.gate)];
    const streakKey = `${s2.lap}:${s2.gate}`;
    s2.recoverStreak = s2.recoverKey === streakKey ? (s2.recoverStreak ?? 0) + 1 : 0;
    s2.recoverKey = streakKey;
    const line = s2.gate > 0 && s2.course.ai?.length > 2 ? s2.course.ai : null;
    if (line) {
      const n = line.length, near = (x, z) => line.reduce((b, a, k) => Math.hypot(a.pos[0] - x, a.pos[2] - z) < Math.hypot(line[b].pos[0] - x, line[b].pos[2] - z) ? k : b, 0);
      const from = near(last[0], last[1]), to = near(next[0], next[1]), span = (to - from + n) % n;
      const i = (from + Math.min(s2.recoverStreak * 3, Math.max(0, span - 1))) % n, p = line[i].pos, q = line[(i + 1) % n].pos;
      placeCar(s2.car, [p[0], groundBelow2(s2.course.world, [p[0], p[1] ?? 0, p[2]]) + rideHeight(s2.car.params) + 0.02, p[2]], Math.atan2(q[0] - p[0], -(q[2] - p[2])));
    } else {
      const yaw = s2.gate === 0 ? s2.course.start.yaw : Math.atan2(next[0] - last[0], -(next[1] - last[1]));
      placeCar(s2.car, [last[0], groundBelow2(s2.course.world, [last[0], s2.course.event?.points?.[Math.max(0, s2.gate - 1)]?.[2] ?? 0, last[1]]) + rideHeight(s2.car.params) + 0.02, last[1]], yaw);
    }
    s2.recoveries++;
    if (s2.running && !MODES[s2.mode].freeRecovery) s2.time += 3;
  }
  function recoverInPlace(s2) {
    if (s2.course.recoveryPoint) {
      const at = s2.course.recoveryPoint(s2.car.pos);
      placeCar(s2.car, [at.pos[0], (Number.isFinite(at.groundY) ? at.groundY : groundBelow2(s2.course.world, at.pos)) + rideHeight(s2.car.params) + 0.02, at.pos[2]], at.yaw ?? carYaw(s2.car));
      s2.recoveries++;
      return;
    }
    const pts = s2.course.ai?.length ? s2.course.ai.map((a) => [a.pos[0], a.pos[2]]) : s2.course.checkpoints.map((c) => [c[0], c[1]]);
    const [x, , z] = s2.car.pos, n = pts.length;
    const i = pts.reduce((b, p2, k) => Math.hypot(p2[0] - x, p2[1] - z) < Math.hypot(pts[b][0] - x, pts[b][1] - z) ? k : b, 0);
    const p = pts[i], q = pts[(i + 1) % n], yaw = Math.atan2(q[0] - p[0], -(q[1] - p[1]));
    placeCar(s2.car, [p[0], groundBelow2(s2.course.world, [p[0], 0, p[1]]) + rideHeight(s2.car.params) + 0.02, p[1]], yaw);
    s2.recoveries++;
  }
  function readout(s2) {
    const c = s2.car;
    return {
      x: c.pos[0],
      y: c.pos[1],
      z: c.pos[2],
      yaw: carYaw(c),
      speed: c.speed,
      forwardSpeed: c.forwardSpeed,
      steer: c.steer,
      grounded: c.grounded,
      contacts: c.contacts
    };
  }

  // tools/rc/native/sim-entry.mjs
  var s = null;
  var world = null;
  globalThis.RCSim = {
    // tris: Float32Array (9 per triangle), surf: Uint8Array (index per triangle), surfaces: names.
    load(tris, surf, surfaces, flatGround, spawn, yaw) {
      world = createWorld();
      for (let i = 0, n = surf.length; i < n; i++) {
        const o = i * 9;
        world.addTri([tris[o], tris[o + 1], tris[o + 2]], [tris[o + 3], tris[o + 4], tris[o + 5]], [tris[o + 6], tris[o + 7], tris[o + 8]], surfaces[surf[i]]);
      }
      if (flatGround) {
        const [x, , z] = spawn, R = 3e3;
        world.addQuad([x - R, 0, z - R], [x - R, 0, z + R], [x + R, 0, z + R], [x + R, 0, z - R], "asphalt");
      }
      s = createSession({ world, start: { pos: spawn, yaw }, checkpoints: [[spawn[0], spawn[2] - 500, "finish"]], secrets: [] }, { mode: "kid" });
      s.roam = true;
      s.autoUnstick = true;
      return world.tris.length;
    },
    // Inputs in -1..1; steps fixed 1/120 s substeps covering dt.
    // Flight keys follow the guns-only jet: pitch (+ pull), roll (+ right), yaw, power, burner.
    step(throttle, steer, brake, drift, boost, pitch, roll, yaw, power, burner, dt) {
      if (!s) return;
      this.acc = (this.acc ?? 0) + Math.min(dt, 0.1);
      const flight = { pitch, roll, yaw, power, burner: !!burner };
      while (this.acc >= 1 / 120) {
        stepSession(s, { throttle, steer, brake: !!brake, drift: !!drift, boost, flight }, 1 / 120);
        this.acc -= 1 / 120;
      }
    },
    pose() {
      const c = s.car, r = readout(s);
      return [...c.pos, ...c.q, r.speed, r.yaw, s.flight.mode === "fly" ? 1 : s.flight.mode === "chute" ? 2 : 0];
    },
    fly() {
      return toggleFlight(s.flight, s.car, { roam: true });
    },
    recover() {
      recover(s);
    }
  };
})();
