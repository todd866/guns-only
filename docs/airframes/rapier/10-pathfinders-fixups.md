# PATHFINDERS Slice 2 fix-ups

2026-10-16 · `rapier/pathfinders` · baseline `e2c52a4e`.

## Causes and changes

- The first envelope was 25 km ahead of the airborne start, with no minimum angular
  presentation size. It is now 20 km ahead (`x = -55 km`); the second and third relays
  remain at `-110 km` and `-160 km`. This is provisional mission pacing, not a physical
  constant. The live neutral-control run enters the M61's 900 m ranging window at
  **17.5833 seconds**, range **895.6 m**. The spawn-Mach geometric estimate also falls
  between 15 and 20 seconds. The test does not claim an automatic aimed shot or kill.
- Mesh-only envelopes became subpixel at range. One pooled six-vertex `Points` draw
  now adds warm, soft 5 CSS-pixel glints in the existing scene pass. They stay bright
  through 40 NM, fade out by 45 NM, and blend into the resolving mesh between 3 and
  9 pixels of physical envelope diameter. Sun visibility uses authoritative world
  altitude and the same -1.2° dawn elevation. The shader uses the main renderer's
  logarithmic depth, tests against scene depth, writes no depth and casts no shadows.
  A modest warm emissive contribution keeps the nearby silver envelope readable.
  These are provisional art settings; collision and gondola dimensions are unchanged.
- Every live relay gets an 8-pixel HUD diamond on its gondola; selection retains its
  larger bracket and ROE marking. Denied relays lose their diamonds. Their surviving
  physical envelopes can still glint; destroying a gondola does not erase its balloon.
- `WAVE OFF` came from the recovery platform's initially armed wave-off latch, which
  immediately fired at the hunt's full throttle. Only the airborne Pathfinder start
  now initializes disarmed. The existing approach transition rearms it. Tests cover
  both that later transition and an ordinary carrier wave-off.
- `INLET LOW` came from `AircraftSim`'s fallback trim using low-speed `CLAlpha` at
  Mach 3.6. First Light now authors its body attitude using the actual supersonic lift
  slope and full fuel/four-drone mass. No warning threshold or shared physics changed.
  Projected inlet recovery is 98.3% at spawn, 98.1% at t+3, and 97.2% at the first
  window. Real inlet degradation still alerts, including during Pathfinders.
- The Pathfinders picker reuses the Rapier painting with a scoped dawn gradient and
  balloon/tether/gondola silhouette. It adds no text, rows, assets or downloads.

## Validation

**371 Node cases passed**, covering HUD, scene, progression, hot state and relevant
environment suites. The six relay-renderer tests passed again after the final
logarithmic-depth correction. The new Node start tests use three actual sim snapshot
fixtures; the dotnet tests compare them with the live projection on every run.
They exercise the real HUD footer and inlet readout, preserve genuine alerts, and
check the first crossing against the production gun-funnel range.

The requested command built successfully but VSTest could not bind its TCP socket
under this sandbox (`SocketException (13): Permission denied`); **0 cases ran there**:

```sh
PATH="$HOME/.dotnet:$PATH" DOTNET_ROOT="$HOME/.dotnet" \
  dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj \
  --filter 'FullyQualifiedName~Pathfinder' --no-restore --nologo -m:1 /nodeReuse:false
```

The repository's socket-free runner passed **87 cases, 0 failed, 0 skipped**:

```sh
PATH="$HOME/.dotnet:$PATH" DOTNET_ROOT="$HOME/.dotnet" \
  bin/test-in-process Pathfinder RapierV2RuntimeDesignTests \
  RapierAerodynamicsIntegrationTests WaveOffThenStoppedTrapRecordsSetbackWithoutCleanMastery \
  SnapshotHotFrameTests MeshNavSnapshotTests
```

Of these, **30 are Pathfinder cases**. Fixture regeneration uses the existing
`GUNS_UPDATE_FIXTURES=1` convention; the final validation ran without that flag.
Builds had 0 errors; NU1900 warnings reflect the unavailable NuGet vulnerability
endpoint. JavaScript syntax and whitespace checks passed.

The standing refuter reviewed the diff. Follow-up checks established later recovery
arming, ordinary carrier behavior, real-snapshot HUD alerts and world-coordinate
sunlight. Keeping the physical envelope after a relay kill is intentional. Cursor's
additional scoped review could not start: its guard could not verify helper process
identity. No capacity or sandbox rule was bypassed.

## Hardware/visual checkpoint

Full Chromium was attempted with `headless: true, channel: "chromium"`, using the
primary checkout's installed Playwright. It exited with **SIGABRT before opening a
page**. No visible window was opened and no existing owner browser was touched.
There is consequently **no new screenshot, viewport-fit result, GPU qualification
or p95 measurement**. The one extra six-point draw is a structural cost bound,
not evidence that p95 is at or below 18.5 ms.

Next external validation: rebuild this branch's web output without stamping, then
repeat the original picker/t+3/Tab/t+18 hardware-headless capture. Inspect the warm
envelope against dark ground through 40 NM, near-mesh transition, all live diamonds,
death/selection behavior, and the card at laptop/phone sizes and larger text. Run the
ux-authoring viewport check, then measure the live workload against p95 <=18.5 ms.

Local evidence: `/tmp/pathfinder-fix-node.log`, `/tmp/pathfinder-fix-glints.log`,
`/tmp/pathfinder-fix-dotnet.log`, `/tmp/pathfinder-fix-inprocess.log`,
`/tmp/pathfinder-fix-browser.log`, `/tmp/pathfinder-fix-cursor.log`.
No test server or browser remains running. No push, deployment or stamp occurred.
The battery admission policy ran through the existing `/tmp/pathfinder-power-run.py`
adapter because the sandbox cannot write the normal state lock; AC was confirmed.

## Changed paths

15 files: 7 implementation files, 7 test/fixture files, this checkpoint.

```text
sim/Doctrine/Beats.Pathfinder.cs
sim/PathfinderMission.cs
sim/SimulationSession.cs
web/wwwroot/hud.js
web/wwwroot/index.html
web/wwwroot/render/hud/pathfinder_hud.js
web/wwwroot/render/scene/pathfinder_relays.js
sim.Tests/PathfinderTests.cs
web/wwwroot/render/hud/tests/pathfinder_hud.test.mjs
web/wwwroot/render/hud/tests/pathfinder_start.test.mjs
web/wwwroot/render/hud/tests/fixtures/pathfinder_start.json
web/wwwroot/render/hud/tests/fixtures/pathfinder_three_seconds.json
web/wwwroot/render/hud/tests/fixtures/pathfinder_first_window.json
web/wwwroot/render/scene/tests/pathfinder_relays.test.mjs
docs/airframes/rapier/10-pathfinders-fixups.md
```
