import test from "node:test";
import assert from "node:assert/strict";
import {
  advanceIncidentReplay,
  analyseIncidentReplay,
  decodeIncidentReplay,
  IncidentReplayController,
  interpolateIncidentReplay,
  replayFrameState,
} from "../incident_replay.js";

const fields = [
  "t", "tick", "px", "py", "pz", "pfx", "pfy", "pfz", "plx", "ply", "plz",
  "kias", "gs_kts", "sink_fpm", "aoa_deg", "closure_kts", "deck_along_m",
  "deck_cross_m", "deck_height_m", "cx", "cy", "cz", "carrier_heading_rad",
  "deck_pitch_deg", "deck_len_m", "deck_width_m", "gear_handle", "gear_fraction",
  "gear_locked", "flap_lever", "flap_deg", "recovery", "hook", "wire", "terminal",
  "surface", "event_sequence", "event_type", "event_surface",
  "throttle_command", "engine_power", "gamma_deg", "vertical_speed_fpm", "nz",
  "tx", "ty", "tz", "ax", "ay", "az",
  "g_demand", "bank_target_deg", "rudder", "roll_control", "has_pitch_command",
  "pitch_command_deg", "gear_nose", "gear_left", "gear_right", "gear_nose_indication",
  "gear_left_indication", "gear_right_indication", "flap_left_deg", "flap_right_deg",
  "arrest_failure_reason", "arrest_initial_energy_mj", "arrest_absorbed_energy_mj",
  "arrest_remaining_energy_mj", "arrest_effective_capacity_mj", "arrest_peak_load_kn",
  "arrest_max_line_load_kn", "arrest_initial_closure_kts",
  "carrier_solid", "touchdown_grade", "touchdown_deviations",
  "touchdown_primary_correction", "control_applied", "direct_lateral_control",
];

const eventFields = [
  "t", "tick", "sequence", "type", "source", "target", "count", "outcome",
  "surface", "px", "py", "pz", "vx", "vy", "vz",
];

function eventRow(t, overrides = {}) {
  const value = {
    t,
    tick: Math.round((t + 2) * 120),
    sequence: t === 0 ? 1 : t === 2 ? 3 : 2,
    type: t === 0 ? 2 : t === 2 ? 3 : 1,
    source: 0,
    target: 1,
    count: 0,
    outcome: 0,
    surface: t === 0 || t === 2 ? 2 : 0,
    px: t * 50,
    py: 20,
    pz: t * 3,
    vx: 50,
    vy: -2,
    vz: 3,
    ...overrides,
  };
  return eventFields.map((field) => value[field]);
}

function row(t, overrides = {}) {
  const value = {
    t, tick: (t + 2) * 120,
    px: t * 50, py: 20, pz: t * 3,
    pfx: 0, pfy: -0.04, pfz: 0.999,
    plx: 0, ply: 0.999, plz: 0.04,
    kias: 135, gs_kts: 105, sink_fpm: 700, aoa_deg: 9.2, closure_kts: 105,
    deck_along_m: -40, deck_cross_m: 1, deck_height_m: Math.max(0, -t * 3),
    cx: 0, cy: 20, cz: t * 1.5, carrier_heading_rad: 0, deck_pitch_deg: 0,
    deck_len_m: 250, deck_width_m: 30,
    gear_handle: 1, gear_fraction: 1, gear_locked: 1,
    flap_lever: 0, flap_deg: 38, recovery: 0, hook: 0, wire: 0,
    terminal: t < 0 ? 0 : t < 2 ? 2 : 3,
    surface: t < 0 ? 0 : 2,
    event_sequence: t < 0 ? 0 : t === 0 ? 1 : t === 2 ? 3 : 2,
    event_type: t === 0 ? 2 : t === 2 ? 3 : 1,
    event_surface: t === 0 || t === 2 ? 2 : 0,
    throttle_command: 0.72, engine_power: 0.68, gamma_deg: -2.3,
    vertical_speed_fpm: -550, nz: 1.02,
    tx: 0, ty: 20, tz: t * 1.5 - 50,
    ax: 0, ay: 20, az: t * 1.5 + 154,
    g_demand: 1.05, bank_target_deg: 0, rudder: 0, roll_control: 0,
    has_pitch_command: 1, pitch_command_deg: 7,
    gear_nose: 1, gear_left: 1, gear_right: 1,
    gear_nose_indication: 2, gear_left_indication: 2, gear_right_indication: 2,
    flap_left_deg: 38, flap_right_deg: 38,
    arrest_failure_reason: 0, arrest_initial_energy_mj: 0,
    arrest_absorbed_energy_mj: 0, arrest_remaining_energy_mj: 0,
    arrest_effective_capacity_mj: 10.54, arrest_peak_load_kn: 0,
    arrest_max_line_load_kn: 180,
    arrest_initial_closure_kts: 0,
    carrier_solid: t < 0 ? 0 : 1,
    touchdown_grade: t < 0 ? 0 : 2,
    touchdown_deviations: 0,
    touchdown_primary_correction: 0,
    control_applied: t < 0 ? 1 : 0,
    direct_lateral_control: 1,
    ...overrides,
  };
  return fields.map((field) => value[field]);
}

