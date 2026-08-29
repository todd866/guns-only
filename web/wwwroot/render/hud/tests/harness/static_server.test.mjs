import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { serveStatic } from "./static_server.mjs";

test("local flight harness accepts and inventories telemetry POSTs", async () => {
  const root = await mkdtemp(join(tmpdir(), "guns-static-server-"));
  await writeFile(join(root, "index.html"), "<!doctype html><title>QA</title>");
  const site = await serveStatic(root);
  try {
    const response = await fetch(`${site.url}api/telemetry`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        session: "web-cobra-1234567890123-test",
        batchId: "batch-1",
        rows: [
          { k: "hdr", session: "web-cobra-1234567890123-test" },
          { k: "st", s: { cobra_authority_tick: 120, cobra_frame_ms: 16.7 } },
          { k: "st", s: { cobra_authority_tick: 240, cobra_frame_ms: 16.6 } },
        ],
      }),
    });
    assert.equal(response.status, 202);
    const diagnostics = site.diagnostics();
    assert.equal(diagnostics.telemetryRequests, 1);
    assert.ok(diagnostics.telemetryBytes > 0);
    assert.equal(diagnostics.telemetryRows, 3);
    assert.equal(diagnostics.telemetryHeaderRows, 1);
    assert.equal(diagnostics.telemetryStateRows, 2);
    assert.equal(diagnostics.telemetryCobraStateRows, 2);
    assert.equal(diagnostics.telemetryMinimumCobraAuthorityTick, 120);
    assert.equal(diagnostics.telemetryMaximumCobraAuthorityTick, 240);
    assert.equal(diagnostics.telemetrySessions, 1);
    assert.equal(diagnostics.telemetryCobraSessions, 1);
  } finally {
    await site.close();
  }
});
