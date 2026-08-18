# First-run valley → missiles → guns

Date: 2026-08-18  
Status: accepted; implementing

The F-22 Guns Only merge is the one fight that works. First-time visitors currently land on
the six-tile picker and, if they pick it, a 9 km high merge where the bandit is a pixel on a
phone. This slice is the on-ramp: skip the picker once, fly a real Soniachne draw, pop out
onto a pair of jets, dump two heaters with the same Fire button, then keep that button as
guns in the live Guns Only fight.

## Product rules

- Six-tile picker stays. First visit skips it. Return visits (and `?menu=1`) get it.
- The Guns Only tile still stages `Beats.ModernVisualMerge()` (beat 7): high merge, guns only,
  no AIM-9.
- Missiles exist only on this first-run beat. They reuse `Aim9Surrogate`; they do not become
  F-22 doctrine.
- One Fire control (`KeyF` / touch FIRE / `GKey.Trigger`). No weapon toggle.
  - Valley: Fire does nothing.
  - After pop-out, while AIM-9 remain: Fire is Fox-2 at the selected live target.
  - When the magazine is empty: Fire is guns.
- After the opening pair, continuous combat is the same first-merge gauntlet.
- Pause / Fly again / picker after the first launch stamps the visit seen.
- Playwright (`navigator.webdriver`) keeps the picker unless `?firstRun=1`, so existing smoke
  does not silently skip Ready.

## Geography (surveyed 32 m atlas)

Northbound draw at east **2400 m**:

| North m | Floor m | West wall m | East wall m |
| ---: | ---: | ---: | ---: |
| -5500 | ~121 | ~213 | ~155 |
| -4000 | ~114 | ~194 | ~178 |
| -2000 | ~118 | ~193 | ~132 |
| -600 | ~105 | ~181 | ~132 |

Player starts at `(2400, 190, -5500)`, heading north, ~70 m AGL, Auto-GCAS armed. Pop-out gate
is north **≥ -2000 m**. Opening pair parks at the mouth around `(2400, 190, -600)` until the
gate, then the ordinary presenting 1v2 is live. AIM-9 min range is 600 m; 1400 m at the gate
is inside the envelope.

Environment is `Ukraine2030sTheatre.HeroCell` (Soniachne low-level scenery). Weather is the
existing Soniachne low-level VMC profile (`ForBeat(13)`).

## Kernel seam

- Factory: `Beats.ModernVisualMergeFirstRun()` — first-merge combat/fuel/recovery/continuous
  combat, with valley spawn, hero cell, and `FirstRunValleyConfig`.
- Not a new `BuiltIn` index. `WebBridge.StartFirstRunValley()` stages the factory.
- `FirstRunValleyRuntime` owns phase (valley / armed), two AIM-9s, and opponent parking until
  pop-out.
- Beat 7 is untouched.

## Shell

- Storage key `guns-only.first-run-valley` (same `guns-only.onboarding.*` family).
- First pending visit with no other program query auto-stages and auto-launches this beat.
- HUD: valley cue FOLLOW THE VALLEY; after pop-out FOX TWO then GUNS when empty. Touch label
  stays FIRE.
