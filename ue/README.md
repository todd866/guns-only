# RC Odyssey in Unreal, in parallel with the web game

Owner direction, 4 Nov 2026: "surely we can do parallel development between UE4 and web. They
might even usefully inform each other." We use **Unreal 5** (UE4 is end-of-life and lacks Lumen,
Nanite and virtual shadow maps, which are the reason to do this at all).

## The rule: one game, two renderers

The owner's parity rule for the native app already says the native build hosts the same game
logic and only swaps the renderer. Unreal follows the same rule:

| Layer | Web | Unreal | Shared? |
| --- | --- | --- | --- |
| Game rules, physics, races, pickups, typed words | `web/wwwroot/rc/physics/*.mjs`, `sim.mjs` | the same JS, run in V8 via the Puerts plugin | **yes, one source** |
| Collision world | `physics/world.mjs` triangle grid (not mesh raycasts) | the same, inside V8 | **yes** |
| Models, districts, characters | Blender → GLB in `web/wwwroot/rc/assets/` | the same GLBs via Interchange glTF import | **yes** |
| World layout (district anchors, catalog) | `open-world/*.mjs` data modules | read from the same modules | **yes** |
| Rendering, lighting, effects | three.js r160 | Lumen, VSM, Nanite, volumetric clouds | no — this is the point |
| HUD / menus | DOM | UMG, fed the same FrameState | layout no, data yes |

Verified on 4 Nov (grep, not a model's word): every file in `rc/physics/` and `rc/sim.mjs` imports
no three.js and touches no DOM or WebAudio. Ground and collision are a triangle grid built from
the DEM and the districts' `COL_*` nodes, so the physics never needs a three.js mesh.
The full seam map (which modules are portable, which are entangled, and the proposed
`RenderAdapter` + `FrameState` interface) is in `docs/ue-parallel-seams.md`.

## How they inform each other

- **Unreal sets the look target.** Same-view Lumen renders (`ue/renders/`) sit beside the web
  frames (`ue/views/`); the web renderer chases them (baked AO, sky, fog, shadow softness), and
  the RC look gate can use them as reference stills.
- **Unreal can bake for the web.** Lightmaps/AO baked in Unreal can be exported as textures the
  web districts load.
- **The web's harnesses test both.** `tools/qa/human-player.cjs`, the RC race sweeps and the
  telemetry contract consume FrameState, so they can drive the Unreal build too.

## Phases

1. **Parity spike (now).** `ue/capture-web-views.cjs` records the web views with exact camera
   poses and district placement; `ue/unreal/parity_spike.py` imports the same district + buggy,
   lights it with Lumen and renders the same views. Deliverable: side-by-side stills.
2. **SimHost.** A headless runner of the existing physics/session/race modules at 120 Hz that
   emits FrameState — no three.js, no DOM. The web game adopts it first (pure refactor), so it is
   proven before Unreal depends on it.
3. **Unreal hosts SimHost.** Puerts runs it in V8; a C++/Blueprint `RenderAdapter` applies
   FrameState to actors; input comes from Enhanced Input. Drive the housing district in Unreal.
4. **Streaming world + districts**, then the dark world, characters and HUD.

## Running the spike

```sh
# 1. Web reference views (headless hardware Chromium; writes ue/views/<track>.json + PNGs)
PLAYWRIGHT_MODULE=$PWD/web/smoke/node_modules/playwright node ue/capture-web-views.cjs ue/views hub housing

# 2. Unreal (after UE 5.x is installed and a blank project exists with the Python Editor Script
#    Plugin and the Interchange glTF importer enabled)
"/Users/Shared/Epic Games/UE_5.x/Engine/Binaries/Mac/UnrealEditor.app/Contents/MacOS/UnrealEditor" \
  "$HOME/Documents/Unreal Projects/RCOdyssey/RCOdyssey.uproject" -unattended -nosplash \
  -ExecutePythonScript="$PWD/ue/unreal/parity_spike.py --repo $PWD --track housing"
```

Project `Config/DefaultEngine.ini` for the spike:

```ini
[/Script/Engine.RendererSettings]
r.DynamicGlobalIlluminationMethod=1
r.ReflectionMethod=1
r.Shadow.Virtual.Enable=1
r.GenerateMeshDistanceFields=True
r.SkinCache.CompileShaders=True
```

The Unreal project itself (binary `.uasset`s, tens of GB of derived data) lives outside git at
`~/Documents/Unreal Projects/RCOdyssey`; only these scripts and the text config are tracked.

## Known unknowns (check on the first run)

- The buggy's forward axis against the web yaw (`TODO(calibrate)` in `parity_spike.py`).
- Whether `take_high_res_screenshot` renders under `-RenderOffscreen`; if not, use a Movie
  Render Queue job with the same cameras.
- The open-world ground (DEM tiles) is not imported yet; the spike shows districts on their own.
- Heavy: shader compilation on first open takes a long time and runs hot. Do it while the owner
  is away from the laptop (`focus-guard active` exits 1).
