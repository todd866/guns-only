// The swing meter (robot golf, country-club.mjs): while E is held the power swings 0 -> 1 -> 0 over
// `period` seconds, so letting go at the top is a full swing and a tap is a soft putt.
export const SWING = Object.freeze({ period: 1.6 });
export const swingPowerOf = held => { const t = (held / SWING.period) % 1; return t < .5 ? t * 2 : 2 - t * 2; };
