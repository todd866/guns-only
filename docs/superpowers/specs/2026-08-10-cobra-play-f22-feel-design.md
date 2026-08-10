# Cobra play: F-22 feel (Build 302)

Updated: 2026-08-10

## Intent

`/cobra-lab/` play mode must feel like the F-22 front door: functional HUD
writing only, no decorative DOM, pad eye clear of green mass, flight audio on.

Owner ruling (2026-08-10): literally copy the F-22 HUD layout and everything on
it — do not invent a parallel “helicopter dashboard.”

## Non-goals

- No new HUD fork of `hud.js`
- No redesign of Iron Bell fight logic
- Lab inspection shell (`?lab=1`) stays for developers

## Product rules

### Chrome

Play shell hides:

- `#play-chrome` (Guns Only / Hold the Bridge / AH-1G ONLINE strip)
- `#objective-hud` (prose mission card)
- always-on `.legend`

Lab panel remains `?lab=1` only. Death/restart stays one functional modal.

### HUD

One engine: production `hud.js` via `cobraHudState` / `createCobraHudFrame`.

Play mode does **not** draw `drawCobraRotorcraftHud` panels (NR/TQ/RALT glass
boxes). Those read as a second dashboard. Helicopter truth already maps into
F-22 slots (collective → power rail, ground-war kills → kill tally, padlock
target via existing gunner selection).

`HUD_SAFE_INSETS.top` returns to `0` (was 40 px for the mission header).

### Pad eye

Camp Ember spawn must not put foliage or soft-gate volume in the rear-seat eye:

1. Drop `jungle-understory` from `set-piece.cobra-canyon.camp-ember-pad.v1`
2. Asset kit excludes jungle/mist placements inside ~120 m of Camp Ember landmark
3. Soft path: do not draw/activate gate 0 while inside depart-pad radius

### Audio

Enable the shared flight audio bus on cobra-lab (mirror main):

- `hud.setAudioEnabled(true)` (or player default)
- gesture `armAudio` on pointer/key
- per-frame `updateFlightAudio`
- honor `?audioQa=silent`

Jet-only GCAS/gun cue tones may stay gated by capability flags already absent
on the Cobra snapshot; do not leave the whole bus muted.

## Success

Owner cold-opens `/cobra-lab/`: skids on a clear land pad, F-22-shaped HUD only,
hears flight audio after gesture, soft path ahead after lift — not a green mass
or a test-rig card stack.
