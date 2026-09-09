# ADR-0004: Generated presentation assets with retained sources

Accepted for this task's scope — 9 September 2026.

The owner asked to use the new image generator for Guns Only assets, then reviewed the
F-22A and Cobra illustrations positively and identified them as a target for the game's look.
This decision extends ADR-0003, point 4, to permit reviewed generated runtime material art.

Generated images may supply fictional presentation textures and selector art when their exact
selected source, prompts, tool/date, known model metadata, encoding recipe, rights review and
runtime use are recorded. Missing metadata remains explicitly unknown. Existing sources remain
available under their original filenames; replacements use distinct versioned names.

This pass admits only two selector illustrations and one Cobra foliage texture. The foliage
source encodes empty space as black RGB because the generator's attempted alpha outputs did
not actually contain transparency. The renderer must interpret that encoding consistently in
visible and shadow passes, while retaining the existing RGBA and synthetic fallback behavior.
An encoded opacity texture must never be described as a natively transparent source.

Generated foliage is decorative, not a botanical reference or terrain/collision authority.
The art does not change the simulation, instruments, mission state, contact visibility rules,
mapped geography or physical obstacle geometry. Menu artwork is an idealized illustration;
its appearance does not constitute evidence that the renderer achieves the same quality.

Each admitted asset must have a bounded runtime resolution, reviewed colors/edges and a
working missing-asset fallback where applicable. Browser review must show the changed
rendering path; checking a source image or an unaffected graphics tier is insufficient.
The selector illustrations had no image inputs. Foliage generation used the existing documented
CC0 atlas as a layout/silhouette reference; its source/license chain is retained in the foliage
provenance. No copied marks or personal likenesses entered this generation.

This permission does not admit unreviewed generated content or inferred real-world facts.
Publish/deployment authorization remains governed by AGENTS.md.
