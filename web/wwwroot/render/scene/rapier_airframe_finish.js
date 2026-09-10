import * as THREE from "../../vendor/three.module.js";
import { makeMaterial } from "./airframe_primitives.js?v=362";

// Appearance only. Ramjet-X supplies the restrained finish reference; Rapier's
// own canonical stations and opening dimensions still own every surface.
export function createRapierMaterials(def) {
  const palette = def.palette;
  const finish = { grain: 0.035, grainScale: 15, panels: 0,
    specularIntensity: 0.85, envMapIntensity: 0.95 };
  const upper = makeMaterial(palette.upper, 0.38, 0.48, 0, finish);
  const lower = makeMaterial(palette.lower, 0.46, 0.40, 0, finish);
  const hot = makeMaterial(palette.hot, 0.43, 0.58, 0, finish);
  const sensor = makeMaterial(palette.sensor, 0.54, 0.12, 0,
    { ...finish, grain: 0.02 });
  const accent = makeMaterial(palette.accent, 0.43, 0.45, 0, finish);
  const body = upper.clone();
  // Three's clone does not retain onBeforeCompile/customProgramCacheKey.
  body.onBeforeCompile = upper.onBeforeCompile;
  body.customProgramCacheKey = upper.customProgramCacheKey;
  const inheritedCompile = body.onBeforeCompile;
  const stations = def.fuselage.stations;
  const noseEnd = stations[1].z;
  const seams = [stations[2].z, stations.at(-3).z, stations.at(-2).z];
  body.onBeforeCompile = (shader) => {
    inheritedCompile(shader);
    shader.uniforms.uRapierNoseEnd = { value: noseEnd };
    shader.uniforms.uRapierNoseColor = { value: new THREE.Color(palette.sensor) };
    shader.uniforms.uRapierSeams = { value: new THREE.Vector3(...seams) };
    shader.fragmentShader = shader.fragmentShader
      .replace("uniform float uFinishGrain;", `
        uniform float uFinishGrain;
        uniform float uRapierNoseEnd;
        uniform vec3 uRapierNoseColor;
        uniform vec3 uRapierSeams;
      `)
      .replace("#include <color_fragment>", `
        #include <color_fragment>
        float rapierAA = max(fwidth(vFinishPosition.z), 0.002);
        float rapierNose = 1.0 - smoothstep(uRapierNoseEnd - rapierAA,
          uRapierNoseEnd + rapierAA, vFinishPosition.z);
        diffuseColor.rgb = mix(diffuseColor.rgb, uRapierNoseColor, rapierNose);
        vec3 rapierDistances = abs(vec3(vFinishPosition.z) - uRapierSeams);
        float rapierSeamDistance = min(rapierDistances.x,
          min(rapierDistances.y, rapierDistances.z));
        float rapierSeam = 1.0 - smoothstep(0.004,
          0.004 + rapierAA, rapierSeamDistance);
        diffuseColor.rgb *= 1.0 - rapierSeam * 0.16;
      `);
  };
  body.customProgramCacheKey = () => "rapier-hermeus-finish-v1";
  for (const [name, material] of Object.entries({ upper, lower, hot, sensor, accent, body })) {
    material.name = `RAPIER_${name.toUpperCase()}_FINISH`;
    material.userData.presentationOnly = true;
  }
  return { upper, lower, hot, sensor, accent, body };
}

function inwardWall(frontRadius, backRadius, depth, material) {
  const geometry = new THREE.CylinderGeometry(frontRadius, backRadius, depth, 32, 1, true);
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0, -depth / 2);
  const indices = geometry.index.array;
  for (let index = 0; index < indices.length; index += 3) {
    [indices[index + 1], indices[index + 2]] = [indices[index + 2], indices[index + 1]];
  }
  const normals = geometry.attributes.normal.array;
  for (let index = 0; index < normals.length; index++) normals[index] *= -1;
  return new THREE.Mesh(geometry, material);
}

// Local +Z faces out of each mouth; local -Z is the recessed, closed interior.
// The black backplate represents occlusion, not internal engine hardware.
function addCavity(mouth, innerRadius, depth, material) {
  const backRadius = innerRadius * 0.86;
  const wall = inwardWall(innerRadius, backRadius, depth, material);
  wall.name = `${mouth.name}_INNER_WALL`;
  const back = new THREE.Mesh(new THREE.CircleGeometry(backRadius, 32),
    new THREE.MeshStandardMaterial({ color: 0x070a0c, roughness: 1, metalness: 0 }));
  back.name = `${mouth.name}_RECESSED_DARK_INTERIOR`;
  back.position.z = -depth;
  mouth.add(wall, back);
}

export function createRapierInlet(def, materials, name) {
  const inlet = def.intake;
  // lipDepth is axial installation depth, not a radial metal-band width.
  const innerRadius = inlet.outerR * 0.94;
  const mouth = new THREE.Mesh(new THREE.RingGeometry(innerRadius, inlet.outerR, 32),
    materials.lower);
  mouth.name = name;
  mouth.scale.y = inlet.scaleY;
  mouth.position.fromArray(inlet.position);
  mouth.rotation.y = Math.PI;
  mouth.rotation.x = inlet.rotX;
  addCavity(mouth, innerRadius, inlet.lipDepth * 2, materials.sensor);
  mouth.add(createInletCuff(def, mouth, materials.lower));
  return mouth;
}

// Join the installed lip to the existing linear tunnel surface. This closes a
// missing presentation surface; neither the lip nor the authored body moves.
function createInletCuff(def, mouth, material) {
  const [start, end] = def.propulsionTunnel.stations;
  const z = Math.min(end.z, start.z + def.intake.lipDepth * 2);
  const fraction = (z - start.z) / (end.z - start.z);
  const lerp = (key) => start[key] + (end[key] - start[key]) * fraction;
  mouth.updateMatrix();
  const inverse = mouth.matrix.clone().invert();
  const positions = [], indices = [];
  // Match the tunnel's angular stations so the rear seam shares its polygon,
  // rather than merely touching the ideal ellipse outside that polygon.
  const segments = 32, stride = segments + 1;
  for (let ring = 0; ring < 2; ring++) {
    for (let i = 0; i <= segments; i++) {
      const angle = i / segments * Math.PI * 2;
      const point = ring === 0
        ? new THREE.Vector3(def.intake.outerR * Math.cos(angle),
          def.intake.outerR * Math.sin(angle), 0)
        : new THREE.Vector3(-lerp("rx") * Math.cos(angle),
          lerp("y") + lerp("ry") * Math.sin(angle), z).applyMatrix4(inverse);
      positions.push(...point.toArray());
    }
  }
  for (let i = 0; i < segments; i++) {
    indices.push(i, i + stride, i + 1, i + 1, i + stride, i + stride + 1);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  const cuff = new THREE.Mesh(geometry, material);
  cuff.name = `${mouth.name}_TUNNEL_JOIN`;
  return cuff;
}

export function createRapierExhaust(def, materials, name) {
  const exhaust = def.exhaust;
  // The old torus exceeded radiusM by 12%. Keep the lip and recess inside the
  // canonical nozzle envelope, including its forward half-fairing depth.
  const innerRadius = exhaust.radius * 0.91;
  const mouth = new THREE.Mesh(new THREE.RingGeometry(innerRadius, exhaust.radius, 40),
    materials.hot);
  mouth.name = name;
  mouth.position.fromArray(exhaust.position);
  addCavity(mouth, innerRadius, exhaust.fairingLength * 0.5, materials.hot);
  return mouth;
}
