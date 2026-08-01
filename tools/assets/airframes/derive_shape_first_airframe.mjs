import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const G0 = 9.80665;
const AIR_GAS_CONSTANT = 287.05287;
const AIR_GAMMA = 1.4;
const EARTH_GEOPOTENTIAL_RADIUS_M = 6_356_766;
const SUTHERLAND_REFERENCE_K = 273.15;
const SUTHERLAND_REFERENCE_VISCOSITY_PA_S = 1.716e-5;
const SUTHERLAND_CONSTANT_K = 110.4;

const FORBIDDEN_DERIVED_KEYS = new Set([
  "dimensionsM",
  "areaM2",
  "aspectRatio",
  "meanAerodynamicChordM",
  "wettedAreaM2",
  "enclosedVolumeM3",
  "frontalAreaM2",
  "ramCaptureAreaM2",
  "massKg",
  "fuelCapacityKg",
  "grossMassKg",
  "cgM",
  "inertiaKgM2",
  "thermalAreaM2",
]);

function finite(value, label) {
  if (!Number.isFinite(value)) throw new TypeError(`${label} must be finite`);
  return value;
}

function positive(value, label, allowZero = false) {
  finite(value, label);
  if (allowZero ? value < 0 : value <= 0) {
    throw new RangeError(`${label} must be ${allowZero ? "non-negative" : "positive"}`);
  }
  return value;
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function addToMap(map, key, value) {
  map.set(key, (map.get(key) ?? 0) + value);
}

function ellipsePerimeter(rx, ry) {
  if (rx <= 0 || ry <= 0) return 0;
  const h = ((rx - ry) ** 2) / ((rx + ry) ** 2);
  return Math.PI * (rx + ry) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
}

function polygonAreaCentroid(points) {
  let twiceArea = 0;
  let cxNumerator = 0;
  let cyNumerator = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current[0] * next[1] - next[0] * current[1];
    twiceArea += cross;
    cxNumerator += (current[0] + next[0]) * cross;
    cyNumerator += (current[1] + next[1]) * cross;
  }
  const signedArea = twiceArea / 2;
  if (Math.abs(signedArea) < 1e-12) throw new RangeError("polygon has zero area");
  return {
    area: Math.abs(signedArea),
    centroid: [
      cxNumerator / (6 * signedArea),
      cyNumerator / (6 * signedArea),
    ],
  };
}

function polygonPerimeter(points) {
  let result = 0;
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    result += Math.hypot(next[0] - current[0], next[1] - current[1]);
  }
  return result;
}

function materialMaps(definition) {
  const materials = new Map();
  for (const material of definition.materials) {
    if (materials.has(material.id)) throw new Error(`duplicate material ${material.id}`);
    positive(material.densityKgM3, `material ${material.id} density`);
    positive(material.maximumServiceTemperatureK,
      `material ${material.id} maximumServiceTemperatureK`);
    materials.set(material.id, material);
  }
  const zones = new Map();
  for (const zone of definition.thermalModel.zones) {
    if (zones.has(zone.id)) throw new Error(`duplicate thermal zone ${zone.id}`);
    if (!materials.has(zone.materialId)) {
      throw new Error(`thermal zone ${zone.id} uses missing material ${zone.materialId}`);
    }
    if (!["recovery", "stagnation"].includes(zone.temperatureBasis)) {
      throw new Error(`thermal zone ${zone.id} has invalid temperature basis`);
    }
    positive(zone.adiabaticRiseFraction,
      `thermal zone ${zone.id} adiabaticRiseFraction`);
    if (zone.adiabaticRiseFraction > 1) {
      throw new RangeError(`thermal zone ${zone.id} adiabaticRiseFraction exceeds one`);
    }
    zones.set(zone.id, zone);
  }
  return { materials, zones };
}

function findForbiddenKey(value, path = "definition") {
  if (!value || typeof value !== "object") return null;
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findForbiddenKey(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_DERIVED_KEYS.has(key)) return `${path}.${key}`;
    const found = findForbiddenKey(child, `${path}.${key}`);
    if (found) return found;
  }
  return null;
}

const PROPULSION_PACKAGE_SHAPE = "propulsion-package-cylinder-z";

function turbinePackageContract(definition) {
  const authored = definition.propulsionModel?.turbineCore?.package;
  const coreDiameterM = positive(authored?.coreDiameterM, "turbine package core diameter");
  const coreLengthM = positive(authored?.coreLengthM, "turbine package core length");
  const structuralRadialClearanceM = positive(
    authored?.minimumStructuralRadialClearanceM,
    "turbine package structural radial clearance",
  );
  const thermalRadialClearanceM = positive(
    authored?.minimumThermalRadialClearanceM,
    "turbine package thermal radial clearance",
  );
  const foreClearanceM = positive(authored?.foreClearanceM,
    "turbine package fore clearance");
  const aftClearanceM = positive(authored?.aftClearanceM,
    "turbine package aft clearance");
  const minimumFireBulkheadGapM = positive(authored?.minimumFireBulkheadGapM,
    "turbine package fire-bulkhead gap");
  if (!Array.isArray(authored?.axisCenterM) || authored.axisCenterM.length !== 3) {
    throw new TypeError("turbine package axisCenterM must be a three-vector");
  }
  const axisCenterM = authored.axisCenterM.map((value, axis) =>
    finite(value, `turbine package axis ${axis}`));
  const coreRadiusM = coreDiameterM / 2;
  const envelopeRadiusM = coreRadiusM
    + structuralRadialClearanceM + thermalRadialClearanceM;
  const envelopeLengthM = coreLengthM + foreClearanceM + aftClearanceM;
  return {
    authored,
    coreDiameterM,
    coreRadiusM,
    coreLengthM,
    structuralRadialClearanceM,
    thermalRadialClearanceM,
    foreClearanceM,
    aftClearanceM,
    minimumFireBulkheadGapM,
    axisCenterM,
    envelopeRadiusM,
    envelopeDiameterM: 2 * envelopeRadiusM,
    envelopeLengthM,
    coreMinZM: axisCenterM[2] - coreLengthM / 2,
    coreMaxZM: axisCenterM[2] + coreLengthM / 2,
    envelopeMinZM: axisCenterM[2] - envelopeLengthM / 2,
    envelopeMaxZM: axisCenterM[2] + envelopeLengthM / 2,
  };
}

function boxGeometry(volume) {
  if (!Array.isArray(volume.centerM) || volume.centerM.length !== 3
      || !Array.isArray(volume.sizeM) || volume.sizeM.length !== 3) {
    throw new TypeError(`internal volume ${volume.id} must have centerM and sizeM three-vectors`);
  }
  const centerM = volume.centerM.map((value, axis) =>
    finite(value, `${volume.id} center axis ${axis}`));
  const sizeM = volume.sizeM.map((value, axis) =>
    positive(value, `${volume.id} size axis ${axis}`));
  return {
    shape: "box",
    centerM,
    sizeM,
    minM: centerM.map((value, axis) => value - sizeM[axis] / 2),
    maxM: centerM.map((value, axis) => value + sizeM[axis] / 2),
    volumeM3: sizeM[0] * sizeM[1] * sizeM[2],
    variances: {
      x: sizeM[0] ** 2 / 12,
      y: sizeM[1] ** 2 / 12,
      z: sizeM[2] ** 2 / 12,
    },
  };
}

function internalVolumeGeometry(definition, volume) {
  positive(volume.effectiveDensityKgM3, `${volume.id} effective density`);
  if (volume.shape !== PROPULSION_PACKAGE_SHAPE) return boxGeometry(volume);
  const contract = turbinePackageContract(definition);
  if (volume.packageRef !== "propulsionModel.turbineCore.package") {
    throw new Error(`internal volume ${volume.id} must reference the turbine package contract`);
  }
  if (!Array.isArray(volume.centerM) || volume.centerM.length !== 3
      || volume.centerM.some((value, axis) =>
        Math.abs(value - contract.axisCenterM[axis]) > 1e-12)) {
    throw new Error(`internal volume ${volume.id} center must match the turbine package axis`);
  }
  return {
    shape: PROPULSION_PACKAGE_SHAPE,
    centerM: [...contract.axisCenterM],
    radiusM: contract.envelopeRadiusM,
    lengthM: contract.envelopeLengthM,
    minM: [
      contract.axisCenterM[0] - contract.envelopeRadiusM,
      contract.axisCenterM[1] - contract.envelopeRadiusM,
      contract.envelopeMinZM,
    ],
    maxM: [
      contract.axisCenterM[0] + contract.envelopeRadiusM,
      contract.axisCenterM[1] + contract.envelopeRadiusM,
      contract.envelopeMaxZM,
    ],
    volumeM3: Math.PI * contract.envelopeRadiusM ** 2 * contract.envelopeLengthM,
    variances: {
      x: contract.envelopeRadiusM ** 2 / 4,
      y: contract.envelopeRadiusM ** 2 / 4,
      z: contract.envelopeLengthM ** 2 / 12,
    },
  };
}

function overlapsStrictly(minA, maxA, minB, maxB) {
  return Math.min(maxA, maxB) - Math.max(minA, minB) > 1e-9;
}

function boxesIntersect(a, b) {
  return [0, 1, 2].every((axis) =>
    overlapsStrictly(a.minM[axis], a.maxM[axis], b.minM[axis], b.maxM[axis]));
}

