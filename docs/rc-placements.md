# RC placements: venues as data

Audit 2026-10-31 §3.9.1. Until now every venue was 10–25 KB of bespoke geometry code. This adds a
data path. A reusable **prop kit** GLB, plus **placement files** (JSON) that list which prop goes
where, are drawn in instanced batches with collision proxies. A new picnic area, fairground or
seasonal layer becomes a JSON file.

Not wired into the game yet. See "Wiring into runtime.js" below.

| Piece | Path |
|---|---|
| Kit generator (Blender) | `tools/rc/blender/prop_kit.py` → `assets/rc/kit/props.blend`, `web/wwwroot/rc/assets/kit/props.glb` (+ `.gz`, `kit.provenance.json`) |
| Placement format | `tools/rc/placements.schema.json`; runtime check `validatePlacements()` |
| Loader / renderer / collision | `web/wwwroot/rc/open-world/placements.js` (+ `placements.test.mjs`) |
| Examples | `web/wwwroot/rc/assets/placements/example-picnic-area.json` (39 items), `example-farmstead.json` (56 items, dark-world valley) |
| Blender layout → JSON | `tools/rc/blender/export_placements.py` |
| In-engine review | `web/wwwroot/rc/placements-review.html`, `tools/rc/check-placements.cjs` → `evidence/rc-placements/` |

## The kit

All props are original, toy-style and at **real scale**. The world is real-sized and the car is a 0.42 m RC buggy.

| Set | Props (node names) |
|---|---|
| Base (14) | `picnic-table`, `bench`, `bin`, `street-lamp`, `chain-link-fence-panel` (3 m, tiles along local x), `bollard`, `traffic-cone`, `jersey-barrier` (3 m), `sign-post` (blank board), `hay-bale`, `pumpkin`, `tent`, `water-tower` (8 m), `fuel-drum` |
| Steam-era farm (10 + 2 nodes) | `steam-tractor` (traction engine, 3.9 m, 3.5 m chimney), `thresher` (5.4 m, feed chute), `windmill` (9 m wooden tower) + `windmill-head` (four-blade rotor, attach-only), `hay-wagon`, `water-pump`, `split-rail-fence` (3 m), `crop-row` (2 m; variant 0 wheat, variant 1 pumpkins via node `crop-row@1`), `scarecrow`, `silo` (7 m, domed) |

The owner asked on 31 Oct for steam harvesting gear and farming in the old-timey dark world, with an almost-Minecraft vibe. The farm set uses blocky crops, chunky spoked wheels and slatted sails. The 1 m ore and dirt blocks were dropped because the dig draws its own blocks.

Measured on 31 Oct 2026 (Blender 5.2.0): **13,283 drawn triangles** (13,699 including 24 collision proxies), **3 materials**, **773,460 bytes**
(141 KB gzipped) and **52 drawn primitives (76 including proxies)**. The contract `kit` entry in `tools/rc/asset-contract.json` sets the budget: ≤40k triangles, ≤4 materials,
≤1.5 MB, **≤160 primitives** and a ≤45 × 12 × 80 m review-grid extent. The farm set pushed the primitive count past the earlier 64, so that cap was raised; the other caps did not need to move. The contract also lists all 49 node names, and `validate-assets.mjs` enforces it.

GLB structure, which the loader relies on:

- Each prop is a **top-level node named after the prop**: an empty at its ground contact (centre of the footprint, y = 0).
  In the .blend the props sit on a 10 m review grid. **The runtime ignores the top-level transform** and
  uses the geometry in prop-local space.
- Its drawn children are one mesh **per material**, named `<prop>__Kit_Paint|Kit_Metal|Kit_Wood`. Every exported mesh
  carries exactly one material because Blender 5.2's glTF exporter writes the active colour attribute only into the
  first primitive of a multi-material mesh. Later primitives came out pure white. A test guards this.
- One child `COL_<prop>`: an axis-aligned box or vertical cylinder in prop-local space, with glTF extras
  `{"collider": "box"|"cylinder"}`. It is never drawn.
- **Kit variants**: a node named `<prop>@<n>` replaces `<prop>` for items with `variant: n`. Such items are not palette-tinted.
  `crop-row@1` is the pumpkin row. Kit variants are not placeable names of their own.
