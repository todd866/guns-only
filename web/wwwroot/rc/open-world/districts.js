import {finishSkateparkSurface} from './skatepark-materials.js';
import {RESIDENTIAL_PARK} from './residential-frame.mjs';
import * as T from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/three/addons/loaders/GLTFLoader.js';
import {courseFromGlb} from '../physics/district.mjs';
import {createWorld, sealTransitionNormals} from '../physics/world.mjs';
import {placeDistrictCourse} from './district-placement.mjs';
import {DISTRICT_ENTRANCES, clipDistrictTriangle} from './district-entrances.mjs';
import {DISTRICT_ZONES, districtOffset} from './district-zones.mjs';
import {districtApron} from './district-aprons.mjs';
import {fetchAssetBuffer} from '../asset-buffer.mjs';
import {introBermOverlays, clipIntroTurf} from './intro-berm-overlay.mjs';
import {perimeterSkirts} from './park-skirt.mjs';

// Districts listed in `eager` (all of them by default) are prepared before driving. The runtime
// passes only the starting ones in the browser: the others are 1-2 km away, so they download after attach and join
// the world as they arrive; `loadRest()` settles once every district is in. Standalone GLBs remain untouched.
export async function prepareDistricts(world, {eager = [...Object.keys(DISTRICT_ZONES), 'skatepark']} = {}) {
  let paintTexture = null,
    scene = null,
    disposed = false;
  const ids = [...Object.keys(DISTRICT_ZONES), 'skatepark'],
    entries = [],
    courses = new Map();
  const load = id => fetchAssetBuffer(`./assets/districts/${id}.glb`).then(buffer => ({id, buffer}));
  // Collision parsing of a district GLB is a few hundred milliseconds of DataView reads.
  // Keep that off the driving frame; Node tests stay on the caller.
  const courseInBackground = buffer => {
    if (typeof document === 'undefined' || typeof Worker !== 'function') return Promise.resolve(courseFromGlb(buffer));
    return new Promise((resolve, reject) => {
      const worker = new Worker(new URL('./district-course-worker.js', import.meta.url), {type: 'module'}),
        fail = error => {
          worker.terminate();
          reject(error instanceof Error ? error : Error(error?.message || 'district course worker failed'));
        };
      worker.onmessage = event => {
        worker.terminate();
        const world = createWorld(4);
        for (const t of event.data.tris) world.addTri(t.a, t.b, t.c, t.surface);
        const {tris, ...rest} = event.data;
        resolve({...rest, world});
      };
      worker.onerror = fail;
      const bytes =
        buffer instanceof ArrayBuffer ? buffer : buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      worker.postMessage(bytes);
    });
  };
  // Collision insertion stays deterministic within each batch: results are consumed in catalog order.
  const later = () =>
    new Promise(resolve => {
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(() => resolve());
      else setTimeout(resolve, 0);
    });
  const insert = async ({id, buffer, native}, pace = null) => {
    native ??= courseFromGlb(buffer);
    const zone = id === 'skatepark' ? null : id,
      clip = vertices => (zone ? clipDistrictTriangle(zone, vertices) : [vertices]),
      placement = zone ? {anchor: districtOffset(zone)} : RESIDENTIAL_PARK;
    const cut = createWorld();
    let slice = performance.now();
    const breathe = async () => {
      if (!pace || performance.now() - slice <= 12) return false;
      await pace();
      slice = performance.now();
      return true;
    };
    for (const t of native.world.tris) {
      if (pace && performance.now() - slice > 12) await breathe();
      for (const [a, b, c] of clip([t.a, t.b, t.c])) cut.addTri(a, b, c, t.surface);
    }
    const course = placeDistrictCourse({...native, world: cut}, placement);
    for (const t of course.world.tris) {
      if (pace && performance.now() - slice > 12) await breathe();
      world.addTri(t.a, t.b, t.c, t.surface);
    }
    if (id !== 'skatepark') {
      const apron = districtApron(id);
      world.addQuad(...apron.vertices, apron.surface);
    } else for (const q of perimeterSkirts(course.world)) world.addQuad(...q, 'concrete'); // never under the slab (park-skirt.mjs)
    sealTransitionNormals(world);
    course.world = world;
    const entry = {id, zone, clip, placement, buffer, course};
    entries.push(entry);
    courses.set(id, course);
    return entry;
  };
  for (const d of await Promise.all(ids.filter(id => eager.includes(id)).map(load))) await insert(d);
  const rest = ids.filter(id => !eager.includes(id));
  let ready = null;
  // Idempotent: the game calls this once the player is driving, a jump calls it before arriving.
  // A district GLB is parsed and expanded on the main thread. Doing housing, the school and the
  // BX in one turn was a multi-hundred-millisecond hitch while driving. One district per frame,
  // and a breath inside a district when the copy runs long, keeps that under a frame.
  const loadRest = warm =>
    (ready ??= Promise.all(rest.map(load)).then(async decoded => {
      for (const d of decoded) {
        if (disposed) return;
        await later();
        const native = await courseInBackground(d.buffer);
        if (disposed) return;
        await later();
        const entry = await insert({...d, native}, later);
        if (!scene) continue;
        const root = await attachEntry(entry);
        if (warm && root) await warm(root);
      }
    }));
  const roots = [];
  async function attachEntry({id, clip, placement, buffer}) {
    if (disposed) return;
    const gltf = await new GLTFLoader().parseAsync(buffer, './assets/districts/'),
      root = new T.Group();
    root.name = `District_${id}`;
    root.position.set(...placement.anchor);
    root.rotation.y = placement.yaw ?? 0;
    gltf.scene.updateMatrixWorld(true);
    const introPathOverlays = [];
    let introPathMesh = null,
      introPathAttributes = null,
      introPathData = null;
    const sources = [];
    gltf.scene.traverse(o => {
      if (o.isMesh && o.name.startsWith('VIS_')) sources.push(o);
    });
    let slice = performance.now();
    for (const o of sources) {
      if (performance.now() - slice > 12) {
        await later();
        slice = performance.now();
      }
      const source = o.geometry.clone().applyMatrix4(o.matrixWorld),
        index = source.index,
        attributes = ['position', 'normal', 'uv', 'color']
          .filter(name => source.attributes[name])
          .map(name => [name, source.attributes[name]]),
        data = Object.fromEntries(attributes.map(([name]) => [name, []]));
      const district = DISTRICT_ENTRANCES.find(entry => entry.id === id),
        position = source.attributes.position,
        copyAt = at => {
          for (const [name, attribute] of attributes) {
            const out = data[name];
            out.push(attribute.getX(at));
            if (attribute.itemSize > 1) out.push(attribute.getY(at));
            if (attribute.itemSize > 2) out.push(attribute.getZ(at));
            if (attribute.itemSize > 3) out.push(attribute.getW(at));
          }
        },
        triCount = index ? index.count : position.count;
      for (let t = 0; t < triCount; t += 3) {
        if (t > 0 && t % 9000 === 0 && performance.now() - slice > 12) {
          await later();
          slice = performance.now();
        }
        const i0 = index ? index.getX(t) : t,
          i1 = index ? index.getX(t + 1) : t + 1,
          i2 = index ? index.getX(t + 2) : t + 2;
        // A triangle wholly inside the shell and clear of the door is returned unchanged by
        // the clipper. Copy its typed-array values. Only the doorway and the shell edge allocate.
        // The index stays in place: expanding it first was a single long allocation.
        if (district) {
          const xs = [position.getX(i0), position.getX(i1), position.getX(i2)],
            ys = [position.getY(i0), position.getY(i1), position.getY(i2)],
            zs = [position.getZ(i0), position.getZ(i1), position.getZ(i2)],
            [xmin, zmin, xmax, zmax] = district.bounds;
          if (xs.every(x => x < xmin) || xs.every(x => x > xmax) || zs.every(z => z < zmin) || zs.every(z => z > zmax))
            continue;
          const [dx0, dy0, dz0, dx1, dy1, dz1] = district.doorbox,
            inside = xs.every(x => x >= xmin && x <= xmax) && zs.every(z => z >= zmin && z <= zmax),
            clear =
              Math.max(...xs) < dx0 ||
              Math.min(...xs) > dx1 ||
              Math.max(...ys) < dy0 ||
              Math.min(...ys) > dy1 ||
              Math.max(...zs) < dz0 ||
              Math.min(...zs) > dz1;
          if (inside && clear) {
            copyAt(i0);
            copyAt(i1);
            copyAt(i2);
            continue;
          }
        }
        const vertices = [i0, i1, i2].map(at =>
          attributes.flatMap(([, a]) =>
            Array.from({length: a.itemSize}, (_, j) => a[['getX', 'getY', 'getZ', 'getW'][j]](at))
          )
        );
        if (id === 'skatepark' && o.material?.name === 'turf')
          introPathOverlays.push(...introBermOverlays(vertices));
        for (const tri of id === 'skatepark' && o.material?.name === 'turf'
          ? clipIntroTurf(vertices)
          : clip(vertices))
          for (const v of tri) {
            let at = 0;
            for (const [name, a] of attributes) {
              data[name].push(...v.slice(at, at + a.itemSize));
              at += a.itemSize;
            }
          }
      }
      if (data.position.length) {
        const geometry = new T.BufferGeometry();
        for (const [name, a] of attributes)
          geometry.setAttribute(name, new T.Float32BufferAttribute(data[name], a.itemSize));
        geometry.computeBoundingSphere();
        if (id === 'skatepark' && o.material?.name !== 'path')
          finishSkateparkSurface(geometry, o.material, paintTexture);
        const mesh = new T.Mesh(geometry, o.material);
        mesh.castShadow = mesh.receiveShadow = true;
        root.add(mesh);
        if (id === 'skatepark' && o.material?.name === 'path') {
          introPathMesh = mesh;
          introPathAttributes = attributes;
          introPathData = data;
        }
      }
      source.dispose();
    }
    if (introPathMesh && introPathData)
      for (const tri of introPathOverlays) {
        const ab = tri[1].map((v, i) => v - tri[0][i]),
          ac = tri[2].map((v, i) => v - tri[0][i]),
          n = [ab[1] * ac[2] - ab[2] * ac[1], ab[2] * ac[0] - ab[0] * ac[2], ab[0] * ac[1] - ab[1] * ac[0]],
          l = Math.hypot(...n) || 1;
        for (const v of tri)
          for (const [name, a] of introPathAttributes) {
            const values =
              name === 'position'
                ? v
                : name === 'normal'
                  ? n.map(x => x / l)
                  : name === 'uv'
                    ? [v[0] / 3, v[2] / 3]
                    : name === 'color'
                      ? Array(a.itemSize).fill(1)
                      : Array(a.itemSize).fill(0);
            introPathData[name].push(...values.slice(0, a.itemSize));
          }
      }
    if (introPathMesh && introPathData) {
      const old = introPathMesh.geometry,
        geometry = new T.BufferGeometry();
      for (const [name, a] of introPathAttributes)
        geometry.setAttribute(name, new T.Float32BufferAttribute(introPathData[name], a.itemSize));
      geometry.computeBoundingSphere();
      finishSkateparkSurface(geometry, introPathMesh.material, paintTexture);
      introPathMesh.geometry = geometry;
      old.dispose();
    }
    // Materials belong to the attached mesh set; source geometry is no longer used.
    gltf.scene.traverse(o => o.geometry?.dispose());
    scene.add(root);
    roots.push(root);
    if (id === 'skatepark') return root;
    const apron = districtApron(id),
      [a, b, c, d] = apron.vertices,
      geometry = new T.BufferGeometry();
    geometry.setAttribute('position', new T.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
    geometry.computeVertexNormals();
    const threshold = new T.Mesh(geometry, new T.MeshStandardMaterial({color: apron.color, roughness: 0.9}));
    threshold.name = `Threshold_${id}`;
    threshold.receiveShadow = true;
    scene.add(threshold);
    roots.push(threshold);
    return root;
  }
  return {
    courses,
    loadRest,
    async attach(target) {
      scene = target;
      paintTexture = await new T.TextureLoader().loadAsync(
        new URL('../assets/materials/park-paint-atlas.webp', import.meta.url).href
      );
      paintTexture.colorSpace = T.SRGBColorSpace;
      paintTexture.flipY = false;
      paintTexture.wrapS = T.RepeatWrapping;
      paintTexture.anisotropy = 8;
      for (const entry of [...entries]) await attachEntry(entry);
    },
    dispose() {
      disposed = true;
      const materials = new Set(),
        textures = new Set();
      for (const root of roots) {
        root.removeFromParent();
        root.traverse(o => {
          o.geometry?.dispose();
          for (const m of Array.isArray(o.material) ? o.material : o.material ? [o.material] : []) {
            materials.add(m);
            for (const v of Object.values(m)) if (v?.isTexture) textures.add(v);
          }
        });
      }
      for (const m of materials) m.dispose();
      for (const t of textures) t.dispose();
      roots.length = 0;
    }
  };
}
