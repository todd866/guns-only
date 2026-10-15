// Presentation reads the sim's debris classification; it never estimates ROE from a map pin.
export function pathfinderHud(state) {
  const mission = state?.pathfinder;
  if (!mission || !Array.isArray(mission.relays)) return null;
  const relays = mission.relays.slice(0, 6);
  const selected = relays.find(relay => relay.id === mission.selected_id) ?? null;
  const live = selected?.relay_active === true;
  const classification = mission.selected_footprint?.classification ?? "unknown";
  // Amber means the shot is not cleared: unknown is conservative ROE, not a claim of a town.
  const blocked = live && classification !== "clear";
  const position = selected?.gondola_position;
  const target = live && position && [position.x, position.y, position.z].every(Number.isFinite)
    ? position : null;
  const markers = relays.filter(relay => relay.relay_active === true
    && relay.gondola_position
    && [relay.gondola_position.x, relay.gondola_position.y, relay.gondola_position.z].every(Number.isFinite))
    .map(relay => ({ id: relay.id, position: relay.gondola_position }));
  return {
    row: `${relays.map(relay => relay.relay_active ? "◇" : "◆").join("")}  F GUN`,
    label: relays.map(relay => `Relay ${relay.id}: ${relay.relay_active ? "live" : "denied"}`)
      .join("; ") + (selected ? `; selected ${selected.id}; debris ${classification}` : ""),
    target, markers, blocked, tag: blocked ? "ROE" : "", selectedId: selected?.id ?? null,
  };
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
    if (relay?.relay_active !== true || !position
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