function payload(overrides = {}) {
  return {
    schema: "carrier-incident-replay.v5",
    authoritative: true,
    id: 7,
    sample_rate_hz: 12,
    incident_index: 2,
    arrestment_profile: "PROVISIONAL_KOREA_JET_V1",
    touchdown_assessment: {
      profile: "TEST_TOUCHDOWN_PROFILE",
      version: 7,
      limits: {
        min_sink_fpm: 420,
        hard_sink_fpm: 900,
        max_sink_fpm: 1300,
        max_lineup_m: 7,
        min_ias_kts: 110,
        max_ias_kts: 150,
        max_closure_kts: 120,
        on_speed_aoa_deg: 9.5,
        max_aoa_error_deg: 2.5,
      },
      adaptive_target: {
        level: 3,
        max_sink_fpm: 1050,
        max_lineup_m: 5,
        min_ias_kts: 120,
        max_ias_kts: 145,
      },
    },
    event_fields: eventFields,
    events: [eventRow(0), eventRow(1), eventRow(2)],
    fields,
    samples: [row(-2), row(-1), row(0), row(1), row(2)],
    ...overrides,
  };
}

test("authoritative replay payload decodes into a bounded monotonic clip", () => {
  const clip = decodeIncidentReplay(payload());

  assert.equal(clip.id, 7);
  assert.equal(clip.authoritative, true);
  assert.equal(clip.samples.length, 5);
  assert.equal(clip.samples[2].eventSurface, 2);
  assert.equal(clip.samples[2].carrierSolid, 1);
  assert.equal(clip.events.length, 3);
  assert.deepEqual(clip.events[0].position, [0, 20, 0]);
  assert.deepEqual(clip.events[0].velocity, [50, -2, 3]);
  assert.equal(clip.events[0].type, "IMPACT");
  assert.equal(clip.events[0].target, "PLAYER");
  const arrestmentFailure = decodeIncidentReplay({
    ...payload(),
    events: [eventRow(0, { type: 6 })],
  });
  assert.equal(arrestmentFailure.events[0].type, "ARRESTMENT_FAILED",
    "the recorder's trap-failure event must remain playable in the browser");
  assert.equal(clip.touchdownAssessment.profile, "TEST_TOUCHDOWN_PROFILE");
  assert.equal(clip.touchdownAssessment.limits.hardSinkFpm, 900);
  assert.equal(clip.duration, 4);
  assert.equal(decodeIncidentReplay({ ...payload(), authoritative: false }), null);
  assert.equal(decodeIncidentReplay({ ...payload(), touchdown_assessment: null }), null);
  assert.equal(decodeIncidentReplay({ ...payload(), samples: [row(0), row(0)] }), null);
  assert.equal(decodeIncidentReplay({ ...payload(), events: [eventRow(3)] }), null,
    "an event outside the recorded clip is rejected");
  assert.equal(decodeIncidentReplay({ ...payload(), events: [eventRow(0, { target: 2 })] }), null,
    "a player incident cannot contain an opponent-target event");
  assert.equal(decodeIncidentReplay({
    ...payload(),
    events: [eventRow(0), eventRow(1, { sequence: 1 })],
  }), null, "event sequences must be strictly increasing");
});

