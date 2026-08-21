/**
 * Camp Ember BF:V-density firebase — presentation only.
 *
 * One merged vertex-colored mesh so the canyon draw-call budget stays intact.
 * Replaces the old same-color AABB stack + green ground-war control disc.
 */

import {
  COBRA_CANYON_CAMP_EMBER_APRON,
  sampleCobraCanyonTerrain,
} from "./cobra_canyon_plan.js?v=345";

export const CAMP_EMBER_LANDMARK_ID = "landmark.cobra-canyon.camp-ember.v1";
export const CAMP_EMBER_FIREBASE_SCHEMA = "guns-only.cobra-camp-ember-firebase.v2";
export const CAMP_EMBER_OPERATIONS = Object.freeze({
  ...COBRA_CANYON_CAMP_EMBER_APRON,
  tlofRadiusM: 12,
  fatoRadiusM: 28,
  safetyAreaRadiusM: 38,
  compoundRadiusM: 175,
  spareWorldOffsetsM: Object.freeze([
    Object.freeze({ eastM: 20, northM: 65 }),
    Object.freeze({ eastM: 20, northM: -65 }),
  ]),
});
// Three.js uses render +Z = world south, so an aviation heading H is rendered at PI-H.
export const CAMP_EMBER_DEPARTURE_YAW_RAD =
  Math.PI - CAMP_EMBER_OPERATIONS.finalHeadingDeg * Math.PI / 180;

/**
 * No elevated presentation geometry may enter this local-pad volume. It contains the authority
 * spawn, rear-seat eye and the main-rotor disc's near field. Thin PSP/laterite surfaces at or
 * below `minimumY` are deliberately allowed.
 */
/**
 * How far the DRAWN basin is recessed beneath the simulated apron under Camp Ember, and by the
 * same token how far this mesh is anchored below simulated ground.
 *
 * The owner's long-running Camp Ember "flicker" was never performance — production telemetry
 * measured a locked 60 fps there. It is depth precision. The apron flattens terrain to EXACTLY
 * the camp elevation and this mesh anchored at that same height, so local Y = 0 WAS the drawn
 * ground to the last float bit, and every pad, road and burn scar was authored within 30 mm of
 * it. The cockpit depth quantum is ~5 mm at 100 m; the camp is 105 m across and the pilot sits
 * inside it, so which surface wins flips as the eye moves.
 *
 * polygonOffset cannot solve it: all ~200 parts merge into ONE mesh with one material, so the
 * bias moves the whole camp against the terrain and can never separate the camp's own layers
 * from each other. The geometry has to move, and for it to move up without the pad standing
 * proud of the valley, the drawn ground has to come down.
 *
 * PRESENTATION ONLY — the kernel's contact height is untouched.
 */
export const CAMP_EMBER_DRAWN_RECESS_M = 0.3;

export const CAMP_EMBER_SPAWN_SAFETY_VOLUME = Object.freeze({
  minimumX: -CAMP_EMBER_OPERATIONS.safetyAreaRadiusM,
  maximumX: CAMP_EMBER_OPERATIONS.safetyAreaRadiusM,
  minimumY: 0.325,
  maximumY: 5.5,
  minimumZ: -CAMP_EMBER_OPERATIONS.safetyAreaRadiusM,
  maximumZ: CAMP_EMBER_OPERATIONS.safetyAreaRadiusM,
});

/** PSP plate / laterite / sandbag / olive / steel — never control-green. */
export const CAMP_EMBER_COLORS = Object.freeze({
  psp: [0.39, 0.41, 0.38],
  pspLight: [0.50, 0.51, 0.46],
  pspRust: [0.47, 0.34, 0.25],
  laterite: [0.49, 0.30, 0.18],
  lateriteDark: [0.39, 0.23, 0.14],
  sandbag: [0.58, 0.50, 0.33],
  sandbagShade: [0.46, 0.40, 0.27],
  tent: [0.25, 0.30, 0.20],
  canvas: [0.39, 0.40, 0.27],
  timber: [0.31, 0.23, 0.14],
  steel: [0.45, 0.46, 0.42],
  rust: [0.42, 0.24, 0.14],
  fuel: [0.28, 0.29, 0.20],
  crate: [0.43, 0.35, 0.22],
  aviationWhite: [0.83, 0.82, 0.68],
  signalYellow: [0.82, 0.62, 0.14],
  signalRed: [0.66, 0.16, 0.10],
  tyre: [0.075, 0.07, 0.06],
  rotorWash: [0.27, 0.22, 0.17],
  fadedYellow: [0.64, 0.49, 0.16],
  oliveDrab: [0.22, 0.28, 0.17],
  oliveHighlight: [0.34, 0.38, 0.23],
});

