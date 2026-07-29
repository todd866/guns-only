# Ghibli programme — Ship B: Place-bound micro scenery

Date: 2026-07-29  
Status: accepted (queued after Ship A)  
Related: [ADR-0003](../../adr-0003-ghibli-adjacent-world-presentation.md),
[nav fabric scenery bind](./2026-07-29-shared-geography-nav-fabric-design.md),
[programme overview](./2026-07-29-ghibli-programme-abc-design.md)

## Goal

Concentrate Ghibli-adjacent micro detail (fields, shelterbelts, soft roofs) on **Place footprints**
— HomePlate / Rapier strip vicinity exclusion respected, Soniachne detail cell enriched —
without promoting ambient props to collision or targets.

## Non-goals

- Theatre-wide prop carpet
- Free Fix scenery seeds
- Targetable villages / airfield plan
- Ship A atmosphere or Ship C catshot work

## Locked decisions

| Decision | Choice |
| --- | --- |
| Bind | Place / `scenery_anchor` / hero-cell doctrine |
| Sites v1 | Soniachne + HomePlate apron (strip exclusion zone kept) |
| Role | Ambient only |
| Density | Altitude-aware shed; 60 fps contract |

## Success

- Punch-out / recovery low-level reads lived-in steppe settlement, not empty DEM
- Strip gallery/vicinity remains the defensive compound, not a village campus
- Ambient exclusion zones respected

## Out of scope follow-ons

True Mesh Place CMS; 4 km hero campus; aircraft restyle.
