const SHAPE_FIRST_SCHEMA = "guns-only.shape-first-airframe-definition.v1";

function finite(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`Shape-first airframe: ${label} must be finite`);
  return number;
}

function vector3(value, label) {
  if (!Array.isArray(value) || value.length !== 3) {
    throw new Error(`Shape-first airframe: ${label} must be a three-element vector`);
  }
  return value.map((component, index) => finite(component, `${label}[${index}]`));
}

function loftStations(body, label) {
  if (!Array.isArray(body?.stations) || body.stations.length < 2) {
    throw new Error(`Shape-first airframe: ${label}.stations requires at least two stations`);
  }
  return body.stations.map((station, index) => ({
    z: finite(station.zM, `${label}.stations[${index}].zM`),
    rx: finite(station.radiusXM, `${label}.stations[${index}].radiusXM`),
    ry: finite(station.radiusYM, `${label}.stations[${index}].radiusYM`),
    y: finite(station.centerYM ?? 0, `${label}.stations[${index}].centerYM`),
  }));
}

function wingPlanform(halfStations) {
  if (!Array.isArray(halfStations) || halfStations.length < 2) {
    throw new Error("Shape-first airframe: geometry.wing.halfStations requires at least two stations");
  }
  const stations = halfStations.map((station, index) => ({
    x: finite(station.xM, `geometry.wing.halfStations[${index}].xM`),
    leading: finite(station.leadingZM,
      `geometry.wing.halfStations[${index}].leadingZM`),
    trailing: finite(station.trailingZM,
      `geometry.wing.halfStations[${index}].trailingZM`),
    thickness: finite(station.thicknessM,
      `geometry.wing.halfStations[${index}].thicknessM`),
  }));
  if (Math.abs(stations[0].x) > 1e-9) {
    throw new Error("Shape-first airframe: first wing half-station must lie on the centreline");
  }
  for (let index = 1; index < stations.length; index += 1) {
    if (stations[index].x <= stations[index - 1].x) {
      throw new Error("Shape-first airframe: wing half-stations must increase outboard");
    }
  }

  // Walk the left leading edge outboard, the left trailing edge inboard, then mirror the same
  // route on the right. This is a runtime view of the canonical half-stations, never a second
  // authored planform.
  const points = [[0, stations[0].leading]];
  for (let index = 1; index < stations.length; index += 1) {
    points.push([-stations[index].x, stations[index].leading]);
  }
  for (let index = stations.length - 1; index >= 1; index -= 1) {
    const point = [-stations[index].x, stations[index].trailing];
    if (point[0] !== points.at(-1)[0] || point[1] !== points.at(-1)[1]) points.push(point);
  }
  points.push([0, stations[0].trailing]);
  for (let index = 1; index < stations.length; index += 1) {
    points.push([stations[index].x, stations[index].trailing]);
  }
  for (let index = stations.length - 1; index >= 1; index -= 1) {
    const point = [stations[index].x, stations[index].leading];
    if (point[0] !== points.at(-1)[0] || point[1] !== points.at(-1)[1]) points.push(point);
  }
  return { points, stations };
}

