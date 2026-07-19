import {
  addAnchor,
  addBox,
  addCylinder,
  addInstancedBoxes,
  addOutlineDeck,
  addSphere,
  createStationHullGeometry,
  finalizeSpec,
  material,
} from "./geometry.mjs";
import { consolidateStaticMeshes, preparePbrGeometry } from "../mesh-optimization.mjs";
import { applyPbrTextureSet, createPanelledSurfaceSet } from "../pbr-textures.mjs";

const ASSET_ID = "platform.escort.gun-destroyer.v1";

function destroyerMaterials(THREE) {
  const paintSet = createPanelledSurfaceSet(THREE, "ESCORT_WEATHERED_PAINT", {
    size: 256, seed: 1948, warmth: -0.04, grime: 0.22, roughness: 0.94, metalness: 0.9,
  });
  const deckSet = createPanelledSurfaceSet(THREE, "ESCORT_WEATHER_DECK_SURFACE", {
    size: 256, seed: 1956, warmth: 0.04, grime: 0.26, roughness: 0.98, metalness: 0.3,
  });
  const materials = {
    hull: material(THREE, "ESCORT_HULL_GRAY", 0x536168, { metalness: 0.46, roughness: 0.58 }),
    dark: material(THREE, "ESCORT_HULL_DARK", 0x243036, { metalness: 0.42, roughness: 0.72 }),
    deck: material(THREE, "ESCORT_WEATHER_DECK", 0x3a4141, { metalness: 0.16, roughness: 0.84 }),
    structure: material(THREE, "ESCORT_SUPERSTRUCTURE", 0x6d7a7f, { metalness: 0.4, roughness: 0.56 }),
    glass: material(THREE, "ESCORT_BRIDGE_GLASS", 0x122d38, { metalness: 0.2, roughness: 0.22 }),
    white: material(THREE, "ESCORT_MARKING_WHITE", 0xd8d8cf, { metalness: 0.02, roughness: 0.92 }),
    light: material(THREE, "ESCORT_LIGHT_EMISSIVE", 0xb7d8c5, {
      metalness: 0.06, roughness: 0.28, emissive: 0x4b8b67, emissiveIntensity: 2.2,
    }),
  };
  for (const value of [materials.hull, materials.dark, materials.structure]) {
    applyPbrTextureSet(value, paintSet, { normalScale: 0.68, aoIntensity: 0.8 });
  }
  applyPbrTextureSet(materials.deck, deckSet, { normalScale: 0.5, aoIntensity: 0.86 });
  return materials;
}

function addHull(THREE, scene, materials) {
  const stations = [
    { z: -59.5, halfBeam: 0.25, gunwaleY: -0.9, keelY: -3.4, keelTuck: 0.2 },
    { z: -55, halfBeam: 3.3, gunwaleY: -0.9, keelY: -7.8, keelTuck: 0.34 },
    { z: -44, halfBeam: 5.8, gunwaleY: -0.9, keelY: -9.2, keelTuck: 0.41 },
    { z: -20, halfBeam: 6.3, gunwaleY: -0.9, keelY: -9.6, keelTuck: 0.44 },
    { z: 16, halfBeam: 6.25, gunwaleY: -0.9, keelY: -9.5, keelTuck: 0.44 },
    { z: 42, halfBeam: 5.9, gunwaleY: -0.9, keelY: -8.8, keelTuck: 0.42 },
    { z: 55, halfBeam: 5.0, gunwaleY: -0.9, keelY: -7.5, keelTuck: 0.38 },
    { z: 59.5, halfBeam: 3.9, gunwaleY: -0.9, keelY: -6.6, keelTuck: 0.34 },
  ];
  const hullGeometry = createStationHullGeometry(THREE, stations, 14);
  hullGeometry.name = "GUN_DESTROYER_HULL_GEOMETRY";
  const hull = new THREE.Mesh(hullGeometry, materials.hull);
  hull.name = "GUN_DESTROYER_HULL";
  hull.castShadow = true;
  hull.receiveShadow = true;
  scene.add(hull);

  addOutlineDeck(THREE, scene, "DESTROYER_MAIN_DECK", [
    [-0.5, -59.5], [0.5, -59.5], [5.2, -53], [6.25, -38], [6.45, 18],
    [5.9, 48], [4.0, 59.5], [-4.0, 59.5], [-5.9, 48], [-6.45, 18],
    [-6.25, -38], [-5.2, -53],
  ], -0.75, 0, materials.deck);
  addOutlineDeck(THREE, scene, "DESTROYER_FORECASTLE", [
    [-0.5, -57.5], [0.5, -57.5], [5.25, -51.5], [5.75, -16], [-5.75, -16], [-5.25, -51.5],
  ], 0.02, 1.2, materials.deck);
  addBox(THREE, scene, "PORT_SHEER_STRIP", [0.45, 1.2, 72], [-6.0, -0.2, 2], materials.dark);
  addBox(THREE, scene, "STARBOARD_SHEER_STRIP", [0.45, 1.2, 72], [6.0, -0.2, 2], materials.dark);
}

