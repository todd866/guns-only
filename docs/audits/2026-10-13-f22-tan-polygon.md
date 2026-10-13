# F-22 forward-view tan polygon: conventional recovery airbase

2026-10-13, package `c9-tan-polygon`, baseline `47207df5151fb8bc4a663a625b4ab5c76654686b`.

The small tan shape below the gunsight is the distant **conventional recovery runway/airbase**, including its fixed-pixel light fields. It is a world object positioned from simulation state, not own-ship geometry, an opponent, a HUD mark, a shadow, or a contact impostor. No application source was changed: the package explicitly requires preserving legitimate sim-sourced world objects.

## Direct identification

A clean local publication was flown into Controlled gun pass through the normal practice picker and Start button. Assisted flight was disabled through the existing bridge only to hold the audit fixture. A browser-only constructor hook exposed `FlightView`; the RAF wrapper stopped after a rendered active frame at approximately 3 seconds. No source hook was committed.

The probe walked every visible geometry's world-space bounding box, projected its corners with the live camera, and recorded its scene ancestry/material. Then it hid each visible root in turn and rendered again **without advancing the simulation or camera**. Only hiding `CONVENTIONAL_RUNWAY` removed the complete tan shape. Hiding the opponent changed only the aircraft at the reticle. Hiding the canopy group changed no pixels. The complete projected object inventory is retained with the evidence.

The independent confirmation matrix used 390×844 and 844×390 touch/mobile viewports at DPR2, and 1280×720 at DPR1. Full Chromium was headless, `channel: "chromium"`, with ANGLE Metal / Apple M5 reported in all runs. Every URL used `audioQa=silent`; non-GET/HEAD requests were intercepted locally.

At portrait t=3.0167 s the runway group alone accounts for physical pixels x=341–413, y=1020–1051 (exclusive diff bounds `[341,1020,414,1052]`). Restoring the group produced a byte-for-byte identical decoded screenshot. The landscape and laptop pairs independently reproduce this result.

Child isolation showed why this must not be attributed to a single shoulder mesh: hiding `RUNWAY_VISUAL_SHOULDER` or `RUNWAY_PAVEMENT` alone produces no visible change at this range. The cleared verge contributes to the interior, while the approach, edge, threshold, end and tower light fields contribute overlapping fixed-size point sprites around the outline. Hiding all light fields leaves the narrower, still tan airbase surface. The observed shape is the combined airbase presentation.

## Source and authority

`web/wwwroot/render/scene/scene_builders.js`:

- `createConventionalRunwayPresentation()` creates the named runway/airbase meshes and lights.
- `updateConventionalRunwayPresentation()` requires `runway_available === true` and finite threshold, heading and dimensions. It places the root at `(thresholdX, thresholdY + 0.055, -thresholdZ)` with the established simulation-to-render Z reflection.
- The captured sim state publishes threshold `(600, 77.5, 19400)` metres, heading 15°, length 3000 m and width 45 m. The eye is roughly 23–24 km from the field; the sim's aircraft altitude is about 10,000 ft. This is the recovery field ahead and below the aircraft, not geometry attached to the forward camera.
- The shoulder, cleared verge, apron, buildings and lights are visual-only supporting scenery. They do not expand the authoritative runway collision surface. `createRunwayPointField()` (line 1388 onward) gives point lights 4.5–7 pixel sizes with `sizeAttenuation: false`.

`web/wwwroot/app.js` calls `updateConventionalRunwayPresentation()` on the live state each frame. `applyTerrainCurvatureToRunwayMaterial()` applies the same Earth-curvature constants as the terrain.

## Why it is solid tan

The ordinary runway materials retain Three's scene fog. In the captured portrait frame the scene fog is sRGB `#a7814c`, density `0.00006867650923920059 / m`; this closely resembles the non-winter Ukraine `fogLow` (`0xa8814b`) configured in `app.js`. At this distance fog largely replaces surface and light colours with that flat tan.

The adjacent terrain instead uses the shared soft-world atmosphere: density scale 0.32, haze RGB `[0.48, 0.59, 0.68]`, haze mix 0.72, and streaming-edge burial. The runway's ordinary materials are not passed through `addUkraineSoftWorldFog()`. That difference explains why the distant field stays conspicuous against blue-grey hazed terrain. No source comment establishing the omission as intentional was found; this report identifies it without claiming visual quality is ideal or changing the atmosphere policy. The object and its placement are legitimate; deleting it would remove recovery scenery.

## Evidence and limits

Evidence root: `/Users/iantodd/.local/state/guns-only-improve/`.

