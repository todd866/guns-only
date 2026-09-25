# Front door

The boot frame was a washed-out aircraft picker over the low-poly valley, and the menu was a black field of posters with a paragraph under the button. The title did not appear.

## What changed

Boot holds the existing F-22 painting for just under a second after the kernel is ready, with a large “Guns Only” wordmark. The programme menu uses that same painting as a full-bleed hero, a gold Military/Civilian control, poster cards on a dark dock, and a gold “Fly” button. The first-sortie card keeps its required copy and adds a five-step path (valley, pop, heaters, guns, recover) over the jet. Pause is a single “Paused” word and a gold Resume. Settings are grouped into Audio, Picture, and Aircraft. The debrief can show a letter grade from kills, hits, rounds, peak G, and the sortie clock (`sortie_grade.js`); it does not invent ballistics.

Art is the project’s existing fiction paintings under `web/wwwroot/art/`. No new runtime dependency.

## Screenshots

- Before: `docs/grok-overhaul/shots/front-door-before-boot.png`, `front-door-before-menu.png`
- After: `docs/grok-overhaul/shots/front-door-after-boot.png`, `front-door-after-menu.png`
- Also checked: `front-door-after-intro.png`, `front-door-after-pause.png`, `front-door-after-phone.png` (390×844), `front-door-after-settings.png`

Captured with the headless GPU snap on port 8923 (`pass6` for the after pair). Phone, intro, pause, and settings used the same Chromium channel and a local overlay server.

## Verification

`node --test` on:

- `web/wwwroot/render/shell/tests/sortie_grade.test.mjs`
- `web/wwwroot/render/shell/tests/mobile_boot_wiring.test.mjs`
- `web/wwwroot/render/shell/tests/boot_fallback.test.mjs`
- `web/wwwroot/render/release/tests/mission_flow_contract.test.mjs`
- `web/wwwroot/render/release/tests/shared_shell_ux.test.mjs`
- `web/wwwroot/render/input/tests/player_action_contract.test.mjs`

50 tests, 0 failures. One official snap retry failed when the wasm download dropped; the retry on a clear port produced the after shots above. GPU reported ANGLE Metal, Apple M5.

## Gaps

The grade board is wired for a finished sortie and covered by unit tests. A live debrief screenshot was not taken: the frame loop rewrites the ready-screen mode, so a DOM poke does not stay on screen. The phone menu still shows the laptop-width hint. Shell contract tests pin several older CSS rules in source; later rules override what the screen actually paints.
