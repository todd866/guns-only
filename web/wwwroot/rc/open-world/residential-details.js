import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

// Small, instanced residential dressing. The input is anonymous local metres
// (`trees: [{kind:'tree', point:[x,z]}]`); no source identity reaches runtime.
export function prepareResidentialDetails(world, data = {}) {
  const trees = (data.trees || []).filter((t) => Array.isArray(t.point) && t.point.length === 2 && t.point.every(Number.isFinite));
  let root = null, disposed = false;
  const meshes = [];

  const treeGeometry = () => {
    const trunkParts = [], canopyParts = [];
    const add = (geometry, position, quaternion = null, scale = [1, 1, 1]) => {
      const g = geometry.clone();
      const matrix = new T.Matrix4();
      matrix.compose(new T.Vector3(...position), quaternion || new T.Quaternion(), new T.Vector3(...scale));
      g.applyMatrix4(matrix); (geometry.userData.canopy ? canopyParts : trunkParts).push(g);
    };
    const trunk = new T.CylinderGeometry(.16, .24, 3.7, 7); trunk.userData.canopy = false;
    add(trunk, [0, 1.85, 0]);
    const branch = new T.CylinderGeometry(.065, .11, 1.8, 6); branch.userData.canopy = false;
    const branchDirs = [[.7, .9, .15], [-.65, .95, .1], [.1, .95, .72], [-.1, .9, -.7]];
    for (const [dx, dy, dz] of branchDirs) {
      const dir = new T.Vector3(dx, dy, dz).normalize();
      const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir);
      add(branch, [dir.x * .72, 3.15 + dir.y * .72, dir.z * .72], q);
    }
    const crown=new T.PlaneGeometry(2.8,2.35);crown.userData.canopy=true;
    const clusters=[[0,5.8,0],[-1,4.8,0],[1,4.9,.2],[.1,4.7,1],[-.2,5,-1],[.8,5.8,-.5],[-.6,5.7,.7]];
    for(const [i,position]of clusters.entries())for(let j=0;j<3;j++){
      const q=new T.Quaternion().setFromEuler(new T.Euler((j===2?-.65:.15),j*Math.PI/3+i*.7,(i%3-1)*.16));add(crown,position,q);
    }
    trunk.dispose(); branch.dispose(); crown.dispose();
    const trunkGeometry = mergeGeometries(trunkParts, false), canopyGeometry = mergeGeometries(canopyParts, false);
    trunkParts.forEach((p) => p.dispose()); canopyParts.forEach((p) => p.dispose());
    trunkGeometry.computeVertexNormals(); canopyGeometry.computeVertexNormals(); return {trunk: trunkGeometry, canopy: canopyGeometry};
  };
  const geometry = treeGeometry();geometry.canopy.computeBoundingBox();const crownHeight=geometry.canopy.boundingBox.max.y;
  const canopyMaterials = ['#ffffff', '#eff6d9', '#dce6c9'].map((color) => new T.MeshStandardMaterial({color, roughness: .9}));
  const trunkMaterial = new T.MeshStandardMaterial({color: '#765842', roughness: .96});

  const attach = async (scene) => {
    if(disposed)throw new Error('Residential trees have been disposed');
    if (!scene?.add) throw new TypeError('prepareResidentialDetails.attach requires a scene');
    if (root) return root;
    root = new T.Group(); root.name = 'ResidentialTreeDetails';
    if (!trees.length) { scene.add(root); return root; }
    const trunkMesh = new T.InstancedMesh(geometry.trunk, trunkMaterial, trees.length); trunkMesh.name = 'ResidentialTreeTrunks';
    trunkMesh.castShadow = trunkMesh.receiveShadow = true;
    const matrix = new T.Matrix4(), color = new T.Color();
    trees.forEach((tree, i) => {
      const [x, z] = tree.point; const scale = 1.4 + ((i * 37) % 19) / 30; const height = 6 + ((i * 29) % 41) / 10;
      matrix.compose(new T.Vector3(x, 0, z), new T.Quaternion(), new T.Vector3(scale, height / crownHeight, scale)); trunkMesh.setMatrixAt(i, matrix);
    });
    // One branched geometry/material keeps the canopy readable at toy scale;
    // colour variation is per-instance where supported by the renderer.
    trunkMesh.instanceMatrix.needsUpdate = true; if (trunkMesh.instanceColor) trunkMesh.instanceColor.needsUpdate = true;
    root.add(trunkMesh); meshes.push(trunkMesh);
    // A separate crown pass allows subtle palette variation without multiplying
    // geometry or draw calls; the shared shape already includes trunk branches.
    const leaf=await new T.TextureLoader().loadAsync(new URL('../assets/foliage/deciduous-cluster.png',import.meta.url).href);if(disposed){leaf.dispose();return null;}leaf.colorSpace=T.SRGBColorSpace;leaf.anisotropy=4;
    const crownMaterial=new T.MeshStandardMaterial({color:0xffffff,roughness:.9,map:leaf,alphaTest:.45,side:T.DoubleSide});canopyMaterials.push(crownMaterial);
    const crownMesh = new T.InstancedMesh(geometry.canopy, crownMaterial, trees.length); crownMesh.name = 'ResidentialTreeCanopy'; crownMesh.castShadow = crownMesh.receiveShadow = true;
    trees.forEach((tree, i) => {
      const [x, z] = tree.point; const scale = 1.4 + ((i * 37) % 19) / 30; const height = 6 + ((i * 29) % 41) / 10;
      matrix.compose(new T.Vector3(x, 0, z), new T.Quaternion(), new T.Vector3(scale, height / crownHeight, scale)); crownMesh.setMatrixAt(i, matrix); color.set(canopyMaterials[i % 3].color); crownMesh.setColorAt?.(i, color);
    });
    crownMesh.instanceMatrix.needsUpdate = true; if (crownMesh.instanceColor) crownMesh.instanceColor.needsUpdate = true;
    root.add(crownMesh); meshes.push(crownMesh); scene.add(root); return root;
  };
  const dispose = () => {
    disposed=true;if (root) root.removeFromParent();for(const mesh of meshes)mesh.dispose?.(); meshes.length = 0; geometry.trunk.dispose(); geometry.canopy.dispose(); trunkMaterial.dispose(); canopyMaterials.forEach((m) => {m.map?.dispose();m.dispose();}); root = null;
  };
  return {attach, dispose};
}
