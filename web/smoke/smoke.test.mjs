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

// Shared-workstation CI: this suite runs beside other agents' builds and browsers, and under
// that contention SwiftShader waits stretch far past their quiet-machine budgets. The scale
// multiplies only wait budgets — condition checks return the moment they hold — so a loaded
// gate slows instead of failing falsely. Quiet machines are unaffected (scale 1).
const TIMEOUT_SCALE = Math.max(1, Number(process.env.SMOKE_TIMEOUT_SCALE) || 1);
const scaled = (ms) => ms * TIMEOUT_SCALE;

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
    await page.goto(`${site.url}indoor/`, { waitUntil: "load", timeout: scaled(30000) });
    await page.waitForFunction(
      () => globalThis.__gunsIndoor?.ready === true,
      undefined,
      { timeout: scaled(15000) },
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
      { timeout: scaled(10000) },
    );
    await page.keyboard.up("w");
    await page.keyboard.down("d");
    await page.waitForFunction(
      (startX) => globalThis.__gunsIndoor.state.drone.position.x > startX + 0.1,
      controlsBefore.x,
      { timeout: scaled(10000) },
    );
    await page.keyboard.up("d");
    await page.keyboard.down("ArrowRight");
    await page.waitForFunction(
      (startYaw) => globalThis.__gunsIndoor.state.drone.yaw > startYaw + 0.1,
      controlsBefore.yaw,
      { timeout: scaled(10000) },
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
      { timeout: scaled(10000) },
    );
    await page.keyboard.up("Space");
    const verticalHigh = await page.evaluate(
      () => globalThis.__gunsIndoor.state.drone.position.y,
    );
    await page.keyboard.down("Shift");
    await page.waitForFunction(
      (highY) => globalThis.__gunsIndoor.state.drone.position.y < highY - 0.1,
      verticalHigh,
      { timeout: scaled(10000) },
    );
    await page.keyboard.up("Shift");

    await page.evaluate(() => globalThis.__gunsIndoor.detach());
    await page.waitForFunction(
      () => globalThis.__gunsIndoor.state?.link?.mode === "rf",
      undefined,
      { timeout: scaled(3000) },
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

test("the published Medevac route resolves route hold, selective relay, and diversion branches", async () => {
  assert.ok(WWWROOT, "SMOKE_WWWROOT must point at the published wwwroot");

  const site = await serveStatic(WWWROOT);
  const browser = await chromium.launch({ headless: true });
  try {
    async function openMedevac(viewport = { width: 1280, height: 800 }) {
      const page = await browser.newPage({ viewport });
      const errors = [];
      page.on("pageerror", (error) => errors.push(error.message ?? String(error)));
      await page.goto(`${site.url}medevac/`, { waitUntil: "load", timeout: scaled(30000) });
      await page.waitForFunction(
        () => globalThis.__gunsMedevac?.ready === true,
        undefined,
        { timeout: scaled(20000) },
      );
      return { page, errors };
    }

    async function command(
      page,
      commandId,
      { requestId = null, receiverId = null, acknowledged = null } = {},
    ) {
      return page.evaluate(async ({ commandId, requestId, receiverId, acknowledged }) => {
        const option = globalThis.__gunsMedevac.state.decision.options.find(
          (candidate) => candidate.command_id === commandId
            && (requestId == null || candidate.request_ids?.includes(requestId))
            && (receiverId == null || candidate.receiver_id === receiverId),
        );
        if (!option) {
          throw new Error(
            `Command option not found: ${commandId} / ${requestId ?? "*"} / ${
              receiverId ?? "*"
            }`,
          );
        }
        globalThis.__gunsMedevac.select(option.id);
        return globalThis.__gunsMedevac.dispatch(
          option.id,
          acknowledged == null
            ? option.requires_acknowledgement === true
            : acknowledged === true,
        );
      }, { commandId, requestId, receiverId, acknowledged });
    }

    async function advanceUntil(page, stateName, maximumSeconds = 180) {
      return page.evaluate(async ({ stateName, maximumSeconds }) => {
        const reached = () => {
          const state = globalThis.__gunsMedevac.state;
          if (stateName === "rf-required")
            return state.extraction?.rf_command_required === true;
          if (stateName === "first-aboard")
            return state.aircraft?.onboard_pod_ids?.length === 1
              && state.decision?.options?.some((option) =>
                option.command_id === "decision.collect");
          if (stateName === "collection-review")
            return state.decision?.kind === "COLLECTION_REVIEW";
          if (stateName === "two-aboard")
            return state.aircraft?.onboard_pod_ids?.length === 2;
          if (stateName === "second-only")
            return state.aircraft?.onboard_pod_ids?.length === 1
              && state.aircraft.onboard_pod_ids[0] === "POD-02"
              && state.decision?.options?.some((option) =>
                option.command_id === "decision.deliver");
          if (stateName === "no-load-collect")
            return state.aircraft?.onboard_pod_ids?.length === 0
              && state.decision?.options?.some((option) =>
                option.command_id === "decision.collect"
                && option.request_ids?.includes("PICKUP-02"));
          if (stateName === "complete") return state.lifecycle === "COMPLETE";
          return false;
        };
        for (let elapsed = 0; elapsed <= maximumSeconds; elapsed++) {
          if (reached()) return globalThis.__gunsMedevac.state;
          await globalThis.__gunsMedevac.advanceForSmoke(1);
        }
        throw new Error(`MEDEVAC smoke state not reached: ${stateName}`);
      }, { stateName, maximumSeconds });
    }

    async function reachCollectionReview(page) {
      let result = await command(page, "mission.begin", {
        requestId: "PICKUP-01",
        acknowledged: false,
      });
      assert.equal(result.accepted, true);
      await advanceUntil(page, "rf-required");

      const blocked = await page.evaluate(() => ({
        type: globalThis.__gunsMedevac.state.mission_type,
        link: globalThis.__gunsMedevac.state.extraction.link.mode,
        exposure: globalThis.__gunsMedevac.state.rf_exposure_training_units,
      }));
      assert.deepEqual(blocked, {
        type: "DUSTOFF",
        link: "AUTONOMOUS",
        exposure: 0,
      });

      result = await command(page, "extraction.authorize-rf", {
        requestId: "PICKUP-01",
        acknowledged: true,
      });
      assert.equal(result.accepted, true);
      result = await command(page, "extraction.deploy-repeater", {
        requestId: "PICKUP-01",
        acknowledged: false,
      });
      assert.equal(result.accepted, true);
      await advanceUntil(page, "first-aboard");

      result = await command(page, "decision.collect", {
        requestId: "PICKUP-02",
        acknowledged: false,
      });
      assert.equal(result.accepted, true);
      await advanceUntil(page, "collection-review");
    }

    const { page, errors: pageErrors } = await openMedevac();
    const boot = await page.evaluate(() => ({
      schema: globalThis.__gunsMedevac.state?.snapshot_schema_version,
      lifecycle: globalThis.__gunsMedevac.state?.lifecycle,
      authority: globalThis.__gunsMedevac.state?.commander?.decision_authority,
      rearAuthority: globalThis.__gunsMedevac.state?.rear_crew?.authority,
      capacity: globalThis.__gunsMedevac.state?.aircraft?.patient_pod_capacity,
      patientId: globalThis.__gunsMedevac.state?.patients?.[0]?.id,
      podId: globalThis.__gunsMedevac.state?.patients?.[0]?.pod_id,
      primaryCount: document.querySelectorAll(".primary-action").length,
      fatal: document.querySelector("#fatal")?.classList.contains("visible"),
    }));
    assert.deepEqual(boot, {
      schema: "medevac.commander.v2",
      lifecycle: "READY",
      authority: "PLAYER",
      rearAuthority: "ADVISORY",
      capacity: 2,
      patientId: "PATIENT-01",
      podId: "POD-01",
      primaryCount: 1,
      fatal: false,
    });
    await page.locator("#begin-mission").click();

    const unexpectedAcknowledgement = await command(page, "mission.begin", {
      requestId: "PICKUP-01",
      acknowledged: true,
    });
    assert.equal(unexpectedAcknowledgement.accepted, false);
    assert.equal(unexpectedAcknowledgement.code, "UNEXPECTED_ACKNOWLEDGEMENT");

    await reachCollectionReview(page);
    const reviewBefore = await page.evaluate(() => ({
      route: globalThis.__gunsMedevac.state.aircraft.route_seconds_remaining,
      time: globalThis.__gunsMedevac.state.sim_time_s,
      status: globalThis.__gunsMedevac.state.aircraft.automation_status,
      challenge: globalThis.__gunsMedevac.view.crew.challenge,
      options: globalThis.__gunsMedevac.state.decision.options.map((option) => ({
        command: option.command_id,
        receiver: option.receiver_id,
        requiresAcknowledgement: option.requires_acknowledgement,
      })),
    }));
    assert.equal(reviewBefore.status, "ROUTE HOLD / MEDICAL RECONSIDERATION");
    assert.equal(reviewBefore.challenge, true);
    assert.equal(reviewBefore.options.filter((option) =>
      option.command === "decision.continue-collection").length, 1);
    assert.equal(reviewBefore.options.filter((option) =>
      option.command === "decision.deliver").length, 3);
    await page.evaluate(() => globalThis.__gunsMedevac.advanceForSmoke(5));
    const reviewAfter = await page.evaluate(() => ({
      route: globalThis.__gunsMedevac.state.aircraft.route_seconds_remaining,
      time: globalThis.__gunsMedevac.state.sim_time_s,
    }));
    assert.equal(reviewAfter.route, reviewBefore.route);
    assert.ok(reviewAfter.time >= reviewBefore.time + 5);

    const unacknowledgedContinue = await command(
      page,
      "decision.continue-collection",
      { requestId: "PICKUP-02", acknowledged: false },
    );
    assert.equal(unacknowledgedContinue.accepted, false);
    assert.equal(unacknowledgedContinue.code, "ACKNOWLEDGEMENT_REQUIRED");

    await page.evaluate(() => {
      const option = globalThis.__gunsMedevac.state.decision.options.find(
        (candidate) => candidate.command_id === "decision.continue-collection",
      );
      globalThis.__gunsMedevac.select(option.id);
    });
    await page.locator("#primary-action").click();
    const armed = await page.evaluate(() => ({
      label: document.querySelector("#primary-action span")?.textContent,
      kind: globalThis.__gunsMedevac.state.decision.kind,
      onboard: globalThis.__gunsMedevac.state.aircraft.onboard_pod_ids,
    }));
    assert.match(armed.label, /CONFIRM OVERRIDE/i);
    assert.equal(armed.kind, "COLLECTION_REVIEW");
    assert.deepEqual(armed.onboard, ["POD-01"]);
    await page.locator("#primary-action").click();
    await advanceUntil(page, "two-aboard");

    const deliveryPicture = await page.evaluate(() => {
      const options = globalThis.__gunsMedevac.state.decision.options.filter(
        (option) => option.command_id === "decision.deliver",
      );
      return {
        onboardPods: globalThis.__gunsMedevac.state.aircraft.onboard_pod_ids,
        onboardPatients: globalThis.__gunsMedevac.state.aircraft.onboard_patient_ids,
        receiverIds: options.map((option) => option.receiver_id),
        relay: options.find((option) => option.receiver_id === "RELAY-WEST"),
        deck: [...document.querySelectorAll(".pod-slot strong")]
          .map((node) => node.textContent),
        patientCards: [...document.querySelectorAll(".patient-card")]
          .map((node) => ({ patient: node.dataset.patientId, pod: node.dataset.podId })),
      };
    });
    assert.deepEqual(deliveryPicture.onboardPods, ["POD-01", "POD-02"]);
    assert.deepEqual(deliveryPicture.onboardPatients, ["PATIENT-01", "PATIENT-02"]);
    assert.equal(new Set(deliveryPicture.receiverIds).size, 3);
    assert.deepEqual(deliveryPicture.relay.pod_ids, ["POD-01"]);
    assert.deepEqual(deliveryPicture.relay.remaining_pod_ids, ["POD-02"]);
    assert.match(deliveryPicture.relay.detail, /POD-02 \/ PATIENT-02 remains aboard/);
    assert.deepEqual(deliveryPicture.deck, ["POD-01", "POD-02"]);
    assert.deepEqual(deliveryPicture.patientCards, [
      { patient: "PATIENT-01", pod: "POD-01" },
      { patient: "PATIENT-02", pod: "POD-02" },
    ]);

    let result = await command(page, "decision.deliver", {
      receiverId: "RELAY-WEST",
      acknowledged: false,
    });
    assert.equal(result.accepted, true);
    await advanceUntil(page, "second-only");
    const relayArrival = await page.evaluate(() => {
      const event = globalThis.__gunsMedevac.state.events.find(
        (candidate) => candidate.delivery_decision?.receiver_id === "RELAY-WEST",
      );
      return {
        onboard: globalThis.__gunsMedevac.state.aircraft.onboard_pod_ids,
        selected: event?.delivery_decision?.selected_pod_ids,
        message: event?.message,
      };
    });
    assert.deepEqual(relayArrival.onboard, ["POD-02"]);
    assert.deepEqual(relayArrival.selected, ["POD-01"]);
    assert.match(relayArrival.message, /POD-01 \/ PATIENT-01/);

    result = await command(page, "decision.deliver", {
      requestId: "PICKUP-02",
      receiverId: "SURGICAL-RECEIVER",
      acknowledged: false,
    });
    assert.equal(result.accepted, true);
    await advanceUntil(page, "complete");
    const finish = await page.evaluate(() => ({
      lifecycle: globalThis.__gunsMedevac.state.lifecycle,
      onboard: globalThis.__gunsMedevac.state.aircraft.onboard_pod_ids,
      audits: globalThis.__gunsMedevac.state.debrief.decisions.length,
      continueAudit: globalThis.__gunsMedevac.state.debrief.decisions.some(
        (event) => event.reconsideration_decision?.worsening_acknowledged === true,
      ),
      fatal: document.querySelector("#fatal")?.classList.contains("visible"),
    }));
    assert.equal(finish.lifecycle, "COMPLETE");
    assert.deepEqual(finish.onboard, []);
    assert.ok(finish.audits >= 3);
    assert.equal(finish.continueAudit, true);
    assert.equal(finish.fatal, false);
    assert.deepEqual(pageErrors, [],
      `uncaught Medevac page errors:\n${pageErrors.join("\n")}`);

    const { page: diversionPage, errors: diversionErrors } = await openMedevac();
    await diversionPage.locator("#begin-mission").click();
    await reachCollectionReview(diversionPage);
    result = await command(diversionPage, "decision.deliver", {
      requestId: "PICKUP-01",
      receiverId: "SURGICAL-RECEIVER",
      acknowledged: false,
    });
    assert.equal(result.accepted, true);
    const diversion = await diversionPage.evaluate(() => {
      const event = globalThis.__gunsMedevac.state.events.find(
        (candidate) => candidate.code === "commander.divert-delivery",
      );
      return event?.delivery_decision;
    });
    assert.equal(diversion.receiver_id, "SURGICAL-RECEIVER");
    assert.deepEqual(diversion.selected_request_ids, ["PICKUP-01"]);
    assert.deepEqual(diversion.selected_patient_ids, ["PATIENT-01"]);
    assert.deepEqual(diversion.selected_pod_ids, ["POD-01"]);
    assert.equal(diversion.abandoned_collection_request_id, "PICKUP-02");

    await advanceUntil(diversionPage, "no-load-collect");
    result = await command(diversionPage, "decision.collect", {
      requestId: "PICKUP-02",
      acknowledged: false,
    });
    assert.equal(result.accepted, true);
    await advanceUntil(diversionPage, "second-only");
    result = await command(diversionPage, "decision.deliver", {
      requestId: "PICKUP-02",
      receiverId: "SURGICAL-RECEIVER",
      acknowledged: false,
    });
    assert.equal(result.accepted, true);
    await advanceUntil(diversionPage, "complete");
    const divertedFinish = await diversionPage.evaluate(() => ({
      lifecycle: globalThis.__gunsMedevac.state.lifecycle,
      diversionInDebrief: globalThis.__gunsMedevac.state.debrief.decisions.some(
        (event) => event.delivery_decision?.abandoned_collection_request_id
          === "PICKUP-02",
      ),
      primaryCount: document.querySelectorAll(".primary-action").length,
      fatal: document.querySelector("#fatal")?.classList.contains("visible"),
    }));
    assert.deepEqual(divertedFinish, {
      lifecycle: "COMPLETE",
      diversionInDebrief: true,
      primaryCount: 1,
      fatal: false,
    });
    assert.deepEqual(diversionErrors, [],
      `uncaught diversion Medevac page errors:\n${diversionErrors.join("\n")}`);

    const { page: phone, errors: phoneErrors } = await openMedevac({
      width: 320,
      height: 700,
    });
    await phone.locator("#begin-mission").click();
    const narrow = await phone.evaluate(() => {
      const action = document.querySelector(".primary-action");
      const type = document.querySelector("#mission-type");
      const threat = document.querySelector("#threat-label");
      return {
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
        primaryCount: document.querySelectorAll(".primary-action").length,
        actionHeight: action?.getBoundingClientRect().height,
        actionVisible: action?.getBoundingClientRect().top < innerHeight,
        typeVisible: type && getComputedStyle(type).display !== "none",
        threatVisible: threat && getComputedStyle(threat).display !== "none",
      };
    });
    assert.ok(narrow.scrollWidth <= narrow.clientWidth + 1,
      `Medevac phone layout overflows: ${JSON.stringify(narrow)}`);
    assert.equal(narrow.primaryCount, 1);
    assert.ok(narrow.actionHeight >= 44, `Primary target is too small: ${narrow.actionHeight}`);
    assert.equal(narrow.actionVisible, true);
    assert.equal(narrow.typeVisible, true);
    assert.equal(narrow.threatVisible, true);
    assert.deepEqual(phoneErrors, [],
      `uncaught phone Medevac page errors:\n${phoneErrors.join("\n")}`);
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

    // The real graph must activate, update and expose diagnostics, but release validation must
    // never put aircraft audio onto a developer's speakers. `audioQa=silent` leaves Web Audio
    // running while clamping only the destination master.
    await page.goto(`${site.url}?audioQa=silent`, { waitUntil: "load", timeout: scaled(60000) });

    // #boot gains the "ready" class when boot settles — on success (boot()) AND on a fatal error
    // (showFatal()). Waiting for it makes the assertion below deterministic instead of timing-based.
    await page.waitForFunction(
      () => document.querySelector("#boot")?.classList.contains("ready") === true,
      undefined,
      { timeout: scaled(45000) },
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

    // A rendered ready card is not enough: Build 172 once reached that card, then the first live
    // frame hit a replay-state temporal-dead-zone error. The scene remained visible but every
    // fixed-tick control—including F—was frozen. Enter the actual default F-22 sortie and prove
    // the browser KeyF path reaches authoritative gun state.
    await page.waitForFunction(() => {
      const active = globalThis.__gunsState?.session_phase === "ACTIVE"
        && !document.documentElement.classList.contains("run-paused");
      const start = document.querySelector("#ready-start");
      const resumable = document.querySelector("#ready-screen")?.classList.contains("visible")
        && start?.disabled === false;
      return active || resumable;
    }, undefined, { timeout: scaled(45000) });
    const alreadyActive = await page.evaluate(() =>
      globalThis.__gunsState?.session_phase === "ACTIVE"
        && !document.documentElement.classList.contains("run-paused"));
    if (!alreadyActive) await page.locator("#ready-start").click();
    await page.waitForFunction(() =>
      globalThis.__gunsState?.session_phase === "ACTIVE"
        && globalThis.__gunsState?.player_terminal_state === "FLYING"
        && !document.documentElement.classList.contains("run-paused"),
    undefined, { timeout: scaled(45000) });
    await page.evaluate(() => globalThis.__gunsBridge.ReleaseWeaponsHold());
    await page.waitForFunction(() => globalThis.__gunsState?.weapons_inhibited === false);
    const roundsBeforeTrigger = await page.evaluate(
      () => Number(globalThis.__gunsState?.rounds_fired) || 0,
    );
    await page.keyboard.down("f");
    try {
      await page.waitForFunction((roundsBefore) =>
        globalThis.__gunsState?.gun_firing === true
          && Number(globalThis.__gunsState?.rounds_fired) > roundsBefore,
      roundsBeforeTrigger, { timeout: scaled(5000) });
    } finally {
      await page.keyboard.up("f");
    }

    await page.waitForFunction(() => {
      const root = document.documentElement;
      return root.dataset.audioContextState === "running"
        && root.dataset.audioSignalActive === "true";
    }, undefined, { timeout: scaled(5000) });
    const audioRuntime = await page.evaluate(() => {
      const root = document.documentElement;
      return {
        controller: root.dataset.audioController,
        contextState: root.dataset.audioContextState,
        signalActive: root.dataset.audioSignalActive,
        audible: root.dataset.audioAudible,
        outputGain: root.dataset.audioOutputGain,
        outputMode: root.dataset.audioOutputMode,
        silentQa: root.dataset.audioQaSilent,
        sessionId: root.dataset.audioSessionId,
      };
    });
    assert.deepEqual(
      {
        controller: audioRuntime.controller,
        contextState: audioRuntime.contextState,
        signalActive: audioRuntime.signalActive,
        audible: audioRuntime.audible,
        outputGain: audioRuntime.outputGain,
        outputMode: audioRuntime.outputMode,
        silentQa: audioRuntime.silentQa,
      },
      {
        controller: "shared",
        contextState: "running",
        signalActive: "true",
        audible: "false",
        outputGain: "0",
        outputMode: "silent-qa",
        silentQa: "true",
      },
      `silent flight-audio QA contract failed: ${JSON.stringify(audioRuntime)}`,
    );
    assert.ok(audioRuntime.sessionId, "audio QA session must be attributable to one page instance");

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

    await page.evaluate(async () => {
      const { suspendFlightAudio } = await import("/render/audio/flight_audio.js");
      suspendFlightAudio("smoke-complete");
    });
    await page.waitForFunction(
      () => document.documentElement.dataset.audioContextState === "suspended"
        && document.documentElement.dataset.audioStopReason === "smoke-complete",
      undefined,
      { timeout: scaled(5000) },
    );
  } finally {
    await browser.close();
    await site.close();
  }
});

test("the published Medevac mission briefs, launches, and accepts commander flight input", async () => {
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
    await page.addInitScript(() => {
      const browserFetch = globalThis.fetch.bind(globalThis);
      let terrainManifestRequests = 0;
      let releaseFirstTerrainManifest;
      const firstTerrainManifestGate = new Promise((resolve) => {
        releaseFirstTerrainManifest = resolve;
      });
      globalThis.fetch = (input, init) => {
        const url = typeof input === "string" ? input : input?.url ?? String(input);
        if (!url.includes("rapier-range.atlas.manifest.json"))
          return browserFetch(input, init);
        terrainManifestRequests += 1;
        if (terrainManifestRequests !== 1) return browserFetch(input, init);
        return firstTerrainManifestGate.then(() => browserFetch(input, init));
      };
      Object.defineProperty(globalThis, "__gunsTerrainWarmupGate", {
        configurable: true,
        value: Object.freeze({
          get requestCount() { return terrainManifestRequests; },
          release() { releaseFirstTerrainManifest(); },
        }),
      });
    });

    await page.goto(`${site.url}?program=low-level-drone&server=off`, {
      waitUntil: "load",
      timeout: scaled(60000),
    });
    try {
      await page.waitForFunction(
        () => document.querySelector("#boot")?.classList.contains("ready") === true,
        undefined,
        { timeout: scaled(45000) },
      );
    } catch (error) {
      const boot = await page.evaluate(() => ({
        status: document.querySelector("#boot-status")?.textContent,
        fatal: document.querySelector("#fatal")?.classList.contains("visible"),
        fatalMessage: document.querySelector("#fatal-message")?.textContent,
        state: globalThis.__gunsState ? {
          sessionPhase: globalThis.__gunsState.session_phase,
          casevac: globalThis.__gunsState.casevac_mission,
          casevacPhase: globalThis.__gunsState.casevac_phase,
          tick: globalThis.__gunsState.tick,
        } : null,
        lifecycle: globalThis.__gunsLifecycle
          ? {
            reasons: globalThis.__gunsLifecycle.reasons,
            selectedBeat: globalThis.__gunsLifecycle.selectedBeat,
            stagedBeat: globalThis.__gunsLifecycle.stagedBeat,
          }
          : null,
      }));
      throw new Error(`${error.message}\n${JSON.stringify({
        boot,
        pageErrors,
      })}`);
    }
    await page.waitForFunction(
      () => globalThis.__gunsLifecycle?.selectedBeat === 8
        && globalThis.__gunsLifecycle?.stagedBeat === 8
        && globalThis.__gunsLifecycle?.reasons?.includes("ready")
        && globalThis.__gunsState?.casevac_mission !== true
        && globalThis.__gunsState?.session_phase === "READY",
      undefined,
      { timeout: scaled(15000) },
    );
    await page.waitForFunction(
      () => globalThis.__gunsLifecycle?.reasons?.includes("terrain"),
      undefined,
      { timeout: scaled(15000) },
    );
    await page.waitForFunction(
      () => globalThis.__gunsTerrainWarmupGate?.requestCount === 1,
      undefined,
      { timeout: scaled(15000) },
    );

    // Exercise the normal mission catalogue, not a Medevac deep link. Selection must stage
    // authority while Ready remains held and expose the newly projected cold route data in the
    // same click turn, without departing.
    const catalogueSelection = await page.evaluate(() => {
      const coldFetchesBefore =
        globalThis.__gunsSnapshotBridge?.diagnostics()?.coldFetches;
      document.querySelector('[data-program-node="medevac"]').click();
      const routeCard = document.querySelector(
        '[aria-label="Medevac reference route sketch"]',
      );
      return {
        selectedBeat: globalThis.__gunsLifecycle.selectedBeat,
        stagedBeat: globalThis.__gunsLifecycle.stagedBeat,
        reasons: globalThis.__gunsLifecycle.reasons,
        startText: document.querySelector("#ready-start")?.textContent?.trim(),
        routeCardHidden: routeCard.hidden,
        routeOptions: routeCard.querySelectorAll(".cvr-option").length,
        coldFetchesBefore,
        coldFetchesAfter:
          globalThis.__gunsSnapshotBridge?.diagnostics()?.coldFetches,
      };
    });
    assert.equal(catalogueSelection.selectedBeat, 13);
    assert.equal(catalogueSelection.stagedBeat, 13);
    assert.ok(catalogueSelection.reasons.includes("ready"));
    assert.equal(catalogueSelection.startText, "Fly Medevac");
    assert.equal(catalogueSelection.routeCardHidden, false);
    assert.equal(catalogueSelection.routeOptions, 4);
    assert.equal(
      catalogueSelection.coldFetchesAfter,
      catalogueSelection.coldFetchesBefore + 1,
      `catalogue stage did not consume the new cold version: ${
        JSON.stringify(catalogueSelection)
      }`,
    );
    await page.waitForFunction(() => {
      const routeCard = document.querySelector(
        '[aria-label="Medevac reference route sketch"]',
      );
      return globalThis.__gunsState?.casevac_mission === true
        && globalThis.__gunsState?.session_phase === "READY"
        && routeCard?.hidden === false
        && routeCard.querySelectorAll(".cvr-option").length === 4;
    }, undefined, { timeout: scaled(15000) });
    await page.waitForTimeout(300);
    assert.equal(
      await page.evaluate(() => globalThis.__gunsState?.session_phase),
      "READY",
      "catalogue selection departed without the commander pressing Fly",
    );

    const ready = await page.evaluate(() => {
      const routeCard = document.querySelector(
        '[aria-label="Medevac reference route sketch"]',
      );
      const options = [...routeCard.querySelectorAll(".cvr-option")]
        .map((element) => element.textContent.replace(/\s+/g, " ").trim());
      return {
        startText: document.querySelector("#ready-start")?.textContent?.trim(),
        routeText: routeCard.textContent.replace(/\s+/g, " ").trim(),
        options,
        routes: globalThis.__gunsState.casevac_routes?.length,
        obstacles: globalThis.__gunsState.casevac_collision_obstacles?.length,
        opponentPresent: globalThis.__gunsState.opponent_present,
        fatal: document.querySelector("#fatal")?.classList.contains("visible"),
      };
    });
    assert.equal(ready.startText, "Fly Medevac");
    assert.equal(ready.routes, 4);
    assert.equal(ready.obstacles, 5);
    assert.equal(ready.opponentPresent, false);
    assert.equal(ready.fatal, false);
    assert.match(ready.routeText, /REFERENCE ONLY · NO ROUTE HOLD/);
    assert.equal(ready.options.filter((option) => option.startsWith("DIRECT")).length, 2);
    assert.equal(ready.options.filter((option) => option.startsWith("MASKED")).length, 2);

    const captureDir = process.env.MEDEVAC_QA_CAPTURE_DIR;
    if (captureDir) {
      await page.screenshot({
        path: join(captureDir, "medevac-ready.png"),
        fullPage: true,
      });
    }

    await page.locator("#ready-start").click();
    await page.evaluate(() => globalThis.__gunsTerrainWarmupGate.release());
    try {
      await page.waitForFunction(
        () => globalThis.__gunsState?.casevac_mission === true
          && globalThis.__gunsState?.session_phase === "ACTIVE"
          && globalThis.__gunsState?.casevac_phase === "INGRESS"
          && !document.documentElement.classList.contains("run-paused")
          && document.querySelector("[data-casevac-flight-facts]")?.hidden === false,
        undefined,
        // 2026-07-29: the Ships A-D Ukraine content (Soniachne village edge, scenery density,
        // exclusion pack) grew low-level-drone ingress warmup past the old 15s SwiftShader
        // budget (measured 50-75s on a loaded machine; real GPUs are unaffected).
        { timeout: scaled(90000) },
      );
    } catch (error) {
      const diag = await page.evaluate(() => {
        const g = globalThis.__gunsState || {};
        const out = {};
        for (const k of ["casevac_mission", "casevac_phase", "session_phase", "paused", "frozen",
          "terrain_present", "player_terminal_state", "mission_feature_pack_required",
          "mission_feature_pack_id", "lz_assessment_status"]) out[k] = g[k];
        out.runPaused = document.documentElement.className.includes("run-paused");
        out.factsHidden = document.querySelector("[data-casevac-flight-facts]")?.hidden;
        out.fatal = document.querySelector("#fatal")?.classList.contains("visible");
        out.fatalMsg = (document.querySelector("#fatal-message")?.textContent || "").slice(0, 300);
        return out;
      });
      console.error("CASEVAC_DIAG " + JSON.stringify(diag));
      throw error;
    }

    const before = await page.evaluate(() => ({
      px: Number(globalThis.__gunsState.px),
      py: Number(globalThis.__gunsState.py),
      pz: Number(globalThis.__gunsState.pz),
      tick: Number(globalThis.__gunsState.tick),
      energyKwh: Number(globalThis.__gunsState.casevac_energy_remaining_kwh),
      pickupX: Number(globalThis.__gunsState.casevac_pickup_x),
      pickupZ: Number(globalThis.__gunsState.casevac_pickup_z),
      diagnostics: globalThis.__gunsSnapshotBridge?.diagnostics() ?? null,
    }));
    // SwiftShader can render the full terrain at only a few frames per second on a loaded CI
    // worker. Hold each physical control until the authoritative fixed-tick state proves the
    // response instead of assuming a wall-clock hold spans enough simulation ticks.
    await page.keyboard.down("w");
    try {
      await page.waitForFunction(
        ({ startY, startTick }) =>
          Number(globalThis.__gunsState?.py) > startY + 0.2
            && Number(globalThis.__gunsState?.tick) > startTick,
        { startY: before.py, startTick: before.tick },
        { timeout: scaled(30000) },
      );
    } finally {
      await page.keyboard.up("w");
    }
    const pickupRangeBefore = Math.hypot(
      before.pickupX - before.px,
      before.pickupZ - before.pz,
    );
    await page.keyboard.down("ArrowUp");
    try {
      await page.waitForFunction(
        ({ pickupX, pickupZ, startRange }) => {
          const x = Number(globalThis.__gunsState?.px);
          const z = Number(globalThis.__gunsState?.pz);
          return Math.hypot(pickupX - x, pickupZ - z) < startRange - 0.5;
        },
        {
          pickupX: before.pickupX,
          pickupZ: before.pickupZ,
          startRange: pickupRangeBefore,
        },
        { timeout: scaled(30000) },
      );
    } finally {
      await page.keyboard.up("ArrowUp");
    }

    const after = await page.evaluate(() => {
      const flightFacts = document.querySelector("[data-casevac-flight-facts]");
      const routeCard = document.querySelector(
        '[aria-label="Medevac reference route sketch"]',
      );
      return {
        px: Number(globalThis.__gunsState.px),
        py: Number(globalThis.__gunsState.py),
        pz: Number(globalThis.__gunsState.pz),
        tick: Number(globalThis.__gunsState.tick),
        energyKwh: Number(globalThis.__gunsState.casevac_energy_remaining_kwh),
        flightFacts: flightFacts.textContent.replace(/\s+/g, " ").trim(),
        routeCardHidden: routeCard.hidden,
        hudVisibility: getComputedStyle(document.querySelector("#hud")).visibility,
        fireHidden: document.querySelector("#touch-fire")?.hidden,
        limitOverrideHidden:
          document.querySelector("#touch-limit-override")?.hidden,
      };
    });
    assert.ok(after.py > before.py + 0.2,
      `vertical command did not climb: ${JSON.stringify({ before, after })}`);
    const pickupRangeAfter = Math.hypot(
      before.pickupX - after.px,
      before.pickupZ - after.pz,
    );
    assert.ok(pickupRangeAfter < pickupRangeBefore - 0.5,
      `forward command did not move toward pickup: ${JSON.stringify({
        before,
        after,
        pickupRangeBefore,
        pickupRangeAfter,
      })}`);
    assert.ok(after.tick > before.tick);
    assert.ok(after.energyKwh < before.energyKwh,
      `applied power did not reduce energy: ${JSON.stringify({ before, after })}`);
    assert.match(after.flightFacts, /ROUTE/);
    assert.match(after.flightFacts, /ENERGY/);
    assert.match(after.flightFacts, /CONTACT LIMITS/);
    assert.equal(after.routeCardHidden, true);
    assert.equal(after.hudVisibility, "hidden");
    assert.equal(after.fireHidden, true);
    assert.equal(after.limitOverrideHidden, true);

    const hotWindow = await page.evaluate(async () => {
      const diagnostics = () => globalThis.__gunsSnapshotBridge?.diagnostics() ?? null;
      const first = diagnostics();
      const firstTick = Number(globalThis.__gunsState?.tick);
      await new Promise((resolve) => setTimeout(resolve, 2200));
      return {
        first,
        second: diagnostics(),
        firstTick,
        secondTick: Number(globalThis.__gunsState?.tick),
      };
    });
    assert.ok(hotWindow.first && hotWindow.second,
      "CASEVAC hot snapshot diagnostics unavailable");
    assert.ok(hotWindow.secondTick > hotWindow.firstTick,
      `CASEVAC authority stopped advancing: ${JSON.stringify(hotWindow)}`);
    assert.ok(hotWindow.second.coldFetches - hotWindow.first.coldFetches <= 1,
      `CASEVAC fell back to repeated cold JSON: ${JSON.stringify(hotWindow)}`);

    if (captureDir) {
      await page.screenshot({
        path: join(captureDir, "medevac-flight.png"),
      });
    }
    await page.setViewportSize({ width: 390, height: 844 });
    const narrow = await page.evaluate(() => {
      const facts = document.querySelector("[data-casevac-flight-facts]")
        .getBoundingClientRect();
      const pause = document.querySelector("#pause-button").getBoundingClientRect();
      const visibleMissionPanels = [
        ...document.querySelectorAll("[data-casevac-part]:not([hidden])"),
        document.querySelector("[data-casevac-flight-facts]"),
      ].filter(Boolean).map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          part: element.getAttribute("data-casevac-part") ?? "flight-facts",
          left: rect.left,
          right: rect.right,
          top: rect.top,
          bottom: rect.bottom,
        };
      });
      return {
        viewportWidth: innerWidth,
        scrollWidth: document.documentElement.scrollWidth,
        facts: {
          left: facts.left,
          right: facts.right,
          top: facts.top,
          bottom: facts.bottom,
        },
        pause: {
          left: pause.left,
          right: pause.right,
          top: pause.top,
          bottom: pause.bottom,
        },
        visibleMissionPanels,
      };
    });
    assert.ok(narrow.scrollWidth <= narrow.viewportWidth + 1,
      `Medevac flight UI overflows narrow viewport: ${JSON.stringify(narrow)}`);
    assert.ok(narrow.facts.left >= 0 && narrow.facts.right <= narrow.viewportWidth);
    assert.ok(narrow.facts.top >= 0 && narrow.facts.bottom <= 844);
    for (const panel of narrow.visibleMissionPanels) {
      const overlaps = narrow.pause.left < panel.right
        && narrow.pause.right > panel.left
        && narrow.pause.top < panel.bottom
        && narrow.pause.bottom > panel.top;
      assert.equal(overlaps, false,
        `Medevac pause control overlaps ${panel.part}: ${JSON.stringify(narrow)}`);
    }
    if (captureDir) {
      await page.screenshot({
        path: join(captureDir, "medevac-flight-narrow.png"),
      });
    }

    await page.keyboard.press("n");
    await page.waitForFunction(
      () => globalThis.__gunsState?.casevac_phase === "ABORT_RETURN"
        && globalThis.__gunsAssets?.diagnostics()?.casevac
          ?.pickupEscapeCueVisible === true
        && globalThis.__gunsAssets?.diagnostics()?.casevac
          ?.visibleEscapeCueCount === 1,
      undefined,
      { timeout: scaled(15000) },
    );
    const abortPresentation = await page.evaluate(() => ({
      targetSiteId: globalThis.__gunsState?.casevac_target_site_id,
      escapeCue: globalThis.__gunsAssets?.diagnostics()?.casevac,
    }));
    assert.match(abortPresentation.targetSiteId, /safe-exit/);
    assert.equal(abortPresentation.escapeCue.pickupEscapeCueVisible, true);
    assert.equal(abortPresentation.escapeCue.visibleEscapeCueCount, 1);

    // The desktop flight is finished (pageErrors is already collected); release its live render
    // loop before booting the touch context, or the two pages fight for the single SwiftShader
    // process and the mobile boot can blow its 45 s window on a loaded gate machine.
    await page.close();

    const touchViewport = { width: 390, height: 844 };
    const touchContext = await browser.newContext({
      viewport: touchViewport,
      screen: touchViewport,
      isMobile: true,
      hasTouch: true,
    });
    try {
      const touchPage = await touchContext.newPage();
      const touchPageErrors = [];
      touchPage.on("pageerror",
        (error) => touchPageErrors.push(error.message ?? String(error)));
      await touchPage.goto(`${site.url}?program=medevac&server=off`, {
        waitUntil: "load",
        timeout: scaled(60000),
      });
      await touchPage.waitForFunction(
        () => document.querySelector("#boot")?.classList.contains("ready") === true
          && globalThis.__gunsMobile?.active === true,
        undefined,
        { timeout: scaled(45000) },
      );

      if (await touchPage.evaluate(() => globalThis.__gunsMobile?.tiltState === "off")) {
        const buttonsOnly = touchPage.locator('[data-mobile-action="buttons-only"]');
        await buttonsOnly.waitFor({ state: "visible", timeout: scaled(10000) });
        await buttonsOnly.click();
      }
      await touchPage.waitForFunction(() => {
        const active = globalThis.__gunsState?.casevac_mission === true
          && globalThis.__gunsState?.session_phase === "ACTIVE"
          && !document.documentElement.classList.contains("run-paused");
        const start = document.querySelector("#ready-start");
        const resumable = globalThis.__gunsState?.casevac_mission === true
          && document.querySelector("#ready-screen")?.classList.contains("visible")
          && start?.disabled === false;
        return active || resumable;
      }, undefined, { timeout: scaled(45000) });
      const touchAlreadyActive = await touchPage.evaluate(() =>
        globalThis.__gunsState?.session_phase === "ACTIVE"
          && !document.documentElement.classList.contains("run-paused"));
      if (!touchAlreadyActive) await touchPage.locator("#ready-start").click();
      await touchPage.waitForFunction(
        () => globalThis.__gunsState?.casevac_mission === true
          && globalThis.__gunsState?.session_phase === "ACTIVE"
          && globalThis.__gunsMobile?.tiltState === "fallback"
          && document.querySelector("[data-casevac-flight-facts]")?.hidden === false
          && getComputedStyle(document.querySelector("#fallback-stick")).display !== "none"
          && !document.documentElement.classList.contains("run-paused"),
        undefined,
        { timeout: scaled(45000) },
      );

      const portraitTouch = await touchPage.evaluate(() => {
        const rect = (element) => {
          const box = element.getBoundingClientRect();
          return {
            left: box.left,
            right: box.right,
            top: box.top,
            bottom: box.bottom,
            width: box.width,
            height: box.height,
          };
        };
        const overlaps = (a, b) => a.left < b.right && a.right > b.left
          && a.top < b.bottom && a.bottom > b.top;
        const visible = (element) => element && !element.hidden
          && getComputedStyle(element).display !== "none"
          && getComputedStyle(element).visibility !== "hidden";
        const chips = document.querySelector("#portrait-chips");
        const stickElement = document.querySelector("#fallback-stick");
        const factsElement = document.querySelector("[data-casevac-flight-facts]");
        const stick = rect(stickElement);
        const facts = rect(factsElement);
        const motionControls = [
          stickElement,
          ...document.querySelectorAll("#touch-throttle-controls button"),
        ].filter(visible).map((element) => ({
          id: element.id,
          rect: rect(element),
        }));
        return {
          htmlClass: document.documentElement.className,
          viewport: { width: innerWidth, height: innerHeight },
          chips: {
            hidden: chips.hidden,
            display: getComputedStyle(chips).display,
            rect: rect(chips),
          },
          facts,
          stick,
          factsStickGap: stick.top - facts.bottom,
          factsOverlapsStick: overlaps(facts, stick),
          overlappingMotionControls: motionControls
            .filter((control) => overlaps(facts, control.rect)),
          motionControls,
        };
      });
      assert.match(portraitTouch.htmlClass, /\btouch-mode\b/);
      assert.match(portraitTouch.htmlClass, /\btilt-fallback\b/);
      assert.equal(portraitTouch.chips.hidden, true);
      assert.equal(portraitTouch.chips.display, "none");
      assert.equal(portraitTouch.chips.rect.width, 0);
      assert.equal(portraitTouch.chips.rect.height, 0);
      assert.ok(portraitTouch.stick.width >= 44 && portraitTouch.stick.height >= 44);
      assert.ok(portraitTouch.facts.left >= 0
        && portraitTouch.facts.right <= portraitTouch.viewport.width);
      assert.ok(portraitTouch.facts.top >= 0
        && portraitTouch.facts.bottom <= portraitTouch.viewport.height);
      assert.equal(portraitTouch.factsOverlapsStick, false,
        `portrait Medevac movement stick obscures flight facts: ${
          JSON.stringify(portraitTouch)
        }`);
      assert.ok(portraitTouch.factsStickGap >= 8,
        `portrait Medevac movement stick needs a visible facts gap: ${
          JSON.stringify(portraitTouch)
        }`);
      assert.deepEqual(portraitTouch.overlappingMotionControls, [],
        `portrait Medevac controls obscure flight facts: ${JSON.stringify(portraitTouch)}`);
      assert.deepEqual(
        touchPageErrors,
        [],
        `uncaught page errors during portrait touch Medevac flight:\n${
          touchPageErrors.join("\n")
        }`,
      );
      if (captureDir) {
        await touchPage.screenshot({
          path: join(captureDir, "medevac-flight-touch-portrait.png"),
        });
      }
    } finally {
      await touchContext.close();
    }

    assert.deepEqual(
      pageErrors,
      [],
      `uncaught page errors during Medevac flight:\n${pageErrors.join("\n")}`,
    );
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
        await page.goto(site.url, { waitUntil: "load", timeout: scaled(60000) });
        await page.waitForFunction(
          () => document.querySelector("#boot")?.classList.contains("ready") === true,
          undefined,
          { timeout: scaled(45000) },
        );

        const buttonsOnly = page.locator('[data-mobile-action="buttons-only"]');
        await page.waitForFunction(
          () => globalThis.__gunsMobile?.active === true,
          undefined,
          { timeout: scaled(10000) },
        );
        if (await page.evaluate(() => globalThis.__gunsMobile?.tiltState === "off")) {
          await buttonsOnly.waitFor({ state: "visible", timeout: scaled(10000) });
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
          }, undefined, { timeout: scaled(45000) });
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
            && getComputedStyle(document.querySelector("#target-stick")).display !== "none"
            && document.querySelector("#touch-limit-override")?.hidden === false
            && document.querySelector('[data-pulse-key="KeyV"]')?.hidden === false
            && !document.documentElement.classList.contains("run-paused"),
          undefined,
          { timeout: scaled(45000) },
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
          const targetStick = rect("#target-stick");
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
            targetStick,
            targetStickVisible: visible(document.querySelector("#target-stick")),
            targetStickTouchAction: getComputedStyle(
              document.querySelector("#target-stick"),
            ).touchAction,
            targetStickLabel: document.querySelector("#target-stick").getAttribute("aria-label"),
            targetStickKnob: rect("#target-stick-knob"),
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
            targetStickOverlapsActions: overlaps(targetStick, actions),
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
          ["touch-throttle-rocker", "touch-limit-override", "pulse:KeyV"],
          `${viewport.width}x${viewport.height}: ${JSON.stringify(phoneState.controlState)}`);
        assert.match(phoneState.tiltText, /TILT|STICK/);
        assert.equal(phoneState.gearHidden, true);
        assert.equal(phoneState.flapUpHidden, true);
        assert.equal(phoneState.flapDownHidden, true);
        assert.equal(phoneState.waveOffHidden, true);
        assert.equal(phoneState.hasLiveRestart, false);
        assert.equal(phoneState.stickVisible, true);
        assert.equal(phoneState.stickTouchAction, "none");
        assert.equal(phoneState.targetStickVisible, true);
        assert.equal(phoneState.targetStickTouchAction, "none");
        assert.equal(phoneState.targetStickLabel, "Right look and fire stick");
        assert.equal(phoneState.fallbackDirectionButtons, 0);
        assert.equal(phoneState.ordinaryPowerButtons, 0);
        assert.equal(phoneState.throttleRockerTouchAction, "none");
        assert.equal(phoneState.stickOverlapsThrottle, false);
        assert.equal(phoneState.stickOverlapsThrottleWithWaveOff, false);
        assert.equal(phoneState.stickOverlapsActions, false);
        assert.equal(phoneState.targetStickOverlapsActions, false);
        assert.equal(Math.round(phoneState.stick.width), viewport.width <= 700 ? 104 : 112);
        assert.equal(Math.round(phoneState.stick.height), viewport.width <= 700 ? 104 : 112);
        assert.ok(phoneState.stickKnob.width >= 44 && phoneState.stickKnob.height >= 44);
        assert.equal(Math.round(phoneState.targetStick.width),
          viewport.width <= 700 ? 104 : 112);
        assert.equal(Math.round(phoneState.targetStick.height),
          viewport.width <= 700 ? 104 : 112);
        assert.ok(phoneState.targetStickKnob.width >= 44
          && phoneState.targetStickKnob.height >= 44);
        assert.equal(Math.round(phoneState.throttleRocker.width), viewport.width <= 700 ? 48 : 52);
        assert.equal(Math.round(phoneState.throttleRocker.height), viewport.width <= 700 ? 104 : 112);
        assert.ok(phoneState.throttleRocker.width >= 44);
        assert.ok(phoneState.throttleRocker.height / 2 >= 44);
        assert.ok(phoneState.throttleRocker.left >= 0
          && phoneState.throttleRocker.right <= phoneState.viewport.width);
        assert.ok(Math.abs(phoneState.throttleRocker.bottom - phoneState.stick.bottom) < 1);
        assert.ok(phoneState.throttleRockerKnob.height >= 44);
        assert.ok(phoneState.stick.left >= 0
          && phoneState.stick.right < phoneState.viewport.width * 0.25);
        assert.ok(phoneState.targetStick.right <= phoneState.viewport.width
          && phoneState.targetStick.left > phoneState.viewport.width * 0.75);
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
        baselineG, { timeout: scaled(5000) });
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
        }, baselineG, { timeout: scaled(5000) });
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
        baselineThrottle, { timeout: scaled(5000) });
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
        const increasedThrottleHandle = await page.waitForFunction((initialThrottle) => {
          const value = Number(globalThis.__gunsState?.requested_throttle);
          if (!(value > initialThrottle + 0.025)) return false;
          const element = document.querySelector("#touch-throttle-rocker");
          return {
            value,
            direction: element.dataset.direction,
            y: Number.parseFloat(element.style.getPropertyValue("--throttle-y")),
          };
        }, steadyThrottle, { timeout: scaled(5000) });
        // Capture the exact animation frame which satisfied the motion predicate. A separate
        // evaluate() can race the flight automation on slower CI runners and observe a later
        // throttle value even though the rocker already proved it moved upward.
        const increasedThrottle = await increasedThrottleHandle.jsonValue();
        await increasedThrottleHandle.dispose();
        assert.equal(increasedThrottle.direction, "up");
        assert.ok(increasedThrottle.y < 0);
        assert.ok(increasedThrottle.value > steadyThrottle + 0.025,
          `${viewport.width}x${viewport.height}: upward rocker motion did not increase throttle`);

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

