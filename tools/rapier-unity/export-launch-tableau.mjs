#!/usr/bin/env node

import { createHash } from "node:crypto";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import * as THREE from "../../web/wwwroot/vendor/three.module.js";
import {
  configureSceneBuilders,
  createDecisionSupportSky,
  createRapier,
  createRapierDispersedStrip,
} from "../../web/wwwroot/render/scene/scene_builders.js";
import {
  UKRAINE_SOFT_WORLD_FOG_DENSITY_SCALE,
  UKRAINE_SOFT_WORLD_HAZE_MIX,
  UKRAINE_SOFT_WORLD_HAZE_RGB,
} from "../../web/wwwroot/render/environment/soft_world_atmosphere.js";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
export const repositoryRoot = resolve(scriptDirectory, "../..");
export const WEB_BUILD = 299;
export const manifestRelativePaths = Object.freeze([
  "content/packs/ukraine-modern/presentation/rapier-launch-tableau.web-build-299.v1.json",
  "web/wwwroot/content/packs/ukraine-modern/presentation/rapier-launch-tableau.web-build-299.v1.json",
  "unity/GunsOnly.Unity/Assets/Resources/GunsOnly/Rapier/presentation/rapier-launch-tableau.web-build-299.v1.json",
]);

export function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function requireMatch(source, expression, label) {
  const match = source.match(expression);
  if (!match) throw new Error(`Unable to extract ${label} from the live Web renderer.`);
  return match;
}

function numberList(source) {
  return source.split(",").map((value) => Number(value.trim().replaceAll("_", "")));
}

function hex(value) {
  return `#${value.toString(16).padStart(6, "0")}`;
}

function linearRgbFromHex(value) {
  return new THREE.Color(value).toArray().map((component) => Number(component));
}

/**
 * Read values that still live in app.js. The exporter deliberately fails when their source shape
 * changes: silently retaining a copied Unity lighting or camera preset would defeat this bridge.
 */
