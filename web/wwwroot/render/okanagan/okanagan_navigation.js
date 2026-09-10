const DEG = 180 / Math.PI;
const NM = 1852;
const FT = 3.280839895;
const LAT_M = 111320;
const LON_M = LAT_M * Math.cos(49.88 / DEG);
const finitePoint = p => p && [p.x, p.y, p.z].every(Number.isFinite);
export const bearingDegrees = (from, to) => (Math.atan2(to.x - from.x, to.z - from.z) * DEG + 360) % 360;
export const signedHeadingDifference = (target, heading) => ((target - heading + 180) % 360 + 360) % 360 - 180;
const headingText = value => `${String((Math.round(value) % 360 + 360) % 360).padStart(3, "0")}°T`;
export const placePosition = place => ({x: (place.longitude + 119.5) * LON_M,
  y: place.elevationM ?? 342, z: (place.latitude - 49.88) * LAT_M});

/** Read-only navigation from the authority's active gate; never advances or invents a gate. */
export function okanaganNavigation(current) {
  const route = current?.route ?? [];
  const index = Math.max(0, Math.trunc(current?.active_gate ?? 0));
  const gate = route[index];
  if (!finitePoint(current?.position) || !finitePoint(gate?.position)
      || !Number.isFinite(current.heading_rad)) return null;
  const rangeM = Math.hypot(gate.position.x - current.position.x, gate.position.z - current.position.z);
  const bearing = bearingDegrees(current.position, gate.position);
  const turnDeg = signedHeadingDifference(bearing, current.heading_rad * DEG);
  const altitudeDeltaFt = (gate.position.y - current.position.y) * FT;
  const direction = Math.abs(turnDeg) < 8 ? "ahead" : turnDeg < 0 ? "left" : "right";
  return Object.freeze({gate, index, rangeM, bearing, turnDeg, altitudeDeltaFt, direction,
    label: String(gate.label || "Next waypoint").replace(/^FLY\s+/i, ""),
    turn: direction === "ahead" ? "STRAIGHT AHEAD" : `TURN ${direction.toUpperCase()} ${Math.round(Math.abs(turnDeg))}°`,
    bearingText: headingText(bearing),
    rangeText: rangeM >= 0.1 * NM ? `${(rangeM / NM).toFixed(1)} NM` : `${Math.round(rangeM / 10) * 10} M`,
    altitudeText: `${Math.round(gate.position.y * FT / 10) * 10} FT MSL`,
    verticalText: Math.abs(altitudeDeltaFt) < 100 ? "ON ALTITUDE"
      : `${altitudeDeltaFt > 0 ? "CLIMB" : "DESCEND"} ${Math.round(Math.abs(altitudeDeltaFt) / 50) * 50} FT`,
  });
}

/** Named places come from the already shipped geographic data, not guessed screen positions. */
export function okanaganNavigationPlaces(world = {}) {
  const places = [
    ...(world.airfields ?? []).map(p => ({id: p.id, name: "KELOWNA AIRPORT", kind: "airport", position: placePosition(p)})),
    ...(world.communities ?? []).map(p => ({id: p.id, name: p.name.toUpperCase(), kind: "town", position: placePosition(p)})),
    ...(world.resorts ?? []).filter(p => p.bounds).map(p => ({id: p.id,
      name: String(p.name ?? p.id).toUpperCase(), kind: "resort", position: placePosition({
        latitude: (p.bounds.north + p.bounds.south) / 2,
        longitude: (p.bounds.east + p.bounds.west) / 2})})),
  ];
  return places;
}

/** Stable local scale preserves motion/orientation; whole-route mode is an explicit overview. */
export function okanaganMapFrame(current, width, height, overview = false) {
  const own = current.position;
  const remaining = (current.route ?? []).slice(Math.max(0, current.active_gate ?? 0))
    .map(g => g.position).filter(finitePoint);
  let centre = {x: own.x, z: own.z};
  let metresPerPixel = 14000 / width;
  if (overview) {
    const points = [own, ...remaining];
    const minX = Math.min(...points.map(p => p.x)), maxX = Math.max(...points.map(p => p.x));
    const minZ = Math.min(...points.map(p => p.z)), maxZ = Math.max(...points.map(p => p.z));
    centre = {x: (minX + maxX) / 2, z: (minZ + maxZ) / 2};
    metresPerPixel = Math.max(8000 / width, (maxX - minX) / (width - 48), (maxZ - minZ) / (height - 62));
  }
  const project = p => ({x: width / 2 + (p.x - centre.x) / metresPerPixel,
    y: height / 2 + 10 - (p.z - centre.z) / metresPerPixel});
  return {centre, metresPerPixel, project, headingRad: current.heading_rad};
}

