# Audio and game feel

The flight bus already had engines, guns, warnings, radio, and impacts. This layer adds only cues that follow a published simulation quantity, plus a quiet score and interface ticks that can be switched off.

## What stayed

`web/wwwroot/render/audio/feel_audio.js` sits on the existing flight bus, after the authored engine and gun graphs. It adds:

- wind rush that follows true airspeed, plus a narrow hiss when angle of attack is high and the jet is fast
- G-strain breathing keyed to published physiology (`pilot_state` of `STRAINING` or `GRAYOUT`, and `pilot_agsm_engagement_01`). A high instantaneous G with a normal stage is silent. The kernel already integrates exposure; this layer does not invent a G threshold
- a heavier gun thump and a short tail when the trigger releases
- bullet-hit weight, and a kill boom delayed by range divided by the speed of sound (clamped so a distant splash cannot arrive late)
- a very quiet adaptive bed: slow fifths on the mission menu, a tighter brighter chord as a fight closes in
- click and hover ticks for the menu and settings

All of that uses the one shared `AudioContext`. `?audioQa=silent` still builds the graph and clamps the master gain. Music and interface ticks stay off until the main app asks for them, so the motorcycle, Fire Boss, and Cobra pages do not inherit a combat score. Both preferences can be turned off. Sound off disables music and interface ticks.

Grey-out, blackout, and red-out stay on the physiology layer that was already on main (`web/wwwroot/render/physiology/g_tolerance_presentation.js`, `#pilot-physiology`). Opacity is `1 - pilot_peripheral_vision_01` for the vignette and central-vision loss for blackout. It is not behind a combat-feel toggle: it is the pilot's visual field. The vignette is a grey peripheral tunnel. The blackout layer remains black. Chase, deck, and other external cameras still suppress it, because those views are not looking through the pilot's eyes.

## What was cut, and why

`web/wwwroot/render/feel/game_feel.js` is gone, and so is the "Combat camera feel" setting. Nothing honest was left under that toggle.

- The three-step warning tone (search, lock, incoming) read bandit range and closure. The simulation has no radar-warning receiver, so the tone was a fake instrument.
- Near-miss camera shake fired when the opponent's round counter increased inside 520 m. That is not miss geometry.
- Speed lines were a CSS mask above about Mach 0.9. They are an arcade speed cue, not a view of the air.
- The kill flash and hit-stop lens dip held the picture for a moment while the kernel kept integrating. A real hit-stop would be simulation time, and this is not one.
- Field-of-view kick widened the lens with Mach. Mach is already on the HUD and in the wind; the lens does not need to punch out.
- Gun-fire camera shake used the `gun_firing` flag and the round counter. No modelled recoil or seat acceleration drives it, so it is gone.
- A second grey vignette closed from a hardcoded 3G threshold. Main already draws grey-out, blackout, and red-out from `PilotPhysiology` (`pilot_peripheral_vision_01`, `pilot_central_vision_01`, `pilot_redout_01`, `pilot_state`), published on the hot frame. The duplicate was deleted. The existing vignette's look was changed from a near-black ring to a grey tunnel so grey-out and blackout stay distinct.

## What was verified

- `node --test web/wwwroot/render/audio/tests/*.test.mjs web/wwwroot/render/settings/tests/*.test.mjs web/wwwroot/render/physiology/tests/*.test.mjs` — 175 tests, 0 failed. The feel module and its tests were removed with the camera juice, so that suite is gone.
- `node --check web/wwwroot/app.js` — exit 0.

No audible playback. Feel tests that build an audio graph use a fake context.
