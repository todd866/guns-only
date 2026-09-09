# Cobra flight scenery — 10 September 2026

This continues the owner's request to bring the actual game toward the accepted generated
Cobra illustration. It starts from local `1b6cf324` on `feat/generated-art-20260909`, based on
Build 356. The older dirty primary checkout is untouched. No push or deployment is included.

## Changes

The close jungle kit was stretching leaf cutouts to the 16–34 metre heights supplied by canopy
descriptors. Non-authored leaf cards now stay below four metres, with proportional width/depth.
They seat on the emitted terrain triangles, whose conservative height differs from the analytic
surface. Authored palms retain their existing scale and conservative world exclusion footprints.

A separate deterministic instanced crown field fills the middle-distance forest. It follows
existing riparian/highland biome bounds and seats tree stands on rendered terrain slopes.
Each stand contains two rounded crowns, spanning 35–60 by 30–50 metres and 16–24 metres high.
An opaque generated treetop texture supplies leaf detail at a 12 metre world-space scale,
projected on all three axes so vertical sides retain leaf detail.
The crown normal transform accounts for the shear that seats each stand on sloping ground.
Full footprints exclude roads, river channels, route lanes, landmarks, hazards, worked lowlands,
plantations/quarries and Camp Ember's approach. Mixed paddy/village scatter bounds alone do not
make the entire hillside a clearing. It adds no collision or targeting geometry. Camera travel
streams a cache bounded to two resident windows; continuous shader fading avoids resizing the entire canopy
in one step at each occupancy update. This layer persists above the near-kit altitude cutoff.

The basin uses a new generated opaque limestone material on exposed slopes. Three world-space
projections prevent the stretching of an xz-only cliff texture. The 18 metre material scale,
700–2200 metre distance fade and bounded luminance-derived normal are artistic choices, not
physical data. Fine normals affect direct lighting; the broad terrain normal still controls
exposure masks, projection weights, sky visibility and large-scale hillshade.

Neither texture is perfectly seamless or a calibrated reflectance scan. Mirrored repeat avoids
edge discontinuities; mipmaps and anisotropic filtering handle minification. The retained
limestone master, exact text-only prompt, tool metadata and reproducible encoding are recorded in
[surface provenance](../../tools/assets/generators/cobra-surfaces/sources/limestone-generated-v1.provenance.json).
The [treetop provenance](../../tools/assets/generators/cobra-surfaces/sources/canopy-generated-v1.provenance.json)
records the second exact generation. The two 1024-square WebPs total 706,962 bytes and reserve
about 10.668 MiB including mipmaps. Independent load failures preserve whichever asset succeeds;
both surfaces have procedural fallbacks. The page owns these textures across quality changes
and disposes them when leaving, including late arrival after a failed boot.

River gravel lighting previously omitted the sky bounce already present in basin lighting.
Both CPU lighting helpers now include the open-sky term; absent a river concavity attribute,
this remains an explicitly approximate open, flat surface match.

## Budgets and review

The crown layer adds one unshadowed submission. Balanced and desktop reserve 104,000 and
128,000 triangles from their existing 380,000/900,000 ceilings. Their authored-palm allowances
move from 150,000/420,000 to 92,000/378,000 so tree coverage receives more of the same total.
Mobile static geometry already
used 45,656 of its old 46,200 ceiling. Its explicit maximum is now 58,000 to allow up to 144
80-triangle stands; balanced/desktop cap at 1300/1600 stands. Total instance ceilings remain unchanged. Allocations are ceilings,
not claims about visible triangles or device frame rates.

The final crown radii are 1.2/1.6/1.8 kilometres on mobile/balanced/desktop. Density and
tree proportions took precedence over spreading sparse shallow patches across 3.8 kilometres.
Cold cell construction is amortized across frames. Final measured p95 cell work after the
terrain grid exists is 1.41/2.07/2.02 ms on the local CPU. The first complete residency refill
also includes the existing close-scatter work and can reach roughly 44/101 ms on balanced/
desktop; these are setup/refill costs, not steady hardware GPU frame-rate claims.

Using the actual production palm geometry, the final presentation allocations are
57,176/335,776/794,731 triangles. The full game renderer also includes aircraft, battle units
and other systems; these presentation ceilings are not whole-frame triangle counts.
The final balanced/desktop caps reach the configured radius in all four reviewed poses.

An independent read-only Cursor review of the terrain shader and texture loader found no
blocking issues in color space, fallback, derivative normal construction, minification or
bank-light consistency. It confirmed the cost is three texture samples on each enabled basin
fragment; branching derivatives on a nonuniform slope mask would not be a safe optimization.

## Validation record

Runtime review uses a separate published snapshot whose 461 tracked files initially matched
the committed baseline and whose eight framework hashes match the earlier fresh .NET publish.
There are no C# changes in this pass. Changed runtime files are explicitly synchronized and
hash-recorded for each candidate. All browser sessions use silent audio and disabled multiplayer.

