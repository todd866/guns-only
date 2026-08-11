# Render architecture: why we look worse than 2004 and cost more

Date: 2026-08-06
Status: design review with a costed plan. **No implementation authorised by this document.**
Base: `8540ee4` (live Build 265). Branch `docs/render-architecture`.

Related: [[graphics-fidelity-target]], [[bf-vietnam-graphics-reference]], [[visual-house-style-f22]],
[[cobra-bike-dont-use-terrain-engine]], [[terrain-legibility-diagnosis]], [[one-engine-doctrine]],
[[adaptive-world-radius-doctrine]], [[minimum-viable-hardware-project]], [[art-direction-tf2]],
[[cobra-bike-quality-bar]], [[descent-stutter-is-sim-side]], [[terrain-chunk-build-hitch]],
[[renderer-early-z-disabled]] (**stale — see §1.4**),
`docs/superpowers/specs/2026-07-29-soft-world-look-gate-design.md`

Owner, 2026-08-06: *"we have really bad graphics **and** really bad framerate on a very powerful
machine, it shouldn't be that difficult to improve on this."*

He is right about both halves. They are not the same defect, but they share a root:
**almost none of our rendering budget is spent on the things that make a frame look good.**

---

## 0. Headline

**We are not limited by how *much* we draw. We are limited by what we draw it *with* — and we
spend the GPU on the one axis that does not produce fidelity.**

**Scope, stated up front so this document is not misread as a framerate diagnosis.** The owner's
complaint has two halves and they are *related*, not identical. This document answers the
**graphics** half and the *fidelity-per-millisecond* half. It does **not** re-diagnose frame
rate: [[descent-stutter-is-sim-side]] attributes the stutter to sim-side CPU cost
(`sim_ms_max` 39–47 ms) and [[terrain-chunk-build-hitch]] to a ~9.5 ms main-thread chunk build,
and the `perf-attribution` agent owns the current numbers. **"Draw more" is not offered as a
framerate fix, and every stage below can make stutter worse if those CPU costs are still live** —
shadow casters, texture uploads and prop instancing all add main-thread and upload work. Stage 0
should not ship until frame attribution says where the time actually goes.

Four numbers frame it:

| | us | Battlefield Vietnam (2004, DX8-class, 128 MB GPU) | a 2026 browser sustains |
| --- | --- | --- | --- |
| draw calls | **15** (Cobra, hard cap, headroom 0) / 72–78 (F-22) | ~500–1,500 | 1,000–3,000 |
| triangles | **120 k** budget, 46 k terrain drawn (Cobra) | ~150–250 k | 3–5 M (we already draw 2.9 M at 60 fps) |
| terrain texture memory | **0 bytes** (Cobra, Weekend Ride), 1 texture (F-22) | ~100–200 MB | 500 MB+ |
| terrain fragment ALU | **~900 scalar ops/px** | ~10–20 ops + 4 texture fetches | — |

*Our column is measured or read from source (§1, §7). The Battlefield Vietnam column is an
**estimate** from platform class — DX8-era, 128 MB VRAM target, fixed-function-plus-simple-shader
terrain — not from that game's telemetry, which we do not have. It is offered as an order of
magnitude, and the argument does not depend on its precision: the gaps are 30× and unbounded,
not 20%.*

We have a 2004 game's *asset* budget and a 2015 game's *shader* budget. 2004 games looked better
because fidelity lives in assets, not in arithmetic.

The decisive measurement (§7, reproducible): the shipped Cobra basin fragment shading costs
**0.90 ms per full 1920×1080 coverage** on an Apple M5. **The same albedo function, baked into
three textures** and read back with 3 fetches, costs **0.093 ms** — **9.7× cheaper at equal
output**. That is a cost-at-parity result, not a fidelity result: it says the arithmetic buys
nothing a bake cannot deliver, and says nothing yet about *authored* art, which is the actual
prize. The bake is also the only one of the two that anti-aliases, because a texture has a mip
chain and `cobraNoise()` does not.

On whether we have room to draw more: `terrain_mesh_builder.js:8` records an 11 fps window at
**2.98 M triangles / 78 draw calls** against a 60 fps window at **2.91 M triangles / 72 draw
calls**. Geometry throughput is flat across a 5.5× frame-time swing. That falsifies *"we are
slow because we draw too much"* — it does **not** prove the GPU is idle, and §7 in fact budgets
0.9–3.4 ms of terrain ALU. The honest conclusion is narrower and still sufficient: **steady-state
raster throughput is not the binding constraint, so the fidelity plan is not blocked by it.**

**Two cautions on that row, both from sources this document must not quote selectively.** First,
the same comment (`terrain_mesh_builder.js:4-9`) says where the time *did* go: a ~9.5 ms
synchronous **geometry construction** per LOD0 chunk, with `geometries` climbing 88 → 126 in a
five-second window. Construction is precisely the axis stages 4 and 5 load — foliage instancing
and structure meshes are built, uploaded and evicted per chunk. Second, that telemetry is
**Build 112**; live is 265, and [[descent-stutter-is-sim-side]] records a later, partly
contradicting picture: `sim_ms_max` 39–47 ms as the dominant cost, plus a render-side ramp near
the ground where `view_ms_max` went **1.4 → 34.1 ms as draw calls went 33 → 248**. So drawing is
*not* free at low level, and the "72–78 draw calls" figure above is itself a high-altitude
number. **Every stage from 3 onward needs a construction-and-upload budget, not just a
fill budget.**

