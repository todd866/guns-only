# M0 Feel Gate — the project's go/no-go

Fly each beat (1 Perch, 2 Break, 3 Saddle) in BOTH variants (F1). Answer honestly.

## Grammar
- [ ] Hold-↑ toward the bandit feels like *flying BFM*, not watching an autopilot. (A? B? both? neither?)
- [ ] Tap-to-ease (↓ while pulling) is discoverable and useful mid-fight.
- [ ] Double-tap-hold into buffet feels like a deliberate demand, not an accident. False-trigger rate acceptable?
- [ ] Quantized roll taps put the lift vector where your eyes already were.
- [ ] Release-to-settle never fights an input you meant to keep.
- [ ] Variant B shows a standing EASE cue while you deliberately ride max-perform (doctrine coaching by design) — does it read as helpful coaching or as nagging? Note the answer; it feeds the A/B call.
- [ ] Verdict: variant A / variant B / a hybrid / redesign (spec §15.1 fallbacks).

## Camera & views
- [ ] Maneuver view: never disorienting through a full turning fight; horizon always recoverable.
- [ ] Gun blend: arrives when wanted, leaves when the solution collapses, never surprises.
- [ ] Freelook + Space padlock round-trip doesn't lose the bandit.

## Hardware (from docs/spikes.md)
- [ ] All ≤3-key fight chords register on the internal keyboard.
- [ ] Gesture momentum tail measured; deadband decision recorded.
- [ ] Altitude look verdict recorded; ULP numbers recorded.

## Gate decision
- [ ] PASS → proceed to M1 (honest airplane). Record variant decision + grammar tuning notes below.
- [ ] FAIL → iterate grammar HERE (thresholds in KeyGrammar/DetentLayer; test-first), nothing else gets built.

Notes:


---

## RESULT — 2026-07-17: **PASS**

Flown by the author (former RAAF pilot) on beat 1, variant A. Verdict, verbatim:

> *"nah it feels fine. It's not perfect and it needs a padlock mode but it's a great start."*

**What this retires:** spec risk #1 — *"the detent grammar is unproven anywhere"* — the project's
central bet. Hold-pull-and-modulate-off-the-reflex reads as flying BFM. Everything built to date
was scaffolding around this one question and it is now answered. Proceed to M1.

**How it was flown** (from the always-on recorder, `sess-2026-07-17_16-36-01`): 20 s, 24 inputs —
9x roll-right tap, 2x roll-left tap, 1x sustained pull. i.e. the roll-cadence + sustained-pull
grammar, used naturally and without instruction. No override (SPACE) and no padlock (V) pressed.

**Gaps named by the author:**
1. **Needs a padlock mode.** NB padlock *exists* on V and was never pressed — it moved off SPACE
   when SPACE became the max-G override and that was never surfaced in-game. Discoverability
   failure, and V is itself unverified (nobody has ever pressed it). Fix both.
2. "Not perfect" — unqualified; no further detail given. Do not over-read this into a mandate.

**Still unjudged:** variant B (F1) was never toggled, so the A/B valley-depth question the gate
was also meant to settle remains OPEN. The gate answered "does the grammar work" (yes) but not
"which valley depth is better".


## Post-gate findings (2026-07-17, same session)

**Padlock (V) WORKS — a harness bug was hiding it.** The rig called `bridge.FeedKey()` directly,
bypassing `InputAdapter`; padlock/restart/KIO/beat-select all fire via signals only
`InputAdapter._unhandled_input` emits, so NO scenario could ever exercise them and padlock
silently did nothing under test while looking implemented. Rig now synthesises real key events
(`GKEY_TO_KEYCODE` mirror of `InputAdapter.MAP`) and routes the true path. Verified: with V on,
the sensor slews and holds the bandit centred (TD box at 907 m, centre-screen).
LESSON: a harness that bypasses the real input path tests a game nobody plays.

**NEXT — 1. The HUD must not follow the view (author, high priority).**
> *"the HUD shouldn't follow the view, F-35 sims do that sometimes and it's really confusing, bad UX"*

Currently the whole HUD is drawn in the SENSOR's frame. When the gimbal slews off boresight the
pitch ladder and tapes slew with it, so the ladder reports the attitude of where you're LOOKING
rather than where the aircraft is pointing — meaningless and disorienting. Fix: aircraft-referenced
flight symbology (ladder/tapes/FPM/boresight) stays with the airframe; only the target designator
and look-direction cue follow the sensor. Needs a "you are looking X off boresight" indicator
(cf. the Falcon 4 SA bar the author cited in the very first conversation).

**NEXT — 2. A separate debug visualizer (author).**
> *"you need a separate visualizer"*

FPV is right for the game and useless for debugging geometry. Judging intercepts, pursuit curves
and padlock tracking from inside the cockpit is the wrong instrument — it's why diagnosing the
beat-4 intercept needed repeated 4-minute renders to learn what a plot shows instantly. Build a
god's-eye harness visualizer OUTSIDE the game (FPV-always stays): plan + elevation trajectory
traces for both aircraft, LOS lines, angle-off/range over time, gun-window markers. Reads the
telemetry the recorder/rig already writes — no game changes needed.

**Still open:** variant B (F1) never toggled — the A/B valley-depth question the gate was also
meant to settle remains unanswered.
