/**
 * Boot watchdog: tell SLOW apart from STUCK.
 *
 * Two different failures produced the same picture in production — a painted sky, a 7-pixel pulse,
 * and nothing else — and we could not tell them apart from the outside:
 *
 *   - SLOW: a Threads session that really did reach `ready`, after 18–25 seconds. Killing that boot
 *     with a "something went wrong" panel would throw away a working player.
 *   - STUCK: three sessions that logged `script_load` and never logged anything again. Those need
 *     a way out, and they needed it twenty seconds ago.
 *
 * The discriminator is PROGRESS, not elapsed time. A boot that is still advancing milestones, or
 * still pulling bytes off the network, is slow; a boot that has advanced neither for `stallMs` is
 * stuck. So the watchdog takes a monotonic `progress` counter (the app feeds it the browser's
 * resource-timing byte total) alongside milestone marks, and only the ABSENCE of both escalates.
 *
 * Two further rules keep it honest:
 *   - Hidden time does not count. A webview backgrounded because the player answered a message is
 *     not a stalled boot, and on iOS it is guaranteed to look like one: timers and rAF stop.
 *   - The clock is driven by `tick()` from a plain interval, never requestAnimationFrame. rAF is
 *     the mechanism that hangs in a throttled webview, so a watchdog built on it would be asleep
 *     in exactly the sessions it exists to catch.
 */

export const BOOT_WATCHDOG_STATES = Object.freeze(["booting", "slow", "stalled", "ready"]);

const DEFAULT_MILESTONES = Object.freeze(["script_load", "bridge_ready", "webgl_ok", "ready"]);

export function createBootWatchdog({
  milestones = DEFAULT_MILESTONES,
  readyMilestone = "ready",
  // A phone on a bad connection routinely needs ten seconds before the first frame. Announce
  // progress at that point; do not accuse anything of being broken.
  slowMs = 9_000,
  // No milestone and no bytes for this long is a stall, not a slow link.
  stallMs = 12_000,
  // Backstop for a boot that dribbles bytes forever without ever finishing.
  hardMs = 75_000,
  now = () => Date.now(),
  progress = () => 0,
  isHidden = () => false,
  onState = () => {},
} = {}) {
  const order = [...milestones];
  const startedAt = now();
  let state = "booting";
  let lastMilestone = null;
  let milestoneRank = -1;
  let lastProgressValue = Number(progress()) || 0;
  let hiddenSince = isHidden() ? startedAt : null;
  let hiddenTotal = 0;
  let activeAtLastProgress = 0;
  let stopped = false;

  function activeMs(at = now()) {
    let hidden = hiddenTotal;
    if (hiddenSince != null) hidden += Math.max(0, at - hiddenSince);
    return Math.max(0, at - startedAt - hidden);
  }

  function snapshot(at = now()) {
    const active = activeMs(at);
    return Object.freeze({
      state,
      milestone: lastMilestone,
      active_ms: Math.round(active),
      since_progress_ms: Math.round(active - activeAtLastProgress),
    });
  }

  function transition(next, at) {
    if (state === next) return;
    state = next;
    try {
      onState(snapshot(at));
    } catch {
      // A presentation failure in the fallback UI must never take the boot down with it.
    }
  }

  function noteProgress(at) {
    activeAtLastProgress = activeMs(at);
  }

  return {
    get state() {
      return state;
    },
    get milestone() {
      return lastMilestone;
    },
    snapshot,

    /** Record a boot milestone. Out-of-order or repeat marks are ignored. */
    mark(milestone) {
      if (stopped) return false;
      const rank = order.indexOf(milestone);
      if (rank < 0 || rank <= milestoneRank) return false;
      const at = now();
      milestoneRank = rank;
      lastMilestone = milestone;
      noteProgress(at);
      if (milestone === readyMilestone) {
        stopped = true;
        transition("ready", at);
        return true;
      }
      // A milestone is proof of life: a boot that had been declared stalled and then delivers
      // `bridge_ready` is demoted back to merely slow rather than left accused.
      if (state === "stalled") transition("slow", at);
      return true;
    },

    /** Call from a plain interval. Returns the current state snapshot. */
    tick() {
      const at = now();
      if (stopped) return snapshot(at);

      const hidden = Boolean(isHidden());
      if (hidden && hiddenSince == null) hiddenSince = at;
      else if (!hidden && hiddenSince != null) {
        hiddenTotal += Math.max(0, at - hiddenSince);
        hiddenSince = null;
      }
      if (hidden) return snapshot(at);

      const value = Number(progress()) || 0;
      if (value > lastProgressValue) {
        lastProgressValue = value;
        noteProgress(at);
        if (state === "stalled") transition("slow", at);
      }

      const active = activeMs(at);
      if (active >= hardMs) transition("stalled", at);
      else if (active - activeAtLastProgress >= stallMs && active >= slowMs) {
        transition("stalled", at);
      } else if (active >= slowMs && state === "booting") transition("slow", at);
      return snapshot(at);
    },

    stop() {
      stopped = true;
    },
  };
}

/**
 * Monotonic "bytes have arrived" counter from the Performance timeline.
 *
 * transferSize is zero for cross-origin responses without Timing-Allow-Origin, so entry COUNT is
 * summed alongside it: a boot pulling opaque resources still registers as making progress.
 */
export function resourceProgressCounter(performanceRef = globalThis.performance) {
  return () => {
    const entries = performanceRef?.getEntriesByType?.("resource");
    if (!Array.isArray(entries)) return 0;
    let bytes = 0;
    for (const entry of entries) bytes += Number(entry?.transferSize) || 0;
    return entries.length * 1024 + bytes;
  };
}
