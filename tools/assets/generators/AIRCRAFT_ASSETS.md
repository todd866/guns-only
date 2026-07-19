# Korea aircraft asset set

`aircraft-assets.mjs` is the deterministic, code-authored source for the first Korea aircraft set. It accepts the caller's Three namespace and returns scene specifications; `export-assets.mjs` owns GLB serialization, hashing, inspection, and atomic writes.

## Coordinate contract

- Units: metres
- Handedness: right-handed
- Up: `+Y`
- Forward: `-Z`
- Right/starboard: `+X`
- Exterior origin: near aircraft centre of mass
- Cockpit origin: identical player-aircraft frame, so cockpit and exterior effect sockets coincide
- Runtime cameras and lights: none; camera entries below are named empty transform nodes

## Assets and LODs

| Asset ID | Role | Output | LOD | Projected-pixel threshold | Triangles | Draw calls | Materials | Render bounds (X × Y × Z m) |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| `vehicle.player.sabre-fury.v1` | Player exterior | `models/player-swept-jet/lod0.glb` | 0 | 180 | 8,400 | 23 | 8 | 11.300 × 3.920 × 12.020 |
| `vehicle.player.sabre-fury.v1` | Player exterior | `models/player-swept-jet/lod1.glb` | 1 | 48 | 3,332 | 16 | 6 | 11.160 × 3.920 × 11.731 |
| `vehicle.player.sabre-fury.v1` | Player exterior | `models/player-swept-jet/lod2.glb` | 2 | 0 | 918 | 9 | 4 | 11.160 × 3.899 × 11.735 |
| `vehicle.bandit.swept-wing.v1` | Bandit exterior | `models/bandit-swept-jet/lod0.glb` | 0 | 180 | 6,094 | 18 | 5 | 10.040 × 3.750 × 10.610 |
| `vehicle.bandit.swept-wing.v1` | Bandit exterior | `models/bandit-swept-jet/lod1.glb` | 1 | 48 | 2,334 | 15 | 5 | 10.040 × 3.744 × 10.315 |
| `vehicle.bandit.swept-wing.v1` | Bandit exterior | `models/bandit-swept-jet/lod2.glb` | 2 | 0 | 870 | 9 | 4 | 10.040 × 3.729 × 10.315 |
| `cockpit.player.sabre-fury.v1` | First-person cockpit | `models/player-cockpit/lod0.glb` | 0 | 0 | 3,230 | 16 | 11 | 1.483 × 1.694 × 3.082 |

The player design envelope is 11.88 m long, 11.16 m span, and 3.98 m high. The bandit design envelope is 10.46 m long, 10.04 m span, and 3.68 m high. The render bounds include authored probes, lights, and nozzle overhangs at LOD 0, so they intentionally differ slightly from those design dimensions. The cockpit occupies roughly 1.4 m width, 3.2 m longitudinal space, and 1.95 m height in the shared player-aircraft frame.

The exteriors preserve their primary silhouette and all anchors at every LOD. LOD 0 contains close-range fairings, lights, probes, markings, UV0/tangents, and embedded 256 px PBR maps; LOD 1 retains recognition shapes, glass, and 128 px maps; LOD 2 reduces both aircraft below 1,000 triangles and remains texture-free while retaining the distinct low-tail player silhouette and high-tail bandit silhouette.

## Named anchors

Positions are local metres in the shared coordinate frame.

### Player exterior

| Semantic ID | GLB node | Position (X, Y, Z) |
| --- | --- | --- |
| `camera.cockpit` | `SOCKET_CAMERA_COCKPIT` | `0.00, 1.68, -1.18` |
| `muzzle.left` | `SOCKET_MUZZLE_LEFT` | `-0.36, 0.15, -6.08` |
| `muzzle.right` | `SOCKET_MUZZLE_RIGHT` | `0.36, 0.15, -6.08` |
| `gear.nose` | `SOCKET_GEAR_NOSE` | `0.00, -0.56, -3.88` |
| `gear.left` | `SOCKET_GEAR_LEFT` | `-1.82, 0.04, 0.22` |
| `gear.right` | `SOCKET_GEAR_RIGHT` | `1.82, 0.04, 0.22` |

### Bandit exterior

| Semantic ID | GLB node | Position (X, Y, Z) |
| --- | --- | --- |
| `camera.cockpit` | `SOCKET_CAMERA_COCKPIT` | `0.00, 1.22, -0.84` |
| `muzzle.left` | `SOCKET_MUZZLE_LEFT` | `-0.42, 0.02, -4.87` |
| `muzzle.right` | `SOCKET_MUZZLE_RIGHT` | `0.42, 0.02, -4.87` |
| `damage.center` | `SOCKET_DAMAGE_CENTER` | `0.00, 0.38, -0.10` |

