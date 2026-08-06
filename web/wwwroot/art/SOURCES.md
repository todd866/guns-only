# Production shell art — provenance

These files are **project-generated fiction** used only by the loading cover and aircraft
picker. They are presentation art, not evidence for an airframe, place, event, or simulation
constant. They may not be reused as a source reference for a content pack.

## Generation and review record

### Front-door poster set v3 — CURRENT (all six files)

- Created: 2026-08-06.
- Generation session: `https://claude.ai/code/session_01C5SeyugjJniHgibAgCbuNN`.
- **Generator: no image-generation model was used.** Every file in this directory is a
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
- **Exact toolchain:** `tools/assets/generators/menu-posters/render.mjs`, which loads the SVG
  into headless Chromium (Playwright, resolved from `web/smoke/node_modules`) at
  `deviceScaleFactor: 2`, screenshots it, and encodes with
  `cwebp -q <82|80> -m 6 -sharp_yuv -resize <w> <h>`. The 2x capture is supersampling, which is
  how flat vector edges survive WebP.
- Regenerate with:
  `PATH="$HOME/.nvm/versions/node/v24.18.1/bin:/opt/homebrew/bin:$PATH" node tools/assets/generators/menu-posters/render.mjs`
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

This shell-only use is a reviewed exception to the earlier mood-board rule in ADR-0003. Generated
stills still may not become world geometry, textures, factual briefing imagery, or cutscene truth
without a separate content-pack rights and provenance review.

## What each card is

The rows below name each card by its source SVG stem, not by its `.webp`, so that the closure
table further down stays the single place a filename is bound to a hash.

| Card | Place, time, weather | What it is meant to say |
| --- | --- | --- |
| jet-f22 | Above a cloud deck at altitude, cold high sun | Clean, high, geometric, alone |
| jet-rapier | Top of the atmosphere, dawn terminator | Fictional, hot, ascending, Mach 4 |
| jet-cobra | Tropical gorge, humid backlit haze | Low, close, working, and dangerous |
| bike-yzf-r1 | Disused runway circuit, broad daylight | Warm, human-scale, nobody shooting |
| menu-hangar | Aerodrome at golden departure | Quiet backdrop; type sits on it |

## File closure

| File | Dimensions | Bytes | SHA-256 | Use |
| --- | ---: | ---: | --- | --- |
| `jet-f22.webp` | 900×1600 | 19334 | `203d4b601bbe39e6d2c03d3c28ccc953c9867bb08935aef045f487fe79d32297` | F-22A picker poster |
| `jet-rapier.webp` | 900×1600 | 21572 | `29699bb08e1878465d1cb21adc07da83f3e7b4479dbe8d57a375a74c05d3ec5b` | Rapier picker poster |
| `jet-cobra.webp` | 900×1600 | 23000 | `2789e1aa005cb61482b032cee38913f93704abc047d2f630f0d98cafca616e1b` | AH-1G Cobra picker poster |
| `bike-yzf-r1.webp` | 900×1600 | 31680 | `a42fe42d802e3f3b1ae61fe5b70567226aab2ad28b84349d57c38d6fa4618869` | Weekend Ride picker poster |
| `menu-hangar-small.webp` | 900×600 | 8518 | `a17a868a3905c6fc9d8217ae156c7123228baaf1009dce7ef781e9e613ebde45` | Narrow/loading fallback |
| `menu-hangar.webp` | 1600×1067 | 18382 | `2b0bd29b275e6993c0ad9f355dfc5c048b1e05abaf2cd60323784f881ff9f070` | Wide/loading background |
