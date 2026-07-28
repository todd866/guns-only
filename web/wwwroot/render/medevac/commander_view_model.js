export const MEDEVAC_SCHEMA = "medevac.commander.v2";

const EMPTY_ACTION = Object.freeze({
  option_id: "",
  label: "AUTOMATION IN PROGRESS",
  detail: "NO COMMAND REQUIRED",
  enabled: false,
  requires_acknowledgement: false,
});

export function formatDuration(value) {
  if (!Number.isFinite(value)) return "—";
  const seconds = Math.max(0, Math.round(value));
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, "0")}`;
}

export function formatSignedDuration(value) {
  if (!Number.isFinite(value)) return "—";
  const rounded = Math.round(value);
  if (rounded === 0) return "ON TIME";
  return `${rounded > 0 ? "+" : "−"}${formatDuration(Math.abs(rounded))}`;
}

export function enumWords(value, fallback = "UNKNOWN") {
  if (typeof value !== "string" || value.length === 0) return fallback;
  return value.replaceAll("_", " ");
}

export function selectDecisionOption(snapshot, preferredOptionId = "") {
  const options = Array.isArray(snapshot?.decision?.options)
    ? snapshot.decision.options
    : [];
  if (options.length === 0) return null;

  const preferred = options.find((option) =>
    option.id === preferredOptionId && option.enabled !== false);
  if (preferred) return preferred;

  const recommended = options.find((option) =>
    option.recommended === true && option.enabled !== false);
  if (recommended) return recommended;

  return options.find((option) => option.enabled !== false) ?? options[0];
}

export function primaryActionFor(snapshot, selectedOption) {
  if (snapshot?.lifecycle === "COMPLETE") {
    return { ...EMPTY_ACTION, label: "MISSION COMPLETE" };
  }
  if (!selectedOption) {
    const projected = snapshot?.primary_action;
    return projected && typeof projected === "object"
      ? { ...EMPTY_ACTION, ...projected }
      : EMPTY_ACTION;
  }
  return {
    option_id: selectedOption.id ?? "",
    label: selectedOption.commit_label ?? selectedOption.label ?? "CONFIRM",
    detail: selectedOption.commit_detail ?? "ISSUE COMMAND",
    enabled: selectedOption.enabled !== false,
    requires_acknowledgement: selectedOption.requires_acknowledgement === true,
  };
}

export function crewMessageFor(snapshot, selectedOption) {
  const crew = snapshot?.rear_crew ?? {};
  const optionChallenge = selectedOption?.challenge;
  if (optionChallenge?.active) {
    return {
      priority: "CHALLENGE",
      title: optionChallenge.title ?? "Commander, confirm.",
      report: optionChallenge.report ?? crew.report ?? "",
      rationale: optionChallenge.rationale ?? crew.rationale ?? "",
      challenge: true,
    };
  }
  return {
    priority: crew.priority ?? "REPORT",
    title: crew.title ?? "Rear crew standing by.",
    report: crew.report ?? "",
    rationale: crew.rationale ?? "",
    challenge: crew.challenge?.active === true,
  };
}

export function deriveCommanderView(snapshot, preferredOptionId = "") {
  if (!snapshot || snapshot.snapshot_schema_version !== MEDEVAC_SCHEMA)
    throw new Error(`Unsupported medevac snapshot schema: ${
      snapshot?.snapshot_schema_version ?? "missing"
    }`);

  const selectedOption = selectDecisionOption(snapshot, preferredOptionId);
  return Object.freeze({
    selectedOption,
    primaryAction: primaryActionFor(snapshot, selectedOption),
    crew: crewMessageFor(snapshot, selectedOption),
    missionType: snapshot.mission_type === "DUSTOFF" ? "DUSTOFF" : "MEDEVAC",
    decisionId: snapshot.decision?.id ?? "",
    options: snapshot.decision?.options ?? [],
  });
}

export function clampRendezvousCursor(deltaSeconds, scaleSeconds = 180) {
  if (!Number.isFinite(deltaSeconds)) return 50;
  const normalized = 50 + (deltaSeconds / Math.max(1, scaleSeconds)) * 50;
  return Math.max(2, Math.min(98, normalized));
}

export function boundedRecentEvents(events, limit = 16) {
  if (!Array.isArray(events)) return [];
  const boundedLimit = Math.max(1, Math.min(64, Math.trunc(limit) || 16));
  return events.slice(-boundedLimit);
}
