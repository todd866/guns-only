import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  EXECUTE_METHOD,
  buildUnityArguments,
  parseArgs,
  resolveUnityEditor,
} from "../capture-unity.mjs";

test("Unity capture invocation keeps the graphics device and exact editor entry point", () => {
  const args = buildUnityArguments("/tmp/weekend-project");
  assert.ok(args.includes("-batchmode"));
  assert.ok(args.includes("-quit"));
  assert.ok(args.includes(EXECUTE_METHOD));
  assert.ok(!args.includes("-nographics"));
});

test("Unity capture arguments resolve explicit editor/project/output paths", () => {
  const options = parseArgs([
    "--unity", "/tmp/Unity",
    "--project", "/tmp/project",
    "--out", "/tmp/shots",
    "--contract", "/tmp/acceptance.json",
  ]);
  assert.equal(options.unity, "/tmp/Unity");
  assert.equal(options.projectDir, "/tmp/project");
  assert.equal(options.outDir, "/tmp/shots");
  assert.equal(options.contractPath, "/tmp/acceptance.json");
  assert.deepEqual(parseArgs(["--help"]), { help: true });
  assert.throws(() => parseArgs(["--out"]), /requires a value/);
});

test("explicit Unity editor resolution fails closed on a missing executable", async (t) => {
  const directory = await mkdtemp(join(tmpdir(), "weekend-unity-path-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const editor = join(directory, "Unity");
  await writeFile(editor, "fixture");
  assert.equal(await resolveUnityEditor(directory, editor), editor);
  await assert.rejects(() => resolveUnityEditor(directory, join(directory, "missing")), /does not exist/);
});
