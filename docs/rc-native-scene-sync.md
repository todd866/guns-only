# Native renderer: the scene-sync boundary

Design note, 31 October 2026 (audit section 3.6). Decision-oriented; one page.

## Where we are

`native/saucer-springs` is two programs in one bundle:

- `Game.swift`: a `WKWebView` serving the packaged web build under `rcgame://`. This is the
  app the owner plays. Every feature, menu, HUD and sound comes from the web build, so the app
  and guns-only.com/rc never drift (parity rule).
- `main.swift` + `Shaders.metal`: a Metal viewer that loads a static `RCW2` export of the world
  (`tools/rc/native/export-world.cjs` drives the browser build once and dumps the scene) and
  draws it with raster visibility, ray-traced sun shadows and AO, TAA and bloom. Nothing in it
  moves: no cars, rivals, pickups, lights, UI, day/night, streaming or characters.

`WATER-AND-LIGHTING.md` plans FFT water, ReSTIR DI, DDGI and ReSTIR GI/PT on top of the viewer.
None of that can ship until the viewer draws the live game, and the parity rule says the web
build stays the game logic. The missing piece is therefore **scene synchronisation**, not
lighting.

## The boundary

The web game keeps authority over everything: physics, AI, state, UI, audio, streaming
decisions. The native renderer is a dumb, fast drawer of what the web game says exists this
frame. Three channels:

| Channel | Direction | Content | Rate |
| --- | --- | --- | --- |
| Static world | web → native, once per tile load/drop | tile id, merged geometry buffers (positions, normals, colours, uvs, material ids) exactly as the RCW2 export already serialises them, plus district/hero GLB instances by asset id | on stream events |
| Dynamic instances | web → native, every frame | a flat table: instance id, asset id or kit prop id, 4×3 transform, material variant, emissive/paint state, skinned pose (bone matrices) for characters | 60 Hz |
| Camera, sun, time | web → native, every frame | view/projection, sun direction and colour, day fraction, fog profile, pixel-ratio hint | 60 Hz |

Native → web carries only measurements: per-pass GPU timestamps and the frame-time profile,
so the web's adaptive-resolution policy and telemetry stay the single source of truth.

UI stays HTML in the `WKWebView`, composited above the Metal layer with a transparent web view
background; the web canvas is hidden when the native drawer is active.

## Transport

- Control and static-world messages: `WKScriptMessageHandler` with `ArrayBuffer` payloads
  (`postMessage` of typed arrays is zero-copy enough for tile loads, which are rare).
- Per-frame tables: a `SharedArrayBuffer` is not available to a `WKWebView` page without
  cross-origin isolation headers, which `rcgame://` can set (COOP/COEP on the scheme handler).
  If that proves unreliable, fall back to `postMessage` of one `Float32Array` per frame;
  at 2,000 instances × 16 floats that is 128 KB per frame, well inside what `postMessage`
  moves at 60 Hz on an M-series Mac. Measure before choosing.
- Asset identity: the native side preloads the same GLBs from the bundle (it already has the
  files) and the asset manifest ids are the shared vocabulary; the web side never sends mesh
  data for manifest assets, only instance tables.

## What the web side must expose

A `renderer bridge` module in the web build (new file, no change to game logic) that, when
`window.__nativeRenderer` is present, walks the Three scene each frame and emits the instance
table instead of calling `renderer.render`. It needs stable instance ids: today tile meshes
are rebuilt per tile and props are merged into buckets, so the bridge sends tiles as static
chunks and only cars, rivals, pickups, characters, lights and effects as dynamic instances.
BatchedMesh adoption (audit 3.4.7) makes this cleaner because it already names instances.

## Order of work and gates

1. Scene-sync prototype with the car, rivals and streamed tiles only; measure the message cost
   and the app frame gate (`tools/rc/native/check-app-frames.sh`, p95 ≤ 33 ms) against Chrome
   in the same minute. Gate: the app plays the real game through the Metal drawer at least as
   smoothly as the web canvas.
2. Characters (skinned pose table) and lights, so the dark world's dinosaurs and night scenes
   draw natively.
3. Per-pass GPU timestamps, then ReSTIR DI for the night scenes, then the water plan.

If step 1 is not affordable this month, the Metal program is parked and the budget goes to
the web renderer (audit 3.4), which improves the app immediately because the app is the web
renderer today.
