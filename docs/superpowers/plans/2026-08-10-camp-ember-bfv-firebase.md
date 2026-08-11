# Camp Ember BF:V firebase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Camp Ember placeholder site/landmark visuals with a BF:V-density procedural firebase.

**Architecture:** Extend `cobra_canyon_presentation.js` landmark FOB composer with multi-material prop parts; suppress Camp Ember site marker in `cobra_ground_war.js`. Keep clear-eye and play HUD rules from Build 302.

**Tech Stack:** Existing Three.js canyon presentation + ground-war presentation, node tests, stamp 303.

## Global Constraints

- Never `git add -A`; stage explicit paths.
- Advisory claims via `bin/claim`.
- Prefer new composer helpers over editing contended shared fixtures.

---

### Task 1: Suppress Camp Ember ground-war site disc

- [ ] In `cobra_ground_war.js`, skip `ensureSite` mesh for Camp Ember / FOB site id (or hide when `is_fob` / matching centre)
- [ ] Test: source/contract that FOB site does not get `GROUND_SITE` cylinder
- [ ] Commit

### Task 2: BF:V firebase landmark composer

- [ ] Replace `forward-operating-base` AABB list in `landmarkPlacements` / mesh build with multi-part composer (pads, berms, tents, tower, mast, fuel, crates)
- [ ] Distinct materials/colours per part family (PSP, sandbag, olive tent, steel mast)
- [ ] Tests for part count / colour families / no control-green
- [ ] Commit

### Task 3: Stamp + ship

- [ ] Stamp Build 303, STATUS next-candidate, PR, deploy after Verify

### 2026-08-11 regression repair

- [x] Move the render-only conservative terrain bias ahead of the shared Camp apron operation.
- [x] Sample actual rendered triangle planes across mobile, balanced, and desktop tiers.
- [x] Add and enforce an authored spawn/eye/skid/departure safety volume.
- [x] Replace monolithic berm/tent/fuel boxes with one-draw procedural PSP ribs, short
  revetments, pitched shelters, drums, separated crates, a legged tower, and an offset mast.
- [x] Make every vertical part coordinate explicit centre-height semantics.
- [x] Keep the presentation inside existing draw, instance, and triangle budgets.
- [ ] Owner cold-open and departure visual acceptance in the real browser page.