test("interpolation moves recorded aircraft and carrier without inventing another physics pass", () => {
  const clip = decodeIncidentReplay(payload());
  const frame = interpolateIncidentReplay(clip, -0.5);

  assert.equal(frame.t, -0.5);
  assert.equal(frame.px, -25);
  assert.equal(frame.cz, -0.75);
  assert.equal(frame.terminal, 0, "discrete state remains on the beginning sample");

  const projected = replayFrameState({
    carrier: true, context: "live", tx: 999, ty: 999, tz: 999,
    opponent_body_present: true,
    recent_events: [{ sequence: 900, type: "DESTROYED", target: "PLAYER" }],
    tracers: [[1, 2, 3, 4, 5, 6]],
    rounds_fired: 42,
    player_health: 0,
    opponent_terminal_state: "SETTLED",
    opponent_impact_surface: "WATER",
  }, frame, [], "incident-replay:7:1");
  assert.equal(projected.replay_external, true);
  assert.equal(projected.px, -25);
  assert.equal(projected.indicated_airspeed_kts, 135);
  assert.equal(projected.player_terminal_state, "FLYING");
  assert.equal(projected.tx, 0, "carrier aim point comes from the recorded pose, not live final state");
  assert.equal(projected.tz, -50.75);
  assert.equal(projected.opponent_body_present, false,
    "an unrecorded future opponent must not contaminate authoritative replay");
  assert.equal(projected.event_stream_id, "incident-replay:7:1");
  assert.deepEqual(projected.recent_events, [],
    "live terminal events must never leak into replay presentation");
  assert.deepEqual(projected.tracers, []);
  assert.equal(projected.rounds_fired, 0);
  assert.equal(projected.player_health, 1);
  assert.equal(projected.opponent_terminal_state, "FLYING");
  assert.equal(projected.opponent_impact_surface, "NONE");
  assert.equal(projected.suppress_unrecorded_combat_transients, true);
});

test("causal review uses the exported hard-sink limit and authoritative correction", () => {
  const highSink = payload({
    samples: [
      row(-2),
      row(-1, { sink_fpm: 950 }),
      row(0, {
        sink_fpm: 1150, recovery: 3, hook: 1, wire: 3,
        touchdown_grade: 3, touchdown_deviations: 1 << 1,
        touchdown_primary_correction: 2,
      }),
      row(1, {
        sink_fpm: 500, recovery: 3, hook: 1, wire: 3,
        touchdown_grade: 3, touchdown_deviations: 1 << 1,
        touchdown_primary_correction: 2,
      }),
      row(2, {
        sink_fpm: 0, recovery: 3, hook: 1, wire: 3,
        touchdown_grade: 3, touchdown_deviations: 1 << 1,
        touchdown_primary_correction: 2,
      }),
    ],
  });
  const analysis = analyseIncidentReplay(decodeIncidentReplay(highSink));

  assert.equal(analysis.decisionTime, -1);
  assert.match(analysis.causalChain[0], /1150 ft\/min/);
  assert.match(analysis.causalChain[0], /900 ft\/min/,
    "trend and explanation must use the exported profile, not a browser threshold");
  assert.match(analysis.correction, /Add power/);
  assert.equal(analysis.touchdownAssessment.grade, "NO GRADE");
  assert.deepEqual(analysis.touchdownAssessment.deviations, ["HARD SINK RATE"]);
  assert.match(analysis.classification, /NOT AN LSO GRADE/);
});

test("browser does not invent a touchdown diagnosis from raw metrics without sim flags", () => {
  const noDeviation = payload({
    samples: [
      row(-2), row(-1, { sink_fpm: 1450 }),
      row(0, {
        sink_fpm: 1800, touchdown_grade: 2,
        touchdown_deviations: 0, touchdown_primary_correction: 0,
      }),
      row(1), row(2),
    ],
  });
  const analysis = decodeIncidentReplay(noDeviation).analysis;

  assert.equal(analysis.decisionTime, 0);
  assert.match(analysis.causalChain[0], /no touchdown deviation/i);
  assert.doesNotMatch(analysis.causalChain[0], /UNSAFE|HARD SINK/i);
  assert.equal(analysis.touchdownAssessment.grade, "FAIR");
});

