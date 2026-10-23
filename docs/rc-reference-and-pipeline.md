# RC reference, asset pipeline and acceptance

## Original art acceptance boundary — 2026-10-18

The prototype is not visually accepted and does not establish Re-Volt gameplay parity. The previous procedural art extension was stopped and preserved, unimported, at `tools/rc/experiments/procedural-art-draft.js`. The target remains a connected military base, but the next acceptance slice is one strong buggy in one polished hangar.

Blender 5.2.0 LTS is installed at `/Applications/Blender.app/Contents/MacOS/Blender`. The built-in image generator produced `assets/rc/concepts/buggy-hangar-v1.png`; its exact prompt is adjacent. This is original concept reference, **not rendered game art, a 3D mesh, a measured reference or a finished scene**. The generated views disagree slightly in suspension detail; authored mesh proportions and the asset contract must resolve this, rather than treating pixels as engineering dimensions.

The concept's useful commitments are sculpted amber shell, ivory accents, exposed copper coil-overs, graphite chassis, knobby tires, readable rear wing and human-scale maintenance scenery. Capture real engine results beside this reference and reject boxy silhouette, floating wheels, flat lighting, bare corridor walls or decorative clutter that obscures driving.

## Current reference library — 2026-10-23

The local, non-public gallery is `reference/rc/index.html` (open directly). It contains 96 local images: 48 Nellis/base references and 48 Mario Kart 64/Re-Volt manual pages, course references and direct-play captures. Full images open from thumbnails; filters work offline. Source manifests record known provenance and mark unresolved originals explicitly. `reference/rc/mk64/course-mapping.json` maps all 16 MK64 tracks to Saucer Springs locations. The library is locally ignored and excluded from game packaging.

RVGL is installed at `~/Applications/RVGL.app` with data under `~/Library/Application Support/RVGL` (20 levels, 36 car folders found). User supplied `~/Downloads/Mario Kart 64.zip`; the private EmulatorJS setup is at `~/Games/RC References`. A real single-player Luigi Raceway race, HUD, acceleration and steering were verified in silent headless Chromium with external requests blocked. Reload verified arrow-key steering and X acceleration defaults. The local player is http://127.0.0.1:19764/; its launcher and Stop command are in that private directory. All 16 course starts are captured at 1280×720 and visually checked; these are starting views, not complete course surveys. A reusable native course-menu state is saved privately. The gallery is also served at http://127.0.0.1:19764/library/. All 96 image URLs load and the gallery fits laptop and phone widths. Keyboard controls: arrows steer, X accelerates/confirms, Z brakes, Shift hops/drifts, Space uses items, Enter starts/pauses. Physical controllers and RVGL gameplay have not been verified. No ROM belongs in the repository or public deployment.

## Historical discovery — checked 2026-10-18 (superseded above)

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

## Purchase/setup and entitlement follow-up

Public official-store receipt saved in `evidence/rc-pipeline/store-check.json` at 2026-10-18 02:37 UTC. Steam US: **USD 5.99**, Windows only (`mac=false`, `linux=false`). GOG public offers: **USD 5.09 (US)** / **AUD 6.79 (AU)**. These are observed public regional prices, not Ian's verified account-region checkout quote. The GOG offer was marked as ending 18 October 2026 09:59 EEST; recheck before any payment. No purchase or cart action occurred.

A background entitlement check could not proceed: Chrome's ordinary UI automation rejected `visible:false` with “Capability is not available: visibility”; the hidden in-app browser fallback returned “Browser is not available: iab”. No Steam/GOG tab was already open, and Steam/GOG were not running in the app inventory. Nothing was foregrounded or logged into. Do not interpret public page template text such as “in library” or local install absence as account ownership evidence.

For this Mac, GOG's **Windows Offline Backup Game Installer** is the documented extraction route: download all installer parts to one folder, use Mac Source Ports Extractor on the `.exe`, and place extracted game data in `~/Library/Application Support/RVGL`. Do not download the Galaxy bootstrap installer. RVGL's macOS build is Universal 2 (Apple Silicon/Intel); the commercial Windows executable itself is not native Mac software. Mac Source Ports documents the RVGL bundle as ad-hoc signed/not notarized; no security bypass or launch has been attempted. Steam data could be copied from an owned Windows installation, but this session has not verified an ordinary Mac Steam download path for its Windows-only depot. Thus GOG is the better documented fresh-purchase path if ownership cannot be established.

