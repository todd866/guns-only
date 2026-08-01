# World engine: theatre-neutral naming, and no theatre as the default

**Goal:** the scenery engine reads as global infrastructure (`world_*` / `WorldTerrain`), and
nothing at runtime falls back to a *theatre* pack. Ukraine is the primary theatre; **Korea 1950s
stays and will be playable, as narrative flashback content.** Neither should be the silent
default, and the engine should not be named after either.

**Decided:** `world_*` naming; scope = engine rename **plus** de-default. Korea content is
preserved and promoted to a peer theatre, not retired.

**Target architecture:** one shared `baseline` pack holding theatre-agnostic assets, with
`ukraine-modern` and `korea-1950s` as peer theatres that both reference it. Today there is no
baseline and Korea *is* the baseline, which is the whole problem.

**Verified scope (main tree, excluding the five stale `.worktrees/` copies):** 28 files named
`korea*`, 20 Korea directories, 198 files carrying ~1,000 referencing lines, and **76 distinct
Korea identifiers across 535 occurrences**. Only a minority of those get renamed — see Task 1.

---

## The finding that shapes this plan

`korea-1950s` is **the only real pack in the repository.** It is the sole directory under
`content/packs/` with a `pack.json`, and it also owns `visual-profile.json`,
`asset-manifest.json`, `licenses.json`, and three textures that are not Korea-specific at all
(`cloud-shape.png`, `foam-noise.png`, `ocean-normal.png`).

`content/packs/ukraine-modern/` has **no `pack.json`, no visual profile, no asset manifest**.
It is raw content riding the Korea pack's contract. Consequences, all verified:

- `content/packs/ukraine-modern/environment/atmosphere.material.json:7` loads
  `"../../korea-1950s/environment/textures/cloud-shape.png"` — the Ukraine theatre's clouds
  ship out of the Korea pack today.
- `web/wwwroot/render/visual/profile.js:1` points `DEFAULT_PROFILE_URL` at the Korea pack.
- `web/wwwroot/app.js:6528` ends `|| "korea-1950s"`.
- `web/SnapshotProjection.cs:31` sets `KoreaPackId = "korea-1950s"` and line 1243 makes it the
  `else` branch of pack selection.

**So this is not a find-and-replace; it requires standing up the first neutral pack.** That is
Task 2, and it is the only task carrying real risk. It also pays for itself twice: a peer-pack
layout is exactly what a second playable theatre needs, so this work is a prerequisite for the
Korea flashbacks rather than a detour around them.

One piece of luck, verified: `app.js:227` has `PRODUCTION_PACK_ENVIRONMENT_ENABLED = false`, and
the sole use of `isKoreaPack` is `PRODUCTION_PACK_ENVIRONMENT_ENABLED && isKoreaPack`
(app.js:6769). That branch is dead in production today, so rewiring it changes no shipped
behavior. **Note what that flag implies:** the pack-environment path — the one that would let a
theatre supply its own sky and ocean — is mothballed. Reviving Korea eventually means reviving
that flag, so `korea_environment.js` is dormant infrastructure for a planned feature, not dead
code. Do not delete it.

## Ordering constraint (do not skip)

The rename touches `app.js`, `scene_builders.js`, `environment-lab/main.js`, `visual_runtime.js`
and `profile.js`. A concurrent agent was actively rewriting several of those. **Start only
against a tree with no other writer and no uncommitted third-party work**, and land Build 198
(the terrain Range diagnostics) first so the rename diff stays readable.

---

## Task 1: mechanical engine rename (no behavior change)

`git mv` (keeps history):

| from | to |
|---|---|
| `web/wwwroot/render/environment/korea_terrain.js` | `world_terrain.js` |
| `web/wwwroot/render/environment/korea_scenery.js` | `world_scenery.js` |
| `web/wwwroot/render/environment/korea_scenery_planner.js` | `world_scenery_planner.js` |
| `web/wwwroot/render/effects/korea_gun_effects.js` | `gun_effects.js` |
| `web/wwwroot/render/visual/korea_pack_adapters.js` | `pack_adapters.js` |
| `web/KoreaTerrainTruth.cs` | `WorldTerrainTruth.cs` |
| + the five matching `tests/…test.mjs` files | same stems |

Identifier renames (counts are occurrences):

- `planKoreaScenery` → `planWorldScenery` (30)
- `createKoreaSceneryRuntime` → `createWorldSceneryRuntime` (26)
- `KOREA_SCENERY_PROFILES` → `WORLD_SCENERY_PROFILES` (25)
- `loadKoreaTerrain` → `loadWorldTerrain` (21)
- `applyKoreaSceneryBudgetLevel` → `applyWorldSceneryBudgetLevel` (10)
- `KoreaGunEffects*` → `GunEffects*` (8), `loadKoreaGunEffects` → `loadGunEffects` (5)
- `createKoreaEffectsFactory` → `createEffectsFactory` (6)
- `KOREA_TREE_STAND_SIZE` → `WORLD_TREE_STAND_SIZE` (6)
- `KoreaTerrainPresentation` → `WorldTerrainPresentation` (4)
- `KoreaTerrainAtlasPresentation` → `WorldTerrainAtlasPresentation` (2)
- `KoreaTerrainTruth` / `EmbedKoreaTerrainTruth` → `WorldTerrainTruth` / `EmbedWorldTerrainTruth`
- `disposeKoreaSceneryTile`, `koreaSceneryBudgetLevel`, `koreaSceneryBudgetBase`,
  `PRODUCTION_KOREA_TERRAIN_ENABLED`, `DEVELOPMENT_KOREA_ATLAS_MANIFEST_URL`,
  `KOREA_GUN_EFFECTS_ROOT`, `KOREA_TERRAIN_PAGE_*` → `world`/neutral equivalents

