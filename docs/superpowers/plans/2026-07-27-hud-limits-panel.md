# HUD Limits Panel Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace fuel-corner chrome with an always-on four-slot Limits Panel (`nav` / `fuel`), collapse Rapier centre propulsion/essay cues to a quiet mode line, and fix nav-console overflow — per `docs/superpowers/specs/2026-07-27-hud-limits-panel-design.md`.

**Architecture:** Pure `limitsPanelPresentation(state)` drives canvas rendering. Rapier guidance shrinks to one quiet line; engine bars leave the HUD. Nav console stays diagnostic.

**Tech Stack:** Existing browser JS HUD (`hud.js`), node:test for presentation units, `./bin/check` gate.

## Global Constraints

- Reserve destination is always the strip/home, never the contact.
- Closure (ground track onto home bearing), not TAS, drives ETA / fuel required.
- Exactly four Limits slots; thermal only accents / quiet-line override.
- No kernel change required for first ship.
- `patient` profile is an empty typed socket — do not invent vitals.
- Keep HUD geometry contract and `./bin/check` green.
- Do not claim per-stream fuel as kernel truth.

## File map

| File | Responsibility |
|---|---|
| `web/wwwroot/render/hud/limits_panel.js` | `limitsPanelPresentation` contract |
| `web/wwwroot/render/hud/tests/limits_panel.test.mjs` | Unit tests |
| `web/wwwroot/hud.js` | Draw Limits; quiet Rapier cue; no GATE essay |
| `web/wwwroot/render/mission/rapier_guidance.js` | Quiet mode line; strip `detail` triad essay |
| `web/wwwroot/render/mission/tests/rapier_guidance.test.mjs` | Update expectations |
| `web/wwwroot/app.js` | Nav console single-unit GS; Circuits destination; mutual exclusion |
| `web/wwwroot/index.html` | Remove nav `tf-note` footer |

---

### Task 1: `limitsPanelPresentation`

**Files:**
- Create: `web/wwwroot/render/hud/limits_panel.js`
- Test: `web/wwwroot/render/hud/tests/limits_panel.test.mjs`

**Produces:**
```js
limitsPanelPresentation(state) → null | {
  profile: "nav" | "fuel",
  rows: [{ label, value, unit }], // length 4
  accent: "normal" | "caution" | "fault",
  heroIndex: 3,
  fuelRatio?: number,      // 0..1 for thin bar
  bingoRatio?: number,
}
```

- [x] **Step 1: Write failing tests** for dogfight→`fuel`, Rapier with `rtb_*`→`nav`, reserve sign/accent, closure vs TAS on climb, slowdown improves lb/nm.
- [x] **Step 2: Implement `limits_panel.js`**
- [x] **Step 3: `node --test web/wwwroot/render/hud/tests/limits_panel.test.mjs`** — PASS

### Task 2: Draw Limits in HUD

**Files:** Modify `web/wwwroot/hud.js` (`drawFuel` → `drawLimitsPanel`)

- [x] Import presentation; render four rows + thin fuel bar; accent colours match existing GREEN/AMBER/RED.
- [x] Smoke: existing HUD harness still runs (`node web/wwwroot/render/hud/tests/harness/assertions.mjs` if touched).

### Task 3: Quiet Rapier guidance

**Files:**
- Modify `rapier_guidance.js`, its tests, `hud.js` `drawRapierGuidance`

- [x] Guidance `text` = quiet mode line only; `detail` empty (or bearing-only without triad essay).
- [x] HUD: do not draw `rapierEnginePresentation` bars; remove `GATE N/4 · FLY THROUGH` caption (gate index in quiet line when Circuits).
- [x] Thermal OVER: quiet line may become `SKIN OVER`; Limits accent fault.
- [x] Update `rapier_guidance.test.mjs` expectations.

### Task 4: Nav console hygiene + mutual exclusion

**Files:** `app.js` `updateNavConsole`, `index.html` nav footer, Systems/Nav open handlers

- [x] Groundspeed: KT only (no `\n` KM/H).
- [x] Remove `tf-note` footer from `#nav-console`.
- [x] Circuits/outbound: destination not HOME while flying gates (phase &lt; Escape/RTB).
- [x] Opening Nav closes Systems and vice versa.

### Task 5: Verify

- [x] `node --test web/wwwroot/render/hud/tests/limits_panel.test.mjs web/wwwroot/render/mission/tests/rapier_guidance.test.mjs`
- [x] HUD harness (`assertions.mjs`) — 1095 assertions green incl. P0 Rapier scenarios
- [ ] `./bin/check` (or scoped subset if time-boxed, then full gate before stamp)

---

## Spec coverage

| Spec item | Task |
|---|---|
| Limits always-on four slots nav/fuel | 1–2 |
| Reserve to strip via closure | 1 |
| Quiet mode line; kill propulsion banner | 3 |
| Kill GATE essay caption | 3 |
| Nav footer / dual-unit / Circuits destination | 4 |
| Mutual exclusion | 4 |
| patient socket / non-goals | deferred (no code) |
| Acceptance / check green | 5 |
