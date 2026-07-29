# Ghibli follow-on — Soniachne village edge + Rapier strip exclusion

Date: 2026-07-29  
Status: accepted (owner: keep going)  
Related: [Ship B](./2026-07-29-ghibli-ship-b-place-scenery-design.md), [ADR-0003](../../adr-0003-ghibli-adjacent-world-presentation.md)

## Goal

1. Expand Soniachne clinic hero pack with village-edge cottages, south shelterbelt, culvert.
2. Ship Rapier eastern-strip feature pack: ambient exclusion + soft approach/shelterbelts so
   procedural settlement never kisses the gallery.

## Non-goals

Targetable/collidable props; LZ authority; Mesh CMS.

## Contracts

- Dual `content/` + `web/wwwroot/content/` byte identity
- SHA-256 pins in `Ukraine2030sTheatre`
- Browser `missionFeaturePackRequest` supports both pack IDs
