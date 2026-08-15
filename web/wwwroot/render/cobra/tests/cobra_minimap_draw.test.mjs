import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { cobraTacticalMapModel } from "../cobra_tactical_map.js";
import {
  COBRA_MAP_CAPTION_PX,
  COBRA_MAP_COLORS,
  drawCobraTacticalMap,
} from "../cobra_tactical_map_draw.js";

/**
 * Recording 2D-context double. Canvas does not exist headless, so the assertions are made
 * against the CALL LOG: every method records its name and arguments, and the property setters
 * that carry meaning (fillStyle, strokeStyle, font) record their assignment in the same stream,
 * so a fill can be attributed to the style that was live when it happened.
 *
 * It also tracks the translate offset across save/restore, which is what lets the pixel-box
 * assertion follow the player marker into its rotated local frame.
 */
function recordingContext() {
  const calls = [];
  const stack = [];
  let state = { fillStyle: "", strokeStyle: "", font: "", tx: 0, ty: 0 };
  const record = (name, args) => {
    calls.push({ name, args, fillStyle: state.fillStyle, strokeStyle: state.strokeStyle, font: state.font, tx: state.tx, ty: state.ty });
  };
  const ctx = {
    calls,
    save() { stack.push({ ...state }); record("save", []); },
    restore() { const popped = stack.pop(); if (popped) state = popped; record("restore", []); },
    translate(x, y) { record("translate", [x, y]); state.tx += x; state.ty += y; },
    rotate(angle) { record("rotate", [angle]); },
    beginPath() { record("beginPath", []); },
    closePath() { record("closePath", []); },
    moveTo(...args) { record("moveTo", args); },
    lineTo(...args) { record("lineTo", args); },
    rect(...args) { record("rect", args); },
    arc(...args) { record("arc", args); },
    clip() { record("clip", []); },
    fill() { record("fill", []); },
    stroke() { record("stroke", []); },
    fillRect(...args) { record("fillRect", args); },
    strokeRect(...args) { record("strokeRect", args); },
    clearRect(...args) { record("clearRect", args); },
    fillText(...args) { record("fillText", args); },
  };
  for (const prop of ["fillStyle", "strokeStyle", "font", "lineWidth", "globalAlpha", "textAlign", "textBaseline"]) {
    Object.defineProperty(ctx, prop, {
      get: () => state[prop],
      set(value) { state[prop] = value; },
    });
  }
  return ctx;
}

const SITES = [
  { id: "bridge", label: "Bridge", x_m: 200, y_m: 0, z_m: 800, owner: "friendly", capture_progress: 0, contested: false, capture_radius_m: 60 },
  { id: "ford", label: "Ford", x_m: 800, y_m: 0, z_m: 200, owner: "hostile", capture_progress: 0.5, contested: true, capture_radius_m: 60 },
];
const BOUNDS = { minEastM: 0, maxEastM: 1000, minNorthM: 0, maxNorthM: 1000 };

function model(overrides = {}) {
  return cobraTacticalMapModel({
    sites: SITES,
    units: [
      { id: "ford.garrison", faction: "hostile", alive: true, x_m: 810, y_m: 0, z_m: 210,
        role: "hard-point", home_site_id: "ford" },
      { id: "observer.ridge", faction: "hostile", alive: true, x_m: 700, y_m: 0, z_m: 350,
        role: "dshk-site", home_site_id: "ford", air_threat_range_m: 5_500 },
      { id: "fri.1", faction: "friendly", alive: true, x_m: 250, y_m: 0, z_m: 760, role: "infantry" },
    ],
    tickets: { friendly: 280, hostile: 190 },
    player: { eastM: 500, northM: 500, headingRad: 1.1 },
    bounds: BOUNDS,
    widthPx: 200,
    heightPx: 200,
    showUnits: false,
    ...overrides,
  });
}

function fillsAfterArcs(calls) {
  const fills = [];
  let lastArc = null;
  for (const call of calls) {
    if (call.name === "arc") lastArc = call;
    if (call.name === "fill" && lastArc) {
      fills.push({ arc: lastArc.args, fillStyle: call.fillStyle });
      lastArc = null;
    }
    if (call.name === "stroke") lastArc = null;
  }
  return fills;
}

