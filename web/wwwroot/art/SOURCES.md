# Production shell art — provenance

These files are **project-generated fiction** used only by the loading cover and aircraft
picker. They are presentation art, not evidence for an airframe, place, event, or simulation
constant. They may not be reused as a source reference for a content pack.

## Generation and review record

### F-22A and Cobra ImageGen v4 — CURRENT for these two picker cards

- Created: 2026-09-09 using the built-in OpenAI `image_gen.imagegen` tool. No CLI/API fallback
  was used. A model identifier was not returned as a structured tool field; the original PNGs
  retain their generation metadata. Do not infer a model from the user's mention of a new release.
- Exact prompts and selection record:
  `tools/assets/generators/menu-posters/sources/generated-v4-prompts.json`.
  Both calls generated new art without reference images. The user reviewed the displayed
  outputs and said, "these images are great".
- Exact selected sources: `sources/jet-f22-generated-v4.png`, 1,992,919 bytes,
  SHA-256 `a6d18c79a740a0540626ac0a4578c939c03bfacebc998438bf1f3b50e3d0102c`;
  and `sources/jet-cobra-generated-v4.png`, 2,205,001 bytes,
  SHA-256 `12e8a0f14b77548a674da32e02b1526d3248ebe6a1efb9b3380d87d50a7e34fc`,
  under the menu-posters generator directory.
- Runtime encoding: `cwebp -q 82 -resize 1000 1000 -m 6 -sharp_yuv`.
  Recreate with `node tools/assets/generators/menu-posters/render.mjs jet-f22-generated-v4 jet-cobra-generated-v4`.
  Re-encoding is reproducible from the retained source; a fresh generation is not claimed to
  reproduce the same image.
- Epistemic label: `fiction`. These are idealized selection illustrations, not screenshots,
  airframe engineering references or evidence of achieved runtime scenery quality.
- Rights review: project-generated; no third-party image input, copied insignia, watermark or
  recognizable person is present. Use is approved within this task's requested game-asset work.
- Visual review: both aircraft remain readable, with distinct cold-altitude and warm-gorge
  compositions. The Cobra illustration's scenery is aspirational. The previous SVG-derived
  WebPs and sources remain available under their original names; only picker references changed.

### Rapier production-model poster — CURRENT

- Created: 2026-09-10 with `tools/assets/generators/menu-posters/rapier-model.mjs`.
  It calls the actual `createRapier()` factory with identity model transform and no definition
  or material override, using the game's environment reflections and a studio camera and lights.
- Source of record: `tools/assets/generators/menu-posters/sources/jet-rapier-hermeus-v1.png`,
  293,362 bytes, SHA-256 `0c4e8f111e9884afb9bacccd99e991994e5a3979ab4c0d7b38fee56cb30a957b`.
  The sibling `jet-rapier-hermeus-v1.provenance.json` records 18 served-source hashes, generator
  hash, model identity, camera, lights, Chromium 149.0.7827.55, Playwright 1.61.1 and SwiftShader.
  Sidecar SHA-256: `1582b38f7232464b2ba2f8f09ee5f5e58802e0549811ba5b87b068f91a6be114`.