function propulsionCylinderIntersectsBox(cylinder, box) {
  if (!overlapsStrictly(cylinder.minM[2], cylinder.maxM[2], box.minM[2], box.maxM[2])) {
    return false;
  }
  const nearestX = Math.max(box.minM[0], Math.min(cylinder.centerM[0], box.maxM[0]));
  const nearestY = Math.max(box.minM[1], Math.min(cylinder.centerM[1], box.maxM[1]));
  return (nearestX - cylinder.centerM[0]) ** 2
    + (nearestY - cylinder.centerM[1]) ** 2 < cylinder.radiusM ** 2 - 1e-12;
}

function exactTunnelCrossSections(definition, contract) {
  const tunnel = definition.geometry.bodies.find(
    (candidate) => candidate.id === contract.authored.tunnelBodyId);
  if (!tunnel) throw new Error("turbine package references a missing propulsion tunnel");
  if (tunnel.massModel?.internalEffectiveDensityKgM3 !== 0
      || tunnel.massModel?.fuelVolumeFraction !== 0) {
    throw new Error("propulsion tunnel interior must remain empty; explicit hardware owns its mass");
  }
  const shellThicknessM = positive(tunnel.massModel?.shellThicknessM,
    "propulsion tunnel shell thickness");
  const requiredZM = [
    contract.envelopeMinZM,
    contract.coreMinZM,
    contract.axisCenterM[2],
    contract.coreMaxZM,
    contract.envelopeMaxZM,
  ];
  return requiredZM.map((zM) => {
    const station = tunnel.stations.find(
      (candidate) => Math.abs(candidate.zM - zM) <= 1e-9);
    if (!station) {
      throw new Error(`propulsion tunnel requires an exact package cross-section at z=${zM}`);
    }
    const innerRadiusXM = station.radiusXM - shellThicknessM;
    const innerRadiusYM = station.radiusYM - shellThicknessM;
    positive(innerRadiusXM, `propulsion tunnel inner x radius at z=${zM}`);
    positive(innerRadiusYM, `propulsion tunnel inner y radius at z=${zM}`);
    let maximumEllipseEquation = 0;
    for (let step = 0; step < 360; step += 1) {
      const angle = 2 * Math.PI * step / 360;
      const xM = contract.axisCenterM[0] + contract.envelopeRadiusM * Math.cos(angle);
      const yM = contract.axisCenterM[1] + contract.envelopeRadiusM * Math.sin(angle);
      maximumEllipseEquation = Math.max(maximumEllipseEquation,
        (xM / innerRadiusXM) ** 2
          + ((yM - station.centerYM) / innerRadiusYM) ** 2);
    }
    if (maximumEllipseEquation > 1 + 1e-12) {
      throw new Error(`turbine package breaches propulsion tunnel inner wall at z=${zM}`);
    }
    return {
      zM,
      centerYM: station.centerYM,
      outerRadiusXM: station.radiusXM,
      outerRadiusYM: station.radiusYM,
      innerRadiusXM,
      innerRadiusYM,
      radialClearanceM: Math.min(innerRadiusXM, innerRadiusYM)
        - contract.envelopeRadiusM,
      clearCoannularAreaM2: Math.PI
        * (innerRadiusXM * innerRadiusYM - contract.envelopeRadiusM ** 2),
      maximumPackageEllipseEquation: maximumEllipseEquation,
    };
  });
}

function assertPropulsionPackaging(definition) {
  const architecture = definition.propulsionModel?.flowpathArchitecture;
  if (definition.propulsionModel?.kind
      !== "single-inlet-coannular-variable-cycle-turbo-ramjet-surrogate"
      || architecture?.kind !== "single-inlet-coannular-variable-cycle-shared-nozzle") {
    throw new Error("Rapier propulsion must remain one inlet, co-annular flowpaths, and one nozzle");
  }
  positive(architecture?.minimumTotalPressureRecoveryFraction,
    "minimum total-pressure recovery fraction");
  if (architecture.minimumTotalPressureRecoveryFraction > 1) {
    throw new RangeError("minimum total-pressure recovery fraction cannot exceed one");
  }
  if (architecture.epistemic !== "provisional-fictional-integration") {
    throw new Error("co-annular integration must remain explicitly provisional");
  }

  const contract = turbinePackageContract(definition);
  const volumes = definition.geometry.internalVolumes ?? [];
  const ids = new Set();
  const geometries = [];
  for (const volume of volumes) {
    if (ids.has(volume.id)) throw new Error(`duplicate internal volume ${volume.id}`);
    ids.add(volume.id);
    geometries.push({ volume, geometry: internalVolumeGeometry(definition, volume) });
  }
  const packageEntry = geometries.find(
    ({ volume }) => volume.id === contract.authored.internalVolumeId);
  if (!packageEntry || packageEntry.geometry.shape !== PROPULSION_PACKAGE_SHAPE) {
    throw new Error("turbine package must own one explicit cylindrical internal volume");
  }
  const capsuleEntry = geometries.find(
    ({ volume }) => volume.id === "buried-reclined-escape-capsule");
  if (!capsuleEntry || capsuleEntry.geometry.shape !== "box") {
    throw new Error("turbine package fire gap requires the buried capsule volume");
  }
  const fireBulkheadGapM = contract.envelopeMinZM - capsuleEntry.geometry.maxM[2];
  if (fireBulkheadGapM + 1e-12 < contract.minimumFireBulkheadGapM) {
    throw new Error("turbine package violates the capsule fire-bulkhead gap");
  }

  exactTunnelCrossSections(definition, contract);
  for (const entry of geometries) {
    if (entry === packageEntry) continue;
    if (propulsionCylinderIntersectsBox(packageEntry.geometry, entry.geometry)) {
      throw new Error(`turbine package intersects internal volume ${entry.volume.id}`);
    }
  }
  const boxes = geometries.filter(({ geometry }) => geometry.shape === "box");
  for (let a = 0; a < boxes.length; a += 1) {
    for (let b = a + 1; b < boxes.length; b += 1) {
      if (boxesIntersect(boxes[a].geometry, boxes[b].geometry)) {
        throw new Error(
          `internal volumes ${boxes[a].volume.id} and ${boxes[b].volume.id} intersect`,
        );
      }
    }
  }
  if (definition.geometry.inlet?.kind !== "single-ventral-ellipse"
      || definition.geometry.exhaust?.kind !== "single-fixed-circular-nozzle") {
    throw new Error("co-annular architecture requires one ventral inlet and one fixed nozzle");
  }
}

