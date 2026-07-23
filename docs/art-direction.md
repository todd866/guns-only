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

## The canon: psychological-safety rendering

In-universe, combat presentation is deliberately abstracted: modern forces render kills as
clean, stylized events as a crew-protection doctrine (the same logic behind real-world debrief
sanitization). This is written into the world docs as doctrine, not omission — the sim shows
what a 2030s crew station would show. It also keeps the educational platform honest about
violence without trading in gore.

## Hard boundaries

- **The HUD stays an instrument.** Symbology remains projectively true (the 600+ assertion
  contract); stylization applies to the WORLD, never to flight-critical geometry.
- **The kernel is untouched.** Art direction is presentation-layer only; ballistics, damage,
  and terrain truth do not become cartoons.
- **Determinism and the content-pack boundary hold**: the look ships as shader/palette work in
  the versioned presentation layer.

## Order

Adopt with the carved-valley terrain build (the palette/ramp shaders land with the new
heightfield), then sweep aircraft/effects. Reference: Mitchell, Francke, Eng — "Illustrative
Rendering in Team Fortress 2."
