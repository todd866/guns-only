/// North-up Mesh ND map: pan/zoom/follow, Place/Free Fix click, ActiveDest drag.

export const MESH_MAP_DEFAULT_SPAN_NM = 120;
export const MESH_MAP_MIN_SPAN_NM = 15;
export const MESH_MAP_MAX_SPAN_NM = 400;
export const MESH_MAP_DRAG_THRESHOLD_PX = 6;

export function clampSpanNm(spanNm) {
  const value = Number(spanNm);
  if (!Number.isFinite(value)) return MESH_MAP_DEFAULT_SPAN_NM;
  return Math.min(MESH_MAP_MAX_SPAN_NM, Math.max(MESH_MAP_MIN_SPAN_NM, value));
}

export function worldToCanvas(eastM, northM, centreEastM, centreNorthM, widthPx, heightPx, spanM) {
  const x = ((eastM - centreEastM) / spanM + 0.5) * widthPx;
  const y = (0.5 - (northM - centreNorthM) / spanM) * heightPx;
  return Object.freeze({ x, y });
}

export function canvasToWorld(xPx, yPx, centreEastM, centreNorthM, widthPx, heightPx, spanM) {
  const eastM = ((xPx / widthPx) - 0.5) * spanM + centreEastM;
  const northM = (0.5 - (yPx / heightPx)) * spanM + centreNorthM;
  return Object.freeze({ eastM, northM });
}

export function hitTestPlace(places, xPx, yPx, centreEastM, centreNorthM, widthPx, heightPx, spanM, radiusPx = 8) {
  let best = null;
  let bestDist = radiusPx;
  for (const place of places) {
    if (!place?.selectable) continue;
    const point = worldToCanvas(
      place.eastM, place.northM, centreEastM, centreNorthM, widthPx, heightPx, spanM);
    const dist = Math.hypot(point.x - xPx, point.y - yPx);
    if (dist <= bestDist) {
      best = place;
      bestDist = dist;
    }
  }
  return best;
}

export function hitTestActiveDest(frame, xPx, yPx, centreEastM, centreNorthM, widthPx, heightPx, spanM, radiusPx = 10) {
  if (!Number.isFinite(frame?.activeEastM) || !Number.isFinite(frame?.activeNorthM)) return false;
  const point = worldToCanvas(
    frame.activeEastM, frame.activeNorthM, centreEastM, centreNorthM, widthPx, heightPx, spanM);
  return Math.hypot(point.x - xPx, point.y - yPx) <= radiusPx;
}

