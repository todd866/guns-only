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
  // RTB transit is not a precision approach volume. It gets a narrower, brighter chain so the
  // route survives terrain/haze until the authority's detailed recovery gates take over.
  rtbColor: 0xffad3d,
  rtbActiveColor: 0xffc26a,
  rtbOpacity: 0.58,
  rtbActiveOpacity: 0.86,
  rtbVisualHalfM: 25,
  // Perspective makes a constant-size 6 km chain collapse into specks. Grow only the drawn
  // chevrons with distance so the route reads as a corridor; scoring and capture radii are not
  // touched by this presentation-only half-width.
  rtbFarVisualHalfM: 90,
  rtbGateCount: 10,
  rtbMinGateCount: 3,
  rtbGateSpacingM: 750,
  rtbMaxDrawM: 6_000,
  rtbLeadM: 350,
  maxGates: 24,
  // Authored half-widths run hundreds of metres (tolerance volumes). Drawing that as a plane
  // scale makes a translucent UFO on the horizon — cap the *visual* radius; the kernel half
  // stays authoritative for scoring, not for pixels.
  maxVisualHalfM: Infinity,
});

function finiteNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function carrierRtbTarget(state) {
  if (state?.carrier_sortie_route_active !== true
      || state?.carrier_sortie_route_rtb_requested !== true) return null;
  const eastM = finiteNumber(state.carrier_sortie_route_target_x);
  const upM = finiteNumber(state.carrier_sortie_route_target_y);
  const northM = finiteNumber(state.carrier_sortie_route_target_z);
  return eastM === null || upM === null || northM === null
    ? null
    : { eastM, upM, northM, id: `carrier-${state.carrier_sortie_route_fix ?? "rtb"}` };
}

function rapierRtbIntent(state) {
  if (state?.rapier_mission_available !== true || state?.rapier_pattern_only === true) return false;
  const phase = Math.floor(Number(state?.rapier_mission_phase) || 0);
  return phase >= 11 && phase <= 13;
}

function directRtbTarget(state, currentUpM) {
  const active = state?.player_rtb_active === true
    || (state?.rtb_steer === true && state?.recovery_point_known === true)
    || rapierRtbIntent(state);
  if (!active) return null;
  const eastM = finiteNumber(state.mesh_home_east_m);
  const northM = finiteNumber(state.mesh_home_north_m);
  const scheduledUpM = state?.golden_path_valid === true
    ? finiteNumber(state.golden_path_target_alt_m)
    : null;
  if (eastM === null || northM === null) return null;
  return {
    eastM,
    northM,
    upM: scheduledUpM ?? currentUpM,
    id: `home-${state.mesh_home_place_id ?? "rtb"}`,
  };
}

/**
 * Build a bounded chain of directional RTB breadcrumbs from published ownship and recovery truth.
 * These are explicitly transit cues, not a browser-authored landing procedure. As soon as the
 * kernel publishes approach/recovery gates, `createGuidancePath` gives those authored gates
 * priority and this chain disappears.
 */
export function rtbGuidanceGates(state = {}, options = {}) {
  const config = { ...GUIDANCE_PATH_DEFAULTS, ...options };
  const eastM = finiteNumber(state?.px);
  const upM = finiteNumber(state?.py);
  const northM = finiteNumber(state?.pz);
  if (eastM === null || upM === null || northM === null) return [];
  const carrierRequested = state?.carrier_sortie_route_active === true
    && state?.carrier_sortie_route_rtb_requested === true;
  // A requested carrier route owns destination truth. If its current fix is malformed, hide;
  // falling through to a land Home Plate would draw a confident corridor to the wrong recovery.
  const target = carrierRequested ? carrierRtbTarget(state) : directRtbTarget(state, upM);
  if (!target) return [];

  const deltaEastM = target.eastM - eastM;
  const deltaNorthM = target.northM - northM;
  const rangeM = Math.hypot(deltaEastM, deltaNorthM);
  if (!(rangeM > 15)) return [];
  const dirEast = deltaEastM / rangeM;
  const dirNorth = deltaNorthM / rangeM;
  const leadM = Math.min(config.rtbLeadM, rangeM * 0.30);
  const drawnM = Math.max(0, Math.min(config.rtbMaxDrawM, rangeM - leadM));
  if (!(drawnM > 1)) return [];
  const minimumCount = Math.max(3, Math.floor(config.rtbMinGateCount));
  const maximumCount = Math.max(minimumCount, Math.floor(config.rtbGateCount));
  const densityCount = Math.floor(drawnM / Math.max(1, config.rtbGateSpacingM)) + 1;
  const count = Math.min(maximumCount, Math.max(minimumCount, densityCount));
  const gates = [];
  for (let index = 0; index < count; index += 1) {
    const along = index / Math.max(1, count - 1);
    const distanceM = leadM + drawnM * along;
    const targetFraction = Math.min(1, distanceM / rangeM);
    // Hold current altitude through most of a long transit. The last quarter blends toward the
    // authority's next-fix/schedule height; detailed approach gates supersede this before landing.
    const descentBlend = Math.max(0, (targetFraction - 0.75) / 0.25);
    const smoothBlend = descentBlend * descentBlend * (3 - 2 * descentBlend);
    gates.push({
      id: `rtb-${target.id}-${index}`,
      eastM: eastM + dirEast * distanceM,
      upM: upM + (target.upM - upM) * smoothBlend,
      northM: northM + dirNorth * distanceM,
      halfM: config.rtbVisualHalfM
        + (config.rtbFarVisualHalfM - config.rtbVisualHalfM) * Math.sqrt(along),
      active: index === 0,
      dirty: false,
      rtb: true,
    });
  }
  return gates;
}

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

