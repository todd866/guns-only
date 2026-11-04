# RC characters: the skinned-creature pipeline

Saucer Springs had no character pipeline until 31 Oct 2026: no SkinnedMesh, AnimationMixer or
clips. The walking robot and the alien are rigid parts posed in code. This spike builds the
pipeline end to end, starting with the riding dinosaur for the dark-world toy western. The
rider is a toy and the dinosaur is several times bigger, but far smaller than a real one. Since
the same day the builder also makes a roster on the same contract: `raptor`, `longneck`,
`triceratops` and the flyable `quetzal` (see Roster).

## Pipeline

```
tools/rc/blender/character_dino.py   (Blender 5.2 LTS, --background --factory-startup)
  ├─ assets/rc/characters/<kind>.blend               editable source (never under web/wwwroot)
  ├─ web/wwwroot/rc/assets/characters/<kind>.glb     skinned mesh + armature + clips, no textures
  └─ web/wwwroot/rc/assets/characters/<kind>.provenance.json   generator, Blender version, MIT, stats
node tools/rc/compress-models.mjs web/wwwroot/rc/assets/characters   → <kind>.glb.gz transport twins
node tools/rc/asset-manifest.mjs update && … check                   → manifest entries (MIT via provenance)
node tools/rc/validate-assets.mjs web/wwwroot/rc/assets               → one entry per kind in asset-contract.json
web/wwwroot/rc/open-world/characters.js                              → prepareCharacters / spawnCharacter
```

Regenerate (heavy job, local because the worker has no Blender):

```sh
HEAVY_SLOT_LABEL=rc-dino heavy-slot -- /Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --python tools/rc/blender/character_dino.py \
  -- --kinds raptor,longneck,triceratops,quetzal [--render evidence/rc-characters --shots three-quarter,mid-run,flap,glide]
```

`--kinds` defaults to `dino`. Rebuilding the dino is not needed for the roster, and its shipped GLB was left untouched when the roster was added. `--render DIR` also writes Eevee **Blender review renders**, each labelled in-frame: `blender-review-<shot>.png` for the dino and `blender-review-<kind>-<shot>.png` for the others. Shots are front, side, three-quarter, mid-run, jump-apex and gallop, plus flap and glide for flyers; `--shots` picks a subset. They are not in-engine evidence. Grey boxes are buggy-size proxies (0.42 × 0.28 × 0.20 m): one sits beside the dinosaur and one rides on the `Saddle` empty.

### How the mesh is made

The soft body is a union of ellipsoids and sphere-chain tubes. It is voxel-remeshed (6.5 mm) into one manifold skin of about 74k triangles, then decimated to about 6k. Each face takes its colour from the nearest source primitive. Blender's automatic (heat) weights skin it; on this mesh they weighted every vertex, and the script reports any vertex it had to weight by nearest bone segment (0 this time). Then influences are limited to 4 and normalised. Hard parts are rigid: 100% to one bone, so they never smear. These are the googly eyes and pupils, the jaw and tongue, the buck teeth, the claws and the western saddle (seat, cantle, horn, flaps, straps and stirrups). Everything is joined into one skinned mesh, with one primitive per material.

Clips are authored analytically in Python and keyed on every frame at 60 fps. At 30 fps, slerp between keys sank the gallop's stance foot 2 cm, because the foot sweeps 13 cm per 1/30 s; at 60 fps the sink is under 7 mm. The gaits are sine-based. A sagittal two-bone leg IK, with the knee forward, keeps stance feet planted while the pelvis bobs, rolls and pitches.

## Rig and clip contract

Axes and units: metres at game scale. Blender is +Z up and +Y forward; the glTF is +Y up and **faces −Z**, like the buggy. The origin is on the ground between the feet.

| | |
|---|---|
| Nodes | `Dino` (armature root) › `DinoMesh` (SkinnedMesh) + joints |
| Bones (17; `root` does not deform) | `root`, `spine_01` (pelvis), `spine_02` (chest), `neck`, `head`, `jaw`, `tail_01..03`, `thigh_L/R`, `shin_L/R`, `foot_L/R`, `arm_L/R` |
| `Saddle` empty | child of `spine_01`, rest position (0, 0.452, 0) m: the seat top, where a rider's base sits. Identity orientation at rest; it follows the pelvis's bob, roll and pitch |
| `Mouth` empty | child of `head`, at the snout tip (0, 0.46, −0.60): pickups, roars, particles |

