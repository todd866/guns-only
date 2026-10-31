import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

// Painted concrete block: four 0.2 m courses of 0.4 m blocks per 0.8 m repeat.
function blockTexture() {
  const size = 128, pixels = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    const course = Math.floor(y / 32), mortar = y % 32 < 2 || (x + (course % 2) * 32) % 64 < 2;
    const noise = ((x * 37 + y * 71) % 23) / 23 - .5, shade = mortar ? .8 : .96 + noise * .05, i = (y * size + x) * 4;
    pixels[i] = pixels[i + 1] = pixels[i + 2] = 255 * shade; pixels[i + 3] = 255;
  }
  const texture = new T.DataTexture(pixels, size, size, T.RGBAFormat); texture.colorSpace = T.SRGBColorSpace;
  texture.wrapS = texture.wrapT = T.RepeatWrapping; texture.generateMipmaps = true; texture.minFilter = T.LinearMipmapLinearFilter; texture.anisotropy = 4; texture.needsUpdate = true;
  return texture;
}

// Distinctive civic facade dressing for the first mapped public footprint. It
// deliberately carries no source names, logos, addresses, or coordinates.
export function prepareResidentialCivic(world, data = {}, options = {}) {
  const source = (data.buildings || []).find((b) => b.kind === 'civic' && b.points?.length >= 3);
  let root = null; const meshes = []; const materials = new Map();
  const heightAt = options.terrain?.heightAt ?? (() => 0);
  const colours = {wall: '#c5bfa9', red: '#bd4f48', fanRoof: '#b9433e', roofSeam: '#eee2bb', rearWall: '#d7d2c0', roof: '#3a4446', glass: '#5a6d70', concrete: '#aaa99d', blue: '#315b79', trim: '#d6cfb4'};
  const material = (key) => { if (!materials.has(key)) { const m = new T.MeshStandardMaterial({color: colours[key], roughness: key === 'glass' ? .35 : .86, metalness: key === 'roof' ? .12 : 0}); if (key === 'rearWall') m.map = blockTexture(); materials.set(key, m); } return materials.get(key); };
  const addBox = (list, key, w, h, d, x, y, z, rot = 0) => { const g = new T.BoxGeometry(w, h, d); g.applyMatrix4(new T.Matrix4().makeRotationY(rot)); g.applyMatrix4(new T.Matrix4().makeTranslation(x, y, z)); list(key).push(g); };
  const addCylinder = (list, key, r, h, x, y, z, rot = 0) => { const g = new T.CylinderGeometry(r, r * 1.03, h, 16); g.applyMatrix4(new T.Matrix4().makeRotationY(rot)); g.applyMatrix4(new T.Matrix4().makeTranslation(x, y, z)); list(key).push(g); };

  const attach = (scene) => {
    if (!scene?.add) throw new TypeError('prepareResidentialCivic.attach requires a scene');
    if (root || !source) { if (!root) { root = new T.Group(); scene.add(root); } return root; }
    root = new T.Group(); root.name = 'ResidentialCivicDetails';
    const sourceCentre = source.points.reduce((s,p)=>[s[0]+p[0]/source.points.length,s[1]+p[1]/source.points.length],[0,0]);
    root.position.y = heightAt(sourceCentre[0], sourceCentre[1]);
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
    const quad = (key, a, b, c, d) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3)); const u = Math.hypot(b[0] - a[0], b[2] - a[2]) / .8, v0 = a[1] / .8, v1 = c[1] / .8; g.setAttribute('uv', new T.Float32BufferAttribute([0, v0, u, v0, u, v1, 0, v0, u, v1, 0, v1], 2)); g.computeVertexNormals(); list(key).push(g); };
    const triangle = (key, a, b, c) => { const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute([...a, ...b, ...c], 3)); g.computeVertexNormals(); list(key).push(g); };
    // Low concrete forecourt follows the footprint's street-facing south edge.
    addBox(list, 'concrete', front.len * .72, .03, 8, frontMid[0] + nx * 4, .018, frontMid[1] + nz * 4, frontAngle);
    addBox(list, 'roof', front.len * .86, .18, 1.8, frontMid[0] - nx * 1.15, h + .12, frontMid[1] - nz * 1.15, frontAngle);
    // A clipped polygon roof turns the civic footprint into the red fan-roof
    // landmark: every triangle comes directly from the mapped outline, so no
    // rectangular cap can float beyond a concave corner.
    const roofY = h + .12;
    const roofShape = pts.map(([x, z]) => new T.Vector2(x, z));
    const roofFaces = T.ShapeUtils.triangulateShape(roofShape, []);
    for (const face of roofFaces) {
      const a = pts[face[0]]; let b = pts[face[1]], c = pts[face[2]];
      // x/z footprint coordinates become x/y in ShapeUtils; reverse a face
      // when its transferred x/y winding would point the roof normal down.
      const down = (b[1] - a[1]) * (c[0] - a[0]) - (b[0] - a[0]) * (c[1] - a[1]);
      if (down < 0) [b, c] = [c, b];
      triangle('fanRoof', [a[0], roofY, a[1]], [b[0], roofY, b[1]], [c[0], roofY, c[1]]);
    }
    const tower = onFront(front.len * .28, -.9), towerX = tower[0], towerZ = tower[2];
    // The roof radiates around the curved courtyard, rather than the service
    // entrance at a distant corner. Fit its circular recess from the footprint.
    const circleCentre=(a,b,c)=>{
      const d=2*(a[0]*(b[1]-c[1])+b[0]*(c[1]-a[1])+c[0]*(a[1]-b[1]));
      if(Math.abs(d)<.001)return [cx,cz];
      const aa=a[0]**2+a[1]**2,bb=b[0]**2+b[1]**2,cc=c[0]**2+c[1]**2;
      return [(aa*(b[1]-c[1])+bb*(c[1]-a[1])+cc*(a[1]-b[1]))/d,(aa*(c[0]-b[0])+bb*(a[0]-c[0])+cc*(b[0]-a[0]))/d];
    };
    const fanTarget=pts.length===30?circleCentre(pts[11],pts[18],pts[23]):[cx,cz];
    const cross=(a,b,p)=>(b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0]);
    const clip=(polygon,a,b,sign)=>{
      const out=[];for(let i=0;i<polygon.length;i++){const p=polygon[i],q=polygon[(i+1)%polygon.length],dp=cross(a,b,p)*sign,dq=cross(a,b,q)*sign;
        if(dp>=0)out.push(p);if((dp>=0)!==(dq>=0)){const t=dp/(dp-dq);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}}
      return out;
    };
    const reach=Math.hypot(width,depth)*2;
    for(let angle=0;angle<Math.PI*2;angle+=Math.PI/12){
      const dx=Math.cos(angle),dz=Math.sin(angle),nx=-dz*.24,nz=dx*.24;
      const ribbon=[[fanTarget[0]+nx,fanTarget[1]+nz],[fanTarget[0]+dx*reach+nx,fanTarget[1]+dz*reach+nz],[fanTarget[0]+dx*reach-nx,fanTarget[1]+dz*reach-nz],[fanTarget[0]-nx,fanTarget[1]-nz]];
      for(const face of roofFaces){const t=face.map(i=>pts[i]),sign=Math.sign(cross(...t));let poly=ribbon;
        for(let i=0;i<3&&poly.length;i++)poly=clip(poly,t[i],t[(i+1)%3],sign);
        for(let i=1;i<poly.length-1;i++){let [a,b,c]=[poly[0],poly[i],poly[i+1]];if(Math.abs(cross(a,b,c))<.0001)continue;if(cross(a,b,c)>0)[b,c]=[c,b];triangle('roofSeam',[a[0],roofY+.025,a[1]],[b[0],roofY+.025,b[1]],[c[0],roofY+.025,c[1]]);}
      }
    }
    // Quiet pale rear/side walls cover the old generic brown block while
    // following each mapped edge; the entry elevation remains bespoke.
    const signedArea = pts.reduce((sum, point, i) => { const next = pts[(i + 1) % pts.length]; return sum + point[0] * next[1] - next[0] * point[1]; }, 0);
    for (const edge of edges) {
      if (edge === front || edge.len < 1) continue;
      const mx = (edge.a[0] + edge.b[0]) / 2, mz = (edge.a[1] + edge.b[1]) / 2;
      // Polygon winding gives the true outward side even for concave corners;
      // centroid direction can point inward on a re-entrant edge.
      const outwardX = Math.sign(signedArea)*(edge.b[1]-edge.a[1])/edge.len;
      const outwardZ = -Math.sign(signedArea)*(edge.b[0]-edge.a[0])/edge.len;
      const ax = edge.a[0] + outwardX * .06, az = edge.a[1] + outwardZ * .06;
      const bx = edge.b[0] + outwardX * .06, bz = edge.b[1] + outwardZ * .06;
      const panel=[[ax, .12, az], [bx, .12, bz], [bx, h, bz], [ax, h, az]];if(signedArea>0)panel.reverse();quad('rearWall',...panel);
      // These sides face the starting skatepark. Like the real building they
      // are windowless: plinth, dark fascia band and vertical panel seams.
      const tx = (edge.b[0] - edge.a[0]) / edge.len, tz = (edge.b[1] - edge.a[1]) / edge.len, angle = Math.atan2(-tz, tx);
      addBox(list, 'concrete', edge.len, .62, .08, mx + outwardX * .07, .43, mz + outwardZ * .07, angle);
      addBox(list, 'roof', edge.len + .1, .28, .3, mx + outwardX * .1, h - .06, mz + outwardZ * .1, angle);
      addBox(list, 'roof', edge.len + .04, .7, .06, mx + outwardX * .04, h - .55, mz + outwardZ * .04, angle);
      for (let t = -edge.len / 2 + 3; t < edge.len / 2 - 1; t += 3) addBox(list, 'roof', .07, h - .9, .04, mx + tx * t + outwardX * .03, .12 + (h - .9) / 2, mz + tz * t + outwardZ * .03, angle);
    }
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
      const uvs = parts.every((g) => g.getAttribute('uv'));
      const normalized = parts.map((g) => { const flat = g.index ? g.toNonIndexed() : g; const out = new T.BufferGeometry(); out.setAttribute('position', flat.getAttribute('position').clone()); if (uvs) out.setAttribute('uv', flat.getAttribute('uv').clone()); flat.dispose(); return out; });
      const geometry = mergeGeometries(normalized, false); normalized.forEach((g) => g.dispose()); parts.forEach((g) => g.dispose()); geometry.computeVertexNormals();
      const mesh = new T.Mesh(geometry, material(key)); mesh.name = `ResidentialCivic_${key}`; mesh.castShadow = mesh.receiveShadow = true; root.add(mesh); meshes.push(mesh);
    }
    root.updateMatrixWorld(true); scene.add(root); return root;
  };
  const dispose = () => { if (root) root.removeFromParent(); meshes.forEach((m) => m.geometry.dispose()); meshes.length = 0; materials.forEach((m) => { m.map?.dispose(); m.dispose(); }); materials.clear(); root = null; };
  return {attach, dispose};
}
