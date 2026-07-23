# The complexity ladder: platform decides how much jet you fly

*2026-07-23. Product doctrine from the pilot-owner: "we need to end up with multiple difficulty
levels. Portrait is max simplicity, laptop is max complexity. Eventually it becomes almost
different games."*

The same deterministic kernel, the same honest fight — but the CONTROL surface scales with the
platform, and each rung of the ladder hands the pilot ownership of more axes. This is the
adaptive-teacher thesis expressed in controls: assisted axes are not dumbing-down, they are the
curriculum. Graduating a rung means taking an axis back from the machine.

## The rungs

| Rung | Platform | Pilot owns | Machine owns | Symbology |
|---|---|---|---|---|
| 1 · Assisted | Phone, portrait | Roll (tilt), G bias (PULL/EASE), speed bias (±30 kt), when to disengage | Throttle-to-corner, about-right pull, trigger, GCAS | Minimal: bandit, corner state, one attitude cue |
| 2 · Touch | Phone/tablet, landscape | + pitch (tilt), throttle (rocker), trigger (FIRE) | Widened gunnery assist, GCAS backstop | Standard combat HUD |
| 2.5 · Gamepad (next) | Xbox-class controller | Analog pitch/roll (sticks), throttle (triggers/bumpers), guns (RT), padlock/GCAS (buttons) | Configurable assist level — THE research rung | Standard combat HUD |
| 3 · Keyboard | Laptop/desktop | + rudder, envelope override, padlock discipline, GCAS refusal | Narrow gunnery assist, bank-hold, GCAS last-instant only | Full: funnel + pipper, padlock locator inset, limit annunciations |
| 4 · Expert (future) | Stick/HOTAS | Everything; assists opt-in | Nothing by default | Full + declutter options |

Rung 1 exists as of Build 75 (assisted flight: kernel auto-throttle/auto-pull/auto-fire behind
`SetAssistedFlight`); rungs 2–3 are today's landscape touch and keyboard experiences. Rung 2.5
is the thesis instrument ("Xbox controllers can be warfighting tools" — docs/ux-lab-thesis.md):
a commodity gamepad flying the honest kernel with the assist level as the experimental variable.
It needs a true analog pitch command path in the detent grammar (proportional G demand between
the push limit and max-perform), analog roll (exists), and gamepad bindings alongside the
keyboard's rebindable controls.

## Rules that keep it one game

- **One kernel, one fight.** Every rung fights the same bandits over the same terrain with the
  same ballistics. Assistance changes who moves a control, never what the world does.
- **Assists are honest pilots, not cheats.** Auto-throttle flies the throttle, auto-fire pulls
  the real trigger through ammo/interlocks, auto-pull is an ordinary G demand into the same
  physiology and protections. Telemetry records assisted axes so the debrief can say what the
  machine did versus what you did.
- **Difficulty ladders stay orthogonal.** Enemy skill (Novice→Ace→Machine) scales the OPPONENT;
  the complexity ladder scales the COCKPIT. A rung-1 pilot can meet an Ace; a rung-3 pilot can
  warm up on a Novice.
- **Graduation is the loop.** The debrief should eventually notice rung mastery ("your speed
  bias tracked corner all fight — take the throttle") and invite the next rung, the same way
  engagement escalation already works.
- **Per-rung harness passes.** The HUD harness runs the geometry contract at both landscape and
  portrait viewports today; every new rung's presentation gets its own pass before it ships.
