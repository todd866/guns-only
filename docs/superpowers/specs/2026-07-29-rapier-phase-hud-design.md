# Rapier phase-aware HUD (design)

Status: Approved in conversation 2026-07-29 · Circuits decision-priority
extension approved and implemented 2026-07-30 · Iterate in production.

Supersedes presentation hierarchy of
`2026-07-27-hud-limits-panel-design.md` for Rapier Intercept surfaces and Limits
row contents. That doc’s four-question thesis (attitude · energy · contact ·
limits) remains; phase decides which surfaces may speak.

## Thesis

Same HUD sockets. Mission + phase decide what is always-on. Nothing answers a
question that is not this phase’s job. Fuel planning leaches by correct physics
on the glass — Joker/Bingo are callouts when crossed, not panel copy.

## Architecture

```text
hudPhasePresentation(state) → {
  mission, phaseBand,
  surfaces: { quietLine, centerFdCommands, contactGeometry,
              cycleTeach, systemsGear, limitsFuel },
  limits: { rows[5], accent, heroIndex, … }
}
```

Phase bands (kernel phases collapsed):

| Band | Kernel | Primary question |
|---|---|---|
| ascent | Launch→RamClimb | Energy schedule? |
| lob | ZoomPull→DipRelight | On lob / nose-on-V? |
| intercept | Intercept | Contact + closing, with gas in mind |
| attack | Attack | Commit / release? |
| egress | Escape, RTB | Can I make the strip? |
| recovery | Recovery | Configured and on path? |

Hard kills (Intercept v1, all bands unless noted):

- Center FD command essays (`LEVEL NOW`, `ADD POWER · #### KT`)
- Systems/gear outside recovery
- Quiet line longer than ~3–4 tokens
- Cycle teach except ascent (thermal OVER may override quiet line / accent anywhere)

## Circuits decision-priority extension

Circuits uses the same surface gate as Intercept, but keys it by pattern leg and
physical configuration. The authoring questions are:

1. **NOW / Aviate** — tapes show actual state; director geometry shows the
   authored profile. Text speaks only when materially off profile.
2. **NEXT / Navigate** — the world gate owns the next spatial job. Its label is
   blank in the normal armed state and speaks only for `GATE OPEN`, `ENERGY`, or
   `CONFIG`.
3. **WHO / Communicate** — radio events and relevant traffic own this layer.
   Unselected, unambiguous circuit traffic does not need a persistent noun under
   its bracket.
4. **VERIFY / Administrate** — gear/elevon state appears only while it disagrees
   with the current leg, as a compact target-explicit card. It expires as soon
   as all three gear legs and both elevons verify.

The persistent mode line is authority plus current leg only (`DEMO · DOWNWIND`).
It does not repeat mission name, target speed/altitude, next action, or normal
configuration. Pattern fuel is latent until Joker, Bingo, minimum fuel, or
emergency fuel makes it decision-relevant.

## Limits / fuel panel (always-on Intercept airborne)

Five rows, always:

1. **FUEL** LB — aboard now
2. **NM/MIN**
3. **LB/MIN**
4. **LB/NM**
5. **ARR→next** — minutes of fuel *on arrival* until the next physical state
   among **MIN → EMER → DRY**. Label short (`ARR MIN` / `ARR EMER` / `ARR DRY`).

Arrival fuel uses existing recovery projection (`fuel_on_arrival_estimate_lb`)
when inbound/known; when outbound/`--` for ETA, still show FUEL LB and burn
triad; ARR hero may be `--` only when arrival fuel cannot be defended — prefer
computing from fuel aboard − fuel-to-home when those exist.

Doctrine (subtle, not lectured):

- **Joker** — mission-commit gate (scenario policy); radio/warning when crossed
- **Bingo** — leave now → arrive at min-fuel; radio/warning when crossed
- **Min-fuel** — clearance OK; any change → fuel emergency
- Panel never lawyers Joker/Bingo into the five rows

Accent: caution near next threshold; fault at/under EMER or negative arrival.

## Quiet mode line

Authority · phase band token · optional one urgency fragment (e.g. `SKIN OVER`).
No FL chip pile, no T0, no `P TOGGLE AUTO` essay (toggle stays a binding; hint
belongs in Controls).

## Non-goals v1

- ANCA panel content
- Tape / funnel projective math
- Per-stream fuel as kernel truth

## Acceptance

1. Intercept mid-sortie screenshot: no center FD essays; no gear panel; quiet
   line ≤ ~4 tokens; cycle teach absent (unless ascent or skin OVER).
2. Bottom-right always shows FUEL LB + triad + ARR→next when fuel known.
3. Crossing Bingo/Joker does not rename the ARR cell; callouts remain separate.
4. `hudPhasePresentation` / updated `limitsPanelPresentation` unit tests green.
5. HUD harness Rapier scenarios green; `./bin/check` or scoped gate green.
6. Circuits normal downwind: no Limits card, systems card, gate essay, or
   on-speed prose.
7. Circuits configuration disagreement: red `CONFIG` at the gate plus a compact
   amber `GEAR/ELEV REQD` verification card.
8. Circuits verified configuration removes the verification card immediately.
9. Deterministic harness scenarios cover both verified and configuration-due
   downwind states.
