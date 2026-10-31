import * as T from '../../vendor/three.module.js';
import {DELIVERY, createDeliveries, startDeliveries, stepDeliveries, stopDeliveries} from './deliveries.mjs';

// Prepare the whole job's art once: the next parcel and marker never need a download.
export function createDeliveryVisual(scene, stops, {heightAt = () => 0, routeTo} = {}) {
  const state = createDeliveries(stops, {routeTo}),
    root = new T.Group(),
    keep = [],
    K = resource => (keep.push(resource), resource),
    cube = K(new T.BoxGeometry(1, 1, 1)),
    cardboard = K(new T.MeshStandardMaterial({color: '#c99150', roughness: 0.9})),
    tape = K(new T.MeshStandardMaterial({color: '#f9df9c', roughness: 0.8})),
    wood = K(new T.MeshStandardMaterial({color: '#79664b', roughness: 0.9})),
    gold = K(new T.MeshBasicMaterial({color: '#ffd064', fog: false})),
    green = K(new T.MeshBasicMaterial({color: '#8bf5a5', fog: false}));
  root.name = 'Deliveries';
  function block(parent, material, pos, size) {
    const mesh = new T.Mesh(cube, material);
    mesh.position.set(...pos);
    mesh.scale.set(...size);
    parent.add(mesh);
    return mesh;
  }
  function parcel(parent, pos, size) {
    const group = new T.Group();
    group.position.set(...pos);
    group.scale.set(...size);
    block(group, cardboard, [0, 0.5, 0], [1, 1, 1]);
    block(group, tape, [0, 0.505, 0], [0.17, 1.02, 1.02]);
    parent.add(group);
    return group;
  }
  const dock = new T.Group(),
    [x, , z] = DELIVERY.pickup;
  dock.position.set(x, heightAt(x, z), z);
  // The stack and sign sit beside the arrival ring, leaving the driving surface clear.
  block(dock, wood, [-4.6, 0.08, 0], [2.4, 0.16, 2]);
  parcel(dock, [-5.1, 0.16, -0.4], [0.9, 0.8, 0.9]);
  parcel(dock, [-4.1, 0.16, 0.3], [0.9, 0.7, 0.9]);
  parcel(dock, [-4.8, 0.96, -0.3], [0.7, 0.65, 0.7]);
  block(dock, wood, [-4.6, 1.4, -1.2], [0.12, 2.8, 0.12]);
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#203d49';
  ctx.fillRect(0, 0, 512, 160);
  ctx.fillStyle = '#ffe3a0';
  ctx.font = 'bold 65px system-ui';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('Deliveries', 256, 80);
  const texture = K(new T.CanvasTexture(canvas));
  texture.colorSpace = T.SRGBColorSpace;
  const sign = new T.Sprite(K(new T.SpriteMaterial({map: texture})));
  sign.position.set(-4.6, 2.8, -1.2);
  sign.scale.set(4.2, 1.3, 1);
  dock.add(sign);
  const ringGeometry = K(new T.TorusGeometry(DELIVERY.ringRadius, 0.1, 6, 64)),
    pickupRing = new T.Mesh(ringGeometry, gold),
    dropRing = new T.Mesh(ringGeometry, green),
    arrow = new T.Group(),
    tip = new T.Mesh(K(new T.ConeGeometry(0.9, 1.8, 4)), green);
  pickupRing.rotation.x = dropRing.rotation.x = -Math.PI / 2;
  pickupRing.position.y = 0.13;
  dock.add(pickupRing);
  tip.rotation.z = Math.PI;
  arrow.add(tip);
  block(arrow, green, [0, 1.35, 0], [0.5, 1.5, 0.5]);
  root.add(dock, dropRing, arrow);
  // Follow the car as a separate scene object so garage batching cannot freeze its wobble.
  const cargo = new T.Group(),
    box = parcel(cargo, [0, 0.22, 0.25], [0.27, 0.22, 0.18]);
  cargo.name = 'Delivery parcel';
  root.add(cargo);
  scene.add(root);
  let clock = 0;
  return {
    state,
    start: driver => startDeliveries(state, driver),
    stop: () => stopDeliveries(state),
    step: (dt, driver) => stepDeliveries(state, driver, dt),
    draw(dt, car, {present = true, driving = false} = {}) {
      clock += dt;
      root.visible = present;
      pickupRing.visible = !state.active;
      dropRing.visible = arrow.visible = !!(state.active && !state.paused && state.destination);
      if (dropRing.visible) {
        const [dx, , dz] = state.destination.pos,
          y = heightAt(dx, dz);
        dropRing.position.set(dx, y + 0.14, dz);
        arrow.position.set(dx, y + 4.8 + Math.sin(clock * 3) * 0.35, dz);
        arrow.rotation.y = clock * 0.7;
      }
      cargo.visible = state.active && driving;
      if (cargo.visible) {
        cargo.position.copy(car.position);
        cargo.quaternion.copy(car.quaternion);
        cargo.scale.copy(car.scale);
        box.scale.y = state.squashed ? 0.12 : 0.22;
        box.rotation.z = Math.sin(clock * 25) * Math.min(1, state.wobble) * 0.25;
        box.rotation.x = Math.cos(clock * 21) * Math.min(1, state.wobble) * 0.12;
      }
    },
    dispose() {
      root.removeFromParent();
      keep.forEach(resource => resource.dispose());
    }
  };
}