function addSuperstructure(THREE, scene, materials) {
  addBox(THREE, scene, "FORWARD_DECKHOUSE", [7.8, 3.4, 12], [0, 2.9, -10], materials.structure);
  addBox(THREE, scene, "BRIDGE_BLOCK", [7.2, 3.2, 8.2], [0, 6.1, -15], materials.structure);
  addBox(THREE, scene, "BRIDGE_FORWARD_WINDOWS", [6.4, 0.75, 0.24], [0, 6.65, -19.2], materials.glass);
  addBox(THREE, scene, "BRIDGE_PORT_WINDOWS", [0.24, 0.75, 6.8], [-3.62, 6.65, -15], materials.glass);
  addBox(THREE, scene, "BRIDGE_STARBOARD_WINDOWS", [0.24, 0.75, 6.8], [3.62, 6.65, -15], materials.glass);
  addBox(THREE, scene, "AFT_DECKHOUSE", [6.7, 2.7, 13], [0, 1.35, 25], materials.structure);

  addCylinder(THREE, scene, "FORWARD_FUNNEL", 1.15, 1.45, 7.8, [0, 8.1, 1], materials.dark, { radialSegments: 14 });
  addCylinder(THREE, scene, "AFT_FUNNEL", 1.05, 1.35, 7.0, [0, 7.5, 15], materials.dark, { radialSegments: 14 });
  addCylinder(THREE, scene, "FOREMAST", 0.16, 0.28, 15.5, [0, 15.0, -12], materials.structure, { radialSegments: 8 });
  addBox(THREE, scene, "FOREMAST_YARD", [10.5, 0.22, 0.25], [0, 18.7, -12], materials.structure);
  addBox(THREE, scene, "FOREMAST_RADAR", [5.2, 1.15, 0.18], [0, 21.2, -12], materials.structure);
  addCylinder(THREE, scene, "AFT_MAST", 0.13, 0.23, 10.5, [0, 11.7, 26], materials.structure, { radialSegments: 8 });
  addBox(THREE, scene, "AFT_MAST_YARD", [7.2, 0.2, 0.22], [0, 14.1, 26], materials.structure);
  addSphere(THREE, scene, "MASTHEAD_BEACON", 0.18, [0, 22.3, -12], materials.light, { widthSegments: 8, heightSegments: 5 });
}

function addTwinTurret(THREE, scene, materials, name, position, pointsForward) {
  const [x, y, z] = position;
  addCylinder(THREE, scene, `${name}_BARBETTE`, 1.8, 1.8, 0.75, [x, y, z], materials.structure, { radialSegments: 14 });
  addBox(THREE, scene, `${name}_HOUSE`, [3.7, 1.6, 4.1], [x, y + 0.85, z], materials.structure);
  const direction = pointsForward ? -1 : 1;
  for (const side of [-0.48, 0.48]) {
    addCylinder(THREE, scene, `${name}_BARREL_${side < 0 ? "PORT" : "STARBOARD"}`, 0.11, 0.15, 5.2,
      [x + side, y + 1.25, z + direction * 3.8], materials.dark, {
        radialSegments: 8,
        rotation: [Math.PI / 2, 0, 0],
      });
  }
}

