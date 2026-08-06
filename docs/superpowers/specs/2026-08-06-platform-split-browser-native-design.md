# Platform decision: where the browser ends and native begins

Status: proposed — decision document, no code  
Date: 2026-08-06  
Build target: post-265  
Base: 8540ee4 (live Build 265)

## The question

The owner opened the platform: *"we need to do a lot more research on how to do graphics on a
mac. I don't mind if this has to move off the browser either, but it needs to look good and run
fast."* Then he narrowed it decisively:

> "if we end up in a situation where we have a simple, browser-friendly guns-only dogfight and a
> more complex low-level war sim that can't run on the browser I'll be cool with that."

That reframes the work from **migrate-or-not** to **where is the split line, and what do we build
first**. This document answers that, and keeps the "is the browser actually the bottleneck?"
analysis because it is the check that stops a native build inheriting the same flat look for
different reasons.

---

## Executive recommendation

**Draw the split line architecturally now, at near-zero cost. Do not draw it as a product yet.
Spend the next two build cycles on the non-API defects that are actually costing Cobra its frame
rate and its looks, then re-open the question with measurements instead of arithmetic.**

Concretely: the browser keeps the guns-only dogfight *and*, for now, the low-level sim too. The
*product* split is deferred until a specific feature — Vegas-density structures or dense
alpha-tested foliage — has been shown to exceed a browser budget by measurement.

**Confidence: high (≈85%) that starting a native port today would be a mistake.** The mode that
motivates the split is slow for reasons this document traces to a forked renderer, not to the API.

**Confidence: moderate (≈60%) that the split eventually happens anyway.** The Vietnam/Vegas
content program is the thing most likely to force it, and it has not been built.

**Confidence: high on the native *target*, if and when one is needed — Godot 4.7.** Verified: it
requires exactly `net8.0`, so our kernel retargets by **zero**; it can disable its own physics
entirely (`Dummy` server) so the kernel stays authoritative; its fixed-tick
`_PhysicsProcess` + tick clamping match our determinism contract; and `dotnet test` keeps running
the existing 237 test files unchanged. Unity also works but by the longer road (§5.1/§5.3).

**And the fact that settles the shape of the whole thing: Godot C# cannot export to web** —
*"Projects written in C# using Godot 4 currently cannot be exported to the web"*, in the stable
**and** the dev docs. So the browser dogfight stays three.js no matter what. **The split is an
architecture, not a compromise.**

Three findings deserve to outrank the recommendation itself, because they change what "measure it"
means:

1. **Apple's documentation does not support the claim that our analytic shading is pathological on
   Apple silicon** (§2). I went looking for that argument and it is not there — in fact TBDR's
   free overdraw elimination *helps* an expensive-fragment renderer more than a cheap one. The
   cost case survives on narrower, honest grounds.
2. **You cannot profile a browser page with Apple's Metal tools** (§2.7). That is the strongest
   genuine argument for native found anywhere in this research, and it is an argument about
   *instrumentation*, not frame rate — which for a project whose doctrine is instrument truth is
   not a small thing.
3. **The kernel's portability is now measured, not hoped.** I compiled it for `netstandard2.1` in
   this worktree (§5.1): the gap is 13 BCL helpers and one `PriorityQueue`, about a day of shim
   work — and **zero** generic math, **zero** `static abstract`, **zero** real `required` members.
   For Godot the gap is zero. The crown jewels are safe on either road, and that removes the
   scariest unknown from the whole decision.

---

## Part 1 — Is the browser the bottleneck? (No. And the evidence is unusually clean.)


The counter-evidence in the brief was that Cobra Canyon draws **~15 draw calls and ~110k
triangles** and is still laggy. That reading is correct, and the tree explains exactly why. Cobra
is slow for **several independent, individually fixable reasons, none of which is the graphics
API** — and most of them are things the F-22 mode already solved and Cobra forked away from.

### 1.1 Cobra's terrain shader spends ~42 hash evaluations per fragment

`web/wwwroot/render/cobra/cobra_canyon_terrain_material.js` synthesises the entire ground
appearance analytically. Counting the noise chain in `NOISE_CHUNK` and `BASIN_FRAGMENT_SHADER`:

| Call | Noise evals | `cobraHash` evals |
|---|---|---|
| `cobraFbm(groundUv * 0.0016)` — macro | 3 | 12 |
| `cobraFbm(groundUv * 0.0068)` — meso | 3 | 12 |
| `cobraNoise(groundUv * 0.031)` — micro | 1 | 4 |
| `cobraNoise(groundUv * 0.125)` — grain | 1 | 4 |
| `cobraHash(parcelCell)` ×2 — cultivation | — | 2 |
| cloud shadow, 2 octaves | 2 | 8 |
| **Total per fragment** | **10** | **42** |

`cobraHash` is a `vec3` fract/dot/fract chain — roughly ten ALU operations. So the ground costs
**~420 ALU ops of noise alone** before the ~15 `smoothstep`s, seven `mix`es, the half-Lambert
tone gate, the planform relief term, and the `cobraAerial` haze chunk.

Now multiply by pixels. `cobra-lab/main.js:63` fixes the desktop ceiling at
`QUALITY_PIXEL_RATIOS = { mobile: 1, balanced: 1.35, desktop: 1.75 }`. On a Retina M-series Mac a
~1728×1117 CSS viewport at 1.75 is ≈ 5.9 Mpix — and the terrain covers most of it, because the
scene is flown at 30 m AGL across a basin. That is on the order of **10⁸–10⁹ ALU ops per frame
for ground colour**, from **15 draw calls**.

**This is precisely the "expensive and ugly at the same time" symptom.** The low draw-call count
and the high cost are not in tension — they are the same fact. Fifteen draw calls covering the
whole screen with 100 m triangles means every one of those triangles is thousands of pixels, and
each pixel re-derives its colour from scratch. Draw calls measure CPU submission cost; this is a
*fragment-bound* frame, and no draw-call metric can see it.

It also explains the flatness. Analytic noise has **no mip chain**. A texture sample is filtered
across the footprint automatically; `cobraNoise(groundUv * 0.125)` — an 8 m period — sampled
across a 100 m triangle is aliasing, not detail. The shader's own comments record the team
fighting this: the hash was rewritten because *"the grain octaves silently collapsed to a constant
and the ground rendered as an untextured painted panel"*, and the near-field octaves were doubled
because *"With only the coarse octave the near field renders as an untextured painted panel."*
The team has been paying more and more ALU to chase an effect that one filtered texture fetch
delivers for less. **That is the central technical finding of this document, and it is
API-independent: porting this shader to Metal or WGSL verbatim would cost the same and look the
same.**

By contrast the F-22's `render/environment/korea_terrain.js` is *not* the same problem. It has
four noise references, not ten, single-sides the terrain material explicitly to *"halve the
dominant terrain fragment cost"* (line ~1155), and on the Ukraine path it already **samples a real
texture** (`TEX_RAPIER_PAINTED_GROUND_V1`, `korea_terrain.js:1134`). The good path already exists.
Cobra does not use it.

### 1.2 Cobra has no adaptive resolution — the F-22 does

`render/visual/adaptive_resolution.js` is imported only by `render/visual/visual_runtime.js`,
`render/visual/index.js`, `environment-lab/main.js` and its own test. `cobra-lab/main.js` imports
neither `visual_runtime` nor `adaptive_resolution` (verified: its import list at lines 1–46 and
211 contains only Cobra-private modules, `hud.js`, and onboarding). So Cobra has a **fixed** 1.75
pixel-ratio ceiling with no feedback loop, while the F-22 has a bounded 60 fps resolution
controller (`app.js:1247` — `DIRECT_ADAPTIVE_RESOLUTION_CONFIG`, *"the same bounded,
tier-normalized 60 fps resolution controller as VisualRuntime"*).

The single most expensive shader in the tree is running in the only mode with no mechanism to back
off pixels. That is the whole lag report, mechanically.

### 1.3 The interop cost was real, is already fixed — and Cobra is still slow

**Correction to the standing diagnosis.** The Build 263 finding was that Cobra did a per-frame
`bridge.Advance` + `JSON.parse(bridge.GetState())`, running CPU-bound at 8.5–20 fps with the sim
at 0.62× real time. **That has already been fixed in Build 265**, and I verified it rather than
assuming it:

- `cobra-lab/main.js:84` — `AUTHORITY_STATE_SAMPLE_INTERVAL_MS = 1_000 / 30`; the full JSON is
  sampled at **30 Hz**, gated at `:380`.
- `cobra-lab/main.js:1187` — `vehiclePoseView = bridge.GetHotPose()`, a **7-slot binary hot pose**
  read per frame via `copyTo` at `:397`, described in-source as *"the Cobra-scale analogue of the
  F-22 SnapshotHotFrame."*
- The only remaining `JSON.parse(GetState())` calls (`:546`, `:1188`) are **initialisation-only** —
  boot and route restart.
- The old JS frame clamp is gone too (`:76-78`): *"The old 50 ms JS clamp silently turned the
  owner's 12.5 fps production drive into 0.62x real time."*

**This matters more than it first appears.** The interop defect was removed and the lag report
survived it. That is negative evidence against the CPU-marshalling explanation and **positive
evidence for the fragment-cost explanation in §1.1** — which is now the leading hypothesis by
elimination, not merely by op-count.

**Weekend Ride has not had the same treatment** and still carries the defect: `refreshSnapshot()`
→ `JSON.parse(bridge.GetState())` is called unconditionally from `animate()` every frame
(`weekend-ride/main.js:208-210, 227`). Same for `medevac/app.js:271`. Cheap, known fix, already
demonstrated twice in the tree.

### 1.4 Cast shadows are switched off by a closed loop, not by budget

`app.js:7729` sets `shadowModes: detectedVisualTier === "mobile" ? ["carrier"] : ["carrier",
"replay"]` — `combat` excluded — with the honest comment: *"terrain does not consume the
directional shadow map. Preserve the pass where it has visible receivers … instead of paying for
it in combat."* The rig works (`visual_runtime.js:195` gates `sun.castShadow` on tier
`shadowMapSize`, which is 512/1024/2048 by tier at `app.js:1236`); `shadow_stabilizer.js` exists.
There are simply no receivers, so the pass was correctly disabled as waste. Breaking the loop is a
cascade-extent decision (`shadowHalfExtents: { combat: 44, … }` is far too tight for terrain
relief) plus turning `receiveShadow` on — **not an API limitation.**

