export const CAMPAIGN_STORAGE_KEY = "guns-only.raptor-program.v1";
export const CAMPAIGN_PROFILE_VERSION = 2;
export const MAX_APPLIED_RAPIER_SORTIES = 64;

export const EXPERIENCE_RELEASE_STATE = Object.freeze({
  PRODUCTION: "production",
  COMING_SOON: "coming-soon",
  PREVIEW: "preview",
  QUARANTINED: "quarantined",
  RETIRED: "retired",
});

function experience(definition) {
  return Object.freeze({
    visible: false,
    route: definition.mission == null
      ? `/${definition.id}/`
      : `/?program=${definition.id}`,
    blocker: "",
    ...definition,
  });
}

// This is the release source of truth for every experience reachable from the production shell.
// `hidden` HTML is presentation, never a release gate: routing, menu rendering, tests and status
// documentation consume these states instead. Only PRODUCTION entries may start from a public
// route; PREVIEW and QUARANTINED entries remain in the repository for focused development.
export const EXPERIENCE_CATALOG = Object.freeze([
  experience({
    id: "first-merge",
    mission: 7,
    sequence: 1,
    aircraft: "F-22A",
    title: "Guns Only",
    shortObjective: "Endless guns-only dogfight. The wave escalates while you keep winning.",
    qualification: "",
    releaseState: EXPERIENCE_RELEASE_STATE.PRODUCTION,
    visible: true,
  }),
  experience({
    id: "low-level-drone",
    mission: 8,
    sequence: 2,
    aircraft: "F-22A",
    title: "Low-Level Drone Intercept",
    shortObjective: "Stop four low-flying raiders over a fictional Ukrainian training sector.",
    qualification: "",
    releaseState: EXPERIENCE_RELEASE_STATE.QUARANTINED,
    blocker: "Ground-target and complete player-path acceptance are outstanding.",
  }),
  experience({
    id: "medevac",
    mission: 13,
    sequence: 3,
    aircraft: "Air Ambulance",
    title: "Medevac",
    shortObjective: "Fly low to one pickup, secure the capsule, and hand it over at the clinic.",
    qualification: "",
    releaseState: EXPERIENCE_RELEASE_STATE.QUARANTINED,
    blocker: "The orchard-gap guidance is wired; an end-to-end human flight is still outstanding.",
  }),
  // Circuits sits BEFORE the intercept deliberately. The trap is the hardest thing the aircraft
  // asks for and the intercept offered exactly one attempt at it, far from home and low on fuel.
  experience({
    id: "rapier-circuits",
    mission: 11,
    sequence: 4,
    aircraft: "Rapier",
    title: "Rapier Circuits",
    shortObjective: "Launch west, fly the pattern, trap. Repeat until the hook is easy.",
    qualification: "",
    releaseState: EXPERIENCE_RELEASE_STATE.PREVIEW,
    blocker: "This training route is not part of the production front door yet.",
  }),
  experience({
    id: "rapier-intercept",
    mission: 12,
    sequence: 5,
    aircraft: "Rapier",
    title: "Rapier Intercept",
    shortObjective: "Climb onto the thin-air M4.2 shelf, zoom for one gun pass on the high-altitude balloon, then re-enter and trap at the midpoint arrestor.",
    qualification: "",
    releaseState: EXPERIENCE_RELEASE_STATE.PRODUCTION,
    visible: true,
  }),
  // Korea 1951. The oldest aircraft in the game and the only one flown from a straight deck —
  // and until now the only one with no way in at all: the F9F-2 and the paddles/LSO machinery
  // built around it existed solely inside a unit test.
  experience({
    id: "korea-panther",
    mission: 14,
    sequence: 6,
    aircraft: "F9F-2 Panther",
    title: "Korea — Panther off Essex",
    shortObjective: "Catshot off USS Essex, fly the sortie, and bring it back to the wires. Straight deck: there is no bolter.",
    qualification: "",
    releaseState: EXPERIENCE_RELEASE_STATE.QUARANTINED,
    blocker: "The terrain-loaded open-water launch is green; full sortie, recovery, and human acceptance are still outstanding.",
  }),
  experience({
    id: "indoor",
    mission: null,
    sequence: 7,
    aircraft: "MIDGE-03",
    title: "Facility Nine",
    shortObjective: "Fly the indoor reconnaissance exercise without breaking stealth.",
    qualification: "",
    releaseState: EXPERIENCE_RELEASE_STATE.QUARANTINED,
    blocker: "Advertised controls and stealth-failure behavior require player-path acceptance.",
  }),
  experience({
    id: "medevac-command",
    mission: null,
    sequence: 8,
    route: "/medevac/",
    aircraft: "Command prototype",
    title: "Medevac command prototype",
    shortObjective: "Exercise the parked medical logistics and selective-relay prototype.",
    qualification: "",
    releaseState: EXPERIENCE_RELEASE_STATE.QUARANTINED,
    blocker: "This research prototype is not the canonical flight course and has not graduated its player-path acceptance gate.",
  }),
  experience({
    id: "cobra-lab",
    mission: null,
    sequence: 9,
    route: "/cobra-lab/",
    aircraft: "AH-1G Cobra world prototype",
    title: "Cobra Canyon",
    shortObjective: "Fly the authored low-level Cobra Canyon routes with an AH-1G and copilot gunner.",
    qualification: "",
    releaseState: EXPERIENCE_RELEASE_STATE.PRODUCTION,
    visible: true,
    blocker: "",
  }),
  experience({
    id: "weekend-ride",
    mission: null,
    sequence: 10,
    route: "/?program=weekend-ride",
    aircraft: "YZF-R1",
    title: "Weekend Ride",
    shortObjective: "Free-drive a sourced Yamaha YZF-R1 on the painted 10,000 ft runway circuit.",
    qualification: "",
    releaseState: EXPERIENCE_RELEASE_STATE.COMING_SOON,
    visible: true,
    blocker: "Motorcycle dynamics, helmet HUD, and a representative human ride are still in progress.",
  }),
]);

