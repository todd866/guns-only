import assert from "node:assert/strict";
import test from "node:test";
import {
  CASEVAC_MISSION_PRESENTATION_SCHEMA,
  casevacDebriefModel,
  casevacMissionStripModel,
  casevacRadioMessage,
  createCasevacMissionPresentation,
} from "../casevac_mission_presentation.js";
import {
  CASEVAC_COURSE_SITE_IDS,
} from "../casevac_course_plan.js";

class FakeElement {
  constructor(tagName) {
    this.tagName = String(tagName).toUpperCase();
    this.parentNode = null;
    this.children = [];
    this.attributes = new Map();
    this.style = {};
    this.className = "";
    this.hidden = false;
    this._textContent = "";
    this._listeners = new Map();
  }

  get textContent() {
    return this._textContent
      + this.children.map((child) => child.textContent).join("");
  }

  set textContent(value) {
    for (const child of this.children) child.parentNode = null;
    this.children = [];
    this._textContent = String(value ?? "");
  }

  appendChild(child) {
    if (child.parentNode) child.remove();
    child.parentNode = this;
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(String(name), String(value));
  }

  getAttribute(name) {
    return this.attributes.has(String(name))
      ? this.attributes.get(String(name))
      : null;
  }

  addEventListener(type, handler) {
    const handlers = this._listeners.get(type) ?? new Set();
    handlers.add(handler);
    this._listeners.set(type, handlers);
  }

  removeEventListener(type, handler) {
    this._listeners.get(type)?.delete(handler);
  }

  dispatchEvent(event) {
    for (const handler of this._listeners.get(event?.type) ?? [])
      handler.call(this, event);
    return true;
  }

  click() {
    this.dispatchEvent({ type: "click" });
  }

  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.children.indexOf(this);
    if (index >= 0) this.parentNode.children.splice(index, 1);
    this.parentNode = null;
  }
}

class FakeDocument {
  createElement(tagName) {
    return new FakeElement(tagName);
  }
}

function visit(root, callback) {
  callback(root);
  for (const child of root.children) visit(child, callback);
}

function byAttribute(root, name, value) {
  const matches = [];
  visit(root, (node) => {
    if (node.getAttribute(name) === value) matches.push(node);
  });
  return matches;
}

function oneByAttribute(root, name, value) {
  const matches = byAttribute(root, name, value);
  assert.equal(matches.length, 1, `expected one [${name}="${value}"]`);
  return matches[0];
}

function completeDebrief(overrides = {}) {
  return casevacDebriefModel({
    disposition: "TransferredAfterRequestedTime",
    handoffCallAgeSeconds: 558,
    requestedHandoffAgeSeconds: 480,
    axes: {
      safe: {
        status: "CLEAR",
        minimumClearanceM: 43.6,
        obstacleContacts: 0,
        protectionInterventions: 1,
      },
      controlled: {
        status: "CONTROLLED",
        pickupApproaches: 2,
        handoffApproaches: 1,
        approachDiscontinuations: 1,
        loadingInterruptions: 0,
        handoffInterruptions: 1,
      },
      masked: {
        status: "MIXED",
        safeBandPercent: 73.6,
        exposedSeconds: 92,
      },
      timely: {
        status: "WINDOW_PASSED",
        callToPickupSeconds: 277,
        pickupToHandoffSeconds: 281,
        totalCallToHandoffSeconds: 558,
      },
    },
    correction: {
      kind: "PickupDeceleration",
      atCallAgeSeconds: 277,
      intervalSeconds: 34,
    },
    ...overrides,
  });
}

