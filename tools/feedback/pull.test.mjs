import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { main, parseArguments } from "./pull.mjs";

test("parses latest with optional bounded count", () => {
  assert.deepEqual(parseArguments(["--latest"]), { mode: "latest", count: 10, id: null, endpoint: "https://guns-only.com/telemetry-admin" });
  assert.equal(parseArguments(["--latest", "3"]).count, 3);
});

test("parses a report id", () => {
  assert.equal(parseArguments(["--id", "abc_123"]).id, "abc_123");
});

test("rejects ambiguous, unsafe, and oversized arguments", () => {
  assert.throws(() => parseArguments(["--latest", "--id", "abc"]), /choose either/);
  assert.throws(() => parseArguments(["--id", "../secret"]), /id is invalid/);
  assert.throws(() => parseArguments(["--latest", "101"]), /must be 1-100/);
  assert.throws(() => parseArguments(["--wat"]), /unknown option/);
});

test("latest paginates, ignores incomplete pairs, and retrieves the newest complete report", async () => {
  const root = await mkdtemp(join(tmpdir(), "guns-feedback-test-"));
  const previousFetch = global.fetch;
  const oldId = "old-report";
  const newId = "new-report";
  const blobs = (id, date, uploadedAt, includeJpg = true, jsonSize = 1, jpgSize = 2) => {
    const result = [{ pathname: `reports/${date}/${id}.json.gz`, url: `https://blob.test/reports/${date}/${id}.json.gz`, size: jsonSize, etag: `${id}-json`, uploadedAt }];
    if (includeJpg) result.push({ pathname: `reports/${date}/${id}.jpg`, url: `https://blob.test/reports/${date}/${id}.jpg`, size: jpgSize, etag: `${id}-jpg`, uploadedAt });
    return result;
  };
  const reportJson = gzipSync(JSON.stringify({ id: newId, created: "2026-10-15T00:00:00Z", build: "1", program: "test", note: "broken", state: { s: { alt_ft: 1200, speed_kts: 240, pitch_deg: 2, bank_deg: -3, heading_deg: 180 } } }));
  global.fetch = async (url) => {
    const parsed = new URL(url);
    if (parsed.searchParams.get("action") === "list") {
      if (!parsed.searchParams.get("cursor")) return new Response(JSON.stringify({ blobs: blobs(oldId, "2026-10-14", "2026-10-14T00:00:00Z", false), hasMore: true, cursor: "page-2" }), { status: 200 });
      return new Response(JSON.stringify({ blobs: blobs(newId, "2026-10-15", "2026-10-15T00:00:00Z", true, reportJson.length, 3), hasMore: false }), { status: 200 });
    }
    const objectUrl = parsed.searchParams.get("url");
    const body = objectUrl.endsWith(".jpg") ? Buffer.from("jpg") : reportJson;
    return new Response(body, { status: 200, headers: { "content-length": String(body.length), etag: objectUrl.endsWith(".jpg") ? '"new-report-jpg"' : '"new-report-json"' } });
  };
  const lines = [];
  try {
    await main(["--latest", "1"], { GUNS_TELEMETRY_ADMIN_TOKEN: "x".repeat(32) }, { log: (value) => lines.push(value) }, { root });
    assert.equal(lines.length, 1);
    assert.match(lines[0], /Report ID: new-report/);
    assert.equal(lines[0].split("\n").length, 10);
    assert.match(lines[0], /Altitude: 1200 ft · Speed: 240 kt · Attitude: 2\/-3\/180°/);
    assert.equal((await readFile(join(root, newId, "report.json"))).toString().includes('"id": "new-report"'), true);
    assert.equal((await readFile(join(root, newId, "report.json.gz"))).length, reportJson.length);
    const idLines = [];
    await main(["--id", newId], { GUNS_TELEMETRY_ADMIN_TOKEN: "x".repeat(32) }, { log: (value) => idLines.push(value) }, { root });
    assert.equal(idLines.length, 1);
    assert.match(idLines[0], /Report ID: new-report/);
  } finally {
    global.fetch = previousFetch;
    await rm(root, { recursive: true, force: true });
  }
});
