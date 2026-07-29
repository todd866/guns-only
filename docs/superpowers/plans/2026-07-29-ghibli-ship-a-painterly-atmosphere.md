# Ship A — Painterly atmosphere Implementation Plan

> **For agentic workers:** Execute task-by-task. Stage **explicit paths only**. Worktree
> `codex/ghibli-atmosphere-a-20260729`.

**Goal:** Ukraine soft-world sky/haze/light pass (Ship A of Ghibli programme).

**Architecture:** Extend `createDecisionSupportSky` + soft-world constants; warm FlightView lights when Ukraine; keep Korea path cold-blue.

**Tech Stack:** Three.js shaders, `soft_world_atmosphere.js`, node:test wiring contracts.

## Global Constraints

- ADR-0003 adjacent; no IP; instruments cold
- Ukraine theatre only (`uSoftWorld` / fogLow warm path)
- Build stamp +1 on wwwroot ship

---

### Task 1: Specs committed
### Task 2: Sky soft sun + richer warm gradient
### Task 3: Soft-world haze/bury + Ukraine fill lights
### Task 4: Tests + stamp + merge/push