export function assertShapeFirstDefinition(definition) {
  if (!definition || typeof definition !== "object") {
    throw new TypeError("shape-first definition must be an object");
  }
  if (definition.schema !== "guns-only.shape-first-airframe-definition.v1") {
    throw new Error("unsupported shape-first airframe schema");
  }
  if (definition.authority?.geometryIsCanonical !== true) {
    throw new Error("definition must declare geometryIsCanonical");
  }
  if (typeof definition.authority?.runtimeBinding !== "string"
      || !definition.authority.runtimeBinding.startsWith("FlightModel.")) {
    throw new Error("shape authority requires an explicit FlightModel runtime binding");
  }
  const forbidden = findForbiddenKey(definition);
  if (forbidden) throw new Error(`hand-authored derived output is forbidden at ${forbidden}`);

  const runway = definition.fixedRequirements?.recoverySite;
  positive(runway?.runwayLengthM, "recovery runway length");
  finite(runway?.arrestorStationM, "recovery arrestor station");
  if (Math.abs(runway.arrestorStationM - runway.runwayLengthM / 2) > 1e-9) {
    throw new Error("arrestor must be at the exact runway midpoint");
  }
  if (definition.fixedRequirements?.launch?.mode !== "catapult") {
    throw new Error("Rapier v2 launch requirement must remain catapult");
  }
  const mission = definition.fixedRequirements?.baselineMission;
  if (mission?.target !== "high-altitude-balloon"
      || mission?.weapon !== "internal-gun"
      || mission?.droneCount !== 0) {
    throw new Error("baseline mission must be a no-drone gun-only balloon intercept");
  }

  const turbine = definition.propulsionModel?.turbineCore;
  positive(turbine?.seaLevelStaticDryThrustN,
    "turbine sea-level static dry thrust");
  positive(turbine?.maximumAugmentedThrustRatio,
    "turbine maximum augmented thrust ratio");
  if (turbine.maximumAugmentedThrustRatio < 1) {
    throw new RangeError("turbine maximum augmented thrust ratio must be at least one");
  }
  positive(turbine?.fadeStartMach, "turbine fade start Mach");
  positive(turbine?.fadeCompleteMach, "turbine fade complete Mach");
  if (turbine.fadeCompleteMach <= turbine.fadeStartMach) {
    throw new RangeError("turbine fade complete Mach must exceed fade start Mach");
  }
  const fuel = turbine?.fuelFlowAnchorsLbPerMinute;
  positive(fuel?.idle, "turbine idle fuel flow");
  positive(fuel?.military, "turbine military fuel flow");
  positive(fuel?.augmented, "turbine augmented fuel flow");
  if (!(fuel.idle < fuel.military && fuel.military < fuel.augmented)) {
    throw new RangeError("turbine fuel anchors must increase idle < military < augmented");
  }
  if (turbine.augmentationAppliesTo !== "turbine-stream-only") {
    throw new Error("augmentation must apply to the turbine stream only");
  }

  const inlet = definition.geometry?.inlet;
  finite(inlet?.designFlowIncidenceDeg, "inlet design-flow incidence");
  if (Math.abs(inlet.designFlowIncidenceDeg) > 45) {
    throw new RangeError("inlet design-flow incidence must remain within +/-45 degrees");
  }
  finite(inlet?.boundaryLayerBlockageFraction, "inlet boundary-layer blockage");
  if (inlet.boundaryLayerBlockageFraction < 0
      || inlet.boundaryLayerBlockageFraction >= 1) {
    throw new RangeError("inlet boundary-layer blockage must be in [0, 1)");
  }
  const inletFlow = inlet?.offDesignFlowModel;
  positive(inletFlow?.ramRegimeStartMach, "inlet ram-regime start Mach");
  positive(inletFlow?.unstartTripDeviationRad, "inlet unstart trip deviation");
  positive(inletFlow?.unstartClearDeviationRad, "inlet unstart clear deviation");
  if (inletFlow.unstartClearDeviationRad >= inletFlow.unstartTripDeviationRad) {
    throw new RangeError("inlet unstart clear deviation must be below trip deviation");
  }
  positive(inletFlow?.unstartRecoveryFloor, "inlet unstart recovery floor");
  if (inletFlow.unstartRecoveryFloor > 1) {
    throw new RangeError("inlet unstart recovery floor cannot exceed one");
  }
  positive(inletFlow?.characteristicAngleAtRamStartRad,
    "inlet characteristic angle at ram start");
  positive(inletFlow?.characteristicAngleDecreaseRadPerMach,
    "inlet characteristic-angle decrease", true);
  positive(inletFlow?.minimumCharacteristicAngleRad,
    "inlet minimum characteristic angle");
  if (inletFlow.minimumCharacteristicAngleRad
      > inletFlow.characteristicAngleAtRamStartRad) {
    throw new RangeError("inlet minimum characteristic angle exceeds its ram-start value");
  }
  positive(inletFlow?.onsetBlendMach, "inlet recovery onset blend");

  const wing = definition.geometry?.wing;
  if (!Array.isArray(wing?.halfStations) || wing.halfStations.length < 3) {
    throw new Error("geometry.wing.halfStations requires at least three stations");
  }
  let previousX = -Infinity;
  for (const [index, station] of wing.halfStations.entries()) {
    finite(station.xM, `wing station ${index} xM`);
    finite(station.leadingZM, `wing station ${index} leadingZM`);
    finite(station.trailingZM, `wing station ${index} trailingZM`);
    positive(station.thicknessM, `wing station ${index} thicknessM`);
    if (station.xM <= previousX) throw new Error("wing stations must increase outboard");
    if (station.trailingZM < station.leadingZM) {
      throw new Error(`wing station ${index} has negative chord`);
    }
    previousX = station.xM;
  }
  if (Math.abs(wing.halfStations[0].xM) > 1e-12) {
    throw new Error("first wing station must be on centreline");
  }

  if (!Array.isArray(definition.geometry?.bodies)
      || definition.geometry.bodies.length === 0) {
    throw new Error("at least one exterior body loft is required");
  }
  for (const body of definition.geometry.bodies) {
    if (!Array.isArray(body.stations) || body.stations.length < 2) {
      throw new Error(`body ${body.id} requires at least two stations`);
    }
    if (body.segmentThermalZoneIds?.length !== body.stations.length - 1) {
      throw new Error(`body ${body.id} requires one thermal zone per loft segment`);
    }
    let previousZ = -Infinity;
    for (const station of body.stations) {
      if (station.zM <= previousZ) throw new Error(`body ${body.id} stations must increase in z`);
      positive(station.radiusXM, `body ${body.id} radiusXM`);
      positive(station.radiusYM, `body ${body.id} radiusYM`);
      previousZ = station.zM;
    }
  }
  assertPropulsionPackaging(definition);
  materialMaps(definition);
  return definition;
}

export function deriveWingOutline(wing) {
  const leading = wing.halfStations.map((station) => [station.xM, station.leadingZM]);
  const trailing = [...wing.halfStations]
    .reverse()
    .map((station) => [station.xM, station.trailingZM]);
  const rightHalf = [...leading, ...trailing];
  const leftHalf = rightHalf
    .filter(([x]) => x > 1e-12)
    .reverse()
    .map(([x, z]) => [-x, z]);
  return [...rightHalf, ...leftHalf];
}

function deriveWing(definition, maps, massElements, fuelElements, thermalAreas) {
  const wing = definition.geometry.wing;
  const stations = wing.halfStations;
  let halfArea = 0;
  let halfChordSquaredIntegral = 0;
  let halfFirstMomentZ = 0;
  let solidVolumeM3 = 0;
  let panelAreaM2 = 0;
  let leadingEdgeAreaM2 = 0;
  let trailingEdgeAreaM2 = 0;
  let leadingLengthM = 0;
  let trailingLengthM = 0;

  const panelZone = maps.zones.get(wing.surfaceZones.panel);
  const leadingZone = maps.zones.get(wing.surfaceZones.leadingEdge);
  const trailingZone = maps.zones.get(wing.surfaceZones.trailingEdge);
  if (!panelZone || !leadingZone || !trailingZone) {
    throw new Error("wing references an unknown thermal zone");
  }
  const panelMaterial = maps.materials.get(panelZone.materialId);
  const leadingMaterial = maps.materials.get(leadingZone.materialId);
  const trailingMaterial = maps.materials.get(trailingZone.materialId);

  for (let index = 0; index < stations.length - 1; index += 1) {
    const a = stations[index];
    const b = stations[index + 1];
    const dx = b.xM - a.xM;
    const chordA = a.trailingZM - a.leadingZM;
    const chordB = b.trailingZM - b.leadingZM;
    halfArea += dx * (chordA + chordB) / 2;
    halfChordSquaredIntegral += dx
      * (chordA ** 2 + chordA * chordB + chordB ** 2) / 3;
    const zA = (a.leadingZM + a.trailingZM) / 2;
    const zB = (b.leadingZM + b.trailingZM) / 2;
    halfFirstMomentZ += dx
      * (2 * chordA * zA + chordA * zB + chordB * zA + 2 * chordB * zB) / 6;
    const stripVolumeHalf = dx * (
      2 * chordA * a.thicknessM
      + chordA * b.thicknessM
      + chordB * a.thicknessM
      + 2 * chordB * b.thicknessM
    ) / 6;
    solidVolumeM3 += 2 * stripVolumeHalf;
    panelAreaM2 += 2 * dx * (chordA + chordB);
    const leadingSegmentLength = Math.hypot(dx, b.leadingZM - a.leadingZM);
    const trailingSegmentLength = Math.hypot(dx, b.trailingZM - a.trailingZM);
    const averageThickness = (a.thicknessM + b.thicknessM) / 2;
    leadingLengthM += 2 * leadingSegmentLength;
    trailingLengthM += 2 * trailingSegmentLength;
    leadingEdgeAreaM2 += 2 * leadingSegmentLength * averageThickness;
    trailingEdgeAreaM2 += 2 * trailingSegmentLength * averageThickness;

    const subdivisions = 64;
    for (let step = 0; step < subdivisions; step += 1) {
      const t = (step + 0.5) / subdivisions;
      const stripWidth = dx / subdivisions;
      const x = lerp(a.xM, b.xM, t);
      const leadingZ = lerp(a.leadingZM, b.leadingZM, t);
      const trailingZ = lerp(a.trailingZM, b.trailingZM, t);
      const chord = trailingZ - leadingZ;
      const thickness = lerp(a.thicknessM, b.thicknessM, t);
      const z = (leadingZ + trailingZ) / 2;
      const volumeEachSide = chord * thickness * stripWidth;
      const internalMassEachSide = volumeEachSide
        * wing.massModel.internalEffectiveDensityKgM3;
      const panelAreaEachSide = 2 * chord * stripWidth;
      const panelMassEachSide = panelAreaEachSide
        * wing.massModel.shellThicknessM.panel * panelMaterial.densityKgM3;
      const fuelMassEachSide = volumeEachSide * wing.massModel.fuelVolumeFraction
        * definition.massModel.fuelDensityKgM3;
      for (const sign of [-1, 1]) {
        const position = [sign * x, wing.installationYM, z];
        const variances = {
          x: stripWidth ** 2 / 12,
          y: thickness ** 2 / 12,
          z: chord ** 2 / 12,
        };
        massElements.push({
          mass: internalMassEachSide + panelMassEachSide,
          position,
          variances,
        });
        fuelElements.push({ mass: fuelMassEachSide, position, variances });
      }
    }
  }

  const leadingShellMass = leadingEdgeAreaM2
    * wing.massModel.shellThicknessM.leadingEdge * leadingMaterial.densityKgM3;
  const trailingShellMass = trailingEdgeAreaM2
    * wing.massModel.shellThicknessM.trailingEdge * trailingMaterial.densityKgM3;
  massElements.push({
    mass: leadingShellMass,
    position: [0, wing.installationYM, stations.at(-1).leadingZM / 2],
    variances: { x: (2 * stations.at(-1).xM) ** 2 / 12, y: 0, z: 0.4 },
  });
  massElements.push({
    mass: trailingShellMass,
    position: [0, wing.installationYM, stations[0].trailingZM * 0.55],
    variances: { x: (2 * stations.at(-1).xM) ** 2 / 12, y: 0, z: 0.3 },
  });

  addToMap(thermalAreas, panelZone.id, panelAreaM2);
  addToMap(thermalAreas, leadingZone.id, leadingEdgeAreaM2);
  addToMap(thermalAreas, trailingZone.id, trailingEdgeAreaM2);
  const referenceAreaM2 = 2 * halfArea;
  return {
    outline: deriveWingOutline(wing),
    referenceAreaM2,
    spanM: 2 * stations.at(-1).xM,
    aspectRatio: (2 * stations.at(-1).xM) ** 2 / referenceAreaM2,
    meanAerodynamicChordM: (2 * halfChordSquaredIntegral) / referenceAreaM2,
    aerodynamicCenterZM: (2 * halfFirstMomentZ) / referenceAreaM2,
    solidVolumeM3,
    wettedAreaM2: panelAreaM2 + leadingEdgeAreaM2 + trailingEdgeAreaM2,
    panelAreaM2,
    leadingEdgeAreaM2,
    trailingEdgeAreaM2,
    leadingEdgeLengthM: leadingLengthM,
    trailingEdgeLengthM: trailingLengthM,
  };
}

