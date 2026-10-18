# RC reference, asset pipeline and acceptance

## Current evidence boundary

The prototype is not visually accepted and does not establish Re-Volt gameplay parity. The previous procedural art extension was stopped and preserved, unimported, at `tools/rc/experiments/procedural-art-draft.js`. The target remains a connected military base, but the next acceptance slice is one strong buggy in one polished hangar.

Blender 5.2.0 LTS is installed at `/Applications/Blender.app/Contents/MacOS/Blender`. The built-in image generator produced `assets/rc/concepts/buggy-hangar-v1.png`; its exact prompt is adjacent. This is original concept reference, **not rendered game art, a 3D mesh, a measured reference or a finished scene**. The generated views disagree slightly in suspension detail; authored mesh proportions and the asset contract must resolve this, rather than treating pixels as engineering dimensions.

The concept's useful commitments are sculpted amber shell, ivory accents, exposed copper coil-overs, graphite chassis, knobby tires, readable rear wing and human-scale maintenance scenery. Capture real engine results beside this reference and reject boxy silhouette, floating wheels, flat lighting, bare corridor walls or decorative clutter that obscures driving.

## Direct playable reference status — checked 2026-10-18

Bounded discovery (depth 2–3) checked `/Applications`, `~/Applications`, `~/Games`, `~/Downloads`, `~/Library/Application Support/Steam/steamapps`, `~/Library/Application Support/RVGL`, common GOG support and `/Volumes`. Steam's configured library file lists only the local library and does not contain Re-Volt app 287310. No Re-Volt/RVGL executable or original game data was found. This does not prove Ian does not own it elsewhere.

**Exact blocker:** no local reference executable/data was found; an owned installation/data path or explicit setup decision is needed before direct play. No game purchase, installer download or asset reuse has occurred. A community bundle link is not evidence of a reuse licence.

Primary sources checked:

