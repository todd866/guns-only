// Authored 20-minute toy-world day, not a solar or astronomical simulation.
export function daylight(seconds, night = false) {
  const phase = (((seconds % 1200) + 1200) % 1200) / 1200;
  const sun = night ? -1 : Math.cos(phase * Math.PI * 2);
  const day = Math.max(0, Math.min(1, (sun + 0.2) / 0.65));
  return {day, night: 1 - day, sun: 0.3 + 3.1 * day, ambient: 0.85 + 0.5 * day};
}