### Player cockpit

| Semantic ID | GLB node | Position (X, Y, Z) |
| --- | --- | --- |
| `camera.cockpit` | `SOCKET_CAMERA_COCKPIT` | `0.00, 1.68, -1.18` |
| `gunsight.origin` | `SOCKET_GUNSIGHT_ORIGIN` | `0.00, 1.72, -2.28` |
| `instrument-panel.origin` | `SOCKET_INSTRUMENT_PANEL_ORIGIN` | `0.00, 1.02, -2.34` |
| `control.stick` | `SOCKET_CONTROL_STICK` | `0.00, 0.90, -1.24` |
| `control.throttle` | `SOCKET_CONTROL_THROTTLE` | `-0.48, 1.02, -1.08` |
| `canopy.hinge` | `SOCKET_CANOPY_HINGE` | `0.00, 1.47, 0.22`; local Z rotation `+90°` |
| `muzzle.left` | `SOCKET_MUZZLE_LEFT` | `-0.36, 0.15, -6.08` |
| `muzzle.right` | `SOCKET_MUZZLE_RIGHT` | `0.36, 0.15, -6.08` |

## Material vocabulary

Player exterior materials are `PLAYER_NAVY_ENAMEL`, `PLAYER_BRUSHED_ALLOY`, `PLAYER_INTAKE_EXHAUST`, `PLAYER_SQUADRON_MARKING`, `PLAYER_CANOPY_GLASS`, `PLAYER_PORT_NAV_LIGHT`, `PLAYER_STARBOARD_NAV_LIGHT`, and the close-LOD `PLAYER_WING_INSIGNIA_DECAL`. The navy and alloy slots share deterministic base-colour, tangent-space normal, and packed occlusion/roughness/metalness maps. Lower LODs remove the lights and decal, then glass and textures.

Bandit materials are `BANDIT_NATURAL_METAL`, `BANDIT_INTAKE_EXHAUST`, `BANDIT_IDENTIFICATION_RED`, `BANDIT_PANEL_CHARCOAL`, and `BANDIT_CANOPY_GLASS`. Natural metal has its own deterministic panel/weathering PBR set on LODs 0 and 1. LOD 2 removes glass and textures while keeping the recognition colours.

Cockpit materials are `COCKPIT_DARK_TUB`, `COCKPIT_INSTRUMENT_PANEL`, `COCKPIT_SIDE_CONSOLE`, `COCKPIT_GAUGE_FACE`, `COCKPIT_GAUGE_NEEDLE`, `COCKPIT_SEAT_LEATHER`, `COCKPIT_HARNESS_WEBBING`, `COCKPIT_SAFETY_RED`, `COCKPIT_WORN_METAL`, `COCKPIT_WARNING_LAMP`, and `COCKPIT_OPTICAL_GLASS`. Tub, panel, console, and worn metal share a deterministic 256 px worn-panel PBR set; gauge faces use an embedded 256 px analogue dial atlas. Static geometry is consolidated by material while controls and optical glass stay separate, reducing the exported cockpit from 58 to 16 primitives.

All bitmap payloads are generated in memory by `pbr-textures.mjs` and embedded as PNG buffer views in each GLB. `node-image-canvas.mjs` is a deliberately small deterministic DataTexture-to-PNG adapter for the pinned Three exporter; no browser canvas, native package, network fetch, or external texture URI is involved.

## Generate and verify

From the repository root:

```sh
node tools/assets/generators/export-assets.mjs \
  --module tools/assets/generators/aircraft-assets.mjs

node --test tools/assets/test/aircraft-assets.test.mjs
```

The test builds every scene, validates finite geometry and index ranges, checks all anchors in every LOD, enforces budgets and LOD reduction, exports twice through the official wrapper, and compares the resulting GLBs byte-for-byte. `aircraft-assets.metrics.json` records the reviewed export metrics and SHA-256 hashes.

## Manifest integration boundary

This generator does not alter pack manifests, profiles, or licenses. Integration should register the three asset IDs, list the LOD outputs and thresholds above, bind the cockpit separately from the external player model, declare the named anchors, add generator provenance/licensing, and stage all seven GLBs. Until that integration lands, the files are deliberately authored but unreferenced pack content.