export function extractLiveWebPresentationContract() {
  const appSource = readFileSync(resolve(repositoryRoot, "web/wwwroot/app.js"), "utf8");
  const sunComponents = numberList(requireMatch(
    appSource,
    /const SUN_DIRECTION = new THREE\.Vector3\(([^)]+)\)\.normalize\(\);/,
    "SUN_DIRECTION",
  )[1]);
  const sunDirection = new THREE.Vector3(...sunComponents).normalize().toArray();
  const clearVisibilityM = Number(requireMatch(
    appSource,
    /const CLEAR_AIR_VISIBILITY_M = ([\d_]+);/,
    "CLEAR_AIR_VISIBILITY_M",
  )[1].replaceAll("_", ""));
  requireMatch(
    appSource,
    /return Math\.sqrt\(-Math\.log\(0\.02\)\) \/ physicalVisibility;/,
    "FogExp2 visibility conversion",
  );

  const camera = numberList(requireMatch(
    appSource,
    /this\.camera = new THREE\.PerspectiveCamera\(([^)]+)\);/,
    "live perspective camera",
  )[1]);
  const rendererBlock = requireMatch(
    appSource,
    /this\.renderer\.outputColorSpace = THREE\.SRGBColorSpace;[\s\S]*?this\.renderer\.shadowMap\.type = THREE\.PCFSoftShadowMap;/,
    "renderer output block",
  )[0];
  requireMatch(rendererBlock, /this\.renderer\.toneMapping = THREE\.ACESFilmicToneMapping;/,
    "ACES tone mapping");
  requireMatch(rendererBlock, /this\.renderer\.shadowMap\.enabled = true;/,
    "shadow-map enablement");

  const summerBlock = requireMatch(
    appSource,
    /} else \{\s*this\.fogLow\.set\(0xa8814b\);[\s\S]*?this\.renderer\.toneMappingExposure = 1\.1;\s*}/,
    "non-winter Ukraine soft-world block",
  )[0];
  const getHex = (field) => parseInt(requireMatch(
    summerBlock,
    new RegExp(`this\\.${field}\\.set\\(0x([0-9a-fA-F]{6})\\);`),
    field,
  )[1], 16);
  const getNumber = (field) => Number(requireMatch(
    summerBlock,
    new RegExp(`this\\.${field} = ([0-9.]+);`),
    field,
  )[1]);
  const fogLow = getHex("fogLow");
  const fogHigh = getHex("fogHigh");
  const cloudFogColor = getHex("cloudFogColor");
  const ambientSky = getHex("ambient.color");
  const ambientGround = getHex("ambient.groundColor");
  const sunColor = getHex("sun.color");

  const shadowBlock = requireMatch(
    appSource,
    /this\.sun\.shadow\.camera\.left = -175;[\s\S]*?this\.sun\.shadow\.normalBias = 0\.16;/,
    "sun shadow block",
  )[0];
  const shadowNumber = (field) => Number(requireMatch(
    shadowBlock,
    new RegExp(`this\\.sun\\.shadow\\.${field.replaceAll(".", "\\.")} = (-?[0-9.]+);`),
    `sun shadow ${field}`,
  )[1]);

  return {
    output: {
      colorSpace: "srgb",
      workingColorSpace: "linear-srgb",
      toneMapping: "aces-filmic",
      exposure: getNumber("renderer.toneMappingExposure"),
      antialias: "msaa",
      logarithmicDepthBuffer: true,
    },
    cameraProjection: {
      verticalFovDeg: camera[0],
      nearClipM: camera[2],
      farClipM: camera[3],
      rotationOrder: "YXZ",
    },
    lighting: {
      sunDirection,
      sunColorSrgbHex: hex(sunColor),
      sunColorLinearRgb: linearRgbFromHex(sunColor),
      sunIntensity: getNumber("sun.intensity"),
      hemisphereSkySrgbHex: hex(ambientSky),
      hemisphereSkyLinearRgb: linearRgbFromHex(ambientSky),
      hemisphereGroundSrgbHex: hex(ambientGround),
      hemisphereGroundLinearRgb: linearRgbFromHex(ambientGround),
      hemisphereIntensity: getNumber("ambient.intensity"),
      shadow: {
        type: "pcf-soft",
        orthographicBoundsM: [
          shadowNumber("camera.left"),
          shadowNumber("camera.right"),
          shadowNumber("camera.bottom"),
          shadowNumber("camera.top"),
        ],
        nearClipM: shadowNumber("camera.near"),
        farClipM: shadowNumber("camera.far"),
        depthBias: shadowNumber("bias"),
        normalBias: shadowNumber("normalBias"),
      },
    },
    atmosphere: {
      model: "exp2-weather-authoritative-soft-world",
      clearAirVisibilityM: clearVisibilityM,
      clearAirFogDensityPerM: Math.sqrt(-Math.log(0.02)) / clearVisibilityM,
      fogDensityScale: UKRAINE_SOFT_WORLD_FOG_DENSITY_SCALE,
      fogLowSrgbHex: hex(fogLow),
      fogLowLinearRgb: linearRgbFromHex(fogLow),
      fogHighSrgbHex: hex(fogHigh),
      fogHighLinearRgb: linearRgbFromHex(fogHigh),
      cloudFogSrgbHex: hex(cloudFogColor),
      cloudFogLinearRgb: linearRgbFromHex(cloudFogColor),
      hazeLinearRgb: [...UKRAINE_SOFT_WORLD_HAZE_RGB],
      hazeMix: UKRAINE_SOFT_WORLD_HAZE_MIX,
      altitudeBlendM: [1800, 14000],
      weatherDriven: true,
      worldEdgeDriven: true,
    },
  };
}

function writeFloat32Le(values) {
  const bytes = Buffer.allocUnsafe(values.length * 4);
  for (let index = 0; index < values.length; index += 1) {
    bytes.writeFloatLE(Math.fround(values[index]), index * 4);
  }
  return bytes;
}

function writeUint32Le(values) {
  const bytes = Buffer.allocUnsafe(values.length * 4);
  for (let index = 0; index < values.length; index += 1) {
    bytes.writeUInt32LE(Number(values[index]), index * 4);
  }
  return bytes;
}