function interpolateBodyStation(a, b, t) {
  return {
    zM: lerp(a.zM, b.zM, t),
    centerYM: lerp(a.centerYM, b.centerYM, t),
    radiusXM: lerp(a.radiusXM, b.radiusXM, t),
    radiusYM: lerp(a.radiusYM, b.radiusYM, t),
  };
}

function deriveBodies(definition, maps, massElements, fuelElements, thermalAreas) {
  const outputs = [];
  let totalVolumeM3 = 0;
  let totalWettedAreaM2 = 0;
  let maximumEllipseAreaM2 = 0;
  for (const body of definition.geometry.bodies) {
    let volumeM3 = 0;
    let wettedAreaM2 = 0;
    for (let index = 0; index < body.stations.length - 1; index += 1) {
      const a = body.stations[index];
      const b = body.stations[index + 1];
      const zone = maps.zones.get(body.segmentThermalZoneIds[index]);
      if (!zone) throw new Error(`body ${body.id} references unknown thermal zone`);
      const material = maps.materials.get(zone.materialId);
      const subdivisions = 64;
      for (let step = 0; step < subdivisions; step += 1) {
        const t0 = step / subdivisions;
        const t1 = (step + 1) / subdivisions;
        const tm = (t0 + t1) / 2;
        const start = interpolateBodyStation(a, b, t0);
        const end = interpolateBodyStation(a, b, t1);
        const mid = interpolateBodyStation(a, b, tm);
        const dz = end.zM - start.zM;
        const dVolume = Math.PI * mid.radiusXM * mid.radiusYM * dz;
        const radialSlope = Math.hypot(
          end.radiusXM - start.radiusXM,
          end.radiusYM - start.radiusYM,
          end.centerYM - start.centerYM,
        );
        const dArea = ellipsePerimeter(mid.radiusXM, mid.radiusYM)
          * Math.hypot(dz, radialSlope);
        volumeM3 += dVolume;
        wettedAreaM2 += dArea;
        maximumEllipseAreaM2 = Math.max(maximumEllipseAreaM2,
          Math.PI * mid.radiusXM * mid.radiusYM);
        addToMap(thermalAreas, zone.id, dArea);

        const position = [0, mid.centerYM, mid.zM];
        const volumeVariances = {
          x: mid.radiusXM ** 2 / 4,
          y: mid.radiusYM ** 2 / 4,
          z: dz ** 2 / 12,
        };
        const shellVariances = {
          x: mid.radiusXM ** 2 / 2,
          y: mid.radiusYM ** 2 / 2,
          z: dz ** 2 / 12,
        };
        massElements.push({
          mass: dVolume * body.massModel.internalEffectiveDensityKgM3,
          position,
          variances: volumeVariances,
        });
        massElements.push({
          mass: dArea * body.massModel.shellThicknessM * material.densityKgM3,
          position,
          variances: shellVariances,
        });
        fuelElements.push({
          mass: dVolume * body.massModel.fuelVolumeFraction
            * definition.massModel.fuelDensityKgM3,
          position,
          variances: volumeVariances,
        });
      }
    }
    outputs.push({ id: body.id, volumeM3, wettedAreaM2 });
    totalVolumeM3 += volumeM3;
    totalWettedAreaM2 += wettedAreaM2;
  }
  return { outputs, totalVolumeM3, totalWettedAreaM2, maximumEllipseAreaM2 };
}

function deriveFins(definition, maps, massElements, thermalAreas) {
  const outputs = [];
  let totalVolumeM3 = 0;
  let totalWettedAreaM2 = 0;
  for (const fin of definition.geometry.fins ?? []) {
    const { area, centroid } = polygonAreaCentroid(fin.planformZY);
    const perimeter = polygonPerimeter(fin.planformZY);
    const count = fin.pair ? 2 : 1;
    const volumeM3 = area * fin.thicknessM * count;
    const wettedAreaM2 = (2 * area + perimeter * fin.thicknessM) * count;
    const zone = maps.zones.get(fin.surfaceZone);
    if (!zone) throw new Error(`fin ${fin.id} references unknown thermal zone`);
    const material = maps.materials.get(zone.materialId);
    addToMap(thermalAreas, zone.id, wettedAreaM2);
    const totalMass = volumeM3 * fin.massModel.internalEffectiveDensityKgM3
      + wettedAreaM2 * fin.massModel.shellThicknessM * material.densityKgM3;
    const zValues = fin.planformZY.map(([z]) => z);
    const yValues = fin.planformZY.map(([, y]) => y);
    const cantRadians = (fin.outwardCantDeg ?? 0) * Math.PI / 180;
    const sinCant = Math.sin(cantRadians);
    const cosCant = Math.cos(cantRadians);
    const thicknessVariance = fin.thicknessM ** 2 / 12;
    const heightVariance = (Math.max(...yValues) - Math.min(...yValues)) ** 2 / 12;
    const variances = {
      x: thicknessVariance * cosCant ** 2 + heightVariance * sinCant ** 2,
      y: thicknessVariance * sinCant ** 2 + heightVariance * cosCant ** 2,
      z: (Math.max(...zValues) - Math.min(...zValues)) ** 2 / 12,
    };
    if (fin.pair) {
      for (const sign of [-1, 1]) {
        massElements.push({
          mass: totalMass / 2,
          position: [
            sign * (fin.sideXM + centroid[1] * sinCant),
            fin.rootYM + centroid[1] * cosCant,
            centroid[0],
          ],
          variances,
        });
      }
    } else {
      massElements.push({
        mass: totalMass,
        position: [
          (fin.sideXM ?? 0) + centroid[1] * sinCant,
          fin.rootYM + centroid[1] * cosCant,
          centroid[0],
        ],
        variances,
      });
    }
    outputs.push({
      id: fin.id,
      count,
      projectedAreaEachM2: area,
      volumeM3,
      wettedAreaM2,
      centroidZY: centroid,
    });
    totalVolumeM3 += volumeM3;
    totalWettedAreaM2 += wettedAreaM2;
  }
  return { outputs, totalVolumeM3, totalWettedAreaM2 };
}

function deriveInletAndExhaust(definition, maps, massElements, thermalAreas) {
  const inlet = definition.geometry.inlet;
  const inletZone = maps.zones.get(inlet.surfaceZone);
  if (!inletZone) throw new Error("inlet references unknown thermal zone");
  const inletMaterial = maps.materials.get(inletZone.materialId);
  const inletLipAreaM2 = ellipsePerimeter(inlet.radiusXM, inlet.radiusYM) * inlet.lipDepthM;
  const inletIncidenceRad = inlet.designFlowIncidenceDeg * Math.PI / 180;
  const sinIncidence = Math.sin(inletIncidenceRad);
  const cosIncidence = Math.cos(inletIncidenceRad);
  const radialVariance = inlet.radiusYM ** 2 / 2;
  const depthVariance = inlet.lipDepthM ** 2 / 12;
  addToMap(thermalAreas, inletZone.id, inletLipAreaM2);
  massElements.push({
    mass: inletLipAreaM2 * inlet.shellThicknessM * inletMaterial.densityKgM3,
    position: inlet.centerM,
    variances: {
      x: inlet.radiusXM ** 2 / 2,
      y: radialVariance * cosIncidence ** 2 + depthVariance * sinIncidence ** 2,
      z: radialVariance * sinIncidence ** 2 + depthVariance * cosIncidence ** 2,
    },
  });

  const exhaust = definition.geometry.exhaust;
  const exhaustZone = maps.zones.get(exhaust.surfaceZone);
  if (!exhaustZone) throw new Error("exhaust references unknown thermal zone");
  const exhaustMaterial = maps.materials.get(exhaustZone.materialId);
  const exhaustFairingAreaM2 = 2 * Math.PI * exhaust.radiusM * exhaust.fairingLengthM;
  addToMap(thermalAreas, exhaustZone.id, exhaustFairingAreaM2);
  massElements.push({
    mass: exhaustFairingAreaM2 * exhaust.shellThicknessM * exhaustMaterial.densityKgM3,
    position: exhaust.centerM,
    variances: {
      x: exhaust.radiusM ** 2 / 2,
      y: exhaust.radiusM ** 2 / 2,
      z: exhaust.fairingLengthM ** 2 / 12,
    },
  });
  return {
    inletLipAreaM2,
    exhaustFairingAreaM2,
    wettedAreaM2: inletLipAreaM2 + exhaustFairingAreaM2,
  };
}

