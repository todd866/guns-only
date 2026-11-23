// Split-screen join UX: when to show the edge card and pause-menu player toggle (pure logic).
export const JOIN_HIDE_MS = 60_000;

export function joinPadIndex(live, p1Pad) {
  const pads = (live ?? []).filter(p => p?.connected);
  if (pads.length < 2) return null;
  if (p1Pad == null) return pads.find(p => p.index !== pads[0].index)?.index ?? pads[1]?.index ?? null;
  const other = pads.find(p => p.index !== p1Pad);
  return other?.index ?? null;
}

export function joinCardVisible({
  split,
  started,
  paused,
  panelOpen,
  now,
  joinHideUntil,
  playersUrl2,
  hasRival,
  live,
  p1Pad
}) {
  if (split || !started || !hasRival || paused || panelOpen) return false;
  if (joinPadIndex(live, p1Pad) == null) return false;
  if (!playersUrl2 && now < joinHideUntil) return false;
  return true;
}

export function menuPlayersButton({split, live, p1Pad}) {
  const n = (live ?? []).filter(p => p?.connected).length;
  if (n < 2) return {hidden: true, label: ''};
  if (split) return {hidden: false, label: '👤 1 player'};
  return {hidden: false, label: '👥 2 players'};
}

export function joinHideUntilAfterLeave(now) {
  return now + JOIN_HIDE_MS;
}