| Clip | Length | Loop | Ground speed, no foot slide | Notes |
|---|---|---|---|---|
| `idle` | 2.0 s | yes | 0 | breathing, tail sway, head looks around, arm twiddle |
| `walk` | 1.0 s | yes | 0.30 m/s | 0.6 duty factor (double support), hip roll/yaw, tail counter-sway |
| `run` | 0.6 s | yes | 0.83 m/s | bounding: 0.4 duty with two flight phases, body pitched forward, mouth open, arms flailing |
| `jump` | 0.8 s | **no** | 0 | crouch (0–0.17 s), launch (0.23 s), apex with mouth wide and arms up (0.4 s), land and absorb (0.6–0.67 s), recover |
| `gallop` | 0.5 s | yes | 4.0 m/s (measured 3.94) | mount speeds: exaggerated bound with both feet down together for 23% of the loop (L leads R by 0.04 s) and a 76% flight phase; pelvis rises 0.12 m, head bobs, tail streams level behind, arms tucked back, mouth open |

Clips play in place; nothing is baked as root motion. Ground speeds are at 1.0× export scale; multiply them by the spawn scale (the dark-world mount spawns at 1.5×, so the gallop is foot-true at 6 m/s and `timeScale` 2 covers 12 m/s). `characters.test.mjs` measures the stance-foot speed from the exported GLB. The walk measures 0.33 m/s against a nominal 0.30, because the leg IK ignores hip yaw. The game moves `root` and scales `timeScale` to match its speed. Glide speed ÷ the clip's ground speed is the right `timeScale`. The jump lifts the pelvis by up to 0.22 m inside the clip; a physical jump arc is the caller's choice. glTF has no loop flag, so loop flags live in `CHARACTERS.dino.clips` in `characters.js` and in the provenance stats.

## Roster (shared rig and clip contract)

Every kind faces −Z, has its pivot on the ground between the feet, keys clips at 60 fps, and carries the `Saddle` (child of `spine_01`) and `Mouth` (child of `head`) empties. Every kind has the dino's bones: `root, spine_01, spine_02, neck, head, jaw, tail_01..03, thigh/shin/foot_L/R, arm_L/R`. Four-legged kinds use `arm_*` as the upper front leg and add `forearm_*` and `hand_*` (the hand bone's head is the wrist). The long-necked kinds add `neck_02`. Every kind has `idle`, `walk`, `run`, `jump` and `gallop`. Ground speeds below are at 1.0× scale and were measured from the exported GLB by `characters.test.mjs`.

| Kind | Legs | Length (1×) | Tris | GLB bytes | Saddle y | walk / run / gallop, declared (measured) m/s |
|---|---|---|---|---|---|---|
| `dino` | biped | 1.31 m | 9,152 | 407,764 | 0.452 | 0.30 (0.33) / 0.83 (0.88) / 4.0 (3.92) |
| `raptor` | biped | 0.99 m (crest included) | 8,280 | 367,824 | 0.353 | 0.29 (0.31) / 1.13 (1.15) / 3.67 (3.59) |
| `longneck` | four, columnar | 1.85 m | 9,268 | 445,348 | 0.599 | 0.20 (0.21) / 0.61 (0.58) / 2.0 (1.99) |
| `triceratops` | four | 1.34 m | 9,908 | 438,600 | 0.448 | 0.25 (0.25) / 0.67 (0.65) / 2.0 (1.99) |
| `quetzal` | four (knuckle-walk) | 1.14 m long, 3.0 m span | 9,424 | 596,936 | 0.616 | 0.25 (0.25) / 0.74 (0.75) / 2.2 (2.19) |

