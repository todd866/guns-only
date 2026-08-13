import * as THREE from "../vendor/three.module.js";
import { OrbitControls } from "../vendor/three/addons/controls/OrbitControls.js";
import { loadKoreaEnvironment } from "../render/environment/korea_environment.js";
import { attachSoftWorldGroundHaze } from "../render/environment/soft_world_atmosphere.js";
import { createDecisionSupportSky } from "../render/scene/scene_builders.js?v=323";
import { loadKoreaTerrain } from "../render/environment/korea_terrain.js";
import { createTacticalCloudField } from "../render/environment/tactical_clouds.js?v=323";
import {
  evaluateForegroundFrameContract,
  FOREGROUND_FRAME_CONTRACT,
} from "../render/telemetry/frame_contract.js";
import { AdaptiveResolutionController } from "../render/visual/adaptive_resolution.js";
import { normalizeVisualProfile } from "../render/visual/profile.js";

const parameters = new URLSearchParams(location.search);
const terrainLookMode = parameters.has("terrain-look");
if (terrainLookMode) document.documentElement.dataset.terrainLook = "true";
const QUALITY_TIERS = Object.freeze(["mobile", "balanced", "desktop"]);
const requestedQuality = QUALITY_TIERS.includes(parameters.get("quality"))
  ? parameters.get("quality")
  : null;
const requestedAltitudeM = parameters.has("altitude")
  && Number.isFinite(Number(parameters.get("altitude")))
  ? Number(parameters.get("altitude"))
  : null;
const requestedClouds = (() => {
  if (!parameters.has("clouds")) return null;
  const token = String(parameters.get("clouds")).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(token)) return true;
  if (["0", "false", "no", "off"].includes(token)) return false;
  return null;
})();
// Matches app.js terrainNominalStreamingRadiusM (64 km): the world-edge haze bury keys off
// this radius, so a smaller capture disc buries the whole ground from combat-apex altitudes
// and the harness stops seeing what the pilot sees.
const TERRAIN_LOOK_STREAM_RADIUS_M = 64_000;
const PRODUCTION_SUN_DIRECTION = new THREE.Vector3(0.50, 0.28, -0.82).normalize();
const VISUAL_PROFILE_URL = "../content/packs/korea-1950s/visual-profile.json";
const UKRAINE_2030S_TERRAIN_ID = "terrain.ukraine.rapier-range.atlas.v1";
const UKRAINE_SONIACHNE_MISSION_FEATURE_PACK_ID =
  "mission-feature-pack.ukraine-modern.soniachne-clinic-a.v1";
const SITE_CONFIGURATIONS = Object.freeze({
    ukraine: Object.freeze({
      label: "Ukraine jet-range · real DEM (fictional strip)",
      manifestUrl: new URL(
        "../content/packs/ukraine-modern/environment/terrain-atlas/rapier-range.atlas.manifest.json",
        import.meta.url,
      ).href,
      atmosphereUrl: new URL(
        "../content/packs/ukraine-modern/environment/atmosphere.material.json",
        import.meta.url,
      ).href,
      missionFeaturePackUrl: new URL(
        "../content/packs/ukraine-modern/environment/hero-cells/"
          + "soniachne-clinic-a.feature-pack.json",
        import.meta.url,
      ).href,
      sceneryEra: "ukraine-modern",
      inland: true,
      referenceGroundM: 212.5,
      lowLevelCameraSourceM: Object.freeze([-4000, 3712]),
      lowLevelCameraGroundM: 184.8,
      lowLevelTargetSceneM: Object.freeze([-4218, 216.5, -4101]),
      weatherId: "weather.ukraine-training.soniachne-broken-cumulus.v1",
    }),
  "korea-modern": Object.freeze({
    label: "Korea central front · modern treatment",
    manifestUrl: null,
    atmosphereUrl: null,
      sceneryEra: "modern",
      inland: false,
      referenceGroundM: 0,
      weatherId: "weather.korea-2030s.drone-front-cumulus.v1",
  }),
  "korea-1950s": Object.freeze({
    label: "Korea central front · 1950s treatment",
    manifestUrl: null,
    atmosphereUrl: null,
      sceneryEra: "1950s",
      inland: false,
      referenceGroundM: 0,
      weatherId: "weather.korea-1950s.inland-cumulus.v1",
  }),
});

function vectorParameter(name) {
  const values = parameters.get(name)?.split(",").map(Number);
  return values?.length === 3 && values.every(Number.isFinite) ? values : null;
}

