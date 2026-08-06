# Render architecture: why we look worse than 2004 and cost more

Date: 2026-08-06
Status: design review with a costed plan. **No implementation authorised by this document.**
Base: `8540ee4` (live Build 265). Branch `docs/render-architecture`.

Related: [[graphics-fidelity-target]], [[bf-vietnam-graphics-reference]], [[visual-house-style-f22]],
[[cobra-bike-dont-use-terrain-engine]], [[terrain-legibility-diagnosis]], [[one-engine-doctrine]],
[[adaptive-world-radius-doctrine]], [[minimum-viable-hardware-project]], [[art-direction-tf2]],
`docs/superpowers/specs/2026-07-29-soft-world-look-gate-design.md`

Owner, 2026-08-06: *"we have really bad graphics **and** really bad framerate on a very powerful
machine, it shouldn't be that difficult to improve on this."*

He is right, and the two halves of the complaint have the same cause.

---

## 0. Headline

**We are not GPU-limited. We are asset-limited, and we spend the GPU on the one axis that does
not produce fidelity.**

Three numbers make the case:

| | us | Battlefield Vietnam (2004, DX8-class, 128 MB GPU) | a 2026 browser sustains |
| --- | --- | --- | --- |
| draw calls | **15** (Cobra, hard cap, headroom 0) / 72–78 (F-22) | ~500–1,500 | 1,000–3,000 |
| triangles | **110 k** budget, 46 k terrain (Cobra) | ~150–250 k | 3–5 M (we already draw 2.9 M at 60 fps) |
| terrain texture memory | **0 bytes** (Cobra, Weekend Ride), 1 texture (F-22) | ~100–200 MB | 500 MB+ |
| terrain fragment ALU | **~900 scalar ops/px** | ~10–20 ops + 4 texture fetches | — |

We have a 2004 game's *asset* budget and a 2015 game's *shader* budget. 2004 games looked better
because fidelity lives in assets, not in arithmetic.

The decisive measurement (§7, reproducible): the shipped Cobra basin fragment shading costs
**0.90 ms per full 1920×1080 coverage** on an Apple M5. The identical look, baked into three
textures and read back with 3 fetches, costs **0.093 ms**. **9.7× more expensive, for less
detail** — and the baked version is also the only one of the two that anti-aliases, because a
texture has a mip chain and `cobraNoise()` does not.

And the frame-rate half is already settled by evidence we own:
`terrain_mesh_builder.js:8` records an 11 fps window at **2.98 M triangles / 78 draw calls**
against a 60 fps window at **2.91 M triangles / 72 draw calls**. Geometry throughput is flat
across a 5.5× frame-time swing. Whatever is eating frames, **it is not the amount we draw** —
which is exactly why the answer to "our graphics are bad" is *draw more, not less*.

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
| vegetation | 7 `InstancedMesh`, 18–100 tris/instance, ≤1,330 instances | `cobra_canyon_asset_kit.js` |
| textures | **none, anywhere** | grep: zero `Texture`/`.map =`/`.glb` in `render/cobra/` |
| shadows | **none**; `renderer.shadowMap` never touched, every object `castShadow = false` | `cobra_canyon_presentation.js:388`, `asset_kit.js:966` |
| post | none — direct `renderer.render` | `cobra-lab/main.js:966` |
| AH-1G | 21 procedural boxes, 11 Lambert materials, no texture, hidden in first person | `ah1g_presence.js` |

Basin fragment shader per pixel: **10 `cobraNoise` → 40 `cobraHash`, +2 standalone = 42 hashes;
12 `smoothstep`; 40 `mix`; 0 texture fetches.** Material is `DoubleSide` on opaque terrain —
back-face culling is off for no stated reason.

### 1.2 Weekend Ride — `web/wwwroot/weekend-ride/main.js` + `render/motorcycle/track_day_presentation.js`

The weakest scene in the product, and the only one with no budget and no rendering test.

- **~110+ individually-added meshes** against 6 instanced batches (beacons 20, start/finish 32,
  paddock/airfield 30, marshal posts 9, …). No budget constant, no draw-call assertion anywhere.
