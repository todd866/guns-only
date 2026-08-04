# Continuous approach guidance — path + energy

Status: implementing
Date: 2026-08-04
Scope: Recovery intent → always-flyable path → world gates + next-gate energy cue.
Surfaces: strip Home Plate, carrier threshold, any known recovery point.

## Problem

The recovery ladder existed as invisible spheres, then as soft volumes that only appeared after a
Mesh ND PROC click. RTB could announce "RETURN TO BASE" with nowhere drawn. Five of seven
`golden_path_*` fields were dead payload; the surviving power bug was one-sided. Korea has route
HUD carets but no world path that teaches energy.

## Decisions

1. **Unified `ApproachSolver` + `RecoverySite`.** Not an extension of `SortieSchedule`. Schedule
   answers power/height for the current leg; the solver answers geometry and energy gates.
2. **Every recovery surface** shares one teaching model. Site adapter supplies threshold, surface
   elevation, and landing heading.
3. **Arm on recovery intent only** — not during free attack / outbound transit.
4. **Presentation = world path + next-gate altitude/speed.** Reuse two-sided `SortieSchedule`
   power when valid; otherwise publish `approach_power_01`.
5. **PROC ladders demoted.** Optional legacy; solver owns live gates when intent is active.
6. **Groove (this pass):** path to stabilisation; inside groove distance, a short glideslope
   ladder to the ramp. Full LSO `GroovePath` / wave-off product stays out of scope.
7. **Airframe refs:** stabilise speed from `SortieSchedule.ApproachSpeedMps`; stabilise height
   relative to the landing surface (never absolute 152 m MSL). `DragToWeight` defaults to 0.12.

## Intent gate

`ApproachGuidanceActive` when a recovery site is known and any of:

- `PlayerRtbActive`
- fuel bingo / minimum / emergency
- carrier route phase ∈ `{Return, Recovery, Groove}`
- Rapier circuits mission while lifecycle is Active
- non-`None` recovery procedure selected (legacy)

## Kernel modules

| Module | Job |
|---|---|
| `ApproachEnergy` | Specific energy height; track miles from excess |
| `ApproachPath` | `None` / `ExtendDownwind` / `Orbit360` |
| `ApproachSolver` | Solution + along-path gates (alt/speed/dirty) |
| `RecoverySite` | Threshold / elevation / heading from carrier or home |
| Session publisher | Intent → solve → materialize world gate positions |

Never refuse: excess energy lengthens the path. Re-solve every tick; no latch.

## Snapshot

- `approach_guidance_active`, `approach_valid`
- `approach_excess_energy_m`, `approach_track_required_m`, `approach_track_available_m`, `approach_extension`
- `approach_next_alt_m`, `approach_next_tas_mps`, `approach_next_label`, `approach_alt_error_m`, `approach_tas_error_mps`
- `approach_power_01`
- `approach_gates_json` — recovery-gate shape plus `target_alt_m`

## Presentation

- `guidance_path.js` prefers `approach_gates_json` when guidance is active; else `recovery_gates_json`.
- HUD next-gate strip: label, target alt/speed, signed high/low and fast/slow.
- No second power lever when `sortie_power_01` is drawn.

## Out of scope

VSD / approach-mode ND rewrite; fuel-on-arrival UI; full GroovePath LSO; fitted DragToWeight;
deleting PROC UI.
