import {
  createAh1gPresence,
  updateAh1gPresence,
} from "./ah1g_presence.js?v=344";

export const COBRA_FORMATION_LEAD_SCHEMA = "guns-only.cobra-formation-lead.v1";
export const COBRA_FORMATION_SPACING_M = 150;

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

/**
 * Put Ember Lead a genuine formation interval ahead on the exact authority gate polyline.
 * This is presentation, not a second flight model: Lead demonstrates the route without being
 * allowed to affect combat, tickets, collision, or the player's vehicle authority.
 */
export function cobraFormationLeadPose(authorityState, playerPose, spacingM = COBRA_FORMATION_SPACING_M) {
  const act = String(authorityState?.mission_act ?? "").toLowerCase();
  if (act === "rtb" || act === "complete") return null;
  const gates = Array.isArray(authorityState?.path_gates) ? authorityState.path_gates : [];
  const fob = authorityState?.ground_war?.fob;
  const startEastM = finite(fob?.x_m);
  const startNorthM = finite(fob?.z_m);
  const startUpM = finite(fob?.y_m);
  const points = [];
  if (act === "depart" && startEastM !== null && startNorthM !== null) {
    points.push({
      eastM: startEastM,
      northM: startNorthM,
      upM: startUpM ?? finite(playerPose?.y_m) ?? 0,
    });
  }
  for (const gate of gates) {
    const eastM = finite(gate?.east_m);
    const northM = finite(gate?.north_m);
    const upM = finite(gate?.up_m);
    if (eastM === null || northM === null || upM === null) continue;
    const previous = points[points.length - 1];
    if (!previous || Math.hypot(eastM - previous.eastM, northM - previous.northM) > 1)
      points.push({ eastM, northM, upM });
  }
  if (points.length < 2) return null;

  const playerEastM = finite(playerPose?.x_m) ?? points[0].eastM;
  const playerNorthM = finite(playerPose?.z_m) ?? points[0].northM;
  const segments = [];
  let totalM = 0;
  let nearestAlongM = 0;
  let nearestDistanceSqM = Number.POSITIVE_INFINITY;
  for (let index = 1; index < points.length; index += 1) {
    const from = points[index - 1];
    const to = points[index];
    const de = to.eastM - from.eastM;
    const dn = to.northM - from.northM;
    const lengthM = Math.hypot(de, dn);
    if (!(lengthM > 1)) continue;
    const fraction = Math.max(0, Math.min(1,
      ((playerEastM - from.eastM) * de + (playerNorthM - from.northM) * dn)
        / (lengthM * lengthM)));
    const projectedEastM = from.eastM + de * fraction;
    const projectedNorthM = from.northM + dn * fraction;
    const distanceSqM = (playerEastM - projectedEastM) ** 2
      + (playerNorthM - projectedNorthM) ** 2;
    if (distanceSqM < nearestDistanceSqM) {
      nearestDistanceSqM = distanceSqM;
      nearestAlongM = totalM + lengthM * fraction;
    }
    segments.push({ from, to, startM: totalM, lengthM, de, dn });
    totalM += lengthM;
  }
  if (!segments.length) return null;

  const leadAlongM = Math.min(totalM - 1, Math.max(0, nearestAlongM + Math.max(80, spacingM)));
  let segment = segments[segments.length - 1];
  for (const candidate of segments) {
    if (leadAlongM <= candidate.startM + candidate.lengthM) {
      segment = candidate;
      break;
    }
  }
  const fraction = Math.max(0, Math.min(1,
    (leadAlongM - segment.startM) / segment.lengthM));
  return {
    id: "cobra.ember-lead",
    callsign: "EMBER 1",
    x_m: segment.from.eastM + segment.de * fraction,
    y_m: segment.from.upM + (segment.to.upM - segment.from.upM) * fraction,
    z_m: segment.from.northM + segment.dn * fraction,
    yaw_rad: Math.atan2(segment.de, segment.dn),
    pitch_rad: 0,
    roll_rad: 0,
    main_rotor_rpm: 324,
  };
}

/** A concise R/T call tied to what the pilot is physically doing, not a timed tutorial card. */
export function cobraFormationRadio(authorityState, playerPose) {
  const act = String(authorityState?.mission_act ?? "").toLowerCase();
  if (act !== "depart" && act !== "ingress") return null;
  const fob = authorityState?.ground_war?.fob;
  const rangeM = Math.hypot(
    (finite(playerPose?.x_m) ?? 0) - (finite(fob?.x_m) ?? 0),
    (finite(playerPose?.z_m) ?? 0) - (finite(fob?.z_m) ?? 0),
  );
  if (act === "ingress") return {
    sequence: 5,
    speaker: "EMBER LEAD",
    text: "Dash 2, settled on route. Stay low; Iron Bell is the objective.",
  };
  if (rangeM < 90) return {
    sequence: 1,
    speaker: "EMBER LEAD",
    text: "Dash 2, lift and tuck in. Follow me through the amber gates.",
  };
  if (rangeM < 260) return {
    sequence: 2,
    speaker: "EMBER LEAD",
    text: "Dash 2, turning now. Keep Lead in sight and fly the gate centres.",
  };
  if (rangeM < 520) return {
    sequence: 3,
    speaker: "EMBER LEAD",
    text: "DShK ahead. This dogleg keeps the ridge between us and his gun.",
  };
  return {
    sequence: 4,
    speaker: "EMBER LEAD",
    text: "Threat abeam. Roll onto the attack route; stay below the skyline.",
  };
}

export function createCobraFormationLead(THREE) {
  const presence = createAh1gPresence(THREE);
  presence.group.name = "AH1G_EMBER_LEAD";
  presence.group.userData.schema = COBRA_FORMATION_LEAD_SCHEMA;
  presence.setFirstPerson(false);
  let pose = null;
  return {
    group: presence.group,
    get pose() { return pose; },
    update(authorityState, playerPose, deltaSeconds = 0) {
      pose = cobraFormationLeadPose(authorityState, playerPose);
      presence.setVisible(Boolean(pose));
      if (pose) updateAh1gPresence(presence, pose, deltaSeconds);
      return pose;
    },
    dispose() { presence.dispose(); },
  };
}