const requestedTerrainLookPosition = vectorParameter("terrain-position");
const requestedTerrainLookTarget = vectorParameter("terrain-target");
const requestedTerrainLookView = requestedTerrainLookPosition && requestedTerrainLookTarget
  ? Object.freeze({
    position: Object.freeze(requestedTerrainLookPosition),
    target: Object.freeze(requestedTerrainLookTarget),
  })
  : null;

const canvas = document.querySelector("#scene");
const viewport = document.querySelector(".viewport");
const status = document.querySelector("#status");
const site = document.querySelector("#site");
const quality = document.querySelector("#quality");
const altitude = document.querySelector("#altitude");
const elevation = document.querySelector("#elevation");
const bearing = document.querySelector("#bearing");
const speed = document.querySelector("#speed");
const clouds = document.querySelector("#clouds");
if (requestedQuality) quality.value = requestedQuality;
if (requestedAltitudeM !== null) {
  const minimumAltitudeM = Number(altitude.min);
  const maximumAltitudeM = Number(altitude.max);
  altitude.value = String(Math.min(maximumAltitudeM,
    Math.max(minimumAltitudeM, requestedAltitudeM)));
}
if (requestedClouds !== null) clouds.checked = requestedClouds;
const renderer = new THREE.WebGLRenderer({
  canvas,
  antialias: true,
  powerPreference: "high-performance",
  logarithmicDepthBuffer: true,
});
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.02;
renderer.setPixelRatio(Math.min(devicePixelRatio, 1));

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(54, 1, 1, 680000);
const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.07;
controls.minDistance = 20;
// terrain-look views must be honored verbatim — the 24 km interactive orbit clamp silently
// pulled the "high altitude" captures down to ~5 km AGL, so the harness never actually saw
// the combat-apex quilt it exists to gate.
controls.maxDistance = terrainLookMode ? 400_000 : 24000;
const ambient = new THREE.HemisphereLight(0xb5cad0, 0x102229, 0.78);
const sun = new THREE.DirectionalLight(0xffe2b4, 2.65);
const sunTarget = new THREE.Object3D();
sun.target = sunTarget;
scene.add(ambient, sun, sunTarget);

let environment = null;
let productionSky = null;
let terrain = null;
let tacticalClouds = null;
let visualProfile = null;
let normalizedVisualProfile = null;
let adaptiveResolution = null;
let adaptiveResolutionStatus = null;
const terrainFogColor = new THREE.Color(0xa8814b);
let terrainFogDensity = 1 / 48_000;
let elapsed = 0;
let previous = null;
let previousMetricsSample = 0;

const requestedSite = parameters.get("site");
site.value = SITE_CONFIGURATIONS[requestedSite] ? requestedSite : "ukraine";

const FRAME_STATS_SAMPLE_LIMIT = FOREGROUND_FRAME_CONTRACT.labSampleCount;
const FRAME_STATS_BACKGROUND_STALL_MS = FOREGROUND_FRAME_CONTRACT.backgroundStallMs;
const FRAME_STATS_LATE_FRAME_MS = FOREGROUND_FRAME_CONTRACT.budgetFrameMs;

function percentile(sorted, quantile) {
  if (!sorted.length) return null;
  const index = Math.max(0, Math.min(sorted.length - 1,
    Math.ceil(sorted.length * quantile) - 1));
  return sorted[index];
}

function createForegroundFrameStats() {
  const samples = new Float32Array(FRAME_STATS_SAMPLE_LIMIT);
  let count = 0;
  let next = 0;
  let ignoreNext = true;

  return Object.freeze({
    reset() {
      count = 0;
      next = 0;
      ignoreNext = true;
    },
    observe(frameMs) {
      if (ignoreNext) {
        ignoreNext = false;
        return false;
      }
      if (document.visibilityState !== "visible"
          || !Number.isFinite(frameMs)
          || frameMs <= 0
          || frameMs > FRAME_STATS_BACKGROUND_STALL_MS) return false;
      samples[next] = frameMs;
      next = (next + 1) % samples.length;
      count = Math.min(samples.length, count + 1);
      return true;
    },
    snapshot() {
      const values = new Array(count);
      let totalMs = 0;
      let lateFrames = 0;
      const start = count === samples.length ? next : 0;
      for (let index = 0; index < count; index++) {
        const value = samples[(start + index) % samples.length];
        values[index] = value;
        totalMs += value;
        if (value > FRAME_STATS_LATE_FRAME_MS) lateFrames++;
      }
      values.sort((left, right) => left - right);
      return Object.freeze({
        sampleCount: count,
        fps: count > 0 && totalMs > 0 ? 1000 / (totalMs / count) : null,
        p95Ms: percentile(values, 0.95),
        p99Ms: percentile(values, 0.99),
        overBudgetFraction: count > 0 ? lateFrames / count : null,
      });
    },
  });
}

