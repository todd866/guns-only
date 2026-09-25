# In-flight HUD phosphor

The flight instruments already projected the truth. This pass changes how that truth is drawn on the combiner.

## What changed

`web/wwwroot/render/hud/hud_phosphor.js` is the presentation kit. `web/wwwroot/hud.js` uses it for stroke weight, glow, type size, plates, the lead pipper, target brackets, the off-screen caret, hit ticks, the kill bloom, the bank index, and critical annunciators.

- Phosphor green stays `#4dff88`. `document.documentElement.dataset.hudPhosphor` may be `green`, `amber`, or `white`. `high-contrast` drops the glow and thickens strokes. `forced-reduced-motion` holds warnings and hit ticks steady.
- Stroke width and type size scale with the short side of the viewport (phone floor 0.82, 4K cap 1.55), in CSS pixels on top of the existing device-pixel backing store.
- Glow is a second vector stroke, not a canvas shadow blur, so it does not double the frame.
- The pitch ladder, tapes, heading, and gun funnel keep their projected endpoints. A bank index sits in the ladder's centre hole: ticks rotate with bank, the caret stays screen-up.
- The lead pipper stays on the projected aim point. In range it closes; a wasted shot goes red; hits throw short ticks that ease outward and die.
- Target boxes are corner brackets. An in-range box adds an inner bracket. Off-screen contacts keep the same bearing and use a clearer arrow.
- `PULL UP` and Auto-GCAS fly-up sit in a critical plate. Caution uses amber. Bingo and splash cards use the same plate language. A kill adds a green bloom that eases out around the existing SPLASH line.

## Why

The owner asked for a modern-fighter combiner: crisp, legible, and clearly better than thin debug strokes, without moving any instrument off the projection the geometry harness already pins.

## Verified

- `node --test web/wwwroot/render/hud/tests/*.test.mjs` — 160 passed.
- Source-contract tests that read `hud.js` (production graphics, wing sweep, Auto-GCAS bridge, Cobra combiner wiring, control truth) — 43 passed.
- Headless geometry harness — `HUD geometry contract holds: 2305 assertions across all scenarios.`
- Headless screenshots at 1400×1020 and 390×844 (playwright, `headless: true`). Forward fight, funnel, padlock PULL UP, off-screen caret, splash, and the phone portrait were inspected.

## Gaps

- The settings screen does not yet offer the phosphor preset. The HUD reads `data-hud-phosphor` when something else sets it.
- Hit ticks bloom around the pipper. The snapshot does not publish a separate impact pixel.
- Tape digits and the ladder are not temporally filtered here. Smoothing them would move the projective reading. Existing airdata stabilization is unchanged.
- Annunciator plates are vector passes on the symbols that already drew. Secondary panels (systems, legend, Rapier teach) still use their previous type.
