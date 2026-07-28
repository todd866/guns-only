export const CASEVAC_ROUTE_BRIEFING_SCHEMA = "casevac.route-briefing.v1";

const SVG_NAMESPACE = "http://www.w3.org/2000/svg";
const LEG_ORDER = Object.freeze(["INGRESS", "OUTBOUND"]);
const KIND_ORDER = Object.freeze(["DIRECT", "MASKED"]);
const MAXIMUM_ROUTES = 16;
const MAXIMUM_POINTS_PER_ROUTE = 32;

const STYLE_TEXT = `
.cvr-board {
  margin: -6px 0 20px;
  border: 1px solid rgba(77, 255, 136, .2);
  border-radius: 6px;
  overflow: hidden;
  color: rgba(229, 255, 237, .84);
  background: rgba(2, 12, 8, .58);
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.cvr-board[hidden] { display: none !important; }
.cvr-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 11px;
  border-bottom: 1px solid rgba(77, 255, 136, .14);
}
.cvr-head strong {
  color: #b8ffce;
  font-size: 9px;
  letter-spacing: .16em;
}
.cvr-head span {
  color: rgba(217, 255, 229, .42);
  font-size: 7px;
  letter-spacing: .1em;
}
.cvr-layout {
  display: grid;
  grid-template-columns: minmax(138px, .85fr) minmax(170px, 1.15fr);
  min-height: 146px;
}
.cvr-options {
  display: grid;
  align-content: center;
  gap: 9px;
  padding: 10px 11px;
  border-right: 1px solid rgba(77, 255, 136, .12);
}
.cvr-leg strong {
  display: block;
  margin-bottom: 4px;
  color: rgba(217, 255, 229, .46);
  font-size: 7px;
  letter-spacing: .15em;
}
.cvr-option {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  margin-top: 3px;
  font-size: 8px;
  line-height: 1.35;
  letter-spacing: .06em;
}
.cvr-option[data-kind="DIRECT"] span:first-child { color: #ffc76a; }
.cvr-option[data-kind="MASKED"] span:first-child { color: #7dffad; }
.cvr-option span:last-child { color: rgba(217, 255, 229, .56); }
.cvr-landmarks {
  margin: 1px 0 4px;
  color: rgba(217, 255, 229, .38);
  font-size: 7px;
  line-height: 1.35;
  letter-spacing: .035em;
}
.cvr-map {
  width: 100%;
  height: 100%;
  min-height: 146px;
}
.cvr-grid { stroke: rgba(217, 255, 229, .055); stroke-width: 1; }
.cvr-path {
  fill: none;
  vector-effect: non-scaling-stroke;
  stroke-linecap: round;
  stroke-linejoin: round;
}
.cvr-path[data-kind="DIRECT"] {
  stroke: rgba(255, 199, 106, .88);
  stroke-width: 2.2;
}
.cvr-path[data-kind="MASKED"] {
  stroke: rgba(125, 255, 173, .86);
  stroke-width: 2;
  stroke-dasharray: 5 4;
}
.cvr-point {
  fill: #e5ffed;
  stroke: rgba(2, 12, 8, .9);
  stroke-width: 1.2;
  vector-effect: non-scaling-stroke;
}
.cvr-site-label {
  fill: rgba(229, 255, 237, .72);
  font: 700 7px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  letter-spacing: .08em;
}
@media (max-width: 650px) {
  .cvr-layout { grid-template-columns: 1fr; }
  .cvr-options { border-right: 0; border-bottom: 1px solid rgba(77, 255, 136, .12); }
  .cvr-map { min-height: 126px; }
}`;

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function upper(value) {
  return String(value ?? "").trim().toUpperCase();
}

