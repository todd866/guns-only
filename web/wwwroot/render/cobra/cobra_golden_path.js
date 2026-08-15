/**
 * The golden path — sparse, terrain-conforming amber chevrons that lead the pilot to the
 * objective or back to Camp Ember.
 *
 * The standing complaint is "it is not obvious where I am supposed to fly". A chart answers that
 * with a look DOWN; this answers it through the windscreen. The reference is the Hogwarts Legacy
 * guide wisp, but the useful aviation/game pattern is a previewed sequence of open cues: enough
 * path to read the next turn and altitude, not a solid tunnel painted over the world.
 *
 *   1. IT MOVES. One brighter leader travels away from the ship through the sequence.
 *   2. IT IS OPEN. Small crow's-foot chevrons communicate direction while leaving almost all of
 *      the terrain untouched. No rectangles, filled road, tunnel, or vertical light stack.
 *   3. IT IS WORLD-REGISTERED. Every cue rides just below eye line and clears sampled terrain.
 *   4. IT ENDS. Inside the arrival radius the opacity reaches literal zero, so it never nags.
 *
 * ONE ENGINE. Nothing here invents an objective: the target is the nearest hostile-owned entry of
 * the authoritative ground_war `sites[]`, which is the same rule `cobraTacticalMapModel` applies
 * (the test asserts the two agree on a shared fixture). If the sim publishes no hostile site there
 * is no path.
 *
 * COST. One Mesh, one ShaderMaterial, one static index buffer: 32 triangles, one draw call, no
 * shadow submission, no per-frame allocation. Geometry is re-sampled only on a meaningful move.
 */

/** Presentation contract id, in the house `guns-only.<thing>.vN` form. */
import { cobraObjectiveSiteId } from "./cobra_objective_site.js?v=331";
import { emberRtbVisualState } from "./cobra_ember_path.js?v=331";

export const COBRA_GOLDEN_PATH_SCHEMA = "guns-only.cobra-golden-path.v2";

export const COBRA_GOLDEN_PATH_DEFAULTS = Object.freeze({
  /** Sparse preview: enough future information to read the route without forming a tunnel. */
  markerCount: 8,
  markerSpacingM: 90,
  markerHalfWidthM: 7,
  markerHeightM: 4,
  markerThicknessM: 1.05,
  /** Fallback and eye-following clearance limits (m AGL). */
  clearanceM: 34,
  minClearanceM: 14,
  maxClearanceM: 55,
  eyeLineOffsetM: -12,
  /** Long enough for turn preview, short enough that cues do not carpet the valley. */
  maxLengthM: 1_400,
  leadM: 95,
  /** Normal alpha keeps the amber legible without additive white bloom. */
  peakOpacity: 0.82,
  /** One leader traverses the marker sequence roughly every four seconds. */
  flowCyclesPerSecond: 0.24,
  /** Ship must move this far before the spine is re-sampled. */
  rebuildDistanceM: 25,
  /** Fully transparent inside this range; it has finished its job. */
  arrivedRadiusM: 260,
  rtbArrivedRadiusM: 75,
  routeArrivedRadiusM: 75,
  /**
   * Pale warm haze. Sits between the profile's sun (0xffe2b4) and its fog (0x8a9fa5), because that
   * is physically what lit mist is: sunlight scattered by the air the scene is already full of.
   * Additive over a grey-green monsoon sky it prints as a soft gold, never a saturated one.
   */
  color: 0xffad3d,
  correctionColor: 0xff613f,
  /** Rise limit between cues used to keep a terrain step from becoming a vertical stack. */
  descentGradient: 0.12,
});

const VERTEX_SHADER = `
varying vec2 vMarkerUv;
void main() {
  vMarkerUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// UV.x is a marker's fixed route phase. UV.y runs across the thin arm/tick, softly trimming its
// outer pixels. Distant cues recede gently and one traveling emphasis provides direction without
// moving world geometry.
const FRAGMENT_SHADER = `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uFlow;
varying vec2 vMarkerUv;

