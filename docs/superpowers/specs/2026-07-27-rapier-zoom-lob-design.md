# Rapier zoom-lob profiles, cold-gas RCS, and Go Fly jobs (design)

Status: Approved in conversation 2026-07-27 · Builds on
`2026-07-26-open-work-and-findings.md` (exo lob), Circuits FD
(`2026-07-27-circuits-fd-boxes-design.md`), and existing `RapierMissionDirector`.

## Thesis

The Rapier’s real long-range trick is the **out-of-atmosphere lob**: boost on the
ram, pull into a zoom, coast where drag and fuel burn collapse, then reenter with
**nose on the velocity vector** and relight. Efficiency is not a buff — coast
cuts thrust so the turbo-ramjet map stops charging fuel. Un-chaseability is a
regime change above ~40 km.

The player is **given a profile and flight-director guidance** and flies it with
the same stick. Above the aero floor, that stick drives **cold-gas RCS** with a
finite gas budget. A **Go Fly the Rapier** beat deals random jobs on that profile.

Faction: player is **not** the Russian side — AWACS/enabler hunting with
F-22-class pursuers on egress (existing Escape path).

## Player contract

| Surface | Job |
|---|---|
| **Profile** | Authored entry shelf, γ target, coast, reentry align, dip/relight |
| **FD** | Pitch/bank/speed bugs; on coast, cue nose→V |
| **Stick** | Same controls always; FCS blends aero → RCS as q dies |
| **Gas** | Finite RCS budget; thrashing costs gas; quiet remaining cue |

## Architecture

```
Job (balloon / AWACS / transport / swarm lob)
  → Profile card (zoom geometry + release/attack cue)
    → RapierMissionDirector phases + FD targets
      → PilotCommand (same path as human / Circuits)
        → FlightModel: aero moments × q-authority + RCS moments
```

### Phases (extend `RapierMissionPhase`)

`Boost` (existing Climb/Accelerate/RamClimb) → `ZoomPull` → `ZoomCoast` →
`ReenterAlign` → `DipRelight` → Attack/Release → Escape → RTB → Recovery

### Jobs (v1 deck)

| Job | Contact | Win |
|---|---|---|
| Balloon | High soft target | Kill / pass |
| AWACS/enabler | High slow enabler | Kill; F-22-class pursuers on egress |
| Low-level transport | Low contact after lob | Dive attack |
| Swarm lob | Apex release window | Swarm release at coast apex |

Deterministic seed from beat/session. Intercept formation remains beat 10.

## Cold-gas RCS

- Active when `AircraftParams` declares RCS capacity (`ColdGasRcsMaxMomentNm > 0`).
- Aero control moments fade with dynamic pressure between `QRcsFull` and `QAeroFull`.
- Stick demand maps to the same pitch/roll/yaw moment loop; RCS supplies the faded
  share and consumes gas ∝ |moment| × dt.
- Zero gas → no RCS moments (dead stick in vacuum until q returns).
- Coast success criterion: **nose aligned with velocity** before dense reentry
  (FD publishes that error).

## Fuel truth

No efficiency multiplier. Harness should show lob transit lb/100 nm beats steady
FL700 ram cruise because coast throttle ≈ 0. Accept if OFT/unit energy cards
demonstrate coast burn collapse; full range comparison may land in a follow-up card.

## Snapshot / HUD

Publish (names indicative):

- `rapier_rcs_gas_frac`, `rapier_rcs_authority`
- `rapier_nose_on_v_err_deg` (FD coast cue)
- Existing `rapier_fd_bank_deg` / `rapier_fd_target_ktas` during pull/reenter
- Job token + quiet cue line (no Intercept “swarm” chrome on balloon/transport unless relevant)

## Non-goals

- Multi-skip Sänger automation loop
- Career / clinic / Ghibli / AI-governance fiction
- Rocket stage at apex / orbit claims
- Separate RCS stick mode
- Efficiency spreadsheet coach HUD

## Acceptance

1. Rapier with RCS: at q→0, aero authority fades; stick still produces moments until gas empty.
2. ZoomCoast cue drives nose→V; ReenterAlign before dense air.
3. Go Fly beat deals one of four jobs; AWACS egress can activate pursuers.
4. Director/FD tests green; RCS unit tests green; `./bin/check` or documented subset green.
5. Design lives at this path; implementation follows.

## Follow-ups landed

- Fuel OFT: `RapierLobFuelOftTests` — ballistic coast beats FL700 cruise on lb/100 nm.
- FD: `rapier_nose_on_v_err_deg` drives quiet `NOSE→V` / `ON V` on coast/reenter.
- Job attack geometry: Transport dive, Swarm apex/high pass, Balloon slash, AWACS swarm + pursuers.
