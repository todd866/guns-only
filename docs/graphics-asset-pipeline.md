# Graphics asset pipeline

Guns Only treats graphics as versioned content, not renderer constants. Artists produce glTF assets, the content manifests bind stable IDs to those assets, validation proves the pack is internally consistent, and staging copies only the validated runtime closure into the web app.

The manifest validator and built-in glTF inspector use only Node.js built-ins. Blender, glTF Transform, and `toktx` are optional authoring tools; they are never runtime dependencies.

## Source of truth

The canonical contracts are:

- `content/schemas/content-pack.schema.json`
- `content/schemas/visual-profile.schema.json`
- `content/schemas/asset-manifest.schema.json`
- `content/schemas/asset-license-set.schema.json`

The starter pack is `content/packs/korea-1950s/pack.json`. Its links form this closure:

```text
pack.json
├── visual-profile.json
│   └── asset-manifest.json
└── licenses.json
```

## First generated Korea placeholder set

The starter pack ships a complete, contract-valid visual slice for integration and testing. Every
current asset is deliberately marked `status: "placeholder"`: the generated geometry, materials,
environment, and effects exercise the real IDs, LODs, budgets, licences, sockets, and runtime paths,
but have not passed production art review. `placeholder` is a maturity label, not a request to invent
extra scenery; the renderer may load it through the authored path while product code decides whether
that visual helps the current pilot task. Promote assets individually to `production` only after a
visual review against an explicit user problem.

| Asset | Runtime representation | Detail strategy |
| --- | --- | --- |
| Player naval jet | self-contained GLB | three authored LODs at 180 / 48 / 0 projected pixels; UV/tangent close LODs, embedded panel PBR maps, and generic insignia decals |
| Bandit swept-wing jet | self-contained GLB | three authored LODs with a deliberately different silhouette, livery, and weathered natural-metal PBR response |
| First-person cockpit | self-contained GLB | analogue gauge atlas, worn-panel PBR maps, gunsight, controls, canopy frame, eight semantic sockets, and 16 consolidated primitives |
| Straight-deck carrier | self-contained GLB | real-scale deck, island, recovery markings, weathered hull/deck maps, 14 static/instanced primitives, lights, and wake socket |
| Gun destroyer escort | self-contained GLB | real-scale hull, bridge, weathered PBR maps, 14 static/instanced primitives, gun mounts, torpedoes, depth charges, and wake socket |
| Ocean / atmosphere | material profiles plus seeded PNG maps | scrolling wave normals, crest foam, haze, sun disc, and quality-tier cloud shells |
| Gun / impact / destruction / wake | data profile plus pooled Three runtime | deterministic seeded particles and mobile / balanced / desktop tiers |

The placeholder GLBs are code-authored with the pinned Three r160 exporter so the integration set can be rebuilt offline and reviewed immediately. Their deterministic source includes topology, UV layout, tangent generation, compact base-colour/normal/packed-ORM maps, decals, instrument faces, and static material batching. Embedded PNGs keep the files self-contained; the optional production optimization step can transcode them to KTX2 once the pinned offline tools are installed. Later Blender or externally licensed replacements can retain the same asset IDs, coordinate frame, LOD thresholds, material vocabulary, and anchor contracts, so gameplay and the platform/session layer do not need to change.

Regenerate the current set with the exact commands in `tools/assets/README.md`. Use the browser labs below for visual review after staging:

```text
web/wwwroot/asset-lab/        aircraft, cockpit, ship, LOD and socket inspection
web/wwwroot/environment-lab/  ocean, atmosphere, cloud and quality-tier inspection
web/wwwroot/effects-lab/      gun, impact, destruction, wake and particle-tier inspection
```

Serve `web/wwwroot` from a local HTTP server; ESM modules and GLB loading do not work reliably from `file:` URLs.

## Live production path

The production flight view now consumes the same staged pack that the labs inspect. The simulation
snapshot projects stable pack, profile, entity, and presentation IDs; `PresentationAssetManager`
loads that exact pack, resolves each binding, and exposes the selected visual profile to the shared
renderer runtime. Pack replacement is epoch-guarded, so a late GLB or profile load cannot overwrite
a newer session selection.

The render-only layers remain deliberately separate:

- `render/assets/` owns manifest resolution, LOD hysteresis, cloning, caching, semantic anchors,
  fallbacks, and GPU cleanup;
- `render/visual/` owns the profile-normalized color pipeline, HDR/post stack, quality tier,
  adaptive resolution, and stabilized directional shadows;
- `render/presentation/` owns bounded head motion, the collimated period sight, the honest distant
  contact, and optional carrier-relative escort placement;
- `render/environment/` and `render/effects/` own world-anchored clouds, ocean/sky presentation,
  pooled damage smoke, gun effects, and fog integration.

The simulation never receives renderer scale, cloud, camera, particle, or post-processing state.
Aircraft models remain at real scale; the 8–14 px distant contact is a separate depth-tested
presentation object. This preserves gunnery geometry and keeps future packs replaceable.

