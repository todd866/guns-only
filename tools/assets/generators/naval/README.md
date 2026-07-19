# Naval asset specifications

[`../naval-assets.mjs`](../naval-assets.mjs) exports `buildNavalAssetSpecs(THREE)` for the shared deterministic GLB exporter. The module imports no renderer or exporter itself; callers inject the repository's pinned Three r160 namespace.

## Assets

| Asset | Output | Principal dimensions | Conservative budget |
| --- | --- | --- | --- |
| `platform.carrier.straight-deck.v1` | `models/naval/straight-deck-carrier.glb` | 266 m long, 31.5 m flight deck, 28.5 m waterline beam, 9.1 m draft | 12,000 rendered triangles, 24 draw calls, 8 materials, 4 MiB texture budget |
| `platform.escort.gun-destroyer.v1` | `models/naval/gun-destroyer-escort.glb` | 119 m long, 12.9 m beam, 4.6 m draft | 6,500 rendered triangles, 24 draw calls, 7 materials, 4 MiB texture budget |

Both assets use metres, `+Y` up, `-Z` forward/bow, and a right-handed coordinate system. Major custom surfaces carry UV0 and tangents. Each ship embeds deterministic 256 px weathered-paint and weather-deck base-colour/normal/ORM sets. Static components are consolidated by material while named recovery/identity meshes and instanced details remain separate; the reviewed exports are 14 primitives each. They contain emissive fixture geometry but no Three lights or cameras.

Carrier anchors:

- `deck.origin` → `SOCKET_DECK_ORIGIN` at `[0, 0.25, 0]`
- `recovery.threshold` → `SOCKET_RECOVERY_THRESHOLD` at `[0, 0.25, 102]`
- `bow.reference` → `SOCKET_BOW_REFERENCE` at `[0, -1.9, -133]`
- `wake.origin` → `SOCKET_WAKE_ORIGIN` at `[0, -17.2, 133]`

The destroyer exposes deck, formation, bow, and wake sockets using the same mechanical naming rule.

## Verify and export

```sh
node --test tools/assets/generators/naval/naval-assets.test.mjs
node tools/assets/generators/export-assets.mjs \
  --module tools/assets/generators/naval-assets.mjs --dry-run
```

The tests verify deterministic semantic structure, dimensions, orientation, features, anchors, finite geometry, and declared budgets. The shared exporter dry-run additionally produces each GLB in memory and reports its byte size, SHA-256, glTF triangle/material counts, sockets, and bounds without writing content files.
