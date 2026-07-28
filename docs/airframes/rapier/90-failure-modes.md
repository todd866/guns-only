# 90 — Failure modes (FMECA-lite)

← [80 — Basing and ground](80-basing-and-ground.md) · Next: [95 — Cost ledger](95-cost-ledger.md)

Seed FMECA expanded from OFT / open findings. **Provisional** — detection and mitigation are
directionally right, not certified procedures.

| ID | Failure | Effect | Detection | Mitigation / note | Sev |
| --- | --- | --- | --- | --- | --- |
| P1 | Inlet unstart / spill | Thrust collapse in dash | Mach/q, duct sensors (fiction UI) | Spill band M3.3–3.8 is *commanded*; uncommanded = abort dash | 1 |
| P2 | TBCC handover hole | Stuck on turbine shoulder | Turbine/ram thrust + fuel shares | Hold altitude; do not rush Mach at FL315 | 1 |
| P3 | Skin overtemp dive | Structure eat / abort | Lagged skin HUD vs 1473 K | Pull up / shed Mach; CMC is not infinite | 1 |
| P4 | Bank-hold loss | Occupant cannot hand-fly thesis | FBW health | Automate recovery / punch out | 1 |
| P5 | Drone bay hang | Asymmetric mass / drag | Bay status | Inhibit further release; land heavy | 2 |
| P6 | Hook miss / bolter | Reserve fuel burn | Wire gates | Bingo logic; Circuits trains the trap | 2 |
| P7 | RCS empty on lob | No attitude at collapsed q | Gas remaining | Limit lob duration; don't exo-coast dry | 2 |
| P8 | Lever-only fuel lie | Pilot trusts false ram economy | Per-stream kernel fuel | **Closed** Build 163 — re-check OFT burn | — |
| P9 | Optimistic mass (no drones) | Climb/dash too easy | Mass vs bay count | **Closed** — design bay in MassKg; shed on release | — |
| P10 | Wet T/W overbuff | Unrealistic accel | Identity ≤1.20 at design gross | **Closed** — 84 kN / 11090 kg card | — |

## Epistemic

Provisional seed. Absence of a row ≠ ruled out. Expand when OFT cards name new failure signatures.