Clip durations: `idle` 2.0 s and `jump` 0.8 s (once) for all. Walk, run and gallop take 1.0/0.6/0.5 s for the dino, 0.8/0.4/0.4 s for the raptor, 1.4/0.8/0.6 s for the longneck, 1.0/0.6/0.5 s for the triceratops and 1.0/0.6/0.5 s for the quetzal. Biped `run` is a bounding run; four-legged `walk` is a lateral-sequence four-beat, `run` is a diagonal trot, and `gallop` is a bound with flight phases. The triceratops charges with its head down; the longneck's neck sways and bobs; the quetzal's gallop is a two-footed hop-run.

**The flyer.** `quetzal` adds `wing_shoulder`, `wing_elbow`, `wing_wrist`, `wing_finger_01` and `wing_finger_02` per side, named after the joint at each bone's head. The span is 3.0 m at 1×. It has two front structures:
- **Walking arms** (`arm/forearm/hand`): rigid knuckle-walking arms with a folded-wing flap and a finger rod, so it looks folded on the ground.
- **The spread flight wing**: a spar plus a two-sided membrane weighted to the wing bones.

Clips swap between the two by animating bone **scale**. On the ground the wing is held at 0.01 at `wing_shoulder` and so collapses into the shoulder; in the air the walking arm does the same at `arm_*`. The swap happens in `takeoff` at 0.25–0.36 of the clip and in `land` at 0.68–0.84. Do not override the scale of those bones.

The quetzal's extra clips:
- `takeoff`: 0.8 s, once. A crouch, then two big flaps, rising to flight height.
- `flap`: 0.6 s loop, powered flight.
- `glide`: 2.0 s loop, wings level, with a slight bob and bank.
- `land`: 0.8 s, once. A flare and back-flap, touchdown at 0.6 of the clip, then the wings fold.

Flight clips hold the pelvis `flyHeightM` = 0.25 m above the root, so the root can sit on the ground under a hovering quetzal or travel with the flight model. The glTF bind pose has the wings spread, so the bounding box at rest is the full 3 m span.

**The builder.** The dino keeps its hand-built primitives and clip functions (`soft_parts`, `rigid_parts`, `DINO_BONES`). The other kinds are species data run through the same build path:
- **Body:** ellipsoids and tubes, mirrored where flagged.
- **Stance:** per leg pair, the `x` offset, hip, knee, ankle and toe positions, radii, foot and toe count. One set of numbers generates both the leg mesh and the leg bones.
- **Ornaments:** rigid parts such as horns, frill and knobs, crest feathers, sickle claws, spots and plates.
- **Saddle:** seat height, scale and flank.
- **Gaits:** period, stride and duty factor per gait, plus a style map, for example the triceratops's head-down charge.

The IK bends each knee the way it bends at rest; front elbows bend backwards. Ground speed is `stride / (duty × period)`.

| Kind | In-engine review (Apple M2, `remote-run`) | Blender review renders |
|---|---|---|
| raptor | `evidence/rc-characters/web-raptor-run.png` | `blender-review-raptor-{three-quarter,mid-run}.png` |
| longneck | `web-longneck-run.png` | `blender-review-longneck-{three-quarter,mid-run}.png` |
| triceratops | `web-triceratops-run.png` | `blender-review-triceratops-{three-quarter,mid-run}.png` |
| quetzal | `web-quetzal-{run,flap,glide}.png` | `blender-review-quetzal-{three-quarter,mid-run,flap,glide}.png` |

Every in-engine run was 8 draw calls for the whole review scene, at rAF p50 16.7 ms and p95 17.9–18.4 ms (vsync-bound). The receipts are `evidence/rc-characters/web-check-<kind>-*.json`. The review page takes `?kind=`, and `node tools/rc/check-character.cjs DIR --kind quetzal run flap glide` runs a subset.

## Runtime API (`web/wwwroot/rc/open-world/characters.js`)