function routeModel(route) {
  const id = String(route?.id ?? "").trim();
  const label = String(route?.label ?? "").trim();
  const leg = upper(route?.leg);
  const kind = upper(route?.kind);
  const bearing = finite(route?.initial_bearing_deg);
  const lengthM = finite(route?.horizontal_length_m);
  const sourcePoints = Array.isArray(route?.control_points)
    ? route.control_points.slice(0, MAXIMUM_POINTS_PER_ROUTE)
    : [];
  const points = sourcePoints
    .map((point) => ({
      eastM: finite(point?.east_m),
      northM: finite(point?.north_m),
      landmarkLabel: typeof point?.landmark_label === "string"
        && point.landmark_label.trim()
        ? point.landmark_label.trim()
        : null,
    }))
    .filter((point) => point.eastM !== null && point.northM !== null);

  if (!id
      || !label
      || !LEG_ORDER.includes(leg)
      || !KIND_ORDER.includes(kind)
      || bearing === null
      || lengthM === null
      || lengthM <= 0
      || points.length < 2) {
    return null;
  }
  return Object.freeze({
    id,
    label,
    leg,
    kind,
    initialBearingDeg: ((bearing % 360) + 360) % 360,
    horizontalLengthM: lengthM,
    points: Object.freeze(points.map(Object.freeze)),
  });
}

export function casevacRouteBriefingModel(routes) {
  const source = Array.isArray(routes)
    ? routes.slice(0, MAXIMUM_ROUTES)
    : [];
  const accepted = source
    .map(routeModel)
    .filter(Boolean)
    .sort((left, right) => {
      const legDelta = LEG_ORDER.indexOf(left.leg) - LEG_ORDER.indexOf(right.leg);
      return legDelta || KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind);
    });
  const legs = LEG_ORDER
    .map((leg) => Object.freeze({
      id: leg,
      label: leg === "INGRESS" ? "TO PICKUP" : "TO HANDOFF",
      routes: Object.freeze(accepted.filter((route) => route.leg === leg)),
    }))
    .filter((leg) => leg.routes.length > 0);
  return Object.freeze({
    schema: CASEVAC_ROUTE_BRIEFING_SCHEMA,
    routes: Object.freeze(accepted),
    legs: Object.freeze(legs),
  });
}

function element(document, tagName, className, text) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgElement(document, tagName, attributes = {}) {
  const node = document.createElementNS(SVG_NAMESPACE, tagName);
  for (const [name, value] of Object.entries(attributes)) {
    node.setAttribute(name, String(value));
  }
  return node;
}

function routeSignature(model) {
  return model.routes.map((route) => [
    route.id,
    route.leg,
    route.kind,
    route.initialBearingDeg.toFixed(3),
    route.horizontalLengthM.toFixed(3),
    ...route.points.flatMap((point) => [
      point.eastM.toFixed(3),
      point.northM.toFixed(3),
      point.landmarkLabel ?? "",
    ]),
  ].join(":")).join("|");
}

function routeExtent(routes) {
  const points = routes.flatMap((route) => route.points);
  const east = points.map((point) => point.eastM);
  const north = points.map((point) => point.northM);
  let minimumEast = Math.min(...east);
  let maximumEast = Math.max(...east);
  let minimumNorth = Math.min(...north);
  let maximumNorth = Math.max(...north);
  if (maximumEast - minimumEast < 1) maximumEast = minimumEast + 1;
  if (maximumNorth - minimumNorth < 1) maximumNorth = minimumNorth + 1;
  return { minimumEast, maximumEast, minimumNorth, maximumNorth };
}

