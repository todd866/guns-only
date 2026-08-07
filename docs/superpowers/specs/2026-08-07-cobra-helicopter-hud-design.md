# Cobra Canyon — classical helicopter HUD symbology

Date: 2026-08-07  
Status: approved for implementation  
Base: Hold the Bridge / Ember Run, AH-1S M76 + DTIC ADA303212 doctrine  
Owner ruling: classical three-symbol model + hover cue; FPV carries important cues

## Product

The combiner must read as an attack-helicopter flight display, not a jet HUD with the
waterline glued to the horizon.

| Symbol | Means | Stabilization |
| --- | --- | --- |
| Pitch ladder 0 / horizon | World horizontal | Camera-conformal (`ladderReference: "camera"`) through rear-seat sight bias |
| Waterline W | Airframe longitudinal axis | Body-forward (`noseAnchor`); screen-aligned; **not** on the horizon when pitched |
| Gun cross | Fixed gun / body line | Body-forward |
| Cruise FPV | Where you are going | Ground velocity through camera; shown when GS ≥ 40 KT |
| Hover velocity stub | Plan-view ground track | Screen-fixed from the waterline when GS &lt; 40 KT; conformal FPV blanked |

### FPV / stub cues

1. **Acceleration caret** — arrowhead along the velocity direction (EMA of Δ|Vgnd|/Δt).
2. **Regime tint** — amber/red when settling / VRS / RBS severities cross the same thresholds
   as the rotorcraft strip.
3. **Gun-ready tick** — inboard tick only when `gunner.fire_authorized` (Hold F shoots).

## Reversal

Build 266 / its follow-up work-order parked the waterline on the camera horizon so it would
“agree” with the ladder. That contradicts the waterline definition (body axis) and is reversed
here. The gap between W and ladder 0 is attitude + sight bias — information, not a bug.

## Non-goals

- Full IHADSS mode switch / bob-up hover box / head tracking
- Publishing true body accel from the sim this pass
- Changing rotorcraft strip copy or gun-cross geometry
- F-22 HUD behavior changes when Cobra fields are absent
