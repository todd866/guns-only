import * as THREE from "../../vendor/three.module.js";
import {
  TERRAIN_CURVATURE_START_M,
  TERRAIN_EARTH_RADIUS_M,
} from "../environment/korea_terrain.js";

// Pure Three.js scene/model builders extracted verbatim from app.js. Runtime-derived configuration
// is owned by app.js and injected once via configureSceneBuilders() before any builder runs, so
// these builders stay free of DOM/device probing. The injected identifiers deliberately mirror the
// app.js module-scope names the extracted bodies read, keeping the moved code byte-identical.
let VISUAL_QUALITY;
let mobileControls;
let MAX_TRACERS;
let fogDensityForVisibility;
let CLEAR_AIR_VISIBILITY_M;

export function configureSceneBuilders(config) {
  VISUAL_QUALITY = config.visualQuality;
  mobileControls = config.mobileControls;
  MAX_TRACERS = config.maxTracers;
  fogDensityForVisibility = config.fogDensityForVisibility;
  CLEAR_AIR_VISIBILITY_M = config.clearAirVisibilityM;
}

export function applyProceduralFinish(material, options = {}) {
  const grain = options.grain ?? 0.08;
  const grainScale = options.grainScale ?? 1.2;
  const panels = options.panels ?? 0;
  const panelScale = options.panelScale ?? 0.5;
  const hullBands = options.hullBands === true;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFinishGrain = { value: grain };
    shader.uniforms.uFinishScale = { value: grainScale };
    shader.uniforms.uPanelStrength = { value: panels };
    shader.uniforms.uPanelScale = { value: panelScale };
    shader.vertexShader = shader.vertexShader
      .replace("varying vec3 vViewPosition;", `
        varying vec3 vViewPosition;
        varying vec3 vFinishPosition;
      `)
      .replace("#include <begin_vertex>", `
        #include <begin_vertex>
        vFinishPosition = position;
      `);
    shader.fragmentShader = shader.fragmentShader
      .replace("varying vec3 vViewPosition;", `
        varying vec3 vViewPosition;
        varying vec3 vFinishPosition;
        uniform float uFinishGrain;
        uniform float uFinishScale;
        uniform float uPanelStrength;
        uniform float uPanelScale;

        float finishNoise(vec3 p) {
          float a = sin(dot(p, vec3(1.73, 3.17, 2.11)));
          float b = sin(dot(p, vec3(-4.13, 1.37, 3.71)) + a * 1.31);
          float c = sin(dot(p, vec3(7.07, -2.43, 1.19)) + b * 0.83);
          return 0.5 + 0.25 * b + 0.25 * c;
        }

        float finishPanel(vec3 p) {
          vec3 cell = abs(fract(p) - 0.5);
          float edge = max(max(cell.x, cell.y), cell.z);
          return smoothstep(0.472, 0.497, edge);
        }
      `)
      .replace("vec4 diffuseColor = vec4( diffuse, opacity );", `
        vec4 diffuseColor = vec4( diffuse, opacity );
        float finishValue = finishNoise(vFinishPosition * uFinishScale);
        float panelValue = finishPanel(vFinishPosition * uPanelScale);
      `)
      .replace("#include <color_fragment>", `
        #include <color_fragment>
        diffuseColor.rgb *= 1.0 + (finishValue - 0.5) * uFinishGrain * 0.32;
        diffuseColor.rgb *= 1.0 - panelValue * uPanelStrength;
        ${hullBands ? `
          float antiFouling = 1.0 - smoothstep(-18.6, -17.7, vFinishPosition.y);
          float bootTop = smoothstep(-18.6, -18.15, vFinishPosition.y)
            * (1.0 - smoothstep(-17.75, -17.3, vFinishPosition.y));
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.115, 0.057, 0.052), antiFouling * 0.82);
          diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.012, 0.018, 0.020), bootTop * 0.96);
        ` : ""}
      `)
      .replace("#include <roughnessmap_fragment>", `
        #include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor
          + (finishValue - 0.5) * uFinishGrain
          + panelValue * uPanelStrength * 0.7, 0.075, 1.0);
      `);
  };
  material.customProgramCacheKey = () => `procedural-finish-${hullBands ? 1 : 0}`;
  return material;
}

export function makeMaterial(color, roughness = 0.72, metalness = 0.08, emissive = 0x000000,
  options = {}) {
  // Painted military aluminium is primarily a rough dielectric. MeshPhysicalMaterial supplies a
  // calibrated Fresnel response; the tiny analytic grain breaks up broad highlights without maps.
  const material = new THREE.MeshPhysicalMaterial({
    color,
    roughness,
    metalness,
    emissive,
    ior: options.ior ?? 1.48,
    specularIntensity: options.specularIntensity ?? 0.62,
    specularColor: options.specularColor ?? 0xd9e2e3,
    clearcoat: options.clearcoat ?? 0,
    clearcoatRoughness: options.clearcoatRoughness ?? 0.48,
    envMapIntensity: options.envMapIntensity ?? 0.74,
  });
  return applyProceduralFinish(material, options);
}

export function createLitEnvironment(renderer) {
  // A compact procedural PMREM gives every physical material something coherent to reflect. It is
  // generated once at boot and contains no fetched texture or per-frame capture cost.
  const environmentScene = new THREE.Scene();
  const environmentMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    vertexShader: /* glsl */ `
      varying vec3 vEnvironmentDirection;
      void main() {
        vEnvironmentDirection = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      varying vec3 vEnvironmentDirection;
      void main() {
        vec3 d = normalize(vEnvironmentDirection);
        float skyMix = pow(clamp(d.y * 0.5 + 0.5, 0.0, 1.0), 0.55);
        vec3 lower = vec3(0.018, 0.052, 0.060);
        vec3 horizon = vec3(0.36, 0.49, 0.51);
        vec3 zenith = vec3(0.025, 0.145, 0.34);
        vec3 color = d.y < 0.0 ? mix(lower, horizon * 0.44, smoothstep(-0.5, 0.0, d.y))
          : mix(horizon, zenith, skyMix);
        float sun = pow(max(dot(d, normalize(vec3(0.32, 0.78, -0.53))), 0.0), 720.0);
        color += vec3(1.0, 0.72, 0.39) * sun * 12.0;
        gl_FragColor = vec4(color, 1.0);
      }
    `,
  });
  environmentScene.add(new THREE.Mesh(new THREE.SphereGeometry(40, 32, 18), environmentMaterial));
  const generator = new THREE.PMREMGenerator(renderer);
  generator.compileCubemapShader();
  const target = generator.fromScene(environmentScene, 0.035, 0.1, 80);
  generator.dispose();
  environmentMaterial.dispose();
  environmentScene.children[0].geometry.dispose();
  return target;
}

export function box(group, size, position, material, rotation = null) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(size.x, size.y, size.z), material);
  mesh.position.copy(position);
  if (rotation) mesh.rotation.set(rotation.x, rotation.y, rotation.z);
  group.add(mesh);
  return mesh;
}

export function addSemanticSocket(parent, name, x, y, z) {
  const socket = new THREE.Object3D();
  socket.name = name;
  socket.position.set(x, y, z);
  socket.userData.semanticSocket = name;
  parent.add(socket);
  return socket;
}

export function annotateProceduralFallback(object, context = {}) {
  const parameters = context?.parameters && typeof context.parameters === "object"
    ? Object.freeze({ ...context.parameters })
    : Object.freeze({});
  object.userData.proceduralFallback = Object.freeze({
    assetId: typeof context?.assetId === "string" ? context.assetId : null,
    requested: typeof context?.requested === "string" ? context.requested : null,
    parameters,
  });
}

export function deckOverlayBox(group, size, position, material) {
  // Glitch fix: thin deck overlays casting onto the deck produced crawling, decal-shaped shadows.
  const mesh = box(group, size, position, material);
  mesh.userData.noShadow = true;
  mesh.renderOrder = 1;
  return mesh;
}

export function depthBiasDeckMaterial(material) {
  // Glitch fix: near-coplanar deck layers lost depth precision and shimmered on approach.
  material.polygonOffset = true;
  material.polygonOffsetFactor = -1;
  material.polygonOffsetUnits = -1;
  return material;
}

export function beveledBox(group, size, position, material, radius = 0.16) {
  const bevel = Math.min(radius, size.x * 0.18, size.y * 0.18, size.z * 0.18);
  const width = Math.max(0.02, size.x - bevel * 2);
  const height = Math.max(0.02, size.y - bevel * 2);
  const shape = new THREE.Shape();
  shape.moveTo(-width * 0.5, -height * 0.5);
  shape.lineTo(width * 0.5, -height * 0.5);
  shape.lineTo(width * 0.5, height * 0.5);
  shape.lineTo(-width * 0.5, height * 0.5);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.02, size.z - bevel * 2),
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 1,
  });
  geometry.center();
  geometry.computeVertexNormals();
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.copy(position);
  group.add(mesh);
  return mesh;
}

export function cylinder(group, radius, length, position, material, radialSegments = 12) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, radialSegments, 1, false),
    material,
  );
  // Aircraft local forward is -Z; cylinders are authored along +Y by three.js.
  mesh.rotation.x = Math.PI / 2;
  mesh.position.copy(position);
  group.add(mesh);
  return mesh;
}

export function verticalCylinder(group, radius, length, position, material, radialSegments = 12) {
  const mesh = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, radialSegments, 1, false),
    material,
  );
  mesh.position.copy(position);
  group.add(mesh);
  return mesh;
}

