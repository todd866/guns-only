import {
  addScaled,
  clamp,
  dot,
  finite,
  moveTowards,
  normalized,
  subtract,
} from "./presentation_math.js";

const DEFAULT_COLOR = 0xffb347;

export const DEFAULT_PERIOD_GUNSIGHT_OPTIONS = Object.freeze({
  semanticAnchorId: "gunsight.origin",
  combinerWidthMetres: 0.30,
  combinerHeightMetres: 0.27,
  combinerOffset: Object.freeze([0, 0.035, -0.005]),
  combinerTiltRadians: 0.255,
  angularRadiusRadians: 0.0218,
  lineWidth: 0.052,
  intensity: 1.25,
  opacity: 0.84,
  fadeSeconds: 0.12,
  color: DEFAULT_COLOR,
  includeGlass: true,
  glassOpacity: 0.018,
});

/**
 * Converts one world ray into tangent-angle coordinates around an optical boresight.
 * A true collimated reticle is a direction, not a point on the combiner glass.
 */
export function collimatedAngularCoordinates(rayDirection, basis) {
  const ray = normalized(rayDirection);
  const denominator = dot(ray, basis.forward);
  if (!(denominator > 1e-8)) return { x: 0, y: 0, inFront: false };
  return {
    x: dot(ray, basis.right) / denominator,
    y: dot(ray, basis.up) / denominator,
    inFront: true,
  };
}

/** Intersects an infinite sight direction with the finite combiner plane for tests/diagnostics. */
export function infiniteReticleIntersection(eye, direction, planeOrigin, planeNormal) {
  const ray = normalized(direction);
  const denominator = dot(ray, planeNormal);
  if (Math.abs(denominator) <= 1e-8) return null;
  const distance = dot(subtract(planeOrigin, eye), planeNormal) / denominator;
  if (!(distance > 0)) return null;
  return addScaled(eye, ray, distance);
}

export function createGunsightVisibilityState(initialOpacity = 0) {
  return { opacity: clamp(finite(initialOpacity), 0, 1) };
}

export function stepGunsightVisibility(state, snapshot, deltaSeconds, options = {}) {
  const enabled = options.enabled !== false
    && snapshot?.replay_external !== true
    && snapshot?.primary_bus_powered !== false
    && snapshot?.player_alive !== false;
  const fadeSeconds = Math.max(0.001,
    finite(options.fadeSeconds, DEFAULT_PERIOD_GUNSIGHT_OPTIONS.fadeSeconds));
  state.opacity = moveTowards(
    state.opacity,
    enabled ? 1 : 0,
    clamp(finite(deltaSeconds), 0, 0.1) / fadeSeconds,
  );
  return state;
}

const RETICLE_VERTEX_SHADER = /* glsl */`
  #include <common>
  #include <logdepthbuf_pars_vertex>
  varying vec3 vWorldPosition;

  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
    #include <logdepthbuf_vertex>
  }
`;

const RETICLE_FRAGMENT_SHADER = /* glsl */`
  #include <logdepthbuf_pars_fragment>
  uniform vec3 uBoresightForward;
  uniform vec3 uBoresightRight;
  uniform vec3 uBoresightUp;
  uniform vec3 uReticleColor;
  uniform float uAngularRadius;
  uniform float uLineWidth;
  uniform float uIntensity;
  uniform float uOpacity;
  varying vec3 vWorldPosition;

  float band(float value, float centre, float halfWidth, float antialias) {
    return 1.0 - smoothstep(halfWidth, halfWidth + antialias, abs(value - centre));
  }

  void main() {
    #include <logdepthbuf_fragment>
    vec3 sightRay = normalize(vWorldPosition - cameraPosition);
    float forwardDistance = dot(sightRay, uBoresightForward);
    if (forwardDistance <= 0.0001) discard;

    vec2 tangentAngle = vec2(
      dot(sightRay, uBoresightRight),
      dot(sightRay, uBoresightUp)
    ) / forwardDistance;
    vec2 p = tangentAngle / max(uAngularRadius, 0.00001);
    float radius = length(p);
    float aa = max(fwidth(radius) * 0.8, 0.022);
    float ring = band(radius, 1.0, uLineWidth, aa);
    float centre = 1.0 - smoothstep(0.075, 0.12, radius);

    float horizontal = band(p.y, 0.0, 0.025, aa)
      * smoothstep(0.58, 0.66, abs(p.x))
      * (1.0 - smoothstep(0.91, 0.99, abs(p.x)));
    float vertical = band(p.x, 0.0, 0.025, aa)
      * smoothstep(0.58, 0.66, abs(p.y))
      * (1.0 - smoothstep(0.91, 0.99, abs(p.y)));
    float reticle = max(max(ring, centre), max(horizontal, vertical));
    if (reticle <= 0.001 || uOpacity <= 0.001) discard;
    gl_FragColor = vec4(uReticleColor * uIntensity, reticle * uOpacity);
  }
`;

