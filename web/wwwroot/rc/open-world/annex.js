import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {labWorld} from './lab-accident.mjs';
import {
  LEVER,
  PLATES,
  TERMINALS,
  TANKS,
  annexBoxes,
  roofSeat
} from './annex.mjs';

// Zones 1 and 2, drawn. Static concrete is one mesh. The turntable, plates, aliens and the
// rescued scientists move. Headlights are spot lights aimed by the cars while it is dark.
const COL = {
  floor: '#3c444c',
  wall: '#6d7680',
  ceiling: '#2c333a',
  island: '#5c656e',
  stripe: '#e2b143',
  gate: '#e23b32',
  glass: '#b7e4ef',
  goo: '#3dff9a',
  alien: '#8ee0c8',
  robot: '#d5dbe0',
  eye: '#3ad7ff',
  lever: '#e2b143'
};

const paint = {
  floor: COL.floor,
  wall: COL.wall,
  ceiling: COL.ceiling,
  island: COL.island
};

export function createAnnexView(scene) {
  const group = new T.Group();
  group.name = 'AnnexDescent';
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
  const bake = (w, h, d, pos, hex) => {
    const g = new T.BoxGeometry(w, h, d).toNonIndexed();
    coloured(g, hex);
    g.applyMatrix4(new T.Matrix4().makeTranslation(pos[0], pos[1], pos[2]));
    parts.push(g);
  };
  for (const b of annexBoxes()) {
    if (b.kind === 'gate' || b.kind === 'tank') continue;
    const [x0, x1, z0, z1, y0, y1] = b.box;
    const pos = labWorld([(x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2]);
    bake(x1 - x0, y1 - y0, z1 - z0, pos, paint[b.kind] || COL.wall);
  }
  const shellGeo = mergeGeometries(parts, false);
  shellGeo.computeVertexNormals();
  const shell = new T.Mesh(
    shellGeo,
    new T.MeshStandardMaterial({vertexColors: true, roughness: 0.86, metalness: 0.04})
  );
  shell.name = 'AnnexShell';
  group.add(shell);
  const stripMat = new T.MeshStandardMaterial({
    color: COL.stripe,
    emissive: COL.stripe,
    emissiveIntensity: 0.55,
    roughness: 0.45
  });
  for (const [x, z, w, d] of [
    [-4.7, -28, 0.16, 12],
    [4.7, -28, 0.16, 12],
    [0, -49.6, 0.16, 5.2],
    [6.05, -60.4, 0.16, 8]
  ]) {
    const m = new T.Mesh(new T.BoxGeometry(w, 0.02, d), stripMat);
    const p = labWorld([x, 0.03, z]);
    m.position.set(p[0], p[1], p[2]);
    group.add(m);
  }

  const disc = new T.Mesh(
    new T.CylinderGeometry(2.05, 2.05, 0.1, 24),
    new T.MeshStandardMaterial({color: '#4a545c', metalness: 0.35, roughness: 0.45})
  );
  const discAt = labWorld([0, 0.52, -25]);
  disc.position.set(discAt[0], discAt[1], discAt[2]);
  const chevron = new T.Mesh(
    new T.BoxGeometry(0.28, 0.04, 1.4),
    new T.MeshStandardMaterial({color: COL.stripe, emissive: COL.stripe, emissiveIntensity: 0.35})
  );
  chevron.position.z = -0.7;
  disc.add(chevron);
  group.add(disc);

  const barrier = new T.Mesh(
    new T.BoxGeometry(3.15, 1.05, 0.22),
    new T.MeshStandardMaterial({color: COL.gate, emissive: '#5a120e', emissiveIntensity: 0.4, roughness: 0.5})
  );
  const barAt = labWorld([0, 0.58, -34.45]);
  barrier.position.set(barAt[0], barAt[1], barAt[2]);
  group.add(barrier);

  const lever = new T.Group();
  const post = new T.Mesh(
    new T.BoxGeometry(0.16, 0.7, 0.16),
    new T.MeshStandardMaterial({color: '#8a9298', roughness: 0.5})
  );
  post.position.y = 0.35;
  const handle = new T.Mesh(
    new T.BoxGeometry(0.5, 0.1, 0.1),
    new T.MeshStandardMaterial({color: COL.lever, emissive: COL.lever, emissiveIntensity: 0.45})
  );
  handle.position.set(0.05, 0.62, 0);
  lever.add(post, handle);
  const leverAt = labWorld(LEVER.at);
  lever.position.set(leverAt[0], leverAt[1], leverAt[2]);
  group.add(lever);

  const plateMat = () =>
    new T.MeshStandardMaterial({
      color: '#243044',
      emissive: '#ff6a3a',
      emissiveIntensity: 0.15,
      roughness: 0.4
    });
  const plates = PLATES.map(p => {
    const m = new T.Mesh(new T.BoxGeometry(p.w, 0.025, p.d), plateMat());
    const at = labWorld([p.x, 0.03, p.z]);
    m.position.set(at[0], at[1], at[2]);
    group.add(m);
    return m;
  });
  const spark = new T.InstancedMesh(
    new T.BoxGeometry(0.08, 0.08, 0.08),
    new T.MeshStandardMaterial({color: '#ffe1a8', emissive: '#ffb03a', emissiveIntensity: 1.6}),
    PLATES.length * 2
  );
  group.add(spark);
  const dummy = new T.Object3D();

  const tankGeo = new T.CylinderGeometry(0.82, 0.86, 1.45, 16);
  const tankMat = new T.MeshStandardMaterial({
    color: COL.glass,
    transparent: true,
    opacity: 0.45,
    roughness: 0.08,
    metalness: 0.05
  });
  const crackMat = new T.MeshStandardMaterial({color: '#1b2428', roughness: 0.6});
  const gooMat = new T.MeshStandardMaterial({
    color: COL.goo,
    emissive: COL.goo,
    emissiveIntensity: 0.7,
    roughness: 0.35
  });
  for (const t of TANKS) {
    const p = labWorld([t.at[0], 0.75, t.at[1]]);
    const cyl = new T.Mesh(tankGeo, tankMat);
    cyl.position.set(p[0], p[1], p[2]);
    group.add(cyl);
    if (!t.cracked) continue;
    const crack = new T.Mesh(new T.BoxGeometry(0.06, 1.05, 0.7), crackMat);
    crack.position.set(p[0] + 0.35, p[1], p[2]);
    group.add(crack);
    const puddle = new T.Mesh(new T.CircleGeometry(0.42, 14), gooMat);
    const q = labWorld([t.at[0] + 0.85, 0.025, t.at[1]]);
    puddle.position.set(q[0], q[1], q[2]);
    puddle.rotation.x = -Math.PI / 2;
    group.add(puddle);
  }

  const alienMat = new T.MeshStandardMaterial({color: COL.alien, roughness: 0.55});
  const lidMat = new T.MeshStandardMaterial({color: '#16362e', roughness: 0.4});
  const aliens = [0, 1, 2].map(() => {
    const g = new T.Group();
    const body = new T.Mesh(new T.SphereGeometry(0.28, 14, 10), alienMat);
    body.scale.set(1, 0.72, 1);
    body.position.y = 0.16;
    const head = new T.Mesh(new T.SphereGeometry(0.16, 12, 8), alienMat);
    head.position.y = 0.42;
    const eye = new T.Mesh(new T.BoxGeometry(0.05, 0.012, 0.02), lidMat);
    eye.position.set(0.05, 0.44, 0.14);
    const eye2 = eye.clone();
    eye2.position.x = -0.05;
    g.add(body, head, eye, eye2);
    group.add(g);
    return g;
  });

  const robotMat = new T.MeshStandardMaterial({color: COL.robot, roughness: 0.5});
  const eyeMat = new T.MeshStandardMaterial({color: COL.eye, emissive: COL.eye, emissiveIntensity: 0.8});
  const mini = () => {
    const g = new T.Group();
    const body = new T.Mesh(new T.BoxGeometry(0.16, 0.12, 0.12), robotMat);
    const head = new T.Mesh(new T.BoxGeometry(0.12, 0.08, 0.1), robotMat);
    head.position.y = 0.11;
    const eye = new T.Mesh(new T.BoxGeometry(0.07, 0.02, 0.02), eyeMat);
    eye.position.set(0, 0.12, 0.05);
    g.add(body, head, eye);
    return g;
  };
  const terminals = TERMINALS.map(t => {
    const g = new T.Group();
    const desk = new T.Mesh(
      new T.BoxGeometry(0.55, 0.28, 0.32),
      new T.MeshStandardMaterial({color: '#4e5858', roughness: 0.6})
    );
    desk.position.y = 0.16;
    const sci = mini();
    sci.position.set(0, 0.28, -0.22);
    g.add(desk, sci);
    const p = labWorld(t.desk);
    g.position.set(p[0], p[1], p[2]);
    group.add(g);
    return g;
  });
  const roofs = [mini(), mini(), mini(), mini()];
  for (const m of roofs) {
    m.visible = false;
    group.add(m);
  }

  const lamps = [0, 1].map(() => new T.SpotLight(0xfff3d4, 0, 14, 0.58, 0.4, 1.3));
  for (const lamp of lamps) scene.add(lamp, lamp.target);

  const signMat = text => {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 64;
    const g = c.getContext('2d');
    g.fillStyle = '#1a242c';
    g.fillRect(0, 0, 256, 64);
    g.strokeStyle = '#e2b143';
    g.lineWidth = 6;
    g.strokeRect(4, 4, 248, 56);
    g.fillStyle = '#ffe7a8';
    g.font = '700 36px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(text, 128, 34);
    const tex = new T.CanvasTexture(c);
    tex.colorSpace = T.SRGBColorSpace;
    return new T.MeshStandardMaterial({
      map: tex,
      emissive: '#ffe08a',
      emissiveMap: tex,
      emissiveIntensity: 0.4,
      roughness: 0.5
    });
  };
  const sign = (text, local, face) => {
    const m = new T.Mesh(new T.PlaneGeometry(0.9, 0.24), signMat(text));
    const p = labWorld(local);
    const f = labWorld(face);
    m.position.set(p[0], p[1], p[2]);
    m.lookAt(f[0], f[1], f[2]);
    group.add(m);
  };
  sign('HOLD', [5.55, 0.85, -25], [3, 0.85, -25]);
  sign('ZAP', [-5.4, 0.7, -18.15], [-5.4, 0.7, -16]);
  sign('ROBOT', [0, 1.05, -53.55], [0, 1.05, -52]);
  sign('BOARD', [6.05, 1.05, -53.55], [6.05, 1.05, -52]);
  for (const t of TERMINALS) sign('SAFE', [t.at[0], 0.85, t.at[2] + 0.15], [t.at[0], 0.85, t.at[2] + 1.4]);

  const aim = (lamp, actor) => {
    const on = !!(actor && actor.lamp);
    lamp.visible = on;
    lamp.intensity = on ? 78 : 0;
    if (!actor) return;
    const yaw = actor.yaw || 0,
      fx = Math.sin(yaw),
      fz = -Math.cos(yaw);
    lamp.position.set(actor.pos[0] + fx * 0.1, actor.pos[1] + 0.16, actor.pos[2] + fz * 0.1);
    lamp.target.position.set(actor.pos[0] + fx * 7, actor.pos[1] + 0.04, actor.pos[2] + fz * 7);
  };

  return {
    update(state, actors = []) {
      if (!state) return;
      disc.rotation.y = state.angle;
      barrier.rotation.y = state.angle;
      barrier.position.y = state.blocked ? barAt[1] : barAt[1] + 1.65;
      handle.rotation.z = state.leverDown || state.grace > 0 ? 1.05 : 0.2;
      plates.forEach((m, i) => {
        const on = !!state.live?.[i];
        m.material.emissiveIntensity = on ? 2.2 : 0.12;
        m.material.color.set(on ? '#ff6a3a' : '#243044');
      });
      let n = 0;
      PLATES.forEach((p, i) => {
        const on = !!state.live?.[i];
        for (let k = 0; k < 2; k++) {
          const jitter = on ? 0.25 + ((state.time * 9 + i + k) % 1) * 0.35 : 0.001;
          const at = labWorld([p.x + (k - 0.5) * 0.4, 0.2, p.z]);
          dummy.position.set(at[0], at[1], at[2]);
          dummy.scale.setScalar(jitter);
          dummy.rotation.set(0, 0, 0);
          dummy.updateMatrix();
          spark.setMatrixAt(n++, dummy.matrix);
        }
      });
      spark.instanceMatrix.needsUpdate = true;
      state.aliens?.forEach((a, i) => {
        const bob = a.awake ? 0.05 : 0.02;
        const p = labWorld([a.pos[0], 0.02 + Math.sin(state.time * 3 + i) * bob, a.pos[2]]);
        aliens[i].position.set(p[0], p[1], p[2]);
        const face = a.focus >= 0 ? actors[a.focus] : null;
        if (face) aliens[i].lookAt(face.pos[0], p[1], face.pos[2]);
      });
      terminals.forEach((m, i) => {
        m.visible = !state.got?.[i];
      });
      for (let slot = 0; slot < 2; slot++) {
        const actor = actors[slot];
        const count = actor?.roof ?? 0;
        for (let i = 0; i < 2; i++) {
          const m = roofs[slot * 2 + i];
          m.visible = !!(actor && i < count);
          if (!m.visible) continue;
          const p = roofSeat(actor.pos, actor.yaw || 0, i);
          m.position.set(p[0], p[1], p[2]);
          m.rotation.y = actor.yaw || 0;
        }
      }
      aim(lamps[0], actors[0]);
      aim(lamps[1], actors[1]);
    },
    dispose() {
      group.removeFromParent();
      shellGeo.dispose();
      for (const lamp of lamps) {
        lamp.removeFromParent();
        lamp.target.removeFromParent();
      }
    }
  };
}
