import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  CASEVAC_ROUTE_BRIEFING_SCHEMA,
  casevacRouteBriefingModel,
} from "../casevac_route_briefing.js";

const source = await readFile(
  new URL("../casevac_route_briefing.js", import.meta.url),
  "utf8",
);

function route({
  id,
  leg,
  kind,
  bearing,
  length,
  points,
}) {
  return {
    id,
    label: `${kind} ${leg}`,
    leg,
    kind,
    initial_bearing_deg: bearing,
    horizontal_length_m: length,
    control_points: points.map(([east, north]) => ({
      east_m: east,
      north_m: north,
      landmark_label: null,
    })),
  };
}

test("builds a bounded Ready-only route-card model from projected authority", () => {
  const model = casevacRouteBriefingModel([
    route({
      id: "out.masked",
      leg: "OUTBOUND",
      kind: "MASKED",
      bearing: 118.2,
      length: 5120,
      points: [[0, 0], [900, -1300], [3200, -2400]],
    }),
    route({
      id: "in.masked",
      leg: "INGRESS",
      kind: "MASKED",
      bearing: 157.4,
      length: 3950,
      points: [[-2500, 1800], [-1600, 420], [0, 0]],
    }),
    route({
      id: "in.direct",
      leg: "INGRESS",
      kind: "DIRECT",
      bearing: 121.5,
      length: 3140,
      points: [[-2500, 1800], [-180, 380], [0, 0]],
    }),
  ]);

  assert.equal(model.schema, CASEVAC_ROUTE_BRIEFING_SCHEMA);
  assert.deepEqual(
    model.routes.map((item) => `${item.leg}:${item.kind}`),
    ["INGRESS:DIRECT", "INGRESS:MASKED", "OUTBOUND:MASKED"],
  );
  assert.equal(model.legs[0].label, "TO PICKUP");
  assert.equal(model.legs[1].label, "TO HANDOFF");
  assert.equal(model.routes[0].initialBearingDeg, 121.5);
  assert.equal(model.routes[0].horizontalLengthM, 3140);
});

test("fails closed on unprojected semantics or incomplete geometry", () => {
  const model = casevacRouteBriefingModel([
    route({
      id: "missing-kind",
      leg: "INGRESS",
      kind: "",
      bearing: 90,
      length: 1000,
      points: [[0, 0], [1, 1]],
    }),
    route({
      id: "unknown-kind",
      leg: "INGRESS",
      kind: "FASTEST",
      bearing: 90,
      length: 1000,
      points: [[0, 0], [1, 1]],
    }),
    route({
      id: "one-point",
      leg: "INGRESS",
      kind: "DIRECT",
      bearing: 90,
      length: 1000,
      points: [[0, 0]],
    }),
  ]);

  assert.deepEqual(model.routes, []);
  assert.deepEqual(model.legs, []);
});

test("normalizes bearings without manufacturing route labels or landmarks", () => {
  const model = casevacRouteBriefingModel([
    {
      id: "authority.route",
      label: "Authority label",
      leg: "INGRESS",
      kind: "DIRECT",
      initial_bearing_deg: -10,
      horizontal_length_m: 1200,
      control_points: [
        { east_m: 0, north_m: 0, landmark_label: null },
        { east_m: 10, north_m: 20, landmark_label: null },
      ],
    },
  ]);

  assert.equal(model.routes[0].label, "Authority label");
  assert.equal(model.routes[0].initialBearingDeg, 350);
  assert.deepEqual(model.routes[0].points, [
    { eastM: 0, northM: 0, landmarkLabel: null },
    { eastM: 10, northM: 20, landmarkLabel: null },
  ]);
});

test("retains only server-projected landmark copy for the Ready sketch", () => {
  const model = casevacRouteBriefingModel([{
    id: "masked",
    label: "Masked pickup",
    leg: "INGRESS",
    kind: "MASKED",
    initial_bearing_deg: 157,
    horizontal_length_m: 3900,
    control_points: [
      { east_m: -2500, north_m: 1800, landmark_label: "Departure" },
      { east_m: -1600, north_m: 420, landmark_label: "Rail cut" },
      { east_m: 0, north_m: 0, landmark_label: "Pickup" },
    ],
  }]);

  assert.deepEqual(
    model.routes[0].points.map((point) => point.landmarkLabel),
    ["Departure", "Rail cut", "Pickup"],
  );
});

test("Ready route card is opaque, legible, and keeps edge labels inside the map", () => {
  assert.match(source, /background: #07100d/);
  assert.match(source,
    /#ready-screen\[data-casevac-ready="true"\] \{[\s\S]*opacity: 1;[\s\S]*transition: none;[\s\S]*background: #080d0c/);
  assert.match(source,
    /#ready-screen\[data-casevac-ready="true"\] ~ #boot\.ready \{[\s\S]*opacity: 0;[\s\S]*visibility: hidden;[\s\S]*pointer-events: none;[\s\S]*transition: none/,
    "the opaque card must not be photographed through the outgoing boot cover");
  assert.match(source,
    /#ready-screen\[data-casevac-ready="true"\] #ready-start:not\(:disabled\),[\s\S]*#ready-start:focus-visible:not\(:disabled\)[\s\S]*border: 2px solid #e4ffec[\s\S]*background: #bff2ce/);
  assert.match(source, /\.cvr-head strong \{[\s\S]*font-size: 13px/);
  assert.match(source, /\.cvr-option \{[\s\S]*font-size: 11px/);
  assert.match(source, /\.cvr-site-label \{[\s\S]*700 11px/);
  assert.match(source,
    /point\.x > width - 72 \? point\.x - 7 : point\.x \+ 7[\s\S]*"text-anchor": point\.x > width - 72 \? "end" : "start"/);
});
