# World surface pass — 26 October 2026

Baseline: `d0627e7c` (PR #141), verified against production: all 559 packaged files matched on 26 October. The original checkout was ten commits behind main; this pass uses an isolated current-main worktree and preserves the newer skatepark, residential, touch-control and compressed-asset work.

## Scope

- Concrete expansion joints and restrained aggregate replace the repeating bands in shared apron/runway concrete.
- Sand loses its regular sine ripples, retaining fine grain and quiet tonal variation.
- Existing Red Flag, hangar, boneyard and Whoops footprints receive the same surface treatment; existing connecting-road overlays receive asphalt detail. These are visual overlays only, with no collision, route, control or physics changes.
- Streamed paved roads gain a narrow graded shoulder. Sparse scrub and stones sit beyond the shoulder, excluding other roads, buildings, aprons, parking, event clearings and authored districts. Placement follows terrain height.

## Budgets and acceptance

The new floor geometry is 22 triangles in five event/connector batches. Verge detail is capped at 48 clusters per 256 m tile and uses two shared material batches per tile; it leaves with the existing 5×5 streamed working set. No new models or downloaded textures are required. The original world art mesh/triangle budget remains unchanged; an initial 603-mesh attempt was reduced to 597 and the full authored-race collision test passed.

`tools/rc/check-world-polish.cjs` records seven real entry paths, ordinary throttle input, hardware renderer, screenshots and frame samples. The initial before/after captures report Apple M5, median 16.7 ms and p95 18.0–18.5 ms. These short samples are separate from sustained traversal and the deployment pipeline's three-lap performance gate.

`tools/rc/check-world-tour.cjs` now explicitly selects Main Gate, so the old base tour retains its intended start despite the newer default skatepark arrival. It still prohibits teleports, recoveries and document reloads and checks BX, school and housing access.

Detailed run output and images are retained in `evidence/rc-world-polish/`; deployment produces its standard independent evidence folder. Release status is recorded in the task receipt rather than assumed from a successful local build.

## Remaining visual scope

This is a coherent surface/verge pass across the existing world, not a claim that every venue now matches the skatepark. Large building silhouettes, bespoke airfield service props and the distant desert still need further authored art. The current pass leaves those assets and lighting intact.
