import assert from "node:assert/strict";
import test from "node:test";

import {
  indoorActionPolicy,
  indoorBlockedActionMessage,
} from "../control_policy.js";

const surveySnapshot = ({
  doctrine = "stealth-mandatory",
  scansComplete = false,
  returning = false,
  link = "fiber",
} = {}) => ({
  link: { mode: link },
  survey: {
    doctrine,
    returnRequested: returning,
    objectives: { scan: { complete: scansComplete } },
  },
});

test("the stealth-required route exposes only the safe return after survey completion", () => {
  const ingress = indoorActionPolicy(surveySnapshot());
  assert.deepEqual({
    detach: ingress.canDetach,
    broadcast: ingress.canBroadcast,
    fire: ingress.canFire,
    return: ingress.canReturn,
  }, { detach: false, broadcast: false, fire: false, return: false });
  assert.match(indoorBlockedActionMessage("fire", ingress), /Stealth profile/i);

  const surveyed = indoorActionPolicy(surveySnapshot({ scansComplete: true }));
  assert.equal(surveyed.canReturn, true);
  assert.equal(surveyed.canDetach, false);
});

test("discretionary doctrine permits deliberate breakaway, radio and weapons by phase", () => {
  const optical = indoorActionPolicy(surveySnapshot({ doctrine: "discretionary" }));
  assert.equal(optical.canDetach, true);
  assert.equal(optical.canBroadcast, false);
  assert.equal(optical.canFire, false);

  const radio = indoorActionPolicy(surveySnapshot({
    doctrine: "discretionary",
    scansComplete: true,
    link: "rf",
  }));
  assert.equal(radio.canDetach, false);
  assert.equal(radio.canBroadcast, true);
  assert.equal(radio.canFire, true);
  assert.equal(radio.canReturn, true);
});

test("return cannot be requested before observations and becomes single-shot", () => {
  const early = indoorActionPolicy(surveySnapshot({ doctrine: "discretionary" }));
  assert.equal(early.canReturn, false);
  assert.match(indoorBlockedActionMessage("return", early), /until every marked room/i);

  const returning = indoorActionPolicy(surveySnapshot({
    doctrine: "discretionary",
    scansComplete: true,
    returning: true,
  }));
  assert.equal(returning.canReturn, false);
});
