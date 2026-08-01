const assert = require("node:assert/strict");
const test = require("node:test");
const buildInfo = require("./build-info.js");

function responseRecorder() {
  const headers = new Map();
  return {
    headers,
    statusCode: null,
    body: "",
    setHeader(name, value) { headers.set(String(name).toLowerCase(), value); },
    end(value = "") { this.body = String(value); },
  };
}

function withEnvironment(values, operation) {
  const previous = Object.fromEntries(Object.keys(values)
    .map((key) => [key, process.env[key]]));
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try { operation(); }
  finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

test("build metadata publishes only complete immutable content digests", () => {
  const atlasSha256 = "a".repeat(64);
  const contentSha256 = "0123456789abcdef".repeat(4);
  withEnvironment({
    VERCEL_GIT_COMMIT_SHA: undefined,
    VERCEL_DEPLOYMENT_ID: undefined,
    VERCEL_URL: undefined,
    GUNS_ATLAS_SHA256: atlasSha256.toUpperCase(),
    GUNS_CONTENT_SHA256: contentSha256,
  }, () => {
    const response = responseRecorder();
    buildInfo({ method: "GET" }, response);
    assert.equal(response.statusCode, 200);
    assert.deepEqual(JSON.parse(response.body), {
      build: buildInfo.RELEASE_BUILD,
      revision: null,
      deployment: null,
      atlasSha256,
      contentSha256,
    });
  });

  withEnvironment({
    GUNS_ATLAS_SHA256: "not-a-digest",
    GUNS_CONTENT_SHA256: "f".repeat(63),
  }, () => {
    const response = responseRecorder();
    buildInfo({ method: "GET" }, response);
    const body = JSON.parse(response.body);
    assert.equal(Object.hasOwn(body, "atlasSha256"), false);
    assert.equal(Object.hasOwn(body, "contentSha256"), false);
  });
});
