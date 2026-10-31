# Holistic audit: graphics and content pipelines (31 October 2026)

Written for the next implementing agent (Opus 5.5) to action. Author: Claude Fable 5.1, session
`session_018KCkS3CAQvY3taYwVuXCpz`. Nothing in the game was changed; this file and
`evidence/rc-look-2026-10-31/` are the only additions.

## 0. Read this first

The product is now two games with two pipelines, two renderers, two release paths and two frame
bars, sharing one vendored copy of three.js r160 and almost nothing else:

| | Flight (Guns Only, F-22) | RC (Saucer Springs / Area 51½) |
| --- | --- | --- |
| Branch that ships | `main` (CI `verify.yml`, `bin/check`, `bin/deploy-web`) | `feature/rc-next`, **162 commits ahead of `main`, never merged** (`bin/deploy-rc`, no CI) |
| Live build | Build 402 (`55285d61`) per `docs/STATUS.md` on rc-next; `docs/STATUS.md` on `main` still says 394 | RC build `8d3dedd5` is the branch head; last known live RC from rc-next was `005796e1` (30 Oct) |
| Renderer | `render/visual/*` (HDR target, SMAA, bloom, ACES/AgX, adaptive resolution, stabilised shadows) | `rc/main.js` (ACES 1.15, PCF-soft 2048 sun + 1024 contact sun, hemisphere, PMREM "studio" env, fog, own `adaptive-resolution.mjs`) |
| Assets | `content/packs/*` with JSON-schema manifests, LOD budgets, licence sets, `tools/assets/validate-manifests.mjs` | `web/wwwroot/rc/assets/` (429 files, 39 MB) validated by `tools/rc/validate-assets.mjs`; sources `.blend` committed in two places |
| Terrain | Copernicus DEM atlas (Korea), Ukraine atlas hydrated from guns-only.com in CI, Okanagan CDEM; Python | USGS 3DEP 257×257 TIFF (`build-terrain.py`) + OSM GeoJSON tiles (`prepare-world.mjs`); Python + Node |
| Frame bar | 59 fps, p95 ≤ 18.5 ms, p99 ≤ 22 ms (`docs/graphics-and-60fps-contract.md`) | p95 ≤ 33 ms (`tools/rc/native/check-app-frames.sh`, `check-release.cjs`) |
| Visual gate | `tools/look-gate` (warn mode, thresholds calibrated 29 July) | none; screenshots for a human |
| Native | none | `native/saucer-springs`: WKWebView hosts the packaged web build; a separate Metal ray-traced **viewer** of a static exported world, not wired to the game |

Everything below follows from that table. The highest-leverage work is not a shader; it is
making the RC trunk real, making the RC source readable and bundled, and giving RC the asset,
visual-profile and gate machinery the flight game already has.

## 1. What I looked at and measured

- Read `docs/STATUS.md`, `graphics-asset-pipeline.md`, `graphics-and-60fps-contract.md`,
  `rc-reference-and-pipeline.md`, `rc-design-request-ledger.md`, `art-direction.md`,
  `adr-0004`, `native/saucer-springs/WATER-AND-LIGHTING.md`, `docs/design/adventure/README.md`,
  the 5 September holistic audit, and the RC renderer, streaming, materials, hero and packaging
  code on `feature/rc-next` (checked out detached in a scratch worktree, since removed).
- Rendered the current `feature/rc-next` head headless on the M5 with
  `tools/rc/look.cjs` (hardware GPU, `audioQa=silent`). Frames and timings are in
  `evidence/rc-look-2026-10-31/`. Caveat: all three `heavy-slot`s were busy when the run
  started, so the tail numbers are load-contaminated; the draw-call counts are not.

| Track | Draw calls | p50 | p95 | max |
| --- | ---: | ---: | ---: | ---: |
| hub (skatepark) | 309 | 16.7 ms | 116.7 ms | 883 ms |
| housing | 943 | 16.7 ms | 33.3 ms | 82.6 ms |

  Commit `d7117eca` (30 Oct) reports visible draw objects at spawn 2,371 → 1,226 and the app at
  p50 17 / p95 21 ms at pixel ratio 1.45. Housing at 943 calls is still the heaviest street.
- Looked at older frames for comparison: `.rc-build-review/mobile-current/laptop.png` (25 Oct),
  `evidence/rc-open-world/verified-world-tour/road-to-housing.png` (23 Oct), and the flight
  look-gate corpus `tools/terrain-look/shots/steppe-low.png` (July). I did **not** render a
  fresh F-22 frame; flight observations below are from code and the July corpus only.
- Repo state: 97 local branches (246 including remote refs), 41 worktrees (six `codex-improve-*` all detached at `47207df5`),
  27 stashes, 164 untracked paths in the main checkout including ~0.9 GB of `.rc-*-review`
  render dirs that `.gitignore` does not cover (only `.rc-dist/` is), 13 GB `recordings/`,
  315 MB `evidence/`, 132 MB `reference/`, and `content/packs` (456 MB) duplicated into
  `web/wwwroot/content` (456 MB).

