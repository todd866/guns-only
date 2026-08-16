import {
  MEDEVAC_SCHEMA,
  boundedRecentEvents,
  clampRendezvousCursor,
  deriveCommanderView,
  enumWords,
  formatDuration,
  formatSignedDuration,
} from "../render/medevac/commander_view_model.js";
import { RELEASE_BUILD } from "../render/release/release_identity.js?v=342";

const $ = (selector) => document.querySelector(selector);
const AUDIO_QA_SILENT = new URLSearchParams(globalThis.location?.search ?? "")
  .get("audioQa") === "silent";

const elements = {
  commandHeader: $(".command-header"),
  missionShell: $("#mission-shell"),
  beginMission: $("#begin-mission"),
  briefing: $("#briefing"),
  bootStatus: $("#boot-status"),
  missionType: $("#mission-type"),
  missionName: $("#mission-name"),
  simClock: $("#sim-clock"),
  pauseButton: $("#pause-button"),
  weatherLabel: $("#weather-label"),
  weatherDetail: $("#weather-detail"),
  windLabel: $("#wind-label"),
  windDetail: $("#wind-detail"),
  threatLabel: $("#threat-label"),
  threatDetail: $("#threat-detail"),
  emissionLabel: $("#emission-label"),
  emissionDetail: $("#emission-detail"),
  mapStatus: $("#map-status"),
  aircraftMarker: $("#aircraft-marker"),
  extractorMarker: $("#extractor-marker"),
  plannedRoute: $("#planned-route"),
  completedRoute: $("#completed-route"),
  rendezvousTitle: $("#rendezvous-title"),
  rendezvousCopy: $("#rendezvous-copy"),
  rendezvousGauge: $(".rendezvous-gauge"),
  rendezvousCursor: $("#rendezvous-cursor"),
  rendezvousDelta: $("#rendezvous-delta"),
  aircraftEta: $("#aircraft-eta"),
  podReadyEta: $("#pod-ready-eta"),
  exposedHold: $("#exposed-hold"),
  deckCount: $("#deck-count"),
  podSlots: [$("#pod-slot-1"), $("#pod-slot-2")],
  phaseNumber: $("#phase-number"),
  phaseLabel: $("#phase-label"),
  decisionTitle: $("#decision-title"),
  decisionPrompt: $("#decision-prompt"),
  crewCard: $("#crew-card"),
  crewPriority: $("#crew-priority"),
  crewTitle: $("#crew-report-title"),
  crewReport: $("#crew-report"),
  crewRationale: $("#crew-rationale p"),
  decisionForm: $("#decision-form"),
  decisionOptions: $("#decision-options"),
  primaryAction: $("#primary-action"),
  linkState: $("#link-state"),
  linkStages: {
    FIBRE: $("#link-fibre"),
    AUTONOMOUS: $("#link-autonomy"),
    RF_FALLBACK: $("#link-rf"),
    SHORT_RANGE_REPEATER: $("#link-repeater"),
  },
  fibreRemaining: $("#fibre-remaining"),
  routeConfidence: $("#route-confidence"),
  linkRisk: $("#link-risk"),
  patientCards: $("#patient-cards"),
  receiverList: $("#receiver-list"),
  receiverUpdated: $("#receiver-updated"),
  eventLog: $("#event-log"),
  audioToggle: $("#audio-toggle"),
  debrief: $("#debrief"),
  debriefSummary: $("#debrief-summary"),
  debriefMetrics: $("#debrief-metrics"),
  debriefDecisions: $("#debrief-decisions"),
  restartMission: $("#restart-mission"),
  fatal: $("#fatal"),
  fatalCopy: $("#fatal-copy"),
  announcer: $("#announcer"),
};

const LOCATION_POINTS = Object.freeze({
  "AMB-BASE": { x: 178, y: 493 },
  "SAFE-WEST": { x: 411, y: 214 },
  "SITE-01": { x: 473, y: 284 },
  "SITE-02": { x: 637, y: 430 },
  "LOC-RELAY-WEST": { x: 411, y: 214 },
  "LOC-HOSPITAL-LOCAL": { x: 783, y: 511 },
  "LOC-SURGICAL": { x: 845, y: 167 },
  "base-forward": { x: 178, y: 493 },
  "stage-alpha": { x: 411, y: 214 },
  "site-alpha": { x: 473, y: 284 },
  "stage-bravo": { x: 724, y: 354 },
  "site-bravo": { x: 637, y: 430 },
  "relay-safe": { x: 411, y: 214 },
  "receiver-surgical": { x: 845, y: 167 },
  "receiver-clinic": { x: 783, y: 511 },
});

