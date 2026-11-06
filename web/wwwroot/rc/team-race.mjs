// Split-screen team race: both humans finish, and the team takes the better place.
import {ordinal} from './result-panel.mjs';

export const TEAM_MEDAL = {1: '🥇', 2: '🥈', 3: '🥉'};

export function createTeamRace() {
  return {on: false};
}

/** 1-based places. The team result is the better of the two finishing places. */
export function bestPlace(p1, p2) {
  return Math.min(p1, p2);
}

export function teamCard(p1, p2) {
  const best = bestPlace(p1, p2);
  const mark = TEAM_MEDAL[best] ?? ordinal(best);
  return `Team ${mark} · P1 ${ordinal(p1)} · P2 ${ordinal(p2)}`;
}

/** Right-half lap chip. Multi-lap races show the lap; a single lap shows the gate. */
export function p2LapChip(session, checkpointCount) {
  const laps = session?.laps ?? 1;
  if (laps > 1) return `P2 LAP ${session.lap}/${laps}`;
  const n = checkpointCount ?? session?.course?.checkpoints?.length ?? 0;
  const gates = Math.max(1, n);
  return `P2 ${Math.min((session?.gate ?? 0) + 1, gates)}/${gates}`;
}