function drawMap(document, svg, model) {
  const width = 360;
  const height = 180;
  const inset = 16;
  svg.replaceChildren();
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);

  for (let index = 1; index < 4; index += 1) {
    const x = (width * index) / 4;
    const y = (height * index) / 4;
    svg.append(
      svgElement(document, "line", {
        class: "cvr-grid", x1: x, y1: 0, x2: x, y2: height,
      }),
      svgElement(document, "line", {
        class: "cvr-grid", x1: 0, y1: y, x2: width, y2: y,
      }),
    );
  }

  const extent = routeExtent(model.routes);
  const project = (point) => ({
    x: inset + ((point.eastM - extent.minimumEast)
      / (extent.maximumEast - extent.minimumEast)) * (width - inset * 2),
    y: inset + ((extent.maximumNorth - point.northM)
      / (extent.maximumNorth - extent.minimumNorth)) * (height - inset * 2),
  });

  for (const route of model.routes) {
    const points = route.points
      .map(project)
      .map((point) => `${point.x.toFixed(2)},${point.y.toFixed(2)}`)
      .join(" ");
    svg.append(svgElement(document, "polyline", {
      class: "cvr-path",
      "data-kind": route.kind,
      points,
    }));
  }

  const ingress = model.routes.find((route) => route.leg === "INGRESS");
  const outbound = model.routes.find((route) => route.leg === "OUTBOUND");
  const sites = [
    { label: "START", point: ingress?.points[0] },
    { label: "ORCHARD", point: ingress?.points.at(-1) },
    { label: "CLINIC", point: outbound?.points.at(-1) },
  ].filter((site) => site.point);
  for (const site of sites) {
    const point = project(site.point);
    svg.append(
      svgElement(document, "circle", {
        class: "cvr-point", cx: point.x, cy: point.y, r: 3.2,
      }),
      svgElement(document, "text", {
        class: "cvr-site-label", x: point.x + 6, y: point.y - 5,
      }),
    );
    svg.lastChild.textContent = site.label;
  }
}

export function createCasevacRouteBriefing(document, options = {}) {
  if (!document?.createElement || !document?.createElementNS)
    throw new TypeError("Medevac route briefing requires a DOM document.");
  const mount = options.mount ?? document.body;
  if (!mount?.appendChild)
    throw new TypeError("Medevac route briefing requires a DOM mount.");

  if (!document.querySelector?.("style[data-casevac-route-briefing]")) {
    const style = element(document, "style");
    style.dataset.casevacRouteBriefing = "";
    style.textContent = STYLE_TEXT;
    (document.head ?? mount).appendChild(style);
  }

  const root = element(document, "aside", "cvr-board");
  root.hidden = true;
  root.setAttribute("aria-label", "Medevac reference route sketch");
  const head = element(document, "div", "cvr-head");
  head.append(
    element(document, "strong", "", "ROUTE CARD"),
    element(document, "span", "", "REFERENCE ONLY · NO ROUTE HOLD"),
  );
  const layout = element(document, "div", "cvr-layout");
  const optionsRoot = element(document, "div", "cvr-options");
  const map = svgElement(document, "svg", {
    class: "cvr-map",
    role: "img",
    "aria-label": "Reference geometry for direct and masked Medevac routes",
  });
  layout.append(optionsRoot, map);
  root.append(head, layout);
  if (options.after?.insertAdjacentElement) {
    options.after.insertAdjacentElement("afterend", root);
  } else {
    mount.appendChild(root);
  }

  let disposed = false;
  let signature = "";

  const render = (model) => {
    optionsRoot.replaceChildren();
    for (const leg of model.legs) {
      const legRoot = element(document, "section", "cvr-leg");
      legRoot.appendChild(element(document, "strong", "", leg.label));
      for (const route of leg.routes) {
        const row = element(document, "div", "cvr-option");
        row.dataset.kind = route.kind;
        row.append(
          element(document, "span", "", route.kind),
          element(
            document,
            "span",
            "",
            `${Math.round(route.initialBearingDeg)
              .toString().padStart(3, "0")}° · ${(route.horizontalLengthM / 1000)
              .toFixed(1)} KM`,
          ),
        );
        legRoot.appendChild(row);
        const landmarks = route.points
          .slice(1, -1)
          .map((point) => point.landmarkLabel)
          .filter(Boolean);
        if (landmarks.length > 0) {
          legRoot.appendChild(element(
            document,
            "div",
            "cvr-landmarks",
            landmarks.join(" → "),
          ));
        }
      }
      optionsRoot.appendChild(legRoot);
    }
    drawMap(document, map, model);
  };

  return Object.freeze({
    element: root,
    update({ visible = false, routes = [] } = {}) {
      if (disposed) return;
      const model = casevacRouteBriefingModel(routes);
      const nextSignature = routeSignature(model);
      if (nextSignature !== signature) {
        signature = nextSignature;
        if (model.routes.length > 0) render(model);
      }
      root.hidden = visible !== true || model.routes.length === 0;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      root.remove();
    },
    get disposed() {
      return disposed;
    },
  });
}