- **Attachments**: a prop's extras `{"attach": {"prop": "windmill-head", "offset": [x, y, z]}}` place the attached node at that
  prop-local glTF offset whenever the parent is placed. The attached part has the same yaw and scale and no collision. `windmill-head` has its origin
  **on the axle**, not the ground. It spins about its local Z (the axle, pointing out of the tower's front), and has no `COL_`.
  The game turns every rotor in a placement with `handle.spin('windmill-head', radians)`, which costs one instance-matrix upload per call;
  each instance gets a fixed phase. The review page spins it every frame.
- Materials: `Kit_Paint` (rough 0.5), `Kit_Metal` (metal 0.85, rough 0.38) and `Kit_Wood` (rough 0.85; also concrete, hay,
  canvas and soil). Base colour is white; the colour is in `COLOR_0`. It is per-face albedo multiplied by a 12-ray ambient-occlusion
  term baked per vertex against the prop and a ground plane (no ground plane for attach-only parts), using the `bake_hero.py` approach.
- Front: Blender +Y, which becomes glTF/three **−Z**.

### Adding a prop

1. In `prop_kit.py`, write `def my_prop(p):` using the `Prop` helpers (`box`, `cyl`, `rod`, `strip`, `sphere`, `prism`,
   `poly`). Use only `PAINT`, `METAL` and `WOOD` with a colour from `C`. Keep z ≥ 0, ground contact at the origin, and front +Y.
   Return `(kind, centre, size)` for the collider in **Blender axes** (x, y forward, z up). Add a 4th element `{'attach': {...}}`
   for an attached part. Return `None` for an attach-only part, which gets no collider and no ground AO. Name a kit variant `'<prop>@<n>'`.
2. Append `('my-prop', my_prop)` to `PROPS`, then add `my-prop` and `COL_my-prop` to `required_nodes` of the `kit` contract
   entry. If needed, add a collision surface to `PROP_SURFACES` in `placements.js`; the default is concrete.
3. Rebuild and check:

   ```sh
   HEAVY_SLOT_LABEL=rc-kit heavy-slot -- /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/rc/blender/prop_kit.py
   node -e "const fs=require('fs'),z=require('zlib'),f='web/wwwroot/rc/assets/kit/props.glb';fs.writeFileSync(f+'.gz',z.gzipSync(fs.readFileSync(f),{level:6,mtime:0}))"
   node tools/rc/validate-assets.mjs web/wwwroot/rc/assets
   node --test web/wwwroot/rc/open-world/placements.test.mjs
   ```

   Update the node-count assertion in `placements.test.mjs` (25 top-level nodes today). Then look at the `kit` view of the review page (below).

## Placement file format (v1)

```json
{
  "version": 1,
  "name": "example-picnic-area",
  "kit": "kit/props.glb",
  "note": "optional free text",
  "palette": ["#ffffff", "#ff9e8c", "#8fb8ff"],
  "items": [
    {"prop": "bench", "pos": [-3057, null, -848], "yaw": 180, "scale": 1, "variant": 0, "collide": true}
  ]
}
```

- `pos` is in world metres in the three.js frame (+Y up). **`y: null` snaps** the ground contact to the ground. The
  order is a downward world raycast from 4 m above `elevationAt(x, z)`, then `elevationAt`, then 0. A number is used as
  given.
- `yaw` is in degrees about +Y, counter-clockwise seen from above (`Object3D.rotation.y`). At yaw 0 the front faces −Z;
  at yaw 90 it faces −X.
- `scale` is uniform, about the ground contact, in the range (0, 20]. `variant` indexes `palette` (default `DEFAULT_PALETTE`). The colour
  **multiplies** the prop's `Kit_Paint` parts; a prop without paint is tinted all over. Index 0 should be `#ffffff`.
- `collide` (default true) adds the prop's proxy to the collision world.
- Unknown keys are rejected so that typos such as `colide` fail loudly. There are at most 4,096 items. Defaults: yaw 0, scale 1, variant 0, collide true.

## How it is drawn: InstancedMesh, not BatchedMesh

The vendored three is **r160**. Its `BatchedMesh` (`vendor/three.module.js`, `class BatchedMesh`) has no
`addInstance()`. Every `addGeometry()` reserves a new vertex range and copies the geometry, and owns one matrix (the
`batchId` attribute indexes a matrix texture). It also has no per-instance colour, culls and sorts every geometry on the CPU each
frame, and without `WEBGL_multi_draw` falls back to one draw per range (`renderMultiDraw`). For 300 copies of a
dozen props that is the wrong trade. `InstancedMesh` shares the geometry, has `setColorAt` for variants, is culled as one
bounding sphere (r160 `Frustum.intersectsObject` uses `InstancedMesh.boundingSphere`) and casts shadows. So
`instantiatePlacements` builds **one InstancedMesh per (prop × material part)** present in the file. The draw-call count equals
the number of distinct props times their materials, whatever the item count. Revisit after a three upgrade past r166,
which adds `BatchedMesh.addInstance` and `setColorAt`; that could merge the meshes down to one per material.

Measured in-engine on 31 Oct 2026 on the worker (`remote-run`, ANGLE Metal / Apple M2, 1280×800, headless Chromium 1193), `evidence/rc-placements/web-check.json`:

| Scene | Items | Distinct props | Draw calls added (main pass) | Triangles | rAF p50 / p95 / max |
|---|---|---|---|---|---|
| example picnic area | 39 | 9 | **14** | 11,896 | 16.7 / 18.4 / 18.7 ms |
| example farmstead (rotor spinning) | 56 (+1 attached rotor) | 11 (13 templates) | **31** | 17,900 | 16.7 / 18.1 / 18.6 ms |
| stress, example ×8 | 312 | 9 | **14** | 95,168 | 16.7 / 18.1 / 18.7 ms |
| kit line-up (every ground prop + crop-row@1) | 24 | 23 | 52 | 13,283 | (not timed) |

"Added" is the main pass with and without the placements. three r160 resets `renderer.info` after the shadow pass, so each
shadow-casting light costs up to the same number of depth draws again. Frame time is vsync-bound at both sizes, so the
cost at this scale cannot be separated on an M2; it does not grow with item count. Screenshots in `evidence/rc-placements/`: `web-review.png` and `web-close.png` (picnic area),
`web-farmstead.png` and `web-farmstead-close.png`, `web-kit.png` and `web-stress.png`. The farmstead costs 31 draw calls because its props use
two or three materials each: 11 props, 13 templates and 31 material parts. Merging per material needs a newer three, as above.

## Collision

For `collide: true` items the `COL_` proxy is transformed by the item's yaw, scale and ground height. It becomes outward-wound
triangles (`colliderTriangles`): a box is 4 sides plus a top, and a cylinder is an 8-sided prism plus a top. A bottom is
added only when the proxy is lifted off the ground. They go to `world.addTri(a, b, c, surface)`, the same triangle API
`physics/world.mjs` and `stream.mjs` use for buildings. The test drives a buggy-sized sphere into a yawed jersey barrier
and raycasts at bumper height to prove the car cannot pass through. The example adds 714 collision triangles.

World triangles are **immutable**: `handle.dispose()` removes the meshes, but cannot take triangles out of a shared
world. For anything that unloads, add collision to a world that is discarded with it (see below).

## Authoring a placement

- **By hand**: edit the JSON. Check it with `node --test web/wwwroot/rc/open-world/placements.test.mjs`, which validates the
  example against the real kit, or call `validatePlacements(json, {props})`.
- **From Blender**: lay out empties in a collection, named after props (`bench`, `bench.001`, …). The Blender ground
  plane is the game's XZ: game (x, y, z) = Blender (x, z, −y), and rotation Z equals yaw. Optional custom properties are `variant`,
  `collide` and `snap` (default true, which writes `y: null`). Then:

  ```sh
  /Applications/Blender.app/Contents/MacOS/Blender --background venue.blend \
    --python tools/rc/blender/export_placements.py -- VenueCollection web/wwwroot/rc/assets/placements/my-venue.json my-venue
  ```

  To see the props while laying out, link or append the objects from `assets/rc/kit/props.blend` and parent each under its empty.
  The exporter reads only the empties. Smoke-tested on 31 Oct 2026: three empties exported and validated.
- An in-game `?edit=1` placement editor (§3.9.2) is the next step. It should write this same format.

### The example: where and why

`example-picnic-area.json` centres on **(-3048, -838)**, 62 m south of the residential skatepark start (`RESIDENTIAL_START`,
-3023, -777). It sits on the park lawn (`residential.json` green #2) in the infield of the Neighbourhood Run loop.
Distances from the nearest item, computed on 31 Oct 2026 against `assets/world/residential.json` and `RESIDENTIAL_RACE_POINTS`:

| Feature | Clearance |
|---|---|
| Path edge | 13.2 m |
| Racing line | 14.3 m |
| Tree | 15.8 m |
| Skatepark polygon | 25.1 m |
| School grounds | 41.3 m |
| Building | 44.2 m |

The skatepark hub is inside `RESIDENTIAL_BOUNDS`, as is everything near it. No `DISTRICT_ZONES` box (housing, BX,
school) or catalogue location is within 60 m. Every item uses `y: null`, so it follows the residential terrain once wired.

### The farmstead example: where and why

`example-farmstead.json` (56 items) sits in the **dark-world valley** (`open-world/spirit-mountain.mjs`, east valley, `valleyPoint(along, across)`).
It covers valley-frame along 560–590 and across −39 to −57, and its world centre is about **(2830.5, −3023.1)**. Items are stored as world metres, converted with
`valleyPoint` and present on this branch, so `placements.js` needs no valley frame. Yaws are the valley axis (−18.4° aligns a prop's
length along the valley).

The brief suggested along 440–530 and across ±40–150. On this branch's `mountainHeight` that rectangle is mostly bank, 10–45 m above the
floor, and up to about 140 m at across 150. The flat floor (within 1.5 m of the lake floor, y = 8) is along ≥ 520 and |across| ≤ 60. The farm
uses that floor strip on the negative-across side. The surrounding valley features are:

| Feature (valley frame) | Clearance from the farm |
|---|---|
| Town boxes (`TOWN`, along 538–618, across ±30) | ≥ 14.5 m |
| Dark-world corral (along 528, across −26) | outside the farm |
| Dark-world water tower (along 548, across +32) | outside the farm |
| Lake gate (along 532, across 0) | outside the farm |
| Street lamps (across ±8) | outside the farm |

The farm has a split-rail paddock (30 segments with a 6 m gate gap facing the town), a wheat field and a pumpkin field (8 rows each, `collide: false` so
the car drives through crops), a scarecrow between them, a windmill with its pump, a silo, and a thresher, hay wagon and steam tractor
in a line, plus two hay bales and a drum. All items use `y: null`; the floor is flat at 8 m across the whole layout.

## Wiring into runtime.js (for a later agent; not done here)

**Authored venues: one call at attach.** In `runtime.js` `attach(scene)`, after the stream and terrain exist:

```js
import {preparePlacementKit, loadPlacements, instantiatePlacements} from './placements.js';
const kit = await preparePlacementKit('kit/props.glb');
const data = await loadPlacements(new URL('../assets/placements/example-picnic-area.json', import.meta.url).href, {kit});
const heightAt = (x, z) => inResidential([x, 0, z]) ? residentialTerrain.heightAt(x, z) : elevationAt(elevation, x, z);
venue = instantiatePlacements(scene, data, {kit, world: stream.world, elevationAt: heightAt});
// on runtime dispose: venue.dispose()
```

`stream.world.addTri` writes to the permanent `authored` world, which is right for venues that never unload.

**Streamed tiles: one call per tile load.** Keep placement files per 256 m tile (for example
`assets/placements/tiles/<x>,<z>.json`; `stream.mjs` `SIZE`/`tileKey`). In the `createStream({onLoad, onDrop})` callbacks:

```js
onLoad(key, tile) {
  const data = placementsByTile.get(key); if (!data) return;
  const h = instantiatePlacements(scene, data, {kit, world: tile.placementsAdded ? null : tile.collision, ground: stream.world, elevationAt: heightAt});
  tile.placementsAdded = true; handles.set(key, h);
}
onDrop(key) { handles.get(key)?.dispose(); handles.delete(key); }
```

`tile.collision` is discarded with the tile. Tiles are cached and can be `onLoad`ed again, so the `placementsAdded` flag
stops the proxies being added twice. `ground: stream.world` snaps against the full world, terrain included. Preload the kit
before the first tile (`preparePlacementKit()` is cached). Seasonal layers (`season.mjs`) are just extra files loaded or
disposed the same way.

## Known limits (v1)

- No LOD and no distance culling beyond per-mesh frustum culling. A whole venue is one bounding sphere per mesh, so a large
  file spread over hundreds of metres is drawn whenever any part is on screen. Split large layouts per tile.
- The variant tint can only darken or shift toward the palette colour: it is a multiply, not a hue rotation.
- The farmstead adds 31 draw calls (above). A later three can merge them per material.
- The collision proxy is one box or cylinder per prop. The windmill's proxy is a solid 3 m box, and the water tower's proxy is a solid 3.9 m cylinder, so the car cannot
  drive between its legs. The sign post blocks between its posts.
- `validate-assets.mjs` counts `COL_` meshes in the triangle total, because it only skips the `COLLISION_` prefix; the cost is 416 triangles.
- The review page draws the example on a flat plane, so terrain snapping on the real residential ground is untested until wired.