function dimensions(def, wing) {
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let minZ = Number.POSITIVE_INFINITY;
  let maxZ = Number.NEGATIVE_INFINITY;
  const include = (x, y, z) => {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  };

  const wingY = finite(def.geometry.wing.installationYM,
    "geometry.wing.installationYM");
  const wingHalfThickness = Math.max(...wing.stations.map((station) => station.thickness)) / 2;
  for (const [x, z] of wing.points) {
    include(x, wingY - wingHalfThickness, z);
    include(x, wingY + wingHalfThickness, z);
  }
  for (const body of def.geometry.bodies) {
    for (const station of body.stations) {
      const x = finite(station.radiusXM, "geometry.bodies[].stations[].radiusXM");
      const y = finite(station.centerYM ?? 0, "geometry.bodies[].stations[].centerYM");
      const ry = finite(station.radiusYM, "geometry.bodies[].stations[].radiusYM");
      const z = finite(station.zM, "geometry.bodies[].stations[].zM");
      include(-x, y - ry, z);
      include(x, y + ry, z);
    }
  }
  for (const fin of def.geometry.fins ?? []) {
    const cant = finite(fin.outwardCantDeg ?? 0,
      "geometry.fins[].outwardCantDeg") * Math.PI / 180;
    const halfThicknessX = finite(fin.thicknessM, "geometry.fins[].thicknessM")
      * Math.cos(cant) / 2;
    const halfThicknessY = Number(fin.thicknessM) * Math.abs(Math.sin(cant)) / 2;
    for (const point of fin.planformZY) {
      const z = finite(point[0], "geometry.fins[].planformZY[][0]");
      const localY = finite(point[1], "geometry.fins[].planformZY[][1]");
      const lateral = finite(fin.sideXM ?? 0, "geometry.fins[].sideXM")
        + localY * Math.sin(cant);
      const vertical = finite(fin.rootYM ?? 0, "geometry.fins[].rootYM")
        + localY * Math.cos(cant);
      if (fin.pair) {
        include(-lateral - halfThicknessX, vertical - halfThicknessY, z);
        include(lateral + halfThicknessX, vertical + halfThicknessY, z);
      } else {
        include(lateral - halfThicknessX, vertical - halfThicknessY, z);
        include(lateral + halfThicknessX, vertical + halfThicknessY, z);
      }
    }
  }
  const inlet = def.geometry.inlet;
  const inletCenter = vector3(inlet.centerM, "geometry.inlet.centerM");
  const inletLipDepth = finite(inlet.lipDepthM, "geometry.inlet.lipDepthM");
  const inletIncidence = finite(inlet.designFlowIncidenceDeg,
    "geometry.inlet.designFlowIncidenceDeg") * Math.PI / 180;
  const inletRadialY = Number(inlet.radiusYM) * Math.abs(Math.cos(inletIncidence));
  const inletDepthY = inletLipDepth * Math.abs(Math.sin(inletIncidence)) / 2;
  const inletRadialZ = Number(inlet.radiusYM) * Math.abs(Math.sin(inletIncidence));
  const inletDepthZ = inletLipDepth * Math.abs(Math.cos(inletIncidence)) / 2;
  include(inletCenter[0] - finite(inlet.radiusXM, "geometry.inlet.radiusXM"),
    inletCenter[1] - inletRadialY - inletDepthY,
    inletCenter[2] - inletRadialZ - inletDepthZ);
  include(inletCenter[0] + Number(inlet.radiusXM),
    inletCenter[1] + inletRadialY + inletDepthY,
    inletCenter[2] + inletRadialZ + inletDepthZ);
  const exhaustCenter = vector3(def.geometry.exhaust.centerM, "geometry.exhaust.centerM");
  const exhaustRadius = finite(def.geometry.exhaust.radiusM, "geometry.exhaust.radiusM");
  const fairingLength = finite(def.geometry.exhaust.fairingLengthM,
    "geometry.exhaust.fairingLengthM");
  include(exhaustCenter[0] - exhaustRadius, exhaustCenter[1] - exhaustRadius,
    exhaustCenter[2] - fairingLength / 2);
  include(exhaustCenter[0] + exhaustRadius, exhaustCenter[1] + exhaustRadius,
    exhaustCenter[2] + fairingLength / 2);

  return Object.freeze({
    length: maxZ - minZ,
    span: maxX - minX,
    height: maxY - minY,
  });
}

export function isShapeFirstAirframeDefinition(definition) {
  return definition?.schema === SHAPE_FIRST_SCHEMA;
}

/**
 * Project the canonical shape-first schema into the existing Three.js jet-kit vocabulary.
 *
 * The returned object is derived in memory from geometry-of-record. It intentionally contains no
 * hand-authored area, volume, mass, inertia, thermal-area, inlet-area, or performance result.
 */
