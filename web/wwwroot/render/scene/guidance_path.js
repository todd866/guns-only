// World-space guidance geometry: the path the pilot should fly, drawn into the world instead of
// described to them in words.
//
// ADR-0003 keeps the world painterly and forbids stylization that warps a flight-critical cue.
// This sits on that seam. Positions come straight from the kernel's authored gates -- no spline,
// no rounding, nothing invented by the renderer -- so the guidance cannot drift away from what
// the procedure actually holds. What is stylized is how that truth is lit, and how wide it is
// allowed to look.
//
// NOTHING HERE DRAWS A HARD EDGE, AND NOTHING HERE ASKS FOR PRECISION. A head-up display is a
// see-through device; symbology that occludes the world outside is a failure, not a feature.
// Every element fades continuously to nothing, never writes depth, and peaks well below opaque,
// so the guidance can be looked THROUGH and disagreed with.
//
// What is drawn is a PROBABLE REGION, not a rail. Teaching someone to fly a circuit is not
// teaching them to thread a hoop: the good paths live in a broad volume, and the kernel agrees --
// authored gate half-widths run 250-700 m. Rendering that as a thin ring would imply a precision
// the procedure never wanted, which is the same mistake that made recovery unflyable when
// RecoveryProcedure required passing inside the sphere at +/-25 kt before it would sequence.
// So density falls off smoothly from the ideal centre to the edge of tolerance: brightest where
// the path is best, still lit where it is merely fine, gone where it stops being either.
//
// Registration, which is what makes synthetic-vision pathways hard in real aviation, does not
// exist here: the kernel knows position and attitude exactly, so a conformal path cannot drift
// off the world and lie about where the gate is.

import { resolveGuidanceGates } from "../nav/mesh_nav_presentation.js";

// World is east/up/north; the scene negates north. Matches app.js playerPosition.set(px, py, -pz).
export function gateToScenePosition(gate) {
  return {
    x: Number(gate?.eastM),
    y: Number(gate?.upM),
    z: -Number(gate?.northM),
  };
}

export const GUIDANCE_PATH_DEFAULTS = Object.freeze({
  // Warm and handmade rather than avionics cyan: a painted world should not sprout a wireframe.
  gateColor: 0xf2d9a0,
  activeColor: 0xfff1d6,
  dirtyColor: 0xe6b6bd,
  // Peak alpha at the cloud's core. Low on purpose: this is haze you fly through, not a wall.
  gateOpacity: 0.16,
  activeOpacity: 0.30,
  maxGates: 24,
});

const GATE_VERTEX = /* glsl */`
  varying vec2 vLocal;
  void main() {
    vLocal = position.xy;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

// A soft volume, densest along the ideal path and thinning to nothing by the edge of tolerance.
// No band, no rim, no edge anywhere -- look past it and it simply gets thinner.
const GATE_FRAGMENT = /* glsl */`
  precision mediump float;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vLocal;
  void main() {
    float r = length(vLocal);
    // A probability cloud, not a ring: densest on the ideal line, thinning smoothly outward and
    // gone by the edge of the authored tolerance. There is no boundary anywhere to read as a
    // pass/fail edge, because the procedure does not grade it that way.
    float core = 1.0 - smoothstep(0.0, 1.0, r);
    float alpha = core * core * uOpacity;
    if (alpha < 0.004) discard;
    gl_FragColor = vec4(uColor, alpha);
  }
