import assert from "node:assert/strict";
import test from "node:test";

import {
  cobraDebriefEvidence,
  cobraDebriefPresentation,
  cobraNextSortieCorrection,
  cobraObstacleStrikeDetail,
} from "../cobra_debrief.js";

function war({
  outcome = "none",
  outcomeReason = "",
  friendlyKills = 0,
  sites = null,
  friendlyTickets = 240,
  hostileTickets = 180,
} = {}) {
  return {
    outcome,
    outcome_reason: outcomeReason,
    time_limit_s: 600,
    tickets: { friendly: friendlyTickets, hostile: hostileTickets },
    sites: sites ?? [
      { id: "bridge", owner: "friendly" },
      { id: "ford", owner: "friendly" },
      { id: "ridge", owner: "hostile" },
      { id: "ember", owner: "neutral" },
    ],
    debrief: {
      hostile_kills: 12,
      friendly_kills: friendlyKills,
      rounds_expended: 347,
      fob_rearms: 2,
      elapsed_s: 413.6,
    },
  };
}

test("a lost aircraft after ground victory reports both the held valley and failed recovery", () => {
  const result = cobraDebriefPresentation({
    war: war({ outcome: "victory", outcomeReason: "tickets-exhausted" }),
    authorityState: { airframe_swaps: 1 },
    status: "vehicle-authority-lost",
    terminalTitle: "ROTOR STRIKE",
    terminalDetail: "Main rotor struck terrain.",
  });

  assert.equal(result.strategicOutcome, "victory");
  assert.equal(result.recoveryFailed, true);
  assert.equal(result.tone, "mixed");
  assert.equal(result.title, "VALLEY HELD · RECOVERY FAILED");
  assert.match(result.detail, /Hostile tickets exhausted/);
  assert.match(result.detail, /Main rotor struck terrain/);
  assert.doesNotMatch(result.detail, /Recovery failed|ROTOR STRIKE/);
  assert.match(result.statusText, /VALLEY HELD · RECOVERY FAILED/);
});

test("a lost aircraft after strategic defeat preserves both negative axes", () => {
  const result = cobraDebriefPresentation({
    war: war({ outcome: "defeat", outcomeReason: "tickets-exhausted" }),
    status: "obstacle-collision",
    terminalTitle: "OBSTACLE STRIKE",
    terminalDetail: "Flew into the bridge span.",
  });

  assert.equal(result.strategicOutcome, "defeat");
  assert.equal(result.recoveryFailed, true);
  assert.equal(result.title, "VALLEY LOST · RECOVERY FAILED");
  assert.match(result.detail, /Friendly tickets exhausted/);
  assert.match(result.detail, /Flew into the bridge span/);
  assert.doesNotMatch(result.detail, /Recovery failed|OBSTACLE STRIKE/);
});

test("a completed recovery retains the clean strategic result", () => {
  const result = cobraDebriefPresentation({
    war: war({ outcome: "victory" }),
    status: "victory",
    terminalTitle: "unused",
    terminalDetail: "unused",
  });

  assert.equal(result.recoveryFailed, false);
  assert.equal(result.title, "VALLEY HELD");
  assert.doesNotMatch(result.detail, /Recovery failed/);
  assert.equal(result.statusLevel, "ready");
});

test("time-limit defeat explains that the point board outranked the ticket lead", () => {
  const result = cobraDebriefPresentation({
    war: war({
      outcome: "defeat",
      outcomeReason: "time-limit",
      friendlyTickets: 260,
      hostileTickets: 210,
      sites: [
        { id: "a", owner: "friendly" },
        { id: "b", owner: "hostile" },
        { id: "c", owner: "hostile" },
        { id: "d", owner: "hostile" },
      ],
    }),
    status: "defeat",
  });

  assert.equal(result.title, "VALLEY LOST");
  assert.equal(result.outcomeReason, "time-limit");
  assert.match(result.detail, /10:00 · Points 1–3 · Tickets 260–210/);
  assert.match(result.detail, /Points decide/);
  assert.doesNotMatch(result.detail, /ground war is lost|reinforcements ran out/i);
});

test("time-limit defeat explains tickets when the point board is tied", () => {
  const result = cobraDebriefPresentation({
    war: war({
      outcome: "defeat",
      outcomeReason: "time-limit",
      friendlyTickets: 190,
      hostileTickets: 230,
      sites: [
        { id: "a", owner: "friendly" },
        { id: "b", owner: "friendly" },
        { id: "c", owner: "hostile" },
        { id: "d", owner: "hostile" },
      ],
    }),
    status: "defeat",
  });

  assert.match(result.detail, /Points 2–2 · Tickets 190–230/);
  assert.match(result.detail, /Tickets break ties/);
  assert.equal(cobraNextSortieCorrection({ presentation: result, status: "defeat" }),
    "Lead on points by 10:00.");
});

