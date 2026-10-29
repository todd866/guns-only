// Seasonal dressing for the base. The player's own calendar picks the season, so a kid sees the
// decorations their street has; `?season=halloween` or `?season=none` overrides it for QA.
export const SEASONS = Object.freeze({
  // Decorations go up for October and stay out through the morning after (1 November).
  halloween: { from: [10, 1], to: [11, 1] },
});

const onOrAfter = ([m, d], month, day) => month > m || (month === m && day >= d);
const onOrBefore = ([m, d], month, day) => month < m || (month === m && day <= d);

export function seasonOn(date = new Date()) {
  const month = date.getMonth() + 1, day = date.getDate();
  for (const [id, { from, to }] of Object.entries(SEASONS)) if (onOrAfter(from, month, day) && onOrBefore(to, month, day)) return id;
  return null;
}

export function currentSeason(search = '', date = new Date()) {
  const asked = new URLSearchParams(search).get('season');
  if (asked === 'none') return null;
  if (asked && Object.hasOwn(SEASONS, asked)) return asked;
  return seasonOn(date);
}
