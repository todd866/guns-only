# 00 — Mission and flight regime

← [README](README.md) · Next: [10 — Geometry](10-geometry.md)

## What the aircraft is for

Rapier is a **dispersed, land-based, guns-only interceptor**: launch from deep rear basing, climb
into thin air, dash to a high-slow formation, commit a single attack (ownship guns and/or gun-drone
release), then **egress and recover** rather than stay and turn. The name is doctrine: a thrust, not
a slash. Surviving the pass and hunting the recovery is how you beat one. *(fiction framing, but the
regime it forces is closed/surrogate below.)*

## Regime boxes (authored profile — surrogate)

| Phase | Altitude (approx) | Mach / speed | Binding constraint |
| --- | --- | --- | --- |
| Catapult / gallery | buried → open 12° ramp | end ~110 m/s (~1.5–1.7 Vs at gross) | launcher energy, not wing area |
| Subsonic climb | → FL560 (~17 km) | ~M0.90 | turbine thrust through transonic; clean config |
| Transonic push | mid-high | M0.94 → ~M1.2 | wave-drag peak ~M1.18 (`WaveDragK` 20) — push through |
| Ram light → full | high | M2.0 → M2.8 | continuous TBCC overlap; density-gated inlet |
| Ram climb / dash | → FL700 (~21+ km) | briefing **M4** (*fiction*); OFT peak **~M3.69** | thin air + ram; inlet forbids low-alt dash |
| Attack dive | descending | energy into gun/drone window | structure 12 G / override 15; lagged skin thermal |
| Egress | thin air | same dash box as above | drones screen pursuers (*provisional* packaging) |
| Return / shed | ~FL450 | ~M2 then decelerate | fuel reserve to trap |
| Marshal / wire | pattern → strip | approach / hook | recovery mass, not cat gross |

Briefing-aligned (**fiction** until each OFT gate closes it): RAM LIGHT ~M1.6 presentation cue; full
ram ownership by ~M2.2–2.8 in the map; four square gates into wire three.

## Why a thin-air dash (and why Mach 4 is soft)

1. **Mission geometry.** Deep basing needs high true airspeed to close and leave before a turning
   fight develops. Specific range at ram cruise is the point of the aircraft.
2. **Cycle honesty.** Ram thrust falls as inlet total temperature approaches burner temperature
   (~2300 K). The engine's thrust group peaks near ~M3 and is dying by ~M5 → map spill says the
   airframe tops out around **M4.5 on thrust** — that is an upper bound, not a measured cruise.
3. **What telemetry shows.** Intercept OFT energy-ladder runs peak at **~M3.69** near FL700. Treat
   briefing Mach 4 as **aspirational fiction** until propulsion is retuned; do not buff the core
   again to fake a green gate.
4. **Right binding order.** CMC skin is good to ~M5.7 thermally; the engine dies first. The thermal
   gauge (now **lagged** structure, not instantaneous recovery) is a **dive soak warning**, not a
   permanent ceiling.

## Thermal vs thrust ceiling

| Limit | Approx | What hits first |
| --- | --- | --- |
| Stagnation temp @ M4 | ~910 K (~637 °C) ambient-total class | Stainless already failed; CMC still has margin |
| Skin qualified | 1473 K (1200 °C) — **closed**, `SkinTemperatureLimitK` | Airframe thermal headroom |
| Ram cycle / spill | useful dash ~M4; spill band M3.3–3.8; dead by ~M4.5–5 | **Thrust** |
| Structure | 12 G qualified / 15 G override — **closed**, `PositiveStructuralLimitG` / `PositiveOverrideLimitG` | Dive pull, not cruise |

**Decision locked:** keep **CMC** hot structure; **do not** revert to stainless. Keep map
`DesignMach = 2.6` as a normaliser only (see [30 — Propulsion and inlet](30-propulsion-and-inlet.md)).
**Mach-4 dash stays fiction-labelled** until measured performance and Identity T/W are reconciled —
see [REALISM-AND-OVERPERFORMANCE.md](REALISM-AND-OVERPERFORMANCE.md).

## Epistemic

Regime boxes and the Mach-4 dash claim are **surrogate** (grounded in mission doctrine, `AircraftParams`,
and the propulsion performance map). Exact OFT altitudes may move with guidance retunes; the *shape*
of the profile — climb clean, push transonic, overlap TBCC, dash thin, dive to attack, recover light
— does not.

