# Cobra play F-22 feel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/cobra-lab/` play mode match the F-22 front door: HUD-only functional chrome, clear Camp Ember pad eye, flight audio on.

**Architecture:** Keep production `hud.js` + `cobraHudState`. Strip decorative DOM and rotorcraft glass panels in play. Clear pad foliage via world + asset-kit exclusion. Wire shared `flight_audio` like `app.js`. Soft-gate draw skips pad-centered gate 0 while grounded on pad.

**Tech Stack:** Existing web/cobra-lab, `hud.js`, `flight_audio.js`, cobra canyon world JSON + asset kit, node test suite.

## Global Constraints

- Never `git add -A`; stage explicit paths.
- Advisory claims via `bin/claim` before editing held files.
- Production stamp/deploy only with human confirmation.
- Prefer add/new tests over repointing shared fixtures.

---

## File map

| File | Responsibility |
| --- | --- |
| `docs/superpowers/specs/2026-08-10-cobra-play-f22-feel-design.md` | Spec |
| `web/wwwroot/cobra-lab/styles.css` | Hide play chrome / objective / legend |
| `web/wwwroot/cobra-lab/index.html` | Cache-bust / shell notes if needed |
| `web/wwwroot/cobra-lab/main.js` | Audio wire, drop rotorcraft panels in play, insets, gate skip |
| `web/wwwroot/render/cobra/cobra_ember_path.js` | Optional pad-gate filter helper |
| `web/wwwroot/render/cobra/cobra_canyon_asset_kit.js` | Camp Ember exclusion radius |
| `content/.../cobra-canyon.world.json` + web mirror | Drop understory from pad set-piece |
| `web/wwwroot/render/cobra/tests/*` | Contracts |
| `web/wwwroot/api/build-info.js` + stamps | Build 302 when shipping |

---

### Task 1: Hide decorative play chrome

- [ ] Add CSS so `body[data-shell="play"]` hides `#play-chrome`, `#objective-hud`, `.legend`
- [ ] Keep `?lab=1` lab panel unchanged
- [ ] Test: CSS/source contract that play shell does not show those selectors as visible defaults
- [ ] Commit

### Task 2: Literal F-22 HUD combiner in play

- [ ] Set `HUD_SAFE_INSETS` top to `0`
- [ ] In play mode, call only `hud.draw(...)` — skip `drawCobraRotorcraftHud` (lab may keep it)
- [ ] Update wiring tests that required rotorcraft draw on play path
- [ ] Commit

### Task 3: Flight audio on

- [ ] Import `updateFlightAudio` / `armFlightAudio` / `setFlightAudioEnabled` as main does
- [ ] Enable audio; arm on pointerdown/keydown; update each frame; honor `?audioQa=silent`
- [ ] Remove the Build 264 “audio stays off” comment/behavior
- [ ] Smoke/source contract that main.js arms and updates flight audio
- [ ] Commit

### Task 4: Clear Camp Ember pad eye

- [ ] Remove `jungle-understory` from camp-ember set-piece archetypeIds (both world JSON copies)
- [ ] Asset kit: skip jungle/mist placements within 120 m of Camp Ember landmark centre
- [ ] Retarget asset-kit count tests if authored refs drop
- [ ] Soft path: filter gate at pad while ownship inside depart radius (or skip drawing gate index 0 until airborne/clear)
- [ ] Commit

### Task 5: Stamp + verify

- [ ] Stamp Build 302, STATUS next-candidate note
- [ ] Whose-red / focused tests green
- [ ] PR → merge → deploy only after owner confirmation if not already ordered