const foregroundFrameStats = createForegroundFrameStats();

function evaluatePerformanceGate(frameStats) {
  const sampled = frameStats.sampleCount >= FRAME_STATS_SAMPLE_LIMIT;
  const pass = sampled && evaluateForegroundFrameContract({
    fps: frameStats.fps,
    p95Ms: frameStats.p95Ms,
    p99Ms: frameStats.p99Ms,
    budgetMissFraction: frameStats.overBudgetFraction,
  });
  return Object.freeze({
    state: sampled ? (pass ? "pass" : "fail") : "warming",
    pass: sampled ? pass : null,
    thresholds: Object.freeze({
      sampleCount: FRAME_STATS_SAMPLE_LIMIT,
      minimumFps: FOREGROUND_FRAME_CONTRACT.minimumFps,
      maximumP95Ms: FOREGROUND_FRAME_CONTRACT.maximumP95Ms,
      maximumP99Ms: FOREGROUND_FRAME_CONTRACT.maximumP99Ms,
      maximumLateFraction: FOREGROUND_FRAME_CONTRACT.maximumBudgetMissFraction,
      lateFrameMs: FOREGROUND_FRAME_CONTRACT.budgetFrameMs,
    }),
  });
}

function resetPerformanceRail() {
  foregroundFrameStats.reset();
  previous = null;
}

function siteConfiguration() {
  return SITE_CONFIGURATIONS[site.value] ?? SITE_CONFIGURATIONS.ukraine;
}

