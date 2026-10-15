import assert from "node:assert/strict";
import test from "node:test";
import { parseArguments } from "./pull.mjs";

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
