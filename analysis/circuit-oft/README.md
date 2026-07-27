# Circuit OFT telemetry (agent-facing)

Written by `sim.Tests/RapierCircuitOftTests` when the OFT cards run. **Not a player surface** —
agents use these artifacts to verify Circuits without asking a human to fly.

## Layout

```text
analysis/circuit-oft/<utc>-<card>/
  hdr.json       schema, card, beat, start time
  ticks.jsonl    ~10 Hz state samples (phase, phase_reason, gate, cue, energy, fuel, …)
  gates.jsonl    one row per phase/gate/cue change (includes `reason`)
  result.json    PASS | ABORT + detail
```

Schema id: `guns-only.circuit-oft.v1`

Tick/gate rows also publish `commanded_mach`, `authored_mach`, and `skin_mach_limit`.

## Cards

| Card | What it proves |
|---|---|
| `launch-clear` | Catapult → CIRCUITS climb, aircraft still flying |
| `marshal` | Pattern recovery at shelf, gate 0, reason `pattern_recovery` |
| `lineup` | Advances from marshal toward base/lineup cue |
| `final-2` | Gate ≥ 2 with approach-band speed (or trap) |
| `wire` | Automation from marshal → square 1–4 → wire trap |
| `bolter-rearm` | Final gates seen; re-arm or trap acceptable |

See `docs/superpowers/specs/2026-07-27-rapier-circuits-oft-design.md`.

Intercept ladder OFT lives under `analysis/intercept-oft/` (`guns-only.intercept-oft.v1`).