Test fixture ids (`"terrain.korea.atlas-stream-test.v1"` and similar) rename with them.

**Deliberately NOT renamed — these are Korea theatre content, and Korea is coming back:**

- `korea_environment.js` + test, `createKoreaEnvironmentFactory`, `loadKoreaEnvironment`,
  `createKoreaEnvironment`, `MAT_SKY_KOREA`, `MAT_OCEAN_KOREA` — a Korea sky and ocean. Correctly
  named; dormant behind the mothballed pack-environment flag.
- `KoreaWeatherPresets.cs` (41 occurrences) + `KoreaWeatherPresetsTests.cs` — Korea weather data.
- `content/packs/korea-1950s/`, `content/governance/korea-braided/`,
  `content/sources/korea-terrain-*-source-lock.json` — the theatre itself and its provenance.
- `STRAIGHT_DECK_CARRIER_KOREA_1950S`, `KOREAN_ERA_GUN_DESTROYER_ESCORT`,
  `PROVISIONAL_KOREA_JET_V1`, `KoreaFastJetReference` — real 1950s hardware. Renaming these makes
  them *less* accurate.
- `AutoGcasKoreaTerrainTriggerTests.cs` — GCAS coverage over the Korea heightfield; still valid.
- Prose in `docs/world-backstory-research.md`, `docs/korea-environment-data-sources.md`, archived
  specs. Historical research is not branding; scrubbing it costs the pipeline's provenance.

Renaming any of the above would disguise a real second theatre as global infrastructure — the
opposite of the point.

Verify: full gate. No behavior change means every existing assertion must pass untouched.

## Task 2: stand up the shared baseline pack, then de-default (behavior-affecting)

1. Create `content/packs/baseline/` with `pack.json`, `visual-profile.json`,
   `asset-manifest.json`, `licenses.json`, and `environment/textures/` holding the three
   theatre-agnostic textures moved out of `korea-1950s`. Mirror into
   `web/wwwroot/content/packs/baseline/`. **These packs are hash-validated**
   (`asset-source closure bytes include every unique source`, `canonical starter content passes
   strict validation`), so regenerate through `tools/assets/build-assets.mjs` rather than
   hand-writing sha256 fields.
2. Repoint **both** theatres at the baseline textures: Ukraine's
   `environment/atmosphere.material.json:7`, and Korea's own references, in both the `content/`
   and `web/wwwroot/content/` copies. Neither theatre should reach into the other.
3. `web/wwwroot/render/visual/profile.js:1` → baseline `visual-profile.json`.
4. `web/wwwroot/app.js:6528` → baseline pack id. Rewrite the `isKoreaPack` branch at 6769 as a
   capability check (does the pack declare its own environment?) rather than an id equality test,
   so the Korea flashback theatre can light it up later without another special case.
5. `web/SnapshotProjection.cs:31-38, 1243-1257` → baseline pack id/version/uri and profile ids,
   with Korea becoming one selectable branch instead of the fallthrough. Leave
   `korea-2030s-prototype` / `korea-2030s-public-surrogate` alone — separate ids, not the default.
6. `korea-1950s` keeps its `pack.json` and stays a fully valid pack, so the asset-pipeline tests
   (`tools/assets/test/assets.test.mjs`, `asset_registry`, `profile`, `visual_runtime`,
   `remote_asset_policy`, `g_tolerance_bridge_contract`) keep working. Where a test asserts
   "canonical" behavior, repoint it at `baseline` and keep a Korea case as the peer-theatre test.

Verify: full gate, **plus** a terrain-look capture and a HUD scenario screenshot — this task
changes which textures and visual profile production loads, and structural green has repeatedly
proven worthless for pixels here.

## Task 3 (separate change, later)

Promote `korea-1950s` from de-facto default to a real selectable theatre: a theatre registry the
mission/beat layer can choose from, `PRODUCTION_PACK_ENVIRONMENT_ENABLED` revived so a theatre
can supply its own sky/ocean, and the flashback framing wired into the narrative layer. Rename
`tools/terrain/*korea*.py` → neutral names at that point, since they build the *Ukraine* atlas
today and will need to build both.

## Housekeeping worth doing at the same time

Five stale worktrees (`ghibli-atmosphere-a`, `mesh-nd-redesign`, `rapier-base-vicinity`,
`rapier-flight-realism-p1-p3`, `rapier-launch-gallery`) each hold a full duplicate tree. They
turned a 28-file survey into a 171-file one. Confirm merged or dead, then `git worktree remove`.

## Build stamp

Both tasks change production runtime, so each needs the stamp ritual (`RELEASE_BUILD` in
`release_identity.js`, `api/build-info.js`, `service-worker.js`; `index.html`'s script tags,
build text, comment and inline const; every `?v=NN` import; the two test pins in
`sortie_result.test.mjs` and `production_graphics_wiring.test.mjs`).
