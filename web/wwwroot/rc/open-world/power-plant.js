import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {addBox} from '../physics/world.mjs';

// Toy nuclear power plant landmark for the present-era Saucer Springs open world.
//
// Site selection and clearance check (250 m x 250 m parcel, POWER_PLANT_BOUNDS = [-625, 2025, -375, 2275],
// centre [-500, 0, 2150], south gate [-500, 0, 2248]):
//   - Inside the base boundary at every corner and interior point (checked against open-world/boundary.mjs).
//   - Flat 0 m datum across the entire 250 m x 250 m footprint (checked against assets/world/playable-terrain.json
//     and open-world/elevation.mjs).
//   - Clears every OSM road, runway, taxiway, railway, building, apron, parking lot, and golf_course polygon
//     by > 80 m (checked against assets/world/tile--3-6.json .. tile--1-9.json and overview.json), and clears
//     every fence segment by > 290 m (checked against open-world/fences-data.mjs and open-world/fences.mjs).
//   - Clears all authored districts and landmark footprints (checked against open-world/district-zones.mjs,
//     residential-frame.mjs, bowling-alley.mjs, country-club.mjs, meadow.mjs, petting-zoo.mjs, museum.js,
//     playground.mjs, town-plaza.mjs, skatestreet.mjs, skate-hangar.mjs, boardwalk.mjs, under-bridge.mjs,
//     schoolyard.mjs, marseille-site.mjs, expansion-venues.mjs, classic-courses.mjs, battle-arenas.mjs,
//     spirit-mountain.mjs, canyon.mjs, mine.mjs, sewer.mjs, booster.mjs, hot-wheels.mjs, stunt-jumps.mjs,
//     sky-dive.mjs, and catalog.mjs LOCATIONS/EVENTS; Grand Tour passes 126 m northwest).
//
// Draw-call budget: 9 draw calls for the entire site (under the ~12 budget):
//   1. PowerPlant_ground   (merged compound pad, asphalt loop road, road stripes, gravel switchyard)
//   2. PowerPlant_towers   (merged twin hyperbolic LatheGeometry cooling towers, lip rings, struts, basins)
//   3. PowerPlant_concrete (merged reactor containment dome, control building, plinths, pond kerbs, gatehouse)
//   4. PowerPlant_metal    (merged turbine hall, steam pipes, water conduits, transformers, pylons, fence)
//   5. PowerPlant_glass    (merged control room, turbine clerestory, pump house, and gatehouse glazing)
//   6. PowerPlant_cables   (merged catenary overhead transmission lines and switchyard busbars)
//   7. PowerPlant_water    (merged water intake pond and cooling-tower basin water, UV-scrolled)
//   8. PowerPlant_sign     (gate welcome sign mesh)
//   9. PowerPlant_steam    (one InstancedMesh of 36 rising, widening, fading steam puffs for both towers)

export const DRAW_CALL_BUDGET = 10;

export const POWER_PLANT = Object.freeze({
  center: Object.freeze([-500, 0, 2150]),
  half: 125,
  gate: Object.freeze([-500, 0, 2248]),
  westGate: Object.freeze([-596, 0, 2150]),
  signText: 'POWER PLANT',
  tower: Object.freeze({
    baseRadius: 21,
    throatRadius: 12.2,
    topRadius: 14.2,
    throatY: 39,
    height: 56,
    deckY: 3.2
  }),
  towers: Object.freeze([
    Object.freeze([-544, 2108]),
    Object.freeze([-456, 2108])
  ]),
  dome: Object.freeze({
    at: Object.freeze([-534, 2168]),
    radius: 15.5,
    cylinderHeight: 18,
    totalHeight: 33.5
  }),
  controlBuilding: Object.freeze({
    at: Object.freeze([-509, 2168]),
    size: Object.freeze([18, 9.5, 14])
  }),
  turbineHall: Object.freeze({
    at: Object.freeze([-472, 2168]),
    size: Object.freeze([42, 13.5, 22])
  }),
  pond: Object.freeze({
    at: Object.freeze([-548, 2212]),
    size: Object.freeze([36, 24])
  }),
  pumpHouse: Object.freeze({
    at: Object.freeze([-548, 2195]),
    size: Object.freeze([10, 5.2, 6.5])
  }),
  pylons: Object.freeze([
    Object.freeze({at: Object.freeze([-426, 2168]), yaw: -0.48}),
    Object.freeze({at: Object.freeze([-404, 2130]), yaw: -0.48}),
    Object.freeze({at: Object.freeze([-388, 2090]), yaw: -0.48})
  ]),
  fence: Object.freeze({
    box: Object.freeze([-596, 2054, -404, 2248]),
    southGap: Object.freeze([-509, -491]),
    westGap: Object.freeze([2141, 2159]),
    height: 2.2
  }),
  steamCount: 36,
  cullDistance: 1600
});

export const POWER_PLANT_BOUNDS = Object.freeze([
  POWER_PLANT.center[0] - POWER_PLANT.half,
  POWER_PLANT.center[2] - POWER_PLANT.half,
  POWER_PLANT.center[0] + POWER_PLANT.half,
  POWER_PLANT.center[2] + POWER_PLANT.half
]);

/**
 * True two-branch hyperboloid radius r(y) for the cooling towers.
 * Widest at the base (y = 0), narrows smoothly to throatRadius at y = throatY,
 * and flares out to topRadius at y = height with C1 continuity at the throat.
 */
export function towerRadiusAt(y, spec = POWER_PLANT.tower) {
  const {baseRadius, throatRadius, topRadius, throatY, height} = spec;
  const clamped = Math.max(0, Math.min(height, y));
  if (clamped <= throatY) {
    const k = Math.sqrt(Math.max(1e-6, (baseRadius / throatRadius) ** 2 - 1));
    const b = throatY / k;
    return throatRadius * Math.sqrt(1 + ((clamped - throatY) / b) ** 2);
  }
  const k = Math.sqrt(Math.max(1e-6, (topRadius / throatRadius) ** 2 - 1));
  const b = (height - throatY) / k;
  return throatRadius * Math.sqrt(1 + ((clamped - throatY) / b) ** 2);
}