test("time-limit dead heat states the authored loss rule instead of a generic defeat", () => {
  const result = cobraDebriefPresentation({
    war: war({
      outcome: "defeat",
      outcomeReason: "time-limit",
      friendlyTickets: 220,
      hostileTickets: 220,
      sites: [
        { id: "a", owner: "friendly" },
        { id: "b", owner: "friendly" },
        { id: "c", owner: "hostile" },
        { id: "d", owner: "hostile" },
      ],
    }),
    status: "defeat",
  });

  assert.match(result.detail, /Points 2–2 · Tickets 220–220/);
  assert.match(result.detail, /Ties lose/);
});

test("time-limit victory explains when tickets break a tied point board", () => {
  const result = cobraDebriefPresentation({
    war: war({
      outcome: "victory",
      outcomeReason: "time-limit",
      friendlyTickets: 240,
      hostileTickets: 180,
      sites: [
        { id: "a", owner: "friendly" },
        { id: "b", owner: "friendly" },
        { id: "c", owner: "hostile" },
        { id: "d", owner: "hostile" },
      ],
    }),
    status: "victory",
  });

  assert.match(result.detail, /Points 2–2 · Tickets 240–180/);
  assert.match(result.detail, /Tickets break ties/);
  assert.equal(result.title, "VALLEY HELD");
});

test("evidence records rounds, friendly kills, and the other debrief facts", () => {
  assert.deepEqual(cobraDebriefEvidence(
    war({ friendlyKills: 2 }),
    { airframe_swaps: 3 },
  ), {
    friendlyPoints: 2,
    hostilePoints: 1,
    heldPoints: 3,
    friendlyTickets: 240,
    hostileTickets: 180,
    hostileKills: 12,
    friendlyKills: 2,
    roundsExpended: 347,
    fobRearms: 2,
    airframeSwaps: 3,
    battleSeconds: 413.6,
  });
});

test("friendly fire is always the first next-sortie correction", () => {
  const presentation = cobraDebriefPresentation({
    war: war({ outcome: "victory", friendlyKills: 2 }),
    status: "victory",
  });

  const correction = cobraNextSortieCorrection({ presentation, status: "victory" });
  assert.equal(correction, "Friendly fire: 2. Check target.");
  assert.doesNotMatch(correction, /did well|good job|repeat the same route/i);
});

test("mixed victory corrects the recovery instead of pretending the fight must be repeated", () => {
  const presentation = cobraDebriefPresentation({
    war: war({ outcome: "victory" }),
    status: "vehicle-authority-lost",
    terminalTitle: "AIRFRAME LOST",
    terminalDetail: "Terrain strike.",
  });

  const correction = cobraNextSortieCorrection({
    presentation,
    status: "vehicle-authority-lost",
  });
  assert.equal(correction, "Land at Ember.");
  assert.doesNotMatch(correction, /repeat/i);
});

test("water contact gets one specific correction", () => {
  const presentation = cobraDebriefPresentation({
    war: war(),
    status: "vehicle-authority-lost",
    terminalTitle: "INTO THE RIVER",
    terminalDetail: "Water contact destroyed the aircraft.",
  });
  assert.equal(cobraNextSortieCorrection({
    presentation,
    status: "vehicle-authority-lost",
    contactCause: "water-contact",
  }), "Keep the skids clear of the river.");
});

test("obstacle copy names physical things without leaking authority IDs", () => {
  assert.equal(cobraObstacleStrikeDetail("site.iron-bell.garrison", [
    { id: "site.iron-bell", label: "Iron Bell" },
  ]), "Hit the fortified position at Iron Bell.");
  assert.equal(cobraObstacleStrikeDetail("hazard.iron-bell.v1"),
    "Hit the Iron Bell crossing.");
  assert.equal(cobraObstacleStrikeDetail("hazard.ridge-guy-wire.v1"), "Hit a wire.");
  assert.equal(cobraObstacleStrikeDetail("unknown.internal.v1"), "Hit a canyon obstacle.");
  for (const detail of [
    cobraObstacleStrikeDetail("site.iron-bell.garrison", [
      { id: "site.iron-bell", label: "Iron Bell" },
    ]),
    cobraObstacleStrikeDetail("unknown.internal.v1"),
  ]) assert.doesNotMatch(detail, /garrison|observer|hazard|\.v1/iu);
});

test("result copy stays concise without dropping outcome or cause", () => {
  const mixed = cobraDebriefPresentation({
    war: war({ outcome: "victory", outcomeReason: "tickets-exhausted" }),
    status: "vehicle-authority-lost",
    terminalTitle: "ROTOR STRIKE",
    terminalDetail: "Main rotor struck terrain.",
  });
  const timed = cobraDebriefPresentation({
    war: war({ outcome: "defeat", outcomeReason: "time-limit" }),
    status: "defeat",
  });

  for (const result of [mixed, timed]) {
    assert.ok(result.detail.length <= 80, `debrief is too long (${result.detail.length}): ${result.detail}`);
    assert.doesNotMatch(result.detail, /—/u);
  }
  assert.match(mixed.title, /VALLEY HELD · RECOVERY FAILED/);
  assert.match(mixed.detail, /Hostile tickets exhausted/);
  assert.match(mixed.detail, /Main rotor struck terrain/);
});
