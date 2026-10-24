import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { courseFromGlb, parseGlb, walkNodes } from './physics/district.mjs';
import { createSession, stepSession, readout } from './physics/session.mjs';
import { carUp, placeCar } from './physics/car.mjs';

const bytes = fs.readFileSync(new URL('./assets/districts/skatepark.glb', import.meta.url));
const course = courseFromGlb(bytes);
// Preserve the GLB structure but mask other collision names for a face-specific
// probe. Equal-length names keep all binary offsets unchanged.
const hipBytes = Buffer.from(bytes), jsonLength = hipBytes.readUInt32LE(12);
const jsonText = hipBytes.toString('utf8',20,20+jsonLength).replace(/COL_(?!concrete_central_hip_)/g,'VIS_');
hipBytes.write(jsonText,20,jsonLength,'utf8');
const hipWorld = courseFromGlb(hipBytes).world;

test('skatepark GLB includes the two convex hip faces beside the central banks', () => {
  const names = [];
  walkNodes(parseGlb(bytes), n => { if (n.name) names.push(n.name); });
  assert.ok(names.includes('COL_concrete_central_hip_1'));
  assert.ok(names.includes('COL_concrete_central_hip_-1'));
  // The glTF frame places the west hip around x=-7, z=-3; its face is rideable,
  // not a vertical wall, and rises toward the central deck.
  const low = course.world.raycast([-7, 3, -3.5], [0, -1, 0], 4);
  const face = course.world.raycast([-7, 3, -3], [0, -1, 0], 4);
  assert.ok(low && face, 'hip has continuous collision coverage');
  assert.ok(face.normal[1] > 0.75 && face.normal[1] < .99, `hip normal ${face.normal}`);
  assert.ok(face.point[1] > low.point[1] + .02, 'hip rises from its toe');
});

test('controller can cross the diagonal west hip with a short momentum-preserving transfer', t => {
  const s = createSession(course, { mode: 'bigKid' });
  // The glTF frame's west convex hip occupies this diagonal band.  Approach it
  // from the low toe on a tangent, so a later jump on the central deck cannot
  // satisfy this test by accident.
  const hipWindow = p => p && p[0] > -7.8 && p[0] < -6.4 && p[2] > -2.9 && p[2] < -2.0;
  placeCar(s.car, [-8, .3, -4.2], 2.5);
  const target = [-7.3, -1.8], dt = 1 / 120;
  let previousGrounded = false;
  let contactLocations = [];
  let lastContacts = [];
  let takeoff = null;
  let landing = null;
  let airFrames = 0;
  for (let i = 0; i < 220; i++) {
    const r = readout(s);
    const e = Math.atan2(target[0] - r.x, -(target[1] - r.z)) - r.yaw;
    const steer = Math.max(-1, Math.min(1, Math.atan2(Math.sin(e), Math.cos(e)) * 2));
    stepSession(s, { throttle: .9, steer }, dt);
    const next = readout(s);
    const contacts = s.car.wheels.filter(w => w.contact).map(w => w.contactPoint).filter(Boolean);
    if (next.grounded && contacts.length) contactLocations.push(...contacts);
    if (previousGrounded && !next.grounded && next.speed > 3 && !takeoff) {
      takeoff = { frame: i, position: [next.x, next.y, next.z], speed: next.speed, contacts: lastContacts };
    }
    if (takeoff && !next.grounded) airFrames++;
    if (takeoff && !landing && next.grounded && next.contacts >= 2 && i > takeoff.frame) {
      landing = { frame: i, position: [next.x, next.y, next.z], speed: next.speed };
    }
    previousGrounded = next.grounded;
    if (next.grounded) lastContacts = contacts.map(p=>[...p]);
  }
  t.diagnostic(JSON.stringify({takeoff,landing,airFrames}));
  const hipContact = contactLocations.find(hipWindow);
  assert.ok(hipContact, 'controller made wheel contact on the diagonal hip');
  assert.ok(takeoff?.contacts.some(p=>{const hit=hipWorld.raycast([p[0],p[1]+1,p[2]],[0,-1,0],2);return hit&&Math.abs(hit.point[1]-p[1])<.01;}), 'last grounded wheel contacts the named hip collision face');
  assert.ok(takeoff && hipWindow(takeoff.position), `takeoff occurred on the hip ridge (${takeoff?.position})`);
  assert.ok(landing && hipWindow(landing.position), `landing returned to the adjoining hip bank (${landing?.position})`);
  assert.ok(landing.frame - takeoff.frame < 2 * 120, 'transfer landed within two seconds');
  assert.ok(takeoff.speed > 4.5, `takeoff retained forward momentum (${takeoff.speed.toFixed(2)} m/s)`);
  assert.ok(landing.speed > takeoff.speed * .82, `landing retained momentum (${landing.speed.toFixed(2)} m/s)`);
  assert.ok(carUp(s.car)[1] > .82, `upright after landing (${carUp(s.car)[1].toFixed(2)})`);
  assert.equal(s.recoveries, 0, 'transfer did not require recovery');
  assert.ok(airFrames >= 2, `airtime ${airFrames} frames`);
});
