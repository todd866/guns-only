import assert from "node:assert/strict";
import test from "node:test";
import http from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, normalize, extname } from "node:path";
import { chromium } from "playwright";

// Boots the PUBLISHED web app (its wwwroot passed via SMOKE_WWWROOT) in headless Chromium and
// requires it to reach a running flight kernel. Blazor loads the WASM sim, then app.js constructs
// the Three.js FlightView; boot() forwards any failure to showFatal(), which reveals the
// "#fatal" modal. The Node --test / dotnet suites never execute app.js's render path, so a missing
// symbol (e.g. the createOceanGeometry deletion in Build 56) passed every gate yet broke boot.
// This test closes that hole.

const WWWROOT = process.env.SMOKE_WWWROOT;

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
};

async function serveStatic(root) {
  const rootNormal = normalize(root);
  const server = http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, "http://127.0.0.1");
      let pathname = decodeURIComponent(url.pathname);
      if (pathname.endsWith("/")) pathname += "index.html";
      const filePath = normalize(join(rootNormal, pathname));
      if (filePath !== rootNormal && !filePath.startsWith(rootNormal)) {
        response.writeHead(403).end();
        return;
      }
      const info = await stat(filePath).catch(() => null);
      if (!info || !info.isFile()) {
        response.writeHead(404).end("not found");
        return;
      }
      response.writeHead(200, {
        "content-type": MIME[extname(filePath).toLowerCase()] ?? "application/octet-stream",
        "cache-control": "no-store",
      });
      response.end(await readFile(filePath));
    } catch (error) {
      response.writeHead(500).end(String(error));
    }
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}/`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

test("the published Indoor route boots its Three.js facility and transitions optical to radio", async () => {
  assert.ok(WWWROOT, "SMOKE_WWWROOT must point at the published wwwroot");

  const site = await serveStatic(WWWROOT);
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message ?? String(error)));
    await page.goto(`${site.url}indoor/`, { waitUntil: "load", timeout: 30000 });
    await page.waitForFunction(
      () => globalThis.__gunsIndoor?.ready === true,
      undefined,
      { timeout: 15000 },
    );

    const ready = await page.evaluate(() => ({
      phase: document.body.dataset.phase,
      link: globalThis.__gunsIndoor.state?.link?.mode,
      canvasWidth: document.querySelector("#viewport")?.width,
      canvasHeight: document.querySelector("#viewport")?.height,
      fatal: document.querySelector("#fatal")?.classList.contains("visible"),
      briefing: document.querySelector("#briefing")?.classList.contains("visible"),
      profiles: globalThis.__gunsIndoor.profiles,
      selectedMissionId: globalThis.__gunsIndoor.selectedMissionId,
      scans: globalThis.__gunsIndoor.state?.survey?.scanPoints?.length,
    }));
    assert.equal(ready.phase, "briefing");
    assert.equal(ready.link, "fiber");
    assert.deepEqual(ready.profiles, [
      "attack-site",
      "discretionary-site",
      "diversion-site",
    ]);
    assert.equal(ready.selectedMissionId, "attack-site");
    assert.equal(ready.scans, 2);
    assert.equal(ready.fatal, false);
    assert.equal(ready.briefing, true);
    assert.ok(ready.canvasWidth > 0 && ready.canvasHeight > 0,
      `Indoor WebGL canvas did not size: ${JSON.stringify(ready)}`);

    await page.locator('[data-mission-id="discretionary-site"]').click();
    await page.waitForFunction(
      () => globalThis.__gunsIndoor.selectedMissionId === "discretionary-site"
        && globalThis.__gunsIndoor.state?.survey?.profileId === "discretionary-site",
    );
    await page.locator("#begin-button").click();
    await page.waitForFunction(() => document.body.dataset.phase === "active");
    const controlsBefore = await page.evaluate(() => ({
      x: globalThis.__gunsIndoor.state.drone.position.x,
      z: globalThis.__gunsIndoor.state.drone.position.z,
      yaw: globalThis.__gunsIndoor.state.drone.yaw,
    }));
    await page.keyboard.down("w");
    await page.waitForFunction(
      (startZ) => globalThis.__gunsIndoor.state.drone.position.z < startZ - 0.1,
      controlsBefore.z,
      { timeout: 10000 },
    );
    await page.keyboard.up("w");
    await page.keyboard.down("d");
    await page.waitForFunction(
      (startX) => globalThis.__gunsIndoor.state.drone.position.x > startX + 0.1,
      controlsBefore.x,
      { timeout: 10000 },
    );
    await page.keyboard.up("d");
    await page.keyboard.down("ArrowRight");
    await page.waitForFunction(
      (startYaw) => globalThis.__gunsIndoor.state.drone.yaw > startYaw + 0.1,
      controlsBefore.yaw,
      { timeout: 10000 },
    );
    await page.keyboard.up("ArrowRight");
    const controlsAfter = await page.evaluate(() => ({
      x: globalThis.__gunsIndoor.state.drone.position.x,
      z: globalThis.__gunsIndoor.state.drone.position.z,
      yaw: globalThis.__gunsIndoor.state.drone.yaw,
    }));
    assert.ok(controlsAfter.z < controlsBefore.z - 0.1,
      `W did not move the drone forward: ${JSON.stringify({ controlsBefore, controlsAfter })}`);
    assert.ok(controlsAfter.x > controlsBefore.x + 0.1,
      `D did not strafe the drone right: ${JSON.stringify({ controlsBefore, controlsAfter })}`);
    assert.ok(controlsAfter.yaw > controlsBefore.yaw + 0.1,
      `ArrowRight did not rotate the view: ${JSON.stringify({ controlsBefore, controlsAfter })}`);

    const verticalBefore = await page.evaluate(
      () => globalThis.__gunsIndoor.state.drone.position.y,
    );
    await page.keyboard.down("Space");
    await page.waitForFunction(
      (startY) => globalThis.__gunsIndoor.state.drone.position.y > startY + 0.1,
      verticalBefore,
      { timeout: 10000 },
    );
    await page.keyboard.up("Space");
    const verticalHigh = await page.evaluate(
      () => globalThis.__gunsIndoor.state.drone.position.y,
    );
    await page.keyboard.down("Shift");
    await page.waitForFunction(
      (highY) => globalThis.__gunsIndoor.state.drone.position.y < highY - 0.1,
      verticalHigh,
      { timeout: 10000 },
    );
    await page.keyboard.up("Shift");

    await page.evaluate(() => globalThis.__gunsIndoor.detach());
    await page.waitForFunction(
      () => globalThis.__gunsIndoor.state?.link?.mode === "rf",
      undefined,
      { timeout: 3000 },
    );
    const handoff = await page.evaluate(() => ({
      phase: document.body.dataset.phase,
      link: globalThis.__gunsIndoor.state.link.mode,
      relay: globalThis.__gunsIndoor.state.link.rf.survivalTimer,
      bodyLink: document.body.dataset.link,
      video: document.body.dataset.video,
      control: globalThis.__gunsIndoor.controlState,
    }));
    assert.equal(handoff.phase, "active");
    assert.equal(handoff.link, "rf");
    assert.equal(handoff.bodyLink, "rf");
    assert.equal(handoff.video, "clear");
    assert.equal(handoff.control, "direct");
    assert.ok(handoff.relay > 43 && handoff.relay <= 45,
      `RF handoff did not start the 45-second relay window: ${JSON.stringify(handoff)}`);
    assert.deepEqual(pageErrors, [], `uncaught Indoor page errors:\n${pageErrors.join("\n")}`);
  } finally {
    await browser.close();
    await site.close();
  }
});

test("the published web app boots to a running flight kernel (no fatal render error)", async () => {
  assert.ok(WWWROOT, "SMOKE_WWWROOT must point at the published wwwroot");

  const site = await serveStatic(WWWROOT);
  // Software WebGL (SwiftShader) so the Three.js renderer initialises in headless CI.
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    const page = await browser.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message ?? String(error)));

    await page.goto(site.url, { waitUntil: "load", timeout: 60000 });

    // #boot gains the "ready" class when boot settles — on success (boot()) AND on a fatal error
    // (showFatal()). Waiting for it makes the assertion below deterministic instead of timing-based.
    await page.waitForFunction(
      () => document.querySelector("#boot")?.classList.contains("ready") === true,
      undefined,
      { timeout: 45000 },
    );

    const fatalVisible = await page.evaluate(
      () => document.querySelector("#fatal")?.classList.contains("visible") === true,
    );
    const fatalMessage = await page.evaluate(
      () => document.querySelector("#fatal-message")?.textContent ?? "",
    );

    assert.equal(
      fatalVisible,
      false,
      `the app booted into FLIGHT KERNEL OFFLINE:\n${fatalMessage.slice(0, 800)}`,
    );
    assert.deepEqual(
      pageErrors,
      [],
      `uncaught page errors during boot:\n${pageErrors.join("\n")}`,
    );

    // The per-frame path must ride the hot buffer: over a 5.5-second window the full JSON
    // snapshot should be fetched only on cold_version edges + the five-second fallback, never
    // per frame (~60+/s). This catches a silent regression to JSON-per-frame while still proving
    // the low-rate correctness fallback remains alive.
    const snapshotWindow = await page.evaluate(async () => {
      const diagnostics = () => globalThis.__gunsSnapshotBridge?.diagnostics() ?? null;
      const first = diagnostics();
      await new Promise((resolve) => setTimeout(resolve, 5500));
      return { first, second: diagnostics() };
    });
    assert.ok(snapshotWindow.first && snapshotWindow.second,
      "hot snapshot bridge diagnostics unavailable");
    const coldFetchesInWindow =
      snapshotWindow.second.coldFetches - snapshotWindow.first.coldFetches;
    assert.ok(coldFetchesInWindow >= 1 && coldFetchesInWindow <= 2,
      `cold JSON fetch cadence out of band: ${coldFetchesInWindow}/5.5s`);
  } finally {
    await browser.close();
    await site.close();
  }
});

test("phone combat HUD stays contextual, separated, and scroll-safe", async () => {
  assert.ok(WWWROOT, "SMOKE_WWWROOT must point at the published wwwroot");

  const site = await serveStatic(WWWROOT);
  try {
    for (const viewport of [{ width: 844, height: 390 }, { width: 667, height: 375 }]) {
      const browser = await chromium.launch({
        headless: true,
        args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
      });
      try {
        const context = await browser.newContext({
          viewport,
          screen: viewport,
          isMobile: true,
          hasTouch: true,
        });
        const page = await context.newPage();
        const pageErrors = [];
        page.on("pageerror", (error) => pageErrors.push(error.message ?? String(error)));
        await page.goto(site.url, { waitUntil: "load", timeout: 60000 });
        await page.waitForFunction(
          () => document.querySelector("#boot")?.classList.contains("ready") === true,
          undefined,
          { timeout: 45000 },
        );

        const buttonsOnly = page.locator('[data-mobile-action="buttons-only"]');
        await page.waitForFunction(
          () => globalThis.__gunsMobile?.active === true,
          undefined,
          { timeout: 10000 },
        );
        if (await page.evaluate(() => globalThis.__gunsMobile?.tiltState === "off")) {
          await buttonsOnly.waitFor({ state: "visible", timeout: 10000 });
          await buttonsOnly.click();
        }
        const readyStart = page.locator("#ready-start");
        try {
          await page.waitForFunction(() => {
            const active = globalThis.__gunsState?.session_phase === "ACTIVE"
              && !document.documentElement.classList.contains("run-paused");
            const start = document.querySelector("#ready-start");
            const resumable = document.querySelector("#ready-screen")?.classList.contains("visible")
              && start?.disabled === false;
            return active || resumable;
          }, undefined, { timeout: 45000 });
        } catch (error) {
          const snapshot = await page.evaluate(() => ({
            viewport: [innerWidth, innerHeight],
            visibility: document.visibilityState,
            htmlClass: document.documentElement.className,
            mobile: globalThis.__gunsMobile
              ? { active: globalThis.__gunsMobile.active,
                tiltState: globalThis.__gunsMobile.tiltState }
              : null,
            state: globalThis.__gunsState ? {
              sessionPhase: globalThis.__gunsState.session_phase,
              terminal: globalThis.__gunsState.player_terminal_state,
              ready: globalThis.__gunsState.ready,
              paused: globalThis.__gunsState.paused,
              finished: globalThis.__gunsState.finished,
            } : null,
            tiltPrompt: getComputedStyle(document.querySelector("#tilt-prompt")).display,
            readyVisible: document.querySelector("#ready-screen")?.classList.contains("visible"),
            readyMode: document.querySelector("#ready-screen")?.dataset.mode,
            startDisabled: document.querySelector("#ready-start")?.disabled,
            startText: document.querySelector("#ready-start")?.textContent,
            fatalVisible: document.querySelector("#fatal")?.classList.contains("visible"),
          }));
          throw new Error(`${error.message}\n${JSON.stringify(snapshot)}`);
        }
        const alreadyActive = await page.evaluate(() =>
          globalThis.__gunsState?.session_phase === "ACTIVE"
            && !document.documentElement.classList.contains("run-paused"));
        if (!alreadyActive) await readyStart.click();
        await page.waitForFunction(
          () => globalThis.__gunsMobile?.active === true
            && globalThis.__gunsState?.session_phase === "ACTIVE"
            && globalThis.__gunsState?.player_terminal_state === "FLYING"
            && document.querySelector("#touch-fire")?.hidden === false
            && document.querySelector("#touch-limit-override")?.hidden === false
            && document.querySelector('[data-pulse-key="KeyV"]')?.hidden === false
            && !document.documentElement.classList.contains("run-paused"),
          undefined,
          { timeout: 45000 },
        );

        const phoneState = await page.evaluate(() => {
          const visible = (element) => element && !element.hidden
            && getComputedStyle(element).display !== "none";
          const label = (element) => element.textContent.replace(/\s+/g, " ").trim();
          const direct = [
            ...document.querySelectorAll("#touch-throttle-controls button, .touch-actions button"),
          ].filter(visible).map((element) => element.id
            || `pulse:${element.dataset.pulseKey || element.dataset.holdKey}`);
          const rect = (selector) => {
            const box = document.querySelector(selector).getBoundingClientRect();
            return { left: box.left, top: box.top, right: box.right, bottom: box.bottom,
              width: box.width, height: box.height };
          };
          const overlaps = (a, b) => a.left < b.right && a.right > b.left
            && a.top < b.bottom && a.bottom > b.top;
          document.querySelector("#test-flight-console").hidden = false;
          document.querySelector("#test-flight-console").open = false;
          const stick = rect("#fallback-stick");
          const throttle = rect("#touch-throttle-controls");
          const throttleRocker = rect("#touch-throttle-rocker");
          const actions = rect(".touch-right");
          const waveOff = document.querySelector("#touch-wave-off");
          waveOff.hidden = false;
          const throttleWithWaveOff = rect("#touch-throttle-controls");
          waveOff.hidden = true;
          return {
            direct,
            controlState: {
              sessionPhase: globalThis.__gunsState?.session_phase,
              terminal: globalThis.__gunsState?.player_terminal_state,
              carrier: globalThis.__gunsState?.carrier,
              maintenance: globalThis.__gunsState?.maintenance_scenario,
              ammo: globalThis.__gunsState?.ammo,
              hasEngine: globalThis.__gunsState?.has_engine,
            },
            gearHidden: document.querySelector("#touch-gear").hidden,
            flapUpHidden: document.querySelector("#touch-flap-up").hidden,
            flapDownHidden: document.querySelector("#touch-flap-down").hidden,
            waveOffHidden: document.querySelector("#touch-wave-off").hidden,
            hasLiveRestart: document.querySelector('[data-mobile-action="restart"]') !== null,
            tiltText: label(document.querySelector("#tilt-status")),
            stick,
            stickVisible: visible(document.querySelector("#fallback-stick")),
            stickTouchAction: getComputedStyle(document.querySelector("#fallback-stick")).touchAction,
            stickKnob: rect("#fallback-stick-knob"),
            fallbackDirectionButtons: document.querySelectorAll(
              '#fallback-stick [data-hold-key^="Arrow"]',
            ).length,
            throttleRocker,
            throttleRockerTouchAction: getComputedStyle(
              document.querySelector("#touch-throttle-rocker"),
            ).touchAction,
            throttleRockerKnob: rect("#touch-throttle-rocker-knob"),
            ordinaryPowerButtons: document.querySelectorAll(
              '#touch-throttle-controls [data-hold-key="KeyS"], '
                + '#touch-throttle-controls [data-hold-key="KeyW"]:not(#touch-wave-off)',
            ).length,
            stickOverlapsThrottle: overlaps(stick, throttle),
            stickOverlapsThrottleWithWaveOff: overlaps(stick, throttleWithWaveOff),
            stickOverlapsActions: overlaps(stick, actions),
            pause: rect("#pause-button"),
            tilt: rect("#tilt-status"),
            console: rect("#test-flight-console"),
            pauseOverlapsTilt: overlaps(rect("#pause-button"), rect("#tilt-status")),
            pauseOverlapsConsole:
              overlaps(rect("#pause-button"), rect("#test-flight-console")),
            tiltOverlapsConsole:
              overlaps(rect("#tilt-status"), rect("#test-flight-console")),
            viewport: { width: innerWidth, height: innerHeight },
          };
        });

        assert.deepEqual(phoneState.direct,
          ["touch-throttle-rocker", "touch-limit-override", "pulse:KeyV", "touch-fire"],
          `${viewport.width}x${viewport.height}: ${JSON.stringify(phoneState.controlState)}`);
        assert.match(phoneState.tiltText, /TILT|STICK/);
        assert.equal(phoneState.gearHidden, true);
        assert.equal(phoneState.flapUpHidden, true);
        assert.equal(phoneState.flapDownHidden, true);
        assert.equal(phoneState.waveOffHidden, true);
        assert.equal(phoneState.hasLiveRestart, false);
        assert.equal(phoneState.stickVisible, true);
        assert.equal(phoneState.stickTouchAction, "none");
        assert.equal(phoneState.fallbackDirectionButtons, 0);
        assert.equal(phoneState.ordinaryPowerButtons, 0);
        assert.equal(phoneState.throttleRockerTouchAction, "none");
        assert.equal(phoneState.stickOverlapsThrottle, false);
        assert.equal(phoneState.stickOverlapsThrottleWithWaveOff, false);
        assert.equal(phoneState.stickOverlapsActions, false);
        assert.equal(Math.round(phoneState.stick.width), viewport.width <= 700 ? 104 : 112);
        assert.equal(Math.round(phoneState.stick.height), viewport.width <= 700 ? 104 : 112);
        assert.ok(phoneState.stickKnob.width >= 44 && phoneState.stickKnob.height >= 44);
        assert.equal(Math.round(phoneState.throttleRocker.width), viewport.width <= 700 ? 48 : 52);
        assert.equal(Math.round(phoneState.throttleRocker.height), viewport.width <= 700 ? 104 : 112);
        assert.ok(phoneState.throttleRocker.width >= 44);
        assert.ok(phoneState.throttleRocker.height / 2 >= 44);
        assert.ok(phoneState.throttleRocker.left >= 0
          && phoneState.throttleRocker.right <= phoneState.viewport.width);
        assert.ok(Math.abs(phoneState.throttleRocker.bottom - phoneState.stick.bottom) < 1);
        assert.ok(phoneState.throttleRockerKnob.height >= 44);
        assert.ok(Math.abs((phoneState.stick.left + phoneState.stick.width / 2)
          / phoneState.viewport.width - 0.43) < 0.015);
        for (const target of [phoneState.pause, phoneState.tilt]) {
          assert.ok(target.width >= 44 && target.height >= 44,
            `${viewport.width}x${viewport.height}: phone chrome target is below 44px`);
          assert.ok(target.left >= 0 && target.right <= phoneState.viewport.width);
          assert.ok(target.top >= 0 && target.bottom <= phoneState.viewport.height);
        }
        // Genuine rect overlap, not a single-column vertical ordering. The chrome no longer sits in
        // one stack: pause moved to the LEFT so the top-right column could stay clear for the HUD's
        // GUN TEMP instrument, which a right-anchored pause button had been covering. What matters
        // is that no two tap targets share pixels, whichever column they are in.
        assert.equal(phoneState.pauseOverlapsTilt, false,
          `${viewport.width}x${viewport.height}: pause overlaps tilt recenter`);
        assert.equal(phoneState.pauseOverlapsConsole, false,
          `${viewport.width}x${viewport.height}: pause overlaps the action console`);
        assert.equal(phoneState.tiltOverlapsConsole, false,
          `${viewport.width}x${viewport.height}: tilt recenter overlaps the action console`);

        const stick = page.locator("#fallback-stick");
        const stickBox = await stick.boundingBox();
        assert.ok(stickBox, `${viewport.width}x${viewport.height}: virtual stick has no box`);
        const centre = {
          x: stickBox.x + stickBox.width / 2,
          y: stickBox.y + stickBox.height / 2,
        };
        const baselineG = await page.evaluate(() => Number(
          globalThis.__gunsState?.requested_g_cmd,
        ));
        const pointerId = 47;
        await stick.dispatchEvent("pointerdown", {
          pointerId,
          pointerType: "touch",
          isPrimary: true,
          button: 0,
          buttons: 1,
          clientX: centre.x,
          clientY: centre.y,
        });
        await stick.dispatchEvent("pointermove", {
          pointerId,
          pointerType: "touch",
          isPrimary: true,
          button: -1,
          buttons: 1,
          clientX: centre.x + stickBox.width * 0.34,
          clientY: centre.y + stickBox.height * 0.34,
        });
        await page.waitForFunction((initialG) =>
          Number(globalThis.__gunsState?.requested_roll_control) > 0.2
            && Number(globalThis.__gunsState?.requested_g_cmd) > initialG + 0.2,
        baselineG, { timeout: 5000 });
        const engagedStick = await page.evaluate(() => {
          const element = document.querySelector("#fallback-stick");
          return {
            active: element.dataset.active,
            x: Number.parseFloat(element.style.getPropertyValue("--stick-x")),
            y: Number.parseFloat(element.style.getPropertyValue("--stick-y")),
            roll: Number(globalThis.__gunsState?.requested_roll_control),
            g: Number(globalThis.__gunsState?.requested_g_cmd),
          };
        });
        assert.equal(engagedStick.active, "true");
        assert.ok(engagedStick.x > 0 && engagedStick.y > 0);
        assert.ok(engagedStick.roll > 0.2);

        await stick.dispatchEvent(viewport.width <= 700 ? "pointercancel" : "pointerup", {
          pointerId,
          pointerType: "touch",
          isPrimary: true,
          button: 0,
          buttons: 0,
          clientX: centre.x + stickBox.width * 0.34,
          clientY: centre.y + stickBox.height * 0.34,
        });
        await page.waitForFunction((initialG) => {
          const element = document.querySelector("#fallback-stick");
          return element?.dataset.active === "false"
            && Math.abs(Number(globalThis.__gunsState?.requested_roll_control)) < 0.05
            && Number(globalThis.__gunsState?.requested_g_cmd) < initialG + 0.2;
        }, baselineG, { timeout: 5000 });
        const releasedStick = await page.evaluate(() => {
          const element = document.querySelector("#fallback-stick");
          return {
            x: Number.parseFloat(element.style.getPropertyValue("--stick-x")),
            y: Number.parseFloat(element.style.getPropertyValue("--stick-y")),
          };
        });
        assert.deepEqual(releasedStick, { x: 0, y: 0 });

        const throttleRocker = page.locator("#touch-throttle-rocker");
        const throttleBox = await throttleRocker.boundingBox();
        assert.ok(throttleBox, `${viewport.width}x${viewport.height}: throttle rocker has no box`);
        const throttleCentre = {
          x: throttleBox.x + throttleBox.width / 2,
          y: throttleBox.y + throttleBox.height / 2,
        };
        const baselineThrottle = await page.evaluate(() => Number(
          globalThis.__gunsState?.requested_throttle,
        ));
        const throttlePointerId = 61;
        await throttleRocker.dispatchEvent("pointerdown", {
          pointerId: throttlePointerId,
          pointerType: "touch",
          isPrimary: true,
          button: 0,
          buttons: 1,
          clientX: throttleCentre.x,
          clientY: throttleCentre.y,
        });
        await throttleRocker.dispatchEvent("pointerdown", {
          pointerId: throttlePointerId + 1,
          pointerType: "touch",
          isPrimary: false,
          button: 0,
          buttons: 1,
          clientX: throttleCentre.x,
          clientY: throttleCentre.y - throttleBox.height * 0.44,
        });
        const secondPointerRejected = await page.evaluate(() => {
          const element = document.querySelector("#touch-throttle-rocker");
          return {
            active: element.dataset.active,
            direction: element.dataset.direction,
            y: Number.parseFloat(element.style.getPropertyValue("--throttle-y")),
          };
        });
        assert.deepEqual(secondPointerRejected, { active: "true", direction: "neutral", y: 0 });
        await throttleRocker.dispatchEvent("pointerup", {
          pointerId: throttlePointerId + 1,
          pointerType: "touch",
          isPrimary: false,
          button: 0,
          buttons: 0,
          clientX: throttleCentre.x,
          clientY: throttleCentre.y - throttleBox.height * 0.44,
        });

        await throttleRocker.dispatchEvent("pointermove", {
          pointerId: throttlePointerId,
          pointerType: "touch",
          isPrimary: true,
          button: -1,
          buttons: 1,
          clientX: throttleCentre.x,
          clientY: throttleCentre.y + throttleBox.height * 0.44,
        });
        await page.waitForFunction((initialThrottle) =>
          Number(globalThis.__gunsState?.requested_throttle) < initialThrottle - 0.025,
        baselineThrottle, { timeout: 5000 });
        const decreasedThrottle = await page.evaluate(() => {
          const element = document.querySelector("#touch-throttle-rocker");
          return {
            value: Number(globalThis.__gunsState?.requested_throttle),
            active: element.dataset.active,
            direction: element.dataset.direction,
            y: Number.parseFloat(element.style.getPropertyValue("--throttle-y")),
          };
        });
        assert.equal(decreasedThrottle.active, "true");
        assert.equal(decreasedThrottle.direction, "down");
        assert.ok(decreasedThrottle.y > 0);

        await throttleRocker.dispatchEvent("pointermove", {
          pointerId: throttlePointerId,
          pointerType: "touch",
          isPrimary: true,
          button: -1,
          buttons: 1,
          clientX: throttleCentre.x,
          clientY: throttleCentre.y,
        });
        await page.waitForFunction(() =>
          document.querySelector("#touch-throttle-rocker")?.dataset.direction === "neutral");
        const neutralThrottle = await page.evaluate(() => Number(
          globalThis.__gunsState?.requested_throttle,
        ));
        await page.waitForTimeout(350);
        const steadyThrottle = await page.evaluate(() => Number(
          globalThis.__gunsState?.requested_throttle,
        ));
        assert.ok(Math.abs(steadyThrottle - neutralThrottle) <= 0.02,
          `${viewport.width}x${viewport.height}: centring the rocker did not stop throttle motion`);

        await throttleRocker.dispatchEvent("pointermove", {
          pointerId: throttlePointerId,
          pointerType: "touch",
          isPrimary: true,
          button: -1,
          buttons: 1,
          clientX: throttleCentre.x,
          clientY: throttleCentre.y - throttleBox.height * 0.44,
        });
        await page.waitForFunction((initialThrottle) =>
          Number(globalThis.__gunsState?.requested_throttle) > initialThrottle + 0.025,
        steadyThrottle, { timeout: 5000 });
        const increasedThrottle = await page.evaluate(() => {
          const element = document.querySelector("#touch-throttle-rocker");
          return {
            value: Number(globalThis.__gunsState?.requested_throttle),
            direction: element.dataset.direction,
            y: Number.parseFloat(element.style.getPropertyValue("--throttle-y")),
          };
        });
        assert.equal(increasedThrottle.direction, "up");
        assert.ok(increasedThrottle.y < 0);
        assert.ok(increasedThrottle.value > decreasedThrottle.value);

        await throttleRocker.dispatchEvent(viewport.width <= 700 ? "pointercancel" : "pointerup", {
          pointerId: throttlePointerId,
          pointerType: "touch",
          isPrimary: true,
          button: 0,
          buttons: 0,
          clientX: throttleCentre.x,
          clientY: throttleCentre.y - throttleBox.height * 0.44,
        });
        await page.waitForFunction(() => {
          const element = document.querySelector("#touch-throttle-rocker");
          return element?.dataset.active === "false"
            && element.dataset.direction === "neutral"
            && Number.parseFloat(element.style.getPropertyValue("--throttle-y")) === 0;
        });
        const releasedThrottle = await page.evaluate(() => ({
          value: Number(globalThis.__gunsState?.requested_throttle),
          phase: globalThis.__gunsState?.session_phase,
          terminal: globalThis.__gunsState?.player_terminal_state,
        }));
        await page.waitForTimeout(350);
        const settledThrottle = await page.evaluate(() => ({
          value: Number(globalThis.__gunsState?.requested_throttle),
          phase: globalThis.__gunsState?.session_phase,
          terminal: globalThis.__gunsState?.player_terminal_state,
        }));
        assert.ok(Math.abs(settledThrottle.value - releasedThrottle.value) <= 0.02,
          `${viewport.width}x${viewport.height}: release did not stop throttle motion: `
            + `${JSON.stringify({ releasedThrottle, settledThrottle })}`);
        assert.ok(settledThrottle.value > 0,
          `${viewport.width}x${viewport.height}: rocker release reset the selected throttle`);

        await page.locator("#pause-button").click();
        await page.locator("#ready-settings").click();
        const settingsState = await page.evaluate(() => {
          const card = document.querySelector(".settings-card");
          const scene = document.querySelector("#scene");
          const allowed = card.dispatchEvent(new Event("touchmove", {
            bubbles: true, cancelable: true,
          }));
          const blocked = scene.dispatchEvent(new Event("touchmove", {
            bubbles: true, cancelable: true,
          }));
          return {
            scrollable: card.scrollHeight > card.clientHeight,
            touchAction: getComputedStyle(card).touchAction,
            keyboardOpen: document.querySelector("#settings-keyboard-bindings").open,
            settingsTouchAllowed: allowed,
            sceneTouchBlocked: !blocked,
          };
        });
        assert.deepEqual(settingsState, {
          scrollable: true,
          touchAction: "pan-y",
          keyboardOpen: false,
          settingsTouchAllowed: true,
          sceneTouchBlocked: true,
        });
        assert.deepEqual(pageErrors, [],
          `${viewport.width}x${viewport.height}: uncaught page errors:\n${pageErrors.join("\n")}`);
        await context.close();
      } finally {
        await browser.close();
      }
    }
  } finally {
    await site.close();
  }
});
