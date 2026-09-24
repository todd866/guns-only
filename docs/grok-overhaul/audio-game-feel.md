# Audio and game feel

The F-22 dogfight already had a full procedural cockpit: engines, guns, warnings, radio, and impacts. What it did not have was a separate, switchable layer for the things that make a browser game feel finished — wind and strain around the airframe, a quiet score, interface ticks, and a camera that answers the shot.

## What changed

`web/wwwroot/render/audio/feel_audio.js` sits on the existing flight bus, after the authored engine and gun graphs. It adds:

- wind rush that follows true airspeed, plus a narrow hiss when angle of attack is high and the jet is fast
- G-strain breathing that pulses only once the pilot is actually pulling
- a three-step warning tone (search, lock, incoming gun) taken from the published bandit, range, and closure
- a heavier gun thump and a short tail when the trigger releases
- bullet-hit weight, and a kill boom delayed by range divided by the speed of sound (clamped so a distant splash cannot arrive late)
- a very quiet adaptive bed: slow fifths on the mission menu, a tighter brighter chord as a fight closes in
- click and hover ticks for the menu and settings

All of that uses the one shared `AudioContext`. `?audioQa=silent` still builds the graph and clamps the master gain. Music and interface ticks stay off until the main app asks for them, so the motorcycle, Fire Boss, and Cobra pages do not inherit a combat score.

`web/wwwroot/render/feel/game_feel.js` is presentation only. It never pauses the simulation. Each frame it can add a small gun and near-miss shake, widen the field of view with Mach, draw speed lines above about Mach 0.9, close a grey vignette from about 3G, and flash the picture on a kill. The flash is the hit-stop: the lens dips and holds for a moment while the kernel keeps integrating. Reduced motion keeps the vignette and drops shake, lines, and the FOV kick. Chase, deck, and medevac cameras get none of it.

Settings, stored with the other player preferences:

- Music
- Interface sounds
- Combat camera feel

Sound off disables music and interface ticks. Reduce motion still wins over the camera juice.

## What was verified

- `node --test` on the new feel and audio tests, the player-settings tests, and the full `web/wwwroot/render/audio/tests` suite. The shared flight façade still has one compressor, the same mute, and the same gun-report path. 168 tests, all passing after the vignette cap assertion was updated to the authored 0.62 ceiling.
- `node --check web/wwwroot/app.js`

A headless Chrome dump of the full shell (`?audioQa=silent`) did not return within 30 seconds, so the menu and settings were not exercised in a browser. The new controls are static markup, and the feel maths are covered by the node tests above. No audible playback was started.

## Gaps

- There is no radar-warning receiver in the simulation. The tone is a presentation reading of bandit range, closure, a gun solution, and the other aircraft firing. It is not a model of a real RWR.
- Near-miss shake uses the opponent's round counter and range. A round that misses far away does not shake; a round counted inside 520 m does, even if the geometry was not a true miss.
- The kill flash does not freeze simulation time. A cinematic hit-stop would have to live in the kernel, and this pass does not touch it.
- The music bed is two oscillators and a low-pass. It will not be mistaken for a scored soundtrack.
- Speed lines are a CSS mask, not streaks in the 3D scene, so they sit on top of the HUD rather than in the world.
