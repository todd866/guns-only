import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

// Small, instanced residential dressing. The input is anonymous local metres
// (`trees: [{kind:'tree', point:[x,z]}]`); no source identity reaches runtime.
export function prepareResidentialDetails(world, data = {}, options = {}) {
  const trees = (data.trees || []).filter((t) => Array.isArray(t.point) && t.point.length === 2 && t.point.every(Number.isFinite));
  let root = null, disposed = false;
  const meshes = [];
  const heightAt = options.terrain?.heightAt ?? (() => 0);

  const treeGeometry = () => {
    const trunkParts = [];
    const add = (geometry, position, quaternion = null, scale = [1, 1, 1], target = trunkParts) => {
      const g = geometry.clone();
      const matrix = new T.Matrix4();
      matrix.compose(new T.Vector3(...position), quaternion || new T.Quaternion(), new T.Vector3(...scale));
      g.applyMatrix4(matrix); target.push(g);
    };
    const trunk = new T.CylinderGeometry(.16, .24, 3.7, 7); trunk.userData.canopy = false;
    add(trunk, [0, 1.85, 0]);
    const branch = new T.CylinderGeometry(.06, .11, 1.85, 6); branch.userData.canopy = false;
    // Branches start below the crown so the irrigated street trees read as
    // planted shade trees rather than bare poles with a floating umbrella.
    const branchDirs = [[.72, .78, .18], [-.68, .82, .08], [.12, .8, .78], [-.14, .76, -.72], [.42, .64, -.48], [-.38, .68, .5]];
    for (const [dx, dy, dz] of branchDirs) {
      const dir = new T.Vector3(dx, dy, dz).normalize();
      const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir);
      add(branch, [dir.x * .68, 2.72 + dir.y * .7, dir.z * .68], q, [1, .92, 1]);
    }
    const makeCrown = (clusters, cardSize = [2.55, 2.05]) => {
      const parts = [], crown = new T.PlaneGeometry(...cardSize);
      const lower=[[[ -.6,3.8,.12],.66,.8],[[.55,3.95,.4],.68,.8],[[.05,3.78,-.55],.7,.8]];
      for (const [i, [position, width, height, cards = 3]] of [...clusters,...lower].entries()) for (let j = 0; j < cards; j++) {
        const q = new T.Quaternion().setFromEuler(new T.Euler((j === 2 ? -.58 : .13) + (i % 2) * .08, j * Math.PI / cards + i * .63, (i % 3 - 1) * .18));
        add(crown, position, q, [width, height, 1], parts);
      }
      crown.dispose();
      const merged = mergeGeometries(parts, false);
      parts.forEach((part) => part.dispose());
      merged.computeVertexNormals(); merged.computeBoundingBox(); merged.computeBoundingSphere();
      return merged;
    };
    // Three distinct silhouettes keep the same atlas and instance budget while
    // making the irrigated street canopy read as a planted neighbourhood.
    const canopies = [
      makeCrown([
        [[0, 5.45, 0], 1.08, .94], [[-.9, 4.7, .05], .86, .86], [[.88, 4.78, .18], .92, .9],
        [[-1.05, 4.18, -.3], .6, .68], [[.95, 4.22, .72], .62, .7], [[-.3, 4.35, .76], .72, .74],
        [[.22, 4.38, -.78], .78, .78], [[-.62, 5.35, -.58], .88, .84], [[.72, 5.38, .56], .9, .88],
        [[-.05, 5.02, .3], .8, .82], [[-.08, 6.08, -.12], .58, 1.08]
      ]),
      makeCrown([
        [[0, 5.95, 0], .78, 1.14], [[-.52, 5.0, .12], .72, .9], [[.58, 5.02, -.08], .74, .92],
        [[-.42, 4.42, .55], .54, .72], [[.38, 4.48, -.58], .56, .76], [[-.15, 6.38, .08], .5, .92, 2]
      ], [2.2, 2.55]),
      makeCrown([
        [[-.38, 5.42, 0], 1.0, .84], [[.78, 4.92, .2], .94, .78], [[-1.0, 4.65, -.18], .72, .7],
        [[-.8, 4.08, .62], .5, .62], [[.95, 4.22, -.66], .62, .68], [[.12, 5.98, -.38], .56, 1.0],
        [[-.12, 4.52, .9], .48, .65, 2]
      ], [2.9, 1.85]),
    ];
    trunk.dispose(); branch.dispose();
    const trunkGeometry = mergeGeometries(trunkParts, false);
    trunkParts.forEach((part) => part.dispose());
    trunkGeometry.computeVertexNormals(); trunkGeometry.computeBoundingBox(); trunkGeometry.computeBoundingSphere();
    return {trunk: trunkGeometry, canopies};
  };
  const geometry = treeGeometry();
  const crownHeight = Math.max(...geometry.canopies.map((canopy) => canopy.boundingBox.max.y));
  const canopyColors = ['#ffffff', '#eff6d9', '#dce6c9'];
  const trunkMaterial = new T.MeshStandardMaterial({color: '#765842', roughness: .96});
  let crownMaterial = null;

  const attach = async (scene) => {
    if(disposed)throw new Error('Residential trees have been disposed');
    if (!scene?.add) throw new TypeError('prepareResidentialDetails.attach requires a scene');
    if (root) return root;
    root = new T.Group(); root.name = 'ResidentialTreeDetails';
    if (!trees.length) { scene.add(root); return root; }
    const trunkMesh = new T.InstancedMesh(geometry.trunk, trunkMaterial, trees.length); trunkMesh.name = 'ResidentialTreeTrunks';
    trunkMesh.castShadow = trunkMesh.receiveShadow = true;
    const matrix = new T.Matrix4(), color = new T.Color();
    const transforms = trees.map((tree, i) => {
      const [x, z] = tree.point;
      const base = 1.4 + ((i * 37) % 19) / 30;
      const width = base * (.9 + ((i * 17) % 13) / 100);
      const depth = base * (.86 + ((i * 23) % 17) / 100);
      const height = 6 + ((i * 29) % 41) / 10;
      const yaw = ((i * 47) % 360) * Math.PI / 180;
      return {
        position: new T.Vector3(x, heightAt(x, z), z),
        rotation: new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw),
        scale: new T.Vector3(width, height / crownHeight, depth),
      };
    });
    trees.forEach((tree, i) => {
      const transform = transforms[i];
      matrix.compose(transform.position, transform.rotation, transform.scale); trunkMesh.setMatrixAt(i, matrix);
    });
    // One branched geometry/material keeps the canopy readable at toy scale;
    // colour variation is per-instance where supported by the renderer.
    trunkMesh.instanceMatrix.needsUpdate = true; if (trunkMesh.instanceColor) trunkMesh.instanceColor.needsUpdate = true;
    root.add(trunkMesh); meshes.push(trunkMesh);
    // Three crown meshes share one atlas/material. Each tree occupies exactly
    // one instance; absent variants never submit degenerate zero-scale geometry.
    const leaf=await new T.TextureLoader().loadAsync(new URL('../assets/foliage/deciduous-cluster.webp',import.meta.url).href);if(disposed){leaf.dispose();return null;}leaf.colorSpace=T.SRGBColorSpace;leaf.anisotropy=4;
    crownMaterial=new T.MeshStandardMaterial({color:0xffffff,roughness:.9,map:leaf,alphaTest:.45,side:T.DoubleSide});
    geometry.canopies.forEach((canopy, variant) => {
      const indices=trees.map((_,i)=>i).filter(i=>i%geometry.canopies.length===variant);
      const crownMesh = new T.InstancedMesh(canopy, crownMaterial, indices.length); crownMesh.name = `ResidentialTreeCanopy${variant + 1}`; crownMesh.castShadow = crownMesh.receiveShadow = true;
      indices.forEach((i,slot) => {
        const transform = transforms[i];
        matrix.compose(transform.position, transform.rotation, transform.scale); crownMesh.setMatrixAt(slot, matrix); color.set(canopyColors[Math.floor(i/3) % canopyColors.length]); crownMesh.setColorAt?.(slot, color);
      });
      crownMesh.instanceMatrix.needsUpdate = true; if (crownMesh.instanceColor) crownMesh.instanceColor.needsUpdate = true;
      crownMesh.computeBoundingSphere(); root.add(crownMesh); meshes.push(crownMesh);
    });
    scene.add(root); return root;
  };
  const dispose = () => {
    disposed=true;if (root) root.removeFromParent();for(const mesh of meshes)mesh.dispose?.(); meshes.length = 0; geometry.trunk.dispose(); geometry.canopies.forEach((canopy) => canopy.dispose()); trunkMaterial.dispose(); crownMaterial?.map?.dispose(); crownMaterial?.dispose(); root = null;
  };
  return {attach, dispose};
}
