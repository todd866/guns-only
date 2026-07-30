/// Rapier buried-gallery catshot FX — vent breath, portal daylight sheet, rail shimmer.
/// Specs: launch gallery + Ship C catshot light story.
/// Stroke-gated while catapult_active; soft post-handoff fade (~1.2 s), then clear.

import * as THREE from "../../vendor/three.module.js";

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

// Stable integer hash for authored particle scatter. Launch presentation must be reproducible from
// simulation state: unseeded randomness made every rendered frame a new cloud and forced three
// complete position-buffer uploads throughout the catapult stroke.
function deterministicUnit(index, channel) {
  let value = Math.imul(index + 1, 0x9e3779b1) ^ Math.imul(channel + 1, 0x85ebca6b);
  value ^= value >>> 16;
  value = Math.imul(value, 0x7feb352d);
  value ^= value >>> 15;
  value = Math.imul(value, 0x846ca68b);
  value ^= value >>> 16;
  return (value >>> 0) / 0x1_0000_0000;
}

function makeDustPoints(count, color, size, seedChannel, writePosition) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    seeds[i] = deterministicUnit(i, seedChannel);
    writePosition(positions, i * 3, i, count, seedChannel);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  const material = new THREE.PointsMaterial({
    color,
    size,
    sizeAttenuation: true,
    transparent: true,
    opacity: 0,
    depthWrite: false,
    toneMapped: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  points.renderOrder = 20;
  points.userData.noShadow = true;
  points.visible = false;
  return points;
}

const POST_HANDOFF_FADE_S = 1.2;

/**
 * @param {object} layout metre datums from createRapierDispersedStrip
 */
export function createRapierLaunchFx(layout = {}) {
  const catapultX = Number(layout.catapultX) || 0;
  const railStartZ = Number(layout.railStartZ) || 0;
  const flatLengthM = Number(layout.flatLengthM) || 400;
  const galleryEndZ = Number(layout.galleryEndZ) || railStartZ - flatLengthM;
  const galleryHalfWidth = Number(layout.galleryHalfWidth) || 7;
  const galleryHeight = Number(layout.galleryHeight) || 8;
  const particleMultiplier = Math.max(0.25, Number(layout.particleMultiplier) || 1);

  const group = new THREE.Group();
  group.name = "LAUNCH_FX";

  const ventCount = Math.max(24, Math.round(48 * particleMultiplier));
  const portalCount = Math.max(40, Math.round(80 * particleMultiplier));
  const railCount = Math.max(16, Math.round(28 * particleMultiplier));

  // Warm dusty vents; soft daylight portal sheet; amber rail cue (not cyber blue).
  // Geometry is authored once in each effect's local frame. During flight only Object3D
  // transforms and material opacity change, retaining three bounded draw calls without dynamic
  // attribute uploads.
  const vents = makeDustPoints(
    ventCount,
    0xc4b896,
    1.8,
    11,
    (positions, offset, index, count, channel) => {
      const side = index % 2 === 0 ? -1 : 1;
      const along = (index / count) * flatLengthM;
      positions[offset] = side * (
        galleryHalfWidth + 0.6 + deterministicUnit(index, channel + 1) * 1.2
      );
      positions[offset + 1] = galleryHeight - 1.2
        + deterministicUnit(index, channel + 2) * 1.4;
      positions[offset + 2] = railStartZ - along
        + (deterministicUnit(index, channel + 3) - 0.5) * 4;
    },
  );
  vents.name = "LAUNCH_FX_VENT_DUST";
  vents.position.x = catapultX;
  const portal = makeDustPoints(
    portalCount,
    0xfff0d0,
    3.2,
    29,
    (positions, offset, index, count, channel) => {
      const t = index / count;
      positions[offset] = (deterministicUnit(index, channel + 1) - 0.5)
        * galleryHalfWidth * 2.1;
      positions[offset + 1] = 0.2
        + deterministicUnit(index, channel + 2) * (galleryHeight + 2.5);
      // Soft daylight sheet just outside the portal mouth — reads as sky pouring in.
      positions[offset + 2] = -1
        - deterministicUnit(index, channel + 3) * 14 - t * 10;
    },
  );
  portal.name = "LAUNCH_FX_PORTAL_SHEET";
  portal.position.set(catapultX, 0, galleryEndZ);
  const rail = makeDustPoints(
    railCount,
    0xffd090,
    1.2,
    47,
    (positions, offset, index, count, channel) => {
      const localZ = 8 - (index / count) * 24
        + (deterministicUnit(index, channel + 3) - 0.5) * 1.5;
      positions[offset] = (deterministicUnit(index, channel + 1) - 0.5) * 0.7;
      positions[offset + 1] = 0.2 + deterministicUnit(index, channel + 2) * 0.35;
      // The leading points stay on/behind the aircraft while the remainder trails down the rail.
      positions[offset + 2] = localZ > 2
        ? deterministicUnit(index, channel + 4) * 2
        : localZ;
    },
  );
  rail.name = "LAUNCH_FX_RAIL_SHIMMER";
  rail.position.set(catapultX, 0, railStartZ);
  group.add(vents, portal, rail);

  const ribLamps = layout.ribLamps ?? null;
  const baseLampColor = new THREE.Color(0xf0d38d);
  const hotLampColor = new THREE.Color(0xffe6a8);
  const lampColor = new THREE.Color();

  let strokeActive = false;
  let fadeRemainingS = 0;
  let timeS = 0;
  let lastVentOpacity = 0;
  let lastPortalOpacity = 0;
  let lastRailOpacity = 0;

  function resetTransforms() {
    vents.position.set(catapultX, 0, 0);
    portal.position.set(catapultX, 0, galleryEndZ);
    rail.position.set(catapultX, 0, railStartZ);
  }

  function clearFx() {
    strokeActive = false;
    fadeRemainingS = 0;
    timeS = 0;
    vents.visible = false;
    portal.visible = false;
    rail.visible = false;
    vents.material.opacity = 0;
    portal.material.opacity = 0;
    rail.material.opacity = 0;
    lastVentOpacity = 0;
    lastPortalOpacity = 0;
    lastRailOpacity = 0;
    resetTransforms();
    if (ribLamps?.material?.color) ribLamps.material.color.copy(baseLampColor);
  }

  function setStrokeActive(next) {
    if (next) {
      strokeActive = true;
      fadeRemainingS = 0;
      timeS = 0;
      resetTransforms();
      vents.visible = true;
      portal.visible = true;
      rail.visible = true;
      return;
    }
    if (!strokeActive && fadeRemainingS <= 0) return;
    // Soft quiet after airborne — fade the sheet rather than hard-cut.
    strokeActive = false;
    fadeRemainingS = POST_HANDOFF_FADE_S;
  }

  function update(state = {}, dtSeconds = 1 / 60) {
    const on = state?.catapult_active === true;
    const dt = Math.max(0, Number(dtSeconds) || 0);
    if (on) {
      if (!strokeActive) setStrokeActive(true);
    } else if (strokeActive) {
      setStrokeActive(false);
    }

    if (!strokeActive && fadeRemainingS <= 0) {
      if (vents.visible) clearFx();
      return;
    }

    timeS += dt;
    const progress = clamp01(state?.catapult_progress);
    let ventOpacity;
    let portalOpacity;
    let railOpacity;

    if (strokeActive) {
      ventOpacity = 0.12 + progress * 0.28;
      // Sheet peels open earlier so the portal daylight story reads before the lip.
      portalOpacity = progress > 0.58
        ? Math.min(0.62, ((progress - 0.58) / 0.42) * 0.62)
        : 0;
      railOpacity = 0.06 + progress * 0.18;
      lastVentOpacity = ventOpacity;
      lastPortalOpacity = portalOpacity;
      lastRailOpacity = railOpacity;
    } else {
      fadeRemainingS = Math.max(0, fadeRemainingS - dt);
      const fade = fadeRemainingS / POST_HANDOFF_FADE_S;
      ventOpacity = lastVentOpacity * fade * 0.45;
      portalOpacity = lastPortalOpacity * fade;
      railOpacity = lastRailOpacity * fade * 0.3;
      if (fadeRemainingS <= 0) {
        clearFx();
        return;
      }
    }

    const drift = timeS * (4 + progress * 18);
    vents.position.z = -((drift * 0.15) % 3);
    portal.position.y = Math.sin(timeS * 2.2) * 0.18;
    rail.position.x = catapultX + Math.sin(timeS * 14) * 0.04;
    rail.position.z = railStartZ - flatLengthM * progress;

    vents.material.opacity = ventOpacity;
    portal.material.opacity = portalOpacity;
    rail.material.opacity = railOpacity;

    if (ribLamps?.material?.color) {
      if (strokeActive) {
        lampColor.copy(baseLampColor).lerp(hotLampColor, 0.25 + progress * 0.55);
        const pulse = 0.85 + 0.15 * Math.sin(timeS * (6 + progress * 10));
        ribLamps.material.color.copy(lampColor).multiplyScalar(pulse);
      } else {
        const fade = fadeRemainingS / POST_HANDOFF_FADE_S;
        ribLamps.material.color.copy(baseLampColor).lerp(hotLampColor, 0.15 * fade);
      }
    }
  }

  return Object.freeze({
    group,
    update,
    setActive(next) {
      if (next === true) setStrokeActive(true);
      else clearFx();
    },
    dispose() {
      for (const child of [vents, portal, rail]) {
        child.geometry.dispose();
        child.material.dispose();
      }
    },
  });
}

export function launchFxShouldRun(state = {}) {
  return state?.catapult_active === true
    && (state?.platform_kind === "FIXED_ARRESTING_STRIP" || state?.carrier !== true);
}
