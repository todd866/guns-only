import * as THREE from "../../vendor/three.module.js";

/** Maximum relay count in the PATHFINDERS presentation contract. */
export const PATHFINDER_RELAY_POOL_SIZE = 6;
export const PATHFINDER_GONDOLA_HALF_EXTENTS_M = Object.freeze({ x: 2.8, y: 1.4, z: 2.1 });

const ZERO = new THREE.Vector3();

// One six-vertex draw in the existing scene, depth tested against terrain/aircraft. This is an
// optical locator, not a larger collision envelope: fade into the real mesh as it resolves.
function makeGlints() {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(18), 3));
  geometry.setAttribute("sunlit", new THREE.Float32BufferAttribute(new Float32Array(6), 1));
  const material = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, depthTest: true, toneMapped: false,
    uniforms: { pixelRatio: { value: 1 }, focalPx: { value: 1 }, radiusM: { value: 1 } },
    vertexShader: `
      #include <common>
      #include <logdepthbuf_pars_vertex>
      uniform float pixelRatio, focalPx, radiusM;
      attribute float sunlit;
      varying float brightness, resolved;
      void main() {
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        float diameterPx = 2.0 * radiusM * focalPx / max(1.0, -view.z);
        float rangeM = length(view.xyz);
        resolved = 1.0 - smoothstep(5556.0, 18520.0, rangeM);
        // Retain the bright locator until the physical envelope is a resolved
        // silhouette; a subpixel mesh must not absorb the 10 NM readability budget.
        brightness = sunlit * (1.0 - smoothstep(4.0, 10.0, diameterPx))
          * smoothstep(1500.0, 3000.0, rangeM)
          * (1.0 - smoothstep(74080.0, 83340.0, rangeM));
        // Larger than the flight-path marker: a 7 px dot sat inside that symbol and
        // read as no contact until the mesh itself resolved near 0.8 NM.
        gl_PointSize = mix(24.0, 48.0, resolved) * pixelRatio;
        gl_Position = projectionMatrix * view;
        #include <logdepthbuf_vertex>
      }`,
    fragmentShader: `
      #include <logdepthbuf_pars_fragment>
      varying float brightness, resolved;
      void main() {
        vec2 p = (gl_PointCoord - vec2(0.5)) * 2.0;
        float r = length(p);
        // Far: soft warm dot. By 3 NM: a round, shaded envelope impostor,
        // handing off to the actual mesh before the 1.5 km gondola window.
        float edge = mix(0.78, 0.92, resolved);
        float alpha = (1.0 - smoothstep(edge, 1.0, r)) * brightness;
        if (alpha < 0.01) discard;
        #include <logdepthbuf_fragment>
        float dome = sqrt(max(0.0, 1.0 - r * r));
        vec3 normal = normalize(vec3(p * 0.85, dome));
        // Player-facing key: the sun is behind/right, so the near face is lit from the right.
        float key = clamp(dot(normal, normalize(vec3(0.55, 0.28, 1.0))), 0.0, 1.0);
        vec3 envelope = mix(vec3(0.42, 0.18, 0.08), vec3(1.0, 0.90, 0.68), key);
        vec3 warm = mix(vec3(1.0, 0.94, 0.72), envelope, resolved);
        gl_FragColor = vec4(warm, alpha);
      }`,
  });
  const points = new THREE.Points(geometry, material);
  points.name = "PATHFINDER_SUNLIT_GLINTS";
  points.frustumCulled = false; // Six vertices; stale bounds must not cull a drifting lane.
  points.userData.noShadow = true;
  const size = new THREE.Vector2();
  points.onBeforeRender = (renderer, scene, camera) => {
    renderer.getSize(size);
    material.uniforms.pixelRatio.value = renderer.getPixelRatio();
    material.uniforms.focalPx.value = size.y * camera.projectionMatrix.elements[5] * 0.5;
  };
  return points;
}

function point(vector, value, origin) {
  // Simulation coordinates use north-positive Z; Three's authored Rapier scene uses
  // camera-facing south-positive -Z (the same conversion as the aircraft presentation).
  vector.set(value?.x ?? 0, value?.y ?? 0, -(value?.z ?? 0));
  if (origin) vector.sub(origin);
  return vector;
}