async function sha256Hex(bytes) {
  if (!globalThis.crypto?.subtle) {
    throw new Error("SHA-256 verification is unavailable in this browser.");
  }
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function validateMissionFeaturePack(pack) {
  if (!pack || typeof pack !== "object" || Array.isArray(pack)) {
    throw new TypeError("Mission feature pack must be a JSON object.");
  }
  if (pack.schemaVersion !== "1.0.0"
      || pack.featurePackId !== UKRAINE_SONIACHNE_MISSION_FEATURE_PACK_ID
      || typeof pack.packVersion !== "string"
      || pack.theatre?.terrainId !== UKRAINE_2030S_TERRAIN_ID) {
    throw new TypeError("Ukraine mission feature pack identity is invalid.");
  }
  const anchor = pack.coordinateFrame?.anchorSourceM;
  const presentationOnly = pack.authority?.mode === "presentation_only"
    && pack.authority?.targetableByDefault === false
    && pack.authority?.collisionAuthority === "none"
    && pack.authority?.damageAuthority === "none"
    && pack.authority?.navigationAuthority === "none"
    && pack.authority?.landingZoneAuthority === "none";
  if (!pack.coordinateFrame || typeof pack.coordinateFrame !== "object"
      || !anchor || typeof anchor !== "object" || Array.isArray(anchor)
      || !Number.isFinite(anchor.eastM)
      || !Number.isFinite(anchor.upM)
      || !Number.isFinite(anchor.northM)
      || !presentationOnly
      || !pack.renderBudgets || typeof pack.renderBudgets !== "object"
      || !Array.isArray(pack.features)
      || pack.features.length === 0
      || pack.features.some((feature) =>
        feature?.presentationOnly !== true || feature?.targetable !== false)
      || !Array.isArray(pack.landingZones)
      || !Array.isArray(pack.ambientExclusionZones)) {
    throw new TypeError("Ukraine mission feature pack structure or authority is invalid.");
  }
  return pack;
}

async function loadMissionFeaturePack(url) {
  if (!url) return null;
  const response = await fetch(url, {
    cache: "no-cache",
    headers: { Accept: "application/json" },
  });
  if (!response.ok) {
    throw new Error(`Mission feature pack request failed: ${response.status} ${url}`);
  }
  const bytes = await response.arrayBuffer();
  const sha256 = await sha256Hex(bytes);
  let pack;
  try {
    pack = JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    throw new TypeError(`Mission feature pack JSON is invalid: ${error.message}`);
  }
  return Object.freeze({
    pack: validateMissionFeaturePack(pack),
    sha256,
  });
}

function setCameraView() {
  const heightAglM = Number(altitude.value);
  const siteConfig = siteConfiguration();
  const referenceGroundM = Number(siteConfig.referenceGroundM) || 0;
  const eyeY = referenceGroundM + heightAglM;
  // High-altitude default reads country relief; drop the slider for low-level soft-world checks.
  if (heightAglM >= 2_500) {
    camera.position.set(-12_000, eyeY, 18_000);
    controls.target.set(
      -40_000,
      referenceGroundM + Math.max(35, heightAglM * 0.05),
      -8_000,
    );
  } else if (site.value === "ukraine") {
    // Review the actual hero-cell composition instead of looking away from it across an arbitrary
    // patch of plain. This source-locked camera point is on 184.8 m LOD0 ground; the slider is
    // therefore genuinely AGL. The target is the authored compound centre in Three's -north Z
    // convention, keeping clinic, meadow, utilities and ambient field language in one sightline.
    const [cameraEastM, cameraNorthM] = siteConfig.lowLevelCameraSourceM;
    camera.position.set(
      cameraEastM,
      siteConfig.lowLevelCameraGroundM + heightAglM,
      -cameraNorthM,
    );
    controls.target.fromArray(siteConfig.lowLevelTargetSceneM);
  } else {
    camera.position.set(-250, eyeY, -450);
    controls.target.set(-760, referenceGroundM + Math.max(85, heightAglM * 0.28), -1_900);
  }
  controls.update();
  document.querySelector("#altitude-value").value =
    `${Math.round(heightAglM).toLocaleString()} m AGL`;
}

function updateLabels() {
  document.querySelector("#elevation-value").value = `${elevation.value}°`;
  document.querySelector("#bearing-value").value = `${bearing.value}°`;
  document.querySelector("#speed-value").value = `${Number(speed.value).toFixed(1)}×`;
}

function resize() {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;
  adaptiveResolution?.setViewport(width, height, devicePixelRatio, "resize");
  renderer.setSize(width, height, false);
  camera.aspect = width / Math.max(1, height);
  camera.updateProjectionMatrix();
}

function tacticalCloudsVisible() {
  return clouds.checked && (!terrainLookMode || requestedClouds === true);
}

function formatMetric(value, digits = 1, suffix = "") {
  return Number.isFinite(value) ? `${value.toFixed(digits)}${suffix}` : "—";
}

function metrics() {
  // Report what the renderer actually submitted in the latest frame. Traversing every resident
  // streamed tile counted off-screen and frustum-culled geometry, which made the lab claim tens of
  // millions of triangles even when only a small foreground wedge reached the GPU.
  document.querySelector("#triangles").textContent =
    Math.round(renderer.info.render.triangles).toLocaleString();
  const cloudVolumes = tacticalCloudsVisible()
    ? tacticalClouds?.descriptors.filter((cloud) => cloud.present).length ?? 0
    : 0;
  const terrainState = terrain?.diagnostics?.() ?? null;
  const renderPixels = renderer.domElement.width * renderer.domElement.height;
  document.querySelector("#layers").textContent = String(cloudVolumes);
  document.querySelector("#draws").textContent = String(renderer.info.render.calls);
  document.querySelector("#render-pixels").textContent =
    `${(renderPixels / 1_000_000).toFixed(2)} MP`;
  document.querySelector("#resident-chunks").textContent =
    String(terrainState?.residentChunks ?? 0);
  document.querySelector("#visible-scenery").textContent =
    String(terrainState?.visibleSceneryChunks ?? 0);
  const frameStats = foregroundFrameStats.snapshot();
  document.querySelector("#fps").textContent = formatMetric(frameStats.fps);
  document.querySelector("#frame-p95").textContent = formatMetric(frameStats.p95Ms, 1, " ms");
  document.querySelector("#frame-p99").textContent = formatMetric(frameStats.p99Ms, 1, " ms");
  document.querySelector("#late-fraction").textContent =
    formatMetric(frameStats.overBudgetFraction === null
      ? null
      : frameStats.overBudgetFraction * 100, 1, "%");
  const performanceGate = evaluatePerformanceGate(frameStats);
  const frameGate = document.querySelector("#frame-gate");
  frameGate.textContent = performanceGate.state.toUpperCase();
  frameGate.dataset.state = performanceGate.state;
  document.documentElement.dataset.performanceGate = performanceGate.state;
}

const environmentLabDiagnostics = Object.freeze({
  snapshot() {
    return Object.freeze({
      quality: quality.value,
      altitudeM: camera.position.y,
      altitudeAglM: Number(altitude.value),
      cloudsEnabled: tacticalCloudsVisible(),
      camera: Object.freeze({
        heightMode: "agl",
        preset: site.value === "ukraine" && Number(altitude.value) < 2_500
          ? "soniachne-hero-approach"
          : "regional-horizon",
        position: Object.freeze(camera.position.toArray()),
        target: Object.freeze(controls.target.toArray()),
      }),
      renderer: Object.freeze({
        calls: renderer.info.render.calls,
        triangles: renderer.info.render.triangles,
        pixelRatio: renderer.getPixelRatio(),
        width: renderer.domElement.width,
        height: renderer.domElement.height,
        pixels: renderer.domElement.width * renderer.domElement.height,
      }),
      shadows: Object.freeze({
        rendererEnabled: renderer.shadowMap.enabled,
        rendererType: renderer.shadowMap.type,
        pcfSoft: renderer.shadowMap.type === THREE.PCFSoftShadowMap,
        sunCastShadow: sun.castShadow,
        mapSize: Object.freeze([
          sun.shadow.mapSize.x,
          sun.shadow.mapSize.y,
        ]),
        camera: Object.freeze({
          left: sun.shadow.camera.left,
          right: sun.shadow.camera.right,
          top: sun.shadow.camera.top,
          bottom: sun.shadow.camera.bottom,
          near: sun.shadow.camera.near,
          far: sun.shadow.camera.far,
        }),
        bias: sun.shadow.bias,
        normalBias: sun.shadow.normalBias,
      }),
      terrain: terrain?.diagnostics?.() ?? null,
      adaptiveResolution: adaptiveResolution?.status?.() ?? adaptiveResolutionStatus,
      frameStats: foregroundFrameStats.snapshot(),
      performanceGate: evaluatePerformanceGate(foregroundFrameStats.snapshot()),
    });
  },
});
Object.defineProperty(window, "__environmentLabDiagnostics", {
  value: environmentLabDiagnostics,
  writable: false,
  configurable: false,
});

async function loadVisualProfile() {
  const response = await fetch(VISUAL_PROFILE_URL);
  if (!response.ok) {
    throw new Error(`Visual profile request failed: ${response.status} ${VISUAL_PROFILE_URL}`);
  }
  return response.json();
}

function applyProductionProfile(profile) {
  const environmentProfile = profile.environment ?? {};
  const lighting = environmentProfile.lighting ?? {};
  const fog = environmentProfile.fog ?? {};
  renderer.toneMappingExposure = Number(environmentProfile.exposure) || 1.02;
  ambient.intensity = Number(lighting.ambientIntensity) || 1.35;
  sun.intensity = Number(lighting.sunIntensity) || 2.4;
  sun.color.set(lighting.sunColor ?? "#FFE3B7");
  // Ukraine soft-world wants warm dusty distance; the Korea visual profile's cool fog would
  // wash ADR-0003 back into poster blue.
  if (site.value === "ukraine") {
    terrainFogColor.set("#A8814B");
    terrainFogDensity = 1 / Math.max(1, Number(fog.farMetres) || 48_000);
    renderer.toneMappingExposure = Math.max(renderer.toneMappingExposure, 1.08);
    ambient.intensity = Math.max(ambient.intensity, 1.45);
  } else {
    terrainFogColor.set(fog.color ?? "#A8C1CC");
    terrainFogDensity = 1 / Math.max(1, Number(fog.farMetres) || 56_000);
  }
}

function configureProductionResolution(profile) {
  normalizedVisualProfile = normalizeVisualProfile(profile, { tierId: quality.value });
  adaptiveResolution = new AdaptiveResolutionController({
    ...normalizedVisualProfile.adaptiveResolution,
    pixelRatioCap: normalizedVisualProfile.renderer.pixelRatioCap,
    mode: "combat",
    onChange(pixelRatio, statusSnapshot) {
      renderer.setPixelRatio(pixelRatio);
      adaptiveResolutionStatus = Object.freeze({ ...statusSnapshot, pixelRatio });
    },
  });
  adaptiveResolution.setViewport(
    viewport.clientWidth,
    viewport.clientHeight,
    devicePixelRatio,
    "quality-tier",
  );
  resize();
}

function configureProductionShadows() {
  const shadowMapSize = normalizedVisualProfile?.tier?.settings?.shadowMapSize ?? 0;
  const desktopShadowPass = quality.value === "desktop" && shadowMapSize > 0;
  renderer.shadowMap.enabled = desktopShadowPass;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sun.castShadow = desktopShadowPass;
  // This lab is a land-combat gate. Mirror the production 88 m tracked volume and depth range;
  // Three's default ±5 m / 500 m shadow camera cannot see a sun placed 1.6 km from the target and
  // would make a nominally enabled gate silently measure zero shadow submissions.
  sun.shadow.camera.left = -44;
  sun.shadow.camera.right = 44;
  sun.shadow.camera.top = 44;
  sun.shadow.camera.bottom = -44;
  sun.shadow.camera.near = 10;
  sun.shadow.camera.far = 3600;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.bias = -0.00018;
  sun.shadow.normalBias = 0.16;
  if (shadowMapSize > 0
      && (sun.shadow.mapSize.x !== shadowMapSize
        || sun.shadow.mapSize.y !== shadowMapSize)) {
    sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
    sun.shadow.map?.dispose();
    sun.shadow.map = null;
  }
}

// FlightView carries its 4 km sky sphere with the camera and feeds it altitude (app.js:8014).
// Skipping either leaves the dome behind the camera at Rapier altitudes and the gate captures a
// sky that no cockpit ever shows.
function updateProductionSky() {
  if (!productionSky) return;
  productionSky.mesh.position.copy(camera.position);
  productionSky.uniforms.uAltitude.value = Math.max(0, camera.position.y);
  productionSky.uniforms.uSunDirection.value.copy(sunDirection()).normalize();
}

function terrainFrame(deltaSeconds = 0) {
  return {
    cameraPosition: camera.position,
    // terrain-look views place the camera directly (slider untouched), so AGL must come from
    // the real camera height or altitude-keyed shading (uTerrainDetail01) never engages.
    cameraAglM: terrainLookMode
      ? Math.max(0, camera.position.y)
      : Number(altitude.value),
    deltaSeconds,
    elapsedSeconds: elapsed,
    windX: site.value === "ukraine" ? 12 : 11,
    windZ: site.value === "ukraine" ? -4 : -5,
    fogColor: terrainFogColor,
    fogDensity: terrainFogDensity,
    sunDirection: sunDirection(),
  };
}

async function warmPresentationBeforePerformanceRail() {
  // Compilation and render-target allocation belong behind the Ready interlock, not in the
  // foreground frame sample. The explicit render also exercises lazy driver work before the
  // controller is reset to the tier ceiling.
  if (typeof renderer.compileAsync === "function") {
    await renderer.compileAsync(scene, camera);
  } else {
    renderer.compile(scene, camera);
  }
  renderer.render(scene, camera);
  await new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(resolve)));
  renderer.render(scene, camera);
}