function addInternalVolumes(definition, massElements) {
  const outputs = [];
  for (const volume of definition.geometry.internalVolumes ?? []) {
    const geometry = internalVolumeGeometry(definition, volume);
    const massKg = geometry.volumeM3 * volume.effectiveDensityKgM3;
    massElements.push({
      mass: massKg,
      position: geometry.centerM,
      variances: geometry.variances,
    });
    outputs.push({
      id: volume.id,
      shape: geometry.shape,
      centerM: geometry.centerM,
      ...(geometry.shape === "box"
        ? { sizeM: geometry.sizeM }
        : { radiusM: geometry.radiusM, lengthM: geometry.lengthM }),
      volumeM3: geometry.volumeM3,
      effectiveDensityKgM3: volume.effectiveDensityKgM3,
      massKg,
    });
  }
  return outputs;
}

function massProperties(elements) {
  const mass = elements.reduce((sum, element) => sum + element.mass, 0);
  if (!(mass > 0)) throw new RangeError("mass model produced no mass");
  const cg = [0, 0, 0];
  for (const element of elements) {
    for (let axis = 0; axis < 3; axis += 1) {
      cg[axis] += element.mass * element.position[axis] / mass;
    }
  }
  let xx = 0;
  let yy = 0;
  let zz = 0;
  for (const element of elements) {
    const dx = element.position[0] - cg[0];
    const dy = element.position[1] - cg[1];
    const dz = element.position[2] - cg[2];
    xx += element.mass * (
      element.variances.y + element.variances.z + dy ** 2 + dz ** 2);
    yy += element.mass * (
      element.variances.x + element.variances.z + dx ** 2 + dz ** 2);
    zz += element.mass * (
      element.variances.x + element.variances.y + dx ** 2 + dy ** 2);
  }
  return {
    massKg: mass,
    cgM: { x: cg[0], y: cg[1], z: cg[2] },
    inertiaKgM2: { xx, yy, zz },
  };
}

function exteriorBounds(definition) {
  const wing = definition.geometry.wing;
  let minX = -wing.halfStations.at(-1).xM;
  let maxX = wing.halfStations.at(-1).xM;
  let minY = wing.installationYM - Math.max(...wing.halfStations.map((s) => s.thicknessM)) / 2;
  let maxY = wing.installationYM + Math.max(...wing.halfStations.map((s) => s.thicknessM)) / 2;
  let minZ = Math.min(...wing.halfStations.map((s) => s.leadingZM));
  let maxZ = Math.max(...wing.halfStations.map((s) => s.trailingZM));
  for (const body of definition.geometry.bodies) {
    for (const station of body.stations) {
      minX = Math.min(minX, -station.radiusXM);
      maxX = Math.max(maxX, station.radiusXM);
      minY = Math.min(minY, station.centerYM - station.radiusYM);
      maxY = Math.max(maxY, station.centerYM + station.radiusYM);
      minZ = Math.min(minZ, station.zM);
      maxZ = Math.max(maxZ, station.zM);
    }
  }
  for (const fin of definition.geometry.fins ?? []) {
    const cantRadians = (fin.outwardCantDeg ?? 0) * Math.PI / 180;
    const sinCant = Math.sin(cantRadians);
    const cosCant = Math.cos(cantRadians);
    const halfThicknessX = fin.thicknessM * cosCant / 2;
    const halfThicknessY = fin.thicknessM * Math.abs(sinCant) / 2;
    for (const [, localY] of fin.planformZY) {
      const lateral = (fin.sideXM ?? 0) + localY * sinCant;
      const vertical = fin.rootYM + localY * cosCant;
      if (fin.pair) {
        minX = Math.min(minX, -lateral - halfThicknessX);
        maxX = Math.max(maxX, lateral + halfThicknessX);
      } else {
        minX = Math.min(minX, lateral - halfThicknessX);
        maxX = Math.max(maxX, lateral + halfThicknessX);
      }
      minY = Math.min(minY, vertical - halfThicknessY);
      maxY = Math.max(maxY, vertical + halfThicknessY);
    }
    minZ = Math.min(minZ, ...fin.planformZY.map(([z]) => z));
    maxZ = Math.max(maxZ, ...fin.planformZY.map(([z]) => z));
  }
  const inlet = definition.geometry.inlet;
  const inletIncidenceRad = inlet.designFlowIncidenceDeg * Math.PI / 180;
  const inletRadialY = inlet.radiusYM * Math.abs(Math.cos(inletIncidenceRad));
  const inletDepthY = inlet.lipDepthM * Math.abs(Math.sin(inletIncidenceRad)) / 2;
  const inletRadialZ = inlet.radiusYM * Math.abs(Math.sin(inletIncidenceRad));
  const inletDepthZ = inlet.lipDepthM * Math.abs(Math.cos(inletIncidenceRad)) / 2;
  minX = Math.min(minX, inlet.centerM[0] - inlet.radiusXM);
  maxX = Math.max(maxX, inlet.centerM[0] + inlet.radiusXM);
  minY = Math.min(minY, inlet.centerM[1] - inletRadialY - inletDepthY);
  maxY = Math.max(maxY, inlet.centerM[1] + inletRadialY + inletDepthY);
  minZ = Math.min(minZ, inlet.centerM[2] - inletRadialZ - inletDepthZ);
  maxZ = Math.max(maxZ, inlet.centerM[2] + inletRadialZ + inletDepthZ);
  const exhaust = definition.geometry.exhaust;
  minX = Math.min(minX, exhaust.centerM[0] - exhaust.radiusM);
  maxX = Math.max(maxX, exhaust.centerM[0] + exhaust.radiusM);
  minY = Math.min(minY, exhaust.centerM[1] - exhaust.radiusM);
  maxY = Math.max(maxY, exhaust.centerM[1] + exhaust.radiusM);
  minZ = Math.min(minZ, exhaust.centerM[2] - exhaust.fairingLengthM / 2);
  maxZ = Math.max(maxZ, exhaust.centerM[2] + exhaust.fairingLengthM / 2);
  return {
    minM: { x: minX, y: minY, z: minZ },
    maxM: { x: maxX, y: maxY, z: maxZ },
    lengthM: maxZ - minZ,
    spanM: maxX - minX,
    heightM: maxY - minY,
  };
}

function derivedFrontalArea(reference, definition, bodies) {
  const wingThickness = Math.max(...definition.geometry.wing.halfStations
    .map((station) => station.thicknessM));
  const exposedWingSpan = Math.max(0,
    reference.spanM - 2 * Math.sqrt(bodies.maximumEllipseAreaM2 / Math.PI));
  let finArea = 0;
  for (const fin of definition.geometry.fins ?? []) {
    const maxY = Math.max(...fin.planformZY.map(([, y]) => y));
    finArea += (fin.pair ? 2 : 1) * fin.thicknessM * maxY;
  }
  const tunnelAllowance = bodies.outputs.length > 1
    ? bodies.outputs.slice(1).reduce((sum, body) => sum + body.volumeM3, 0)
      / Math.max(1, reference.lengthM) * 0.35
    : 0;
  return bodies.maximumEllipseAreaM2
    + exposedWingSpan * wingThickness
    + finArea
    + tunnelAllowance;
}

function derivePropulsionPackaging(definition) {
  const contract = turbinePackageContract(definition);
  const crossSections = exactTunnelCrossSections(definition, contract);
  const limitingSection = crossSections.reduce((current, section) =>
    section.clearCoannularAreaM2 < current.clearCoannularAreaM2 ? section : current);
  const packageVolume = definition.geometry.internalVolumes.find(
    (candidate) => candidate.id === contract.authored.internalVolumeId);
  const packageGeometry = internalVolumeGeometry(definition, packageVolume);
  const capsule = definition.geometry.internalVolumes.find(
    (candidate) => candidate.id === "buried-reclined-escape-capsule");
  const capsuleGeometry = boxGeometry(capsule);
  return {
    architecture: {
      kind: definition.propulsionModel.flowpathArchitecture.kind,
      epistemic: definition.propulsionModel.flowpathArchitecture.epistemic,
      turbineAndRamTelemetryRemainSeparate: true,
      sharedNozzle: true,
    },
    core: {
      diameterM: contract.coreDiameterM,
      radiusM: contract.coreRadiusM,
      lengthM: contract.coreLengthM,
      centerM: contract.axisCenterM,
      minZM: contract.coreMinZM,
      maxZM: contract.coreMaxZM,
    },
    envelope: {
      shape: PROPULSION_PACKAGE_SHAPE,
      diameterM: contract.envelopeDiameterM,
      radiusM: contract.envelopeRadiusM,
      lengthM: contract.envelopeLengthM,
      centerM: contract.axisCenterM,
      minZM: contract.envelopeMinZM,
      maxZM: contract.envelopeMaxZM,
      volumeM3: packageGeometry.volumeM3,
      effectiveDensityKgM3: packageVolume.effectiveDensityKgM3,
      massKg: packageGeometry.volumeM3 * packageVolume.effectiveDensityKgM3,
      structuralRadialClearanceM: contract.structuralRadialClearanceM,
      thermalRadialClearanceM: contract.thermalRadialClearanceM,
      foreClearanceM: contract.foreClearanceM,
      aftClearanceM: contract.aftClearanceM,
    },
    fireBulkhead: {
      minimumGapM: contract.minimumFireBulkheadGapM,
      actualGapM: contract.envelopeMinZM - capsuleGeometry.maxM[2],
      passes: contract.envelopeMinZM - capsuleGeometry.maxM[2]
        >= contract.minimumFireBulkheadGapM - 1e-12,
    },
    tunnel: {
      bodyId: contract.authored.tunnelBodyId,
      shellThicknessM: definition.geometry.bodies.find(
        (candidate) => candidate.id === contract.authored.tunnelBodyId)
        .massModel.shellThicknessM,
      crossSections,
      limitingCrossSectionZM: limitingSection.zM,
      minimumRadialClearanceM: Math.min(
        ...crossSections.map((section) => section.radialClearanceM)),
      minimumClearCoannularAreaM2: limitingSection.clearCoannularAreaM2,
    },
    internalVolumeCollisionPass: true,
  };
}

