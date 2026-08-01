import * as THREE from "../../vendor/three.module.js";

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