### 1.5 There are essentially no textures in the tree

The entire `web/wwwroot` contains **13 PNG/JPG files**, most of which are icons, menu art and
terrain previews. The only genuine surface textures are `ocean-normal.png`, `cloud-shape.png`,
`foam-noise.png`, `rapier-cloud-billows-v1.webp` and `rapier-painted-ground-v1.webp`. Airframes
are untextured; ground is analytic everywhere except the one Ukraine paint map.

The KTX2/Basis machinery is already wired (`render/assets/three_r160_loader.js` constructs a
`KTX2Loader` and calls `detectSupport()` against the live renderer). **The pipeline for compressed
textures exists and is unused.**

### 1.6 Verdict on Part 1

The brief's reading is **confirmed, and more strongly than it was stated**. Cobra's problem is not
the WebGL2 API, not three.js, not the browser, and not the draw-call count. It is: the most
ALU-expensive shader in the tree (§1.1), running at a fixed high pixel ratio in a forked renderer
with no adaptive controller (§1.2), with no shadows (§1.4) and no textures (§1.5) — *after* the
interop cost had already been removed (§1.3).

Each of those is solved, or solvable, inside the existing stack.

**A platform migration started today would carry all five defects across, cost months, and
produce the same flat canyon in Metal.**

---

## Part 2 — What actually makes Apple silicon fast, and where my §1 argument has to be walked back


I went looking for evidence that analytic per-fragment shading is *specifically pathological* on
Apple's tile-based deferred renderer. **Apple's documentation does not support that claim, and I
am recording the refutation rather than burying it.**

### 2.1 Apple says being ALU-bound is usually the *good* outcome

> "So what can we do if we are actually limited by the ALU? Well, in most cases, we may want to
> celebrate. That's exactly what we want: the GPU is crunching numbers, and that's exactly what
> the GPU is for."
> — <https://developer.apple.com/videos/play/wwdc2020/10603/> ("Optimize Metal apps and games with
> GPU counters")

> "A high ALU limiter alone does not indicate a performance bottleneck."
> — <https://developer.apple.com/videos/play/wwdc2021/10148/>

