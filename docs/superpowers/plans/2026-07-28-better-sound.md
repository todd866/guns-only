# Better sound — Phase 0–1 feel gate

> **For agentic workers:** Execute this plan task-by-task. Steps use checkbox syntax.

**Goal:** Mute works; Rapier/player jet reads as layered turbine→ram + density/coast; gun reports and buffet on one bus.

**Architecture:** Procedural Web Audio only. New `flight_audio.js` façade owns shared `AudioContext` + master + DynamicsCompressor. `engine_audio.js` deepens jet layers (fan whine, exhaust roar, density/coast). HUD gun/GCAS stop owning a second context.

**Tech Stack:** Vanilla ES modules, Web Audio API, `node --test` fake-WebAudio harness.

## Global Constraints

- Fail-silent; seeded noise; no sample packs
- `muted: !playerSettings.audio` must silence everything
- Bump `RELEASE_BUILD` 156→157 + `index.html` `app.js?v=`
- Do not bend FDM; presentation only

---

### Task 1: Deepen engine synthesis + density/coast

**Files:** `engine_audio.js`, `engine_audio.test.mjs`

- Add fan-whine tonal layer + jet-exhaust lowpass roar (research: fan BPF tones + core/jet broadband)
- Scale engine layers by air density; near-silence when thin air + low thrust / high RCS
- Keep fail-silent + seeded pink; update gain-index tests

### Task 2: Flight façade + events + mute

**Files:** `flight_audio.js`, `event_audio.js`, `warning_audio.js`, tests, `app.js`, `hud.js`

- Shared bus/compressor; `updateFlightAudio(state, { muted, triggerHeld })`
- Gun cyclic reports while firing; buffet rumble from `buffet`
- GCAS on shared bus; HUD audio methods delegate / no second context
- Wire mute from `playerSettings.audio`

### Task 3: Spec citations + release + commit

- Update sound-design spec with research approach chosen
- Bump release stamps; run audio tests; commit feel-gate slice
