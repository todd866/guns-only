# Ghibli programme — Ship C: catshot light story

Date: 2026-07-29  
Status: accepted (queued after Ships A–B)  
Related: [launch gallery](./2026-07-29-rapier-launch-gallery-ghibli-wwiii-design.md),
[ADR-0003](../../adr-0003-ghibli-adjacent-world-presentation.md),
[programme overview](./2026-07-29-ghibli-programme-abc-design.md)

## Goal

Make the first ~10 s of Rapier catshot a **light story**: warm industrial gallery → soft portal
daylight sheet → open sky — then a short quiet after airborne. Extends existing `launchFx`; no
kernel stroke/arc changes.

## Non-goals

- Audio redesign
- New gallery geometry
- Atmosphere programme (Ship A) or Place scenery (Ship B)

## Locked decisions

| Decision | Choice |
| --- | --- |
| Host | `userData.launchFx` / `rapier_launch_fx.js` |
| Gate | `catapult_active` + brief post-handoff fade |
| Tone | Soft daylight sheet + warmth contrast; no purple glow / IP |

## Success

- Portal exit reads soft sky on concrete
- FX die cleanly after handoff (no free-flight leftovers)
- Presentation contracts remain green

## Out of scope follow-ons

Portal audio polish; vacuum-door fantasy.