/** Clamp a map fix to the panel edge without losing which side it is on. */
export function okanaganMapEdge(point, width, height, margin = 15) {
  const cx = width / 2, cy = height / 2 + 10;
  const dx = point.x - cx, dy = point.y - cy;
  const top = 37, bottom = height - 32;
  const scale = Math.min(1, dx > 0 ? (width - margin - cx) / dx : dx < 0 ? (margin - cx) / dx : 1,
    dy > 0 ? (bottom - cy) / dy : dy < 0 ? (top - cy) / dy : 1);
  return {x: cx + dx * scale, y: cy + dy * scale, clamped: scale < 1};
}

function labelBounds(ctx, text, x, y, align) {
  const width = ctx.measureText(text).width;
  const left = align === "right" ? x - width : x;
  return {left: left - 2, right: left + width + 2, top: y - 11, bottom: y + 3};
}

function drawMapLabel(ctx, value, point, width, height, reserved) {
  const original = typeof value === "string" ? value.replace(/\s+/g, " ").trim().slice(0, 64) : "";
  if (!original) return;
  const align = point.x > width * .55 ? "right" : "left";
  const x = point.x + (align === "right" ? -8 : 8);
  const available = Math.min(130, align === "right" ? x - 5 : width - 5 - x);
  let text = original;
  while (text.length > 1 && ctx.measureText(text).width > available)
    text = `${text.replace(/…$/, "").slice(0, -1)}…`;
  if (available < 12 || ctx.measureText(text).width > available) return;
  for (const y of [point.y - 5, point.y - 19, point.y + 14]) {
    const box = labelBounds(ctx, text, x, y, align);
    if (box.top < 29 || box.bottom > height - 25) continue;
    if (reserved.some(other => box.left < other.right && box.right > other.left
      && box.top < other.bottom && box.bottom > other.top)) continue;
    reserved.push(box);
    ctx.textAlign = align;
    ctx.fillText(text, x, y);
    return;
  }
}

