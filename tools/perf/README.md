# Flight frame harness

Publish the app, then run the automated two-leg flight:

```sh
dotnet publish web/GunsOnly.Web.csproj -c Release
node tools/perf/flight_frame_harness.mjs
```

The harness serves `web/bin/Release/net8.0/publish/wwwroot`; `web/wwwroot` is not a runnable
Blazor WASM publish. It opens a **headed** Chromium window, foregrounds it, starts fixed beat 7
(seed 7), settles for 15 seconds and then measures a 60-second control leg near 9,000 ft AGL,
then descends closed-loop, settles for another 15 seconds, and measures a 60-second high-speed
terrain leg near 2,600 ft AGL. It fails if the page becomes hidden or loses focus, if either
measured window captures fewer than 600 animation-frame deltas, if the aircraft leaves the profile,
or if the low leg does not stream new terrain ranges.

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

Each leg reports delivered FPS, p50, p95, p99, MAX, the count/percentage over the shared **18.5
ms** scheduling budget, and a compatibility diagnostic count over 22 ms. Hardware qualification
uses the same foreground-flight contract as production telemetry and the environment lab:

- delivered FPS: at least `59`
- p95: at most `18.5 ms`
- p99: at most `22 ms`
- frames over `18.5 ms`: at most `3.0%`
- MAX: at most `100 ms` as a separate catastrophic-hitch safety guard

The gate deliberately does not use p50: a perfect 16.7 ms median can coexist with a severe tail
regression.

Every run also writes an agent-readable report under `analysis/perf/`:

```text
analysis/perf/<iso>-beat7-flight.json
analysis/perf/<iso>-beat7-flight.md
```

Those files carry the effective contract, delivered FPS, percentiles, `% >18.5 ms`, the legacy
`>22 ms` count, RAF phase averages (`sim` / `view` / …), and load-context counters from
`document.documentElement.dataset.framePerf` (governor level, stream radius, scenery shed,
engagement). Use them for post-flight triage — there is no on-screen FPS HUD.

Defaults:

- MAX: `100 ms`
- frames over 18.5 ms: `3.0%`
- warmup: `15,000 ms` before each leg (discarded)
- measured duration: `60,000 ms` per leg after warmup (cannot be shortened)
- wall-clock capture: at least `75,000 ms` per leg with the defaults
- minimum measured frames: `600` per leg

CLI flags and their environment equivalents:

| CLI | Environment |
| --- | --- |
| `--wwwroot PATH` | `GUNS_FLIGHT_WWWROOT` |
| `--leg-duration-ms N` (measured window after warmup) | `GUNS_FLIGHT_LEG_DURATION_MS` |
| `--max-frame-ms N` | `GUNS_FLIGHT_MAX_FRAME_MS` |
| `--max-budget-miss-pct N` | `GUNS_FLIGHT_MAX_BUDGET_MISS_PCT` |
| `--min-frames N` | `GUNS_FLIGHT_MIN_FRAMES` |

`--max-long-frame-pct` / `GUNS_FLIGHT_MAX_LONG_FRAME_PCT` remain accepted for older automation.
They are aliases for the 18.5 ms budget-miss percentage; the >22 ms count is diagnostic only.

Example CI invocation:

```sh
GUNS_FLIGHT_MAX_FRAME_MS=80 \
GUNS_FLIGHT_MAX_BUDGET_MISS_PCT=1.5 \
node tools/perf/flight_frame_harness.mjs
```

`tools/perf/terrain_frame_probe.mjs` is the older short SwiftShader-only diagnostic. Treat all of
its timings as CPU-hitch evidence only, never as a frame rate.
