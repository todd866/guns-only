import * as T from '../../vendor/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';

// Small, instanced residential dressing. The input is anonymous local metres
// (`trees: [{kind:'tree', point:[x,z]}]`); no source identity reaches runtime.
export function prepareResidentialDetails(world, data = {}, options = {}) {
  const trees = (data.trees || []).filter(
    t => Array.isArray(t.point) && t.point.length === 2 && t.point.every(Number.isFinite)
  );
  let root = null,
    disposed = false;
  const meshes = [];
  const heightAt = options.terrain?.heightAt ?? (() => 0);

  const treeGeometry = () => {
    const trunkParts = [];
    const add = (geometry, position, quaternion = null, scale = [1, 1, 1], target = trunkParts) => {
      const g = geometry.clone();
      const matrix = new T.Matrix4();
      matrix.compose(new T.Vector3(...position), quaternion || new T.Quaternion(), new T.Vector3(...scale));
      g.applyMatrix4(matrix);
      target.push(g);
    };
    const trunk = new T.CylinderGeometry(0.16, 0.24, 3.7, 7);
    trunk.userData.canopy = false;
    add(trunk, [0, 1.85, 0]);
    const branch = new T.CylinderGeometry(0.06, 0.11, 1.85, 6);
    branch.userData.canopy = false;
    // Branches start below the crown so the irrigated street trees read as
    // planted shade trees rather than bare poles with a floating umbrella.
    const branchDirs = [
      [0.72, 0.78, 0.18],
      [-0.68, 0.82, 0.08],
      [0.12, 0.8, 0.78],
      [-0.14, 0.76, -0.72],
      [0.42, 0.64, -0.48],
      [-0.38, 0.68, 0.5]
    ];
    for (const [dx, dy, dz] of branchDirs) {
      const dir = new T.Vector3(dx, dy, dz).normalize();
      const q = new T.Quaternion().setFromUnitVectors(new T.Vector3(0, 1, 0), dir);
      add(branch, [dir.x * 0.68, 2.72 + dir.y * 0.7, dir.z * 0.68], q, [1, 0.92, 1]);
    }
    const makeCrown = (clusters, cardSize = [2.55, 2.05]) => {
      const parts = [],
        crown = new T.PlaneGeometry(...cardSize);
      const lower = [
        [[-0.6, 3.8, 0.12], 0.66, 0.8],
        [[0.55, 3.95, 0.4], 0.68, 0.8],
        [[0.05, 3.78, -0.55], 0.7, 0.8]
      ];
      for (const [i, [position, width, height, cards = 3]] of [...clusters, ...lower].entries())
        for (let j = 0; j < cards; j++) {
          const q = new T.Quaternion().setFromEuler(
            new T.Euler(
              (j === 2 ? -0.58 : 0.13) + (i % 2) * 0.08,
              (j * Math.PI) / cards + i * 0.63,
              ((i % 3) - 1) * 0.18
            )
          );
          add(crown, position, q, [width, height, 1], parts);
        }
      crown.dispose();
      const merged = mergeGeometries(parts, false);
      parts.forEach(part => part.dispose());
      merged.computeVertexNormals();
      merged.computeBoundingBox();
      merged.computeBoundingSphere();
      return merged;
    };
    // Three distinct silhouettes keep the same atlas and instance budget while
    // making the irrigated street canopy read as a planted neighbourhood.
    const canopies = [
      makeCrown([
        [[0, 5.45, 0], 1.08, 0.94],
        [[-0.9, 4.7, 0.05], 0.86, 0.86],
        [[0.88, 4.78, 0.18], 0.92, 0.9],
        [[-1.05, 4.18, -0.3], 0.6, 0.68],
        [[0.95, 4.22, 0.72], 0.62, 0.7],
        [[-0.3, 4.35, 0.76], 0.72, 0.74],
        [[0.22, 4.38, -0.78], 0.78, 0.78],
        [[-0.62, 5.35, -0.58], 0.88, 0.84],
        [[0.72, 5.38, 0.56], 0.9, 0.88],
        [[-0.05, 5.02, 0.3], 0.8, 0.82],
        [[-0.08, 6.08, -0.12], 0.58, 1.08]
      ]),
      makeCrown(
        [
          [[0, 5.95, 0], 0.78, 1.14],
          [[-0.52, 5.0, 0.12], 0.72, 0.9],
          [[0.58, 5.02, -0.08], 0.74, 0.92],
          [[-0.42, 4.42, 0.55], 0.54, 0.72],
          [[0.38, 4.48, -0.58], 0.56, 0.76],
          [[-0.15, 6.38, 0.08], 0.5, 0.92, 2]
        ],
        [2.2, 2.55]
      ),
      makeCrown(
        [
          [[-0.38, 5.42, 0], 1.0, 0.84],
          [[0.78, 4.92, 0.2], 0.94, 0.78],
          [[-1.0, 4.65, -0.18], 0.72, 0.7],
          [[-0.8, 4.08, 0.62], 0.5, 0.62],
          [[0.95, 4.22, -0.66], 0.62, 0.68],
          [[0.12, 5.98, -0.38], 0.56, 1.0],
          [[-0.12, 4.52, 0.9], 0.48, 0.65, 2]
        ],
        [2.9, 1.85]
      )
    ];
    trunk.dispose();
    branch.dispose();
    const trunkGeometry = mergeGeometries(trunkParts, false);
    trunkParts.forEach(part => part.dispose());
    trunkGeometry.computeVertexNormals();
    trunkGeometry.computeBoundingBox();
    trunkGeometry.computeBoundingSphere();
    return {trunk: trunkGeometry, canopies};
  };
  const geometry = treeGeometry();
  const crownHeight = Math.max(...geometry.canopies.map(canopy => canopy.boundingBox.max.y));
  const canopyColors = ['#ffffff', '#eff6d9', '#dce6c9'];
  const trunkMaterial = new T.MeshStandardMaterial({color: '#765842', roughness: 0.96});
  let crownMaterial = null;

  const attach = async scene => {
    if (disposed) throw new Error('Residential trees have been disposed');
    if (!scene?.add) throw new TypeError('prepareResidentialDetails.attach requires a scene');
    if (root) return root;
    root = new T.Group();
    root.name = 'ResidentialTreeDetails';
    if (!trees.length) {
      scene.add(root);
      return root;
    }
    const trunkMesh = new T.InstancedMesh(geometry.trunk, trunkMaterial, trees.length);
    trunkMesh.name = 'ResidentialTreeTrunks';
    trunkMesh.castShadow = trunkMesh.receiveShadow = true;
    const matrix = new T.Matrix4(),
      color = new T.Color();
    const transforms = trees.map((tree, i) => {
      const [x, z] = tree.point;
      const base = 1.4 + ((i * 37) % 19) / 30;
      const width = base * (0.9 + ((i * 17) % 13) / 100);
      const depth = base * (0.86 + ((i * 23) % 17) / 100);
      const height = 6 + ((i * 29) % 41) / 10;
      const yaw = (((i * 47) % 360) * Math.PI) / 180;
      return {
        position: new T.Vector3(x, heightAt(x, z), z),
        rotation: new T.Quaternion().setFromAxisAngle(new T.Vector3(0, 1, 0), yaw),
        scale: new T.Vector3(width, height / crownHeight, depth)
      };
    });
    trees.forEach((tree, i) => {
      const transform = transforms[i];
      matrix.compose(transform.position, transform.rotation, transform.scale);
      trunkMesh.setMatrixAt(i, matrix);
    });
    // One branched geometry/material keeps the canopy readable at toy scale;
    // colour variation is per-instance where supported by the renderer.
    trunkMesh.instanceMatrix.needsUpdate = true;
    if (trunkMesh.instanceColor) trunkMesh.instanceColor.needsUpdate = true;
    root.add(trunkMesh);
    meshes.push(trunkMesh);
    // Three crown meshes share one atlas/material. Each tree occupies exactly
    // one instance; absent variants never submit degenerate zero-scale geometry.
    const leaf = await new T.TextureLoader().loadAsync(
      new URL('../assets/foliage/deciduous-cluster.webp', import.meta.url).href
    );
    if (disposed) {
      leaf.dispose();
      return null;
    }
    leaf.colorSpace = T.SRGBColorSpace;
    leaf.anisotropy = 4;
    crownMaterial = new T.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.9,
      map: leaf,
      alphaTest: 0.45,
      side: T.DoubleSide
    });
    geometry.canopies.forEach((canopy, variant) => {
      const indices = trees.map((_, i) => i).filter(i => i % geometry.canopies.length === variant);
      const crownMesh = new T.InstancedMesh(canopy, crownMaterial, indices.length);
      crownMesh.name = `ResidentialTreeCanopy${variant + 1}`;
      crownMesh.castShadow = crownMesh.receiveShadow = true;
      indices.forEach((i, slot) => {
        const transform = transforms[i];
        matrix.compose(transform.position, transform.rotation, transform.scale);
        crownMesh.setMatrixAt(slot, matrix);
        color.set(canopyColors[Math.floor(i / 3) % canopyColors.length]);
        crownMesh.setColorAt?.(slot, color);
      });
      crownMesh.instanceMatrix.needsUpdate = true;
      if (crownMesh.instanceColor) crownMesh.instanceColor.needsUpdate = true;
      crownMesh.computeBoundingSphere();
      root.add(crownMesh);
      meshes.push(crownMesh);
    });
    scene.add(root);
    return root;
  };
  const dispose = () => {
    disposed = true;
    if (root) root.removeFromParent();
    for (const mesh of meshes) mesh.dispose?.();
    meshes.length = 0;
    geometry.trunk.dispose();
    geometry.canopies.forEach(canopy => canopy.dispose());
    trunkMaterial.dispose();
    crownMaterial?.map?.dispose();
    crownMaterial?.dispose();
    root = null;
  };
  return {attach, dispose};
}
