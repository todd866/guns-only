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