function disposeObjectResources(root) {
  const geometries = new Set();
  const materials = new Set();
  root.traverse((child) => {
    if (child.geometry) geometries.add(child.geometry);
    if (Array.isArray(child.material)) child.material.forEach((material) => materials.add(material));
    else if (child.material) materials.add(child.material);
  });
  geometries.forEach((geometry) => geometry.dispose?.());
  materials.forEach((material) => material.dispose?.());
}

/**
 * Reticle optical presentation for a period reflector sight.
 *
 * The shader evaluates every glass fragment against a fixed world boresight direction. Moving the
 * eye therefore moves the apparent image across the finite combiner while its aim direction stays
 * at infinity. The object owns all resources it creates and can be detached/re-attached when a
 * content-pack cockpit swaps.
 */
export function createPeriodGunsight(THREE, options = {}) {
  const config = { ...DEFAULT_PERIOD_GUNSIGHT_OPTIONS, ...options };
  const root = new THREE.Group();
  root.name = "PeriodGunsightPresentation";
  root.visible = false;
  const geometry = new THREE.PlaneGeometry(
    config.combinerWidthMetres,
    config.combinerHeightMetres,
  );
  const uniforms = {
    uBoresightForward: { value: new THREE.Vector3(0, 0, -1) },
    uBoresightRight: { value: new THREE.Vector3(1, 0, 0) },
    uBoresightUp: { value: new THREE.Vector3(0, 1, 0) },
    uReticleColor: { value: new THREE.Color(config.color) },
    uAngularRadius: { value: finite(config.angularRadiusRadians, 0.0218) },
    uLineWidth: { value: finite(config.lineWidth, 0.052) },
    uIntensity: { value: finite(config.intensity, 1.25) },
    uOpacity: { value: 0 },
  };
  const material = new THREE.ShaderMaterial({
    name: "PeriodCollimatedReticleMaterial",
    uniforms,
    vertexShader: RETICLE_VERTEX_SHADER,
    fragmentShader: RETICLE_FRAGMENT_SHADER,
    transparent: true,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    extensions: { derivatives: true },
  });
  const reticle = new THREE.Mesh(geometry, material);
  reticle.name = "CollimatedReticleCombiner";
  reticle.castShadow = false;
  reticle.receiveShadow = false;
  reticle.frustumCulled = false;
  reticle.renderOrder = finite(config.renderOrder, 30);
  const offset = config.combinerOffset ?? DEFAULT_PERIOD_GUNSIGHT_OPTIONS.combinerOffset;
  reticle.position.set(finite(offset[0]), finite(offset[1]), finite(offset[2]));
  reticle.rotation.x = finite(config.combinerTiltRadians, 0.255);
  root.add(reticle);

  if (config.includeGlass !== false) {
    const glassMaterial = new THREE.MeshBasicMaterial({
      name: "PeriodGunsightGlassMaterial",
      color: new THREE.Color(0x8fb5a4),
      transparent: true,
      opacity: clamp(finite(config.glassOpacity, 0.018), 0, 0.08),
      depthTest: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      toneMapped: false,
    });
    const glass = new THREE.Mesh(geometry.clone(), glassMaterial);
    glass.name = "PeriodGunsightGlassTint";
    glass.position.copy(reticle.position).add(new THREE.Vector3(0, 0, 0.0005));
    glass.rotation.copy(reticle.rotation);
    glass.castShadow = false;
    glass.receiveShadow = false;
    glass.renderOrder = reticle.renderOrder - 1;
    root.add(glass);
  }

  const visibility = createGunsightVisibilityState();
  const worldQuaternion = new THREE.Quaternion();
  const worldPosition = new THREE.Vector3();
  const worldScale = new THREE.Vector3(1, 1, 1);
  const localMatrix = new THREE.Matrix4();
  const parentInverse = new THREE.Matrix4();
  const localForward = new THREE.Vector3(0, 0, -1);
  const localRight = new THREE.Vector3(1, 0, 0);
  const localUp = new THREE.Vector3(0, 1, 0);
  let anchor = null;
  let enabled = true;
  let disposed = false;

  return {
    object3d: root,
    reticle,
    material,
    uniforms,
    get anchor() { return anchor; },
    get disposed() { return disposed; },
    attach(nextAnchor) {
      if (disposed) throw new Error("Cannot attach a disposed period gunsight.");
      if (!nextAnchor?.isObject3D) {
        throw new TypeError("Period gunsight requires the gunsight.origin semantic Object3D.");
      }
      anchor = nextAnchor;
      return this;
    },
    detach() {
      anchor = null;
      root.visible = false;
      return this;
    },
    setEnabled(value) {
      enabled = value !== false;
    },
    setColor(value) {
      uniforms.uReticleColor.value.set(value);
    },
    update(camera, snapshot, deltaSeconds) {
      if (disposed) return { opacity: 0, visible: false };
      stepGunsightVisibility(visibility, snapshot, deltaSeconds, {
        enabled: enabled && anchor !== null,
        fadeSeconds: config.fadeSeconds,
      });
      uniforms.uOpacity.value = visibility.opacity * clamp(finite(config.opacity, 0.84), 0, 1);
      root.visible = anchor !== null && visibility.opacity > 0;
      if (anchor && camera) {
        anchor.updateWorldMatrix?.(true, false);
        anchor.getWorldQuaternion(worldQuaternion);
        anchor.getWorldPosition(worldPosition);
        anchor.getWorldScale(worldScale);
        localMatrix.compose(worldPosition, worldQuaternion, worldScale);
        if (root.parent) {
          root.parent.updateWorldMatrix?.(true, false);
          parentInverse.copy(root.parent.matrixWorld).invert();
          localMatrix.premultiply(parentInverse);
        }
        localMatrix.decompose(root.position, root.quaternion, root.scale);
        uniforms.uBoresightForward.value.copy(localForward).applyQuaternion(worldQuaternion).normalize();
        uniforms.uBoresightRight.value.copy(localRight).applyQuaternion(worldQuaternion).normalize();
        uniforms.uBoresightUp.value.copy(localUp).applyQuaternion(worldQuaternion).normalize();
      }
      return { opacity: visibility.opacity, visible: root.visible };
    },
    dispose() {
      if (disposed) return;
      root.removeFromParent();
      anchor = null;
      disposeObjectResources(root);
      root.clear();
      disposed = true;
    },
  };
}

/** Resolve by semantic id at the content boundary, never by guessing a node name here. */
export function attachPeriodGunsightToSemanticAnchor(gunsight, resolveAnchor,
  semanticAnchorId = DEFAULT_PERIOD_GUNSIGHT_OPTIONS.semanticAnchorId) {
  if (typeof resolveAnchor !== "function") {
    throw new TypeError("resolveAnchor must be a function accepting a semantic anchor id.");
  }
  const anchor = resolveAnchor(semanticAnchorId);
  if (!anchor) return false;
  gunsight.attach(anchor);
  return true;
}