const EVENT_LABELS = Object.freeze({
  "mission.began": "DISPATCH",
  "pod.dispatched-autonomously": "POD NETWORK",
  "pod.delivered-ground-team-loading": "SITE TEAM",
  "pod-courier.recovered-empty": "POD NETWORK",
  "pod.patient-ready": "SITE TEAM",
  "air-ambulance.enroute-staging": "FLIGHT AUTO",
  "air-ambulance.staged": "FLIGHT AUTO",
  "air-ambulance.holding-safe": "FLIGHT AUTO",
  "air-ambulance.enroute-pickup": "FLIGHT AUTO",
  "air-ambulance.arrived-pickup": "FLIGHT AUTO",
  "extraction.launched-fibre": "EXTRACTOR",
  "extraction.fibre-lost-autonomy": "CONTROL",
  "extraction.autonomy-blocked": "CONTROL",
  "commander.rf-fallback": "COMMAND",
  "commander.repeater-ejected": "COMMAND",
  "extraction.repeater-expired": "CONTROL",
  "extraction.waiting-for-pod": "EXTRACTOR",
  "extraction.pod-attached": "EXTRACTOR",
  "extraction.rendezvous-complete": "EXTRACTOR",
  "pod.boarded-air-ambulance": "REAR CREW",
  "medical.observation-received": "REAR CREW",
  "medical.observation-recorded": "REAR CREW",
  "medical.reconsideration-required": "REAR CREW",
  "commander.collect-next": "COMMAND",
  "commander.deliver": "COMMAND",
  "commander.deliver-override": "COMMAND",
  "commander.continue-collection": "COMMAND",
  "commander.divert-delivery": "COMMAND",
  "commander.divert-delivery-override": "COMMAND",
  "pod.transferred-patient-transport": "HANDOFF",
  "pod.delivered-clinical-facility": "HANDOFF",
  "air-ambulance.available": "FLIGHT AUTO",
  "mission.complete": "DISPATCH",
});

const EVENT_COPY = Object.freeze({
  "mission.began": "Mission accepted. Empty pods released to the casualty sites.",
  "pod.dispatched-autonomously": "Empty patient pod is travelling independently to the site.",
  "pod.delivered-ground-team-loading": "Pod delivered. Ground team is packaging the patient.",
  "pod-courier.recovered-empty": "Autonomous pod courier recovered.",
  "pod.patient-ready": "Patient sealed and pod ready for collection.",
  "air-ambulance.enroute-staging": "Air ambulance is flying to the safe staging point.",
  "air-ambulance.staged": "Air ambulance reached the declared safe staging point.",
  "air-ambulance.holding-safe": "Aircraft is holding outside the immediate pickup threat.",
  "air-ambulance.enroute-pickup": "Direct pickup committed.",
  "air-ambulance.arrived-pickup": "Aircraft reached the casualty site.",
  "extraction.launched-fibre": "Extraction asset launched on fibre control.",
  "extraction.fibre-lost-autonomy": "Fibre lost. Bounded onboard autonomy assumed control.",
  "extraction.autonomy-blocked": "Autonomy cannot continue without a commander decision.",
  "commander.rf-fallback": "Commander authorised deliberate radio control.",
  "commander.repeater-ejected": "Short-range repeater ejected and linked.",
  "extraction.repeater-expired": "Repeater control window ended; autonomy resumed.",
  "extraction.waiting-for-pod": "Extractor is at the site; the pod is not ready.",
  "extraction.pod-attached": "Mechanical capture confirmed. Loaded pod is returning.",
  "extraction.rendezvous-complete": "Loaded pod reached the staged aircraft.",
  "pod.boarded-air-ambulance": "Patient pod accepted into aircraft custody.",
  "medical.observation-received": "Rear crew posted a new observer-safe medical assessment.",
  "medical.observation-recorded": "Rear crew recorded an updated assessment.",
  "medical.reconsideration-required":
    "New observed report triggered a route hold and collect-or-divert review.",
  "commander.collect-next": "Commander selected another pickup before delivery.",
  "commander.deliver": "Commander selected a receiver matching the observed need.",
  "commander.deliver-override": "Commander acknowledged the capability gap and overrode.",
  "commander.continue-collection":
    "Commander acknowledged the changed report and continued the committed pickup.",
  "commander.divert-delivery":
    "Commander diverted the selected patient pod to a matching receiver.",
  "commander.divert-delivery-override":
    "Commander acknowledged the receiver gap and diverted the selected patient pod.",
  "pod.transferred-patient-transport": "Pod custody transferred to lower-threat patient transport.",
  "pod.delivered-clinical-facility": "Pod custody transferred to the clinical receiver.",
  "air-ambulance.available": "Air ambulance is available for the remaining call.",
  "mission.complete": "All patient pods have left air-ambulance custody.",
});

let bridge = null;
let snapshot = null;
let view = null;
let selectedOptionId = "";
let ready = false;
let paused = false;
let audioEnabled = false;
let voiceCueCount = 0;
let destinationSpeakCount = 0;
let lastVoiceCue = "";
let lastFrameTime = 0;
let snapshotAccumulator = 0;
let lastSpokenEventSequence = 0;
let fatal = false;
let commandPending = false;
let decisionOptionsSignature = "";
let eventListSignature = "";
let activeModal = elements.briefing;
let armedAcknowledgement = null;

function setText(element, value) {
  if (element) element.textContent = value ?? "";
}

