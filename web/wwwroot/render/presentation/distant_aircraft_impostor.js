import {
  clamp,
  finite,
  moveTowards,
} from "./presentation_math.js";

export const DEFAULT_DISTANT_AIRCRAFT_OPTIONS = Object.freeze({
  minimumPixels: 8,
  maximumPixels: 14,
  enterBelowPixels: 10,
  exitAbovePixels: 14,
  fadeSeconds: 0.14,
  modelHideOpacity: 0.985,
  targetDiameterMetres: 12,
  depthBiasMetres: 7,
  coreColor: 0x080b0c,
  edgeColor: 0xd6c59b,
  edgeOpacity: 0.24,
});

function validateThresholds(options) {
  const minimumPixels = Math.max(0.1,
    finite(options.minimumPixels, DEFAULT_DISTANT_AIRCRAFT_OPTIONS.minimumPixels));
  const maximumPixels = Math.max(minimumPixels,
    finite(options.maximumPixels, DEFAULT_DISTANT_AIRCRAFT_OPTIONS.maximumPixels));
  const enterBelowPixels = clamp(
    finite(options.enterBelowPixels, DEFAULT_DISTANT_AIRCRAFT_OPTIONS.enterBelowPixels),
    minimumPixels,
    maximumPixels,
  );
  const exitAbovePixels = clamp(
    finite(options.exitAbovePixels, DEFAULT_DISTANT_AIRCRAFT_OPTIONS.exitAbovePixels),
    enterBelowPixels,
    maximumPixels,
  );
  return { minimumPixels, maximumPixels, enterBelowPixels, exitAbovePixels };
}

export function createDistantAircraftState() {
  return {
    active: false,
    opacity: 0,
    pixelSize: 0,
    modelVisible: true,
    orientationRadians: 0,
  };
}

/**
 * Pure visibility state transition. The source aircraft is never enlarged: below the contact
 * threshold, a separate depth-tested silhouette takes over at a bounded screen size.
 */
export function stepDistantAircraftState(previous, input, options = {}) {
  const config = { ...DEFAULT_DISTANT_AIRCRAFT_OPTIONS, ...options };
  const thresholds = validateThresholds(config);
  const actualPixels = Number(input?.projectedPixels);
  const eligible = input?.visible !== false
    && input?.inFront !== false
    && Number.isFinite(actualPixels)
    && actualPixels >= 0;
  let active = previous?.active === true;
  if (!eligible || actualPixels >= thresholds.exitAbovePixels) active = false;
  else if (actualPixels <= thresholds.enterBelowPixels) active = true;

  const fadeSeconds = Math.max(0.001,
    finite(config.fadeSeconds, DEFAULT_DISTANT_AIRCRAFT_OPTIONS.fadeSeconds));
  const opacity = moveTowards(
    clamp(finite(previous?.opacity), 0, 1),
    active ? 1 : 0,
    clamp(finite(input?.deltaSeconds), 0, 0.1) / fadeSeconds,
  );
  const pixelSize = eligible
    ? clamp(Math.max(actualPixels, thresholds.minimumPixels),
      thresholds.minimumPixels, thresholds.maximumPixels)
    : opacity > 0 ? clamp(finite(previous?.pixelSize),
      thresholds.minimumPixels, thresholds.maximumPixels) : 0;
  return {
    active,
    opacity,
    pixelSize,
    modelVisible: opacity < clamp(finite(config.modelHideOpacity, 0.985), 0.5, 1),
    orientationRadians: finite(previous?.orientationRadians),
  };
}

/** Exact inverse of perspective projected-height at a camera-space forward depth. */
export function fixedPixelWorldSize(pixelSize, cameraDepth, verticalFovRadians, viewportHeight) {
  const pixels = Math.max(0, finite(pixelSize));
  const depth = Math.max(0, finite(cameraDepth));
  const fov = clamp(finite(verticalFovRadians), 1e-5, Math.PI - 1e-5);
  const viewport = Math.max(1, finite(viewportHeight, 1));
  return pixels * 2 * depth * Math.tan(fov * 0.5) / viewport;
}

export function projectedPixelSize(worldSize, cameraDepth, verticalFovRadians, viewportHeight) {
  const size = Math.max(0, finite(worldSize));
  const depth = Math.max(1e-8, finite(cameraDepth));
  const fov = clamp(finite(verticalFovRadians), 1e-5, Math.PI - 1e-5);
  const viewport = Math.max(1, finite(viewportHeight, 1));
  return viewport * size / (2 * depth * Math.tan(fov * 0.5));
}

const IMPOSTOR_VERTEX_SHADER = /* glsl */`
  #include <common>
  #include <fog_pars_vertex>
  #include <logdepthbuf_pars_vertex>
  varying vec2 vUv;

  void main() {
    vUv = uv;
    vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
    gl_Position = projectionMatrix * mvPosition;
    #include <logdepthbuf_vertex>
    #include <fog_vertex>
  }
`;

