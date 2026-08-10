# Cobra Depart + golden path — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Skids-on-pad Depart with no nose hostile; legible golden path from cold open.

**Tech stack:** C# sim (`CobraMissionRuntime`, `CobraGroundWarRuntime`), JS presentation (`cobra_ember_path.js`, `cobra-lab/main.js`), xUnit + node:test.

### Task 1: Pad spawn + deferred seam

**Files:**
- Modify: `sim/Cobra/CobraMissionRuntime.cs`
- Modify: `sim.Tests/Cobra/CobraMissionRuntimeTests.cs`
- Test: assert Depart AGL ≈ skid height; no gunnery-seam unit until Ingress

### Task 2: Golden path legibility

**Files:**
- Modify: `web/wwwroot/render/cobra/cobra_ember_path.js` — larger visual half
- Modify: `web/wwwroot/cobra-lab/main.js` — raise gate/active opacity + maxVisualHalfM
- Modify: `web/wwwroot/render/cobra/tests/cobra_ember_path.test.mjs`

### Task 3: Crew-chain harness

**Files:**
- Modify: `web/smoke/cobra-crew-chain.test.mjs` — clear pad before Tab

### Task 4: Stamp + STATUS next candidate

Stamp next build; queue STATUS.