function addWeaponsAndDeckDetails(THREE, scene, materials) {
  addTwinTurret(THREE, scene, materials, "MOUNT_51", [0, 1.6, -45], true);
  addTwinTurret(THREE, scene, materials, "MOUNT_52", [0, 1.6, -28], true);
  addTwinTurret(THREE, scene, materials, "MOUNT_53", [0, 0.4, 46], false);

  addCylinder(THREE, scene, "TORPEDO_MOUNT", 1.1, 1.1, 3.5, [0, 1.3, 12], materials.structure, {
    radialSegments: 12,
    rotation: [0, 0, Math.PI / 2],
  });
  for (const offset of [-0.55, 0, 0.55]) {
    addCylinder(THREE, scene, `TORPEDO_TUBE_${String(offset).replace("-", "M").replace(".", "_")}`, 0.16, 0.16, 5.6,
      [0, 1.3 + offset, 12], materials.dark, { radialSegments: 8, rotation: [0, 0, Math.PI / 2] });
  }
  addInstancedBoxes(THREE, scene, "STERN_DEPTH_CHARGES", [0.55, 0.55, 1.4], [
    [-4.4, 0.3, 52], [-4.4, 0.3, 55], [-4.4, 0.3, 58],
    [4.4, 0.3, 52], [4.4, 0.3, 55], [4.4, 0.3, 58],
  ], materials.dark);
  addBox(THREE, scene, "BOW_CENTRE_MARK", [0.28, 0.04, 15], [0, 1.225, -43], materials.white, { castShadow: false });

  const deckLights = [];
  for (let z = -48; z <= 50; z += 14) deckLights.push([-5.8, 0.18, z], [5.8, 0.18, z]);
  addInstancedBoxes(THREE, scene, "ESCORT_DECK_LIGHTS", [0.14, 0.12, 0.22], deckLights, materials.light);
  addBox(THREE, scene, "PORT_LIFEBOAT", [1.3, 0.8, 5.7], [-4.3, 2.1, 3], materials.structure);
  addBox(THREE, scene, "STARBOARD_LIFEBOAT", [1.3, 0.8, 5.7], [4.3, 2.1, 3], materials.structure);
}

export function buildGunDestroyerSpec(THREE) {
  const scene = new THREE.Group();
  scene.name = "KOREAN_ERA_GUN_DESTROYER_ESCORT";
  const materials = destroyerMaterials(THREE);
  addHull(THREE, scene, materials);
  addSuperstructure(THREE, scene, materials);
  addWeaponsAndDeckDetails(THREE, scene, materials);
  preparePbrGeometry(scene);
  consolidateStaticMeshes(THREE, scene, {
    preserveNames: [
      "GUN_DESTROYER_HULL", "DESTROYER_MAIN_DECK", "DESTROYER_FORECASTLE",
      "MOUNT_51_HOUSE", "MOUNT_53_HOUSE", "FORWARD_FUNNEL", "TORPEDO_MOUNT",
    ],
  });
  const anchors = [
    addAnchor(THREE, scene, "deck.origin", "SOCKET_DECK_ORIGIN", [0, 0.25, 0]),
    addAnchor(THREE, scene, "formation.origin", "SOCKET_FORMATION_ORIGIN", [0, -5.0, 0]),
    addAnchor(THREE, scene, "bow.reference", "SOCKET_BOW_REFERENCE", [0, -0.8, -59.5]),
    addAnchor(THREE, scene, "wake.origin", "SOCKET_WAKE_ORIGIN", [0, -5.0, 59.5]),
  ];
  return finalizeSpec(THREE, {
    assetId: ASSET_ID,
    output: "models/naval/gun-destroyer-escort.glb",
    level: 0,
    scene,
    anchors,
    metadata: {
      displayName: "Korean-era gun destroyer escort",
      period: "1945-1960",
      coordinateSystem: { units: "metres", upAxis: "+y", forwardAxis: "-z", handedness: "right" },
      dimensions: {
        overallLengthMetres: 119,
        maximumBeamMetres: 12.9,
        deckAboveWaterlineMetres: 5.0,
        draftMetres: 4.6,
        maximumHeightAboveDeckMetres: 22.75,
      },
      budgets: { triangles: 6500, drawCalls: 24, materials: 7, textureMemoryMiB: 4, maxTextureDimension: 256 },
      notes: "Reusable late-war/Korean-era twin-gun destroyer silhouette with deterministic weathered PBR atlases, consolidated static batches, generic markings, and no asserted historic hull identity.",
    },
  });
}
