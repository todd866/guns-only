import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

// Distinctive civic facade dressing for the first mapped public footprint. It
// deliberately carries no source names, logos, addresses, or coordinates.
export function prepareResidentialCivic(world, data = {}) {
  const source = (data.buildings || []).find((b) => b.kind === 'civic' && b.points?.length >= 3);
  let root = null; const meshes = []; const materials = new Map();
  const colours = {wall: '#c5bfa9', red: '#bd4f48', roof: '#3a4446', glass: '#5a6d70', concrete: '#aaa99d', blue: '#315b79', trim: '#d6cfb4'};
  const material = (key) => { if (!materials.has(key)) materials.set(key, new T.MeshStandardMaterial({color: colours[key], roughness: key === 'glass' ? .35 : .86, metalness: key === 'roof' ? .12 : 0})); return materials.get(key); };
  const addBox = (list, key, w, h, d, x, y, z, rot = 0) => { const g = new T.BoxGeometry(w, h, d); g.applyMatrix4(new T.Matrix4().makeRotationY(rot)); g.applyMatrix4(new T.Matrix4().makeTranslation(x, y, z)); list(key).push(g); };
  const addCylinder = (list, key, r, h, x, y, z, rot = 0) => { const g = new T.CylinderGeometry(r, r * 1.03, h, 16); g.applyMatrix4(new T.Matrix4().makeRotationY(rot)); g.applyMatrix4(new T.Matrix4().makeTranslation(x, y, z)); list(key).push(g); };

  const attach = (scene) => {
    if (!scene?.add) throw new TypeError('prepareResidentialCivic.attach requires a scene');
    if (root || !source) { if (!root) { root = new T.Group(); scene.add(root); } return root; }
    root = new T.Group(); root.name = 'ResidentialCivicDetails';
    const buckets = new Map(); const list = (key) => { if (!buckets.has(key)) buckets.set(key, []); return buckets.get(key); };
    const pts = source.points; const minX = Math.min(...pts.map((p) => p[0])), maxX = Math.max(...pts.map((p) => p[0]));
    const minZ = Math.min(...pts.map((p) => p[1])), maxZ = Math.max(...pts.map((p) => p[1]));
    const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, width = maxX - minX, depth = maxZ - minZ;
    // Derive the actual straight frontage from the supplied footprint. The
    // longest edge within 2 m of the footprint's southmost edge is the civic
    // entry elevation; this keeps every overlay attached to the real wall.
    const edges = pts.map((a, i) => { const b = pts[(i + 1) % pts.length], dx = b[0] - a[0], dz = b[1] - a[1]; return {a, b, len: Math.hypot(dx, dz), mz: (a[1] + b[1]) / 2}; });
    const front = edges.filter((e) => e.mz >= maxZ - 2).sort((a, b) => b.len - a.len)[0] || edges.slice().sort((a, b) => b.mz - a.mz)[0];
    const tx = (front.b[0] - front.a[0]) / front.len, tz = (front.b[1] - front.a[1]) / front.len;
    const nx = tz, nz = -tx, frontMid = [(front.a[0] + front.b[0]) / 2, (front.a[1] + front.b[1]) / 2];
    const frontAngle = Math.atan2(-tz, tx), frontNormalAngle = Math.atan2(nx, nz);
    const onFront = (along, outward = 0, y = 0) => [frontMid[0] + tx * along + nx * outward, y, frontMid[1] + tz * along + nz * outward];
    const h = 5.0;
    const quad = (key, a, b, c, d) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3)); g.computeVertexNormals(); list(key).push(g); };
    // Low concrete forecourt follows the footprint's street-facing south edge.
    addBox(list, 'concrete', front.len * .72, .03, 8, frontMid[0] + nx * 4, .018, frontMid[1] + nz * 4, frontAngle);
    addBox(list, 'roof', front.len * .86, .18, 1.8, frontMid[0] - nx * 1.15, h + .12, frontMid[1] - nz * 1.15, frontAngle);
    // Long recessed red window band below the dark roof lip.
    addBox(list, 'red', front.len * .55, 1.35, .08, frontMid[0] + nx * .08, 1.65, frontMid[1] + nz * .08, frontAngle);
    addBox(list, 'glass', front.len * .40, 1.02, .04, frontMid[0] + nx * .14, 1.67, frontMid[1] + nz * .14, frontAngle);
    // Semicircular lower windows as three arch rings on the long frontage.
    for (const along of [-front.len * .30, 0, front.len * .30]) {
      const x = frontMid[0] + tx * along + nx * .18, z = frontMid[1] + tz * along + nz * .18;
      const ring = new T.TorusGeometry(2.15, .12, 8, 18, Math.PI);
      // TorusGeometry is already in the XY plane, facing +Z: a true upper
      // semicircle with its straight edge at the sill.
      ring.rotateY(frontNormalAngle); ring.translate(x, .48, z); list('trim').push(ring);
      const panel = []; const radius = 2.03, sill = .52;
      for (let i = 0; i < 17; i++) {
        const a = Math.PI * i / 17, b = Math.PI * (i + 1) / 17;
        panel.push(x + tx * Math.cos(a) * radius, sill + Math.sin(a) * radius, z + tz * Math.cos(a) * radius, x + tx * Math.cos(b) * radius, sill + Math.sin(b) * radius, z + tz * Math.cos(b) * radius, x, sill, z);
      }
      const pane = new T.BufferGeometry(); pane.setAttribute('position', new T.Float32BufferAttribute(panel, 3)); const positions=pane.getAttribute('position');for(let i=0;i<positions.count;i+=3){const x=positions.getX(i+1),y=positions.getY(i+1),z=positions.getZ(i+1);positions.setXYZ(i+1,positions.getX(i+2),positions.getY(i+2),positions.getZ(i+2));positions.setXYZ(i+2,x,y,z);}pane.computeVertexNormals(); list('glass').push(pane);
    }
    // Red cylindrical entrance/tower and its projecting dark cap.
    const tower = onFront(front.len * .28, -.9), towerX = tower[0], towerZ = tower[2];
    addCylinder(list, 'red', 1.15, h + .55, towerX, (h + .55) / 2, towerZ);
    addBox(list, 'roof', 7.5, .22, 2.6, towerX - nx * 2.0, h + .5, towerZ - nz * 2.0, frontAngle);
    addBox(list, 'glass', 2.5, 2.1, .06, towerX + nx * 1.35, 1.4, towerZ + nz * 1.35, frontAngle);
    addBox(list, 'trim', .22, 2.35, 2.7, towerX + nx * 1.35, 1.5, towerZ + nz * 1.35, frontAngle);
    // Abstract blue freestanding sign silhouette outside the civic frontage.
    const sign = onFront(front.len * .18, 8), signX = sign[0], signZ = sign[2];
    addBox(list, 'blue', .18, 4.7, .18, signX - 1.0, 2.35, signZ);
    addBox(list, 'blue', .18, 4.7, .18, signX + 1.0, 2.35, signZ);
    addBox(list, 'blue', 2.35, 1.65, .16, signX, 4.35, signZ);
    addBox(list, 'trim', 1.95, .12, .05, signX, 4.8, signZ - .1);
    for (const [key, parts] of buckets) {
      const normalized = parts.map((g) => { const flat = g.index ? g.toNonIndexed() : g; const out = new T.BufferGeometry(); out.setAttribute('position', flat.getAttribute('position').clone()); flat.dispose(); return out; });
      const geometry = mergeGeometries(normalized, false); normalized.forEach((g) => g.dispose()); parts.forEach((g) => g.dispose()); geometry.computeVertexNormals();
      const mesh = new T.Mesh(geometry, material(key)); mesh.name = `ResidentialCivic_${key}`; mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); meshes.push(mesh);
    }
    root.updateMatrixWorld(true); scene.add(root); return root;
  };
  const dispose = () => { if (root) root.removeFromParent(); meshes.forEach((m) => m.geometry.dispose()); meshes.length = 0; materials.forEach((m) => m.dispose()); materials.clear(); root = null; };
  return {attach, dispose};
}
