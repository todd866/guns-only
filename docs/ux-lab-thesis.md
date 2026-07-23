# The UX-lab thesis: consumer interfaces as operational instruments

*2026-07-23. Long-term intent from the owner: this project is, beneath the game, a UX laboratory
for real-world military training and operational hardware. Everything is open source and framed
as an educational platform — and it is built to a standard where its interface findings could
make it into service. "Xbox controllers can be warfighting tools."*

## Why this project can make that argument

The precedent is real: the US Navy replaced the Virginia-class photonics-mast control stick with
a commodity gamepad; current drone warfare runs substantially on consumer controllers and phone
screens. What that trend lacks is *instrumented evidence* about what interface complexity does
to operator performance and skill transfer. This codebase is positioned to produce exactly that:

1. **A deterministic ground truth.** The 120 Hz kernel makes every run reproducible bit-for-bit.
   An interface comparison here is a controlled experiment, not an anecdote.
2. **The complexity ladder as the experimental variable** (docs/complexity-ladder.md). The same
   fight is flyable from a phone tilt sensor to a full keyboard cockpit, with the machine-owned
   axes explicit at every rung. That is an interface-transfer study design, standing.
3. **Per-decision telemetry as the measurement instrument** (docs/telemetry-v2-design.md).
   Which axes the machine owned, what the operator commanded, what the fight outcome was —
   captured honestly, with belief separated from ground truth.
4. **The debrief as the training-effectiveness claim.** If the adaptive teacher can show a
   rung-1 thumb pilot graduating to rung-3 manual control with retained gun-employment skill,
   that is the thesis demonstrated, with data.
5. **The HUD harness as human-factors evidence.** 564 numeric assertions across two viewports
   pin what the symbology actually shows; a symbology claim here is checkable by anyone.

## Discipline this imposes

- **Open source is the credibility model**: honest surrogates with public-data anchors, labelled
  gameplay departures, no classified guessing — already house style; now it is load-bearing.
- **Interface findings must be separable from game tuning.** When a control scheme changes,
  record why (pilot report, telemetry evidence) in the commit; the repo history is the lab
  notebook.
- **Educational platform first.** The service-relevance claim rides on the teaching claim, in
  aviation first, then the broader decision-simulation domains the README already names
  (casevac, medical drones, austere-team training).