test("simulation boundary is reported as unresolved rather than settled", () => {
  const bounded = payload({
    samples: [
      row(-2), row(-1), row(0), row(1),
      row(2, { terminal: 4, surface: 4, event_type: 4, event_surface: 4 }),
    ],
  });
  const clip = decodeIncidentReplay(bounded);
  const analysis = analyseIncidentReplay(clip);
  const projected = replayFrameState({}, clip.samples.at(-1));

  assert.equal(projected.player_terminal_state, "SIMULATION_BOUNDED");
  assert.match(analysis.physicalOutcome, /before physical rest/i);
  assert.doesNotMatch(analysis.physicalOutcome, /settled on simulation boundary/i);
});

test("unsafe gear state takes causal priority over secondary touchdown metrics", () => {
  const unsafeGear = payload({
    samples: [
      row(-2),
      row(-1, { gear_locked: 0, gear_fraction: 0.6 }),
      row(0, { gear_locked: 0, gear_fraction: 0.7, sink_fpm: 1600 }),
      row(1, { gear_locked: 0, gear_fraction: 0.7 }),
      row(2, { gear_locked: 0, gear_fraction: 0.7 }),
    ],
  });
  const analysis = decodeIncidentReplay(unsafeGear).analysis;

  assert.equal(analysis.decisionTime, -1);
  assert.match(analysis.causalChain[0], /not down and locked/i);
  assert.match(analysis.correction, /wave off/i);
});

test("carrier-structure trajectory stays primary even when gear is up and sink is high", () => {
  const structureStrike = payload({
    samples: [
      row(-2, { gear_locked: 0 }),
      row(-1, { gear_locked: 0, deck_along_m: -130, deck_height_m: -1 }),
      row(0, {
        gear_locked: 0, gear_fraction: 0, sink_fpm: 1800,
        deck_along_m: -140, deck_height_m: -4, surface: 3, event_surface: 3,
        carrier_solid: 3,
      }),
      row(1, { gear_locked: 0, surface: 3, carrier_solid: 3 }),
      row(2, { gear_locked: 0, surface: 1, event_surface: 1, carrier_solid: 3 }),
    ],
  });
  const analysis = decodeIncidentReplay(structureStrike).analysis;

  assert.match(analysis.causalChain[0], /intersected the carrier island/i);
  assert.doesNotMatch(analysis.causalChain[0], /gear/i);
  assert.match(analysis.correction, /carrier island conflict/);
});

test("arrestment failure teaches from recorded capability and energy evidence", () => {
  const failure = payload({
    samples: [
      row(-2),
      row(-1),
      row(0, {
        recovery: 6, hook: 1, wire: 3, event_type: 2, event_surface: 2,
        closure_kts: 60,
        arrest_failure_reason: 2, arrest_initial_energy_mj: 15.8,
        arrest_absorbed_energy_mj: 10.54, arrest_remaining_energy_mj: 5.26,
        arrest_effective_capacity_mj: 10.54, arrest_peak_load_kn: 159,
        arrest_max_line_load_kn: 180, arrest_initial_closure_kts: 105,
      }),
      row(1, {
        recovery: 6, hook: 1, wire: 3, arrest_failure_reason: 2,
        arrest_initial_energy_mj: 15.8, arrest_absorbed_energy_mj: 10.54,
        arrest_remaining_energy_mj: 5.26, arrest_effective_capacity_mj: 10.54,
        arrest_peak_load_kn: 159, arrest_max_line_load_kn: 180,
        arrest_initial_closure_kts: 105,
      }),
      row(2, {
        recovery: 6, hook: 1, wire: 3, arrest_failure_reason: 2,
        arrest_initial_energy_mj: 15.8, arrest_absorbed_energy_mj: 10.54,
        arrest_remaining_energy_mj: 5.26, arrest_effective_capacity_mj: 10.54,
        arrest_peak_load_kn: 159, arrest_max_line_load_kn: 180,
        arrest_initial_closure_kts: 105,
      }),
    ],
  });
  const clip = decodeIncidentReplay(failure);

  assert.equal(clip.arrestmentProfile, "PROVISIONAL_KOREA_JET_V1");
  assert.match(clip.analysis.causalChain[0], /RUNOUT EXHAUSTED/);
  assert.match(clip.analysis.causalChain[0], /15\.80 MJ/);
  assert.match(clip.analysis.correction, /cannot create capacity/i);
  assert.match(clip.analysis.correction, /model-derived closure boundary/i);
  assert.match(clip.analysis.correction, /86 kt/,
    "safe boundary must use the recorded 105 kt engagement closure, not residual speed");
  assert.equal(clip.analysis.decisionTime, -2,
    "recorded pre-contact closure should be compared with the energy-derived boundary");
});

