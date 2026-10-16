// Presentation reads the sim's debris classification; it never estimates ROE from a map pin.
export function pathfinderHud(state) {
  const mission = state?.pathfinder;
  if (!mission || !Array.isArray(mission.relays)) return null;
  const relays = mission.relays.slice(0, 6);
  const selected = relays.find(relay => relay.id === mission.selected_id) ?? null;
  const live = selected?.relay_active === true && selected.escaped !== true;
  const classification = mission.selected_footprint?.classification ?? "unknown";
  // Amber means the shot is not cleared: unknown is conservative ROE, not a claim of a town.
  const blocked = live && classification !== "clear";
  // A live balloon with gas loss has taken an envelope hit.  Keep this as a compact
  // annunciator in the existing directive row: the visible scene already sags the
  // envelope, and the word teaches the player why the gondola is still flying.
  const envelopeHit = live && Number(selected?.leak_fraction) > 0;
  const position = selected?.gondola_position;
  const target = live && position && [position.x, position.y, position.z].every(Number.isFinite)
    ? position : null;
  const markers = relays.filter(relay => relay.relay_active === true && relay.escaped !== true
    && relay.gondola_position
    && [relay.gondola_position.x, relay.gondola_position.y, relay.gondola_position.z].every(Number.isFinite))
    .map(relay => ({ id: relay.id, position: relay.gondola_position }));
  const steering = steeringCue(state, selected);
  const targetCue = selected && live ? `R${selected.id} ${steering}` : "LANE --";
  const droneSelected = typeof state?.pathfinder_drone_selected === "boolean"
    ? state.pathfinder_drone_selected : mission.drone_selected === true;
  const droneCount = Number(state?.pathfinder_gun_drones_remaining
    ?? state?.rapier_gun_drones_remaining ?? mission.gun_drones_remaining);
  const weaponCue = droneSelected
    ? `DRONE${Number.isFinite(droneCount) ? ` ${Math.max(0, Math.floor(droneCount))}` : ""}`
    : "GUN";
  return {
    row: `${relays.map(relay => relay.escaped ? "×" : relay.relay_active ? "◇" : "◆").join("")}  ${targetCue}`
      + `${envelopeHit ? "  ENVELOPE" : ""}  F ${weaponCue}`,
    label: relays.map(relay => `Relay ${relay.id}: ${relay.escaped ? "escaped" : relay.relay_active ? "live" : "denied"}`)
      .join("; ") + (selected ? `; selected ${selected.id}; debris ${classification}` : ""),
    target, markers, blocked, tag: blocked ? "ROE" : envelopeHit ? "ENVELOPE" : "",
    envelopeHit, steering, droneSelected, droneCount, selectedId: selected?.id ?? null,
  };
}

/**
 * Quantise the next relay's bearing into a small lane cue.  A heading-aware cue is used when
 * Rapier publishes one; the absolute bearing remains useful in fixtures and during the first
 * frames before the attitude block arrives.
 */
export function steeringCue(state, relay) {
  const position = relay?.gondola_position;
  const px = Number(state?.px); const py = Number(state?.py); const pz = Number(state?.pz);
  if (!position || ![px, py, pz].every(Number.isFinite)
      || ![position.x, position.y, position.z].every(Number.isFinite)) return "→";
  const bearing = Math.atan2(position.x - px, position.z - pz) * 180 / Math.PI;
  const heading = Number(state?.heading_deg);
  const turn = Number.isFinite(heading) ? ((bearing - heading + 540) % 360) - 180 : bearing;
  const index = Math.round(((turn + 360) % 360) / 45) % 8;
  return ["↑", "↗", "→", "↘", "↓", "↙", "←", "↖"][index];
}

export function nextPathfinderSlot(state, { startFromNearest = false } = {}) {
  const mission = state?.pathfinder;
  if (!Array.isArray(mission?.relays) || mission.relays.length < 1) return null;
  const px = Number(state?.px);
  const py = Number(state?.py);
  const pz = Number(state?.pz);
  if (![px, py, pz].every(Number.isFinite)) return null;

  const liveByRange = mission.relays.slice(0, 6).map((relay, slot) => {
    const position = relay?.gondola_position;
    if (relay?.relay_active !== true || relay?.escaped === true || !position
        || ![position.x, position.y, position.z].every(Number.isFinite)) return null;
    const range = Math.hypot(position.x - px, position.y - py, position.z - pz);
    if (!Number.isFinite(range)) return null;
    return {
      slot,
      id: relay.id,
      range,
    };
  }).filter(Boolean).sort((a, b) => a.range - b.range || a.slot - b.slot);
  if (liveByRange.length < 1) return null;
  if (startFromNearest) return liveByRange[0].slot;

  const selectedIndex = liveByRange.findIndex(relay => relay.id === mission.selected_id);
  return liveByRange[(selectedIndex + 1 + liveByRange.length) % liveByRange.length].slot;
}
