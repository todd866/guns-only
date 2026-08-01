import assert from "node:assert/strict";
import { chromium } from "playwright";

const target = new URL(process.argv[2] || "");
assert.equal(target.protocol, "https:", "remote smoke target must use HTTPS");
target.pathname = "/";
target.search = "?audioQa=silent";
target.hash = "";

const browser = await chromium.launch({
  headless: true,
  args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
try {
  const page = await browser.newPage();
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message ?? String(error)));
  const response = await page.goto(target.href, { waitUntil: "load", timeout: 90_000 });
  assert.ok(response?.ok(), `remote shell returned HTTP ${response?.status() ?? "unknown"}`);
  await page.waitForFunction(
    () => document.querySelector("#boot")?.classList.contains("ready") === true,
    undefined,
    { polling: 100, timeout: 90_000 },
  );
  const boot = await page.evaluate(() => ({
    fatal: document.querySelector("#fatal")?.classList.contains("visible") === true,
    fatalMessage: document.querySelector("#fatal-message")?.textContent ?? "",
  }));
  assert.equal(boot.fatal, false, `remote flight kernel failed: ${boot.fatalMessage.slice(0, 800)}`);

  await page.waitForFunction(() => {
    const active = globalThis.__gunsState?.session_phase === "ACTIVE"
      && !document.documentElement.classList.contains("run-paused");
    const start = document.querySelector("#ready-start");
    const resumable = document.querySelector("#ready-screen")?.classList.contains("visible")
      && start?.disabled === false;
    return active || resumable;
  }, undefined, { polling: 100, timeout: 90_000 });
  const alreadyActive = await page.evaluate(() =>
    globalThis.__gunsState?.session_phase === "ACTIVE"
      && !document.documentElement.classList.contains("run-paused"));
  if (!alreadyActive) await page.locator("#ready-start").click();
  await page.waitForFunction(() =>
    globalThis.__gunsState?.session_phase === "ACTIVE"
      && globalThis.__gunsState?.player_terminal_state === "FLYING"
      && !document.documentElement.classList.contains("run-paused"),
  undefined, { polling: 100, timeout: 90_000 });
  // Current production may have auto-launched before any user gesture; touch the scene so the
  // browser is permitted to resume the real audio graph before its zero-gain contract is checked.
  const scene = await page.locator("#scene").boundingBox();
  assert.ok(scene, "remote scene has no clickable bounds");
  await page.mouse.click(scene.x + 8, scene.y + 8);

  let audio = null;
  for (let attempt = 0; attempt < 40; attempt += 1) {
    audio = await page.evaluate(() => {
      const root = document.documentElement;
      return {
        contextState: root.dataset.audioContextState,
        signalActive: root.dataset.audioSignalActive,
        audible: root.dataset.audioAudible,
        outputGain: root.dataset.audioOutputGain,
        outputMode: root.dataset.audioOutputMode,
        silentQa: root.dataset.audioQaSilent,
      };
    });
    if (audio.contextState === "running" && audio.signalActive === "true") break;
    await page.waitForTimeout(250);
  }
  assert.deepEqual(audio, {
    contextState: "running",
    signalActive: "true",
    audible: "false",
    outputGain: "0",
    outputMode: "silent-qa",
    silentQa: "true",
  }, `remote silent-audio contract failed: ${JSON.stringify(audio)}`);
  assert.deepEqual(pageErrors, [], `remote page errors:\n${pageErrors.join("\n")}`);
  console.log(`remote-smoke: verified ${target.origin} with destination gain clamped to zero`);
} finally {
  await browser.close();
}