test("line-load profile fault is not misattributed to pilot energy management", () => {
  const lineFault = payload({
    samples: [
      row(-2), row(-1),
      row(0, {
        recovery: 6, hook: 1, wire: 3, arrest_failure_reason: 3,
        arrest_initial_energy_mj: 9.5, arrest_absorbed_energy_mj: 0,
        arrest_remaining_energy_mj: 9.5, arrest_effective_capacity_mj: 10.54,
        arrest_peak_load_kn: 200, arrest_max_line_load_kn: 180,
      }),
      row(1, { recovery: 6, arrest_failure_reason: 3,
        arrest_peak_load_kn: 200, arrest_max_line_load_kn: 180 }),
      row(2, { recovery: 6, arrest_failure_reason: 3,
        arrest_peak_load_kn: 200, arrest_max_line_load_kn: 180 }),
    ],
  });
  const analysis = decodeIncidentReplay(lineFault).analysis;

  assert.equal(analysis.decisionTime, 0);
  assert.match(analysis.causalChain[0], /200 kN exceeded.*180 kN/i);
  assert.match(analysis.correction, /equipment\/profile fault/i);
  assert.match(analysis.correction, /Do not attribute it to pilot technique/i);
  assert.doesNotMatch(analysis.correction, /correct the recorded arrival energy/i);
});

test("island strike without low or short evidence marks contact, not a fabricated early decision", () => {
  const islandStrike = payload({
    samples: [
      row(-2, { gear_locked: 0, deck_along_m: 5, deck_cross_m: 11, deck_height_m: 10 }),
      row(-1, { gear_locked: 0, deck_along_m: 8, deck_cross_m: 11, deck_height_m: 10 }),
      row(0, {
        gear_locked: 0, deck_along_m: 10, deck_cross_m: 11, deck_height_m: 10,
        surface: 3, event_surface: 3, carrier_solid: 3,
      }),
      row(1, { surface: 3, carrier_solid: 3 }),
      row(2, { surface: 1, event_surface: 1, carrier_solid: 3 }),
    ],
  });
  const analysis = decodeIncidentReplay(islandStrike).analysis;

  assert.equal(analysis.decisionTime, 0);
  assert.match(analysis.causalChain[0], /carrier island/);
});

test("hull subtype remains distinct from island and broad carrier structure", () => {
  const hullStrike = payload({
    samples: [
      row(-2, { carrier_solid: 0 }),
      row(-1, { carrier_solid: 0, deck_along_m: -130, deck_height_m: -1 }),
      row(0, {
        surface: 3, event_surface: 3, carrier_solid: 2,
        deck_along_m: -140, deck_height_m: -4,
      }),
      row(1, { surface: 3, carrier_solid: 2 }),
      row(2, { surface: 1, event_surface: 1, carrier_solid: 2 }),
    ],
  });
  const analysis = decodeIncidentReplay(hullStrike).analysis;

  assert.match(analysis.causalChain[0], /carrier hull \/ round-down/i);
  assert.doesNotMatch(analysis.causalChain[0], /island/i);
  assert.match(analysis.physicalOutcome, /hull impact/i);
});

test("physical outcome reports a recorded secondary island strike after deck impact", () => {
  const secondaryStrike = payload({
    samples: [
      row(-2, { carrier_solid: 0 }),
      row(-1, { carrier_solid: 0 }),
      row(0, {
        carrier_solid: 1, surface: 2, event_surface: 2,
        touchdown_grade: 4, touchdown_deviations: 1 << 2,
        touchdown_primary_correction: 1, sink_fpm: 1500,
      }),
      row(1, { carrier_solid: 3, surface: 3, event_surface: 3 }),
      row(2, { carrier_solid: 3, surface: 1, event_surface: 1 }),
    ],
  });
  const analysis = decodeIncidentReplay(secondaryStrike).analysis;

  assert.match(analysis.physicalOutcome,
    /flight deck impact; secondary island contact/i);
  assert.match(analysis.physicalOutcome, /settled in water/i);
  assert.equal(analysis.touchdownAssessment.grade, "CUT");
  assert.doesNotMatch(analysis.physicalOutcome, /CUT|GRADE/i,
    "physical outcome and touchdown grade remain separate facts");
});

