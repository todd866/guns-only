# Ghibli programme A→B→C overview

Date: 2026-07-29  
Status: accepted (owner: go; three sequenced Builds)  
Related: [ADR-0003](../../adr-0003-ghibli-adjacent-world-presentation.md)

## Goal

Raise Ghibli-adjacent presence for the Ukraine theatre in three ships, ADR order:

1. **Ship A** — Painterly atmosphere ([spec](./2026-07-29-ghibli-ship-a-painterly-atmosphere-design.md))
2. **Ship B** — Place-bound micro scenery ([spec](./2026-07-29-ghibli-ship-b-place-scenery-design.md))
3. **Ship C** — Catshot light story ([spec](./2026-07-29-ghibli-ship-c-catshot-light-design.md))

## Shared constraints

- Adjacent influence only — no Studio Ghibli IP
- Instruments stay cold / projectively true
- Free Fixes never seed scenery
- Presentation-layer only; kernel weather truth unchanged
- One Build stamp per ship; explicit `git add` paths; prefer worktrees when `pivot-hardening` is hot

## Out of programme

Aircraft restyle; full quiet-aftermath (`ma`) system; Mesh Place CMS.