- The world is **flat**: `SURFACE_ELEV_M = 192.0`, ground is `PlaneGeometry(22000, 22000)` — two
  triangles. No heightfield at all.
- 202 cone "trees" (`ConeGeometry(1,1,6)`), no billboards, no alpha test, no LOD.
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

- Fragment shader: **44 `smoothstep`, 49 `mix`, 5 cloud-noise calls, 4 `texture2D`** (only one
  compiled era path runs at a time).
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

| # | Feature | What it buys | Cost (ms @ desktop) | Memory | Difficulty here |
| --- | --- | --- | --- | --- | --- |
| 1 | **Cast shadows** | Contact, mass, time of day. Our own [[terrain-legibility-diagnosis]] named absent shadows as the primary cause of flat reads. In the village image the palm shadows *are* the composition. | 0.3–0.8 ms (one extra pass over 15–78 draw calls) | 2048² depth = 16 MB | **Low.** Rig exists and works. Blocked only by a policy line and a test. |
| 2 | **Ground albedo/detail/splat textures** | Everything the eye reads as "ground" at low level: dirt roads, sand/grass transition, tracks, tonal variety at every scale. | **−0.8 ms** (it is *cheaper* than what we do now) | 7–23 MB VRAM, ~1–3 MB on the wire as WebP | **Low-medium.** Shader change is small; the pipeline (§6) is the work. |
| 3 | **Alpha-tested foliage** | The single biggest jump toward the reference. BFV's palms are cut-out cards with readable fronds; ours are faceted cones with no trunks. | +0.5–1.5 ms (alpha test is fill-bound; instancing already exists) | 2–8 MB atlas | **Medium.** Needs an authoring pipeline and a sorting/LOD policy. |
| 4 | **Structures and props** | Human scale. A hut, a fence, a jetty tell you how high you are; a noise field never does. | +0.2–0.6 ms per 100 instanced props | 5–20 MB | **Medium-high.** No 3D model pipeline exists at all. |
| 5 | **Textured airframes** | The F-4 in the reference reads as an aircraft because of camo, panel lines and roundels. `createDrone` extrudes planforms and applies procedural grain. | negligible | 2–6 MB per airframe | **Medium.** `tools/assets/generators/aircraft-assets.mjs` already carries tri/draw budgets (12,000/5,000/1,800; 24/16/9). |
| 6 | **Effects** | The napalm fireball is a third of that frame's impact. Ours are minimal. | +0.3 ms | small | **Low-medium.** Additive billboards; the unused post stack's bloom would carry it. |