test("every site in the model produces a filled disc", () => {
  const ctx = recordingContext();
  const map = model();
  drawCobraTacticalMap(ctx, map);
  const discs = fillsAfterArcs(ctx.calls);
  for (const site of map.sites) {
    assert.ok(
      discs.some(({ arc }) => Math.abs(arc[0] - site.x) < 1e-6 && Math.abs(arc[1] - site.y) < 1e-6),
      `no filled disc at ${site.id}`,
    );
  }
});

test("a hostile site and a friendly site fill in different colours", () => {
  const ctx = recordingContext();
  const map = model();
  drawCobraTacticalMap(ctx, map);
  const discs = fillsAfterArcs(ctx.calls);
  const friendly = map.sites.find((site) => site.owner === "friendly");
  const hostile = map.sites.find((site) => site.owner === "hostile");
  const styleAt = (site) => discs.find(({ arc }) => Math.abs(arc[0] - site.x) < 1e-6 && Math.abs(arc[1] - site.y) < 1e-6)?.fillStyle;
  assert.equal(styleAt(friendly), COBRA_MAP_COLORS.friendly);
  assert.equal(styleAt(hostile), COBRA_MAP_COLORS.hostile);
  assert.notEqual(styleAt(friendly), styleAt(hostile));
});

test("the player marker is drawn rotated by its heading, and is not a site disc", () => {
  const ctx = recordingContext();
  const map = model({ player: { eastM: 500, northM: 500, headingRad: 2.4 } });
  drawCobraTacticalMap(ctx, map);
  const rotate = ctx.calls.find((call) => call.name === "rotate");
  assert.ok(rotate, "player marker never rotated");
  assert.equal(rotate.args[0], 2.4);
  const translate = ctx.calls.find((call) => call.name === "translate"
    && Math.abs(call.args[0] - map.player.x) < 1e-6
    && Math.abs(call.args[1] - map.player.y) < 1e-6);
  assert.ok(translate, "player marker was not translated to the player position");
  assert.deepEqual(translate.args, [map.player.x, map.player.y]);
  // Triangle, not a disc: a closed path of straight segments in the player's own colour.
  const closed = ctx.calls.filter((call) => call.name === "closePath");
  assert.ok(closed.length >= 1);
  const playerFill = ctx.calls.find((call) => call.name === "fill" && call.fillStyle === COBRA_MAP_COLORS.player);
  assert.ok(playerFill, "player marker not filled in the player colour");
  assert.ok(ctx.calls.filter((call) => call.name === "lineTo").length >= 3);
});

test("a north-up map never rotates the whole chart, only the player", () => {
  const ctx = recordingContext();
  drawCobraTacticalMap(ctx, model({ player: { eastM: 500, northM: 500, headingRad: 2.4 } }));
  assert.equal(ctx.calls.filter((call) => call.name === "rotate").length, 1);
});

test("capture_progress 0 draws no arc and 0.5 draws one", () => {
  const flat = SITES.map((site) => ({ ...site, capture_progress: 0, contested: false }));
  const zeroCtx = recordingContext();
  drawCobraTacticalMap(zeroCtx, model({ sites: flat }));
  // The objective ring is also a stroked arc, so count only arcs stroked in a FACTION colour —
  // those are the capture-progress rings this test is about.
  const strokedArcs = (calls) => {
    let count = 0;
    let lastArc = null;
    for (const call of calls) {
      if (call.name === "arc") lastArc = call;
      if (call.name === "stroke" && lastArc) {
        if (call.strokeStyle === COBRA_MAP_COLORS.friendly
          || call.strokeStyle === COBRA_MAP_COLORS.hostile) count += 1;
        lastArc = null;
      }
      if (call.name === "fill") lastArc = null;
    }
    return count;
  };
  assert.equal(strokedArcs(zeroCtx.calls), 0);

  const halfCtx = recordingContext();
  const half = flat.map((site) => (site.id === "ford" ? { ...site, capture_progress: 0.5 } : site));
  drawCobraTacticalMap(halfCtx, model({ sites: half }));
  assert.equal(strokedArcs(halfCtx.calls), 1);
  // The objective ring is an arc too, so pick the arc whose stroke was a faction colour.
  const arcs = [];
  let pendingArc = null;
  for (const call of halfCtx.calls) {
    if (call.name === "arc") pendingArc = call;
    if (call.name === "stroke" && pendingArc) {
      if (call.strokeStyle === COBRA_MAP_COLORS.friendly
        || call.strokeStyle === COBRA_MAP_COLORS.hostile) arcs.push(pendingArc);
      pendingArc = null;
    }
    if (call.name === "fill") pendingArc = null;
  }
  const progressArc = arcs.at(-1);
  // Half a capture is half a turn, opened from north.
  assert.ok(Math.abs((progressArc.args[4] - progressArc.args[3]) - Math.PI) < 1e-9);
});

