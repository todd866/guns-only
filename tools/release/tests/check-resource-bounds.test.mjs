import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const checkSource = readFileSync(new URL("../../../bin/check", import.meta.url), "utf8");

test("the whole-repository gate keeps Node memory and test fan-out bounded", () => {
  assert.match(
    checkSource,
    /node_heap_mb=\$\{GUNS_NODE_MAX_OLD_SPACE_MB:-1536\}/,
    "the gate must carry a conservative default old-space ceiling",
  );
  assert.match(
    checkSource,
    /\[ "\$node_heap_mb" -lt 256 \] \|\| \[ "\$node_heap_mb" -gt 2048 \]/,
    "the configurable old-space ceiling must remain bounded",
  );
  assert.match(
    checkSource,
    /NODE_OPTIONS="\$\{NODE_OPTIONS:\+\$NODE_OPTIONS \}--max-old-space-size=\$node_heap_mb"\nexport NODE_OPTIONS/,
    "the ceiling must reach Node children as well as the test runner",
  );
  assert.match(
    checkSource,
    /node_test_concurrency=\$\{GUNS_NODE_TEST_CONCURRENCY:-1\}/,
    "test files must run serially unless a bounded override is explicit",
  );
  assert.match(
    checkSource,
    /1\|2\|3\|4\) ;;\n    \*\)/,
    "the concurrency override must not become unbounded",
  );

  const directNodeTestCalls = checkSource
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("node --test"));
  assert.ok(directNodeTestCalls.length >= 2, "the shared helper and browser gate must remain present");
  for (const call of directNodeTestCalls) {
    assert.match(call, /^node --test --test-concurrency="\$node_test_concurrency"\s/,
      "every direct Node test-runner call must carry the bounded concurrency flag");
  }
});
