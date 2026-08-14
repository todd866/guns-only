# Top Gun (1986): F-14A vs MiG-28

Date: 2026-08-03  
Status: Build 326 production candidate; exact public-artifact flight follows deployment. Plan:
`docs/superpowers/plans/2026-08-03-top-gun.md`

Related: [product north star](../../product-north-star.md),
[STATUS](../../STATUS.md),
[airframes README](../../airframes/README.md),
Weekend Ride design (sibling front-door slice pattern)

## Problem / opportunity

Guns Only’s front door is modern glass and guns: F-22 merge, Rapier intercept, Cobra canyon,
Weekend Ride. None of that is the cultural dogfight people already have in their heads.

**Top Gun (1986)** is that picture: Tomcat, desert/Pacific light, aggressor called a MiG, heaters
off the rail, need-for-speed energy. We want a product surface that *is* Top Gun — not an F-14
skin on the F-22 merge — with an **anime-1986** presentation (cel sky, hard chrome, saturated
late-day Pacific) rather than photoreal HUD clutter.

This experience **does not replace** the guns-only F-22 doctrine. It is a sibling. Sidewinders
are in scope here; they stay out of `first-merge`.

## Product slice

**Top Gun** is a catalog experience (`id: top-gun`) with:

- playable **F-14A** (default ownship) and selectable **MiG-28** (aggressor seat);
- **M61 + AIM-9** loadout for both seats in v1 (no Phoenix, no Sparrow fantasy);
- one ACM arena over a Miramar-ish / southern-California training range (not a carrier trap
  campaign);
- anime-1986 look: saturated late-day sky, hard silhouettes, tape/cel UI chrome — not F-22 glass;
- both seats share the same fight; seat choice is the fantasy fork.

Intended release ladder: **`coming-soon` → `preview` → `production`**. The front-door title is
**Top Gun**, never “F-14 vs F-5”.

## Approach

| Piece | Ownership |
| --- | --- |
| F-14A flight / systems (sourced where possible) | `sim/` airframe + `docs/airframes/f-14a/` |
| MiG-28 identity (fiction) over F-5E-class numbers | `docs/airframes/mig-28/` + F-5 sources file |
| AIM-9 flight + seeker (honest toy, not BVR encyclopedia) | dedicated missile lane under `sim/` |
| Guns (M61 / MiG gun) | reuse existing gun/ballistics patterns |
| Bandit AI for the opposite seat | Fight Director / bandit doctrine tuned for DACT |
| Mission / catalog | `top-gun` experience in campaign catalog + Ready picker |
| Anime-1986 presentation | art direction + HUD/chrome skin for this experience only |

Shared with the platform: session lifecycle, semantic input, snapshot/render pipeline,
determinism tests, telemetry. Not shared: F-22 guns-only purity, Rapier recovery, motorcycle lane.

## Seats

1. **F-14A (default)** — player as Tomcat; AI flies MiG-28 aggressor(s).
2. **MiG-28** — player as aggressor; AI flies F-14A.

v1 is 1v1. 2v1 / section tactics deferred.

## Loadout (v1)

| Seat | Gun | Heaters |
| --- | --- | --- |
| F-14A | M61 Vulcan | 2× AIM-9 (provisional; design resolution) |
| MiG-28 | F-5E-class gun under fiction name | 2× AIM-9-class heaters (provisional; same toy family) |

Out of scope for v1: AIM-54, AIM-7, bombs, gunpods-as-identity, radar-guided BVR, defensive
systems encyclopedias (RWR as optional later chrome only if it earns its keep).

### AIM-9 honesty bar

- Physical round in the world with timed flight, PN/surrogate seekor logic, and a clear miss/hit.
- No magic “press R to win”; seeker limits and kinematics must be fail-able.
- Exact seeker generations and classified envelopes are **not** claimed; label `surrogate` /
  `provisional` and cite what we copied from open sources.

## Airframes and epistemics

| Identity | Flight numbers basis | Epistemic |
| --- | --- | --- |
| F-14A Tomcat | Open F-14A sources; swing-wing as a real state if it matters to ACM | `measured` / `surrogate` per constant |
| MiG-28 | **Fiction name** (Top Gun); performance from **F-5E-class** open sources | identity `fiction`; numbers `measured`/`surrogate` with F-5 provenance |

