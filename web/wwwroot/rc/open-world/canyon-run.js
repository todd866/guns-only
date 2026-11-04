import * as T from '../../vendor/three.module.js';
import {CANYON_RUN, createCanyonRun, canyonGates, stopCanyonRun, stepCanyonRun} from './canyon-run.mjs';

export function createCanyonRunVisual(scene, heightAt = () => 0, options = {}) {
  const root = new T.Group();
  root.name = 'Canyon Run';
  root.visible = false;
  const state = createCanyonRun({heightAt, mode: options.mode ?? 'kid', best: options.best ?? null});
  const geometry = new T.TorusGeometry(1, 0.055, 8, 48);
  const material = new T.MeshBasicMaterial({color: '#ffffff', fog: false});
  const gates = new T.InstancedMesh(geometry, material, CANYON_RUN.total);
  const dummy = new T.Object3D(),
    normal = new T.Vector3(),
    zAxis = new T.Vector3(0, 0, 1);
  const gold = new T.Color('#ffd75a'),
    dim = new T.Color('#97702e');
  gates.instanceMatrix.setUsage(T.DynamicDrawUsage);
  gates.frustumCulled = false;
  root.add(gates);
  scene.add(root);
  function draw() {
    for (let i = 0; i < state.gates.length; i++) {
      const gate = state.gates[i];
      dummy.position.set(gate.x, gate.y, gate.z);
      dummy.scale.setScalar(i >= state.next ? gate.radius : 0);
      dummy.quaternion.setFromUnitVectors(zAxis, normal.set(gate.nx, 0, gate.nz));
      dummy.updateMatrix();
      gates.setMatrixAt(i, dummy.matrix);
      gates.setColorAt(i, i === state.next ? gold : dim);
    }
    gates.instanceMatrix.needsUpdate = true;
    gates.instanceColor.needsUpdate = true;
  }
  draw();
  return {
    state,
    frame(enabled, mode = state.mode) {
      if (!enabled && root.visible) stopCanyonRun(state);
      root.visible = !!enabled;
      if (mode !== state.mode) {
        stopCanyonRun(state);
        state.mode = mode;
        state.gates = canyonGates({heightAt, mode});
      }
      draw();
    },
    stop() {
      stopCanyonRun(state);
      draw();
    },
    step(dt, pilot) {
      const events = stepCanyonRun(state, pilot, dt);
      draw();
      return events;
    },
    dispose() {
      stopCanyonRun(state);
      root.removeFromParent();
      gates.dispose();
      geometry.dispose();
      material.dispose();
    }
  };
}