const IMPOSTOR_FRAGMENT_SHADER = /* glsl */`
  #include <fog_pars_fragment>
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uCoreColor;
  uniform vec3 uEdgeColor;
  uniform float uEdgeOpacity;
  uniform float uOpacity;
  uniform float uHeadOn;
  varying vec2 vUv;

  float intervalMask(float value, float centre, float halfWidth, float softness) {
    return 1.0 - smoothstep(halfWidth, halfWidth + softness, abs(value - centre));
  }

  float aircraftMask(vec2 p, float expansion) {
    float headOn = clamp(uHeadOn, 0.0, 1.0);
    float bodyHalfLength = mix(0.88, 0.58, headOn) + expansion;
    float bodyHalfWidth = mix(0.105, 0.13, headOn) + expansion * 0.28;
    float bodyLongitudinal = intervalMask(p.y, 0.0, bodyHalfLength, 0.025);
    float noseTaper = clamp((bodyHalfLength - p.y) / max(bodyHalfLength * 0.42, 0.01), 0.0, 1.0);
    float taperedBodyWidth = bodyHalfWidth * max(noseTaper, 0.16);
    float body = bodyLongitudinal
      * (1.0 - smoothstep(taperedBodyWidth, taperedBodyWidth + 0.025, abs(p.x)));

    float wingSpan = mix(0.58, 0.94, headOn) + expansion;
    float wingChord = mix(0.19, 0.15, headOn) + expansion * 0.45;
    float wings = intervalMask(p.y, -0.02, wingChord, 0.028)
      * intervalMask(p.x, 0.0, wingSpan, 0.028);
    wings *= 1.0 - smoothstep(wingChord * 0.5, wingChord + 0.06,
      abs(p.y + 0.02) + abs(p.x) * mix(0.10, 0.16, headOn));

    float tailSpan = mix(0.25, 0.38, headOn) + expansion * 0.65;
    float tail = intervalMask(p.y, -bodyHalfLength * 0.68, 0.10 + expansion * 0.3, 0.025)
      * intervalMask(p.x, 0.0, tailSpan, 0.025);
    return clamp(max(body, max(wings, tail)), 0.0, 1.0);
  }

  void main() {
    #include <logdepthbuf_fragment>
    vec2 p = (vUv - 0.5) * 2.0;
    float core = aircraftMask(p, 0.0);
    float outer = aircraftMask(p, 0.065);
    float edge = max(0.0, outer - core);
    float alpha = (core + edge * uEdgeOpacity) * uOpacity;
    if (alpha <= 0.002) discard;
    vec3 color = mix(uEdgeColor, uCoreColor, clamp(core * 1.6, 0.0, 1.0));
    gl_FragColor = vec4(color, alpha);
    #include <fog_fragment>
  }
`;

function cameraViewportHeight(camera, renderer, explicitHeight) {
  if (Number.isFinite(Number(explicitHeight)) && Number(explicitHeight) > 0) {
    return Number(explicitHeight);
  }
  const element = renderer?.domElement;
  return Math.max(1, element?.clientHeight ?? element?.height ?? 1);
}

function resolveTargetWorldTransform(target, explicitPosition, explicitQuaternion, position, quaternion) {
  if (explicitPosition) position.copy(explicitPosition);
  else if (target?.getWorldPosition) target.getWorldPosition(position);
  else position.set(0, 0, 0);
  if (explicitQuaternion) quaternion.copy(explicitQuaternion);
  else if (target?.getWorldQuaternion) target.getWorldQuaternion(quaternion);
  else quaternion.identity();
}

/**
 * Three r160-compatible, depth-tested aircraft contact. Add `object3d` directly to the scene.
 * `update()` returns whether the authored model should remain visible; it never changes target
 * scale or target visibility itself.
 */