test("controller pulls a clip once, auto-plays it, and holds the physical end state briefly", () => {
  let consumes = 0;
  const controller = new IncidentReplayController((id) => {
    consumes += 1;
    assert.equal(id, 7);
    return JSON.stringify(payload());
  });

  assert.equal(controller.ingest({ incident_replay_id: 7, incident_replay_available: true }, 1000), true);
  assert.equal(controller.ingest({ incident_replay_id: 7, incident_replay_available: true }, 1001), false);
  assert.equal(consumes, 1);
  assert.equal(controller.eventStreamId, "incident-replay:7:1");
  assert.equal(controller.frame(1000).t, -2);
  assert.equal(controller.frame(5000).t, 2);
  assert.equal(controller.frame(6000).t, 2, "end hold keeps the settled evidence visible");
  assert.equal(controller.frame(6300), null);
  assert.equal(controller.active, false);

  assert.equal(controller.start(7000), true, "cached clip supports Replay Again without transport");
  assert.equal(controller.eventStreamId, "incident-replay:7:2");
  assert.equal(consumes, 1);
});

test("playback exposes only recorded events reached in this replay generation", () => {
  const controller = new IncidentReplayController(() => JSON.stringify(payload()));
  const live = {
    finished: true,
    incident_replay_id: 7,
    incident_replay_available: true,
    recent_events: [{ sequence: 999, type: "SORTIE_FINISHED" }],
  };

  const preRoll = advanceIncidentReplay(controller, live, 1000);
  assert.equal(preRoll.eventStreamId, "incident-replay:7:1");
  assert.deepEqual(preRoll.presentedState.recent_events, []);

  const afterSkippedFrames = advanceIncidentReplay(controller, {
    ...live,
    incident_replay_available: false,
  }, 4250);
  assert.deepEqual(
    afterSkippedFrames.presentedState.recent_events.map((event) => event.sequence),
    [1, 2],
    "a slow render frame retains every authoritative event crossed in order",
  );
  assert.deepEqual(afterSkippedFrames.presentedState.recent_events[0].position, [0, 20, 0]);

  const endHold = advanceIncidentReplay(controller, {
    ...live,
    incident_replay_available: false,
  }, 5250);
  assert.deepEqual(endHold.presentedState.recent_events.map((event) => event.sequence), [1, 2, 3]);

  controller.start(7000);
  const replayAgain = advanceIncidentReplay(controller, {
    ...live,
    incident_replay_available: false,
  }, 10250);
  assert.equal(replayAgain.eventStreamId, "incident-replay:7:2");
  assert.deepEqual(replayAgain.presentedState.recent_events.map((event) => event.sequence), [1, 2]);
  assert.equal(replayAgain.presentedState.recent_events[0].sequence,
    afterSkippedFrames.presentedState.recent_events[0].sequence,
    "original event sequence remains the stable deterministic effect seed");
});

test("finished snapshot pipeline substitutes recorded state and defers debrief until replay ends", () => {
  const controller = new IncidentReplayController(() => JSON.stringify(payload()));
  const finished = {
    finished: true,
    carrier: true,
    px: 999,
    incident_replay_id: 7,
    incident_replay_available: true,
  };

  const first = advanceIncidentReplay(controller, finished, 1000);
  assert.equal(first.active, true);
  assert.equal(first.deferFinishedDebrief, true);
  assert.equal(first.presentedState.replay_external, true);
  assert.equal(first.presentedState.px, -100);

  const after = advanceIncidentReplay(controller, {
    ...finished,
    incident_replay_available: false,
  }, 6300);
  assert.equal(after.active, false);
  assert.equal(after.deferFinishedDebrief, false);
  assert.equal(after.presentedState, after.presentedState);
  assert.equal(after.presentedState.px, 999);
});
