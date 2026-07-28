# Flight frame harness

Publish the app, then run the automated two-leg flight:

```sh
dotnet publish web/GunsOnly.Web.csproj -c Release
node tools/perf/flight_frame_harness.mjs
```

The harness serves `web/bin/Release/net8.0/publish/wwwroot`; `web/wwwroot` is not a runnable
Blazor WASM publish. It opens a **headed** Chromium window, foregrounds it, starts fixed beat 7
(seed 7), holds a 60-second control leg near 9,000 ft AGL, then descends closed-loop and holds a
60-second high-speed terrain leg near 2,000 ft AGL. It fails if the page becomes hidden or loses
focus, if either leg captures fewer than 600 animation-frame deltas, if the aircraft leaves the
profile, or if the low leg does not stream new terrain ranges.

Every run prints `UNMASKED_RENDERER_WEBGL`. The harness first tries a real GPU (ANGLE Metal on
macOS) without `--disable-gpu`. It uses SwiftShader only if the real-GPU launch fails. The first
software attempt is also headed. If the host cannot launch any headed browser (for example, a
locked-down or display-less CI worker), the final fallback is headless SwiftShader; it is accepted
only while Chromium reports the page visible and focused and the minimum RAF count is met.

**SwiftShader warning:** SwiftShader is software rasterisation. Its milliseconds are **not a frame
rate** and say nothing about GPU or fill cost. SwiftShader output is labelled exactly
`CPU-hitch detection only — not a frame rate`. It remains useful for this terrain regression
because synchronous terrain geometry construction blocks the CPU main thread, but those numbers
must never be quoted as GPU/frame-rate measurements.

A hidden or background tab produces no useful `requestAnimationFrame` sample. Prefer a real
foreground display (a virtual display is acceptable in CI), and do not hide or minimise the
Chromium window while the profile is flying. The headless software-only fallback is not a
substitute for a hardware frame-rate run.

## Gates and configuration

Each leg reports frame count, p50, p95, p99, MAX, and the count/percentage over **22 ms**
(aligned with the closed-loop frame governor / `FRAME_PERF_LONG_FRAME_MS`). The gate uses only
MAX and long-frame percentage. It deliberately never gates on p50: a perfect 16.7 ms median
coexists with this regression.

Every run also writes an agent-readable report under `analysis/perf/`:

```text
analysis/perf/<iso>-beat7-flight.json
analysis/perf/<iso>-beat7-flight.md
```

Those files carry per-leg percentiles, `% >22 ms`, RAF phase averages (`sim` / `view` / …), and
load-context counters from `document.documentElement.dataset.framePerf` (governor level, stream
radius, scenery shed, engagement). Use them for post-flight triage — there is no on-screen FPS HUD.

Defaults:

- MAX: `100 ms`
- frames over 22 ms: `1.0%`
- measured duration: `60,000 ms` per leg (the low leg cannot be shortened below 60 seconds)
- minimum captured frames: `600` per leg

CLI flags and their environment equivalents:

| CLI | Environment |
| --- | --- |
| `--wwwroot PATH` | `GUNS_FLIGHT_WWWROOT` |
| `--leg-duration-ms N` | `GUNS_FLIGHT_LEG_DURATION_MS` |
| `--max-frame-ms N` | `GUNS_FLIGHT_MAX_FRAME_MS` |
| `--max-long-frame-pct N` | `GUNS_FLIGHT_MAX_LONG_FRAME_PCT` |
| `--min-frames N` | `GUNS_FLIGHT_MIN_FRAMES` |

Example CI invocation:

```sh
GUNS_FLIGHT_MAX_FRAME_MS=80 \
GUNS_FLIGHT_MAX_LONG_FRAME_PCT=0.75 \
node tools/perf/flight_frame_harness.mjs
```

`tools/perf/terrain_frame_probe.mjs` is the older short SwiftShader-only diagnostic. Treat all of
its timings as CPU-hitch evidence only, never as a frame rate.