## 2. What the current frames say (RC, today)

`evidence/rc-look-2026-10-31/hub-arrival.png`, `hub-turn.png`, `housing-run.png`,
`housing-turn.png`.

What works: the toy scale reads; the warmer afternoon sun and colour grade (`ea9fe9f4`) help;
procedural concrete with cracks is convincing at the skatepark; graffiti atlases carry the park;
palms, the blob tree and the garage door are the right register for a 6-year-old.

What holds the picture back, in order of visual cost:

1. **No ambient occlusion or contact darkening anywhere.** Walls meet ground with no crease;
   props float visually even when physically grounded. This is the single biggest "flat"
   signal in every frame.
2. **Shadows are blocky.** `housing-turn.png`: hard aliased shadow silhouettes on the asphalt.
   One 2048 map over a 256 m streaming radius cannot resolve a 0.4 m car. The flight renderer
   already has `render/visual/shadow_stabilizer.js`; RC has none, and no cascades.
3. **Untextured vertical surfaces.** The red house in `housing-run.png` is a flat vertex colour.
   World tiles only get procedural `DataTexture` maps for six ground kinds
   (`open-world/materials.mjs`); authored district GLBs mostly ship with material colours.
4. **Vegetation repeats.** One deciduous billboard cluster (`foliage/deciduous-cluster.webp`)
   at the same orientation everywhere; grass is sparse crossed cards with a hard
   green-to-sand edge; the berm in `hub-turn.png` shows a green terrain wedge **poking
   through the bowl wall** (a real defect to fix, not a style note).
5. **Sky and air are thin.** A gradient plus a few flat cloud cards; linear fog only. The
   flight game has `soft_world_atmosphere.js` and `tactical_clouds.js`; RC reuses neither.
6. **Effects are placeholders.** Skid smoke is a row of flat grey discs; stones are grey
   low-poly blobs repeated with no size variety; kerbs are a saturated pure red.
7. **Nothing fades with distance.** No LOD anywhere (`THREE.LOD` 0 uses, `BatchedMesh` 0 uses,
   13 `InstancedMesh` sites, 65 `mergeGeometries` sites). Districts are 5.5 to 7.7 MB GLBs
   drawn at full detail from any distance.

The owner's bar (memory: "textures + foliage + GI before showing", "never worse than the
browser side-by-side", "gently rolling ground reads real") maps directly onto items 1 to 5.

## 3. Findings by area

### 3.1 Branching and trunk: the RC game has no trunk

`feature/rc-next` is 162 commits ahead of `main` and 0 behind. `main` has not received an RC
commit since PR #147 (27 Oct). Consequences:

- CI (`verify.yml`) runs only on pushes to `main` and `pivot-hardening` and on PRs. RC code has
  not been through CI for a week of daily releases.
- `docs/STATUS.md` diverges by branch (`main`: "Updated 2026-10-22, Production Build 394";
  rc-next: "Updated 2026-10-26, Build 402, next candidate 415"). Neither records the live RC
  revision. The 5 September audit already flagged ledger drift; it is worse now.
- Every agent that starts on `main` (as this session did, on `fix/deploy-headroom`) sees a
  ten-day-old RC and re-derives facts.

Action: make `feature/rc-next` the trunk. Either fast-forward `main` to it (it is 0 behind, so
this is a clean fast-forward of 162 commits) after one CI run, or open the PR and merge. Then
retire the branch name. Add a `docs/STATUS.md` line for the RC live revision, written by
`bin/deploy-rc` (it already writes an evidence folder; have it append the ledger line too).

### 3.2 RC source is hand-minified; bundle it and un-minify it

`web/wwwroot/rc` is 179 non-test modules, 1.2 MB of source, written in a dense style
(longest line in `main.js` is 2,229 characters; one-letter identifiers; semicolon-joined
statements). It ships unbundled: the browser requests those modules individually, and
`tools/rc/package-rc.mjs` rewrites imports and copies vendor files to keep `/rc/` self-contained.

This style is a tax on every agent that touches RC (and on review quality), and it buys nothing
a bundler would not buy better. `tools/rc/native/bundle-sim.sh` already uses esbuild for the
native sim. Action:

1. Add an esbuild step to `package-rc.mjs`: one hashed entry bundle plus code-split chunks for
   districts and the adventure layer; keep ESM semantics; keep `__gunsOnlyRC` test hooks.
2. Then reformat the source (Prettier, 100 columns) in one mechanical commit, verified by the
   existing 67 RC unit tests plus `tools/rc/*.test.mjs`, and by byte-comparing the esbuild
   output before and after (esbuild output is deterministic for equivalent ASTs; if it is not
   byte-identical, diff the two and confirm only whitespace changed).
3. Re-measure cold boot with the recipe in `docs/rc-touch-loading.md` (5 Mbps / 100 ms: 22.2 s
   to first drivable frame today). Expect a cut from fewer round trips alone.

