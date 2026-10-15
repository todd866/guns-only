# PATHFINDERS first-light readability follow-up

2026-10-16 · `rapier/pathfinders` · baseline `7ddaaa35`.

## Changes

- The sun is now at azimuth **050°**, **140° off the initial westbound lane**;
  the later authored legs also stay within 120–160°. Elevation remains **−1.2°**:
  visible above the depressed horizon aloft, below the ground horizon. The sky's
  dawn horizon now warms toward the sun and stays blue toward the western hunt.
  The existing blue ground grade is retained. These are provisional art settings,
  selected from the owner's 120–160° brief and Claude's `.ux-ref/pathfinders-look2.png`;
  the nose-on sun and an all-azimuth warm horizon were rejected.
- The existing six-point glint draw is a **7 CSS-pixel warm dot at 10 NM**, blending
  into a **9-pixel round shaded envelope impostor at 3 NM**. It fades as the actual
  mesh resolves (4–10 pixels), and is additionally extinguished by **1.5 km** so
  the physical envelope and dark gondola own the gun window. The warm envelope
  emissive contribution rises from 0.18 to 0.30. Existing 40–45 NM far fading,
  depth testing, logarithmic depth, pool size and HUD diamonds remain.
- Envelope **diameter is 35.278 m** (existing radius 17.639 m), within the requested
  30–60 m range. Its simulation volume, collision geometry and 5.6 × 2.8 × 4.2 m
  dark gondola are unchanged. At 66° vertical FOV and 1280 × 720, the physical
  envelope spans about 1.1 pixels at 10 NM and 3.5 pixels at 3 NM, motivating the
  impostor. At 1.5 km the projection test establishes an envelope wider than
  12 pixels, a gondola wider than 1.5 pixels and over 4 pixels of clear sky between
  their bounds. These are geometry checks, **not visual acceptance**.
- First Tab (or the phone RELAY control) explicitly selects the nearest live
  gondola, even when the mission already preselected it. Further presses cycle
  live relays by current slant range, skip denied/invalid relays and wrap; equal
  ranges retain authored slot order. Restaging resets first-selection behavior.

## Deterministic gun-window capture

On the rebuilt local web server, use its existing port (8000 in this example):

```text
http://localhost:8000/?program=rapier-pathfinders&qa=pathfinder-gun-window
```

`127.0.0.1` also works. This follows the existing localhost-only QA convention;
LAN hostnames and production URLs do not enable it. Click **Fly**, leave flight
controls neutral, and optionally press **Tab once**. The simulation pauses at
the first 120 Hz tick where the **first authored live gondola** is at or inside
**1,500 m slant range**. The stopping condition uses authoritative actor and player
positions after integration, independent of browser frame batching. It does not
teleport, aim, fire, enlarge a hit volume or switch to a different gondola if the
first has been denied. This is the requested inspection window; it does not alter
the existing M61 HUD's 900 m effective ranging ceiling.

The capture hold leaves the scene/HUD unobscured by a pause menu. **Escape** or
the existing pause button resumes; capture is one-shot for that sortie. Restart
and Fly rearm it from the URL. Changing beat clears the sim hook. Other URLs and
missions keep their normal lifecycle. The only browser UI change is this explicit
QA hold; no new rows or controls were added.

Headless automation can wait for:

```js
await page.waitForFunction(() =>
  globalThis.__gunsState?.pathfinder && globalThis.__gunsState.paused
  && globalThis.__gunsBridge?.PathfinderQaGunWindowReached());
await page.screenshot({ path: "pathfinders-gun-window.png" });
```

Use the ordinary URL without `qa` for the t+3 / Tab comparison. Capture 10 NM,
3 NM and the held gun window at actual viewport size; inspect the warm envelope,
round silhouette, dark gondola and retained diamonds. Also check the off-axis sun,
blue ground, laptop/phone sizes and the ux-authoring viewport check. No browser
automation should open or take over an owner's visible window.

## Validation and remaining visual check

**377 Node cases passed; 95 targeted .NET cases passed, 0 failed, 0 skipped.**
The latter includes 8 new QA cases covering the first crossing, different Advance
batch sizes, fixed-tick batching, stable hold/resume, restart/rearm, opt-in isolation
and a denied first relay with the second inside the window.
The web build (including the new JS bridge exports) passed with **0 warnings and
0 errors** using `dotnet build web/GunsOnly.Web.csproj --no-restore --nologo -m:1
/nodeReuse:false`. The in-process runner build had 0 errors; its NU1900 warnings
reflect the unavailable NuGet vulnerability endpoint. JavaScript syntax and
`git diff --check` passed. The 10-case target-cycle subset passed again after
adding the exact preselected-nearest regression assertion.

```sh
node --test web/wwwroot/render/hud/tests/*.test.mjs \
  web/wwwroot/render/scene/tests/*.test.mjs \
  web/wwwroot/render/progression/tests/*.test.mjs \
  web/wwwroot/render/state/tests/*.test.mjs \
  web/wwwroot/render/environment/tests/korea_terrain.test.mjs \
  web/wwwroot/render/environment/tests/korea_environment.test.mjs

bin/test-in-process Pathfinder RapierV2RuntimeDesignTests \
  RapierAerodynamicsIntegrationTests WaveOffThenStoppedTrapRecordsSetbackWithoutCleanMastery \
  SnapshotHotFrameTests MeshNavSnapshotTests
```

The standing refuter's documentation and diameter/budget objections are addressed
above. Its visual-evidence objection remains an explicit validation limitation:
full Chromium (`headless: true, channel: "chromium"`) exited with **SIGABRT before
opening a page** in this sandbox. No new screenshot, viewport-fit result, GPU
qualification or hardware performance claim is available. Claude's hardware
capture is still needed to accept readability at the three distances. Cursor's
additional scoped review was blocked by its guard: `cannot verify helper process
identity`. No approval, capacity or sandbox rule was bypassed.

Logs: `/tmp/pathfinder-readability-node.log`,
`/tmp/pathfinder-readability-inprocess.log`, `/tmp/pathfinder-readability-browser.log`,
`/tmp/pathfinder-readability-web-build.log`, `/tmp/pathfinder-readability-cursor.log`.
The installed battery admission policy ran through the existing
`/tmp/pathfinder-power-run.py` state-directory adapter; AC was confirmed. No server
or browser remains running. No push, deployment or stamp occurred.
