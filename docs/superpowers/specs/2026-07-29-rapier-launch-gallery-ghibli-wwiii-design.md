# Rapier buried launch gallery — Ghibli WWIII intro

Date: 2026-07-29  
Status: accepted (owner: go; structure + FX in one ship)  
Related: [buried launch tube](../../2026-07-26-buried-launch-tube-and-the-ukraine-theatre.md),
[ADR-0003 Ghibli-adjacent](../../adr-0003-ghibli-adjacent-world-presentation.md),
[Rapier ops](../../airframes/rapier/00-mission-and-ops.md)

> **Live-contract update, 2026-07-30.** This remains the accepted visual-intent record, but its
> approximate seven-second wording is superseded. The current 520 m / 110 m/s stroke lasts
> **9.4545 s** and the covered gallery ends at **8.6360 s**. Engineering, cost, and hybrid-media
> details now live in
> [`82-launch-gallery-engineering-basis.md`](../../airframes/rapier/82-launch-gallery-engineering-basis.md).

## Goal

Make the Rapier catshot — the player's first 9.45 s in the world — feel like **Studio Ghibli doing
WWIII**: soft lived-in earth and daylight beauty over a hard, buried EM launcher that exists for
**defensive** reasons (hard to see, lower exposure; not crater-proof). Physics-honest first; looks
second; FX included.

## Non-goals

- Changing kernel stroke / arc / end speed / `CatapultLaunchModel`
- Vacuum door or sealed-tube fantasy
- Theatre-wide Place-footprint scenery
- Full audio redesign (existing maglev catshot audio may remain)

## Locked decisions

| Decision | Choice |
| --- | --- |
| Burial | **Keep** full flat-run gallery (defense fiction) |
| Physics presentation | Generous bore + real vent relief; free-air feel; no loader stall |
| Scope | Structure rebuild **and** catshot-gated FX in one Build |
| Tone | ADR-0003: painterly berm/portal light; industrial interior; no IP / no purple glow |
| Kernel | Untouched |

## Architecture

```text
createRapierDispersedStrip()
  LAUNCH_GALLERY (arched bore + bermed mound + portal)
  LAUNCH_RAMP_BODY / rails (kernel-matched math unchanged)
  userData.launchFx  → updateLaunchFx(state) while catapult_active
```

FX die at handoff (`catapult_active` false). Tube never waits on terrain loader.

## Structure (v1)

- Exterior: grassed / spoil berm over cut-and-cover; low mound silhouette; portal as a concrete wound
- Interior: arched gallery over flat run only; rib rhythm + warm work-lamps; vent apertures that read as ducts
- Open ski-jump beyond portal: keep derived flat/arc lengths and bowReference contract

## FX (v1, stroke-gated)

| Effect | Cue |
| --- | --- |
| Vent breath / dust | Side vents along flat run while accelerating |
| Rib lamp urgency | Warm strobe intensity vs `catapult_progress` |
| Portal sheet | Soft dust + daylight bloom at gallery mouth near exit |
| Rail shimmer | Subtle EM/sparks along rail (tasteful, sparse) |

Quality tier may scale particle counts via existing `particleMultiplier`.

## Success

- Outside: mound reads buried / defensive  
- Inside: fortress corridor, not stacked boxes  
- Exit: soft sky on industrial concrete as the jet climbs the jump  
- Contracts in `rapier_presentation.test.mjs` still pass (stroke, handoff, rib counts may change only if documented)  
- Catshot remains performant; no FX left in free flight  

## Out of scope follow-ons

Portal audio polish pass; Place scenery around the strip; kernel geometry changes.