function makeCanvas(w, h) {
  if (typeof document !== 'undefined' && document.createElement) {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }
  return {
    width: w,
    height: h,
    getContext: () =>
      new Proxy(
        {},
        {
          get: (_, prop) =>
            prop === 'createRadialGradient' || prop === 'createLinearGradient'
              ? () => ({addColorStop: () => {}})
              : prop === 'measureText'
                ? () => ({width: 0})
                : () => {},
          set: () => true
        }
      )
  };
}

function prefersReducedMotion(options) {
  if (typeof options?.reducedMotion === 'boolean') return options.reducedMotion;
  try {
    return !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  } catch {
    return false;
  }
}

export function buildPowerPlant(scene, world, options = {}) {
  const heightAt = options.heightAt ?? options.terrain?.heightAt ?? (() => 0);
  const [cx, , cz] = POWER_PLANT.center;
  const Y = (x, z) => heightAt(x, z);
  const baseY = Y(cx, cz);

  const root = new T.Group();
  root.name = 'PowerPlant';
  const keep = [],
    K = x => (keep.push(x), x),
    buckets = new Map();

  const tex = (w, h, draw, repeat = null) => {
    const c = makeCanvas(w, h);
    draw(c.getContext('2d'), w, h);
    const t = K(new T.CanvasTexture(c));
    t.colorSpace = T.SRGBColorSpace;
    t.anisotropy = 4;
    if (repeat) {
      t.wrapS = t.wrapT = T.RepeatWrapping;
      t.repeat.set(...repeat);
    }
    return t;
  };

  // Procedural vertical-staining & formwork seam texture for the hyperbolic cooling towers.
  const towerTex = tex(
    256,
    256,
    (g, w, h) => {
      g.fillStyle = '#f2ede2';
      g.fillRect(0, 0, w, h);
      // Horizontal lift rings from concrete pours.
      for (let y = 0; y < h; y += 16) {
        g.fillStyle = y % 32 === 0 ? 'rgba(180,170,152,0.18)' : 'rgba(255,255,255,0.12)';
        g.fillRect(0, y, w, 2);
      }
      // Subtle vertical weathering streaks and formwork ribs.
      for (let i = 0; i < 32; i++) {
        const x = i * 8;
        const shade = 0.06 + ((i * 19) % 7) * 0.018;
        g.fillStyle = `rgba(145,138,124,${shade.toFixed(3)})`;
        g.fillRect(x, 0, 3, h);
        g.fillStyle = 'rgba(255,252,245,0.16)';
        g.fillRect(x + 3, 0, 1, h);
      }
      // Soft dampness gradient near the bottom mist zone and under the top rim.
      const bot = g.createLinearGradient(0, h * 0.65, 0, h);
      bot.addColorStop(0, 'rgba(150,142,126,0)');
      bot.addColorStop(1, 'rgba(150,142,126,0.22)');
      g.fillStyle = bot;
      g.fillRect(0, h * 0.65, w, h * 0.35);
    },
    [6, 1]
  );

  // Procedural water ripple map for the intake pond and tower basins.
  const waterTex = tex(
    128,
    128,
    (g, w, h) => {
      g.fillStyle = '#4ec4dc';
      g.fillRect(0, 0, w, h);
      g.strokeStyle = 'rgba(255,255,255,0.36)';
      g.lineWidth = 2;
      for (let i = 0; i < 14; i++) {
        g.beginPath();
        const y = (i * 37) % h;
        g.moveTo(0, y);
        for (let k = 0; k <= 8; k++) g.lineTo(k * 16, y + Math.sin(k + i) * 3);
        g.stroke();
      }
    },
    [5, 4]
  );

  // Friendly gate sign texture (short words a six-year-old can read, no "Enter", no warning symbols).
  const signTex = tex(512, 160, (g, w, h) => {
    g.fillStyle = '#1d4e6b';
    g.fillRect(0, 0, w, h);
    g.strokeStyle = '#ffd24c';
    g.lineWidth = 10;
    g.strokeRect(8, 8, w - 16, h - 16);
    g.fillStyle = '#5ec4e8';
    g.fillRect(18, 18, w - 36, 14);
    g.fillStyle = '#ffffff';
    g.font = '900 64px system-ui';
    g.textAlign = 'center';
    g.fillText(POWER_PLANT.signText, w / 2, 112);
  });

  const mats = {
    ground: K(
      new T.MeshStandardMaterial({
        color: '#ffffff',
        vertexColors: true,
        roughness: 0.9,
        polygonOffset: true,
        polygonOffsetFactor: -2
      })
    ),
    towers: K(
      new T.MeshStandardMaterial({
        color: '#ffffff',
        map: towerTex,
        vertexColors: true,
        roughness: 0.78,
        metalness: 0.04,
        side: T.DoubleSide
      })
    ),
    concrete: K(
      new T.MeshStandardMaterial({
        color: '#ffffff',
        vertexColors: true,
        roughness: 0.76,
        metalness: 0.05
      })
    ),
    metal: K(
      new T.MeshStandardMaterial({
        color: '#ffffff',
        vertexColors: true,
        roughness: 0.42,
        metalness: 0.45
      })
    ),
    glass: K(
      new T.MeshStandardMaterial({
        color: '#ffffff',
        vertexColors: true,
        roughness: 0.16,
        metalness: 0.28,
        emissive: '#2a5568',
        emissiveIntensity: 0.22
      })
    ),
    cables: K(
      new T.MeshStandardMaterial({
        color: '#ffffff',
        vertexColors: true,
        roughness: 0.5,
        metalness: 0.6
      })
    ),
    water: K(
      new T.MeshStandardMaterial({
        color: '#6ce0f5',
        map: waterTex,
        roughness: 0.1,
        metalness: 0.12
      })
    ),
    sign: K(
      new T.MeshStandardMaterial({
        map: signTex,
        roughness: 0.45,
        side: T.DoubleSide
      })
    )
  };

  const scratchColor = new T.Color();
  const add = (bucket, geom, hex = '#ffffff', colorFn = null) => {
    let g = geom;
    if (g.index) {
      const flat = g.toNonIndexed();
      g.dispose();
      g = flat;
    }
    const pos = g.attributes.position;
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv)
      g.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(pos.count * 2), 2));
    const colors = new Float32Array(pos.count * 3);
    scratchColor.set(hex);
    for (let i = 0; i < pos.count; i++) {
      if (colorFn) {
        const [r, gr, b] = colorFn(pos.getX(i), pos.getY(i), pos.getZ(i), i);
        colors[i * 3] = r;
        colors[i * 3 + 1] = gr;
        colors[i * 3 + 2] = b;
      } else {
        colors[i * 3] = scratchColor.r;
        colors[i * 3 + 1] = scratchColor.g;
        colors[i * 3 + 2] = scratchColor.b;
      }
    }
    g.setAttribute('color', new T.Float32BufferAttribute(colors, 3));
    for (const k of Object.keys(g.attributes))
      if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    g.clearGroups();
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push(g);
  };

  const solidUp = (pts, surface = 'concrete') => {
    if (!world?.addTri) return;
    for (let i = 0; i < pts.length; i += 9) {
      const a = [pts[i], pts[i + 1], pts[i + 2]],
        b = [pts[i + 3], pts[i + 4], pts[i + 5]],
        c = [pts[i + 6], pts[i + 7], pts[i + 8]];
      const ny = (b[2] - a[2]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[2] - a[2]);
      if (ny >= 0) world.addTri(a, b, c, surface);
      else world.addTri(a, c, b, surface);
    }
  };

  const addCylinderCollider = (x, z, radius, y0, y1, sides = 16, surface = 'concrete') => {
    if (!world?.addQuad) return;
    for (let i = 0; i < sides; i++) {
      const a0 = (-2 * Math.PI * i) / sides,
        a1 = (-2 * Math.PI * (i + 1)) / sides;
      const x0 = x + Math.cos(a0) * radius,
        z0 = z + Math.sin(a0) * radius,
        x1 = x + Math.cos(a1) * radius,
        z1 = z + Math.sin(a1) * radius;
      world.addQuad([x0, y0, z0], [x1, y0, z1], [x1, y1, z1], [x0, y1, z0], surface);
    }
  };

  const groundRect = (x0, z0, x1, z1, lift, hex, surface = null) => {
    const P = (x, z) => [x, Y(x, z) + lift, z];
    const pts = [...P(x0, z0), ...P(x0, z1), ...P(x1, z1), ...P(x0, z0), ...P(x1, z1), ...P(x1, z0)];
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pts, 3));
    const uvs = [0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0];
    g.setAttribute('uv', new T.Float32BufferAttribute(uvs, 2));
    g.computeVertexNormals();
    add('ground', g, hex);
    if (surface) {
      const colY = surface === 'water' ? 0.02 : 0;
      const C = (x, z) => [x, Y(x, z) + colY, z];
      solidUp([...C(x0, z0), ...C(x0, z1), ...C(x1, z1), ...C(x0, z0), ...C(x1, z1), ...C(x1, z0)], surface);
    }
  };

  const box = (bucket, x, z, w, h, d, y0, hex, {yaw = 0, solid = false, surface = 'concrete'} = {}) => {
    const by = Y(x, z);
    const g = new T.BoxGeometry(w, h, d);
    if (yaw) g.rotateY(yaw);
    g.translate(x, by + y0 + h / 2, z);
    add(bucket, g, hex);
    if (solid && world) addBox(world, x, z, w, d, by + y0, by + y0 + h, surface);
  };

  // ------------------------------------------------------------------ 1. Ground pad, roads & switchyard bed
  {
    const [fx0, fz0, fx1, fz1] = POWER_PLANT.fence.box;
    // Main compound concrete apron and south/west gate approach aprons.
    groundRect(fx0 - 22, fz0, fx1, fz1 + 22, 0.02, '#d8d1c2', 'concrete');
    groundRect(cx - 14, fz1, cx + 14, fz1 + 22, 0.024, '#555f65');
    groundRect(fx0 - 22, cz - 12, fx0, cz + 12, 0.024, '#555f65');
    // Internal asphalt perimeter loop road & central cross-avenue so the car can drive around everything.
    groundRect(cx - 78, cz - 80, cx + 52, cz - 68, 0.028, '#555f65');
    groundRect(cx - 78, cz - 8, cx + 52, cz + 4, 0.028, '#555f65');
    groundRect(cx - 78, cz + 74, cx + 52, cz + 86, 0.028, '#555f65');
    groundRect(cx - 78, cz - 80, cx - 66, cz + 86, 0.028, '#555f65');
    groundRect(cx - 8, cz - 8, cx + 8, fz1 + 20, 0.03, '#555f65');
    groundRect(fx0 - 20, cz - 8, cx - 66, cz + 4, 0.03, '#555f65');
    // Switchyard gravel bed on the east side.
    groundRect(cx + 52, cz - 72, fx1 - 4, cz + 60, 0.026, '#bfb39d');
    // Cheerful yellow centreline dashes along the entry road.
    for (let z = cz + 8; z <= fz1 + 16; z += 10) {
      groundRect(cx - 0.22, z, cx + 0.22, z + 4.5, 0.036, '#f5c542');
    }
  }

  // ------------------------------------------------------------------ 2. Twin hyperbolic cooling towers
  {
    const T_SPEC = POWER_PLANT.tower,
      H = T_SPEC.height,
      deckY = T_SPEC.deckY,
      samples = 28;
    const profile = [];
    // Outer hyperbolic wall from deckY up to just below the top lip cornice.
    for (let i = 0; i <= samples; i++) {
      const y = deckY + ((H - 1.2 - deckY) * i) / samples;
      profile.push(new T.Vector2(towerRadiusAt(y, T_SPEC), y));
    }
    // Flared top lip ring (stiffening collar) and inner throat shadow wall.
    const rTop = towerRadiusAt(H, T_SPEC);
    profile.push(
      new T.Vector2(rTop + 0.75, H - 0.5),
      new T.Vector2(rTop + 0.85, H + 0.35),
      new T.Vector2(rTop - 0.35, H + 0.35),
      new T.Vector2(rTop - 0.55, H - 0.6),
      new T.Vector2(towerRadiusAt(H - 8, T_SPEC) - 0.45, H - 8)
    );

    const baseCol = new T.Color('#f1ebe0'),
      stainCol = new T.Color('#c8c0b0'),
      rimCol = new T.Color('#fbf9f3'),
      bandCol = new T.Color('#3d9ad6'),
      innerCol = new T.Color('#8e8980'),
      workCol = new T.Color();

    for (const [ti, [tx, tz]] of POWER_PLANT.towers.entries()) {
      const ty = Y(tx, tz);
      const lathe = new T.LatheGeometry(profile, 48);
      lathe.translate(tx, ty, tz);
      add('towers', lathe, '#ffffff', (vx, vy, vz) => {
        const ly = vy - ty;
        const dx = vx - tx,
          dz = vz - tz,
          r = Math.hypot(dx, dz),
          theta = Math.atan2(dz, dx);
        const outerR = towerRadiusAt(Math.min(H, Math.max(0, ly)), T_SPEC);
        // Inner throat surface gets deep ambient shade.
        if (ly > H - 8.5 && r < outerR - 0.25 && ly < H + 0.2) {
          const depth = Math.max(0, Math.min(1, (H - ly) / 8));
          workCol.copy(rimCol).lerp(innerCol, 0.35 + 0.55 * depth);
          return [workCol.r, workCol.g, workCol.b];
        }
        // Bright white top lip ring.
        if (ly >= H - 0.7) return [rimCol.r, rimCol.g, rimCol.b];
        // Friendly sky-blue collar band below the lip ring.
        if (ly >= H - 4.2 && ly <= H - 1.6) {
          const rib = 0.94 + 0.06 * Math.sin(theta * 24);
          return [bandCol.r * rib, bandCol.g * rib, bandCol.b * rib];
        }
        // Subtle vertical staining + azimuthal streaking + damp base darkening.
        const hNorm = Math.max(0, Math.min(1, (ly - deckY) / (H - deckY)));
        const streak =
          0.5 +
          0.25 * Math.sin(theta * 9 + ti * 1.7) +
          0.15 * Math.cos(theta * 17 - ti * 0.9) +
          0.1 * Math.sin(theta * 31);
        const dampBase = Math.max(0, 1 - hNorm * 2.6) * 0.55;
        const throatShade = Math.exp(-(((hNorm - 0.72) / 0.16) ** 2)) * 0.22;
        const stain = Math.min(1, (0.12 + 0.28 * streak) * (0.45 + dampBase + throatShade));
        workCol.copy(baseCol).lerp(stainCol, stain);
        return [workCol.r, workCol.g, workCol.b];
      });

      // Base ring beam at deckY and circular water basin kerb.
      const ringBeam = new T.CylinderGeometry(
        T_SPEC.baseRadius + 0.35,
        T_SPEC.baseRadius + 0.45,
        0.55,
        48,
        1,
        true
      );
      ringBeam.translate(tx, ty + deckY + 0.1, tz);
      add('towers', ringBeam, '#e5dfd2');

      const basinWall = new T.CylinderGeometry(
        T_SPEC.baseRadius + 1.4,
        T_SPEC.baseRadius + 1.6,
        1.2,
        48
      );
      basinWall.translate(tx, ty + 0.6, tz);
      add('towers', basinWall, '#cfc8b8');

      const basinWater = new T.CircleGeometry(T_SPEC.baseRadius + 1.1, 40);
      basinWater.rotateX(-Math.PI / 2);
      basinWater.translate(tx, ty + 1.22, tz);
      add('water', basinWater, '#6ce0f5');

      // 24 V-shaped diagonal support struts around the base air-intake opening.
      const nCols = 24,
        rFoot = T_SPEC.baseRadius + 0.7,
        rHead = towerRadiusAt(deckY, T_SPEC);
      for (let i = 0; i < nCols; i++) {
        const aMid = (i * 2 * Math.PI) / nCols,
          dAng = Math.PI / nCols * 0.78;
        for (const sign of [-1, 1]) {
          const a0 = aMid + sign * dAng,
            a1 = aMid;
          const p0 = new T.Vector3(tx + Math.cos(a0) * rFoot, ty + 0.8, tz + Math.sin(a0) * rFoot),
            p1 = new T.Vector3(tx + Math.cos(a1) * rHead, ty + deckY + 0.1, tz + Math.sin(a1) * rHead);
          const dir = p1.clone().sub(p0),
            len = dir.length(),
            mid = p0.clone().addScaledVector(dir, 0.5);
          const strut = new T.CylinderGeometry(0.24, 0.28, len, 8);
          const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize());
          strut.applyQuaternion(q);
          strut.translate(mid.x, mid.y, mid.z);
          add('towers', strut, '#ded8ca');
        }
      }

      // Solid 16-sided cylinder collider so the RC car cannot drive through the tower.
      addCylinderCollider(tx, tz, T_SPEC.baseRadius + 1.5, ty, ty + H, 16, 'concrete');
    }
  }

  // ------------------------------------------------------------------ 3. Reactor containment dome & control building
  {
    const [dx, dz] = POWER_PLANT.dome.at,
      dy = Y(dx, dz),
      R = POWER_PLANT.dome.radius,
      cylH = POWER_PLANT.dome.cylinderHeight;

    // Base plinth.
    const plinth = new T.CylinderGeometry(R + 1.1, R + 1.4, 1.5, 36);
    plinth.translate(dx, dy + 0.75, dz);
    add('concrete', plinth, '#d6cfc0');

    // Main cylindrical containment wall.
    const body = new T.CylinderGeometry(R, R, cylH, 36);
    body.translate(dx, dy + cylH / 2, dz);
    add('concrete', body, '#f5f1e6');

    // Hemispherical reactor dome on top.
    const dome = new T.SphereGeometry(R, 36, 18, 0, Math.PI * 2, 0, Math.PI / 2);
    dome.translate(dx, dy + cylH, dz);
    add('concrete', dome, '#faf7ef');

    // Sky-blue springline collar ring & vertical buttress pilasters.
    const collar = new T.CylinderGeometry(R + 0.28, R + 0.28, 1.4, 36);
    collar.translate(dx, dy + cylH - 0.4, dz);
    add('metal', collar, '#3b95d4');

    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const pilaster = new T.BoxGeometry(1.1, cylH, 0.8);
      pilaster.rotateY(-a);
      pilaster.translate(dx + Math.cos(a) * (R + 0.2), dy + cylH / 2, dz + Math.sin(a) * (R + 0.2));
      add('concrete', pilaster, '#eae4d7');
    }

    // Equipment airlock barrel on the south face of the reactor building.
    const lock = new T.CylinderGeometry(2.4, 2.4, 4.2, 18);
    lock.rotateX(Math.PI / 2);
    lock.translate(dx, dy + 3.2, dz + R + 1.4);
    add('metal', lock, '#8fa3ad');
    const lockDoor = new T.CircleGeometry(1.9, 18);
    lockDoor.translate(dx, dy + 3.2, dz + R + 3.52);
    add('metal', lockDoor, '#f2be42');

    addCylinderCollider(dx, dz, R + 1.2, dy, dy + POWER_PLANT.dome.totalHeight, 16, 'concrete');

    // Adjoining Auxiliary / Control Building between the reactor dome and turbine hall.
    const [ax, az] = POWER_PLANT.controlBuilding.at,
      [aw, ah, ad] = POWER_PLANT.controlBuilding.size;
    box('concrete', ax, az, aw, ah, ad, 0, '#eee8da', {solid: true});
    box('metal', ax, az, aw + 0.6, 0.9, ad + 0.6, ah, '#3b95d4');
    // Ribbon windows on south and north facades.
    for (const side of [-1, 1]) {
      box('glass', ax, az + side * (ad / 2 + 0.04), aw - 3, 1.8, 0.08, 2.6, '#48798c');
      box('glass', ax, az + side * (ad / 2 + 0.04), aw - 3, 1.8, 0.08, 5.8, '#48798c');
    }
  }

  // ------------------------------------------------------------------ 4. Turbine hall & steam crossover pipes
  {
    const [hx, hz] = POWER_PLANT.turbineHall.at,
      [hw, hh, hd] = POWER_PLANT.turbineHall.size,
      hy = Y(hx, hz);

    // Concrete lower wall plinth and main steel-clad hall volume.
    box('concrete', hx, hz, hw + 0.4, 2.2, hd + 0.4, 0, '#d8d1c3');
    box('metal', hx, hz, hw, hh - 2.2, hd, 2.2, '#f2ede2', {solid: true, surface: 'metal'});
    if (world) addBox(world, hx, hz, hw + 0.4, hd + 0.4, hy, hy + hh, 'metal');

    // Horizontal sky-blue accent fascia and stepped monitor skylight roof.
    box('metal', hx, hz, hw + 0.5, 1.5, hd + 0.5, hh - 1.2, '#3b95d4');
    box('metal', hx, hz, hw - 8, 2.2, hd - 8, hh + 0.3, '#dce4e8');
    box('metal', hx, hz, hw - 7.4, 0.45, hd - 7.4, hh + 2.5, '#3b95d4');

    // Clerestory glass bands along both long sides of the turbine hall.
    for (const side of [-1, 1]) {
      box('glass', hx, hz + side * (hd / 2 + 0.05), hw - 6, 2.1, 0.08, hh - 4.2, '#4c8094');
      box('glass', hx, hz + side * ((hd - 8) / 2 + 0.05), hw - 10, 1.1, 0.08, hh + 0.9, '#5c96ad');
      // Structural bay pilasters every 7 m.
      for (let x = hx - hw / 2 + 3.5; x <= hx + hw / 2 - 3.5; x += 7) {
        box('metal', x, hz + side * (hd / 2 + 0.14), 0.55, hh - 1.2, 0.28, 0, '#7c9099');
      }
    }

    // Sunny yellow roll-up equipment doors on the south and west faces.
    box('metal', hx - 10, hz + hd / 2 + 0.06, 6.5, 5.2, 0.1, 0, '#f2be42');
    box('metal', hx + 10, hz + hd / 2 + 0.06, 6.5, 5.2, 0.1, 0, '#f2be42');

    // Rooftop cylindrical ventilators.
    for (const dx of [-12, 0, 12]) {
      const vent = new T.CylinderGeometry(1.3, 1.3, 1.4, 16);
      vent.translate(hx + dx, hy + hh + 3.4, hz);
      add('metal', vent, '#95a7b0');
    }

    // Three overhead steam crossover pipes bridging from the reactor building to the turbine hall (y = 10.8 m).
    const [rx] = POWER_PLANT.dome.at;
    const spanX0 = rx + POWER_PLANT.dome.radius - 1,
      spanX1 = hx - hw / 2 + 1,
      spanLen = spanX1 - spanX0,
      spanMid = (spanX0 + spanX1) / 2;
    for (const [pi, dzOff] of [-3.6, 0, 3.6].entries()) {
      const pipe = new T.CylinderGeometry(0.95, 0.95, spanLen, 16);
      pipe.rotateZ(Math.PI / 2);
      pipe.translate(spanMid, hy + 10.8, hz + dzOff);
      add('metal', pipe, pi === 1 ? '#f2be42' : '#4da6e0');
      // Vertical riser into the turbine hall roof.
      const elbow = new T.CylinderGeometry(1.0, 1.0, 3.2, 16);
      elbow.translate(spanX1 + 1.2, hy + 12.2, hz + dzOff);
      add('metal', elbow, pi === 1 ? '#f2be42' : '#4da6e0');
    }
  }

  // ------------------------------------------------------------------ 5. Water intake pond, pump house & conduits
  {
    const [wx, wz] = POWER_PLANT.pond.at,
      [ww, wd] = POWER_PLANT.pond.size,
      wy = Y(wx, wz);

    // Low concrete coping border around the pond (flush enough that a car can roll over onto the water).
    box('concrete', wx, wz - wd / 2 - 0.6, ww + 2.4, 0.18, 1.2, 0, '#e6e0d2');
    box('concrete', wx, wz + wd / 2 + 0.6, ww + 2.4, 0.18, 1.2, 0, '#e6e0d2');
    box('concrete', wx - ww / 2 - 0.6, wz, 1.2, 0.18, wd, 0, '#e6e0d2');
    box('concrete', wx + ww / 2 + 0.6, wz, 1.2, 0.18, wd, 0, '#e6e0d2');

    // Pond basin floor and scrolling water surface.
    groundRect(wx - ww / 2, wz - wd / 2, wx + ww / 2, wz + wd / 2, 0.032, '#86dbe8', 'water');
    const waterPlane = new T.PlaneGeometry(ww, wd);
    waterPlane.rotateX(-Math.PI / 2);
    waterPlane.translate(wx, wy + 0.08, wz);
    add('water', waterPlane, '#6ce0f5');

    // Two white aeration fountain rings inside the pond.
    for (const dx of [-8, 8]) {
      const nozzle = new T.CylinderGeometry(0.6, 0.8, 0.45, 14);
      nozzle.translate(wx + dx, wy + 0.22, wz);
      add('concrete', nozzle, '#f6f4ec');
    }

    // Pump house on the north edge of the pond.
    const [px, pz] = POWER_PLANT.pumpHouse.at,
      [pw, ph, pd] = POWER_PLANT.pumpHouse.size;
    box('concrete', px, pz, pw, ph, pd, 0, '#ede7d8', {solid: true});
    box('metal', px, pz, pw + 0.5, 0.6, pd + 0.5, ph, '#3aa6b8');
    box('glass', px, pz + pd / 2 + 0.04, pw - 2.4, 1.4, 0.08, 2.2, '#48798c');

    // Overhead cooling-water pipe bridge (y = 4.6 m so cars drive cleanly underneath) leading north toward towers.
    const northZ = POWER_PLANT.towers[0][1] + POWER_PLANT.tower.baseRadius,
      southZ = pz - pd / 2,
      pipeLen = southZ - northZ,
      pipeMidZ = (southZ + northZ) / 2;
    for (const [i, dx] of [-1.4, 1.4].entries()) {
      const conduit = new T.CylinderGeometry(0.65, 0.65, pipeLen, 14);
      conduit.rotateX(Math.PI / 2);
      conduit.translate(px + dx, wy + 4.6, pipeMidZ);
      add('metal', conduit, i === 0 ? '#3aa6b8' : '#52b8c8');
      for (const zEnd of [southZ - 0.6, northZ + 0.6]) {
        const drop = new T.CylinderGeometry(0.68, 0.68, 4.6, 12);
        drop.translate(px + dx, wy + 2.3, zEnd);
        add('metal', drop, i === 0 ? '#3aa6b8' : '#52b8c8');
      }
    }
  }

  // ------------------------------------------------------------------ 6. Switchyard, transformers, pylons & lines
  {
    const [hx, hz] = POWER_PLANT.turbineHall.at,
      [hw] = POWER_PLANT.turbineHall.size,
      txBase = hx + hw / 2 + 9;

    // Three step-up transformers on concrete pads with ceramic bushings.
    for (const dz of [-12, 0, 12]) {
      const tx = txBase,
        tz = hz + dz;
      box('concrete', tx, tz, 6.4, 0.4, 5.2, 0, '#cfc8b8');
      box('metal', tx, tz, 4.6, 3.8, 3.6, 0.4, '#5e727a', {solid: true, surface: 'metal'});
      // Cooling radiator fins on the sides.
      box('metal', tx, tz - 2.0, 3.8, 3.0, 0.35, 0.6, '#485960');
      box('metal', tx, tz + 2.0, 3.8, 3.0, 0.35, 0.6, '#485960');
      // Three tall turquoise ceramic insulator bushings on top.
      for (const bx of [-1.2, 0, 1.2]) {
        const bushing = new T.CylinderGeometry(0.18, 0.26, 1.9, 10);
        bushing.translate(tx + bx, Y(tx, tz) + 5.1, tz);
        add('metal', bushing, '#62cbd9');
      }
    }

    // Switchyard steel H-frame busbar gantry.
    const gx = txBase + 10;
    for (const gz of [hz - 16, hz, hz + 16]) {
      box('concrete', gx, gz, 1.4, 0.6, 1.4, 0, '#cfc8b8');
      box('metal', gx, gz, 0.45, 11.5, 0.45, 0.6, '#7d9099', {solid: true, surface: 'metal'});
    }
    box('metal', gx, hz, 0.5, 0.55, 34, 11.6, '#7d9099');

    // Three tall transmission pylons marching northeast across the switchyard.
    const pylonTops = [];
    for (const p of POWER_PLANT.pylons) {
      const [px, pz] = p.at,
        py = Y(px, pz),
        yaw = p.yaw,
        c = Math.cos(yaw),
        s = Math.sin(yaw),
        P = (lx, ly, lz) => new T.Vector3(px + lx * c + lz * s, py + ly, pz - lx * s + lz * c);

      // Concrete foundation pad (solid collider so the car bumps cleanly off the pylon base).
      box('concrete', px, pz, 5.4, 0.7, 5.4, 0, '#cfc8b8', {solid: true});

      // Four tapered corner legs rising to 24 m.
      const legH = 24,
        bHalf = 2.1,
        tHalf = 0.65;
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) {
          const p0 = P(sx * bHalf, 0.6, sz * bHalf),
            p1 = P(sx * tHalf, legH, sz * tHalf),
            dir = p1.clone().sub(p0),
            len = dir.length(),
            mid = p0.clone().addScaledVector(dir, 0.5);
          const leg = new T.CylinderGeometry(0.14, 0.22, len, 8);
          leg.applyQuaternion(new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir.normalize()));
          leg.translate(mid.x, mid.y, mid.z);
          add('metal', leg, '#889aa3');
        }

      // Two cross-arms at y = 16.5 m and y = 21.5 m, plus peak lightning finial at 25.5 m.
      const armHeights = [16.5, 21.5],
        armSpans = [6.8, 5.4],
        attachPts = [];
      for (let ai = 0; ai < armHeights.length; ai++) {
        const ay = armHeights[ai],
          span = armSpans[ai];
        const arm = new T.BoxGeometry(span * 2, 0.38, 0.38);
        arm.rotateY(yaw);
        arm.translate(px, py + ay, pz);
        add('metal', arm, '#889aa3');
        for (const side of [-1, 1]) {
          const insPos = P(side * (span - 0.4), ay - 0.9, 0);
          const ins = new T.CylinderGeometry(0.16, 0.16, 1.5, 8);
          ins.translate(insPos.x, insPos.y, insPos.z);
          add('metal', ins, '#5ec4d4');
          attachPts.push(new T.Vector3(insPos.x, insPos.y - 0.7, insPos.z));
        }
      }
      const peak = new T.ConeGeometry(0.75, 2.2, 4);
      peak.rotateY(yaw + Math.PI / 4);
      peak.translate(px, py + legH + 1.1, pz);
      add('metal', peak, '#f2be42');
      pylonTops.push(attachPts);
    }

    // Catenary overhead cables from the switchyard gantry through all three pylons.
    const addCable = (a, b, sag = 2.2) => {
      const mid = a.clone().lerp(b, 0.5);
      mid.y -= sag;
      const curve = new T.QuadraticBezierCurve3(a, mid, b);
      const tube = new T.TubeGeometry(curve, 14, 0.07, 6, false);
      add('cables', tube, '#2a3338');
    };
    const gy = Y(gx, hz) + 11.6;
    const gantryPts = [
      new T.Vector3(gx, gy, hz - 10),
      new T.Vector3(gx, gy, hz - 3),
      new T.Vector3(gx, gy, hz + 3),
      new T.Vector3(gx, gy, hz + 10)
    ];
    for (let k = 0; k < 4; k++) {
      addCable(gantryPts[k], pylonTops[0][k], 1.6);
      for (let pi = 0; pi < pylonTops.length - 1; pi++) {
        addCable(pylonTops[pi][k], pylonTops[pi + 1][k], 2.4);
      }
    }
  }

  // ------------------------------------------------------------------ 7. Perimeter fence, gates & welcome booth
  {
    const [fx0, fz0, fx1, fz1] = POWER_PLANT.fence.box,
      [sg0, sg1] = POWER_PLANT.fence.southGap,
      [wg0, wg1] = POWER_PLANT.fence.westGap,
      fh = POWER_PLANT.fence.height;

    const fenceRun = (ax, az, bx, bz) => {
      const dx = bx - ax,
        dz = bz - az,
        len = Math.hypot(dx, dz);
      if (len < 0.5) return;
      const mx = (ax + bx) / 2,
        mz = (az + bz) / 2,
        yaw = Math.atan2(dx, dz);
      // Top and mid horizontal rails.
      for (const ry of [0.85, fh - 0.15]) {
        const rail = new T.BoxGeometry(0.08, 0.09, len);
        rail.rotateY(yaw);
        rail.translate(mx, Y(mx, mz) + ry, mz);
        add('metal', rail, '#8b9da6');
      }
      // Low concrete kerb plinth and fence posts every 6 m.
      const plinth = new T.BoxGeometry(0.28, 0.25, len);
      plinth.rotateY(yaw);
      plinth.translate(mx, Y(mx, mz) + 0.125, mz);
      add('concrete', plinth, '#cfc8b8');
      const steps = Math.max(1, Math.round(len / 6));
      for (let i = 0; i <= steps; i++) {
        const t = i / steps,
          px = ax + dx * t,
          pz = az + dz * t;
        const post = new T.CylinderGeometry(0.09, 0.09, fh, 8);
        post.translate(px, Y(px, pz) + fh / 2, pz);
        add('metal', post, '#5d747e');
      }
      // Solid double-sided collision quad so the car cannot drive through the fence.
      if (world?.addQuad) {
        const y0 = Y(mx, mz),
          y1 = y0 + fh;
        const a0 = [ax, y0, az],
          b0 = [bx, y0, bz],
          b1 = [bx, y1, bz],
          a1 = [ax, y1, az];
        world.addQuad(a0, b0, b1, a1, 'metal');
        world.addQuad(b0, a0, a1, b1, 'metal');
      }
    };

    // North wall, East wall, South wall (split around south gate), West wall (split around west gate).
    fenceRun(fx0, fz0, fx1, fz0);
    fenceRun(fx1, fz0, fx1, fz1);
    fenceRun(fx0, fz1, sg0, fz1);
    fenceRun(sg1, fz1, fx1, fz1);
    fenceRun(fx0, fz0, fx0, wg0);
    fenceRun(fx0, wg1, fx0, fz1);

    // South gate pillars and friendly guardhouse booth on the west side of the main gate.
    for (const gx of [sg0, sg1]) {
      box('concrete', gx, fz1, 0.9, 3.2, 0.9, 0, '#f2ede2', {solid: true});
      box('metal', gx, fz1, 1.1, 0.35, 1.1, 3.2, '#3b95d4');
    }
    const bx = sg0 - 4.8,
      bz = fz1 - 3.2;
    box('concrete', bx, bz, 5.2, 3.2, 4.2, 0, '#f2ede2', {solid: true});
    box('metal', bx, bz, 6.0, 0.4, 5.0, 3.2, '#3b95d4');
    box('glass', bx, bz + 2.14, 3.4, 1.3, 0.08, 1.2, '#48798c');

    // Welcome sign above the gatehouse.
    const signGeo = K(new T.PlaneGeometry(7.2, 2.25));
    const signMesh = new T.Mesh(signGeo, mats.sign);
    signMesh.name = 'PowerPlant_sign';
    signMesh.position.set(bx, Y(bx, bz) + 4.75, fz1 + 0.05);
    signMesh.castShadow = true;
    signMesh.receiveShadow = true;
    root.add(signMesh);
  }

  // ------------------------------------------------------------------ 8. Merge static geometry by material bucket
  for (const [key, parts] of buckets) {
    if (!parts.length) continue;
    const merged = K(mergeGeometries(parts, false));
    parts.forEach(p => p.dispose());
    merged.computeBoundingSphere();
    const mesh = new T.Mesh(merged, mats[key]);
    mesh.name = `PowerPlant_${key}`;
    mesh.receiveShadow = true;
    mesh.castShadow = key !== 'ground' && key !== 'water';
    root.add(mesh);
  }

  // ------------------------------------------------------------------ 9. Instanced rising white steam plumes
  const steamCount = POWER_PLANT.steamCount;
  const puffGeo = K(new T.SphereGeometry(1, 14, 10));
  const steamAlphas = new Float32Array(steamCount).fill(0.5);
  const alphaAttr = new T.InstancedBufferAttribute(steamAlphas, 1);
  puffGeo.setAttribute('aAlpha', alphaAttr);

  const steamMat = K(
    new T.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      fog: false,
      vertexShader: `
        attribute float aAlpha;
        varying float vAlpha;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          vAlpha = aAlpha;
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          vNormal = normalize(normalMatrix * mat3(instanceMatrix) * normal);
          vView = normalize(-mv.xyz);
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        varying vec3 vNormal;
        varying vec3 vView;
        void main() {
          float rim = pow(max(0.0, dot(normalize(vNormal), normalize(vView))), 1.3);
          float a = rim * vAlpha;
          if (a < 0.01) discard;
          vec3 topCol = vec3(1.0, 0.99, 0.97);
          vec3 shadeCol = vec3(0.85, 0.91, 0.96);
          vec3 col = mix(shadeCol, topCol, clamp(vNormal.y * 0.5 + 0.55, 0.0, 1.0));
          gl_FragColor = vec4(col, a);
        }
      `
    })
  );

  const steam = new T.InstancedMesh(puffGeo, steamMat, steamCount);
  steam.name = 'PowerPlant_steam';
  steam.frustumCulled = false;
  root.add(steam);

  const dummy = new T.Object3D();
  const perTower = steamCount / POWER_PLANT.towers.length;
  const syncSteam = time => {
    const H = POWER_PLANT.tower.height;
    for (let i = 0; i < steamCount; i++) {
      const ti = i < perTower ? 0 : 1,
        k = i % perTower,
        [tx, tz] = POWER_PLANT.towers[ti],
        ty = Y(tx, tz);
      const phase = ((k / perTower) + time * 0.048 + ti * 0.37) % 1;
      const rise = phase * 68;
      const radius = 9.5 + phase * 18.5;
      const wobble = 1.4 + phase * 4.8;
      const angle = k * 2.39996 + time * 0.35 * (ti ? -1 : 1);
      const driftX = (phase ** 1.15) * 14 + Math.cos(angle) * wobble;
      const driftZ = (phase ** 1.15) * -6 + Math.sin(angle) * wobble;
      dummy.position.set(tx + driftX, ty + H - 2.5 + rise, tz + driftZ);
      dummy.scale.set(radius, radius * (0.72 + 0.18 * Math.sin(phase * Math.PI)), radius);
      dummy.rotation.set(0, angle * 0.4, 0);
      dummy.updateMatrix();
      steam.setMatrixAt(i, dummy.matrix);
      const fadeIn = Math.min(1, phase / 0.14);
      const fadeOut = Math.pow(Math.max(0, 1 - phase), 1.55);
      steamAlphas[i] = 0.62 * fadeIn * fadeOut;
    }
    steam.instanceMatrix.needsUpdate = true;
    alphaAttr.needsUpdate = true;
  };

  let clock = 0;
  syncSteam(clock);

  scene.add(root);

  let drawCalls = 0;
  root.traverse(o => {
    if (o.isMesh) drawCalls++;
  });

  return {
    root,
    drawCalls,
    update(dt = 1 / 60, pos = null, stepOptions = null) {
      const show = typeof stepOptions === 'boolean' ? stepOptions : (stepOptions?.show ?? true);
      const near =
        !pos ||
        Math.hypot((pos[0] ?? cx) - cx, (pos[2] ?? pos[1] ?? cz) - cz) < POWER_PLANT.cullDistance;
      root.visible = Boolean(show && near);
      if (!root.visible) return;
      const opts = stepOptions && typeof stepOptions === 'object' ? stepOptions : options;
      if (prefersReducedMotion(opts)) return;
      if (!(dt > 0 && Number.isFinite(dt))) return;
      clock += dt;
      syncSteam(clock);
      mats.water.map.offset.set((clock * 0.018) % 1, (clock * 0.012) % 1);
    },
    dispose() {
      root.removeFromParent();
      steam.dispose();
      keep.forEach(x => x.dispose?.());
    }
  };
}

export const createPowerPlant = buildPowerPlant;