test("nothing is drawn outside the pixel box", () => {
  const ctx = recordingContext();
  // Sites and a player pushed well outside the bounds: the projection clamps, the draw clips.
  const map = cobraTacticalMapModel({
    sites: [{ id: "far", label: "Far", x_m: 9_000, y_m: 0, z_m: -9_000, owner: "hostile", capture_progress: 0.9, contested: true, capture_radius_m: 60 }],
    player: { eastM: -8_000, northM: 12_000, headingRad: 0.3 },
    bounds: BOUNDS,
    widthPx: 200,
    heightPx: 200,
    showUnits: false,
  });
  drawCobraTacticalMap(ctx, map);
  const clip = ctx.calls.find((call) => call.name === "clip");
  assert.ok(clip, "the map must clip to its own box");
  const clipRect = ctx.calls.filter((call) => call.name === "rect").at(-1);
  assert.deepEqual(clipRect.args, [0, 0, 200, 200]);

  const MARKER_MARGIN_PX = 18; // marker radii, drawn inside the clip
  for (const call of ctx.calls) {
    if (!["arc", "moveTo", "lineTo", "fillText"].includes(call.name)) continue;
    const [a, b] = call.name === "fillText" ? [call.args[1], call.args[2]] : call.args;
    const x = call.tx + Number(a);
    const y = call.ty + Number(b);
    assert.ok(x >= -MARKER_MARGIN_PX && x <= 200 + MARKER_MARGIN_PX, `${call.name} x ${x} outside box`);
    assert.ok(y >= -MARKER_MARGIN_PX && y <= 200 + MARKER_MARGIN_PX, `${call.name} y ${y} outside box`);
  }
});

test("the minimap names only the objective; the full map names everything", () => {
  // Four names on a 200 px chart overran the edge and collided. The question a minimap answers
  // is "which of these am I going to", so it names that one and leaves the rest to position,
  // colour and the full map.
  const minimapCtx = recordingContext();
  const miniModel = model();
  drawCobraTacticalMap(minimapCtx, miniModel, {
    full: false,
    headerPx: COBRA_MAP_CAPTION_PX.mini,
    caption: { line: "DESTROY GARRISON · FORD", detail: "Clear the point" },
  });
  const miniTexts = minimapCtx.calls
    .filter((call) => call.name === "fillText")
    .map((call) => String(call.args[0]));
  const objectiveLabel = miniModel.sites
    .find((site) => site.id === miniModel.objective.siteId).label.toUpperCase();
  assert.ok(miniTexts.includes(objectiveLabel),
    `objective must be named on the minimap: ${miniTexts.join(" | ")}`);
  assert.ok(!miniTexts.includes("BRIDGE"),
    "a non-objective point must not be named on the minimap");
  assert.ok(miniTexts.includes("◇ FORD · 1 TGT · △ 1 AA"),
    `tactical summary missing from minimap: ${miniTexts.join(" | ")}`);
  assert.ok(!miniTexts.some((text) => /FRIENDLY 280|HOSTILE 190/.test(text)),
    "expanded ticket labels belong to the full map only");

  const fullCtx = recordingContext();
  const fullModel = model({ widthPx: 1_200, heightPx: 800, showUnits: true });
  drawCobraTacticalMap(fullCtx, fullModel, { full: true });
  const texts = fullCtx.calls.filter((call) => call.name === "fillText").map((call) => String(call.args[0]));
  assert.ok(texts.includes("BRIDGE"), `site labels missing: ${texts.join(" | ")}`);
  assert.ok(texts.includes("FORD"));
  assert.ok(texts.some((text) => /FRIENDLY 280/.test(text)), "friendly ticket count missing");
  assert.ok(texts.some((text) => /HOSTILE 190/.test(text)), "hostile ticket count missing");
  assert.ok(!texts.some((text) => /^PTS /.test(text)),
    "the full map keeps its expanded bars instead of repeating the compact score");
  // Ticket bars are the only filled rectangles besides the backing and the legend swatches.
  const bars = fullCtx.calls.filter((call) => call.name === "fillRect");
  assert.ok(bars.length >= 5, "ticket bars not drawn");
  assert.ok(texts.some((text) => /CONTESTED/.test(text)), "legend missing");
});