test("formats the compact mission strip without inferring projected facts", () => {
  const strip = casevacMissionStripModel({
    visible: true,
    phase: "PickupApproach",
    targetSiteId: CASEVAC_COURSE_SITE_IDS.pickup,
    rangeM: 2_450,
    etaSeconds: 97.8,
    callAgeSeconds: 277.9,
    requestedHandoffAgeSeconds: 480,
    requestedWindowState: "PASSED",
    occupancy: "OCCUPIED",
    gateState: "STABLE",
    dwellKind: "STABILIZATION",
    dwellProgress01: 0.426,
    patientName: "must not render",
    diagnosis: "must not render",
    siteLabel: "untrusted free-form label",
  });

  assert.equal(strip.schema, CASEVAC_MISSION_PRESENTATION_SCHEMA);
  assert.equal(strip.presentationOnly, true);
  assert.equal(strip.authoritative, false);
  assert.equal(strip.phase.text, "PICKUP APPROACH");
  assert.equal(strip.target.text, "PICKUP · ORCHARD PAD");
  assert.equal(strip.navigation.rangeText, "2.5 KM");
  assert.equal(strip.navigation.etaText, "01:37");
  assert.equal(
    strip.clock.combinedText,
    "TIME SINCE CALL 04:37 · REQUESTED 08:00",
  );
  assert.equal(
    strip.clock.windowText,
    "WINDOW PASSED · COMPLETE IF ABLE",
  );
  assert.equal(strip.occupancy.text, "OCCUPIED");
  assert.equal(strip.gate.text, "STABLE CONTACT");
  assert.equal(strip.dwell.progressPercent, 43);
  assert.equal(strip.dwell.text, "STABLE DWELL 43%");
  assert.ok(Object.isFrozen(strip));
  assert.doesNotMatch(
    JSON.stringify(strip),
    /must not render|patient|diagnos|untrusted/i,
  );

  const noInference = casevacMissionStripModel({
    phase: "HANDOFF",
    callAgeSeconds: 600,
    requestedHandoffAgeSeconds: 480,
    requestedWindowState: "OPEN",
  });
  assert.equal(noInference.clock.windowState, "OPEN");
  assert.equal(noInference.clock.windowText, "");
  assert.equal(noInference.occupancy.text, "LOAD · NOT ASSESSED");
  assert.equal(noInference.target.text, "TARGET · NOT ASSESSED");

  const abortReturn = casevacMissionStripModel({
    phase: "AbortReturn",
    targetSiteId: "volume.ukraine.casevac-safe-exit-a.v1",
    occupancy: "EMPTY",
  });
  assert.equal(abortReturn.target.text, "RETURN · SAFE EXIT");
});

test("keeps formatting finite and bounded for partial observer projections", () => {
  const strip = casevacMissionStripModel({
    phase: "Loading",
    rangeM: -1,
    etaSeconds: Number.POSITIVE_INFINITY,
    gateState: "anything",
    dwellKind: "LOADING",
    dwellProgress01: 4,
  });
  assert.equal(strip.navigation.rangeText, "—");
  assert.equal(strip.navigation.etaText, "—");
  assert.equal(strip.gate.state, "NOT_ASSESSED");
  assert.equal(strip.dwell.progress01, 1);
  assert.equal(strip.dwell.progressPercent, 100);
  assert.equal(strip.visible, true);
  assert.equal(casevacMissionStripModel({ visible: false }).visible, false);
});

test("maps only known sparse CASEVAC events to fixed low-volume copy", () => {
  const events = [
    "CasevacTaskStarted",
    "PickupApproachEntered",
    "ApproachAttemptStarted",
    "StableContactEntered",
    "StableContactExited",
    "LoadingStarted",
    "LoadingPaused",
    "LoadingResumed",
    "LoadingReset",
    "CapsuleSecured",
    "RequestedHandoffWindowPassed",
    "DropoffApproachEntered",
    "ApproachDiscontinued",
    "HandoffStarted",
    "HandoffPaused",
    "HandoffResumed",
    "HandoffReset",
    "HandoffCompleted",
    "AbortReturnStarted",
    "CasevacAborted",
    "CasevacAircraftLost",
  ];
  const messages = events.map((kind, index) =>
    casevacRadioMessage({
      schemaVersion: 1,
      sequence: index + 1,
      kind,
      patientCondition: "must not render",
      freeText: "Victory after a kill",
    }));

  assert.equal(messages.every(Boolean), true);
  assert.equal(new Set(messages.map((message) => message.id)).size,
    events.length);
  assert.equal(messages[0].channel, "DISPATCH");
  assert.equal(messages[9].text, "Capsule secure. OCCUPIED.");
  assert.equal(messages[10].emphasis, "notice");
  assert.equal(casevacRadioMessage({
    sequence: 100,
    kind: "VitalsChanged",
  }), null);
  assert.equal(casevacRadioMessage({
    sequence: 101,
    schemaVersion: 2,
    kind: "CasevacTaskStarted",
  }), null);
  assert.doesNotMatch(
    JSON.stringify(messages),
    /patient|condition|victory|defeat|kill|diagnos|vital/i,
  );
});

