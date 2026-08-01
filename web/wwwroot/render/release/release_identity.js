export const RELEASE_BUILD = "231";
export const CANONICAL_PRODUCTION_ORIGIN = "https://guns-only.com";

// Custom domains the guns-only Vercel project serves in production. guns-only.com is the
// canonical advertised door; guns-only.cohort.md is the school-filter-safe alternate.
const PRODUCTION_HOSTNAMES = new Set(["guns-only.com", "guns-only.cohort.md"]);
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
  locationLike = globalThis.location,
} = {}) {
  const entrypoint = cleanToken(entrypointBuild, 32) || "dev";
  const runningInfo = normalizeBuildInfo(running);
  const currentBuild = normalizeBuildInfo(current);
  const hostname = String(locationLike?.hostname || "").toLowerCase();
  const previewDeployment = hostname.endsWith(".vercel.app")
    && hostname !== new URL(CANONICAL_PRODUCTION_ORIGIN).hostname;
  const mixedEntrypoint = entrypoint !== "dev" && entrypoint !== RELEASE_BUILD;
  const superseded = Boolean(currentBuild && currentBuild.build !== RELEASE_BUILD);
  const localRuntimeMismatch = Boolean(runningInfo && (
    runningInfo.build !== RELEASE_BUILD
    || (entrypoint !== "dev" && runningInfo.build !== entrypoint)
  ));
  const productionBuildMismatch = Boolean(
    runningInfo && currentBuild && runningInfo.build !== currentBuild.build,
  );
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
  const productionDiffers = superseded || productionBuildMismatch || changedProvenance;
  // An immutable Vercel candidate is expected to differ from the public alias while it is being
  // tested. Keep genuine mixed-shell/runtime failures blocking everywhere, but make the
  // candidate-versus-production comparison an explicit warning until that deployment is promoted.
  const stale = mixedEntrypoint || localRuntimeMismatch
    || (!previewDeployment && productionDiffers);
  const candidate = previewDeployment && productionDiffers && !stale;
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
    : candidate ? "candidate"
    : lookup === "complete" ? "current"
      : lookup === "unverified" ? "unverified" : "checking";
  const visibleDetail = visibleProvenance(runningInfo);
  const runningBuild = runningInfo?.build || (entrypoint === "dev" ? RELEASE_BUILD : entrypoint);
  const expectedBuild = currentBuild?.build || RELEASE_BUILD;
  const currentProvenance = visibleProvenance(currentBuild);
  const currentDetail = currentProvenance ? ` · ${currentProvenance}` : "";
  const label = stale
    ? `UPDATE AVAILABLE · RUNNING BUILD ${runningBuild}${visibleDetail ? ` · ${visibleDetail}` : ""} · CURRENT BUILD ${expectedBuild}${currentDetail}`
    : candidate
      ? `PREVIEW CANDIDATE · BUILD ${runningBuild}${visibleDetail ? ` · ${visibleDetail}` : ""} · PRODUCTION BUILD ${expectedBuild}${currentDetail}`
    : `BUILD ${RELEASE_BUILD}${visibleDetail ? ` · ${visibleDetail}` : ""}${state === "checking" ? " · VERIFYING" : state === "unverified" ? " · UNVERIFIED" : ""}`;

  return Object.freeze({
    releaseBuild: RELEASE_BUILD,
    entrypointBuild: entrypoint,
    currentBuild: expectedBuild,
    revision,
    deployment,
    telemetryBuild,
    stale,
    candidate,
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
      candidate,
    }),
  });
}

export function buildInfoUrl(locationLike = globalThis.location) {
  const hostname = String(locationLike?.hostname || "").toLowerCase();
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]" || !hostname) {
    return null;
  }
  if (PRODUCTION_HOSTNAMES.has(hostname)) return BUILD_INFO_PATH;
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
  return PRODUCTION_HOSTNAMES.has(hostname) || hostname.endsWith(".vercel.app")
    ? BUILD_INFO_PATH
    : null;
}