function deriveCoannularFlowCapacity(definition, packaging, designPoint) {
  const pressureRecoveryFraction =
    definition.propulsionModel.flowpathArchitecture.minimumTotalPressureRecoveryFraction;
  const pressureRatio = 1 + (AIR_GAMMA - 1) * designPoint.mach ** 2 / 2;
  const totalTemperatureK = designPoint.atmosphere.temperatureK * pressureRatio;
  const idealTotalPressurePa = designPoint.atmosphere.pressurePa
    * pressureRatio ** (AIR_GAMMA / (AIR_GAMMA - 1));
  const chokedMassFluxAtIdealTotalPressureKgM2S = idealTotalPressurePa
    / Math.sqrt(totalTemperatureK)
    * Math.sqrt(AIR_GAMMA / AIR_GAS_CONSTANT)
    * (2 / (AIR_GAMMA + 1))
      ** ((AIR_GAMMA + 1) / (2 * (AIR_GAMMA - 1)));
  const chokedMassFluxAtRecoveryFloorKgM2S =
    chokedMassFluxAtIdealTotalPressureKgM2S * pressureRecoveryFraction;
  const requiredChokedAreaM2 = designPoint.massFlowKgS
    / chokedMassFluxAtRecoveryFloorKgM2S;
  const availableCoannularAreaM2 = packaging.tunnel.minimumClearCoannularAreaM2;
  const nozzleAreaM2 = Math.PI * definition.geometry.exhaust.radiusM ** 2;
  const minimumRecoveryRequiredFraction = designPoint.massFlowKgS
    / (chokedMassFluxAtIdealTotalPressureKgM2S * availableCoannularAreaM2);
  return {
    designMach: designPoint.mach,
    designAltitudeM: designPoint.altitudeM,
    designMassFlowKgS: designPoint.massFlowKgS,
    totalTemperatureK,
    idealTotalPressurePa,
    pressureRecoveryFloorFraction: pressureRecoveryFraction,
    minimumRecoveryRequiredFraction,
    chokedMassFluxAtRecoveryFloorKgM2S,
    requiredChokedAreaM2,
    availableCoannularAreaM2,
    coannularAreaMarginM2: availableCoannularAreaM2 - requiredChokedAreaM2,
    coannularAreaMarginFraction: availableCoannularAreaM2 / requiredChokedAreaM2 - 1,
    nozzleAreaM2,
    nozzleToCoannularAreaRatio: nozzleAreaM2 / availableCoannularAreaM2,
    coannularAreaPass: availableCoannularAreaM2 >= requiredChokedAreaM2,
    nozzleAreaPass: nozzleAreaM2 >= requiredChokedAreaM2,
    passes: availableCoannularAreaM2 >= requiredChokedAreaM2
      && nozzleAreaM2 >= requiredChokedAreaM2,
    epistemic: "isentropic-choked-area-screen-not-an-inlet-cycle-deck",
  };
}

export function standardAtmosphere(altitudeM) {
  finite(altitudeM, "altitudeM");
  if (altitudeM < 0 || altitudeM > 32_000) {
    throw new RangeError("shape-first atmosphere supports 0..32 km");
  }
  const geopotentialAltitudeM = EARTH_GEOPOTENTIAL_RADIUS_M * altitudeM
    / (EARTH_GEOPOTENTIAL_RADIUS_M + altitudeM);
  const layers = [
    { baseM: 0, topM: 11_000, baseK: 288.15, basePa: 101_325, lapseKPerM: -0.0065 },
    { baseM: 11_000, topM: 20_000, baseK: 216.65, basePa: 22_632.06, lapseKPerM: 0 },
    { baseM: 20_000, topM: 32_000, baseK: 216.65, basePa: 5_474.889, lapseKPerM: 0.001 },
  ];
  const layer = layers.find(
    (candidate) => geopotentialAltitudeM <= candidate.topM) ?? layers.at(-1);
  const dh = geopotentialAltitudeM - layer.baseM;
  const temperatureK = layer.baseK + layer.lapseKPerM * dh;
  const pressurePa = layer.lapseKPerM === 0
    ? layer.basePa * Math.exp(-G0 * dh / (AIR_GAS_CONSTANT * layer.baseK))
    : layer.basePa * (temperatureK / layer.baseK)
      ** (-G0 / (AIR_GAS_CONSTANT * layer.lapseKPerM));
  const densityKgM3 = pressurePa / (AIR_GAS_CONSTANT * temperatureK);
  const speedOfSoundMps = Math.sqrt(AIR_GAMMA * AIR_GAS_CONSTANT * temperatureK);
  const dynamicViscosityPaS = SUTHERLAND_REFERENCE_VISCOSITY_PA_S
    * (temperatureK / SUTHERLAND_REFERENCE_K) ** 1.5
    * (SUTHERLAND_REFERENCE_K + SUTHERLAND_CONSTANT_K)
    / (temperatureK + SUTHERLAND_CONSTANT_K);
  return {
    geometricAltitudeM: altitudeM,
    geopotentialAltitudeM,
    temperatureK,
    pressurePa,
    densityKgM3,
    speedOfSoundMps,
    dynamicViscosityPaS,
  };
}

function deriveTurbineCore(definition) {
  const turbine = definition.propulsionModel.turbineCore;
  return {
    seaLevelStaticDryThrustN: turbine.seaLevelStaticDryThrustN,
    maximumAugmentedThrustRatio: turbine.maximumAugmentedThrustRatio,
    maximumAugmentedSeaLevelStaticThrustN:
      turbine.seaLevelStaticDryThrustN * turbine.maximumAugmentedThrustRatio,
    fadeStartMach: turbine.fadeStartMach,
    fadeCompleteMach: turbine.fadeCompleteMach,
    fuelFlowAnchorsLbPerMinute: turbine.fuelFlowAnchorsLbPerMinute,
    augmentationAppliesTo: turbine.augmentationAppliesTo,
    ramStreamAugmentationRatio: 1,
  };
}

function smoothStep(phase) {
  return phase * phase * (3 - 2 * phase);
}

function inletFlowContract(definition) {
  const inlet = definition.geometry.inlet;
  return {
    designFlowIncidenceDeg: inlet.designFlowIncidenceDeg,
    designFlowIncidenceRad: inlet.designFlowIncidenceDeg * Math.PI / 180,
    offDesignFlowModel: inlet.offDesignFlowModel,
  };
}

export function evaluateInletFlow(definition, mach, alphaRad, betaRad = 0,
  previouslyUnstarted = false) {
  const contract = inletFlowContract(definition);
  const model = contract.offDesignFlowModel;
  const alpha = Number.isFinite(alphaRad) ? alphaRad : 0;
  const beta = Number.isFinite(betaRad) ? betaRad : 0;
  const alphaDeviationRad = alpha - contract.designFlowIncidenceRad;
  const combinedOffDesignAngleRad = Math.hypot(alphaDeviationRad, beta);
  if (!Number.isFinite(mach) || mach <= model.ramRegimeStartMach) {
    return {
      ...contract,
      alphaDeviationRad,
      alphaDeviationDeg: alphaDeviationRad * 180 / Math.PI,
      betaRad: beta,
      combinedOffDesignAngleRad,
      combinedOffDesignAngleDeg: combinedOffDesignAngleRad * 180 / Math.PI,
      continuousRecovery: 1,
      recovery: 1,
      unstarted: false,
    };
  }
  const unstarted = previouslyUnstarted
    ? combinedOffDesignAngleRad > model.unstartClearDeviationRad
    : combinedOffDesignAngleRad >= model.unstartTripDeviationRad;
  const machExcess = mach - model.ramRegimeStartMach;
  const characteristicAngleRad = Math.max(
    model.minimumCharacteristicAngleRad,
    model.characteristicAngleAtRamStartRad
      - model.characteristicAngleDecreaseRadPerMach * machExcess,
  );
  const ratio = combinedOffDesignAngleRad / characteristicAngleRad;
  const offDesignRecovery = 1 / (1 + ratio ** 2);
  const onset = smoothStep(Math.min(1, Math.max(0,
    machExcess / model.onsetBlendMach)));
  const continuousRecovery = 1 - onset * (1 - offDesignRecovery);
  return {
    ...contract,
    alphaDeviationRad,
    alphaDeviationDeg: alphaDeviationRad * 180 / Math.PI,
    betaRad: beta,
    combinedOffDesignAngleRad,
    combinedOffDesignAngleDeg: combinedOffDesignAngleRad * 180 / Math.PI,
    characteristicAngleRad,
    continuousRecovery,
    recovery: unstarted
      ? Math.min(continuousRecovery, model.unstartRecoveryFloor)
      : continuousRecovery,
    unstarted,
  };
}