export function createDistantAircraftImpostor(THREE, options = {}) {
  const config = { ...DEFAULT_DISTANT_AIRCRAFT_OPTIONS, ...options };
  const geometry = new THREE.PlaneGeometry(1, 1);
  const uniforms = {
    ...THREE.UniformsUtils.clone(THREE.UniformsLib.fog),
    uCoreColor: { value: new THREE.Color(config.coreColor) },
    uEdgeColor: { value: new THREE.Color(config.edgeColor) },
    uEdgeOpacity: { value: clamp(finite(config.edgeOpacity, 0.24), 0, 1) },
    uOpacity: { value: 0 },
    uHeadOn: { value: 1 },
  };
  const material = new THREE.ShaderMaterial({
    name: "DistantAircraftSilhouetteMaterial",
    uniforms,
    vertexShader: IMPOSTOR_VERTEX_SHADER,
    fragmentShader: IMPOSTOR_FRAGMENT_SHADER,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    toneMapped: false,
    fog: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "DistantAircraftSilhouetteImpostor";
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.visible = false;
  mesh.renderOrder = finite(config.renderOrder, 20);

  let state = createDistantAircraftState();
  let disposed = false;
  const targetPosition = new THREE.Vector3();
  const targetQuaternion = new THREE.Quaternion();
  const cameraPosition = new THREE.Vector3();
  const cameraQuaternion = new THREE.Quaternion();
  const cameraForward = new THREE.Vector3();
  const cameraRight = new THREE.Vector3();
  const cameraUp = new THREE.Vector3();
  const targetForward = new THREE.Vector3();
  const targetRight = new THREE.Vector3();
  const targetToCamera = new THREE.Vector3();
  const rollQuaternion = new THREE.Quaternion();
  const localZ = new THREE.Vector3(0, 0, 1);

  return {
    object3d: mesh,
    material,
    uniforms,
    get state() { return { ...state }; },
    reset() {
      state = createDistantAircraftState();
      uniforms.uOpacity.value = 0;
      mesh.visible = false;
    },
    setColors(coreColor, edgeColor = null) {
      uniforms.uCoreColor.value.set(coreColor);
      if (edgeColor !== null) uniforms.uEdgeColor.value.set(edgeColor);
    },
    update(frame) {
      if (disposed) return { ...state, visible: false };
      const camera = frame?.camera;
      if (!camera?.isCamera) {
        state = stepDistantAircraftState(state, {
          projectedPixels: Number.NaN,
          visible: false,
          deltaSeconds: frame?.deltaSeconds,
        }, config);
        mesh.visible = false;
        return { ...state, visible: false };
      }

      camera.updateWorldMatrix?.(true, false);
      frame.target?.updateWorldMatrix?.(true, false);
      resolveTargetWorldTransform(frame.target, frame.worldPosition, frame.worldQuaternion,
        targetPosition, targetQuaternion);
      camera.getWorldPosition(cameraPosition);
      camera.getWorldQuaternion(cameraQuaternion);
      cameraForward.set(0, 0, -1).applyQuaternion(cameraQuaternion).normalize();
      cameraRight.set(1, 0, 0).applyQuaternion(cameraQuaternion).normalize();
      cameraUp.set(0, 1, 0).applyQuaternion(cameraQuaternion).normalize();
      targetToCamera.copy(cameraPosition).sub(targetPosition);
      const distance = targetToCamera.length();
      const cameraDepth = -targetToCamera.dot(cameraForward);
      const inFront = cameraDepth > Math.max(1e-4, finite(camera.near, 0.01));
      const viewportHeight = cameraViewportHeight(camera, frame.renderer, frame.viewportHeight);
      const fovRadians = finite(camera.fov, 60) * Math.PI / 180;
      const targetDiameter = Math.max(0.01,
        finite(frame.targetDiameterMetres, config.targetDiameterMetres));
      const projectedPixels = Number.isFinite(Number(frame.projectedPixels))
        ? Number(frame.projectedPixels)
        : inFront
          ? projectedPixelSize(targetDiameter, cameraDepth, fovRadians, viewportHeight)
          : Number.NaN;
      state = stepDistantAircraftState(state, {
        projectedPixels,
        visible: frame.visible !== false,
        inFront,
        deltaSeconds: frame.deltaSeconds,
      }, config);

      uniforms.uOpacity.value = state.opacity;
      mesh.visible = state.opacity > 0 && inFront;
      if (!mesh.visible) return { ...state, visible: false, projectedPixels, cameraDepth };

      targetToCamera.multiplyScalar(distance > 1e-8 ? 1 / distance : 0);
      const depthBias = Math.min(distance * 0.01,
        Math.max(0, finite(frame.depthBiasMetres, config.depthBiasMetres)));
      mesh.position.copy(targetPosition).addScaledVector(targetToCamera, depthBias);
      const impostorDepth = Math.max(1e-5,
        cameraDepth + targetToCamera.dot(cameraForward) * depthBias);
      const worldSize = fixedPixelWorldSize(state.pixelSize, impostorDepth,
        fovRadians, viewportHeight);

      targetForward.set(0, 0, -1).applyQuaternion(targetQuaternion).normalize();
      targetRight.set(1, 0, 0).applyQuaternion(targetQuaternion).normalize();
      const viewDirection = targetToCamera;
      uniforms.uHeadOn.value = clamp(Math.abs(targetForward.dot(viewDirection)), 0, 1);

      const forwardX = targetForward.dot(cameraRight);
      const forwardY = targetForward.dot(cameraUp);
      const projectedForwardLength = Math.hypot(forwardX, forwardY);
      if (projectedForwardLength > 0.08) {
        state.orientationRadians = Math.atan2(-forwardX, forwardY);
      } else {
        const rightX = targetRight.dot(cameraRight);
        const rightY = targetRight.dot(cameraUp);
        if (Math.hypot(rightX, rightY) > 0.08) {
          state.orientationRadians = Math.atan2(rightY, rightX);
        }
      }
      rollQuaternion.setFromAxisAngle(localZ, state.orientationRadians);
      mesh.quaternion.copy(cameraQuaternion).multiply(rollQuaternion);
      mesh.scale.set(worldSize, worldSize, 1);
      mesh.updateMatrixWorld?.(true);
      return {
        ...state,
        visible: true,
        projectedPixels,
        cameraDepth: impostorDepth,
        targetCameraDepth: cameraDepth,
        worldSize,
      };
    },
    dispose() {
      if (disposed) return;
      mesh.removeFromParent();
      geometry.dispose();
      material.dispose();
      disposed = true;
    },
  };
}
