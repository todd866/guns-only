# AH-1G limited SCAS yaw Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace perfect steady-torque autotrim with limited-authority SCAS yaw so hard collective needs pedal.

**Architecture:** In `Ah1gCobraDynamics.AdvanceBodyRates`, compute torque yaw demand from rotor power; apply SCAS as lagged, authority-capped pedal assist; leave residual for the pilot.

**Tech Stack:** `sim/Vehicles/Rotorcraft/Ah1gCobraDynamics.cs`, definition constants, `Ah1gCobraDynamicsTests.cs`, airframe sources note, Build 304 stamp.

## Global Constraints

- Never `git add -A`; stage explicit paths.
- Advisory claims via `bin/claim`.
- Land epistemics with the gain number.

---

### Task 1: Failing acceptance test

- [x] Add test: feet-off step collective from hover produces measurable yaw (heading change) over N seconds
- [x] Add test: SCAS authority saturates — residual remains when torque demand exceeds 12.5%
- [x] Commit

### Task 2: Implement limited SCAS yaw

- [x] Remove perfect steady torque cancel
- [x] Torque yaw demand + lagged SCAS cap at `StabilityAugmentationAuthorityFraction`
- [x] Document provisional gain in `00-sources.md` / flight-model note
- [x] Make tests pass
- [x] Commit

### Task 3: Stamp + ship

- [ ] Stamp 304, STATUS, PR, deploy after Verify