// Transit guidance is a sparse sequence of open V cues, not a filled tunnel. The shape matches
// Cobra's accepted crow's-foot language while retaining fixed-wing authority positions and
// altitude schedules. Normal alpha avoids the white additive bloom of the old RTB discs.
const RTB_FRAGMENT = /* glsl */`
  precision mediump float;
  uniform vec3 uColor;
  uniform float uOpacity;
  varying vec2 vLocal;
  void main() {
    float x = abs(vLocal.x);
    float shoulder = clamp(x / 0.96, 0.0, 1.0);
    float chevronY = mix(-0.40, 0.34, shoulder);
    float stroke = 1.0 - smoothstep(0.055, 0.13, abs(vLocal.y - chevronY));
    float ends = 1.0 - smoothstep(0.92, 1.02, x);
    float alpha = stroke * ends * uOpacity;
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
  root.userData = root.userData ?? {};
  root.userData.mode = null;
  // Drawn after the world so it reads through haze, but still depth-tested: a gate behind a hill
  // stays behind that hill rather than becoming a magic overlay.
  root.renderOrder = 12;

  const gates = [];
  // ONE material, therefore one shader program compile. Twenty-four ShaderMaterials meant
  // twenty-four program compilations in the first frames after boot, which is a visible stutter
  // exactly when the pilot is watching the world appear. Per-gate colour and density are pushed
  // as uniforms immediately before each mesh draws instead.
  const quad = new THREE.PlaneGeometry(4, 4);
  const procedureMaterial = new THREE.ShaderMaterial({
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
  const rtbMaterial = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(config.rtbColor) },
      uOpacity: { value: config.rtbOpacity },
    },
    vertexShader: GATE_VERTEX,
    fragmentShader: RTB_FRAGMENT,
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.NormalBlending,
    side: THREE.DoubleSide,
    toneMapped: false,
  });
  for (let i = 0; i < config.maxGates; i++) {
    const mesh = new THREE.Mesh(quad, procedureMaterial);
    mesh.frustumCulled = false;
    mesh.visible = false;
    mesh.userData = mesh.userData ?? {};
    mesh.userData.guidanceStyle = "procedure-volume";
    const tint = { color: config.gateColor, opacity: config.gateOpacity };
    mesh.onBeforeRender = () => {
      mesh.material.uniforms.uColor.value.set(tint.color);
      mesh.material.uniforms.uOpacity.value = tint.opacity;
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
  let cachedRtbKey = null;
  let cachedRtbLadder = [];
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
      const carrierRtbRequested = state?.carrier_sortie_route_active === true
        && state?.carrier_sortie_route_rtb_requested === true;
      const recoveryIntent = approachActive
        || state?.player_rtb_active === true
        || (state?.rtb_steer === true && state?.recovery_point_known === true)
        || rapierRtbIntent(state)
        || carrierRtbRequested;
      const samples = state?.approach_gates;
      const hotApproach = approachActive && Array.isArray(samples);
      // Four numeric gates are cheaper to map than to fingerprint, and every coordinate matters
      // for a moving ship. JSON ladders remain cached because parsing those every frame did cause
      // visible stutter.
      const raw = recoveryIntent
        ? (approachActive
          ? `approach:${state?.approach_gates_json ?? ""}`
          : carrierRtbRequested ? null : (state?.recovery_gates_json ?? null))
        : null;
      if (hotApproach) {
        cachedRaw = null;
        cachedLadder = resolveGuidanceGates(state ?? {});
        cachedRtbKey = null;
        cachedRtbLadder = [];
      } else if (!recoveryIntent) {
        cachedRaw = null;
        cachedLadder = [];
        cachedRtbKey = null;
        cachedRtbLadder = [];
      } else if (carrierRtbRequested) {
        // A moving carrier route owns transit destination truth. Generic land recovery ladders
        // can remain populated in the snapshot, so they must not outrank the current route fix.
        cachedRaw = null;
        cachedLadder = [];
      } else if (raw !== cachedRaw) {
        cachedRaw = raw;
        cachedLadder = resolveGuidanceGates(state ?? {});
      }
      let ladder = cachedLadder;
      let rtbMode = false;
      if (ladder.length) {
        // Procedure ownership is a lifecycle boundary. Do not replay ownship-relative transit
        // breadcrumbs from before an approach if the renderer later returns to the same bucket.
        cachedRtbKey = null;
        cachedRtbLadder = [];
      }
      if (!ladder.length) {
        // Once authority says approach guidance is active, coarse transit crumbs are stale. An
        // empty/malformed gate frame must hide, never flash Home Plate through the final approach.
        if (approachActive) {
          root.visible = false;
          root.userData.mode = null;
          return 0;
        }
        const px = finiteNumber(state?.px);
        const py = finiteNumber(state?.py);
        const pz = finiteNumber(state?.pz);
        const rtbKey = [
          state?.player_rtb_active === true ? 1 : 0,
          state?.rtb_steer === true ? 1 : 0,
          state?.recovery_point_known === true ? 1 : 0,
          state?.carrier_sortie_route_active === true ? 1 : 0,
          state?.carrier_sortie_route_rtb_requested === true ? 1 : 0,
          rapierRtbIntent(state) ? 1 : 0,
          Math.floor(Number(state?.rapier_mission_phase) || 0),
          state?.carrier_sortie_route_fix ?? "",
          state?.mesh_home_place_id ?? "",
          finiteNumber(state?.mesh_home_east_m) ?? "",
          finiteNumber(state?.mesh_home_north_m) ?? "",
          finiteNumber(state?.carrier_sortie_route_target_x) ?? "",
          finiteNumber(state?.carrier_sortie_route_target_y) ?? "",
          finiteNumber(state?.carrier_sortie_route_target_z) ?? "",
          state?.golden_path_valid === true ? 1 : 0,
          finiteNumber(state?.golden_path_target_alt_m) ?? "",
          px === null ? "" : Math.round(px / 100),
          py === null ? "" : Math.round(py / 50),
          pz === null ? "" : Math.round(pz / 100),
        ].join("|");
        if (rtbKey !== cachedRtbKey) {
          cachedRtbKey = rtbKey;
          cachedRtbLadder = rtbGuidanceGates(state ?? {}, config);
        }
        ladder = cachedRtbLadder;
        rtbMode = ladder.length > 0;
      }
      if (!ladder.length) {
        root.visible = false;
        root.userData.mode = null;
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
        root.userData.mode = null;
        return 0;
      }

      const drawn = Math.min(points.length, gates.length);
      for (let i = 0; i < gates.length; i++) {
        const { mesh, tint } = gates[i];
        if (i >= drawn) { mesh.visible = false; continue; }
        const gate = ladder[i];
        const half = Math.max(1, Number(gate.halfM) || 1);
        const visualHalf = Math.min(half, Math.max(1, Number(config.maxVisualHalfM) || half));
        mesh.position.copy(points[i]);
        // The quad is 4 units wide for 2 units of radius, so the visual half-width maps to
        // 1.0 in shader space. Visual radius is capped so a 155 m tolerance does not paint a
        // gorge-spanning diamond (owner 2026-08-08: "what's that giant thing").
        mesh.scale.setScalar(visualHalf);

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

        if (gate.rtb === true) {
          mesh.material = rtbMaterial;
          mesh.userData.guidanceStyle = "rtb-chevron";
          tint.color = gate.active ? config.rtbActiveColor : config.rtbColor;
          tint.opacity = gate.active ? config.rtbActiveOpacity : config.rtbOpacity;
        } else if (gate.active) {
          mesh.material = procedureMaterial;
          mesh.userData.guidanceStyle = "procedure-volume";
          tint.color = config.activeColor;
          tint.opacity = config.activeOpacity;
        } else {
          mesh.material = procedureMaterial;
          mesh.userData.guidanceStyle = "procedure-volume";
          tint.color = gate.dirty ? config.dirtyColor : config.gateColor;
          tint.opacity = config.gateOpacity;
        }
        mesh.visible = true;
      }

      root.visible = true;
      root.userData.mode = rtbMode ? "rtb" : "procedure";
      return drawn;
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      root.removeFromParent();
      quad.dispose();
      procedureMaterial.dispose();
      rtbMaterial.dispose();
    },
  };
}
