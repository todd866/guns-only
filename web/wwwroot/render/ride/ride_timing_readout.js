/**
 * Formats the ride's lap clock for the rider. Pure: timing numbers in, drawable strings out,
 * no canvas and no DOM, so the contract can be pinned without a browser.
 *
 * A missing time reads as dashes rather than 0:00.00 — a fake zero looks like a real lap and
 * would be the fastest thing on the board.
 */

/** m:ss.hh. Motorsport truncates rather than rounds, so 1:23.456 stays 1:23.45. */
export function formatLapTime(seconds) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "\u2014:\u2014\u2014";
  // Integer hundredths: decomposing in floating point makes 9.2 s read 0:09.19, because
  // (9.2 - 9) * 100 is 19.999…. The epsilon absorbs that without rounding a lap UP.
  const centiseconds = Math.floor(seconds * 100 + 1e-6);
  const minutes = Math.floor(centiseconds / 6_000);
  const wholeSeconds = Math.floor((centiseconds % 6_000) / 100);
  const hundredths = centiseconds % 100;
  return `${minutes}:${String(wholeSeconds).padStart(2, "0")}.${String(hundredths).padStart(2, "0")}`;
}

/** Mirrors RideLapTiming.SplitSampleCount — the fixed size of a stored best-lap profile. */
export const RIDE_SPLIT_SAMPLE_COUNT = 32;

/** The ride HUD's blank, so a missing time reads the same everywhere. */
export const BLANK_LAP_TIME = formatLapTime(Number.NaN);

function finite(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * A C# `double?` null crosses the bridge as 0, so "finite" is not enough to mean "present":
 * a zero best would render a 0:00.00 record and a delta against nothing. Only a positive
 * time counts as a real lap.
 */
function presentTime(value) {
  const numeric = finite(value);
  return numeric !== null && numeric > 0 ? numeric : null;
}

/**
 * @returns {{ lap: string, last: string, best: string,
 *   delta: { text: string, ahead: boolean } | null, invalid: boolean }}
 */
export function rideTimingReadout({
  lapSeconds,
  lastLapSeconds,
  bestLapSeconds,
  deltaSeconds,
  lapValid = true,
} = {}) {
  const delta = finite(deltaSeconds);
  const best = presentTime(bestLapSeconds);
  return {
    lap: formatLapTime(lapSeconds),
    last: formatLapTime(lastLapSeconds),
    best: formatLapTime(bestLapSeconds),
    // No best means nothing to be ahead OF; showing a delta then would be a lie.
    delta: delta === null || best === null
      ? null
      : {
        text: `${delta < 0 ? "-" : "+"}${Math.abs(delta).toFixed(2)}`,
        ahead: delta < 0,
      },
    invalid: lapValid === false,
  };
}