function effectiveLiftCurveSlopePerRad(aspectRatio, mach) {
  const lowSpeedSlope = 2 * Math.PI * aspectRatio / (aspectRatio + 2);
  if (!Number.isFinite(mach) || mach <= 1) return lowSpeedSlope;
  const supersonicSlope = 4 / Math.sqrt(Math.max(mach ** 2 - 1, 1e-9));
  return Math.min(lowSpeedSlope, supersonicSlope);
}

function scheduleValue(schedule, mach) {
  if (mach <= schedule[0].mach) return schedule[0].value;
  if (mach >= schedule.at(-1).mach) return schedule.at(-1).value;
  for (let index = 0; index < schedule.length - 1; index += 1) {
    const a = schedule[index];
    const b = schedule[index + 1];
    if (mach < a.mach || mach > b.mach) continue;
    return lerp(a.value, b.value, (mach - a.mach) / (b.mach - a.mach));
  }
  throw new Error("invalid schedule");
}

function evaluateThermal(definition, derived, mach, atmosphere) {
  const recoveryFactor = definition.thermalModel.recoveryFactor;
  const stagnationTemperatureK = atmosphere.temperatureK
    * (1 + (AIR_GAMMA - 1) * mach ** 2 / 2);
  const recoveryTemperatureK = atmosphere.temperatureK
    * (1 + recoveryFactor * (AIR_GAMMA - 1) * mach ** 2 / 2);
  const materials = new Map(definition.materials.map((material) => [material.id, material]));
  const zones = definition.thermalModel.zones.map((zone) => {
    const basisTemperatureK = zone.temperatureBasis === "stagnation"
      ? stagnationTemperatureK : recoveryTemperatureK;
    const effectiveTemperatureK = atmosphere.temperatureK
      + zone.adiabaticRiseFraction * (basisTemperatureK - atmosphere.temperatureK);
    const material = materials.get(zone.materialId);
    return {
      id: zone.id,
      materialId: zone.materialId,
      areaM2: derived.thermalAreasM2[zone.id] ?? 0,
      temperatureBasis: zone.temperatureBasis,
      effectiveTemperatureK,
      maximumServiceTemperatureK: material.maximumServiceTemperatureK,
      marginK: material.maximumServiceTemperatureK - effectiveTemperatureK,
      passes: effectiveTemperatureK <= material.maximumServiceTemperatureK,
    };
  });
  const binding = zones.reduce((current, zone) =>
    !current || zone.marginK < current.marginK ? zone : current, null);
  return {
    stagnationTemperatureK,
    recoveryTemperatureK,
    zones,
    bindingZone: binding.id,
    minimumMarginK: binding.marginK,
    passes: zones.every((zone) => zone.passes),
  };
}

export function evaluateDashDesignPoint(definition, mach, altitudeM,
  precomputed = null) {
  assertShapeFirstDefinition(definition);
  positive(mach, "mach");
  const derived = precomputed ?? deriveShapeFirstAirframe(definition, { includeEnvelope: false });
  const atmosphere = standardAtmosphere(altitudeM);
  const speedMps = mach * atmosphere.speedOfSoundMps;
  const dynamicPressurePa = 0.5 * atmosphere.densityKgM3 * speedMps ** 2;
  const inlet = definition.geometry.inlet;
  const inletCaptureAreaM2 = Math.PI * inlet.radiusXM * inlet.radiusYM
    * (1 - inlet.boundaryLayerBlockageFraction);
  const massFlowKgS = atmosphere.densityKgM3 * speedMps * inletCaptureAreaM2
    * scheduleValue(definition.propulsionModel.captureEfficiencySchedule, mach);
  const specificThrustNPerKgS = scheduleValue(
    definition.propulsionModel.specificThrustScheduleNPerKgS, mach);
  const rawRamStreamThrustN = massFlowKgS * specificThrustNPerKgS
    * definition.propulsionModel.installedThrustRetention;

  const grossWeightN = derived.massProperties.grossMassKg * G0;
  const trimLiftCoefficient = grossWeightN
    / (dynamicPressurePa * derived.referenceGeometry.referenceAreaM2);
  const effectiveClAlphaPerRad = effectiveLiftCurveSlopePerRad(
    derived.referenceGeometry.aspectRatio, mach);
  const designTrimAlphaRad = trimLiftCoefficient / effectiveClAlphaPerRad;
  const inletFlow = evaluateInletFlow(
    definition, mach, designTrimAlphaRad, 0, false);
  const netThrustN = rawRamStreamThrustN * inletFlow.recovery;

  const reynolds = atmosphere.densityKgM3 * speedMps
    * derived.referenceGeometry.lengthM / atmosphere.dynamicViscosityPaS;
  const skinFrictionCoefficient = 0.455
    / (Math.log10(reynolds) ** 2.58)
    / ((1 + 0.144 * mach ** 2) ** 0.65);
  const frictionDragN = dynamicPressurePa * skinFrictionCoefficient
    * derived.referenceGeometry.wettedAreaM2
    * definition.propulsionModel.dragCorrelation.skinFrictionFormFactor;
  const waveDragN = dynamicPressurePa * derived.referenceGeometry.frontalAreaM2
    * definition.propulsionModel.dragCorrelation.wavePressureCoefficient;
  const baseAreaM2 = Math.PI * definition.geometry.exhaust.radiusM ** 2;
  const baseDragN = dynamicPressurePa * baseAreaM2
    * definition.propulsionModel.dragCorrelation.basePressureCoefficient;
  const liftCoefficient = grossWeightN
    / (dynamicPressurePa * derived.referenceGeometry.referenceAreaM2);
  const inducedDragCoefficient = liftCoefficient ** 2
    / (Math.PI * derived.referenceGeometry.aspectRatio
      * definition.propulsionModel.dragCorrelation.oswaldEfficiency);
  const inducedDragN = dynamicPressurePa * derived.referenceGeometry.referenceAreaM2
    * inducedDragCoefficient;
  const dragN = (frictionDragN + waveDragN + baseDragN + inducedDragN)
    * definition.propulsionModel.dragCorrelation.trimAndInterferenceFactor;
  const thermal = evaluateThermal(definition, derived, mach, atmosphere);
  const maximumQ = definition.fixedRequirements.dash.maximumDynamicPressurePa;
  return {
    mach,
    altitudeM,
    atmosphere,
    speedMps,
    dynamicPressurePa,
    inletCaptureAreaM2,
    massFlowKgS,
    specificThrustNPerKgS,
    rawRamStreamThrustN,
    netThrustN,
    trimLiftCoefficient,
    effectiveClAlphaPerRad,
    designTrimAlphaRad,
    designTrimAlphaDeg: designTrimAlphaRad * 180 / Math.PI,
    inletFlow,
    dragN,
    dragBreakdownN: { friction: frictionDragN, wave: waveDragN, base: baseDragN, induced: inducedDragN },
    excessThrustN: netThrustN - dragN,
    thermal,
    thermalPass: thermal.passes,
    dynamicPressurePass: dynamicPressurePa <= maximumQ,
    propulsivePass: netThrustN >= dragN,
    passes: thermal.passes && dynamicPressurePa <= maximumQ && netThrustN >= dragN,
  };
}

function maximumMachAtAltitude(definition, derived, altitudeM) {
  let lastPassingMach = null;
  let firstFailingMach = null;
  for (let mach = 2.5; mach <= 6.0001; mach += 0.01) {
    const point = evaluateDashDesignPoint(definition, mach, altitudeM, derived);
    if (point.passes) lastPassingMach = mach;
    else if (lastPassingMach !== null) {
      firstFailingMach = mach;
      break;
    }
  }
  return {
    lastPassingMach,
    firstFailingMach,
  };
}

