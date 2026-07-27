# Rapier Circuits coach + agent OFT harness (design)

Status: Approved in conversation 2026-07-27 · Companion to
`2026-07-27-hud-limits-panel-design.md` and distinct from
`2026-07-27-flight-test-harness-design.md` (physics Identity / buff-creep).

## Thesis

The player’s only visibility is **playing the game**. Agent verification must not require the
player as a flight-test instrument.

Today `Beats.RapierCircuits` nulls `ScriptedIntercept`, which disables `RapierMissionDirector`
entirely — so Circuits has launcher and strip but **no procedural coach**. The agent also lacks a
Circuits gate harness with dense telemetry.

## Split

| Actor | Artifact |
|---|---|
| Player | In-game quiet line + guidance squares + Limits `nav` through marshal → lineup → final → wire |
| Agent | Headless gate cards + envelope asserts + **JSONL telemetry** of every tick / gate transition |

## Circuits director coupling

Add `ScriptedInterceptConfig.PatternOnly` (default false).

`RapierCircuits` restores a ScriptedIntercept stub:

- `PatternOnly: true`
- Formation / drones / pursuers = 0
- `AutomationDefaultEnabled: true`
- `RecoveryRequired: true`

Director behaviour when `PatternOnly`:

1. Catapult → `Launch`
2. After stroke: climb to circuit shelf (~marshal height above strip), cue names CIRCUITS climb
3. Then `Recovery` (marshal → lineup → initial → final squares 1–4) — same geometry as Intercept
4. Bolter / touch-and-go re-arms (existing `_circuitsFlown` path)
5. Ignore `liveOpponentCount` for phase (phantom bandit must not pull an intercept)

`RapierMissionAvailable` stays `ScriptedIntercept is not null` — Circuits is available again.

Quiet HUD line uses existing presentation; Circuits phases map to short copy (`CIRCUITS · LAUNCH`,
`CIRCUITS · CLIMB`, `RECOVERY · GATE n/4`, etc.).

## Agent OFT harness

`sim.Tests/RapierCircuitOftTests.cs` (+ optional `sim/FlightTest/CircuitOft*.cs` helpers):

**Cards** (start airborne or on cat as needed):

| Card | Start | Pass |
|---|---|---|
| `launch-clear` | Catapult | Airborne, gear state sane, skin margin ≥ 0 |
| `marshal` | Near marshal | Cue/gate 0, energy in shelf, cross-track bound |
| `lineup` | After marshal earned | Heading / cross-track for lineup |
| `final-2` | Final armed, gate 2 | Speed ~ approach band, path angle bound |
| `wire` | Automation from marshal or final | Arrestment Stopped, wire 1–4 |
| `bolter-rearm` | After final + climb | Flags re-armed, second approach reachable |

**Telemetry (record lots):** every harness run writes JSONL under
`analysis/circuit-oft/<runId>/`:

- `hdr` — build, beat id, card id, seed/time, schema `guns-only.circuit-oft.v1`
- `tick` @ 10 Hz (or every N sim ticks): t, phase, gate, cue, pos, mach, ktas, alt_ft, fuel_lb,
  flow_pph, skin_c, thermal_margin_c, gear, hook, g, bank_deg, gamma_deg, home_range_m,
  automation, envelope flags
- `gate` — on phase/gate change: from→to, snapshot of envelope
- `abort` / `pass` — terminal row with reason

CI asserts pass/fail; agents read the JSONL. Player never sees this surface.

## Non-goals

- Physics Identity FlightTest module (separate spec)
- Browser OFT overlay
- Requiring the player to fly for CI green

## Acceptance

1. Beat 11: `RapierMissionAvailable`, automation can fly launch → shelf → recovery → wire
2. Quiet line / Limits nav present in snapshot while Circuits runs
3. Harness cards green under `dotnet test`; JSONL artifacts written for the wire card
4. Bolter re-arm covered
5. `./bin/check` stays green
