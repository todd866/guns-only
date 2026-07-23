# Art direction: illustrative, TF2-lineage, in-universe

*2026-07-23. Owner direction: "I don't mind if we make this slightly cartoony… I'm a big fan of
Team Fortress 2 graphics for this. Should help make the low-level stuff doable within our
limitations." And the canon frame: future militaries render kills abstractly as a psychological
safety doctrine.*

## The look

Illustrative rendering in the Team Fortress 2 lineage (Valve, NPAR 2007 — the published
technique set: warped/gradient-mapped diffuse ramps, dedicated rim lighting, painterly value
gradients, silhouette-first detail hierarchy). Applied here:

- **Terrain**: banded elevation palettes and painterly slope shading — stylized valley walls
  read speed, distance, and closure better at our polygon/texture budget than mid-fidelity
  realism, which is precisely what carved-valley low flying needs (docs/low-level-playground.md).
- **Aircraft**: chunky, silhouette-readable shapes with team-readable palettes; identification
  at a glance beats surface detail.
- **Effects**: exaggerated, clean, readable — the explosions already lean this way; lean in.
- **Obstacles** (bridges, wires): bold silhouettes and marker spheres; readability is safety.

## The two-era thesis: two kinds of moral distance

*Owner direction: "make 1950s Korea as realistic and gory as possible, but from jet height you
can't see much; meanwhile 2030s Korea looks like TF2 but actually is a bit horrific BECAUSE
it's so cartoony."*

- **1950s Korea — protected by physics.** The ground war is rendered as realistically and
  unsparingly as the platform can manage: burning villages, wrecked columns, the human ruin of
  that war. The mercy is ALTITUDE: from jet height it resolves to smoke smudges and texture.
  Mechanically this is detail-by-altitude LOD as a moral instrument — descend low enough and
  the war stops being abstract. The F-86 pilot's clean war was clean because of distance, and
  the sim makes that distance literal.
- **2030s Korea — protected by interface.** Illustrative, TF2-lineage, deliberately clean: the
  psychological-safety rendering doctrine is total. Kills are tidy, stylized events at every
  altitude, and that totality is the point — the cartoon IS the horror, because nothing the
  operator does ever looks like anything. Written into the world docs as doctrine, not
  omission: the sim shows exactly what a 2030s crew station would show.

Both eras teach the same human-factors truth from opposite directions: air warfare's emotional
distance is manufactured — by physics in one era, by rendering doctrine in the other — and an
educational platform about operator interfaces should let the pilot feel the manufacturing.

## Hard boundaries

- **The HUD stays an instrument.** Symbology remains projectively true (the 600+ assertion
  contract); stylization applies to the WORLD, never to flight-critical geometry.
- **The kernel is untouched.** Art direction is presentation-layer only; ballistics, damage,
  and terrain truth do not become cartoons.
- **Determinism and the content-pack boundary hold**: the look ships as shader/palette work in
  the versioned presentation layer.

## Order

The 2030s illustrative look adopts with the carved-valley terrain build (palette/ramp shaders
land with the new heightfield), then sweeps aircraft/effects. The 1950s ground-war realism
lands with the historical campaign content: authored vignette sites with altitude-resolved
detail, sub-perceptible from cruise, unmistakable from the weeds. Reference: Mitchell, Francke,
Eng — "Illustrative Rendering in Team Fortress 2."
