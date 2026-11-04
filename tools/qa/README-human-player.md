# Human-paced player acceptance

Smoke tests wait for internal ready flags (often up to 120 s) before they click, so they miss what a person sees: an enabled **Fly Guns Only** button at ~2.7 s, then a main-thread freeze where clicks do nothing, then many seconds to reach flight with no visible feedback.

This tool clicks the start control the moment it *looks* ready—visible, enabled, and hit-testable at its centre—and records freezes, input delay, click feedback, and time-to-play.

## Run

From the repo root (Node 24):

```sh
node tools/qa/human-player.cjs
node tools/qa/human-player.cjs --base http://127.0.0.1:8787 --journey f22 --out ./human-player-out
```

Playwright is loaded from `web/smoke/node_modules/playwright`. The browser launches headless full Chromium:

`chromium.launch({ headless: true, channel: 'chromium', args: ['--mute-audio'] })`

## Journeys

| Id | URL (under `--base`) | Start control | In-game |
|----|----------------------|---------------|---------|
| `f22` | `/?program=first-merge&audioQa=silent` | `#ready-start` | `#ready-screen` not visible and centre hit is `CANVAS` |
| `cobra` | `/cobra-lab/?audioQa=silent` | `#mission-brief-start` (Cobra brief, not F-22 `#ready-start`) | `#mission-brief` hidden and centre hit is `CANVAS` (`#scene`) |
| `rc` | `/rc/?audioQa=silent&telemetry=off` | `#start` if visible; otherwise already in game | `__gunsOnlyRC.snapshot()` exists and `paused === false` |

## Thresholds (CLI overrides)

| Check | Default |
|-------|---------|
| Click feedback | ≤ 300 ms |
| Input delay (pointerdown/click) | ≤ 250 ms |
| Freeze after start visible | none > 1000 ms (gaps > 250 ms are recorded) |
| Time to play | ≤ 15 s |

Exit code `1` if any journey fails. One compact line per journey on stdout; JSON under `--out` (default `./human-player-out`) plus screenshots at control-visible, click+1 s, and end.

## Tests

Pure-function coverage only (no browser):

```sh
node --test tools/qa/human-player.test.mjs
```

## What it injects

Before navigation, `page.addInitScript` installs:

- A `requestAnimationFrame` gap recorder (gaps **> 250 ms** → freeze events with start time and duration).
- Capture-phase `pointerdown` / `click` listeners comparing `performance.now()` to `event.timeStamp` (input delay).

Failed requests are recorded except `/telemetry` aborts. Journeys are never auto-retried.
