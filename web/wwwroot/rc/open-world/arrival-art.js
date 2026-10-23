import {orientArrival} from './arrival-frame.mjs';
import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

// Decorative arrival dressing only.  It deliberately accepts no world/collision
// object: every prop is visual and the approach lane remains game geometry's job.
export function buildArrivalArt(scene) {
  const source = new T.Group();
  const materials = new Map();
  const material = (color) => {
    if (!materials.has(color)) materials.set(color, new T.MeshStandardMaterial({color, roughness: .82, metalness: 0}));
    return materials.get(color);
  };
  const add = (geometry, color, x, y, z, rx = 0, ry = 0, rz = 0) => {
    const mesh = new T.Mesh(geometry, material(color));
    mesh.position.set(x, y, z); mesh.rotation.set(rx, ry, rz); source.add(mesh); return mesh;
  };
  const box = (x, y, z, w, h, d, color) => add(new T.BoxGeometry(w, h, d), color, x, y, z);
  const cyl = (x, y, z, r, h, color, sides = 10) => add(new T.CylinderGeometry(r, r * 1.08, h, sides), color, x, y, z);
  const rock = (x, y, z, s, color = '#897761') => {
    const m = add(new T.DodecahedronGeometry(s, 0), color, x, y, z);
    m.scale.set(1.25, .62, .86); m.rotation.y = (x * 3 + z) % 2; return m;
  };

  // Nellis-inspired material language: warm stucco, dark masonry plinths,
  // deep shade and hip roofs. Repeated small components read as buildings at
  // toy-car scale without turning the gate into a wall of cubes.
  const hipRoof = (x, y, z, w, d, color = '#8e6352') => {
    const geometry=new T.BoxGeometry(w,.55,d),p=geometry.attributes.position;
    for(let i=0;i<p.count;i++)if(p.getY(i)>0)p.setXYZ(i,p.getX(i)*.76,p.getY(i),p.getZ(i)*.60);
    geometry.computeVertexNormals();return add(geometry,color,x,y,z);
  };
  const gateWing = (x, z, w, d, accent = '#b66d50') => {
    box(x, .92, z, w, 1.82, d, '#c49a78');
    box(x, .24, z - d * .51, w + .18, .30, .22, '#715d56');
    box(x, 1.83, z, w + .38, .14, d + .3, '#e0c49d');
    hipRoof(x, 2.15, z, w + .5, d + .45);
    // The lane-facing (inner) side is the readable elevation from spawn.
    const inner = x < -607 ? x + w * .515 : x - w * .515;
    box(inner, 1.03, z - d * .08, .06, 1.22, d * .56, '#355861');
    box(inner + (x < -607 ? .04 : -.04), 1.72, z - d * .08, .18, .10, d * .68, accent);
    for (const dz of [-d * .30, 0, d * .30]) {
      cyl(inner, 1.02, z + dz, .10, 1.65, '#8a6a56', 8);
    }
    // Keep a smaller, sunlit frontage visible beyond the inner elevation.
    box(x, 1.12, z + d * .515, w * .70, .62, .05, '#355861');
    box(x, 1.53, z + d * .55, w * .80, .10, .46, accent);
  };
  const ovalBed = (x, z, rx, rz, color = '#a36d4d') => {
    const curb = add(new T.CylinderGeometry(1, 1, .16, 24), '#837568', x, .14, z);
    curb.scale.set(rx, 1, rz);
    const mulch = add(new T.CylinderGeometry(1, 1, .08, 24), color, x, .24, z);
    mulch.scale.set(rx - .24, 1, rz - .24);
    for (let i = 0; i < 5; i++) {
      const a = i * Math.PI * 2 / 5 + .25;
      rock(x + Math.cos(a) * rx * .65, .42, z + Math.sin(a) * rz * .65, .22, '#8f7860');
    }
  };

  // Paved shoulders and low curbs frame the approach from spawn (-607,-23) to the gate.
  for (const side of [-1, 1]) {
    const x = -607 + side * 15;
    box(x, .045, -37, 4.1, .09, 31, '#b9b09e');
    box(x, .11, -52.5, 4.45, .22, 31.5, '#817a70');
    for (let z = -25; z >= -65; z -= 5) box(x, .105, z, 3.85, .018, .08, '#d2c6ae');
  }

  // A low, open security canopy gives the threshold a real-base silhouette without
  // turning the arrival lane into an arch or a collision gate.  Its stepped fascia,
  // warm underside and repeated soffit ribs borrow the layered entrance proportions
  // in the Nellis facility-standard photos while staying chunky at toy-car scale.
  for (const x of [-615.5, -598.5]) {
    box(x, 2.15, -35.5, .34, 4.3, .34, '#536468');
    box(x, 3.45, -35.5, .42, .12, .46, '#d8b45f');
    box(x, .82, -35.5, .62, .16, .62, '#746a5d');
  }
  // A shallow hip roof reads as a building canopy from the low camera instead
  // of the old unbroken rectangular slab. The eave stays high and open over
  // the lane, with a warm soffit and restrained ribs underneath.
  // One clean, shallow cap keeps the gate legible without the old floating
  // blades or an oversized roof slab.
  box(-607, 4.32, -35.5, 17.8, .22, 2.6, '#59696a');
  box(-607, 4.06, -35.5, 15.4, .12, .38, '#c9b58f');
  box(-607, 4.44, -35.5, 18.2, .16, .24, '#536468');
  for (const z of [-36.1, -35.5, -34.9]) box(-607, 4.45, z, 15.0, .08, .12, '#78817a');
  for (let x = -613.5; x <= -600.5; x += 3.5) box(x, 4.56, -35.5, .10, .06, .28, '#c9b58f');

  // A modest stone monument sits on the left shoulder, echoing Nellis's low roadside
  // welcome signs and leaving the central driving corridor visually and physically open.
  box(-635.5, 1.18, -28.8, 6.2, 2.35, 1.1, '#897761');
  box(-635.5, 1.12, -28.18, 5.25, 1.65, .08, '#c5a76c');
  box(-635.5, 2.52, -28.8, 6.65, .20, 1.22, '#d0b77f');
  box(-635.5, .22, -28.8, 7.2, .22, 1.45, '#817464');
  // A small geometric roundel gives the sign a Nellis-style focal mark without text.
  add(new T.CylinderGeometry(.48, .48, .06, 16), '#3e5658', -635.5, 1.62, -28.10, Math.PI / 2, 0, 0);
  add(new T.CylinderGeometry(.24, .24, .075, 12), '#dfbd70', -635.5, 1.62, -28.05, Math.PI / 2, 0, 0);
  for (const x of [-638.4, -632.6]) box(x, .74, -29.38, .18, .68, .14, '#dfbd70');

  // Two planted islands sit outside the driving envelope, with deliberately readable curbs.
  for (const [x, z, w, d] of [[-643, -43, 13, 19], [-551, -42, 12, 17], [-644, -76, 15, 10]]) {
    box(x, .16, z, w, .32, d, '#8f806e');
    box(x, .35, z, w - 1.0, .12, d - 1.0, '#c29a62');
    for (const dx of [-w * .32, 0, w * .32]) for (const dz of [-d * .28, d * .28]) rock(x + dx, .55, z + dz, .32);
  }

  // Low facility wings and landscaped setbacks frame the threshold. They sit
  // outside the ten-metre arrival road (x -612…-602) and are visual-only.
  gateWing(-625, -47, 8.5, 6.2, '#d49d55');
  gateWing(-589, -48, 7.8, 6.2, '#c27d65');
  ovalBed(-625, -41.5, 4.7, 2.0, '#9c694d');
  ovalBed(-589, -42.2, 4.1, 1.8, '#9c694d');

  // A small sign panel carries the blue/gold/red Nellis palette as a graphic
  // shape, giving the entrance a focal point before the first race.
  add(new T.BoxGeometry(4.6, 1.45, .08), '#dcc49e', -635.5, 1.65, -28.00);
  add(new T.BoxGeometry(4.15, .08, .09), '#315b79', -635.5, 1.22, -27.95);
  add(new T.TorusGeometry(.34, .08, 8, 16), '#e7b83e', -635.5, 1.72, -27.92, Math.PI / 2, 0, 0);
  add(new T.CylinderGeometry(.14, .14, .07, 12), '#d85e45', -635.5, 1.72, -27.90, Math.PI / 2, 0, 0);
  for (const [dx, dy, s] of [[-1.45, 1.48, .55], [-.62, 1.55, .8], [.28, 1.48, 1.0], [1.1, 1.56, .7]]) {
    const peak = add(new T.ConeGeometry(.42, .9, 3), '#d46649', -635.5 + dx, dy, -27.88, 0, Math.PI / 2, 0);
    peak.scale.set(s, s, .38);
  }

  // Match the existing 5 × 4 m, 3.4 m-high booth rather than adding a roof
  // halfway through its walls. Deep frames read clearly from a toy-car viewpoint.
  box(-582, 3.38, -69, 5.3, .18, 4.3, '#c5a76c');
  box(-582, 3.68, -69, 5.6, .10, 4.6, '#78817a');
  for(const x of [-583.55,-582,-580.45])box(x,2,-66.90,.10,1.48,.10,'#d3ae62');
  for(const y of [1.30,2.70])box(-582,y,-66.90,3.20,.10,.16,'#d3ae62');
  box(-582,1.22,-66.83,3.35,.10,.36,'#897761');
  box(-582,1.1,-71.04,1.1,2.2,.06,'#536468');
  box(-582,1.65,-71.08,.82,.8,.04,'#2e4a53');
  for(const x of [-582.62,-581.38])box(x,1.15,-71.10,.10,2.30,.12,'#d3ae62');
  box(-582,2.33,-71.10,1.34,.12,.12,'#d3ae62');
  box(-581.62,1.05,-71.14,.08,.18,.08,'#dfbd70');
  for (const x of [-585.8, -578.2]) { cyl(x, .65, -72.2, .16, 1.3, '#d3ae62', 8); box(x, 1.3, -72.2, .28, .08, .28, '#efe0ad'); }

  const palm = (x, z, scale = 1) => {
    // Bent tapered trunk and feathered, arching fronds: readable from toy height.
    const trunkCurve=new T.CatmullRomCurve3([new T.Vector3(x,0,z),new T.Vector3(x-.18*scale,2.5*scale,z),new T.Vector3(x+.15*scale,4.8*scale,z)]);
    add(new T.TubeGeometry(trunkCurve,12,.19*scale,9,false),'#815c3e',0,0,0);
    for(let j=0;j<15;j++)cyl(x-.08*scale, (.3+j*.29)*scale,z,.205*scale,.035*scale,'#a38153',9);
    const top=new T.Vector3(x+.15*scale,4.8*scale,z);
    const crown=add(new T.SphereGeometry(.32*scale,10,6),'#657641',...top.toArray());crown.scale.y=1.5;
    for(let i=0;i<11;i++){
      const a=i*Math.PI*2/11,rad=new T.Vector3(Math.cos(a),0,Math.sin(a)),side=new T.Vector3(-Math.sin(a),0,Math.cos(a)),length=(2.5+(i%3)*.35)*scale;
      const curve=new T.CatmullRomCurve3([top,top.clone().addScaledVector(rad,length*.35).add(new T.Vector3(0,.65*scale,0)),top.clone().addScaledVector(rad,length*.72).add(new T.Vector3(0,.35*scale,0)),top.clone().addScaledVector(rad,length).add(new T.Vector3(0,-.7*scale,0))]);
      add(new T.TubeGeometry(curve,10,.025*scale,4,false),'#778a43',0,0,0);
      const vertices=[];
      for(let k=1;k<15;k++)for(const sign of [-1,1]){
        const t=k/15,p=curve.getPoint(t),width=Math.sin(t*Math.PI)*.48*scale;
        const tip=p.clone().addScaledVector(side,width*sign).addScaledVector(rad,-.18*scale);tip.y-=.17*scale;
        const back=p.clone().addScaledVector(rad,-.17*scale);
        vertices.push(...p.toArray(),...tip.toArray(),...back.toArray(),...back.toArray(),...tip.toArray(),...p.toArray());
      }
      const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geo.computeVertexNormals();add(geo,i%3?'#497541':'#659344',0,0,0);
    }
  };
  palm(-646, -42, 1.05); palm(-552, -42, .88); palm(-647, -76, .8);
  // The first thing a new driver sees is a planted threshold, not an empty
  // apron: compact palms sit on the shoulders just beyond the spawn line.
  ovalBed(-616, -31, 3.5, 1.55, '#9c694d');
  ovalBed(-598, -31, 3.3, 1.45, '#9c694d');
  palm(-616, -43, .88); palm(-598, -43, .84);

  // Mesquite-like shade trees break up the empty apron and soften the roofline.
  const shadeTree = (x, z, s = 1) => {
    const trunk = cyl(x, 1.25 * s, z, .18 * s, 2.5 * s, '#6f573f', 8);
    trunk.rotation.z = -.08;
    for (const [dx, dy, dz, sx] of [[0, 2.55, 0, 1], [-.55, 2.38, .08, .72], [.5, 2.45, -.12, .82], [0, 2.75, .18, .8]]) {
      const crown = add(new T.DodecahedronGeometry(.68 * s, 1), '#6b8753', x + dx * s, dy * s, z + dz * s);
      crown.scale.set(1.35 * sx, .55 * sx, .85 * sx);
    }
  };
  shadeTree(-620, -56, .9); shadeTree(-595, -57, .82);

  // Streetlights and bollards create the human-scale rhythm visible in the
  // standards plates, while the slim footprint keeps the drive path open.
  for (const [x, z] of [[-617, -29], [-597, -29], [-617, -56], [-597, -56]]) {
    cyl(x, 2.3, z, .055, 4.6, '#59666a', 8);
    const arm = cyl(x + (x < -607 ? .34 : -.34), 4.58, z, .04, .7, '#59666a', 8);
    arm.rotation.z = Math.PI / 2;
    add(new T.SphereGeometry(.10, 8, 5), '#f3d98b', x + (x < -607 ? .62 : -.62), 4.58, z);
  }

  const agave = (x, z, s = 1) => {
    cyl(x, .62 * s, z, .35 * s, .22 * s, '#557650', 9);
    for (let i = 0; i < 9; i++) {
      const a = i * Math.PI * 2 / 9;
      const leaf = add(new T.ConeGeometry(.17 * s, 1.35 * s, 4), '#66885b', x + Math.cos(a) * .34 * s, .9 * s, z + Math.sin(a) * .34 * s, Math.sin(a) * 1.05, 0, -Math.cos(a) * 1.05);
      leaf.scale.y = .8;
    }
  };
  agave(-616, -33, 1.2); agave(-598, -33, 1.1);
  agave(-639, -48, 1.15); agave(-557, -37, .95); agave(-639, -78, .82);
  for (const [x, z, s] of [[-648, -51, .42], [-635, -39, .3], [-557, -47, .34], [-650, -72, .28], [-574, -44, .24]]) rock(x, s * .55, z, s);

  // Small visual lane markers and tile seams make the threshold legible without adding collision.
  for (const x of [-627, -619, -595, -587]) box(x, .24, -52.5, .18, .08, 1.8, '#d9bd7f');
  for (let z = -28; z >= -48; z -= 4) box(-607, .055, z, 7.8, .012, .06, '#d7c8ab');

  source.updateMatrixWorld(true);
  const groups = new Map();
  source.traverse((object) => {
    if (!object.isMesh) return;
    let geometry = object.geometry.clone();
    if (geometry.index) { const indexed = geometry; geometry = geometry.toNonIndexed(); indexed.dispose(); }
    geometry.applyMatrix4(object.matrixWorld);
    for (const name of Object.keys(geometry.attributes)) if (name !== 'position' && name !== 'normal') geometry.deleteAttribute(name);
    const key = object.material.color.getHexString();
    if (!groups.has(key)) groups.set(key, []); groups.get(key).push(geometry);
  });
  const root = new T.Group(); root.name = 'ArrivalStreetArt';
  const meshes = [];
  for (const [key, geometries] of groups) {
    const geometry = mergeGeometries(geometries, false); geometries.forEach((g) => g.dispose());
    const mesh = new T.Mesh(geometry, new T.MeshStandardMaterial({color: `#${key}`, roughness: .82}));
    mesh.name = `arrival-${key}`; mesh.castShadow=true;mesh.receiveShadow=true;root.add(mesh); meshes.push(mesh);
  }
  source.traverse((object) => object.geometry?.dispose());
  materials.forEach((m) => m.dispose());
  orientArrival(root);scene.add(root);
  return {
    root,
    dispose() { root.removeFromParent(); for (const mesh of meshes) { mesh.geometry.dispose(); mesh.material.dispose(); } },
  };
}

