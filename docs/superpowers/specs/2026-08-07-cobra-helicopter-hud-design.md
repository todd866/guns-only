# Cobra Canyon — helicopter HUD symbology

Date: 2026-08-07 (owner-corrected 2026-08-11)
Status: approved for implementation  
Base: Hold the Bridge / Ember Run, AH-1S M76 + DTIC ADA303212 doctrine  
Owner ruling: body-aligned forward camera; camera/world ladder; centred body-forward W; true FPV

## Product

The combiner must read as an attack-helicopter flight display whose horizon symbols
agree with the eye.

| Symbol | Means | Stabilization |
| --- | --- | --- |
| Pitch ladder 0 / horizon | World horizontal | Camera-conformal (`ladderReference: "camera"`) through the body-aligned 58° production camera |
| Waterline W | Aircraft longitudinal reference | Body-forward projection at the principal point in normal forward view; separates from ladder 0 only with real pitch |
| Gun cross | Fixed gun / body line | Body-forward |
| Cruise FPV | Where you are going | Ground velocity through camera; shown when GS ≥ 40 KT |
| Hover velocity stub | Plan-view ground track | Heading/body-relative right/forward components from the waterline when GS &lt; 40 KT; conformal FPV blanked |

### FPV / stub cues

1. **Acceleration caret** — arrowhead along the velocity direction (EMA of Δ|Vgnd|/Δt).
2. **Regime tint** — amber/red when settling / VRS / RBS severities cross the same thresholds
   as the rotorcraft strip.
3. **Gun-ready tick** — inboard tick only when `gunner.fire_authorized` (Hold F shoots).

## Reversal history

Build 266 mixed a camera-biased ladder with body-forward symbols. Later revisions kept a hidden
`+0.08 rad` rear-seat look-up while moving W between the world horizon and projected body-forward,
so at least one symbol was wrong in every pitched frame. The corrected forward contract removes
that bias: the optical axis is body-forward, W is the principal point, the ladder 0 remains the
camera-conformal world horizon, and cruise FPV remains the projected world-velocity direction.
Padlock is the only mode allowed to move the camera off the nose.

The hover stub is not a compass. World east/north velocity is rotated through live heading before
drawing. At the production `90°` spawn, eastward motion is forward/up and northward motion is
left; the transform must remain continuous across the `±π` heading wrap.

## Acceptance geometry

- Production Cobra harness scenarios use vertical FOV `58°` and spawn heading `90°`.
- In forward view, projected body-forward W is within 1.5 px of the camera principal point.
- The pitch ladder 0 is independently checked against projected world horizontal.
- Cruise FPV is independently checked against the world-velocity projection, including a
  non-zero down/right flight-path offset.
- Hover drift is independently checked against heading-relative right/forward components,
  including the heading-90 up/left case and a unit regression across the heading wrap.

## Non-goals

- Full IHADSS mode switch / bob-up hover box / head tracking
- Publishing true body accel from the sim this pass
- Changing rotorcraft strip copy or gun-cross geometry
- F-22 HUD behavior changes when Cobra fields are absent