And analytic shading skips exactly the cost TBDR exists to minimise. Apple's TBDR page lists tile
memory's advantages as *"Bandwidth that's many times faster than device memory / Access latency
that's many times lower … / Energy consumption that's significantly less"*
(<https://developer.apple.com/documentation/metal/tailor-your-apps-for-apple-gpus-and-tile-based-deferred-rendering>),
and WWDC 2020 puts it plainly: *"on a TBDR GPU a well written app uses a lot less memory bandwidth
than IMR GPU"* (<https://developer.apple.com/videos/play/wwdc2020/10631/>). A shader that reads no
textures spends none of that bandwidth.

**So "analytic shading is pathological on Apple silicon" is not a supportable claim, and this
document does not make it.**

### 2.2 But Apple's own prescribed remedy for ALU-bound work is the texture

The very next lines of WWDC 10603, after the "celebrate" quote:

> "But what if we actually want to reduce the ALU load? In which case, we will want to replace
> complex calculations with either **approximations or lookup tables**."

A texture *is* the lookup table. So Apple's guidance does not say our approach is wrong — it says
that **when you decide the ALU cost is too high, the documented fix is precisely the one §1.1
recommends.** That is a materially weaker argument than "pathological", and it is the honest one.

### 2.3 Three documented failure modes that do apply to us

| Failure mode | Apple's words | Applies to us? |
|---|---|---|
| **FP32 wastes half the ALU** | *"we can be 100% ALU limited but only stay at 50% utilization if all we are doing are FP32 operations."* 16-bit ops "run at double rate"; 32-bit integer and complex ops "run at half rate or less"; *"Some complex operations such as a square root will have an actually lower rate."* (10603) | **Yes.** `cobraHash`/`cobraNoise` are all FP32 `fract`/`dot` chains. Nothing is `f16`. |
| **Register pressure collapses occupancy** | *"Shaders that need to handle many different conditions can reserve more registers than necessary, and this can reduce the number of threads that run in parallel."* … *"a shader function which uses too many registers can result in register pressure … and has to use device memory instead."* Apple's f16 fix gave *"almost double"* occupancy. (10148) | **Likely.** The basin shader is long, with ~15 `smoothstep`s and many live temporaries. **Unmeasured.** |
| **Overdraw costs far more per fragment for us** | HSR *"allows the GPU to minimize overdraw by keeping track of the frontmost visible layer for each pixel"*; *"even if you draw two triangles back to front, HSR will ensure that there is no overdraw."* (10602) | Terrain is largely opaque, so HSR should already be protecting us — **but every fragment that does shade costs ~420 ALU ops instead of one texture fetch.** |

One correction to my own §1.1 while being precise: `cobraHash` is built from `fract`/`dot` on
`vec3` — **full-rate FP32 float work, not integer**, so Apple's "32-bit integer … half rate or
less" penalty does not apply directly. What does apply is that it is FP32 rather than `f16`, which
Apple's own demo showed costs roughly half the available registers and therefore occupancy.

**And TBDR actively helps us here, which must be said.** HSR guarantees an expensive fragment
shader runs **once per visible pixel** — *"even if you draw two triangles back to front, HSR will
ensure that there is no overdraw"* — provided the terrain stays opaque and is submitted before all
non-opaque geometry. For a renderer whose fragments are unusually expensive, that free
overdraw-elimination is worth more than it is to a texture-fetch renderer. Apple also notes
*"We don't actually need to sort opaque meshes"*, and that a depth pre-pass would be redundant:
*"if you only perform a depth pre-pass for performance, then hidden surface removal serves the
same purpose on Apple GPUs."*

**Conclusion: the §1.1 cost argument survives, but on much narrower grounds than "pathological."**
It is an argument about *absolute per-fragment cost, FP32 register footprint, occupancy risk, and
the absence of a mip chain* — not about TBDR incompatibility. Apple's position is that ALU-bound
with healthy occupancy is a state to *celebrate*, and that ALU-bound with **low** occupancy is the
failure. **Those two states are distinguishable only by measurement — and §2.7 explains why we
cannot currently take that measurement in a browser.**

### 2.4 A warning Stage 2 must respect: alpha-tested foliage defeats HSR

This is the most decision-relevant thing in Apple's documentation, and it cuts against the
fidelity plan rather than for it:

> "Opaque fragments allow HSR to eliminate the most work because any pixel beneath them can be
> rejected before shading."
> "We already know that some Metal features will make your fragments non-opaque, like **alpha
> blending and alpha testing**."
> "Then we have feedback fragments, which are generated by fragment functions containing a
> `discard` statement or that return a depth value. **Alpha tested foliage falls into this
> category.**"
> — <https://developer.apple.com/videos/play/wwdc2020/10632/>

Apple names our exact planned feature as the problem case.

Apple prescribes a strict submission order: *"First, opaque. / Second, alpha test, discard or
depth feedback. / And third, and finally, translucent meshes"*, and *"You should avoid
interleaving opaque and non-opaque meshes"*
(<https://developer.apple.com/videos/play/wwdc2020/10602/>).

**So "instanced alpha-tested foliage" — the headline BF-Vietnam feature — is the one addition that
is disproportionately expensive on Apple GPUs**, and it is expensive there whether we ship it in a
browser or in Metal. It must be sorted after all opaque geometry and budgeted separately. Also
noted: on Apple GPUs a depth pre-pass is redundant — *"When HSR is maximized, it can reject hidden
fragments as well as depth pre-passes can, but without any additional costs"* (10632).

### 2.5 Good news: MSAA is cheap here, if resolved in-pass

> "Apple GPUs have an efficient MSAA implementation. The hardware tracks whether each pixel
> contains a primitive's edge so it runs the per-sample blending only when necessary."
> — Apple's TBDR page (above)

> "You can even use MSAA with deferred rendering because all the processing is done on the chip in
> this architecture without the cost of additional memory bandwidth and storage."
> — <https://developer.apple.com/videos/play/wwdc2020/10631/>

Since WebGL2 *guarantees* `antialias` (§4.1), **MSAA is a cheap quality win on this hardware** and
a better use of budget than the FXAA/SMAA post pass we currently run. Worth testing.

### 2.6 Textures are not free either — and unified memory is not unlimited

Honest counterweight to §1.1: *"texture reads typically take a couple hundred cycles to complete
on average"* and *"the hardware needs at least two texture reads at a time to get full ability to
hide latency"* (<https://developer.apple.com/videos/play/wwdc2016/606/>). Dependent texture reads,
however, are **no longer** penalised on modern hardware — Apple's archived guide says they are
*"supported at no performance cost on OpenGL ES 3.0–capable hardware"*.

Apple recommends exactly what §4.3 concluded: *"you will want to use mipmaps if minification is
likely occurring"* and *"Use block-compression such as ASTC for assets"* (10603). One trap for
anyone tempted to replace noise with a float lookup table: *"watch out for 128-bit formats such as
RGBA32Float, since those are sampled at quarter rate. Oftentimes, these high precision pixel
formats are used for noise textures or lookup tables."*

On memory: unified memory removes the *copy*, not the *budget*. Apple documents
`recommendedMaxWorkingSetSize` as *"An approximation of how much memory … this GPU device can
allocate without affecting its runtime performance"* and still advises *"Make your assets as small
as possible… Use compressed texture formats."* **Any claim that "Macs have plenty of VRAM so
textures are free" is unsupported by Apple's documentation.**

### 2.7 The strongest argument for native found anywhere in this research

**You cannot profile a browser page with Apple's GPU tools.** Xcode's Metal debugger — which gives
per-line shader profiling, GPU counters, performance limiters and shader occupancy, i.e. exactly
the instruments that would settle §1.1 and §2.3 in an afternoon — requires the target process to
opt in:

> "To enable Metal capture in your app, add the `MetalCaptureEnabled` key to your `Info.plist`
> file with a value of `YES`." … "in macOS 14 and later, you can set the environment variable on
> your Metal app: `MTL_CAPTURE_ENABLED=1`."
> — <https://developer.apple.com/documentation/xcode/capturing-a-metal-workload-programmatically>

No Apple documentation authorises capture from an arbitrary third-party process such as Safari or
Chrome. Chromium's own doc delegates to a Chrome-team-but-not-official guide which is candid that
stock Chrome builds *"are not debuggable out-of-the-box"* and that after a capture *"the browser
always hangs indefinitely and needs to be restarted."* For Safari, **no documented capture path
exists at all**. The only officially documented browser-facing graphics tool is Web Inspector's
canvas/Graphics recording (<https://webkit.org/blog/8452/canvas-debugging/>), and **no source
found says it records WebGPU.**

**This is a real and serious cost of staying in the browser, and it deserves to be weighed
honestly.** This project's entire culture is instrument truth — *"visual work ships only after
Claude reads rendered screenshots"*, *"measure, don't guess"* — and the browser denies us the
single best instrument for the problem we currently have. It is the reason this document's §1.1 is
arithmetic rather than a profile.

It is not, on its own, enough to justify a port: a native **spike** (Stage 4) would give us the
Metal debugger on a representative scene without committing to a migration, and that is a much
cheaper way to buy the same information.

---

## Part 3 — WebGPU: real, shipping, and the wrong tool for this problem


WebGPU is genuinely available now, and it genuinely maps to Metal on macOS. It is still not what
this project needs, for a reason that is documented rather than speculative.

### 3.1 Availability (good)

- **Safari 26.0 (15 Sep 2025) ships WebGPU on by default.** WebKit:
  *"WebGPU has been enabled in Safari Technology Preview for over a year, and is now shipping in
  Safari 26.0 for macOS, iOS, iPadOS, and visionOS"*, and *"WebGPU supersedes WebGL on macOS, iOS,
  iPadOS, and visionOS and is preferred for new sites and web apps."*
  <https://webkit.org/blog/17333/webkit-features-in-safari-26-0/>
  Safari release notes confirm: *"Added support for WebGPU. (145801580)"*
  <https://developer.apple.com/documentation/safari-release-notes/safari-26-release-notes>
  **Open risk:** caniuse marks macOS Safari 26.0–26.5 *partial*, note 7: *"Partial support refers
  to only being enabled by default on macOS 26 Tahoe or later."* <https://caniuse.com/webgpu>
  Neither the WebKit post nor Apple's release notes state that restriction, and MDN's compat data
  records a plain `safari: 26`. **The sources disagree; this needs an empirical check on a
  Sequoia/Sonoma Mac, not a citation.**
- **Chrome shipped WebGPU by default on macOS in Chrome 113**, same release as Windows/ChromeOS —
  the common belief that macOS lagged is wrong: *"This initial release of WebGPU is available in
  Chrome 113 on ChromeOS devices with Vulkan support, Windows devices with Direct3D 12 support,
  and macOS."* <https://developer.chrome.com/blog/webgpu-release>
- **Firefox**: enabled on macOS **Apple silicon only** since 147; *"Does not support macOS on
  Intel CPUs."* <https://developer.mozilla.org/en-US/docs/Web/API/GPU> (BCD) and
  <https://developer.mozilla.org/en-US/docs/Mozilla/Firefox/Releases/147>
- **It does map to Metal.** WebKit: *"It maps better to Metal, and the underlying hardware.
  Comparatively, WebGL required significant translation overhead due to being derived from OpenGL
  which was designed prior to modern GPUs."* The W3C explainer names the targets: *"Microsoft's
  D3D12, Apple's Metal, and Khronos' Vulkan."* <https://gpuweb.github.io/gpuweb/explainer/>
- **Compute shaders are first-class**, and WebGL2 has nothing equivalent — *"WebGL 2.0 Compute was
  an attempt … but the impedance mismatch with native APIs made the effort incredibly difficult."*
  (same explainer)

### 3.2 The cost, which is not negotiable

three.js's **own official manual** states the migration rule plainly:

> "Custom materials based on `ShaderMaterial`, `RawShaderMaterial` and modifications of built-in
> materials via `onBeforeCompile()` are **not supported** in `WebGPURenderer`. This part of your
> application must be ported to node materials and TSL."
> — <https://threejs.org/manual/en/webgpurenderer.html>

And separately:

> "`EffectComposer` with its effect passes are not supported because `WebGPURenderer` comes with a
> new, more modern post-processing stack." (same page; the class was then renamed
> `PostProcessing` → `RenderPipeline` in r183 — <https://github.com/mrdoob/three.js/wiki/Migration-Guide>)

**Our exposure, counted in the tree:**

| Item | Count | Must be rewritten in TSL? |
|---|---|---|
| `new THREE.ShaderMaterial` / `RawShaderMaterial` | **25** | Yes |
| `onBeforeCompile` patch sites | **6** (4 files) | Yes |
| `EffectComposer` post stack (`render/visual/post_stack.js`, 224 lines: RenderPass, UnrealBloomPass, SMAAPass, FXAAShader, OutputPass) | 1 stack | Yes — rebuild on `RenderPipeline` |

We are also on **three r160** (`web/wwwroot/vendor/README.md`: *"a static ESM subset of
`three@0.160.0`"*, `REVISION = '160'`), vendored deliberately *"without a bundler, import map,
package install, or network fetch"*. Current three.js is **r185 (2026-07-01)**. So WebGPU costs a
**25-revision engine jump plus a from-scratch rewrite of every shader in the project**, into an
API the three.js manual still describes as *"still in an experimental state"* with breaking
changes in essentially every revision (r185 removed `PCFSoftShadowMap`; r184 renamed
`positionLocal`→`positionGeometry`; r183 changed shadow bias; r182 renamed `colorBufferType`).

### 3.3 And it would not help

This is the decisive point. The documented WebGPU wins are **compute shaders** and **lower CPU
cost per draw call**. Chrome's own showcase measures *submission* cost — Babylon.js's WebGPU
renderer submitting a scene *"more than 10x faster"* than WebGL2's ~500 submissions/second
(<https://developer.chrome.com/blog/webgpu-io2023/>) — i.e. a draw-call-bound win.

**We are not draw-call-bound. We are at 15 draw calls and fragment-bound (§1.1).** No official
source claims WebGPU is faster for a low-draw-call, fill-heavy scene. three.js's manual says the
opposite is possible: *"depending on your application and scene setup, you will encounter missing
features **or a better performance with `WebGLRenderer`**."*

**Verdict: WebGPU is not the answer to this problem. Revisit it when (a) we are actually
draw-call-bound — a Vegas city block would do it — or (b) we want GPU compute for particles,
foliage culling or terrain generation. Not before.**

---

## Part 4 — The WebGL2 ceiling is nowhere near us


Everything on the fidelity wish-list is either **core WebGL 2.0** — spec-guaranteed on any
conformant implementation — or one well-defined extension query away.

### 4.1 Core, guaranteed, unused

The WebGL 2.0 spec has an explicit list of WebGL 1.0 extensions *"that reflect functionality that
is core in WebGL 2.0"*, which settles most of the list in one citation
(<https://registry.khronos.org/webgl/specs/latest/2.0/>): `ANGLE_instanced_arrays` (instancing),
`WEBGL_depth_texture`, `WEBGL_draw_buffers` (MRT), `EXT_shader_texture_lod`, `OES_texture_float`,
`OES_texture_half_float`, VAOs. The same spec adds:

- **Non-power-of-two textures, fully:** *"unlike the WebGL 1.0 API, there are no special
  restrictions on non power of 2 textures. All mipmapping and all wrapping modes are supported for
  non-power-of-two images."*
- **3D textures and 2D texture arrays** (`texImage3D`, `TEXTURE_2D_ARRAY`) — the natural home for a
  terrain splat set.
- **MSAA, and it is a guarantee, not a hint:** *"Different from WebGL 1.0, the depth, stencil, and
  antialias attributes in WebGL 2.0 must be obeyed by the WebGL implementation."* Plus
  `renderbufferStorageMultisample` + `blitFramebuffer` for offscreen MSAA.
- **Transform feedback, uniform buffer objects, GLSL ES 3.00, sampler objects, query objects.**

Spec minimums (OpenGL ES 3.0 Tables 6.28–6.29, inherited): `MAX_TEXTURE_SIZE` ≥ **2048**,
`MAX_DRAW_BUFFERS` ≥ **4**, `MAX_COLOR_ATTACHMENTS` ≥ **4**, `MAX_SAMPLES` ≥ **4**,
`MAX_ARRAY_TEXTURE_LAYERS` ≥ **256**. **A four-target deferred G-buffer with 4× MSAA is
spec-guaranteed on any conformant WebGL2 implementation.** Apple silicon reports far higher in
practice (typically 16384 texture size).

### 4.2 The one genuine gap

**Float/half-float *render targets* are not core.** Sampling them is; rendering into them needs
`EXT_color_buffer_float` (R/RG/RGBA 16F & 32F, `R11F_G11F_B10F`; *"The sized internal format
RGB16F is not color-renderable in this extension"*) or `EXT_color_buffer_half_float` (RGBA16F
only). <https://registry.khronos.org/webgl/extensions/EXT_color_buffer_float/>
Also `OES_texture_float_linear` is explicitly **excluded** from core promotion — 32-bit float
linear filtering still needs an extension; 16-bit linear filtering is core. Relevant to HDR
post-processing, which we already run.

### 4.3 Compressed textures on Apple silicon: ASTC is the right choice

Apple's **Metal Feature Set Tables** (rev. 2026-05-21,
<https://developer.apple.com/metal/Metal-Feature-Set-Tables.pdf>) list *"ASTC pixel formats |
Metal 3 & 4 | Apple2"* and mark ASTC **"Filter"/"Filter Sparse" across every Apple GPU family
Apple2–Apple10** — i.e. all Apple silicon. Conversely *"BC pixel formats — Not available"* on the
older families and only *"Varies"* on newer ones. **The desktop-standard BCn formats are the
wrong choice for Apple silicon; ASTC is the native one.**

The portable answer is KTX2/Basis Universal, which transcodes at load time to whatever the device
exposes — Khronos: KTX 2.0 *"adds support for Basis Universal supercompressed GPU textures"*,
which *"can be efficiently transcoded to a variety of GPU compressed texture formats at
run-time"* (<https://www.khronos.org/ktx/>). three.js's `KTX2Loader` *"parses the KTX 2.0
container and transcodes to a supported GPU compressed texture format"*
(<https://threejs.org/docs/#examples/en/loaders/KTX2Loader>), and `detectSupport(renderer)`
resolves the ASTC-vs-BCn question at runtime automatically.

**We have already vendored all of this and shipped zero `.ktx2` files.**

### 4.4 There is no draw-call ceiling to hit

No normative or vendor-published figure exists for draw calls per frame — searched across the
WebGL 2.0 spec, the extension registry, MDN and ANGLE's docs. What exists is *qualitative*
guidance, and its scale is telling. MDN's WebGL best-practices page:

> "'Batching' draw calls into fewer, larger draw calls will generally improve performance. If you
> have **1000 sprites** to paint, try to do it as a single `drawArrays()` or `drawElements()`
> call." — <https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices>

The official guidance starts recommending mitigation around **1000** objects. **We are at 15.**
That is roughly two orders of magnitude of headroom, and it is why no authority publishes a
number: 15 draw calls cannot be the problem.

### 4.5 macOS already runs WebGL on Metal

- **Safari has shipped WebGL2 since Safari 15 (2021), on Metal:** *"WebKit now supports WebGL2…
  In addition, the WebGL implementation now runs on top of Metal for better performance."*
  <https://webkit.org/blog/11989/new-webkit-features-in-safari-15/> The Metal ANGLE backend was
  turned on in STP 124: *"Enabled Metal ANGLE backend for WebGL (r274927)."*
- **ANGLE's own platform table** marks macOS Desktop GL **"deprecated"** and Metal
  **"complete"**. <https://chromium.googlesource.com/angle/angle/+/main/README.md>

So "move to Metal to go fast" partly describes where we already are: **Safari's WebGL2 is a Metal
renderer today.** A native port's gain over that is the removal of a translation layer — real, but
far smaller than the 5× the current symptoms would need.

### 4.6 Two things needing measurement, not citation

Flagged honestly — **no official source exists** for either:

1. **Which compressed-texture extensions our actual Macs expose.** Apple documents the GPU, not
   the browser's extension string. Answer with `gl.getSupportedExtensions()` on the target
   machines.
2. **Whether Chrome is on the ANGLE Metal backend on this install.** Chromium main still carries a
   `kDefaultANGLEMetal` feature flag and a *"Remove this after ANGLE Metal launches fully"* TODO,
   and no Chrome release note names the milestone. Answer at `chrome://gpu`.

### 4.7 The cheapest possible check on "laggy"

`requestAnimationFrame` *"will generally match the display refresh rate"*
(<https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame>). On a ProMotion
Mac that is **120 Hz — an 8.3 ms budget, not 16.6 ms.** A frame that reads as smooth at 60 Hz reads
as stutter at 120 Hz. **Confirm the owner's display refresh rate before attributing any of the
lag to the renderer.** This costs one line of JS and could reframe the entire complaint.

Also note `powerPreference: 'high-performance'` is documented as *"A hint"*, not a guarantee — and
on Apple silicon it is largely moot, since there is no discrete GPU to switch to.

---

## Part 5 — Native options, and a measured answer on the kernel

The crown-jewel question is: **does the C# kernel survive?** I did not want to answer this from
documentation, so I ran the experiment.

### 5.1 MEASURED: the kernel compiles for netstandard2.1 in about a day of shim work

Unity's documented .NET profile matrix accepts managed plug-ins built against **".NET Standard
(any version)"** and rejects **".NET Core (any version)"**. So a `net8.0`-only DLL is out and a
multi-targeted build emitting `netstandard2.1` is in. The relayed research claimed this was "one
csproj line". **It is not — and I measured what it actually is.**

Method: in this isolated worktree I added `netstandard2.1` to `TargetFrameworks` on
`GunsOnly.Sim.csproj` and built. **The experiment has been fully reverted; the tree is clean.**

| Step | Result |
|---|---|
| Add `netstandard2.1` to `TargetFrameworks` | **372 errors** — all `record struct` / file-scoped-namespace parse failures. The language version silently defaults to **C# 8** for netstandard2.1. |
| Add `<LangVersion>latest</LangVersion>` | **5,930 errors**, but only **3 distinct causes**: `IsExternalInit` (missing → every `init`/`record` fails), `System.Text.Json` (not in the netstandard2.1 reference set), `IReadOnlySet<T>` (.NET 5+). |
| Add a shim file (`IsExternalInit`, `IReadOnlySet<T>`) + a conditional `System.Text.Json` PackageReference | **165 errors**, and now the full inventory is visible. |

**The complete remaining gap — 13 distinct BCL APIs, nothing architectural:**

| Missing API | Occurrences | Nature |
|---|---|---|
| `ArgumentNullException.ThrowIfNull` | 194 diagnostics / **97 call sites** | .NET 6 helper (`Applies to` lists `net-6.0`+ only, no netstandard) — 3-line polyfill |
| `Enum.IsDefined<T>(T)` (generic overload) | 80 | .NET 5 — polyfill |
| `Array.Clear(Array)` (single-arg overload) | 16 | .NET 6 — polyfill |
| `Enum.GetValues<T>()` (generic) | 14 | .NET 5 — polyfill |
| `BitOperations` | 10 | internal in netstandard2.1 — polyfill |
| `PriorityQueue<,>` | 2 | .NET 6 — **needs a real implementation** (~100 lines or a package) |
| `ReferenceEqualityComparer`, `SHA256.HashData`, `Math.CopySign`, `Convert.ToHexString`, `char.IsAsciiDigit`, `ArgumentException.ThrowIfNullOrWhiteSpace`, `HashSet`→`IReadOnlySet` conversion | 2 each | all trivial |

**What was NOT found, which is the important part.** I grepped and compiled for the four patterns
that would turn a recompile into a rewrite:

- `INumber<T>` / `IFloatingPointIeee754<T>` / generic math — **zero occurrences.**
- `static abstract` interface members — **zero.**
- C# `required` members — **zero** (all 41 `required` hits in the kernel are the English word in
  comments).
- Collection expressions (16 sites) and 490 records — **all compiled fine** under
  `LangVersion=latest`.

**Verdict: the 66k-line kernel is netstandard2.1-compatible after one `LangVersion` line, one
conditional PackageReference, and a single shim file. That is roughly a day, not a rewrite.** This
is a measured result, not an estimate, and it materially de-risks the native half.

**The caveat that matters more than the compile:** compiling is not behaving. See §5.4.

### 5.2 Godot 4: no retargeting at all, but two sharp edges

**Current stable: Godot 4.7.1, 14 July 2026** (<https://godotengine.org/download/macos/>). C#
requires the separate .NET editor build — *"The standard Godot executable does not contain C#
support out of the box"*
(<https://docs.godotengine.org/en/4.7/tutorials/scripting/c_sharp/index.html>).

Verified against the godot-docs source corpus and `Godot.NET.Sdk` at tag `4.7.1-stable`, so the
negatives below are greps, not absences of searching:

- **A plain `ProjectReference` at `net8.0` works.** `Godot.NET.Sdk` is a thin `Microsoft.NET.Sdk`
  wrapper that sets no TargetFramework and imposes no TFM validation; export is literally
  `dotnet publish --self-contained true`. Desktop requires only `net8.0`
  (`GodotMinimumRequiredTfm => "net8.0"`; the net9 condition is Android-only). **So Godot needs
  none of §5.1's shim work.**
- **Determinism story is better than Unity's.** `_PhysicsProcess(double delta)` is a first-class
  fixed-rate callback; the physics engine can be set to **Dummy** (*"does nothing and returns only
  dummy values, effectively disabling all 3D physics functionality"*), so the kernel owns all
  state; `physics_interpolation` smooths rendering off a fixed-rate kernel with no manual lerp;
  and under load Godot **clamps ticks per frame** (`max_physics_steps_per_frame`, default 8)
  rather than varying `dt` — wall-clock slow-motion, but every tick keeps fixed `dt` and the
  sequence is unchanged. **That is exactly what our kernel's determinism contract wants.**
- **Sharp edge 1 — an undocumented silent optimisation cliff.** Godot declares
  `<Configurations>Debug;ExportDebug;ExportRelease</Configurations>` and export runs
  `dotnet publish -c ExportRelease`. MSBuild passes `Configuration` down to ProjectReference'd
  projects, but `Microsoft.NET.Sdk` only defaults `Optimize` for the literal names `Debug` and
  `Release`. **`ExportRelease` matches neither, so the kernel would ship without `/optimize+`.**
  Godot patches this for the *game* project only, via a props file the kernel never imports.
  This is the assembly the entire `sim_ms` budget lives in. Inferred from two SDK sources rather
  than documented — **must be measured, not assumed** (disassemble the kernel DLL from a real
  macOS ExportRelease). Cheap to fix, but it does violate "kernel unchanged".
- **Sharp edge 2 — Godot C# still cannot export to web.** Stated flatly in the docs:
  *"Projects written in C# using Godot 4 currently cannot be exported to the web."*
  (<https://docs.godotengine.org/en/4.7/tutorials/export/exporting_for_web.html>) — **and the
  identical sentence appears in the unstable dev docs**, so it is not fixed in the next release
  either. PR #106125 "[.NET] Add web export support" is an open **draft**; issue #70796 open.
  Under the split this is survivable — Godot would be the native half only — but **it forecloses
  ever unifying both halves on Godot, and it means the browser dogfight stays three.js
  regardless.** Read positively: this is the fact that makes the split an architecture rather than
  a concession.
- **Metal is native and current.** Godot has had a native Metal driver since 4.4 (*"Metal support
  is currently limited to Apple Silicon (ARM) devices"*, MoltenVK covering Intel Macs), and
  *"Since Godot 4.7, Metal 4 is now used when supported"*. Forward+ brings volumetric fog, RGBA16F
  and 32-bit reverse-Z depth — the last matters for long-view-distance terrain.
- **macOS export is supported** since 4.2 for C# on all desktop platforms; universal-2 `.app`, and
  *"By default, macOS will run only applications that are signed and notarized."*
- Other risks: `ProjectReference` to an external class library is documented nowhere in Godot's
  docs (zero hits for `ProjectReference`/`TargetFramework`/`net8.0`), so it works by construction
  but is untested by contract; .NET 8 EOL is Nov 2026 with no announced Godot move to .NET 10.

### 5.3 Unity 6: works, but by the longer road

**Current: Unity 6000.5.7f1 (5 Aug 2026); LTS is 6.3.** Unity's managed-plug-in matrix reads
".NET Core (any version) | **Not Supported**", and `net8.0` *is* ".NET Core (any version)"; the
supported levels are *".NET Standard 2.1… the default API compatibility Level"* and .NET
Framework 4.8 (<https://docs.unity3d.com/6000.5/Documentation/Manual/dotnet-profile-support.html>).
The compiler is capped at C# 9.0 — irrelevant to us, since Unity loads a precompiled DLL and never
compiles our sources.

**CoreCLR is announced but not shipped.** Unity staff: *"Unity 6.8 will no longer have Mono as an
available option"* and *"Unity 6.8 will offer a .NET 10 based toolchain and BCL"*, while today
*"There will be no .NET 10 support in the experimental."* Unity 7 beta is December 2026, full
release *"Q1 2027"*. **So the netstandard2.1 route in §5.1 is the only route for at least a
year.** Licensing: Personal is free under $200K revenue/funding, and the Runtime Fee was
cancelled — *"we've made the decision to cancel the Runtime Fee for our games customers, effective
immediately"* (<https://unity.com/blog/unity-is-canceling-the-runtime-fee>).

Two points in its favour and two against:

- **For:** Unity never compiles our sources — it loads IL from a precompiled `.dll` — so Unity's
  C# language ceiling is irrelevant to us. And Unity physics can be removed from the loop
  entirely: `Physics.simulationMode = SimulationMode.Script`, never call `Physics.Simulate()`.
  The kernel owns all state; Unity writes transforms and renders. That is the officially supported
  shape and it fits our architecture exactly.
- **Against:** it needs the §5.1 shim work Godot does not; and **float determinism is a live
  risk** — Unity's CoreCLR is IEEE-754 compliant where Mono's JIT was not, and platforms differ on
  denormal flushing. Bit-identical results across `dotnet test`, Unity/Mono, IL2CPP-macOS and
  Unity/Wasm are guaranteed by no official source.
- **Static state no longer resets** between Play-mode entries in Unity 6.6+ (domain reload going
  away). Clean per-instance state is immune; static caches are not.

### 5.4 The risk both engines share, and it is the real one

**Our kernel is deterministic by design and several contract tests assert exact trajectories.**
Compiling under a different runtime does not preserve that. Whichever engine is chosen, the first
question is not "does it build" (§5.1 answers that) but **"which of the 237 test files still
pass bit-identically under the new runtime?"** Treat that as a first-class, budgeted migration
cost, not a footnote.

A useful shape either way: have the xunit project target `net8.0` but reference the **exact
output the engine loads**, so the tested binary is the shipped binary. Otherwise we are testing
something we do not ship.

Tests themselves stay put. Unity Test Framework is NUnit-based with no xunit support, and
`xunit` appears zero times in godot-docs — but in both cases the engine SDK applies only to the
project that declares it, so a test project referencing the *kernel* pulls in nothing
engine-related and `dotnet test` runs exactly as today. **Do not rehost 237 test files into an
engine test framework.** (Godot rule: never point a test project at the *game* project —
`Sdk.targets` hard-errors on mixed bindings.)

### 5.5 The other candidates, briefly

| Option | Verdict |
|---|---|
| **Unreal 5.8** | No C# support. Note Epic: *"UE 5.8 is the last planned major Unreal Engine 5 release… as we ramp up work on UE6."* Mac is documented but degraded — Lumen with Hardware Ray Tracing *"Not currently supported"*, Nanite *"Apple Silicon M2+ (beta support)"*. Royalty: *"All lifetime gross revenue above $1M… subject to a 5% royalty."* Rebuilding 66k lines in C++ is the whole cost. **Rejected — the one option that genuinely endangers the crown jewels.** (No Epic page states C# is unsupported; the evidence is structural — the 5.8 docs expose only Blueprints and C++ — so treat that specific point as inferred.) |
| **Bevy 0.19** | Disqualifies itself in its own documentation: *"If you are currently trying to pick an engine for your Next Big Project™, we recommend that you check out Godot Engine. It is currently much more feature-complete and stable."* Calling the kernel would need .NET Native AOT behind a C ABI — *"Must only have blittable arguments"* — i.e. hand-written flat wrappers for every exposed type and no C# debugger across the boundary. **Rejected.** |
| **Raw Metal** | Maximum control, maximum cost, and gives up every engine convenience (asset pipeline, scene tooling, shadows, LOD) — which is precisely the content tooling the split was supposed to buy. Rejected. |
| **Native shell + custom renderer, kernel as-is** | The honest fallback if T4 fires and both engines disappoint. Preserves the kernel perfectly, but rebuilds 57k lines of presentation from nothing. |

### 5.6 What leaving the browser actually costs, itemised

**Shipping a Mac app to someone who tapped a link in Instagram:**

- **$99/yr** Apple Developer Program — *"Enrollment is 99 USD… per membership year."*
  (<https://developer.apple.com/support/compare-memberships/>)
- **Developer ID certificate** — *"lets Gatekeeper verify that you're a trusted developer when
  people download and open your app… from outside the Mac App Store."*
- **Notarisation is mandatory** — *"Beginning in macOS 10.15, all software built after June 1,
  2019, and distributed with Developer ID must be notarized"*, plus Hardened Runtime and a secure
  timestamp. Turnaround *"within 5 minutes, and for 98 percent of software within 15 minutes."*
  Tooling: `notarytool` then `xcrun stapler staple`; `altool` was cut off 1 Nov 2023. **Ship a
  DMG, not a ZIP** — *"While you can notarize a ZIP archive, you can't staple to it directly."*
- **Gatekeeper friction got worse** — *"In macOS Sequoia, users will no longer be able to
  Control-click to override Gatekeeper… They'll need to visit System Settings > Privacy &
  Security."* (<https://developer.apple.com/news/?id=saqachfa>)
- **There is no Apple auto-update service outside the Mac App Store.** Flagged honestly as an
  *absence of any source*, not a cited negative: Apple's own guidance presumes you write one —
  *"Many Mac software products include a software updater… If you write a software updater in the
  simplest way, you run the risk of a hard-to-reproduce crash."* Sparkle is third-party.

**Set against `bin/deploy-web`**, which today does candidate verification, production promotion
and rollback against Vercel's control plane in one command, with a break-glass path. That
machinery does not transfer.

**And the Quest, which is nearly free if we stay:** Meta's own docs — *"Meta Quest Browser can
open hosted 2D sites, screen-based 3D sites, and immersive WebXR experiences"*, with packaging as
a PWA explicitly **optional** (<https://developers.meta.com/horizon/documentation/web/>). three.js
is named. There is even a deep link, `https://www.oculus.com/open_url/?url=<encoded-https-url>`,
which sends a page straight from a phone to the headset — usable as a plain anchor in an Instagram
bio. Caveats: WebXR is a W3C *Candidate Recommendation Draft* (9 June 2026), MDN marks it *"not
Baseline"*, and **Safari on macOS/iOS does not support it** — so WebXR is a Quest/Chromium path,
not a universal one.

**Net:** a native half costs $99/yr, a signing-and-notarisation pipeline, a self-built updater, and
the loss of link distribution and the Quest path *for that half*. All survivable — but only worth
paying for a capability the browser genuinely cannot deliver.

### 5.7 Comparison table

| Axis | Stay WebGL2 (recommended) | WebGPU in browser | Godot 4 native | Unity 6 native |
|---|---|---|---|---|
| **Fixes the current lag?** | Yes if §1 is right — un-fork Cobra, texture the ground | No — we are not draw-call-bound (§3.3) | Only by also doing the §1 content work | Same |
| **Kernel preserved** | Perfectly (already runs) | Perfectly | **Yes, `net8.0` ProjectReference, no retargeting** | Yes, via netstandard2.1 + ~1 day shim (§5.1) |
| **xunit suite unchanged** | Yes | Yes | Yes | Yes |
| **Determinism risk** | None (status quo) | None | Low — fixed-tick `_PhysicsProcess`, Dummy physics, tick clamping | **Moderate — CoreCLR IEEE-754 change** |
| **Renderer cost** | £0 — keep 140 modules | **Rewrite 25 ShaderMaterials + 6 `onBeforeCompile` + post stack in TSL; r160→r185** | Rewrite ~57k lines of JS/GLSL | Rewrite ~57k lines |
| **HUD** | Unchanged | Mostly unchanged | Duplicate 7.7k lines | Duplicate 7.7k lines |
| **Link distribution / mobile** | Kept | Kept | **Lost** | Lost (Unity Web is a separate build) |
| **WebXR → Quest with no port** | Kept | Kept | **Lost — Godot C# has no web export at all** | Lost |
| **Vercel deploy/rollback** | Kept | Kept | Rebuild (sign, notarise, update) | Rebuild |
| **Metal GPU profiling (§2.7)** | **Not available** | Not available | **Available — full Xcode Metal debugger** | Available |
| **Content/asset tooling** | Hand-rolled | Hand-rolled | **Strong** | **Strongest** |
| **Maturity for this workload** | Proven in production | three.js manual: *"still in an experimental state"* | Mature | Mature |
| **Rough effort to first flyable** | days | weeks–months | months | months |

---

## Part 6 — The split line, drawn concretely


The single best piece of news in this investigation: **the C# side of the codebase is already
almost perfectly portable, and nobody planned it that way — it fell out of the determinism
contract and the hot-frame optimisation.**

### 6.1 The measured boundary

| Layer | Files | Lines | Browser-coupled? |
|---|---|---|---|
| `sim/` — the kernel | 174 | **65,677** | **No.** `GunsOnly.Sim.csproj` is a bare `net8.0` class library with **zero** `PackageReference` and **zero** `ProjectReference`. Its only content beyond source is two embedded airframe JSONs. |
| `web/*Projection.cs`, `SnapshotHotFrame`, `SnapshotJson`, `MeshSnapshot`, `KoreaTerrainTruth`, `IncidentReplayProjection` | 10 | **8,318** | **No.** Proven, not assumed: `sim.Tests/GunsOnly.Sim.Tests.csproj` `<Compile Include="..\web\…" Link="…"/>`-links nine of them and exercises them as ordinary .NET. `SnapshotHotFrame.cs` says so in its own header: *"This type deliberately carries no browser or JS-interop attributes so sim.Tests can link and exercise it as ordinary .NET."* |
| `WebBridge.cs`, `CobraWebBridge.cs`, `MedevacWebBridge.cs`, `MotorcycleWebBridge.cs`, `Program.cs` | 5 | **997** | **Yes** — these are the only files carrying `[JSExport]`/`[JSImport]` and the Blazor host. |

**The browser lock-in on the C# side is 997 lines out of ~75,000 — about 1.3%.** A native host
replaces those five files and reuses everything else unchanged, with the 237-file xunit suite
still running against it via plain `dotnet test`.

### 6.2 What is genuinely shared vs genuinely duplicated

| Asset | Under a split |
|---|---|
| `sim/` kernel + `sim.Tests` | **Shared source, one copy.** Consumed as a plain `net8.0` class library by both hosts. This is the crown jewel and it survives intact. |
| Snapshot/projection layer (8.3k lines) | **Shared source, one copy.** Already host-agnostic. |
| Host bridge (997 lines) | **Duplicated** — a Blazor bridge and a native bridge. Small and stable. |
| Content packs (`content/packs/{korea-1950s, ukraine-modern, cobra-vietnam}`) | **Shared data.** Terrain `.truth` atlases are already embedded resources consumed by C#, so both hosts read them identically. Renderer-side textures/meshes would need format decisions but not duplication. |
| Mission/route definitions | **Shared** (they live in kernel/content, not the renderer). |
| **Renderer** — `web/wwwroot/render/**`: **140 modules, 49,097 lines** of JS/GLSL | **Duplicated — and this is the real cost of the split.** None of it ports. |
| **HUD** — `hud.js` (5,360 lines) + `render/hud/**` (2,361) = **7,721 lines** | **Duplicated.** Painful: doctrine is explicitly *"REUSE the production F-22 hud.js machinery via a cobra data adapter (one-engine, never fork the HUD)"*. A native Cobra breaks that rule by construction. |
| Telemetry (`render/telemetry/**`, `/telemetry` endpoint, shell-health) | **Endpoint shared; client duplicated.** The wire format is JSON over HTTP, so a native client can post the same rows to the same `bin/telemetry-report`. |
| Multiplayer (`world-worker`, Cloudflare Worker) | **Shared** — it is a network service, host-agnostic by nature. |
| Vercel deploy/rollback (`bin/deploy-web`) | **Browser only.** The native half needs its own release, signing, notarisation and update story from scratch. |
| WebXR / Quest path | **Browser only.** There is no WebXR integration today (the only matches in the tree are inside vendored three.js), but a browser build reaches a Quest headset with no separate port; a native macOS build reaches it never. |

### 6.3 The honest cost of two products

The duplicated column is the renderer and the HUD — which is exactly where all the current pain
is, and exactly where the *one-engine doctrine* was written to stop forking. A split means
**permanently maintaining two renderers and two HUDs**. The repo already demonstrates what that
costs: Cobra forked the terrain engine and the resolution controller, and §1 is the bill.

**The asymmetry is the whole decision.** The kernel is 1.3% browser-coupled and ports almost for
free. The presentation is **~57,000 lines of JavaScript and GLSL that ports for nothing** — it
must be rewritten line for line in whatever the native engine speaks. A split does not move the
crown jewels; it duplicates everything that is *not* the crown jewels.

This is the strongest structural argument against splitting **early**. It is not an argument
against splitting **eventually** — but it means the split should be paid for by a capability the
browser genuinely cannot deliver, and measured, not assumed.

### 6.4 Where the product line actually falls, if it falls

If the split does happen, the boundary the owner named is the right one and it is also the
technically correct one:

- **Browser half — the guns-only dogfight (F-22, Rapier).** High altitude, mostly sky, few
  objects, no buildings, no dense foliage, view distance managed by
  *adaptive-world-radius doctrine*. This is a naturally cheap scene, it is the half that reaches
  a phone from an Instagram link, it is the half that reaches a Quest through WebXR, and it is
  the natural home of the *minimum-viable-hardware* ambition.
- **Native half — the low-level war sim (Cobra Vietnam, Vegas buildings, medevac).** Low and
  slow among terrain, structures and ground contact, where texture memory, cast shadows,
  alpha-tested foliage and genuine draw-call volume all bite at once.

The trap to avoid: **Cobra is currently the evidence for "the browser can't do it," and §1 shows
Cobra is not evidence of that at all.** Until Cobra has been given the shared terrain engine, the
adaptive controller, the hot-frame path and one texture, its frame rate says nothing about the
browser's ceiling.

---

## Part 7 — What the browser half can gain cheaply (and it is a lot)


The machinery for most of the missing fidelity is **already vendored and already unused**. This is
not a "we could build it" list; it is a "we built it and never plugged it in" list.

| Capability | Status in tree | Cost to switch on |
|---|---|---|
| **Compressed textures (KTX2/Basis)** | `vendor/three/addons/loaders/KTX2Loader.js`, `libs/basis/basis_transcoder.js`, `libs/ktx-parse.module.js`, `libs/zstddec.module.js` all vendored; `render/assets/three_r160_loader.js` already constructs a `KTX2Loader` and calls `detectSupport()` against the live renderer. **Zero `.ktx2` files exist in the repo.** | Author the textures. The code path is done. |
| **Textured meshes (glTF + Draco/meshopt)** | `GLTFLoader.js` + `meshopt_decoder.module.js` vendored and **in production use** — 9 `.glb` models with LOD0/1/2 chains ship in `korea-1950s` (player/bandit jets, carrier, destroyer, cockpit). | Airframes are untextured because no texture assets were authored, **not** because the pipeline is missing. |
| **Instancing** | Already used in 10 modules (`korea_scenery.js`, `tactical_clouds.js`, `cobra_canyon_asset_kit.js`, `mission_features.js`, `casevac_*`, `scene_builders.js`, …). | Free. |
| **Alpha-tested foliage** | `alphaTest` appears **zero** times in `render/**`. | New work — but it is the standard instanced-quad-with-alpha-test technique, and instancing is already there. |
| **Cast shadows** | Full rig exists: `shadowMap` config, PCFSoft, `shadow_stabilizer.js` with texel snapping, per-tier `shadowMapSize` 512/1024/2048. Disabled for `combat` because there are no receivers (§1.4). | Set `receiveShadow`, widen `shadowHalfExtents.combat` from 44 m, add `combat` to `shadowModes`. Costs one shadow pass. |
| **Cascaded shadow maps** | **Not vendored** — `three/addons/csm/` is absent from the vendored subset. | Vendor the addon (the repo has a documented vendoring ritual in `vendor/three/README.md`). |
| **Post-processing** | Live: `render/visual/post_stack.js` runs RenderPass + UnrealBloom + SMAA/FXAA + OutputPass. | Already shipping. |
| **Adaptive resolution** | Live for F-22 (`render/visual/adaptive_resolution.js`), absent in Cobra. | Import it. |
| **Structures / buildings** | No system exists. `content/packs/cobra-vietnam/` contains **exactly one file** (`cobra-canyon.world.json`) — no models, no textures, no atlas. | Genuinely new. This is the real content program, and it is the same program whether it ships to a browser or a native app. |

**The conclusion for the browser half is blunt: the F-22 dogfight does not need a new platform to
look substantially better. It needs texture assets and a shadow receiver.** Both are content and
configuration, and both are cheaper than one week of a native port.

Anisotropic filtering is already tier-configured (`render/visual/profile.js:55`,
`korea_pack_adapters.js:22-27`), which matters: it is the mip-filtering quality knob that analytic
noise (§1.1) can never have.

---

## Part 8 — Staged plan for the recommended path


Each stage is independently shippable and independently falsifiable. The owner can fly the result
of every one.

### Stage 0 — Instrument before touching anything (½ build)

Do not act on any of this without the frame attribution the perf-attribution agent is producing.
Specifically we need, per mode: `sim_ms`, `view_ms`, GPU frame time, and a fill-rate probe
(render the same scene at 0.5× resolution — if frame time roughly halves, it is fragment-bound and
§1.1 is confirmed empirically rather than by op-counting).

Three checks cost minutes and could reframe everything (§5.6, §5.7):
`gl.getSupportedExtensions()` on the owner's Mac, `chrome://gpu` for the active backend, and the
**display refresh rate** — if it is a 120 Hz ProMotion panel the budget is 8.3 ms, not 16.6 ms.

**This document's §1 is an ALU op-count and a static read of the tree. It is arithmetic, not a
measurement.** Stage 0 is what converts it.

### Stage 1 — Un-fork Cobra (1–2 builds) — the highest-leverage work in the repo

1. Import `render/visual/adaptive_resolution.js` (or the whole `visual_runtime`) into `cobra-lab`.
   It is the only production mode without a frame-rate feedback loop, and it is the slowest.
2. Replace the analytic noise chain in `cobra_canyon_terrain_material.js` with texture fetches —
   the single highest-value change in the repo, because it cuts cost *and* fixes the flat look.
3. Adopt `render/environment/korea_terrain.js` rather than the private material entirely — per
   *cobra-bike-dont-use-terrain-engine*, this is worth more than any individual shader fix, and
   every future renderer gain then arrives free.

(The interop fix that would have been step 2 in a Build 263 plan is already done — §1.3.)

Expected: the 12.5 fps report resolves without a single API change. **If it does not, that is
trip-wire T2 (§9) and the native case strengthens materially.**

### Stage 2 — Texture the world (2–3 builds) — the fidelity program

1. Author a KTX2/ASTC ground albedo + normal set and replace the analytic noise chain with texture
   fetches. This is simultaneously a **look** fix and a **cost** fix — the rarest kind.
2. Texture the airframes. The glTF pipeline already ships nine models with LOD chains; they are
   untextured only because nobody authored the maps.
3. Break the shadow loop: `receiveShadow` on terrain, `combat` into `shadowModes`, widen
   `shadowHalfExtents.combat` well past 44 m, vendor CSM if a single cascade cannot cover the
   relief.
4. Instanced alpha-tested foliage. Instancing exists; `alphaTest` is used nowhere yet.

This is the *graphics-fidelity-target* program, and none of it is platform-dependent. It is the
work a native port would have to do anyway — which is exactly why doing it first is free
information.

### Stage 3 — The buildings sandbox, in the browser first (3–5 builds)

Build the OSM-extrusion building system for Vegas **in the browser**, because it is the hardest
test of the renderer and because it is the first thing that could genuinely exceed a browser
budget. Per *nellis-canyon-vegas-mission*, Vegas is the sandbox precisely because "does it look
right" has an objective answer there.

**This is the experiment that decides the platform question.** If a credible Strip block sustains
60 fps in a browser on the owner's Mac, the split is unnecessary and the answer is settled with
evidence. If it does not — with adaptive resolution, instancing, LODs and compressed textures all
engaged — then we have the measured case for native that we do not have today.

### Stage 4 — Native spike, only if Stage 3 fails (2 builds, and it is a spike, not a port)

**Target: Godot 4.7 (.NET build).** §5.1 already proved the kernel *compiles*; the spike must
prove the three things documentation cannot answer:

1. **Determinism.** Run the 237-file xunit suite against the exact DLL Godot loads. How many
   assertions still pass **bit-identically**? (T4.)
2. **The optimisation cliff.** Do a real macOS `ExportRelease` with the kernel referenced and
   disassemble the shipped DLL. Is it optimized? (T4b — if not, every perf number is wrong.)
3. **`ProjectReference` survives export.** Undocumented in Godot's docs, with one open bug in the
   neighbourhood (#104910). The same export proves this and (2) at once.

Then drive a cube around a heightfield with the real kernel, physics server set to `Dummy`, and
capture a Metal frame in Xcode — which also buys the §2.7 instrumentation we cannot get in a
browser. **Nothing else. Do not port the HUD, the renderer, or a mission.**

If the spike fails on (1), the native option is far more expensive than this document assumes and
the recommendation must be revisited.

---

## Part 9 — Decision criteria and trip-wires


### What must be true for "stay in the browser" to hold

1. Cobra's frame rate is fragment-bound and CPU-interop-bound, not API-bound.
2. Removing the analytic noise chain in favour of textures makes it both cheaper and better.
3. A city-density scene can be made to fit a browser budget with standard technique.
4. The distribution advantage is worth something.

### Trip-wires — evidence that would change the recommendation

| # | Trip-wire | What it would mean |
|---|---|---|
| **T1** | Stage 0's half-resolution probe does **not** roughly halve Cobra's frame time. | §1.1 is wrong; the cost is elsewhere (vertex, CPU, or driver) and this document's central diagnosis fails. Re-diagnose before anything else. |
| **T2** | Stage 1 lands all three un-forks and Cobra is still under ~40 fps on the owner's Mac. | The browser genuinely has a ceiling we cannot see from the source. Escalate the native case immediately — this is the single most informative possible result. |
| **T3** | Stage 3's Vegas block cannot hold 60 fps with textures, instancing, LODs and adaptive resolution all engaged. | The measured case for a native low-level sim now exists. Split. |
| **T4** | The Stage 4 spike shows a material number of the 237 test files no longer pass **bit-identically** under the engine's runtime. | The determinism contract — the kernel's defining property — does not survive the move. This is now the *main* kernel risk, since §5.1 already settled that it compiles. |
| **T4b** | A real Godot macOS `ExportRelease` ships the kernel DLL **unoptimized** (§5.2 sharp edge 1). | Every native perf number would be wrong. Cheap to fix, but must be checked before any comparison is believed. |
| **T5** | Shell-health telemetry shows organic link arrivals converting at a non-trivial rate. | The browser's distribution value goes from theoretical to measured, and the browser half becomes the *primary* product rather than the simpler one. |
| **T6** | Shell-health continues to show ~0% organic mobile conversion after the boot-fallback work lands. | The distribution argument weakens considerably — though note it does **not** strengthen the native case, since a native Mac app converts an Instagram webview visitor at exactly 0% by construction. |
| **T7** | The owner buys a Quest and wants VR sooner than "not a priority". | Strongly favours the browser for whatever should reach the headset, since WebXR needs no separate port. |
| **T8** | three.js ships a stable, non-experimental WebGPURenderer with a GLSL compatibility path. | Re-open Part 2. As of r185 the manual still says *"still in an experimental state"* and ShaderMaterial is unsupported, so this is not imminent. |

### The honest counter-case for splitting now

It deserves stating properly rather than being strawmanned:

- **Two products can be honestly different.** A simple browser dogfight and a heavy native sim are
  not a compromise; they are two good things. The owner said as much.
- **The renderer duplication may be a feature.** The one-engine doctrine is already violated in
  practice (Cobra and Weekend Ride do not import the shared terrain engine at all). A deliberate,
  well-drawn split is more honest than an accidental one.
- **Native tooling for content is genuinely better.** Nothing in the browser stack resembles a
  material editor, a terrain painter, or a foliage tool. The Vietnam/Vegas content program is
  large, and asset-pipeline maturity is a real cost the browser side pays forever.
- **The 66k-line kernel really is portable**, and that is unusual. The window to split cheaply is
  open and will stay open — but it is genuinely low-risk to take.

The reason this document still says "not yet" is **sequencing, not merit**: every item in Stages
1–3 must be done whichever platform wins, and doing them first costs nothing and answers the
question with measurements.

---

## Part 10 — What I measured, what I computed, and what I assumed


Held to the *instrument truth* discipline. This matters because two other agents are producing
real frame attribution and I must not be mistaken for having done so.

### Read directly from the tree (verifiable, file:line given throughout)

- `GunsOnly.Sim.csproj` is a bare `net8.0` library with zero package/project references.
- Line counts: kernel 65,677 / projections 8,318 / browser-coupled 997 / renderer JS 49,097 /
  HUD 7,721. `find` + `wc -l`.
- 25 `ShaderMaterial`/`RawShaderMaterial` sites, 6 `onBeforeCompile` sites across 4 files.
- 13 raster images in `web/wwwroot`; **zero** `.ktx2`; 9 `.glb` models with LOD chains.
- `alphaTest` appears zero times in `render/**`.
- `shadowModes` excludes `combat` (`app.js:7729`); `shadowHalfExtents.combat = 44`.
- `cobra-lab/main.js` imports neither `visual_runtime` nor `adaptive_resolution`.
- Cobra's 30 Hz JSON sampling and 7-slot `GetHotPose` binary path (§1.3) — **verified, and it
  corrects the standing Build 263 diagnosis.**
- `content/packs/cobra-vietnam/` contains exactly one file.
- three.js `REVISION = '160'`, vendored per `vendor/README.md`.

### Actually measured by running it (§5.1)

- The `netstandard2.1` compile of `GunsOnly.Sim.csproj`, in this worktree, with `dotnet build`.
  372 → 5,930 → 165 errors across three steps; the 13-API inventory is a real compiler diagnostic
  count, not an estimate. **The experiment was fully reverted — `git status` shows only this
  document.**
- Absence of generic math / `static abstract` / C# `required` members in the kernel: grep **and**
  compiler-verified.

### Computed, not measured

- **The ~42-hash / ~420-ALU-op-per-fragment figure in §1.1 is arithmetic**, derived by counting
  the noise chain in the shader source. It is not a GPU profile. The pixel-count multiplication
  is likewise arithmetic from `QUALITY_PIXEL_RATIOS` and a plausible Retina viewport.
- **Stage 0 exists specifically to convert this into a measurement.** The half-resolution probe is
  the decisive test: if frame time roughly halves, the diagnosis holds; if not, T1 fires.

### Assumed, and flagged as such

- That the owner's reported lag is on the machine the Build 263 diagnosis called an **Apple M5**.
- That the display refresh rate is unknown — **not** that it is 60 Hz. §5.7 is a question, not a
  finding.
- That organic-arrival conversion remains near zero; the in-source note at `app.js:1329-1334` is
  a developer's summary of shell-health data, not a telemetry query I ran.

### Could not be sourced authoritatively (no official document exists)

- Any draw-call ceiling for WebGL2 — **confirmed absent**, not merely unfound (§5.4).
- Which compressed-texture extensions Safari/Chrome expose on Apple silicon (§5.6).
- The Chrome milestone at which ANGLE Metal became the macOS default (§5.6).
- Whether Safari 26 WebGPU is restricted to macOS Tahoe — caniuse says yes, Apple's own release
  notes and MDN say nothing (§2.1). **The sources genuinely disagree.**

### Deliberately not duplicated

Frame attribution (perf-attribution agent), render-architecture review, and the in-flight Cobra
lag fix. Where this document needs their kind of evidence it says so and defers.

