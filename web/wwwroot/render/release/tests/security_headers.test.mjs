import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const WWWROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../..",
);

test("the production shell denies browser capabilities it never uses", async () => {
  const config = JSON.parse(await readFile(path.join(WWWROOT, "vercel.json"), "utf8"));
  const shellRule = config.headers.find(({ source }) => source === "/(.*)");
  assert.ok(shellRule, "the deployment needs a catch-all shell header rule");

  const headers = new Map(shellRule.headers.map(({ key, value }) => [key.toLowerCase(), value]));
  assert.equal(headers.get("x-content-type-options"), "nosniff");
  assert.equal(headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(headers.get("x-frame-options"), "SAMEORIGIN");
  assert.match(headers.get("content-security-policy") ?? "", /frame-ancestors 'self'/);
  assert.equal(
    headers.get("permissions-policy"),
    "camera=(), geolocation=(), microphone=(), payment=(), usb=()",
  );

  // Optional device-orientation trim uses motion sensors. Keep those available while denying
  // capabilities with no product purpose.
  assert.doesNotMatch(headers.get("permissions-policy") ?? "", /accelerometer|gyroscope/);
});