Sources: [GOG product](https://www.gog.com/en/game/revolt), [Steam product](https://store.steampowered.com/app/287310/ReVolt/), [Mac Source Ports Re-Volt setup](https://www.macsourceports.com/game/revolt/), [offline installer extraction FAQ](https://www.macsourceports.com/faq/). Private reference play does not grant redistribution rights; original data stays outside the project.

Source-only mesh refinement after concept review: sculpted eight-point body cross-sections replace rectangular sections, and staggered individual tread blocks replace full-width tire bars. Python syntax passes. Geometry budgets and visual appearance remain unverified until Blender export/render gets the slot.

## Art-direction approval and queued review

Ian explicitly approved `buggy-hangar-v1.png`: “yeah that looks great”. Preserve the orange/ivory sculpted buggy, exposed suspension, graphite chassis, knobby tires, orange wing and maintenance-hangar direction. Approval applies to that reference, not the existing procedural game or unrendered Blender source.

The source now includes a roof, door framing and a five-metre drive-through lane. Editable Blender files are saved before an export-only bake/batch stage groups static geometry by parent and material, preserving wheel pivots and collision/semantic nodes. Chosen primitive caps are 32 for the buggy and 72 for the hangar; actual counts remain pending. `render_review.py` prepares fixed hero/front/side buggy views and lane/workbench/structure hangar views. Its renders must be labelled Blender review renders, never in-engine proof.

Next slot sequence: execute export → validate actual GLBs → repair failures → render the fixed review views → load the same exported buggy in Three.js → compare silhouette, wheel contact, reflections/material colour and suspension readability with the approved concept. Reject a rounded-box result even if geometry tests pass. Then wire the hangar slice, validate clear driving paths and perform the actual low-chase capture. Only after this slice clears the visual bar should its asset kit extend to housing and the lab.

Additional primary reference evidence: [RVGL General documentation](https://re-volt.gitlab.io/rvgl-docs/general.html) documents Save Replay / View Replay, a replays directory, and video LimitFPS / LimitLatency options. Record those settings alongside V-Sync and macOS HighDPI before matched capture; keep both saved replay and video. Their existence is documented, but no replay has yet been captured or parsed. This supports a repeatable future comparison without claiming high-frequency telemetry is available from race-result CSV.

## Export and reference setup update

Original Blender exports now exist and pass the contract: buggy 15,188 triangles,
22 primitives, 7 materials, 416,836 bytes; hangar 21,216 triangles, 37 primitives,
10 materials, 590,456 bytes. Editable sources are under `assets/rc/models/`;
shipping GLBs and provenance are under `web/wwwroot/rc/assets/`. Validation receipt:
`evidence/rc-pipeline/asset-validation.json`.
The explicit `?assets=blender` mode now loads both assets atomically, replaces the
prototype hangar visuals, and adds transformed furniture proxies to driving and
camera collision. Browser appearance/gameplay validation is still pending; the
default remains the previously tested prototype.

Purchased GOG data was checksum-tested and extracted successfully with Homebrew
innoextract 1.9_14. Homebrew also upgraded Boost from 1.90.0_1 to 1.92.0.
Private installation: `~/Applications/RVGL.app` and
`~/Library/Application Support/RVGL`. No purchased files were copied into this repo.
Normal RVGL launch rendered the profile-creation screen without a security override.
The earlier unsigned-bundle inspection was not an OS launch refusal.

Computer Use did not establish working gameplay input. A state read took 1336.2472s
and returned only the RVGL window/menu. The subsequent single F11 plus screenshot
call took 249.4829s and returned: "Computer Use is not active for
'/Users/iantodd/Applications/RVGL.app'. You first must call `get_app_state` to get
the latest state before doing other Computer Use actions."
The screenshot did not run and visible input was not confirmed. Ian requested that
this stalled route stop; no further UI attempts or approvals are queued.
Direct driving/reference comparison remains unverified.

## In-engine checkpoint (validated local entry)

The default `/rc/` entry now loads the original GLBs; `?assets=prototype` retains the
fallback for diagnosis. Fixed the apron hiding the exported floor markings by
aligning hangar visual and driving-floor height at 0.04 m. Added local tyre-contact
shadow coverage, material environment lighting, service lights and a lower, closer
chase camera. Load failures retain the usable prototype controls.

Actual full keyboard-driven browser lap: 39.1583 simulation seconds, 204.20 m,
all ten gates, zero impacts, one specimen found, zero page errors. Hardware renderer:
ANGLE Metal / Apple M5. Final normal-entry hangar run: 19.154 wall seconds,
96.79 m, zero impacts/errors, grounded at centre height 0.27 m. Twenty focused
simulation, host, handling and asset tests pass. Captures are actual Three.js output:
`evidence/rc-blender-hangar.png`, `evidence/rc-blender-finish.png`; receipts are
`evidence/rc-blender-smoke.json` (lap) and `evidence/rc-blender-final-smoke.json`.

Start the portable local preview with `bin/rc-preview`, then open
`http://127.0.0.1:8878/rc/`. Existing shell entry remains the RC button with its
mission pause/restore ownership. This turn did not rebuild or run the full WASM
flight shell. Reproduce keyboard route QA using `tools/rc/check-gameplay.cjs`,
setting PLAYWRIGHT_MODULE and CHROMIUM_PATH for the installed runtime if necessary.

Remaining visual limits: housing, aircraft and containment still use the initial
simple procedural models. The new buggy/hangar improve the scene but do not yet
match the approved concept's finish. Suspension remains an authored arcade
approximation rather than independent physical wheel suspension. No direct
RVGL driving comparison has been measured.

## Art review queued after screenshot rejection

The parent inspected the actual capture and rejected it as polished art. Preserve
`30ab8ec9` as the functional baseline. A source-only pass is isolated behind
`/rc/?art=review`; default appearance is unchanged. It proposes richer burnt-orange
shell paint, darker neutral concrete with physically thinner low-contrast joints,
reduced ambient wash, and a shadow-casting service light. The car-following light
moves below the hangar roof during review so the roof does not extinguish its
contact shadows. The existing large black floor joints are covered by a continuous
review surface. No claim of visual improvement is made until rendered inspection.
Aircraft and housing geometry remain unchanged and visibly unfinished.

Next free-slot acceptance: compare identical hangar and buggy views with baseline
and approved concept; inspect orange paint, tyre-ground contact, floor lines,
metal/rubber separation and interior/exterior exposure. Reject if still washed out.
Then run the full flight shell: load a flight mission, open its real RC menu entry,
verify flight pauses, drive, exit with O, confirm the original mission and focus
resume; repeat entry/exit and check errors and duplicate frames. Existing host unit
coverage does not substitute for this full-shell check. No full-shell build or
browser run was performed while Energybar owned the slot.

## October 20 original base-model milestone

The isolated review route now loads original Blender aircraft and quarters GLBs as
part of the same atomic asset set as the buggy and hangar. Editable sources are in
`assets/rc/models/`; authoring code is `tools/rc/blender/base_models.py`. Aircraft
include swept wings, canopy hoops, tyres/hubs, servicing panels and an exhaust;
quarters include pitched roofs, standing seams, framed windows, sills, doors,
gutters and chimneys. No purchased data or external textures were used. The
repository MIT license covers these original models and materials.

Regenerate with Blender in background mode, limited to two threads:
`blender --background --factory-startup --threads 2 --python tools/rc/blender/build_assets.py -- --out /tmp/rc-model-export --only aircraft,quarters`.
Run `node tools/rc/validate-assets.mjs web/wwwroot/rc/assets` after copying only the
requested reviewed exports. The contract now checks all named model entries.

Baseline remains available at `/rc/`; review at `/rc/?art=review`. The real flight
shell also propagates `?art=review` to its RC menu entry. Before/after hangar captures
and measured browser receipts live in `evidence/rc-oct20/`. These are rendered game
frames, not the approved concept image. The artwork is improved but remains a
stylised procedural first version; the containment interior is still simple, and
there is no independent rigid-body suspension or seamless in-world vehicle swap.

The actual .NET flight shell published locally to `/tmp/rc-oct20-shell`. The first
Python-server browser attempt failed fetching a local WASM file. A dedicated Node
server then booted successfully and the integrated keyboard lap exposed an exit
focus race: shell pause rendering queued focus after the iframe restored it. The
host now restores the RC entry focus in the next task, after shell focus microtasks.
`tools/rc/check-shell.cjs` tests the real published shell, a full keyboard lap,
paused flight time, mission identity, focus restoration, frame disposal, resumed
flight time, and a second entry/exit. It blocks external HTTP requests and closes
its own browser/server in `finally`. Set `RC_SHELL_ROOT` to the published wwwroot
and `PLAYWRIGHT_MODULE`/`CHROMIUM_PATH` to installed tooling; run under heavy-slot.

Final acceptance: full real-shell keyboard lap 39.200 simulation seconds,
204.62 m, all 10 gates, 0 impacts,
1 specimen discovered; both entry/exit/resume cycles passed. No browser
page errors. Hardware renderer: ANGLE (Apple, ANGLE Metal Renderer: Apple M5, Unspecified Version). Twenty focused Node tests pass.
Local report/telemetry POSTs have no backend in this static preview; aborted local
requests are retained in the receipt, and no external requests were allowed.
No production gate, public deployment or push was run. The final .NET assembly
publish was reused for final static RC edits; only the edited RC files were copied
into that disposable local preview. Original flight assembly source was unchanged.

Local play: `bin/rc-preview`, then `http://127.0.0.1:8878/rc/?art=review`.
Full-shell preview: `python3 -m http.server 8897 --bind 127.0.0.1 --directory /tmp/rc-oct20-shell/wwwroot`,
then `http://127.0.0.1:8897/?art=review`; start a flight, Escape, RC base, Start.
Exit with O, then Escape to resume. The QA browsers and servers have been closed.