test("the full map shows units and the minimap does not", () => {
  const minimapCtx = recordingContext();
  drawCobraTacticalMap(minimapCtx, model({ showUnits: false }));
  const fullCtx = recordingContext();
  drawCobraTacticalMap(fullCtx, model({ widthPx: 1_200, heightPx: 800, showUnits: true }), { full: true });
  assert.ok(
    fillsAfterArcs(fullCtx.calls).length > fillsAfterArcs(minimapCtx.calls).length,
    "units should add filled markers to the full map",
  );
});

test("a short objective line runs from the player toward the nearest hostile point", () => {
  const ctx = recordingContext();
  const map = model();
  drawCobraTacticalMap(ctx, map);
  const line = ctx.calls.findIndex((call) => call.name === "moveTo"
    && Math.abs(call.args[0] - map.player.x) < 1e-6
    && Math.abs(call.args[1] - map.player.y) < 1e-6);
  assert.ok(line >= 0, "no objective line from the player");
  const to = ctx.calls[line + 1];
  assert.equal(to.name, "lineTo");
  const target = map.sites.find((site) => site.id === map.objective.siteId);
  const length = Math.hypot(to.args[0] - map.player.x, to.args[1] - map.player.y);
  assert.ok(length > 0 && length <= 34.001, `objective line ${length}px is not a short cue`);
  // Pointing at the objective, not away from it.
  const dot = (to.args[0] - map.player.x) * (target.x - map.player.x)
    + (to.args[1] - map.player.y) * (target.y - map.player.y);
  assert.ok(dot > 0);
});

test("M toggles the full map, and Escape closes it before it pauses", async () => {
  const main = await readFile(new URL("../../../cobra-lab/main.js", import.meta.url), "utf8");
  assert.match(main, /event\.code === "KeyM"/);
  assert.match(main, /setTacticalMapOpen\(!tacticalMapOpen\)/);
  // Escape ordering is load-bearing: onboarding first (it is the topmost layer), then the map,
  // then pause. A map close that landed after setMissionPaused would be hidden by the menu.
  const escapeHandler = main.match(/window\.addEventListener\("keydown", \(event\) => \{\n {2}if \(event\.code !== "Escape"\)[\s\S]*?\n\}, true\);/)?.[0] ?? "";
  assert.ok(escapeHandler.length > 0, "capture-phase Escape listener not found");
  assert.ok(
    escapeHandler.indexOf('action === "dismiss-onboarding"')
      < escapeHandler.indexOf('action === "close-map"'),
    "the onboarding card must keep first claim on Escape",
  );
  assert.ok(
    escapeHandler.indexOf('action === "close-map"') < escapeHandler.indexOf("setMissionPaused"),
    "Escape must close the map before it pauses the sortie",
  );
  // Opening the map must not pause the sim: no branch in the frame loop may gate on it.
  const animate = main.match(/function animate\(timeMs\) \{[\s\S]*?\n\}\n/)?.[0] ?? "";
  assert.doesNotMatch(animate, /tacticalMapOpen/);
  // The key is announced where the player will read it.
  const controls = await readFile(
    new URL("../../onboarding/controls_content.js", import.meta.url),
    "utf8",
  );
  assert.match(controls, /\["M · MAP", "Score and captures — the fight keeps running"\]/);
});

