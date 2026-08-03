import assert from "node:assert/strict";
import test from "node:test";

import {
  experienceAccess,
  releaseHomeHref,
  releaseStateAccess,
} from "../quarantine_gate.js";

test("accepted production experiences launch without a preview acknowledgement", () => {
  const access = experienceAccess("first-merge", { href: "https://guns-only.com/" });
  assert.equal(access.allowed, true);
  assert.equal(access.preview, false);
});

test("quarantined and preview routes fail closed by default", () => {
  for (const id of [
    "medevac", "medevac-command", "korea-panther", "indoor", "rapier-circuits",
  ]) {
    const access = experienceAccess(id, {
      href: `https://guns-only.com/?program=${id}`,
    });
    assert.equal(access.allowed, false, id);
    assert.equal(access.preview, false, id);
    assert.ok(access.reason, `${id} must explain its release blocker`);
  }
});

test("the explicit preview query acknowledges but does not promote a quarantined route", () => {
  const access = experienceAccess("indoor", {
    href: "https://guns-only.com/indoor/?preview=1",
  });
  assert.equal(access.allowed, true);
  assert.equal(access.preview, true);
  assert.equal(access.experience.releaseState, "quarantined");
});

test("Cobra Canyon remains launchable on its standalone route", () => {
  const access = experienceAccess("cobra-lab", {
    href: "https://guns-only.com/cobra-lab/?preview=1",
  });
  assert.equal(access.allowed, true);
  assert.equal(access.preview, false);
  assert.equal(access.experience.route, "/cobra-lab/");
  assert.equal(access.experience.releaseState, "production");
});

test("Weekend Ride launches on its standalone production route", () => {
  const access = experienceAccess("weekend-ride", {
    href: "https://guns-only.com/weekend-ride/",
  });
  assert.equal(access.allowed, true);
  assert.equal(access.preview, false);
  assert.equal(access.experience.releaseState, "production");
  assert.equal(access.experience.route, "/weekend-ride/");
  assert.deepEqual(releaseStateAccess("coming-soon", false), {
    allowed: true,
    preview: false,
  });
});

test("unknown route ids never become launchable", () => {
  const access = experienceAccess("missing", {
    href: "https://guns-only.com/?preview=1",
  });
  assert.equal(access.allowed, false);
  assert.equal(access.experience, null);
});

test("retired experiences stay unreachable even with a preview acknowledgement", () => {
  assert.deepEqual(releaseStateAccess("retired", false), {
    allowed: false,
    preview: false,
  });
  assert.deepEqual(releaseStateAccess("retired", true), {
    allowed: false,
    preview: false,
  });
});

test("quarantine home keeps only an explicit shared-machine silent-audio clamp", () => {
  assert.equal(
    releaseHomeHref({
      href: "https://guns-only.com/indoor/?preview=1&audioQa=silent&program=indoor",
    }),
    "https://guns-only.com/?audioQa=silent",
  );
  assert.equal(
    releaseHomeHref({
      href: "https://guns-only.com/indoor/?preview=1&audioQa=audible",
    }),
    "https://guns-only.com/",
  );
});