function waitForGlobal(accessor, timeoutMs = 20_000) {
  const started = performance.now();
  return new Promise((resolve, reject) => {
    const check = () => {
      const value = accessor();
      if (value) {
        resolve(value);
        return;
      }
      if (performance.now() - started > timeoutMs) {
        reject(new Error("Timed out while starting the WebAssembly runtime."));
        return;
      }
      requestAnimationFrame(check);
    };
    check();
  });
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error.message}`);
  }
}

function announce(message) {
  setText(elements.announcer, "");
  requestAnimationFrame(() => setText(elements.announcer, message));
}

function syncBackgroundInert() {
  const modalOpen = Boolean(activeModal);
  elements.commandHeader.inert = modalOpen;
  elements.missionShell.inert = modalOpen;
}

function setModal(modal, visible, preferredFocus = null) {
  if (!modal) return;
  modal.classList.toggle("visible", visible);
  modal.setAttribute("aria-hidden", String(!visible));
  if (visible) {
    activeModal = modal;
    syncBackgroundInert();
    requestAnimationFrame(() => preferredFocus?.focus());
  } else if (activeModal === modal) {
    activeModal = null;
    syncBackgroundInert();
  }
}

function showFatal(error) {
  if (fatal) return;
  fatal = true;
  paused = true;
  document.documentElement.dataset.kernel = "failed";
  elements.primaryAction.disabled = true;
  setText(
    elements.fatalCopy,
    `${error?.message ?? String(error)} Mission controls are locked; no browser-side medical model will take over.`,
  );
  setModal(elements.fatal, true, elements.fatal.querySelector("button"));
}

function readSnapshot() {
  if (!bridge) throw new Error("MEDEVAC bridge is unavailable.");
  const next = parseJson(bridge.GetState(), "MEDEVAC kernel");
  if (next.snapshot_schema_version !== MEDEVAC_SCHEMA)
    throw new Error(`Unsupported MEDEVAC contract '${next.snapshot_schema_version ?? "missing"}'.`);
  snapshot = next;
  if (!snapshot.decision?.options?.some((option) => option.id === selectedOptionId
    && option.enabled !== false)) {
    selectedOptionId = "";
  }
  view = deriveCommanderView(snapshot, selectedOptionId);
  selectedOptionId = view.selectedOption?.id ?? "";
  if (armedAcknowledgement
    && (armedAcknowledgement.decisionId !== view.decisionId
      || armedAcknowledgement.optionId !== selectedOptionId)) {
    armedAcknowledgement = null;
  }
  return snapshot;
}

function pointFor(locationId, projectedPoint, fallback = LOCATION_POINTS["base-forward"]) {
  if (projectedPoint && Number.isFinite(projectedPoint.x) && Number.isFinite(projectedPoint.y))
    return projectedPoint;
  return LOCATION_POINTS[locationId] ?? fallback;
}

function aircraftPosition(aircraft) {
  if (aircraft?.map_position) return pointFor("", aircraft.map_position);
  const from = pointFor(aircraft?.current_location_id);
  const to = aircraft?.target_location_id
    ? pointFor(aircraft.target_location_id)
    : from;
  const progress = Number.isFinite(aircraft?.route_progress)
    ? Math.max(0, Math.min(1, aircraft.route_progress))
    : 0;
  return {
    x: from.x + (to.x - from.x) * progress,
    y: from.y + (to.y - from.y) * progress,
  };
}

function routePath(from, to) {
  const dx = to.x - from.x;
  const curve = Math.max(-65, Math.min(65, dx * .14));
  return `M${from.x} ${from.y}C${from.x + dx * .33} ${from.y - curve} `
    + `${from.x + dx * .7} ${to.y - curve} ${to.x} ${to.y}`;
}

function renderHeader() {
  const conditions = snapshot.conditions ?? {};
  const missionType = view.missionType;
  document.body.dataset.phase = snapshot.phase?.toLowerCase?.() ?? "ready";
  document.body.dataset.missionType = missionType.toLowerCase();
  setText(elements.missionType, missionType);
  setText(elements.missionName, snapshot.mission_label ?? snapshot.scenario_id ?? "MEDEVAC");
  setText(elements.simClock, `T+${formatDuration(snapshot.sim_time_s ?? snapshot.elapsed_seconds)}`);
  setText(elements.weatherLabel, conditions.weather_label ?? "NOT PROVIDED");
  setText(elements.weatherDetail, conditions.weather_detail ?? "NO AUTHORITATIVE WEATHER");
  setText(elements.windLabel, conditions.wind_label ?? "NOT PROVIDED");
  setText(elements.windDetail, conditions.wind_detail ?? "NO AUTHORITATIVE WIND");
  setText(elements.threatLabel, conditions.threat_label ?? (
    missionType === "DUSTOFF" ? "IMMEDIATE" : "WATCH"
  ));
  setText(elements.threatDetail, conditions.threat_detail
    ?? (missionType === "DUSTOFF" ? "CREDIBLE IMMEDIATE THREAT" : "DETAIL NOT PROVIDED"));
  setText(elements.emissionLabel, conditions.emission_label ?? (
    (snapshot.rf_exposure_training_units ?? 0) > 0 ? "EXPOSED" : "DARK"
  ));
  setText(elements.emissionDetail, conditions.emission_detail
    ?? `${snapshot.rf_exposure_training_units ?? 0} ABSTRACT EXPOSURE`);
}

function renderMap() {
  const aircraft = snapshot.aircraft ?? snapshot.air_ambulance ?? {};
  const current = pointFor(aircraft.current_location_id);
  const target = pointFor(aircraft.target_location_id, aircraft.target_map_position);
  const position = aircraftPosition(aircraft);
  elements.aircraftMarker.setAttribute("transform", `translate(${position.x} ${position.y})`);

  const text = elements.aircraftMarker.querySelector("text");
  const detail = elements.aircraftMarker.querySelector(".map-node-detail");
  setText(text, aircraft.callsign ?? "AMB-12");
  setText(detail, enumWords(aircraft.phase, "READY"));

  const activeRoute = aircraft.target_location_id && aircraft.target_location_id !== aircraft.current_location_id;
  elements.plannedRoute.style.display = activeRoute ? "" : "none";
  if (activeRoute) elements.plannedRoute.setAttribute("d", routePath(current, target));

  const mapStatusStrong = elements.mapStatus.querySelector("strong");
  const mapStatusSmall = elements.mapStatus.querySelector("small");
  setText(mapStatusStrong, aircraft.automation_status ?? enumWords(aircraft.phase, "READY"));
  setText(mapStatusSmall, aircraft.automation_detail
    ?? (aircraft.target_location_label
      ? `Commanded destination: ${aircraft.target_location_label}`
      : "Waiting for commander intent"));

  const extraction = snapshot.extraction ?? {};
  const extractorVisible = extraction.active === true
    || !["NOT_REQUIRED", "COMPLETE", "STANDBY", undefined].includes(extraction.stage);
  elements.extractorMarker.style.display = extractorVisible ? "" : "none";
  if (extractorVisible) {
    const extractorPoint = pointFor("", extraction.map_position, null)
      ?? { x: position.x + 30, y: position.y - 20 };
    elements.extractorMarker.setAttribute(
      "transform",
      `translate(${extractorPoint.x} ${extractorPoint.y})`,
    );
  }

  for (const node of document.querySelectorAll(
    '[data-map-node="pickup-a"], [data-map-node="pickup-b"]',
  )) {
    node.style.display = "none";
  }
  for (const request of snapshot.requests ?? []) {
    const selector = request.id?.includes("bravo")
      || request.id === "PICKUP-02"
      || request.display_index === 2
      ? '[data-map-node="pickup-b"]'
      : '[data-map-node="pickup-a"]';
    const node = $(selector);
    if (!node) continue;
    node.style.display = "";
    node.classList.toggle("active", request.id === aircraft.assigned_request_id);
    const label = node.querySelector("text");
    const requestState = node.querySelector(".map-node-detail");
    setText(label, request.label ?? request.id);
    setText(requestState, `${request.pod_id ?? "POD"} / ${enumWords(request.pod_phase)}`);
  }
}

function renderRendezvous() {
  const rendezvous = snapshot.rendezvous ?? {};
  const active = rendezvous.active !== false
    && (rendezvous.active_pod_id || rendezvous.active_request_id);
  setText(elements.rendezvousTitle,
    active ? rendezvous.title ?? `${rendezvous.active_pod_id ?? "Pod"} rendezvous`
      : "Rendezvous not committed");
  setText(elements.rendezvousCopy,
    rendezvous.detail ?? (active
      ? "Automation is comparing the movement plan with the latest site preparation estimate."
      : "Empty pods travel to the sites independently; the aircraft carries loaded patients only."));

  const delta = rendezvous.timing_delta_s;
  elements.rendezvousCursor.style.left = `${clampRendezvousCursor(delta)}%`;
  setText(elements.rendezvousDelta, active ? formatSignedDuration(delta) : "NO TASK");
  elements.rendezvousGauge.setAttribute("aria-valuenow",
    String(Number.isFinite(delta) ? Math.max(-180, Math.min(180, Math.round(delta))) : 0));
  elements.rendezvousGauge.setAttribute("aria-valuetext",
    active ? `${formatSignedDuration(delta)} relative to pod readiness` : "No rendezvous task");
  setText(elements.aircraftEta,
    active ? formatDuration(rendezvous.aircraft_eta_s ?? rendezvous.system_eta_s) : "—");
  setText(elements.podReadyEta,
    active ? formatDuration(rendezvous.pod_ready_in_s) : "—");
  setText(elements.exposedHold,
    formatDuration(rendezvous.aircraft_exposure_s_if_hold ?? 0));
}

function renderPodDeck() {
  const aircraft = snapshot.aircraft ?? snapshot.air_ambulance ?? {};
  const onboardPodIds = aircraft.onboard_pod_ids ?? [];
  const capacity = aircraft.patient_pod_capacity ?? 2;
  setText(elements.deckCount, `${onboardPodIds.length} / ${capacity} LOADED`);
  elements.podSlots.forEach((slot, index) => {
    const podId = onboardPodIds[index];
    const request = (snapshot.requests ?? []).find((candidate) =>
      candidate.pod_id === podId);
    slot.classList.toggle("empty", !podId);
    slot.classList.toggle("loaded", Boolean(podId));
    const strong = slot.querySelector("strong");
    const small = slot.querySelector("small");
    if (podId) {
      setText(strong, podId);
      setText(small,
        `${request?.patient_id ?? "PATIENT"} / ${request?.label ?? "ACTIVE CALL"} / AIRCRAFT CUSTODY`);
    } else {
      setText(strong, "EMPTY");
      setText(small, index === 0 && onboardPodIds.length === 0
        ? "NO OUTBOUND POD CARRIED"
        : "AVAILABLE FOR PATIENT POD");
    }
  });
}

function phaseNumber(kind) {
  const phases = {
    MISSION_START: "01",
    PICKUP_ASSIGNMENT: "02",
    EXTRACTION_CONTROL: "03",
    COLLECT_OR_DELIVER: "04",
    COLLECTION_REVIEW: "04R",
    RECEIVER_SELECTION: "05",
    COMPLETE: "06",
  };
  return phases[kind] ?? "—";
}

function renderDecision() {
  const decision = snapshot.decision ?? {};
  setText(elements.phaseNumber, phaseNumber(decision.kind));
  setText(elements.phaseLabel, enumWords(decision.kind, "AUTOMATION"));
  setText(elements.decisionTitle, decision.title ?? "Automation in progress");
  setText(elements.decisionPrompt, decision.prompt
    ?? "The flight and pod systems are executing the last commander intent.");

  const nextOptionsSignature = JSON.stringify(view.options);
  if (nextOptionsSignature !== decisionOptionsSignature) {
    const labels = view.options.map((option) => {
      const label = document.createElement("label");
      label.className = "decision-option";
      label.classList.toggle("selected", option.id === selectedOptionId);

      const input = document.createElement("input");
      input.type = "radio";
      input.name = "command-option";
      input.value = option.id;
      input.checked = option.id === selectedOptionId;
      input.disabled = option.enabled === false;

      const copy = document.createElement("span");
      const title = document.createElement("strong");
      const detail = document.createElement("small");
      setText(title, option.label);
      setText(detail, option.detail ?? option.disabled_reason ?? "");
      copy.append(title, detail);

      const badge = document.createElement("b");
      setText(badge, option.recommended
        ? "RECOMMENDED"
        : option.requires_acknowledgement
          ? "CHALLENGE"
          : option.badge ?? "");
      label.append(input, copy, badge);
      return label;
    });
    elements.decisionOptions.replaceChildren(...labels);
    decisionOptionsSignature = nextOptionsSignature;
  } else {
    for (const input of elements.decisionOptions.querySelectorAll(
      'input[name="command-option"]',
    )) {
      input.checked = input.value === selectedOptionId;
      input.closest(".decision-option")?.classList.toggle(
        "selected",
        input.checked,
      );
    }
  }

  const action = view.primaryAction;
  const acknowledgementArmed = armedAcknowledgement
    && armedAcknowledgement.decisionId === view.decisionId
    && armedAcknowledgement.optionId === selectedOptionId;
  elements.primaryAction.dataset.optionId = action.option_id ?? "";
  delete elements.primaryAction.dataset.commandId;
  delete elements.primaryAction.dataset.argument;
  elements.primaryAction.disabled = commandPending || action.enabled !== true || fatal;
  const actionTitle = elements.primaryAction.querySelector("span");
  const actionDetail = elements.primaryAction.querySelector("small");
  setText(actionTitle, commandPending
    ? "COMMAND TRANSMITTING"
    : acknowledgementArmed
      ? "CONFIRM OVERRIDE"
      : action.label);
  setText(actionDetail, acknowledgementArmed
    ? "SECOND PRESS / ISSUE CHALLENGED COMMAND"
    : action.detail);
  elements.primaryAction.classList.toggle("acknowledgement-armed",
    Boolean(acknowledgementArmed));

  const crew = view.crew;
  elements.crewCard.classList.toggle("challenge", crew.challenge);
  setText(elements.crewPriority, crew.priority);
  setText(elements.crewTitle, crew.title);
  setText(elements.crewReport, crew.report);
  setText(elements.crewRationale, crew.rationale);
}

function renderExtraction() {
  const extraction = snapshot.extraction ?? {};
  const mode = extraction.link?.mode ?? extraction.control_mode ?? "NONE";
  const state = mode === "RF_FALLBACK" || mode === "SHORT_RANGE_REPEATER"
    ? "rf"
    : mode.toLowerCase();
  elements.linkState.dataset.state = state;
  setText(elements.linkState, enumWords(mode, "STANDBY"));

  const orderedModes = ["FIBRE", "AUTONOMOUS", "RF_FALLBACK", "SHORT_RANGE_REPEATER"];
  const activeIndex = orderedModes.indexOf(mode);
  orderedModes.forEach((candidate, index) => {
    const element = elements.linkStages[candidate];
    element.classList.toggle("active", index === activeIndex);
    element.classList.toggle("failed", index < activeIndex
      && candidate !== "SHORT_RANGE_REPEATER");
    if (index === activeIndex) element.setAttribute("aria-current", "step");
    else element.removeAttribute("aria-current");
    element.setAttribute("aria-label", `${enumWords(candidate)} ${
      index === activeIndex ? "active" : index < activeIndex ? "failed or superseded" : "available later"
    }`);
  });

  const fibreRemaining = extraction.link?.fibre_remaining_m;
  setText(elements.fibreRemaining,
    Number.isFinite(fibreRemaining) ? `${Math.max(0, Math.round(fibreRemaining))} M` : "—");
  setText(elements.routeConfidence,
    extraction.autonomy?.route_confidence ?? extraction.route_confidence ?? "—");
  setText(elements.linkRisk,
    extraction.link?.detection_risk_band ?? extraction.observed_risk_band ?? "UNKNOWN");
}

function medicalStatus(value) {
  return enumWords(value, "UNASSESSED");
}

function patientCard(patient, request) {
  const article = document.createElement("article");
  article.className = "patient-card";
  article.dataset.patientId = patient.id ?? request?.id ?? "";
  article.dataset.podId = patient.pod_id ?? request?.pod_id ?? "";

  const header = document.createElement("header");
  const identity = document.createElement("div");
  const call = document.createElement("span");
  call.className = "patient-id";
  setText(call,
    `${patient.id ?? request?.patient_id ?? "PATIENT"} · ${
      patient.pod_id ?? request?.pod_id ?? "POD"
    }`);
  const evidence = document.createElement("strong");
  setText(evidence,
    `${patient.call_label ?? request?.label ?? patient.request_id ?? "ACTIVE CALL"} · ${
      patient.evidence_label ?? (
        patient.medical ? "REAR-CREW ASSESSMENT" : "AWAITING ASSESSMENT"
      )
    }`);
  identity.append(call, evidence);
  const trend = document.createElement("span");
  const trendValue = patient.medical?.trend ?? patient.trend ?? "UNKNOWN";
  trend.className = `trend ${trendValue === "WORSENING" ? "urgent"
    : trendValue === "IMPROVING" ? "improving" : "watch"}`;
  setText(trend, `${medicalStatus(patient.medical?.urgency ?? patient.urgency)} · ${
    medicalStatus(trendValue)
  }`);
  header.append(identity, trend);

  const description = document.createElement("dl");
  const systems = [
    ["AIRWAY", patient.medical?.airway],
    ["BREATHING", patient.medical?.breathing],
    ["CIRCULATION", patient.medical?.circulation],
    ["TEMPERATURE", patient.medical?.temperature],
    ["CUSTODY", patient.custody?.custodian],
    ["POSITION", patient.custody?.position],
  ];
  for (const [label, value] of systems) {
    const item = document.createElement("div");
    const term = document.createElement("dt");
    const result = document.createElement("dd");
    setText(term, label);
    setText(result, medicalStatus(value));
    item.append(term, result);
    description.append(item);
  }

  const source = document.createElement("p");
  source.className = "patient-source";
  const age = patient.medical?.age_s ?? patient.medical?.age_seconds;
  const custodyLocation = patient.custody?.location_id
    ?? patient.custody?.vehicle_id
    ?? patient.custody?.destination_location_id
    ?? "POSITION NOT PROVIDED";
  setText(source, patient.medical
    ? `${patient.medical.source ?? "SOURCE NOT PROVIDED"} · ${formatDuration(age)} OLD · ${
      patient.medical.confidence ?? "CONFIDENCE NOT PROVIDED"
    } · ${enumWords(patient.custody?.custodian, "CUSTODY UNKNOWN")} / ${
      enumWords(patient.custody?.position, "POSITION UNKNOWN")
    } / ${custodyLocation}`
    : `NO MEDICAL OBSERVATION AVAILABLE · ${
      enumWords(patient.custody?.custodian, "CUSTODY UNKNOWN")
    } / ${enumWords(patient.custody?.position, "POSITION UNKNOWN")} / ${custodyLocation}`);

  const tags = document.createElement("div");
  tags.className = "capability-tags";
  const capabilities = patient.medical?.requested_capabilities
    ?? patient.requested_capabilities
    ?? [];
  for (const capability of capabilities) {
    const tag = document.createElement("span");
    setText(tag, enumWords(capability));
    tags.append(tag);
  }
  if (patient.medical?.transport_relay_eligible === true) {
    const tag = document.createElement("span");
    setText(tag, "RELAY ELIGIBLE");
    tags.append(tag);
  }
  article.append(header, description, source, tags);
  return article;
}

function renderPatients() {
  const source = snapshot.patients ?? (snapshot.requests ?? []).map((request) => ({
    id: request.id,
    call_label: request.label,
    medical: request.medical,
  }));
  const cards = source.map((patient) => {
    const request = (snapshot.requests ?? []).find((candidate) =>
      candidate.id === (patient.request_id ?? patient.id));
    return patientCard(patient, request);
  });
  elements.patientCards.replaceChildren(...cards);
}

function receiverCard(receiver) {
  const article = document.createElement("article");
  const header = document.createElement("header");
  const title = document.createElement("strong");
  const eta = document.createElement("span");
  setText(title, receiver.label ?? receiver.id);
  setText(eta, Number.isFinite(receiver.eta_s) ? formatDuration(receiver.eta_s) : "ROUTE —");
  header.append(title, eta);

  const capabilities = document.createElement("p");
  const advertised = receiver.available_capabilities ?? [];
  setText(capabilities, advertised.length > 0
    ? advertised.map((item) => enumWords(item)).join(" · ")
    : "No current capability advertisement");

  const status = document.createElement("small");
  const missing = receiver.missing_capabilities ?? [];
  status.classList.toggle("capability-gap", missing.length > 0
    || receiver.suitability === "CAPABILITY_MISMATCH");
  setText(status, missing.length > 0
    ? `MISSING ${missing.map((item) => enumWords(item)).join(" / ")}`
    : receiver.status_detail ?? enumWords(receiver.suitability, "AWAITING PATIENT ASSESSMENT"));
  article.append(header, capabilities, status);
  if (receiver.dominant_candidate?.transfer_summary) {
    const transfer = document.createElement("small");
    transfer.className = "receiver-transfer";
    setText(transfer, receiver.dominant_candidate.transfer_summary);
    article.append(transfer);
  }
  return article;
}

function renderReceivers() {
  const receivers = snapshot.receivers ?? snapshot.receiving_facilities ?? [];
  elements.receiverList.replaceChildren(...receivers.map(receiverCard));
  setText(elements.receiverUpdated,
    snapshot.receivers_updated_age_s != null
      ? `UPDATED ${formatDuration(snapshot.receivers_updated_age_s)} AGO`
      : "ADVERTISEMENT AGE UNKNOWN");
}

function eventText(event) {
  if (event.message) return event.message;
  const base = EVENT_COPY[event.code] ?? enumWords(event.code, "MISSION EVENT");
  const subject = event.request_label ?? event.request_id;
  return subject ? `${base} ${subject}.` : base;
}

function speakNewEvents(events) {
  if (!audioEnabled) return;
  for (const event of events) {
    if ((event.sequence ?? 0) <= lastSpokenEventSequence) continue;
    if (["medical.observation-received", "extraction.autonomy-blocked",
      "pod.boarded-air-ambulance"].includes(event.code)) {
      const cue = eventText(event);
      voiceCueCount += 1;
      lastVoiceCue = cue;
      // Silent QA exercises event selection, sequencing, toggle state, and voice diagnostics, but
      // speechSynthesis is itself the audible destination. Never call it under the shared-machine
      // clamp; unlike Web Audio there is no downstream gain node that can safely mute speech.
      if (!AUDIO_QA_SILENT
        && "speechSynthesis" in globalThis
        && typeof globalThis.SpeechSynthesisUtterance === "function") {
        const utterance = new SpeechSynthesisUtterance(cue);
        utterance.rate = .98;
        utterance.pitch = .82;
        speechSynthesis.speak(utterance);
        destinationSpeakCount += 1;
      }
    }
    lastSpokenEventSequence = Math.max(lastSpokenEventSequence, event.sequence ?? 0);
  }
}

function renderEvents() {
  const events = boundedRecentEvents(snapshot.events, 18);
  const nextEventSignature = events
    .map((event) => `${event.sequence}:${event.code}:${event.message ?? ""}`)
    .join("|");
  if (nextEventSignature !== eventListSignature) {
    const nodes = events.slice().reverse().map((event) => {
      const item = document.createElement("li");
      const time = document.createElement("time");
      setText(time, `T+${formatDuration(event.elapsed_seconds ?? event.time_s)}`);
      const copy = document.createElement("span");
      const label = document.createElement("b");
      setText(label, event.category ?? EVENT_LABELS[event.code] ?? "SYSTEM");
      copy.append(label, document.createTextNode(eventText(event)));
      item.append(time, copy);
      return item;
    });
    elements.eventLog.replaceChildren(...nodes);
    eventListSignature = nextEventSignature;
    speakNewEvents(events);
  }
}

function renderDebrief() {
  const complete = snapshot.lifecycle === "COMPLETE";
  if (complete && !elements.debrief.classList.contains("visible"))
    setModal(elements.debrief, true, elements.restartMission);
  else if (!complete && elements.debrief.classList.contains("visible"))
    setModal(elements.debrief, false);
  if (!complete) return;

  const summary = snapshot.debrief ?? {};
  setText(elements.debriefSummary,
    summary.summary ?? "All patient pods have left air-ambulance custody.");
  const metrics = [
    ["MISSION TIME", formatDuration(snapshot.sim_time_s ?? snapshot.elapsed_seconds)],
    ["EXPOSED HOLD", formatDuration(snapshot.aircraft?.immediate_threat_hold_s ?? 0)],
    ["RF EXPOSURE", `${snapshot.rf_exposure_training_units ?? 0} ABSTRACT`],
  ].map(([label, value]) => {
    const item = document.createElement("div");
    const small = document.createElement("small");
    const strong = document.createElement("strong");
    setText(small, label);
    setText(strong, value);
    item.append(small, strong);
    return item;
  });
  elements.debriefMetrics.replaceChildren(...metrics);

  const decisionEvents = Array.isArray(summary.decisions)
    ? summary.decisions
    : (snapshot.events ?? []).filter((event) =>
      event.code?.startsWith("commander."));
  elements.debriefDecisions.replaceChildren(...decisionEvents.map((event) => {
    const item = document.createElement("li");
    setText(item, `T+${formatDuration(event.elapsed_seconds)} — ${eventText(event)}`);
    return item;
  }));
}

function render() {
  if (!snapshot || !view) return;
  renderHeader();
  renderMap();
  renderRendezvous();
  renderPodDeck();
  renderDecision();
  renderExtraction();
  renderPatients();
  renderReceivers();
  renderEvents();
  renderDebrief();
}

async function dispatch(optionId, acknowledged = false) {
  if (!bridge || fatal || commandPending) return { accepted: false, code: "UNAVAILABLE" };
  commandPending = true;
  renderDecision();
  try {
    const result = parseJson(
      bridge.Dispatch(
        view.decisionId,
        optionId,
        acknowledged === true,
      ),
      "MEDEVAC command",
    );
    armedAcknowledgement = null;
    readSnapshot();
    render();
    if (!result.accepted) {
      announce(result.message ?? "Command rejected. The mission picture has changed.");
    } else {
      announce(result.message ?? `${view.primaryAction.label} accepted.`);
    }
    return result;
  } catch (error) {
    try {
      readSnapshot();
      render();
    } catch {
      showFatal(error);
    }
    return { accepted: false, code: "BRIDGE_ERROR", message: error.message };
  } finally {
    commandPending = false;
    if (!fatal) renderDecision();
  }
}

function onOptionChanged(event) {
  const input = event.target.closest('input[name="command-option"]');
  if (!input || input.disabled || !snapshot) return;
  armedAcknowledgement = null;
  selectedOptionId = input.value;
  view = deriveCommanderView(snapshot, selectedOptionId);
  renderDecision();
  if (view.crew.challenge) announce(`${view.crew.title} ${view.crew.report}`);
}

function onDecisionSubmit(event) {
  event.preventDefault();
  const action = view?.primaryAction;
  if (!action?.enabled) return;
  if (action.requires_acknowledgement === true) {
    const alreadyArmed = armedAcknowledgement
      && armedAcknowledgement.decisionId === view.decisionId
      && armedAcknowledgement.optionId === selectedOptionId;
    if (!alreadyArmed) {
      armedAcknowledgement = {
        decisionId: view.decisionId,
        optionId: selectedOptionId,
      };
      renderDecision();
      announce("Challenge acknowledged for review. Press confirm override to issue the command.");
      return;
    }
  }
  void dispatch(
    action.option_id,
    action.requires_acknowledgement === true,
  );
}

function setPaused(nextPaused) {
  paused = Boolean(nextPaused);
  document.body.classList.toggle("paused", paused);
  elements.pauseButton.setAttribute("aria-pressed", String(paused));
  setText(elements.pauseButton, paused ? "RESUME" : "PAUSE");
  bridge?.SetPaused?.(paused);
  announce(paused ? "Mission paused." : "Mission resumed.");
}

function restart() {
  if (!bridge) return;
  bridge.Reset("commander-training", 7);
  paused = false;
  selectedOptionId = "";
  armedAcknowledgement = null;
  decisionOptionsSignature = "";
  eventListSignature = "";
  lastSpokenEventSequence = 0;
  readSnapshot();
  render();
  setModal(elements.debrief, false);
  setModal(elements.briefing, true, elements.beginMission);
}

async function advanceForSmoke(simulatedSeconds) {
  if (!bridge || !ready) throw new Error("MEDEVAC kernel is not ready.");
  const desired = Math.max(0, Number(simulatedSeconds) || 0);
  const start = snapshot.sim_time_s ?? snapshot.elapsed_seconds ?? 0;
  const target = start + desired;
  let iterations = 0;
  while ((snapshot.sim_time_s ?? snapshot.elapsed_seconds ?? 0) < target
    && snapshot.lifecycle === "ACTIVE") {
    bridge.Advance(.25);
    readSnapshot();
    iterations++;
    if (iterations > 20_000)
      throw new Error("Smoke advance exceeded the deterministic guard.");
    if (iterations % 100 === 0) await Promise.resolve();
  }
  render();
  return snapshot;
}

function frame(now) {
  if (fatal) return;
  const delta = lastFrameTime ? Math.min(.25, Math.max(0, (now - lastFrameTime) / 1000)) : 0;
  lastFrameTime = now;
  try {
    if (ready && !paused && snapshot?.lifecycle === "ACTIVE") {
      bridge.Advance(delta);
      snapshotAccumulator += delta;
      if (snapshotAccumulator >= .125) {
        snapshotAccumulator = 0;
        readSnapshot();
        render();
      }
    }
  } catch (error) {
    showFatal(error);
    return;
  }
  requestAnimationFrame(frame);
}

function installEvents() {
  elements.beginMission.addEventListener("click", () => {
    setModal(elements.briefing, false);
    requestAnimationFrame(() => {
      globalThis.scrollTo(0, 0);
      elements.decisionTitle.focus({ preventScroll: true });
    });
    announce("Tasking accepted. Select the first call and issue the command.");
  });
  elements.decisionOptions.addEventListener("change", onOptionChanged);
  elements.decisionForm.addEventListener("submit", onDecisionSubmit);
  elements.pauseButton.addEventListener("click", () => setPaused(!paused));
  elements.restartMission.addEventListener("click", restart);
  elements.audioToggle.addEventListener("click", () => {
    audioEnabled = !audioEnabled;
    elements.audioToggle.setAttribute("aria-pressed", String(audioEnabled));
    setText(elements.audioToggle, audioEnabled ? "VOICE ON" : "VOICE OFF");
    if (!audioEnabled || AUDIO_QA_SILENT) globalThis.speechSynthesis?.cancel();
    announce(audioEnabled ? "Rear-crew voice enabled." : "Rear-crew voice disabled.");
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Tab" && activeModal) {
      const focusable = [...activeModal.querySelectorAll(
        'button:not(:disabled), a[href], input:not(:disabled), [tabindex]:not([tabindex="-1"])',
      )].filter((node) => !node.hidden);
      if (focusable.length > 0) {
        const first = focusable[0];
        const last = focusable.at(-1);
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    if (event.key === "Escape" && !activeModal) {
      setPaused(!paused);
    }
  });
}

async function boot() {
  try {
    setText(elements.bootStatus, "STARTING WEBASSEMBLY RUNTIME");
    const blazor = await waitForGlobal(() => globalThis.Blazor);
    await blazor.start();

    setText(elements.bootStatus, "LINKING MEDEVAC AUTHORITY");
    const runtimeAccessor = await waitForGlobal(() => globalThis.getDotnetRuntime);
    const { getAssemblyExports, getConfig } = await runtimeAccessor(0);
    await getConfig?.();
    const assemblyExports = await getAssemblyExports("GunsOnly.Web");
    bridge = assemblyExports?.GunsOnly?.Web?.MedevacWebBridge;
    if (!bridge) throw new Error("GunsOnly.Web.MedevacWebBridge export was not found.");

    bridge.Reset("commander-training", 7);
    readSnapshot();
    render();
    installEvents();
    ready = true;
    document.documentElement.dataset.kernel = "ready";
    syncBackgroundInert();

    globalThis.__gunsMedevac = Object.freeze({
      get ready() { return ready; },
      get state() { return snapshot; },
      get view() { return view; },
      get audioDiagnostics() {
        return Object.freeze({
          enabled: audioEnabled,
          silentQa: AUDIO_QA_SILENT,
          outputMode: AUDIO_QA_SILENT ? "silent-qa" : "speech-synthesis",
          cueCount: voiceCueCount,
          destinationSpeakCount,
          lastCue: lastVoiceCue,
        });
      },
      dispatch,
      advanceForSmoke,
      select(optionId) {
        armedAcknowledgement = null;
        selectedOptionId = optionId;
        view = deriveCommanderView(snapshot, selectedOptionId);
        renderDecision();
        return view;
      },
    });

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register(`../service-worker.js?v=${RELEASE_BUILD}`).catch(() => {});
    }
    requestAnimationFrame(frame);
  } catch (error) {
    showFatal(error);
  }
}

void boot();
