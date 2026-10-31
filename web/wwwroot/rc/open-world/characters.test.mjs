import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as T from '../../vendor/three.module.js';
import {GLTFLoader} from '../../vendor/three/addons/loaders/GLTFLoader.js';
import {
  CHARACTERS,
  CHARACTER_KINDS,
  normaliseClipName,
  resolveClip,
  planTransition,
  findNode,
  cloneSkinned,
  registerCharacterTemplate,
  spawnCharacter,
  disposeCharacter
} from './characters.js';

// A two-bone skinned stand-in with the contract's clip names and a Saddle empty on the spine.
function stubDino() {
  const scene = new T.Group(),
    spine = new T.Bone(),
    tail = new T.Bone(),
    saddle = new T.Object3D();
  spine.name = 'spine_01';
  tail.name = 'tail_01';
  saddle.name = 'Saddle';
  tail.position.z = 0.2;
  saddle.position.y = 0.15;
  spine.add(tail, saddle);
  const g = new T.BoxGeometry(0.2, 0.2, 0.4, 1, 1, 2),
    n = g.attributes.position.count;
  g.setAttribute('skinIndex', new T.Uint16BufferAttribute(new Array(n * 4).fill(0), 4));
  g.setAttribute(
    'skinWeight',
    new T.Float32BufferAttribute(
      Array.from({length: n * 4}, (_, i) => (i % 4 ? 0 : 1)),
      4
    )
  );
  const mesh = new T.SkinnedMesh(g, new T.MeshStandardMaterial());
  mesh.name = 'DinoMesh';
  scene.add(spine, mesh);
  mesh.bind(new T.Skeleton([spine, tail]));
  const rot = (name, secs) =>
    new T.AnimationClip(name, secs, [
      new T.QuaternionKeyframeTrack(
        'spine_01.quaternion',
        [0, secs / 2, secs],
        [
          0,
          0,
          0,
          1,
          ...new T.Quaternion().setFromAxisAngle(new T.Vector3(1, 0, 0), 0.4).toArray(),
          0,
          0,
          0,
          1
        ]
      )
    ]);
  return {
    scene,
    animations: [
      rot('Armature|idle', 2),
      rot('walk', 1),
      rot('Dino_Run.001', 0.6),
      rot('jump', 0.8),
      rot('Armature|gallop', 0.5)
    ]
  };
}

test('clip names map exporter decorations back to the contract', () => {
  assert.equal(normaliseClipName('Armature|walk'), 'walk');
  assert.equal(normaliseClipName('Dino_Run.001'), 'run');
  assert.equal(normaliseClipName('IDLE'), 'idle');
  const clips = stubDino().animations;
  assert.equal(resolveClip('dino', 'run', clips).name, 'Dino_Run.001');
  assert.equal(resolveClip('dino', 'gallop', clips).name, 'Armature|gallop');
  assert.throws(() => resolveClip('dino', 'canter', clips), /no clip "canter"/);
  assert.throws(() => resolveClip('dino', 'jump', clips.slice(0, 3)), /missing clip "jump"/);
  assert.throws(() => resolveClip('horse', 'idle', clips), /unknown character/);
  assert.deepEqual(
    Object.entries(CHARACTERS.dino.clips).map(([k, v]) => [k, v.loop]),
    [
      ['idle', true],
      ['walk', true],
      ['run', true],
      ['jump', false],
      ['gallop', true]
    ]
  );
});

test('fade bookkeeping: start, stop, no-op replays and expiring fade-outs', () => {
  let p = planTransition({current: null}, 'idle', {fade: 0.3});
  assert.deepEqual([p.start, p.stop, p.fade], ['idle', null, 0], 'first clip snaps in');
  p = planTransition(p.state, 'walk', {fade: 0.3, now: 1});
  assert.deepEqual([p.start, p.stop, p.fade], ['walk', 'idle', 0.3]);
  assert.deepEqual(p.state.fadingOut, [{name: 'idle', until: 1.3}]);
  const same = planTransition(p.state, 'walk', {now: 1.1});
  assert.equal(same.start, null, 'replaying the current clip is a no-op');
  assert.equal(planTransition(p.state, 'walk', {restart: true, now: 1.1}).start, 'walk');
  const back = planTransition(p.state, 'idle', {fade: 0.2, now: 1.1});
  assert.deepEqual(
    back.state.fadingOut,
    [{name: 'walk', until: 1.3}],
    'a clip coming back is no longer fading out'
  );
  assert.deepEqual(
    planTransition(back.state, 'run', {now: 5}).state.fadingOut,
    [{name: 'idle', until: 5.25}],
    'expired fades drop'
  );
});

test('cloneSkinned rebinds the copy to its own bones', () => {
  const src = stubDino().scene,
    copy = cloneSkinned(src);
  const mesh = findNode(copy, 'DinoMesh');
  assert.equal(mesh.skeleton.bones[0], findNode(copy, 'spine_01'));
  assert.notEqual(mesh.skeleton.bones[0], findNode(src, 'spine_01'));
  assert.equal(mesh.geometry, findNode(src, 'DinoMesh').geometry, 'geometry stays shared');
});

