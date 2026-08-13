/**
 * The golden path — a drifting ribbon of sunlit haze that leads the pilot to the objective.
 *
 * The standing complaint is "it is not obvious where I am supposed to fly". A chart answers that
 * with a look DOWN; this answers it through the windscreen. The reference is the Hogwarts Legacy
 * guide wisp, but the honest local form over a Vietnamese valley is drifting marker smoke catching
 * a low sun — a thin, soft, wind-smeared band of pale haze. Four properties carry the whole idea:
 *
 *   1. IT MOVES, away from the ship toward the target. A static line is decoration; a flowing one
 *      is an instruction. This is the single most important property — see the UV scroll below.
 *   2. IT IS SUBTLE. Additive, low peak alpha, no hard edge anywhere. If it ever reads as a neon
 *      quest marker it is wrong.
 *   3. IT IS DIEGETIC-ISH. It rides ~75 m over the terrain, so it drapes over ridges the way smoke
 *      would; it is not a screen-space arrow drawn on glass.
 *   4. IT ENDS. Inside the arrival radius the opacity reaches literal zero, so it never nags.
 *
 * ONE ENGINE. Nothing here invents an objective: the target is the nearest hostile-owned entry of
 * the authoritative ground_war `sites[]`, which is the same rule `cobraTacticalMapModel` applies
 * (the test asserts the two agree on a shared fixture). If the sim publishes no hostile site there
 * is no path.
 *
 * GUNSIGHT. The pilot aims through the middle of the screen, and when you are flying AT the target
 * the ribbon's vanishing point sits exactly there. That is why the far end fades out well before it
 * converges: the brightest part of the ribbon is its middle, off to the near-field floor of the
 * frame, and the part that would land on the reticle is already gone.
 *
 * COST. One Mesh, one ShaderMaterial, one static index buffer: 160 triangles, one draw call, no
 * shadow submission, no per-frame allocation. The spine is re-sampled only when the objective
 * changes or the ship has moved 25 m, not every frame.
 */

/** Presentation contract id, in the house `guns-only.<thing>.vN` form. */
export const COBRA_GOLDEN_PATH_SCHEMA = "guns-only.cobra-golden-path.v1";

export const COBRA_GOLDEN_PATH_DEFAULTS = Object.freeze({
  /** Spine samples minus one. 40 segments over 1.5 km is a 37 m chord — smooth at flying speed. */
  segments: 40,
  /** Terrain clearance (m). The brief's comfortable band is 60-90; 75 is its middle. */
  clearanceM: 75,
  /** Drawn length cap (m). Beyond this it reads as a runway stripe to the horizon, not "this way". */
  maxLengthM: 1_500,
  /** The ribbon starts this far ahead of the ship so it never begins in the pilot's face. */
  leadM: 140,
  /** Ribbon half-width at the near end and at the far end (m). It opens with distance. */
  // Narrow. At 13 m / 38 m half-width the ribbon was ~76 m across at its far end and, seen
  // down its own length at a shallow angle, read as a flat sheet of haze lying over the terrain
  // rather than a trail going somewhere. A guide should look like drifting marker smoke, not a
  // road surface.
  nearHalfWidthM: 6,
  farHalfWidthM: 16,
  /** The crossed vertical sheet is shorter than the horizontal one is wide — a smear, not a wall. */
  verticalWidthRatio: 0.55,
  /** Peak alpha. Deliberately low: sunlit mist, not a light bar. */
  // Narrower needs a little more presence to survive against a bright jungle floor.
  peakOpacity: 0.24,
  /** Flow cycles per second of the scrolling haze bands. Slow — this is drifting smoke. */
  flowCyclesPerSecond: 0.24,
  /** How many soft bands ride the drawn length. */
  flowBands: 3.0,
  /** Ship must move this far before the spine is re-sampled. */
  rebuildDistanceM: 25,
  /** Fully transparent inside this range; it has finished its job. */
  arrivedRadiusM: 400,
  /**
   * Pale warm haze. Sits between the profile's sun (0xffe2b4) and its fog (0x8a9fa5), because that
   * is physically what lit mist is: sunlight scattered by the air the scene is already full of.
   * Additive over a grey-green monsoon sky it prints as a soft gold, never a saturated one.
   */
  color: 0xd6c49a,
  /** Rise limit per segment used to drape the spine over ridges (metres of fall per metre run). */
  descentGradient: 0.12,
});

