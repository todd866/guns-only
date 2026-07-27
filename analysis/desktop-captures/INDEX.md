# Desktop captures — Rapier / Guns Only UX audit

Sorted 2026-07-27 from `~/Desktop`. Originals left on Desktop; these are working copies.

## Screenshots

| Folder | Capture | Build era | What it shows |
|---|---|---|---|
| `01-atmosphere-crash` | 2026-07-26 21:12 | ~Build 135–137 | **FLIGHT KERNEL OFFLINE** — `HydrostaticAtmosphereColumn` threw: altitude outside `[-1000, 32000]` m |
| `02-egress-bingo` | 2026-07-27 11:15 | post-137 | Egress after kill: FORMATION DESTROYED, BINGO 3 MIN, M4.13 / FL75k, dense propulsion banner |
| `03-systems-panel` | 2026-07-27 11:21 | same sortie | Aircraft Systems open during ram climb — maintenance-console UI covering altitude tape |
| `04-bingo-rtb` | 2026-07-27 11:34 | same | BINGO—RTB callout at FL85k / M4.12, 711 LB fuel, text clipping on propulsion line |
| `05-circuits-nav` | 2026-07-27 13:31 | ~Build 150–152 | Rapier Circuits + Navigation console open: GATE 0/4, gross-weight/groundspeed collide, skin 150°C OVER |
| `06-pre-rapier-intercept` | 2026-07-26 17:35 | pre-crash | High-alt intercept approach: tiled ground, sparse cueing, no mission director chrome yet |
| `07-f22-dogfight` | 2026-07-25 15:30 | F-22A | Contrast: clean padlock / gunfight HUD — denser combat grammar, less chrome |
| `unsorted` | 2026-07-25 17:07 | n/a | FlightRadar24 Threads post — **not** Guns Only |

## Recordings (stills in `recordings/`)

| File | Duration | Content |
|---|---|---|
| `Screen Recording 2026-07-26 at 17.11.04.mov` | ~5 s | Steep dive over Ukraine cell (`rec26-17.jpg`) |
| `Screen Recording 2026-07-26 at 19.11.28.mov` | ~39 s | Launch gallery / low pass / airborne (`rec-2026-07-26-19-*.jpg`) |
| `Screen Recording 2026-07-27 at 11.07.56.mov` | ~9.5 s | Ram climb M4 with time-comp flash (`rec27-*.jpg`) |

## Issue themes (evidence → claim)

See sibling write-up in chat / open-work doc. Top themes:

1. Atmosphere column hard-cap vs exo climb
2. HUD chrome density (propulsion banner + nav console + systems + gate square)
3. Nav console layout bugs (nowrap + dual-unit newline)
4. Fuel/thermal urgency buried in corners while instructional copy owns centre
5. Circuits destination/cue confusion (HOME while flying gates outbound)
6. Immersion breaks (OS cursor, REACTION CONTROL chrome, raw stack traces)
