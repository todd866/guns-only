import assert from "node:assert/strict";
import test from "node:test";
import { bearingDegrees, signedHeadingDifference, okanaganNavigation,
  okanaganMapFrame, okanaganMapEdge, okanaganNavigationPlaces, placePosition, drawOkanaganMap }
  from "../okanagan_navigation.js";

const own = {x: 0, y: 500, z: 0};
const state = (position, heading = 0) => ({position: own, heading_rad: heading * Math.PI / 180,
  active_gate: 0, route: [{id: "lake-join", label: "JOIN LAKE", position}]});

test("true bearings use east/up/north simulation coordinates, including rear targets", () => {
  for (const [x, z, expected] of [[0, 100, 0], [100, 0, 90], [0, -100, 180], [-100, 0, 270]])
    assert.equal(bearingDegrees(own, {x, z}), expected);
  assert.equal(signedHeadingDifference(5, 355), 10);
  assert.equal(signedHeadingDifference(355, 5), -10);
  assert.equal(signedHeadingDifference(10, 730), 0);
});

test("navigation gives a useful right turn for the real southeast-facing lake join", () => {
  const nav = okanaganNavigation(state({x: -9843, y: 780, z: -6346}, 160));
  assert.equal(nav.direction, "right");
  assert.ok(nav.turnDeg > 70 && nav.turnDeg < 80);
  assert.match(nav.rangeText, /^6\.3 NM$/);
  assert.equal(nav.altitudeText, "2560 FT MSL");
  assert.equal(nav.verticalText, "CLIMB 900 FT");
  assert.match(nav.bearingText, /^237°T$/);
});

test("active authority gate changes the direction and completed routes do not send pilots back", () => {
  const current = state({x: 1852, y: 500, z: 0}, 90);
  current.route.push({id: "home", label: "KELOWNA", position: {x: -1852, y: 433, z: 0}});
  assert.equal(okanaganNavigation(current).turn, "STRAIGHT AHEAD");
  assert.equal(okanaganNavigation(current).rangeText, "1.0 NM");
  current.active_gate = 1;
  assert.equal(okanaganNavigation(current).label, "KELOWNA");
  assert.equal(okanaganNavigation(current).direction, "left");
  current.active_gate = 2;
  assert.equal(okanaganNavigation(current), null);
  current.active_gate = 0; current.position = {x: NaN, y: 500, z: 0};
  assert.equal(okanaganNavigation(current), null);
});

test("north-up map preserves true handedness and local scale while the aircraft moves", () => {
  const a = state({x: 60000, y: 900, z: 60000});
  const frame = okanaganMapFrame(a, 244, 174);
  const centre = frame.project(own);
  assert.ok(frame.project({x: 100, z: 0}).x > centre.x);
  assert.ok(frame.project({x: 0, z: 100}).y < centre.y);
  a.position = {x: 1000, y: 700, z: 3000};
  const moved = okanaganMapFrame(a, 244, 174);
  assert.deepEqual(moved.project(a.position), centre);
  assert.equal(moved.metresPerPixel, frame.metresPerPixel);
  assert.ok(okanaganMapFrame(a, 244, 174, true).metresPerPixel > frame.metresPerPixel);
});

test("off-map waypoint stays on the correct edge and within the map drawing area", () => {
  for (const p of [{x: -1000, y: 90}, {x: 1000, y: 90}, {x: 120, y: -1000}, {x: 120, y: 1000}]) {
    const edge = okanaganMapEdge(p, 244, 174);
    assert.equal(edge.clamped, true);
    assert.ok(edge.x >= 15 && edge.x <= 229);
    assert.ok(edge.y >= 37 && edge.y <= 142);
    assert.equal(Math.sign(edge.x - 122), Math.sign(p.x - 122));
    assert.equal(Math.sign(edge.y - 97), Math.sign(p.y - 97));
  }
});

test("geographic labels share the original simulation anchor and existing named places", () => {
  assert.deepEqual(placePosition({latitude: 49.88, longitude: -119.5}), {x: 0, y: 342, z: 0});
  const places = okanaganNavigationPlaces({
    airfields: [{id: "cylw", latitude: 49.9561, longitude: -119.3778, elevationM: 433}],
    communities: [{id: "town", name: "Kelowna", latitude: 49.888, longitude: -119.496}],
  });
  assert.equal(places.length, 2);
  assert.equal(places[0].name, "KELOWNA AIRPORT");
  assert.equal(places[0].position.y, 433);
  assert.ok(places[0].position.x > 8000 && places[0].position.z > 8000);
  assert.equal(places[1].name, "KELOWNA");
});

