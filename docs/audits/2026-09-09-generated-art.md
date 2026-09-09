# Generated art and selector repair — 9 September 2026

This local feature branch builds on the latest clean candidate, Build 356 at `16321616`,
in `feat/generated-art-20260909`. It does not alter the older dirty primary checkout.
No push or deployment is included.

## Result

The F-22A and Cobra selector cards now use the two images reviewed positively by the owner.
Their original generated PNGs are retained, while 1000×1000 WebP runtime copies total
203,032 bytes. Previous SVG-derived assets and source files remain available.

The Cobra card's atmosphere and scenery are a visual target. They are not presented as
achieved gameplay rendering or used to infer vehicle geometry, collision or geography.

Generated broad-leaf and fern artwork also enters the actual Cobra scenery through the
existing instanced foliage cards. Its 1024×512 RGB texture uses black as encoded empty space;
both visible and shadow shaders interpret it consistently. The atlas has one existing
texture sample, unchanged geometry and draw submissions, and the same bounded texture
allocation. Existing RGBA textures and the synthetic missing-file fallback keep their original
behavior. This is a foliage detail change, not a completed environment overhaul.

The image tool returned painted checkerboards for two requested transparent outputs. Those
were rejected. A subsequent tool edit produced the usable black-backed source; neither the
source nor the runtime PNG is falsely labeled RGBA. The shader samples the source split at
u=0.52 so the left clump's outermost leaf survives without entering the fern's UV region.

The browser review uncovered an independent selector bug. An earlier touch-landscape rule set
the poster container to `display:block`, and the later compact layout set grid columns without
restoring grid display. At 844×390 that stacked the cards into a 1,642-pixel column. Fly was
already partly above the viewport and moved to approximately y=−859 after selecting Cobra.
The same behavior reproduced using the unchanged HEAD HTML. The final override now explicitly
sets grid display and row flow; the existing browser regression exercises selection before
checking action visibility, including 667×375.

## Saved assets and exact prompts

- Runtime F-22: [jet-f22-generated-v4.webp](../../web/wwwroot/art/jet-f22-generated-v4.webp)
- Runtime Cobra: [jet-cobra-generated-v4.webp](../../web/wwwroot/art/jet-cobra-generated-v4.webp)
- Runtime foliage: [foliage-atlas-generated-v2.png](../../content/packs/cobra-vietnam/environment/foliage/foliage-atlas-generated-v2.png)
- Exact selector prompts and selection record:
  [generated-v4-prompts.json](../../tools/assets/generators/menu-posters/sources/generated-v4-prompts.json)
- Exact foliage prompts, input chain and generation metadata:
  [foliage provenance](../../tools/assets/generators/cobra-foliage/sources/foliage-atlas-rgb-coverage-v2.provenance.json)

All were made with the built-in `image_gen.imagegen` tool; no API/CLI fallback was used.
Selected master PNGs remain alongside their prompt records. The tool did not expose a
structured model identifier, so one has not been inferred. The menu calls had no image inputs;
the foliage call used the existing documented CC0 atlas as its layout/silhouette reference.
[ADR-0004](../adr-0004-generated-presentation-assets.md) records the narrow runtime-art decision.

## Verification

- 24 existing selector/provenance/lifecycle/service-worker tests passed.
- 12 foliage and asset-kit tests passed, including source/staged equality, real PNG RGB
  dimensions, manifest/license schema, generated-only shader selection, shadow paths and
  disposal ownership.
- Strict standalone foliage asset and license validation passed.
- A fresh Release web publish succeeded from this worktree; no older WASM was substituted.
- Desktop and portrait selector review confirmed the new images decode correctly and labels
  remain readable. Short-landscape review found the defect described above.

The independent Cursor review found the coverage/shadow ownership and UV continuity sound.
Its dark-texel and minification concerns are visual checks, not demonstrated regressions.
The source's empty border measures at most 1/255 sRGB per channel; the threshold operates
on decoded linear RGB. Disabling mipmaps was not adopted without evidence because that
would change distant aliasing behavior. A caller bypassing the official loader must preserve
the texture's declared encoding; the supported runtime uses the loader. Release cache-bust
identifiers must still be advanced with the repository's atomic stamp before this becomes
a deployable release.

The strengthened picker browser regression passed at 844×390, 667×375 and 390×844 after
selecting Cobra. Final settled selector captures were also inspected at 1440×900, 390×844
and 844×390; Fly remains visible. The desktop/portrait 4:5 crop trims the far ends of the
Cobra's rotor/tail but keeps the aircraft readable. Full source artwork is retained.

Actual foliage acceptance uses the same extant instance IDs and camera poses before/after.
The baseline intercepts only the two HEAD foliage modules in the fresh runtime. A temporary
read-only scene inspector locates existing foliage; it does not create or move plants. The
existing review camera then approaches the selected card. Final mobile canopy and balanced
understory captures show fuller leaf shapes and readable internal detail, with no opaque
background rectangles, page exceptions or shader compile errors. A neutral generated-only
material tint and 30% luminance mix reduced the initial lime cast while leaving coverage
unchanged. Thin dark contours remain visible at extreme close range.

The local static server returns expected 501 responses for telemetry POSTs, before and after;
this is not a hosted telemetry acceptance check. Changed static files were explicitly copied
into the freshly published artifact and hash-matched to source; its WASM remained unchanged.
All QA browsers and the owned local server were closed after inspection.

Retained evidence:

- [Desktop menu](media/generated-art-20260909/menu-desktop.png)
- [Fixed short-landscape menu](media/generated-art-20260909/menu-landscape.png)
- [Same-pose foliage before](media/generated-art-20260909/foliage-before.png)
  and [after](media/generated-art-20260909/foliage-after.png)
- [Balanced understory](media/generated-art-20260909/foliage-understory.png)
- [Foliage source identity](media/generated-art-20260909/foliage-source-identity.json),
  [comparison evidence](media/generated-art-20260909/foliage-comparison-evidence.json),
  [final foliage evidence](media/generated-art-20260909/foliage-evidence.json),
  [menu evidence](media/generated-art-20260909/menu-evidence.json)
  and [final HTML identity](media/generated-art-20260909/index-identity.json).

Evidence JSON retains original temporary capture paths to identify the original run; the
selected PNGs linked here are byte-for-byte copies kept with this record. The remaining
temporary scripts/captures are at `/tmp/guns-generated-art-qa/`.

## What the artwork sets as the next target

The distance between these cards and gameplay is still substantial. The useful next work is
to choose one Cobra view and bring its terrain relief, canopy distribution, atmospheric light,
water, and aircraft materials toward the accepted image, checking the real moving view at each
step. More selector art alone does not close that gap. Near and mid-distance scenery need
separate review: an image downloaded successfully or a distant bare-valley screenshot cannot
prove that a foliage material looks good.

No hardware frame-rate claim, complete human sortie acceptance or full release gate is made
for this focused art and layout pass.