test("an empty ground war draws the chrome and does not throw", () => {
  const ctx = recordingContext();
  drawCobraTacticalMap(ctx, cobraTacticalMapModel({ bounds: BOUNDS, widthPx: 200, heightPx: 200 }));
  assert.ok(ctx.calls.some((call) => call.name === "strokeRect"));
});

/**
 * The objective caption is not decoration: `body[data-shell="play"] .objective-hud` is
 * display:none (Build 302 — mission cues live on the instrument, not in a prose card), so the
 * chart caption is the ONLY path by which conquest orders reach a player who is flying. If
 * these go quiet the mission silently stops telling anyone what to do, which is the exact
 * defect this feature exists to fix.
 */
test("the objective caption reaches the minimap, above the chart", () => {
  const ctx = recordingContext();
  const map = model({ heightPx: 154 });
  drawCobraTacticalMap(ctx, map, {
    headerPx: COBRA_MAP_CAPTION_PX.mini,
    caption: { line: "DESTROY GARRISON · LONG FANG", detail: "1.8 km" },
  });
  // Three lines: order, place, then persistent target/threat summary. They are drawn in the BAND,
  // before the chart is translated down; site labels and chart furniture follow underneath.
  const texts = ctx.calls.filter((call) => call.name === "fillText");
  assert.deepEqual(
    texts.slice(0, 3).map((call) => String(call.args[0])),
    ["DESTROY GARRISON", "LONG FANG", "◇ FORD · 1 TGT · △ 1 AA"],
  );
  const captionRowsY = texts.slice(0, 3).map((call) => call.args[2]);
  assert.ok(captionRowsY[0] < captionRowsY[1] && captionRowsY[1] < captionRowsY[2],
    `caption rows overlap or run out of order: ${captionRowsY.join(", ")}`);
  assert.ok(captionRowsY.every((y) => y > 0 && y < COBRA_MAP_CAPTION_PX.mini),
    "every caption row must sit inside its band");
  assert.ok(
    ctx.calls.some((call) => call.name === "translate"
      && call.args[1] === COBRA_MAP_CAPTION_PX.mini),
    "the chart must be translated below the caption band",
  );
});

test("the full map caption carries the detail line too", () => {
  const ctx = recordingContext();
  const model = cobraTacticalMapModel({ bounds: BOUNDS, widthPx: 900, heightPx: 700 });
  drawCobraTacticalMap(ctx, model, {
    full: true,
    headerPx: COBRA_MAP_CAPTION_PX.full,
    caption: { line: "DESTROY GARRISON · LONG FANG", detail: "1.8 km — kill the garrison" },
  });
  const texts = ctx.calls.filter((call) => call.name === "fillText").map((call) => String(call.args[0]));
  assert.ok(texts.includes("DESTROY GARRISON · LONG FANG"));
  assert.ok(texts.includes("1.8 km — kill the garrison"));
});

test("no caption means no band and no translate", () => {
  const ctx = recordingContext();
  const model = cobraTacticalMapModel({ bounds: BOUNDS, widthPx: 200, heightPx: 200 });
  drawCobraTacticalMap(ctx, model, { headerPx: COBRA_MAP_CAPTION_PX.mini, caption: null });
  // The chart furniture (north arrow, scale bar) is always drawn — what must be absent is the
  // caption band itself and the translate that makes room for it.
  const texts = ctx.calls
    .filter((call) => call.name === "fillText")
    .map((call) => String(call.args[0]));
  assert.ok(!texts.some((text) => /GARRISON|LIFT|CLEAR|HOLDING/.test(text)),
    `caption text drawn with no caption: ${texts.join(" | ")}`);
  assert.ok(!ctx.calls.some((call) => call.name === "translate" && call.args[1] === COBRA_MAP_CAPTION_PX.mini));
});

