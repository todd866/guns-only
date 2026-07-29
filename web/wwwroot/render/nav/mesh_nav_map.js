/// North-up Mesh moving map math + canvas presenter for `#nav-mesh-map`.

export const MESH_MAP_DEFAULT_SPAN_NM = 120;

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

export function createMeshNavMap(canvas, options = {}) {
  if (!canvas || typeof canvas.getContext !== "function") {
    throw new TypeError("Mesh nav map requires a canvas element.");
  }
  const spanNm = Number.isFinite(options.spanNm) ? options.spanNm : MESH_MAP_DEFAULT_SPAN_NM;
  const spanM = spanNm * 1852;
  const onSelectPlace = typeof options.onSelectPlace === "function" ? options.onSelectPlace : null;
  const onFreeFix = typeof options.onFreeFix === "function" ? options.onFreeFix : null;
  const ctx = canvas.getContext("2d");
  let lastFrame = null;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    const width = Math.max(120, Math.floor(rect.width || canvas.width || 280));
    const height = Math.max(100, Math.floor(rect.height || canvas.height || 160));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function draw(frame) {
    lastFrame = frame;
    resize();
    const width = canvas.width;
    const height = canvas.height;
    const centreEastM = Number(frame?.ownshipEastM) || 0;
    const centreNorthM = Number(frame?.ownshipNorthM) || 0;
    const places = Array.isArray(frame?.places) ? frame.places : [];
    const headingRad = Number(frame?.headingRad) || 0;

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

    for (const place of places) {
      const point = worldToCanvas(
        place.eastM, place.northM, centreEastM, centreNorthM, width, height, spanM);
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
      ctx.fillText(place.name.slice(0, 18), point.x + 6, point.y - 4);
    }

    if (Number.isFinite(frame?.activeEastM) && Number.isFinite(frame?.activeNorthM)
      && !(frame?.activePlaceId)) {
      const fix = worldToCanvas(
        frame.activeEastM, frame.activeNorthM, centreEastM, centreNorthM, width, height, spanM);
      ctx.strokeStyle = "#7a2e12";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(fix.x - 5, fix.y - 5, 10, 10);
    }

    const own = worldToCanvas(
      centreEastM, centreNorthM, centreEastM, centreNorthM, width, height, spanM);
    ctx.save();
    ctx.translate(own.x, own.y);
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
  }

  function pointerToLocal(event) {
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / Math.max(rect.width, 1)) * canvas.width,
      y: ((event.clientY - rect.top) / Math.max(rect.height, 1)) * canvas.height,
    };
  }

  function onClick(event) {
    if (!lastFrame) return;
    const local = pointerToLocal(event);
    const centreEastM = Number(lastFrame.ownshipEastM) || 0;
    const centreNorthM = Number(lastFrame.ownshipNorthM) || 0;
    const places = Array.isArray(lastFrame.places) ? lastFrame.places : [];
    const hit = hitTestPlace(
      places, local.x, local.y, centreEastM, centreNorthM, canvas.width, canvas.height, spanM);
    if (hit) {
      onSelectPlace?.(hit.id);
      return;
    }
    if (lastFrame.transitMode === "open_segment") {
      const world = canvasToWorld(
        local.x, local.y, centreEastM, centreNorthM, canvas.width, canvas.height, spanM);
      onFreeFix?.(world.eastM, world.northM);
    }
  }

  canvas.addEventListener("click", onClick);

  return Object.freeze({
    draw,
    dispose() {
      canvas.removeEventListener("click", onClick);
    },
  });
}