- `impl-logs/c9-probe.mjs`, `c9-scene.json`: reusable root isolation and projected scene inventory.
- `impl-logs/c9-confirm.mjs`, `c9-{portrait,landscape,laptop}-confirm.json`: same-frame matrix, full state, fog uniforms, viewport geometry (`viewport.measurements` explicitly includes `#scene` and `#hud`) and page errors.
- `impl-logs/c9-points.mjs`, `c9-points-portrait-confirm.json`: child light isolation.
- `impl-logs/c9-image-comparison.json`: restored pairs have zero changed pixels; hidden-runway diff bounds.
- `shots/impl-c9-tan-polygon/{portrait,landscape,laptop}-before.png`, matching `*-runway-hidden-diagnostic.png`, and `*-after-restored.png`: the hidden image is **diagnostic only**, not an implemented fix. Before and restored-after are intentionally identical.
- `shots/impl-c9-tan-polygon/points-portrait-all-lights-hidden.png`: the narrower airbase surface remains after all light fields are hidden.

Existing deterministic runway tests: `node --test web/wwwroot/render/scene/tests/conventional_runway.test.mjs` — **9 passed, 0 failed**. All three browser matrix cases reached active practice, had zero page exceptions, passed scene/HUD viewport bounds, and restored exactly. No new behavior required a new regression test. No gameplay, HUD layout, opponent model, atmosphere, physics, frozen-mode or release-identity code changed. No full gameplay acceptance or real-phone performance claim is made. The full `bin/check` gate was not run for this documentation-only result; its exit code is not applicable.

## c9b — shared runway atmosphere

The coordinator subsequently authorised repairing the colour mismatch while preserving the
recovery field. `updateConventionalRunwayPresentation()` now accepts the active terrain's
atmosphere uniforms. Every conventional runway material—pavement, markings, supporting airbase
meshes and all five point-light fields—composes `addUkraineSoftWorldFog()` with its existing
Earth-curvature shader. The helper supplies the same extinction, haze colour and stream-edge
burial as terrain, by reference, so weather/altitude changes remain live. Ordinary scene fog is
disabled on those materials to avoid applying both paths.

Switching terrain rebinds the uniforms. Missing or incomplete terrain uniforms restore the original
curved materials and scene fog. The steady frame path does not traverse meshes or recompile
materials. Runway position, dimensions, base colours, light sizes, collision authority and recovery
physics are unchanged. Shared terrain policy applies to frozen modes using this presentation;
carrier and Rapier arrested-strip builders are untouched.

Regression coverage in `conventional_runway.test.mjs` exercises all three material types with
Three's actual shader templates, live uniform identity, curvature/fog composition, terrain
replacement, no per-frame recompilation, and restoration when terrain is absent or incomplete.

The active atmosphere also enables tone mapping on light/paint materials, so their haze uses the
same output transform as terrain; terrain-free modes recover their original tone-mapping setting.

Visual evidence is in `~/.local/state/guns-only-improve/shots/impl-c9b-runway-haze/`:
`{portrait,landscape}-{live,8nm,2nm}-{before,after}.png`. The live pair is at approximately
22.87 km horizontal threshold range. The other pairs are camera-only fixtures at exactly
14,816 m / 914.4 m above threshold and 3,704 m / 194.12 m above threshold (3°); they preserve
the simulation, authoritative runway and scene, move the sky with the inspection camera, and hide
the frozen flight HUD. They are appearance evidence, not flown landings. In every pair the camera
and simulation are frozen, and only runway material atmosphere is toggled. Full viewport pairs
and cropped `runway-detail-pairs.png` were inspected: tan fog no longer fills the distant field;
at 2 NM the pavement, markings and base remain at least as distinct. The 8 NM lights are clearer.

**Remaining visual limitation:** fixed-pixel light sprites still merge into a conspicuous pale
strip/red beacon at long range. This change unifies atmosphere; it does not solve the underlying
sprite-size/energy presentation. No claim that the far airfield is photorealistic or visually
finished is made. Retuning those lights would be a separate rendering decision, not a runway
position/geometry correction.

Six real Start/input cases (phone portrait/landscape gun pass, laptop runway recovery, Ace Duel,
Rapier intercept, Top Gun) reached active flight with zero browser/GL errors. Full Chromium was
headless, `channel: chromium`, ANGLE Metal / Apple M5, `audioQa=silent`. The tests disable
assisted flight/autofire to keep the capture exercise active. All six scene/HUD viewport checks
passed. Same-frame pixel diffs are restricted to the runway; Rapier and Top Gun before/after are
pixel-identical because they use other recovery presentations. Logs and reusable harness:
`impl-logs/c9b-visual.mjs`, `c9b-*-visual.json`, `c9b-pixel-comparison.json` under the evidence root.

Validation: 40/40 focused Node tests passed (conventional runway, mission features, Korea scenery),
and the local SDK 8.0.423 preview publication succeeded. `bin/check` was attempted once but remained
queued behind another agent for over nine minutes; only our waiting gate was stopped, exit 143.
No full-gate pass is claimed. No physics, runway geometry, production, build identity or deployment
was changed. Real-phone performance and a complete human recovery remain unverified.