export function createHullGeometry() {
  // Closely spaced bow and stern stations keep highlights flowing down the shell instead of
  // breaking into the large flat facets that made the ship look low-poly. Local -Z is the bow.
  const stations = [
    { z: -128, beam: 0.35, bottom: -7.0 },
    { z: -121, beam: 5.3, bottom: -15.5 },
    { z: -110, beam: 11.8, bottom: -21.8 },
    { z: -82, beam: 13.2, bottom: -23.5 },
    { z: -25, beam: 13.5, bottom: -24.0 },
    { z: 45, beam: 13.35, bottom: -23.8 },
    { z: 92, beam: 12.85, bottom: -23.0 },
    { z: 116, beam: 11.35, bottom: -20.8 },
    { z: 126, beam: 8.4, bottom: -17.5 },
  ];
  const positions = [];
  const indices = [];
  const crossSegments = 12;
  for (const station of stations) {
    for (let segment = 0; segment <= crossSegments; segment++) {
      const theta = Math.PI - segment / crossSegments * Math.PI;
      const depth = Math.sin(theta);
      const flare = 1 - depth * 0.38;
      positions.push(
        Math.cos(theta) * station.beam * flare,
        -1.7 - depth * (-1.7 - station.bottom),
        station.z,
      );
    }
  }
  for (let i = 0; i < stations.length - 1; i++) {
    const a = i * (crossSegments + 1);
    const b = a + crossSegments + 1;
    for (let segment = 0; segment < crossSegments; segment++) {
      indices.push(a + segment, a + segment + 1, b + segment);
      indices.push(a + segment + 1, b + segment + 1, b + segment);
    }
  }
  const ringSize = crossSegments + 1;
  const bowCentre = positions.length / 3;
  positions.push(0, (stations[0].bottom - 1.7) * 0.5, stations[0].z);
  const sternCentre = positions.length / 3;
  const stern = stations[stations.length - 1];
  positions.push(0, (stern.bottom - 1.7) * 0.5, stern.z);
  const sternStart = (stations.length - 1) * ringSize;
  for (let segment = 0; segment < ringSize; segment++) {
    const next = (segment + 1) % ringSize;
    indices.push(bowCentre, next, segment);
    indices.push(sternCentre, sternStart + segment, sternStart + next);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createWakeMaterial(bowWave = false) {
  const uniforms = {
    uTime: { value: 0 },
    uFogColor: { value: new THREE.Color(0x7898a0) },
    uFogDensity: { value: 0.000055 },
    uBowWave: { value: bowWave ? 1 : 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      uniform float uTime;
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      #include <common>
      #include <logdepthbuf_pars_vertex>

      float oceanHeight(vec2 point) {
        float wave = 0.0;
        vec2 d0 = normalize(vec2(0.94, 0.34));
        vec2 d1 = normalize(vec2(-0.26, 0.97));
        vec2 d2 = normalize(vec2(0.74, -0.67));
        vec2 d3 = normalize(vec2(-0.86, -0.51));
        vec2 d4 = normalize(vec2(0.44, 0.90));
        float k0 = 6.28318530718 / 176.0;
        float k1 = 6.28318530718 / 91.0;
        float k2 = 6.28318530718 / 47.0;
        float k3 = 6.28318530718 / 25.0;
        float k4 = 6.28318530718 / 13.0;
        wave += 1.35 * sin(k0 * dot(d0, point) - sqrt(9.81 * k0) * uTime * 0.94 + 0.4);
        wave += 0.82 * sin(k1 * dot(d1, point) - sqrt(9.81 * k1) * uTime * 1.02 + 2.1);
        wave += 0.48 * sin(k2 * dot(d2, point) - sqrt(9.81 * k2) * uTime * 1.08 + 4.3);
        wave += 0.27 * sin(k3 * dot(d3, point) - sqrt(9.81 * k3) * uTime * 1.14 + 1.2);
        wave += 0.13 * sin(k4 * dot(d4, point) - sqrt(9.81 * k4) * uTime * 1.20 + 3.7);
        return wave;
      }

      void main() {
        vUv = uv;
        vec4 world = modelMatrix * vec4(position, 1.0);
        world.y += oceanHeight(world.xz);
        vWorldPosition = world.xyz;
        gl_Position = projectionMatrix * viewMatrix * world;
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uTime;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      uniform float uBowWave;
      varying vec2 vUv;
      varying vec3 vWorldPosition;
      #include <common>
      #include <logdepthbuf_pars_fragment>

      void main() {
        float crossWake = abs(vUv.x - 0.5);
        float divergingCentre = mix(0.14, 0.34, vUv.y);
        float rails = exp(-pow((crossWake - divergingCentre) / 0.038, 2.0));
        float churnWidth = mix(0.23, 0.075, vUv.y);
        float churn = exp(-pow(crossWake / churnWidth, 2.0));
        float flow = vUv.y * 92.0 - uTime * 2.35;
        float streaks = 0.54 + 0.30 * sin(flow + vUv.x * 19.0);
        streaks += 0.16 * sin(flow * 2.13 - vUv.x * 37.0 + 1.7);
        streaks += 0.08 * sin(flow * 4.31 + vUv.x * 71.0);
        float brokenFoam = smoothstep(0.38, 0.79, streaks);
        brokenFoam *= 0.72 + 0.28 * smoothstep(-0.4, 0.55,
          sin(vUv.y * 31.0 - uTime * 0.72 + sin(vUv.x * 17.0)));
        float endFade = 1.0 - smoothstep(0.70, 1.0, vUv.y);
        float startFade = smoothstep(0.0, 0.035, vUv.y);
        float sternFoam = rails * (0.54 + brokenFoam * 0.32) + churn * brokenFoam * 0.94;

        // A separate low-cost sheet runs along the hull. Its two coherent ribbons start at the
        // cutwater and peel outboard instead of looking like a second propeller wake.
        float bowCentre = mix(0.04, 0.43, smoothstep(0.0, 0.52, vUv.y));
        float bowRail = exp(-pow((crossWake - bowCentre) / mix(0.075, 0.052, vUv.y), 2.0));
        float bowPulse = 0.70 + 0.30 * sin(vUv.y * 53.0 - uTime * 1.35 + vUv.x * 11.0);
        float bowFoam = bowRail * smoothstep(0.38, 0.78, bowPulse);
        bowFoam *= 1.0 - smoothstep(0.68, 1.0, vUv.y);
        float foam = mix(sternFoam, bowFoam, uBowWave) * startFade * endFade;
        float fog = 1.0 - exp(-uFogDensity * uFogDensity *
          dot(vWorldPosition - cameraPosition, vWorldPosition - cameraPosition));
        vec3 color = mix(vec3(0.48, 0.66, 0.70), vec3(0.91, 0.96, 0.92), brokenFoam);
        color = mix(color, uFogColor, fog);
        gl_FragColor = vec4(color, foam * 0.82 * (1.0 - fog * 0.72));
        #include <logdepthbuf_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  return { material, uniforms };
}

export function createWakeGeometry(startZ = 116, endZ = 870, startHalfWidth = 7, endHalfWidth = 45) {
  // A lightly tessellated tapered sheet in the ship's local frame. The wake shader applies the
  // same wave heights as the ocean, keeping the foam attached to the surface instead of floating.
  const positions = [];
  const uvs = [];
  const indices = [];
  const longitudinalSegments = 56;
  const crossSegments = 6;
  for (let along = 0; along <= longitudinalSegments; along++) {
    const v = along / longitudinalSegments;
    const z = startZ + (endZ - startZ) * v;
    const halfWidth = startHalfWidth + (endHalfWidth - startHalfWidth) * v;
    for (let across = 0; across <= crossSegments; across++) {
      const u = across / crossSegments;
      positions.push((u * 2 - 1) * halfWidth, 0, z);
      uvs.push(u, v);
    }
  }
  const row = crossSegments + 1;
  for (let along = 0; along < longitudinalSegments; along++) {
    for (let across = 0; across < crossSegments; across++) {
      const a = along * row + across;
      const b = a + row;
      indices.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function addParkedAircraft(group, material, canopyMaterial) {
  // Three small deck aircraft provide an immediate scale cue while leaving the landing lane clear.
  const places = [
    { x: -9.2, z: -70, yaw: -0.05 },
    { x: -9.0, z: -91, yaw: 0.035 },
    { x: 8.4, z: -104, yaw: -0.025 },
  ];
  const temp = new THREE.Object3D();
  const parkedFuselage = createLoftGeometry([
    { z: -4.2, rx: 0.04, ry: 0.04, y: 0 },
    { z: -3.35, rx: 0.34, ry: 0.3, y: 0.05 },
    { z: -1.5, rx: 0.48, ry: 0.43, y: 0.08 },
    { z: 1.65, rx: 0.43, ry: 0.38, y: 0.07 },
    { z: 3.7, rx: 0.09, ry: 0.08, y: 0.06 },
  ], 12);
  const parkedWing = createPlanformGeometry([
    [0, -2.45], [-0.58, -2.1], [-3.15, 0.15], [-2.88, 0.72], [-0.85, 0.46],
    [-0.6, 2.52], [0, 2.76], [0.6, 2.52], [0.85, 0.46], [2.88, 0.72],
    [3.15, 0.15], [0.58, -2.1],
  ], 0.11, 0.028);
  const parkedTail = createPlanformGeometry([
    [0, 1.85], [-0.42, 1.92], [-1.65, 2.8], [-0.5, 2.62],
    [0, 2.85], [0.5, 2.62], [1.65, 2.8], [0.42, 1.92],
  ], 0.09, 0.02);
  const fuselages = new THREE.InstancedMesh(parkedFuselage, material, places.length);
  const wings = new THREE.InstancedMesh(parkedWing, material, places.length);
  const tails = new THREE.InstancedMesh(parkedTail, material, places.length);
  const canopies = new THREE.InstancedMesh(new THREE.SphereGeometry(0.5, 8, 5), canopyMaterial, places.length);
  places.forEach((place, index) => {
    temp.position.set(place.x, 0.84, place.z);
    temp.rotation.set(0, place.yaw, 0);
    temp.scale.set(1, 1, 1);
    temp.updateMatrix();
    fuselages.setMatrixAt(index, temp.matrix);
    temp.position.set(place.x, 0.82, place.z);
    temp.scale.set(1, 1, 1);
    temp.updateMatrix();
    wings.setMatrixAt(index, temp.matrix);
    temp.position.set(place.x, 0.96, place.z);
    temp.updateMatrix();
    tails.setMatrixAt(index, temp.matrix);
    temp.position.set(place.x, 1.28, place.z - 1.65);
    temp.scale.set(0.82, 0.58, 1.58);
    temp.updateMatrix();
    canopies.setMatrixAt(index, temp.matrix);
  });
  group.add(fuselages, wings, tails, canopies);
}

export function createRoundDownGeometry() {
  // The aft six metres roll over sharply instead of ending as a square slab. Local +Z is aft.
  const positions = [
    -15, 0.02, 116, 15, 0.02, 116, -12.5, -4.1, 129, 12.5, -4.1, 129,
    -15, -1.8, 116, 15, -1.8, 116,
  ];
  const indices = [
    0, 2, 1, 1, 2, 3,
    0, 4, 2, 1, 3, 5,
    0, 1, 4, 1, 5, 4,
    2, 4, 3, 3, 4, 5,
  ];
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function addDeckSeams(group, material) {
  // Welded/planked steel panels: one preallocated instanced draw rather than dozens of meshes.
  const longitudinal = [-12, -9, -6, -3, 3, 6, 9, 12];
  const transverseCount = 31;
  const seams = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1), material, longitudinal.length + transverseCount,
  );
  const temp = new THREE.Object3D();
  let index = 0;
  for (const x of longitudinal) {
    temp.position.set(x, 0.025, 0);
    temp.scale.set(0.035, 0.024, 238);
    temp.updateMatrix();
    seams.setMatrixAt(index++, temp.matrix);
  }
  for (let i = 0; i < transverseCount; i++) {
    temp.position.set(0, 0.028, -116 + i * (232 / (transverseCount - 1)));
    temp.scale.set(29.2, 0.022, 0.035);
    temp.updateMatrix();
    seams.setMatrixAt(index++, temp.matrix);
  }
  seams.receiveShadow = true;
  seams.userData.noShadow = true;
  group.add(seams);
}

export function addDeckEdgeDetail(group, catwalkMaterial, railMaterial) {
  box(group, { x: 2.5, y: 0.42, z: 214 }, new THREE.Vector3(-16.0, -1.05, 3), catwalkMaterial);
  box(group, { x: 2.5, y: 0.42, z: 214 }, new THREE.Vector3(16.0, -1.05, 3), catwalkMaterial);

  const positions = [];
  for (const side of [-1, 1]) {
    const x = side * 17.0;
    positions.push(x, -0.72, -104, x, -0.72, 110);
    positions.push(x, 0.15, -104, x, 0.15, 110);
    for (let z = -104; z <= 110; z += 13.4) positions.push(x, -0.72, z, x, 0.15, z);
  }
  const rails = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)),
    railMaterial,
  );
  group.add(rails);
}

export function addDeckWear(group, material) {
  // Restrained rubber/scuff ribbons give the landing area direction and use-history at eye level.
  // One instanced draw keeps them cheaper than a texture and avoids shimmering coplanar decals.
  const marks = [
    [-3.5, -18, 0.36, 46, -0.004], [3.3, -14, 0.32, 52, 0.006],
    [-2.8, 7, 0.24, 29, 0.011], [2.7, 10, 0.22, 34, -0.009],
    [-4.3, -2, 0.18, 23, 0.018], [4.1, 2, 0.17, 25, -0.015],
  ];
  const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, marks.length);
  const temp = new THREE.Object3D();
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i];
    temp.position.set(mark[0], 0.19, mark[1]);
    temp.rotation.set(0, mark[4], 0);
    temp.scale.set(mark[2], 0.018, mark[3]);
    temp.updateMatrix();
    mesh.setMatrixAt(i, temp.matrix);
  }
  mesh.receiveShadow = true;
  mesh.userData.noShadow = true;
  group.add(mesh);
}

export function addDeckEdgeLights(group, material) {
  // Tiny fixed deck lamps are invaluable scale and perspective cues in the groove, even by day.
  const countPerSide = 15;
  const lamps = new THREE.InstancedMesh(
    new THREE.SphereGeometry(0.095, 6, 4), material, countPerSide * 2,
  );
  const temp = new THREE.Object3D();
  let index = 0;
  for (const side of [-1, 1]) {
    for (let i = 0; i < countPerSide; i++) {
      temp.position.set(side * 14.62, 0.19, -108 + i * (216 / (countPerSide - 1)));
      temp.scale.setScalar(i % 4 === 0 ? 1.18 : 1);
      temp.updateMatrix();
      lamps.setMatrixAt(index++, temp.matrix);
    }
  }
  lamps.userData.noShadow = true;
  group.add(lamps);
}

export function addDeckTieDowns(group, material) {
  // Recessed six-point tie-down cups are a strong close-range scale cue. One instanced draw keeps
  // the full deck grid cheaper than a texture lookup and the slight lift avoids coplanar flicker.
  const columns = [-12.4, -8.3, -4.15, 0, 4.15, 8.3, 12.4];
  const rows = 27;
  const mesh = new THREE.InstancedMesh(
    new THREE.CircleGeometry(0.085, 6), material, columns.length * rows,
  );
  const temp = new THREE.Object3D();
  let index = 0;
  for (let row = 0; row < rows; row++) {
    const z = -108 + row * (216 / (rows - 1));
    for (const x of columns) {
      temp.position.set(x, 0.116, z);
      temp.rotation.set(-Math.PI / 2, 0, (row & 1) * Math.PI / 6);
      temp.updateMatrix();
      mesh.setMatrixAt(index++, temp.matrix);
    }
  }
  mesh.receiveShadow = true;
  mesh.userData.noShadow = true;
  group.add(mesh);
}

export function addCarrierContactShadows(group) {
  const material = new THREE.MeshBasicMaterial({
    color: 0x050708,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });
  const patches = [
    [10.7, -28, 5.8, 18],
    [-9.2, -70, 1.55, 8.5],
    [-9.0, -91, 1.55, 8.5],
    [8.4, -104, 1.55, 8.5],
  ];
  const mesh = new THREE.InstancedMesh(new THREE.CircleGeometry(1, 18), material, patches.length);
  const temp = new THREE.Object3D();
  for (let i = 0; i < patches.length; i++) {
    temp.position.set(patches[i][0], 0.125, patches[i][1]);
    temp.rotation.set(-Math.PI / 2, 0, 0);
    temp.scale.set(patches[i][2], patches[i][3], 1);
    temp.updateMatrix();
    mesh.setMatrixAt(i, temp.matrix);
  }
  mesh.userData.noShadow = true;
  mesh.renderOrder = 2;
  group.add(mesh);
}

export function createCarrierSpray() {
  const count = VISUAL_QUALITY.carrierSprayCount;
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const seed = ((i * 37) % count) / count;
    const side = i & 1 ? 1 : -1;
    positions[i * 3] = side * (0.9 + seed * 4.8);
    positions[i * 3 + 1] = 0.15 + ((i * 13) % 9) * 0.055;
    positions[i * 3 + 2] = -127 + seed * 8.5;
    seeds[i] = seed + (i & 1) * 0.013;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  const uniforms = {
    uTime: { value: 0 },
    uPixelRatio: { value: Math.min(window.devicePixelRatio || 1, VISUAL_QUALITY.pixelRatioCap) },
    uFogColor: { value: new THREE.Color(0x7898a0) },
    uFogDensity: { value: 0.000055 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.NormalBlending,
    vertexShader: /* glsl */ `
      attribute float aSeed;
      uniform float uTime;
      uniform float uPixelRatio;
      varying float vSprayAlpha;
      varying vec3 vSprayWorld;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        float age = fract(uTime * (0.18 + aSeed * 0.045) + aSeed);
        float side = sign(position.x);
        vec3 animated = position;
        animated.x += side * age * (6.0 + aSeed * 8.0);
        animated.y += sin(age * 3.14159265) * (2.0 + aSeed * 2.8) - age * age * 1.2;
        animated.z += age * (15.0 + aSeed * 21.0);
        vec4 world = modelMatrix * vec4(animated, 1.0);
        vec4 view = viewMatrix * world;
        vSprayWorld = world.xyz;
        vSprayAlpha = smoothstep(0.0, 0.12, age) * (1.0 - smoothstep(0.58, 1.0, age));
        gl_PointSize = clamp((3.0 + aSeed * 3.0) * 170.0 / max(-view.z, 1.0), 1.0, 8.0)
          * uPixelRatio;
        gl_Position = projectionMatrix * view;
        // Glitch fix: conventional point depth did not compare correctly with the logarithmic sea.
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying float vSprayAlpha;
      varying vec3 vSprayWorld;
      #include <logdepthbuf_pars_fragment>
      void main() {
        vec2 point = gl_PointCoord - 0.5;
        float soft = 1.0 - smoothstep(0.16, 0.5, length(point));
        float fog = 1.0 - exp(-uFogDensity * uFogDensity
          * dot(vSprayWorld - cameraPosition, vSprayWorld - cameraPosition));
        vec3 color = mix(vec3(0.78, 0.88, 0.87), uFogColor, fog);
        gl_FragColor = vec4(color, soft * vSprayAlpha * 0.66 * (1.0 - fog));
        #include <logdepthbuf_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 1;
  return { points, uniforms };
}

export function createBarrier(material, netMaterial) {
  const barrier = new THREE.Group();
  box(barrier, { x: 0.3, y: 4.6, z: 0.3 }, new THREE.Vector3(-13.2, 2.3, 0), material);
  box(barrier, { x: 0.3, y: 4.6, z: 0.3 }, new THREE.Vector3(13.2, 2.3, 0), material);
  box(barrier, { x: 26.2, y: 0.18, z: 0.24 }, new THREE.Vector3(0, 4.3, 0), material);
  const net = box(barrier, { x: 25.8, y: 3.3, z: 0.08 }, new THREE.Vector3(0, 2.35, 0), netMaterial);
  // Glitch fix: a translucent net was casting as an opaque rectangular shadow slab.
  net.userData.noShadow = true;
  net.renderOrder = 3;
  barrier.position.z = -43;
  return barrier;
}

export function createCarrierRecoveryMaterials(barrierMaterial = null) {
  const paint = depthBiasDeckMaterial(
    makeMaterial(0xdad8c7, 0.68, 0.01, 0x000000, { grain: 0.06 }),
  );
  const yellowPaint = depthBiasDeckMaterial(
    makeMaterial(0xc7a94f, 0.7, 0.01, 0x000000, { grain: 0.08 }),
  );
  const skidMat = depthBiasDeckMaterial(makeMaterial(0x0b0f10, 1.0, 0.01));
  const laneMat = depthBiasDeckMaterial(makeMaterial(0x303739, 0.95, 0.04));
  const barrierNet = makeMaterial(0x9aa6a5, 0.86, 0.03, 0x000000, { grain: 0.04 });
  barrierNet.transparent = true;
  barrierNet.opacity = 0.28;
  barrierNet.depthWrite = false;
  return {
    paint,
    yellowPaint,
    skidMat,
    laneMat,
    barrierMaterial: barrierMaterial ?? makeMaterial(0x6b777b, 0.58, 0.045, 0x010202,
      { grain: 0.08, grainScale: 0.9 }),
    barrierNet,
  };
}

export function createOpticalLandingSystem() {
  const group = new THREE.Group();
  group.name = "CarrierOpticalLandingSystem";
  // Wire-three-relative placement at the port quarter. Points retain a minimum raster footprint
  // at approach range, which models the visual salience of real high-intensity lamps better than
  // sub-pixel geometry while remaining occluded by the ship through normal depth testing.
  group.position.set(-15.2, 0.86, 81.5);

  const points = (name, positions, color, size) => {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
      color,
      size,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.96,
      depthWrite: false,
      toneMapped: false,
      blending: THREE.AdditiveBlending,
    });
    const result = new THREE.Points(geometry, material);
    result.name = name;
    result.frustumCulled = false;
    result.renderOrder = 18;
    result.userData.noShadow = true;
    group.add(result);
    return result;
  };

  const datum = points("OLS_DATUM_LIGHTS", [
    -1.2, 0, 0, -0.82, 0, 0, -0.44, 0, 0,
    0.44, 0, 0, 0.82, 0, 0, 1.2, 0, 0,
  ], 0x72ff8f, 3.5);
  const ball = points("OLS_MEATBALL", [0, 0, 0], 0xffc343, 6.2);
  const waveOff = points("OLS_WAVEOFF_LIGHTS", [
    -1.48, 0.74, 0, 1.48, 0.74, 0,
    -1.48, -0.74, 0, 1.48, -0.74, 0,
  ], 0xff351f, 5.2);
  waveOff.visible = false;
  return { group, datum, ball, waveOff };
}

export function createCarrierRecoveryOverlay(materials) {
  // The recovery overlay is deliberately independent of the hull. Authored ships keep their GLB
  // silhouette while this small layer rotates to the kernel landing heading and highlights wires.
  const group = new THREE.Group();
  group.name = "CarrierRecoveryOverlay";
  const landingArea = new THREE.Group();
  landingArea.name = "CarrierLandingArea";
  group.add(landingArea);
  deckOverlayBox(landingArea, { x: 25.2, y: 0.065, z: 208 }, new THREE.Vector3(0, 0.065, -44), materials.laneMat);
  addDeckWear(landingArea, materials.skidMat);
  deckOverlayBox(landingArea, { x: 0.62, y: 0.09, z: 202 }, new THREE.Vector3(0, 0.12, -43), materials.paint);
  deckOverlayBox(landingArea, { x: 0.26, y: 0.085, z: 204 }, new THREE.Vector3(-11.9, 0.115, -43), materials.paint);
  deckOverlayBox(landingArea, { x: 0.26, y: 0.085, z: 204 }, new THREE.Vector3(11.9, 0.115, -43), materials.paint);
  deckOverlayBox(landingArea, { x: 25, y: 0.10, z: 1.7 }, new THREE.Vector3(0, 0.14, 0), materials.paint);
  deckOverlayBox(landingArea, { x: 0.42, y: 0.11, z: 30 }, new THREE.Vector3(-5.5, 0.15, 1), materials.yellowPaint);
  deckOverlayBox(landingArea, { x: 0.42, y: 0.11, z: 30 }, new THREE.Vector3(5.5, 0.15, 1), materials.yellowPaint);

  const wires = [];
  for (let wire = 1; wire <= 4; wire++) {
    const wireMaterial = makeMaterial(0xc9b47a, 0.38, 0.72, 0x000000,
      { grain: 0.035, grainScale: 8, specularIntensity: 0.9, envMapIntensity: 1.0 });
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.105, 0.105, 23.5, 10), wireMaterial);
    mesh.rotation.z = Math.PI / 2;
    mesh.position.set(0, 0.24, (3 - wire) * 5.2);
    mesh.castShadow = true;
    landingArea.add(mesh);
    wires.push(mesh);
  }

  const barrier = createBarrier(materials.barrierMaterial, materials.barrierNet);
  const ols = createOpticalLandingSystem();
  landingArea.add(ols.group);
  group.add(barrier);
  return { group, landingArea, wires, barrier, ols, highlightedWire: 0 };
}

export function createCarrierWaterPresentation() {
  const group = new THREE.Group();
  group.name = "CarrierWaterEffects";
  const wake = createWakeMaterial();
  const wakeMesh = new THREE.Mesh(createWakeGeometry(), wake.material);
  wakeMesh.frustumCulled = false;
  wakeMesh.renderOrder = -2;
  const bowWake = createWakeMaterial(true);
  const bowWakeMesh = new THREE.Mesh(createWakeGeometry(-131, 118, 13.5, 28), bowWake.material);
  bowWakeMesh.frustumCulled = false;
  bowWakeMesh.renderOrder = -1;
  const spray = createCarrierSpray();
  group.add(wakeMesh, bowWakeMesh, spray.points);
  return {
    group,
    wakes: [wakeMesh, bowWakeMesh],
    wakeUniforms: [wake.uniforms, bowWake.uniforms],
    spray: spray.points,
    sprayUniforms: spray.uniforms,
  };
}

export function createCarrier(context = {}) {
  // Essex-like straight deck authored in the same local frame the old deck used: local -Z is the
  // bow, +X is starboard, and y=0 is the landing surface. updateCarrierVisual() scales it from the
  // kernel deck fields and app.js applies the established (x, y, -z), rotation.y=-heading transform.
  const group = new THREE.Group();
  const structure = new THREE.Group();
  group.add(structure);

  const hullMat = makeMaterial(0x3c4950, 0.66, 0.06, 0x010203,
    { grain: 0.13, grainScale: 0.19, hullBands: true, envMapIntensity: 0.62 });
  const hullDark = makeMaterial(0x202b31, 0.78, 0.05, 0x000101, { grain: 0.11 });
  const deckMat = makeMaterial(0x292f30, 0.77, 0.04, 0x010202,
    { grain: 0.18, grainScale: 0.34, specularIntensity: 0.5 });
  const islandMat = makeMaterial(0x59666c, 0.61, 0.05, 0x010202,
    { grain: 0.1, grainScale: 0.8 });
  const islandLight = makeMaterial(0x6b777b, 0.58, 0.045, 0x010202,
    { grain: 0.08, grainScale: 0.9 });
  const aircraftMat = makeMaterial(0x687577, 0.54, 0.07, 0x000101,
    { grain: 0.09, grainScale: 1.7 });
  const glass = makeMaterial(0x0e2833, 0.13, 0.03, 0x02090c,
    { grain: 0, clearcoat: 1, clearcoatRoughness: 0.1, specularIntensity: 1, envMapIntensity: 1.25 });
  const recoveryMaterials = createCarrierRecoveryMaterials(islandLight);
  const { yellowPaint } = recoveryMaterials;
  const seamMat = depthBiasDeckMaterial(makeMaterial(0x111719, 0.96, 0.02));
  const deckPatchMat = depthBiasDeckMaterial(makeMaterial(0x202b31, 0.78, 0.05, 0x000101,
    { grain: 0.11 }));
  const catwalkMat = makeMaterial(0x27343a, 0.86, 0.18);
  // Glitch fix: translucent rails wrote depth and intermittently punched holes in later effects.
  const railMat = new THREE.LineBasicMaterial({
    color: 0x718087, transparent: true, opacity: 0.72, depthWrite: false,
  });
  const deckLampMat = makeMaterial(0xb6d6cf, 0.32, 0.25, 0x315e58);

  const hull = new THREE.Mesh(createHullGeometry(), hullMat);
  // Glitch fix: large ship surfaces must not disappear from child-mesh bounds at screen edges.
  hull.frustumCulled = false;
  structure.add(hull);
  const flightDeck = box(structure, { x: 30, y: 1.8, z: 250 }, new THREE.Vector3(0, -0.9, 0), deckMat);
  flightDeck.frustumCulled = false;
  const roundDown = new THREE.Mesh(createRoundDownGeometry(), deckMat);
  roundDown.frustumCulled = false;
  structure.add(roundDown);
  addDeckSeams(structure, seamMat);
  addDeckTieDowns(structure, seamMat);
  addDeckEdgeDetail(structure, catwalkMat, railMat);
  addDeckEdgeLights(structure, deckLampMat);
  box(structure, { x: 27.5, y: 3.0, z: 226 }, new THREE.Vector3(0, -3.05, 2), hullDark);
  box(structure, { x: 31.2, y: 0.32, z: 218 }, new THREE.Vector3(0, -2.0, 2), islandMat);

  // The landing-area group rotates independently of the ship for the nine-degree angled deck.
  // It is anchored at wire three; local -Z is rollout/bolter direction.
  const recovery = createCarrierRecoveryOverlay(recoveryMaterials);
  structure.add(recovery.group);
  deckOverlayBox(structure, { x: 8.0, y: 0.08, z: 0.32 }, new THREE.Vector3(-7.7, 0.09, -37), yellowPaint);
  deckOverlayBox(structure, { x: 8.0, y: 0.08, z: 0.32 }, new THREE.Vector3(7.7, 0.09, -37), yellowPaint);
  deckOverlayBox(structure, { x: 10.5, y: 0.07, z: 20 }, new THREE.Vector3(-7.4, 0.075, -15), deckPatchMat);
  deckOverlayBox(structure, { x: 11.0, y: 0.07, z: 20 }, new THREE.Vector3(7.2, 0.075, 24), deckPatchMat);

  // Starboard island: stepped bridge, dark glazing, funnel, lattice mast and a simple radar yard.
  beveledBox(structure, { x: 7.2, y: 4.8, z: 27 }, new THREE.Vector3(10.8, 2.35, -25), islandMat, 0.32);
  beveledBox(structure, { x: 6.5, y: 5.6, z: 18 }, new THREE.Vector3(10.7, 7.45, -29), islandLight, 0.28);
  beveledBox(structure, { x: 7.6, y: 3.8, z: 13 }, new THREE.Vector3(10.4, 12.0, -33), islandMat, 0.24);
  box(structure, { x: 6.6, y: 0.9, z: 10.5 }, new THREE.Vector3(10.3, 12.7, -39.7), glass);
  box(structure, { x: 0.3, y: 0.9, z: 10.0 }, new THREE.Vector3(6.45, 12.7, -33), glass);
  verticalCylinder(structure, 2.0, 8.4, new THREE.Vector3(11.2, 17.0, -20), hullDark, 12);
  verticalCylinder(structure, 0.34, 13.5, new THREE.Vector3(10.7, 24.0, -34), islandLight, 10);
  box(structure, { x: 10.5, y: 0.26, z: 0.34 }, new THREE.Vector3(10.7, 27.4, -34), islandLight);
  box(structure, { x: 0.28, y: 0.26, z: 6.5 }, new THREE.Vector3(10.7, 27.4, -34), islandLight);
  box(structure, { x: 5.8, y: 1.3, z: 0.22 }, new THREE.Vector3(10.7, 29.5, -34), islandLight);

  // Port-quarter LSO platform and lens: a small but distinctive recovery cue on short final.
  box(structure, { x: 3.4, y: 0.34, z: 4.8 }, new THREE.Vector3(-16.4, -0.35, 82), catwalkMat);
  box(structure, { x: 0.18, y: 1.35, z: 2.9 }, new THREE.Vector3(-17.65, 0.34, 82), islandLight);
  // The recovery overlay owns the actual datum/ball/wave-off lamps so authored and procedural
  // hulls receive identical live glideslope behaviour.

  // Side sponsons and compact gun tubs strengthen the period silhouette without cluttering final.
  for (const x of [-15.1, 15.1]) {
    for (const z of [-67, 69]) {
      box(structure, { x: 3.8, y: 0.7, z: 9 }, new THREE.Vector3(x, -1.7, z), hullDark);
      verticalCylinder(structure, 1.15, 0.75, new THREE.Vector3(x, -0.95, z), islandMat, 10);
    }
  }
  addParkedAircraft(structure, aircraftMat, glass);
  addCarrierContactShadows(structure);

  const water = createCarrierWaterPresentation();
  group.add(water.group);

  const sockets = Object.freeze({
    deckOrigin: addSemanticSocket(structure, "SOCKET_DECK_ORIGIN", 0, 0, 0),
    recoveryThreshold: addSemanticSocket(structure, "SOCKET_RECOVERY_THRESHOLD", 0, 0.2, 112),
    bowReference: addSemanticSocket(structure, "SOCKET_BOW_REFERENCE", 0, -1.7, -128),
    wakeOrigin: addSemanticSocket(structure, "SOCKET_WAKE_ORIGIN", 0, 0, 116),
  });

  structure.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = object.userData.noShadow !== true;
    object.receiveShadow = true;
  });
  group.userData.structure = structure;
  group.userData.hull = hull;
  group.userData.landingArea = recovery.landingArea;
  group.userData.wires = recovery.wires;
  group.userData.barrier = recovery.barrier;
  group.userData.recoveryPresentation = recovery;
  group.userData.wakes = water.wakes;
  group.userData.wakeUniforms = water.wakeUniforms;
  group.userData.spray = water.spray;
  group.userData.sprayUniforms = water.sprayUniforms;
  group.userData.sockets = sockets;
  annotateProceduralFallback(group, context);
  return group;
}

export function createCarrierRuntimePresentation() {
  const recovery = createCarrierRecoveryOverlay(createCarrierRecoveryMaterials());
  const water = createCarrierWaterPresentation();
  recovery.group.visible = false;
  water.group.visible = false;
  return {
    recovery,
    water,
    poseScratch: {
      yawQuaternion: new THREE.Quaternion(),
      pitchQuaternion: new THREE.Quaternion(),
      xAxis: new THREE.Vector3(1, 0, 0),
      yAxis: new THREE.Vector3(0, 1, 0),
    },
  };
}

export function createLoftGeometry(stations, radialSegments = 18) {
  const positions = [];
  const indices = [];
  for (const station of stations) {
    for (let segment = 0; segment < radialSegments; segment++) {
      const theta = segment / radialSegments * Math.PI * 2;
      positions.push(
        Math.cos(theta) * station.rx,
        station.y + Math.sin(theta) * station.ry,
        station.z,
      );
    }
  }
  for (let station = 0; station < stations.length - 1; station++) {
    const a = station * radialSegments;
    const b = a + radialSegments;
    for (let segment = 0; segment < radialSegments; segment++) {
      const next = (segment + 1) % radialSegments;
      indices.push(a + segment, a + next, b + segment);
      indices.push(a + next, b + next, b + segment);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createPlanformGeometry(points, thickness = 0.16, bevel = 0.045) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: Math.max(0.02, thickness - bevel * 2),
    steps: 1,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: bevel,
    bevelThickness: bevel,
    curveSegments: 1,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, thickness * 0.5, 0);
  geometry.computeVertexNormals();
  return geometry;
}

export function createFinGeometry(points, thickness = 0.12) {
  const shape = new THREE.Shape();
  shape.moveTo(points[0][0], points[0][1]);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i][0], points[i][1]);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: thickness * 0.55,
    bevelEnabled: true,
    bevelSegments: 1,
    bevelSize: thickness * 0.22,
    bevelThickness: thickness * 0.22,
    steps: 1,
  });
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(thickness * 0.5, 0, 0);
  geometry.computeVertexNormals();
  return geometry;
}

export function addFighterPanelLines(group, material) {
  const positions = [];
  const add = (ax, ay, az, bx, by, bz) => positions.push(ax, ay, az, bx, by, bz);
  for (const side of [-1, 1]) {
    add(side * 0.9, 0.215, -2.78, side * 4.82, 0.215, 0.42);
    add(side * 1.35, 0.218, -1.58, side * 4.18, 0.218, 0.77);
    add(side * 1.7, 0.218, 0.72, side * 4.66, 0.218, 0.82);
    add(side * 0.72, 0.22, 3.05, side * 2.75, 0.22, 4.28);
  }
  // Glitch fix: the former ring radii were inside the fuselage, so the lines popped through it.
  const rings = [
    [0.25, 0.82, 0.76, 0.1],
    [1.75, 0.77, 0.71, 0.1],
    [3.15, 0.67, 0.61, 0.1],
  ];
  const ringSegments = 14;
  for (const [z, radiusX, radiusY, centreY] of rings) {
    for (let i = 0; i < ringSegments; i++) {
      const a = i / ringSegments * Math.PI * 2;
      const b = (i + 1) / ringSegments * Math.PI * 2;
      add(Math.cos(a) * radiusX, centreY + Math.sin(a) * radiusY, z,
        Math.cos(b) * radiusX, centreY + Math.sin(b) * radiusY, z);
    }
  }
  const lines = new THREE.LineSegments(
    new THREE.BufferGeometry().setAttribute("position", new THREE.Float32BufferAttribute(positions, 3)),
    material,
  );
  lines.renderOrder = 2;
  group.add(lines);
}

export function createDrone(context = {}) {
  const group = new THREE.Group();
  const livery = context?.parameters?.livery;
  const navyLivery = livery === "navy-blue";
  const skin = makeMaterial(navyLivery ? 0x405a68 : 0x667276, 0.48, 0.075, 0x010202,
    { grain: 0.12, grainScale: 2.3, panels: 0.025, panelScale: 0.52, envMapIntensity: 0.92 });
  const skinDark = makeMaterial(navyLivery ? 0x263c4b : 0x465157, 0.56, 0.055, 0x010202,
    { grain: 0.1, grainScale: 2.7, envMapIntensity: 0.78 });
  const underside = makeMaterial(0x303a3f, 0.62, 0.045, 0x000101,
    { grain: 0.11, grainScale: 2.1, envMapIntensity: 0.65 });
  const edge = makeMaterial(0x171f23, 0.64, 0.05, 0x000000, { grain: 0.06 });
  const intake = makeMaterial(0x080d0f, 0.38, 0.12, 0x000000,
    { grain: 0.03, envMapIntensity: 0.3 });
  const canopy = makeMaterial(0x102e3a, 0.095, 0.02, 0x02090d,
    { grain: 0, clearcoat: 1, clearcoatRoughness: 0.065, specularIntensity: 1, envMapIntensity: 1.35 });

  // The primary wing is a shallow beveled solid, so it catches a narrow leading-edge highlight
  // instead of disappearing as a two-sided card. Aircraft local -Z remains forward throughout.
  const wingPoints = [
    [0, -3.72], [-0.74, -3.36], [-2.05, -2.26], [-5.42, 0.18], [-5.18, 0.98],
    [-2.05, 0.72], [-1.52, 3.48], [0, 3.88], [1.52, 3.48], [2.05, 0.72],
    [5.18, 0.98], [5.42, 0.18], [2.05, -2.26], [0.74, -3.36],
  ];
  const wing = new THREE.Mesh(createPlanformGeometry(wingPoints, 0.18, 0.052), [skin, skinDark]);
  wing.position.y = 0.03;
  group.add(wing);

  const tailPoints = [
    [0, 2.62], [-0.7, 2.72], [-3.0, 4.04], [-2.86, 4.62], [-0.72, 4.23],
    [0, 4.52], [0.72, 4.23], [2.86, 4.62], [3.0, 4.04], [0.7, 2.72],
  ];
  const tailplane = new THREE.Mesh(createPlanformGeometry(tailPoints, 0.14, 0.038), [skin, edge]);
  tailplane.position.y = 0.17;
  group.add(tailplane);

  const fuselage = new THREE.Mesh(createLoftGeometry([
    { z: -6.65, rx: 0.025, ry: 0.025, y: 0.02 },
    { z: -5.65, rx: 0.34, ry: 0.30, y: 0.04 },
    { z: -4.35, rx: 0.62, ry: 0.54, y: 0.08 },
    { z: -2.6, rx: 0.78, ry: 0.72, y: 0.11 },
    { z: -0.2, rx: 0.82, ry: 0.76, y: 0.10 },
    { z: 2.55, rx: 0.70, ry: 0.64, y: 0.09 },
    { z: 4.65, rx: 0.48, ry: 0.43, y: 0.1 },
    { z: 5.65, rx: 0.18, ry: 0.17, y: 0.1 },
  ]), skin);
  group.add(fuselage);

  // Separate shoulder nacelles, recessed intake faces and hot-metal exhaust rings make the target
  // read as a powered fighter from front and rear quarters, where most padlock views live.
  for (const side of [-1, 1]) {
    const nacelle = new THREE.Mesh(createLoftGeometry([
      { z: -2.75, rx: 0.48, ry: 0.38, y: -0.12 },
      { z: -1.8, rx: 0.62, ry: 0.48, y: -0.08 },
      { z: 2.9, rx: 0.58, ry: 0.45, y: -0.04 },
      { z: 4.65, rx: 0.43, ry: 0.36, y: 0.0 },
    ], 14), underside);
    nacelle.position.x = side * 1.08;
    group.add(nacelle);

    const intakeFace = new THREE.Mesh(new THREE.CircleGeometry(0.43, 18), intake);
    intakeFace.scale.y = 0.76;
    intakeFace.position.set(side * 1.08, -0.12, -2.765);
    intakeFace.rotation.y = Math.PI;
    group.add(intakeFace);
    const intakeLip = new THREE.Mesh(new THREE.TorusGeometry(0.46, 0.055, 6, 18), skinDark);
    intakeLip.scale.y = 0.76;
    intakeLip.position.copy(intakeFace.position);
    group.add(intakeLip);

    const exhaustFace = new THREE.Mesh(
      new THREE.CircleGeometry(0.35, 18),
      // Glitch fix: translucent exhaust discs wrote opaque depth and popped against the nacelles.
      new THREE.MeshBasicMaterial({
        color: 0xdf6f28,
        transparent: true,
        opacity: 0.56,
        depthWrite: false,
      }),
    );
    exhaustFace.position.set(side * 1.08, 0.0, 4.67);
    exhaustFace.userData.noShadow = true;
    exhaustFace.renderOrder = 1;
    group.add(exhaustFace);
    const exhaustRing = new THREE.Mesh(new THREE.TorusGeometry(0.39, 0.065, 7, 18), edge);
    exhaustRing.position.copy(exhaustFace.position);
    group.add(exhaustRing);
  }

  const canopyMesh = new THREE.Mesh(new THREE.SphereGeometry(0.62, 20, 12), canopy);
  canopyMesh.scale.set(0.88, 0.72, 2.25);
  canopyMesh.position.set(0, 0.72, -2.55);
  group.add(canopyMesh);
  box(group, new THREE.Vector3(0.075, 0.055, 2.45), new THREE.Vector3(0, 1.11, -2.35), edge);
  box(group, new THREE.Vector3(1.02, 0.055, 0.075), new THREE.Vector3(0, 1.08, -1.55), edge);

  const finGeometry = createFinGeometry([
    [1.72, 0.0], [4.62, 0.0], [4.1, 2.55], [3.38, 3.04], [2.45, 0.3],
  ]);
  for (const side of [-1, 1]) {
    const fin = new THREE.Mesh(finGeometry, [skinDark, edge]);
    fin.position.set(side * 1.04, 0.24, 0);
    fin.rotation.z = side * -0.2;
    group.add(fin);
  }

  addFighterPanelLines(group, new THREE.LineBasicMaterial({
    // Glitch fix: transparent linework must not occlude later transparent combat effects.
    color: 0x1b2529, transparent: true, opacity: 0.46, depthWrite: false,
  }));

  const leftLight = new THREE.Mesh(
    new THREE.SphereGeometry(0.09, 8, 6),
    new THREE.MeshBasicMaterial({ color: 0xff4b58, toneMapped: false }),
  );
  leftLight.position.set(-5.28, 0.21, 0.55);
  leftLight.userData.noShadow = true;
  group.add(leftLight);
  const rightLight = leftLight.clone();
  rightLight.material = new THREE.MeshBasicMaterial({ color: 0x62ffc0, toneMapped: false });
  rightLight.position.x = 5.28;
  rightLight.userData.noShadow = true;
  group.add(rightLight);

  const sockets = Object.freeze({
    cockpitCamera: addSemanticSocket(group, "SOCKET_CAMERA_COCKPIT", 0, 0.86, -2.48),
    muzzleLeft: addSemanticSocket(group, "SOCKET_MUZZLE_LEFT", -0.48, -0.08, -5.45),
    muzzleRight: addSemanticSocket(group, "SOCKET_MUZZLE_RIGHT", 0.48, -0.08, -5.45),
  });

  group.traverse((object) => {
    if (!object.isMesh) return;
    object.castShadow = object.userData.noShadow !== true;
    object.receiveShadow = true;
  });
  group.userData.sockets = sockets;
  annotateProceduralFallback(group, context);
  return group;
}

export function createFireballMaterial(coreColor, edgeColor) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAlpha: { value: 0 },
      uAge: { value: 0 },
      uCoreColor: { value: new THREE.Color(coreColor) },
      uEdgeColor: { value: new THREE.Color(edgeColor) },
      uFogColor: { value: new THREE.Color(0x7898a0) },
      uFogDensity: { value: 0.000055 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      varying vec3 vFirePosition;
      varying vec3 vFireNormal;
      varying vec3 vFireView;
      varying vec3 vFireWorld;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vFirePosition = position;
        vFireWorld = world.xyz;
        vFireNormal = normalize(normalMatrix * normal);
        vec4 view = viewMatrix * world;
        vFireView = -view.xyz;
        gl_Position = projectionMatrix * view;
        // Glitch fix: conventional effect depth caused occlusion pops in a logarithmic-depth scene.
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uAlpha;
      uniform float uAge;
      uniform vec3 uCoreColor;
      uniform vec3 uEdgeColor;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying vec3 vFirePosition;
      varying vec3 vFireNormal;
      varying vec3 vFireView;
      varying vec3 vFireWorld;
      #include <logdepthbuf_pars_fragment>
      void main() {
        vec3 p = normalize(vFirePosition);
        float billow = sin(p.x * 11.0 + p.y * 7.0 - uAge * 8.0);
        billow += sin(p.z * 17.0 - p.x * 5.0 + uAge * 5.3) * 0.55;
        billow += sin((p.x + p.y - p.z) * 25.0 - uAge * 11.0) * 0.23;
        billow = billow * 0.22 + 0.55;
        float facing = max(dot(normalize(vFireNormal), normalize(vFireView)), 0.0);
        float softEdge = smoothstep(0.0, 0.42, facing);
        float hot = smoothstep(0.34, 0.78, billow + facing * 0.24);
        vec3 color = mix(uEdgeColor, uCoreColor, hot);
        float fog = 1.0 - exp(-uFogDensity * uFogDensity
          * dot(vFireWorld - cameraPosition, vFireWorld - cameraPosition));
        color = mix(color, uFogColor, fog);
        gl_FragColor = vec4(color, uAlpha * softEdge * (0.66 + billow * 0.45)
          * (1.0 - fog * 0.88));
        #include <logdepthbuf_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

export function createSmokePuffMaterial(color) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uAlpha: { value: 0 },
      uAge: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uFogColor: { value: new THREE.Color(0x7898a0) },
      uFogDensity: { value: 0.000055 },
    },
    transparent: true,
    depthWrite: false,
    vertexShader: /* glsl */ `
      varying vec3 vSmokePosition;
      varying vec3 vSmokeNormal;
      varying vec3 vSmokeView;
      varying vec3 vSmokeWorld;
      #include <common>
      #include <logdepthbuf_pars_vertex>
      void main() {
        vSmokePosition = position;
        vSmokeWorld = (modelMatrix * vec4(position, 1.0)).xyz;
        vSmokeNormal = normalize(normalMatrix * normal);
        vec4 view = modelViewMatrix * vec4(position, 1.0);
        vSmokeView = -view.xyz;
        gl_Position = projectionMatrix * view;
        // Glitch fix: smoke used linear depth against logarithmic world geometry and flickered out.
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uAlpha;
      uniform float uAge;
      uniform vec3 uColor;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      varying vec3 vSmokePosition;
      varying vec3 vSmokeNormal;
      varying vec3 vSmokeView;
      varying vec3 vSmokeWorld;
      #include <logdepthbuf_pars_fragment>
      void main() {
        vec3 p = normalize(vSmokePosition);
        float detail = sin(p.x * 9.0 + p.y * 13.0 + uAge * 0.7);
        detail += sin(p.z * 16.0 - p.x * 7.0 - uAge * 0.43) * 0.45;
        float facing = max(dot(normalize(vSmokeNormal), normalize(vSmokeView)), 0.0);
        float softEdge = smoothstep(0.02, 0.52 + detail * 0.055, facing);
        vec3 smokeColor = uColor * (0.84 + detail * 0.045 + facing * 0.11);
        float fog = 1.0 - exp(-uFogDensity * uFogDensity
          * dot(vSmokeWorld - cameraPosition, vSmokeWorld - cameraPosition));
        smokeColor = mix(smokeColor, uFogColor, fog);
        gl_FragColor = vec4(smokeColor, uAlpha * softEdge * (1.0 - fog * 0.72));
        #include <logdepthbuf_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
}

export function createBanditDestruction() {
  // Built once, then animated by transforms and pre-existing shader uniforms. The authoritative
  // damaged aircraft continues moving through impact/settling while this marks event edges.
  const group = new THREE.Group();
  const sphere = new THREE.SphereGeometry(1, 14, 10);
  const outerMaterial = createFireballMaterial(0xffb13b, 0xe8380c);
  const innerMaterial = createFireballMaterial(0xfff0a0, 0xff731c);
  const outer = new THREE.Mesh(sphere, outerMaterial);
  const inner = new THREE.Mesh(sphere, innerMaterial);
  outer.renderOrder = 12;
  inner.renderOrder = 13;
  group.add(outer, inner);

  const shockwaveMaterial = new THREE.MeshBasicMaterial({
    color: 0xffb14c,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const shockwave = new THREE.Mesh(new THREE.TorusGeometry(1, 0.075, 6, 28), shockwaveMaterial);
  shockwave.renderOrder = 14;
  group.add(shockwave);

  const debrisDirections = new Float32Array([
    -0.82, 0.28, 0.49,  0.76, 0.45, -0.47, -0.52, 0.81, 0.27,
     0.46, 0.75, 0.48, -0.19, -0.38, 0.90,  0.25, -0.72, -0.65,
     0.91, -0.08, 0.39, -0.68, -0.48, 0.56,  0.36, 0.19, -0.91,
    -0.31, 0.91, 0.27,  0.61, -0.31, 0.72, -0.56, 0.52, -0.64,
     0.12, 0.98, -0.18, -0.94, 0.09, -0.32,  0.84, 0.22, 0.50,
     0.47, -0.73, 0.50, -0.39, -0.61, -0.69,  0.03, 0.56, 0.83,
  ]);
  const debrisPositions = new Float32Array(debrisDirections.length);
  const debrisGeometry = new THREE.BufferGeometry();
  debrisGeometry.setAttribute("position",
    new THREE.BufferAttribute(debrisPositions, 3).setUsage(THREE.DynamicDrawUsage));
  const debris = new THREE.Points(debrisGeometry, new THREE.PointsMaterial({
    color: 0xffc260,
    size: 2.8,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  }));
  debris.frustumCulled = false;
  debris.renderOrder = 15;
  group.add(debris);

  const smokeDirections = [
    [-0.62, 0.72, -0.18], [0.38, 0.86, 0.31], [0.72, 0.48, -0.44],
    [-0.28, 0.94, 0.52], [0.12, 1.0, -0.68], [-0.78, 0.58, 0.41],
  ];
  const smoke = [];
  for (let i = 0; i < smokeDirections.length; i++) {
    const material = createSmokePuffMaterial(i < 2 ? 0x3b3530 : 0x252a2c);
    const puff = new THREE.Mesh(sphere, material);
    puff.userData.direction = new THREE.Vector3(
      smokeDirections[i][0], smokeDirections[i][1], smokeDirections[i][2],
    ).normalize();
    puff.userData.delay = i * 0.1;
    puff.renderOrder = 11;
    smoke.push(puff);
    group.add(puff);
  }

  const flash = new THREE.PointLight(0xff6a22, 0, 95, 2);
  group.add(flash);
  group.userData.outer = outer;
  group.userData.inner = inner;
  group.userData.shockwave = shockwave;
  group.userData.debris = debris;
  group.userData.debrisDirections = debrisDirections;
  group.userData.debrisPositions = debrisPositions;
  group.userData.smoke = smoke;
  group.userData.flash = flash;
  group.visible = false;
  return group;
}

export function createTracerChannel(lineColor, glowColor, headColor) {
  const positions = new Float32Array(MAX_TRACERS * 2 * 3);
  const tracerGeometry = new THREE.BufferGeometry();
  tracerGeometry.setAttribute("position",
    new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage));
  tracerGeometry.setDrawRange(0, 0);
  const tracers = new THREE.LineSegments(
    tracerGeometry,
    new THREE.LineBasicMaterial({
      color: lineColor,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  tracers.frustumCulled = false;
  tracers.renderOrder = 20;
  const tracerGlow = new THREE.LineSegments(
    tracerGeometry,
    new THREE.LineBasicMaterial({
      color: glowColor,
      transparent: true,
      opacity: 0.44,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  tracerGlow.frustumCulled = false;
  tracerGlow.renderOrder = 19;

  const headPositions = new Float32Array(MAX_TRACERS * 3);
  const tracerHeadGeometry = new THREE.BufferGeometry();
  tracerHeadGeometry.setAttribute("position",
    new THREE.BufferAttribute(headPositions, 3).setUsage(THREE.DynamicDrawUsage));
  tracerHeadGeometry.setDrawRange(0, 0);
  const tracerHeads = new THREE.Points(
    tracerHeadGeometry,
    new THREE.PointsMaterial({
      color: headColor,
      size: 2.25,
      sizeAttenuation: false,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    }),
  );
  tracerHeads.frustumCulled = false;
  tracerHeads.renderOrder = 21;

  return { tracers, glow: tracerGlow, heads: tracerHeads, positions, headPositions };
}

export function createMuzzleChannel(color, lightColor) {
  const muzzleMaterial = new THREE.MeshBasicMaterial({
    color,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const flash = new THREE.Mesh(new THREE.SphereGeometry(0.55, 8, 6), muzzleMaterial);
  flash.visible = false;
  flash.renderOrder = 22;
  const coneGeometry = new THREE.ConeGeometry(0.46, 3.6, 8);
  coneGeometry.rotateX(-Math.PI / 2);
  const cone = new THREE.Mesh(coneGeometry, muzzleMaterial.clone());
  cone.visible = false;
  cone.renderOrder = 22;
  const light = new THREE.PointLight(lightColor, 0, 38, 2);
  return { flash, cone, light };
}

export function createGunEffects() {
  // Every GPU object and backing array is allocated once. The flight loop only overwrites these
  // buffers, so two simultaneous bursts cannot create a garbage-collector hitch at payoff.
  const outgoingTracers = createTracerChannel(0xffd36a, 0xff731d, 0xfff0b0);
  const incomingTracers = createTracerChannel(0xff8b68, 0xff2d1d, 0xffe2c4);
  const playerMuzzle = createMuzzleChannel(0xffd45c, 0xffa42c);
  const playerMuzzleRight = createMuzzleChannel(0xffd45c, 0xffa42c);
  const opponentMuzzle = createMuzzleChannel(0xff8b52, 0xff5128);
  const opponentMuzzleRight = createMuzzleChannel(0xff8b52, 0xff5128);

  const sparkDirections = new Float32Array([
    -0.88, 0.22, 0.42,  0.84, 0.36, -0.40, -0.48, 0.78, -0.39,
     0.52, 0.72, 0.46, -0.18, -0.42, 0.89,  0.22, -0.75, -0.63,
     0.94, -0.13, 0.31, -0.71, -0.54, 0.44,  0.38, 0.15, -0.91,
    -0.28, 0.93, 0.24,  0.63, -0.36, 0.69, -0.57, 0.48, -0.67,
  ]);
  const sparkPositions = new Float32Array(sparkDirections.length);
  const sparkGeometry = new THREE.BufferGeometry();
  sparkGeometry.setAttribute("position",
    new THREE.BufferAttribute(sparkPositions, 3).setUsage(THREE.DynamicDrawUsage));
  const sparkMaterial = new THREE.PointsMaterial({
    color: 0xffc34e,
    size: 3.2,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sparks = new THREE.Points(sparkGeometry, sparkMaterial);
  sparks.visible = false;
  sparks.frustumCulled = false;
  sparks.renderOrder = 21;
  const hitLight = new THREE.PointLight(0xff8b27, 0, 42, 2);

  const group = new THREE.Group();
  group.add(
    outgoingTracers.glow, outgoingTracers.tracers, outgoingTracers.heads,
    incomingTracers.glow, incomingTracers.tracers, incomingTracers.heads,
    playerMuzzle.flash, playerMuzzle.cone, playerMuzzle.light,
    playerMuzzleRight.flash, playerMuzzleRight.cone, playerMuzzleRight.light,
    opponentMuzzle.flash, opponentMuzzle.cone, opponentMuzzle.light,
    opponentMuzzleRight.flash, opponentMuzzleRight.cone, opponentMuzzleRight.light,
    sparks, hitLight,
  );
  group.userData.outgoingTracers = outgoingTracers;
  group.userData.incomingTracers = incomingTracers;
  group.userData.playerMuzzle = playerMuzzle;
  group.userData.playerMuzzleRight = playerMuzzleRight;
  group.userData.opponentMuzzle = opponentMuzzle;
  group.userData.opponentMuzzleRight = opponentMuzzleRight;
  group.userData.sparks = sparks;
  group.userData.sparkPositions = sparkPositions;
  group.userData.sparkDirections = sparkDirections;
  group.userData.hitLight = hitLight;
  return group;
}

export function createGlider() {
  const group = new THREE.Group();
  const white = makeMaterial(0xdce4e5, 0.56, 0.12);
  const dark = makeMaterial(0x29353a, 0.72, 0.2);

  cylinder(group, 0.28, 5.8, new THREE.Vector3(0, 0, 0), white, 14);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.28, 1.15, 14), white);
  nose.rotation.x = -Math.PI / 2;
  nose.position.z = -3.45;
  group.add(nose);
  box(group, new THREE.Vector3(22, 0.1, 0.88), new THREE.Vector3(0, 0.08, -0.2), white);
  box(group, new THREE.Vector3(4.5, 0.08, 0.62), new THREE.Vector3(0, 0.25, 2.45), dark);
  box(group, new THREE.Vector3(0.1, 1.6, 1.0), new THREE.Vector3(0, 0.75, 2.45), dark);
  return group;
}

export function createAwacs() {
  const group = new THREE.Group();
  const skin = makeMaterial(0xb8c0c2, 0.62, 0.24);
  const lower = makeMaterial(0x707d82, 0.75, 0.22);
  const dark = makeMaterial(0x242e33, 0.7, 0.28);
  const glass = makeMaterial(0x263b48, 0.28, 0.5, 0x061118);

  cylinder(group, 2.25, 37, new THREE.Vector3(0, 0, 0), skin, 20);
  const nose = new THREE.Mesh(new THREE.SphereGeometry(2.26, 20, 12), skin);
  nose.scale.z = 0.72;
  nose.position.z = -18.5;
  group.add(nose);
  box(group, new THREE.Vector3(40, 0.42, 7.2), new THREE.Vector3(0, 0.1, 1.2), skin);
  box(group, new THREE.Vector3(14, 0.28, 4.8), new THREE.Vector3(0, 1.0, 15.5), lower);
  box(group, new THREE.Vector3(0.35, 7.6, 5.2), new THREE.Vector3(0, 3.2, 15.4), lower);

  for (const x of [-13, -6.6, 6.6, 13]) {
    cylinder(group, 1.05, 5.2, new THREE.Vector3(x, -0.8, 1.0), dark, 14);
    const intake = new THREE.Mesh(
      new THREE.CircleGeometry(0.78, 14),
      new THREE.MeshBasicMaterial({ color: 0x11191d, side: THREE.DoubleSide }),
    );
    intake.rotation.y = Math.PI;
    intake.position.set(x, -0.8, -1.62);
    group.add(intake);
  }

  const cockpit = box(group, new THREE.Vector3(3.45, 1.0, 1.1), new THREE.Vector3(0, 1.15, -17.8), glass);
  cockpit.rotation.x = -0.12;

  const mast = cylinder(group, 0.34, 3.4, new THREE.Vector3(0, 3.45, -0.5), lower, 12);
  mast.rotation.set(0, 0, 0);
  const dome = new THREE.Group();
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(5.5, 5.5, 0.78, 28), skin);
  dome.add(disc);
  box(dome, new THREE.Vector3(10.3, 0.12, 0.18), new THREE.Vector3(0, 0.46, 0), dark);
  box(dome, new THREE.Vector3(0.18, 0.12, 10.3), new THREE.Vector3(0, 0.46, 0), dark);
  dome.position.set(0, 5.3, -0.5);
  group.add(dome);
  group.userData.rotodome = dome;

  return group;
}

// Shared ocean mesh used by the decision-support sea below. (It formerly lived between the retired
// createSky/createSea builders; those were deleted in Build 56 but this helper is still live.)
export function createOceanGeometry(radius = 360000, radialSegments = 145, angularSegments = 192) {
  // Concentric exponential rings spend vertices where a landing pilot needs them: ~7 m radial
  // spacing under the aircraft, ~85 m at 1.5 km, then progressively coarser toward the horizon.
  // This is both lighter and far more useful than uniformly tessellating a 500 km square. The two
  // segment arguments are the explicit quality knobs if a lower-end WebGL target needs scaling.
  const positions = [0, 0, 0];
  const indices = [];
  const growth = 8.0;
  const growthScale = Math.exp(growth) - 1;
  for (let ring = 1; ring <= radialSegments; ring++) {
    const t = ring / radialSegments;
    const ringRadius = radius * (Math.exp(growth * t) - 1) / growthScale;
    for (let segment = 0; segment < angularSegments; segment++) {
      const angle = segment / angularSegments * Math.PI * 2;
      positions.push(Math.cos(angle) * ringRadius, 0, Math.sin(angle) * ringRadius);
    }
  }
  for (let segment = 0; segment < angularSegments; segment++) {
    const next = (segment + 1) % angularSegments;
    indices.push(0, 1 + next, 1 + segment);
  }
  for (let ring = 1; ring < radialSegments; ring++) {
    const inner = 1 + (ring - 1) * angularSegments;
    const outer = inner + angularSegments;
    for (let segment = 0; segment < angularSegments; segment++) {
      const next = (segment + 1) % angularSegments;
      indices.push(inner + segment, inner + next, outer + segment);
      indices.push(inner + next, outer + next, outer + segment);
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

// The production scene is deliberately closer to a flight-test visual system than a decorative
// game sky. It supplies an unambiguous world horizon and altitude-dependent atmospheric colour;
// clouds, stars, a sun disc, and other scene dressing are absent unless a later renderer can bind
// them to scenario-owned state.
export function createDecisionSupportSky() {
  const uniforms = {
    uAltitude: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    side: THREE.DoubleSide,
    depthWrite: false,
    depthTest: false,
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vDirection;

      void main() {
        vDirection = normalize(mat3(modelMatrix) * position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uAltitude;
      varying vec3 vDirection;

      void main() {
        vec3 direction = normalize(vDirection);
        float aboveHorizon = max(direction.y, 0.0);
        float altitudeMix = smoothstep(2500.0, 18000.0, max(uAltitude, 0.0));
        vec3 horizon = mix(vec3(0.34, 0.47, 0.52), vec3(0.18, 0.33, 0.50), altitudeMix);
        vec3 zenith = mix(vec3(0.035, 0.16, 0.34), vec3(0.006, 0.025, 0.105), altitudeMix);
        float skyCurve = pow(aboveHorizon, mix(0.42, 0.30, altitudeMix));
        vec3 color = mix(horizon, zenith, skyCurve);

        // A narrow, non-luminous horizon shoulder stays visible during unusual attitudes and over
        // the far-field sea. It is an attitude reference, not simulated cloud or weather.
        float horizonShoulder = exp(-abs(direction.y) * 70.0);
        color = mix(color, horizon * 1.08, horizonShoulder * 0.38);
        if (direction.y < 0.0) {
          color = mix(vec3(0.022, 0.075, 0.095), horizon, exp(direction.y * 16.0));
        }

        gl_FragColor = vec4(color, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(4096, 36, 20), material);
  mesh.name = "DECISION_SUPPORT_SKY";
  mesh.frustumCulled = false;
  mesh.renderOrder = -100;
  return { mesh, uniforms };
}

// The collision surface stays exactly planar, but the presentation carries wind-aligned, physically
// scaled crest cues. They give the pilot optic flow, height/closure judgment, and surface-wind SA
// without inventing wave displacement that the flight model does not collide with. The shader is
// driven by the authoritative local wind and fades its detail before it can alias at the horizon.
export function createDecisionSupportSea() {
  const uniforms = {
    uAltitude: { value: 0 },
    uFogColor: { value: new THREE.Color(0x6f8790) },
    uFogDensity: { value: fogDensityForVisibility(CLEAR_AIR_VISIBILITY_M) },
    uTime: { value: 0 },
    uWind: { value: new THREE.Vector2() },
    uWindSpeed: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: /* glsl */ `
      varying vec3 vWorldPosition;
      #include <common>
      #include <logdepthbuf_pars_vertex>

      void main() {
        vec3 worldPosition = (modelMatrix * vec4(position, 1.0)).xyz;
        float radial = length(position.xz);
        // Keep the tactical recovery area exactly planar. Curvature beyond it supplies the real
        // geometric horizon used for attitude and altitude judgment without moving nearby truth.
        float curvedRadial = max(radial - ${TERRAIN_CURVATURE_START_M.toFixed(1)}, 0.0);
        worldPosition.y -= curvedRadial * curvedRadial
          / ${(2 * TERRAIN_EARTH_RADIUS_M).toFixed(1)};
        vWorldPosition = worldPosition;
        gl_Position = projectionMatrix * viewMatrix * vec4(worldPosition, 1.0);
        #include <logdepthbuf_vertex>
      }
    `,
    fragmentShader: /* glsl */ `
      precision highp float;
      uniform float uAltitude;
      uniform vec3 uFogColor;
      uniform float uFogDensity;
      uniform float uTime;
      uniform vec2 uWind;
      uniform float uWindSpeed;
      varying vec3 vWorldPosition;
      #include <logdepthbuf_pars_fragment>

      float crest(float phase) {
        float wave = 0.5 + 0.5 * sin(phase);
        return wave * wave * wave * wave;
      }

      void main() {
        float distanceFromEye = length(vWorldPosition - cameraPosition);
        vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
        float grazing = pow(1.0 - clamp(viewDirection.y, 0.0, 1.0), 3.0);
        float altitudeMix = smoothstep(2500.0, 18000.0, max(uAltitude, 0.0));
        vec3 water = mix(vec3(0.016, 0.090, 0.112), vec3(0.010, 0.040, 0.075), altitudeMix);
        // View-angle variation preserves the sea plane and geometric horizon.
        water = mix(water, uFogColor * 0.70, grazing * 0.48);

        // Two deep-water spatial scales (48 m and 15 m) travel at their dispersion-derived phase
        // rates. Only their contrast is drawn: geometry and collision truth remain at sea level.
        // The cross-wind modulation prevents a screen-space stripe pattern while retaining a clear
        // wind-axis cue. In calm air the contrast disappears instead of implying a false wind.
        vec2 windDirection = uWindSpeed > 0.25 ? normalize(uWind) : vec2(0.0, 1.0);
        vec2 windCross = vec2(-windDirection.y, windDirection.x);
        float alongWind = dot(vWorldPosition.xz, windDirection);
        float acrossWind = dot(vWorldPosition.xz, windCross);
        float primaryPhase = alongWind * 0.1308997
          + 0.42 * sin(acrossWind * 0.022) - uTime * 1.133;
        float secondaryPhase = alongWind * 0.4188790
          - 0.31 * sin(acrossWind * 0.057 + 1.7) - uTime * 2.027;
        float primaryCrest = crest(primaryPhase);
        float secondaryCrest = crest(secondaryPhase);
        float surfaceCue = mix(primaryCrest, secondaryCrest, 0.34);
        float windCue = smoothstep(1.5, 12.0, uWindSpeed);
        float altitudeCue = 1.0 - smoothstep(3500.0, 15000.0, uAltitude);
        float rangeCue = 1.0 - smoothstep(6500.0, 30000.0, distanceFromEye);
        float cueStrength = windCue * altitudeCue * rangeCue;
        water *= 0.94 + surfaceCue * cueStrength * 0.14;

        // Whitecaps are a high-wind observation, not generic decoration. They appear only on the
        // most coherent windward crests and fade with the same resolvability gates.
        float whitecap = smoothstep(0.88, 0.98, primaryCrest * 0.78 + secondaryCrest * 0.22)
          * smoothstep(9.0, 17.0, uWindSpeed) * altitudeCue * rangeCue;
        water = mix(water, vec3(0.66, 0.76, 0.75), whitecap * 0.32);
        float visibilityFog = 1.0 - exp(
          -uFogDensity * uFogDensity * distanceFromEye * distanceFromEye
        );
        vec3 color = mix(water, uFogColor, clamp(visibilityFog, 0.0, 1.0));

        gl_FragColor = vec4(color, 1.0);
        #include <logdepthbuf_fragment>
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }
    `,
  });
  const mesh = new THREE.Mesh(createOceanGeometry(
    650000,
    mobileControls ? 84 : 104,
    mobileControls ? 120 : 156,
  ), material);
  mesh.name = "DECISION_SUPPORT_SEA";
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

export function createHiddenPresentation() {
  const group = new THREE.Group();
  group.name = "HiddenPresentationFallback";
  return group;
}