Desktop uses a linear HDR target, restrained threshold bloom, SMAA, and one final ACES/sRGB output
pass. Balanced uses FXAA without bloom. Mobile renders directly. Adaptive pixel ratio and profile
caps protect frame time without changing authoritative time, geometry, or visibility truth.

Run the gate before and after every asset change:

```sh
node tools/assets/validate-manifests.mjs --strict \
  --pack content/packs/korea-1950s/pack.json
node --test tools/assets/test/*.test.mjs
```

Validation covers the JSON schemas plus semantics that JSON Schema cannot prove alone: safe canonical paths, cross-file IDs, actual files and optional hashes/sizes, license scope and redistribution, referenced asset IDs, required anchors, GLB node names, geometry budgets, LOD ordering, and staged-file containment.

## Authoring layout and coordinates

Keep editable sources separate from the shipped pack. A practical layout is:

```text
art/aircraft/sabre-fury/sabre-fury.blend
content/packs/korea-1950s/models/sabre-fury/lod0.glb
content/packs/korea-1950s/models/sabre-fury/lod1.glb
content/packs/korea-1950s/models/sabre-fury/lod2.glb
```

Use these scene conventions:

- Model in metres at real-world scale. Set Blender units to Metric with scale `1.0`.
- Runtime coordinates are right-handed, `+Y` up and `-Z` forward. Blender remains `+Z` up; the glTF exporter performs the Y-up conversion.
- Put the vehicle origin on its stable motion pivot, near centre of mass. Put a carrier origin at the declared deck origin, not at an arbitrary mesh corner.
- Apply scale before export. Negative scale is rejected because it creates winding, tangent, and normal ambiguity.
- Use unique, descriptive object and material names. Cameras and lights belong to the runtime profile and are excluded from GLB assets.
- Prefer a small PBR material set over many nearly identical materials. Every primitive/material split is normally another draw call.
- Name authoring collections explicitly, for example `SABRE_LOD0`, `SABRE_LOD1`, and `SABRE_LOD2`, so each LOD can be exported independently.

The bundled Blender automation validates these rules, exports the requested collection or saved selection, applies modifiers by default, retains tangents and custom properties, converts to Y-up metres, and disables camera/light export.

```sh
node tools/assets/build-assets.mjs export --dry-run \
  --source art/aircraft/sabre-fury/sabre-fury.blend \
  --collection SABRE_LOD0 \
  --output build/sabre-fury/lod0.raw.glb

node tools/assets/build-assets.mjs export --check \
  --source art/aircraft/sabre-fury/sabre-fury.blend \
  --collection SABRE_LOD0 \
  --output build/sabre-fury/lod0.raw.glb
```

`--dry-run` prints the exact command without requiring external tools. `--check` also probes the executable and fails if a wrapper or installation is broken. Pass `--blender /absolute/path/to/blender` when auto-detection is not appropriate.

## Anchors and sockets

Anchors are stable gameplay/presentation interfaces. Add Blender Empty objects at the required transforms and use the mechanical mapping below:

```text
camera.cockpit      → SOCKET_CAMERA_COCKPIT
muzzle.left         → SOCKET_MUZZLE_LEFT
muzzle.right        → SOCKET_MUZZLE_RIGHT
deck.origin         → SOCKET_DECK_ORIGIN
recovery.threshold  → SOCKET_RECOVERY_THRESHOLD
```

Declare the mapping in the asset's `anchors`, then list the semantic IDs in a visual binding's `requiredAnchors`. For every authored model LOD, validation opens the GLB and confirms the concrete node exists. Fallback-only procedural assets declare the future contract, but skip the physical-node check until an authored model replaces the fallback.

Do not move or rename a published socket casually. A mesh can be revised without changing its asset ID only when its external anchor contract remains compatible.

## LOD and budget construction

Create topology intentionally for each silhouette range; automatic decimation is a starting point, not a finished LOD. Preserve wings, tail, canopy, intakes, and gun/engine cues before small panel details. Bake high-frequency surface detail into textures rather than carrying it into distant geometry.

An authored model uses `lods`, ordered from highest to lowest detail. Levels must start at `0` and be sequential, `minProjectedPixels` must strictly decrease, and the final LOD threshold must be `0`. A useful first budget for a fighter is:

| LOD | Minimum projected pixels | Triangles | Draw calls | Materials | Texture memory | Max dimension |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 0 | 180 | 40,000 | 8 | 8 | 64 MiB | 4096 |
| 1 | 48 | 12,000 | 6 | 6 | 24 MiB | 2048 |
| 2 | 0 | 2,500 | 3 | 3 | 8 MiB | 1024 |

These are starting targets, not hidden validator constants. The budgets declared on each LOD are authoritative. The validator reads actual glTF primitive, triangle, vertex, and material counts and fails when measurable budgets are exceeded. Texture-memory and maximum-dimension declarations remain explicit review gates because GPU memory depends on the chosen transcode format and target hardware.

Inspect raw and optimized files without any third-party package:

```sh
node tools/assets/build-assets.mjs inspect --builtin \
  --source build/sabre-fury/lod0.raw.glb
```

