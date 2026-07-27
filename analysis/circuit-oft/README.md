# Circuit OFT telemetry (agent-facing)

Written by `sim.Tests/RapierCircuitOftTests` when the OFT cards run. **Not a player surface** —
agents use these artifacts to verify Circuits without asking a human to fly.

## Layout

```text
analysis/circuit-oft/<utc>-<card>/
  hdr.json       schema, card, beat, start time
  ticks.jsonl    ~10 Hz state samples (phase, gate, cue, energy, fuel, …)
  gates.jsonl    one row per phase/gate/cue change
  result.json    PASS | ABORT + detail
```

Schema id: `guns-only.circuit-oft.v1`

## Cards

| Card | What it proves |
|---|---|
| `launch-clear` | Catapult → CIRCUITS climb, aircraft still flying |
| `wire` | Automation from marshal → square 1–4 → wire trap |

See `docs/superpowers/specs/2026-07-27-rapier-circuits-oft-design.md`.
