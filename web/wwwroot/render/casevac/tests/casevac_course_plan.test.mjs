import assert from "node:assert/strict";
import test from "node:test";
import {
  CASEVAC_CAPSULE_ID,
  CASEVAC_COURSE_SITE_IDS,
  CASEVAC_SCENERY_QUALITY,
  CASEVAC_SCENERY_SCHEMA,
  planCasevacCourseScenery,
} from "../casevac_course_plan.js";

function assertFinitePoint(point, message) {
  for (const axis of ["x", "y", "z"])
    assert.ok(Number.isFinite(point[axis]), `${message}.${axis} must be finite`);
}

function assertInsideEnvelope(point, envelope, message) {
  assertFinitePoint(point, message);
  for (const axis of ["x", "y", "z"]) {
    assert.ok(
      point[axis] >= envelope.minimum[axis]
        && point[axis] <= envelope.maximum[axis],
      `${message}.${axis}=${point[axis]} must remain inside the authored visual envelope`,
    );
  }
}

function pointsInSite(site) {
  const points = [
    ["pad.position", site.pad.position],
    ["capsuleStand", site.capsuleStand],
    ["windsock.position", site.windsock.position],
  ];
  for (const [collectionName, collection] of [
    ["trees", site.trees],
    ["structures", site.structures],
    ["poles", site.poles],
    ["people", site.people],
    ["rain", site.rain],
  ]) {
    collection.forEach((item, index) => {
      const position = item.position ?? item;
      points.push([`${collectionName}[${index}]`, position]);
      if (collectionName === "rain") {
        points.push([
          `${collectionName}[${index}].end`,
          {
            x: position.x - 0.18,
            y: position.y - position.lengthM,
            z: position.z + 0.08,
          },
        ]);
      }
    });
  }
  for (const [collectionName, collection] of [
    ["fences", site.fences],
    ["wires", site.wires],
  ]) {
    collection.forEach((item, index) => {
      points.push([`${collectionName}[${index}].from`, item.from]);
      points.push([`${collectionName}[${index}].to`, item.to]);
    });
  }
  for (const [cueName, cue] of [
    ["approachCue", site.approachCue],
    ["escapeCue", site.escapeCue],
  ]) {
    cue.points.forEach((point, index) =>
      points.push([`${cueName}.points[${index}]`, point]));
  }
  return points;
}

test("plans a stable fictional pickup and receiver course deterministically", () => {
  const first = planCasevacCourseScenery({
    qualityTier: "balanced",
    seed: 0x2030,
  });
  const repeated = planCasevacCourseScenery({
    qualityTier: "balanced",
    seed: 0x2030,
  });
  const alternate = planCasevacCourseScenery({
    qualityTier: "balanced",
    seed: 0x2031,
  });

  assert.deepEqual(first, repeated);
  assert.notDeepEqual(first.sites.pickup.rain, alternate.sites.pickup.rain);
  assert.equal(first.schema, CASEVAC_SCENERY_SCHEMA);
  assert.equal(first.sites.pickup.id, CASEVAC_COURSE_SITE_IDS.pickup);
  assert.equal(first.sites.receiver.id, CASEVAC_COURSE_SITE_IDS.receiver);
  assert.equal(first.counts.pads, 2);
  assert.equal(first.counts.windsocks, 2);
  assert.equal(first.counts.capsules, 1);
  assert.equal(CASEVAC_CAPSULE_ID,
    "payload.evacuation-capsule.prototype.v1");
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.sites.pickup.trees));
  assert.throws(() => {
    first.seed = 1;
  }, TypeError);
});

test("keeps every authored point inside a conservative per-site visual envelope", () => {
  const plan = planCasevacCourseScenery({
    qualityTier: "desktop",
    seed: 0x7fff_ffff,
  });
  for (const [siteKey, site] of Object.entries(plan.sites)) {
    for (const [name, point] of pointsInSite(site))
      assertInsideEnvelope(point, site.envelope, `${siteKey}.${name}`);

    for (const structure of site.structures) {
      const cosine = Math.abs(Math.cos(structure.yaw));
      const sine = Math.abs(Math.sin(structure.yaw));
      const radiusX = cosine * structure.sizeM.x * 0.5
        + sine * structure.sizeM.z * 0.5;
      const radiusZ = sine * structure.sizeM.x * 0.5
        + cosine * structure.sizeM.z * 0.5;
      for (const corner of [
        {
          x: structure.position.x - radiusX,
          y: structure.position.y,
          z: structure.position.z - radiusZ,
        },
        {
          x: structure.position.x + radiusX,
          y: structure.position.y + structure.sizeM.y * 1.2,
          z: structure.position.z + radiusZ,
        },
      ]) {
        assertInsideEnvelope(
          corner,
          site.envelope,
          `${siteKey}.${structure.id}.extent`,
        );
      }
    }
  }
});

test("does not author collision-sized decoration outside projected authority", () => {
  for (let seed = 0; seed < 32; seed++) {
    const plan = planCasevacCourseScenery({
      qualityTier: "desktop",
      seed,
    });
    for (const site of Object.values(plan.sites)) {
      assert.deepEqual(site.trees, []);
      assert.deepEqual(site.structures, []);
      assert.deepEqual(site.fences, []);
      assert.deepEqual(site.poles, []);
      assert.deepEqual(site.wires, []);
    }
  }
});

test("scales only bounded decorative populations across quality tiers", () => {
  const mobile = planCasevacCourseScenery({ qualityTier: "mobile" });
  const balanced = planCasevacCourseScenery({ qualityTier: "balanced" });
  const desktop = planCasevacCourseScenery({ qualityTier: "desktop" });

  assert.ok(mobile.counts.people < desktop.counts.people);
  assert.ok(mobile.counts.rainStreaks < desktop.counts.rainStreaks);
  assert.equal(desktop.counts.people,
    CASEVAC_SCENERY_QUALITY.desktop.pickupPeople
      + CASEVAC_SCENERY_QUALITY.desktop.receiverPeople);
  assert.equal(desktop.counts.trees, 0);
  assert.equal(desktop.counts.structures, 0);
  assert.equal(desktop.counts.utilityPoles, 0);
  assert.equal(desktop.counts.utilityWires, 0);
  assert.equal(desktop.counts.fenceSegments, 0);
  assert.throws(
    () => planCasevacCourseScenery({ qualityTier: "cinematic" }),
    /Unknown CASEVAC scenery quality tier/,
  );
});

test("describes scenery only, without inventing medical or mission state", () => {
  const plan = planCasevacCourseScenery({ qualityTier: "desktop" });
  assert.equal(plan.presentationOnly, true);
  assert.equal(plan.authoritative, false);
  assert.equal(plan.collisionSource, false);
  assert.equal(plan.sites.pickup.pad.visualOnly, true);
  assert.equal(plan.sites.receiver.pad.visualOnly, true);
  assert.equal(plan.sites.pickup.poles.length, 0);
  assert.equal(plan.sites.pickup.wires.length, 0);
  assert.equal(plan.sites.pickup.fences.length, 0);
  assert.equal(plan.sites.pickup.structures.length, 0);
  assert.ok(plan.sites.pickup.people.length > 0);
  assert.ok(plan.sites.pickup.approachCue.points.length > 2);
  assert.ok(plan.sites.pickup.escapeCue.points.length > 2);

  const serialized = JSON.stringify(plan);
  assert.doesNotMatch(
    serialized,
    /patient|triage|diagnos|vital|blood|injur|prognos|survival|treatment|medical/i,
  );
});
