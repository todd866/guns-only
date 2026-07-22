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