Baseline authority is held at elapsed zero through the existing review seam. Player-eye,
Iron Bell, Camp Ember and mid-gorge views are captured across mobile, balanced and desktop.
Parked stationary frames are pixel-identical; camera-motion differences include normal scene
translation and are not themselves evidence of flicker. Software rasterizer frame times are
not hardware performance evidence.

The first candidate was rejected despite passing allocation tests. Shrinking leaves exposed the
gap between analytic and displayed terrain, and a blanket exclusion of mixed village/paddy
bounds left zero visible crown centres in the Iron Bell viewport despite 121 resident patches.
The corrections use the existing rendered-basin sampler and distinguish usable worked ground
from steep forest inside mixed scatter regions. This is why whole-flight views are required.

The first visible stands were also rejected as broad slabs. The final geometry uses two
40-triangle rounded crowns with a shallow cap, and the canopy texture blends three projections
to remove vertically stretched side detail. The final allocation fills the reviewed radius
without raising the balanced/desktop total ceilings.

Final validation:

- **105 focused Node tests pass**, covering canopy placement, rendered-ground seating, accurate
  shear normals, full-radius coverage, budget transitions, stable resident transforms, culling,
  disposal, generated assets, texture failures, mission lifecycle and release presentation.
- Both retained source PNGs reproduce their exact WebP outputs with the committed encoder.
  Source/runtime dimensions and hashes, RGB encoding, rights/schema records and staged copies pass.
- The complete three-tier browser pass captured twelve fixed views, six stationary comparisons,
  a 128 metre camera pan on each tier, and unavailable-surface boot checks on balanced/mobile.
  All programs linked. Ordinary runs had no page or console errors; failure runs recorded only
  the expected HTTP 503 asset responses. Stationary scene pixels matched exactly.
- Retained crown instance matrices stayed fixed while the camera crossed the 48/96 metre
  residency updates. This checks positional stability, not a claim of perfect perceptual motion.
- Both unavailable textures preserved active game authority with the procedural basin and crown
  materials. Unit tests additionally cover either image failing independently and page ownership.
- The final allocation-only change received four additional same-pose captures on balanced and
  desktop. The complete earlier browser pass used the same geometry, texture, fading and loading
  code with smaller crown/larger palm allowances. Both source manifests are retained so those
  validation scopes are explicit; the final allocation is not falsely called a second full pass.

Evidence retained with this change:

- [Player eye before](media/cobra-world-20260910/player-eye-before.png) and
  [final player eye](media/cobra-world-20260910/player-eye-after.png).
- [Iron Bell before](media/cobra-world-20260910/iron-bell-before.png) and
  [final Iron Bell](media/cobra-world-20260910/iron-bell-after.png).
- [Desktop Iron Bell](media/cobra-world-20260910/iron-bell-desktop.png) and
  [mobile Iron Bell](media/cobra-world-20260910/iron-bell-mobile.png).
- [Camp Ember tree-form review](media/cobra-world-20260910/camp-ember-before-final-allocation.png),
  captured before the final allocation transfer, and [its baseline](media/cobra-world-20260910/camp-ember-before.png).
- [Final source identity](media/cobra-world-20260910/final-source-identity.json),
  [final allocation evidence](media/cobra-world-20260910/final-allocation-evidence.json),
  [three-tier source identity](media/cobra-world-20260910/three-tier-source-identity.json),
  [three-tier evidence](media/cobra-world-20260910/three-tier-evidence.json),
  [fallback evidence](media/cobra-world-20260910/surface-fallback-evidence.json),
  [allocation probe](media/cobra-world-20260910/canopy-allocation.json),
  [CPU probe](media/cobra-world-20260910/canopy-cpu-probe.json) and
  [105-test result](media/cobra-world-20260910/focused-tests.tap).
- [Compact motion record](media/cobra-world-20260910/motion-summary.json),
  [final QA summary](media/cobra-world-20260910/final-qa-summary.md) and
  [combined evidence manifest](media/cobra-world-20260910/combined-evidence-manifest.json).

The final balanced Iron Bell frame draws 272,820 triangles versus baseline 265,356; the desktop
frame draws 688,231 versus 644,453. Each adds one draw call. Exchanging some authored palms for
the crown layer extends coverage at a smaller net triangle cost than simply adding both.
All owned browser sessions were closed, the verified local server was stopped and its port
had no listener at cleanup.

Full transient scripts, camera-frame records and silent videos remain under
`/tmp/guns-cobra-world-20260910/`. Evidence retains original capture paths. Selected files above
are byte-for-byte copies, not retouched screenshots.

## Remaining visual gap

This is a reviewed incremental improvement, not parity with the generated illustration.
The crown layer still reads as separate simplified stands; distant hills beyond its range remain
smooth. The uniform river-bank ribbons, broad tan Camp Ember apron, authored palm silhouettes,
aircraft surfaces and overall atmospheric composition need further work. No hardware frame-rate
claim, full human-played sortie acceptance, release gate, release stamp, push or deployment is
included. Release cache identities must be advanced through the normal atomic stamp before shipping.
