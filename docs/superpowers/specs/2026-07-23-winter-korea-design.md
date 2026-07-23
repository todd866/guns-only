# Making Korea read: terrain legibility first, then winter

Date: 2026-07-23

## Origin

Started from a landscape-photography reference
([@northlandscapes](https://www.threads.com/@northlandscapes) — Jan Erik Waider, Nordic/Arctic
aerial abstracts) and the question *"can we team fortressify some of this stuff somehow?"*, then
*"lets make the game winter"*. Partway through, the owner named the actual pain:

> *"our biggest issue right now, terrain-wise, is that nothing looks anything like Korea, and
> there aren't any cool valleys to go low flying in or mountains to fly around. Also given that
> it's kinda cartoony I don't mind making some really cool valley systems to fight through, like,
> not everything has to be 100% real."*

Other constraints stated in the same conversation:

- *"I don't wanna simulate blowing people up, we're killing abstract entities. Makes the graphics
  cheaper, reduces the classification, and if we do it right it's still horrifying."*
- *"it's gotta have rock solid performance, no framerate tanking."*
- *"currently the game is way too slow at rendering terrain."*
- *"I don't necessarily wanna go too hard on the christmas thing, but we can totally have it
  appear at times."*
- *"I don't mind if low flying is a bit dangerous… most of the low flying will be in drones."*
- *"Not entirely all snow, but it can be. Winter in Korea won't be entirely snowy anyways, but
  portions of it should be."*

## Diagnosis: the heightfield is not the problem

`content/packs/korea-1950s/environment/terrain/central-front-preview.png` is a source-derived
hillshade of the shipped heightfield. It is unmistakably Korea: dendritic ridge dissection
throughout, Hwacheon reservoir top right, the Imjin/Hantan system bottom left, and dense narrow
winding valleys — the terrain the owner is asking for.

**That preview renders at 128 m/px, the same spacing the game draws at LOD1** — which is the
floor on balanced and mobile tiers (`korea_terrain.js:244`, `minimumLevel = tier === "desktop" ?
0 : 1`). Resolution is therefore not the cause. The data is real Copernicus DEM GLO-30, built
through `tools/terrain/build_korea_terrain.py`, quantised to int16 decimetres with a water
sentinel. (`docs/low-level-playground.md`'s description of "the current procedural Korea surface"
is stale and should be corrected.)

The difference between that preview and the game is that the preview is a **hillshade** and the
renderer is not. Three causes, all in shading:

### 1. Terrain casts and receives no shadows

Shadow mapping is enabled and working: `app.js:3519` enables `shadowMap`, `3520` selects
`PCFSoftShadowMap`, `3561` creates the directional sun, `3973` sets `castShadow`, and
`shadow_stabilizer.js` stabilises the cascade. But `app.js:2793-2794` applies
`castShadow`/`receiveShadow` to the children of **loaded GLB models**. The terrain mesh is
constructed in `korea_terrain.js` as a raw `THREE.Mesh` and never receives either flag.

The entire legibility of the preview image is directional shadow. The renderer discards all of it.

### 2. The lighting floors shadow at 40%

`korea_terrain.js:99` computes `diffuse = 0.43 + 0.57 * max(dot(N, L), 0)`, and the stylized ramp
at line 126 is `0.40 + 0.30 * smoothstep(…) + 0.20 * smoothstep(…)`. The darkest possible slope
is 40% lit; all relief is compressed into the top 60% of the value range.

`docs/art-direction.md` justifies half-Lambert as TF2 practice, "so shadowed valley walls never
crush to black." That is correct *for TF2*, which derives value structure from rim light, ambient
occlusion and cast shadows. Applied to bare unshadowed terrain, half-Lambert does not soften
shadows — it deletes them.

### 3. Aerial haze consumes the remainder

`aerial = 1 − exp(−fogDensity² · d²)` at `fogDensity` 5.5e-5 gives 1 − exp(−1.21) ≈ **70% hazed
at 20 km** in the 1950s era. The 2030s 0.45 multiplier reduces this to ≈22%, which is why the
modern era already reads better.

### 4. Separately: the crop has no mountains

The AOI is `126.50–127.80 E, 37.85–38.75 N` — Kaesong / Iron Triangle / Hwachon — with
`simulationTruth.maximumHeightM` of **1517.5 m** over a 131 km square. Dissected hill country,
genuinely not dramatic.

The Taebaek spine and Sŏrak are in the **peninsula atlas that is already built and verified**:
5,679 land-bearing tiles across 40 pages at 8,192 m tiles / 257 samples = **32 m spacing**, twice
as fine as central-front's 64 m LOD0. It is gated at `app.js:166`
(`DEVELOPMENT_KOREA_ATLAS_MANIFEST_URL = null`) pending source-lock, licence-closure and
custom-host delivery review — not missing.

## The fix is the art direction

A hillshade is value structure, and value structure is the entire thesis of the reference
material and of `docs/art-direction.md`. The palette work is not cosmetic alongside the terrain
problem; it **is** the terrain fix.

Critically, this does not require shadow-mapping across a 131 km view. It requires:

- **In-shader hillshade** — the sun/normal term already exists; it needs the range to breathe.
- **Curvature ambient occlusion** — derivable from the heightfield at chunk build time as a
  per-vertex attribute (free at runtime) or from a screen-space normal derivative. Valleys go
  dark, ridges catch light. This is what makes dissected terrain legible.
- **Removing the value floor** — let slopes go genuinely dark, and use duotone *hue* separation
  to keep them readable rather than a brightness floor.
- **Retuned, layered haze** — the reference's signature is stacked ridgelines receding in
  discrete value bands, not a uniform wash. Cheaper than the current wash and more legible.

A handful of ALU ops, no shadow pass, no new assets.

## Performance

### Already landed: early-Z restored (commit `61f9d8a`)

An earlier draft of this spec claimed `logarithmicDepthBuffer: true` at `app.js:3514` was
defeating early-Z and proposed two-frustum rendering as the fix. **That claim was stale by the
time it was written.** Commit `61f9d8a` — "Land measured ground-level frame wins: early-Z back,
dead era math gone" — had already landed on `terrain-perf` and merged, and
`logarithmicDepthBuffer` no longer appears in `app.js`.

The landed fix is simpler than two-frustum: drop logarithmic depth outright and pull the near
plane to 0.06 m, which keeps the canopy rails inside the authored eye point while the standard
depth buffer holds distant ridgelines cleanly (verified by screenshot in that commit). Measured
same-machine with `terrain_frame_probe.mjs`:

| | p50 | p95 | max |
| --- | ---: | ---: | ---: |
| before | 333.5 ms | 400.6 ms | 549.9 ms |
| after | 316.6 ms | 366.3 ms | 366.9 ms |

These are SwiftShader software-rendered figures — the deterministic comparator, not GPU-
representative. That commit also gated the period parcel tint outside the 1950s era and off
desktop tiers, which was the single largest win: the shader's most expensive fragment term was
being computed and then discarded by the era mix.

Two of the three fill-rate mitigations in `korea_terrain.js` therefore remain: the weak-tier LOD
floor (line 240-244) and the `FrontSide` group split (line 344-348). **The LOD floor is what
denies balanced and mobile tiers the 64 m surface**, and with early-Z restored it should be
re-measured rather than assumed necessary.

*Process note: the working tree moves under this session because other agents are active in it.
Re-verify any file-line claim against current HEAD before acting on it.*

### The harness and the gate

`tools/perf/terrain_frame_probe.mjs` already exists and is the instrument: a deterministic
15-second low-altitude terrain-facing RAF window in headless SwiftShader, run after
`dotnet publish web/GunsOnly.Web.csproj -c Release`.

Note that `render/visual/adaptive_resolution.js` runs an EMA frame-time controller against
`targetFps`. **A regression will not appear as dropped framerate — the controller absorbs it as a
quietly softer image.** Measurements must pin resolution scale, not read FPS.

Measure from a detached worktree, not the shared working tree — concurrent agents move files
under a running measurement. Run the probe from the main tree (which has `web/smoke/node_modules`)
and point `--wwwroot` at the worktree's published output.

**Baseline at HEAD `68bb19e`**, two consecutive runs, Chromium headless / ANGLE SwiftShader,
1280x720@1x:

| run | p50 | p95 | max |
| --- | ---: | ---: | ---: |
| 1 | 333.10 ms | 383.40 ms | 549.50 ms |
| 2 | 332.90 ms | 383.30 ms | 566.70 ms |

p50 and p95 reproduce to within 0.2 ms; `max` is noisy and should not be used as a gate signal.

**Open finding — the early-Z win looks partly regressed.** HEAD contains `61f9d8a`, whose measured
post-fix p50 was 316.6 ms, yet HEAD measures 333.0 ms in a quiet machine — back at that commit's
*pre*-fix figure of 333.5 ms.

A same-session interleaved A/B was run against a `61f9d8a` build in a second detached worktree:

| interleaved run | build | p50 | samples |
| --- | --- | ---: | ---: |
| 1 | `61f9d8a` | **316.70 ms** | 48 |
| 1 | HEAD | 366.50 ms | 43 |
| 2 | `61f9d8a` | 450.10 ms | 33 |
| 2 | HEAD | 366.80 ms | 34 |

Run 1's `61f9d8a` p50 of 316.70 ms reproduces that commit's claimed 316.6 ms to 0.1 ms, which
validates the instrument. Run 2 is contaminated — sample count collapses from 48 to 33 and
`61f9d8a` measures 450 ms having measured 316.7 ms minutes earlier — so the machine acquired
another load partway through.

Three of four comparisons put HEAD slower than `61f9d8a`, by 16 ms in the quiet pair and 50 ms in
interleaved run 1; the one disagreeing comparison is the most contaminated. **Treat this as a real
signal of a regression somewhere in Builds 83-86, with an unestablished magnitude.** Confirming it
needs an otherwise-idle machine. It is not a blocker for phase 2, but it should be bisected before
any phase claims a frame-time win.

### LOD reality at flying altitude

`TIER_DISTANCE_METRES` (lines 11-15) places LOD0 within 24 km on desktop, 16 km balanced, 10 km
mobile. The probe telemetry at 5,972 ft on the **desktop** tier reports resident levels of
`lod2: 20, lod1: 38, lod0: 6` out of 64 chunks. Even on the best tier, nearly everything visible
is at 128 m or 256 m spacing.

The distance thresholds therefore dominate what the pilot sees, not the weak-tier floor. This is a
further argument for ordering shading before resolution: a hillshade improves every LOD, while
resolution only improves the near field.

> **Gate: no phase may regress the probe's frame time against the baseline captured before phase
> 1.** Phases that remove work (snow gating out the parcel `sin()` block, bare trees, dropped
> field rows) are expected to improve it.

## Doctrine changes

### Abstract entities only — amends `docs/art-direction.md`

`docs/art-direction.md:28-33` currently directs that 1950s Korea be rendered "as realistically and
unsparingly as the platform can manage: burning villages, wrecked columns, the human ruin of that
war." **That clause is retired.** No human casualty rendering in either era; ground targets are
machines and shapes — vehicle columns, revetments, AAA sites, bridges, structures.

This is already most of the way true in canon: `docs/drone-war-design.md` makes the 2030s
opposition attritable strike drones, and `docs/robot-airframe-design.md` makes the apex tier an
uncrewed UCAV. The amendment extends it to the 1950s ground war.

The two-era thesis survives and sharpens:

> Nobody is ever rendered. In 1950 that is because you are four miles up doing 500 knots — the
> abstraction is imposed **by physics**. In 2030 it is because the interface decided you should
> not see — the abstraction is imposed **by design**. The two frames look identical. The reasons
> are opposite.

Gore would have weakened this by letting the player think the 1950s one was "real". Three
practical wins follow: no character art, no classification problem, less fragment and geometry
work.

### Winter is a world property, not a mode

No season system, no runtime toggle, no season×era matrix. `SummerColumn` becomes `WinterColumn`,
the scenery profiles take winter values, the pack ships winter. Summer, if ever wanted back, is a
second authored pack. YAGNI.

### Christmas is a reserved capacity, not doctrine

Build the mechanism; leave it off by default. Two places it earns its keep:

- **A December scenario.** The history is exact: Chosin Reservoir ran 27 Nov – 13 Dec 1950, the
  Hungnam evacuation completed on Christmas Eve, 24 Dec 1950 with the waterfront demolished behind
  the departing fleet, and MacArthur's November promise had been that the troops would be **home
  by Christmas**.
- **IFF tagging.** Green friendly, red hostile, in the 2030s crew station. A psychological-safety
  rendering doctrine would colour-code friend and foe cheerfully; this is the horror and the
  function in one mechanism, justified year-round.

## Authored terrain

Owner sanction: *"I don't mind making some really cool valley systems to fight through… not
everything has to be 100% real."*

This changes `docs/low-level-playground.md`'s approach from procedural drainage carve to **level
design on a real substrate**. Authored valley systems are carved into the authoritative
heightfield where the game needs them — marquee runs, gorges sized to the airframe's turn radius,
ridge gates, wire and bridge spans — while the surrounding terrain stays sourced Korea. The result
is Korea-shaped, with the flyable corridors designed rather than found.

Constraints are unchanged from `docs/low-level-playground.md`: one grid feeds collision truth,
GCAS, the bandit's floor sense and the renderer; the carve is seeded and bit-identical; goldens
update as a labelled terrain-version change.

Sequencing note: an authored 300 m gorge dies at 128 m sampling exactly like a real one, so the
LOD floor must lift before authoring is worth doing.

## Winter

Four of five layers are already authored data; only terrain is hardcoded.

| Layer | Where it lives now | Winter change |
| --- | --- | --- |
| Sky, sun, cloud colour | `environment/atmosphere.material.json` | JSON values |
| Ocean colour + optics | `environment/ocean.material.json` | JSON values |
| Scenery density/colour per era | `KOREA_SCENERY_PROFILES` | JS data values |
| Weather, wind, cloud physics, icing | `sim/Environment/KoreaWeatherPresets.cs` | new column + presets |
| Terrain palette | hardcoded GLSL, `korea_terrain.js:74-131` | rewritten in phase 1 |

New assets are three: a frozen-water material, a bare-tree LOD, an emissive window treatment.

**Atmosphere.** Every preset in `KoreaWeatherPresets.cs` shares one sounding, `SummerColumn`
(line 11), at 288.2 K / 101 180 Pa. Winter Korea under the Siberian High is near 263 K and
1030 hPa: ρ ∝ p/T gives (103000/101180)·(288.2/263) ≈ **1.115**, roughly 11% denser air at the
deck. More thrust, more lift, better sustained turn and climb, lower TAS for a given IAS — all
already modelled. Plus north-westerly monsoon flow through the existing `Wind()` helper and real
icing through the existing `icingHazard01` field. Re-baselines `FlightModelTests`, `AirDataTests`,
`AtmosphereTests`, the AutoGCAS corridor tests and carrier recovery, as a labelled change.

**Snow is patchy, not a sheet.** The Siberian High makes Korean winter cold and dry; the inland
west stays largely brown, frozen and bare, while snow concentrates on the Taebaek spine, the east
coast under sea-effect snow, and the north. Mask = f(elevation, aspect, 1−steepness, world
position), where region derives from `vTerrainWorldPosition` — already a varying — as a
low-frequency gradient plus a large-wavelength noise term. No new attribute or texture. Where the
mask is high, the parcel-tint block is skipped.

**Wind scour** = `dot(normal.xz, windDirection)`: one dot product, snow held on lee slopes and
stripped from windward faces, producing the directional streaking that runs through the reference.

**Frozen watercourses** ride on the authored valley work, not before it.

Sky and ocean are JSON edits: low winter sun, long shadows, cold colour temperature, high-coverage
low stratus, blue cloud shadows, dark slate sea with white-grey foam and no warm glint. Frozen
reservoirs and sea ice are *cheaper* than the animated ocean — no scrolling normals.

## Readability

Deliberately not guaranteed. Owner direction is that whiteout and flat light may bite, and most
low-level work is drone-flown. Obstacles keep their existing bold-silhouette and marker treatment;
no additional contrast floor is authored.

## Hard boundaries

- **The HUD stays an instrument.** The 600+ assertion contract does not move. No festive chrome,
  no seasonal symbology.
- **Determinism holds.** Seeded carve and scenery, bit-identical; goldens re-baselined as labelled
  terrain/atmosphere version changes.
- **The content-pack boundary holds.** The look ships as profile data and presentation-layer
  shaders. The atlas does not become browser-reachable until it passes the same release gate as
  the rest of the pack.

## Order

Phase 1 is the owner's actual complaint and is cheap. Everything after it is gated on the
measurement.

1. **Baseline.** Capture `terrain_frame_probe.mjs` frame time and a reference screenshot against
   current HEAD, in a detached worktree so a concurrent agent's edits cannot move the measurement.
2. **Terrain legibility.** Curvature AO, hillshade range, remove the value floor, retune haze into
   discrete distance bands, terrain palette out of GLSL into the visual profile. This is the
   "doesn't look like Korea" fix.
3. **Re-measure the LOD floor.** With early-Z restored by `61f9d8a`, test whether balanced and
   mobile can now afford the 64 m LOD0 surface. Assumed necessary under the old depth
   architecture; not re-tested since.
4. **Atlas region swap** for real mountains — Taebaek / Sŏrak — through the pack release gate.
5. **Authored valley systems** on the real substrate, with obstacle spans.
6. **Winter**: `WinterColumn` and presets with the golden re-baseline, then snow mask, wind scour,
   sky/ocean/scenery data, frozen water.
7. **Reserved-capacity mechanisms** — accent slot, emissive windows — built and left off.
8. **Doc amendments**: `docs/art-direction.md` gore clause retired and thesis re-founded;
   `docs/low-level-playground.md` corrected on "procedural" and on carve-versus-authoring.

## Verification

Structural green does not prove pixels (Builds 60/62). Every visual phase ships only after
rendered screenshots are read from the HUD scenario harness, at minimum: cruise altitude for the
ridgeline read, valley floor for low-level obstacle legibility, and both eras. The frame probe
runs before and after every phase touching a shader, a scenery profile or the LOD floor.

## References

- Mitchell, Francke, Eng — "Illustrative Rendering in Team Fortress 2", NPAR 2007.
- [Hungnam evacuation](https://en.wikipedia.org/wiki/Hungnam_evacuation) —
  [Naval History and Heritage Command](https://www.history.navy.mil/research/library/online-reading-room/title-list-alphabetically/h/the-hungnam-and-chinnampo-evacuations.html),
  [ARSOF History](https://arsof-history.org/articles/v7n1_hungnam_page_1.html).
- `docs/art-direction.md`, `docs/low-level-playground.md`, `docs/drone-war-design.md`,
  `docs/robot-airframe-design.md`, `docs/korea-environment-data-sources.md`,
  `tools/terrain/README.md`, `tools/perf/README.md`.
