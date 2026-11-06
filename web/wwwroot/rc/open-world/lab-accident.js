import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {
  LAB,
  SIGNS,
  WINDOWS,
  PORTAL_AT,
  tunnelPoint,
  tunnelYaw,
  deckPitch,
  poseQuat,
  beside,
  rideU,
  labWorld,
  cameraAim,
  carPoses
} from './lab-accident.mjs';

// Det 3's underground lab, drawn. Static concrete merges into one mesh. Robots, crystals
// and sparks are instanced. The tram, beam, portals and signs move.
const COL = {
  concrete: '#8b949c',
  floor: '#6a737c',
  stripe: '#e2b143',
  steel: '#5c656c',
  glass: '#c5e8ff',
  robot: '#d5dbe0',
  eye: '#3ad7ff',
  crystal: '#7a5cff',
  saucer: '#d5dbe3',
  tarp: '#3c4a42',
  door: '#d23b3b',
  beam: '#9af6ff',
  portal: '#3dff9a'
};

export function createLabView(scene, root = document.body) {
  const group = new T.Group();
  group.name = 'Det3Lab';
  scene.add(group);
  const parts = [];
  const coloured = (g, hex) => {
    const c = new T.Color(hex),
      n = g.attributes.position.count,
      a = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) a.set([c.r, c.g, c.b], i * 3);
    g.setAttribute('color', new T.BufferAttribute(a, 3));
    g.deleteAttribute('uv');
    return g;
  };
  const bake = (g, hex, pos, quat, scale = null) => {
    g = g.toNonIndexed();
    coloured(g, hex);
    g.applyMatrix4(
      new T.Matrix4().compose(
        new T.Vector3(...pos),
        quat instanceof T.Quaternion ? quat : new T.Quaternion(),
        scale instanceof T.Vector3 ? scale : new T.Vector3(1, 1, 1)
      )
    );
    parts.push(g);
  };
  const box = (w, h, d, pos, quat, hex) => bake(new T.BoxGeometry(w, h, d), hex, pos, quat);
  const span = (u0, u1) => {
    const from = tunnelPoint(u0),
      to = tunnelPoint(u1),
      z = new T.Vector3(to[0] - from[0], to[1] - from[1], to[2] - from[2]),
      len = z.length() || 0.001;
    z.multiplyScalar(1 / len);
    const x = new T.Vector3().crossVectors(new T.Vector3(0, 1, 0), z);
    if (x.lengthSq() < 1e-8) x.set(1, 0, 0);
    x.normalize();
    const y = new T.Vector3().crossVectors(z, x).normalize();
    const q = new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, z));
    const mid = new T.Vector3((from[0] + to[0]) / 2, (from[1] + to[1]) / 2, (from[2] + to[2]) / 2);
    return {q, len, mid, x, y, z};
  };
  const N = 22;
  const windowAt = u => WINDOWS.some(w => Math.abs(w.u - u) < 0.045);
  for (let i = 0; i < N; i++) {
    const u0 = i / N,
      u1 = (i + 1) / N,
      s = span(u0, u1),
      open = windowAt((u0 + u1) / 2);
    const put = (w, h, d, shift, hex) => {
      const p = s.mid.clone().add(shift);
      box(w, h, d, p.toArray(), s.q, hex);
    };
    put(3.3, 0.14, s.len + 0.08, s.y.clone().multiplyScalar(-0.07), COL.floor);
    put(3.3, 0.12, s.len + 0.08, s.y.clone().multiplyScalar(2.55), COL.concrete);
    put(0.16, 0.08, s.len + 0.02, s.y.clone().multiplyScalar(0.04).add(s.x.clone().multiplyScalar(0.42)), COL.stripe);
    put(0.16, 0.08, s.len + 0.02, s.y.clone().multiplyScalar(0.04).add(s.x.clone().multiplyScalar(-0.42)), COL.stripe);
    if (!open) {
      put(0.18, 2.55, s.len + 0.06, s.x.clone().multiplyScalar(1.55).add(s.y.clone().multiplyScalar(1.25)), COL.concrete);
      put(0.18, 2.55, s.len + 0.06, s.x.clone().multiplyScalar(-1.55).add(s.y.clone().multiplyScalar(1.25)), COL.concrete);
    }
    if (i % 3 === 0) {
      put(0.12, 2.2, 0.12, s.x.clone().multiplyScalar(1.45), COL.steel);
      put(0.12, 2.2, 0.12, s.x.clone().multiplyScalar(-1.45), COL.steel);
    }
  }
  // Round test chamber, under the hangar.
  const cY = labWorld([0, LAB.height / 2, 0]);
  bake(
    new T.CylinderGeometry(LAB.radius, LAB.radius, LAB.height, LAB.segments, 1, true),
    COL.concrete,
    cY,
    new T.Quaternion()
  );
  bake(
    new T.CircleGeometry(LAB.radius, LAB.segments),
    COL.floor,
    labWorld([0, 0.02, 0]),
    new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), -Math.PI / 2)
  );
  bake(
    new T.CircleGeometry(LAB.radius - 0.05, LAB.segments),
    COL.concrete,
    labWorld([0, LAB.height - 0.04, 0]),
    new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2)
  );
  bake(
    new T.TorusGeometry(2.4, 0.08, 8, 28),
    COL.stripe,
    labWorld([0, 0.06, 0]),
    new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), Math.PI / 2)
  );
  // Sealed exits: red slabs. North is the way on (stage 2). South is the tram door.
  box(5.4, LAB.height - 0.2, 0.35, labWorld([0, LAB.height / 2, -(LAB.radius - 0.3)]), null, COL.door);
  box(5.4, LAB.height - 0.2, 0.35, labWorld([0, LAB.height / 2, LAB.radius - 0.4]), null, COL.door);
  // Beam machine: posts, ring, base.
  box(0.35, 3.4, 0.35, labWorld([-1.5, 1.7, 0]), null, COL.steel);
  box(0.35, 3.4, 0.35, labWorld([1.5, 1.7, 0]), null, COL.steel);
  box(3.6, 0.22, 0.35, labWorld([0, 3.35, 0]), null, COL.steel);
  bake(
    new T.CylinderGeometry(1.15, 1.25, 0.18, 16),
    COL.stripe,
    labWorld([0, 0.12, 0]),
    new T.Quaternion()
  );
  // Windows: a room behind the glass, and Hangar Zero's saucer behind a slit.
  const rooms = [];
  for (const w of WINDOWS) {
    const p = beside(w.u, w.side, 2.55),
      back = beside(w.u, w.side, 4.15),
      yaw = tunnelYaw() + (w.side > 0 ? 0 : Math.PI),
      q = new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw);
    box(3.4, 0.12, 3.6, [p[0], p[1] + 0.06, p[2]], q, COL.floor);
    box(0.16, 2.2, 3.6, [back[0], back[1] + 1.1, back[2]], q, COL.concrete);
    if (w.kind === 'saucer') {
      const at = [p[0], p[1] + 1.05, p[2]];
      bake(new T.CylinderGeometry(0.9, 0.9, 0.22, 16), COL.saucer, at, q);
      bake(new T.SphereGeometry(0.42, 14, 8), COL.saucer, [at[0], at[1] + 0.28, at[2]], q, new T.Vector3(1, 0.55, 1));
      box(1.8, 0.08, 1.5, [at[0], at[1] + 0.55, at[2]], q, COL.tarp);
      box(0.08, 1.8, 0.08, [at[0] + 1.3, at[1] + 0.2, at[2]], null, COL.steel);
      box(0.08, 1.8, 0.08, [at[0] - 1.2, at[1] + 0.2, at[2] + 0.4], null, COL.steel);
    }
    rooms.push({...w, p, q});
  }
  const shellGeo = mergeGeometries(parts, false);
  shellGeo.computeVertexNormals();
  const shell = new T.Mesh(
    shellGeo,
    new T.MeshStandardMaterial({vertexColors: true, roughness: 0.84, metalness: 0.05})
  );
  shell.name = 'Det3Shell';
  group.add(shell);

  const glassMat = new T.MeshStandardMaterial({
    color: COL.glass,
    transparent: true,
    opacity: 0.28,
    roughness: 0.05,
    metalness: 0.1,
    depthWrite: false
  });
  for (const w of WINDOWS) {
    const p = beside(w.u, w.side, 1.62),
      pane = new T.Mesh(new T.PlaneGeometry(w.kind === 'saucer' ? 1.1 : 2.4, 1.5), glassMat);
    pane.position.set(p[0], p[1] + 1.15, p[2]);
    pane.lookAt(tunnelPoint(w.u)[0], p[1] + 1.15, tunnelPoint(w.u)[2]);
    group.add(pane);
  }

  const robots = robotRows(rooms.filter(r => r.kind === 'robots'));
  // Two more beside the machine, clipboards optional: a flat box arm is enough.
  robots.push(
    {pos: labWorld([-3.2, 0, 2.4]), yaw: 0.4},
    {pos: labWorld([3.1, 0, 2.2]), yaw: -0.5}
  );
  const body = new T.InstancedMesh(
      new T.BoxGeometry(0.46, 0.55, 0.32),
      new T.MeshStandardMaterial({color: COL.robot, roughness: 0.55}),
      robots.length
    ),
    head = new T.InstancedMesh(
      new T.BoxGeometry(0.32, 0.28, 0.28),
      new T.MeshStandardMaterial({color: '#eef3f6', roughness: 0.4}),
      robots.length
    ),
    eye = new T.InstancedMesh(
      new T.BoxGeometry(0.16, 0.06, 0.04),
      new T.MeshStandardMaterial({color: COL.eye, emissive: COL.eye, emissiveIntensity: 0.8}),
      robots.length
    ),
    arm = new T.InstancedMesh(
      new T.BoxGeometry(0.1, 0.42, 0.1),
      new T.MeshStandardMaterial({color: COL.robot, roughness: 0.55}),
      robots.length
    );
  const dummy = new T.Object3D();
  const placeRobot = (mesh, i, y, extraYaw = 0, pitch = 0) => {
    const r = robots[i];
    dummy.position.set(r.pos[0], r.pos[1] + y, r.pos[2]);
    dummy.rotation.set(pitch, r.yaw + extraYaw, 0);
    dummy.updateMatrix();
    mesh.setMatrixAt(i, dummy.matrix);
  };
  for (let i = 0; i < robots.length; i++) {
    placeRobot(body, i, 0.55);
    placeRobot(head, i, 0.98);
    placeRobot(eye, i, 1.02);
    placeRobot(arm, i, 0.85, 0.4, -0.5);
  }
  body.instanceMatrix.needsUpdate = head.instanceMatrix.needsUpdate = eye.instanceMatrix.needsUpdate = arm.instanceMatrix.needsUpdate = true;
  group.add(body, head, eye, arm);

  const crystalN = 10,
    crystals = new T.InstancedMesh(
      new T.OctahedronGeometry(0.16, 0),
      new T.MeshStandardMaterial({
        color: COL.crystal,
        emissive: COL.crystal,
        emissiveIntensity: 0.7,
        roughness: 0.25
      }),
      crystalN
    );
  group.add(crystals);
  const crystalRoom = rooms.find(r => r.kind === 'crystals');

  const sparkN = 16,
    sparks = new T.InstancedMesh(
      new T.BoxGeometry(0.06, 0.06, 0.06),
      new T.MeshStandardMaterial({color: '#ffd27a', emissive: '#ffb03a', emissiveIntensity: 1.4}),
      sparkN
    );
  sparks.visible = false;
  group.add(sparks);

  const beam = new T.Mesh(
      new T.CylinderGeometry(0.35, 0.55, 1, 12, 1, true),
      new T.MeshStandardMaterial({
        color: COL.beam,
        emissive: COL.beam,
        emissiveIntensity: 0,
        transparent: true,
        opacity: 0.85,
        depthWrite: false
      })
    ),
    gem = new T.Mesh(
      new T.OctahedronGeometry(0.28, 0),
      new T.MeshStandardMaterial({color: COL.crystal, emissive: COL.crystal, emissiveIntensity: 0.5})
    );
  beam.position.set(...labWorld([0, 1.6, 0]));
  gem.position.set(...labWorld([0, 3.05, 0]));
  group.add(beam, gem);

  const portals = PORTAL_AT.slice(0, 4).map(at => {
    const m = new T.Mesh(
      new T.TorusGeometry(1.15, 0.09, 8, 28),
      new T.MeshStandardMaterial({color: '#10261c', emissive: COL.portal, emissiveIntensity: 0, roughness: 0.35})
    );
    const p = labWorld(at);
    m.position.set(p[0], p[1], p[2]);
    m.lookAt(labWorld([0, at[1], 0])[0], p[1], labWorld([0, at[1], 0])[2]);
    m.scale.setScalar(0.001);
    group.add(m);
    return m;
  });

  const signs = SIGNS.map(sign => {
    const tex = signTexture(sign.text);
    const mat = new T.MeshStandardMaterial({
      map: tex,
      emissive: '#ffe08a',
      emissiveMap: tex,
      emissiveIntensity: 0.35,
      roughness: 0.55
    });
    const m = new T.Mesh(new T.PlaneGeometry(sign.at === 'door' ? 1.6 : 2.1, 0.48), mat);
    m.userData.blink = !!sign.blink;
    if (sign.at === 'tunnel') {
      const side = sign.u > 0.5 ? -1 : 1;
      const p = beside(sign.u, side, 1.48);
      m.position.set(p[0], p[1] + 1.7, p[2]);
      m.lookAt(tunnelPoint(sign.u)[0], p[1] + 1.7, tunnelPoint(sign.u)[2]);
    } else if (sign.at === 'door') {
      const p = labWorld([0, 2.4, -(LAB.radius - 0.55)]);
      m.position.set(p[0], p[1], p[2]);
      m.lookAt(labWorld([0, 2.4, 0])[0], p[1], labWorld([0, 2.4, 0])[2]);
    } else {
      const p = labWorld([-4.2, 2.3, -6]);
      m.position.set(p[0], p[1], p[2]);
      m.lookAt(labWorld([0, 2.3, 0])[0], p[1], labWorld([0, 2.3, 0])[2]);
    }
    group.add(m);
    return m;
  });

  const tram = new T.Group();
  tram.name = 'Det3Tram';
  const deck = new T.Mesh(
    new T.BoxGeometry(1.7, 0.1, 2.3),
    new T.MeshStandardMaterial({color: '#4d565c', roughness: 0.7, metalness: 0.2})
  );
  deck.position.y = -0.02;
  tram.add(deck);
  for (const z of [-0.85, 0.85])
    for (const x of [-0.62, 0.62]) {
      const wheel = new T.Mesh(
        new T.CylinderGeometry(0.16, 0.16, 0.1, 10),
        new T.MeshStandardMaterial({color: '#2a3034'})
      );
      wheel.rotation.z = Math.PI / 2;
      wheel.position.set(x, -0.16, z);
      tram.add(wheel);
    }
  {
    const p0 = tunnelPoint(0),
      q0 = poseQuat(tunnelYaw(), deckPitch());
    tram.position.set(p0[0], p0[1], p0[2]);
    tram.quaternion.set(q0[0], q0[1], q0[2], q0[3]);
  }
  group.add(tram);
  if (crystalRoom)
    for (let i = 0; i < crystalN; i++) {
      const along = (i / crystalN - 0.5) * 2.6;
      dummy.position.set(crystalRoom.p[0], crystalRoom.p[1] + 0.85, crystalRoom.p[2] + along);
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(1);
      dummy.updateMatrix();
      crystals.setMatrixAt(i, dummy.matrix);
    }
  crystals.instanceMatrix.needsUpdate = true;

  const chamberLight = new T.PointLight('#9ad7ff', 24, 26, 1.4);
  chamberLight.position.set(...labWorld([0, 3.6, 0]));
  const beamLight = new T.PointLight('#bff8ff', 0, 10, 1.6);
  beamLight.position.set(...labWorld([0, 1.8, 0]));
  group.add(chamberLight, beamLight);
  const cold = new T.Color('#9ad7ff'),
    hot = new T.Color('#ff3a3a');

  const el = document.createElement('div');
  el.id = 'lab-ride';
  el.hidden = true;
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  el.innerHTML = `<style>
#lab-ride{position:fixed;inset:0;z-index:30;pointer-events:none;color:#f4ecd6}
#lab-ride .bar{position:absolute;left:0;right:0;height:0;background:#000;transition:height .5s ease}
#lab-ride .bar.top{top:0}#lab-ride .bar.bot{bottom:0}
#lab-ride.on .bar{height:11vh}
#lab-ride .card{position:absolute;left:8vw;right:8vw;bottom:13vh;text-align:center;font:700 clamp(22px,3.5vw,46px)/1.25 system-ui,sans-serif;text-shadow:0 2px 12px #000;opacity:0}
#lab-ride .card.show{opacity:1}
#lab-ride .skip{position:absolute;right:4vw;bottom:3.2vh;font:600 15px system-ui,sans-serif;letter-spacing:.14em}
</style><div class="bar top"></div><div class="bar bot"></div><div class="card"></div><div class="skip" hidden>A · ENTER</div>`;
  root.appendChild(el);
  const card = el.querySelector('.card'),
    skip = el.querySelector('.skip');
  let held = false;

  return {
    update(state) {
      const u = rideU(state),
        p = tunnelPoint(u),
        q = poseQuat(tunnelYaw(), state.phase === 'ride' || state.phase === 'idle' ? deckPitch() : 0);
      tram.position.set(p[0], p[1], p[2]);
      tram.quaternion.set(q[0], q[1], q[2], q[3]);
      const wave = state.wave || 0;
      for (let i = 0; i < robots.length; i++) {
        const swing = Math.sin(wave * 3.2 + i * 0.7) * 0.85;
        placeRobot(arm, i, 0.85, 0.4, -0.5 + swing);
      }
      arm.instanceMatrix.needsUpdate = true;
      if (crystalRoom) {
        const shift = (state.crystal || 0) % 1;
        for (let i = 0; i < crystalN; i++) {
          const t = (i / crystalN + shift) % 1,
            along = (t - 0.5) * 2.6;
          dummy.position.set(crystalRoom.p[0], crystalRoom.p[1] + 0.85, crystalRoom.p[2] + along);
          dummy.rotation.set(wave + i, wave * 0.4, 0);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          crystals.setMatrixAt(i, dummy.matrix);
        }
        crystals.instanceMatrix.needsUpdate = true;
      }
      const power = state.beam || 0;
      beam.scale.set(0.4 + power, 0.15 + power * 2.8, 0.4 + power);
      beam.material.emissiveIntensity = power * 2.4;
      beam.material.opacity = 0.25 + power * 0.7;
      gem.position.y = labWorld([0, 3.05 - power * 1.35, 0])[1];
      gem.material.emissiveIntensity = 0.4 + power * 1.6;
      beamLight.intensity = power * 16;
      const red = state.alarm || 0;
      chamberLight.color.copy(cold).lerp(hot, red);
      chamberLight.intensity = (red ? 14 : 24) * (state.flicker ?? 1);
      portals.forEach((m, i) => {
        const k = state.portals?.[i] ?? 0;
        m.scale.setScalar(Math.max(0.001, k));
        m.material.emissiveIntensity = k * 2.2;
        m.rotation.z = wave * (0.4 + i * 0.05);
      });
      sparks.visible = (state.sparks || 0) > 0;
      if (sparks.visible) {
        const origin = labWorld([0, 1.4, 0]);
        for (let i = 0; i < sparkN; i++) {
          const a = wave * 6 + i,
            rad = 0.4 + (i % 5) * 0.35;
          dummy.position.set(origin[0] + Math.cos(a) * rad, origin[1] + ((i * 17) % 10) / 12, origin[2] + Math.sin(a) * rad);
          dummy.rotation.set(0, 0, 0);
          dummy.scale.setScalar(1);
          dummy.updateMatrix();
          sparks.setMatrixAt(i, dummy.matrix);
        }
        sparks.instanceMatrix.needsUpdate = true;
      }
      const blink = 0.25 + 0.75 * Math.abs(Math.sin(wave * 4));
      for (const s of signs) s.material.emissiveIntensity = s.userData.blink ? blink : 0.45;
      const on = state.phase !== 'idle' && state.phase !== 'free';
      el.hidden = !on;
      el.classList.toggle('on', on);
      card.textContent = on ? state.caption || '' : '';
      card.classList.toggle('show', !!(on && state.caption));
      skip.hidden = !state.skipHint;
      if (on) {
        document.body.classList.add('cinematic');
        held = true;
      } else if (held) {
        document.body.classList.remove('cinematic');
        held = false;
      }
    },
    aim(camera, camera2, state, {split = false, lift = 0.22} = {}) {
      const pose = carPoses(state, {split, lift});
      const put = (cam, slot) => {
        const a = cameraAim(pose, state, slot, state.time);
        cam.up.set(0, 1, 0);
        cam.position.set(a.eye[0], a.eye[1], a.eye[2]);
        cam.lookAt(a.target[0], a.target[1], a.target[2]);
        cam.fov = a.fov;
        cam.updateProjectionMatrix();
      };
      put(camera, 0);
      if (split && camera2) {
        if (!camera2.userData.labFar) camera2.userData.labFar = camera2.far;
        camera2.far = 480;
        put(camera2, 1);
        camera2.updateProjectionMatrix();
      }
    },
    dispose() {
      el.remove();
      group.removeFromParent();
      shellGeo.dispose();
    }
  };
}

function robotRows(rooms) {
  const out = [];
  for (const room of rooms)
    for (let i = 0; i < 6; i++) {
      const along = (i - 2.5) * 0.55;
      out.push({pos: [room.p[0], room.p[1], room.p[2] + along], yaw: room.side > 0 ? Math.PI / 2 : -Math.PI / 2});
    }
  return out;
}

function signTexture(text) {
  const c = document.createElement('canvas');
  c.width = 512;
  c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#1a242c';
  g.fillRect(0, 0, 512, 128);
  g.strokeStyle = '#e2b143';
  g.lineWidth = 10;
  g.strokeRect(8, 8, 496, 112);
  g.fillStyle = '#ffe7a8';
  g.font = '700 64px system-ui, sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 256, 68);
  const tex = new T.CanvasTexture(c);
  tex.colorSpace = T.SRGBColorSpace;
  return tex;
}
