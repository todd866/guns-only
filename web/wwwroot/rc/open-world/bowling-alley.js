import * as T from '../../vendor/three.module.js';
import {createSurfaceMaps} from './materials.js';
import {scoreFrames, frameMarks} from './bowling.mjs';
import {
  ALLEY_FLOOR_Y,
  BOWLING_ALLEY,
  COLLISION_WALLS,
  DOORS,
  LANES,
  insideAlley,
  PINSETTER_Z,
  BALL_RETURN_Z,
  SNACK_COUNTER
} from './bowling-alley.mjs';

const WALL_HEIGHT = BOWLING_ALLEY.height;

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
    wallMat = mat('#efe0be', {roughness: 0.78, emissive: '#d5ab75', emissiveIntensity: 0.55}),
    trimMat = mat('#f0b548', {roughness: 0.42, metalness: 0.35}),
    warmMat = mat('#ffe1a0', {color: '#fff1c2', emissive: '#ffb74d', emissiveIntensity: 1.8}),
    neonMat = mat('#ff4ea3', {emissive: '#ff1688', emissiveIntensity: 2.5}),
    screenMat = mat('#63e6df', {emissive: '#36cfc9', emissiveIntensity: 1.8});
  // Same stucco/roof maps and tint as the tile shell, with a warm painted inner
  // face like the high school. The tile's generic copy is excluded at this site.
  const surfaceMaps = ['stucco', 'roof'].map(createSurfaceMaps),
    mappedMaterial = maps =>
      mat('#ffffff', {
        map: maps.map,
        roughnessMap: maps.roughnessMap,
        normalMap: maps.normalMap,
        normalScale: new T.Vector2(0.18, 0.18),
        roughness: 1
      }),
    outerWallMat = mappedMaterial(surfaceMaps[0]),
    roofMat = mappedMaterial(surfaceMaps[1]);
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
  const {maxZ} = BOWLING_ALLEY.bounds,
    outline = BOWLING_ALLEY.outline,
    front = DOORS[0],
    side = DOORS[1],
    firstLane = LANES[0],
    returnZ = BALL_RETURN_Z;
  const face = (a, b, c, d, material, name, parent = root) => {
    const g = new T.BufferGeometry(),
      points = [a, b, c, a, c, d];
    g.setAttribute('position', new T.Float32BufferAttribute(points.flat(), 3));
    const alongX = Math.abs(b[0] - a[0]) >= Math.abs(b[2] - a[2]);
    g.setAttribute(
      'uv',
      new T.Float32BufferAttribute(
        points.flatMap(p => [(alongX ? p[0] : p[2]) * 0.24, p[1] * 0.16]),
        2
      )
    );
    g.computeVertexNormals();
    const m = mesh(g, material, name, [0, 0, 0], parent);
    m.receiveShadow = true;
    return m;
  };
  const footprint = (y, material, name, parent = root, solid = false, down = false) => {
    const faces = T.ShapeUtils.triangulateShape(
        outline.map(p => new T.Vector2(...p)),
        []
      ),
      vertices = [];
    for (const f of faces) {
      let pts = f.map(i => outline[i]);
      const cross =
        (pts[1][0] - pts[0][0]) * (pts[2][1] - pts[0][1]) - (pts[1][1] - pts[0][1]) * (pts[2][0] - pts[0][0]);
      if (cross > 0 !== down) pts.reverse();
      const tri = pts.map(p => [p[0], y, p[1]]);
      vertices.push(...tri.flat());
      if (solid) world?.addTri?.(...tri, 'gymfloor');
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(vertices, 3));
    g.setAttribute(
      'uv',
      new T.Float32BufferAttribute(
        vertices.flatMap((v, i) => (i % 3 === 1 ? [] : [v * 0.16])),
        2
      )
    );
    g.computeVertexNormals();
    const m = mesh(g, material, name, [0, 0, 0], parent);
    m.receiveShadow = true;
    return m;
  };
  footprint(ALLEY_FLOOR_Y, floorMat, 'AlleyFloor', root, true);
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
    for (const z of [lane.startZ - 5, lane.startZ - 10, lane.startZ - 15])
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
    // RC-height openings beneath the outer panels lead into the corridor.
    box(lane.x, 0.75, PINSETTER_Z, 1.55, 1.7, 0.22, wallMat, `Pinsetter${lane.id}`, true);
    const screen = sign(
      `Lane ${lane.id}`,
      lane.x,
      2.8,
      lane.startZ - 0.5,
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
  const laneMidX = (firstLane.x + LANES.at(-1).x) / 2;
  box(laneMidX, ALLEY_FLOOR_Y, PINSETTER_Z, 6.2, 0.71, 0.22, wallMat, 'PinsetterWall', true);
  box(laneMidX, ALLEY_FLOOR_Y, PINSETTER_Z - 5.5, 11.75, 2.4, 0.22, wallMat, 'MaintenanceWall', true);
  box(laneMidX, 2.5, PINSETTER_Z - 3.5, 7.75, 0.04, 0.08, warmMat, 'MaintenanceLight');
  for (let i = 0; i < LANES.length - 1; i++) {
    const x = (LANES[i].x + LANES[i + 1].x) / 2,
      hump = mesh(new T.SphereGeometry(0.22, 12, 8), gutterMat, `BallReturn${i + 1}`, [
        x,
        ALLEY_FLOOR_Y + 0.09,
        returnZ
      ]);
    hump.scale.set(1.35, 0.42, 1.8);
    // Low faceted ramps let tyres climb the rounded returns from either direction.
    const halfX = 0.29,
      halfZ = 0.4,
      top = ALLEY_FLOOR_Y + 0.17;
    const a = [x - halfX, ALLEY_FLOOR_Y, returnZ - halfZ],
      b = [x + halfX, ALLEY_FLOOR_Y, returnZ - halfZ],
      c = [x + halfX, ALLEY_FLOOR_Y, returnZ + halfZ],
      d = [x - halfX, ALLEY_FLOOR_Y, returnZ + halfZ],
      p = [x, top, returnZ];
    for (const [u, v] of [
      [b, a],
      [c, b],
      [d, c],
      [a, d]
    ])
      world.addTri(u, v, p, 'metal');
  }
  // These faces follow the original clockwise ring, including every small jog.
  // Door lintels share the same opening geometry as the collision perimeter.
  const wall = (a, b, bottom, name) => {
    const top = WALL_HEIGHT,
      q = [
        [a[0], bottom, a[1]],
        [b[0], bottom, b[1]],
        [b[0], top, b[1]],
        [a[0], top, a[1]]
      ],
      len = Math.hypot(b[0] - a[0], b[1] - a[1]),
      nx = ((b[1] - a[1]) / len) * 0.07,
      nz = (-(b[0] - a[0]) / len) * 0.07;
    const outside = face(...q, outerWallMat, `Wall-${name}`);
    outside.castShadow = true;
    const inner = q.map(p => [p[0] + nx, p[1], p[2] + nz]);
    face(inner[1], inner[0], inner[3], inner[2], wallMat, `InsideWall-${name}`);
    world?.addQuad?.(...q, 'concrete');
    world?.addQuad?.(q[1], q[0], q[3], q[2], 'concrete');
  };
  for (const part of COLLISION_WALLS) wall(part.a, part.b, 0, part.id);
  for (const door of DOORS) {
    const a = outline[door.edge],
      b = outline[(door.edge + 1) % outline.length],
      len = Math.hypot(b[0] - a[0], b[1] - a[1]),
      P = sign => [
        door.center[0] + (((sign * (b[0] - a[0])) / len) * door.width) / 2,
        door.center[1] + (((sign * (b[1] - a[1])) / len) * door.width) / 2
      ];
    wall(P(-1), P(1), BOWLING_ALLEY.doorTop, `Lintel-${door.id}`);
  }
  footprint(BOWLING_ALLEY.height, roofMat, 'Roof', roof).castShadow = true;
  footprint(BOWLING_ALLEY.height - 0.04, wallMat, 'Ceiling', roof, false, true);
  for (let x = firstLane.x; x <= LANES.at(-1).x + 0.1; x += 2.2)
    box(
      x,
      BOWLING_ALLEY.height - 0.3,
      (firstLane.startZ + firstLane.endZ) / 2,
      0.08,
      0.04,
      22,
      warmMat,
      `CeilingStrip${x}`
    );
  const snackX = SNACK_COUNTER.x,
    snackZ = SNACK_COUNTER.z,
    shoeX = side.center[0] - 2.5,
    shoeZ = firstLane.startZ - 1;
  box(snackX, 0.12, snackZ, 1.0, 0.8, 0.5, trimMat, 'SnackCounter', true);
  sign('SNACKS', snackX, 1.05, snackZ + 0.27, 0.9, 0.28, screenMat, 'SnackLabel');
  box(shoeX, 0.12, shoeZ, 0.9, 0.8, 0.5, trimMat, 'ShoeCounter', true);
  sign('SHOES', shoeX, 1.05, shoeZ + 0.27, 0.8, 0.28, screenMat, 'ShoeLabel');
  sign('STRIKE', front.center[0], 3.35, front.center[1] + 0.1, 3.8, 0.52, neonMat, 'STRIKE-Neon');
  // Warm emissive jambs and a canopy light keep the entrance legible at night
  // without adding per-frame point lights to the whole outdoor scene.
  for (const edge of [-1, 1])
    box(
      front.center[0] + edge * (front.width / 2 + 0.1),
      0.1,
      maxZ + 0.1,
      0.08,
      2.6,
      0.08,
      warmMat,
      `EntranceLight${edge}`
    );
  box(
    front.center[0],
    BOWLING_ALLEY.doorTop + 0.02,
    maxZ + 0.18,
    front.width + 0.4,
    0.06,
    0.4,
    warmMat,
    'EntranceLightTop'
  );
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
      if (Array.isArray(playerPos)) roof.visible = !insideAlley(playerPos);
    },
    dispose() {
      for (const m of meshes) {
        m.removeFromParent();
        m.geometry.dispose();
      }
      for (const {texture} of screenTextures.values()) texture.dispose();
      for (const m of materials) m.dispose();
      for (const maps of surfaceMaps) maps.dispose();
      root.removeFromParent();
    }
  };
}
