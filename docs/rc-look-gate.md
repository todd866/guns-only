# RC look gate

Visual-regression gate for Saucer Springs RC. Six fixed views are rendered headless on the hardware
GPU, then compared with committed reference stills in `evidence/rc-look-ref/`.

**Rule: every graphics change ships with a before/after pair** rendered through this same pipeline
(not a hand-driven screenshot), plus the `compare` table in the commit or PR text. Local static-server
renders differ from production, so never compare a capture against a screenshot from anywhere else.

## Workflow

Run everything inside a heavy slot (the Mac is shared):

```sh
G="HEAVY_SLOT_LABEL=rc-look-gate heavy-slot -- node tools/rc/look-gate.cjs"
env $G capture ~/.local/state/rc-look-gate/before      # 1. before the change (or rely on the blessed ref)
# ... make the graphics change ...
env $G capture ~/.local/state/rc-look-gate/after       # 2. after
env $G compare ~/.local/state/rc-look-gate/after       # 3. numeric diff vs evidence/rc-look-ref
env $G compare ~/.local/state/rc-look-gate/after --ref ~/.local/state/rc-look-gate/before   # or vs your own before
env $G bless   ~/.local/state/rc-look-gate/after       # 4. an intended change: make it the new reference
```

(Equivalent without `env`: `HEAVY_SLOT_LABEL=rc-look-gate heavy-slot -- node tools/rc/look-gate.cjs capture <dir> [view...]`.)
Commit the blessed stills with the change, look at both PNGs yourself (light and dark where the
change touches them), and say what moved. A pass means "nothing moved more than same-build noise",
not "it looks good".

Options: `capture ... <view>...` renders only named views; `--allow-software` permits SwiftShader/llvmpipe
(refused otherwise, and such captures must not be blessed); `compare --mode fail` exits 1 on any exceeded
limit or missing reference (the default `warn` mode, set in `tools/rc/look-thresholds.json`, always exits 0).

## Views and camera placement

`tools/rc/look-views.json`: skatepark-hub, skatepark-bowl, housing-street, housing-corner, bx-apron,
desert-mountain (Spirit Mountain on the far horizon). `main.js` has no free-camera hook, so each view
uses `window.__gunsOnlyRC.place(pos, yaw)` to teleport the car (y is snapped to the ground with a
down-raycast on `collision()`), waits for streaming (`snapshot().world.ready`) and for the chase camera
to stop moving, then pauses via `#pause` and hides every DOM element except the canvas, so the still is
the world only. Pitch and distance come from the chase rig and cannot be set. The camera pose actually
reached is recorded in `capture.json`. Frame statistics are taken after the still, with the sim running.

## What `capture` writes

`<view>.png` (1280x800, DPR 1) and `capture.json`: GPU string, per-view camera pose, frame-time
p50/p95/p99/max over 300 rAF samples, draw calls (`renderer().calls`), pixel ratio, page errors.
Frame times are headless and indicative only; compare like with like, on the same Mac.

## What `compare` prints

Per view, reusing `tools/look-gate/features.mjs` (needs `pngjs`: `npm ci --prefix tools/look-gate`):

| column | meaning |
|---|---|
| palette | warm/cool ratio, ground and sky Lab-b, saturation and its histogram (flight look-gate `paletteDistance`) |
| struct | ground edge energy, Laplacian and spatial variance in log space (`structureDistance`) |
| pixMAD | mean absolute sRGB difference (0-255) at 64x40; catches moved or recoloured things |
| edgeR | ground edge energy, capture / reference; below 1 means detail was lost |

Limits are in `tools/rc/look-thresholds.json` (`default`, overridable per view). They were set from
the distances between two captures of the same build, with headroom. Re-measure (capture twice, compare
the pair) after changing views, resolution or the gate itself.
