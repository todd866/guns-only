# Circuits flythrough boxes + flight director (design)

Status: Approved in conversation 2026-07-27 · Builds on
`2026-07-27-rapier-circuits-oft-design.md` and `2026-07-27-hud-limits-panel-design.md`.

## Thesis

Rapier Circuits is **pattern training**, not a fight. The pilot launches from the ski-jump (not on
the runway), flies a recovery pattern to the main strip, does **touch-and-goes short of mid-runway
arrestor gear**, and eventually takes a **full-stop arrest**. The hook stays down the whole time as
a safety net if they go long.

Teaching needs two distinct surfaces:

| Surface | Job |
|---|---|
| **Flythrough boxes** | Spatial **margin** — pass through the volume; next gate is obvious in the world |
| **Flight director** | Stick/power **guidance** — pitch, bank, and speed toward the active box / path |

Combat Intercept copy (“fights on”, swarm release, FL700 ram language) must not appear on Circuits.

## Sortie contract

1. **Launch** — catapult / ski-jump; track owns the aircraft briefly.
2. **Depart / climb** — to circuit shelf (~marshal height AGL), not FL700 intercept climb.
3. **Pattern legs** — flythrough boxes: depart → downwind → base → **short final** (touch-and-go /
   go-around **before** mid-runway gear).
4. **Wire final** — when accepting the full stop: flythrough boxes on the arrestor path; aerobrake
   then trap.
5. **Hook** — down at all times during Circuits recovery (already pattern intent; cue must say so).
6. **Bolter / T&G** — climb through reset height → re-arm pattern boxes (existing director path).

Launch site ≠ runway. Arrestor ≈ halfway down the runway. Short of halfway = pattern; past halfway
with hook = you are in the trap whether you meant to be or not.

## World: flythrough boxes (margin)

Reuse the existing projective Rapier guidance square (`rapier_guidance_*`) and threshold diamond.

Circuits **names** the active box by leg (drawn as a short label near the square, not an essay):

| Leg token | Director geometry (v1 mapping) |
|---|---|
| `DEPART` | Launch / climb to shelf; waypoint toward pattern entry |
| `DOWNWIND` | Marshal capture (inbound setup, energy still high) |
| `BASE` | Lineup → turn onto runway heading |
| `SHORT FINAL` | Initial / early groove — **go around before gear** |
| `WIRE FINAL` | Final squares 1–4 on arrestor path — **accept wire** |

Box size remains screen-space margin (existing half-size schedule by gate). Do not replace boxes with
a 3D ribbon in this pass.

## HUD: flight director (guidance)

When `rapier_pattern_only`:

1. **FD needles** (always drawable while mission available and phase is climb/recovery):
   - Bank: director `BankTarget` vs aircraft bank (or projected lateral error to box).
   - Pitch: director path / altitude error (use commanded gamma / target altitude vs current).
   - Speed: target KTAS vs current with `ON SPEED` / `SLOW` / `ADD POWER` (director already
     computes this language in cues).
2. **Quiet mode line** under the heading tape:
   `PILOT|AUTO · CIRCUITS · <LEG> · <one action>`  
   Examples: `CIRCUITS · SHORT FINAL · GO AROUND BEFORE GEAR` ·
   `CIRCUITS · WIRE FINAL · HOOK DOWN · FLY THE BOX`.
3. No swarm / attack / FL700 intercept chrome on Circuits.
4. Limits Panel `nav` unchanged (fuel / home / reserve).

FD must work with **PILOT** flying (director targets still published) and with **AUTO**.

## Snapshot / kernel

Publish Circuits teaching fields (names indicative):

- `rapier_circuit_leg` — string or small enum int (`DEPART` … `WIRE_FINAL`)
- Director targets already partly published: `rapier_target_mach`, `rapier_target_altitude_ft`,
  waypoint, gate. Add **director** bank target and target KTAS for FD even when automation is
  standby (`rapier_fd_bank_deg`, `rapier_fd_target_ktas` or reuse clear names).

Pattern-only cues in `RapierMissionDirector` switch from Intercept recovery essays to Circuits leg
actions above.

## Non-goals

- Full world-space pattern ribbon mesh.
- Changing Intercept combat phases or guns-only ladder.
- Requiring player flight for CI (OFT harness remains agent-side).
- Far-field ocean / scenery (tracked separately; hide inland sea if touched opportunistically).

## Acceptance

1. Circuits mode line never shows Intercept attack/swarm/FL700 intercept phase text.
2. Active flythrough box is labeled with the current leg token.
3. FD pitch/bank/speed cues track director targets while PILOT or AUTO.
4. SHORT FINAL cue/action tells the pilot to go around before mid-runway gear; WIRE FINAL tells
   them to accept the arrest.
5. Existing Circuits OFT / director tests stay green; add presentation tests for leg + FD.
6. `./bin/check` stays green (or documented subset if full check is out of scope for the PR).