async function rebuild() {
  const siteConfig = siteConfiguration();
  site.disabled = true;
  quality.disabled = true;
  status.lastChild.textContent = " Loading environment…";
  environment?.dispose();
  terrain?.dispose();
  tacticalClouds?.dispose();
  let missionFeaturePack = null;
  [environment, visualProfile, missionFeaturePack] = await Promise.all([
    loadKoreaEnvironment(THREE, {
      qualityTier: quality.value,
      ...(siteConfig.atmosphereUrl ? { atmosphereUrl: siteConfig.atmosphereUrl } : {}),
      fogColor: site.value === "ukraine" ? "#A8814B" : undefined,
      fogNear: site.value === "ukraine" ? 7_500 : undefined,
      fogFar: site.value === "ukraine" ? 48_000 : undefined,
    }),
    loadVisualProfile(),
    loadMissionFeaturePack(siteConfig.missionFeaturePackUrl),
  ]);
  applyProductionProfile(visualProfile);
  configureProductionResolution(visualProfile);
  configureProductionShadows();
  scene.add(environment.group);
  environment.ocean.visible = !siteConfig.inland;
  // Production loads terrain separately from the atmosphere adapter. A null manifest keeps the
  // validated Korea default; the Ukraine option exercises its own local content-pack product.
  terrain = await loadKoreaTerrain(THREE, {
    manifestUrl: siteConfig.manifestUrl,
    qualityTier: quality.value,
    maximumConcurrentLoads: quality.value === "mobile" ? 3 : 6,
    ...(terrainLookMode ? {
      chunkLoadRadiusM: TERRAIN_LOOK_STREAM_RADIUS_M,
      chunkEvictRadiusM: TERRAIN_LOOK_STREAM_RADIUS_M + 12_000,
      pageLoadRadiusM: TERRAIN_LOOK_STREAM_RADIUS_M,
      pageEvictRadiusM: TERRAIN_LOOK_STREAM_RADIUS_M + 20_000,
      lookAheadSeconds: 0,
    } : {}),
    sceneryEra: siteConfig.sceneryEra,
    ...(missionFeaturePack ? {
      missionFeaturePack: missionFeaturePack.pack,
      missionFeaturePackSha256: missionFeaturePack.sha256,
    } : {}),
    sunDirection: sunDirection(),
    fogColor: terrainFogColor,
    fogDensity: terrainFogDensity,
  });
  await terrain.ready;
  scene.add(terrain.group);
  // One engine: the look gate must judge the sky the pilot actually flies under. The pack
  // atmosphere's own dome is a second, diverging sky — it made every high-altitude capture show a
  // horizon production never renders, which is precisely how the 72,000 ft two-tone silhouette
  // survived a "passing" look gate. FlightView's decision-support sky is now the only sky here.
  environment.sky.visible = false;
  if (!productionSky) {
    productionSky = createDecisionSupportSky();
    scene.add(productionSky.mesh);
  }
  productionSky.uniforms.uSoftWorld.value = site.value === "ukraine" ? 1 : 0;
  productionSky.uniforms.uSunDirection.value.copy(sunDirection()).normalize();
  if (site.value === "ukraine"
    && !attachSoftWorldGroundHaze(productionSky.uniforms, terrain.material?.uniforms)) {
    throw new Error("sky/terrain ground haze uniforms did not join — the horizon would fork");
  }
  if (terrainLookMode) {
    window.__terrainLookProbe = () => terrain?.diagnostics?.() ?? null;
  }
  // Atlas pages stream after the first camera update. The compact Soniachne product embeds
  // chunks in `ready`; the geodetic atlas would otherwise fail the residentChunks gate with an
  // empty skybox.
  setCameraView();
  terrain.update(terrainFrame(0));
  if (typeof terrain.whenIdle === "function") {
    await terrain.whenIdle();
    terrain.update(terrainFrame(0));
    await terrain.whenIdle();
  }
  // The authored pack clouds remain an art-reference fixture. This lab now exercises the exact
  // authoritative module admitted to FlightView, including the mobile impostor fallback.
  for (const cloud of environment.clouds) cloud.visible = false;
  tacticalClouds = createTacticalCloudField(THREE, { qualityTier: quality.value });
  tacticalClouds.configure({
    id: siteConfig.weatherId,
    seed: site.value === "ukraine" ? "2030082450a10008" : "20300915d20e0001",
    layers: [{
      base_m: site.value === "ukraine" ? 1050 : 1150,
      top_m: site.value === "ukraine" ? 2250 : 2850,
      coverage_01: site.value === "ukraine" ? 0.38 : 0.44,
      scale_m: site.value === "ukraine" ? 6200 : 4500,
      extinction_per_m: site.value === "ukraine" ? 0.014 : 0.018,
      wind_east_mps: site.value === "ukraine" ? 12 : 11,
      wind_north_mps: 4,
    }],
    cells: [{
      east_m: site.value === "ukraine" ? -5100 : 5600,
      north_m: site.value === "ukraine" ? 5800 : 4800,
      base_m: 850,
      top_m: site.value === "ukraine" ? 3900 : 5500,
      radius_east_m: site.value === "ukraine" ? 2500 : 2700,
      radius_north_m: site.value === "ukraine" ? 2000 : 2200,
      start_s: 0,
      lifetime_s: 900,
      transition_s: 20,
      wind_east_mps: site.value === "ukraine" ? 13 : 12,
      wind_north_mps: site.value === "ukraine" ? 4 : 5,
      coverage_01: 1,
      extinction_per_m: site.value === "ukraine" ? 0.018 : 0.022,
    }],
  });
  tacticalClouds.group.visible = tacticalCloudsVisible();
  scene.add(tacticalClouds.group);
  tacticalClouds.update(camera.position, elapsed, new THREE.Color(0x7898a0),
    0.000055, sunDirection());
  metrics();
  const terrainState = terrain.diagnostics();
  if (terrainState.errors > 0 || terrainState.residentChunks === 0) {
    throw new Error(`${siteConfig.label} loaded with ${terrainState.errors} errors and `
      + `${terrainState.residentChunks} resident chunks`);
  }
  if (missionFeaturePack
      && (terrainState.missionFeaturePackId !==
          missionFeaturePack.pack.featurePackId
        || terrainState.missionFeaturePackSha256 !== missionFeaturePack.sha256)) {
    throw new Error(`${siteConfig.label} did not retain the selected mission feature pack.`);
  }
  await warmPresentationBeforePerformanceRail();
  adaptiveResolution?.reset(adaptiveResolution.maxScale, "scene-ready");
  status.lastChild.textContent = ` ${siteConfig.label} · ${quality.value}`;
  resetPerformanceRail();
  site.disabled = false;
  quality.disabled = false;
}

