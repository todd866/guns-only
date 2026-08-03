import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { experienceById } from "../../progression/campaign_progression.js";
import { experienceAccess } from "../quarantine_gate.js";
import { RELEASE_BUILD } from "../release_identity.js";

const ROOT = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../../../",
);

const [entrypoint, runtime, presentation, status] = await Promise.all([
  readFile(path.join(ROOT, "web/wwwroot/cobra-lab/index.html"), "utf8"),
  readFile(path.join(ROOT, "web/wwwroot/cobra-lab/main.js"), "utf8"),
  readFile(path.join(
    ROOT,
    "web/wwwroot/render/cobra/cobra_canyon_presentation.js",
  ), "utf8"),
  readFile(path.join(ROOT, "docs/STATUS.md"), "utf8"),
]);

test("Cobra Canyon is a public standalone production experience", () => {
  const experience = experienceById("cobra-lab");
  assert.equal(experience?.route, "/cobra-lab/");
  assert.equal(experience?.releaseState, "production");
  assert.equal(experience?.blocker, "");
  assert.match(status,
    /Cobra Canyon \(`cobra-lab`, `\/cobra-lab\/`\)[^\n]*\*\*production\*\*/);

  const publicAccess = experienceAccess("cobra-lab", {
    href: "https://guns-only.com/cobra-lab/",
  });
  assert.equal(publicAccess.allowed, true);
  assert.equal(publicAccess.preview, false);

  const previewAccess = experienceAccess("cobra-lab", {
    href: "https://guns-only.com/cobra-lab/?preview=1",
  });
  assert.equal(previewAccess.allowed, true);
  assert.equal(previewAccess.preview, false);
  assert.equal(previewAccess.experience.releaseState, "production");
});

test("Cobra Lab gates before loading its Build-versioned runtime", () => {
  assert.doesNotMatch(entrypoint,
    /<script\b[^>]*\bsrc=["']\.\/main\.js(?:\?[^"']*)?["']/i,
    "the browser parser must not start the lab before quarantine is assessed");
  assert.match(entrypoint,
    new RegExp(`quarantine_gate\\.js\\?v=${RELEASE_BUILD}`));
  assert.match(entrypoint,
    new RegExp(
      `await globalThis\\.__gunsPrebootReady;[\\s\\S]*?`
      + `renderExperienceGate\\(\\{ experienceId: "cobra-lab" \\}\\)[\\s\\S]*?`
      + `if \\(access\\.allowed\\) await import\\("\\.\\/main\\.js\\?v=${RELEASE_BUILD}"\\)`,
    ),
    "only an acknowledged preview may request the world runtime");
  assert.match(entrypoint,
    new RegExp(`styles\\.css\\?v=${RELEASE_BUILD}`));
});

test("Cobra Lab direct runtime imports share the Build stamp", () => {
  for (const modulePath of [
    "../vendor/three.module.js",
    "../render/cobra/cobra_canyon_plan.js",
    "../render/cobra/cobra_canyon_presentation.js",
  ]) {
    assert.equal(runtime.includes(`${modulePath}?v=${RELEASE_BUILD}`), true,
      `${modulePath} must carry the candidate Build stamp`);
    assert.equal(runtime.includes(`from "${modulePath}"`), false,
      `${modulePath} must not remain as an unversioned direct import`);
  }
  assert.equal(
    presentation.includes(`from "./cobra_canyon_plan.js?v=${RELEASE_BUILD}"`),
    true,
    "the presentation module must not fetch a second unversioned planner instance",
  );
  assert.equal(presentation.includes('from "./cobra_canyon_plan.js"'), false);
});
