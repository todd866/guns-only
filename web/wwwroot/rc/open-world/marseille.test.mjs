import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createWorld } from '../physics/world.mjs';
import { createStream } from './stream.mjs';
import { createSession, stepSession } from '../physics/session.mjs';
import { placeCar, rideHeight } from '../physics/car.mjs';
import { createSkate, stepSkate } from '../physics/skate.mjs';
import { MARSEILLE_TERRAIN } from './marseille-site.mjs';
import { MARSEILLE, MARSEILLE_PARK, addMarseilleCollision, marseilleHeight, kidneyDistance, marseilleWorld, marseilleLocal } from './marseille.mjs';

const read = name => JSON.parse(fs.readFileSync(new URL(`../assets/world/${name}`, import.meta.url)));
const stream = createStream({ manifest: read('manifest.json'), elevation: read('playable-terrain.json'), terrainSite: MARSEILLE_TERRAIN,
  fetchTile: key => read(`tile-${key.replace(',', '-')}.json`) });
await stream.update(marseilleWorld([0, 0, 0]));
after(() => stream.dispose());
const world = stream.world, riding = createWorld(4);
addMarseilleCollision(world); addMarseilleCollision(riding);
// The driving fixture retains the level desert beyond the exact park cut.
for (const [x0,z0,x1,z1] of [[-200,-200,-40,200],[32,-200,200,200],[-40,-200,32,-24],[-40,32,32,200]]) riding.addQuad(...[[x0,0,z0],[x0,0,z1],[x1,0,z1],[x1,0,z0]].map(marseilleWorld),'grass');
const course = { world: riding, checkpoints: [[...MARSEILLE.center, 'a'], [MARSEILLE.center[0]+1,MARSEILLE.center[1], 'b']], secrets: [], start: { pos: marseilleWorld([0, 0, 0]), yaw: 0 } };
const frame = p => { const [x, y, z] = marseilleLocal(p); return [x, z, y]; };
const ground = (x, z) => world.raycast(marseilleWorld([x, 8, z]), [0, -1, 0], 16)?.point[1] - MARSEILLE.datum;

function run(x, z, dx, dz, seconds, throttle = 1, grab = false, collision = riding) {
  const s = createSession({ ...course, world: collision }, { mode: 'kid' }); s.roam = true;
  placeCar(s.car, marseilleWorld([x, ground(x, z) + rideHeight() + .01, z]), Math.atan2(dx, -dz));
  const sk = createSkate(MARSEILLE_PARK); sk.left = seconds; const events = [], grinds = new Set(); let peak = -Infinity, minZ = z, maxZ = z, radius = 0;
  for (let f = 0; f < (seconds + 4) * 120 && !sk.over; f++) {
    const input = { throttle, steer: 0, drift: grab && s.car.contacts === 0 };
    stepSession(s, input, 1 / 120); events.push(...stepSkate(sk, s, input, 1 / 120, frame));
    const [x, z, h] = frame(s.car.pos); peak = Math.max(peak, h); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
    radius = Math.max(radius, Math.hypot(x, z));
    if (s.skateRide?.active) grinds.add(s.skateRide.active.rail.id);
  }
  return { s, sk, events, peak, minZ, maxZ, radius, grinds, gaps: events.filter(e => e.type === 'gap').map(e => e.name) };
}
function clean(r) { assert.equal(r.s.hits, 0, 'no wall hits'); assert.equal(r.s.recoveries, 0, 'no rescue'); assert.ok(!r.events.some(e => e.type === 'bail'), 'no bail'); }

test('preparing travel and then attaching visuals installs collision only once', () => {
  const count=riding.tris.length; addMarseilleCollision(riding);
  assert.equal(riding.tris.length,count);
});

test('sunken bowls, hips and plaza have upward collision at their designed heights', () => {
  for (const [x, z] of [[-23,-7],[-23,-14],[-30,-7],[-13,-5],[7,-6],[7,-11],[-10,10],[0,12],[-4.5,-6],[1,-6]])
    assert.ok(Math.abs(ground(x,z) - marseilleHeight(x,z)) < .08, `cut ${x},${z}: ${ground(x,z)} versus ${marseilleHeight(x,z)}`);
  for (const [x, z, h] of [[-6,24,1.1],[-6,21.5,.55],[-28,23,1],[-28,26.3,.75],[-28,26.9,.5],[-28,27.6,.25],[7,24.5,.45],[23,18.5,-1],[23,14.75,.45],[23,22.5,.45]])
    assert.ok(Math.abs(ground(x,z)-h)<.025, `plaza ${x},${z}: ${ground(x,z)} versus ${h}`);
});

test('all four deck seams are flush with real desert terrain, with no floor through the bowls', () => {
  for (const z of [-23,-12,0,14,31]) for (const x of [-40.01,-39.99,31.99,32.01]) assert.ok(Math.abs(ground(x,z))<.025, `side seam ${x},${z}`);
  for (const x of [-39,-30,-15,0,15,31]) for (const z of [-24.01,-23.99,31.99,32.01]) assert.ok(Math.abs(ground(x,z))<.025, `end seam ${x},${z}`);
  assert.ok(ground(-23,-7)<-3.15 && ground(7,-6)<-2.15 && ground(0,10)<-.3);
});

