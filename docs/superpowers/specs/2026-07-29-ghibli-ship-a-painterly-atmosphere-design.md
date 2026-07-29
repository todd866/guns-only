# Ghibli programme — Ship A: painterly atmosphere

Date: 2026-07-29  
Status: accepted (owner: go; programme A→B→C)  
Related: [ADR-0003](../../adr-0003-ghibli-adjacent-world-presentation.md),
[programme overview](./2026-07-29-ghibli-programme-abc-design.md)

## Goal

Make the Ukraine canopy view read as **painterly soft-world atmosphere**: warm dusty distance,
soft sun/horizon presence, atlas disc dissolving into haze — without touching kernel weather
truth or cold instruments.

## Non-goals

- Place micro-scenery (Ship B)
- Catshot portal light story (Ship C)
- Aircraft restyle; pack-environment kill switch flip
- Invented weather layers / decorative cloud fields beyond authoritative state

## Locked decisions

| Decision | Choice |
| --- | --- |
| Path | Decision-support sky + existing soft-world fog contract |
| Switch | `uSoftWorld` / Ukraine theatre only; Korea unchanged |
| Sun | Soft non-IP sun glow in sky shader (disc + bloom), driven by existing `SUN_DIRECTION` |
| Fog | Keep single soft-world extinction module; tune bury + warmth only |
| Lights | Warmer hemisphere/sun fill when Ukraine theatre active |

## Architecture

```text
soft_world_atmosphere.js     ← shared constants / fog material patch
createDecisionSupportSky()   ← soft sun + richer warm gradient when uSoftWorld
FlightView.ensureTerrain…    ← wire uSunDirection; warm ambient/sun for Ukraine
korea_terrain / scenery      ← same haze uniforms (edge bury tweak if needed)
```

## Success

- Soft world sky shows a restrained sun bloom and warmer horizon shoulder
- Streamed disc still buries into warm haze (no square edge)
- Production wiring tests still assert `uSoftWorld` + warm fogLow
- Korea / pack-environment path unchanged
- Build stamp +1

## Out of scope follow-ons

Ship B Place scenery; Ship C catshot light; full `ma` aftermath system.