- [RVGL project](https://rvgl.org/): official launcher/patch routes; macOS patch requires original game data. Its documentation of screenshots (F8), windowed launch and session CSV is useful, but session CSV is race results, not high-frequency vehicle telemetry.
- [RVGL platform documentation](https://re-volt.gitlab.io/rvgl-docs/os-specifics.html): macOS data path and installation requirements.
- [Re-Volt commercial Steam listing](https://store.steampowered.com/app/287310/ReVolt/): a commercial route if no owned copy is available; no purchase authorized.
- [RVGL advanced documentation](https://re-volt.gitlab.io/rvgl-docs/advanced.html): developer car-stat calculation, camera position display and camera editing. Dev mode changes the CHT status; keep reference profiles separate. These features are documented, not exercised here.

Once legitimately installed, use one named stock car, one difficulty/physics setting, one dry flat location, fixed viewport/FOV and no pickups/opponents. Record executable version, car, track, control mapping, assists, FPS cap, hardware, run count and camera settings. Capture three repeats of each manoeuvre with an input-time marker. Prefer documented car-stat tools for acceleration/top speed; footage-derived quantities must state frame rate, timing uncertainty and scale calibration. Do not infer metres from pixels without calibration. Compare turn response in car lengths when scale is uncertain. Preserve original recordings outside game content; never redistribute reference data into this project's assets.

## Gameplay reference/acceptance matrix

All numeric targets below are **chosen design envelopes**, not Re-Volt measurements. Reference column remains unmeasured until direct evidence exists.

| Mechanic | Original course / check | Chosen target or acceptance | Reference status |
|---|---|---|---|
| Acceleration | flat, 5 s full power | 0–9 m/s in 0.6–1.3 s; max 11 m/s | unmeasured |
| Braking/reverse | 2 s power then brake; reverse from rest | stop below .2 m/s within 2.2 m; reverse max 4.5 m/s | unmeasured |
| Steering/grip | full-lock turn after acceleration | publish response/radius/slip; tune after comparison, no parity threshold yet | unmeasured |
| Drift/recovery | 0.75 s handbrake turn then straight power | bounded yaw/slip, recover control; current model lacks rollover | unmeasured |
| Suspension/uneven ground | 7 cm peak-to-peak ripples | centre height <.4 m; no runaway energy | unmeasured; simplified ride-height model |
| Jump/landing | .6 m ramp over 4 m | air .2–.7 s; centre height <1.2 m; finite state | unmeasured |
| Collision | 25 cm thick wall, under-wing and gear cases | no tunnelling; wing clearance; side-ramp peak <2 m | unmeasured |
| Chase camera | wall back-in, under-wing, quick reversal | no sustained occlusion or geometry crossing; comfort review/video required | unmeasured; browser course pending |
| Gates/laps/shortcuts | whole base route + high-altitude negative test | ordered gates only; no airborne exploit; shortcut cannot skip required gate | unmeasured; browser full race pending |
| Reset | trapped car, R | last valid checkpoint, +3 s, clear velocity | unmeasured |
| Input parity | keyboard/arrows/touch replay | same semantic input gives same trajectory; no stuck keys after focus loss | touch/browser acceptance pending |
| Frame pacing | real WebGL capture at 1280×720 | provisional p95 <20 ms, p99 <33 ms on identified Mac; evaluate visual cost | broad benchmark pending slot |

`tools/rc/harness/courses.mjs` defines original flat/ripple/jump/wall/slalom courses and input tapes. `run.mjs` writes per-tick JSONL and metrics with deterministic SHA-256 replay identity. `acceptance.test.mjs` checks authored envelopes. The current baseline is `evidence/rc-pipeline/handling-baseline.json`. Reference values are explicitly null. The browser capture script records actual keyboard interaction, video and RAF percentiles; it has not been run for this new asset pipeline. It is not a reference-game automation script.

Measured current baseline: 0–9 m/s 0.875 s, stop distance 1.757 m, reverse 4.5 m/s, jump air time .367 s, ripple centre peak .308 m. Radius estimate is a chord/yaw approximation for a changing-speed turn, not an exact steady-state turning radius. Current simulation is still arcade planar handling with an authored vertical model; it cannot yet satisfy four-wheel suspension or rollover parity.

## Asset pipeline

1. **Concept:** generated reference and exact prompt in `assets/rc/concepts/`. No proprietary art input.
2. **Author:** `tools/rc/blender/build_assets.py` constructs native editable Blender objects/materials for buggy and hangar slice. Names, pivots, scale, budgets and collision proxies are in `tools/rc/asset-contract.json`. The script is syntax-checked only, not yet executed in Blender.
3. **Export, when heavy slot is free:**

   ```sh
   /Applications/Blender.app/Contents/MacOS/Blender --background --factory-startup --python tools/rc/blender/build_assets.py -- --out web/wwwroot/rc/assets
   node tools/rc/validate-assets.mjs web/wwwroot/rc/assets
   ```

   Outputs: editable `.blend`, `.glb`, provenance JSON. Rendering is a separate operation; export does not silently invoke a render.
4. **Validate:** GLB magic/length, glTF 2, embedded buffers/textures, required nodes, world-space bounds, wheel pivot locations, actual triangles and material/byte budgets. Missing exports fail; there are no placeholder success reports. Validator unit tests use deliberately malformed minimal documents, not pretend exported assets.
5. **Integrate:** `rc/assets.js` uses the existing vendored Three GLTFLoader, maps steering/spin nodes and hides collision proxies. `?assets=blender` is opt-in until real export and visual acceptance. Hangar GLB scene swap is still to be wired after export inspection. Default tested prototype remains intact.
6. **Accept:** orbit/turntable and low chase views of the same asset, plus ground contact, wheel rotation, steering, ramps and occlusion checks. Compare real screenshots with concept and legal reference footage. No claim that a concept sheet meets the visual bar.

Budgets: buggy ≤18k triangles, ≤9 materials, ≤2.5 MB; hangar slice ≤90k triangles, ≤12 materials, ≤7 MB. Author in metres with Blender +Z up/+Y forward; glTF export gives +Y up/−Z forward. Collision proxy nodes are separate. Geometry/material batching and LOD decisions follow measured render cost; first export must report primitive count rather than assume shared materials imply low draw calls. Texture/UV baking is still pending; current script uses exportable PBR material values, not procedural shader nodes that silently disappear from glTF.

Original script geometry/materials: repository MIT. Image concept: built-in generation, no external reference assets. No Re-Volt/RVGL source, data, sounds or models enter the pipeline.

## Milestone and next gate

Completed: original concept, asset contract, source Blender authoring/export path, GLB validation code with tests, opt-in loader, deterministic handling course/replay/telemetry harness and baseline. **Not yet completed:** Blender-generated meshes/GLBs, renders, visual approval, full shell integration, direct reference play or matched recordings. MD3 retains the heavy slot. Next coordinated milestone is one exported/validated buggy plus hangar slice and actual engine screenshots, then a matched manoeuvre comparison after legitimate reference data is available.