### The one thing we have been doing wrong

Every time a scene read flat, we added maths to the fragment shader. The Cobra basin shader is
the end state of that reflex: 10 value-noise lookups, **42 hash evaluations**, 12 `smoothstep`s
and 40 `mix`es per pixel, to synthesise detail that a 7 MB texture carries better, cheaper and
without shimmering. The file's own header argues the case honestly —
*"anything finer than ~250 m cannot exist in a vertex attribute"* — and it is correct that a
**vertex** attribute cannot hold it. It skipped the option the industry actually uses: a
**texture**. That single missing option is most of the gap in this document.

---

## 1. Honest current state

### 1.1 Cobra Canyon — `web/wwwroot/cobra-lab/main.js` (standalone page)

| | value | where |
| --- | --- | --- |
| draw calls | **15**, hard cap, `presentationDrawCallHeadroom === 0` | `cobra_canyon_presentation.js:30-52`; test `cobra_canyon_presentation.test.mjs:204` |
| triangles | 46,208 terrain (desktop) of a 120,000 budget | `COBRA_CANYON_TERRAIN_SEGMENTS` 92/120/152 |
| terrain | one 152² grid, **no chunking, no LOD, one draw call**, 105 m vertex spacing over 16 km | `cobra_canyon_presentation.js:571-640` |
| vegetation | 7 instanced render batches (2 `InstancedMesh` construction sites), 18–100 tris/instance, ≤1,330 instances | `cobra_canyon_asset_kit.js` |
| textures | **none, anywhere** | grep: zero `Texture`/`.map =`/`.glb` in `render/cobra/` |
| shadows | **none**; `renderer.shadowMap` never touched, every object `castShadow = false` | `cobra_canyon_presentation.js:388`, `asset_kit.js:966` |
| post | none — direct `renderer.render` | `cobra-lab/main.js:966` |
| AH-1G | 19 procedural box primitives, 11 Lambert materials, no texture, hidden in first person | `ah1g_presence.js` |

Basin fragment shader per pixel: **10 `cobraNoise` → 40 `cobraHash`, +2 standalone = 42 hashes;
12 `smoothstep`; 40 `mix`; 0 texture fetches.** Material is `DoubleSide` on opaque terrain —
back-face culling is off for no stated reason.

### 1.2 Weekend Ride — `web/wwwroot/weekend-ride/main.js` + `render/motorcycle/track_day_presentation.js`

The weakest scene in the product. It *does* have a rendering test —
`render/motorcycle/tests/track_day_presentation.test.mjs`, 8 cases, including a bound on ambient
marker counts under adversarial input (`:178`). What it has **no** equivalent of is Cobra's
`maxDrawCalls`/`maxTriangles` budget with a build-time failure.

- **~110+ individually-added meshes** against 6 instanced batches (beacons 20, start/finish 32,
  paddock/airfield 30, marshal posts 9, …). No budget constant, no draw-call assertion anywhere.
- The world is **flat**: `SURFACE_ELEV_M = 192.0`, ground is `PlaneGeometry(22000, 22000)` — two
  triangles. No heightfield at all.
- ~190–200 cone "trees" (`ConeGeometry(1,1,6)`, seeded LCG over 46 copses of 3–6), no billboards, no alpha test, no LOD.
- **`MeshStandardMaterial` everywhere with `scene.environment` never set.** PBR with no IBL is
  lit by one hemisphere light and one directional — which is precisely how you get plastic. This
  is a two-line defect, not an art problem.
- `receiveShadow = true` is set on grass, verge, patchwork, track and shoulder — but
  `renderer.shadowMap` is never enabled and no light casts. **Dead code pretending to be a feature.**
- Camera far plane **12 km** against a 22 km ground plane and an 8 km sky sphere: the ground's far
  corners are clipped, and the sky sphere is *inside* the ground plane.
- `FogExp2(0x9da99d)` against `scene.background = 0x78919a` — two different horizon colours.

### 1.3 F-22 / Rapier — `render/environment/korea_terrain.js` (3,084 lines)

The sophisticated one, and still short of the reference.

- Fragment shader: **44 `smoothstep`, 49 `mix`, 4 `terrainCloudNoise` call sites, 4 `texture2D`**
  (only one compiled era path runs at a time). Two of those cloud-noise sites sit inside the
  `regionalDistanceMix > 0.001` branch that is dead below 2,500 m AGL — so at low level, the case
  this document argues about, it is **two**.
- **The entire terrain has one texture**: `rapier-painted-ground-v1.webp`, and only when
  `sceneryEra === "ukraine-modern"`.
- The pre-265 regional weighting is **unchanged**: `regionalDistanceMix = 1 - uTerrainDetail01`
  is *exactly zero below 2,500 m AGL* (`korea_terrain.js:635-673`, `terrainDetail01` L79-85).
  Build 265 (`d3a0723`) did not fix that — it added an **inverse** near-field layer
  (`terrainSurfaceDetail`, L459-500) sampling the same texture three more times, full below
  2.5 km and zero above 7.5 km. Correct direction; it is a value/occlusion grain modulator
  (`albedo *= surfaceDetail.x`), not albedo, and it is **off entirely on mobile**
  (`SURFACE_DETAIL_STRENGTH.mobile = 0`).