- Design reference: the owner requested [Hermeus Ramjet-X](https://www.hermeus.com/article/hermeus-unveils-ramjet-x)
  as Rapier's visual inspiration. No manufacturer image pixels or model assets are embedded,
  and no image-generation model produced this poster.
- Epistemic label: `fiction`. This is a studio render of the game's fictional aircraft, not a
  gameplay screenshot or evidence of real aircraft performance. The source model has 1,464
  triangles; front, side, rear and three-quarter views were reviewed, and the poster fits both
  the desktop and phone cover crops.
- Runtime encoding: `cwebp -q 82 -resize 1000 1000 -m 6 -sharp_yuv`. Recreate with
  `node tools/assets/generators/menu-posters/render.mjs jet-rapier-hermeus-v1`.
  Re-encoding from the retained PNG is reproducible; fresh GPU rendering may vary by backend.
  The old Rapier SVG and WebP are retained as superseded art.

### Front-door poster set v3 — RETAINED (three current, three superseded picker outputs)

- Created: 2026-08-06.
- Generation session: `https://claude.ai/code/session_01C5SeyugjJniHgibAgCbuNN`.
- **Generator: no image-generation model was used.** Every v3 output named in this section is a
  deterministic rasterisation of a hand-authored SVG. There is no diffusion model, no
  image backend, no prompt, and no sampled seed anywhere in the pipeline — so there is no
  verbatim prompt to record, because none exists. The word "prompt" does not apply to this
  set; the source code below is the complete and exact input.
- **Authoring model: Claude Opus 5 (1M context)**, writing the SVG path data directly and
  reviewing each rasterised frame visually before accepting it. Iteration was
  author → render → look → correct, five to seven passes per card.
- **Exact source of record:** `tools/assets/generators/menu-posters/*.svg`. These files are
  committed. Each `.webp` below is reproducible byte-for-byte from its `.svg` — this is not a
  reconstruction after the fact, it is the actual input.
- **Exact toolchain:** `tools/assets/generators/menu-posters/render.mjs`, which loads each v3 SVG
  into headless Chromium (Playwright, resolved from `web/smoke/node_modules`) at
  `deviceScaleFactor: 2`, screenshots it, and encodes with
  `cwebp -q <82|80> -m 6 -sharp_yuv -resize <w> <h>`. The 2x capture is supersampling, which is
  how flat vector edges survive WebP.
- Regenerate with:
  `PATH="/opt/homebrew/bin:$PATH" node tools/assets/generators/menu-posters/render.mjs jet-f22 jet-rapier jet-cobra bike-yzf-r1 menu-hangar menu-hangar-small`
- **Inputs.** No third-party image, photograph, painting or model was traced, sampled,
  reprojected or embedded. Three inputs of record, all internal:
  1. `airframes/rapier.v2.json` — the Rapier planform is drawn from that file's
     `geometry.wing.halfStations` and `bodies[0].stations`, and obeys its
     `visualIdentity.canonical` / `.prohibited` lists (no canopy, no horizontal tail, one
     exhaust, one ventral inlet, low canted twin fins).
  2. `docs/art-direction/korea-1950s/engine-targets.json`, `golden-departure` — the loading
     cover uses that state's locked palette (sky `#6F8492`, cloudLight `#F4E7C9`, lightBreak
     `#F3D08C`, field `#A89858`, ridge `#394A3A`) so it agrees with the CSS fallback gradient
     in `index.html` and there is no visual event when the image decodes.
  3. A Battlefield Vietnam (2004) screenshot supplied by the owner on 2026-08-06 as a
     **look reference held in the reviewer's eye only**. Nothing was traced from it, no pixel
     of it is present, and it is not redistributed by this repository. What was taken is
     compositional and tonal doctrine, written down in the memory note
     `bf-vietnam-graphics-reference`: aerial perspective as the depth cue, warm foreground
     against cool distance, big hazy sky, muted saturation, aircraft read as silhouettes
     against bright sky. Applied most directly to `jet-cobra.webp`.
- **Human decision.** The owner's brief was that the previous set "still kinda sucks", with
  four specific faults: one composition reused four times, vehicles reduced to unreadable
  silhouettes, no differentiation of mood, and a painterly semi-realism that promised a game
  that does not exist. The replacement direction — one place, palette, time of day and weather
  per card, vehicle legible, drawn in the engine's own flat-shaded language — is the owner's
  call. Selection among iterations was the authoring model's visual review against that brief;
  it is not a claim of documentary accuracy about any airframe, place or event.
- **Epistemic label: `fiction`.** Every card is invented. The F-22A and AH-1G presentations are
  public-data surrogates drawn from general type knowledge, not from engineering drawings; the
  Rapier is fictional by construction; the motorcycle is a generic sportbike in a generic paint
  scheme and carries no manufacturer mark, model badge, or brand-official livery.
- **Rights status.** Project-generated from committed source under the owner's authenticated
  tooling. No third-party asset is known to be embedded and no third-party image was used as
  input to a generator. Unlike the v1 record below, this card is complete: generator, exact
  inputs, exact toolchain and verbatim source are all retained in-repo.

### Hangar series v1 — SUPERSEDED (F-22, Rapier, hangar fills)

Retained because the historical record must stay honest about what could not be reconstructed.
These images are no longer in the tree; the filenames were reused by v3.

- Created: 2026-08-01. Introduced by commit `5b4e7ca772c80fe409b66fece927eed6d0a94ca4`.
- Generation session: `https://claude.ai/code/session_01DeKHvxXtZcfMxpT1SpfvwQ`.
- Orchestrating model: Claude Opus 5, as recorded by the commit trailer. The image-generation
  backend/model name was not retained by the original session and is therefore **unknown**.
- Verbatim prompt: not retained. Reconstructed intent from the contemporaneous commit, not
  quoted as an original prompt: a dawn mountain hangar with each fictional aircraft backlit to
  near-silhouette; warm painterly world, sparse green service lamps, no people or copied
  characters.