export function adaptShapeFirstAirframeDefinition(definition) {
  if (!isShapeFirstAirframeDefinition(definition)) {
    throw new Error(`Shape-first airframe: expected schema ${SHAPE_FIRST_SCHEMA}`);
  }
  const geometry = definition.geometry;
  if (!geometry || typeof geometry !== "object") {
    throw new Error("Shape-first airframe: geometry is required");
  }

  const wing = wingPlanform(geometry.wing?.halfStations);
  if (!Array.isArray(geometry.bodies) || geometry.bodies.length < 1) {
    throw new Error("Shape-first airframe: geometry.bodies requires a primary body");
  }
  const bodyViews = geometry.bodies.map((body, index) => ({
    id: body.id ?? `body-${index}`,
    stations: loftStations(body, `geometry.bodies[${index}]`),
  }));
  const primaryBody = bodyViews.find((body) => body.id === "continuous-upper-centrebody")
    ?? bodyViews[0];
  const tunnelBody = bodyViews.find((body) => body.id === "single-ventral-propulsion-tunnel")
    ?? bodyViews.find((body) => body !== primaryBody);

  const finViews = (Array.isArray(geometry.fins) ? geometry.fins : []).map((fin, index) => {
    if (!Array.isArray(fin.planformZY) || fin.planformZY.length < 3) {
      throw new Error(`Shape-first airframe: geometry.fins[${index}].planformZY is incomplete`);
    }
    return {
      id: fin.id ?? `fin-${index}`,
      planform: fin.planformZY.map((point, pointIndex) => {
        if (!Array.isArray(point) || point.length !== 2) {
          throw new Error(
            `Shape-first airframe: geometry.fins[${index}].planformZY[${pointIndex}] is invalid`,
          );
        }
        return [
          finite(point[0], `geometry.fins[${index}].planformZY[${pointIndex}][0]`),
          finite(point[1], `geometry.fins[${index}].planformZY[${pointIndex}][1]`),
        ];
      }),
      thickness: finite(fin.thicknessM, `geometry.fins[${index}].thicknessM`),
      sideX: finite(fin.sideXM, `geometry.fins[${index}].sideXM`),
      y: finite(fin.rootYM ?? 0, `geometry.fins[${index}].rootYM`),
      // createFinGeometry grows along +Y. Negative rotation on the right leans its tip outboard.
      rotZ: -finite(fin.outwardCantDeg ?? 0,
        `geometry.fins[${index}].outwardCantDeg`) * Math.PI / 180,
    };
  });

  const inletCenter = vector3(geometry.inlet?.centerM, "geometry.inlet.centerM");
  const inletRx = finite(geometry.inlet?.radiusXM, "geometry.inlet.radiusXM");
  const inletRy = finite(geometry.inlet?.radiusYM, "geometry.inlet.radiusYM");
  const lipDepth = finite(geometry.inlet?.lipDepthM, "geometry.inlet.lipDepthM");
  const inletIncidenceRad = finite(geometry.inlet?.designFlowIncidenceDeg,
    "geometry.inlet.designFlowIncidenceDeg") * Math.PI / 180;
  const exhaustCenter = vector3(geometry.exhaust?.centerM, "geometry.exhaust.centerM");
  const exhaustRadius = finite(geometry.exhaust?.radiusM, "geometry.exhaust.radiusM");
  const interfaceGeometry = geometry.externalInterfaces ?? {};
  const gunMuzzle = vector3(interfaceGeometry.gunMuzzleM,
    "geometry.externalInterfaces.gunMuzzleM");
  const capsule = (Array.isArray(geometry.internalVolumes) ? geometry.internalVolumes : [])
    .find((volume) => volume.id === "buried-reclined-escape-capsule");
  const capsuleCenter = capsule
    ? vector3(capsule.centerM, "geometry.internalVolumes.escapeCapsule.centerM")
    : [0, 0, -1.5];

  const result = {
    schema: definition.schema,
    id: definition.id,
    revision: definition.revision,
    displayName: definition.displayName,
    role: definition.role,
    presentationId: "presentation.vehicle.rapier.public-data-surrogate.v1",
    flightModelBinding: definition.authority?.runtimeBinding ?? null,
    epistemic: definition.epistemic,
    frameConvention: definition.frameConvention,
    wing: {
      planform: wing.points,
      thickness: Math.max(...wing.stations.map((station) => station.thickness)),
      // The legacy primitive expands its outline by bevel size. Keep the bevel numerically
      // non-zero (zero selects that primitive's 44 mm fallback) but sub-millimetric so the
      // canonical station coordinates, not a presentation flourish, own rendered span and area.
      bevel: 0.0001,
    },
    fuselage: { stations: primaryBody.stations },
    fins: finViews,
    intake: {
      innerR: Math.max(0.01, inletRx - lipDepth),
      outerR: inletRx,
      scaleY: inletRy / inletRx,
      position: inletCenter,
      // The lip plane is installed for canonical high-Mach trim, not for body alpha zero.
      rotX: inletIncidenceRad,
    },
    exhaust: {
      radius: exhaustRadius,
      tube: Math.max(0.025, exhaustRadius * 0.12),
      position: exhaustCenter,
    },
    sockets: {
      cockpitCamera: {
        x: capsuleCenter[0],
        y: capsuleCenter[1] + (Number(capsule?.sizeM?.[1]) || 0) * 0.2,
        z: capsuleCenter[2],
      },
      // One physical aperture. Both compatibility channels resolve to it until the effects layer
      // grows a single-barrel semantic; this avoids painting fictitious cheek guns on the OML.
      muzzleLeft: { x: gunMuzzle[0], y: gunMuzzle[1], z: gunMuzzle[2] },
      muzzleRight: { x: gunMuzzle[0], y: gunMuzzle[1], z: gunMuzzle[2] },
    },
    palette: {
      // Presentation-only finish, not a material or thermal claim.
      upper: "#596b73",
      lower: "#26343a",
      hot: "#765244",
      sensor: "#11191d",
      accent: "#b85e32",
    },
  };
  if (tunnelBody) result.propulsionTunnel = { stations: tunnelBody.stations };
  result.dimensionsM = dimensions(definition, wing);
  return result;
}