function finite(value, fallback = 0) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function campEmberAnchor(plan) {
  const landmark = (plan?.landmarks ?? []).find((entry) => entry?.id === CAMP_EMBER_LANDMARK_ID);
  const point = landmark?.positionLocalM;
  if (!Array.isArray(point) || point.length < 3) return null;
  const eastM = finite(point[0], NaN);
  const northM = finite(point[2], NaN);
  if (!Number.isFinite(eastM) || !Number.isFinite(northM)) return null;
  const groundY = sampleCobraCanyonTerrain(plan, eastM, northM);
  return { eastM, northM, groundY, landmark };
}

/**
 * Authored prop list in final-course frame. Local +Z is the 300-degree departure/go-around
 * heading; local -Z is final approach. Both throats remain open through the perimeter.
 */
export function campEmberFirebaseParts() {
  const parts = [];
  const add = (id, family, shape, color, x, z, centreY, w, h, d, yaw = 0, surface = false) => {
    parts.push({
      id,
      family,
      shape,
      color,
      x,
      centreY,
      z,
      widthM: w,
      heightM: h,
      depthM: d,
      yaw,
      surface,
    });
  };
  const addFan = (id, family, color, x, z, centreY, outline) => {
    parts.push({
      id, family, shape: "fan", color, x, z, centreY,
      widthM: 1, heightM: 0.01, depthM: 1, yaw: 0, surface: true, outline,
    });
  };
  const localFromWorldOffset = (eastM, northM) => ({
    x: Math.cos(CAMP_EMBER_DEPARTURE_YAW_RAD) * eastM
      - Math.sin(CAMP_EMBER_DEPARTURE_YAW_RAD) * -northM,
    z: Math.sin(CAMP_EMBER_DEPARTURE_YAW_RAD) * eastM
      + Math.cos(CAMP_EMBER_DEPARTURE_YAW_RAD) * -northM,
  });
  const addPad = (id, x, z, sizeM, yaw = 0, color = CAMP_EMBER_COLORS.psp) => {
    // The main 28 m FATO needs stabilized earth under its outer ring and edge tabs. The previous
    // size+12 bed ended at 21 m, leaving those marks visibly suspended above the recessed scar.
    const lateriteSizeM = id === "main" ? 64 : sizeM + 12;
    add(`laterite-${id}`, "laterite", "box", CAMP_EMBER_COLORS.laterite, x, z,
      0.220, lateriteSizeM, 0.02, lateriteSizeM, yaw, true);
    add(`psp-${id}-bed`, "psp", "box", color, x, z,
      0.265, sizeM, 0.02, sizeM, yaw, true);
    const ribCount = Math.floor(sizeM / 2.2);
    for (let rib = -Math.floor(ribCount / 2); rib <= Math.floor(ribCount / 2); rib++) {
      const acrossM = rib * 2.08;
      add(`psp-${id}-rib-${rib + 20}`, "psp", "box",
        rib % 3 === 0 ? CAMP_EMBER_COLORS.pspRust
          : rib % 2 === 0 ? CAMP_EMBER_COLORS.pspLight : color,
        x + Math.cos(yaw) * acrossM, z + Math.sin(yaw) * acrossM,
        0.314, 1.72, 0.012, sizeM - 2, yaw, true);
    }
  };

  // Central TLOF/FATO plus two authority-matched spare stations and a separate casualty/supply
  // pad. The landing system is now readable as an aviation facility, not one postage stamp.
  addPad("main", 0, 0, 30);
  const sparePads = CAMP_EMBER_OPERATIONS.spareWorldOffsetsM
    .map(({ eastM, northM }) => localFromWorldOffset(eastM, northM));
  sparePads.forEach(({ x, z }, index) => addPad(`spare-${index}`, x, z, 26, index ? -0.08 : 0.08));
  addPad("medevac", 102, 58, 24, -0.12, CAMP_EMBER_COLORS.pspLight);

  // Final-course readability. Vietnam helicopter sites used panels, smoke and improvised visual
  // aids rather than a runway; these painted PSP markers give the player the same operational
  // information without turning a medium FOB into an airport. The paired panels narrow toward
  // the FATO, the segmented ring identifies the landing surface, and the H survives grass/haze.
  for (const [index, z] of [-150, -115, -80, -48].entries()) {
    const halfWidthM = 29 - index * 2.5;
    for (const side of [-1, 1]) {
      add(`final-panel-${index}-${side < 0 ? "left" : "right"}`, "marking", "box",
        index % 2 ? CAMP_EMBER_COLORS.aviationWhite : CAMP_EMBER_COLORS.signalYellow,
        side * halfWidthM, z, 0.314, 5.5, 0.012, 2.2, 0, true);
    }
  }
  for (let segment = 0; segment < 16; segment++) {
    const angle = segment / 16 * Math.PI * 2;
    add(`fato-ring-${segment}`, "marking", "box", CAMP_EMBER_COLORS.aviationWhite,
      25 * Math.cos(angle), 25 * Math.sin(angle), 0.314,
      6.2, 0.012, 0.72, -angle, true);
  }
  add("tlof-h-left", "marking", "box", CAMP_EMBER_COLORS.aviationWhite,
    -4.2, 0, 0.316, 1.25, 0.012, 11, 0, true);
  add("tlof-h-right", "marking", "box", CAMP_EMBER_COLORS.aviationWhite,
    4.2, 0, 0.316, 1.25, 0.012, 11, 0, true);
  add("tlof-h-crossbar", "marking", "box", CAMP_EMBER_COLORS.aviationWhite,
    0, 0, 0.318, 8.4, 0.012, 1.25, 0, true);

  // Rotor-wash polish, oil shadows and alternating edge tabs stop the central PSP from reading
  // as one enormous flat polygon. Every mark remains part of the same merged firebase draw.
  for (let segment = 0; segment < 20; segment++) {
    const angle = segment / 20 * Math.PI * 2;
    add(`tlof-wash-${segment}`, "wear", "box", CAMP_EMBER_COLORS.rotorWash,
      8.8 * Math.cos(angle), 8.8 * Math.sin(angle), 0.319,
      3.0, 0.008, 0.42, -angle, true);
  }
  for (let segment = 0; segment < 12; segment++) {
    const angle = segment / 12 * Math.PI * 2 + Math.PI / 12;
    add(`fato-edge-tab-${segment}`, "marking", "box",
      segment % 2 ? CAMP_EMBER_COLORS.fadedYellow : CAMP_EMBER_COLORS.aviationWhite,
      28.2 * Math.cos(angle), 28.2 * Math.sin(angle), 0.319,
      4.8, 0.01, 0.5, -angle, true);
  }
  addFan("tlof-oil-shadow", "wear", CAMP_EMBER_COLORS.tyre,
    5.5, 5.8, 0.319, [[-1.6, -0.8], [0.2, -1.2], [1.8, -0.4], [1.2, 0.9], [-0.7, 1.0]]);

  // Windsock and signal mast sit outside the rotor safety area and off the protected centreline.
  // The yellow horizontal sock is intentionally broad enough to read from the 600 m gate.
  add("windsock-mast", "signal", "cylinder", CAMP_EMBER_COLORS.steel,
    49, -72, 6, 0.34, 12, 0.34, 0);
  add("windsock-arm", "signal", "box", CAMP_EMBER_COLORS.steel,
    49, -72, 12.05, 5.2, 0.18, 0.18, 0);
  add("windsock", "signal", "tent", CAMP_EMBER_COLORS.signalYellow,
    52.4, -72, 11.7, 4.8, 1.35, 1.15, Math.PI / 2);
  add("final-ident-panel", "signal", "box", CAMP_EMBER_COLORS.signalRed,
    -48, -74, 2.2, 5.4, 4.4, 0.25, 0);

  // Irregular 350 m laterite footprint: enough room for separated aviation functions while the
  // protected final and departure centreline stays completely open.
  const scarOutline = [
    [166, 8], [158, 72], [122, 132], [62, 164], [-8, 171], [-78, 156],
    [-136, 118], [-168, 56], [-171, -18], [-145, -92], [-92, -150],
    [-22, -169], [54, -160], [120, -126], [158, -66],
  ];
  addFan("scar-apron", "laterite", [0.55, 0.36, 0.22], 0, 0, 0.050, scarOutline);

  // Perimeter berm and service ring. Both ends of the final-course centreline are open: arrival
  // through -Z, rejected landing/departure through +Z.
  let bermIndex = 0;
  for (let i = 0; i < 48; i++) {
    const angle = (i / 48) * Math.PI * 2;
    const x = 164 * Math.cos(angle);
    const z = 164 * Math.sin(angle);
    if (Math.abs(x) < 30 && Math.abs(z) > 145) continue;
    add(`berm-${bermIndex++}`, "sandbag", "revetment",
      i % 2 ? CAMP_EMBER_COLORS.sandbagShade : CAMP_EMBER_COLORS.lateriteDark,
      x, z, 0.7, 3.4, 1.4, 12, -angle);
  }
  for (let i = 0; i < 24; i++) {
    const angle = (i / 24) * Math.PI * 2 + 0.08;
    add(`ring-road-${i}`, "laterite", "box", CAMP_EMBER_COLORS.laterite,
      138 * Math.cos(angle), 138 * Math.sin(angle), 0.134, 5.5, 0.012, 36, -angle, true);
  }

  // Eight open-front aircraft revetments give the ramp real capacity. Two align with the live
  // spare-airframe stations; the others read as occupied/available dispersal rather than clutter.
  const aircraftStations = [
    ...sparePads,
    { x: -112, z: 22 }, { x: -112, z: -28 }, { x: -88, z: 92 },
    { x: 112, z: -20 }, { x: 112, z: -70 }, { x: 78, z: -112 },
  ];
  aircraftStations.forEach(({ x, z }, stationIndex) => {
    if (stationIndex >= 2) addPad(`empty-${stationIndex}`, x, z, 22);
    add(`bird-revetment-${stationIndex}-back`, "sandbag", "revetment",
      CAMP_EMBER_COLORS.sandbagShade, x, z - 15, 0.7, 11, 1.4, 2.8, Math.PI / 2);
    for (const side of [-1, 1]) {
      for (const segment of [-1, 1]) {
        add(`bird-revetment-${stationIndex}-${side < 0 ? "left" : "right"}-${segment < 0 ? "rear" : "front"}`,
          "sandbag", "revetment", CAMP_EMBER_COLORS.sandbag,
          x + side * 7, z - 3 + segment * 5.5, 0.7, 2.8, 1.4, 11, 0);
      }
    }
  });

  // Maintenance and living areas are separated from POL and ammunition. Their access tracks
  // terminate at named operational areas, so none can read as the old random orange stripe.
  add("maintenance-apron", "laterite", "box", CAMP_EMBER_COLORS.lateriteDark,
    -92, 65, 0.16, 62, 0.014, 42, 0.08, true);
  add("maintenance-hangar", "hooch", "tent", CAMP_EMBER_COLORS.canvas,
    -103, 72, 4.5, 30, 9, 20, 0.08);
  add("maintenance-shop", "hooch", "tent", CAMP_EMBER_COLORS.tent,
    -72, 74, 2.8, 15, 5.6, 10, -0.05);
  const tents = [
    [-118, -82, 0.12], [-96, -104, -0.08], [-66, -120, 0.08],
    [70, 112, -0.16], [98, 94, 0.12], [124, 70, -0.10],
  ];
  tents.forEach(([x, z, yaw], index) => add(`tent-${index}`, "tent", "tent",
    index % 2 ? CAMP_EMBER_COLORS.canvas : CAMP_EMBER_COLORS.tent,
    x, z, 2.1, 10, 4.2, 7.5, yaw));

  // Revetted ammunition and POL live on opposite sides of the compound.
  [[-126, -48], [-126, -68], [-111.5, -78], [-100.5, -78]].forEach(([x, z], index) =>
    add(`ammo-revetment-${index}`, "sandbag", "revetment", CAMP_EMBER_COLORS.sandbagShade,
      x, z, 0.7, index >= 2 ? 11 : 2.8, 1.4, index >= 2 ? 2.8 : 12, 0));
  const ammoCrates = [[-122, -56], [-118, -56], [-122, -62], [-118, -62], [-114, -68]];
  ammoCrates.forEach(([x, z], index) => add(`ammo-crate-${index}`, "crate", "box",
    CAMP_EMBER_COLORS.crate, x, z, 0.65, 1.8, 1.3, 1.8, index * 0.04));
  [[128, 16], [128, 38], [102.5, 48], [114, 48]].forEach(([x, z], index) =>
    add(`fuel-revetment-${index}`, "sandbag", "revetment", CAMP_EMBER_COLORS.sandbag,
      x, z, 0.7, index >= 2 ? 11 : 2.8, 1.4, index >= 2 ? 2.8 : 12, 0));
  const drums = [[120, 25], [124, 25], [120, 30], [124, 30], [120, 35], [124, 35]];
  drums.forEach(([x, z], index) => add(`fuel-drum-${index}`, "fuel", "cylinder",
    index % 2 ? CAMP_EMBER_COLORS.rust : CAMP_EMBER_COLORS.fuel,
    x, z, 0.62, 0.92, 1.24, 0.92));
  [[86, 48], [91, 48], [96, 48], [86, 54], [91, 54], [96, 54]].forEach(
    ([x, z], index) => add(`supply-crate-${index}`, "crate", "box",
      CAMP_EMBER_COLORS.crate, x, z, 0.6, 1.8, 1.2, 1.8, index * 0.03),
  );

  // A legged timber watchtower and radio mast make Camp Ember identifiable on final.
  const towerX = -142;
  const towerZ = 18;
  [[-1.25, -1.25], [1.25, -1.25], [-1.25, 1.25], [1.25, 1.25]].forEach(
    ([dx, dz], index) => add(`tower-leg-${index}`, "timber", "box", CAMP_EMBER_COLORS.timber,
      towerX + dx, towerZ + dz, 3, 0.34, 6, 0.34, 0),
  );
  add("tower-platform", "timber", "box", CAMP_EMBER_COLORS.timber,
    towerX, towerZ, 6.15, 4.2, 0.3, 4.2, 0);
  add("tower-roof", "hooch", "tent", CAMP_EMBER_COLORS.canvas,
    towerX, towerZ, 7.25, 4.8, 1.9, 4.8, 0);
  add("radio-mast", "steel", "cylinder", CAMP_EMBER_COLORS.steel,
    142, 18, 9, 0.42, 18, 0.42, 0);
  add("radio-crossbar", "steel", "box", CAMP_EMBER_COLORS.rust,
    142, 18, 18.05, 3.2, 0.22, 0.22, 0.45);
  // Cross-braces and aerials give the two tall landmarks a readable silhouette against haze.
  for (const heightM of [3.0, 5.2]) {
    add(`tower-brace-a-${heightM}`, "timber", "box", CAMP_EMBER_COLORS.timber,
      towerX, towerZ - 1.3, heightM, 3.8, 0.18, 0.18, 0.72);
    add(`tower-brace-b-${heightM}`, "timber", "box", CAMP_EMBER_COLORS.timber,
      towerX, towerZ + 1.3, heightM, 3.8, 0.18, 0.18, -0.72);
  }
  [5.5, 10.5, 15.5].forEach((heightM, spreaderIndex) => {
    add(`radio-spreader-${heightM}`, "steel", "box", CAMP_EMBER_COLORS.steel,
      142, 18, heightM, 4.4, 0.12, 0.12, spreaderIndex % 2 ? -0.45 : 0.45);
  });
  add("radio-whip", "steel", "cylinder", CAMP_EMBER_COLORS.steel,
    142, 18, 21.5, 0.14, 7, 0.14, 0);

  // Three compact support vehicles create familiar scale around the maintenance and POL areas.
  // Their simple sub-parts read as trucks from a helicopter but stay cheap in the merged mesh.
  [[-78, 52, 0.08], [-112, 46, -0.12], [108, 72, 0.18]].forEach(
    ([truckX, truckZ, truckYaw], truckIndex) => {
      add(`truck-${truckIndex}-bed`, "vehicle", "box", CAMP_EMBER_COLORS.oliveDrab,
        truckX, truckZ, 1.0, 5.8, 1.2, 2.35, truckYaw);
      add(`truck-${truckIndex}-cab`, "vehicle", "box", CAMP_EMBER_COLORS.oliveHighlight,
        truckX + Math.cos(truckYaw) * 2.2, truckZ + Math.sin(truckYaw) * 2.2,
        1.35, 1.8, 1.9, 2.25, truckYaw);
      for (const side of [-1, 1]) {
        for (const axle of [-1.8, 1.8]) {
          add(`truck-${truckIndex}-wheel-${side}-${axle}`, "vehicle", "box",
            CAMP_EMBER_COLORS.tyre,
            truckX + Math.cos(truckYaw) * axle - Math.sin(truckYaw) * side * 1.22,
            truckZ + Math.sin(truckYaw) * axle + Math.cos(truckYaw) * side * 1.22,
            0.48, 0.72, 0.72, 0.32, truckYaw);
        }
      }
    },
  );

  // Rosette fighting positions, bunker mounds and defoliated perimeter make the FSB readable
  // from altitude without encroaching on helicopter operating surfaces.
  const rosettes = [[-138, 88], [136, 92]];
  rosettes.forEach(([rx, rz], rosetteIndex) => {
    const pitOutline = [];
    for (let i = 0; i < 8; i++) {
      const angle = (i / 8) * Math.PI * 2;
      pitOutline.push([4.6 * Math.cos(angle), 4.6 * Math.sin(angle)]);
    }
    addFan(`rosette-${rosetteIndex}-pit`, "laterite", CAMP_EMBER_COLORS.lateriteDark,
      rx, rz, 0.095, pitOutline);
    for (let lobe = 0; lobe < 6; lobe++) {
      const angle = (lobe / 6) * Math.PI * 2 + rosetteIndex * 0.4;
      add(`rosette-${rosetteIndex}-lobe-${lobe}`, "sandbag", "revetment",
        lobe % 2 ? CAMP_EMBER_COLORS.sandbag : CAMP_EMBER_COLORS.sandbagShade,
        rx + 5.6 * Math.cos(angle), rz + 5.6 * Math.sin(angle),
        0.5, 2.2, 1.0, 4.4, -angle + Math.PI / 2);
    }
  });

  // Burn scars (Granite's black blobs).
  const burnOutline = (radiusM) => {
    const outline = [];
    for (let i = 0; i < 9; i++) {
      const angle = (i / 9) * Math.PI * 2;
      const wobble = 1 + 0.35 * Math.sin(angle * 3 + radiusM);
      outline.push([radiusM * wobble * Math.cos(angle), radiusM * wobble * Math.sin(angle)]);
    }
    return outline;
  };
  addFan("burn-0", "burn", [0.09, 0.08, 0.07], 88, -142, 0.095, burnOutline(8));
  addFan("burn-1", "burn", [0.11, 0.10, 0.08], -55, 132, 0.095, burnOutline(6));

  // Bunker mounds on the berm's inner face: sandbag sides, glinting PSP roofs (A Shau).
  const bunkers = [[112, 116, 0.3], [-118, 112, -0.2], [118, -116, 0.1], [-112, -118, -0.1]];
  bunkers.forEach(([bx, bz, byaw], bunkerIndex) => {
    add(`bunker-${bunkerIndex}`, "bunker", "box", CAMP_EMBER_COLORS.sandbagShade,
      bx, bz, 0.7, 4.6, 1.4, 3.6, byaw);
    add(`bunker-${bunkerIndex}-roof`, "bunker", "box", CAMP_EMBER_COLORS.pspLight,
      bx, bz, 1.5, 5.2, 0.18, 4.2, byaw);
  });

  // Defoliated fringe accents: bare gray-brown poles where the jungle used to be.
  const deadTrees = [[172, -42], [168, 64], [-172, -54], [-164, 78], [66, -172], [-88, -158]];
  deadTrees.forEach(([tx, tz], treeIndex) => {
    add(`deadtree-${treeIndex}`, "deadtree", "cylinder", [0.30, 0.27, 0.22],
      tx, tz, 3.4, 0.4, 6.8, 0.4, 0);
  });

  return parts;
}

