# F-22 approach + Mach envelope audio

Status: approved · 2026-08-04 · Builds on [F-22 cockpit audio](2026-07-28-f22-cockpit-audio-design.md)

## Goal

Sealed-cockpit F-22 must read **threshold / approach** as quiet dirty-config flight, and **M0.6 / M0.9 / M1.2** as distinct air-load regimes — not one saturated roar.

## Problem

1. Demo-cam beds ignore dynamic pressure; short final still played cruise/dash body (partially fixed with a first `q` duck).
2. Shared `q01` saturates near 45 kPa (~M0.8 SL), so rush/canopy/bed duck cannot separate high subsonic from low supersonic.
3. Gear-down and board air do not carry approach identity once beds are ducked.

## Approach

Runtime mix only — no new bed PCM.

1. **Scoped `q` curves** — preserve the existing 750 Pa–45 kPa response for Rapier, generic jets, and exterior views. The sealed F-22 cockpit alone uses a **95 kPa** ceiling (~M1.16 SL), through one parameterized helper shared by engine and event cues.
2. **Approach character (sealed F-22)** — stronger low-`q` airborne duck; idle owns short final; mil/grit reserved for higher `q`/power; darker LP; ECS more legible. Structure floor stays.
3. **Dirty config** — gear-down adds light q-scaled bay/door air; speed-brake hiss remains the board tell, audible on approach without restoring dash body.
4. **High-`q` reserved for dash** — grit / canopy / rush open fully only past high-subsonic `q`.

## Feel gate

| Regime | Fixed lever | Expect |
| --- | --- | --- |
| Threshold ~145 kt | approach power | Quiet body, idle-led, gear air if down, no dash roar |
| Cruise ~M0.6 | mid power | Mid bed + modest rush |
| Dash ~M0.9–1.2 | high power | Full airborne bed, rush/canopy open; M1.2 > M0.9 |

## Out of scope

Bed WAV resynthesis, Rapier identity rewrite, exterior flyby redesign. F-22 gear-bay and approach-board lift must not alter other aircraft.
