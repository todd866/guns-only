function finitePoint(point) {
  if (!point || ![point.x, point.y, point.z].every(Number.isFinite)) return null;
  return { x: Number(point.x), y: Number(point.y), z: Number(point.z) };
}

function fireTarget(cells = []) {
  let x = 0; let y = 0; let z = 0; let weight = 0;
  for (const cell of cells) {
    const point = finitePoint(cell);
    const intensity = Math.max(0, Number(cell?.intensity) || 0);
    if (!point || intensity <= 0.01) continue;
    x += point.x * intensity; y += point.y * intensity; z += point.z * intensity; weight += intensity;
  }
  return weight > 0 ? { x: x / weight, y: y / weight + 90, z: z / weight } : null;
}

/** Relevant procedure points only: the list advances with the sortie instead of becoming a POI catalogue. */
export function okanaganTargets(current = {}) {
  const route = Array.isArray(current.route) ? current.route : [];
  const active = Math.max(0, Math.min(route.length - 1, Math.trunc(Number(current.active_gate) || 0)));
  const targets = route.slice(active, active + 4).flatMap((gate) => {
    const position = finitePoint(gate?.position);
    if (!position) return [];
    return [{ id: `fix:${gate.id}`, label: String(gate.label || gate.id || "FIX").toUpperCase(), kind: "fix", position }];
  });

  if (current.sortie !== "water-circuits") {
    const position = fireTarget(current.fire_cells);
    if (position) targets.push({ id: "incident:fire", label: "FIRE", kind: "incident", position });
  }
  for (const track of current.traffic ?? []) {
    const position = finitePoint(track?.position);
    if (!position) continue;
    targets.push({
      id: `traffic:${track.callsign}`,
      label: String(track.callsign || track.kind || "TRAFFIC").toUpperCase(),
      kind: "traffic",
      position,
    });
  }
  return targets;
}

export function retainOkanaganTarget(targets, selectedId = "") {
  if (!Array.isArray(targets) || targets.length === 0) return null;
  return targets.find((target) => target.id === selectedId) ?? targets[0];
}

export function cycleOkanaganTarget(targets, selectedId = "", direction = 1) {
  if (!Array.isArray(targets) || targets.length === 0) return null;
  const current = targets.findIndex((target) => target.id === selectedId);
  const start = current < 0 ? (direction >= 0 ? -1 : 0) : current;
  const index = (start + (direction >= 0 ? 1 : -1) + targets.length) % targets.length;
  return targets[index];
}