function attributeValues(attribute) {
  if (!attribute || attribute.isInterleavedBufferAttribute) {
    throw new Error("Rapier exporter requires a non-interleaved BufferAttribute.");
  }
  const values = new Array(attribute.count * attribute.itemSize);
  for (let vertex = 0; vertex < attribute.count; vertex += 1) {
    const offset = vertex * attribute.itemSize;
    values[offset] = attribute.getX(vertex);
    if (attribute.itemSize > 1) values[offset + 1] = attribute.getY(vertex);
    if (attribute.itemSize > 2) values[offset + 2] = attribute.getZ(vertex);
    if (attribute.itemSize > 3) values[offset + 3] = attribute.getW(vertex);
  }
  return values;
}

function serializeFloatAttribute(attribute) {
  if (!attribute) return null;
  const bytes = writeFloat32Le(attributeValues(attribute));
  return {
    componentType: "float32",
    itemSize: attribute.itemSize,
    count: attribute.count,
    normalized: attribute.normalized === true,
    encoding: "base64-f32le",
    byteLength: bytes.length,
    sha256: sha256Hex(bytes),
    data: bytes.toString("base64"),
  };
}

function serializeIndex(index) {
  if (!index) return null;
  const bytes = writeUint32Le(attributeValues(index));
  return {
    componentType: "uint32",
    itemSize: 1,
    count: index.count,
    normalized: false,
    encoding: "base64-u32le",
    byteLength: bytes.length,
    sha256: sha256Hex(bytes),
    data: bytes.toString("base64"),
  };
}

function serializeGeometry(geometry, topology = "triangles") {
  const position = serializeFloatAttribute(geometry.getAttribute("position"));
  const normal = serializeFloatAttribute(geometry.getAttribute("normal"));
  const uv = serializeFloatAttribute(geometry.getAttribute("uv"));
  const index = serializeIndex(geometry.getIndex());
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  const elementCount = index?.count ?? position.count;
  return {
    topology,
    vertexCount: position.count,
    elementCount,
    primitiveCount: topology === "triangles" ? elementCount / 3 : elementCount,
    bounds: {
      minimum: geometry.boundingBox.min.toArray(),
      maximum: geometry.boundingBox.max.toArray(),
      sphereCenter: geometry.boundingSphere.center.toArray(),
      sphereRadius: geometry.boundingSphere.radius,
    },
    attributes: { position, normal, uv },
    index,
  };
}

function serializeTransformFromObject(object) {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  object.matrixWorld.decompose(position, quaternion, scale);
  return {
    position: position.toArray(),
    quaternion: quaternion.toArray(),
    scale: scale.toArray(),
  };
}

function serializeTransformFromMatrix(matrix) {
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  matrix.decompose(position, quaternion, scale);
  return {
    position: position.toArray(),
    quaternion: quaternion.toArray(),
    scale: scale.toArray(),
  };
}

function colorRecord(color) {
  if (!color?.isColor) return { srgbHex: "#000000", linearRgb: [0, 0, 0] };
  return {
    srgbHex: `#${color.getHexString(THREE.SRGBColorSpace)}`,
    linearRgb: color.toArray(),
  };
}

function proceduralFinish(material) {
  const shader = { uniforms: {}, vertexShader: "", fragmentShader: "" };
  material.onBeforeCompile?.(shader, null);
  return {
    grain: Number(shader.uniforms.uFinishGrain?.value ?? 0),
    grainScale: Number(shader.uniforms.uFinishScale?.value ?? 1),
    panelStrength: Number(shader.uniforms.uPanelStrength?.value ?? 0),
    panelScale: Number(shader.uniforms.uPanelScale?.value ?? 1),
  };
}

function sideName(side) {
  if (side === THREE.DoubleSide) return "double";
  if (side === THREE.BackSide) return "back";
  return "front";
}

function blendingName(blending) {
  if (blending === THREE.AdditiveBlending) return "additive";
  if (blending === THREE.NoBlending) return "none";
  return "normal";
}