**Where we already match or beat the reference — do not spend here:** aerial perspective and
banded haze (better than BFV's), palette discipline, sky construction, the 1.87/radius fog law,
and the shadow *rig*. The gap is entirely asset-shaped.

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
programme, they need **zero art assets**, and Cobra has 15 draw calls — a shadow pass takes it to
~30, against a browser that sustains thousands. There is no reason to wait.

### Recommended sequence

Each stage is independently shippable and independently judgeable from a frame.

---

**Stage 0 — Free wins. ~1 day. Ship alone.**

No new assets, no new architecture.

1. **Enable shadows in Cobra Canyon.** `renderer.shadowMap.enabled = true`, PCFSoft, sun
   `castShadow`, and flip the ~9 `castShadow = false` lines in `cobra_canyon_presentation.js:388`
   / `asset_kit.js:966` / `ah1g_presence.js:35`. Cascade half-extent **600 m**, not 44 m — the
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
   and `castShadow`/`receiveShadow` on `korea_scenery.js` instanced batches.
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

Ship it **behind pixel-identity tests**, not "looks the same": render each mode before and after
and assert frame equality. This is the stage where "build it once and every mode gains" stops
being false ([[cobra-bike-dont-use-terrain-engine]]).

*Do not* migrate Cobra onto the chunk streamer. If a later mode needs a 100 km+ world, that is
when the streamer gets shared.

---

**Stage 3 — Bake the albedo; texture the ground. ~3–5 days. Measured 9.7× cheaper (§7).**

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

**We have no texture-authoring pipeline and almost no 3D models.** That is the real constraint,
not the renderer.

What exists:
- `web/wwwroot/art/` — six shell/menu WebPs. **No material maps.** `SOURCES.md` explicitly
  restricts them: generated stills *"may not become world geometry, textures, factual briefing
  imagery, or cutscene truth"* without separate review.
- World textures live in `content/packs/<pack>/environment/textures/`. There are **five**, total,
  in the entire product.
- **No `.ktx2`, `.basis`, `.hdr` or `.exr` anywhere.** No GPU-compressed texture path at all.
- No GLB is loaded by Cobra or Weekend Ride. `createDrone` extrudes planforms procedurally.
- One real generator precedent: `tools/assets/generators/menu-posters/` — hand-authored SVG →
  headless Chromium at `deviceScaleFactor: 2` → `cwebp -q 82 -m 6 -sharp_yuv`, with SHA-256 file
  closure and an epistemic label in `SOURCES.md`.
- One asset budget precedent: `tools/assets/generators/aircraft-assets.mjs:947-949` —
  12,000/5,000/1,800 triangles, 24/16/9 draw calls.

**Are procedurally-baked textures an acceptable first step? Yes — and here they are strictly
better than acceptable.** The proposed `tools/assets/generators/terrain-textures/` evaluates
*the GLSL albedo function we already ship* offline and writes WebP. That means:

- **Provenance is trivially clean.** No diffusion model, no third-party image, no prompt. The
  source of record is a shader already in the repo, exactly the shape `SOURCES.md` v3 documents
  for the menu posters ("no image-generation model was used").
- **Zero look risk.** Stage 3 can ship at pixel parity by construction (§7 demonstrates it).
- **It converts the expensive thing into the cheap thing.** The analytic shader stops being a
  per-frame cost and becomes an authoring tool — arguably the best possible outcome for work
  already done.

Then, and only then, hand-authored and photo-sourced detail textures replace the bakes layer by
layer, each with its own `SOURCES.md` card. **World textures need a review note** (ADR-0003
mood-board rule) before the first one lands — flag it now rather than discovering it at review.

Required to exist, in order:
1. `tools/assets/generators/terrain-textures/` + `SOURCES.md` in the target pack. *(stage 3)*
2. A KTX2/Basis compression step and a loader. 23 MB of RGBA8 is 4 MB as BC7/ASTC. *(stage 3–4)*
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
enabled so no pass can be elided (without it, the analytic sweep showed a physically impossible
~zero slope; that was a measurement artefact, and it is exactly the trap that makes naive
shader benchmarks lie).

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

Scaled to a Retina frame (3024×1890, terrain ≈ 55% coverage, **no overdraw**): analytic
≈ **1.4 ms/frame**, baked ≈ **0.14 ms/frame**. With the 2–3× terrain overdraw that no-early-Z
(§1.4) makes inevitable at low level, the analytic figure plausibly reaches **3–4 ms** — a fifth
of a 60 fps budget, spent on arithmetic, on the most powerful consumer GPU Apple ships.

*Assumptions flagged:* coverage fraction and overdraw factor are estimates, not measurements.
The `perf-attribution` agent owns those. The 9.7× ratio does not depend on either.

### Appearance

`bakelook.html` bakes **the shipped albedo function itself** into a 2048² basin texture + 512²
tiling detail + 256² cloud field, then renders analytic (left) and baked (right) side by side
through identical lighting, haze and geometry.

They read as the same material: same palette, same value structure, same landcover bands, same
near-field scrub grain. The baked half is slightly softer in the far field — which is **the
texture anti-aliasing correctly**. The analytic half has no mip chain and therefore shimmers
under motion. That is a second, unlooked-for argument for baking.

Honest limits of this PoC: it is a synthetic ground projection, not the Cobra scene; it does not
test streaming, memory pressure, or the F-22 chunk path; and it uses a *bake of our own shader*
rather than an authored texture, so it proves cost-and-parity, not that authored art will look
better. It is not offered as more than that.

---

## 8. If there were one day

Stage 0. Shadows on in Cobra Canyon and Weekend Ride, plus Weekend Ride's `scene.environment`,
far plane and fog/background colour. No new assets, ~0.5 ms, and it is the biggest visible step
in this entire document.

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
