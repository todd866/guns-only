# Cobra Canyon — helicopter HUD symbology

Date: 2026-08-07 (owner-corrected 2026-08-08)  
Status: approved for implementation  
Base: Hold the Bridge / Ember Run, AH-1S M76 + DTIC ADA303212 doctrine  
Owner ruling: camera-shared waterline + ladder; FPV carries important cues

## Product

The combiner must read as an attack-helicopter flight display whose horizon symbols
agree with the eye.

| Symbol | Means | Stabilization |
| --- | --- | --- |
| Pitch ladder 0 / horizon | World horizontal | Camera-conformal (`ladderReference: "camera"`) through rear-seat sight bias |
| Waterline W | Horizon reference through the eye | Same camera horizon as ladder 0 (bank-aware); **not** body-forward nose projection |
| Gun cross | Fixed gun / body line | Body-forward |
| Cruise FPV | Where you are going | Ground velocity through camera; shown when GS ≥ 40 KT |
| Hover velocity stub | Plan-view ground track | Screen-fixed from the waterline when GS &lt; 40 KT; conformal FPV blanked |

### FPV / stub cues

1. **Acceleration caret** — arrowhead along the velocity direction (EMA of Δ|Vgnd|/Δt).
2. **Regime tint** — amber/red when settling / VRS / RBS severities cross the same thresholds
   as the rotorcraft strip.
3. **Gun-ready tick** — inboard tick only when `gunner.fire_authorized` (Hold F shoots).

## Reversal history

Build 266 parked the waterline on the camera horizon. A later “classical body-forward”
reversal put W back on the nose and disagreed with the ladder by the rear-seat sight bias.
Owner flights (2026-08-07/08) rejected that gap: waterline must match the camera again.
Gun cross remains body-forward.

## Non-goals

- Full IHADSS mode switch / bob-up hover box / head tracking
- Publishing true body accel from the sim this pass
- Changing rotorcraft strip copy or gun-cross geometry
- F-22 HUD behavior changes when Cobra fields are absent