function sunDirection() {
  if (terrainLookMode) return PRODUCTION_SUN_DIRECTION.clone();
  const altitudeRadians = THREE.MathUtils.degToRad(Number(elevation.value));
  const bearingRadians = THREE.MathUtils.degToRad(Number(bearing.value));
  const horizontal = Math.cos(altitudeRadians);
  return new THREE.Vector3(
    Math.sin(bearingRadians) * horizontal,
    Math.sin(altitudeRadians),
    -Math.cos(bearingRadians) * horizontal,
  ).normalize();
}

function animate(now) {
  requestAnimationFrame(animate);
  const frameMs = previous === null ? null : now - previous;
  previous = now;
  foregroundFrameStats.observe(frameMs);
  adaptiveResolution?.sample(frameMs);
  const delta = Math.min(0.05, Math.max(0, frameMs ?? 0) / 1000);
  elapsed += delta * Number(speed.value);
  controls.update();
  sunTarget.position.copy(controls.target);
  sun.position.copy(sunTarget.position).addScaledVector(sunDirection(), 1600);
  sunTarget.updateMatrixWorld();
  environment?.update({ timeSeconds: elapsed, cameraPosition: camera.position, sunDirection: sunDirection() });
  updateProductionSky();
  terrain?.update(terrainFrame(delta));
  if (tacticalClouds) {
    tacticalClouds.group.visible = tacticalCloudsVisible();
    const cloudFog = site.value === "ukraine"
      ? new THREE.Color(0xa8814b)
      : new THREE.Color(0x7898a0);
    tacticalClouds.update(camera.position, elapsed, cloudFog,
      site.value === "ukraine" ? 0.000048 : 0.000055, sunDirection());
  }
  renderer.render(scene, camera);
  if (now - previousMetricsSample >= 500) {
    previousMetricsSample = now;
    metrics();
  }
}

