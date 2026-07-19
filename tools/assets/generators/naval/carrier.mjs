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

const ASSET_ID = "platform.carrier.straight-deck.v1";

function carrierMaterials(THREE) {
  const paintSet = createPanelledSurfaceSet(THREE, "CARRIER_WEATHERED_PAINT", {
    size: 256, seed: 1952, warmth: -0.08, grime: 0.2, roughness: 0.94, metalness: 0.9,
  });
  const deckSet = createPanelledSurfaceSet(THREE, "CARRIER_FLIGHT_DECK_SURFACE", {
    size: 256, seed: 1954, warmth: 0.06, grime: 0.28, roughness: 0.98, metalness: 0.34,
  });
  const materials = {
    hull: material(THREE, "NAVAL_HULL_GRAY", 0x46555b, { metalness: 0.48, roughness: 0.58 }),
    hullDark: material(THREE, "NAVAL_HULL_DARK", 0x202b30, { metalness: 0.42, roughness: 0.72 }),
    deck: material(THREE, "CARRIER_FLIGHT_DECK", 0x303536, { metalness: 0.16, roughness: 0.86 }),
    structure: material(THREE, "NAVAL_SUPERSTRUCTURE", 0x647177, { metalness: 0.4, roughness: 0.57 }),
    glass: material(THREE, "NAVAL_BRIDGE_GLASS", 0x102a35, { metalness: 0.22, roughness: 0.2 }),
    white: material(THREE, "DECK_MARKING_WHITE", 0xd9d8ca, { metalness: 0.02, roughness: 0.92 }),
    yellow: material(THREE, "DECK_MARKING_YELLOW", 0xc4a84f, { metalness: 0.04, roughness: 0.9 }),
    light: material(THREE, "DECK_LIGHT_EMISSIVE", 0xa8d8d0, {
      metalness: 0.08, roughness: 0.3, emissive: 0x3d9387, emissiveIntensity: 2.4,
    }),
  };
  for (const value of [materials.hull, materials.hullDark, materials.structure]) {
    applyPbrTextureSet(value, paintSet, { normalScale: 0.68, aoIntensity: 0.78 });
  }
  applyPbrTextureSet(materials.deck, deckSet, { normalScale: 0.48, aoIntensity: 0.84 });
  return materials;
}

function addHull(THREE, scene, materials) {
  const stations = [
    { z: -133, halfBeam: 0.55, gunwaleY: -2.1, keelY: -9.4, keelTuck: 0.2 },
    { z: -126, halfBeam: 7.4, gunwaleY: -2.1, keelY: -20.2, keelTuck: 0.33 },
    { z: -113, halfBeam: 13.5, gunwaleY: -2.1, keelY: -24.9, keelTuck: 0.4 },
    { z: -78, halfBeam: 14.1, gunwaleY: -2.1, keelY: -26.0, keelTuck: 0.43 },
    { z: -20, halfBeam: 14.25, gunwaleY: -2.1, keelY: -26.3, keelTuck: 0.44 },
    { z: 52, halfBeam: 14.1, gunwaleY: -2.1, keelY: -26.1, keelTuck: 0.44 },
    { z: 103, halfBeam: 13.5, gunwaleY: -2.1, keelY: -24.5, keelTuck: 0.42 },
    { z: 125, halfBeam: 11.1, gunwaleY: -2.1, keelY: -21.2, keelTuck: 0.38 },
    { z: 133, halfBeam: 8.2, gunwaleY: -2.1, keelY: -18.0, keelTuck: 0.34 },
  ];
  const hullGeometry = createStationHullGeometry(THREE, stations, 18);
  hullGeometry.name = "CARRIER_HULL_GEOMETRY";
  const hull = new THREE.Mesh(hullGeometry, materials.hull);
  hull.name = "CARRIER_HULL";
  hull.castShadow = true;
  hull.receiveShadow = true;
  scene.add(hull);

  const deckOutline = [
    [-2.2, -133], [2.2, -133], [13.7, -124], [15.35, -96], [15.75, -42],
    [15.75, 80], [14.6, 119], [10.8, 133], [-10.8, 133], [-14.6, 119],
    [-15.75, 80], [-15.75, -42], [-15.35, -96], [-13.7, -124],
  ];
  addOutlineDeck(THREE, scene, "FLIGHT_DECK", deckOutline, -1.5, 0, materials.deck);
  addBox(THREE, scene, "HANGAR_SIDE_DARK", [27.2, 3.4, 226], [0, -3.6, 1], materials.hullDark);
  addBox(THREE, scene, "GALLERY_DECK", [30.2, 0.45, 220], [0, -1.85, 0], materials.structure);
  addBox(THREE, scene, "PORT_CATWALK", [2.1, 0.35, 205], [-16.25, -0.6, 1], materials.hullDark);
  addBox(THREE, scene, "STARBOARD_CATWALK", [2.1, 0.35, 205], [16.25, -0.6, 1], materials.hullDark);
  for (const [side, x] of [["PORT", -15.3], ["STARBOARD", 15.3]]) {
    for (const [index, z] of [-68, 63].entries()) {
      addBox(THREE, scene, `${side}_SPONSON_${index + 1}`, [3.9, 0.75, 10.5], [x, -2.0, z], materials.hullDark);
    }
  }
}

