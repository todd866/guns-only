# PATHFINDERS Phase 1 — Slice 2 presentation

2026-10-16 · `rapier/pathfinders` · follows Slice 1 at `cf03e429`.
Implemented and unit-tested; visual acceptance and hardware frame timing remain with Claude.
No browser was launched, no release was stamped, and nothing was pushed or deployed.

## Load and controls

On the local worktree's web server, open `/?program=rapier-pathfinders` and Fly.
The menu card is **Rapier / Pathfinders — First Light**, backed by beat **15**.
Use the local server origin, not the production domain: this commit has not been deployed.

`F` fires the existing internal gun, `Tab` cycles the three authored relay selections,
and `O` requests the existing return-home flow. The phone target control reads RELAY and
shows the selected relay ID. Killing a relay does not automatically select its neighbour.
Four carried drones remain Slice 1 mass/inventory; drone routing is outside this slice.

## State and presentation

- `PathfinderSnapshotProjection` publishes authoritative relay/envelope and gondola transforms,
  leak/lift-loss state, active/denied state, and physical debris positions. The hot numeric layout
  is version 35; its decoder reconstructs a new nested `pathfinder` object each display frame.
  Generic ammo, rounds, tracers and lead fields work with Pathfinder's gun even though
  `opponent_present` remains false. Hot/cold parity includes selection, leaks, kills and firing.
- Six preallocated relay slots use shared dark gondola/truss materials and small per-slot
  deformable envelope geometries. Positions map through the existing `(x, y, -z)` convention.
  Undamaged envelope radius and gondola anchor come from the simulation; the gondola remains
  5.6 × 2.8 × 4.2 m. Damage wrinkles/sags the envelope without moving the authoritative gondola.
  Envelope deformation/normal updates occur only at quantized leak/lift changes. Dead gondolas
  follow sim debris; there is no renderer-side fall prediction, explosion or particle burst.
  Falling gondolas reuse the live material, so a kill does not introduce a new shader variant.
- First Light uses a fictional **−1.2° local sun elevation** in the existing sky and lighting
  system. At FL650–700 the sun is visible above the depressed horizon. Dark upper sky, warm
  envelope light, blue ground grade and shared blue horizon haze are mission settings in the
  existing sky/terrain shaders. Leaving the mission restores lighting before the next grade.
  These are provisional art settings, not changes to physical atmosphere or airframe constants.
- One existing hunt cue row reads `◇◇◆  F GUN`: hollow means live, solid means denied.
  Envelope punctures do not fill a diamond. The selected live gondola receives a conformal
  corner bracket; the envelope never owns the target marker. A blocked footprint crosses the
  bracket and makes the existing gun cue/pipper amber with `ROE`. Clear ground retains normal
  gun cues. Unknown also means *not cleared*, not a claim that the target is above a town.
  Existing thermal warnings and return-home guidance keep their precedence.
- The cue uses the sim's footprint classification, cached for at most one simulation second;
  selection and live/dead changes force refresh. The actual kill/ROE decision remains at sim
  contact time. Radio adds no invented speech or audio path: `PathfinderMission.LastEngagement`
  and bounded `KillRecords` remain the event hooks for future authored relay/ROE radio lines.

## Validation

All commands ran locally without a browser.

```sh
node --test web/wwwroot/render/hud/tests/*.test.mjs \
  web/wwwroot/render/scene/tests/*.test.mjs \
  web/wwwroot/render/progression/tests/*.test.mjs \
  web/wwwroot/render/state/tests/*.test.mjs \
  web/wwwroot/render/environment/tests/korea_terrain.test.mjs \
  web/wwwroot/render/environment/tests/korea_environment.test.mjs
# 366 passed, 0 failed

PATH="$HOME/.dotnet:$PATH" DOTNET_ROOT="$HOME/.dotnet" \
  dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj --filter "FullyQualifiedName~Pathfinder"
# Build succeeded. VSTest ran 0 cases: TCP socket bind denied by sandbox (error 13).

PATH="$HOME/.dotnet:$PATH" DOTNET_ROOT="$HOME/.dotnet" \
  bin/test-in-process Pathfinder SnapshotHotFrameTests MeshNavSnapshotTests
# 72 passed, 0 failed, 0 skipped; build 0 errors.
```

The final HUD/scene-wiring subset was rerun after the thermal-precedence, phone-label and
daylight-reset refinements: **11 passed**. `node --check` for `app.js`/`hud.js` and
`git diff --check` passed. Restore reports NU1900 because the sandbox cannot reach NuGet's
vulnerability endpoint. The in-process runner runs the actual xUnit cases without VSTest sockets.
The standing refuter's objections were resolved. Cursor's additional review could not start:
its capacity guard could not verify helper process identity.

## Claude rendering handoff

Still required: inspect the actual dawn composition, pale envelope/dark gondola separation,
leak deformation, kill/debris transition, gondola bracket alignment, clear/populated/unknown ROE
states, mission changes, and laptop/phone viewport fit including larger text. Check the shader
on the actual WebGL renderer. No visual-success claim is made from Node geometry tests.

Measure the specified live-sim hardware workload and cold entry before accepting **p95 ≤18.5 ms**
or the incremental GPU budget. No browser or hardware performance measurement was possible in
this slice's authorized execution scope. The implementation caps the pool at six, avoids
per-frame geometry rebuilding and uses no new runtime downloads, but these are structural
bounds, not measured frame-time evidence. No new relay radio lines were authored.

## Changed paths

```text
sim/SimulationSession.Controls.cs
sim.Tests/GunsOnly.Sim.Tests.csproj
sim.Tests/PathfinderTests.cs
sim.Tests/SnapshotHotFrameTests.cs
sim.Tests/MeshNavSnapshotTests.cs
web/PathfinderSnapshotProjection.cs
web/SnapshotProjection.cs
web/SnapshotHotFrame.cs
web/wwwroot/app.js
web/wwwroot/hud.js
web/wwwroot/index.html
web/wwwroot/render/environment/mission_lighting.js
web/wwwroot/render/environment/korea_terrain.js
web/wwwroot/render/hud/pathfinder_hud.js
web/wwwroot/render/hud/tests/pathfinder_hud.test.mjs
web/wwwroot/render/progression/campaign_progression.js
web/wwwroot/render/progression/tests/campaign_progression.test.mjs
web/wwwroot/render/scene/pathfinder_relays.js
web/wwwroot/render/scene/scene_builders.js
web/wwwroot/render/scene/tests/pathfinder_relays.test.mjs
web/wwwroot/render/scene/tests/pathfinder_wiring.test.mjs
web/wwwroot/render/state/hot_snapshot.js
web/wwwroot/render/state/tests/hot_snapshot.test.mjs
docs/airframes/rapier/09-pathfinders-presentation.md
```
