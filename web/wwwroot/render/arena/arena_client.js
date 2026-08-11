import { resolvePilotKey } from "../presence/global_room_client.js";

/**
 * Resolve the arena HTTP base URL.
 * - Multiplayer lane passes forceSameOrigin: true → always `/arena` on this host; overrides are
 *   ignored so the release gate and storage policy cannot be bypassed by a copied URL.
 * - `?arena=1` also enables same-origin `/arena`.
 * - `?arena=http://localhost:5081` (local only) hits ASP.NET parity.
 * - `?arena=off` disables.
 */
export function resolveArenaUrl({
  location = globalThis.location,
  configured = globalThis.GUNS_ARENA_URL,
  forceSameOrigin = false,
} = {}) {
  const query = new URLSearchParams(location?.search || "");
  const override = query.get("arena");
  if (forceSameOrigin) {
    return `${location?.origin || ""}/arena`.replace(/\/$/, "") || "/arena";
  }
  if (override === "off" || override === "0") return "";

  const localPage = location?.hostname === "localhost" || location?.hostname === "127.0.0.1"
    || location?.hostname === "::1";
  if (override && /^(https?:)?\/\//i.test(override) && localPage) {
    try {
      const url = new URL(override, location?.origin);
      if (url.protocol === "http:" || url.protocol === "https:") {
        return url.href.replace(/\/$/, "");
      }
    } catch {
      return "";
    }
  }

  const want = override === "1" || override === "true" || override === "on";
  if (!want) return "";

  const configuredUrl = String(configured || "").replace(/\/$/, "");
  if (configuredUrl) return configuredUrl;
  return `${location?.origin || ""}/arena`.replace(/\/$/, "") || "/arena";
}

export function arenaEnabled(location = globalThis.location, { forceSameOrigin = false } = {}) {
  return Boolean(resolveArenaUrl({ location, forceSameOrigin }));
}

/** True when the client should POST action payloads to /arena (Vercel), not /v1/match. */
export function usesVercelArenaApi(baseUrl) {
  if (!baseUrl) return false;
  try {
    const url = new URL(baseUrl, "http://local.invalid");
    return url.pathname === "/arena" || url.pathname.endsWith("/arena");
  } catch {
    return String(baseUrl).endsWith("/arena");
  }
}

export class ArenaClient {
  constructor({
    baseUrl = resolveArenaUrl(),
    fetchImpl = globalThis.fetch.bind(globalThis),
    pilotKey = resolvePilotKey(),
  } = {}) {
    this.baseUrl = String(baseUrl || "").replace(/\/$/, "");
    this.fetchImpl = fetchImpl;
    this.pilotKey = pilotKey;
    this.activeMatch = null;
    this.lastResult = null;
    this._startedAtMs = 0;
    this._roundsAtStart = 0;
    this._minRangeM = Infinity;
    this._engagementReached = false;
    this._completed = false;
  }

  get enabled() {
    return Boolean(this.baseUrl);
  }

  async requestMatch({ scaffolded = false } = {}) {
    if (!this.enabled) return null;
    const vercelApi = usesVercelArenaApi(this.baseUrl);
    const url = vercelApi ? this.baseUrl : `${this.baseUrl}/v1/match`;
    const payload = vercelApi
      ? { action: "match", pilotKey: this.pilotKey, scaffolded }
      : { pilotKey: this.pilotKey, scaffolded };
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const body = await response.json();
    if (!response.ok || !body?.ok) {
      throw new Error(body?.reason || `arena match failed (${response.status})`);
    }
    this.activeMatch = body;
    this.lastResult = null;
    this._completed = false;
    this._startedAtMs = 0;
    this._roundsAtStart = 0;
    this._minRangeM = Infinity;
    this._engagementReached = false;
    return body;
  }

  beginTracking(state) {
    this._startedAtMs = performance.now();
    this._roundsAtStart = Number(state?.shots_total ?? state?.player_shots_total ?? 0) || 0;
    this._minRangeM = Number.isFinite(state?.range_m) ? state.range_m : Infinity;
    this._engagementReached = false;
    this._completed = false;
  }

  observe(state) {
    if (!this.activeMatch || this._completed || !state) return null;
    if (this._startedAtMs <= 0) this.beginTracking(state);

    const range = Number(state.range_m);
    if (Number.isFinite(range)) {
      this._minRangeM = Math.min(this._minRangeM, range);
      if (range <= 2_000) this._engagementReached = true;
    }
    if (state.bandit_alive === false || state.fight === "Splash") {
      this._engagementReached = true;
    }

    const finished = state.finished === true
      || state.session_phase === "FINISHED"
      || state.player_alive === false
      || state.bandit_alive === false
      || state.fight === "Splash";
    if (!finished) return null;

    const playerAlive = state.player_alive !== false;
    const banditAlive = state.bandit_alive !== false && state.fight !== "Splash";
    let outcome = "draw";
    if (playerAlive && !banditAlive) outcome = "win";
    else if (!playerAlive && banditAlive) outcome = "loss";
    else if (!playerAlive && !banditAlive) outcome = "draw";
    else if (state.finished === true || state.session_phase === "FINISHED") outcome = "timeout";

    return { outcome, state };
  }

  async completeFromState(state, {
    againVote = 0,
    rematch = false,
    earlyAbandon = false,
  } = {}) {
    if (!this.activeMatch || this._completed) return this.lastResult;
    const observed = this.observe(state) || { outcome: earlyAbandon ? "loss" : "timeout", state };
    const durationS = this._startedAtMs > 0
      ? (performance.now() - this._startedAtMs) / 1000
      : 0;
    const roundsFired = Math.max(0,
      (Number(state?.shots_total ?? state?.player_shots_total ?? 0) || 0) - this._roundsAtStart);

    const vercelApi = usesVercelArenaApi(this.baseUrl);
    const body = {
      ...(vercelApi ? { action: "complete" } : {}),
      matchId: this.activeMatch.matchId,
      pilotKey: this.pilotKey,
      outcome: observed.outcome,
      completed: !earlyAbandon,
      earlyAbandon,
      rematch,
      againVote,
      sanity: {
        durationS,
        roundsFired,
        engagementReached: this._engagementReached || observed.outcome === "win",
      },
    };
    const url = vercelApi ? this.baseUrl : `${this.baseUrl}/v1/match/complete`;
    const response = await this.fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = await response.json();
    this._completed = true;
    this.lastResult = result;
    this.activeMatch = null;
    return result;
  }

  applyHandicapToBridge(bridge) {
    if (!this.activeMatch?.handicap || !bridge?.ApplyArenaHandicap) return false;
    const skill = this.activeMatch.handicap.highSkill
      || this.activeMatch.bot?.nativeSkill
      || "COMPETENT";
    return bridge.ApplyArenaHandicap(JSON.stringify(this.activeMatch.handicap), skill);
  }
}
