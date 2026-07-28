# Ukraine Geodetic Theatre Implementation Plan

> **For agentic workers:** Execute task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Ship a real Copernicus DEM Ukraine atlas so high-altitude scenery is realistic anywhere inside Rapier range, with accurate coast (water mask) and a path to full D2 coast/border vectors.

**Architecture:** Generalize Korea TM projection (parameterised central meridian); lock/fetch Ukraine GLO-30 cells; build range-streamed atlas (Korea atlas sibling); point ukraine-modern / environment-lab at the atlas. Fact/fiction: real ground, fictional strip at eastern reference origin.

**Tech Stack:** Python (numpy/scipy/Pillow), Copernicus AWS Open Data, existing `korea_terrain.js` atlas loader.

## Global Constraints

- Real WGS84 DEM; fictional strip/units only.
- Korea rebuild must stay bit-identical (default meridian = zone 52).
- Streamed pages; no full-country RAM load.
- First shippable region = **jet-range AOI** (~393–700 km class); canonical D2 envelope declared in lock for expansion.
- Soft-world scenery (Stage C) binds after cutover.

---

### Task 1: Parameterised TM projection

**Files:** `tools/terrain/build_korea_terrain.py`, `tools/terrain/build_korea_atlas.py`, add `tools/terrain/tests/test_tm_projection.py`

- [x] `wgs84_to_utm` / `utm_to_wgs84` take optional `central_meridian_deg` (default 129° = zone 52)
- [x] Atlas `projected_region` / sampling / `build_atlas` CRS gate use region `centralMeridianDeg` or derive from `workingCrs`
- [x] Korea dry-plan / unit test: default path unchanged vs golden sample

### Task 2: Ukraine source lock + lock script

**Files:** `content/sources/ukraine-terrain-source-lock.json` (skeleton → locked), `tools/terrain/lock_ukraine_atlas_sources.py`

- [x] Canonical D2 envelope + runtime region `rapier-range` AOI 33.0–38.4°E, 46.6–50.2°N (jet-range first), reference origin eastern (~38.0°E, 48.5°N), `centralMeridianDeg: 35.7`
- [x] Lock script mirrors Korea (fetch DEM+WBM, sha256, absent=ocean)
- [x] Run lock into cache; write completed lock JSON

### Task 3: Build Ukraine atlas

**Files:** output under `content/packs/ukraine-modern/environment/terrain-atlas/` (+ web stage)

- [x] `build_korea_atlas.py --lock ukraine... --region rapier-range --dry-plan` then full build
- [x] Verify with `verify_korea_atlas.py` (or Ukraine alias)
- [x] Preview PNG / manifest documents fiction disclaimer + Copernicus notices

### Task 4: Runtime cutover (see it)

**Files:** `web/wwwroot/environment-lab/main.js`, pack README, optional app terrain URL for Rapier

- [x] Lab default Ukraine site loads atlas root manifest
- [x] Scenery era `ukraine-modern`; strip local origin = atlas reference origin
- [x] Docs: replace “262 km synthetic” claim with geodetic jet-range + D2 roadmap

### Task 5: Coast/border vectors (D2 silhouette)

- [ ] Natural Earth coastline + admin-0 bake into macro mask or line layer
- [ ] Expand acquisition cells toward full D2 envelope when budgets allow

---

**Spec coverage:** D0→Task1–2; D1–D3→Task3–4; D2 coast/border→Task5; Stage C→later D5.