- Inputs: no third-party reference image is recorded.
- Epistemic label: `fiction`. Rights: project-generated; no third-party asset known to be
  embedded. That record was **provisional** rather than a complete reproducibility card, which
  is precisely the gap v3 was required to close.

### Hangar series v2 — SUPERSEDED (AH-1G Cobra, YZF-R1)

- Created: 2026-08-03. Orchestrating model: Cursor Grok 4.5 with the workspace
  image-generation tool. The specific image backend and the verbatim prompt were not retained.
- Intent: match the v1 hangar mouth so the four picker cards read as one series. That match is
  what the owner rejected — four cards reading as one card was the defect, not the goal.
- Epistemic label: `fiction`. Rights: project-generated; no third-party asset known to be
  embedded.

### Top Gun vector picker v2 — CURRENT (F-14A, MiG-28 aggressor)

- Created: 2026-08-11. This is a replacement source-of-record, not a reconstruction of the lost
  Pillow inputs described in the superseded record below.
- **Generator: no image-generation model was used.** Both outputs are deterministic
  rasterisations of committed, hand-authored SVG geometry.
- **Exact source of record:**
  `tools/assets/generators/menu-posters/jet-f14.svg` and
  `tools/assets/generators/menu-posters/jet-mig-28.svg`.
- **Exact toolchain:** `tools/assets/generators/menu-posters/render.mjs` calls the bounded
  fail-closed SVG-subset rasteriser in `svg_raster.mjs` at 1800×1800, encodes its RGBA output with
  the repository PNG encoder (`../png.mjs`, Node zlib level 9), then runs
  `cwebp 1.6.0 -q 82 -m 6 -sharp_yuv -resize 900 900`. No browser, diffusion backend,
  photograph, or third-party image enters the pipeline.
- Regenerate exactly with:
  `PATH="/opt/homebrew/bin:$PATH" node tools/assets/generators/menu-posters/render.mjs jet-f14 jet-mig-28`
- Design input: saturated late-day fictional training-range sky, readable flat-shaded aircraft,
  distant invented ridges, and the sparse green service-lamp motif. The F-14A and MiG-28 labels
  identify public-data / fictional silhouettes only; neither source is an engineering drawing,
film still, Paramount mark, or official livery.

### Okanagan Fire Boss picker — CURRENT

- Created: 2026-08-15 with the built-in OpenAI ImageGen workflow, then visually rejected and
  corrected once because the first pass resembled a vintage radial crop-duster.
- Final request: a modern yellow AT-802F Fire Boss lifting from an Okanagan Lake scoop run, with
  a long angular PT6 turboprop nose, five-blade propeller, straight high wing and twin amphibious
  floats; preserve the lake, dry forested hills and restrained smoke haze; no text, logos,
  weapons or military markings.
- Exact selected source: `tools/assets/generators/menu-posters/sources/aircraft-fireboss.png`,
  2,412,233 bytes, SHA-256
  `e3541e7595a7253f98cd4066af27b075158b222cf8cf10d2e9fb81f17dfbfb03`.
- Exact output recipe: `cwebp 1.6.0 -q 88 -m 6 -sharp_yuv -resize 1200 1200`; rerun with
  `node tools/assets/generators/menu-posters/render.mjs aircraft-fireboss`.
- Epistemic label: `fiction`. The poster is menu presentation, not an OEM photograph, dimensional
  reference, terrain source or claim that the depicted livery/operator exists.
- Rights status: project-generated; no third-party asset is known to be embedded.
- Epistemic label: `fiction`.
- Rights status: project-generated from the two exact committed vector inputs; no third-party
  asset is embedded.

### Top Gun anime-1986 picker v1 — SUPERSEDED (F-14A, MiG-28 aggressor)

- Created: 2026-08-03.
- Orchestrating model: Cursor Composer with workspace Python/Pillow pipeline.
- Intent: saturated late-day Pacific cel sky, hard aircraft silhouettes, and sparse green service
  lamps — distinct from the dawn hangar series and scoped to the Top Gun experience picker /
  `top-gun-anime-1986` presentation theme.
- Inputs: no third-party reference image. F-14A and MiG-28 names denote public-data / fiction
  silhouettes only; neither painting is an engineering or Paramount asset.
- Subjects: stylized Tomcat twin-tail and MiG-28 aggressor delta (F-5-class fiction) for Ready
  picker backgrounds. `jet-mig-28.webp` is reserved for the seat toggle in Task 9.