test("builds four separate assessment axes and one recorded correction", () => {
  const debrief = completeDebrief({
    patientOutcome: "must not render",
    score: 100,
    title: "Victory",
  });

  assert.equal(debrief.outcome, "HANDOFF 09:18 · REQUESTED 08:00");
  assert.deepEqual(
    debrief.axes.map((axis) => axis.label),
    ["SAFE", "CONTROLLED", "MASKED", "TIMELY"],
  );
  assert.deepEqual(
    debrief.axes.map((axis) => axis.status),
    ["CLEAR", "CONTROLLED", "MIXED", "WINDOW PASSED"],
  );
  assert.match(debrief.axes[0].evidence, /Minimum clearance 44 m/);
  assert.match(debrief.axes[1].evidence, /2 pickup approaches/);
  assert.match(debrief.axes[2].evidence, /74% inside declared safe band/);
  assert.match(debrief.axes[3].evidence, /Call to handoff 09:18/);
  assert.equal(debrief.correction.available, true);
  assert.equal(
    debrief.correction.summary,
    "Begin deceleration before the orchard.",
  );
  assert.equal(
    debrief.correction.evidence,
    "Pickup terminal entry 04:37; first stable contact 34 s later.",
  );
  assert.equal("score" in debrief, false);
  assert.doesNotMatch(
    JSON.stringify(debrief),
    /must not render|patient|victory|defeat|kill|diagnos|vital|survival/i,
  );
});

test("fails closed when a correction lacks a bounded evidence moment", () => {
  const debrief = casevacDebriefModel({
    disposition: "ControlledAbort",
    axes: {},
    correction: {
      kind: "LoadingStability",
      count: 2,
      advice: "unreviewed free-form advice",
    },
  });
  assert.equal(
    debrief.outcome,
    "CONTROLLED ABORT · PICKUP INCOMPLETE",
  );
  assert.equal(debrief.correction.available, false);
  assert.equal(
    debrief.correction.summary,
    "No replay-supported correction available.",
  );
  assert.doesNotMatch(JSON.stringify(debrief), /unreviewed/i);
});

test("creates accessible DOM and exposes the exact adapter-facing runtime API", () => {
  const documentLike = new FakeDocument();
  const mount = new FakeElement("main");
  const presentation = createCasevacMissionPresentation(documentLike, {
    mount,
  });

  assert.deepEqual(
    Object.keys(presentation),
    ["element", "update", "clearMessages", "dispose", "disposed"],
  );
  assert.equal(presentation.element.parentNode, mount);
  assert.equal(
    presentation.element.getAttribute("data-casevac-presentation"),
    "v1",
  );
  assert.equal(
    presentation.element.getAttribute("data-authoritative"),
    "false",
  );
  assert.equal(presentation.element.hidden, true);

  const strip = {
    phase: "Loading",
    targetSiteId: CASEVAC_COURSE_SITE_IDS.pickup,
    rangeM: 18,
    etaSeconds: 4,
    callAgeSeconds: 310,
    requestedHandoffAgeSeconds: 480,
    requestedWindowState: "OPEN",
    occupancy: "EMPTY",
    gateState: "STABLE",
    dwellKind: "LOADING",
    dwellProgress01: 0.42,
  };
  const view = presentation.update({ strip });
  assert.equal(view.strip.phase.text, "LOADING");
  assert.equal(presentation.element.hidden, false);
  assert.equal(
    oneByAttribute(presentation.element, "data-casevac-field", "phase")
      .textContent,
    "LOADING",
  );
  assert.equal(
    oneByAttribute(presentation.element, "data-casevac-field", "target")
      .textContent,
    "PICKUP · ORCHARD PAD",
  );
  const gate = oneByAttribute(
    presentation.element,
    "data-casevac-field",
    "gate",
  );
  assert.equal(gate.getAttribute("role"), "status");
  assert.equal(gate.getAttribute("aria-live"), "polite");
  const progress = oneByAttribute(
    presentation.element,
    "data-casevac-field",
    "dwell-progress",
  );
  assert.equal(progress.getAttribute("role"), "progressbar");
  assert.equal(progress.getAttribute("aria-valuenow"), "42");
  assert.equal(progress.getAttribute("aria-valuetext"), "LOADING 42%");
  presentation.dispose();
});

test("orders, deduplicates, bounds, and resets the sparse message queue", () => {
  const documentLike = new FakeDocument();
  const presentation = createCasevacMissionPresentation(documentLike, {
    maxMessages: 3,
  });
  const events = [
    { sequence: 4, kind: "LoadingStarted" },
    { sequence: 1, kind: "CasevacTaskStarted" },
    { sequence: 3, kind: "StableContactEntered" },
    { sequence: 2, kind: "PickupApproachEntered" },
  ];
  let view = presentation.update({
    streamId: "live-epoch-7",
    events,
  });
  assert.deepEqual(
    view.messages.map((message) => message.sequence),
    [2, 3, 4],
  );
  assert.equal(
    byAttribute(presentation.element, "data-message-id", "2:PICKUP_APPROACH_ENTERED").length,
    1,
  );
  view = presentation.update({
    streamId: "live-epoch-7",
    events,
  });
  assert.equal(view.messages.length, 3);
  assert.equal(
    byAttribute(presentation.element, "data-message-id", "4:LOADING_STARTED").length,
    1,
  );

  view = presentation.update({
    streamId: "replay-generation-1",
    events: [{ sequence: 1, kind: "CasevacTaskStarted" }],
  });
  assert.deepEqual(
    view.messages.map((message) => message.sequence),
    [1],
  );
  presentation.clearMessages();
  assert.equal(
    oneByAttribute(presentation.element, "data-casevac-part", "radio").hidden,
    true,
  );
  presentation.dispose();
});