export function deriveShapeFirstAirframe(definition, options = {}) {
  assertShapeFirstDefinition(definition);
  const maps = materialMaps(definition);
  const massElements = [];
  const fuelElements = [];
  const thermalAreas = new Map();
  const wing = deriveWing(definition, maps, massElements, fuelElements, thermalAreas);
  const bodies = deriveBodies(definition, maps, massElements, fuelElements, thermalAreas);
  const fins = deriveFins(definition, maps, massElements, thermalAreas);
  const ductFaces = deriveInletAndExhaust(
    definition, maps, massElements, thermalAreas);
  const internalVolumes = addInternalVolumes(definition, massElements);
  const propulsionPackaging = derivePropulsionPackaging(definition);
  const bounds = exteriorBounds(definition);
  const empty = massProperties(massElements);
  const fuel = massProperties(fuelElements);
  const gross = massProperties([...massElements, ...fuelElements]);
  const referenceGeometry = {
    lengthM: bounds.lengthM,
    spanM: bounds.spanM,
    heightM: bounds.heightM,
    referenceAreaM2: wing.referenceAreaM2,
    meanAerodynamicChordM: wing.meanAerodynamicChordM,
    aspectRatio: wing.aspectRatio,
    aerodynamicCenterZM: wing.aerodynamicCenterZM,
    wettedAreaM2: wing.wettedAreaM2 + bodies.totalWettedAreaM2
      + fins.totalWettedAreaM2 + ductFaces.wettedAreaM2,
    enclosedVolumeM3: wing.solidVolumeM3 + bodies.totalVolumeM3 + fins.totalVolumeM3,
    frontalAreaM2: 0,
    bounds,
  };
  referenceGeometry.frontalAreaM2 = derivedFrontalArea(referenceGeometry, definition, bodies);
  const thermalAreasM2 = Object.fromEntries(
    [...thermalAreas.entries()].sort(([a], [b]) => a.localeCompare(b)));
  const result = {
    id: definition.id,
    revision: definition.revision,
    referenceGeometry,
    wing,
    bodies: bodies.outputs,
    fins: fins.outputs,
    ductFaces,
    internalVolumes,
    turbineCore: deriveTurbineCore(definition),
    propulsionPackaging,
    inletFlow: inletFlowContract(definition),
    inletCaptureAreaM2: Math.PI * definition.geometry.inlet.radiusXM
      * definition.geometry.inlet.radiusYM
      * (1 - definition.geometry.inlet.boundaryLayerBlockageFraction),
    thermalAreasM2,
    massProperties: {
      emptyMassKg: empty.massKg,
      fuelCapacityKg: fuel.massKg,
      grossMassKg: gross.massKg,
      emptyCgM: empty.cgM,
      grossCgM: gross.cgM,
      emptyInertiaKgM2: empty.inertiaKgM2,
      grossInertiaKgM2: gross.inertiaKgM2,
    },
  };
  if (options.includeEnvelope !== false) {
    const dash = definition.fixedRequirements.dash;
    result.dashDesignPoint = evaluateDashDesignPoint(
      definition, dash.designMach, dash.designAltitudeM, result);
    result.propulsionPackaging.flowCapacity = deriveCoannularFlowCapacity(
      definition, result.propulsionPackaging, result.dashDesignPoint);
    result.dashEnvelope = maximumMachAtAltitude(
      definition, result, dash.designAltitudeM);
  }
  return result;
}

export function roundEngineeringResult(result, digits = 4) {
  const factor = 10 ** digits;
  const visit = (value) => {
    if (typeof value === "number") return Math.round(value * factor) / factor;
    if (Array.isArray(value)) return value.map(visit);
    if (!value || typeof value !== "object") return value;
    return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, visit(child)]));
  };
  return visit(result);
}

export function stableStringify(value, indent = 0) {
  const normalize = (child) => {
    if (Array.isArray(child)) return child.map(normalize);
    if (!child || typeof child !== "object") return child;
    return Object.fromEntries(
      Object.keys(child).sort().map((key) => [key, normalize(child[key])]));
  };
  return JSON.stringify(normalize(value), null, indent);
}

export function canonicalDefinitionSha256(definition) {
  return createHash("sha256")
    .update(stableStringify(definition))
    .digest("hex");
}

export function embeddedDefinitionModuleText(definition, sourceText = null) {
  const definitionText = sourceText === null
    ? JSON.stringify(definition, null, 2)
    : sourceText.trimEnd();
  const embeddedValue = JSON.parse(definitionText);
  if (stableStringify(embeddedValue) !== stableStringify(definition)) {
    throw new Error("embedded source text does not contain the canonical definition");
  }
  return `// AUTO-SYNC from airframes/rapier.v2.json (canonicalSha256 ${canonicalDefinitionSha256(definition)})\n`
    + `export default ${definitionText};\n`;
}

export function createEngineeringArtifact(definition) {
  const derived = roundEngineeringResult(deriveShapeFirstAirframe(definition), 6);
  const canonicalSha256 = canonicalDefinitionSha256(definition);
  const designPoint = derived.dashDesignPoint;
  return {
    schema: "guns-only.shape-derived-airframe-engineering.v1",
    source: {
      id: definition.id,
      revision: definition.revision,
      canonicalSha256,
      runtimeBinding: definition.authority.runtimeBinding,
      derivation: "tools/assets/airframes/derive_shape_first_airframe.mjs",
    },
    fixedRequirements: definition.fixedRequirements,
    referenceGeometry: derived.referenceGeometry,
    massProperties: derived.massProperties,
    internalVolumes: derived.internalVolumes,
    propulsion: {
      turbineCore: derived.turbineCore,
      packaging: derived.propulsionPackaging,
      ramStream: {
        augmentationRatio: derived.turbineCore.ramStreamAugmentationRatio,
        designPointRawNetThrustN: designPoint.rawRamStreamThrustN,
        designPointNetThrustN: designPoint.netThrustN,
      },
      inletFlow: {
        ...derived.inletFlow,
        designPoint: {
          trimLiftCoefficient: designPoint.trimLiftCoefficient,
          effectiveClAlphaPerRad: designPoint.effectiveClAlphaPerRad,
          trimAlphaRad: designPoint.designTrimAlphaRad,
          trimAlphaDeg: designPoint.designTrimAlphaDeg,
          alphaDeviationRad: designPoint.inletFlow.alphaDeviationRad,
          alphaDeviationDeg: designPoint.inletFlow.alphaDeviationDeg,
          betaRad: designPoint.inletFlow.betaRad,
          combinedOffDesignAngleRad:
            designPoint.inletFlow.combinedOffDesignAngleRad,
          combinedOffDesignAngleDeg:
            designPoint.inletFlow.combinedOffDesignAngleDeg,
          characteristicAngleRad: designPoint.inletFlow.characteristicAngleRad,
          recovery: designPoint.inletFlow.recovery,
          unstarted: designPoint.inletFlow.unstarted,
        },
      },
      inletCaptureAreaM2: derived.inletCaptureAreaM2,
      designPoint: {
        mach: designPoint.mach,
        altitudeM: designPoint.altitudeM,
        speedMps: designPoint.speedMps,
        dynamicPressurePa: designPoint.dynamicPressurePa,
        massFlowKgS: designPoint.massFlowKgS,
        specificThrustNPerKgS: designPoint.specificThrustNPerKgS,
        rawRamStreamThrustN: designPoint.rawRamStreamThrustN,
        netThrustN: designPoint.netThrustN,
        turbineStreamThrustN: 0,
        ramStreamThrustN: designPoint.netThrustN,
        ramStreamAugmentationRatio: derived.turbineCore.ramStreamAugmentationRatio,
        dragN: designPoint.dragN,
        dragBreakdownN: designPoint.dragBreakdownN,
        excessThrustN: designPoint.excessThrustN,
        propulsivePass: designPoint.propulsivePass,
        dynamicPressurePass: designPoint.dynamicPressurePass,
      },
      dashEnvelope: derived.dashEnvelope,
    },
    thermal: {
      areasM2: derived.thermalAreasM2,
      designPoint: {
        stagnationTemperatureK: designPoint.thermal.stagnationTemperatureK,
        recoveryTemperatureK: designPoint.thermal.recoveryTemperatureK,
        zones: designPoint.thermal.zones,
        bindingZone: designPoint.thermal.bindingZone,
        minimumMarginK: designPoint.thermal.minimumMarginK,
        passes: designPoint.thermal.passes,
      },
    },
    acceptance: {
      dashDesignPointPasses: designPoint.passes,
      propulsionPackageFitsTunnel: true,
      propulsionPackageClearsInternalVolumes:
        derived.propulsionPackaging.internalVolumeCollisionPass,
      coannularFlowAreaPass: derived.propulsionPackaging.flowCapacity.passes,
      shapeFirstNoAuthoredDerivedOutputs: true,
    },
  };
}

export function engineeringArtifactText(definition) {
  return `${JSON.stringify(createEngineeringArtifact(definition), null, 2)}\n`;
}

function runCli() {
  const [sourcePath, option, artifactPath] = process.argv.slice(2);
  if (!sourcePath) {
    throw new Error(
      "usage: node derive_shape_first_airframe.mjs SOURCE [--check ARTIFACT|--check-embedded MODULE]",
    );
  }
  const sourceText = readFileSync(sourcePath, "utf8");
  const definition = JSON.parse(sourceText);
  const expected = engineeringArtifactText(definition);
  if (option === undefined) {
    process.stdout.write(expected);
    return;
  }
  if (!artifactPath || !["--check", "--check-embedded"].includes(option)) {
    throw new Error("expected --check ARTIFACT or --check-embedded MODULE after SOURCE");
  }
  const checkedKind = option === "--check" ? "engineering artifact" : "embedded module";
  const checkedExpected = option === "--check"
    ? expected : embeddedDefinitionModuleText(definition, sourceText);
  const actual = readFileSync(artifactPath, "utf8");
  if (actual !== checkedExpected) {
    throw new Error(`${checkedKind} ${artifactPath} is stale; regenerate it from ${sourcePath}`);
  }
  process.stdout.write(`${artifactPath} is fresh\n`);
}

if (process.argv[1]
    && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runCli();
}