function addRig(group, geometry, material) {
  const rig = new THREE.LineSegments(geometry, material);
  rig.name = "PATHFINDER_RELAY_TRUSS";
  rig.userData.noShadow = true;
  group.add(rig);
  return rig;
}

function makeTrussGeometry() {
  // Unit-ish local rig, updated by placing its parent at the authoritative gondola.
  const positions = new Float32Array([
    -2.8, 1.4, -2.1, 2.8, 1.4, -2.1,
    2.8, 1.4, -2.1, 2.8, 1.4, 2.1,
    2.8, 1.4, 2.1, -2.8, 1.4, 2.1,
    -2.8, 1.4, 2.1, -2.8, 1.4, -2.1,
    -2.8, -1.4, -2.1, 2.8, -1.4, -2.1,
    2.8, -1.4, -2.1, 2.8, -1.4, 2.1,
    2.8, -1.4, 2.1, -2.8, -1.4, 2.1,
    -2.8, -1.4, 2.1, -2.8, -1.4, -2.1,
    -2.8, -1.4, -2.1, -2.8, 1.4, -2.1,
    2.8, -1.4, -2.1, 2.8, 1.4, -2.1,
    2.8, -1.4, 2.1, 2.8, 1.4, 2.1,
    -2.8, -1.4, 2.1, -2.8, 1.4, 2.1,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geometry;
}

function makeWrinkleGeometry() {
  const positions = [];
  const meridians = 10;
  for (let i = 0; i < meridians; i += 1) {
    const angle = i / meridians * Math.PI * 2;
    for (let j = 0; j < 8; j += 1) {
      const y0 = -0.9 + j * 0.225;
      const y1 = y0 + 0.12;
      const radial0 = Math.sqrt(Math.max(0, 1 - y0 * y0));
      const radial1 = Math.sqrt(Math.max(0, 1 - y1 * y1));
      const wave0 = radial0 * 1.002;
      const wave1 = radial1 * 1.002;
      positions.push(Math.cos(angle) * wave0, y0, Math.sin(angle) * wave0,
        Math.cos(angle) * wave1, y1, Math.sin(angle) * wave1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function makeSuspensionGeometry() {
  const positions = new Float32Array([
    0, 0, 0, -2.8, -1, -2.1,
    0, 0, 0, -2.8, -1, 2.1,
    0, 0, 0, 2.8, -1, -2.1,
    0, 0, 0, 2.8, -1, 2.1,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  return geometry;
}

function makeSlot(shared) {
  const slot = new THREE.Group();
  slot.name = "PATHFINDER_RELAY_SLOT";

  const envelopeGeometry = shared.envelopeGeometry.clone();
  const envelope = new THREE.Mesh(envelopeGeometry, shared.envelopeMaterial);
  envelope.name = "PATHFINDER_PALE_LEAKING_ENVELOPE";
  envelope.castShadow = false;
  envelope.receiveShadow = true;
  slot.add(envelope);

  const wrinkleGeometry = shared.wrinkleGeometry.clone();
  const wrinkles = new THREE.LineSegments(wrinkleGeometry, shared.wrinkleMaterial);
  wrinkles.name = "PATHFINDER_ENVELOPE_WRINKLES";
  wrinkles.userData.noShadow = true;
  slot.add(wrinkles);

  const gondola = new THREE.Mesh(shared.gondolaGeometry, shared.gondolaMaterial);
  gondola.name = "PATHFINDER_DARK_GONDOLA";
  gondola.castShadow = true;
  slot.add(gondola);

  const truss = addRig(slot, shared.trussGeometry, shared.trussMaterial);
  const suspension = new THREE.LineSegments(shared.suspensionGeometry, shared.trussMaterial);
  suspension.name = "PATHFINDER_ENVELOPE_TO_GONDOLA_SUSPENSION";
  suspension.userData.noShadow = true;
  slot.add(suspension);

  const debris = new THREE.Group();
  debris.name = "PATHFINDER_FALLING_GONDOLA_DEBRIS";
  const debrisGondola = new THREE.Mesh(shared.gondolaGeometry, shared.debrisMaterial);
  debrisGondola.castShadow = true;
  debris.add(debrisGondola);
  const debrisTruss = addRig(debris, shared.trussGeometry, shared.trussMaterial);
  debris.visible = false;
  slot.add(debris);

  return {
    slot, envelope, wrinkles, gondola, truss, suspension, debris, debrisGondola, debrisTruss,
    envelopeBase: new Float32Array(envelopeGeometry.attributes.position.array),
    wrinkleBase: new Float32Array(wrinkleGeometry.attributes.position.array),
    deformationKey: "",
  };
}

function disposeShared(shared) {
  const disposed = new Set();
  for (const resource of Object.values(shared)) {
    if (resource && !disposed.has(resource)) {
      disposed.add(resource);
      resource.dispose?.();
    }
  }
}

/** Create the six cheap, state-driven PATHFINDERS relay presentations. */
export function createPathfinderRelays() {
  const group = new THREE.Group();
  group.name = "PATHFINDER_RELAY_BALLOONS";
  group.visible = false;
  const shared = {
    envelopeGeometry: new THREE.SphereGeometry(1, 18, 12),
    envelopeMaterial: new THREE.MeshStandardMaterial({
      color: 0xfff1d4, roughness: 0.58, metalness: 0.02,
      emissive: 0xffe2b0, emissiveIntensity: 0.42,
      fog: false,
    }),
    wrinkleGeometry: makeWrinkleGeometry(),
    wrinkleMaterial: new THREE.LineBasicMaterial({ color: 0x8a8274, transparent: true, opacity: 0.55, fog: false }),
    gondolaGeometry: new THREE.BoxGeometry(5.6, 2.8, 4.2),
    gondolaMaterial: new THREE.MeshStandardMaterial({ color: 0x0c1216, roughness: 0.86, metalness: 0.08, fog: false }),
    // Debris is prepared with the same dark material already used by live gondolas;
    // a first kill must not introduce a shader/material compile hitch.
    debrisMaterial: null,
    trussGeometry: makeTrussGeometry(),
    trussMaterial: new THREE.LineBasicMaterial({ color: 0x252b2e, transparent: true, opacity: 0.82, fog: false }),
    suspensionGeometry: makeSuspensionGeometry(),
  };
  shared.debrisMaterial = shared.gondolaMaterial;
  const slots = Array.from({ length: PATHFINDER_RELAY_POOL_SIZE }, () => {
    const slot = makeSlot(shared);
    slot.slot.visible = false;
    group.add(slot.slot);
    return slot;
  });
  const scratch = Array.from({ length: PATHFINDER_RELAY_POOL_SIZE }, () => new THREE.Vector3());
  const glints = makeGlints();
  group.add(glints);
  let disposed = false;

  function deform(slot, radius, sag, leak, liftLoss) {
    const leakQ = Math.round(leak * 64);
    const liftQ = Math.round(liftLoss * 64);
    const key = `${radius}|${leakQ}|${liftQ}`;
    if (slot.deformationKey === key) return;
    slot.deformationKey = key;
    const amplitude = 0.025 * leak + 0.012 * liftLoss;
    const envelopePositions = slot.envelope.geometry.attributes.position.array;
    for (let i = 0; i < envelopePositions.length; i += 3) {
      const x = slot.envelopeBase[i];
      const y = slot.envelopeBase[i + 1];
      const z = slot.envelopeBase[i + 2];
      const wrinkle = 1 + amplitude * Math.sin(Math.atan2(z, x) * 10) * (1 - Math.abs(y));
      envelopePositions[i] = x * radius * wrinkle;
      envelopePositions[i + 1] = y * radius * (1 - sag);
      envelopePositions[i + 2] = z * radius * wrinkle;
    }
    slot.envelope.geometry.attributes.position.needsUpdate = true;
    slot.envelope.geometry.computeVertexNormals();
    slot.envelope.geometry.computeBoundingSphere();
    slot.envelope.geometry.computeBoundingBox();
    const wrinklePositions = slot.wrinkles.geometry.attributes.position.array;
    for (let i = 0; i < wrinklePositions.length; i += 3) {
      const x = slot.wrinkleBase[i];
      const y = slot.wrinkleBase[i + 1];
      const z = slot.wrinkleBase[i + 2];
      const wrinkle = 1 + amplitude * Math.sin(Math.atan2(z, x) * 10) * (1 - Math.abs(y));
      wrinklePositions[i] = x * radius * wrinkle;
      wrinklePositions[i + 1] = y * radius * (1 - sag);
      wrinklePositions[i + 2] = z * radius * wrinkle;
    }
    slot.wrinkles.geometry.attributes.position.needsUpdate = true;
    slot.wrinkles.geometry.computeBoundingSphere();
  }

  function update(state, origin = ZERO) {
    if (disposed) return;
    if (!state?.pathfinder && !group.visible) return;
    group.visible = Boolean(state?.pathfinder);
    const relays = state?.pathfinder?.relays ?? [];
    const positions = glints.geometry.attributes.position;
    const sunlit = glints.geometry.attributes.sunlit;
    const sunElevation = Number(state?.pathfinder?.sun_elevation_deg);
    for (let i = 0; i < slots.length; i += 1) {
      const relay = relays[i];
      const slot = slots[i];
      if (!relay) {
        slot.slot.visible = false;
        sunlit.setX(i, 0);
        continue;
      }
      slot.slot.visible = true;
      slot.slot.userData.relayId = relay.id;
      const radius = Math.max(1, Number(state.pathfinder.envelope_radius_m) || 1);
      point(slot.slot.position, relay.position, origin);
      positions.setXYZ(i, slot.slot.position.x, slot.slot.position.y, slot.slot.position.z);
      const horizonDip = Math.acos(6371000 / (6371000 + Math.max(0, relay.position.y)));
      sunlit.setX(i, Number.isFinite(sunElevation) && sunElevation * Math.PI / 180 + horizonDip > 0 ? 1 : 0);
      glints.material.uniforms.radiusM.value = radius;
      const leak = THREE.MathUtils.clamp(Number(relay.leak_fraction) || 0, 0, 1);
      const liftLoss = THREE.MathUtils.clamp(Number(relay.lift_loss_fraction) || 0, 0, 1);
      const sag = THREE.MathUtils.clamp(leak * 0.22 + liftLoss * 0.16, 0, 0.34);
      // Keep the teaching deformation inspectable alongside the mesh: HUD marks ENVELOPE,
      // while this explicit value drives the pale envelope's vertical compression and drop.
      slot.envelope.userData.pathfinderSag = sag;
      slot.wrinkles.userData.pathfinderSag = sag;
      slot.envelope.position.y = -radius * sag * 0.22;
      slot.envelope.scale.set(1, 1, 1);
      slot.wrinkles.position.copy(slot.envelope.position);
      slot.wrinkles.scale.set(1, 1, 1);
      deform(slot, radius, sag, leak, liftLoss);
      slot.wrinkles.visible = leak > 0 || liftLoss > 0;
      point(scratch[i], relay.gondola_position, origin);
      slot.gondola.position.copy(scratch[i]).sub(slot.slot.position);
      slot.truss.position.copy(slot.gondola.position);
      slot.suspension.position.y = slot.envelope.position.y - radius * (1 - sag);
      slot.suspension.scale.set(1, Math.max(1,
        slot.suspension.position.y - slot.gondola.position.y - 1.4), 1);
      slot.gondola.visible = relay.relay_active !== false;
      slot.truss.visible = slot.gondola.visible;
      slot.suspension.visible = slot.gondola.visible;
      const debris = relay.debris;
      slot.debris.visible = Boolean(debris);
      if (debris) {
        point(slot.debris.position, debris.position, origin).sub(slot.slot.position);
        slot.debrisGondola.visible = true;
        slot.debrisTruss.visible = true;
        slot.debris.userData.landed = debris.landed === true;
      }
    }
    positions.needsUpdate = true;
    sunlit.needsUpdate = true;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const slot of slots) {
      slot.envelope.geometry.dispose();
      slot.wrinkles.geometry.dispose();
    }
    disposeShared(shared);
    glints.geometry.dispose();
    glints.material.dispose();
    scratch.length = 0;
  }

  return { group, update, dispose };
}
