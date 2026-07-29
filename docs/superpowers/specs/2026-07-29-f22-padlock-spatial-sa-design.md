# F-22 padlock spatial SA: energy plane, override-stable director, canopy glass

Status: Design approved in conversation 2026-07-29 · Child of
`docs/hud-symbology-notes.md` (aft-hemisphere padlock rebuild) · F-22 guns-only presentation;
Rapier synthetic analogue is an explicit follow-up.

## Thesis

Padlock already has a body-fixed ADI and a lift-plane director, but three gaps still break
spatial judgment in the fight that matters:

1. **Dead six is opaque.** Exact six has no unique roll plane, so today's director shows
   neutral `PULL`. That is geometrically honest and tactically incomplete: a slow jet should
   not open vertical, and a low jet should not pull into the dirt.
2. **Space blanks the lift vector.** Envelope override (Space) correctly yields the mild
   padlock SAS, but the kernel currently resets assist state wholesale, so
   `geometry_valid` goes false and the HUD erases the director exactly when the pilot is
   max-performing.
3. **Look orientation lacks airplane cues.** The production view keeps the authored cockpit
   GLB off (`PRODUCTION_AUTHORED_COCKPIT_ENABLED = false`) for airdata readability. Without
   canopy references, padlock look still answers "where is the bandit" better than "which way
   is my airplane facing."

This design keeps cold instruments projective and control ownership with the pilot. It
decouples **presentation geometry** from **control eligibility**, adds a **cue-only**
energy/terrain preferred plane near dead six, and ships a **Falcon-style F-22 canopy glass
layer** (mid-axis etch + mild pilot reflection). Rapier stays a composite egg with synthetic
vision in v1; a synthetic SA analogue may come later.

## Architecture

Three seams, one job: keep padlock spatial truth readable while max-performing and when the
bandit is astern.

| Seam | Owns | Does not own |
|---|---|---|
| **Padlock geometry publisher** (kernel) | Always-computable lift-plane error, any-plane flag, and a **preferred-plane** cue when energy/terrain pick a plane at/near dead six | SAS aileron trim; never blanks geometry because Space is held |
| **Padlock ADI director** (HUD) | Draws lift tick, gate, chevrons from published geometry; preferred-plane uses the same amber→green vocabulary | Does not invent roll in camera space; does not initiate the opening roll |
| **Canopy glass layer** (F-22 presentation only) | Mid-axis etch + mild pilot reflection that move with look | Not a second HUD; not the full authored cockpit GLB; not shown on Rapier |

**Invariant:** presentation geometry ≠ control eligibility. Space yields the mild SAS; the
director stays up.

```text
  EnvelopeOverride / GCAS / approach / high-alpha recovery
            │
            ▼
  SAS eligibility ─── false ──► sas_roll = 0, captured assist inactive
            │
            │ (independent path)
            ▼
  Geometry publisher ─ always when padlock selected + LOS finite
            │
            ├─ roll_error / plane_magnitude / any_plane
            └─ preferred_plane_rad? (near-six energy/terrain pick)
            │
            ▼
  HUD ADI director ── draw lift + gate (+ chevrons) whenever geometry_valid
```

## Space / override-stable director

### Problem

`ApplyBanditPadlockRollAssist` sets `eligible = false` when
`effectiveCommand.EnvelopeOverride` is true. `PadlockRollAssist.Step` treats ineligibility as
a full `Reset()` to `Inactive`, which clears `GeometryValid`. The HUD requires
`padlock_roll_assist_geometry_valid` for `steering.valid`, so the lift tick and gate vanish
for the whole Space hold.

### Contract

- **Keep publishing** selected target geometry (plane magnitude, signed body-frame roll
  error, any-plane, and preferred-plane when applicable) while padlock is selected and the
  LOS is finite — including under Space, high-alpha recovery, and other SAS-ineligible
  conditions that are not "no target."
- **SAS contribution only** zeros / stays inactive when ineligible. Capture dwell for *assist
  authority* may clear; the director must not require assist capture to draw geometry.
- **Presentation capture** (amber gate → green pull-flow) follows body-frame error inside the
  existing 11°/18° band from published geometry, even when assist `Captured` is false because
  SAS is ineligible. Otherwise Space would keep an amber gate after the pilot already put lift
  on the plane.