Sources live under `docs/airframes/f-14a/` and `docs/airframes/mig-28/` (MiG-28 folder states the
fiction overlay and points at F-5 evidence). Silent invented precision is forbidden — same house
rule as Panther/Rapier/Cobra.

Swing-wing: v1 uses a scheduled wing-sweep vs Mach/CAS table published on snapshot
(`wing_sweep_deg`). Coarse aero scales Tomcat effective `WingSpanM` from the mid-sweep
placeholder toward ~55% span at full sweep each tick (SURROGATE — not AWG-9/RIO logic).
Follow-up: induced-drag/wave coupling to sweep if preview dogfights need more energy truth.

## World / mission loop

- Theatre: southern-California training range fiction (Miramar energy) — coastline + desert
  light, not USS Enterprise trap practice.
- Lifecycle: Ready (Top Gun briefing chrome) → Active 1v1 ACM → kill / bingo / mutual disengage
  soft end → debrief line.
- Soft outcomes acceptable in preview; production wants a clear win/lose from guns or heaters.

Carrier catapult, flat spin lore beats, Viper as RIO, class montage, and beach sequences are
**out of v1**. They may appear later as chrome or a second experience.

## Presentation (anime-1986)

Experience-scoped art direction, not a global renderer rewrite:

- saturated late-day Pacific / golden haze;
- hard aircraft silhouettes; limited material complexity;
- HUD/chrome closer to cel + tape than modern glass (experience skin);
- radio/callout energy optional; no licensed soundtrack assumption in v1 (original or
  rights-cleared only).

Picker art: one Tomcat painting, one MiG-28 aggressor painting; title treatment **TOP GUN**.

## Catalog / release

```text
id: top-gun
title: Top Gun
releaseState: production   # owner-directed Build 326 promotion; exact-artifact flight follows deploy
```

STATUS matrix gets a row when the catalog entry lands. `hidden` HTML is never the release gate.

## Snapshot contract (minimum extras beyond shared ownship)

- seat id (`f-14a` | `mig-28`);
- wing-sweep state (Tomcat);
- gun rounds remaining;
- AIM-9 remaining + in-flight missile pose/seeker mode for each live round;
- opponent identity label (`MiG-28` / `F-14A`) for HUD callouts;
- experience presentation theme id so the client can select the anime-1986 skin.

## Non-goals (v1)

- Turning `first-merge` into a missile game
- Full TOPGUN school / campaign / multiplayer
- Carrier qualification as a gate to the dogfight
- Photoreal Tomcat cockpit
- Claiming classified F-14 or missile performance
- Licensed Paramount IP (names/dialogue/logo marks) — we ship an original “Top Gun” *vibe*
  product surface; legal/branding review before any mark that is not ours

## Open questions (resolved in plan)

1. AIM-9 count per seat: **2** (provisional) for v1.
2. RIO: **absent** in v1 (single-seat control fantasy).
3. Swing-wing: **Mach/CAS schedule**, published on snapshot; coarse aero effect before preview.
4. Missiles: dedicated **`sim/Missiles/Aim9Surrogate`** lane — do not reuse Rapier timed-impact helper as-is.

## Implementation status

Build 326 repairs the programme-selector terrain owner that stalled the first production launch
attempt in `autoLaunchPending`, and the owner explicitly ordered production promotion on
2026-08-14 after the corrected launch/authority path passed focused automation. Owner workflow is
deploy first, then fly the exact public artifact: the representative human dogfight and telemetry
review are post-deploy acceptance checks, not pre-deploy gates. This records the sequence without
claiming that the post-fix flight has already happened.

## Success bar (production rollout)

Preview:

- [x] Both seats launch
- [x] 1v1 completes with gun or Sidewinder kill/miss (automation)
- [x] Anime skin readable on phone and desktop
- [x] Automation covers spawn/loadout/missile miss path

Production:

- [ ] Representative human dogfight on the exact public artifact (post-deploy acceptance)
- [x] STATUS/catalog aligned (`production`, Build 326 candidate)
- [ ] Owner-telemetry not polluting “first Top Gun kill” celebrations (post-deploy review)