- **Terrain chunk meshes never set `castShadow` or `receiveShadow`** (`build()`, L2063-2085) — so
  both default `false`. `korea_scenery.js` sets neither flag anywhere either: every procedural
  tree, building, field and pole is shadow-invisible in both directions.
- **The shadow deadlock**, exactly as suspected: `shadowModes: ["carrier", "replay"]`
  (`app.js:7729`), `combat` excluded, and **the exclusion is pinned by a test** —
  `production_graphics_wiring.test.mjs:67` asserts the source never matches
  `/shadowModes:[^\n]*"combat"/`. The combat shadow half-extent is **44 m** (`app.js:7787`),
  a cockpit-sized cascade. The rig itself is complete and good: PCFSoft, 512/1024/2048 per tier,
  a texel-snapping stabiliser (`shadow_stabilizer.js`), and a frame-governor shed path.
- **No post-processing in production.** `createDecisionSupportPostStack` (`app.js:5468-5488`) is
  a pass-through; `ThreeR160PostStack` (bloom/SMAA/output) exists and is unused.

### 1.4 The finding that contradicts our own memory

`renderer-early-z-disabled.md` records that `logarithmicDepthBuffer` was removed in `61f9d8a`
("early-Z back"). **It is back on, and pinned by two tests** — `app.js:7065`,
`production_graphics_wiring.test.mjs:384` and `:474`. The comment at L7061-7064 gives a real
reason (near 0.06 m / far 680 km, 24-bit linear LSB ≈ 400 m at 20 km slant, apron z-fighting)
and states the trade explicitly: *"Log depth costs early-Z."*

That is the multiplier on everything in §7. Writing `gl_FragDepth` disables early-Z rejection
**scene-wide**, so every occluded terrain fragment runs the full ~900-op shader before being
discarded. At low level over folded terrain, terrain-on-terrain overdraw of 2–3× is normal.
**A 900-op shader and no early-Z is a bad combination we chose twice independently, each time
for a locally good reason.**

The memory file should be corrected. *Assumption flagged:* I did not measure the actual overdraw
factor — that belongs to the `perf-attribution` agent, and this document's staging does not
depend on the number.

---

## 2. The gap to the reference, itemised

From the owner's three images. What actually carries the look, ranked by value-per-effort here:

**The ms column below is ESTIMATED and unmeasured**, except the texture row, which is scaled
from §7. It is offered to rank the stages, not to budget them. The shadow figure is the one most
worth distrusting: it is the cost case for stages 0 *and* 1, and it omits the per-fragment
PCFSoft tap cost added to a shader that already cannot early-Z out (§1.4).

| # | Feature | What it buys | Cost (ms @ desktop, **estimated**) | Memory | Difficulty here |
| --- | --- | --- | --- | --- | --- |
| 1 | **Cast shadows** | Contact, mass, time of day. Our own [[terrain-legibility-diagnosis]] named absent shadows as the primary cause of flat reads. In the village image the palm shadows *are* the composition. | **0.4–1.5 ms.** Cost is light-view *fill* of the cascade plus PCFSoft taps, not draw-call count — a 1,200 m cascade at 2048² is the variable, and the 15–78 draw calls are the cheap part | 2048² depth ≈ 16 MB | **Low.** Rig exists and works. Blocked only by a policy line and a test. |
| 2 | **Ground albedo/detail/splat textures** | Everything the eye reads as "ground" at low level: dirt roads, sand/grass transition, tracks, tonal variety at every scale. | **−1.3 ms/frame** (it is *cheaper* than what we do now): §7's 0.81 ms per *full 1920×1080 coverage*, scaled to a Retina frame at ~55% terrain coverage with no overdraw. Every other cell in this column is per-frame; this one was previously quoted unscaled | 7–23 MB VRAM, ~1–3 MB on the wire as WebP | **Low-medium.** Shader change is small; the pipeline (§6) is the work. |
| 3 | **Alpha-tested foliage** | The single biggest jump toward the reference. BFV's palms are cut-out cards with readable fronds; ours are faceted cones with no trunks. | **+1–3 ms.** Alpha test is fill-bound and cannot early-Z out *at all* while `logarithmicDepthBuffer` is on (§1.4), so this is the stage most exposed to that decision | 2–8 MB atlas | **Medium.** Needs an authoring pipeline and a sorting/LOD policy. |
| 4 | **Structures and props** | Human scale. A hut, a fence, a jetty tell you how high you are; a noise field never does. | +0.2–0.6 ms per 100 instanced props | 5–20 MB | **Medium-high.** No 3D model pipeline exists at all. |
| 5 | **Textured airframes** | The F-4 in the reference reads as an aircraft because of camo, panel lines and roundels. `createDrone` extrudes planforms and applies procedural grain. | negligible | 2–6 MB per airframe | **Medium.** `tools/assets/generators/aircraft-assets.mjs` already carries tri/draw budgets (12,000/5,000/1,800; 24/16/9). |
| 6 | **Effects** | The napalm fireball is a third of that frame's impact. Ours are minimal. | **+0.3 ms** for additive billboards alone; enabling the bloom path is a full-frame treatment at **+0.8–2 ms**, and is a separate decision | small | **Low-medium.** Additive billboards; the unused post stack's bloom would carry it. |

