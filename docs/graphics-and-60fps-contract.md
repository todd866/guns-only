# Graphics and 60 fps contract

## Product promise

Guns Only targets a rock-solid 60 fps while improving the picture. “60 fps always” is a product
SLO for a qualified device, browser, viewport, quality tier, and foreground sortie. It is not a
physical guarantee for every computer, thermal state, background workload, driver, display mode,
or software renderer.

A graphics change is shippable only when it preserves flight readability and passes the same frame
contract in the authored environment lab and a real dynamic flight. A prettier frame that misses
delivery is a regression; a faster frame that removes mission-essential cues is also a regression.

## Foreground frame contract

An eligible production sample is wholly inside an `ACTIVE` sortie, outside pause and incident
replay, with the document visible. Entering or leaving eligibility resets the partial telemetry
window. The hardware flight harness is stricter: its headed page must also retain focus throughout
the leg. Ready, loading, menus, pause, replay, and background-tab deltas do not qualify or condemn
a build.

Every eligible five-second telemetry window and each measured hardware-harness leg must satisfy:

| Measure | Acceptance |
| --- | ---: |
| Delivered FPS | at least 59 |
| p95 frame delivery | at most 18.5 ms |
| p99 frame delivery | at most 22 ms |
| Frames over 18.5 ms | at most 3% |

The hardware harness also retains a `MAX <= 100 ms` catastrophic-hitch guard. It is a safety
ceiling, not permission to spend 100 ms occasionally. Median frame time is diagnostic but is not
an acceptance gate because a 16.7 ms median can conceal an unusable tail.

## Supported-device qualification

“Supported” is earned by evidence, not inferred from the `mobile`, `balanced`, or `desktop` label.
A qualification record must identify the physical device, CPU, GPU and driver, OS, browser
version, display refresh mode, viewport, device-pixel ratio, selected quality tier, power/thermal
state, build identity, renderer string, and test date.

For each claimed tier, run both:

1. the authored hero/environment lab at its production pixel cap and feature set; and
2. the fixed two-leg flight harness on a hardware renderer, including the low-level
   terrain-streaming leg.

The contract must pass on a quiet, foreground machine in at least two repeat runs, with the same
quality features production will ship. SwiftShader and headless software results can expose CPU
hitches but cannot qualify frame rate or GPU cost. A new browser, driver, resolution class, or
material graphics feature requires requalification. Until a class has a named passing record, its
60 fps status is unknown rather than assumed.

## Engineering budgets

The 16.67 ms display interval is the design budget. The 18.5 ms acceptance boundary is scheduling
tolerance, not extra work to spend. These are initial allocation ceilings for attribution and
tuning; the end-to-end contract above remains authoritative.

| Owner | Budget |
| --- | --- |
| Main-thread work, total | p95 at most 12 ms; p99 at most 15 ms |
| Normalized simulation | at most 8 ms per delivered frame |
| Non-simulation JS (`snap`, multiplayer, telemetry, DOM, view, UI) | combined p95 at most 4 ms |
| Terrain decode/build on the main thread | sliced to at most 2 ms per frame; any single task over 8 ms is a defect |
| GPU render work | p95 at most 12 ms; p99 at most 15 ms |
| Browser/compositor/video reserve | preserve at least about 4 ms inside the 16.67 ms interval |

CPU and GPU overlap, so their budgets are not additive. Component percentiles are also not
additive; use them to locate ownership, then judge the delivered frame. The existing simulation
governor already uses an 8 ms normalized budget. RAF telemetry and phase probes expose delivery
and main-thread ownership, but production does not yet record GPU timer queries. Until
non-blocking GPU timing exists, the GPU budget is verified indirectly by hardware qualification
and cannot be diagnosed from a production perf row alone.

## Quality adaptation order

Never degrade flight truth: aircraft and threat silhouettes, tracers, gunsight/HUD readability,
terrain collision, low-level orientation cues, mission landmarks, and authoritative simulation
remain intact.

Production currently uses three cause-aware mechanisms:

1. simulation-attributed pressure reduces optional AI lookahead work;
2. sustained frame pressure can lower 3D render resolution within the tier’s pixel bounds; and
3. the general frame governor reduces terrain streaming radius through 32/20/12 km, then disables
   shadows and nonessential scenery, then reduces ambient scenery further.

The Ukraine low-level orientation layer is retained when ordinary ambient scenery is shed. Recovery
is slower than shedding to prevent visible oscillation. New quality levers belong after cause
measurement: use resolution/post effects for GPU pressure, streaming radius and sliced work for
terrain/CPU pressure, and AI reduction only for simulation pressure. Do not hide an unknown hitch
by indiscriminately lowering every setting.

## Graphics and generated-video admission

Every major visual addition needs an authored reference, an implementation description, tier and
fallback behavior, and before/after captures from the real production camera and sky. Its
performance report must include the feature active, not merely the surrounding scene.

A Rapier launch video may be blended into gameplay, but it is a deterministic shipped asset—not a
live generative request. Before generation, lock:

- shot order and duration, camera position/lens/motion, transition frames, and the exact gameplay
  moment each shot covers;
- Rapier geometry, markings, launcher mechanics, scale, exhaust/debris behavior, terrain,
  weather, lighting, palette, and prohibited visual errors;
- output resolution, frame rate, color space, codec, alpha/matte strategy, loop/cut rules, audio
  ownership, and a non-video fallback;
- model/version, prompt and negative prompt, seed or variation identity, source references,
  rights/provenance, generation date, accepted take, and final asset checksum.

Review the storyboard and still frames before spending on motion generation. Playback acceptance
requires seamless first/last-frame color and camera matching, no simulation or control
discontinuity, and no synchronous per-frame decode or pixel copy on the main thread. Instrument
presented and dropped video frames with `requestVideoFrameCallback`, mark launch-active perf
windows, and re-run hardware qualification. Until those video metrics and a fallback exist, the
blend remains an experiment rather than production content.

## Breach workflow

Production emits a perf row for each eligible five-second window with FPS, p95/p99/MAX, the 18.5 ms
miss count/rate and longest streak, phase timings, quality/governor state, render/scene counters,
terrain queues, and launch state. Routine report-only telemetry summarizes contract pass rate,
worst tails, quality tiers, launch failures, and dominant failed phases without returning player
identifiers.

When a window fails:

1. confirm build, quality tier, renderer, viewport, and whether coverage is partial;
2. separate simulation, other main-thread, terrain/streaming, and likely GPU pressure using phase
   maxima, scene/resource counts, queue depth, resolution, and governor state;
3. reproduce on the same qualified hardware with the feature and workload active;
4. change one owning budget or quality lever, then run focused tests, the environment lab, and both
   hardware flight legs; and
5. do not promote the visual change until every acceptance measure passes, or explicitly narrow
   the supported-device claim.

Telemetry is evidence, not omniscience. Five-second windows can be dropped under extreme queue
pressure except for the newest failed-contract anchor; bounded summaries can be partial; RAF cannot
separate GPU execution from compositor or video decode; and users can create workloads outside the
qualified envelope. These limitations must be reported, not converted into a claim that no breach
occurred.
