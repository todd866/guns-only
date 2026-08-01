import assert from "node:assert/strict";
import test from "node:test";
import * as THREE from "../../../vendor/three.module.js";
import {
  createHighAltitudeBalloon,
  highAltitudeBalloonEnvelopeVolumeM3,
  HIGH_ALTITUDE_BALLOON_DIAMETER_M,
  HIGH_ALTITUDE_BALLOON_HEIGHT_M,
  HIGH_ALTITUDE_BALLOON_PRESENTATION_ID,
  HIGH_ALTITUDE_BALLOON_VOLUME_M3,
} from "../high_altitude_balloon.js";

test("high-altitude target is a NASA-scale balloon rather than an aircraft fallback", () => {
  const balloon = createHighAltitudeBalloon();
  const envelope = balloon.getObjectByName("BALLOON_114P5M_PUMPKIN_ENVELOPE");
  const envelopeSize = new THREE.Box3().setFromObject(envelope).getSize(new THREE.Vector3());

  assert.equal(balloon.name, "HIGH_ALTITUDE_SUPER_PRESSURE_BALLOON_114P5M_SURROGATE");
  assert.ok(envelope);
  assert.ok(Math.abs(envelopeSize.x - HIGH_ALTITUDE_BALLOON_DIAMETER_M) < 0.05,
    `envelope width ${envelopeSize.x}`);
  assert.ok(Math.abs(envelopeSize.y - HIGH_ALTITUDE_BALLOON_HEIGHT_M) < 0.05,
    `envelope height ${envelopeSize.y}`);
  assert.ok(balloon.getObjectByName("BALLOON_LONGITUDINAL_GORES"));
  assert.ok(balloon.getObjectByName("BALLOON_FLIGHT_TRAIN_AND_SUSPENSION"));
  assert.ok(balloon.getObjectByName("BALLOON_SCIENCE_GONDOLA"));
  assert.equal(balloon.children.some((child) => /wing|fuselage|engine|canopy/i.test(child.name)),
    false);
});

test("balloon presentation metadata stays bound to simulation size and identity", () => {
  const balloon = createHighAltitudeBalloon({ assetId: "procedural://target/balloon" });
  const contract = balloon.userData.targetPhysicalContract;
  assert.equal(balloon.userData.presentationId, HIGH_ALTITUDE_BALLOON_PRESENTATION_ID);
  assert.equal(contract.flightModelBinding,
    "FlightModel.HighAltitudeBalloonPublicDataSurrogate");
  assert.equal(contract.envelopeBroadsideDiameterM, 114.5);
  assert.equal(contract.envelopeHeightM, 68.96);
  assert.equal(contract.buoyantVolumeM3, HIGH_ALTITUDE_BALLOON_VOLUME_M3);
  assert.equal(contract.combinedBalloonAndPayloadMassKg, 4_500);
  assert.equal(contract.floatAltitudeM, 33_500);
  assert.equal(contract.broadsideHitRadiusM, 56);
  assert.ok(Math.abs(contract.projectedBroadsideAreaM2 - 10296.7663) < 0.001);
  assert.equal(contract.physicalGoreCount, 280);
  assert.equal(contract.renderedRepresentativeGoreCount, 28);
  assert.ok(Math.abs(highAltitudeBalloonEnvelopeVolumeM3()
    - HIGH_ALTITUDE_BALLOON_VOLUME_M3) < 0.01);
  assert.equal(contract.epistemic, "public-data-surrogate");
  assert.match(contract.sourceUrl, /^https:\/\/science\.nasa\.gov\//);
  assert.equal(balloon.userData.proceduralFallback.assetId, "procedural://target/balloon");
});
