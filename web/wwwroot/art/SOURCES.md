# Production shell paintings — provenance

These files are **project-generated fiction** used only by the loading cover and aircraft
picker. They are presentation art, not evidence for an airframe, place, event, or simulation
constant. They may not be reused as a source reference for a content pack.

## Generation and review record

### Hangar series v1 (F-22, Rapier, hangar fills)

- Created: 2026-08-01.
- Introduced by: commit `5b4e7ca772c80fe409b66fece927eed6d0a94ca4`.
- Generation session: `https://claude.ai/code/session_01DeKHvxXtZcfMxpT1SpfvwQ`.
- Orchestrating model: Claude Opus 5, as recorded by the commit trailer. The image-generation
  backend/model name was not retained by the original session and is therefore **unknown**.
- Verbatim prompt: not retained. Reconstructed intent from the contemporaneous commit, not quoted
  as an original prompt: a dawn mountain hangar with each fictional aircraft backlit to
  near-silhouette; warm painterly world, sparse green service lamps, no people or copied
  characters.
- Inputs: no third-party reference image is recorded. The F-22A presentation is a public-data
  surrogate and the Rapier is fictional; neither image is an engineering reference.
- Human decision: four concepts were generated and these images were hand-selected for the
  two-aircraft front door under the owner's “show the aeroplane, not a wordy mission tree”
  direction. Selection is visual review, not a claim of documentary accuracy.
- Epistemic label: `fiction`.
- Rights status: project-generated under the owner's authenticated tooling; no third-party asset
  is known to be embedded. Because the image backend and verbatim prompt were not retained, this
  record is **provisional** rather than a complete reproducibility card. Replace or re-generate
  before any reuse outside this project if complete generator provenance is required.

### Hangar series v2 (AH-1G Cobra, YZF-R1)

- Created: 2026-08-03.
- Orchestrating model: Cursor Grok 4.5 with the workspace image-generation tool.
- Intent: match the v1 hangar mouth, golden dawn sky, blue mountains, sparse green lamps, and
  near-silhouette vehicle treatment so the four picker cards read as one series.
- Inputs: `jet-f22.webp` and `jet-rapier.webp` as style references only (not engineering sources).
- Subjects: AH-1G Cobra (public-data era silhouette fiction for the canyon lab) and Yamaha YZF-R1
  (Weekend Ride coming-soon teaser). Neither painting is an engineering or brand-official asset.
- Epistemic label: `fiction`.
- Rights status: project-generated; no third-party asset is known to be embedded.

### Top Gun anime-1986 picker (F-14A, MiG-28 aggressor)

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

This shell-only use is a reviewed exception to the earlier mood-board rule in ADR-0003. Generated
stills still may not become world geometry, textures, factual briefing imagery, or cutscene truth
without a separate content-pack rights and provenance review.

## File closure

| File | Dimensions | SHA-256 | Use |
| --- | ---: | --- | --- |
| `jet-f22.webp` | 900×900 | `41770d6a054599bd9af50ceb5fdf7403a6431d51208c78a5e1f10fe15d2d7a02` | F-22A picker painting |
| `jet-rapier.webp` | 900×900 | `126bd7b8f1242b9305ab30453069af85af0c04390da104edd3651f797201cfeb` | Rapier picker painting |
| `jet-cobra.webp` | 900×900 | `f5eec3e701451046c2e7146bf7f3e1fd8b3ff705ccade82d9bb421f5e58b38dc` | AH-1G Cobra picker painting |
| `bike-yzf-r1.webp` | 900×900 | `e2328326ec97f12add0ef679e07642240ccad966d8161bc68e2ab59f63a3dbab` | Weekend Ride picker painting |
| `jet-f14.webp` | 900×900 | `a1168d626220cbb21cb7445626c155ae68bb37a94b50fadacdd42bb69d51900b` | Top Gun F-14A picker painting |
| `jet-mig-28.webp` | 900×900 | `18407c631b85942d7bf1a8f715c1b933cb8c547f90adc16b3925a5eb81894748` | Top Gun MiG-28 aggressor picker painting |
| `menu-hangar-small.webp` | 900×600 | `638e18a76b03f1f905446023e997a02231d98794f0fc2018bffb28d186395c49` | Narrow/loading fallback |
| `menu-hangar.webp` | 1600×1067 | `e7fc426b58ce305be26d749006bf31185e10b14f014fdd29ae82575f197c5b2e` | Wide/loading background |
