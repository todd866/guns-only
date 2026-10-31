# RC characters: the skinned-creature pipeline

Saucer Springs had no character pipeline until 31 Oct 2026: no SkinnedMesh, AnimationMixer or
clips. The walking robot and the alien are rigid parts posed in code. This spike builds the
pipeline end to end with one creature, the riding dinosaur for the dark-world toy western. The
rider is a toy and the dinosaur is several times bigger, but far smaller than a real one. Later
creatures reuse the same script shape, rig conventions, clip contract and loader.

## Pipeline

```
tools/rc/blender/character_dino.py   (Blender 5.2 LTS, --background --factory-startup)
  ├─ assets/rc/characters/dino.blend               editable source (never under web/wwwroot)
  ├─ web/wwwroot/rc/assets/characters/dino.glb     skinned mesh + armature + 4 clips, no textures
  └─ web/wwwroot/rc/assets/characters/dino.provenance.json   generator, Blender version, MIT, stats
node tools/rc/compress-models.mjs web/wwwroot/rc/assets/characters   → dino.glb.gz transport twin
node tools/rc/asset-manifest.mjs update && … check                   → manifest entries (MIT via provenance)
node tools/rc/validate-assets.mjs web/wwwroot/rc/assets               → `dino` entry in asset-contract.json
web/wwwroot/rc/open-world/characters.js                              → prepareCharacters / spawnCharacter
```

Regenerate (heavy job, local because the worker has no Blender):

```sh
HEAVY_SLOT_LABEL=rc-dino heavy-slot -- /Applications/Blender.app/Contents/MacOS/Blender \
  --background --factory-startup --python tools/rc/blender/character_dino.py [-- --render evidence/rc-characters]
```

`--render DIR` also writes five Eevee **Blender review renders** (`blender-review-{front,side,three-quarter,mid-run,jump-apex}.png`, each labelled in-frame). They are not in-engine evidence. Grey boxes are buggy-size proxies (0.42 × 0.28 × 0.20 m): one sits beside the dinosaur and one rides on the `Saddle` empty.

### How the mesh is made

The soft body is a union of ellipsoids and sphere-chain tubes. It is voxel-remeshed (6.5 mm) into one manifold skin of about 74k triangles, then decimated to about 6k. Each face takes its colour from the nearest source primitive. Blender's automatic (heat) weights skin it; on this mesh they weighted every vertex, and the script reports any vertex it had to weight by nearest bone segment (0 this time). Then influences are limited to 4 and normalised. Hard parts are rigid: 100% to one bone, so they never smear. These are the googly eyes and pupils, the jaw and tongue, the buck teeth, the claws and the western saddle (seat, cantle, horn, flaps, straps and stirrups). Everything is joined into one skinned mesh, with one primitive per material.

Clips are authored analytically in Python and keyed on every frame at 30 fps. The gaits are sine-based. A sagittal two-bone leg IK, with the knee forward, keeps stance feet planted while the pelvis bobs, rolls and pitches.

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
| `jump` | 0.8 s | **no** | 0 | crouch (f0–5), launch (f7), apex with mouth wide and arms up (f12), land and absorb (f18–20), recover |

Clips play in place; nothing is baked as root motion. The game moves `root` and scales `timeScale` to match its speed. Glide speed ÷ the clip's ground speed is the right `timeScale`. The jump lifts the pelvis by up to 0.22 m inside the clip; a physical jump arc is the caller's choice. glTF has no loop flag, so loop flags live in `CHARACTERS.dino.clips` in `characters.js` and in the provenance stats.

## Runtime API (`web/wwwroot/rc/open-world/characters.js`)

- `prepareCharacters()` fetches each GLB once with `fetchAssetBuffer` (using the `.gz` twin when available) and parses it with the vendored GLTFLoader. It resolves `true`, or `false` on failure.
- `spawnCharacter(scene, 'dino', {position, yaw, clip})` returns `{root, mixer, actions, clip, play(name, {fade, restart, then, timeScale}), update(dt), saddle(), mouth()}`. Each instance is a skeleton-correct copy made by `cloneSkinned`, a port of three's `SkeletonUtils.clone`, because that addon is not vendored; `.clone()` would leave the copy bound to the template's bones. Geometry and materials are shared. The skinned mesh casts and receives shadows. `play` cross-fades (0.25 s by default). `then` chains a one-shot clip into a loop, as in `play('jump', {then: 'run'})`.
- `disposeCharacter(c)` stops and uncaches the mixer and detaches the root. It does not dispose the shared template.
- Clip names are normalised (`Armature|walk` and `Dino_Run.001` both map to the contract names). A missing clip throws.

## Budgets and measured cost

| | Budget (`asset-contract.json` → `dino`) | Actual |
|---|---|---|
| Triangles | ≤ 10,000 | 9,152 |
| Materials / primitives | ≤ 6 / ≤ 6 | 5 / 5 (green, cream, orange, saddle brown, eye black; roughness 0.42–0.55) |
| Bytes | ≤ 600,000 | 355,044 (gz 191,867) |
| Extent (x, y, z) | ≤ 0.6 × 0.9 × 1.5 m | 0.39 × 0.65 × 1.31 m (3.1 buggy lengths; saddle at 2.2× the ~0.2 m car roof) |

The in-engine check is `tools/rc/check-character.cjs`. It serves `web/wwwroot`, opens `rc/character-review.html` with the real three r160 build, `characters.js`, the main.js renderer constants and the open-world `LIGHTING.outdoor` preset. It plays each clip for 1.5 s and screenshots it to `evidence/rc-characters/web-*.png`, then measures 300 rAF frames during `run`. It refuses software GL. On 31 Oct 2026 it ran on the worker (`remote-run`, ANGLE Metal on an Apple M2) at 8 draw calls for the whole review scene. That scene has 5 dino primitives, the ground and 2 proxy boxes. rAF was p50 16.7 ms, p95 18.4 ms and max 18.7 ms, which is vsync-bound, so the dinosaur's cost is not separable at this scale. Receipt: `evidence/rc-characters/web-check.json`. The worker's cached Playwright has only Chromium 1193, so pass `CHROMIUM_PATH=…/chromium-1193/chrome-mac/Chromium.app/Contents/MacOS/Chromium`.

## Known limits

- The material borders (belly cream, flank saddle-flaps) follow decimated triangles, so they are slightly jagged up close. A vertex-colour or baked-mask pass would smooth them; this spike deliberately has no textures.
- There are no eyelids, blink or facial shapes, and no morph targets.
- Bone count is 17, one over the brief's 16 for the optional arms; only 16 deform.

## Next step: mount mode

1. **Rider attach.** Parent the player's car or robot to `dino.saddle()`, base on the seat, facing −Z. Run the car physics with the dinosaur as the body: input drives the root's yaw and speed. Pick `idle` below 0.05 m/s, `walk` below 0.5 m/s and `run` above that, with `timeScale = speed / groundSpeedMps`. The jump button calls `play('jump', {then: <gait>})`.
2. **Gait drives the camera.** Read the `Saddle` world height each frame and feed a damped fraction of it into the chase camera. This gives the bounding bob in `run` and the lurch on jump landings without inventing a second animation.
3. **AI dinosaurs** reuse the same template and clips (`spawnCharacter` per herd member; geometry is shared, so instancing can come later). Stagger clip time so a herd doesn't march in lockstep.
4. **The next creature** copies `character_dino.py` (primitives → remesh → heat weights → rigid parts → analytic clips). It keeps the clip names and gets its own `CHARACTERS` entry and contract entry.