- Snapshot fields remain the HUD's source of truth. If new preferred-plane fields are added,
  detect them by field presence (same pattern as today's kernel-steering schema gate).

Out of scope for this fix: changing the 0.18 SAS authority, the 11°/18° capture hysteresis,
or Auto-GCAS priority.

## Energy / terrain preferred plane (cue only)

### When it arms

Padlock tracking a live bandit, and the target is near dead six: `planeMagnitude` below
today's singular floor (`SingularPlaneMagnitude = 0.035`), or so small that the existing
any-plane path would fire. Outside that band, today's ordinary roll-error director is
unchanged.

### Inputs

Already available to the session / snapshot — no new player chores:

- Indicated / calibrated airspeed vs corner speed at altitude
- Pitch and/or body-up world component (which hemisphere a pull opens into)
- Radar altitude
- Existing Auto-GCAS warning / active flags

### Selection (deterministic)

1. **Terrain veto** — if radar altitude is low and a candidate pull would put body-up toward
   the ground (or GCAS is warning/active), reject that hemisphere; prefer the lift plane that
   keeps the opening more nose-high / skyward.
2. **Energy veto** — if well below corner, reject a near-pure vertical / high-yo-yo opening;
   prefer a flatter plane that trades less energy for turn rate.
3. **Default** — if both hemispheres are acceptable, preferred gate is **0° from current
   lift** (pull in the plane you already have; no invented 90° roll). If neither is
   acceptable, fall back to neutral any-plane `PULL` with no preferred gate (honest "no good
   opening").
4. **Hysteresis** — latch the preferred gate for a short dwell so LOS wobble through exact
   six does not chatter the cue.

When a preferred gate is published, it replaces the neutral any-plane ring for that frame.
`any_plane` remains true only for the honest no-preference fallback.

Exact numeric thresholds (radar-alt floor, "well below corner" fraction, dwell seconds) are
implementation-plan tuning with harness cases; the veto order above is normative.

### Presentation and control

- Same ADI ring vocabulary: amber gate + chevrons toward the preferred plane; once the
  pilot's lift enters the usual 11°/18° capture band, green pull-flow as today.
- **Cue only.** Preferred-plane never initiates or biases the opening roll. SAS remains the
  existing mild hold *after* the pilot puts lift in the gate, and still yields to Space /
  pilot aileron / GCAS / approach / high-alpha recovery.
- No new command text (`ROLL LEFT`, etc.). Existing `PULL` / aft-shoulder language stays.

## Canopy glass (F-22 only)

Keep `PRODUCTION_AUTHORED_COCKPIT_ENABLED = false`. Add a **lightweight canopy glass layer**
in the F-22 player view (forward and padlock).

### Marks

- **Mid-axis etch:** one subtle front-to-back centerline on the glass — the Falcon
  longitudinal reference. Body-fixed relative to the canopy / look; not a HUD phosphor line.
- **Pilot reflection:** a soft, low-opacity helmet/shoulder ghost on the glass, mild enough
  to read as reflection rather than a character. It shifts with look so aft/shoulder views
  still answer "which way am I facing?"

### Constraints

- Sparse v1: centerline + reflection only — no extra HUD ticks painted on the glass.
- Never occlude or replace cold instruments (ADI, waterline, gun symbology stay on the HUD
  plane).
- Art stays clinical/weathered per cold-instruments doctrine — no glossy sci-fi canopy chrome.
- Perf: single translucent mesh + one cheap reflection billboard/quad; eligible to shed with
  other cockpit detail if the frame governor demands it.
- **Airframe gate:** shown only for F-22 guns-only (`HighAlphaModelKind.F22PublicDataSurrogate`
  / F-22 presentation id). Rapier missions assert both marks absent.

### Rapier follow-up (not v1)

Rapier is a composite egg/pod with synthetic computer vision; the pilot reclines for G. A
**synthetic** SA analogue of these cues may still be useful later as a teaching tool, but it
must not pretend to be canopy glass on a windscreen that does not exist. Recorded as
follow-up only.

## Testing

### Kernel

- Space held: geometry + roll error (and preferred-plane when applicable) still publish;
  SAS contribution is zero / inactive; HUD still transitions to green pull-flow when
  published error is inside the capture band.
- Near-six: low-alt nose-low → skyward preference; slow vs corner → reject pure vertical;
  both vetoed → neutral `PULL`; hysteresis holds the gate through LOS wobble.
- Ordinary off-six roll-error and capture hysteresis regressions remain green.

### HUD harness

- Override frame: lift tick + gate remain drawn.
- Preferred-plane scenarios assert gate sign / angle, not assist aileron.
- Canopy: F-22 mission shows centerline + reflection present; Rapier mission asserts both
  absent.

### Scope gate

Energy director and override-stable geometry apply wherever bandit padlock runs. Canopy glass
is **F-22 only** in this spec.

## Non-goals

- Re-enabling the full authored cockpit GLB for production.
- Stronger roll assist that initiates the dead-six opening.
- Rapier canopy etch / pilot reflection (follow-up synthetic SA only).
- New command-text directors or a second padlock HUD language.
- Changing gun funnel / pipper contracts.

## Companion notes

Extends the aft-hemisphere padlock rebuild in `docs/hud-symbology-notes.md` without replacing
its body-fixed inset ADI, shoulder language, or SAS law. Cold-instruments doctrine in
`docs/art-direction.md` remains binding: world stylization never warps flight-critical
geometry.
