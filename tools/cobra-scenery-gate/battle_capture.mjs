import {
  COBRA_BATTLE_PROOF_MIN_ELAPSED_S,
  COBRA_BATTLE_PROOF_MIN_EXCHANGE_RANGE_M,
  COBRA_BATTLE_PROOF_MIN_RENDERED_DASHES,
  COBRA_BATTLE_PROOF_MIN_RENDERED_SPAN_PX,
  COBRA_BATTLE_PROOF_SAFE_MARGIN_PX,
} from "./battle_evidence.mjs";

const MAX_PROOF_STEPS = 96;
const PROOF_STEP_SECONDS = 0.05;
const PROOF_STEP_WALL_TIME_MS = 50;

/**
 * Restart battle-review authority, advance it in deterministic 0.05 s fixed steps, and latch a
 * frame containing actual production flash/tracer meshes from both factions. No effect is made,
 * moved, extended, or brightened here; the browser seam only reads the real presentation graph.
 */
export async function stageCobraBattleEvidence(page, siteId) {
  const restart = await page.evaluate(() =>
    window.__gunsOnlyCobraLabCamera?.restartBattleReview?.() ?? { supported: false });
  if (restart?.supported !== true)
    throw new Error("Cobra battle-review stepping seam is unavailable");

  let lastDiagnostics = restart;
  const knownEvents = new Map();
  for (let attempt = 0; attempt < MAX_PROOF_STEPS; attempt += 1) {
    const result = await page.evaluate((input) => {
      const api = window.__gunsOnlyCobraLabCamera;
      const step = api.stepBattleReview(input.stepSeconds);
      const state = window.__gunsOnlyCobraAuthority;
      const war = state?.ground_war;
      const units = (war?.units ?? []).filter((unit) => unit?.alive === true
        && unit?.home_site_id === input.siteId);
      const project = (point) => api.projectSimPointToScreen(
        point?.x_m, point?.y_m, point?.z_m,
      );
      const inSafeFrame = (point) => point?.inFrame === true
        && Number(point.x) >= input.safeMarginPx
        && Number(point.x) <= window.innerWidth - input.safeMarginPx
        && Number(point.y) >= input.safeMarginPx
        && Number(point.y) <= window.innerHeight - input.safeMarginPx;
      const screenEvidence = (rendered) => {
        const sourceFlash = project(rendered?.sourceFlash);
        const segments = (rendered?.tracer?.segments ?? []).map((segment) => {
          const start = project(segment?.start);
          const end = project(segment?.end);
          return { start, end, visible: inSafeFrame(start) && inSafeFrame(end) };
        });
        const visible = segments.filter((segment) => segment.visible);
        const points = visible.flatMap((segment) => [segment.start, segment.end]);
        let renderedSpanPx = 0;
        for (let left = 0; left < points.length; left += 1) {
          for (let right = left + 1; right < points.length; right += 1) {
            renderedSpanPx = Math.max(renderedSpanPx, Math.hypot(
              Number(points[right].x) - Number(points[left].x),
              Number(points[right].y) - Number(points[left].y),
            ));
          }
        }
        return {
          sourceFlash,
          sourceFlashInSafeFrame: inSafeFrame(sourceFlash),
          visibleDashCount: visible.length,
          renderedSpanPx,
          segments,
        };
      };
      const currentSiteEvents = (war?.events ?? []).filter((event) =>
        event?.kind === "small-arms" && event?.site_id === input.siteId);
      const proofEvents = [...input.knownEvents, ...currentSiteEvents].filter((event, index, all) =>
        all.findIndex((candidate) => candidate?.tick === event?.tick
          && candidate?.unit_id === event?.unit_id
          && candidate?.site_id === event?.site_id) === index);
      const candidates = [];
      const rejectedPackets = [];
      for (const event of [...proofEvents].reverse()) {
        if (event?.kind !== "small-arms" || event?.site_id !== input.siteId) continue;
        const exchangeRangeM = Math.hypot(
          Number(event.target_x_m) - Number(event.x_m),
          Number(event.target_y_m) - Number(event.y_m),
          Number(event.target_z_m) - Number(event.z_m),
        );
        if (!Number.isFinite(exchangeRangeM) || exchangeRangeM < input.minimumRangeM) continue;
        const rendered = api.renderedBattleEvidence(input.siteId, event.tick, event.unit_id);
        if (!rendered) {
          rejectedPackets.push({
            tick: event?.tick,
            unitId: event?.unit_id,
            faction: event?.faction,
            reason: "no-live-rendered-packet",
          });
          continue;
        }
        const screen = screenEvidence(rendered);
        candidates.push({ event, rendered, screen, exchangeRangeM });
      }
      const bestForFaction = (faction) => candidates
        .filter((candidate) => candidate.event?.faction === faction
          && candidate.screen.sourceFlashInSafeFrame === true
          && candidate.screen.visibleDashCount >= input.minimumDashes
          && candidate.screen.renderedSpanPx >= input.minimumSpanPx)
        .sort((left, right) => right.screen.renderedSpanPx - left.screen.renderedSpanPx)[0] ?? null;
      const packets = [bestForFaction("friendly"), bestForFaction("hostile")].filter(Boolean);
      const renderBefore = api.renderStats();
      const diagnostics = {
        step,
        status: state?.status ?? null,
        missionAct: state?.mission_act ?? null,
        combatLive: war?.combat_live ?? null,
        elapsedS: war?.debrief?.elapsed_s ?? null,
        friendlyAlive: units.filter((unit) => unit.faction === "friendly").length,
        hostileAlive: units.filter((unit) => unit.faction === "hostile").length,
        currentSiteEvents,
        candidatePackets: candidates.map((candidate) => ({
          tick: candidate.event?.tick,
          unitId: candidate.event?.unit_id,
          faction: candidate.event?.faction,
          sourceFlashInSafeFrame: candidate.screen.sourceFlashInSafeFrame,
          visibleDashCount: candidate.screen.visibleDashCount,
          renderedSpanPx: candidate.screen.renderedSpanPx,
        })),
        rejectedPackets,
      };
      const ready = state?.status === "active"
        && war?.combat_live === true
        && ["engage", "hold"].includes(String(state?.mission_act).toLowerCase())
        && Number(war?.debrief?.elapsed_s) >= input.minimumElapsedS
        && diagnostics.friendlyAlive >= 1
        && diagnostics.hostileAlive >= 1
        && packets.length === 2;
      if (!ready) return { ready: false, diagnostics };
      return {
        ready: true,
        beforeFrame: renderBefore.frame,
        evidence: {
          missionAct: String(state.mission_act).toLowerCase(),
          combatLive: true,
          elapsedS: war.debrief.elapsed_s,
          siteId: input.siteId,
          friendlyAlive: diagnostics.friendlyAlive,
          hostileAlive: diagnostics.hostileAlive,
          packets,
          render: null,
        },
      };
    }, {
      siteId,
      stepSeconds: PROOF_STEP_SECONDS,
      knownEvents: [...knownEvents.values()],
      minimumElapsedS: COBRA_BATTLE_PROOF_MIN_ELAPSED_S,
      minimumRangeM: COBRA_BATTLE_PROOF_MIN_EXCHANGE_RANGE_M,
      minimumDashes: COBRA_BATTLE_PROOF_MIN_RENDERED_DASHES,
      minimumSpanPx: COBRA_BATTLE_PROOF_MIN_RENDERED_SPAN_PX,
      safeMarginPx: COBRA_BATTLE_PROOF_SAFE_MARGIN_PX,
    });
    if (!result.ready) {
      lastDiagnostics = result.diagnostics;
      for (const event of result.diagnostics?.currentSiteEvents ?? []) {
        knownEvents.set(`${event.tick}|${event.unit_id}|${event.site_id}`, event);
      }
      while (knownEvents.size > 32) knownEvents.delete(knownEvents.keys().next().value);
      if (result.diagnostics?.status && result.diagnostics.status !== "active") break;
      // Presentation transients age on the production wall clock. Pace deterministic authority
      // by the same interval so the proof captures one honest combat moment instead of retaining
      // several seconds of muzzle flashes and powder from a millisecond-fast QA time warp.
      await page.waitForTimeout(PROOF_STEP_WALL_TIME_MS);
      continue;
    }

    // The authority/presentation sync above ran before RAF. Hold mission time, then require one
    // complete production render of those meshes before accepting renderer.info or the PNG.
    await page.waitForFunction(
      (beforeFrame) => Number(window.__gunsOnlyCobraLabCamera?.renderStats?.().frame) > beforeFrame,
      result.beforeFrame,
      { timeout: 20_000 },
    );
    result.evidence.render = await page.evaluate(() =>
      window.__gunsOnlyCobraLabCamera.renderStats());
    return result.evidence;
  }

  throw new Error(`unable to stage reciprocal rendered fire at ${siteId}: ${JSON.stringify(lastDiagnostics)}`);
}
