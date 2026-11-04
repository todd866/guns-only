import * as T from '../../vendor/three.module.js';
import {
  mountainHeight,
  MOUNTAIN_BOUNDS,
  ROAD,
  MOUNTAIN,
  LAKE,
  damTris,
  damSpan,
  townTris,
  valleyPoint,
  TOWN,
  DAM_PARAPET,
  STREAM,
  SPRING
} from './spirit-mountain.mjs';
import {SIZE} from './stream.mjs';
import {createWaterSurface} from './water-surface.js';
import {WATER} from '../physics/water.mjs';

// Spirit Mountain, drawn (physics and the near ground: spirit-mountain.mjs via the tiles).
// - A far view: the mountain at 16 m, unfogged and hazed like the USGS horizon ranges, so it stands
//   over the base from kilometres away. One chunk per streamed tile, sunk 1.5 m and hidden while
//   that tile's detailed ground is loaded, so the two never fight.
// - The road: a smooth ribbon just above the carved shelf, with a dashed centre line, so its edges
//   are clean instead of following the 4 m ground triangles.
/** The whole map's ground, far off: one 64 m mesh of the playable terrain (no mountain, which has
 *  its own far view), unfogged and hazed like the horizon ranges, sunk 3 m so the detailed tiles
 *  always cover it up close. It is what you see below you from the summit. */