- Epistemic label: `fiction`.
- Rights status: project-generated; no Paramount marks or third-party asset is known to be embedded.
- The original Pillow program and exact raster inputs were not retained. They have not been
  guessed or claimed as recovered; the v2 vector set above replaced both WebPs specifically to
  close this reproducibility gap.

This shell-only use is a reviewed exception to the earlier mood-board rule in ADR-0003. Generated
stills still may not become world geometry, textures, factual briefing imagery, or cutscene truth
without a separate content-pack rights and provenance review.

## What each card is

The rows below name each card by its source SVG stem, not by its `.webp`, so that the closure
table further down stays the single place a filename is bound to a hash.

| Card | Place, time, weather | What it is meant to say |
| --- | --- | --- |
| jet-f22 | Above a cloud deck at altitude, cold high sun | Clean, high, geometric, alone |
| jet-rapier-hermeus-v1 | Dark studio presentation | The actual slender silver Rapier, with a dark nose and thin wings |
| jet-cobra | Tropical gorge, humid backlit haze | Low, close, working, and dangerous |
| bike-yzf-r1 | Disused runway circuit, broad daylight | Warm, human-scale, nobody shooting |
| jet-f14 | Fictional training range, saturated late day | Big twin-tail fleet fighter, readable at picker scale |
| jet-mig-28 | Fictional training range, saturated late day | Compact aggressor silhouette, visually distinct from the Tomcat |
| aircraft-fireboss | Okanagan Lake, dry summer afternoon | Modern AT-802F Fire Boss lifting off the scoop lane |
| menu-hangar | Aerodrome at golden departure | Quiet backdrop; type sits on it |

## File closure

| File | Dimensions | Bytes | SHA-256 | Use |
| --- | ---: | ---: | --- | --- |
| `jet-rapier-hermeus-v1.webp` | 1000×1000 | 8294 | `adac612511b027207c7a40492010f841bbf2cde8b74cda316ef9696051228e58` | Current Rapier picker; actual game model render |
| `jet-f22-generated-v4.webp` | 1000×1000 | 82730 | `523cb0cd8a722c189ac93e011b24fd31c622aa29d4f0ae23382d646e48557a8a` | Current F-22A picker; ImageGen source retained |
| `jet-cobra-generated-v4.webp` | 1000×1000 | 120302 | `6ab96879304ea055ca0f80bead04510f32c4bd63afb936b2a56c319d0401238e` | Current Cobra picker; ImageGen source retained |
| `jet-f22.webp` | 900×1600 | 19334 | `203d4b601bbe39e6d2c03d3c28ccc953c9867bb08935aef045f487fe79d32297` | F-22A picker poster |
| `jet-rapier.webp` | 900×1600 | 21572 | `29699bb08e1878465d1cb21adc07da83f3e7b4479dbe8d57a375a74c05d3ec5b` | Superseded Rapier SVG poster |
| `jet-cobra.webp` | 900×1600 | 23000 | `2789e1aa005cb61482b032cee38913f93704abc047d2f630f0d98cafca616e1b` | AH-1G Cobra picker poster |
| `bike-yzf-r1.webp` | 900×1600 | 31680 | `a42fe42d802e3f3b1ae61fe5b70567226aab2ad28b84349d57c38d6fa4618869` | Weekend Ride picker poster |
| `jet-f14.webp` | 900×900 | 14886 | `e67c8ed4413eabf7bca198847e1be0bb64f61270c6c0e90b158852f00251d85e` | Top Gun F-14A picker vector render |
| `jet-mig-28.webp` | 900×900 | 13344 | `bc768c8e5aaee8437dd425879cc0d9d4b0f6a7dcfcc1fdc3a23c76db279d3212` | Top Gun MiG-28 aggressor vector render |
| `aircraft-fireboss.webp` | 1200×1200 | 208924 | `9737e2ceb208145c86e142d3e12975549565d4acc672a7000380c26e9beef149` | Okanagan Fire Boss picker poster; project-generated with OpenAI ImageGen on 2026-08-15, then corrected to the modern five-blade turboprop configuration |
| `menu-hangar-small.webp` | 900×600 | 8518 | `a17a868a3905c6fc9d8217ae156c7123228baaf1009dce7ef781e9e613ebde45` | Narrow/loading fallback |
| `menu-hangar.webp` | 1600×1067 | 18382 | `2b0bd29b275e6993c0ad9f355dfc5c048b1e05abaf2cd60323784f881ff9f070` | Wide/loading background |
