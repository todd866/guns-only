# Intercept OFT telemetry (agent-facing)

Written by `sim.Tests/RapierInterceptOftTests`. Same JSONL shape as Circuits OFT so agents can
verify the energy ladder without a human pilot.

## Layout

```text
analysis/intercept-oft/<utc>-<card>/
  hdr.json
  ticks.jsonl
  gates.jsonl
  result.json
```

Schema id: `guns-only.intercept-oft.v1`

## Cards

| Card | What it proves |
|---|---|
| `energy-ladder` | Accelerate + RamClimb + Intercept with >40 km fighting room; gate rows carry `reason` |
