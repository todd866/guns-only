import assert from "node:assert/strict";
import test from "node:test";

import {
  CASEVAC_ROUTE_BRIEFING_SCHEMA,
  casevacRouteBriefingModel,
} from "../casevac_route_briefing.js";

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
