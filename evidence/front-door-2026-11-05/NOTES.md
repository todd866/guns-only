# Front door design sheet — 2026-11-05

Fixture: director `v3|2|…|3|…` (rung 2, win streak 3), PB `1350` on `guns-only.f22-personal-best.v1:mission.modern.visual-merge.f22a-vs-su27s.public-data-surrogate.v1`, logbook seed present. Captures at 1280×720, light + dark, `?frontDoor=a|b|c`.

## Returning strip (all variants)

| Row | Columns | Notes |
|-----|---------|-------|
| 3 | RUNG · 4 pips · `of 3` + rung digit | Pips right-aligned in value column; filled 0..rung |
| 3 | STRK · count · `win streak` | Monospaced count |
| 3 | PB · score · `best score` | `—` when absent |

No header rows; tags disambiguate numbers. Tooltips carry longer wording.

## Variant A (`?frontDoor=a`)

- **Layout:** One tall F-22 hero (~4:3), RC Odyssey as circular pill upper-right on hero, **More** under selector left.
- **Alignment:** Instrument strip bottom-aligned inside F-22 card; RC pill clears strip (pill sits above strip bottom inset).
- **Clip/wrap:** Dark and light: Fly + footer visible; strip text single-line.
- **Rows visible:** 3 instrument rows on hero.

## Variant B (`?frontDoor=b`)

- **Layout:** Full-width F-22 banner (21:7), RC square card + **More** in one row under banner.
- **Alignment:** Strip on banner bottom; RC and More share baseline row.
- **Clip/wrap:** After compaction, Fly + four footer actions visible at 720px; banner height capped ~168px.
- **Rows visible:** 3 strip rows (32px min-height).

## Variant C (`?frontDoor=c`)

- **Layout:** Single tall F-22 hero (~3:4), RC pill top-right on hero, **More** anchored bottom-left of hero stack (above Fly).
- **Alignment:** Strip bottom of hero; More sits in footer corner without overlapping Fly.
- **Clip/wrap:** Full chrome visible; RC pill slightly overlaps hero art (intentional one-click affordance).
- **Rows visible:** 3 strip rows.

## Pick

**Pick: A** — F-22 reads instantly as the only big decision; RC pill stays playful and one tap away; returning strip sits on the hero without fighting the banner row.

**Runner-up: C** — Cleanest “one game” story and best strip legibility, but RC pill overlap and bottom **More** compete with footer density.
