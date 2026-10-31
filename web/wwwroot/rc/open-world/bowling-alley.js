import * as T from '../../vendor/three.module.js';
import {scoreFrames, frameMarks} from './bowling.mjs';
import {ALLEY_FLOOR_Y, BOWLING_ALLEY, COLLISION_WALLS, DOORS, LANES} from './bowling-alley.mjs';

const WALL_HEIGHT = BOWLING_ALLEY.height - 0.1,
  WALL_THICKNESS = 0.16;

export function buildBowlingAlley(scene, world) {
  const root = new T.Group();
  root.name = 'StrikeBowlingAlley';
  scene.add(root);
  const meshes = [],
    materials = [],
    screens = [],
    screenTextures = new Map(),
    bumpers = [],
    roof = new T.Group();
  root.add(roof);
  const mat = (color, options = {}) => {
    const m = new T.MeshStandardMaterial({color, roughness: 0.72, ...options});
    materials.push(m);
    return m;
  };
  const floorMat = mat('#bc7446', {roughness: 0.2}),
    laneMat = mat('#d7a265', {roughness: 0.12}),
    gutterMat = mat('#202937', {roughness: 0.3, metalness: 0.2}),
    wallMat = mat('#26334b', {roughness: 0.78, emissive: '#44301e', emissiveIntensity: 0.22}),
    trimMat = mat('#f0b548', {roughness: 0.42, metalness: 0.35}),
    warmMat = mat('#ffe1a0', {color: '#fff1c2', emissive: '#ffb74d', emissiveIntensity: 1.8}),
    neonMat = mat('#ff4ea3', {emissive: '#ff1688', emissiveIntensity: 2.5}),
    screenMat = mat('#63e6df', {emissive: '#36cfc9', emissiveIntensity: 1.8});
  const mesh = (geometry, material, name, position = [0, 0, 0], parent = root) => {
    const m = new T.Mesh(geometry, material);
    m.name = name;
    m.position.set(...position);
    parent.add(m);
    meshes.push(m);
    return m;
  };
  const box = (x, y, z, w, h, d, material, name, solid = false, surface = 'concrete', parent = root) => {
    const m = mesh(new T.BoxGeometry(w, h, d), material, name, [x, y + h / 2, z], parent);
    if (solid && world?.addQuad) {
      const x0 = x - w / 2,
        x1 = x + w / 2,
        z0 = z - d / 2,
        z1 = z + d / 2,
        y0 = y,
        y1 = y + h,
        p = (a, b, c) => [a, b, c];
      world.addQuad(p(x0, y1, z0), p(x0, y1, z1), p(x1, y1, z1), p(x1, y1, z0), surface);
      world.addQuad(p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1), surface);
      world.addQuad(p(x1, y0, z0), p(x0, y0, z0), p(x0, y1, z0), p(x1, y1, z0), surface);
      world.addQuad(p(x1, y0, z1), p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), surface);
      world.addQuad(p(x0, y0, z0), p(x0, y0, z1), p(x0, y1, z1), p(x0, y1, z0), surface);
    }
    return m;
  };
  const textTexture = (key, text, color = '#ffffff', background = '#10243b') => {
    const cached = screenTextures.get(key);
    if (cached?.text === text) return cached.texture;
    if (typeof document === 'undefined') {
      const texture = new T.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1);
      texture.needsUpdate = true;
      if (cached) return cached.texture;
      screenTextures.set(key, {text, texture});
      return texture;
    }
    const canvas = cached?.canvas ?? document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = color;
    ctx.font = 'bold 38px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, canvas.width / 2, canvas.height / 2, canvas.width - 20);
    const texture = cached?.texture ?? new T.CanvasTexture(canvas);
    texture.needsUpdate = true;
    texture.colorSpace = T.SRGBColorSpace;
    screenTextures.set(key, {text, texture, canvas});
    return texture;
  };
  const sign = (text, x, y, z, w, h, material, name, parent = root) => {
    const m = new T.Mesh(new T.PlaneGeometry(w, h), material.clone());
    m.name = name;
    m.material.map = textTexture(name, text, '#fff4cb', '#34152c');
    m.material.emissiveMap = m.material.map;
    m.material.needsUpdate = true;
    m.position.set(x, y, z);
    parent.add(m);
    meshes.push(m);
    materials.push(m.material);
    return m;
  };
  const {minX, maxX, minZ, maxZ} = BOWLING_ALLEY.bounds;
  box(
    (minX + maxX) / 2,
    0,
    (minZ + maxZ) / 2,
    maxX - minX,
    ALLEY_FLOOR_Y,
    maxZ - minZ,
    floorMat,
    'AlleyFloor'
  );
  world?.addQuad?.(
    [minX, ALLEY_FLOOR_Y, minZ],
    [minX, ALLEY_FLOOR_Y, maxZ],
    [maxX, ALLEY_FLOOR_Y, maxZ],
    [maxX, ALLEY_FLOOR_Y, minZ],
    'gymfloor'
  );
  for (const lane of LANES) {
    const length = lane.startZ - lane.endZ;
    box(
      lane.x,
      ALLEY_FLOOR_Y,
      (lane.startZ + lane.endZ) / 2,
      lane.width,
      0.012,
      length,
      laneMat,
      `Lane${lane.id}`
    );
    world?.addQuad?.(
      [lane.x - lane.width / 2, ALLEY_FLOOR_Y + 0.012, lane.endZ],
      [lane.x - lane.width / 2, ALLEY_FLOOR_Y + 0.012, lane.startZ],
      [lane.x + lane.width / 2, ALLEY_FLOOR_Y + 0.012, lane.startZ],
      [lane.x + lane.width / 2, ALLEY_FLOOR_Y + 0.012, lane.endZ],
      'gymfloor'
    );
    for (const edge of [-1, 1]) {
      box(
        lane.x + edge * 0.6,
        ALLEY_FLOOR_Y + 0.012,
        (lane.startZ + lane.endZ) / 2,
        0.11,
        0.012,
        length + 0.18,
        gutterMat,
        `Gutter${lane.id}-${edge}`
      );
      box(
        lane.x + edge * 0.32,
        ALLEY_FLOOR_Y + 0.018,
        lane.startZ - 2,
        0.025,
        0.008,
        0.12,
        trimMat,
        `LaneArrow${lane.id}-${edge}`
      );
    }
    for (const z of [1249, 1244, 1239])
      box(
        lane.x,
        ALLEY_FLOOR_Y + 0.018,
        z,
        lane.width * 0.92,
        0.006,
        0.012,
        trimMat,
        `LaneMark${lane.id}-${z}`
      );
    box(lane.x, 0.4, 1233.6, lane.width + 0.2, 0.7, 0.22, wallMat, `Pinsetter${lane.id}`);
    const screen = sign(
      `Lane ${lane.id}`,
      lane.x,
      2.8,
      1253.5,
      0.98,
      0.42,
      screenMat,
      `ScoreScreen${lane.id}`
    );
    screen.userData.score = 0;
    screens.push(screen);
    const bumperGroup = new T.Group();
    bumperGroup.name = `Bumpers${lane.id}`;
    root.add(bumperGroup);
    for (const edge of [-1, 1]) {
      const bumper = mesh(
        new T.CylinderGeometry(0.055, 0.055, length, 10),
        trimMat,
        `Bumper${lane.id}-${edge}`,
        [lane.x + edge * 0.59, ALLEY_FLOOR_Y + 0.08, (lane.startZ + lane.endZ) / 2],
        bumperGroup
      );
      bumper.rotation.x = Math.PI / 2;
      bumper.userData.edge = edge;
      bumpers.push(bumper);
    }
  }
  for (let i = 0; i < LANES.length - 1; i++) {
    const x = (LANES[i].x + LANES[i + 1].x) / 2,
      hump = mesh(new T.SphereGeometry(0.22, 12, 8), gutterMat, `BallReturn${i + 1}`, [
        x,
        ALLEY_FLOOR_Y + 0.09,
        1255.1
      ]);
    hump.scale.set(1.35, 0.42, 1.8);
    // Low faceted ramps let tyres climb the rounded returns from either direction.
    const halfX = 0.29,
      halfZ = 0.4,
      top = ALLEY_FLOOR_Y + 0.17;
    const a = [x - halfX, ALLEY_FLOOR_Y, 1255.1 - halfZ],
      b = [x + halfX, ALLEY_FLOOR_Y, 1255.1 - halfZ],
      c = [x + halfX, ALLEY_FLOOR_Y, 1255.1 + halfZ],
      d = [x - halfX, ALLEY_FLOOR_Y, 1255.1 + halfZ],
      p = [x, top, 1255.1];
    for (const [u, v] of [
      [b, a],
      [c, b],
      [d, c],
      [a, d]
    ])
      world.addTri(u, v, p, 'metal');
  }
  for (const wall of COLLISION_WALLS) {
    const [ax, az] = wall.a,
      [bx, bz] = wall.b;
    box(
      (ax + bx) / 2,
      ALLEY_FLOOR_Y,
      (az + bz) / 2,
      Math.abs(bx - ax) + (bz !== az ? WALL_THICKNESS : 0.02),
      WALL_HEIGHT,
      Math.abs(bz - az) + (bx !== ax ? WALL_THICKNESS : 0.02),
      wallMat,
      `Wall-${wall.id}`,
      true
    );
  }
  for (const door of DOORS) {
    box(
      door.center[0],
      2.8,
      door.center[1],
      door.axis === 'x' ? door.width : WALL_THICKNESS,
      WALL_HEIGHT - 2.8 + ALLEY_FLOOR_Y,
      door.axis === 'z' ? door.width : WALL_THICKNESS,
      wallMat,
      `DoorLintel-${door.id}`,
      true
    );
  }
  box(
    (minX + maxX) / 2,
    BOWLING_ALLEY.height - 0.08,
    (minZ + maxZ) / 2,
    maxX - minX,
    0.16,
    maxZ - minZ,
    wallMat,
    'Roof',
    false,
    'concrete',
    roof
  );
  for (let x = minX + 1; x < maxX; x += 2.2)
    box(x, BOWLING_ALLEY.height - 0.3, 1249, 0.08, 0.04, 22, warmMat, `CeilingStrip${x}`);
  box(-1022.9, 0.12, 1248, 1.0, 0.8, 0.5, trimMat, 'SnackCounter', true);
  sign('SNACKS', -1022.9, 1.05, 1247.72, 0.9, 0.28, screenMat, 'SnackLabel');
  box(-1010.6, 0.12, 1251.8, 0.9, 0.8, 0.5, trimMat, 'ShoeCounter', true);
  sign('SHOES', -1010.6, 1.05, 1251.52, 0.8, 0.28, screenMat, 'ShoeLabel');
  sign('STRIKE', -1020, 3.35, 1265.1, 3.8, 0.52, neonMat, 'STRIKE-Neon');
  root.userData.doors = DOORS;
  root.userData.roof = roof;
  return {
    root,
    update(game = null, playerPos = null) {
      game = game ?? {};
      const total = game.score ?? 0,
        frames = game.frames ?? [],
        totals = scoreFrames(frames),
        frameIndex = Math.min(9, game.frame ?? 0),
        activeLane = game.lane;
      bumpers.forEach(b => (b.position.y = game.bumpers ? ALLEY_FLOOR_Y + 0.08 : ALLEY_FLOOR_Y - 0.06));
      screens.forEach((screen, i) => {
        const active = i + 1 === activeLane,
          marks = frameMarks(frames[frameIndex] ?? [], frameIndex) || '· ·',
          text = active
            ? `F${frameIndex + 1} ${marks} =${totals[frameIndex] ?? '·'}  Σ${total}`
            : `Lane ${i + 1}`;
        if (screen.userData.text !== text) {
          screen.material.map = textTexture(screen.name, text, '#fff4cb', '#10243b');
          screen.material.emissiveMap = screen.material.map;
          screen.userData.text = text;
        }
        screen.userData.score = active ? total : 0;
      });
      if (Array.isArray(playerPos)) {
        const inside =
          playerPos[0] > minX - 2 &&
          playerPos[0] < maxX + 2 &&
          playerPos[2] > minZ - 2 &&
          playerPos[2] < maxZ + 2;
        roof.visible = !inside;
      }
    },
    dispose() {
      for (const m of meshes) {
        m.removeFromParent();
        m.geometry.dispose();
      }
      for (const {texture} of screenTextures.values()) texture.dispose();
      for (const m of materials) m.dispose();
      root.removeFromParent();
    }
  };
}
