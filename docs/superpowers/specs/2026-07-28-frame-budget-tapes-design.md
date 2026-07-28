# Frame-budget tapes — agent post-flight triage

Date: 2026-07-28  
Status: accepted  
Related: closed-loop frame governor in `web/wwwroot/app.js`, `web/wwwroot/render/telemetry/frame_perf.js`, `tools/perf/flight_frame_harness.mjs`

## Goal

Rock-solid **60 fps** on production hardware, especially F-22 guns-only dogfight (beat 7). There is **no on-screen FPS HUD**. Telemetry exists so an agent (or human) can read a tape after a test flight and fix the hottest phase.

## Locked decisions

| Decision | Choice |
| --- | --- |
| Debug surface | Post-flight only — enriched `k:"perf"` rows + harness JSON under `analysis/perf/` |
| Long-frame threshold | **22 ms** (aligned with `FRAME_GOVERNOR_LATE_FRAME_MS`), not 50 ms |
| Success gate (Metal) | Per harness leg after 15 s warmup: **p95 ≤ 22 ms** and **% frames >22 ms ≤ 1%** |
| SwiftShader | CPU-hitch detection only — never quote as frame rate |
| Ukraine mid-ring | LOD0 = full soft stand; LOD1 = thinner stand + ~half density |

## Contract

### Perf rows (every 5 s wall time)

- Percentiles: `frame_ms_p50` / `p95` / `max`
- `long_frames` and `frames_over_22ms` (alias under the 22 ms contract)
- Phase averages/max from the RAF loop: `sim`, `snap`, `mp`, `tele`, `dom`, `view`, `ui`
- Load context (once per window): draw calls, triangles, geometries, textures, programs, scene objects, `governor_level`, `stream_radius_m`, `scenery_suppressed`, `micro_required`, `radar_alt_ft`, `engagement`, `bandit_alive`

### Harness artifact

```text
dotnet publish web/GunsOnly.Web.csproj -c Release
# stage Ukraine atlas pages into publish wwwroot (see bin/preview-web)
node tools/perf/flight_frame_harness.mjs
→ analysis/perf/<iso>-beat7-flight.json
→ analysis/perf/<iso>-beat7-flight.md
```

Fixed profile: beat 7 / `?program=first-merge`, high AGL control then low turning terrain leg. Combat kills respawn and continue — the gate measures world frame cost, not duel outcome. Each leg discards the first 15 s before gating.

## Triage order

1. Hottest `*_ms_avg` / `*_ms_max` phase on the failing leg.
2. Load context: governor already at terminal? stream radius? scenery shed?
3. Fix that phase (amortise / shed / reduce work); do not guess fill-rate when `sim` owns the burst.
4. Re-run harness; compare JSON.

## Known dogfight signature

High/low legs on Metal: p50 stays at vsync while Ace lookahead bursts own `sim_ms_max` (40–50+ ms). View stays ~1–2 ms. Governor often already at level 4 / 12 km. Fix path is kernel lookahead cadence / prediction substep / horizon — not more scenery shedding.

## Square terrain edge (fog / stream)

Ukraine theatre apron sits at the **authored** edge (±131 km for v2), not at the camera's streamed disc. Shared/dogfight streams ~48 km while fog used to stay open to ~560 km → sky hole past the last chunk (dead-straight square in clear air). `visibleWorldRadiusM` now returns the streamed radius until chunks reach the apron; Rapier-scale (~145 km) stream may reopen fog to the far horizon.

Ukraine terrain mid-field haze is intentionally thin (painterly). That thinning alone still left the disc silhouette readable, so the terrain shader also forces warm haze opaque approaching `uWorldEdgeM` (= `visibleWorldRadiusM`). Soft-world below-horizon and altitude fog stay warm dusty — never cool blue ocean void past the disc.