- `CHARACTERS` is built from one data row per kind (clip seconds, loop, ground speed, length, span, legs, fly height); `CHARACTER_KINDS` lists them. `spawnCharacter(scene, kind, …)` has the same API for every kind.
- `prepareCharacters(kinds = CHARACTER_KINDS)` fetches each GLB once with `fetchAssetBuffer` (using the `.gz` twin when available) and parses it with the vendored GLTFLoader. It resolves `true`, or `false` on failure.
- `spawnCharacter(scene, 'dino', {position, yaw, clip})` returns `{root, mixer, actions, clip, play(name, {fade, restart, then, timeScale}), update(dt), saddle(), mouth()}`. Each instance is a skeleton-correct copy made by `cloneSkinned`, a port of three's `SkeletonUtils.clone`, because that addon is not vendored; `.clone()` would leave the copy bound to the template's bones. Geometry and materials are shared. The skinned mesh casts and receives shadows. `play` cross-fades (0.25 s by default). `then` chains a one-shot clip into a loop, as in `play('jump', {then: 'run'})`.
- `disposeCharacter(c)` stops and uncaches the mixer and detaches the root. It does not dispose the shared template.
- Clip names are normalised (`Armature|walk` and `Dino_Run.001` both map to the contract names). A missing clip throws.

## Budgets and measured cost

| | Budget (`asset-contract.json` → `dino`) | Actual |
|---|---|---|
| Triangles | ≤ 10,000 | 9,152 |
| Materials / primitives | ≤ 6 / ≤ 6 | 5 / 5 (green, cream, orange, saddle brown, eye black; roughness 0.42–0.55) |
| Bytes | ≤ 600,000 | 407,764 (gz 220,853) with five clips at 60 fps keys |
| Extent (x, y, z) | ≤ 0.6 × 0.9 × 1.5 m | 0.39 × 0.65 × 1.31 m (3.1 buggy lengths; saddle at 2.2× the ~0.2 m car roof) |

The in-engine check is `tools/rc/check-character.cjs`. It serves `web/wwwroot`, opens `rc/character-review.html` with the real three r160 build, `characters.js`, the main.js renderer constants and the open-world `LIGHTING.outdoor` preset. It plays each clip for 1.5 s (`node tools/rc/check-character.cjs DIR gallop` runs a subset) and screenshots it to `evidence/rc-characters/web-*.png`, then measures 300 rAF frames during `run`. It refuses software GL. On 31 Oct 2026 it ran on the worker (`remote-run`, ANGLE Metal on an Apple M2) at 8 draw calls for the whole review scene. That scene has 5 dino primitives, the ground and 2 proxy boxes. rAF was p50 16.7 ms, p95 18.4 ms and max 18.7 ms, which is vsync-bound, so the dinosaur's cost is not separable at this scale. Receipt: `evidence/rc-characters/web-check.json`. The worker's cached Playwright has only Chromium 1193, so pass `CHROMIUM_PATH=…/chromium-1193/chrome-mac/Chromium.app/Contents/MacOS/Chromium`.

## Known limits

- The material borders (belly cream, flank saddle-flaps) follow decimated triangles, so they are slightly jagged up close. A vertex-colour or baked-mask pass would smooth them; this spike deliberately has no textures.
- There are no eyelids, blink or facial shapes, and no morph targets.
- Bone count is 17, one over the brief's 16 for the optional arms; only 16 deform.

## Next step: mount mode

1. **Rider attach.** Parent the player's car or robot to `dino.saddle()`, base on the seat, facing −Z. Run the car physics with the dinosaur as the body: input drives the root's yaw and speed. The dark-world mount now picks `idle`, `walk` and `run`, then `gallop` for high speed, with `timeScale = speed / groundSpeedMps`. The jump button calls `play('jump', {then: <gait>})`.
2. **Gait drives the camera.** Read the `Saddle` world height each frame and feed a damped fraction of it into the chase camera. This gives the bounding bob in `run` and the lurch on jump landings without inventing a second animation.
3. **AI dinosaurs** reuse the same template and clips (`spawnCharacter` per herd member; geometry is shared, so instancing can come later). Stagger clip time so a herd doesn't march in lockstep.
4. **The next creature** copies `character_dino.py` (primitives → remesh → heat weights → rigid parts → analytic clips). It keeps the clip names and gets its own `CHARACTERS` entry and contract entry.
