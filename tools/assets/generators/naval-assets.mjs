import { buildStraightDeckCarrierSpec } from "./naval/carrier.mjs";
import { buildGunDestroyerSpec } from "./naval/destroyer.mjs";

const REQUIRED_THREE_EXPORTS = [
  "Box3", "BoxGeometry", "BufferGeometry", "CylinderGeometry", "ExtrudeGeometry",
  "Float32BufferAttribute", "Group", "InstancedMesh", "Mesh", "MeshStandardMaterial",
  "Object3D", "Shape", "SphereGeometry", "Vector3",
];

function validateThree(THREE) {
  if (!THREE || typeof THREE !== "object") throw new TypeError("buildNavalAssetSpecs requires a Three module namespace");
  const missing = REQUIRED_THREE_EXPORTS.filter((name) => typeof THREE[name] !== "function");
  if (missing.length) throw new TypeError(`Three module is missing: ${missing.join(", ")}`);
}

export function buildNavalAssetSpecs(THREE) {
  validateThree(THREE);
  return [
    buildStraightDeckCarrierSpec(THREE),
    buildGunDestroyerSpec(THREE),
  ];
}

export default buildNavalAssetSpecs;