**Where we already match or beat the reference — do not spend here:** aerial perspective and
banded haze (better than BFV's), palette discipline, sky construction, the 1.87/radius fog law,
and the shadow *rig*. With the single exception of cast shadows — a feature we have built and
switched off — **the whole gap is asset-shaped.**

---

## 3. Migration path

The owner's proposed order was (a) shared terrain engine → (b) shadows → (c) textures →
(d) foliage → (e) structures. **I agree with (c)(d)(e) and want to challenge (a) and (b).**

### The challenge to "shared terrain engine first"

`korea_terrain.js` is not one thing. It is a **streaming/LOD/manifest/atlas system** (chunks,
int16 bundles, worker pool, page eviction, `TIER_DISTANCE_METRES`, hysteresis) wrapped around a
**shading language** (tone ramp, key/fill separation, baked occlusion, cloud shadow, banded
aerial). Cobra needs the second and emphatically does not need the first: its world is 16 km
square with an analytic heightfield, drawn correctly as **one 46 k-triangle mesh in one draw
call**. Pushing that through a 131 km streaming atlas would mean authoring a Cobra terrain pack,
a manifest, and a DEM build — and would deliver **not one visible pixel of improvement**, because
the F-22 terrain is itself under-textured and shadowless today.

That matters because [[cobra-bike-quality-bar]] makes visual quality a **ship gate judged from
rendered frames**. Leading a fidelity program with an invisible refactor fails that gate for
weeks and buys nothing.

[[one-engine-doctrine]] forbids forked *implementations*. The forked implementation that is
actually hurting us is the **shading language**, which Cobra copied by hand (its header says so:
*"ONE ENGINE, NOT A FORK … the shading maths below is deliberately the same"* — which is a fork
with a comment on it). Share **that**. Leave the streamer alone.

### The challenge to shadow ordering

Shadows should be **first**, not second. They are the highest visual-per-hour item in the whole
programme and they need **zero art assets** — everything else in this document waits on a
pipeline that does not exist yet, and this does not. The cost is a light-view fill pass, not the
draw calls (see §2), so it must be measured rather than assumed; but it is measurable in an
afternoon, which is itself the argument for doing it first.

### Recommended sequence

Each stage is independently shippable and independently judgeable from a frame.

---

**Stage 0 — Free wins. ~1 day. Ship alone.**

No new assets, no new architecture.

1. **Enable shadows in Cobra Canyon.** `renderer.shadowMap.enabled = true`, PCFSoft, sun
   `castShadow`, and flip the ~9 `castShadow = false` lines in `cobra_canyon_presentation.js:388`
   / `asset_kit.js:966` / `ah1g_presence.js:35` / `cobra_ground_war.js:87` — **four sites, and
   two tests pin them**: `cobra_canyon_presentation.test.mjs:288` and
   `cobra_canyon_asset_kit.test.mjs:81` both assert `castShadow === false`. Those assertions
   encode a conclusion exactly as `production_graphics_wiring.test.mjs:67` does (stage 1), and
   rewriting them is part of stage 0's scope, not a surprise during it. Note also that
   `cobra_canyon_presentation.js:389` already sets `receiveShadow = true` — Cobra has the same
   dead-flag pattern this document scolds Weekend Ride for. Cascade half-extent **600 m**, not 44 m — the
   AH-1G lives at 30 m AGL and the visual interest radius is the near ring
   (`nearRingMaximumAglM` 180/260/360). Reuse `shadow_stabilizer.js` for texel snapping.
2. **Weekend Ride, four defects**: set `scene.environment` from a PMREM of the existing sky shader
   (`MeshStandardMaterial` without IBL is why it reads as plastic); enable the shadow pass its
   `receiveShadow` flags already expect; far plane 12 km → 24 km; make fog colour and
   `scene.background` the same value.
3. **Cobra basin `DoubleSide` → `FrontSide`** on the opaque terrain material.

*Benefit:* the largest single visual step in the document, judged from a frame the same day.
*Cost:* ~0.3–0.6 ms/frame. *Risk:* low; shadow acne on the 105 m-spaced basin needs a
`normalBias` pass (`app.js:7157` already uses `-0.00018` / `0.16` as a starting point).

---

**Stage 1 — Break the shadow deadlock on the F-22 path. ~1–2 days.**

`combat` is excluded from `shadowModes` because **no receivers exist**, so the pass was pure
waste. Correct decision then; wrong state now. To break it, all three must land together:

1. Set `receiveShadow = true` on terrain chunk meshes (`korea_terrain.js` `build()`, L2063-2085)
   and `castShadow`/`receiveShadow` on `korea_scenery.js` instanced batches. Decide explicitly
   what happens to `korea_terrain.js:298` and `:342`, which set `receiveShadow = false` on the
   Ukraine apron/transition strips — those are deliberate and should probably stay, but a stage
   that turns shadows on must say so rather than leave two silent exceptions.
2. Add `"combat"` to `shadowModes` for `desktop` and `balanced` (mobile stays out).
3. **Re-size the cascade.** 44 m is a cockpit extent. A flight sim wants either a 2-cascade CSM
   (~250 m near / ~2,500 m far) or, cheaper and adequate for stage 1, a single 1,200 m cascade
   with the existing texel stabiliser and an altitude-scaled extent.

Update `production_graphics_wiring.test.mjs:67` — that assertion encodes a *conclusion* ("combat
shadows are waste"), not an invariant, and must be replaced by one asserting receivers exist.

*Benefit:* the F-22 low-level and Cobra frames stop reading as flat. *Cost:* one shadow pass,
~0.5–1.0 ms with 78 draw calls. *Risk:* medium — peter-panning and acne over 32–512 m terrain
spacing; needs frames at three altitudes before it ships.

---

**Stage 2 — Shared shading module. ~2–3 days. No visible change; enabler.**

Extract the common fragment chunks — value/hash noise, tone ramp, key/fill mix, occlusion,
cloud shadow, banded aerial haze, surface detail — into
`render/environment/terrain_shading.js`, imported by `korea_terrain.js`,
`cobra_canyon_terrain_material.js` and a new Weekend Ride ground material. Uniform names and
semantics become the contract.

Two things the module must carry or "build once" fails again: **the precision-safe hash**
(Cobra forked `cobraHash` deliberately — `cobra_canyon_terrain_material.js:37-41` — because
Korea's `fract(sin(dot(...)))` hash collapses to a constant at 16 km world scale; the shared
version must be the safe one for everybody), and **a flat-ground path** for Weekend Ride, which
has no heightfield, no concavity attribute and no normals worth the name.

**Pixel-identity is the wrong gate here, and saying otherwise was sloppy.** Unifying the noise
*necessarily* changes pixels in at least one mode: the two hashes are different functions for a
documented numerical reason, so whichever survives, the other mode's grain moves. The gate is
therefore a **frame-diff review with a bounded, explained delta** — and no frame-diff harness
exists today (the repo has HUD scenario screenshots, [[hud-visual-verification]]), so building
one is part of stage 2's 2–3 days, not an assumed tool. This is the stage where "build it once and every mode gains" stops
being false ([[cobra-bike-dont-use-terrain-engine]]).

*Do not* migrate Cobra onto the chunk streamer — but do not leave the trigger vague either.
**Adopt the streamer for a mode when any of these becomes true:** the world exceeds ~30 km on a
side; the terrain needs real DEM data rather than an analytic height function; or the single-mesh
vertex spacing can no longer resolve authored features (Cobra is at 105 m today and a village
needs ~5 m). Until then a 16 km analytic basin in one draw call is the correct implementation,
not a shortcut. Record this trigger so the next agent does not re-litigate it.

---

**Stage 3 — Bake the albedo; texture the ground. ~3–5 days. 9.7× cheaper in the §7 harness.**

*(9.7× isolates albedo derivation; **7.3×** is the end-to-end terrain-pass figure — see §7. Both
are synthetic fullscreen measurements, not the production path, and the appearance question is
open. Re-measure in-scene before quoting either as a shipped win.)*

Replace the per-fragment analytic albedo chain with:

| Layer | Content | Size | Cost |
| --- | --- | --- | --- |
| macro | RGB albedo (landcover, cultivation parcels, laterite, rim, drainage) + **A = concavity/AO** | 1024² per 16 km ≈ 15 m/texel | 1 fetch |
| detail | tiling near-field grain; R = 32 m octave, G = 8 m scrub mask | 512² over 64 m ≈ 0.125 m/texel | 1 fetch |
| cloud shadow | scrolling cumulus field | 256² | 1 fetch |

**7.0 MB VRAM at 1024²** (23 MB at the 2048² used in the PoC), ~1–3 MB on the wire as WebP.

This stage pays for stages 4 and 5 out of the budget it frees, and it is the stage that fixes
shimmer: `cobraNoise()` has no mip chain, so the ground currently aliases under motion; a texture
gets trilinear and anisotropic filtering for free.

**Sequence note:** stage 3 must follow stage 2, or the bake lands in one mode and is re-authored
in the other — the exact failure [[cobra-bike-dont-use-terrain-engine]] documents.

---

**Stage 4 — Alpha-tested foliage. ~1–2 weeks. First stage needing a real pipeline.**

Cross-card and billboard palms/broadleaf with alpha-tested frond cut-outs, instanced (the
machinery exists in `korea_scenery.js` and `cobra_canyon_asset_kit.js`), clustered on slopes and
shorelines per [[bf-vietnam-graphics-reference]]. Discrete LOD: cards → billboard → cut.

Alpha test is fill-bound and interacts badly with no-early-Z (§1.4); budget conservatively and
measure before widening.

---

**Stage 5 — Structures. Vegas sandbox first, then Vietnam villages.**

Owner wants Vegas as the buildings sandbox; villages follow. This is where the 3D model pipeline
has to become real, and it should not start before stage 4 has proved the pipeline shape on the
easier asset class.

---

**Stage 6 — Textured airframes and effects.** `createDrone`'s procedural planforms get albedo +
normal maps; the F-22/Su-27 come out of `ABSTRACT_ONLY_PRESENTATION_IDS` (`app.js:5531-5534`)
once they have exterior meshes worth showing. Napalm-class effects get the unused
`ThreeR160PostStack` bloom.

---

## 4. Bake versus compute

The rule: **anything that does not change with the camera or the clock should be a texture.**

| Term | Today | Should be | Why |
| --- | --- | --- | --- |
| landcover / canopy / cultivation parcels | 6 noise lookups + 7 smoothsteps per pixel | **macro texture RGB** | Static. Costs 1 fetch. Also becomes *authorable* — a designer can paint a road. |
| concavity / enclosure AO | `float32` **vertex attribute** at 105–174 m (Cobra) / 32–512 m (Korea) spacing | **macro texture alpha**, 8–15 m/texel | Storage is the bug. At 105 m spacing a valley's AO edge is 105 m wide. Riding in the alpha of a texture we are adding anyway, it costs **zero extra** and gains an order of magnitude of resolution. |
| hillshade | derived per fragment from interpolated normals | bake to the macro texture where the sun is fixed; keep analytic where time-of-day moves | Cobra has one authored sun. Korea does not. |
| near-field grain (micro/scrub) | 2 noise lookups/px | **tiling detail texture** | Must stay tiling, not baked to world space, or it becomes resolution-limited. |
| cloud shadow | 2 noise lookups/px | 256² scrolling texture | It is already a scrolling 2-D field; it is a texture wearing a shader's clothes. |
| aerial haze / banding | per fragment | **stays** | Camera-dependent. Cheap. Our best feature. |
| tone ramp, key/fill, sun direction | per fragment | **stays** | Cheap (2 smoothsteps) and must respond to time of day. |
| water ripple, Fresnel, specular | per fragment | **stays** | Camera-dependent. |

Note what this does *not* say: it does not say stop shading analytically. The tone ramp and the
key/fill hue separation are ~2 smoothsteps and they are the best thing about our look
([[terrain-legibility-diagnosis]]: *"painted light is coloured light, not dimmed light"*). Keep
all of it. **Move the albedo, keep the light.**

---

## 5. Quality tiers and the mobile floor

Every proposal must degrade honestly ([[minimum-viable-hardware-project]],
[[adaptive-world-radius-doctrine]]: shed view distance before pixels).

**The important inversion: stage 3 is a mobile *win*, not a mobile cost.** Mobile GPUs are
texture-rich and ALU-poor; a tile-based deferred architecture eats texture fetches and chokes on
900-op fragment shaders. Today mobile gets the *most expensive* path with the *least* detail
(`SURFACE_DETAIL_STRENGTH.mobile = 0`, and mobile never reaches LOD0). Baking inverts that.

| Stage | mobile | balanced | desktop |
| --- | --- | --- | --- |
| 0/1 shadows | **off** (as `shadowModes` already does) | on, 1024², single 1,200 m cascade | on, 2048², 2-cascade CSM |
| 3 textures | on, 512² macro + 256² detail (~1.7 MB) — *net faster than today* | 1024² + 512² (7 MB) | 2048² + 512² (23 MB) |
| 4 foliage | billboards only, 0.4× instance count | cards at 0.7× | full cards + billboards |
| 5 structures | landmark silhouettes only | landmarks + near-ring props | full |

`textureMaxSize` is already tiered 1024/2048/4096 in `visual-profile.json`, and
`COBRA_CANYON_AMBIENT_BUDGETS` / `SCENERY_BUDGET` already scale instance counts. The tier
plumbing exists; it needs new rungs, not a new system.

**Weekend Ride has no tier system and no budget at all.** Give it the Cobra budget shape
(`maxDrawCalls`/`maxTriangles` with a build-time `RangeError` and a test) before adding anything
to it, or stage 4 will be uncapped there.

---

## 6. Asset pipeline reality

**Correction after review: we DO have an offline texture-generation pipeline, and an earlier
draft of this document said we did not.** That was the largest factual error in this review and
it changed a cost estimate, so it is recorded rather than quietly fixed.

`tools/assets/generators/generate-environment-textures.mjs` is a Node procedural texture baker
with its own `smoothstep`/value-noise, SHA-256 content hashing, atomic `rename`, and
`DEFAULT_OUTPUT = content/packs/korea-1950s/environment/textures` — it **produced three of the
five world textures this document counts**. `tools/assets/generators/pbr-textures.mjs` generates
RGBA material maps. Stage 3 therefore **extends an existing generator**; it does not build one.

What is genuinely missing is narrower: **3D models** (no GLB is loaded by Cobra or Weekend Ride;
`createDrone` extrudes planforms procedurally), **GPU-compressed texture formats**, a **foliage
atlas policy**, and a **GLSL-parity** bake path (today's generator reimplements its noise in JS,
so a bake of the *shipped shader* needs the shader evaluated, not re-typed).

What exists:
- `tools/assets/generators/` — 8 generators plus `menu-posters/`, including the environment
  texture baker and a PBR map generator described above.
- `web/wwwroot/art/` — six shell/menu WebPs. **No material maps.** `SOURCES.md` explicitly
  restricts them: generated stills *"may not become world geometry, textures, factual briefing
  imagery, or cutscene truth"* without separate review.
- World textures live in `content/packs/<pack>/environment/textures/`. There are **five**, total,
  in the entire product.
- **No `.ktx2`, `.basis`, `.hdr` or `.exr` anywhere.** No GPU-compressed texture path at all.
- No GLB is loaded by Cobra or Weekend Ride. `createDrone` extrudes planforms procedurally.
- Provenance precedent: `tools/assets/generators/menu-posters/` — hand-authored SVG →
  headless Chromium at `deviceScaleFactor: 2` → `cwebp -q 82 -m 6 -sharp_yuv`, with SHA-256 file
  closure and an epistemic label in `SOURCES.md`.
- One asset budget precedent: `tools/assets/generators/aircraft-assets.mjs:947-949` —
  12,000/5,000/1,800 triangles, 24/16/9 draw calls.

**Are procedurally-baked textures an acceptable first step? Yes — and here they are strictly
better than acceptable.** The work is a GLSL-parity bake mode on
`generate-environment-textures.mjs`: evaluate *the shader we already ship* offline (headless GL,
the same trick `bakelook.html` uses in §7) and write WebP. That means:

- **Provenance is trivially clean.** No diffusion model, no third-party image, no prompt. The
  source of record is a shader already in the repo, exactly the shape `SOURCES.md` v3 documents
  for the menu posters ("no image-generation model was used").
- **Near-zero look risk.** Because the bake evaluates the shader we already ship, stage 3 starts
  from the current look rather than a new one. Not *pixel* parity — the bake is resolution-limited
  at the macro scale and mip-filtered in the far field (§7) — but the delta is bounded, visible in
  a diff, and in the far field is an improvement.
- **It converts the expensive thing into the cheap thing.** The analytic shader stops being a
  per-frame cost and becomes an authoring tool — arguably the best possible outcome for work
  already done.

Then, and only then, hand-authored and photo-sourced detail textures replace the bakes layer by
layer, each with its own `SOURCES.md` card. **World textures need a review note** (ADR-0003
mood-board rule) before the first one lands — flag it now rather than discovering it at review.

Required to exist, in order:
1. A GLSL-parity bake mode on the existing `generate-environment-textures.mjs`, plus a
   `SOURCES.md` card in the target pack. *(stage 3)*
2. A KTX2/Basis compression step and a loader. 23 MB of RGBA8 is **5.75 MB as BC7** (8 bpp);
   4 MB needs ASTC 6×6 or looser. *(stage 3–4)*
3. A foliage atlas generator with an alpha-coverage/mip policy. *(stage 4)*
4. A GLB authoring and validation path with tri/draw budgets. *(stage 5)*

---

## 7. Proof of concept — measured

Files: `scratchpad/renderarch/fragbench.html`, `bakelook.html`, `run_fragbench.mjs`,
`run_bakelook.mjs`. Screenshots: `bakelook-analytic-vs-baked.png`, `fragbench-result.png`.
Own isolated headed Chromium (`--use-angle=metal`), **not** the shared MCP browser.

### Cost

Renderer `ANGLE (Apple, ANGLE Metal Renderer: Apple M5)`. Method: render N fullscreen passes of
each shader into an offscreen 1920×1080 RGBA8 FBO and **sweep N**, fitting ms-per-pass as the
slope — which removes submit/sync overhead and proves the work executes. Additive blending is
enabled because **without it the analytic sweep produced a physically impossible flat slope that
we could not explain**; blending removed it. (An earlier draft asserted driver dead-store
elimination as the cause. That is unverified — a sync/timing artefact is at least as likely — and
stating it as fact was the same error this document criticises elsewhere. Blending adds an equal
ROP cost to all three programs, which the floor subtraction then cancels.)

```
sweep (passes -> ms), 16/32/64/128/256:
  floor    [[16,0.9],[32,1.4],[64,2.7],[128,5.2],[256,10.0]]   slope 0.0382 ms/pass
  analytic [[16,14.8],[32,29.3],[64,58.8],[128,117.8],[256,240.7]] slope 0.9415 ms/pass
  baked    [[16,2.4],[32,4.3],[64,8.5],[128,16.7],[256,33.4]]  slope 0.1294 ms/pass

SHADING COST per full 1920x1080 coverage (floor subtracted):
  analytic (shipped) : 0.8997 ms   =  2,305 Mpx/s
  baked (3 textures) : 0.0930 ms   = 22,305 Mpx/s
  ratio               : 9.68x
  texture memory      : 7.0 MB (RGBA8 1024+512+256 with mips)
```

**Two ratios, and they answer different questions.** 9.68× is floor-subtracted: it isolates the
*albedo-derivation* cost, which is what stage 3 replaces. The floor (rasterisation, haze, the
additive ROP write) is 4% of the analytic but **30% of the baked**, and it is not avoidable in a
real draw — so the honest **end-to-end** improvement for a terrain pass is
`0.9415 / 0.1294 = ` **7.3×**, and the per-frame baked figure is ~0.19 ms, not 0.14 ms. Use 9.7×
when arguing about the shader; use **7.3×** when arguing about the frame.

**What the baked path in this bench actually samples:** three LCG white-noise textures, not a
bake of the shipped function, and it omits the elevation-band and slope smoothsteps. That is
legitimate for a *cost* measurement — three fetches cost what three fetches cost, and the ALU it
drops is ALU stage 3 also drops — but it means this harness measured cost only. The harness that
bakes the real function (`bakelook.html`) was never cost-measured.
Scaled to a Retina frame (3024×1890, terrain ≈ 55% coverage, **no overdraw**): analytic
≈ **1.4 ms/frame**, baked ≈ **0.14 ms/frame**. With the 2–3× terrain overdraw that no-early-Z
(§1.4) makes inevitable at low level, the analytic figure plausibly reaches **3–4 ms** — a fifth
of a 60 fps budget, spent on arithmetic, on a current-generation Apple M5. Whatever a mid-range
Windows laptop or a phone does with that shader is worse, and unmeasured.

**Known biases in this harness, stated so the ratio is used correctly.** Additive blending adds
one ROP write per pass — but it adds it to *both* shaders equally, so it inflates the floor
(subtracted) and not the ratio. The synthetic `gl_FragCoord`→world mapping walks memory
sequentially, which gives the texture path **better cache locality than a real terrain draw**;
the true baked cost in-scene will be somewhat higher than 0.093 ms and the ratio somewhat lower
than 9.7×. The harness also does **not** run the production `logarithmicDepthBuffer` path, does
not run through Three.js, and is 100% coverage with no partial-triangle quads. And it is an M5 —
the mobile tier is unmeasured, though §5 argues the direction there is more favourable, not less.

**Use the ratio, not the absolute.** 9.7× is robust to all of the above; 0.90 ms as a frame-budget
line is not, and is quoted here only to give the ratio a scale.

*Assumptions flagged:* coverage fraction and overdraw factor are estimates, not measurements. The
`perf-attribution` agent owns those. The published 0.093 ms is the mean of two interleaved runs;
the single sweep printed above fits 0.091 ms.

### Appearance

`bakelook.html` bakes **the shipped albedo function itself** into a 2048² basin texture + 512²
tiling detail + 256² cloud field, then renders analytic (left) and baked (right) side by side
through identical lighting, haze and geometry.

They read as the same material at the macro scale: same palette, same value structure, same
landcover bands, same near-field scrub grain.

**A defect found in review, and what it cost.** An earlier draft reported the baked half's softer
far field as "the texture anti-aliasing correctly" and offered it as an unlooked-for second
argument for baking. It was **an artefact**: the view walked to 45 km while `uMacro` covers only
±8 km, so everything past 8 km was sampling one `CLAMP_TO_EDGE` texel row. The harness now bounds
the view to 6.5 km, inside the baked domain, and the screenshot is regenerated.

**With that fixed, the honest verdict is weaker than the draft claimed.** The macro agreement
holds, but the baked half now shows **anisotropic streaking** toward the horizon, because this
synthetic projection maps `groundUv = (lateral, distance)` — a mapping whose UV derivatives are
wildly anisotropic and which drives mip selection badly. A real terrain mesh has well-conditioned
derivatives and would not do this; but that is an argument, not a measurement, and this PoC does
not settle it.

**So the appearance question is open and stage 3 must not quote this as settled.** What the PoC
establishes: the analytic albedo chain is reproducible from a bake at macro scale, at ~7–10×
lower shading cost. What it does **not** establish: fine-detail parity, behaviour under motion,
or that mip filtering is a net win here.

Further limits, stated plainly: it is a synthetic ground projection, not the Cobra scene; it does
not run through Three.js, the chunk path, or the production `logarithmicDepthBuffer`; and the
analytic half is the shipped chain **restructured** into a macro/detail split, with the
`concavity` vertex attribute replaced by a noise stand-in. That last one matters most — the §3/§4
proposal to move concavity into the macro texture's alpha is exactly the term this PoC fakes, so
**that proposal is untested**.

---

## 8. If there were one day

Stage 0, instrumented. Shadows on in Cobra Canyon and Weekend Ride, plus Weekend Ride's
`scene.environment`, far plane and fog/background colour. No new assets, and it is the biggest
visible step in this entire document.

Ship it **with a before/after frame-time capture in the same rail the `perf-attribution` agent
is building**, not on the strength of the estimate in §2. Stage 0 is the cheapest possible
experiment for the question the whole programme rests on — *does adding rendering work actually
cost us frames on this machine?* — and it answers that question while also being the single
best-looking change available. If it costs more than the estimate, that is the most valuable
result of the day, not a failure.

---

## 9. What must not be lost

- Do not re-tune fog to fix a "flat" complaint. Fog density and world radius are one parameter
  ([[adaptive-world-radius-doctrine]]) and our aerial perspective is better than the reference's.
- Do not judge low-level fidelity on `low-level-drone` beat 8 — it spawns inside a snow squall
  with `visibility_m: 869` and the renderer is drawing it honestly.
- Do not resolve a `korea_terrain.js` conflict by taking one side
  ([[terrain-hillshade-water-integration]]).
- Do not remove the analytic shaders when they are baked. They become the bake tool.
- Stylized-first always ([[art-direction-tf2]]). BF Vietnam is the right midpoint — readable,
  atmospheric, restrained saturation — not photorealism.
