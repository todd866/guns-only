export const CAMPAIGN_STORAGE_KEY = "guns-only.raptor-program.v1";
export const CAMPAIGN_PROFILE_VERSION = 1;

export const CAMPAIGN_NODES = Object.freeze([
  Object.freeze({
    id: "first-merge",
    mission: 7,
    sequence: 1,
    aircraft: "F-22A",
    title: "First Merge",
    shortObjective: "Win one guns-only visual engagement.",
    qualification: "SPLASH ONE BANDIT",
  }),
  Object.freeze({
    id: "raid-defence",
    mission: 8,
    sequence: 2,
    aircraft: "F-22A",
    title: "Raid Defence",
    shortObjective: "Stop the staged drone stream with disciplined fire.",
    qualification: "65+ SCORE · 3 KILLS · MAX 1 LEAKER",
  }),
  Object.freeze({
    id: "endurance-merge",
    mission: 7,
    sequence: 3,
    aircraft: "F-22A",
    title: "Endurance Merge",
    shortObjective: "Survive successive neutral merges and score twice.",
    qualification: "SPLASH TWO BANDITS IN ONE SORTIE",
  }),
  Object.freeze({
    id: "ace-duel",
    mission: 9,
    sequence: 4,
    aircraft: "F-22A",
    title: "Ace Duel",
    shortObjective: "Win a lone guns-only duel against a forced Ace bandit.",
    qualification: "SPLASH THE ACE",
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
  const node = campaignNode(nodeId);
  if (!node) return false;
  if (node.sequence === 1) return true;
  const previous = CAMPAIGN_NODES[node.sequence - 2];
  return Boolean(profile?.qualifications?.[previous.id]);
}

export function campaignNodeQualified(profile, nodeId) {
  return Boolean(profile?.qualifications?.[String(nodeId || "")]);
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
    case "raid-defence":
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
  const score = nodeId === "raid-defence"
    ? Number(state?.drone_raid_score) : Number(state?.visual_merge_score);
  const kills = nodeId === "raid-defence"
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
