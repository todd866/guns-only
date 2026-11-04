import {MODEL_WHEEL_WIDTH, MODEL_HUB_WIDTH} from './vehicle-pose.mjs';
import {fetchAssetBuffer} from './asset-buffer.mjs';
import {GLTFLoader} from '../vendor/three/addons/loaders/GLTFLoader.js';
import {Box3} from '../vendor/three.module.js';
const loadModel = async url =>
  new GLTFLoader().parseAsync(await fetchAssetBuffer(url), new URL('.', new URL(url, document.baseURI)).href);
export async function loadBuggyAsset(url) {
  const gltf = await loadModel(url);
  const car = gltf.scene;
  const wheels = ['FL', 'FR', 'RL', 'RR'].map(name => {
    const pivot = car.getObjectByName('Steer_' + name),
      wheel = car.getObjectByName('Wheel_' + name);
    if (!pivot || !wheel) throw Error(`Invalid RC asset: missing ${name} wheel pivots`);
    // The authored hubs span beyond both sidewalls. Fit them inside the tyre before posing.
    wheel.traverse(node => {
      if (!node.isMesh || node.name.endsWith('_rubber')) return;
      node.updateMatrix();
      node.geometry = node.geometry.clone();
      node.geometry.applyMatrix4(node.matrix);
      const p = node.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) p.setX(i, (p.getX(i) * MODEL_WHEEL_WIDTH) / MODEL_HUB_WIDTH);
      node.geometry.computeVertexNormals();
      node.geometry.computeBoundingBox();
      node.geometry.computeBoundingSphere();
      node.position.set(0, 0, 0);
      node.quaternion.identity();
      node.scale.setScalar(1);
    });
    return {pivot, wheel, front: name.startsWith('F')};
  });
  const body = car.getObjectByName('Body');
  if (body) {
    for (const node of body.children) {
      if (['Mesh_Body_shell', 'Mesh_Body_ivory', 'Mesh_Body_graphite', 'RakedCanopy'].includes(node.name)) {
        node.scale.z *= 0.81;
        node.position.z *= 0.81;
      }
    }
  }
  const collision = [];
  car.updateMatrixWorld(true);
  car.traverse(node => {
    if (node.name.startsWith('COLLISION_') || node.userData.collision_proxy) {
      collision.push({name: node.name, bounds: new Box3().setFromObject(node)});
      node.visible = false;
    } else if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  return {car, wheels, collision};
}

// Prepared for the reviewed hangar replacement; no scene/course mutation until callers
// have loaded the complete asset set. Proxies use the exact placement of the visuals.
export async function loadHangarAsset(url, position = {x: 38, y: 0.04, z: -8}) {
  const {proxySolid} = await import('./asset-collision.mjs');
  const gltf = await loadModel(url),
    hangar = gltf.scene;
  for (const name of [
    'Hangar_Root',
    'Floor',
    'Truss_00',
    'Workbench',
    'Toolbox',
    'COLLISION_workbench',
    'COLLISION_toolbox'
  ])
    if (!hangar.getObjectByName(name)) throw Error(`Invalid hangar asset: missing ${name}`);
  hangar.position.set(position.x, position.y, position.z);
  hangar.updateMatrixWorld(true);
  const collision = [];
  hangar.traverse(node => {
    if (node.name.startsWith('COLLISION_') || node.userData.collision_proxy) {
      collision.push(proxySolid(node.name, new Box3().setFromObject(node)));
      node.visible = false;
    } else if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  return {hangar, collision};
}

export async function loadStaticAsset(url, rootName) {
  const {scene} = await loadModel(url);
  if (!scene.getObjectByName(rootName)) throw Error(`Invalid base asset: missing ${rootName}`);
  scene.traverse(node => {
    if (node.isMesh) {
      node.castShadow = true;
      node.receiveShadow = true;
    }
  });
  return scene;
}
