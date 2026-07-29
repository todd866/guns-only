# Art direction: Ghibli-adjacent soft world, cold instruments

*Living look bible under [ADR-0003](adr-0003-ghibli-adjacent-world-presentation.md).  
Supersedes the 2026-07-23 TF2-lineage note. Design detail:
[superpowers/specs/2026-07-27-ghibli-adjacent-art-direction-design.md](superpowers/specs/2026-07-27-ghibli-adjacent-art-direction-design.md).*

## The look

**Soft world.** Painterly light, lived-in Ukraine-steppe landscape (fields, shelterbelts, soft
atmospheric distance), weathered mechanical airframes with silhouette-first readability, and quiet
aftermath over celebratory combat VFX. Tone target: Studio Ghibli–adjacent aviation paradox — awe
for craft without romance for war. Influence is lighting, landscape, pace, and `ma`; not pastiche of
specific films or characters.

The late-2030s no-man's-land is an **accidental reserve**, not a brown wasteland. Grass, wetlands,
orchards, and canopy return across a country-scale human exclusion zone while edge villages and
cleared corridors remain precariously inhabited. The beauty is real and the cause is tragic:
machine-enforced access rules exclude people far more effectively than wildlife. See
[no-man's-land canon](no-mans-land-canon.md).

**Cold instruments.** Combat HUD, capsule/SVS, and medical telemetry stay clinical (phosphor/amber)
and projectively true. World stylization never warps flight-critical geometry.

Applied here:

- **Terrain**: warmer painterly value and slope banding for speed, distance, and closure at low
  level (same readability job the older TF2 banding served).
- **Aircraft**: silhouette-readable shapes; weathered materials over tacticool clutter.
- **Effects**: atmosphere-first smoke and dust; impacts readable, not firework porn.
- **Obstacles** (bridges, wires): bold silhouettes remain — readability is safety.
- **Settlements**: quiet human presence (roofs, compounds, traces of life) without tourist kitsch.
- **Vegetation**: coherent wind travels through near grass, trees, smoke, and weather; motion is a
  world-state cue, not decorative noise.
- **Reserve detail**: drowned roads, feral orchards, young growth through hardstand, and rare
  maintained machine infrastructure. Do not cover every frame in ruins or fire.

The runtime gets richness from hierarchy, not indiscriminate density: worker-baked macro land-cover
masses at distance, bounded ambient instances in the low-detail ring, one camera-local grass pool,
and small mission-authored landmark islands. Terrain and every Ukraine scenery material use one
shared warm atmospheric-extinction contract so reducing streaming range closes the scene in haze
instead of exposing a square world edge.

## Moral thesis

Air warfare’s emotional distance is manufactured by the **sealed machine**. The soft world outside
the canopy is warm and wounded; the instruments inside are cold and exact. Descending into the
air littoral — or punching out into a village — is the reveal. Kills are sparse and factual in
symbology and telemetry, not tidy cartoons and not Hollywood spectacle.

The player should be allowed to enjoy the recovering landscape. The presentation then makes the
price of that recovery legible without turning every view into an accusation. Nature healing and
human tragedy coexist; neither cancels the other.

Historical-era packs (if revived) may use different presentation rules under their own decisions.
This document owns the 2030s Ukraine programme look.

## AI image generation

Allowed for mood boards, palette locks, lighting studies, and briefing stills. Generated images are
**not** runtime mesh/texture source of truth. Retain provenance (prompt nudges, model, date) with
epistemic label `fiction`. Prefer `analysis/art-refs/` for binaries and a tracked index for cards.
Promotion path: ref → human/engine art pass → versioned presentation pack.

Steering nudges for refs: soft world / cold instruments; steppe grammar (not Japanese pastoral
pastiche); no identifiable real people or units; no Ghibli character clones.

## Hard boundaries

- **The HUD stays an instrument.** Symbology remains projectively true; stylization applies to the
  WORLD, never to flight-critical geometry.
- **The kernel is untouched.** Art direction is presentation-layer only.
- **No IP copying** of Studio Ghibli or Valve TF2 assets.
- **Live-war care** from ADR-0002 and content governance: no identifiable real casualties;
  speculative material labeled fiction.
- **Determinism and the content-pack boundary hold**: the look ships as shader/palette/content-pack
  work in the versioned presentation layer.

## Order

1. Terrain palette + atmosphere (largest vibe win).
2. Aircraft and effects restyle after vibe lock.
3. Clinic / briefing stills via AI refs in parallel, promotion gated.

HUD harness remains the regression gate for instruments; world changes are reviewed visually
against this bible and ADR-0003.

## History

The prior TF2 / NPAR 2007 illustrative approach (Mitchell, Francke, Eng) is superseded as canon. It
remains useful as a historical note on silhouette readability and ramp lighting techniques that
informed the first low-level prototypes.
