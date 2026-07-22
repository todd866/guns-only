# HUD gunnery symbology — design notes

Status: Notes, 2026-07-22 · Captures pilot-feedback design intent from the Build 63→64 HUD
rebuild. Companion to the harness in `web/wwwroot/render/hud/tests/harness/`.

## Two sights, two questions (keep both)

The HUD carries a **gun funnel** and a **lead pipper** ("shoot here"). This is not redundant
symbology — it is the same split the real F-16 EEGS made (funnel + computed pipper coexist at
EEGS levels 4/5):

- **Funnel = descriptive.** "Bullets fired *now* go here" — the projected ballistic path, rails
  at the target wingspan's subtended width per range. Also the wingspan-ranging instrument.
- **Pipper = directive.** "Swing the nose so bullets go *there*" — the computed intercept on the
  *required* gun line (`GunKill.LeadPipper`).

When on-solution the two converge: the pipper sits **on the funnel's spine** at target range.
When off-solution they separate — that separation is the steering error, drawn. The Build-63
feeling of "doubling up" came from the decal funnel being *incoherent* with the pipper's
ballistics, not from having two symbols.

## Invariants (assert in the harness)

1. Funnel rails follow the projected ballistic trajectory (closed-form, gravity-dropped);
   rail half-width = `focal × span/2 ÷ range` per sample.
2. **Pipper-on-spine:** with the gun axis on-solution, `project(LeadPipper)` lies on the
   projected funnel centerline within tolerance. If this fails, the two sights disagree about
   the same physics — a bug by definition.
3. Funnel-contains-target: a bandit at range r with a valid solution sits between the rails
   where they subtend one wingspan.

## Range regimes (natural declutter)

- **> funnel far-range (~800 m):** funnel gates OFF (envelope gate) → pipper is the sole cue.
  This is the regime where the pipper leads far out in front of the bandit.
- **Inside the knife-fight band (150–800 m):** both show, coherent by construction.
- If in-flight testing still finds it busy, a settings toggle (funnel on/off) is cheap — but fly
  the coherent version first; do not decide off the incoherent Build-63 experience.

## Pilot-stated HUD ground rules (from a 1000 h Falcon pilot)

- Waterline aligns with the wings; FPV hangs below it by exactly alpha; pulling alpha widens the
  gap to match. Every symbol goes through **one camera projection** — no synthetic screen-offset
  symbols (`aoa × pixels-per-degree` FPVs are banned).
- Keyboard controls mean we do not max-perform by default: **Space is the deliberate
  commit-to-max-perform gesture** (envelope-protected bare pull is intentional, not a bug).
- Funnel size is deterministic geometry, not a tuning knob; the funnel is kept because built
  right it looks cool — the *hitting* is made viable by bounded aim-assist, not by faking the
  sight.

## Padlock hierarchy

Padlock is a camera mode, not a second complete HUD. Its overlay must answer one control question
at a time:

1. During acquisition, show `ACQUIRING BANDIT`; do not issue a flight-control command while the
   camera is still moving.
2. During a manual look override, show `RELEASE LOOK · REACQUIRE`; retain the selected target but
   suppress roll guidance until the camera returns.
3. While tracking, derive roll error from the target's right/up components in the aircraft body
   frame—not from its padlock-camera screen offset. Show a green aircraft/lift index, an amber
   lift-plane capture gate, and moving chevrons along the signed physical roll arc between them.
   Enter capture inside 11° and retain it until 18° to prevent chatter. Once captured, remove the
   amber arc and flow green chevrons outward along lift. Steering direction must read from geometry,
   without `ROLL LEFT`, `ROLL RIGHT`, or `PULL` command text.

Initial camera acquisition suppresses steering. After that first acquisition, ordinary gimbal-servo
lag may show `CAMERA SETTLING`, but it must not blank or reset the physical director. Manual look,
target replacement, padlock exit, and ground/GCAS safety do reset it. At exact six o'clock there is
no unique roll plane, so the director retains the current lift plane and shows neutral pull flow.
If a contact continues across the inaccessible aft gimbal cone, the camera performs an explicit
opposite-shoulder reacquisition instead of remaining silently clamped at 165°.

The ordinary target brackets own the only on-screen target marker in forward and padlock views.
The gun funnel and padlock SA must not stack additional diamonds on the same aircraft. Padlock adds
an edge caret only when a temporary manual look puts the selected target outside the view.

### Captured-plane roll assist

The green captured state also arms a mild target-plane trim after 0.12 seconds continuously inside
the 11° gate. The fixed-tick simulation—not the camera or HUD—recomputes the same physical error,
estimates target-plane motion, and contributes at most 0.18 normalized aileron through the explicit
SAS channel. It damps residual roll and follows small target-plane motion; it never performs the
initial roll.

Pilot roll fades the contribution from 0.08 input and removes it completely by 0.30, so a keyboard
roll owns the full axis within one physics tick. Crossing 18°, manual look, target replacement,
high-alpha override, approach mode, pilot incapacitation, or an Auto-GCAS warning/fly-up clears
capture. Exact nose/dead-six geometry commands no target-referenced assist because no unique roll
plane exists. Auto-GCAS recovery runs afterward and therefore always pre-empts the padlock
augmentation. The snapshot
publishes capture, physical error, requested roll rate, measured roll rate, and the distinct SAS
aileron contribution so flown tuning remains auditable.
