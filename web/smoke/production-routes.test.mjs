import assert from "node:assert/strict";
import test from "node:test";

import { PRODUCTION_ROUTES, routeUrl } from "./production-routes.mjs";

test("the remote production matrix covers every promoted player entry", () => {
  const ids = PRODUCTION_ROUTES.map(({ id }) => id);
  assert.deepEqual(ids, [
    "f22",
    "first-run-valley",
    "rapier-intercept",
    "top-gun",
    "cobra-lab",
    "weekend-ride",
    "okanagan-fireboss",
  ]);
  assert.equal(new Set(ids).size, ids.length, "production route ids must be unique");
});

test("every production entry is silent and preserves its authored deep link", () => {
  for (const route of PRODUCTION_ROUTES) {
    const url = new URL(routeUrl(route, "https://guns-only.example"));
    assert.equal(url.searchParams.get("audioQa"), "silent", `${route.id} must be silent in QA`);
  }

  const intro = PRODUCTION_ROUTES.find(({ id }) => id === "first-run-valley");
  const f22 = PRODUCTION_ROUTES.find(({ id }) => id === "f22");
  const rapier = PRODUCTION_ROUTES.find(({ id }) => id === "rapier-intercept");
  const topGun = PRODUCTION_ROUTES.find(({ id }) => id === "top-gun");
  assert.equal(new URL(routeUrl(intro, "https://guns-only.example")).searchParams.get("firstRun"), "1");
  assert.equal(new URL(routeUrl(f22, "https://guns-only.example")).searchParams.get("menu"), "1");
  assert.equal(new URL(routeUrl(f22, "https://guns-only.example")).searchParams.get("server"), "off");
  assert.equal(new URL(routeUrl(rapier, "https://guns-only.example")).searchParams.get("program"), "rapier-intercept");
  assert.equal(new URL(routeUrl(topGun, "https://guns-only.example")).searchParams.get("program"), "top-gun");
});

function route(id) {
  const match = PRODUCTION_ROUTES.find((candidate) => candidate.id === id);
  assert.ok(match, `missing production route ${id}`);
  return match;
}

function pageReturning(result) {
  return { evaluate: async () => result };
}

test("Cobra Ready observes the cold vehicle tick, not the initialized aggregate tick", () => {
  const cobra = route("cobra-lab");
  const previousDocument = globalThis.document;
  const previousWindow = globalThis.window;
  const status = { dataset: { ready: "true" } };
  const brief = { hidden: false };
  globalThis.document = {
    querySelector: (selector) => selector === "#status" ? status : brief,
  };
  globalThis.window = {
    __gunsOnlyCobraAuthority: {
      authority_tick: 0,
      vehicle: { tick: -1 },
    },
  };
  try {
    assert.equal(cobra.isReady(), true,
      "the aggregate snapshot initializes at zero while the paused vehicle remains cold");
    globalThis.window.__gunsOnlyCobraAuthority.vehicle.tick = 0;
    assert.equal(cobra.isReady(), false,
      "Ready must still fail if physical vehicle authority has advanced");
  } finally {
    if (previousDocument === undefined) delete globalThis.document;
    else globalThis.document = previousDocument;
    if (previousWindow === undefined) delete globalThis.window;
    else globalThis.window = previousWindow;
  }
});

test("root programme routes require selected UI and exact staged authority", async () => {
  const f22 = route("f22");
  const rapier = route("rapier-intercept");
  const topGun = route("top-gun");

  await f22.verify(pageReturning({
    fatal: false,
    mode: "program",
    selected: true,
    title: "Guns Only",
    missionId: "mission.modern.visual-merge.f22a-vs-su27s.public-data-surrogate.v1",
  }));
  await rapier.verify(pageReturning({
    fatal: false,
    mode: "program",
    selected: true,
    title: "Rapier Intercept",
    missionId: "mission.modern.rapier-balloon-intercept.public-data-surrogate.v1",
  }));
  await topGun.verify(pageReturning({
    fatal: false,
    mode: "program",
    selected: true,
    title: "Top Gun",
    missionId: "mission.top-gun.acm.f14a-vs-mig28.v1",
  }));

  const defaultF22 = pageReturning({
    fatal: false,
    mode: "program",
    selected: false,
    title: "Guns Only",
    missionId: "mission.modern.visual-merge.f22a-vs-su27s.public-data-surrogate.v1",
  });
  await assert.rejects(() => rapier.verify(defaultF22), /selected another aircraft/);
  await assert.rejects(() => topGun.verify(defaultF22), /selected another aircraft/);
  await assert.rejects(() => f22.verify(pageReturning({
    fatal: false,
    mode: "program",
    selected: false,
    title: "Guns Only",
    missionId: "mission.modern.visual-merge.f22a-vs-su27s.public-data-surrogate.v1",
  })), /selected another aircraft/);

  const selectedF22Authority = pageReturning({
    fatal: false,
    mode: "program",
    selected: true,
    title: "Rapier Intercept",
    missionId: "mission.modern.visual-merge.f22a-vs-su27s.public-data-surrogate.v1",
  });
  await assert.rejects(
    () => rapier.verify(selectedF22Authority),
    /staged the wrong mission authority/,
  );
  await assert.rejects(() => topGun.verify(pageReturning({
    fatal: false,
    mode: "program",
    selected: true,
    title: "Top Gun",
    missionId: "mission.modern.visual-merge.f22a-vs-su27s.public-data-surrogate.v1",
  })), /staged the wrong mission authority/);
});