export const CAMPAIGN_NODES = Object.freeze(
  EXPERIENCE_CATALOG.filter((entry) => Number.isInteger(entry.mission)),
);

const NODE_BY_ID = new Map(CAMPAIGN_NODES.map((node) => [node.id, node]));
const EXPERIENCE_BY_ID = new Map(EXPERIENCE_CATALOG.map((entry) => [entry.id, entry]));

export function experienceById(experienceId) {
  return EXPERIENCE_BY_ID.get(String(experienceId || "")) ?? null;
}

export function experienceLaunchable(experienceId) {
  return experienceById(experienceId)?.releaseState === EXPERIENCE_RELEASE_STATE.PRODUCTION;
}

export function experienceComingSoon(experienceId) {
  return experienceById(experienceId)?.releaseState === EXPERIENCE_RELEASE_STATE.COMING_SOON;
}

export function productionExperiences() {
  return EXPERIENCE_CATALOG.filter((entry) =>
    entry.visible && entry.releaseState === EXPERIENCE_RELEASE_STATE.PRODUCTION);
}

function cleanQualification(value) {
  if (!value || typeof value !== "object") return null;
  const qualifiedAt = Number(value.qualifiedAt);
  return Object.freeze({
    qualifiedAt: Number.isFinite(qualifiedAt) ? qualifiedAt : 0,
    score: Math.max(0, Math.round(Number(value.score) || 0)),
    kills: Math.max(0, Math.round(Number(value.kills) || 0)),
  });
}

function cleanAppliedRapierSorties(value) {
  if (!Array.isArray(value)) return Object.freeze([]);
  const unique = [];
  const seen = new Set();
  for (const candidate of value) {
    const key = String(candidate || "").trim().toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(key) || seen.has(key)) continue;
    seen.add(key);
    unique.push(key);
  }
  return Object.freeze(unique.slice(-MAX_APPLIED_RAPIER_SORTIES));
}