test('spawn, cross-fade, one-shot jump returns to a loop, saddle follows the spine, dispose', () => {
  registerCharacterTemplate('dino', stubDino());
  const scene = new T.Scene(),
    a = spawnCharacter(scene, 'dino', {position: [1, 0, 2], yaw: 0.5});
  assert.equal(a.root.parent, scene);
  assert.equal(a.clip, 'idle');
  assert.deepEqual(a.root.position.toArray(), [1, 0, 2]);
  assert.ok(findNode(a.root, 'DinoMesh').castShadow);
  assert.equal(a.saddle().name, 'Saddle');
  const before = a.saddle().getWorldPosition(new T.Vector3());
  a.play('walk', {fade: 0.2});
  a.update(0.1);
  const w = a.actions.get('walk').getEffectiveWeight(),
    i = a.actions.get('idle').getEffectiveWeight();
  assert.ok(w > 0 && w < 1 && i > 0 && i < 1, `mid-fade weights walk ${w} idle ${i}`);
  a.update(0.2);
  assert.equal(a.actions.get('walk').getEffectiveWeight(), 1);
  assert.equal(a.actions.get('idle').isRunning(), false, 'faded clip stops');
  a.update(0.2);
  a.root.updateMatrixWorld(true);
  assert.ok(
    a.saddle().getWorldPosition(new T.Vector3()).distanceTo(before) > 1e-3,
    'saddle rides the animated spine'
  );
  a.play('jump', {fade: 0.1, then: 'run'});
  for (let k = 0; k < 12; k++) a.update(0.1);
  assert.equal(a.clip, 'run', 'jump hands back to run when it finishes');
  const b = spawnCharacter(scene, 'dino');
  assert.notEqual(findNode(b.root, 'DinoMesh').skeleton, findNode(a.root, 'DinoMesh').skeleton);
  disposeCharacter(a);
  assert.equal(a.root.parent, null);
  assert.equal(scene.children.length, 1);
});

const BASE_BONES = [
  'root',
  'spine_01',
  'spine_02',
  'neck',
  'head',
  'jaw',
  'tail_01',
  'tail_02',
  'tail_03',
  ...['L', 'R'].flatMap(s => ['thigh_', 'shin_', 'foot_', 'arm_'].map(b => b + s))
];
const sides = names => ['L', 'R'].flatMap(s => names.map(b => `${b}_${s}`));
const EXTRA_BONES = {
  dino: [],
  raptor: [],
  triceratops: sides(['forearm', 'hand']),
  longneck: ['neck_02', ...sides(['forearm', 'hand'])],
  quetzal: [
    'neck_02',
    ...sides([
      'forearm',
      'hand',
      'wing_shoulder',
      'wing_elbow',
      'wing_wrist',
      'wing_finger_01',
      'wing_finger_02'
    ])
  ]
};
const gltfs = new Map();
async function loadKind(kind) {
  if (!gltfs.has(kind)) {
    const bytes = fs.readFileSync(new URL(`../assets/${CHARACTERS[kind].file}`, import.meta.url));
    gltfs.set(
      kind,
      await new GLTFLoader().parseAsync(
        bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length),
        ''
      )
    );
  }
  return gltfs.get(kind);
}
const FEET = ['foot_L', 'foot_R', 'hand_L', 'hand_R'];

for (const kind of CHARACTER_KINDS)
  test(`${kind}.glb meets the rig, clip and Saddle contract`, async () => {
    const gltf = await loadKind(kind),
      def = CHARACTERS[kind];
    let skinned = 0;
    gltf.scene.traverse(o => {
      if (o.isSkinnedMesh) {
        skinned++;
        assert.deepEqual(
          o.skeleton.bones.map(b => b.name).sort(),
          [...BASE_BONES, ...EXTRA_BONES[kind]].sort()
        );
      }
    });
    assert.ok(skinned >= 1, 'a skinned mesh');
    assert.deepEqual(
      gltf.animations.map(c => normaliseClipName(c.name)).sort(),
      Object.keys(def.clips).sort(),
      'clip set'
    );
    for (const [name, spec] of Object.entries(def.clips))
      assert.ok(
        Math.abs(resolveClip(kind, name, gltf.animations).duration - spec.seconds) < 1e-3,
        `${name} duration`
      );
    registerCharacterTemplate(kind, gltf);
    const c = spawnCharacter(new T.Scene(), kind);
    c.root.updateMatrixWorld(true);
    const box = new T.Box3().setFromObject(c.root),
      size = box.getSize(new T.Vector3());
    assert.ok(
      Math.abs(size.z - def.lengthM) / def.lengthM < 0.06,
      `length ${size.z.toFixed(3)} m vs ${def.lengthM}`
    );
    if (def.spanM) assert.ok(Math.abs(size.x - def.spanM) < 0.1, `wingspan ${size.x}`);
    assert.ok(Math.abs(box.min.y) < 0.01, `feet on the ground ${box.min.y}`);
    const seat = c.saddle().getWorldPosition(new T.Vector3()),
      mouth = c.mouth().getWorldPosition(new T.Vector3());
    assert.ok(seat.y > 0.3 && seat.y < box.max.y, `saddle height ${seat.y}`);
    assert.ok(mouth.z < -0.3, `mouth is forward (-Z): ${mouth.z}`);
    if (kind === 'dino') assert.ok(seat.y > 0.38 && seat.y < 0.5, `dino saddle height ${seat.y}`);
    disposeCharacter(c);
  });

