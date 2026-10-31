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
| Example | `web/wwwroot/rc/assets/placements/example-picnic-area.json` (39 items) |
| Blender layout → JSON | `tools/rc/blender/export_placements.py` |
| In-engine review | `web/wwwroot/rc/placements-review.html`, `tools/rc/check-placements.cjs` → `evidence/rc-placements/` |

## The kit

There are fourteen original toy-style props at **real scale**. The world is real-sized and the car is a 0.42 m RC buggy. The props are: `picnic-table`, `bench`, `bin`, `street-lamp`,
`chain-link-fence-panel` (3 m, tiles along local x), `bollard`, `traffic-cone`, `jersey-barrier` (3 m),
`sign-post` (blank board), `hay-bale`, `pumpkin`, `tent`, `water-tower` (8 m) and `fuel-drum`.

Measured on 31 Oct 2026 (Blender 5.2.0): **4,783 drawn triangles** (5,063 including the 14 collision proxies), **3 materials**, **271,624 bytes**
(53.6 KB gzipped), 24 drawn primitives. The contract `kit` entry in `tools/rc/asset-contract.json` sets the budget: ≤40k triangles, ≤4 materials,
≤1.5 MB, ≤64 primitives, and all 28 node names. `validate-assets.mjs` enforces it.

GLB structure, which the loader relies on:

- Each prop is a **top-level node named after the prop**: an empty at its ground contact (centre of the footprint, y = 0).
  In the .blend the props sit on a 10 m review grid. **The runtime ignores the top-level transform** and
  uses the geometry in prop-local space.
- Its drawn children are one mesh **per material**, named `<prop>__Kit_Paint|Kit_Metal|Kit_Wood`. Every exported mesh
  carries exactly one material because Blender 5.2's glTF exporter writes the active colour attribute only into the
  first primitive of a multi-material mesh. Later primitives came out pure white. A test guards this.
- One child `COL_<prop>`: an axis-aligned box or vertical cylinder in prop-local space, with glTF extras
  `{"collider": "box"|"cylinder"}`. It is never drawn.
- Materials: `Kit_Paint` (rough 0.5), `Kit_Metal` (metal 0.85, rough 0.38) and `Kit_Wood` (rough 0.85; also concrete, hay
  and canvas). Base colour is white; the colour is in `COLOR_0`. It is per-face albedo multiplied by a 12-ray ambient-occlusion
  term baked per vertex against the prop and a ground plane, using the `bake_hero.py` approach.
- Front: Blender +Y, which becomes glTF/three **−Z**.

### Adding a prop

1. In `prop_kit.py`, write `def my_prop(p):` using the `Prop` helpers (`box`, `cyl`, `rod`, `strip`, `sphere`, `prism`,
   `poly`). Use only `PAINT`, `METAL` and `WOOD` with a colour from `C`. Keep z ≥ 0, ground contact at the origin, and front +Y.
   Return `(kind, centre, size)` for the collider in **Blender axes** (x, y forward, z up).
2. Append `('my-prop', my_prop)` to `PROPS`, then add `my-prop` and `COL_my-prop` to `required_nodes` of the `kit` contract
   entry. If needed, add a collision surface to `PROP_SURFACES` in `placements.js`; the default is concrete.
3. Rebuild and check:

   ```sh
   HEAVY_SLOT_LABEL=rc-kit heavy-slot -- /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/rc/blender/prop_kit.py
   node -e "const fs=require('fs'),z=require('zlib'),f='web/wwwroot/rc/assets/kit/props.glb';fs.writeFileSync(f+'.gz',z.gzipSync(fs.readFileSync(f),{level:6,mtime:0}))"
   node tools/rc/validate-assets.mjs web/wwwroot/rc/assets
   node --test web/wwwroot/rc/open-world/placements.test.mjs
   ```

   Check that the test asserting fourteen props still matches the new count. Then look at the `kit` view of the review page (below).

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
| example picnic area | 39 | 9 | **14** | 11,896 | 16.7 / 18.0 / 18.6 ms |
| stress, example ×8 | 312 | 9 | **14** | 95,168 | 16.7 / 17.9 / 18.6 ms |
| kit line-up | 14 | 14 | 24 | 4,783 | (not timed) |

"Added" is the main pass with and without the placements. three r160 resets `renderer.info` after the shadow pass, so each
shadow-casting light costs up to the same number of depth draws again. Frame time is vsync-bound at both sizes, so the
cost at this scale cannot be separated on an M2; it does not grow with item count. Screenshots: `web-review.png`
(overview), `web-close.png`, `web-kit.png` and `web-stress.png` in `evidence/rc-placements/`.

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
- The collision proxy is one box or cylinder per prop. The water tower's proxy is a solid 3.9 m cylinder, so the car cannot
  drive between its legs. The sign post blocks between its posts.
- `validate-assets.mjs` counts `COL_` meshes in the triangle total, because it only skips the `COLLISION_` prefix; the cost is 280 triangles.
- The review page draws the example on a flat plane, so terrain snapping on the real residential ground is untested until wired.
