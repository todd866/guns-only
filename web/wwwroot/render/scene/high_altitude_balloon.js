import * as THREE from "../../vendor/three.module.js";
import { annotateProceduralFallback } from "./airframe_primitives.js?v=283";

export const HIGH_ALTITUDE_BALLOON_PRESENTATION_ID =
  "presentation.vehicle.high-altitude-weather-balloon.target.v1";
export const HIGH_ALTITUDE_BALLOON_DIAMETER_M = 114.5;
export const HIGH_ALTITUDE_BALLOON_HEIGHT_M = 68.96;
export const HIGH_ALTITUDE_BALLOON_VOLUME_M3 = 532_379;
export const HIGH_ALTITUDE_BALLOON_SOURCE_URL =
  "https://science.nasa.gov/blogs/super-pressure-balloon/2016/04/04/nasas-super-pressure-balloon-by-the-numbers/";

function envelopeProfile() {
  // NASA publishes all three closure quantities: 114.5 m diameter, 68.96 m height and
  // 532,379 m3. A plain ellipsoid would understate that volume by 11%, so the rendered pumpkin
  // uses a slightly fuller superellipse. The exponent closes the piecewise-frustum loft below to
  // the published volume; it is a transparent silhouette surrogate, not a claim about gore FEA.
  const radiusM = HIGH_ALTITUDE_BALLOON_DIAMETER_M / 2;
  const halfHeightM = HIGH_ALTITUDE_BALLOON_HEIGHT_M / 2;
  const superellipseExponent = 2.507979104156822;
  const segments = 64;
  const profile = [];
  for (let index = 0; index <= segments; index += 1) {
    const normalizedY = -1 + index * 2 / segments;
    const radius = radiusM * Math.pow(
      Math.max(0, 1 - Math.pow(Math.abs(normalizedY), superellipseExponent)),
      1 / superellipseExponent,
    );
    profile.push(new THREE.Vector2(radius, normalizedY * halfHeightM));
  }
  return profile;
}

export function highAltitudeBalloonEnvelopeVolumeM3() {
  const profile = envelopeProfile();
  let volume = 0;
  for (let index = 0; index < profile.length - 1; index += 1) {
    const a = profile[index];
    const b = profile[index + 1];
    volume += Math.PI * (b.y - a.y) * (a.x * a.x + a.x * b.x + b.x * b.x) / 3;
  }
  return volume;
}

function goreLineGeometry(profile, count = 28) {
  const positions = [];
  for (let gore = 0; gore < count; gore += 1) {
    const angle = gore / count * Math.PI * 2;
    for (let index = 0; index < profile.length - 1; index += 1) {
      for (const point of [profile[index], profile[index + 1]]) {
        positions.push(
          Math.cos(angle) * point.x * 1.002,
          point.y,
          Math.sin(angle) * point.x * 1.002,
        );
      }
    }
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  return geometry;
}

function addSuspension(group, bottomY) {
  const lineMaterial = new THREE.LineBasicMaterial({
    color: 0x252b2e,
    transparent: true,
    opacity: 0.78,
  });
  const positions = [];
  for (const [x, z] of [[-2.8, -2.8], [-2.8, 2.8], [2.8, -2.8], [2.8, 2.8]]) {
    positions.push(0, bottomY, 0, x * 0.45, bottomY - 8.0, z * 0.45);
    positions.push(x * 0.45, bottomY - 8.0, z * 0.45, x, bottomY - 11.5, z);
  }
  const suspensionGeometry = new THREE.BufferGeometry();
  suspensionGeometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  const suspension = new THREE.LineSegments(suspensionGeometry, lineMaterial);
  suspension.name = "BALLOON_FLIGHT_TRAIN_AND_SUSPENSION";
  suspension.userData.noShadow = true;
  group.add(suspension);

  const gondola = new THREE.Mesh(
    new THREE.BoxGeometry(5.6, 2.8, 4.2),
    new THREE.MeshStandardMaterial({
      color: 0xd8d4c8,
      roughness: 0.72,
      metalness: 0.18,
    }),
  );
  gondola.name = "BALLOON_SCIENCE_GONDOLA";
  gondola.position.y = bottomY - 13.0;
  group.add(gondola);

  const dark = new THREE.MeshStandardMaterial({ color: 0x263037, roughness: 0.66 });
  for (const side of [-1, 1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(5.8, 0.12, 1.8), dark);
    panel.name = `BALLOON_GONDOLA_PANEL_${side < 0 ? "LEFT" : "RIGHT"}`;
    panel.position.set(side * 4.5, bottomY - 12.3, 0);
    panel.rotation.z = side * -0.16;
    group.add(panel);
  }
}

/** Purpose-built visual for the Rapier production target, centred on the buoyant envelope. */
export function createHighAltitudeBalloon(context = {}) {
  const group = new THREE.Group();
  group.name = "HIGH_ALTITUDE_SUPER_PRESSURE_BALLOON_114P5M_SURROGATE";

  const profile = envelopeProfile();
  const envelopeMaterial = new THREE.MeshPhysicalMaterial({
    color: 0xe9edf0,
    roughness: 0.66,
    metalness: 0.02,
    transparent: true,
    opacity: 0.76,
    side: THREE.DoubleSide,
    depthWrite: true,
    envMapIntensity: 0.72,
  });
  const envelope = new THREE.Mesh(new THREE.LatheGeometry(profile, 48), envelopeMaterial);
  envelope.name = "BALLOON_114P5M_PUMPKIN_ENVELOPE";
  envelope.castShadow = false;
  envelope.receiveShadow = true;
  group.add(envelope);

  const gores = new THREE.LineSegments(
    goreLineGeometry(profile),
    new THREE.LineBasicMaterial({
      color: 0x737d84,
      transparent: true,
      opacity: 0.46,
    }),
  );
  gores.name = "BALLOON_LONGITUDINAL_GORES";
  gores.userData.noShadow = true;
  group.add(gores);

  const apex = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 1.8, 2.2, 16),
    new THREE.MeshStandardMaterial({ color: 0xaeb8bc, roughness: 0.58, metalness: 0.24 }),
  );
  apex.name = "BALLOON_APEX_FITTING";
  apex.position.y = HIGH_ALTITUDE_BALLOON_HEIGHT_M * 0.5 + 0.8;
  group.add(apex);
  addSuspension(group, -HIGH_ALTITUDE_BALLOON_HEIGHT_M * 0.5);

  group.userData.presentationId = HIGH_ALTITUDE_BALLOON_PRESENTATION_ID;
  group.userData.targetPhysicalContract = Object.freeze({
    flightModelBinding: "FlightModel.HighAltitudeBalloonPublicDataSurrogate",
    envelopeBroadsideDiameterM: HIGH_ALTITUDE_BALLOON_DIAMETER_M,
    envelopeHeightM: HIGH_ALTITUDE_BALLOON_HEIGHT_M,
    buoyantVolumeM3: HIGH_ALTITUDE_BALLOON_VOLUME_M3,
    combinedBalloonAndPayloadMassKg: 4_500,
    floatAltitudeM: 33_500,
    broadsideHitRadiusM: 56,
    projectedBroadsideAreaM2: Math.PI * (HIGH_ALTITUDE_BALLOON_DIAMETER_M / 2) ** 2,
    physicalGoreCount: 280,
    renderedRepresentativeGoreCount: 28,
    epistemic: "public-data-surrogate",
    sourceUrl: HIGH_ALTITUDE_BALLOON_SOURCE_URL,
  });
  annotateProceduralFallback(group, context);
  return group;
}
