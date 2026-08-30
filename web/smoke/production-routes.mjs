import assert from "node:assert/strict";

/**
 * The production player-entry surfaces, in one place.
 *
 * Two consumers share this table and must not drift apart: `remote-route-smoke.mjs` asserts each
 * route is healthy, and `prewarm-origin.mjs` pulls each route's asset graph so the edge is warm
 * before anyone -- a smoke run or a real visitor -- pays for a cold deployment.
 *
 * `isReady` is evaluated inside the page, so it must be self-contained and serialisable.
 */
export const PRODUCTION_ROUTES = Object.freeze([
  Object.freeze({
    id: "f22",
    path: "/",
    search: "?menu=1&server=off&audioQa=silent",
    isReady: () => document.querySelector("#boot")?.classList.contains("ready") === true
      && document.querySelector("#ready-screen")?.dataset.mode === "program",
    verify: async (page) => {
      const route = await page.evaluate(() => {
        const choice = document.querySelector('[data-program-node="first-merge"]');
        return {
          fatal: document.querySelector("#fatal")?.classList.contains("visible") === true,
          mode: document.querySelector("#ready-screen")?.dataset.mode ?? "",
          selected: choice?.getAttribute("aria-pressed") === "true"
            && choice?.closest(".sortie-option")?.dataset.selected === "true",
          title: document.querySelector("#ready-title")?.textContent?.trim() ?? "",
          missionId: globalThis.__gunsState?.mission_definition_id ?? "",
        };
      });
      assert.equal(route.fatal, false, "F-22 remote route showed #fatal");
      assert.equal(route.mode, "program", "F-22 route did not open the programme brief");
      assert.equal(route.selected, true, "F-22 route selected another aircraft");
      assert.equal(route.title, "Guns Only");
      assert.equal(
        route.missionId,
        "mission.modern.visual-merge.f22a-vs-su27s.public-data-surrogate.v1",
        "F-22 route staged the wrong mission authority",
      );
    },
  }),
  Object.freeze({
    id: "first-run-valley",
    path: "/",
    search: "?firstRun=1&server=off&audioQa=silent",
    isReady: () => document.querySelector("#boot")?.classList.contains("ready") === true
      && document.querySelector("#ready-screen")?.dataset.mode === "intro"
      && globalThis.__gunsAssets?.diagnostics?.().firstRunValley?.active === true,
    verify: async (page) => {
      const intro = await page.evaluate(() => ({
        fatal: document.querySelector("#fatal")?.classList.contains("visible") === true,
        title: document.querySelector("#ready-title")?.textContent?.trim() ?? "",
        start: document.querySelector("#ready-start")?.textContent?.trim() ?? "",
        alternate: document.querySelector("#ready-intro-replay")?.textContent?.trim() ?? "",
        missionId: globalThis.__gunsState?.mission_definition_id ?? "",
        weaponsCold: globalThis.__gunsState?.first_run_weapons_cold === true,
        valleyAvailable: globalThis.__gunsState?.first_run_valley_available === true,
        valley: globalThis.__gunsAssets?.diagnostics?.().firstRunValley ?? null,
      }));
      assert.equal(intro.fatal, false, "first-run valley remote route showed #fatal");
      assert.equal(intro.title, "Enter the valley");
      assert.equal(intro.start, "Enter valley");
      assert.equal(intro.alternate, "Choose another mission");
      assert.equal(
        intro.missionId,
        "mission.modern.visual-merge.first-run-valley.v1",
        "first-run route staged the wrong mission authority",
      );
      assert.equal(intro.weaponsCold, true, "first-run route did not preserve the valley interlock");
      assert.equal(intro.valleyAvailable, true, "first-run route omitted its terrain authority");
      assert.equal(intro.valley?.active, true, "first-run gorge presentation is inactive");
      assert.equal(intro.valley?.authorityMatched, true);
      assert.equal(intro.valley?.drawCount, 1);
      assert.ok(intro.valley?.triangleCount > 0, "first-run gorge contains no rendered triangles");
    },
  }),
  Object.freeze({
    id: "rapier-intercept",
    path: "/",
    search: "?program=rapier-intercept&server=off&audioQa=silent",
    isReady: () => document.querySelector("#boot")?.classList.contains("ready") === true,
    verify: async (page) => {
      const route = await page.evaluate(() => {
        const choice = document.querySelector('[data-program-node="rapier-intercept"]');
        return {
          fatal: document.querySelector("#fatal")?.classList.contains("visible") === true,
          mode: document.querySelector("#ready-screen")?.dataset.mode ?? "",
          selected: choice?.getAttribute("aria-pressed") === "true"
            && choice?.closest(".sortie-option")?.dataset.selected === "true",
          title: document.querySelector("#ready-title")?.textContent?.trim() ?? "",
          missionId: globalThis.__gunsState?.mission_definition_id ?? "",
        };
      });
      assert.equal(route.fatal, false, "Rapier remote route showed #fatal");
      assert.equal(route.mode, "program", "Rapier deep link did not open the programme brief");
      assert.equal(route.selected, true, "Rapier deep link selected another aircraft");
      assert.equal(route.title, "Rapier Intercept");
      assert.equal(
        route.missionId,
        "mission.modern.rapier-balloon-intercept.public-data-surrogate.v1",
        "Rapier deep link staged the wrong mission authority",
      );
    },
  }),
  Object.freeze({
    id: "top-gun",
    path: "/",
    search: "?program=top-gun&server=off&audioQa=silent",
    isReady: () => document.querySelector("#boot")?.classList.contains("ready") === true,
    verify: async (page) => {
      const route = await page.evaluate(() => {
        const choice = document.querySelector('[data-program-node="top-gun"]');
        return {
          fatal: document.querySelector("#fatal")?.classList.contains("visible") === true,
          mode: document.querySelector("#ready-screen")?.dataset.mode ?? "",
          selected: choice?.getAttribute("aria-pressed") === "true"
            && choice?.closest(".sortie-option")?.dataset.selected === "true",
          title: document.querySelector("#ready-title")?.textContent?.trim() ?? "",
          missionId: globalThis.__gunsState?.mission_definition_id ?? "",
        };
      });
      assert.equal(route.fatal, false, "Top Gun remote route showed #fatal");
      assert.equal(route.mode, "program", "Top Gun deep link did not open the programme brief");
      assert.equal(route.selected, true, "Top Gun deep link selected another aircraft");
      assert.equal(route.title, "Top Gun");
      assert.equal(
        route.missionId,
        "mission.top-gun.acm.f14a-vs-mig28.v1",
        "Top Gun deep link staged the wrong mission authority",
      );
    },
  }),
  Object.freeze({
    id: "cobra-lab",
    path: "/cobra-lab/index.html",
    search: "?audioQa=silent",
    // The aggregate snapshot is initialized at authority_tick 0 before the deliberate brief.
    // Vehicle.tick is the physical mission clock and remains -1 until Start accepts pilot consent.
    isReady: () => document.querySelector("#status")?.dataset.ready === "true"
      && document.querySelector("#mission-brief")?.hidden === false
      && !!window.__gunsOnlyCobraAuthority?.vehicle
      && window.__gunsOnlyCobraAuthority?.vehicle?.tick === -1,
    verify: async (page) => {
      const route = await page.evaluate(() => ({
        status: document.querySelector("#status span")?.textContent?.trim() ?? "",
        briefVisible: document.querySelector("#mission-brief")?.hidden === false,
        title: document.querySelector("#mission-brief-title")?.textContent?.trim() ?? "",
        worldId: window.__gunsOnlyCobraAuthority?.world_id ?? "",
        routeId: window.__gunsOnlyCobraAuthority?.route_id ?? "",
        authorityTick: window.__gunsOnlyCobraAuthority?.vehicle?.tick ?? null,
        vehiclePresent: !!window.__gunsOnlyCobraAuthority?.vehicle,
      }));
      assert.equal(route.status, "READY · REVIEW FLIGHT BRIEF");
      assert.equal(route.briefVisible, true, "Cobra Ready brief is not visible");
      assert.equal(route.title, "Hold the Bridge");
      assert.equal(route.worldId, "world.cobra-canyon.v1");
      assert.equal(route.routeId, "route.cobra-canyon.river-gorge.v1");
      assert.equal(route.authorityTick, -1, "Cobra Ready advanced mission authority");
      assert.equal(route.vehiclePresent, true, "Cobra Ready has no vehicle authority");
    },
  }),
  Object.freeze({
    id: "weekend-ride",
    path: "/weekend-ride/",
    search: "?audioQa=silent",
    isReady: () => document.querySelector("#status")?.dataset.ready === "true"
      && document.querySelector("#ride-brief")?.hidden === false
      && window.__gunsOnlyWeekendAuthority?.phase === "paused",
    verify: async (page) => {
      const route = await page.evaluate(() => ({
        status: document.querySelector("#status span")?.textContent?.trim() ?? "",
        briefVisible: document.querySelector("#ride-brief")?.hidden === false,
        title: document.querySelector("#ride-brief-title")?.textContent?.trim() ?? "",
        phase: window.__gunsOnlyWeekendAuthority?.phase ?? "",
        aircraftId: window.__gunsOnlyWeekendAuthority?.player_aircraft_id ?? "",
      }));
      assert.equal(route.status, "READY · REVIEW SESSION BRIEF");
      assert.equal(route.briefVisible, true, "Weekend Ride Ready brief is not visible");
      assert.equal(route.title, "Bank a clean lap");
      assert.equal(route.phase, "paused", "Weekend Ride authority is running behind Ready");
      assert.equal(route.aircraftId, "vehicle.yzf-r1.track-day.v1");
    },
  }),
  Object.freeze({
    id: "okanagan-fireboss",
    path: "/okanagan/",
    search: "?audioQa=silent",
    isReady: () => document.querySelector("#status")?.dataset.ready === "true"
      && !!window.__gunsOnlyOkanagan,
    verify: async (page) => {
      const route = await page.evaluate(() => ({
        status: document.querySelector("#status")?.textContent?.trim() ?? "",
        menuVisible: document.querySelector("#sortie-menu")?.getAttribute("aria-hidden") === "false"
          && document.querySelector("#sortie-menu")?.classList.contains("visible") === true,
        selected: document.querySelector('[data-sortie="water-circuits"]')
          ?.getAttribute("aria-checked") === "true",
        start: document.querySelector("#start")?.textContent?.trim() ?? "",
        objective: document.querySelector("#dispatch-objective")?.textContent?.trim() ?? "",
        minimum: document.querySelector("#plan-minimum")?.textContent?.trim() ?? "",
        coldAuthority: window.__gunsOnlyOkanagan?.getState?.() == null,
      }));
      assert.equal(route.status, "Ready · choose a sortie");
      assert.equal(route.menuVisible, true, "Okanagan dispatch menu is not visible");
      assert.equal(route.selected, true, "Okanagan route did not select Water Circuits");
      assert.equal(route.start, "Start");
      assert.equal(route.objective, "Complete one water circuit.");
      assert.match(route.minimum, /^\d+ KG$/u, "Okanagan Ready omitted its RTB reserve");
      assert.equal(route.coldAuthority, true, "Okanagan authority advanced behind dispatch");
    },
  }),
]);

export const SWIFTSHADER_LAUNCH_ARGS = Object.freeze([
  "--use-gl=angle",
  "--use-angle=swiftshader",
  "--enable-unsafe-swiftshader",
]);

export function routeUrl(route, origin) {
  const target = new URL(route.path, origin);
  target.search = route.search;
  return target.href;
}