function triangularPrismGeometry(THREE) {
  const positions = new Float32Array([
    // front / back
    -0.5, -0.5, -0.5, 0, 0.5, -0.5, 0.5, -0.5, -0.5,
    0.5, -0.5, 0.5, 0, 0.5, 0.5, -0.5, -0.5, 0.5,
    // floor
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, -0.5, 0.5,
    -0.5, -0.5, -0.5, 0.5, -0.5, 0.5, -0.5, -0.5, 0.5,
    // left and right roof slopes
    -0.5, -0.5, 0.5, 0, 0.5, 0.5, 0, 0.5, -0.5,
    -0.5, -0.5, 0.5, 0, 0.5, -0.5, -0.5, -0.5, -0.5,
    0.5, -0.5, -0.5, 0, 0.5, -0.5, 0, 0.5, 0.5,
    0.5, -0.5, -0.5, 0, 0.5, 0.5, 0.5, -0.5, 0.5,
  ]);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function revetmentGeometry(THREE) {
  const bottom = 0.5;
  const topX = 0.36;
  const topZ = 0.40;
  const vertices = [
    [-bottom, -0.5, -bottom], [bottom, -0.5, -bottom],
    [bottom, -0.5, bottom], [-bottom, -0.5, bottom],
    [-topX, 0.5, -topZ], [topX, 0.5, -topZ],
    [topX, 0.5, topZ], [-topX, 0.5, topZ],
  ];
  const faces = [
    [0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7],
    [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5],
    [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7],
  ];
  const positions = new Float32Array(faces.flatMap((face) => face.flatMap((index) => vertices[index])));
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function fanGeometry(THREE, outline) {
  // A flat, upward-facing triangle fan over an authored irregular outline, in metres.
  // Surface parts only: the caller keeps these at or below the terrain-seated plates.
  const positions = new Float32Array(outline.length * 9);
  for (let index = 0; index < outline.length; index++) {
    const [ax, az] = outline[index];
    const [bx, bz] = outline[(index + 1) % outline.length];
    positions.set([0, 0, 0, ax, 0, az, bx, 0, bz], index * 9);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.computeVertexNormals();
  return geometry;
}

function partGeometryWithColor(THREE, part) {
  let geometry;
  if (part.shape === "tent") geometry = triangularPrismGeometry(THREE);
  else if (part.shape === "revetment") geometry = revetmentGeometry(THREE);
  else if (part.shape === "cylinder") geometry = new THREE.CylinderGeometry(0.5, 0.5, 1, 8, 1);
  else if (part.shape === "fan") geometry = fanGeometry(THREE, part.outline);
  else geometry = new THREE.BoxGeometry(1, 1, 1);
  if (typeof geometry.toNonIndexed === "function") {
    if (geometry.index) {
      const nonIndexed = geometry.toNonIndexed();
      geometry.dispose?.();
      geometry = nonIndexed;
    }
  }
  const count = geometry.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let index = 0; index < count; index++) {
    colors[index * 3] = part.color[0];
    colors[index * 3 + 1] = part.color[1];
    colors[index * 3 + 2] = part.color[2];
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  // Every authored vertical value is explicitly `centreY`. The old implicit `y` mixed centre and
  // base semantics, then a base-anchor translation floated props by half their height.
  geometry.scale(part.widthM, part.heightM, part.depthM);
  if (part.yaw) geometry.rotateY(part.yaw);
  geometry.translate(part.x, part.centreY, part.z);
  return geometry;
}

function mergeGeometries(THREE, geometries) {
  // Prefer upstream util when present; otherwise concatenate attributes.
  const util = THREE.BufferGeometryUtils?.mergeGeometries
    ?? globalThis.THREE?.BufferGeometryUtils?.mergeGeometries;
  if (typeof util === "function") {
    return util(geometries, false);
  }
  let total = 0;
  for (const geometry of geometries) total += geometry.getAttribute("position").count;
  const positions = new Float32Array(total * 3);
  const colors = new Float32Array(total * 3);
  const normals = new Float32Array(total * 3);
  let cursor = 0;
  for (const geometry of geometries) {
    const pos = geometry.getAttribute("position");
    const col = geometry.getAttribute("color");
    const nor = geometry.getAttribute("normal");
    for (let index = 0; index < pos.count; index++) {
      positions[(cursor + index) * 3] = pos.getX(index);
      positions[(cursor + index) * 3 + 1] = pos.getY(index);
      positions[(cursor + index) * 3 + 2] = pos.getZ(index);
      colors[(cursor + index) * 3] = col.getX(index);
      colors[(cursor + index) * 3 + 1] = col.getY(index);
      colors[(cursor + index) * 3 + 2] = col.getZ(index);
      if (nor) {
        normals[(cursor + index) * 3] = nor.getX(index);
        normals[(cursor + index) * 3 + 1] = nor.getY(index);
        normals[(cursor + index) * 3 + 2] = nor.getZ(index);
      }
    }
    cursor += pos.count;
    geometry.dispose?.();
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  merged.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  merged.setAttribute("normal", new THREE.BufferAttribute(normals, 3));
  return merged;
}

/**
 * @returns {{ group: object, mesh: object, partCount: number, families: string[], drawCalls: number, triangles: number, resources: object } | null}
 */
export function createCampEmberFirebase(THREE, plan) {
  const anchor = campEmberAnchor(plan);
  if (!anchor) return null;
  const parts = campEmberFirebaseParts();
  const geometries = parts.map((part) => partGeometryWithColor(THREE, part));
  let rangeStart = 0;
  const partVertexRanges = geometries.map((geometry, index) => {
    const count = geometry.getAttribute("position").count;
    const range = Object.freeze({
      id: parts[index].id,
      start: rangeStart,
      count,
    });
    rangeStart += count;
    return range;
  });
  const geometry = mergeGeometries(THREE, geometries);
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.06,
    // The lab has no IBL. A tiny warm earth bounce keeps the one merged camp mesh readable when
    // the shared low sun puts the whole firebase on its shadow side.
    emissive: 0x080604,
    emissiveIntensity: 0.42,
    flatShading: true,
    // The terrain-seated plates live millimetres from the rendered basin; at a 32 km far
    // plane a real GPU's depth buffer cannot separate them and the whole pad shimmers
    // under a moving eye (owner: "super flickery"). The standard decal fix: bias the
    // merged firebase toward the camera in depth. SwiftShader-based probes mask this
    // artifact, so do not "prove" it fixed with a headless capture alone.
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -2,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "CAMP_EMBER_FIREBASE";
  // Seat the camp on the RECESSED drawn ground, not the simulated apron. The stack above was
  // re-authored with real thickness so its surfaces stop sharing depth samples; if the anchor
  // stayed at simulated height that thickness would push the PSP plate 30 cm above where the
  // skids touch and the aircraft would look sunk into its own pad. Anchor down by the recess,
  // stack up by the recess: contact height is preserved exactly.
  mesh.position.set(
    anchor.eastM,
    anchor.groundY - CAMP_EMBER_DRAWN_RECESS_M,
    -anchor.northM,
  );
  mesh.rotation.y = CAMP_EMBER_DEPARTURE_YAW_RAD;
  // One merged draw with real vertical mass: Camp Ember should sit on the basin under the same
  // cast-shadow policy as the other landmark silhouettes.
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const tag = Object.freeze({
    schema: CAMP_EMBER_FIREBASE_SCHEMA,
    role: "camp-ember-firebase",
    presentationOnly: true,
    authoritative: false,
    collisionSource: false,
    targetSource: false,
    targetable: false,
    landmarkId: CAMP_EMBER_LANDMARK_ID,
    partCount: parts.length,
  });
  mesh.userData.cobraCanyon = tag;

  const group = new THREE.Group();
  group.name = "CAMP_EMBER_FIREBASE_ROOT";
  group.userData.cobraCanyon = tag;
  group.castShadow = false;
  group.add(mesh);

  const positionCount = geometry.getAttribute("position").count;
  return {
    group,
    mesh,
    partCount: parts.length,
    partVertexRanges: Object.freeze(partVertexRanges),
    families: [...new Set(parts.map((part) => part.family))],
    drawCalls: 1,
    triangles: Math.floor(positionCount / 3),
    resources: {
      geometries: [geometry],
      materials: [material],
      meshes: [mesh],
    },
  };
}

export function isCampEmberGroundSite(site) {
  const landmarkId = String(site?.landmark_id ?? site?.landmarkId ?? "");
  const id = String(site?.id ?? "");
  return landmarkId.includes("camp-ember") || id.includes("camp-ember");
}