Do not do step 2 without step 1: un-minified unbundled source would ship bigger.

### 3.3 RC asset pipeline: sources, derivatives and the served tree are one directory

`web/wwwroot/rc/assets/` contains, side by side: authored `.glb`; gzip delivery copies `.glb.gz`
(regenerated by `compress-models.mjs` on package, but also committed); `.png` originals and their
`.webp` delivery derivatives (`park-paint-atlas`, `deciduous-cluster`); Blender sources
`heroes/*.blend` and a `B-52.blend1` backup inside the served tree, while other sources live in
`assets/rc/{models,districts,heroes}/*.blend`. `package-rc.mjs` has a `SKIP` regex to keep the
sources and `.gz` out of the dist; that works, but the source of truth is ambiguous and the
repo pays twice for every asset.

The flight side already solved this properly (`docs/graphics-asset-pipeline.md`): schema-checked
manifests, LOD contracts with measured triangle/material budgets, licence scope, SHA-256,
optional KTX2 + Meshopt via glTF-Transform, and three browser labs. RC has none of it, yet the
vendored loaders (`KTX2Loader`, `meshopt_decoder`, basis) are already in `web/wwwroot/vendor`.

Action:

1. Move all `.blend`/`.blend1` out of `web/wwwroot/rc/assets` into `assets/rc/`. Delete
   `.blend1`. Make `tools/rc/validate-assets.mjs` fail if a source file is found under the served
   tree.
2. Treat `.webp` and `.glb.gz` as build outputs of `package-rc.mjs`, not committed files.
3. Give RC an asset manifest using `content/schemas/asset-manifest.schema.json` (or a trimmed
   RC profile of it): asset id, LODs, budgets, licence, hash. Run `validate-manifests.mjs` in
   `bin/deploy-rc`. The district GLBs (housing 7.7 MB, bx 7.2 MB, school 5.5 MB, landmarks
   6.3 MB) are the first candidates for authored LOD1/LOD2 and KTX2 textures.
4. Record provenance for generated art the ADR-0004 way (prompt, tool, date, encoding) for the
   graffiti and paint atlases if that is how they were made; today `assets/rc/concepts/` does
   this for the buggy concept only.

### 3.4 RC rendering: specific, bounded improvements (web first, per the parity rule)

Each item names the three.js r160 facility or existing flight module to reuse, and the gate.

1. **Shadows.** Replace the single 2048 sun map with 3 cascades (CSM addon in three examples, or
   a hand-rolled two-cascade: 0–40 m at 2048, 40–250 m at 2048) and port
   `render/visual/shadow_stabilizer.js` (texel-snapped light frustum) so shadows do not swim.
   Gate: `housing-turn.png` shadow edges no longer stair-step at 1280×800; p95 unchanged.
2. **Ambient occlusion.** Two layers. (a) Bake AO into vertex colours for district and hero GLBs
   (`tools/rc/blender/bake_hero.py` already bakes corner AO for heroes; extend to districts).
   (b) For streamed world tiles, bake a cheap ground-contact darkening at tile build time in
   `open-world/render.js` (darken vertex colour within 0.3 m of any building footprint edge and
   under kerbs). Avoid a screen-space AO pass until the frame bar is 18.5 ms with headroom.
3. **Surfaces.** Author four small hand-painted atlases (stucco, brick, roof tile, concrete)
   as KTX2 and apply them to building walls with world-space planar UVs (the tile builder
   already projects UVs by dominant axis). Keep the toy palette; the goal is micro-contrast,
   not photo-realism.