test('the snake roller blends into its side walls without a wheel-catching step', () => {
  for(const x of [-2,0,2])for(let z=13.7;z<15.4;z+=.01)
    assert.ok(Math.abs(marseilleHeight(x,z+.01)-marseilleHeight(x,z))<.025,`roller shoulder ${x},${z}`);
});

test('every rail polyline lies on real geometry within five centimetres', () => {
  assert.ok(MARSEILLE_PARK.rails.filter(r => r.kind === 'coping').length >= 2);
  const ids = new Set();
  for (const rail of MARSEILLE_PARK.rails) {
    assert.ok(!ids.has(rail.id)); ids.add(rail.id); assert.ok(rail.pts.length >= 2);
    for (let i=1;i<rail.pts.length;i++) for (const t of [0,.25,.5,.75,1]) {
      const a=rail.pts[i-1],b=rail.pts[i],p=a.map((v,j)=>v+(b[j]-v)*t);
      assert.ok(Math.abs(ground(p[0],p[1])-p[2])<.05, `${rail.id} at ${p}: ground ${ground(p[0],p[1])}`);
      if(rail.kind==='coping'){
        const rim=rail.id.startsWith('kidney')?kidneyDistance(p[0],p[1]):Math.hypot(p[0]-7,p[1]+6)-7.2;
        assert.ok(Math.abs(rim-.4)<.025,`${rail.id} follows the bowl rim's 40 cm shelf: ${rim}`);
      }
    }
  }
});

test('held throttle from the park start transfers between bowls over real streamed terrain', () => {
  const {at,toward}=MARSEILLE_PARK.start,r=run(...at,...toward,16,1,false,world);
  assert.ok(r.gaps.includes('BOWL TO BOWL'),r.gaps.join(',')); assert.ok(r.peak>1.2); clean(r);
});

test('held throttle rides each bowl wall to wall without bails, hits or recovery', () => {
  for (const [x,z] of [[-23,-7],[7,-6]]) {
    const r=run(x,z,0,-1,14);
    assert.ok(r.events.filter(e=>e.type==='trick'&&e.name==='Backside Air').length>=3);
    assert.ok(r.minZ<z-6 && r.maxZ>z+6, `${x}: both opposite walls reached`); clean(r);
  }
});

test('every named gap and S-K-A-T-E letter has a clean held-throttle line', () => {
  const lines=[['DEEP END AIR','S',[-23,-7,-1,0,8]], ['ROUND BOWL AIR','K',[7,-6,0,-1,8]], ['BOWL TO BOWL',null,[-13,-6,1,0,5]], ['SNAKE RUN','A',[-12,12,1,0,4]], ['OVER THE CHANNEL','E',[23,4,0,1,4]], ['FUNBOX','T',[-6,17,0,1,3]], ['SPILLWAY STEPS',null,[-28,22,0,1,3]], ['LONG LEDGE',null,[7,19,0,1,3]]];
  const gaps=new Set(),letters=new Set();
  for(const [gap,letter,line] of lines){const r=run(...line);clean(r);assert.equal(r.grinds.size,0,'no rail captures the gap line');assert.ok(r.gaps.includes(gap),`${gap}: ${r.gaps}`);if(letter)assert.ok(r.sk.letters.includes(letter),letter);r.gaps.forEach(g=>gaps.add(g));r.sk.letters.forEach(l=>letters.add(l));}
  assert.deepEqual([...gaps].sort(),MARSEILLE_PARK.gaps.map(g=>g.name).sort());
  assert.deepEqual([...letters].sort(),['A','E','K','S','T']);
});

test('the secret tape is an off-centre deep-end air, reachable at full throttle', () => {
  const r=run(-23,-10,-1,0,8); assert.ok(r.sk.tape); assert.ok(r.gaps.includes('DEEP END AIR')); clean(r);
  assert.equal(r.grinds.size,0,'no rail captures the tape line');
  assert.ok(!run(-23,-7,-1,0,4).sk.tape,'the central line misses the secret tape');
});

test('held throttle locks onto the round-bowl coping and banks a real grind', () => {
  const r=run(4,-13.6,1,0,4); clean(r);
  assert.ok([...r.grinds].some(id=>id.startsWith('round')));
  assert.ok(r.events.some(e=>e.type==='trick'&&e.name==='50-50'));
  assert.ok(r.sk.score>400);
});

test('two-minute runs calibrate scores and combo goals without leaving the park', t => {
  const {at,toward}=MARSEILLE_PARK.start,plain=run(...at,...toward,120),grab=run(...at,...toward,120,1,true);
  for(const r of [plain,grab]){assert.ok(r.sk.over);clean(r);assert.ok(r.radius<53,'stays inside the run area');}
  t.diagnostic(`held throttle: ${plain.sk.score}; airborne grabs: ${grab.sk.score}; best combo: ${grab.sk.best}`);
  assert.ok(plain.sk.goals.has('high')&&plain.sk.goals.has('pro')&&!plain.sk.goals.has('sick'));
  assert.ok(grab.sk.goals.has('sick')&&grab.sk.goals.has('combo'));
});
