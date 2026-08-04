# Speed-scheduled relative throttle resolution

Date: 2026-08-04

## Intent

F-22 finals need fine relative throttle control; dogfight and go-around need coarse, snappy
travel. That is an **input** problem, not an engine-deck problem.

## Decision

- Physical lever → thrust remains **linear** for every afterburning-turbofan user.
- Relative inputs (keyboard W/S, mobile rocker via direct throttle, virtual-stick integrator)
  use `ThrottleInputSchedule`: fine hold/tap at low CAS and low lever; coarse otherwise.
- Absolute lever position (`SetAnalogThrottleControl`) stays 1:1.
- Speed alone never moves the lever; only pilot relative commands do.

## Schedule (gameplay surrogate)

| Condition | Hold rate | Tap step |
| --- | --- | --- |
| ≤180 KIAS and ≤0.20 lever | 0.16 / s | 0.02 |
| ≥300 KIAS or ≥0.35 lever | 0.70 / s | 0.15 |
| Between | smoothstep blend; min(speedFine, leverFine) | same |

## Rejected

- Fixed nonlinear dry PLA (`lever^2.5`): broke mid-lever TVC, rollout braking vs trim ~0.30,
  AI intermediate schedules, and RPM vs spool telemetry consistency.
- Remapping absolute lever by speed: thrust would change without pilot input.

## Files

- `sim/ThrottleInputSchedule.cs` — schedule
- `sim/DetentLayer.cs` — W/S and taps
- `web/wwwroot/render/input/throttle_rate_schedule.js` — virtual-stick mirror
- `docs/f22-performance-audit.md` — ledger note
