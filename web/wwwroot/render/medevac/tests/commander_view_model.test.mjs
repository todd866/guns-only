import assert from "node:assert/strict";
import test from "node:test";
import {
  MEDEVAC_SCHEMA,
  boundedRecentEvents,
  clampRendezvousCursor,
  deriveCommanderView,
  formatDuration,
  formatSignedDuration,
  selectDecisionOption,
} from "../commander_view_model.js";

function snapshot(overrides = {}) {
  return {
    snapshot_schema_version: MEDEVAC_SCHEMA,
    lifecycle: "ACTIVE",
    mission_type: "MEDEVAC",
    rear_crew: {
      authority: "ADVISORY",
      priority: "REPORT",
      title: "I recommend the second pickup.",
      report: "The current patient remains stable on the latest assessment.",
      rationale: "The second pod is ready and the capable receiver remains available.",
    },
    decision: {
      id: "decision-4",
      options: [
        {
          id: "receiver-short",
          label: "Field clinic",
          command_id: "decision.deliver",
          receiver_id: "clinic",
          request_ids: ["request-alpha"],
          commit_label: "ACKNOWLEDGE GAP AND DELIVER",
          commit_detail: "FIELD CLINIC / 18 MIN",
          enabled: true,
          recommended: false,
          requires_acknowledgement: true,
          challenge: {
            active: true,
            title: "Commander, the clinic cannot meet the observed need.",
            report: "The advertised receiver is missing blood products.",
            rationale: "Forward Surgical currently advertises the requested capability.",
          },
        },
        {
          id: "collect-bravo",
          label: "Collect Call Bravo",
          command_id: "decision.collect",
          request_ids: ["bravo"],
          commit_label: "TASK CALL BRAVO",
          commit_detail: "SECOND POD / 12 MIN",
          enabled: true,
          recommended: true,
          requires_acknowledgement: false,
        },
      ],
    },
    ...overrides,
  };
}

test("recommended option drives one enabled commander action by default", () => {
  const state = snapshot();
  const option = selectDecisionOption(state);
  assert.equal(option.id, "collect-bravo");

  const view = deriveCommanderView(state);
  assert.equal(view.decisionId, "decision-4");
  assert.equal(view.primaryAction.option_id, "collect-bravo");
  assert.equal(view.primaryAction.label, "TASK CALL BRAVO");
  assert.equal(view.primaryAction.enabled, true);
  assert.equal(view.crew.challenge, false);
});

test("previewing an advertised mismatch surfaces the projected CRM challenge", () => {
  const view = deriveCommanderView(snapshot(), "receiver-short");
  assert.equal(view.selectedOption.id, "receiver-short");
  assert.equal(view.primaryAction.requires_acknowledgement, true);
  assert.equal(view.primaryAction.label, "ACKNOWLEDGE GAP AND DELIVER");
  assert.equal(view.crew.priority, "CHALLENGE");
  assert.equal(view.crew.challenge, true);
  assert.match(view.crew.report, /missing blood products/i);
});

test("disabled preferred options never become active commands", () => {
  const state = snapshot();
  state.decision.options[0].enabled = false;
  const view = deriveCommanderView(state, "receiver-short");
  assert.equal(view.selectedOption.id, "collect-bravo");
  assert.equal(view.primaryAction.option_id, "collect-bravo");
});

test("schema mismatch fails closed", () => {
  assert.throws(
    () => deriveCommanderView(snapshot({ snapshot_schema_version: "wrong.v9" })),
    /Unsupported medevac snapshot schema/,
  );
});

test("mission classification is a strict MEDEVAC or DUSTOFF projection", () => {
  assert.equal(deriveCommanderView(snapshot()).missionType, "MEDEVAC");
  assert.equal(deriveCommanderView(snapshot({ mission_type: "DUSTOFF" })).missionType,
    "DUSTOFF");
  assert.equal(deriveCommanderView(snapshot({ mission_type: "anything-else" })).missionType,
    "MEDEVAC");
});

test("time and rendezvous helpers stay finite and bounded", () => {
  assert.equal(formatDuration(125.4), "2:05");
  assert.equal(formatDuration(Number.NaN), "—");
  assert.equal(formatSignedDuration(-61), "−1:01");
  assert.equal(formatSignedDuration(0), "ON TIME");
  assert.equal(clampRendezvousCursor(-999), 2);
  assert.equal(clampRendezvousCursor(0), 50);
  assert.equal(clampRendezvousCursor(999), 98);
});

test("event windows remain bounded and ordered", () => {
  const events = Array.from({ length: 20 }, (_, sequence) => ({ sequence }));
  const recent = boundedRecentEvents(events, 4);
  assert.deepEqual(recent.map((event) => event.sequence), [16, 17, 18, 19]);
});
