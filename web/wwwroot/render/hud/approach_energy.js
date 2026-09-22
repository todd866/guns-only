/// Next-gate energy cue for continuous approach guidance. Pure projection from snapshot fields.

/**
 * @param {Record<string, unknown>|null|undefined} state
 * @returns {{ label: string, targetAltM: number, targetTasMps: number, altErrorM: number, tasErrorMps: number }|null}
 */
export function approachEnergyCue(state) {
  // The F-22 conventional recovery teaches with world-space pattern shape and a one-word
  // energy chip. Keep the generic gate's prose-and-numbers panel off that pattern.
  if (state?.conventional_rtb_pattern_active === true) return null;
  if (state?.approach_guidance_active !== true || state?.approach_valid !== true) return null;
  const targetAltM = Number(state.approach_next_alt_m);
  const targetTasMps = Number(state.approach_next_tas_mps);
  const altErrorM = Number(state.approach_alt_error_m);
  const tasErrorMps = Number(state.approach_tas_error_mps);
  if (![targetAltM, targetTasMps, altErrorM, tasErrorMps].every(Number.isFinite)) return null;
  const label = typeof state.approach_next_label === "string" && state.approach_next_label.trim()
    ? state.approach_next_label.trim().toUpperCase()
    : "GATE";
  return Object.freeze({
    label,
    targetAltM,
    targetTasMps,
    altErrorM,
    tasErrorMps,
  });
}

/**
 * Compact HUD copy in the units pilots use. Targets and deviations deliberately share units.
 * @param {{ label: string, targetAltM: number, targetTasMps: number, altErrorM: number, tasErrorMps: number }} cue
 */
/**
 * One word for the conventional F-22 pattern. Null hides the chip, including when the sim has
 * not published an authoritative target. The prose panel stays a separate, suppressed cue.
 * @param {Record<string, unknown>|null|undefined} state
 * @returns {{ status: "TOO_FAST"|"ON_SPEED"|"TOO_SLOW", word: string, mark: number }|null}
 */
export function patternEnergyWord(state) {
  if (state?.conventional_rtb_pattern_active !== true) return null;
  const code = Math.floor(Number(state?.approach_energy_state_code) || 0);
  const status = ({ 1: "TOO_SLOW", 2: "ON_SPEED", 3: "TOO_FAST" })[code]
    ?? String(state?.approach_energy_state ?? "").trim().toUpperCase();
  const targetKtas = Number(state?.approach_energy_target_ktas);
  const toleranceKtas = Number(state?.approach_energy_tolerance_ktas);
  if (!Number.isFinite(targetKtas) || !(toleranceKtas >= 0)) return null;
  if (status === "TOO_FAST") return Object.freeze({ status, word: "FAST", mark: 1 });
  if (status === "TOO_SLOW") return Object.freeze({ status, word: "SLOW", mark: -1 });
  if (status === "ON_SPEED") return Object.freeze({ status, word: "ON SPEED", mark: 0 });
  return null;
}

export function formatApproachEnergyLine(cue) {
  const targetFt = Math.round(cue.targetAltM * 3.280839895);
  const targetKt = Math.round(cue.targetTasMps * 1.943844492);
  const errorFt = Math.round(Math.abs(cue.altErrorM) * 3.280839895);
  const errorKt = Math.round(Math.abs(cue.tasErrorMps) * 1.943844492);
  const altitude = Math.abs(cue.altErrorM) < 5
    ? "ALT OK"
    : `${cue.altErrorM > 0 ? "HIGH" : "LOW"} ${errorFt} FT`;
  const speed = Math.abs(cue.tasErrorMps) < 2
    ? "SPEED OK"
    : `${cue.tasErrorMps > 0 ? "FAST" : "SLOW"} ${errorKt} KTAS`;
  return `${cue.label} · ${targetFt} FT · ${targetKt} KTAS · ${altitude} · ${speed}`;
}

/**
 * Place the panel only when the shared HUD layout has a complete lane between warnings and the
 * weapon cue. Returning null is preferable to overprinting primary flight references.
 * @param {{ heading?: { bottom?: number }, warningY?: number, weaponCueY?: number }} layout
 * @param {number} panelHeight
 * @returns {number|null}
 */
export function approachEnergyPanelY(layout, panelHeight = 28) {
  const height = Number(panelHeight);
  const warningY = Number(layout?.warningY);
  const weaponCueY = Number(layout?.weaponCueY);
  const headingBottom = Number(layout?.heading?.bottom);
  if (![height, warningY, weaponCueY, headingBottom].every(Number.isFinite)
      || height <= 0) return null;
  const top = Math.max(headingBottom + 8, warningY + 16);
  const bottom = weaponCueY - 8;
  return bottom - top >= height ? top : null;
}

/**
 * Power command when SortieSchedule is absent. Null when sortie power already owns the lever.
 * @param {Record<string, unknown>|null|undefined} state
 * @returns {number|null}
 */
export function approachPowerFallback(state) {
  if (state?.sortie_valid === true) return null;
  if (state?.approach_guidance_active !== true || state?.approach_valid !== true) return null;
  const power = Number(state.approach_power_01);
  return Number.isFinite(power) ? Math.max(0, Math.min(1, power)) : null;
}
