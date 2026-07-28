# Rewild-zone scenery — Stage C design

Date: 2026-07-27  
Status: accepted (layers after geodetic theatre D0–D2)  
Related: [ADR-0003](../../adr-0003-ghibli-adjacent-world-presentation.md),
[ukraine geodetic theatre](2026-07-27-ukraine-geodetic-theatre-design.md),
[art-direction.md](../../art-direction.md),
[ukraine-low-level-scenery.md](../../ukraine-low-level-scenery.md),
[eastern authority points](2026-07-27-eastern-authority-points-design.md)

## Goal

Ukraine/Russia theatre micro-scenery for two jobs on one engine:

1. **Rapier / corridor flight** across a **continent-scale human no-go** that reads as rewilding.
2. **Medevac approaches** at sparse **human islands** that still read Ghibli-adjacent at ~50–200 ft.

## Locked decisions

| Decision | Choice |
| --- | --- |
| World character | Mostly human no-go + rewilding; settlement at zone edges + rare islands |
| Strip | Eastern frontier of the zone |
| Medevac islands | **A** (clinic/compound in clearing, default) + **B** (road-junction remnant) |
| Frame dependency | Bind to **geodetic** theatre east metres after country-scale pack ships |

## Implementation note

Do not block the geodetic theatre programme on finishing Stage C meshes. Prefer `humanPresence`
APIs in theatre east metres. Full Stage C tasks live in the geodetic plan’s D5 and/or a dedicated
scenery plan after D3 cutover.

## Success (after bind)

- Inland: rewild, almost no roofs; near strip: quiet frontier compounds.
- Medevac island A/B readable at low AGL without turning the country into a village map.
