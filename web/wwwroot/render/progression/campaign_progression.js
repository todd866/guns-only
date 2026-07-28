export const CAMPAIGN_STORAGE_KEY = "guns-only.raptor-program.v1";
export const CAMPAIGN_PROFILE_VERSION = 1;

export const CAMPAIGN_NODES = Object.freeze([
  Object.freeze({
    id: "first-merge",
    mission: 7,
    sequence: 1,
    aircraft: "F-22A",
    title: "Guns Only",
    shortObjective: "Endless guns-only dogfight. The wave escalates while you keep winning.",
    qualification: "",
  }),
  Object.freeze({
    id: "low-level-drone",
    mission: 8,
    sequence: 2,
    aircraft: "F-22A",
    title: "Low-Level Drone Intercept",
    shortObjective: "Stop four low-flying raiders over a fictional Ukrainian training sector.",
    qualification: "",
  }),
  // Circuits sits BEFORE the intercept deliberately. The trap is the hardest thing the aircraft
  // asks for and the intercept offered exactly one attempt at it, far from home and low on fuel.
  Object.freeze({
    id: "rapier-circuits",
    mission: 11,
    sequence: 3,
    aircraft: "Rapier",
    title: "Rapier Circuits",
    shortObjective: "Launch west, fly the pattern, trap. Repeat until the hook is easy.",
    qualification: "",
  }),
  Object.freeze({
    id: "rapier-intercept",
    mission: 10,
    sequence: 4,
    aircraft: "Rapier",
    title: "Rapier Intercept",
    shortObjective: "Climb around M0.90 to FL560, cross the live ram handover, ram-climb to FL700, release the swarm, recover.",
    qualification: "",
  }),
]);

const NODE_BY_ID = new Map(CAMPAIGN_NODES.map((node) => [node.id, node]));

function cleanQualification(value) {
  if (!value || typeof value !== "object") return null;
  const qualifiedAt = Number(value.qualifiedAt);
  return Object.freeze({
    qualifiedAt: Number.isFinite(qualifiedAt) ? qualifiedAt : 0,
    score: Math.max(0, Math.round(Number(value.score) || 0)),
    kills: Math.max(0, Math.round(Number(value.kills) || 0)),
  });
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
    pointsBalance: Math.trunc(Number(source.pointsBalance) || 0),
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

export function campaignNode(nodeId) {
  return NODE_BY_ID.get(String(nodeId || "")) ?? null;
}

export function campaignNodeUnlocked(profile, nodeId) {
  // EVERYTHING IS AVAILABLE. The qualification ladder was scaffolding from when the game was a
  // programme of exercises; every shipping mission is now available, and locking one behind
  // another only stands between the pilot and the aircraft or environment they wanted to fly.
  return Boolean(campaignNode(nodeId));
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

export function campaignNodeSatisfied(nodeId, state) {
  const kills = Math.max(0, Math.round(Number(state?.kill_count) || 0));
  switch (nodeId) {
    case "first-merge":
      return state?.visual_merge_evaluation === true && kills >= 1;
    case "low-level-drone":
      return state?.drone_raid_evaluation === true
        && state?.drone_raid_finished === true
        && Number(state?.drone_raid_score) >= 65
        && Number(state?.drone_raid_kills) >= 3
        && Number(state?.drone_raid_leakers) <= 1;
    case "endurance-merge":
      return state?.visual_merge_evaluation === true && kills >= 2;
    case "ace-duel":
      return state?.visual_merge_evaluation === true && kills >= 1;
    default:
      return false;
  }
}

export function qualifyCampaignNode(profile, nodeId, state, qualifiedAt = Date.now()) {
  const current = createCampaignProfile(profile);
  if (!campaignNodeUnlocked(current, nodeId)
    || campaignNodeQualified(current, nodeId)
    || !campaignNodeSatisfied(nodeId, state)) {
    return Object.freeze({ profile: current, newlyQualified: false });
  }
  const score = nodeId === "low-level-drone"
    ? Number(state?.drone_raid_score) : Number(state?.visual_merge_score);
  const kills = nodeId === "low-level-drone"
    ? Number(state?.drone_raid_kills) : Number(state?.kill_count);
  const next = createCampaignProfile({
    ...current,
    qualifications: {
      ...current.qualifications,
      [nodeId]: {
        qualifiedAt,
        score,
        kills,
      },
    },
  });
  return Object.freeze({ profile: next, newlyQualified: true });
}
