# Glide-drone OFT telemetry (agent-facing)

Written by `sim.Tests/RapierGlideDroneOftTests`. Same JSONL shape as intercept/circuit OFT so
agents can verify release → separate/commit → turbine arm → RTB/pickup without a human pilot.

## Layout

```text
analysis/glide-drone-oft/<utc>-<card>/
  hdr.json
  ticks.jsonl
  gates.jsonl
  result.json
```

Schema id: `guns-only.glide-drone-oft.v1`

## Cards

| Card | What it proves |
|---|---|
| `release-to-pickup` | Attack geometry, F release, drone leaves Separate → Commit, turbine arms (or Mach/alt gate satisfied), RTB closes on pickup or drone still active; gate rows carry `to_drone_phase`, `drones_remaining`, `live_opponents`, `cue` |

See `docs/superpowers/specs/2026-07-27-rapier-glide-drone-vertical-slice-design.md`.
