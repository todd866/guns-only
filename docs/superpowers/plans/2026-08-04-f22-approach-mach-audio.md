# F-22 Approach + Mach Audio Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make sealed F-22 threshold quiet/dirty and separate M0.6 / M0.9 / M1.2 without changing Rapier, generic-jet, or exterior behavior.

**Architecture:** Export one parameterized dynamic-pressure `01` helper from `engine_audio.js`. Preserve the legacy 45 kPa default; use a physically correct 95 kPa ceiling only for the sealed F-22 cockpit in engine and event audio. Deepen sealed-F-22 bed duck and add F-22-only gear-down air.

**Tech Stack:** Web Audio presentation JS, node:test.

## File map

- `web/wwwroot/render/audio/engine_audio.js` — shared `q` helper, stronger approach duck, Mach-separated rush
- `web/wwwroot/render/audio/event_audio.js` — use shared `q`; gear-down approach air; brake at approach `q`
- `web/wwwroot/render/audio/tests/engine_audio.test.mjs` — threshold / M0.6 / M0.9 / M1.2
- `web/wwwroot/render/audio/tests/event_audio_acoustics.test.mjs` — gear-down air
- `web/wwwroot/render/audio/preview/cue_matrix.js` — threshold / cruise / dash cues

### Task 1: Scoped `q` ceiling + Mach separation tests

- [x] Failing tests: M0.6 rush < M0.9 < M1.2 at fixed density; event proxy matches engine
- [x] Export parameterized `dynamicPressureFraction`; keep 45 kPa default and use 95 kPa for sealed F-22
- [x] Regression-test legacy q response for Rapier/generic/exterior paths
- [x] Green tests

### Task 2: Stronger sealed approach bed character

- [x] Failing test: threshold idle-led, mil ducked vs M0.9 at same lever
- [x] Tighten `f22QPresence` / idle-mil bias / LP
- [x] Green tests

### Task 3: Gear-down approach air

- [x] Failing test: gear down + threshold `q` raises approach air; gear up silent
- [x] Implement continuous F-22-only gear-bay hiss in event voices
- [x] Green tests

### Task 4: Cue matrix envelope

- [x] Add/adjust threshold, cruise M0.6, dash M1.1 cues; keep power isolation where required
- [x] `node --test` engine + event acoustics + preview suites