function serializeMaterial(material, id) {
  const color = colorRecord(material.color);
  const emissive = colorRecord(material.emissive);
  const specularColor = colorRecord(material.specularColor);
  return {
    id,
    shaderModel: material.isMeshPhysicalMaterial
      ? "three-mesh-physical"
      : material.isPointsMaterial
        ? "three-points"
        : "three-mesh-basic",
    name: material.name || "",
    colorSrgbHex: color.srgbHex,
    colorLinearRgb: color.linearRgb,
    emissiveSrgbHex: emissive.srgbHex,
    emissiveLinearRgb: emissive.linearRgb,
    roughness: Number(material.roughness ?? 1),
    metalness: Number(material.metalness ?? 0),
    ior: Number(material.ior ?? 1.5),
    specularIntensity: Number(material.specularIntensity ?? 0),
    specularColorSrgbHex: specularColor.srgbHex,
    specularColorLinearRgb: specularColor.linearRgb,
    clearcoat: Number(material.clearcoat ?? 0),
    clearcoatRoughness: Number(material.clearcoatRoughness ?? 0),
    envMapIntensity: Number(material.envMapIntensity ?? 0),
    finish: proceduralFinish(material),
    transparent: material.transparent === true,
    opacity: Number(material.opacity ?? 1),
    alphaTest: Number(material.alphaTest ?? 0),
    depthTest: material.depthTest !== false,
    depthWrite: material.depthWrite !== false,
    colorWrite: material.colorWrite !== false,
    toneMapped: material.toneMapped !== false,
    side: sideName(material.side),
    blending: blendingName(material.blending),
    polygonOffset: material.polygonOffset === true,
    polygonOffsetFactor: Number(material.polygonOffsetFactor ?? 0),
    polygonOffsetUnits: Number(material.polygonOffsetUnits ?? 0),
    pointSizePx: Number(material.size ?? 1),
    sizeAttenuation: material.sizeAttenuation === true,
  };
}

function namedPath(object, root) {
  const names = [];
  for (let current = object; current; current = current.parent) {
    if (current.name) names.push(current.name);
    if (current === root) break;
  }
  return names.reverse().join("/");
}

function serializeDraws(root, materials, materialIds) {
  root.updateMatrixWorld(true);
  const draws = [];
  const instanceMatrix = new THREE.Matrix4();
  root.traverse((object) => {
    if (!object.isMesh && !object.isPoints) return;
    if (Array.isArray(object.material)) {
      throw new Error(`Multi-material Rapier draw ${object.name || object.type} is unsupported.`);
    }
    let materialId = materialIds.get(object.material);
    if (!materialId) {
      materialId = `material.${String(materials.length).padStart(3, "0")}`;
      materialIds.set(object.material, materialId);
      materials.push(serializeMaterial(object.material, materialId));
    }
    const instances = [];
    if (object.isInstancedMesh) {
      for (let index = 0; index < object.count; index += 1) {
        object.getMatrixAt(index, instanceMatrix);
        instances.push(serializeTransformFromMatrix(instanceMatrix));
      }
    }
    const topology = object.isPoints ? "points" : "triangles";
    const geometry = serializeGeometry(object.geometry, topology);
    const copies = object.isInstancedMesh ? object.count : 1;
    draws.push({
      id: `draw.${String(draws.length).padStart(3, "0")}`,
      name: object.name || `${object.type}_${String(draws.length).padStart(3, "0")}`,
      semanticPath: namedPath(object, root),
      kind: object.isPoints ? "points" : object.isInstancedMesh ? "instanced-mesh" : "mesh",
      materialId,
      transform: serializeTransformFromObject(object),
      instances,
      geometry,
      renderedVertexCount: geometry.vertexCount * copies,
      renderedPrimitiveCount: geometry.primitiveCount * copies,
      visibleAtRest: object.visible === true,
      castShadow: object.castShadow === true,
      receiveShadow: object.receiveShadow === true,
      renderOrder: object.renderOrder,
      frustumCulled: object.frustumCulled !== false,
      staticBoxCount: Number(object.userData.staticBoxCount ?? 0),
    });
  });
  return draws;
}

function socketPosition(socket) {
  const result = new THREE.Vector3();
  socket.getWorldPosition(result);
  return result.toArray();
}