test("renders quiet and debrief states without taking completion authority", () => {
  const documentLike = new FakeDocument();
  let quietSkipRequests = 0;
  const presentation = createCasevacMissionPresentation(documentLike, {
    onQuietSkip(request) {
      assert.equal(request.kind, "CASEVAC_QUIET_SKIP_REQUESTED");
      quietSkipRequests++;
    },
  });
  const quiet = oneByAttribute(
    presentation.element,
    "data-casevac-part",
    "quiet",
  );
  const skip = byAttribute(
    presentation.element,
    "aria-label",
    "Skip the CASEVAC quiet interval",
  )[0];

  presentation.update({
    quiet: { active: true, skippable: false },
  });
  assert.equal(quiet.hidden, false);
  assert.equal(skip.hidden, true);
  const quietAnnouncement = byAttribute(quiet, "role", "status")[0];
  assert.ok(quietAnnouncement);
  assert.equal(skip.parentNode, quiet);
  assert.equal(skip.parentNode === quietAnnouncement, false);
  skip.click();
  assert.equal(quietSkipRequests, 0);

  presentation.update({
    debrief: {
      schema: CASEVAC_MISSION_PRESENTATION_SCHEMA,
      visible: true,
      outcome: "Victory",
      patientName: "must not render",
    },
  });
  assert.equal(
    oneByAttribute(
      presentation.element,
      "data-casevac-part",
      "debrief",
    ).hidden,
    true,
    "the renderer should accept only debrief models built by its safe factory",
  );

  presentation.update({
    quiet: { active: true, skippable: true },
    debrief: completeDebrief(),
  });
  assert.equal(skip.hidden, false);
  skip.click();
  assert.equal(quietSkipRequests, 1);

  const debrief = oneByAttribute(
    presentation.element,
    "data-casevac-part",
    "debrief",
  );
  assert.equal(debrief.hidden, false);
  assert.equal(
    byAttribute(presentation.element, "data-casevac-axis", "safe").length,
    1,
  );
  assert.equal(
    byAttribute(presentation.element, "data-casevac-axis", "controlled").length,
    1,
  );
  assert.equal(
    byAttribute(presentation.element, "data-casevac-axis", "masked").length,
    1,
  );
  assert.equal(
    byAttribute(presentation.element, "data-casevac-axis", "timely").length,
    1,
  );
  assert.equal(
    byAttribute(presentation.element, "data-casevac-field", "correction").length,
    1,
  );
  assert.match(debrief.textContent, /HANDOFF 09:18 · REQUESTED 08:00/);
  assert.match(debrief.textContent, /Begin deceleration before the orchard/);

  presentation.update({
    strip: null,
    quiet: null,
    debrief: null,
  });
  assert.equal(presentation.element.hidden, true);
  presentation.dispose();
});

test("disposes idempotently and ignores later updates or detached controls", () => {
  const documentLike = new FakeDocument();
  const mount = new FakeElement("main");
  let quietSkipRequests = 0;
  const presentation = createCasevacMissionPresentation(documentLike, {
    mount,
    onQuietSkip() {
      quietSkipRequests++;
    },
  });
  presentation.update({
    quiet: { active: true, skippable: true },
  });
  const skip = byAttribute(
    presentation.element,
    "aria-label",
    "Skip the CASEVAC quiet interval",
  )[0];
  presentation.dispose();
  presentation.dispose();
  skip.click();

  assert.equal(presentation.disposed, true);
  assert.equal(presentation.element.parentNode, null);
  assert.equal(mount.children.length, 0);
  assert.equal(quietSkipRequests, 0);
  assert.equal(presentation.update({
    strip: { phase: "Ingress" },
  }), null);
});

test("rejects non-DOM construction and invalid mounts", () => {
  assert.throws(
    () => createCasevacMissionPresentation(null),
    /requires a DOM document/,
  );
  assert.throws(
    () => createCasevacMissionPresentation(new FakeDocument(), {
      mount: {},
    }),
    /mount must accept appendChild/,
  );
});
