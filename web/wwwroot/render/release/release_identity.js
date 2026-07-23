export const RELEASE_BUILD = "73";
export const CANONICAL_PRODUCTION_ORIGIN = "https://guns-only.vercel.app";
export const BUILD_INFO_PATH = "/api/build-info";

function cleanToken(value, maximumLength) {
  const token = String(value || "").trim();
  if (!token || !/^[A-Za-z0-9._-]+$/.test(token)) return null;
  return token.slice(0, maximumLength);
}

export function normalizeBuildInfo(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const build = cleanToken(value.build, 32);
  if (!build) return null;
  return Object.freeze({
    build,
    revision: cleanToken(value.revision, 40),
    deployment: cleanToken(value.deployment, 96),
  });
}

function shortToken(value, maximumLength = 10) {
  if (!value) return null;
  if (value.length <= maximumLength) return value;
  return value.slice(0, maximumLength);
}

function visibleProvenance(value) {
  if (!value) return "";
  return [
    value.revision ? `REV ${shortToken(value.revision, 8)}` : null,
    value.deployment ? `DEP ${shortToken(value.deployment, 12)}` : null,
  ].filter(Boolean).join(" · ");
}

/**
 * Build identity is deliberately separate from the flight/HUD model. It is shell provenance:
 * enough to diagnose a stale deployment without becoming permanent cockpit decoration.
 */
export function createReleaseIdentity({
  entrypointBuild = "dev",
  running = null,
  current = null,
  lookup = "checking",
} = {}) {
  const entrypoint = cleanToken(entrypointBuild, 32) || "dev";
  const runningInfo = normalizeBuildInfo(running);
  const currentBuild = normalizeBuildInfo(current);
  const mixedEntrypoint = entrypoint !== "dev" && entrypoint !== RELEASE_BUILD;
  const superseded = Boolean(currentBuild && currentBuild.build !== RELEASE_BUILD);
  const runningBuildMismatch = Boolean(runningInfo && (
    runningInfo.build !== RELEASE_BUILD
    || (entrypoint !== "dev" && runningInfo.build !== entrypoint)
    || (currentBuild && runningInfo.build !== currentBuild.build)
  ));
  const revisionChanged = Boolean(
    runningInfo?.revision && currentBuild?.revision
    && runningInfo.revision !== currentBuild.revision,
  );
  const deploymentChanged = Boolean(
    runningInfo?.deployment && currentBuild?.deployment
    && runningInfo.deployment !== currentBuild.deployment,
  );
  const changedProvenance = Boolean(
    runningInfo && currentBuild
    && runningInfo.build === currentBuild.build
    && (revisionChanged || deploymentChanged),
  );
  const stale = mixedEntrypoint || superseded || runningBuildMismatch || changedProvenance;
  const revision = runningInfo?.revision || null;
  const deployment = runningInfo?.deployment || null;
  const discriminator = [
    revision ? `rev.${revision}` : null,
    deployment ? `dep.${deployment}` : null,
  ].filter(Boolean).join(".");
  const telemetryBuild = discriminator
    ? `${RELEASE_BUILD}+${discriminator}`
    : RELEASE_BUILD;
  const state = stale ? "stale"
    : lookup === "complete" ? "current"
      : lookup === "unverified" ? "unverified" : "checking";
  const visibleDetail = visibleProvenance(runningInfo);
  const runningBuild = runningInfo?.build || (entrypoint === "dev" ? RELEASE_BUILD : entrypoint);
  const expectedBuild = currentBuild?.build || RELEASE_BUILD;
  const currentProvenance = visibleProvenance(currentBuild);
  const currentDetail = currentProvenance ? ` · ${currentProvenance}` : "";
  const label = stale
    ? `UPDATE AVAILABLE · RUNNING BUILD ${runningBuild}${visibleDetail ? ` · ${visibleDetail}` : ""} · CURRENT BUILD ${expectedBuild}${currentDetail}`
    : `BUILD ${RELEASE_BUILD}${visibleDetail ? ` · ${visibleDetail}` : ""}${state === "checking" ? " · VERIFYING" : state === "unverified" ? " · UNVERIFIED" : ""}`;

  return Object.freeze({
    releaseBuild: RELEASE_BUILD,
    entrypointBuild: entrypoint,
    currentBuild: expectedBuild,
    revision,
    deployment,
    telemetryBuild,
    stale,
    state,
    label,
    telemetry: Object.freeze({
      release: RELEASE_BUILD,
      entrypoint,
      current: currentBuild?.build || null,
      revision,
      deployment,
      current_revision: currentBuild?.revision || null,
      current_deployment: currentBuild?.deployment || null,
      stale,
    }),
  });
}

export function buildInfoUrl(locationLike = globalThis.location) {
  const hostname = String(locationLike?.hostname || "").toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || !hostname) {
    return null;
  }
  if (hostname === "guns-only.vercel.app") return BUILD_INFO_PATH;
  if (hostname.endsWith(".vercel.app")) {
    return `${CANONICAL_PRODUCTION_ORIGIN}${BUILD_INFO_PATH}`;
  }
  return null;
}

/**
 * Same-origin provenance for the code which is actually running. A Vercel preview or retained
 * direct-deployment URL must establish this baseline before it asks canonical production what is
 * current; otherwise the canonical answer is accidentally recorded as both sides of the compare.
 */
export function runningBuildInfoUrl(locationLike = globalThis.location) {
  const hostname = String(locationLike?.hostname || "").toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || !hostname) {
    return null;
  }
  return hostname.endsWith(".vercel.app") ? BUILD_INFO_PATH : null;
}