test("portrait touch: both virtual sticks reach the flight kernel through real touch events", async () => {
  assert.ok(WWWROOT, "SMOKE_WWWROOT must point at the published wwwroot");

  const site = await serveStatic(WWWROOT);
  const browser = await chromium.launch({
    headless: true,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  try {
    // A real phone: portrait, touch-capable. 127.0.0.1 + input=touch engages the production touch
    // layout through the localTouchPreview QA seam without weakening the coarse-pointer contract.
    const context = await browser.newContext({
      viewport: { width: 390, height: 844 },
      hasTouch: true,
      isMobile: true,
    });
    const page = await context.newPage();
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message ?? String(error)));
    await page.goto(`${site.url}?input=touch&audioQa=silent`, {
      waitUntil: "load",
      timeout: scaled(60000),
    });
    await page.waitForFunction(
      () => document.querySelector("#boot")?.classList.contains("ready") === true,
      undefined,
      { timeout: scaled(45000) },
    );
    await page.waitForFunction(() => {
      const active = globalThis.__gunsState?.session_phase === "ACTIVE"
        && !document.documentElement.classList.contains("run-paused");
      const start = document.querySelector("#ready-start");
      const resumable = document.querySelector("#ready-screen")?.classList.contains("visible")
        && start?.disabled === false;
      return active || resumable;
    }, undefined, { timeout: scaled(45000) });
    const alreadyActive = await page.evaluate(() =>
      globalThis.__gunsState?.session_phase === "ACTIVE"
        && !document.documentElement.classList.contains("run-paused"));
    if (!alreadyActive) await page.locator("#ready-start").tap();
    await page.waitForFunction(() =>
      globalThis.__gunsState?.session_phase === "ACTIVE"
      && globalThis.__gunsState?.player_terminal_state === "FLYING"
      && !document.documentElement.classList.contains("run-paused"),
    undefined, { timeout: scaled(45000) });
    // Once flying, the full portrait touch contract must hold (assist engages at sortie start,
    // not at boot, so these are asserted here).
    const modeClasses = await page.evaluate(() => [...document.documentElement.classList]);
    for (const required of ["touch-mode", "touch-primary", "portrait-assist"]) {
      assert.ok(
        modeClasses.includes(required),
        `expected ${required} on <html>, got: ${modeClasses.join(" ")}`,
      );
    }

    // The regression this guards: the sticks sat inside the pointer-events:none touch overlay
    // without their own pointer-events, so every drag fell through to the scene canvas and the
    // fallback-to-primary promotion shipped dead controls. Assert reachability explicitly so the
    // failure names the element that swallowed the touch.
    const reach = await page.evaluate(() => {
      const reachOf = (selector) => {
        const el = document.querySelector(selector);
        const r = el.getBoundingClientRect();
        const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2);
        return { hit: el === top || el.contains(top), top: top?.id || top?.tagName || null };
      };
      return { left: reachOf("#fallback-stick"), right: reachOf("#target-stick") };
    });
    assert.ok(reach.left.hit, `left stick unreachable — touches land on "${reach.left.top}"`);
    assert.ok(reach.right.hit, `right stick unreachable — touches land on "${reach.right.top}"`);

    // Full-left roll through the platform touch pipeline (CDP synthesises real touch events).
    const [sx, sy] = await page.evaluate(() => {
      const r = document.querySelector("#fallback-stick").getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    });
    const cdp = await context.newCDPSession(page);
    const touchPoint = (x, y, id = 1) => ({ x, y, radiusX: 8, radiusY: 8, force: 1, id });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [touchPoint(sx, sy)],
    });
    try {
      for (let step = 1; step <= 5; step += 1) {
        await cdp.send("Input.dispatchTouchEvent", {
          type: "touchMove",
          touchPoints: [touchPoint(sx - step * 11, sy)],
        });
      }
      await page.waitForFunction(
        () => Number(globalThis.__gunsState?.requested_roll_control) <= -0.5,
        undefined,
        { timeout: scaled(5000) },
      );
      await page.waitForFunction(
        () => Math.abs(Number(globalThis.__gunsState?.bank_deg)) >= 8,
        undefined,
        { timeout: scaled(6000) },
      );
    } finally {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }
    await page.waitForFunction(
      () => Number(globalThis.__gunsState?.requested_roll_control) === 0,
      undefined,
      { timeout: scaled(5000) },
    );

    // The right stick must arm the look gesture rather than falling through to the scene.
    const [tx, ty] = await page.evaluate(() => {
      const r = document.querySelector("#target-stick").getBoundingClientRect();
      return [Math.round(r.x + r.width / 2), Math.round(r.y + r.height / 2)];
    });
    await cdp.send("Input.dispatchTouchEvent", {
      type: "touchStart",
      touchPoints: [touchPoint(tx, ty, 2)],
    });
    try {
      await cdp.send("Input.dispatchTouchEvent", {
        type: "touchMove",
        touchPoints: [touchPoint(tx + 30, ty - 20, 2)],
      });
      await page.waitForFunction(
        () => document.querySelector("#target-stick")?.dataset.active === "true",
        undefined,
        { timeout: scaled(5000) },
      );
    } finally {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    }

    assert.deepEqual(pageErrors, [], `uncaught page errors:\n${pageErrors.join("\n")}`);
  } finally {
    await browser.close();
    await site.close();
  }
});