The JSON report includes nodes, sockets, meshes, primitives, triangles, vertices, UV0/tangent primitive coverage, textured/normal-mapped material counts, textures, cameras/lights, external URIs, KTX2 images, and Meshopt/Draco extension use.

## Texture and optimization pass

Author linear data maps (normal, roughness, metallic, occlusion) as non-colour data and colour textures as sRGB. Pack compatible greyscale channels where the material contract permits it. Keep decals and readable markings in a dedicated atlas when they need a different texel density.

The deterministic code-authored assets embed PNG first so generation requires no native package and remains byte-reproducible in the Node gate. For a production release build, transcode those payloads to KTX2/Basis: UASTC suits normal maps and sharp high-frequency data; ETC1S is usually smaller for base colour and low-frequency masks. Keep the reviewed PNG GLBs as deterministic source/fallback artifacts until the pinned transcode path is available in CI. Meshopt is the supported geometry compression target because it is designed for efficient transmission and GPU-friendly decode. The shipped browser loader has no Draco decoder, so the build command rejects `--compress draco` instead of producing an asset the game cannot load.

glTF Transform is invoked as a separate executable, so the repository does not gain an npm dependency:

```sh
node tools/assets/build-assets.mjs optimize --dry-run \
  --source build/sabre-fury/lod0.raw.glb \
  --output content/packs/korea-1950s/models/sabre-fury/lod0.glb \
  --compress meshopt --texture-compress ktx2 --texture-size 4096
```

Executing KTX2 compression also requires a working `toktx` installation discoverable by glTF Transform. Use `--gltf-transform /absolute/path/to/gltf-transform` when it is not on `PATH`. The combined command retains the raw intermediate for visual comparison:

```sh
node tools/assets/build-assets.mjs pipeline --dry-run \
  --source art/aircraft/sabre-fury/sabre-fury.blend \
  --collection SABRE_LOD0 \
  --intermediate build/sabre-fury/lod0.raw.glb \
  --output content/packs/korea-1950s/models/sabre-fury/lod0.glb
```

After optimization, compare silhouettes, normals, alpha edges, decals, sockets, animation clips, and material response in the actual game camera. A smaller file is not a successful build if it damages target recognition.

## Manifest and license update

For a model, put final runtime GLB references in `lods[].source`; do not put model geometry in the general `sources` array. Record `format`, optional media type, byte size, and SHA-256. The validator recomputes any declared `sizeBytes` and `sha256` rather than trusting metadata.

Every asset has a `licenseRef`. Its entry in `licenses.json` must:

- use an explicit SPDX expression;
- identify authors, copyright, source, attribution, and evidence;
- state redistribution, commercial-use, modification, share-alike, and notice terms;
- list either the asset ID or every shipped source/fallback URI in `appliesTo`.

Do not merge an imported asset with `NOASSERTION`, a source-page guess, or a license entry copied from an unrelated file. Keep receipts or permission records in a durable repository location and reference them from `evidence`.

## Staging into the web app

Authoring lives under `content/`; the Blazor shell serves files under `web/wwwroot`. Staging validates the pack strictly before it writes anything and preserves pack-relative paths:

```text
web/wwwroot/content/
├── schemas/
│   └── *.schema.json
└── packs/
    └── korea-1950s/
        ├── pack.json
        ├── visual-profile.json
        ├── asset-manifest.json
        ├── licenses.json
        └── models/...
```

Because `pack.json` remains two directories below `schemas`, its canonical `$schema: "../../schemas/..."` reference works in both authoring and staged layouts.

```sh
node tools/assets/build-assets.mjs stage --dry-run \
  --pack content/packs/korea-1950s/pack.json \
  --output web/wwwroot/content

node tools/assets/build-assets.mjs stage \
  --pack content/packs/korea-1950s/pack.json \
  --output web/wwwroot/content
```

Staging copies only the validated runtime closure and all canonical schemas. Files are installed through temporary sibling directories and renamed into place. An identical stage is a no-op; a differing existing target requires explicit `--replace`. The command never rewrites authoring manifests and never injects timestamps, so repeated builds from identical inputs are byte-for-byte stable.

The stage command only publishes content; the running renderer switches packs from the IDs and URI
projected by the session snapshot. The Korea shell currently maps its projected pack ID to
`content/packs/korea-1950s/pack.json`, validates every projected profile/manifest identity, and then
constructs the shared visual runtime from the loaded profile object. Adding another pack therefore
requires a staged URL mapping (or an explicit projected URI), not renderer constants or a gameplay
branch.

## Definition of done for an asset

An asset is ready when:

1. Blender validation/export succeeds with applied scale, correct units, no cameras/lights, and all socket Empties present.
2. The optimized GLB is visually compared with the raw GLB and inspected for budgets/extensions.
3. Every LOD, source URI, hash/size, anchor, binding, and license entry is present.
4. `validate-manifests.mjs --strict` and the Node test suite pass.
5. A stage dry-run shows only the expected files, followed by a successful atomic stage.
6. The asset is tested at near, identification, and minimum-readable ranges on the lowest supported quality tier.
