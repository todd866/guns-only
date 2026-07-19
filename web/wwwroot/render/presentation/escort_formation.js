import { finite } from "./presentation_math.js";

export const ESCORT_FORMATION_STATIONS = Object.freeze({
  "port-quarter": Object.freeze({ alongMetres: -900, crossMetres: -520 }),
  "starboard-quarter": Object.freeze({ alongMetres: -1120, crossMetres: 640 }),
});

/**
 * Places an escort from the projected carrier frame. Inputs remain simulation coordinates
 * (X east, Z north); output is the Three world with Z flipped. This is presentation formation,
 * not an autonomous ship or collision truth.
 */
export function escortFormationPose(snapshot, options = {}) {
  const stationName = Object.prototype.hasOwnProperty.call(
    ESCORT_FORMATION_STATIONS,
    options.station,
  ) ? options.station : "port-quarter";
  const station = ESCORT_FORMATION_STATIONS[stationName]
    ?? ESCORT_FORMATION_STATIONS["port-quarter"];
  const along = finite(options.alongMetres, station.alongMetres);
  const cross = finite(options.crossMetres, station.crossMetres);
  const heading = finite(snapshot?.cheading, finite(snapshot?.carrier_heading_rad));
  const forwardEast = Math.sin(heading);
  const forwardNorth = Math.cos(heading);
  const rightEast = Math.cos(heading);
  const rightNorth = -Math.sin(heading);
  const simulationEast = finite(snapshot?.cx) + forwardEast * along + rightEast * cross;
  const simulationNorth = finite(snapshot?.cz) + forwardNorth * along + rightNorth * cross;
  return {
    position: {
      x: simulationEast,
      y: finite(options.waterlineY, 0),
      z: -simulationNorth,
    },
    yawRadians: heading === 0 ? 0 : -heading,
    station: stationName,
  };
}

export function applyEscortFormationPose(THREE, object, snapshot, options = {}, scratch = {}) {
  const pose = escortFormationPose(snapshot, options);
  const yAxis = scratch.yAxis ?? new THREE.Vector3(0, 1, 0);
  object.position.set(pose.position.x, pose.position.y, pose.position.z);
  object.quaternion.setFromAxisAngle(yAxis, pose.yawRadians);
  return pose;
}