export function drawOkanaganMap(ctx, current, world, places, width, height, overview = false) {
  if (!finitePoint(current?.position)) return;
  const frame = okanaganMapFrame(current, width, height, overview);
  const {project, metresPerPixel} = frame;
  const reserved = [];
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#102126"; ctx.fillRect(0, 0, width, height);
  ctx.save(); ctx.beginPath(); ctx.rect(0, 29, width, height - 54); ctx.clip();
  const lake = world?.lake;
  if (lake?.shoreline?.length) {
    ctx.beginPath();
    for (const ring of [lake.shoreline, ...(lake.islands ?? [])]) {
      ring.forEach(([longitude, latitude], i) => { const p = project(placePosition({longitude, latitude}));
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); });
      ctx.closePath();
    }
    ctx.fillStyle = "#296076"; ctx.fill("evenodd"); ctx.strokeStyle = "#75a7aa"; ctx.lineWidth = 1; ctx.stroke();
  }
  ctx.lineWidth = 1; ctx.strokeStyle = "#65735d";
  for (const road of world?.roads ?? []) for (const path of road.paths ?? []) {
    ctx.beginPath(); path.forEach(([longitude, latitude], i) => {
      const p = project(placePosition({longitude, latitude}));
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }); ctx.stroke();
  }
  const route = current.route ?? [], active = Math.max(0, current.active_gate ?? 0);
  ctx.strokeStyle = "#9b8450"; ctx.lineWidth = 1.3; ctx.beginPath();
  route.slice(active).forEach((gate, i) => { const p = project(gate.position);
    if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y); }); ctx.stroke();
  const own = project(current.position), next = route[active];
  if (next) {
    const p = project(next.position); ctx.strokeStyle = "#ffce6c"; ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]); ctx.beginPath(); ctx.moveTo(own.x, own.y); ctx.lineTo(p.x, p.y); ctx.stroke(); ctx.setLineDash([]);
    const edge = okanaganMapEdge(p, width, height);
    ctx.strokeStyle = "#ffdf98"; ctx.beginPath(); ctx.moveTo(edge.x, edge.y - 6);
    ctx.lineTo(edge.x + 6, edge.y); ctx.lineTo(edge.x, edge.y + 6); ctx.lineTo(edge.x - 6, edge.y); ctx.closePath(); ctx.stroke();
    ctx.fillStyle = "#ffe2a9"; ctx.font = "bold 9px ui-monospace, monospace";
    ctx.textAlign = edge.x > width * .65 ? "right" : "left";
    const labelX = edge.x + (edge.x > width * .65 ? -9 : 9);
    ctx.fillText("NEXT", labelX, edge.y + 3);
    reserved.push({left: edge.x - 8, right: edge.x + 8, top: edge.y - 8, bottom: edge.y + 8},
      labelBounds(ctx, "NEXT", labelX, edge.y + 3, ctx.textAlign));
  }
  for (const cell of current.fire_cells ?? []) {
    if (cell.intensity < .15) continue;
    const p = project(cell); ctx.fillStyle = "rgba(255,111,44,.65)"; ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  // Live operational overlays remain inside the same clip as terrain and route geometry.
  for (const site of current.sites ?? []) {
    if (!finitePoint(site?.position)) continue;
    const p = project(site.position);
    ctx.fillStyle = site.status === "lost" ? "#ad6257" : site.threat > .08 ? "#ffbc66" : "#c6dc9b";
    ctx.fillRect(p.x - 1.5, p.y - 1.5, 3, 3);
  }
  if (finitePoint(current.drop_aim)) {
    const p = project(current.drop_aim);
    ctx.strokeStyle = "#ff6a2a"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(p.x, p.y, 6, 0, Math.PI * 2); ctx.stroke();
  }
  ctx.font = "600 9px ui-monospace, monospace";
  for (const track of current.traffic ?? []) {
    if (!finitePoint(track?.position)) continue;
    const p = project(track.position);
    if (p.x < 3 || p.x > width - 3 || p.y < 32 || p.y > height - 28) continue;
    ctx.fillStyle = "#ffd157";
    ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    drawMapLabel(ctx, track.callsign, p, width, height, reserved);
  }
  const occupied = [];
  ctx.font = "600 9px ui-monospace, monospace";
  for (const place of places) {
    const p = project(place.position);
    if (p.x < 7 || p.x > width - 7 || p.y < 40 || p.y > height - 24) continue;
    if (occupied.some(q => Math.abs(q.y - p.y) < 14 && Math.abs(q.x - p.x) < 90)) continue;
    occupied.push(p);
    ctx.fillStyle = place.kind === "airport" ? "#f6eee0" : "#b5cec2";
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
    drawMapLabel(ctx, place.name, p, width, height, reserved);
  }
  // In a north-up map, eastward heading points right and northward heading points up.
  ctx.save(); ctx.translate(own.x, own.y); ctx.rotate(current.heading_rad);
  ctx.strokeStyle = "#092b2d"; ctx.fillStyle = "#96fff0"; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(0, -9); ctx.lineTo(6, 7); ctx.lineTo(0, 4); ctx.lineTo(-6, 7); ctx.closePath(); ctx.stroke(); ctx.fill(); ctx.restore();
  ctx.restore();
  ctx.fillStyle = "#d4e6dd"; ctx.textAlign = "right"; ctx.font = "bold 10px ui-monospace, monospace";
  ctx.fillText("N ↑", width - 9, 19);
  const scaleNm = metresPerPixel * width > 30000 ? 5 : 1, scaleWidth = scaleNm * NM / metresPerPixel;
  ctx.strokeStyle = "#bdd4cb"; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(9, height - 10); ctx.lineTo(9 + scaleWidth, height - 10); ctx.stroke();
  ctx.font = "9px ui-monospace, monospace"; ctx.textAlign = "left";
  ctx.fillText(`${scaleNm} NM`, 10, height - 14);
  ctx.textAlign = "right"; ctx.fillText(`HDG ${headingText(current.heading_rad * DEG)}`, width - 9, height - 10);
  return frame;
}
