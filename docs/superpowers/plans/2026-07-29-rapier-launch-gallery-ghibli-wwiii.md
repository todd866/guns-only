# Rapier launch gallery Ghibli WWIII — Implementation Plan

> **For agentic workers:** Execute task-by-task. Stage **explicit paths only**. Prefer worktree
> `codex/rapier-launch-gallery-20260729` if `pivot-hardening` is hot.

**Goal:** Rebuild buried launch gallery presentation + catshot-gated FX for the Rapier intro.
**Spec:** `docs/superpowers/specs/2026-07-29-rapier-launch-gallery-ghibli-wwiii-design.md`

## File map

| File | Role |
| --- | --- |
| `web/wwwroot/render/scene/scene_builders.js` | Rebuild `LAUNCH_GALLERY` / berm / portal; expose `userData.launchFx` |
| `web/wwwroot/render/effects/rapier_launch_fx.js` | Vent dust, portal sheet, rail shimmer, lamp urgency |
| `web/wwwroot/app.js` | Call `launchFx.update` while `catapult_active` |
| `web/wwwroot/render/presentation/tests/rapier_presentation.test.mjs` | Gallery/portal names + contracts |
| `web/wwwroot/render/effects/tests/rapier_launch_fx.test.mjs` | FX gates on/off with catapult |
| Stamp files | Build +1 |

### Task 1: Spec + plan committed
### Task 2: Structure rebuild in `createRapierDispersedStrip`
### Task 3: FX module + app wiring
### Task 4: Tests + stamp + merge/push
