// Campaign: the toy-world map ladder, stars, stickers, unlocks, and
// persistence. Storage is injected so tests never touch real localStorage.

import {MISSIONS} from "./missions.mjs";

export const PROGRESS_KEY = "toy-chopper.progress.v1";

export const STICKERS = Object.freeze([
  {id: "first-pop", name: "First Pop!", test: (t) => t.pops >= 1},
  {id: "sharpshooter", name: "Sharpshooter", test: (t) => t.accuracy >= 0.5 && t.shots >= 8},
  {id: "balloon-buster", name: "Balloon Buster", test: (t) => t.pops >= 10},
  {id: "train-guard", name: "Train Guard", test: (t) => t.missionId === "toy-train" && t.wobbles <= 2},
  {id: "blimp-popper", name: "Blimp Popper", test: (t) => t.missionId === "blimp-boss"},
  {id: "medic-magnet", name: "Medic Magnet", test: (t) => t.friendlySplats >= 3},
  {id: "ace-pilot", name: "Ace Pilot", test: (t, stars) => (stars?.pilot ?? 0) >= 3},
]);

export const UNLOCKS = Object.freeze([
  {id: "paint-sunburst", name: "Sunburst paint", starsNeeded: 3, kind: "paint"},
  {id: "paint-shark", name: "Shark-smile paint", starsNeeded: 6, kind: "paint"},
  {id: "bubble-cannon", name: "Bubble cannon", starsNeeded: 9, kind: "gunner-toy"},
  {id: "confetti-mortar", name: "Confetti mortar", starsNeeded: 12, kind: "gunner-toy"},
]);

export function emptyProgress() {
  return {stars: {}, stickers: [], totalStars: 0};
}

export function loadProgress(storage) {
  try {
    const raw = storage?.getItem?.(PROGRESS_KEY);
    if (!raw) return emptyProgress();
    const parsed = JSON.parse(raw);
    const stars = typeof parsed?.stars === "object" && parsed.stars !== null ? parsed.stars : {};
    const stickers = Array.isArray(parsed?.stickers) ? parsed.stickers.filter((s) => typeof s === "string") : [];
    return {stars, stickers, totalStars: totalStars({stars})};
  } catch {
    return emptyProgress();
  }
}

export function saveProgress(storage, progress) {
  try {
    storage?.setItem?.(PROGRESS_KEY, JSON.stringify({stars: progress.stars, stickers: progress.stickers}));
    return true;
  } catch {
    return false;
  }
}

export function totalStars(progress) {
  let sum = 0;
  for (const entry of Object.values(progress?.stars ?? {})) {
    sum += Math.max(0, Math.min(3, entry?.pilot ?? 0)) + Math.max(0, Math.min(3, entry?.gunner ?? 0));
  }
  return sum;
}

/** Stars keep the best run; stickers are one-way. Returns the new progress + what's new. */
export function applyResult(progress, missionId, stars, telemetry) {
  const prior = progress.stars[missionId] ?? {pilot: 0, gunner: 0};
  const merged = {
    pilot: Math.max(prior.pilot, stars?.pilot ?? 0),
    gunner: Math.max(prior.gunner, stars?.gunner ?? 0),
  };
  const nextStars = {...progress.stars, [missionId]: merged};
  const earned = STICKERS.filter((s) => !progress.stickers.includes(s.id) && s.test(telemetry ?? {}, stars));
  const stickers = [...progress.stickers, ...earned.map((s) => s.id)];
  const before = totalStars(progress);
  const next = {stars: nextStars, stickers, totalStars: totalStars({stars: nextStars})};
  const newUnlocks = UNLOCKS.filter((u) => before < u.starsNeeded && next.totalStars >= u.starsNeeded);
  return {progress: next, newStickers: earned, newUnlocks};
}

export function unlocked(progress) {
  const total = totalStars(progress);
  return UNLOCKS.filter((u) => total >= u.starsNeeded);
}

/** The ladder: a mission opens when the one before it has any star. */
export function missionUnlocked(progress, missionId) {
  const index = MISSIONS.findIndex((m) => m.id === missionId);
  if (index <= 0) return true;
  const prev = progress.stars[MISSIONS[index - 1].id];
  return (prev?.pilot ?? 0) + (prev?.gunner ?? 0) > 0;
}

/** Rows for the campaign map menu: one per mission, pad-navigable. */
export function campaignRows(progress) {
  return MISSIONS.map((m) => {
    const entry = progress.stars[m.id] ?? {pilot: 0, gunner: 0};
    const open = missionUnlocked(progress, m.id);
    return {
      id: m.id,
      name: m.name,
      kind: m.kind,
      open,
      pilotStars: entry.pilot,
      gunnerStars: entry.gunner,
      label: open
        ? `${m.name} · ✈${"★".repeat(entry.pilot).padEnd(3, "☆")} 🎯${"★".repeat(entry.gunner).padEnd(3, "☆")}`
        : `${m.name} · 🔒 earn a star before this one`,
    };
  });
}
