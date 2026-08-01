# Production shell paintings — provenance

These four files are **project-generated fiction** used only by the loading cover and aircraft
picker. They are presentation art, not evidence for an airframe, place, event, or simulation
constant. They may not be reused as a source reference for a content pack.

## Generation and review record

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

This shell-only use is a reviewed exception to the earlier mood-board rule in ADR-0003. Generated
stills still may not become world geometry, textures, factual briefing imagery, or cutscene truth
without a separate content-pack rights and provenance review.

## File closure

| File | Dimensions | SHA-256 | Use |
| --- | ---: | --- | --- |
| `jet-f22.webp` | 900×900 | `41770d6a054599bd9af50ceb5fdf7403a6431d51208c78a5e1f10fe15d2d7a02` | F-22A picker painting |
| `jet-rapier.webp` | 900×900 | `126bd7b8f1242b9305ab30453069af85af0c04390da104edd3651f797201cfeb` | Rapier picker painting |
| `menu-hangar-small.webp` | 900×600 | `638e18a76b03f1f905446023e997a02231d98794f0fc2018bffb28d186395c49` | Narrow/loading fallback |
| `menu-hangar.webp` | 1600×1067 | `e7fc426b58ce305be26d749006bf31185e10b14f014fdd29ae82575f197c5b2e` | Wide/loading background |

The automated release test recomputes these hashes and fails if a production painting is added or
changed without updating this record.