const VERTEX_SHADER = `
varying vec2 vPathUv;
void main() {
  vPathUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

// The whole look lives here. Across the ribbon: a squared cosine, so there is no edge at all.
// Along it: a near fade (nothing starts in the pilot's face), a far fade (nothing converges on the
// gunsight), and the scrolling bands that make it read as flowing rather than painted.
const FRAGMENT_SHADER = `
uniform vec3 uColor;
uniform float uOpacity;
uniform float uFlow;
uniform float uBands;
varying vec2 vPathUv;

void main() {
  float across = 1.0 - abs(vPathUv.y * 2.0 - 1.0);
  float body = across * across;

  float nearFade = smoothstep(0.0, 0.22, vPathUv.x);
  float farFade = 1.0 - smoothstep(0.62, 1.0, vPathUv.x);

  float band = fract(vPathUv.x * uBands - uFlow);
  float pulse = smoothstep(0.0, 0.45, band) * (1.0 - smoothstep(0.55, 1.0, band));

  float alpha = uOpacity * body * nearFade * farFade * (0.45 + 0.55 * pulse);
  if (alpha <= 0.0) discard;
  // AdditiveBlending is SrcAlpha/One, so the blender already multiplies rgb by alpha. Pre-scaling
  // it here as well would square the fade and leave the ribbon all but invisible.
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
 * The objective, resolved from authority alone: the nearest hostile-owned site. This mirrors
 * `cobraTacticalMapModel`'s objective rule exactly (nearest site whose `owner` is "hostile"), so
 * the ribbon in the windscreen and the arrow on the chart can never point at different places.
 * @returns {{ siteId: string, eastM: number, northM: number } | null}
 */
export function cobraGoldenPathObjective(groundWar, player) {
  const sites = Array.isArray(groundWar?.sites) ? groundWar.sites : null;
  if (!sites || sites.length === 0) return null;
  const playerEastM = Number(player?.eastM) || 0;
  const playerNorthM = Number(player?.northM) || 0;
  let best = null;
  let bestRangeM = Infinity;
  for (const site of sites) {
    if (!site) continue;
    if (site.owner !== "hostile") continue;
    const eastM = Number(site.x_m);
    const northM = Number(site.z_m);
    if (!Number.isFinite(eastM) || !Number.isFinite(northM)) continue;
    const rangeM = Math.hypot(eastM - playerEastM, northM - playerNorthM);
    if (rangeM >= bestRangeM) continue;
    bestRangeM = rangeM;
    best = { siteId: site.id, eastM, northM };
  }
  return best;
}

// Reused so the frame loop allocates nothing. There is one golden path in a scene; if that ever
// stops being true, hand each one its own state object instead.
const frameStateScratch = {
  player: { eastM: 0, northM: 0, altitudeM: 0, headingRad: 0 },
  objective: null,
  groundHeightAt: null,
  nowSeconds: 0,
  arrivedRadiusM: COBRA_GOLDEN_PATH_DEFAULTS.arrivedRadiusM,
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
  pose,
  groundHeightAt,
  nowSeconds,
  suppressed = false,
  arrivedRadiusM = COBRA_GOLDEN_PATH_DEFAULTS.arrivedRadiusM,
} = {}) {
  const player = frameStateScratch.player;
  player.eastM = Number(pose?.x_m) || 0;
  player.northM = Number(pose?.z_m) || 0;
  player.altitudeM = Number(pose?.y_m) || 0;
  player.headingRad = Number(pose?.yaw_rad) || 0;
  frameStateScratch.objective = suppressed || !pose ? null : cobraGoldenPathObjective(groundWar, player);
  frameStateScratch.groundHeightAt = groundHeightAt;
  frameStateScratch.nowSeconds = Number(nowSeconds) || 0;
  frameStateScratch.arrivedRadiusM = arrivedRadiusM;
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
  const segments = Math.max(4, Math.floor(config.segments));
  const samples = segments + 1;
  // Two crossed sheets share one spine: a horizontal ribbon and a vertical one. A lone horizontal
  // ribbon vanishes the moment the ship's eye height matches it, which in a helicopter is most of
  // the time; the cross keeps it legible from every attitude for 80 more triangles.
  const sheets = 2;
  const vertexCount = samples * 2 * sheets;

  const positions = new Float32Array(vertexCount * 3);
  const uvs = new Float32Array(vertexCount * 2);
  const indices = new Uint16Array(segments * 6 * sheets);

  for (let sheet = 0; sheet < sheets; sheet += 1) {
    const base = sheet * samples * 2;
    for (let index = 0; index < samples; index += 1) {
      const along = index / segments;
      uvs[(base + index * 2) * 2] = along;
      uvs[(base + index * 2) * 2 + 1] = 0;
      uvs[(base + index * 2 + 1) * 2] = along;
      uvs[(base + index * 2 + 1) * 2 + 1] = 1;
    }
    for (let segment = 0; segment < segments; segment += 1) {
      const cursor = (sheet * segments + segment) * 6;
      const a = base + segment * 2;
      indices[cursor] = a;
      indices[cursor + 1] = a + 1;
      indices[cursor + 2] = a + 2;
      indices[cursor + 3] = a + 1;
      indices[cursor + 4] = a + 3;
      indices[cursor + 5] = a + 2;
    }
  }

  const geometry = new THREE.BufferGeometry();
  const positionAttribute = new THREE.BufferAttribute(positions, 3);
  positionAttribute.setUsage?.(THREE.DynamicDrawUsage);
  geometry.setAttribute("position", positionAttribute);
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));

  const material = new THREE.ShaderMaterial({
    uniforms: {
      uColor: { value: new THREE.Color(config.color) },
      uOpacity: { value: 0 },
      uFlow: { value: 0 },
      uBands: { value: config.flowBands },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    transparent: true,
    // Additive over the haze, depth-TESTED so a ridge in front still hides it, depth-WRITE off so
    // it never punches a hole in the terrain behind it or draws a hard silhouette against the sky.
    blending: THREE.AdditiveBlending,
    depthTest: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    fog: false,
  });
  // Mirrored onto the material itself so anything reading `material.opacity` — a debug overlay, a
  // test, a future fade coordinator — sees the same number the shader is using.
  material.opacity = 0;

  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "COBRA_GOLDEN_PATH_RIBBON";
  mesh.frustumCulled = false;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  // Drawn after the opaque world so the additive pass lands on a finished frame.
  mesh.renderOrder = 6;

  const group = new THREE.Group();
  group.name = "COBRA_GOLDEN_PATH";
  group.userData.schema = COBRA_GOLDEN_PATH_SCHEMA;
  group.userData.rebuildCount = 0;
  group.visible = false;
  group.add(mesh);

  // Spine scratch, allocated once.
  const spineEast = new Float64Array(samples);
  const spineNorth = new Float64Array(samples);
  const spineUp = new Float64Array(samples);

  let lastObjectiveId = null;
  let lastObjectiveEastM = Number.NaN;
  let lastObjectiveNorthM = Number.NaN;
  let lastPlayerEastM = Number.NaN;
  let lastPlayerNorthM = Number.NaN;

  /** The ribbon opens with distance — narrow at the ship, wide where it is dissolving into haze. */
  function halfWidthAt(index) {
    const along = index / segments;
    return config.nearHalfWidthM + (config.farHalfWidthM - config.nearHalfWidthM) * along;
  }

  function needsRebuild(objective, playerEastM, playerNorthM) {
    if (objective.siteId !== lastObjectiveId) return true;
    if (!(Math.abs(objective.eastM - lastObjectiveEastM) < 1)) return true;
    if (!(Math.abs(objective.northM - lastObjectiveNorthM) < 1)) return true;
    if (!Number.isFinite(lastPlayerEastM)) return true;
    const movedM = Math.hypot(playerEastM - lastPlayerEastM, playerNorthM - lastPlayerNorthM);
    return movedM >= config.rebuildDistanceM;
  }

  function rebuild(objective, playerEastM, playerNorthM, groundHeightAt) {
    const toEastM = objective.eastM - playerEastM;
    const toNorthM = objective.northM - playerNorthM;
    const rangeM = Math.hypot(toEastM, toNorthM);
    if (!(rangeM > 1e-3)) return false;
    const dirEast = toEastM / rangeM;
    const dirNorth = toNorthM / rangeM;

    // Start ahead of the ship, along the bearing to the target, and never past the target itself.
    const leadM = Math.min(config.leadM, rangeM * 0.5);
    const startEastM = playerEastM + dirEast * leadM;
    const startNorthM = playerNorthM + dirNorth * leadM;
    const drawnM = Math.min(config.maxLengthM, rangeM - leadM);
    const segmentM = drawnM / segments;

    const sample = typeof groundHeightAt === "function" ? groundHeightAt : () => 0;
    const at = (eastM, northM) => {
      const groundM = Number(sample(eastM, northM));
      return Number.isFinite(groundM) ? groundM : 0;
    };
    // The across-vector, in render space (x = east, z = -north): the travel direction is
    // (dirEast, -dirNorth), so its horizontal normal is (-dirNorth, -dirEast). The ribbon is
    // symmetric about its spine, so the sign of this normal is cosmetic.
    const perpX = -dirNorth;
    const perpZ = -dirEast;
    // Same vector in sim axes, for terrain sampling at the ribbon's edges.
    const perpEast = perpX;
    const perpNorth = -perpZ;

    for (let index = 0; index < samples; index += 1) {
      const distanceM = segmentM * index;
      const eastM = startEastM + dirEast * distanceM;
      const northM = startNorthM + dirNorth * distanceM;
      spineEast[index] = eastM;
      spineNorth[index] = northM;
      // Clearance is owed by the ribbon's EDGES, not just its spine: a 38 m half-width laid across
      // a valley wall would otherwise bury one side in the hillside. Sample the shoulders too.
      const halfWidthM = halfWidthAt(index);
      const groundM = Math.max(
        at(eastM, northM),
        at(eastM + perpEast * halfWidthM, northM + perpNorth * halfWidthM),
        at(eastM - perpEast * halfWidthM, northM - perpNorth * halfWidthM),
      );
      spineUp[index] = groundM + config.clearanceM;
    }

    // Drape the spine over ridges. Both passes only ever RAISE a sample, so the "every vertex
    // clears the terrain by the clearance" invariant survives them by construction; what they add
    // is that the ribbon climbs ahead of a ridge instead of clipping through its shoulder.
    const maxDropM = Math.max(0, config.descentGradient) * segmentM;
    for (let index = 1; index < samples; index += 1) {
      spineUp[index] = Math.max(spineUp[index], spineUp[index - 1] - maxDropM);
    }
    for (let index = samples - 2; index >= 0; index -= 1) {
      spineUp[index] = Math.max(spineUp[index], spineUp[index + 1] - maxDropM);
    }

    for (let index = 0; index < samples; index += 1) {
      const halfWidthM = halfWidthAt(index);
      const halfHeightM = halfWidthM * config.verticalWidthRatio;
      const x = spineEast[index];
      // The vertical sheet hangs half its height BELOW the spine, so the spine is lifted by that
      // much: it is the ribbon's lowest vertex, not its centre line, that owes the clearance.
      const y = spineUp[index] + halfHeightM;
      const z = -spineNorth[index];

      const flat = index * 2 * 3;
      positions[flat] = x + perpX * halfWidthM;
      positions[flat + 1] = y;
      positions[flat + 2] = z + perpZ * halfWidthM;
      positions[flat + 3] = x - perpX * halfWidthM;
      positions[flat + 4] = y;
      positions[flat + 5] = z - perpZ * halfWidthM;

      const upright = (samples * 2 + index * 2) * 3;
      positions[upright] = x;
      positions[upright + 1] = y + halfHeightM;
      positions[upright + 2] = z;
      positions[upright + 3] = x;
      positions[upright + 4] = y - halfHeightM;
      positions[upright + 5] = z;
    }

    positionAttribute.needsUpdate = true;
    geometry.computeBoundingSphere?.();
    group.userData.rebuildCount += 1;
    lastObjectiveId = objective.siteId;
    lastObjectiveEastM = objective.eastM;
    lastObjectiveNorthM = objective.northM;
    lastPlayerEastM = playerEastM;
    lastPlayerNorthM = playerNorthM;
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
      // ARRIVED. Zero, not "nearly zero": the cue has finished its job and must stop nagging.
      hide();
      return;
    }

    if (needsRebuild(objective, playerEastM, playerNorthM)) {
      if (!rebuild(objective, playerEastM, playerNorthM, state.groundHeightAt)) {
        hide();
        return;
      }
    }

    // Fade back in over the second arrival radius, so walking off the target does not snap the
    // ribbon on like a switch.
    const arrivalFade = Math.min(1, (rangeM - arrivedRadiusM) / Math.max(1, arrivedRadiusM));
    group.visible = true;
    setOpacity(config.peakOpacity * arrivalFade);
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