test("first-run route proves cold authority and an authority-matched gorge", async () => {
  const intro = route("first-run-valley");
  const valid = {
    fatal: false,
    title: "Enter the valley",
    start: "Enter valley",
    alternate: "Choose another mission",
    missionId: "mission.modern.visual-merge.first-run-valley.v1",
    weaponsCold: true,
    valleyAvailable: true,
    valley: { active: true, authorityMatched: true, drawCount: 1, triangleCount: 131_072 },
  };
  await intro.verify(pageReturning(valid));
  await assert.rejects(() => intro.verify(pageReturning({
    ...valid,
    valley: { ...valid.valley, active: false },
  })), /gorge presentation is inactive/);
  await assert.rejects(() => intro.verify(pageReturning({
    ...valid,
    weaponsCold: false,
  })), /did not preserve the valley interlock/);
});

test("standalone routes require their Ready brief and paused or cold authority", async () => {
  const cobra = route("cobra-lab");
  const weekend = route("weekend-ride");

  await cobra.verify(pageReturning({
    status: "READY · REVIEW FLIGHT BRIEF",
    briefVisible: true,
    title: "Hold the Bridge",
    worldId: "world.cobra-canyon.v1",
    routeId: "route.cobra-canyon.river-gorge.v1",
    authorityTick: -1,
    vehiclePresent: true,
  }));
  await weekend.verify(pageReturning({
    status: "READY · REVIEW SESSION BRIEF",
    briefVisible: true,
    title: "Bank a clean lap",
    phase: "paused",
    aircraftId: "vehicle.yzf-r1.track-day.v1",
  }));

  await assert.rejects(() => cobra.verify(pageReturning({
    status: "HOLD THE BRIDGE · AH-1G ONLINE",
    briefVisible: false,
  })), /READY · REVIEW FLIGHT BRIEF/);
  await assert.rejects(() => weekend.verify(pageReturning({
    status: "YZF-R1 ACTIVE",
    briefVisible: false,
  })), /READY · REVIEW SESSION BRIEF/);
  await assert.rejects(() => cobra.verify(pageReturning({
    status: "READY · REVIEW FLIGHT BRIEF",
    briefVisible: true,
    title: "Hold the Bridge",
    worldId: "world.cobra-canyon.v1",
    routeId: "route.cobra-canyon.river-gorge.v1",
    authorityTick: 0,
    vehiclePresent: true,
  })), /Ready advanced mission authority/);
  await assert.rejects(() => weekend.verify(pageReturning({
    status: "READY · REVIEW SESSION BRIEF",
    briefVisible: true,
    title: "Bank a clean lap",
    phase: "active",
    aircraftId: "vehicle.yzf-r1.track-day.v1",
  })), /authority is running behind Ready/);
});

test("Okanagan Ready proves its selected contract, reserve and cold authority", async () => {
  const okanagan = route("okanagan-fireboss");
  const valid = {
    status: "Ready · choose a sortie",
    menuVisible: true,
    selected: true,
    start: "Start",
    objective: "Complete one water circuit.",
    minimum: "95 KG",
    coldAuthority: true,
  };
  await okanagan.verify(pageReturning(valid));
  await assert.rejects(() => okanagan.verify(pageReturning({
    ...valid,
    minimum: "—",
  })), /omitted its RTB reserve/);
  await assert.rejects(() => okanagan.verify(pageReturning({
    ...valid,
    coldAuthority: false,
  })), /advanced behind dispatch/);
});