quality.addEventListener("change", () => rebuild().catch(showError));
site.addEventListener("change", () => rebuild().catch(showError));
altitude.addEventListener("input", () => {
  setCameraView();
  resetPerformanceRail();
});
elevation.addEventListener("input", updateLabels);
bearing.addEventListener("input", updateLabels);
speed.addEventListener("input", updateLabels);
clouds.addEventListener("change", () => {
  if (tacticalClouds) tacticalClouds.group.visible = tacticalCloudsVisible();
  resetPerformanceRail();
});
document.querySelector("#reset").addEventListener("click", setCameraView);
document.addEventListener("visibilitychange", () => {
  // The first foreground RAF after a hidden tab includes background time, not render work.
  previous = null;
});
new ResizeObserver(resize).observe(viewport);

function showError(error) {
  console.error(error);
  status.lastChild.textContent = ` ${error.message}`;
  site.disabled = false;
  quality.disabled = false;
  window.__terrainLookError = error.message;
}

async function setTerrainLookView(view) {
  if (!terrain) throw new Error("Terrain is not loaded");
  camera.position.fromArray(view.position);
  controls.target.fromArray(view.target);
  controls.update();
  updateProductionSky();
  environment.update({
    timeSeconds: 0,
    cameraPosition: camera.position,
    sunDirection: sunDirection(),
  });
  terrain.update(terrainFrame());
  await terrain.whenIdle();
  terrain.update(terrainFrame());
  renderer.render(scene, camera);
  await new Promise((resolvePromise) => requestAnimationFrame(
    () => requestAnimationFrame(resolvePromise),
  ));
  resetPerformanceRail();
  return terrain.diagnostics();
}

setCameraView();
updateLabels();
resize();
if (terrainLookMode) {
  if (!requestedQuality) quality.value = "desktop";
  if (requestedClouds === null) clouds.checked = false;
  speed.value = "0";
}
await rebuild().then(async () => {
  window.__terrainLookSetView = setTerrainLookView;
  window.__terrainLookReady = terrain.diagnostics();
  // QA seam: lets the screenshot harness assert shader uniforms (e.g. uTerrainDetail01)
  // actually carry the value the captured view implies, instead of trusting plumbing.
  window.__terrainLookUniform = (name) =>
    terrain?.material?.uniforms?.[name]?.value ?? null;
  window.__terrainLookFrame = () => {
    const frame = terrainFrame();
    return { cameraAglM: frame.cameraAglM, cameraY: camera.position.y };
  };
  if (requestedTerrainLookView) await setTerrainLookView(requestedTerrainLookView);
  document.documentElement.dataset.terrainLookReady = "true";
}).catch(showError);
requestAnimationFrame(animate);