// Sample the exported clip finely: while a foot is on the ground it must sweep backwards at the clip's
// declared ground speed (so moving the root at that speed leaves the foot planted).
export function stanceSpeed(kind, gltf, clipName, steps = 600) {
  registerCharacterTemplate(kind, gltf);
  const c = spawnCharacter(new T.Scene(), kind, {clip: clipName}),
    action = c.actions.get(clipName),
    dt = action.getClip().duration / steps;
  const feet = FEET.map(n => findNode(c.root, n)).filter(Boolean),
    p = new T.Vector3(),
    samples = [];
  for (let k = 0; k <= steps; k++) {
    action.time = k * dt;
    c.mixer.update(0);
    c.root.updateMatrixWorld(true);
    samples.push(feet.map(f => f.getWorldPosition(p).toArray()));
  }
  const ground = feet.map((_, f) => Math.min(...samples.map(s => s[f][1]))),
    speeds = [],
    contact = 0.01;
  let flight = 0;
  for (let k = 1; k < samples.length; k++) {
    let down = 0;
    for (let f = 0; f < feet.length; f++) {
      const [a, b] = [samples[k - 1][f], samples[k][f]];
      if (a[1] - ground[f] < contact && b[1] - ground[f] < contact) {
        speeds.push((b[2] - a[2]) / dt);
        down++;
      } else if (b[1] - ground[f] < contact) down++;
    }
    if (!down) flight++;
  }
  speeds.sort((x, y) => x - y);
  disposeCharacter(c);
  return {median: speeds[speeds.length >> 1], flightShare: flight / steps};
}

const measured = {};
for (const kind of CHARACTER_KINDS)
  test(`${kind}: stance feet sweep back at each gait's declared ground speed`, async () => {
    const gltf = await loadKind(kind);
    measured[kind] = {};
    for (const gait of ['walk', 'run', 'gallop']) {
      const want = CHARACTERS[kind].clips[gait].groundSpeedMps,
        m = stanceSpeed(kind, gltf, gait);
      measured[kind][gait] = +m.median.toFixed(3);
      assert.ok(
        Math.abs(m.median - want) < Math.max(0.05, want * 0.12),
        `${kind} ${gait} stance ${m.median} vs ${want}`
      );
      if (gait === 'gallop')
        assert.ok(m.flightShare > 0.25, `${kind} gallop has flight phases (${m.flightShare})`);
    }
    console.log(`measured stance speed ${kind}: ${JSON.stringify(measured[kind])}`);
  });

test('quetzal: wings fold away on the ground and the walking arms fold away in the air', async () => {
  const gltf = await loadKind('quetzal');
  registerCharacterTemplate('quetzal', gltf);
  const c = spawnCharacter(new T.Scene(), 'quetzal'),
    wing = findNode(c.root, 'wing_shoulder_L'),
    arm = findNode(c.root, 'arm_L'),
    hips = findNode(c.root, 'spine_01');
  const at = (clip, u) => {
    for (const a of c.actions.values()) a.stop();
    const a = c.actions.get(clip);
    a.play();
    a.time = a.getClip().duration * u;
    c.mixer.update(0);
    c.root.updateMatrixWorld(true);
  };
  at('idle', 0);
  const restHips = hips.getWorldPosition(new T.Vector3()).y;
  assert.ok(wing.scale.x < 0.05 && arm.scale.x > 0.95, `idle: wing ${wing.scale.x} arm ${arm.scale.x}`);
  for (const clip of ['flap', 'glide']) {
    at(clip, 0.3);
    assert.ok(wing.scale.x > 0.95 && arm.scale.x < 0.05, `${clip}: wing ${wing.scale.x} arm ${arm.scale.x}`);
    assert.ok(hips.getWorldPosition(new T.Vector3()).y - restHips > 0.2, `${clip} holds the body up`);
  }
  at('takeoff', 0);
  assert.ok(wing.scale.x < 0.05, 'takeoff starts folded');
  at('takeoff', 1);
  assert.ok(wing.scale.x > 0.95, 'takeoff ends spread');
  at('land', 0);
  assert.ok(wing.scale.x > 0.95, 'land starts spread');
  at('land', 1);
  assert.ok(wing.scale.x < 0.05 && arm.scale.x > 0.95, 'land ends folded');
  assert.equal(CHARACTERS.quetzal.clips.flap.loop, true);
  assert.equal(CHARACTERS.quetzal.clips.takeoff.loop, false);
  disposeCharacter(c);
});
