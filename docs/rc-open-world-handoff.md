# RC open world — 23 October 2026

Local implementation on top of Build 396 (`50b80526`). **Not deployed and not visually accepted.**
The earlier agent's telemetry and packaging changes were already present and remain intact.

## Implemented

- `/rc/` now starts at the Main Gate in `?track=hub`. The real-scale Nellis source extract is
  compiled offline into 365 bounded, 256 m tiles (3.2 MiB), with ODbL attribution and no local
  filesystem paths in the distributed manifest. Roads, taxiways, runway markings, apron surfaces,
  building footprints, window bands, roofs and land-use areas are drawn in batches.
- The working set is a 5 × 5 tile neighbourhood. Empty tiles have visible ground; late requests
  cannot resurrect unloaded tiles; failed requests can retry. Physics waits at a loading boundary
  instead of allowing the car to drive through buildings that have not arrived. A continuous
  analytic ground plane remains under the vehicle during loading.
- Twelve discoverable destinations: Main Gate, Housing, BX, School, Red Flag, Hangars, Runway,
  WIC PlayPlace, Whoops, Golf, Petting Zoo and Dreamland. Discovery unlocks fast travel. The full
  map supports destination selection and road routing; the minimap follows the car.
- Six original events: Gate Guard, Ramp Rat, Hangar Hop, Runway Drag, PlayPlace and Whoops.
  Existing race opponents, weapons, countdowns, Kid mode and Furball are retained. Free-drive
  rivals patrol nearby roads using the same driver/physics; distant patrols respawn outside the
  immediate driving area as the player moves through the streamed world.
- The three existing authored districts remain available through the menu and world entrances.
  A Return to base action places the player back at the corresponding entrance. These are scene
  transitions, not a claim that the original district meshes have been seamlessly merged.
- Original landmark geometry: welcome gantry, gate guard, fighter rows, open maintenance bays,
  district exteriors, skate ramps, dirt tabletops, golf greens, a static aircraft collection and
  a hovering saucer. Jet shells are reused at aircraft scale with landing gear and collision.
- Garage: five existing jet shells and five liveries, saved across districts. The real player car
  is shown by an orbiting camera. Existing lifetime nose-art unlocks remain applied.
- Compact map/garage/help controls, keyboard focus handling, explicit event entry (E), map (Tab),
  garage (G), touch actions, local recovery and a camera obstruction check after smoothing.
  Lap records are separated by track, world event and difficulty; exploration hides the lap clock.

## Evidence and limits

- **144 tests passed, zero failures.** The complete RC Node suite is recorded in `evidence/rc-open-world/tests.txt`.
- Geometry tests construct the actual Three.js scene, check finite mesh data/budgets, and drive
  the **player** through all six events using ordinary inputs and strict checkpoints, with the
  new landmark collision present. Separate tests cover streaming, failure/retry behaviour,
  stale responses, building collision, surfaces, recovery, traffic, discovery and routing.
- `check-ui-runtime.mjs` loads the real modules and GLBs into a DOM with a **no-op GPU**. It checks
  boot, keyboard driving, pause, garage selection, help and map state for the hub, districts,
  world race and Furball. This is lifecycle/geometry evidence, **not a screenshot, a WebGL test,
  frame-rate evidence or visual approval**. Results are in `evidence/rc-open-world/runtime.jsonl`.
- Actual visual acceptance remains blocked: the current execution sandbox rejects local server
  binding (`listen EPERM`) and headless Chromium aborts. The available background browser cannot
  load local file URLs; its policy explicitly forbids a workaround. The attempted HTTP evidence
  server serves its own application rather than arbitrary files. The temporary browser tab and
  preview directory were cleaned up. No user's browser window was foregrounded.
- `tools/rc/check-world.cjs` is ready for a permitted environment: it serves files through
  Playwright request fulfillment (no listening socket), uses full Chromium headless, requires an
  identified hardware renderer, checks silent audio, drives, exercises the garage/map, and saves
  desktop/phone screenshots. It closes the browser in `finally`. Software rendering must be
  labelled separately and does not satisfy its hardware gate.

## Deliberate approximations / next acceptance

Building heights and the activity clearings are authored. The visible collidable game perimeter
is the bounded play window, **not the exact real Nellis fence**. There is no terrain elevation
survey, seamless housing-track merge, night cycle, garage performance tuning, Car Golf, bowling
or full aircraft catalogue in this change. The open world is a substantial playable foundation,
not a claim that every item in `area-51-design-bible.md` is complete.

Before release, run and inspect the real browser views: toy-scale contact, hangar roof silhouette,
readable signage, tile seams, driving visibility, map/garage phone layout and frame pacing. Drive
between several landmarks to inspect patrol respawn and streaming. Test a complete race and
Furball in-browser. Keep `?audioQa=silent`. The repo's `AGENTS.md` requires Ian's confirmation
before push/deployment; no push or deployment was attempted.

## Reproduce

```sh
node tools/rc/prepare-world.mjs /Users/iantodd/.local/state/area51-nellis/nellis.geojson
node --test web/wwwroot/rc/*.test.mjs tools/rc/*.test.mjs tools/rc/harness/*.test.mjs
RC_QA_MODULE_ROOT=/path/to/node_modules node tools/rc/check-ui-runtime.mjs 'track=hub'
heavy-slot -- node tools/rc/check-world.cjs
node tools/rc/package-rc.mjs --out .rc-world-review-dist
```

The optional DOM harness needs existing `jsdom` and `esbuild` packages at `RC_QA_MODULE_ROOT`.
No runtime package dependencies were added. The existing `tools/rc/build-world-tiles.mjs` and
`web/wwwroot/rc/telemetry.mjs` were uncommitted prior-agent files when this task began; include
those dependencies when eventually making a reviewed commit, without sweeping unrelated work.