4. **Vegetation.** Three or four deciduous cluster variants, random yaw and ±15 % scale per
   instance, a simple vertex-shader wind (reuse the flight scenery's wind contract), and grass
   as `InstancedMesh` cards with density falling off by distance. Fix the terrain-through-wall
   wedge at the bowl (`hub-turn.png`) by clipping the grass tile against the district collider
   the same way roads are clipped (`subtractBox` in `district-entrances.mjs`).
5. **Sky and air.** Import `render/environment/soft_world_atmosphere.js` and
   `tactical_clouds.js` into RC behind a flag, replace linear fog with the shared height-aware
   extinction so the far desert closes in haze (owner: "world should feel infinite" needs a
   horizon that invites, not a wall). Add a sun disc and the golden-hour preset that is already
   on the open list.
6. **Effects.** Replace skid discs with soft particles (depth-fade sprites, 2 textures), add a
   dust puff on landings. Pool them; the flight `render/effects` pool is reusable.
7. **Draw calls.** Convert the per-tile bucket meshes and props to `BatchedMesh` (available in
   r160) and the hero/district GLBs to the LOD contract from 3.3. Target: housing < 400 calls.
8. **Gate it.** Extend `tools/rc/look.cjs` into an RC look gate: fixed cameras, reference stills
   committed under `evidence/rc-look/<date>/`, a perceptual diff (reuse
   `tools/look-gate/compare.mjs`), and the frame-time contract. Every change above ships with
   a before/after pair rendered through the same pipeline (memory: compare like with like).

### 3.5 One visual profile for both games

Owner direction (memory `visual-house-style-f22`): every mode must look like the same game and
the F-22 renderer is the reference. RC re-implements adaptive resolution
(`rc/adaptive-resolution.mjs` vs `render/visual/adaptive_resolution.js`), tone mapping and
exposure, fog, sun colour and shadows, with different numbers. Action: lift
`render/visual/profile.js` + `visual_runtime.js` into a shared module that RC consumes
(tone mapping, exposure, sky/haze colours, shadow stabiliser, adaptive resolution policy),
with RC-specific overrides declared in one JSON profile. This is the cheapest way to keep the
two games visually one, and it removes a second copy of each bug.

### 3.6 Native app: the Metal renderer is a viewer, not a renderer swap

`native/saucer-springs/Sources/SaucerSprings/Game.swift` hosts the packaged web build in a
`WKWebView` (good: no drift). `main.swift` + `Shaders.metal` is a separate 30 KB program that
loads a static `RCW2` export produced by driving the browser build and dumping the scene
(`tools/rc/native/export-world.cjs`), then rasterises it with ray-traced sun shadows, AO and
TAA. Nothing moves in it: no cars, rivals, pickups, lights, UI, day/night or streaming.
`WATER-AND-LIGHTING.md` plans FFT water, ReSTIR DI, DDGI, ReSTIR GI/PT on top of this.

The missing piece is not lighting, it is **scene synchronisation**: a protocol by which the
JS game tells the Metal view, every frame, which instances exist, where they are, what
material and emissive state they have, and where the camera and sun are. Without it, nothing
built in the Metal program can ship, and the parity rule (web first, native only swaps the
renderer) cannot be honoured.

Action, in order:

1. Write the scene-sync design (one page): instance table with stable ids, transform deltas
   per frame via `WKScriptMessageHandler` or a shared `ArrayBuffer` through a custom scheme;
   camera and sun; material table from the asset manifest (3.3); HTML UI stays in the web view
   composited above the Metal layer.
2. Prototype it with the car and the streamed tiles only; measure the message cost.
3. Only then: per-pass GPU timestamps (already in the plan), then ReSTIR DI for the night
   scenes.

If 1 to 2 are not affordable this month, say so and park the Metal program; spend the budget on
3.4, which improves the app immediately because the app *is* the web renderer today.

### 3.7 Frame contract: two bars, and the RC one is loose

Flight: 59 fps, p95 ≤ 18.5 ms. RC: p95 ≤ 33 ms (`check-app-frames.sh`, "the website's release
threshold"). The owner's 30 Oct complaint ("basically unplayable") was fixed by halving draw
calls. Keep the 33 ms gate as the floor but add the flight contract as the target and report
both on every `bin/deploy-rc` run, with the pixel-ratio the adaptive policy settled on
(1.45 in the app today, so the app is already trading resolution for time).

### 3.8 Terrain and world data: four pipelines, three languages

Korea (Copernicus, Python, atlas + R2 publish), Ukraine (atlas hydrated from production in CI),
Okanagan (CDEM, Node + Python), RC (USGS 3DEP 257×257 TIFF via PIL; OSM GeoJSON via Node).
They are all reasonable individually. Shared things worth extracting: the source-lock /
hash / provenance manifest (`content/sources/*-source-lock.json`), the "refuse to overwrite an
unmarked output directory" guard in `prepare-world.mjs`, and a single `tools/world/README.md`
that lists every pipeline, its inputs, and the command that reproduces its output. Do not
merge the code; document and share the contracts.

RC-specific: the DEM is 257×257 over roughly 32 km, so about 125 m per sample before
`playable-terrain.json` smoothing. Spirit Mountain and the "rolling ground" direction want
finer relief near the player. A second 3DEP pull at 1/3 arc-second over the base footprint,
blended under the existing coarse grid, is a one-day job in `build-terrain.py`.

### 3.9 Content pipeline: every new place is bespoke code

Venues are JavaScript modules of 10 to 25 KB each (`petting-zoo.js`, `sewer.js`,
`spirit-mountain.js`, `boardwalk.mjs`, `playground.mjs`, `halloween.js`). The adventure design
(`docs/design/adventure/README.md`) wants dozens more places, seasonal layers, dungeons and an
upside-down mirror of the whole map, and the telemetry from the child's first long session
(`691a3d34`) says discovery density and reachable horizons matter most.

That volume does not fit "one agent writes 20 KB of geometry per venue". Action:

1. **Prop kit + placement data.** A catalogue of reusable props (fences, lamps, signs, benches,
   bins, pumpkins, arches, rails, ramps) as one KTX2-textured kit GLB with the manifest from
   3.3, and venues as JSON placement files (prop id, transform, variant, collision flag).
   `BatchedMesh` draws them; the existing bake pipeline produces the kit.
2. **Authoring.** Blender collections exported through `bake_hero.py` for hero pieces; for
   placement, a tiny in-game editor behind `?edit=1` that writes the JSON (the game already
   exposes `__gunsOnlyRC.scene()`), so a placement pass takes minutes, not a code review.
3. **Seasons as data layers.** `halloween.js` becomes `seasons/halloween.json` listing props and
   material swaps; `season.mjs` already picks the season.
4. **Discovery as data.** Rumours, specimens, pumpkins and chest tables as JSON consumed by
   `catalog.mjs`, with the "feel infinite" metrics (distinct places per session, time between
   discoveries) computed by `tools/rc/analytics-report.mjs` and shown on every release.

### 3.10 Flight side (unverified today; from code and the July corpus)

- `tools/look-gate` is in warn mode with thresholds calibrated 29 July against stills that
  show flat polygon land-cover and blob trees (`steppe-low.png`). Builds 383 and 385 changed
  lee-slope darkness and horizon fade. Refresh the corpus from the current build, then flip the
  F-22 desktop capture to fail mode so visual regressions block.
- The 5 September audit's items on startup footprint (159 modules, 4.3 MB uncompressed from
  `app.js`) and `app.js` at 12,848 lines still stand. The same esbuild step from 3.2 applies.
- `content/packs` and `web/wwwroot/content/packs` are both tracked (65 and 69 files) and both
  carry the gitignored terrain-atlas payload, 456 MB each. The staging step is documented, but
  two full copies of the payload per checkout (and per worktree, via `worktree-prep`) is the cost
  that made AGENTS.md rule 9 necessary. Consider staging the runtime closure as a build output
  or hard-linking the payload (APFS clones are free; `worktree-prep` already does this).

### 3.11 Repository hygiene that slows the pipelines

- Add `.rc-*/` to `.gitignore` (today only `.rc-dist/`); the main checkout carries ~0.9 GB of
  review renders as untracked files, which makes `git status` useless as the collision check
  `AGENTS.md` asks agents to use.
- Prune the six detached `codex-improve-*` worktrees at `47207df5` and the prunable Codex
  worktree; run a salvage-first branch audit (per-file supersession check, as done for the
  July in-flight branches in `docs/2026-07-31-*` handoffs) against the unmerged branches (see the 31 Oct branch salvage audit) before
  deleting anything.
- `recordings/` is 13 GB in the working tree. It is gitignored, so it is safe for git, but it
  sits in a tree that `worktree-prep` and `remote-run` mirror by file walk; move it to
  `~/.local/state/guns-only-recordings` and symlink if any tool still reads it.
- `evidence/` grows by a folder per deploy (`evidence/rc-open-world/deploy-*`, 15 folders on
  23 Oct alone). Keep the manifest, drop the PNGs after 30 days, or move them out of the tree.

## 4. Prioritised plan

Each phase ends with evidence the owner can look at: a before/after pair rendered through the
same pipeline, the hardware frame numbers, and (for content) the child-session telemetry.

**Phase 0, one day: foundations.**
1. Fast-forward `main` to `feature/rc-next` after a CI run; retire the branch; ledger line for
   the live RC revision written by `bin/deploy-rc`. (3.1)
2. `.gitignore` the review dirs; prune the detached worktrees. (3.11)
3. Move `.blend` sources out of the served tree; make `.webp`/`.glb.gz` build outputs. (3.3)

**Phase 1, two to three days: readable, bundled RC.**
4. esbuild in `package-rc.mjs`; byte-stable output check; then Prettier the source. (3.2)
5. RC asset manifest + validator in `bin/deploy-rc`. (3.3)
6. RC look gate with reference stills and perceptual diff. (3.4.8)

**Phase 2, one to two weeks: the picture.**
7. Cascaded, stabilised shadows. (3.4.1)
8. Baked AO on districts/heroes; tile contact darkening. (3.4.2)
9. Shared visual profile module consumed by both games; atmosphere and clouds into RC. (3.5, 3.4.5)
10. Surface atlases on walls; vegetation variants + wind + instanced grass; fix the bowl wedge. (3.4.3, 3.4.4)
11. Soft-particle effects. (3.4.6)
12. `BatchedMesh` tiles and LOD for district GLBs; housing under 400 calls; report both frame bars. (3.4.7, 3.7)

**Phase 3, in parallel once Phase 1 is in: content throughput.**
13. Prop kit + placement JSON + `?edit=1` placement tool; seasons and discovery as data. (3.9)
14. Finer DEM under the base; rolling ground near the player. (3.8)

**Phase 4, decision required: native.**
15. Scene-sync design and prototype, or park the Metal program and say so. (3.6)

## 5. Do not

- Do not flatten terrain to hide seams; close gaps with skirts (owner memory).
- Do not fork a second sky, server or renderer path for a harness (one-engine doctrine).
- Do not accept a green test as visual evidence; render and look, light and dark where UI is involved.
- Do not retune shared constants for one vehicle; split the fixture.
- Do not `git add -A`; stage paths. Do not deploy without the owner's go.
- Do not run more than one heavy job at a time on this Mac; use `heavy-slot`, prefer
  `remote-run` for suites, and check `~/.local/state/METERED_LINK` before pulling toolchains.

## 6. Commands the next agent will need

```sh
# Current RC frames and draw calls on the hardware GPU (headless, silent)
HEAVY_SLOT_LABEL=rc-look PLAYWRIGHT_MODULE=$PWD/web/smoke/node_modules/playwright \
  heavy-slot -- node tools/rc/look.cjs evidence/rc-look-$(date +%F) hub housing bx

# RC release gate against a package (hardware renderer required)
node tools/rc/package-rc.mjs --out .rc-dist && \
  RC_QA_ROOT=.rc-dist heavy-slot -- node tools/rc/check-release.cjs evidence/rc-release-local

# App versus Chrome frame gate (needs the built app and the installed package)
tools/rc/native/check-app-frames.sh 1440x900 15

# Flight asset validation (the contract RC should adopt)
node tools/assets/validate-manifests.mjs --strict --pack content/packs/korea-1950s/pack.json
```

## 7. Progress ledger

Kept current by the agent actioning this audit. Commits are on `feature/rc-pipeline` (cut from
`feature/rc-next` at `a981342a`) unless stated. Nothing here is pushed or deployed.

| Date | Item | Where | State |
| --- | --- | --- | --- |
| 2026-10-31 | 3.3.1 Blender sources out of the served tree; validator refuses sources there; `.rc-*/` ignored | `9d9d2fa2` | done |
| 2026-10-31 | Audit + today's frames committed | `6723efec` | done |
| 2026-10-31 | 3.2 esbuild bundle mode in `package-rc.mjs` (opt-in `--bundle`, no source edits; 203→7 JS files, 224→29 requests to first drivable frame) | `18ba0381` | done |
| 2026-10-31 | 3.2 `bin/deploy-rc` packages in bundle mode after check-release, check-new-player and check-mobile passed on the bundled site (Apple M5) | `c8cb579d` | done |
| 2026-10-31 | 3.3.3 served `assets/manifest.json` (44 entries: licence, provenance, sha256, budgets, single-LOD declaration) + `asset-manifest.mjs update/check` in the deploy gate | `b298fa66` | done |
| 2026-10-31 | 3.3.4 hero GLB provenance recorded (MIT, from the export scripts); gate runs the strict check, no unknown licences | `e1294ae3` | done |
| 2026-10-31 | 3.1 `bin/deploy-rc` writes the "RC live" revision line into `docs/STATUS.md` on production deploys | `fd5edb7a` | done |
| 2026-10-31 | 3.9.4 feel-infinite metrics in `analytics-report.mjs` (places/session, gaps, quiet stretch; proxy = first `visit` per place because `discover()` emits no event) | `5f935ea8` | done; add a real `discover` event in the game (rc-adventure agent) |
| 2026-10-31 | 3.4.8 RC look gate: six fixed views via `__gunsOnlyRC.place`, flight look-gate metrics + pixel MAD + edge ratio, thresholds at 5–10× same-build noise (warn), reference stills blessed | `26411441` | done |
| 2026-10-31 | 3.11 branch salvage audit; 37 fully merged local branches deleted (97→60); nothing unmerged touched | `5c6b4456`, main checkout | done |
| 2026-10-31 | 3.6 native scene-sync boundary written: what must exist before any Metal lighting ships | `af892086` | done (design) |
| 2026-10-31 | Character pipeline spike: rigged toy dinosaur (17 bones, idle/walk/run/jump), `open-world/characters.js` loader with cross-fades and Saddle socket, Blender + in-engine review renders (M2 Air check) | `f4b04586` | done; wiring = dark-world agent |
| 2026-10-31 | 3.11 six detached `codex-improve-*` worktrees removed (commit in `main`, nothing uncommitted) | main checkout | done |
| 2026-10-31 | 3.4.1 wedge: NOT terrain; it is the skatepark GLB's own turf berm (park_berm.py caps lawn only at FLOOR_EDGE; the quarter's wing wall is treated as a deck back). Also: a Blender 5.2 rebake doubles hub draw calls (467→1,059, join_visuals_by_material no longer joins) | rc-adventure finding; fixed in `park_berm.py` (deck grid points drop to the lowest nearby lawn so the joining triangle rises inside the deck; the quarter's south end wall is an exposed face), only 6 lawn points moved <5 cm; proud-triangle count 1,055→43; the Blender 5.2 un-join did NOT reproduce (41 primitives both ways, look.cjs call counts are noisy: 262–697 on one GLB), so `districts/common.py` now asserts one mesh per material and `skatepark.py` carries `VISUAL_PRIMITIVE_BUDGET=10`, exporting to a temp path first | `956dc070` | done |
| 2026-10-31 | 3.4.2 shadows: my diagnosis was wrong; the blocky shapes in housing-turn.png were skid-mark stamps turned to body yaw. Fix: continuous per-wheel tyre ribbons, pooled Points smoke, sun texel-snapped in light space (ported from `shadow_stabilizer.js`). No cascades (no evidence they are needed; a second pass costs). housing p95 16.8 ms, 453 calls | `55d7da26` on `feature/rc-adventure` (also closes 3.4.6) | done |
| 2026-10-31 | 3.4.3 contact darkening/AO, 3.4.4 vegetation (note: creosote clumps read as rows of green tents in desert-mountain ref), 3.4.7 BatchedMesh | rc-adventure agent, interleaved with the owner's queue | queued |
| 2026-10-31 | rc-adventure landed meanwhile: `f409e9b8` high-school interior, `def19c37` sound pass, `0a405db3` real `discover` telemetry event, `2dbcf460` minimap, `1f834b65` park skirts | `feature/rc-adventure` | done |
| 2026-10-31 | 3.4.5 sky/air profile, 3.9.3 seasons as data | dark-world agent declined (its instruction from Ian is the dark world); needs a hand-off from Ian or a window on main.js | open |
| 2026-10-31 | dark-world: dinosaur physics body 2.4× car, Lake Town outlaw gang; rigid-part T. rex is a placeholder for the rigged dino | `22415f71` on `feature/rc-dark-world` | done |
| 2026-10-31 | 3.8 terrain: a 1025×1025 3DEP pull (31 m) changes the 16 m grid's relief stddev only 6.09→6.11 m; the limiter is `build-playable-terrain.mjs` (pads at zero, 400 m blend, 10 %-of-distance cap). Tools made size-agnostic, candidate kept as evidence, data unchanged; experiment (cap ~25 %, blend 200 m) handed to rc-adventure | `48e788a4`, `docs/rc-terrain-relief.md` | done (finding) |
| 2026-10-31 | 3.9.1 prop kit (14 props, 3 materials, baked AO, COL_ proxies) + JSON placements drawn as InstancedMesh (39 items = 14 calls; ×8 = 14); example picnic area; Blender empties exporter | `1d05efcd`, `docs/rc-placements.md`; wiring = rc-adventure | done |
| 2026-10-31 | Dinosaur gallop clip (foot-true at 5.9 m/s at mount scale), all clips at 60 fps; mount live in the dark world with gallop | `d30e108d`; `e46e1c72`/`3ea17720` on `feature/rc-dark-world` | done |
| 2026-10-31 | rc-adventure also landed `d51e0523` Hot Wheels track at Loop Lake | `feature/rc-adventure` | done |
| 2026-10-31 | Owner: dark-world mounts are dinosaurs (toy rider, sub-real-size but much bigger mount) | `cd86b488` on `feature/rc-dark-world` | done |
| 2026-10-31 | 3.2 Prettier reformat | dropped: dense one-line JS is deliberate house style; Ian's call | decision |
| 2026-10-31 | 3.1 trunk: fast-forward `main` to the RC branch and push | needs Ian; note `feature/rc-adventure` is ahead of `feature/rc-next` and is what deploys | decision |
| 2026-10-31 | 3.10 flight look-gate corpus refreshed on the M5 hardware GPU (Build 415); July stills archived under `shots/2026-07-29/`; two new views (zoom-apex, combat-apex-72k); thresholds = measured + 10× SwiftShader-vs-M5 noise; mode **fail**; `bin/look` no longer forces warn and captures on hardware by default. Open: `bin/seen substance` now calls 4/5 views THIN (hazy sky = one dominant colour), advisory only, needs a framing/threshold decision | `0c44d1f2` | done |
| 2026-10-31 | Integration candidate `integration/rc-2026-10-31` (worktree `.worktrees/rc-integration`): dark-world `5a03f2c4` (= rc-adventure `d51e0523` merged by its author) + rc-adventure `8efd816a` + rc-pipeline; two trivial conflicts resolved (dinosaur design text kept; asset-contract entries unioned); example placement venue wired at attach (`979c51fd`); manifest 49 entries, strict check ok. First Air gate run at `979c51fd`: RC suite 614/614, bundle package, smoke, check-release, check-new-player all passed (tools tests 104/104 locally; 2 worker-only failures). Second run at `712ef0b5` (with the skatepark bake) in progress | `712ef0b5` | deploy candidate, pending Ian |
| 2026-10-31 | Owner: steam harvesting + farming, almost-Minecraft vibe, dig down to the portal layer and spawn in the light world. Dark-world agent built the dig (hold E on foot in the past; 0.5 m pixel blocks; portal layer drops you into the present upside down) `5fe5d4bb`; kit gained a steam-era farm set (9 props incl. windmill with a spinnable `windmill-head`, crop rows with a pumpkin variant; 13,283 tris, 3 materials, 141 KB gz) and a 56-item farmstead on the lake floor by Lake Town (31 draw calls) `d6f666a1`; both merged into the integration branch | `3a3feae1` | done; past-only placement = dark-world agent |
| 2026-10-31 | 3.4.2 baked contact AO in the shared district bake (16-ray corner AO vs own geometry + ground plane, clamp [0.55,1], min with the existing Cycles AO). Finding: districts already shipped Cycles corner AO as COLOR_0, so the gain is subtle (housing-street MAD 1.18/255); primitives unchanged; p95 unchanged. Perf finding: skatepark-bowl view = 1,350 draw calls, p95 33 ms (hub ~600, housing-corner 1,051) | `fa5897cf` | done; stronger values and the bowl's draw calls = rc-adventure |
| 2026-10-31 | 3.5 shared visual profile, extraction half: `render/visual/shared/{tone,atmosphere,sun,adaptive}.js` (pure, tested), RC numbers captured in `rc/visual-profile.json`, package-rc allowlist for the shared dir, swap recipe in `docs/rc-visual-profile.md` | `edb1dad4` | done; the swap in main.js = rc-adventure |
| 2026-10-31 | Dark world: farmstead placed past-only with era-gated colliders; integration merge needed a duplicate-import fix in runtime.js | `c8fb69d1`; integration `44e523a5` (amended) | done |
| 2026-10-31 | **Jake build candidate** `integration/rc-2026-10-31` at `ea0d7e19` (worktree `.worktrees/rc-integration`): dark-world `f4268bdc` (dig to the light world, farmstead past-only, story thesis, typing section) + rc-adventure `6dbba334` (RC Odyssey rename, golf cart at the clubhouse, draw-call culling; robot golf left out, not wired) + rc-pipeline through `b37af5a3`. Air gates: RC suite 619/619, bundle package, smoke, check-release, check-new-player, check-mobile all passed. Fixed views on the M5: all six ok vs reference, p95 ≤ 18.4 ms, bowl 1,112 calls, hub 478. Not pushed, not deployed; deploy via `bin/deploy-rc` from that worktree with Ian's go | `ea0d7e19` | ready |
| 2026-10-31 | Ian: "I want everything": trunk + push and the Prettier reformat approved. Integration branch pushed; **PR #148** to `main` (clean fast-forward, origin/main fully contained); launcher card renamed to RC Odyssey (flight side, needs a flight deploy) `46748065`; **Build 416** stamped `c3384df7` (release-identity test requires a stamp after runtime changes) | PR #148 merged 12:22 → `main` `d9e49c3a` is the RC trunk | done |
| 2026-10-31 | rc-adventure: 18-hole country club with clubhouse, minigolf (6 lanes), tennis, **robot golf** (E-hold swing, HUD, scorecard), cart moved to [-312, 2806] | `97bd6e38` on `feature/rc-adventure` | merging into `integration/rc-2026-10-31b` (author resolving conflicts) |
| 2026-10-31 | dark-world: typed messages (name the dino, Y to say, the sheriff asks your name), T toggles cowboy/dino in the past, a wild T. rex herd befriended by typing a name, design-doc pitch and themes | `8354f1a3` on `feature/rc-typing` (from integration `c01e4b73`) | suite running; next for 31b |
| 2026-10-31 | Three more dinosaur kinds (longneck, triceratops, raptor) on the shared rig contract for the herd | `0830ede3` (raptor 8.3k, longneck 9.3k, triceratops 9.9k, quetzal 9.4k tris; quetzal adds takeoff/flap/glide/land and wing bones; all ≤ 600 KB, 8 draw calls each in review) | done; herd + nest/flight wiring = dark-world agent |
| 2026-10-31 | 3.2 Prettier reformat of `web/wwwroot/rc` (owner-approved): 350 files, 23.5k → 61.3k lines; esbuild bundle: chunks byte-identical, `main.js` differs only in identifier tie-breaks (a no-rename build is identical); RC suite 634/634; fixed views unchanged (all six ok) | `6b387227` on `integration/rc-2026-10-31b` | done; peers rebase onto `dd9ac405` |
| 2026-10-31 | **PR #149** to `main`: club + robot golf, typed messages + herd, dinosaur roster, Prettier; **Build 417** stamped `4de61bcf` after the release-identity test caught the unstamped runtime change (same lesson as #148) | PR #149 | CI re-running; Air gates on `dd9ac405` in progress |
| — | sky/air + seasons-as-data (needs a hand-off from Ian), rc-adventure open items (trees/wind/grass, per-tile instancing, terrain relief, visual-profile swap) | | open |
| — | superseded row: 3.5 shared visual profile (needs a main.js window; rc-adventure pacing); rc-adventure open: trees/wind/instanced grass, per-tile InstancedMesh merging (r160 BatchedMesh lacks addInstance), terrain relief experiment (cap ~25 %, blend 200 m); sky/air + seasons-as-data (declined by the dark-world agent, needs a hand-off) | | open |