`;

/**
 * Build the scene object for a recovery/circuit gate ladder: a chain of soft volumes marking
 * where the good paths live. Positions are authored truth; the fuzziness is entirely in the
 * shader, never in the coordinates.
 */
export function createGuidancePath(THREE, options = {}) {
  const config = { ...GUIDANCE_PATH_DEFAULTS, ...options };
  const root = new THREE.Group();
  root.name = "GuidancePath";
  root.visible = false;
  // Drawn after the world so it reads through haze, but still depth-tested: a gate behind a hill
  // stays behind that hill rather than becoming a magic overlay.
  root.renderOrder = 12;

  const gates = [];
  // ONE material, therefore one shader program compile. Twenty-four ShaderMaterials meant
  // twenty-four program compilations in the first frames after boot, which is a visible stutter
  // exactly when the pilot is watching the world appear. Per-gate colour and density are pushed
  // as uniforms immediately before each mesh draws instead.
  const quad = new THREE.PlaneGeometry(4, 4);
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(config.gateColor) },
      uOpacity: { value: config.gateOpacity },
    },
    vertexShader: GATE_VERTEX,
    fragmentShader: GATE_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  for (let i = 0; i < config.maxGates; i++) {
    const mesh = new THREE.Mesh(quad, material);
    mesh.frustumCulled = false;
    mesh.visible = false;
    const tint = { color: config.gateColor, opacity: config.gateOpacity };
    mesh.onBeforeRender = () => {
      material.uniforms.uColor.value.set(tint.color);
      material.uniforms.uOpacity.value = tint.opacity;
    };
    gates.push({ mesh, tint });
    root.add(mesh);
  }

  let disposed = false;
  // The ladder is a JSON string on the snapshot and it changes only when the procedure changes.
  // Parsing it every frame put a string parse in the render loop; cache on the raw string so a
  // steady recovery costs one identity comparison per frame instead.
  let cachedRaw = null;
  let cachedLadder = [];
  const forward = new THREE.Vector3();
  const lookTarget = new THREE.Vector3();

  return {
    object3d: root,

    /**
     * @param state authoritative snapshot; prefers approach_gates when guidance is active.
     * @returns number of gates drawn, so tests can assert the path is actually present.
     */
    update(state) {
      if (disposed) return 0;
      const approachActive = state?.approach_guidance_active === true;
      const samples = state?.approach_gates;
      const hotApproach = approachActive && Array.isArray(samples);
      // Four numeric gates are cheaper to map than to fingerprint, and every coordinate matters
      // for a moving ship. JSON ladders remain cached because parsing those every frame did cause
      // visible stutter.
      const raw = approachActive
        ? `approach:${state?.approach_gates_json ?? ""}`
        : (state?.recovery_gates_json ?? null);
      if (hotApproach) {
        cachedRaw = null;
        cachedLadder = resolveGuidanceGates(state ?? {});
      } else if (raw !== cachedRaw) {
        cachedRaw = raw;
        cachedLadder = resolveGuidanceGates(state ?? {});
      }
      const ladder = cachedLadder;
      if (!ladder.length) {
        root.visible = false;
        return 0;
      }

      const points = [];
      for (const gate of ladder) {
        const p = gateToScenePosition(gate);
        if (!Number.isFinite(p.x) || !Number.isFinite(p.y) || !Number.isFinite(p.z)) continue;
        points.push(new THREE.Vector3(p.x, p.y, p.z));
      }
      if (!points.length) {
        root.visible = false;
        return 0;
      }

      const drawn = Math.min(points.length, gates.length);
      for (let i = 0; i < gates.length; i++) {
        const { mesh, tint } = gates[i];
        if (i >= drawn) { mesh.visible = false; continue; }
        const gate = ladder[i];
        const half = Math.max(1, Number(gate.halfM) || 1);
        mesh.position.copy(points[i]);
        // The quad is 4 units wide for 2 units of radius, so the authored half-width maps to
        // 1.0 in shader space: the cloud thins to nothing exactly at the tolerance the kernel
        // holds, rather than at some tighter line invented by the renderer.
        mesh.scale.setScalar(half);

        // Face along the leg into the gate, so it is something flown THROUGH rather than a
        // billboard that turns to watch the pilot.
        const neighbour = points[i + 1] ?? points[i - 1] ?? null;
        if (neighbour) {
          forward.copy(neighbour).sub(points[i]);
          if (i + 1 >= points.length) forward.negate();
          if (forward.lengthSq() > 1e-6) {
            lookTarget.copy(points[i]).add(forward.normalize());
            mesh.lookAt(lookTarget);
          }
        }

        if (gate.active) {
          tint.color = config.activeColor;
          tint.opacity = config.activeOpacity;
        } else {
          tint.color = gate.dirty ? config.dirtyColor : config.gateColor;
          tint.opacity = config.gateOpacity;
        }
        mesh.visible = true;
      }

      root.visible = true;
      return drawn;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      quad.dispose();
      material.dispose();
    },
  };
}
