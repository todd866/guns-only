import * as T from '../../vendor/three.module.js';
import {createCloudField, updateCloudField, sampleClouds, cloudLift} from './clouds.mjs';

export function createClouds(scene, heightAt, saved) {
  const state = createCloudField(heightAt, saved),
    root = new T.Group();
  root.name = 'Sky Tour clouds';
  const geometry = new T.SphereGeometry(1, 12, 8);
  const material = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: `attribute float fade; varying vec3 n; varying vec3 view; varying float visibility; varying float shade;
      void main(){ mat3 m=mat3(instanceMatrix); vec3 scale2=vec3(dot(m[0],m[0]),dot(m[1],m[1]),dot(m[2],m[2]));
      vec3 wn=m*(normal/scale2); n=normalize(normalMatrix*wn); visibility=fade; shade=.83+.17*smoothstep(-.7,.7,normalize(wn).y);
      vec4 p=modelViewMatrix*instanceMatrix*vec4(position,1.); view=-p.xyz;
      gl_Position=projectionMatrix*p; }`,
    fragmentShader: `varying vec3 n; varying vec3 view; varying float visibility; varying float shade;
      void main(){ vec3 normal=normalize(n); float edge=smoothstep(0.,.45,abs(dot(normal,normalize(view))));
      float light=shade;
      gl_FragColor=vec4(vec3(light),edge*.93*visibility); }`
  });
  const count = state.clouds.reduce((n, c) => n + c.puffs, 0),
    fades = new Float32Array(count);
  geometry.setAttribute('fade', new T.InstancedBufferAttribute(fades, 1).setUsage(T.DynamicDrawUsage));
  const mesh = new T.InstancedMesh(geometry, material, count);
  mesh.instanceMatrix.setUsage(T.DynamicDrawUsage);
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  root.add(mesh);
  const dummy = new T.Object3D();
  // Six broad, overlapping base lobes and four unequal towers: a flat bottom, cauliflower top.
  const puffs = state.clouds.map(c =>
    Array.from({length: c.puffs}, (_, j) => {
      const tower = j >= 6,
        angle = j * 2.39996,
        r = c.radius * (tower ? 0.24 : 0.42);
      const sy = tower ? (c.top - c.base) * (0.37 + (j % 3) * 0.035) : 10;
      return [
        Math.cos(angle) * r,
        tower ? c.top - sy - (j % 3) * 2 : c.base + sy,
        Math.sin(angle) * r,
        c.radius * (tower ? 0.43 : 0.58),
        sy,
        c.radius * (tower ? 0.4 : 0.51)
      ];
    })
  );
  const positions = new Float32Array((14 * 6 + 32) * 3),
    sparkleGeometry = new T.BufferGeometry();
  sparkleGeometry.setAttribute('position', new T.BufferAttribute(positions, 3).setUsage(T.DynamicDrawUsage));
  const sparkleMaterial = new T.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    vertexShader: `void main(){vec4 p=modelViewMatrix*vec4(position,1.);gl_Position=projectionMatrix*p;gl_PointSize=clamp(170./max(1.,-p.z),1.,7.);}`,
    fragmentShader: `void main(){vec2 p=abs(gl_PointCoord-.5);float a=(1.-smoothstep(.02,.12,min(p.x,p.y)))*(1.-smoothstep(.2,.5,max(p.x,p.y)));gl_FragColor=vec4(1.,.94,.65,a*.38);}`
  });
  const sparkles = new T.Points(sparkleGeometry, sparkleMaterial);
  sparkles.frustumCulled = false;
  sparkles.renderOrder = 1001;
  root.add(sparkles);
  const veilGeometry = new T.PlaneGeometry(2, 2),
    veilMaterial = new T.ShaderMaterial({
      uniforms: {opacity: {value: 0}},
      transparent: true,
      depthTest: false,
      depthWrite: false,
      vertexShader: `void main(){gl_Position=vec4(position.xy,0.,1.);}`,
      fragmentShader: `uniform float opacity;void main(){gl_FragColor=vec4(.97,.98,1.,opacity);}`
    });
  const veil = new T.Mesh(veilGeometry, veilMaterial);
  veil.frustumCulled = false;
  veil.renderOrder = 1000;
  root.add(veil);
  scene.add(root);
  let burst = 0,
    burstX = 0,
    burstY = 0,
    burstZ = 0;
  root.visible = false;
  return {
    state,
    lift: pos => cloudLift(state, pos),
    step(pos, prev, flying) {
      sampleClouds(state, pos, prev, flying);
      if (state.collectedMask) {
        burst = 1;
        burstX = pos[0];
        burstY = pos[1];
        burstZ = pos[2];
      }
      return state;
    },
    frame(dt, enabled) {
      root.visible = enabled;
      if (!enabled) {
        state.fog = state.fogTarget = 0;
        state.inside = false;
        return;
      }
      updateCloudField(state, dt);
      state.fog += (state.fogTarget - state.fog) * Math.min(1, dt * 5);
      veilMaterial.uniforms.opacity.value = state.fog;
      veil.visible = state.fog > 0.002;
      let k = 0,
        point = 0;
      for (let i = 0; i < state.clouds.length; i++) {
        const c = state.clouds[i];
        for (const p of puffs[i]) {
          dummy.position.set(c.x + p[0], c.ground + p[1], c.z + p[2]);
          dummy.scale.set(p[3], p[4], p[5]);
          dummy.updateMatrix();
          mesh.setMatrixAt(k, dummy.matrix);
          fades[k++] = c.alpha;
        }
        for (let j = 0; j < 6; j++) {
          const phase = (state.time * 0.045 + j / 6) % 1,
            angle = j * 2.4 + i;
          positions[point++] = c.x + Math.cos(angle) * c.radius * 0.65;
          positions[point++] = c.ground + phase * c.base;
          positions[point++] = c.z + Math.sin(angle) * c.radius * 0.65;
        }
      }
      burst = Math.max(0, burst - dt);
      for (let j = 0; j < 32; j++) {
        const r = (1 - burst) * 12,
          angle = j * 2.4;
        positions[point++] = burstX + Math.cos(angle) * r;
        positions[point++] = burst > 0 ? burstY + Math.sin(j * 5) * r : -10000;
        positions[point++] = burstZ + Math.sin(angle) * r;
      }
      mesh.instanceMatrix.needsUpdate = true;
      geometry.attributes.fade.needsUpdate = true;
      sparkleGeometry.attributes.position.needsUpdate = true;
    },
    dispose() {
      root.removeFromParent();
      mesh.dispose();
      geometry.dispose();
      material.dispose();
      sparkleGeometry.dispose();
      sparkleMaterial.dispose();
      veilGeometry.dispose();
      veilMaterial.dispose();
    }
  };
}
