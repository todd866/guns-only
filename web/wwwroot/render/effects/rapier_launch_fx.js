/// Rapier buried-gallery catshot FX — vent breath, portal sheet, rail shimmer.
/// Spec: docs/superpowers/specs/2026-07-29-rapier-launch-gallery-ghibli-wwiii-design.md
/// Stroke-gated: only while catapult_active; clears at handoff.

import * as THREE from "../../vendor/three.module.js";

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.min(1, Math.max(0, number));
}

function makeDustPoints(count, color, size) {
  const positions = new Float32Array(count * 3);
  const seeds = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    seeds[i] = Math.random();
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
  const portalCount = Math.max(32, Math.round(64 * particleMultiplier));
  const railCount = Math.max(16, Math.round(28 * particleMultiplier));

  const vents = makeDustPoints(ventCount, 0xc4b896, 1.8);
  vents.name = "LAUNCH_FX_VENT_DUST";
  const portal = makeDustPoints(portalCount, 0xe8dcc0, 2.4);
  portal.name = "LAUNCH_FX_PORTAL_SHEET";
  const rail = makeDustPoints(railCount, 0x7ec8ff, 1.1);
  rail.name = "LAUNCH_FX_RAIL_SHIMMER";
  group.add(vents, portal, rail);

  const ribLamps = layout.ribLamps ?? null;
  const baseLampColor = new THREE.Color(0xf0d38d);
  const hotLampColor = new THREE.Color(0xffe6a8);
  const lampColor = new THREE.Color();

  let active = false;
  let timeS = 0;

  function seedVentPositions(attr, progress) {
    const arr = attr.array;
    const midZ = railStartZ - flatLengthM * progress;
    for (let i = 0; i < ventCount; i += 1) {
      const side = i % 2 === 0 ? -1 : 1;
      const along = (i / ventCount) * flatLengthM;
      const z = railStartZ - along;
      // Prefer vents near the aircraft (progress along flat run).
      const weight = 1 - Math.min(1, Math.abs(z - midZ) / 80);
      arr[i * 3] = catapultX + side * (galleryHalfWidth + 0.6 + Math.random() * 1.2);
      arr[i * 3 + 1] = galleryHeight - 1.2 + Math.random() * 1.4 + weight * 0.4;
      arr[i * 3 + 2] = z + (Math.random() - 0.5) * 4;
    }
    attr.needsUpdate = true;
  }

  function seedPortalPositions(attr) {
    const arr = attr.array;
    for (let i = 0; i < portalCount; i += 1) {
      const t = i / portalCount;
      arr[i * 3] = catapultX + (Math.random() - 0.5) * galleryHalfWidth * 1.6;
      arr[i * 3 + 1] = 0.4 + Math.random() * (galleryHeight - 0.8);
      arr[i * 3 + 2] = galleryEndZ - 2 - Math.random() * 8 - t * 6;
    }
    attr.needsUpdate = true;
  }

  function seedRailPositions(attr, progress) {
    const arr = attr.array;
    const aircraftZ = railStartZ - flatLengthM * progress;
    for (let i = 0; i < railCount; i += 1) {
      const along = progress * flatLengthM - 8 + (i / railCount) * 24;
      arr[i * 3] = catapultX + (Math.random() - 0.5) * 0.7;
      arr[i * 3 + 1] = 0.2 + Math.random() * 0.35;
      arr[i * 3 + 2] = railStartZ - along + (Math.random() - 0.5) * 1.5;
      if (arr[i * 3 + 2] > aircraftZ + 2) arr[i * 3 + 2] = aircraftZ + Math.random() * 2;
    }
    attr.needsUpdate = true;
  }

  function setActive(next) {
    active = next === true;
    vents.visible = active;
    portal.visible = active;
    rail.visible = active;
    if (!active) {
      vents.material.opacity = 0;
      portal.material.opacity = 0;
      rail.material.opacity = 0;
      if (ribLamps?.material?.color) ribLamps.material.color.copy(baseLampColor);
    }
  }

  function update(state = {}, dtSeconds = 1 / 60) {
    const on = state?.catapult_active === true;
    if (on !== active) setActive(on);
    if (!active) return;

    timeS += Math.max(0, Number(dtSeconds) || 0);
    const progress = clamp01(state?.catapult_progress);
    // Stronger dust in the second half of the enclosed run; portal sheet peels open near exit.
    const ventOpacity = 0.12 + progress * 0.28;
    const portalOpacity = progress > 0.72 ? (progress - 0.72) / 0.28 * 0.45 : 0;
    const railOpacity = 0.08 + progress * 0.22;

    seedVentPositions(vents.geometry.attributes.position, progress);
    seedPortalPositions(portal.geometry.attributes.position);
    seedRailPositions(rail.geometry.attributes.position, progress);

    // Soft drift along -Z (launch direction).
    const drift = timeS * (4 + progress * 18);
    vents.position.z = -((drift * 0.15) % 3);
    portal.position.y = Math.sin(timeS * 2.2) * 0.15;
    rail.position.x = Math.sin(timeS * 14) * 0.04;

    vents.material.opacity = ventOpacity;
    portal.material.opacity = portalOpacity;
    rail.material.opacity = railOpacity;

    if (ribLamps?.material?.color) {
      lampColor.copy(baseLampColor).lerp(hotLampColor, 0.25 + progress * 0.55);
      const pulse = 0.85 + 0.15 * Math.sin(timeS * (6 + progress * 10));
      ribLamps.material.color.copy(lampColor).multiplyScalar(pulse);
    }
  }

  return Object.freeze({
    group,
    update,
    setActive,
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