test("live map retains condition colours, drop aim and labeled moving traffic inside its clip", () => {
  const current = { ...state({x: 2000, y: 700, z: 1000}),
    sites: [
      {position: {x: -2000, y: 500, z: 300}, status: "lost", threat: 1},
      {position: {x: -1000, y: 500, z: 300}, status: "intact", threat: .4},
      {position: {x: 1000, y: 500, z: 300}, status: "intact", threat: 0},
    ],
    traffic: [{callsign: "BIRD DOG", position: {x: 2500, y: 900, z: 100}}],
    drop_aim: {x: -2500, y: 342, z: 600},
  };
  const ctx = recordingMapContext();
  const frame = drawOkanaganMap(ctx, current, {}, [], 244, 174);
  for (const colour of ["#ad6257", "#ffbc66", "#c6dc9b", "#ffd157"])
    assert.equal(ctx.calls.filter(c => c.method === "fillRect" && c.fillStyle === colour).length, 1);
  const callsign = ctx.calls.find(c => c.method === "fillText" && c.args[0] === "BIRD DOG");
  assert.ok(callsign, "the live traffic callsign must be visible");
  assert.deepEqual(callsign.clip, [0, 29, 244, 120]);
  const aim = frame.project(current.drop_aim);
  const ring = ctx.calls.find(c => c.method === "arc" && c.strokeStyle === "#ff6a2a");
  assert.ok(ring, "the actual drop point must have its existing orange ring");
  assert.deepEqual(ring.args.slice(0, 3), [aim.x, aim.y, 6]);
  assert.deepEqual(ring.clip, callsign.clip);
  assert.ok(ctx.calls.some(c => c.method === "stroke" && c.strokeStyle === "#ff6a2a"));
  const marker = ctx.calls.find(c => c.method === "fillRect" && c.fillStyle === "#ffd157");
  current.traffic[0].position.x -= 1000;
  current.sites[2].threat = .5;
  const next = recordingMapContext();
  drawOkanaganMap(next, current, {}, [], 244, 174);
  assert.ok(next.calls.find(c => c.method === "fillRect" && c.fillStyle === "#ffd157").args[0] < marker.args[0]);
  assert.equal(next.calls.filter(c => c.method === "fillRect" && c.fillStyle === "#ffbc66").length, 2);
});

test("invalid live overlay coordinates cannot reach canvas or invent a map marker", () => {
  const ctx = recordingMapContext();
  drawOkanaganMap(ctx, { ...state({x: 2000, y: 700, z: 1000}),
    sites: [null, {position: {x: NaN, y: 500, z: 0}}],
    traffic: [null, {callsign: "BROKEN", position: {x: 0, y: 500, z: Infinity}}],
    drop_aim: {x: 0, z: 0},
  }, {}, [], 244, 174);
  assert.ok(!ctx.calls.some(c => c.fillStyle === "#ffd157" || c.strokeStyle === "#ff6a2a"));
  assert.ok(!ctx.calls.some(c => c.method === "fillRect" && ["#ad6257", "#ffbc66", "#c6dc9b"].includes(c.fillStyle)));
});

test("long traffic labels fit the small landscape map and retain a recognizable prefix", () => {
  const ctx = recordingMapContext();
  drawOkanaganMap(ctx, { ...state({x: 2000, y: 700, z: 1000}), route: [], traffic: [
    {callsign: "BIRD DOG LONG LONG LONG CALLSIGN", position: {x: -5500, y: 900, z: 0}},
    {callsign: "TANKER LONG LONG LONG CALLSIGN", position: {x: 5500, y: 900, z: 0}},
  ] }, {}, [], 184, 106);
  const labels = ctx.calls.filter(c => c.method === "fillText" && c.fillStyle === "#ffd157");
  assert.equal(labels.length, 2);
  assert.match(labels[0].args[0], /^BIRD DOG/);
  assert.match(labels[1].args[0], /^TANKER/);
  for (const label of labels) {
    const [text, x, y] = label.args;
    const width = ctx.measureText(text).width;
    const left = label.textAlign === "right" ? x - width : x;
    assert.ok(left >= 5 && left + width <= 179);
    assert.ok(y >= 40 && y <= 77);
    assert.deepEqual(label.clip, [0, 29, 184, 52]);
    assert.ok(text.endsWith("…"));
  }
});

test("compact map reserves the next waypoint before placing a nearby airport label", () => {
  const ctx = recordingMapContext();
  drawOkanaganMap(ctx, state({x: 350, y: 500, z: -800}), {}, [
    {name: "KELOWNA AIRPORT", kind: "airport", position: {x: 100, y: 433, z: -750}},
  ], 184, 106);
  const next = ctx.calls.find(c => c.method === "fillText" && c.args[0] === "NEXT");
  const airport = ctx.calls.find(c => c.method === "fillText" && c.args[0].startsWith("KELOWNA"));
  assert.ok(next, "the active waypoint is never hidden to make room for a place");
  assert.ok(airport, "this fixture has room to move the airport label above NEXT");
  assert.ok(airport.args[2] + 3 < next.args[2] - 9, "the two text rows must not overlap");
});

// Record the real renderer's canvas operations, including clipping and styles. Reject any
// non-finite geometry rather than allowing browser canvas silently to ignore a bad marker.
function recordingMapContext() {
  const calls = [], stack = [];
  const ctx = {calls, fillStyle: "", strokeStyle: "", textAlign: "left", clipRect: null,
    measureText: text => ({width: String(text).length * 5.4}),
    save() { stack.push({fillStyle: this.fillStyle, strokeStyle: this.strokeStyle,
      textAlign: this.textAlign, clipRect: this.clipRect}); },
    restore() { Object.assign(this, stack.pop()); },
    clip() { this.clipRect = this.lastRect; },
  };
  for (const method of ["clearRect", "fillRect", "beginPath", "rect", "moveTo", "lineTo",
    "closePath", "fill", "stroke", "arc", "fillText", "translate", "rotate", "setLineDash"])
    ctx[method] = function(...args) {
      assert.ok(args.flat().filter(v => typeof v === "number").every(Number.isFinite), `${method} has finite geometry`);
      if (method === "rect") this.lastRect = args;
      calls.push({method, args, fillStyle: this.fillStyle, strokeStyle: this.strokeStyle,
        textAlign: this.textAlign, clip: this.clipRect});
    };
  return ctx;
}
