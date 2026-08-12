# The BF:V graphics gap — what is actually missing

2026-08-12. Owner asked directly: "do we have BF:V grade graphics yet?" The answer is no.
This records WHY, from rendered evidence, so the next graphics build attacks the real
defect instead of re-tuning colour (which has already failed twice —
[[colour-fitting-is-the-wrong-axis]]).

## Evidence

Rendered Iron Bell frame from the Build 313 candidate
(`tools/cobra-scenery-gate/shot.mjs`, iron-bell view). What the frame shows:

1. **The near field is an untextured flat plane.** The bridge/road surface fills the lower
   half of the screen as a single tan gradient with no material, no grain, no wear, no
   normal variation. At nap-of-the-earth altitude this is most of the screen.
2. **Terrain is flat-shaded colour, not textured.** The hills carry a painted hillshade and
   a value ramp, but no detail texture at any distance — so there is no scale cue and the
   ground reads as a smooth toy.
3. **Vegetation is sparse individual props.** A handful of cone/fan trees scattered on
   hillsides. BF:V's jungle read comes from DENSITY and canopy, not from better single
   trees.
4. **No ground clutter at all.** No grass, no undergrowth, no rocks, no debris, no tracks
   outside the FOB.
5. **Structures are untextured blocks** away from Camp Ember (which now has authored
   massing but still no surface material).

## What BF:V actually had (2004) that this does not

Textured terrain with multiple blended surface layers; dense foliage instancing with
billboard fallback at distance; textured structures with damage states; ground clutter;
and vehicle/terrain shadowing that grounds objects. None of these are exotic — they are
standard, and their absence is why the picture reads a generation earlier than the target.

## The ranked fix list (do these in order)

1. **Terrain detail texturing.** A tiling detail/albedo layer blended by slope and height
   over the existing painted-tactical shader, with distance fade so the far field keeps its
   current legibility. Highest pixels-per-unit-of-work in the whole project.
2. **Surface materials on the near-field plates** (road, bridge deck, apron): the same
   detail layer plus wear, so the biggest object on screen stops being a flat fill.
3. **Foliage density and canopy.** Instanced clumps with LOD/billboards, authored by biome
   band along the corridor, sized to the frame budget the perf probe already measures.
4. **Ground clutter** in the near band only (grass/undergrowth cards), radius-limited.
5. **Structure materials + damage states** for corridor buildings.

## Constraints carried in

- Keep the illustrative house style ([[art-direction-tf2]]) — texture the world, do not
  chase photorealism.
- The F-22 renderer remains the visual reference for shared profile decisions
  ([[visual-house-style-f22]]).
- Frame budget is measured, not guessed: `cobra_frame_ms` is in ride/Cobra telemetry and
  `tools/perf/` has the frame probes. Build 312's owner flight ran a locked 60 fps with
  headroom, so there IS budget to spend — spend it deliberately.
- Do not re-fit colour before geometry and texture land.