function geometryDigestView(geometry) {
  const attribute = (value) => value ? {
    componentType: value.componentType,
    itemSize: value.itemSize,
    count: value.count,
    normalized: value.normalized,
    byteLength: value.byteLength,
    sha256: value.sha256,
  } : null;
  return {
    topology: geometry.topology,
    vertexCount: geometry.vertexCount,
    elementCount: geometry.elementCount,
    primitiveCount: geometry.primitiveCount,
    bounds: geometry.bounds,
    attributes: {
      position: attribute(geometry.attributes.position),
      normal: attribute(geometry.attributes.normal),
      uv: attribute(geometry.attributes.uv),
    },
    index: attribute(geometry.index),
  };
}

export function semanticDigestOf(manifest) {
  const draws = manifest.draws.map((draw) => ({
    ...draw,
    geometry: geometryDigestView(draw.geometry),
  }));
  const sky = {
    ...manifest.sky,
    geometry: geometryDigestView(manifest.sky.geometry),
  };
  return sha256Hex(Buffer.from(JSON.stringify({
    schema: manifest.schema,
    tableauId: manifest.tableauId,
    sourceWebBuild: manifest.sourceWebBuild,
    authority: manifest.authority,
    coordinateSystem: manifest.coordinateSystem,
    output: manifest.output,
    camera: manifest.camera,
    lighting: manifest.lighting,
    atmosphere: manifest.atmosphere,
    platform: manifest.platform,
    budgets: manifest.budgets,
    materials: manifest.materials,
    draws,
    sky,
    dynamicFx: manifest.dynamicFx,
  }), "utf8"));
}

