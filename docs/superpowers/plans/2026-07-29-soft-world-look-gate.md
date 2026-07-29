# Soft-world look gate — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Ship `tools/look-gate/` that compares Ukraine terrain-look stills to fiction-tagged soft-world art-refs via palette + ground-band structure energy, with degrade provenance.

**Architecture:** Pure Node feature extract (PNG → RGBA → Lab/edge stats); corpus from `analysis/art-refs/soft-world/index.json`; CLI `compare.mjs` + `thresholds.json`; warn-first mode; mark `degradedCapture` when governor/tier says so.

**Tech Stack:** Node ESM, `pngjs` (local to tools/look-gate), node:test.

**Spec:** [2026-07-29-soft-world-look-gate-design.md](../specs/2026-07-29-soft-world-look-gate-design.md)

## File map

| File | Role |
| --- | --- |
| `tools/look-gate/package.json` | pngjs dep |
| `tools/look-gate/features.mjs` | extractFeatures(pngPath) |
| `tools/look-gate/corpus.mjs` | load soft-world index + ref features |
| `tools/look-gate/compare.mjs` | CLI |
| `tools/look-gate/thresholds.json` | distances + mode |
| `tools/look-gate/tests/*.test.mjs` | unit + synthetic fail |
| `tools/terrain-look/shot.mjs` | provenance fields in views.json |

### Task 1: Feature extract + tests — done
### Task 2: Corpus + compare CLI + thresholds — done
### Task 3: Provenance in terrain-look; run gate on existing shots — done
### Task 4: Docs pointer in art-refs README — done