test("the target and threat summary remains visible when the combat order is absent", () => {
  const ctx = recordingContext();
  drawCobraTacticalMap(ctx, model({ heightPx: 154 }), {
    headerPx: COBRA_MAP_CAPTION_PX.mini,
    caption: null,
  });
  const texts = ctx.calls
    .filter((call) => call.name === "fillText")
    .map((call) => String(call.args[0]));
  assert.equal(texts[0], "◇ FORD · 1 TGT · △ 1 AA");
  assert.ok(ctx.calls.some((call) => call.name === "translate"
    && call.args[1] === COBRA_MAP_CAPTION_PX.mini),
  "the chart must still make room for its persistent tactical band");
});

test("the lab wires the objective caption into both charts", async () => {
  const main = await readFile(new URL("../../../cobra-lab/main.js", import.meta.url), "utf8");
  const draw = main.match(/function drawTacticalMaps\(timeMs\) \{[\s\S]*?\n\}\n/)?.[0] ?? "";
  assert.ok(draw.length > 0, "drawTacticalMaps not found");
  assert.match(draw, /cobraObjectiveCopy\(/);
  assert.equal((draw.match(/caption/g) ?? []).length >= 3, true);
});

test("a caption too long for its band is ellipsised, not cut off by the canvas edge", () => {
  const ctx = recordingContext();
  // Approximate a real measureText: the double has none, so opt this context in.
  ctx.measureText = (text) => ({ width: String(text).length * 6 });
  const model = cobraTacticalMapModel({ bounds: BOUNDS, widthPx: 200, heightPx: 174 });
  drawCobraTacticalMap(ctx, model, {
    headerPx: COBRA_MAP_CAPTION_PX.mini,
    caption: { line: "DESTROY GARRISON · CAU SONG MA · THE JAW AND THEN SOME MORE WORDS" },
  });
  const drawn = ctx.calls
    .filter((call) => call.name === "fillText")
    .map((call) => String(call.args[0]));
  assert.equal(drawn[0], "DESTROY GARRISON", "the order is short enough to survive whole");
  assert.ok(drawn[1].endsWith("…"), `expected an ellipsis, drew ${JSON.stringify(drawn[1])}`);
  for (const line of drawn) {
    assert.ok(line.length * 6 <= 200 - 14, `caption line overflows its band: ${line}`);
  }
});

test("both chart canvases carry explicit dimensions", async () => {
  // A <canvas> is a replaced element: `position: absolute; inset: 0` with width/height auto
  // leaves it at its intrinsic 300x150. The full map shipped that way in review and drew the
  // whole chart, legend and ticket bars into a 300x150 box in the top-left corner.
  const css = await readFile(new URL("../../../cobra-lab/styles.css", import.meta.url), "utf8");
  for (const id of ["#minimap", "#tactical-map"]) {
    const block = css.match(new RegExp(`\\${id} \\{[^}]*\\}`))?.[0] ?? "";
    assert.ok(block.length > 0, `${id} has no style block`);
    assert.match(block, /(^|\s)width:/, `${id} must set an explicit width`);
    assert.match(block, /(^|\s)height:/, `${id} must set an explicit height`);
  }
});

test("the capture ring belongs to the side taking the point, not always friendly", () => {
  // capture_progress is published as progress toward the NON-owner. Painting it friendly
  // unconditionally drew a friendly ring on a friendly point being overrun — the map claimed
  // you were winning a point you were losing.
  const ringStyle = (owner) => {
    const ctx = recordingContext();
    drawCobraTacticalMap(ctx, cobraTacticalMapModel({
      sites: [{ id: "s", label: "S", x_m: 500, y_m: 0, z_m: 500, owner, capture_progress: 0.4, contested: false, capture_radius_m: 60 }],
      player: { eastM: 0, northM: 0, headingRad: 0 },
      bounds: BOUNDS, widthPx: 200, heightPx: 200, showUnits: false,
    }));
    let lastArc = null;
    for (const call of ctx.calls) {
      if (call.name === "arc") lastArc = call;
      if (call.name === "stroke" && lastArc) return call.strokeStyle;
      if (call.name === "fill") lastArc = null;
    }
    return null;
  };
  assert.equal(ringStyle("friendly"), COBRA_MAP_COLORS.hostile);
  assert.equal(ringStyle("hostile"), COBRA_MAP_COLORS.friendly);
});