function addDeckDetails(THREE, scene, materials) {
  addBox(THREE, scene, "PORT_DECK_EDGE_LINE", [0.22, 0.045, 218], [-14.75, 0.035, 0], materials.white, { castShadow: false });
  addBox(THREE, scene, "STARBOARD_DECK_EDGE_LINE", [0.22, 0.045, 218], [14.75, 0.035, 0], materials.white, { castShadow: false });
  addBox(THREE, scene, "LANDING_CENTRE_LINE", [0.42, 0.05, 190], [0, 0.04, 15], materials.white, { castShadow: false });
  addBox(THREE, scene, "RECOVERY_THRESHOLD_BAR", [25.5, 0.055, 1.5], [0, 0.045, 102], materials.white, { castShadow: false });
  addBox(THREE, scene, "PORT_TAXI_LINE", [0.34, 0.052, 62], [-6.1, 0.043, -57], materials.yellow, { castShadow: false });
  addBox(THREE, scene, "STARBOARD_TAXI_LINE", [0.34, 0.052, 62], [6.1, 0.043, -57], materials.yellow, { castShadow: false });

  const dashPositions = [];
  for (let z = -104; z <= 84; z += 16) dashPositions.push([0, 0.055, z]);
  addInstancedBoxes(THREE, scene, "LANDING_CENTRE_DASHES", [0.72, 0.055, 7.5], dashPositions, materials.white);
  addInstancedBoxes(THREE, scene, "BOW_DECK_NUMBER_11", [0.85, 0.06, 10], [[-2.1, 0.06, -103], [2.1, 0.06, -103]], materials.white);

  for (let wire = 0; wire < 4; wire++) {
    addCylinder(THREE, scene, `ARRESTING_WIRE_${wire + 1}`, 0.075, 0.075, 25.5, [0, 0.17, 48 + wire * 5.3], materials.yellow, {
      radialSegments: 8,
      rotation: [0, 0, Math.PI / 2],
      castShadow: false,
    });
  }
  addBox(THREE, scene, "BARRIER_PORT_POST", [0.24, 4.4, 0.24], [-13, 2.2, -34], materials.structure);
  addBox(THREE, scene, "BARRIER_STARBOARD_POST", [0.24, 4.4, 0.24], [13, 2.2, -34], materials.structure);
  addBox(THREE, scene, "BARRIER_TOP", [26.2, 0.18, 0.24], [0, 4.3, -34], materials.structure);

  const edgeLights = [];
  for (let z = -112; z <= 112; z += 12) {
    edgeLights.push([-15.85, -0.05, z], [15.85, -0.05, z]);
  }
  addInstancedBoxes(THREE, scene, "DECK_EDGE_LIGHTS", [0.18, 0.14, 0.36], edgeLights, materials.light);
  addInstancedBoxes(THREE, scene, "APPROACH_LIGHT_ROW", [0.2, 0.16, 0.2], [
    [-4, 0.11, 105], [-2, 0.11, 105], [0, 0.11, 105], [2, 0.11, 105], [4, 0.11, 105],
  ], materials.light);
}