export function buildManifest() {
  const live = extractLiveWebPresentationContract();
  configureSceneBuilders({
    visualQuality: { particleMultiplier: 1 },
    mobileControls: false,
    maxTracers: 48,
    fogDensityForVisibility: (visibilityM) => Math.sqrt(-Math.log(0.02)) / visibilityM,
    clearAirVisibilityM: live.atmosphere.clearAirVisibilityM,
  });

  const strip = createRapierDispersedStrip();
  const rapier = createRapier();
  const skyPresentation = createDecisionSupportSky();
  strip.updateMatrixWorld(true);
  rapier.updateMatrixWorld(true);
  skyPresentation.mesh.updateMatrixWorld(true);

  const cockpitCamera = rapier.userData.sockets?.cockpitCamera;
  if (!cockpitCamera || cockpitCamera.name !== "SOCKET_CAMERA_COCKPIT") {
    throw new Error("Production Rapier no longer publishes SOCKET_CAMERA_COCKPIT.");
  }

  const materials = [];
  const materialIds = new Map();
  const draws = serializeDraws(strip, materials, materialIds);
  const meshDraws = draws.filter((draw) => draw.kind !== "points");
  const pointDraws = draws.filter((draw) => draw.kind === "points");
  const shadowCasters = meshDraws.filter((draw) => draw.castShadow).length;
  const triangles = meshDraws.reduce((sum, draw) => sum + draw.renderedPrimitiveCount, 0);
  const vertices = meshDraws.reduce((sum, draw) => sum + draw.renderedVertexCount, 0);
  const skyGeometry = serializeGeometry(skyPresentation.mesh.geometry);

  const featurePack = JSON.parse(readFileSync(resolve(
    repositoryRoot,
    "content/packs/ukraine-modern/environment/hero-cells/rapier-eastern-strip.feature-pack.json",
  ), "utf8"));
  const referenceAltitudeM = Number(featurePack.coordinateFrame?.anchorSourceM?.upM);
  if (!Number.isFinite(referenceAltitudeM)) {
    throw new Error("Rapier feature pack no longer publishes a finite source altitude.");
  }

  const sockets = strip.userData.sockets;
  const wireMaterialIds = [1, 2, 3, 4].map((wire) => {
    const draw = draws.find((candidate) => candidate.name === `ARRESTING_WIRE_${wire}`);
    if (!draw) throw new Error(`Missing ARRESTING_WIRE_${wire} from exported strip.`);
    return draw.materialId;
  });
  const cameraAnchor = socketPosition(cockpitCamera);
  const launchFxSource = readFileSync(resolve(
    repositoryRoot,
    "web/wwwroot/render/effects/rapier_launch_fx.js",
  ));
  const manifest = {
    schema: "guns-only.rapier.launch-tableau.v1",
    tableauId: "presentation.tableau.rapier-launch.web-build-299.v1",
    contentVersion: "1.0.0",
    sourceWebBuild: WEB_BUILD,
    sourceBuilders: [
      "createRapierDispersedStrip",
      "createRapier",
      "createDecisionSupportSky",
    ],
    authority: {
      mode: "presentation-only",
      simulationAuthority: "none",
      collisionAuthority: "none",
      damageAuthority: "none",
      targetable: false,
      dynamicFxAuthority: "projected-simulation-state",
    },
    coordinateSystem: {
      units: "metres",
      x: "right-east",
      y: "up",
      z: "three-js-local; launch-forward-is-negative-z",
      transforms: "position-quaternion-scale; quaternion-xyzw",
    },
    output: live.output,
    camera: {
      doctrine: "opaque-sensor-capsule",
      semantic: "camera.cockpit",
      nodeName: cockpitCamera.name,
      anchorLocalM: cameraAnchor,
      exteriorMeshVisibleInLiveFlight: false,
      cockpitMeshVisibleInLiveFlight: false,
      persistentFrameChrome: false,
      projection: live.cameraProjection,
    },
    lighting: live.lighting,
    atmosphere: live.atmosphere,
    platform: {
      presentationId: "presentation.platform.rapier-dispersed-strip.v1",
      rootName: strip.name,
      platformKind: strip.userData.platformKind,
      launchStrokeM: strip.userData.launchStrokeM,
      launchFlatLengthM: strip.userData.launchFlatLengthM,
      launchArcLengthM: strip.userData.launchArcLengthM,
      launchRampRiseM: strip.userData.launchRampRiseM,
      referenceAltitudeM,
      sockets: [
        { semantic: "platform.deck-origin", nodeName: sockets.deckOrigin.name,
          positionLocalM: socketPosition(sockets.deckOrigin) },
        { semantic: "platform.recovery-threshold", nodeName: sockets.recoveryThreshold.name,
          positionLocalM: socketPosition(sockets.recoveryThreshold) },
        { semantic: "platform.launch-end", nodeName: sockets.bowReference.name,
          positionLocalM: socketPosition(sockets.bowReference) },
      ],
      recoveryWireMaterialIds: wireMaterialIds,
    },
    budgets: {
      meshDrawCount: meshDraws.length,
      pointDrawCount: pointDraws.length,
      shadowCasterCount: shadowCasters,
      renderedTriangleCount: triangles,
      renderedVertexCount: vertices,
      staticBoxBatchCount: meshDraws.filter((draw) => draw.staticBoxCount > 0).length,
      staticBoxSourceCount: meshDraws.reduce((sum, draw) => sum + draw.staticBoxCount, 0),
    },
    materials,
    draws,
    sky: {
      name: skyPresentation.mesh.name,
      shaderModel: "decision-support-sky-soft-world",
      webVertexShaderSha256: sha256Hex(Buffer.from(
        skyPresentation.mesh.material.vertexShader,
        "utf8",
      )),
      webFragmentShaderSha256: sha256Hex(Buffer.from(
        skyPresentation.mesh.material.fragmentShader,
        "utf8",
      )),
      radiusM: 4096,
      widthSegments: 36,
      heightSegments: 20,
      referenceAltitudeM,
      renderOrder: skyPresentation.mesh.renderOrder,
      frustumCulled: skyPresentation.mesh.frustumCulled,
      // Mission wiring specializes the shared decision-support shader for Rapier: Ukraine's
      // warm soft-world branch is active, while the F-22-only modern-combat branch stays off.
      variantUniforms: {
        softWorldMix: 1,
        modernCombatMix: 0,
      },
      softWorldParameters: {
        altitudeBlendM: [2500, 18000],
        horizonLowLinearRgb: [0.94, 0.86, 0.70],
        horizonHighLinearRgb: [0.76, 0.72, 0.60],
        zenithLowLinearRgb: [0.080, 0.170, 0.460],
        zenithHighLinearRgb: [0.033, 0.072, 0.199],
        skyCurveLow: 0.18,
        skyCurveHigh: 0.13,
        shoulderFalloff: 48,
        shoulderGain: 1.14,
        shoulderWeight: 0.48,
        belowHorizonFalloff: 34,
        sunCoreExponent: 1800,
        sunBloomExponent: 42,
        sunHaloExponent: 8,
        sunCoreGain: 1.35,
        sunBloomGain: 0.55,
        sunHaloGain: 0.12,
      },
      geometry: skyGeometry,
    },
    dynamicFx: {
      webSourceSha256: sha256Hex(launchFxSource),
      stateFields: ["catapult_active", "catapult_progress"],
      restVisibility: false,
      pointDrawIds: pointDraws.map((draw) => draw.id),
      postHandoffFadeS: 1.2,
      layout: {
        catapultXM: -70,
        railStartZM: -20,
        flatLengthM: strip.userData.launchFlatLengthM,
      },
      vent: {
        drawName: "LAUNCH_FX_VENT_DUST",
        opacityBase: 0.12,
        opacityProgressGain: 0.28,
        fadeMultiplier: 0.45,
        driftRateBase: 4,
        driftRateProgressGain: 18,
        driftScale: 0.15,
        driftModuloM: 3,
      },
      portal: {
        drawName: "LAUNCH_FX_PORTAL_SHEET",
        progressStart: 0.58,
        opacityMaximum: 0.62,
        verticalOscillationM: 0.18,
        verticalOscillationRadPerS: 2.2,
      },
      rail: {
        drawName: "LAUNCH_FX_RAIL_SHIMMER",
        opacityBase: 0.06,
        opacityProgressGain: 0.18,
        fadeMultiplier: 0.3,
        lateralOscillationM: 0.04,
        lateralOscillationRadPerS: 14,
      },
      ribLamps: {
        drawName: "LAUNCH_GALLERY_RIB_LAMPS",
        baseColorSrgbHex: "#f0d38d",
        baseColorLinearRgb: linearRgbFromHex(0xf0d38d),
        hotColorSrgbHex: "#ffe6a8",
        hotColorLinearRgb: linearRgbFromHex(0xffe6a8),
        activeMixBase: 0.25,
        activeMixProgressGain: 0.55,
        pulseBase: 0.85,
        pulseAmplitude: 0.15,
        pulseRateBase: 6,
        pulseRateProgressGain: 10,
        fadeMixGain: 0.15,
      },
      note: "Geometry, materials and deterministic response are staged; projected simulation state remains the sole FX authority.",
    },
  };
  manifest.semanticSha256 = semanticDigestOf(manifest);
  return manifest;
}

export function canonicalManifestBytes(manifest = buildManifest()) {
  return Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

export function writeOrCheckManifest(mode) {
  const bytes = canonicalManifestBytes();
  const paths = manifestRelativePaths.map((relative) => resolve(repositoryRoot, relative));
  if (mode === "write") {
    for (const path of paths) {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, bytes);
    }
  } else if (mode === "check") {
    for (const path of paths) {
      const staged = readFileSync(path);
      if (!staged.equals(bytes)) {
        throw new Error(`${path} is stale; run export-launch-tableau.mjs --write.`);
      }
    }
  } else {
    throw new Error(`Unknown export mode ${mode}.`);
  }
  return { bytes, paths, sha256: sha256Hex(bytes) };
}

const invokedDirectly = process.argv[1]
  && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (invokedDirectly) {
  const mode = process.argv.includes("--write") ? "write"
    : process.argv.includes("--check") ? "check" : null;
  if (!mode) {
    throw new Error("Usage: node tools/rapier-unity/export-launch-tableau.mjs --write|--check");
  }
  const result = writeOrCheckManifest(mode);
  console.log(`Rapier tableau ${mode}: ${result.sha256} (${result.bytes.length} bytes)`);
  for (const path of result.paths) console.log(path);
}