export function createCampaignProfile(value = null) {
  const source = value && typeof value === "object" ? value : {};
  const qualifications = {};
  for (const node of CAMPAIGN_NODES) {
    const qualification = cleanQualification(source.qualifications?.[node.id]);
    if (qualification) qualifications[node.id] = qualification;
  }
  return Object.freeze({
    version: CAMPAIGN_PROFILE_VERSION,
    // Version 1 called the same fictional allocation unit "points". Accept it once as migration
    // input, but keep the Rapier budget explicitly separate from arcade scores thereafter.
    rapierBalanceCredits: Math.trunc(Number(
      source.rapierBalanceCredits ?? source.pointsBalance,
    ) || 0),
    appliedRapierSortieKeys: cleanAppliedRapierSorties(
      source.appliedRapierSortieKeys,
    ),
    qualifications: Object.freeze(qualifications),
  });
}

export function loadCampaignProfile(storage = globalThis.localStorage) {
  try {
    const raw = storage?.getItem?.(CAMPAIGN_STORAGE_KEY);
    return createCampaignProfile(raw ? JSON.parse(raw) : null);
  } catch {
    return createCampaignProfile();
  }
}

export function saveCampaignProfile(profile, storage = globalThis.localStorage) {
  const clean = createCampaignProfile(profile);
  try {
    storage?.setItem?.(CAMPAIGN_STORAGE_KEY, JSON.stringify(clean));
  } catch {
    // Storage can be unavailable in private/embedded contexts. The in-memory profile still works.
  }
  return clean;
}

export function applyRapierSortieCredits(profile, applicationKey, credits) {
  const current = createCampaignProfile(profile);
  const key = String(applicationKey || "").trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(key)
    || current.appliedRapierSortieKeys.includes(key)) {
    return Object.freeze({ profile: current, applied: false });
  }
  const next = createCampaignProfile({
    ...current,
    rapierBalanceCredits:
      current.rapierBalanceCredits + Math.trunc(Number(credits) || 0),
    appliedRapierSortieKeys: [
      ...current.appliedRapierSortieKeys,
      key,
    ],
  });
  return Object.freeze({ profile: next, applied: true });
}

export function campaignNode(nodeId) {
  return NODE_BY_ID.get(String(nodeId || "")) ?? null;
}

export function campaignNodeUnlocked(profile, nodeId) {
  // This function historically described qualification locks. It now answers the more important
  // release question: may this production route start? Profile progress never promotes preview or
  // quarantined content; a release-state change must be explicit and reviewed in the catalog.
  return experienceLaunchable(nodeId);
}

export function campaignNodeQualified() {
  // Retained as a no-op so callers keep compiling; there is no qualification any more.
  return false;
}

export function recommendedCampaignNode(profile) {
  return CAMPAIGN_NODES.find((node) =>
    campaignNodeUnlocked(profile, node.id) && !campaignNodeQualified(profile, node.id))
    ?? CAMPAIGN_NODES.at(-1);
}

export function nextCampaignNode(profile, nodeId) {
  const node = campaignNode(nodeId);
  if (!node || !campaignNodeQualified(profile, node.id)) return node;
  return CAMPAIGN_NODES.find((candidate) => candidate.sequence > node.sequence
    && campaignNodeUnlocked(profile, candidate.id)
    && !campaignNodeQualified(profile, candidate.id)) ?? null;
}

export function qualifyCampaignNode(profile) {
  // Qualification progression was retired when route availability moved to the explicit release
  // catalog. Keep this compatibility export side-effect-free while older callers roll off: it
  // must never resurrect saved qualifications, write storage, or emit an earned event.
  const current = createCampaignProfile(profile);
  return Object.freeze({ profile: current, newlyQualified: false });
}