void main() {
  float edge = smoothstep(0.0, 0.22, vMarkerUv.y)
    * (1.0 - smoothstep(0.78, 1.0, vMarkerUv.y));
  float delta = abs(fract(vMarkerUv.x - uFlow + 0.5) - 0.5);
  float leader = 1.0 - smoothstep(0.02, 0.14, delta);
  float distanceFade = mix(1.0, 0.58, vMarkerUv.x);
  float alpha = uOpacity * edge * distanceFade * (0.46 + 0.44 * leader);
  if (alpha < 0.004) discard;
  gl_FragColor = vec4(uColor, alpha);
}
`;

/**
 * Scroll phase of the haze bands. A PURE function of time — no Math.random, no Date.now — so a
 * replay, a headless still and a live frame at the same mission time all show the same picture.
 * @returns {number} phase in [0, 1)
 */
export function cobraGoldenPathFlowOffset(nowSeconds, cyclesPerSecond = COBRA_GOLDEN_PATH_DEFAULTS.flowCyclesPerSecond) {
  const seconds = Number(nowSeconds);
  const rate = Number(cyclesPerSecond);
  if (!Number.isFinite(seconds) || !Number.isFinite(rate)) return 0;
  const raw = seconds * rate;
  return raw - Math.floor(raw);
}

/**
 * The destination, resolved from authority alone. Combat uses the shared objective-site resolver;
 * RTB uses the published Camp Ember FOB. The ribbon and tactical map therefore cannot disagree,
 * and the return path cannot keep pointing at an enemy after the order says RTB.
 * @returns {{ siteId: string, eastM: number, northM: number } | null}
 */
export function cobraGoldenPathObjective(groundWar, player, missionAct = "") {
  if (String(missionAct).toLowerCase() === "rtb") {
    const eastM = Number(groundWar?.fob?.x_m);
    const northM = Number(groundWar?.fob?.z_m);
    if (!Number.isFinite(eastM) || !Number.isFinite(northM)) return null;
    return { siteId: "camp-ember-rtb", eastM, northM, mode: "rtb" };
  }
  const sites = Array.isArray(groundWar?.sites) ? groundWar.sites : null;
  if (!sites || sites.length === 0) return null;
  const playerEastM = Number(player?.eastM) || 0;
  const playerNorthM = Number(player?.northM) || 0;
  const siteId = cobraObjectiveSiteId({
    sites,
    units: groundWar?.units,
    player: { eastM: playerEastM, northM: playerNorthM },
  });
  const site = sites.find((candidate) => candidate?.id === siteId) ?? null;
  const eastM = Number(site?.x_m);
  const northM = Number(site?.z_m);
  return siteId && Number.isFinite(eastM) && Number.isFinite(northM)
    ? { siteId, eastM, northM, mode: "objective" }
    : null;
}

function cobraRouteGateObjective(pathGates, missionAct) {
  const act = String(missionAct).toLowerCase();
  if (act !== "depart" && act !== "ingress" && act !== "rtb") return null;
  const gates = Array.isArray(pathGates) ? pathGates : [];
  const index = gates.findIndex((gate) => gate?.active === true);
  const gate = gates[index];
  const eastM = Number(gate?.east_m);
  const northM = Number(gate?.north_m);
  return index >= 0 && Number.isFinite(eastM) && Number.isFinite(northM)
    ? { siteId: `ember-route-gate-${index}`, eastM, northM, mode: "route" }
    : null;
}

// Reused so the frame loop allocates nothing. There is one golden path in a scene; if that ever
// stops being true, hand each one its own state object instead.
const frameStateScratch = {
  player: { eastM: 0, northM: 0, altitudeM: 0, headingRad: 0 },
  objective: null,
  groundHeightAt: null,
  nowSeconds: 0,
  arrivedRadiusM: COBRA_GOLDEN_PATH_DEFAULTS.arrivedRadiusM,
  recoveryVisual: null,
};

/**
 * Frame state for `update`, built from the authority snapshot and the ship pose. Lives here rather
 * than in the lab page so the wiring at the call site stays a single line.
 *
 * `suppressed` is the tour camera and the parked review camera: on rails the pilot is not flying,
 * and a scenery still must score the gorge, not a guidance cue.
 */
export function cobraGoldenPathState({
  groundWar,
  pathGates = null,
  pose,
  groundHeightAt,
  nowSeconds,
  missionAct = "",
  speedKts = Number.NaN,
  sinkFpm = Number.NaN,
  suppressed = false,
  arrivedRadiusM = null,
} = {}) {
  const player = frameStateScratch.player;
  player.eastM = Number(pose?.x_m) || 0;
  player.northM = Number(pose?.z_m) || 0;
  player.altitudeM = Number(pose?.y_m) || 0;
  player.headingRad = Number(pose?.yaw_rad) || 0;
  const act = String(missionAct).toLowerCase();
  const routeAct = act === "depart" || act === "ingress"
    || (act === "rtb" && Array.isArray(pathGates) && pathGates.length > 0);
  frameStateScratch.objective = suppressed || !pose
    ? null
    : routeAct
      ? cobraRouteGateObjective(pathGates, act)
      : cobraGoldenPathObjective(groundWar, player, act);
  frameStateScratch.groundHeightAt = groundHeightAt;
  frameStateScratch.nowSeconds = Number(nowSeconds) || 0;
  const fobEastM = Number(groundWar?.fob?.x_m);
  const fobNorthM = Number(groundWar?.fob?.z_m);
  const fobRangeM = Number.isFinite(fobEastM) && Number.isFinite(fobNorthM)
    ? Math.hypot(fobEastM - player.eastM, fobNorthM - player.northM)
    : Number.NaN;
  frameStateScratch.recoveryVisual = act === "rtb"
    ? emberRtbVisualState({ remainingM: fobRangeM, speedKts, sinkFpm })
    : null;
  const explicitRadiusM = arrivedRadiusM === null || arrivedRadiusM === undefined
    ? Number.NaN
    : Number(arrivedRadiusM);
  frameStateScratch.arrivedRadiusM = Number.isFinite(explicitRadiusM)
    ? explicitRadiusM
    : act === "rtb"
      ? COBRA_GOLDEN_PATH_DEFAULTS.rtbArrivedRadiusM
      : routeAct
        ? COBRA_GOLDEN_PATH_DEFAULTS.routeArrivedRadiusM
        : COBRA_GOLDEN_PATH_DEFAULTS.arrivedRadiusM;
  return frameStateScratch;
}

/**
 * @param {typeof import("../../vendor/three.module.js")} THREE
 * @returns {{
 *   group: import("../../vendor/three.module.js").Group,
 *   update(state: object): void,
 *   dispose(): void,
 * }}
 */
export function createCobraGoldenPath(THREE, options = {}) {
  const config = { ...COBRA_GOLDEN_PATH_DEFAULTS, ...options };
  const markerCount = Math.max(3, Math.floor(config.markerCount));
  const quadsPerMarker = 2;
  const verticesPerQuad = 4;
  const verticesPerMarker = quadsPerMarker * verticesPerQuad;
  const vertexCount = markerCount * verticesPerMarker;
  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint16Array(markerCount * quadsPerMarker * 6);

  for (let marker = 0; marker < markerCount; marker += 1) {
    const phase = marker / markerCount;
    for (let quad = 0; quad < quadsPerMarker; quad += 1) {
      const vertexBase = marker * verticesPerMarker + quad * verticesPerQuad;
      for (let corner = 0; corner < verticesPerQuad; corner += 1) {
        uvs[(vertexBase + corner) * 2] = phase;
        uvs[(vertexBase + corner) * 2 + 1] = corner === 0 || corner === 3 ? 0 : 1;
      }
      const cursor = (marker * quadsPerMarker + quad) * 6;
      indices[cursor] = vertexBase;
      indices[cursor + 1] = vertexBase + 1;
      indices[cursor + 2] = vertexBase + 2;
      indices[cursor + 3] = vertexBase;
      indices[cursor + 4] = vertexBase + 2;
      indices[cursor + 5] = vertexBase + 3;
    }
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  positionAttribute.setUsage?.(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);
  const uvAttribute = new THREE.BufferAttribute(uvs, 2);
  uvAttribute.setUsage?.(THREE.DynamicDrawUsage);
  geometry.setAttribute("uv", uvAttribute);
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(config.color) },
      uOpacity: { value: 0 },
      uFlow: { value: 0 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    blending: THREE.NormalBlending,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
    toneMapped: false,
  });
  material.opacity = 0;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "COBRA_GOLDEN_PATH_CHEVRONS";
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  mesh.renderOrder = 6;

  const group = new THREE.Group();
  group.name = "COBRA_GOLDEN_PATH";
  group.userData.schema = COBRA_GOLDEN_PATH_SCHEMA;
  group.userData.style = "open-chevrons";
  group.userData.markerCount = markerCount;
  group.userData.activeMarkerCount = 0;
  group.userData.rebuildCount = 0;
  group.userData.clearanceM = config.clearanceM;
  group.userData.mode = null;
  group.visible = false;
  group.add(mesh);

  const spineEast = new Float64Array(markerCount);
  const spineNorth = new Float64Array(markerCount);
  const spineUp = new Float64Array(markerCount);

  let lastObjectiveId = null;
  let lastObjectiveEastM = Number.NaN;
  let lastObjectiveNorthM = Number.NaN;
  let lastPlayerEastM = Number.NaN;
  let lastPlayerNorthM = Number.NaN;
  let lastPlayerAltitudeM = Number.NaN;
  let lastRecoveryPhase = null;

  function setVertex(index, x, y, z) {
    const cursor = index * 3;
    positions[cursor] = x;
    positions[cursor + 1] = y;
    positions[cursor + 2] = z;
  }

  function writeQuad(vertexBase, a, b, c, d) {
    setVertex(vertexBase, a.x, a.y, a.z);
    setVertex(vertexBase + 1, b.x, b.y, b.z);
    setVertex(vertexBase + 2, c.x, c.y, c.z);
    setVertex(vertexBase + 3, d.x, d.y, d.z);
  }

  function writeArm(vertexBase, startX, startY, startZ, endX, endY, endZ, lateralX, lateralZ) {
    const deltaX = endX - startX;
    const deltaY = endY - startY;
    const deltaZ = endZ - startZ;
    const deltaLateral = deltaX * lateralX + deltaZ * lateralZ;
    const length = Math.hypot(deltaLateral, deltaY) || 1;
    const normalLateral = -deltaY / length;
    const normalY = deltaLateral / length;
    const normalX = lateralX * normalLateral;
    const normalZ = lateralZ * normalLateral;
    const half = config.markerThicknessM * 0.5;
    writeQuad(
      vertexBase,
      { x: startX + normalX * half, y: startY + normalY * half, z: startZ + normalZ * half },
      { x: startX - normalX * half, y: startY - normalY * half, z: startZ - normalZ * half },
      { x: endX - normalX * half, y: endY - normalY * half, z: endZ - normalZ * half },
      { x: endX + normalX * half, y: endY + normalY * half, z: endZ + normalZ * half },
    );
  }

  function needsRebuild(objective, playerEastM, playerNorthM, playerAltitudeM, recoveryVisual) {
    if (objective.siteId !== lastObjectiveId) return true;
    if (!(Math.abs(objective.eastM - lastObjectiveEastM) < 1)) return true;
    if (!(Math.abs(objective.northM - lastObjectiveNorthM) < 1)) return true;
    if (!Number.isFinite(lastPlayerEastM)) return true;
    if ((recoveryVisual?.phase ?? null) !== lastRecoveryPhase) return true;
    const movedM = Math.hypot(playerEastM - lastPlayerEastM, playerNorthM - lastPlayerNorthM);
    if (movedM >= config.rebuildDistanceM) return true;
    return Number.isFinite(playerAltitudeM)
      && (!Number.isFinite(lastPlayerAltitudeM)
        || Math.abs(playerAltitudeM - lastPlayerAltitudeM) >= 12);
  }

  function rebuild(objective, playerEastM, playerNorthM, playerAltitudeM, groundHeightAt, recoveryVisual) {
    const toEastM = objective.eastM - playerEastM;
    const toNorthM = objective.northM - playerNorthM;
    const rangeM = Math.hypot(toEastM, toNorthM);
    if (!(rangeM > 1e-3)) return false;
    const dirEast = toEastM / rangeM;
    const dirNorth = toNorthM / rangeM;
    const leadM = Math.min(config.leadM, rangeM * 0.5);
    const markerReachM = config.markerHalfWidthM;
    const drawnM = Math.min(
      Math.max(0, config.maxLengthM - markerReachM),
      rangeM - leadM,
    );
    const activeMarkerCount = Math.min(
      markerCount,
      Math.max(3, Math.floor(drawnM / Math.max(1, config.markerSpacingM)) + 1),
    );
    const markerStepM = drawnM / Math.max(1, activeMarkerCount - 1);
    const sample = typeof groundHeightAt === "function" ? groundHeightAt : () => 0;
    const at = (eastM, northM) => {
      const groundM = Number(sample(eastM, northM));
      return Number.isFinite(groundM) ? groundM : 0;
    };
    const playerAglM = playerAltitudeM - at(playerEastM, playerNorthM);
    const desiredClearanceM = Number.isFinite(playerAglM)
      ? Math.min(config.maxClearanceM, Math.max(
        config.minClearanceM,
        playerAglM + config.eyeLineOffsetM,
      ))
      : config.clearanceM;
    group.userData.clearanceM = desiredClearanceM;
    group.userData.mode = objective.mode ?? "objective";

    const markerHalfWidthM = Number.isFinite(Number(recoveryVisual?.halfWidthM))
      ? Number(recoveryVisual.halfWidthM)
      : config.markerHalfWidthM;
    group.userData.markerHalfWidthM = markerHalfWidthM;
    const perpEast = -dirNorth;
    const perpNorth = dirEast;
    for (let marker = 0; marker < activeMarkerCount; marker += 1) {
      const distanceM = leadM + markerStepM * marker;
      const eastM = playerEastM + dirEast * distanceM;
      const northM = playerNorthM + dirNorth * distanceM;
      spineEast[marker] = eastM;
      spineNorth[marker] = northM;
      const groundM = Math.max(
        at(eastM, northM),
        at(eastM + perpEast * markerHalfWidthM,
          northM + perpNorth * markerHalfWidthM),
        at(eastM - perpEast * markerHalfWidthM,
          northM - perpNorth * markerHalfWidthM),
      );
      spineUp[marker] = groundM + desiredClearanceM + config.markerThicknessM * 0.5;
    }

    const maxDropM = Math.max(0, config.descentGradient) * markerStepM;
    for (let marker = 1; marker < activeMarkerCount; marker += 1) {
      spineUp[marker] = Math.max(spineUp[marker], spineUp[marker - 1] - maxDropM);
    }
    for (let marker = activeMarkerCount - 2; marker >= 0; marker -= 1) {
      spineUp[marker] = Math.max(spineUp[marker], spineUp[marker + 1] - maxDropM);
    }

    const perpX = -dirNorth;
    const perpZ = -dirEast;
    for (let marker = 0; marker < markerCount; marker += 1) {
      const activeMarker = Math.min(marker, activeMarkerCount - 1);
      const phase = marker < activeMarkerCount ? marker / activeMarkerCount : 1;
      for (let quad = 0; quad < quadsPerMarker; quad += 1) {
        const uvBase = marker * verticesPerMarker + quad * verticesPerQuad;
        for (let corner = 0; corner < verticesPerQuad; corner += 1) {
          uvs[(uvBase + corner) * 2] = phase;
        }
      }
      if (marker >= activeMarkerCount) {
        const hiddenX = spineEast[activeMarker];
        const hiddenY = spineUp[activeMarker];
        const hiddenZ = -spineNorth[activeMarker];
        const hiddenBase = marker * verticesPerMarker;
        for (let vertex = 0; vertex < verticesPerMarker; vertex += 1) {
          setVertex(hiddenBase + vertex, hiddenX, hiddenY, hiddenZ);
        }
        continue;
      }
      const centerX = spineEast[marker];
      const centerZ = -spineNorth[marker];
      const leftX = centerX + perpX * markerHalfWidthM;
      const leftZ = centerZ + perpZ * markerHalfWidthM;
      const rightX = centerX - perpX * markerHalfWidthM;
      const rightZ = centerZ - perpZ * markerHalfWidthM;
      const apexY = spineUp[marker];
      const shoulderY = apexY + config.markerHeightM;
      const vertexBase = marker * verticesPerMarker;
      writeArm(
        vertexBase,
        leftX, shoulderY, leftZ,
        centerX, apexY, centerZ,
        perpX, perpZ,
      );
      writeArm(
        vertexBase + 4,
        rightX, shoulderY, rightZ,
        centerX, apexY, centerZ,
        perpX, perpZ,
      );
    }

    positionAttribute.needsUpdate = true;
    uvAttribute.needsUpdate = true;
    geometry.computeBoundingSphere?.();
    group.userData.rebuildCount += 1;
    group.userData.activeMarkerCount = activeMarkerCount;
    lastObjectiveId = objective.siteId;
    lastObjectiveEastM = objective.eastM;
    lastObjectiveNorthM = objective.northM;
    lastPlayerEastM = playerEastM;
    lastPlayerNorthM = playerNorthM;
    lastPlayerAltitudeM = playerAltitudeM;
    lastRecoveryPhase = recoveryVisual?.phase ?? null;
    return true;
  }

  function setOpacity(value) {
    material.uniforms.uOpacity.value = value;
    material.opacity = value;
  }

  function hide() {
    group.visible = false;
    setOpacity(0);
  }

  function update(state) {
    const objective = state?.objective;
    const playerEastM = Number(state?.player?.eastM);
    const playerNorthM = Number(state?.player?.northM);
    const playerAltitudeM = Number(state?.player?.altitudeM);
    if (!objective
      || !Number.isFinite(playerEastM)
      || !Number.isFinite(playerNorthM)
      || !Number.isFinite(Number(objective.eastM))
      || !Number.isFinite(Number(objective.northM))) {
      hide();
      return;
    }

    const arrivedRadiusM = Number.isFinite(Number(state.arrivedRadiusM))
      ? Number(state.arrivedRadiusM)
      : config.arrivedRadiusM;
    const rangeM = Math.hypot(objective.eastM - playerEastM, objective.northM - playerNorthM);
    if (rangeM <= arrivedRadiusM) {
      hide();
      return;
    }

    const recoveryVisual = state?.recoveryVisual ?? null;
    if (needsRebuild(objective, playerEastM, playerNorthM, playerAltitudeM, recoveryVisual)) {
      if (!rebuild(
        objective,
        playerEastM,
        playerNorthM,
        playerAltitudeM,
        state.groundHeightAt,
        recoveryVisual,
      )) {
        hide();
        return;
      }
    }

    const arrivalFade = Math.min(1, (rangeM - arrivedRadiusM) / Math.max(1, arrivedRadiusM));
    group.visible = true;
    const correctionPulse = recoveryVisual?.alert
      ? 0.72 + 0.28 * (0.5 + 0.5 * Math.sin((Number(state.nowSeconds) || 0) * Math.PI * 3))
      : 1;
    material.uniforms.uColor.value.setHex?.(
      Number.isFinite(Number(recoveryVisual?.colorHex))
        ? Number(recoveryVisual.colorHex)
        : config.color,
    );
    setOpacity(config.peakOpacity * arrivalFade * correctionPulse);
    material.uniforms.uFlow.value = cobraGoldenPathFlowOffset(
      state.nowSeconds,
      config.flowCyclesPerSecond,
    );
  }

  function dispose() {
    group.remove(mesh);
    geometry.dispose?.();
    material.dispose?.();
    group.removeFromParent?.();
  }

  return { group, update, dispose };
}
