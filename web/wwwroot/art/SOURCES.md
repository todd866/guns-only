# Production shell art — provenance

These files are **project-generated fiction** used only by the loading cover and aircraft
picker. They are presentation art, not evidence for an airframe, place, event, or simulation
constant. They may not be reused as a source reference for a content pack.

## Generation and review record

### Painted vehicle poster set v4 — CURRENT (four picker posters)

- Created: 2026-08-09.
- Generator: Codex built-in `image_gen` editing workflow. The image backend/model identifier and
  random seed are not surfaced by this tool and therefore remain **unknown**; they are not guessed.
- Edit inputs: the four project-generated v3 SVG rasterisations below, one input per corresponding
  output. No photograph, third-party artwork, or external image was supplied. Input image SHA-256
  values are the v3 WebP hashes in the closure table.
- Intent: retain the wordless four-card menu and each vehicle's established composition while
  replacing the flat blockout finish with one restrained, painterly simulation-key-art language.
  These images remain shell-only fiction; they are not airframe drawings, environment texture
  sources, evidence, or a promise of pixel-identical runtime rendering.
- Exact shared prompt constraints: vertical 9:16 wordless game-menu poster; premium cinematic
  illustrated key art; cohesive hand-painted realism with restrained brush texture and credible
  materials; subject large and readable in the lower-middle with quiet sky above; no text, letters,
  numbers, logos, insignia, UI, watermark, border, weapons discharge, or explosions; avoid
  toy-like low-poly geometry, cartoons, and oversaturated neon.
- Exact per-image requests (the shared constraints above followed every request):
  - `jet-f22-v2.webp`: “repaint the existing public-data-surrogate stealth-fighter poster while
    preserving the same lone aircraft subject and upward banking energy; high-altitude blue-hour
    sky over distant angular mountain and cloud layers; cool predawn ambient light with a narrow
    warm rim; deep navy, slate blue, muted silver, restrained cyan; one aircraft only.”
  - `jet-rapier-v2.webp`: “repaint the existing fictional Rapier high-altitude interceptor poster,
    preserving the distinctive narrow delta/arrow silhouette and steep climb; stratospheric dusk
    above a curved cloud horizon, dark violet upper sky, thin amber launch glow trailing far behind;
    ink violet, charcoal, muted steel, burnt amber; one aircraft only.”
  - `jet-cobra-v2.webp`: “repaint the existing early narrow-body attack-helicopter poster,
    preserving the slim tandem canopy, two-blade rotor, skid gear, short stub wings, and low-level
    forward flight; humid Southeast Asian river gorge at first light, layered jungle ridges, a small
    distant steel bridge and winding water corridor; deep jungle green, oxidized olive, fog
    blue-gray, restrained amber; one helicopter only; avoid modern Apache features.”
  - `bike-yzf-r1-v2.webp`: “repaint the existing blue litre-class track motorcycle poster,
    preserving the rider in a full-face helmet, compact racing crouch, blue superbike silhouette,
    runway circuit, and forward motion; converted airfield circuit in cool early morning with low
    hangars and a water tower far behind; deep cobalt, charcoal, cool concrete gray, muted olive,
    restrained amber; one motorcycle and one rider only; no brand marks.”
- Source outputs: four 941×1672 PNG results produced by the session, then deterministically encoded
  with `cwebp -q 88 -m 6 -sharp_yuv -resize 900 1600`. Source-PNG SHA-256 values, in F-22, Rapier,
  Cobra, motorcycle order: `121963f6df37e976e12b0da46a703becf5dcce18427ef1a91151505a54de79a1`,
  `92cdac8ac23e9d946e336f802d20c341fec8e20388763614cd39353b70af3b6e`,
  `a7ebd9672a223940f7317746c8fd94363814a63cf81a25053e1c78d56e704ddd`, and
  `1a7d6e99e2afa0ba62cba83e1efea7a5dec3818f312759c458572551c69bd3c4`.
- Human/model review: all four final WebPs were viewed after resize/encoding as a set. Each keeps a
  clear vehicle silhouette at card scale, a quiet upper field for the crop, and a coherent material
  finish. No output containing text, a logo, or a second subject was accepted.
- Epistemic label: `fiction`. The F-22A and AH-1G remain public-data visual surrogates; Rapier is
  fictional; the motorcycle is a generic unbadged blue superbike. Rights status: project-generated
  from project-generated inputs under the owner's authenticated tooling; no third-party asset is
  known to be embedded.

### Deterministic vector series v3 — CURRENT (two hangar fills), SUPERSEDED (four picker posters)

- Created: 2026-08-06.
- Generation session: `https://claude.ai/code/session_01C5SeyugjJniHgibAgCbuNN`.
- **Generator: no image-generation model was used for v3.** Every v3 file is a deterministic
  rasterisation of a hand-authored SVG. There is no diffusion model, no
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
| jet-f22-v2 | Above mountain cloud layers at blue hour | Clean, high, geometric, alone |
| jet-rapier-v2 | Top of the atmosphere, dawn terminator | Fictional, hot, ascending, Mach 4 |
| jet-cobra-v2 | Tropical river gorge, humid first light | Low, close, working, and dangerous |
| bike-yzf-r1-v2 | Disused runway circuit, cool early morning | Human-scale, focused, nobody shooting |
| menu-hangar | Aerodrome at golden departure | Quiet backdrop; type sits on it |

## File closure

| File | Dimensions | Bytes | SHA-256 | Use |
| --- | ---: | ---: | --- | --- |
| `jet-f22.webp` | 900×1600 | 19334 | `203d4b601bbe39e6d2c03d3c28ccc953c9867bb08935aef045f487fe79d32297` | F-22A picker poster |
| `jet-rapier.webp` | 900×1600 | 21572 | `29699bb08e1878465d1cb21adc07da83f3e7b4479dbe8d57a375a74c05d3ec5b` | Rapier picker poster |
| `jet-cobra.webp` | 900×1600 | 23000 | `2789e1aa005cb61482b032cee38913f93704abc047d2f630f0d98cafca616e1b` | AH-1G Cobra picker poster |
| `bike-yzf-r1.webp` | 900×1600 | 31680 | `a42fe42d802e3f3b1ae61fe5b70567226aab2ad28b84349d57c38d6fa4618869` | Weekend Ride picker poster |
| `jet-f22-v2.webp` | 900×1600 | 66892 | `ac80ef8dae439dddb0af4c1642630eb6ef17381c1a3560acbd4caa9b675a4396` | Current F-22A picker poster |
| `jet-rapier-v2.webp` | 900×1600 | 49554 | `7ebeefce13588f89172f8f0c54f21f8d5440ac5df7458660486f728d8b260c5a` | Current Rapier picker poster |
| `jet-cobra-v2.webp` | 900×1600 | 125678 | `7a12601545d5d035aaa86b0d26c870c595f9fdd9b00ac9c14a64d1502b9848f0` | Current AH-1G Cobra picker poster |
| `bike-yzf-r1-v2.webp` | 900×1600 | 91984 | `ef4be9fcaecd01106f74ff54a55bc6a3705d6cbbad267f0106e60cbb199ade38` | Current Weekend Ride picker poster |
| `menu-hangar-small.webp` | 900×600 | 8518 | `a17a868a3905c6fc9d8217ae156c7123228baaf1009dce7ef781e9e613ebde45` | Narrow/loading fallback |
| `menu-hangar.webp` | 1600×1067 | 18382 | `2b0bd29b275e6993c0ad9f355dfc5c048b1e05abaf2cd60323784f881ff9f070` | Wide/loading background |
