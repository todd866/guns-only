// Public, read-only release provenance. The browser uses this to detect a stale static shell and
// telemetry uses it to distinguish deployments which share the same human-facing release number.

const RELEASE_BUILD = "268";

function safeToken(value, maximumLength) {
  const token = String(value || "").trim();
  if (!token || !/^[A-Za-z0-9._-]+$/.test(token)) return null;
  return token.slice(0, maximumLength);
}

function deploymentIdentity(environment = process.env) {
  const directId = safeToken(environment.VERCEL_DEPLOYMENT_ID, 96);
  if (directId) return directId;
  const deploymentHost = String(environment.VERCEL_URL || "")
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/\.vercel\.app$/i, "");
  return safeToken(deploymentHost, 96);
}

function safeSha256(value) {
  const digest = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{64}$/.test(digest) ? digest : null;
}

function finish(response, status, body = undefined) {
  response.statusCode = status;
  if (body === undefined) response.end();
  else response.end(body);
}

function buildInfo(request, response) {
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Access-Control-Allow-Origin", "*");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  if (request.method !== "GET") {
    response.setHeader("Allow", "GET");
    finish(response, 405, JSON.stringify({ error: "method_not_allowed" }));
    return;
  }

  const body = {
    build: RELEASE_BUILD,
    revision: safeToken(process.env.VERCEL_GIT_COMMIT_SHA, 40),
    deployment: deploymentIdentity(),
  };
  const atlasSha256 = safeSha256(process.env.GUNS_ATLAS_SHA256);
  const contentSha256 = safeSha256(process.env.GUNS_CONTENT_SHA256);
  // Older deployments omitted these fields. Keep that response shape valid while every newly
  // gated deployment publishes both immutable artifact identities.
  if (atlasSha256) body.atlasSha256 = atlasSha256;
  if (contentSha256) body.contentSha256 = contentSha256;
  finish(response, 200, JSON.stringify(body));
}

module.exports = buildInfo;
module.exports.RELEASE_BUILD = RELEASE_BUILD;
module.exports.deploymentIdentity = deploymentIdentity;
module.exports.safeSha256 = safeSha256;