export function createFarGround(scene, elevation, bounds) {
  const STEP = 64,
    nx = Math.ceil((bounds[2] - bounds[0]) / STEP) + 1,
    nz = Math.ceil((bounds[3] - bounds[1]) / STEP) + 1;
  const pos = new Float32Array(nx * nz * 3),
    col = new Float32Array(nx * nz * 3),
    idx = [],
    c = new T.Color(),
    sand = new T.Color('#c4ab84'),
    haze = new T.Color('#9fb7c6');
  for (let j = 0; j < nz; j++)
    for (let i = 0; i < nx; i++) {
      const x = bounds[0] + i * STEP,
        z = bounds[1] + j * STEP,
        k = j * nx + i,
        y = elevation(x, z) - mountainHeight(x, z);
      pos.set([x, y - 3, z], k * 3);
      c.copy(sand)
        .multiplyScalar(0.9 + 0.1 * Math.sin(x / 310) * Math.sin(z / 270))
        .lerp(haze, 0.25);
      col.set([c.r, c.g, c.b], k * 3);
    }
  for (let j = 0; j < nz - 1; j++)
    for (let i = 0; i < nx - 1; i++) {
      const a = j * nx + i;
      idx.push(a, a + nx, a + 1, a + 1, a + nx, a + nx + 1);
    }
  const g = new T.BufferGeometry();
  g.setAttribute('position', new T.BufferAttribute(pos, 3));
  g.setAttribute('color', new T.BufferAttribute(col, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  const mat = new T.MeshLambertMaterial({vertexColors: true, fog: false}),
    mesh = new T.Mesh(g, mat);
  mesh.name = 'FarGround';
  scene.add(mesh);
  return {
    update(day) {
      mat.color.setScalar(0.15 + 0.85 * day);
    },
    dispose() {
      mesh.removeFromParent();
      g.dispose();
      mat.dispose();
    }
  };
}

/** ground(x, z): the full ground height (the playable terrain plus the mountain), which the road
 *  ribbon must follow: near the foot the mountain sits on up to 9 m of the desert's own relief. */
export function createMountainView(scene, ground = mountainHeight) {
  const root = new T.Group();
  root.name = 'SpiritMountain';
  scene.add(root);
  const base = new T.Color('#b69b78'),
    rock = new T.Color('#9a7f62'),
    haze = new T.Color('#8faec4'),
    c = new T.Color();
  const farMat = new T.MeshLambertMaterial({vertexColors: true, fog: false}),
    chunks = new Map(),
    STEP = 16;
  for (let tx = Math.floor(MOUNTAIN_BOUNDS[0] / SIZE); tx <= Math.floor(MOUNTAIN_BOUNDS[2] / SIZE); tx++)
    for (let tz = Math.floor(MOUNTAIN_BOUNDS[1] / SIZE); tz <= Math.floor(MOUNTAIN_BOUNDS[3] / SIZE); tz++) {
      const n = SIZE / STEP + 1,
        pos = new Float32Array(n * n * 3),
        idx = [];
      let any = false;
      for (let j = 0; j < n; j++)
        for (let i = 0; i < n; i++) {
          const x = tx * SIZE + i * STEP,
            z = tz * SIZE + j * STEP,
            y = mountainHeight(x, z);
          if (y > 0.5) any = true;
          pos.set([x, y - 1.5, z], (j * n + i) * 3);
        }
      if (!any) continue;
      for (let j = 0; j < n - 1; j++)
        for (let i = 0; i < n - 1; i++) {
          const a = j * n + i;
          idx.push(a, a + n, a + 1, a + 1, a + n, a + n + 1);
        }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      const nrm = g.attributes.normal,
        col = new Float32Array(n * n * 3);
      for (let k = 0; k < n * n; k++) {
        const up = nrm.getY(k);
        c.copy(up < 0.85 ? rock : base)
          .multiplyScalar(0.72 + 0.28 * Math.max(0, up))
          .lerp(haze, 0.22);
        col.set([c.r, c.g, c.b], k * 3);
      }
      g.setAttribute('color', new T.BufferAttribute(col, 3));
      const m = new T.Mesh(g, farMat);
      m.name = `MountainFar_${tx},${tz}`;
      root.add(m);
      chunks.set(`${tx},${tz}`, m);
    }
  // The road ribbon (and centre dashes), following the generated road.
  const roadMat = new T.MeshStandardMaterial({color: '#3e4448', roughness: 0.9}),
    lineMat = new T.MeshStandardMaterial({color: '#e8d27a', roughness: 0.6});
  const ribbon = (half, y, keep) => {
    const v = [],
      idx = [];
    for (let i = 0; i < ROAD.length; i++) {
      const a = ROAD[Math.max(0, i - 1)],
        b = ROAD[Math.min(ROAD.length - 1, i + 1)],
        len = Math.hypot(b.x - a.x, b.z - a.z) || 1,
        nx = (-(b.z - a.z) / len) * half,
        nz = ((b.x - a.x) / len) * half,
        p = ROAD[i];
      const base = ground(p.x, p.z) - mountainHeight(p.x, p.z) + p.y; // the road's own height plus the desert under it
      v.push(p.x + nx, base + y, p.z + nz, p.x - nx, base + y, p.z - nz);
      if (i && keep(i)) {
        const k = (i - 1) * 2;
        idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(v, 3));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  };
  const road = new T.Mesh(
    ribbon(MOUNTAIN.roadHalf, 0.03, () => true),
    roadMat
  );
  road.receiveShadow = true;
  road.name = 'MountainRoad';
  root.add(road);
  const dashes = new T.Mesh(
    ribbon(0.07, 0.045, i => i % 3 === 0),
    lineMat
  );
  dashes.name = 'MountainRoadLine';
  root.add(dashes);
  // The dam: concrete in Hoover's horizontal lift bands, with water stains down the downstream
  // face; an asphalt crest road with a dashed line between parapets. Drawn on a grid (the
  // collision is a plain box) so the bands and stains have somewhere to live.
  const span = damSpan(),
    damV = [],
    damC = [],
    col = new T.Color(),
    concrete = new T.Color('#e0d3b6'),
    stain = new T.Color('#8f8a7c');
  const y0 = MOUNTAIN.lake.floor - 6,
    y1 = span.crest,
    half = span.thick / 2,
    sq = (P, cs) => {
      const [a, b, c, e] = P;
      damV.push(...a, ...b, ...c, ...a, ...c, ...e);
      for (let i = 0; i < 6; i++) damC.push(...cs[[0, 1, 2, 0, 2, 3][i]]);
    };
  const shade = (ac, y, face) => {
    const band = Math.floor((y - y0) / 4.5) % 2 ? 0.88 : 1.06,
      joint = Math.abs((((ac - span.from) % 16) + 16) % 16) < 1 ? 0.72 : 1,
      streak =
        face > 0
          ? Math.max(0, Math.sin(ac * 0.9) * Math.sin(ac * 0.37 + 1)) * (1 - (y - y0) / (y1 - y0)) * 0.6
          : 0;
    col
      .copy(concrete)
      .lerp(stain, streak)
      .multiplyScalar(band * joint);
    return [col.r, col.g, col.b];
  };
  for (const face of [1, -1])
    for (let y = y0; y < y1; y += 4.5)
      for (let ac = span.from; ac < span.to; ac += 1) {
        const ya = Math.min(y1, y + 4.5),
          ab = Math.min(span.to, ac + 1),
          al = span.along + face * half;
        const P = [
          valleyPoint(al, ac, y),
          valleyPoint(al, ab, y),
          valleyPoint(al, ab, ya),
          valleyPoint(al, ac, ya)
        ];
        sq(face > 0 ? P : [P[1], P[0], P[3], P[2]], [
          shade(ac, y, face),
          shade(ab, y, face),
          shade(ab, ya, face),
          shade(ac, ya, face)
        ]);
      }
  const damGeo = new T.BufferGeometry();
  damGeo.setAttribute('position', new T.Float32BufferAttribute(damV, 3));
  damGeo.setAttribute('color', new T.Float32BufferAttribute(damC, 3));
  damGeo.computeVertexNormals();
  const damMat = new T.MeshStandardMaterial({vertexColors: true, roughness: 0.9, side: T.DoubleSide}),
    dam = new T.Mesh(damGeo, damMat);
  dam.name = 'SpiritDam';
  dam.castShadow = dam.receiveShadow = true;
  root.add(dam);
  // The crest road and its parapets (the parapets collide: damTris).
  const crest = new T.Group();
  crest.name = 'SpiritDamCrest';
  root.add(crest);
  const yaw = Math.atan2(
    ...(() => {
      const a = valleyPoint(0, 0),
        b = valleyPoint(0, 1);
      return [b[0] - a[0], b[2] - a[2]];
    })()
  );
  const along = (w, d, h, al, ac, y, mat) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat),
      p = valleyPoint(al, ac, y);
    m.position.set(...p);
    m.rotation.y = yaw;
    crest.add(m);
    return m;
  };
  const crestMat = new T.MeshStandardMaterial({color: '#41474b', roughness: 0.9}),
    parMat = new T.MeshStandardMaterial({color: '#d6cfbd', roughness: 0.85}),
    mid = (span.from + span.to) / 2,
    len = span.to - span.from;
  along(span.thick - 2 * DAM_PARAPET.w, len, 0.04, span.along, mid, y1 + 0.02, crestMat);
  for (const s of [-1, 1])
    along(
      DAM_PARAPET.w,
      len,
      DAM_PARAPET.h,
      span.along + s * (half - DAM_PARAPET.w / 2),
      mid,
      y1 + DAM_PARAPET.h / 2,
      parMat
    );
  for (let ac = span.from + 4; ac < span.to - 4; ac += 6)
    along(0.14, 2.6, 0.01, span.along, ac, y1 + 0.045, lineMat);
  // The drowned town: weathered adobe, silted and green under the water.
  const townGeo = new T.BufferGeometry(),
    tv = [];
  for (const [a, b, c] of townTris()) tv.push(...a, ...b, ...c);
  townGeo.setAttribute('position', new T.Float32BufferAttribute(tv, 3));
  townGeo.computeVertexNormals();
  const townMat = new T.MeshStandardMaterial({color: '#9c8f74', roughness: 0.95}),
    town = new T.Mesh(townGeo, townMat);
  town.name = 'DrownedTown';
  town.receiveShadow = true;
  root.add(town);
  // Its details: dark empty doors and windows, a coping line round each roof, a cross on the steeple.
  const holeMat = new T.MeshStandardMaterial({color: '#2b2722', roughness: 1}),
    trimMat = new T.MeshStandardMaterial({color: '#7d725e', roughness: 0.95});
  const tyaw = Math.atan2(
      ...(() => {
        const a = valleyPoint(0, 0),
          b = valleyPoint(0, 1);
        return [b[0] - a[0], b[2] - a[2]];
      })()
    ),
    floor = MOUNTAIN.lake.floor;
  const piece = (w, h, d, al, ac, y, mat) => {
    const m = new T.Mesh(new T.BoxGeometry(w, h, d), mat);
    m.position.set(...valleyPoint(al, ac, y));
    m.rotation.y = tyaw;
    town.add(m);
  };
  for (const [a0, a1, c0, c1, h] of TOWN) {
    const steeple = h > 10,
      al = (a0 + a1) / 2,
      ac = (c0 + c1) / 2;
    if (steeple) {
      piece(0.3, 2.4, 0.3, al, ac, floor + h + 1.2, trimMat);
      piece(0.3, 0.3, 1.4, al, ac, floor + h + 1.7, trimMat);
      continue;
    }
    for (const c of [c0, c1]) {
      // the faces toward and away from the main street
      const s = c === c0 ? -1 : 1;
      piece(1.1, 2.1, 0.12, al, c + s * 0.02, floor + 1.05, holeMat); // door
      for (let x = a0 + 2; x < a1 - 1.5; x += 3.2)
        if (Math.abs(x - al) > 1.4)
          piece(0.9, 0.9, 0.12, x, c + s * 0.02, floor + Math.min(h - 0.9, 1.8), holeMat);
    }
    piece(a1 - a0 + 0.3, 0.25, 0.3, al, c0, floor + h, trimMat);
    piece(a1 - a0 + 0.3, 0.25, 0.3, al, c1, floor + h, trimMat); // roof coping
  }
  // The reservoir's surface: the lake's bounding box at its level; the canyon walls hide the rest.
  const corners = [
    [MOUNTAIN.lake.back, -220],
    [MOUNTAIN.lake.back, 220],
    [MOUNTAIN.lake.dam, -220],
    [MOUNTAIN.lake.dam, 220]
  ].map(([a, c]) => valleyPoint(a, c));
  const xs = corners.map(p => p[0]),
    zs = corners.map(p => p[2]),
    w = Math.max(...xs) - Math.min(...xs),
    d = Math.max(...zs) - Math.min(...zs);
  const lake = createWaterSurface({
    size: [w, d],
    segments: [Math.round(w / 3), Math.round(d / 3)],
    position: [(Math.max(...xs) + Math.min(...xs)) / 2, LAKE.level, (Math.max(...zs) + Math.min(...zs)) / 2],
    swell: LAKE.swell,
    shallow: '#2a8fa0',
    deep: '#0b3f5c'
  });
  lake.mesh.name = 'SpiritReservoir';
  root.add(lake.mesh);
  // The spring and waterfall: white water streaming down a ribbon (a scrolling streak texture),
  // a rock arch over the cave it rises from, and spray where it hits the reservoir.
  const streaks = (() => {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 256;
    const x = c.getContext('2d');
    x.fillStyle = '#9fd3e6';
    x.fillRect(0, 0, 64, 256);
    for (let i = 0; i < 90; i++) {
      x.fillStyle = `rgba(255,255,255,${0.25 + Math.random() * 0.6})`;
      x.fillRect(Math.random() * 64, Math.random() * 256, 1 + Math.random() * 3, 12 + Math.random() * 40);
    }
    const t = new T.CanvasTexture(c);
    t.wrapS = t.wrapT = T.RepeatWrapping;
    t.colorSpace = T.SRGBColorSpace;
    return t;
  })();
  let springFoot = null;
  const streamMat = new T.MeshStandardMaterial({
    map: streaks,
    transparent: true,
    opacity: 0.88,
    roughness: 0.25,
    side: T.DoubleSide,
    depthWrite: false
  });
  {
    const v = [],
      uv = [],
      idx = [];
    let run = 0;
    STREAM.forEach((p, i) => {
      const q = STREAM[Math.min(STREAM.length - 1, i + 1)],
        o = STREAM[Math.max(0, i - 1)],
        da = q.along - o.along,
        dc = q.across - o.across,
        n = Math.hypot(da, dc) || 1;
      const L = valleyPoint(p.along - ((dc / n) * p.width) / 2, p.across + ((da / n) * p.width) / 2, p.y),
        R = valleyPoint(p.along + ((dc / n) * p.width) / 2, p.across - ((da / n) * p.width) / 2, p.y);
      if (i) {
        const prev = STREAM[i - 1];
        run += Math.hypot(p.along - prev.along, p.y - prev.y);
      }
      v.push(...L, ...R);
      uv.push(0, run / 8, 1, run / 8);
      if (i) {
        const k = (i - 1) * 2;
        idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2);
      }
    });
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(v, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    const m = new T.Mesh(g, streamMat);
    m.name = 'SpringStream';
    root.add(m);
    springFoot = {pos: g.attributes.position, first: (STREAM.length - 1) * 2};
  }
  const rockMat = new T.MeshStandardMaterial({color: '#7d6650', roughness: 0.95}),
    darkMat = new T.MeshBasicMaterial({color: '#0d0a08'});
  {
    const head = STREAM[0],
      at = valleyPoint(head.along - 3, head.across, head.y - 0.3),
      back = valleyPoint(head.along - 4, head.across, 0),
      front = valleyPoint(head.along + 4, head.across, 0);
    const cave = new T.Group();
    cave.name = 'SpringCave';
    cave.position.set(...at);
    cave.rotation.y = Math.atan2(front[0] - back[0], front[2] - back[2]);
    root.add(cave);
    const arch = new T.Mesh(new T.TorusGeometry(4.2, 1.6, 10, 18, Math.PI), rockMat);
    arch.castShadow = true;
    cave.add(arch);
    const mouth = new T.Mesh(new T.CircleGeometry(3.6, 24, 0, Math.PI), darkMat);
    mouth.position.z = -0.6;
    cave.add(mouth);
    for (const [x, y, s] of [
      [-5.5, 0.5, 2.2],
      [5.6, 0.2, 2.6],
      [-4, 4.8, 1.8],
      [3.5, 5.2, 2]
    ]) {
      const r = new T.Mesh(new T.DodecahedronGeometry(s), rockMat);
      r.position.set(x, y, -1);
      r.castShadow = true;
      cave.add(r);
    }
  }
  const sprayMat = new T.MeshStandardMaterial({
      color: '#ffffff',
      emissive: '#dff4ff',
      emissiveIntensity: 0.45,
      transparent: true,
      opacity: 0.35,
      roughness: 1,
      depthWrite: false
    }),
    spray = [];
  // Each puff gets its own material so it fades on its own.
  {
    const foot = STREAM.at(-1);
    for (let i = 0; i < 14; i++) {
      const m = new T.Mesh(new T.SphereGeometry(1, 8, 6), sprayMat.clone());
      m.position.set(
        ...valleyPoint(foot.along + (i % 4) - 1, foot.across + (((i * 7) % 9) - 4) * 0.9, foot.y)
      );
      m.userData.phase = i * 0.9;
      root.add(m);
      spray.push(m);
    }
  }
  let streamTime = 0;
  const presentTown = townMat.color.clone(),
    presentHoles = holeMat.color.clone();
  return {
    /** The upside-down has no dam: the water drains and the drowned town stands in the open. */
    setDam(on) {
      LAKE.active = on;
      dam.visible = on;
      lake.mesh.visible = on;
    },
    /** The dark world is the past (dark-world.mjs): the dam isn't built, so the lake is gone, the
     *  town on its floor is dry fresh adobe with lit windows, and the waterfall falls to the valley
     *  floor instead of the lake. */
    setPast(on) {
      this.setDam(!on);
      // Long ago the road up the mountain is a dirt wagon track: no tarmac, no painted line.
      roadMat.color.set(on ? '#8f6e47' : '#3e4448');
      dashes.visible = !on;
      townMat.color.set(on ? '#d8b98c' : presentTown);
      holeMat.color.set(on ? '#6b4a2e' : presentHoles);
      spray.forEach(m => {
        m.visible = !on;
      });
      if (springFoot) {
        const {pos, first} = springFoot,
          foot = STREAM.at(-1),
          p = valleyPoint(foot.along, foot.across),
          y = on ? ground(p[0], p[2]) + 0.1 : foot.y;
        for (const k of [first, first + 1]) pos.setY(k, y);
        pos.needsUpdate = true;
      }
    },
    /** The streamed tile at key now has (or no longer has) detailed ground. */
    tileLoaded(key, on) {
      const m = chunks.get(key);
      if (m) m.visible = !on;
    },
    update(day) {
      farMat.color.setScalar(0.15 + 0.85 * day);
      lake.update(WATER.time);
      streamTime += 1 / 60;
      streaks.offset.y = -streamTime * 1.6;
      for (const m of spray) {
        const t = (streamTime * 0.8 + m.userData.phase) % 1;
        m.scale.setScalar(0.4 + t * 1.4);
        m.position.y = LAKE.level + t * 2.2;
        m.material.opacity = 0.35 * (1 - t);
      }
    },
    dispose() {
      root.removeFromParent();
      root.traverse(o => o.geometry?.dispose());
      [
        farMat,
        roadMat,
        lineMat,
        damMat,
        townMat,
        crestMat,
        parMat,
        holeMat,
        trimMat,
        streamMat,
        rockMat,
        darkMat,
        sprayMat
      ].forEach(m => m.dispose());
      lake.dispose();
      spray.forEach(m => m.material.dispose());
      streaks.dispose();
    }
  };
}
