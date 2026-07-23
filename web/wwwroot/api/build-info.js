// Public, read-only release provenance. The browser uses this to detect a stale static shell and
// telemetry uses it to distinguish deployments which share the same human-facing release number.

const RELEASE_BUILD = "78";

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

  finish(response, 200, JSON.stringify({
    build: RELEASE_BUILD,
    revision: safeToken(process.env.VERCEL_GIT_COMMIT_SHA, 40),
    deployment: deploymentIdentity(),
  }));
}

module.exports = buildInfo;
module.exports.RELEASE_BUILD = RELEASE_BUILD;
module.exports.deploymentIdentity = deploymentIdentity;
