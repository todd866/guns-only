# Rapier installation vicinity kit — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enrich Rapier dispersed-strip presentation with ambient revetments, spoil, access track, and soft berms (~300 m), replacing orange value blocks.

**Architecture:** Single parent group `STRIP_VICINITY` built inside `createRapierDispersedStrip`; presentation-only; kernel and launch FX untouched.

**Tech Stack:** Three.js procedural meshes in `scene_builders.js`; node:test presentation contracts; Build stamp ritual.

## Global Constraints

- Ambient only — no colliders, targets, or Free Fix scenery seeds.
- ADR-0003 Ghibli-adjacent earth/concrete; no IP; no training-orange blocks.
- Explicit `git add` paths only; worktree `codex/rapier-base-vicinity-20260729`.
- wwwroot changes ship as Build **185**.

---

## File map

| File | Role |
| --- | --- |
| `docs/superpowers/specs/2026-07-29-rapier-base-vicinity-design.md` | Spec |
| `web/wwwroot/render/scene/scene_builders.js` | Replace stub props with `STRIP_VICINITY` kit |
| `web/wwwroot/render/presentation/tests/rapier_presentation.test.mjs` | Assert vicinity group + no orange stubs |
| Stamp files | Build 183 → 184 |

---

### Task 1: Spec + plan on branch

- [x] Write design spec
- [x] Commit plan + spec (explicit paths)

### Task 2: Vicinity mesh in `createRapierDispersedStrip`

- [x] Remove orange cubes / crude shoulder stubs at lines ~1258–1265
- [x] Add `STRIP_VICINITY` with revetments, spoil piles, gravel track, soft berms
- [x] Keep `RAPIER_STRIP_EDGE_LAMPS` (count 36)
- [x] Mark group `userData.ambientRole = "vicinity"`

### Task 3: Tests + Build 184 + merge

- [x] Extend `rapier_presentation.test.mjs` for `STRIP_VICINITY`
- [x] Run presentation + release_identity tests
- [x] Stamp RELEASE_BUILD 185 (four places + index.html `?v=`)
- [ ] Commit, merge to `pivot-hardening`, push for deploy
