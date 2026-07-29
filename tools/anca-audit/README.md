# ANCA + R/T situation audit

Drive real `SimulationSession` beats with scripted pilot actions and dump what the
ANCA panel would show, plus every R/T call that fired between samples.

## Quick look

```sh
./bin/anca-audit --list
./bin/anca-audit --scenario rapier-launch | node tools/anca-audit/format.mjs
./bin/anca-audit -s rapier-radio-gear-up -o /tmp/anca.jsonl
node tools/anca-audit/format.mjs /tmp/anca.jsonl
```

Omit `--scenario` to run the full matrix (dogfight + Rapier launch/commit/circuits/guns).

```sh
./bin/anca-audit --self-test          # structural smoke used by bin/check
node --test tools/anca-audit/*.test.mjs
```

## JSONL record shape

Each sample line:

| field | meaning |
| --- | --- |
| `scenario` / `sample` / `t` | situation id, sample label, sim seconds |
| `state` | ANCA wire subset (`gear_*`, `fuel_*`, `radio_*`, `checklist_*`, …) |
| `radio_since_last_sample` | every new `MissionRadio` transmission since the previous sample |

`format.mjs` runs the real `deriveAncaView` from `web/wwwroot/render/anca/`.

## Scenarios

| id | beat | what it probes |
| --- | --- | --- |
| `dogfight-merge` | 7 | merge SA, knock-it-off |
| `dogfight-guns-hold` | 7 | weapons hold release + trigger |
| `rapier-launch` | 10 | LAUNCH checklist progression |
| `rapier-radio-gear-up` | 10 | waits for `pilot-checklist-gear-up` |
| `rapier-commit` | 10 | waits for COMMIT checklist |
| `rapier-circuits` | 11 | pattern / tower R/T |
| `rapier-guns` | 10 | waits for ATTACK, hold + trigger |

Add a scenario in `Scenarios.cs` (`Wait` / `Sample` / `WaitUntilRadio` / key pulses).