function addIsland(THREE, scene, materials) {
  addBox(THREE, scene, "ISLAND_LOWER", [7.2, 4.8, 27], [10.8, 2.4, -25], materials.structure);
  addBox(THREE, scene, "ISLAND_MIDDLE", [6.5, 5.6, 18], [10.7, 7.55, -29], materials.structure);
  addBox(THREE, scene, "ISLAND_BRIDGE", [7.7, 3.8, 13], [10.4, 12.25, -33], materials.structure);
  addBox(THREE, scene, "BRIDGE_FORWARD_GLAZING", [6.7, 0.95, 0.3], [10.35, 12.7, -39.6], materials.glass);
  addBox(THREE, scene, "BRIDGE_PORT_GLAZING", [0.3, 0.95, 10.3], [6.45, 12.7, -33], materials.glass);
  addBox(THREE, scene, "BRIDGE_STARBOARD_GLAZING", [0.3, 0.95, 10.3], [14.3, 12.7, -33], materials.glass);
  addCylinder(THREE, scene, "ISLAND_FUNNEL", 1.75, 2.1, 8.7, [11.2, 17.0, -19.5], materials.hullDark, { radialSegments: 16 });
  addCylinder(THREE, scene, "ISLAND_MAST", 0.24, 0.38, 13.8, [10.7, 23.2, -34], materials.structure, { radialSegments: 10 });
  addBox(THREE, scene, "RADAR_YARD", [10.5, 0.28, 0.34], [10.7, 27.1, -34], materials.structure);
  addBox(THREE, scene, "RADAR_CROSSPIECE", [0.3, 0.28, 6.4], [10.7, 27.1, -34], materials.structure);
  addBox(THREE, scene, "RADAR_ARRAY", [6.1, 1.25, 0.2], [10.7, 29.3, -34], materials.structure);
  addSphere(THREE, scene, "MAST_BEACON", 0.22, [10.7, 30.35, -34], materials.light, { widthSegments: 8, heightSegments: 5 });

  addBox(THREE, scene, "LSO_PLATFORM", [3.7, 0.38, 5.1], [-16.7, -0.3, 83], materials.hullDark);
  addBox(THREE, scene, "LSO_SHIELD", [0.18, 1.45, 3.0], [-18.45, 0.35, 83], materials.structure);
  addInstancedBoxes(THREE, scene, "LSO_DATUM_LIGHTS", [0.16, 0.16, 0.16], [
    [-18.42, 0.75, 81.9], [-18.42, 0.75, 82.45], [-18.42, 0.75, 83],
    [-18.42, 0.75, 83.55], [-18.42, 0.75, 84.1],
  ], materials.light);
}

function addDefensiveDetails(THREE, scene, materials) {
  const mounts = [
    [-15.6, -1.0, -70], [15.6, -1.0, -70], [-15.6, -1.0, 68], [15.6, -1.0, 68],
  ];
  mounts.forEach(([x, y, z], index) => {
    addCylinder(THREE, scene, `GUN_TUB_${index + 1}`, 1.2, 1.2, 0.72, [x, y, z], materials.structure, { radialSegments: 12 });
    addCylinder(THREE, scene, `GUN_BARREL_${index + 1}`, 0.09, 0.11, 2.8, [x, y + 0.55, z - 1.1], materials.hullDark, {
      radialSegments: 8,
      rotation: [Math.PI / 2, 0, 0],
    });
  });
  addBox(THREE, scene, "PORT_BOAT", [2.2, 1.1, 8.5], [-14.4, -4.7, 18], materials.structure);
  addBox(THREE, scene, "STARBOARD_BOAT", [2.2, 1.1, 8.5], [14.4, -4.7, 18], materials.structure);
}

export function buildStraightDeckCarrierSpec(THREE) {
  const scene = new THREE.Group();
  scene.name = "STRAIGHT_DECK_CARRIER_KOREA_1950S";
  const materials = carrierMaterials(THREE);
  addHull(THREE, scene, materials);
  addDeckDetails(THREE, scene, materials);
  addIsland(THREE, scene, materials);
  addDefensiveDetails(THREE, scene, materials);
  preparePbrGeometry(scene);
  consolidateStaticMeshes(THREE, scene, {
    preserveNames: ["CARRIER_HULL", "FLIGHT_DECK", "ISLAND_BRIDGE"],
  });
  const anchors = [
    addAnchor(THREE, scene, "deck.origin", "SOCKET_DECK_ORIGIN", [0, 0.25, 0]),
    addAnchor(THREE, scene, "recovery.threshold", "SOCKET_RECOVERY_THRESHOLD", [0, 0.25, 102]),
    addAnchor(THREE, scene, "bow.reference", "SOCKET_BOW_REFERENCE", [0, -1.9, -133]),
    addAnchor(THREE, scene, "wake.origin", "SOCKET_WAKE_ORIGIN", [0, -17.2, 133]),
  ];
  return finalizeSpec(THREE, {
    assetId: ASSET_ID,
    output: "models/naval/straight-deck-carrier.glb",
    level: 0,
    scene,
    anchors,
    metadata: {
      displayName: "Korean-era straight-deck fleet carrier",
      period: "1950-1956",
      coordinateSystem: { units: "metres", upAxis: "+y", forwardAxis: "-z", handedness: "right" },
      dimensions: {
        overallLengthMetres: 266,
        flightDeckLengthMetres: 266,
        flightDeckWidthMetres: 31.5,
        waterlineBeamMetres: 28.5,
        maximumOverallBeamMetres: 35.85,
        deckAboveWaterlineMetres: 17.2,
        draftMetres: 9.1,
        maximumHeightAboveDeckMetres: 30.6,
      },
      budgets: { triangles: 12000, drawCalls: 24, materials: 8, textureMemoryMiB: 4, maxTextureDimension: 256 },
      notes: "Generic Essex-family silhouette with deterministic weathered hull/deck PBR atlases and consolidated static batches; no historical hull number or trademarked livery asserted.",
    },
  });
}