export function createMeshNavMap(canvas, options = {}) {
  if (!canvas || typeof canvas.getContext !== "function") {
    throw new TypeError("Mesh nav map requires a canvas element.");
  }
  let spanNm = clampSpanNm(options.spanNm ?? MESH_MAP_DEFAULT_SPAN_NM);
  let follow = true;
  let freeCentreEastM = 0;
  let freeCentreNorthM = 0;
  const onSelectPlace = typeof options.onSelectPlace === "function" ? options.onSelectPlace : null;
  const onFreeFix = typeof options.onFreeFix === "function" ? options.onFreeFix : null;
  const onDragDest = typeof options.onDragDest === "function" ? options.onDragDest : null;
  const ctx = canvas.getContext("2d");
  let lastFrame = null;
  let pointer = null;

  function spanM() {
    return spanNm * 1852;
  }

  function centres(frame) {
    if (follow) {
      return {
        eastM: Number(frame?.ownshipEastM) || 0,
        northM: Number(frame?.ownshipNorthM) || 0,
      };
    }
    return { eastM: freeCentreEastM, northM: freeCentreNorthM };
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(120, Math.floor(rect.width || canvas.width || 280));
    const height = Math.max(120, Math.floor(rect.height || canvas.height || 240));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function draw(frame) {
    lastFrame = frame;
    if (frame?.follow === true) follow = true;
    if (frame?.follow === false) follow = false;
    if (follow) {
      freeCentreEastM = Number(frame?.ownshipEastM) || 0;
      freeCentreNorthM = Number(frame?.ownshipNorthM) || 0;
    }
    resize();
    const width = canvas.width;
    const height = canvas.height;
    const { eastM: centreEastM, northM: centreNorthM } = centres(frame);
    const places = Array.isArray(frame?.places) ? frame.places : [];
    const headingRad = Number(frame?.headingRad) || 0;
    const mapSpanM = spanM();

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = "#d9cbb0";
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = "rgba(90, 70, 40, 0.18)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 4; i += 1) {
      const x = (width * i) / 4;
      const y = (height * i) / 4;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, height);
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const tour = Array.isArray(frame?.tourStops) ? frame.tourStops : [];
    if (tour.length > 1) {
      ctx.strokeStyle = "rgba(122, 46, 18, 0.55)";
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      tour.forEach((stop, index) => {
        const point = worldToCanvas(
          stop.eastM, stop.northM, centreEastM, centreNorthM, width, height, mapSpanM);
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
      ctx.setLineDash([]);
    }

    const gates = Array.isArray(frame?.procedureGates) ? frame.procedureGates : [];
    if (gates.length > 0) {
      ctx.strokeStyle = "rgba(40, 70, 90, 0.55)";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      gates.forEach((gate, index) => {
        const point = worldToCanvas(
          gate.eastM, gate.northM, centreEastM, centreNorthM, width, height, mapSpanM);
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.stroke();
      for (const gate of gates) {
        const point = worldToCanvas(
          gate.eastM, gate.northM, centreEastM, centreNorthM, width, height, mapSpanM);
        const active = gate.active === true;
        ctx.fillStyle = active ? "#1a4a6a" : "rgba(40, 70, 90, 0.45)";
        ctx.fillRect(point.x - 4, point.y - 4, 8, 8);
      }
    }

    for (const place of places) {
      const point = worldToCanvas(
        place.eastM, place.northM, centreEastM, centreNorthM, width, height, mapSpanM);
      const isHome = place.role === "home";
      const isActive = frame?.activePlaceId && place.id === frame.activePlaceId;
      ctx.beginPath();
      ctx.fillStyle = isHome ? "#5a3a1a" : place.selectable ? "#2f5d3a" : "#6a6a5a";
      ctx.arc(point.x, point.y, isActive ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      if (isActive) {
        ctx.strokeStyle = "#1c3d28";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(point.x, point.y, 8, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = "#3a2a18";
      ctx.font = "10px ui-sans-serif, system-ui, sans-serif";
      ctx.fillText(String(place.name || "").slice(0, 18), point.x + 6, point.y - 4);
    }

    if (Number.isFinite(frame?.activeEastM) && Number.isFinite(frame?.activeNorthM)) {
      const fix = worldToCanvas(
        frame.activeEastM, frame.activeNorthM, centreEastM, centreNorthM, width, height, mapSpanM);
      ctx.strokeStyle = "#7a2e12";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(fix.x - 5, fix.y - 5, 10, 10);
    }

    const ownship = worldToCanvas(
      Number(frame?.ownshipEastM) || 0,
      Number(frame?.ownshipNorthM) || 0,
      centreEastM, centreNorthM, width, height, mapSpanM);
    ctx.save();
    ctx.translate(ownship.x, ownship.y);
    ctx.rotate(headingRad);
    ctx.fillStyle = "#102018";
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(5, 6);
    ctx.lineTo(0, 3);
    ctx.lineTo(-5, 6);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.fillStyle = "rgba(40, 30, 20, 0.55)";
    ctx.font = "9px ui-sans-serif, system-ui, sans-serif";
    ctx.fillText(`${Math.round(spanNm)} NM · ${follow ? "FOLLOW" : "FREE"}`, 8, height - 8);
  }

  function pointerToLocal(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(rect.width, 1)) * canvas.width,
      y: ((event.clientY - rect.top) / Math.max(rect.height, 1)) * canvas.height,
    };
  }

  function onPointerDown(event) {
    if (!lastFrame) return;
    canvas.setPointerCapture?.(event.pointerId);
    const local = pointerToLocal(event);
    const { eastM, northM } = centres(lastFrame);
    const mapSpanM = spanM();
    const draggingDest = hitTestActiveDest(
      lastFrame, local.x, local.y, eastM, northM, canvas.width, canvas.height, mapSpanM);
    pointer = {
      id: event.pointerId,
      startX: local.x,
      startY: local.y,
      lastX: local.x,
      lastY: local.y,
      dragged: false,
      draggingDest,
      centreEastM: eastM,
      centreNorthM: northM,
    };
  }

  function onPointerMove(event) {
    if (!pointer || pointer.id !== event.pointerId || !lastFrame) return;
    const local = pointerToLocal(event);
    const dx = local.x - pointer.startX;
    const dy = local.y - pointer.startY;
    if (!pointer.dragged && Math.hypot(dx, dy) >= MESH_MAP_DRAG_THRESHOLD_PX) {
      pointer.dragged = true;
    }
    if (!pointer.dragged) return;
    const mapSpanM = spanM();
    if (pointer.draggingDest) {
      const world = canvasToWorld(
        local.x, local.y, pointer.centreEastM, pointer.centreNorthM,
        canvas.width, canvas.height, mapSpanM);
      onDragDest?.(world.eastM, world.northM);
      return;
    }
    if (!follow) {
      const dEast = -((local.x - pointer.lastX) / canvas.width) * mapSpanM;
      const dNorth = ((local.y - pointer.lastY) / canvas.height) * mapSpanM;
      freeCentreEastM += dEast;
      freeCentreNorthM += dNorth;
      pointer.lastX = local.x;
      pointer.lastY = local.y;
      draw({ ...lastFrame, follow: false });
    }
  }

  function onPointerUp(event) {
    if (!pointer || pointer.id !== event.pointerId || !lastFrame) {
      pointer = null;
      return;
    }
    const local = pointerToLocal(event);
    const wasDrag = pointer.dragged;
    const draggingDest = pointer.draggingDest;
    pointer = null;
    if (wasDrag) {
      if (draggingDest) {
        const { eastM, northM } = centres(lastFrame);
        const world = canvasToWorld(
          local.x, local.y, eastM, northM, canvas.width, canvas.height, spanM());
        onDragDest?.(world.eastM, world.northM);
      }
      return;
    }
    const { eastM, northM } = centres(lastFrame);
    const places = Array.isArray(lastFrame.places) ? lastFrame.places : [];
    const hit = hitTestPlace(
      places, local.x, local.y, eastM, northM, canvas.width, canvas.height, spanM());
    if (hit) {
      onSelectPlace?.(hit.id);
      return;
    }
    if (lastFrame.transitMode === "open_segment") {
      const world = canvasToWorld(
        local.x, local.y, eastM, northM, canvas.width, canvas.height, spanM());
      onFreeFix?.(world.eastM, world.northM);
    }
  }

  function onWheel(event) {
    event.preventDefault();
    const factor = event.deltaY > 0 ? 1.12 : 1 / 1.12;
    spanNm = clampSpanNm(spanNm * factor);
    if (lastFrame) draw(lastFrame);
  }

  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("wheel", onWheel, { passive: false });

  return Object.freeze({
    draw,
    setFollowMode(next) {
      follow = next === true;
      if (follow && lastFrame) {
        freeCentreEastM = Number(lastFrame.ownshipEastM) || 0;
        freeCentreNorthM = Number(lastFrame.ownshipNorthM) || 0;
        draw(lastFrame);
      }
    },
    getSpanNm: () => spanNm,
    dispose() {
      canvas.removeEventListener("pointerdown", onPointerDown);
      canvas.removeEventListener("pointermove", onPointerMove);
      canvas.removeEventListener("pointerup", onPointerUp);
      canvas.removeEventListener("pointercancel", onPointerUp);
      canvas.removeEventListener("wheel", onWheel);
    },
  });
}
