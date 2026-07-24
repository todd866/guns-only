# Terrain Legibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the Korean terrain read as mountains instead of a flat pale wash, by giving it baked ambient occlusion, a full value range, and banded aerial perspective.

**Architecture:** The heightfield is already real Copernicus DEM and is not the problem (see `docs/superpowers/specs/2026-07-23-winter-korea-design.md`). All four changes are shading. Occlusion is **baked once per chunk on the CPU** into a vertex attribute, so it costs nothing per fragment; the remaining changes are a handful of ALU ops in the existing terrain fragment shader. No new assets, no new textures, no geometry added.

**Tech Stack:** Vanilla ES modules, Three.js r160 (vendored at `web/wwwroot/vendor/three.module.js`), raw GLSL in `ShaderMaterial`, `node --test` for unit tests, `tools/perf/terrain_frame_probe.mjs` for frame time and screenshots.

## Global Constraints

- **Build stamp ritual.** `web/wwwroot/render/release/tests/release_identity.test.mjs` fails if any production `web/wwwroot/**` file (tests excluded) changes without `web/wwwroot/index.html` changing in the same worktree, and fails in CI if a committed production change reuses a build number. **Every task below that touches `web/wwwroot/**` must bump all three stamps in its commit.**
  **Do not hardcode the number — concurrent agents claim builds in this repo continuously.** Task 1 was planned as 87 and had to ship as 89 because two other commits took 87 and 88 mid-task. Immediately before committing, determine the live ceiling and take the next unclaimed number:
  ```sh
  git log --all --oneline --grep="Stamp Build\|Ship Build" -8
  ```
  - `web/wwwroot/render/release/release_identity.js:1` — `export const RELEASE_BUILD = "NN";`
  - `web/wwwroot/api/build-info.js:4` — `const RELEASE_BUILD = "NN";`
  - `web/wwwroot/index.html:2251` — `Build NN · verifying`, and `:2306` — `./app.js?v=NN`
- **The HUD stays an instrument.** Do not touch `web/wwwroot/hud.js` or anything under `web/wwwroot/render/hud/`. The 600+ assertion contract does not move.
- **The kernel is untouched.** No changes under `sim/`. Terrain truth, collision and GCAS geometry are unaffected — this is presentation only.
- **Determinism.** Baked occlusion must be a pure function of the decoded heightfield. No `Math.random()`, no time, no camera dependence.
- **Verification gate.** Structural test green does not prove pixels (Builds 60/62). Every task ends with a screenshot read from `terrain_frame_probe.mjs --screenshot`.
- **Performance gate.** No task may regress p50 frame time against the baseline. Baseline at HEAD `68bb19e`: **p50 333.0 ms, p95 383.4 ms** (headless Chromium/SwiftShader, 1280x720@1x). p50/p95 reproduce to ~0.2 ms on a quiet machine; `max` is noise and is not a gate signal.
- **Concurrent agents are active in this working tree.** Stage explicit paths — never `git add -A`. Re-verify any `file:line` before relying on it.
- **All line numbers in this plan are as of HEAD `68bb19e` and drift as tasks land.** Each earlier task inserts lines into `korea_terrain.js`, so Task 3's "line 149" is not line 149 once Tasks 1 and 2 are in. **Locate every edit by the quoted code, not by the number** — each step quotes the exact text being replaced. The numbers are navigation hints only.

## Environment

```sh
export PATH="/opt/homebrew/bin:$PATH"
export DOTNET_ROOT="$HOME/.dotnet"
export DOTNET_MULTILEVEL_LOOKUP=0
export GUNS_DOTNET_CLI="$HOME/.dotnet/dotnet"
```

Full gate: `PATH="/opt/homebrew/bin:$PATH" GUNS_DOTNET_CLI="$HOME/.dotnet/dotnet" DOTNET_ROOT="$HOME/.dotnet" DOTNET_MULTILEVEL_LOOKUP=0 ./bin/check` — capture its own exit code with `rc=$?`.

Targeted terrain tests: `node --test web/wwwroot/render/environment/tests/korea_terrain.test.mjs`

## File Structure

| File | Responsibility | Tasks |
| --- | --- | --- |
| `web/wwwroot/render/environment/korea_terrain.js` | Terrain geometry build, shaders, material factories, streaming | 1, 2, 3, 4 |
| `web/wwwroot/render/environment/tests/korea_terrain.test.mjs` | Unit tests for geometry and shader source | 1, 2, 3, 4 |
| `web/wwwroot/render/visual/korea_pack_adapters.js` | Maps visual-profile data to terrain material options | 4 |
| `content/schemas/visual-profile.schema.json` | Authoritative visual-profile contract | 4 |
| `content/packs/korea-1950s/visual-profile.json` | The authored profile values | 4 |
| `web/wwwroot/index.html`, `render/release/release_identity.js`, `api/build-info.js` | Build stamp | 1, 2, 3, 4 |

**Scope narrowing, deliberate.** The spec's phase 2 says "terrain palette out of GLSL into the visual profile". Task 4 lifts only the **legibility tuning constants** this phase introduces (shadow floor, occlusion range, haze banding), not the full albedo colour set. Moving the colours has no consumer until the winter palette needs them (spec phase 6), so doing it now would be speculative. Task 4's schema block is designed to accept the colours later without a breaking change.

---

### Task 1: Bake a concavity attribute into terrain geometry

Valley floors are enclosed and should be dark; ridge crests are exposed and should catch light. This is what makes a hillshade legible. Computing it per-fragment would need neighbourhood sampling; computing it once per chunk at build time costs nothing at runtime.

The attribute is named `concavity`, deliberately **not** "curvature" — `terrainCurvatureDropM` already exists in this module and means *earth* curvature. Do not conflate them.

**Files:**
- Modify: `web/wwwroot/render/environment/korea_terrain.js` (constants near line 24; `createTerrainGeometry` at line 282)
- Test: `web/wwwroot/render/environment/tests/korea_terrain.test.mjs`
- Modify: `web/wwwroot/index.html`, `web/wwwroot/render/release/release_identity.js`, `web/wwwroot/api/build-info.js`

**Interfaces:**
- Consumes: `decodeTerrainRecord(buffer, record, quantization)` → `{ heights: Float32Array, water: Uint8Array, sampleCount: number }` (existing).
- Produces: `createTerrainGeometry(THREE, chunk, decoded)` returns its existing object, with `geometry` now additionally carrying a `concavity` `BufferAttribute` — `itemSize: 1`, `Float32Array`, one value per vertex including skirt vertices, range `[0, 1]` where `0.5` is locally flat, `< 0.5` is concave (valley), `> 0.5` is convex (ridge). Task 2 reads this attribute.

- [ ] **Step 1: Write the failing test**

Add to `web/wwwroot/render/environment/tests/korea_terrain.test.mjs` (the file already imports `createTerrainGeometry`, `decodeTerrainRecord`, `THREE`, and defines `manifest()` and `quantization` at the top — reuse them):

```js
test("bakes a concavity attribute so valley floors read as enclosed", () => {
  // Heights are decimetres (metresPerUnit 0.1): a 100 m plateau with a single
  // 0 m pit at the centre. The pit is the most concave sample in the grid.
  const values = new Int16Array([
    1000, 1000, 1000,
    1000, 0, 1000,
    1000, 1000, 1000,
  ]);
  const record = manifest().chunks[0].lods[0];
  const decoded = decodeTerrainRecord(values.buffer, record, quantization);
  const built = createTerrainGeometry(THREE, manifest().chunks[0], decoded);

  const concavity = built.geometry.getAttribute("concavity");
  assert.ok(concavity, "terrain geometry must carry a baked concavity attribute");
  assert.equal(concavity.itemSize, 1);
  assert.equal(concavity.count, built.geometry.getAttribute("position").count,
    "every vertex, skirts included, needs a concavity value");
  assert.ok(concavity.getX(4) < 0.5,
    "the pit at the centre must read as concave");
  for (let index = 0; index < concavity.count; index++) {
    const value = concavity.getX(index);
    assert.ok(value >= 0 && value <= 1, `concavity ${value} must stay in [0, 1]`);
  }
  built.geometry.dispose();
});

test("concavity fades to neutral at chunk edges so neighbours cannot seam", () => {
  // Each chunk can only see its own samples, so a clamped neighbourhood at the boundary would
  // give the SAME world position a different value in each of the two chunks that share it —
  // painting a visible grid of seams every 16 km. Forcing the boundary to exactly 0.5 makes both
  // sides agree by construction.
  const values = new Int16Array([
    1000, 1000, 1000,
    1000, 0, 1000,
    1000, 1000, 1000,
  ]);
  const record = manifest().chunks[0].lods[0];
  const decoded = decodeTerrainRecord(values.buffer, record, quantization);
  const built = createTerrainGeometry(THREE, manifest().chunks[0], decoded);
  const concavity = built.geometry.getAttribute("concavity");

  // Every perimeter sample of the 3x3 grid sits on the chunk boundary.
  for (const index of [0, 1, 2, 3, 5, 6, 7, 8]) {
    assert.equal(concavity.getX(index), 0.5,
      `boundary sample ${index} must be exactly neutral`);
  }
  built.geometry.dispose();
});

test("concavity is deterministic across repeated builds", () => {
  const values = new Int16Array([1000, 400, 1000, 250, 0, 250, 1000, 400, 1000]);
  const record = manifest().chunks[0].lods[0];
  const first = createTerrainGeometry(THREE, manifest().chunks[0],
    decodeTerrainRecord(values.buffer, record, quantization));
  const second = createTerrainGeometry(THREE, manifest().chunks[0],
    decodeTerrainRecord(values.buffer, record, quantization));
  assert.deepEqual(
    Array.from(first.geometry.getAttribute("concavity").array),
    Array.from(second.geometry.getAttribute("concavity").array),
  );
  first.geometry.dispose();
  second.geometry.dispose();
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test web/wwwroot/render/environment/tests/korea_terrain.test.mjs`

Expected: FAIL — `terrain geometry must carry a baked concavity attribute` (the assertion on a missing attribute; `getAttribute` returns `undefined`).

- [ ] **Step 3: Add the tuning constants**

In `web/wwwroot/render/environment/korea_terrain.js`, immediately after the existing `TERRAIN_EARTH_RADIUS_M` declaration (line 25):

```js
// Baked terrain occlusion. The sampling radius is expressed in METRES and converted to samples
// per LOD, so a valley reads with the same enclosure at 64 m and at 256 m spacing and does not
// pop across an LOD change. 300 m is about the floor width of a Korean central-highland valley.
export const TERRAIN_CONCAVITY_RADIUS_M = 300;
// Relief that saturates the attribute. Height differences beyond this clamp, so a 1,500 m ridge
// wall does not crush every lesser fold to black.
export const TERRAIN_CONCAVITY_RELIEF_M = 120;
```

- [ ] **Step 4: Compute the attribute for surface vertices**

In `createTerrainGeometry`, insert immediately after the loop that fills `positions` for the base grid (the loop ending at line 305, before `const indices = [];`):

```js
  // Baked ambient occlusion: each sample against the mean of its ring neighbours. Negative means
  // the sample sits below its surroundings (enclosed valley floor); positive means it stands proud
  // (ridge crest). This is the term that makes dissected terrain legible, and baking it here keeps
  // the fragment shader free of neighbourhood sampling.
  const spacingM = Math.max(spacingEast, spacingNorth);
  const ringSamples = Math.max(1, Math.min(
    Math.floor((sampleCount - 1) / 2),
    Math.round(TERRAIN_CONCAVITY_RADIUS_M / spacingM),
  ));
  const concavity = new Float32Array(baseVertexCount + skirtVertexCount);
  for (let north = 0; north < sampleCount; north++) {
    for (let east = 0; east < sampleCount; east++) {
      const index = north * sampleCount + east;
      let total = 0;
      let count = 0;
      for (let northStep = -1; northStep <= 1; northStep++) {
        for (let eastStep = -1; eastStep <= 1; eastStep++) {
          if (northStep === 0 && eastStep === 0) continue;
          const sampleNorth = Math.min(sampleCount - 1,
            Math.max(0, north + northStep * ringSamples));
          const sampleEast = Math.min(sampleCount - 1,
            Math.max(0, east + eastStep * ringSamples));
          total += heights[sampleNorth * sampleCount + sampleEast];
          count++;
        }
      }
      const relative = heights[index] - total / count;
      const raw = Math.min(1, Math.max(0,
        relative / TERRAIN_CONCAVITY_RELIEF_M * 0.5 + 0.5));
      // A chunk can only see its own samples, so a clamped neighbourhood at the boundary would
      // give the SAME world position different occlusion in each of the two chunks sharing it —
      // a visible seam grid every tile span. Fading to exactly 0.5 over the ring width makes both
      // sides agree by construction, at the cost of occlusion in a band that is a few percent of
      // the tile. Do not replace this with cross-chunk sampling: it would make geometry depend on
      // neighbour load order and break determinism.
      const edgeDistance = Math.min(east, north,
        sampleCount - 1 - east, sampleCount - 1 - north);
      const edgeFade = Math.min(1, edgeDistance / ringSamples);
      concavity[index] = 0.5 + (raw - 0.5) * edgeFade;
    }
  }
```

- [ ] **Step 5: Carry the value onto the skirt vertices**

In the first skirt loop (the one filling `positions` for `topIndex`/`bottomIndex`, lines 321-331), add these two lines immediately after `positions[bottomIndex * 3 + 2] = positions[sourceIndex * 3 + 2];`:

```js
    concavity[topIndex] = concavity[sourceIndex];
    concavity[bottomIndex] = concavity[sourceIndex];
```

- [ ] **Step 6: Register the attribute**

In the same function, immediately after `geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));` (line 342):

```js
  geometry.setAttribute("concavity", new THREE.BufferAttribute(concavity, 1));
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `node --test web/wwwroot/render/environment/tests/korea_terrain.test.mjs`

Expected: PASS, all tests including the pre-existing `decodes little-endian decimetres and omits all-water triangles`.

- [ ] **Step 8: Bump the build stamp to 87**

Edit three files:
- `web/wwwroot/render/release/release_identity.js:1` → `export const RELEASE_BUILD = "87";`
- `web/wwwroot/api/build-info.js:4` → `const RELEASE_BUILD = "87";`
- `web/wwwroot/index.html:2251` → `<output id="ready-build" data-state="checking">Build 87 · verifying</output>`
- `web/wwwroot/index.html:2306` → `<script type="module" src="./app.js?v=87"></script>`

- [ ] **Step 9: Run the full gate**

Run:
```sh
PATH="/opt/homebrew/bin:$PATH" GUNS_DOTNET_CLI="$HOME/.dotnet/dotnet" \
  DOTNET_ROOT="$HOME/.dotnet" DOTNET_MULTILEVEL_LOOKUP=0 ./bin/check; rc=$?; echo "check rc=$rc"; exit $rc
```

Expected: `check rc=0`.

- [ ] **Step 10: Commit**

```bash
git add web/wwwroot/render/environment/korea_terrain.js \
  web/wwwroot/render/environment/tests/korea_terrain.test.mjs \
  web/wwwroot/render/release/release_identity.js \
  web/wwwroot/api/build-info.js \
  web/wwwroot/index.html
git commit -m "Ship Build 87: bake terrain concavity for hillshade occlusion"
```

---

### Task 2: Consume the occlusion and open the value range

The attribute from Task 1 does nothing until the shader reads it. In the same change, remove the two floors that compress all relief into the top 60% of the value range: `0.43 + 0.57 * …` in the period path and `0.40 + …` in the modern path.

`createTerrainMaterial` is currently module-private. Export it so shader construction is testable without a network fetch or a GL context.

**Files:**
- Modify: `web/wwwroot/render/environment/korea_terrain.js` (`TERRAIN_VERTEX` line 30ish; `TERRAIN_FRAGMENT` line 54; `createTerrainMaterial` line 485)
- Test: `web/wwwroot/render/environment/tests/korea_terrain.test.mjs`
- Modify: the three build-stamp files

**Interfaces:**
- Consumes: the `concavity` vertex attribute from Task 1.
- Produces: `export function createTerrainMaterial(THREE, options = {})` — options `{ sunDirection?, fogColor?, fogDensity?, sceneryEra?, qualityTier? }`, returns a `THREE.ShaderMaterial`. Task 3 and Task 4 extend its `uniforms`.

- [ ] **Step 1: Write the failing test**

Add to `web/wwwroot/render/environment/tests/korea_terrain.test.mjs`, and add `createTerrainMaterial` to the existing import block at the top of the file:

```js
test("terrain shading consumes baked occlusion and opens the value range", () => {
  const period = createTerrainMaterial(THREE, { sceneryEra: "period", qualityTier: "desktop" });
  const modern = createTerrainMaterial(THREE, { sceneryEra: "modern", qualityTier: "desktop" });

  assert.match(period.vertexShader, /attribute float concavity;/,
    "the vertex shader must declare the baked occlusion attribute");
  assert.match(period.vertexShader, /vConcavity = concavity;/);
  assert.match(period.fragmentShader, /varying float vConcavity;/);

  // Era is a compile-time #define, so both materials share one fragmentShader string. Asserting
  // against both is deliberate: it catches an accidental split into two sources.
  assert.match(period.fragmentShader, /uOcclusionRange/);
  assert.ok(period.uniforms.uOcclusionRange, "occlusion range must be a uniform");
  assert.ok(period.uniforms.uShadowFloor, "shadow floor must be a uniform");

  // The floors that crushed relief into the top 60% of value must be gone.
  assert.doesNotMatch(period.fragmentShader, /0\.43 \+ 0\.57 \*/,
    "the period diffuse floor of 0.43 must be replaced by the uShadowFloor uniform");
  assert.doesNotMatch(modern.fragmentShader, /toneRamp = 0\.40 \+/,
    "the modern tone-ramp floor of 0.40 must be replaced by the uShadowFloor uniform");

  assert.ok(period.uniforms.uShadowFloor.value <= 0.2,
    "a legible hillshade needs the darkest slope well below 40% lit");

  period.dispose();
  modern.dispose();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test web/wwwroot/render/environment/tests/korea_terrain.test.mjs`

Expected: FAIL — `SyntaxError` or `createTerrainMaterial is not exported`, because the import does not resolve.

- [ ] **Step 3: Export the material factory**

In `web/wwwroot/render/environment/korea_terrain.js`, change line 485 from `function createTerrainMaterial(THREE, options = {}) {` to:

```js
export function createTerrainMaterial(THREE, options = {}) {
```

- [ ] **Step 4: Pass the attribute through the vertex shader**

In `TERRAIN_VERTEX`, add after the existing `varying float vTerrainHeight;` declaration:

```glsl
attribute float concavity;
varying float vConcavity;
```

and inside `main()`, immediately after `vTerrainHeight = position.y;`:

```glsl
  vConcavity = concavity;
```

- [ ] **Step 5: Add the uniforms**

In `createTerrainMaterial`'s `uniforms` object, after the `uParcelTint` entry:

```js
      // Darkest-slope lighting. The old 0.43 / 0.40 floors put every slope in the world inside the
      // top 60% of the value range, which is why densely dissected Korean terrain rendered as a
      // flat wash. Legibility now comes from value, and hue separation keeps dark slopes readable.
      uShadowFloor: { value: finite(options.shadowFloor, 0.12) },
      // Baked-occlusion multiplier at fully concave (x) and fully convex (y).
      uOcclusionRange: {
        value: new THREE.Vector2(
          finite(options.occlusionMin, 0.55),
          finite(options.occlusionMax, 1.12),
        ),
      },
```

- [ ] **Step 6: Consume both in the fragment shader**

In `TERRAIN_FRAGMENT`, add to the uniform declarations after `uniform float uParcelTint;`:

```glsl
uniform float uShadowFloor;
uniform vec2 uOcclusionRange;
varying float vConcavity;
```

Replace line 101 (`float diffuse = 0.43 + 0.57 * max(dot(normal, normalize(uSunDirection)), 0.0);`) with:

```glsl
  float diffuse = uShadowFloor
    + (1.0 - uShadowFloor) * max(dot(normal, normalize(uSunDirection)), 0.0);
```

Replace lines 129-130 (`float toneRamp = 0.40 + 0.30 * smoothstep(0.30, 0.42, halfLambert)` and its continuation) with:

```glsl
  float toneRamp = uShadowFloor
    + (1.0 - uShadowFloor) * (0.42 * smoothstep(0.26, 0.40, halfLambert)
      + 0.58 * smoothstep(0.58, 0.76, halfLambert));
```

Then, immediately before the `#ifdef MODERN_SCENERY` block that selects `fogDensity` (line 141), apply the occlusion to whichever `lit` the era produced:

```glsl
  // Baked enclosure darkens valley floors and lets ridge crests catch light. This is the term the
  // renderer was missing relative to the source hillshade in central-front-preview.png.
  lit *= mix(uOcclusionRange.x, uOcclusionRange.y, clamp(vConcavity, 0.0, 1.0));
```

- [ ] **Step 7: Run the test to verify it passes**

Run: `node --test web/wwwroot/render/environment/tests/korea_terrain.test.mjs`

Expected: PASS.

- [ ] **Step 8: Bump the build stamp**

Same four edits as Task 1 step 8, using the next unclaimed build number (see Global Constraints — do not assume).

- [ ] **Step 9: Run the full gate**

Run the `./bin/check` command from the Environment section. Expected: `check rc=0`.

- [ ] **Step 10: Look at it**

```sh
PATH="/opt/homebrew/bin:$PATH" DOTNET_ROOT="$HOME/.dotnet" DOTNET_MULTILEVEL_LOOKUP=0 \
  "$HOME/.dotnet/dotnet" publish web/GunsOnly.Web.csproj -c Release
node tools/perf/terrain_frame_probe.mjs --label task2 \
  --screenshot /tmp/task2-terrain.png
```

**Read the PNG.** Required: ridgelines separate from valley floors by visible value; the dendritic dissection visible in `central-front-preview.png` is now visible in-game. If the terrain still looks flat, the occlusion is not reaching the shader — do not proceed. Compare the reported p50 against the 333.0 ms baseline.

- [ ] **Step 11: Commit**

```bash
git add web/wwwroot/render/environment/korea_terrain.js \
  web/wwwroot/render/environment/tests/korea_terrain.test.mjs \
  web/wwwroot/render/release/release_identity.js \
  web/wwwroot/api/build-info.js \
  web/wwwroot/index.html
git commit -m "Ship Build 88: terrain hillshade — occlusion applied, value floors removed"
```

---

### Task 3: Band the aerial perspective

The reference look is stacked ridgelines separating into discrete value planes, not a uniform wash. The current `1 − exp(−density²·d²)` is smooth, and at the period density of 5.5e-5 it reaches ~70% at 20 km, which erases the relief Task 2 just recovered.

Quantising the haze into a few steps makes each successive ridge sit on its own value plane — the single most characteristic feature of the reference photography, and cheaper than what it replaces.

**Files:**
- Modify: `web/wwwroot/render/environment/korea_terrain.js` (`TERRAIN_FRAGMENT` haze block, lines 138-151; `createTerrainMaterial`)
- Test: `web/wwwroot/render/environment/tests/korea_terrain.test.mjs`
- Modify: the three build-stamp files

**Interfaces:**
- Consumes: `createTerrainMaterial` (exported in Task 2).
- Produces: two further uniforms on that material — `uHazeBands` (float, band count; `0` disables banding) and `uHazeBandBlend` (float `[0,1]`, how far to lerp from smooth toward banded).

- [ ] **Step 1: Write the failing test**

Add to `web/wwwroot/render/environment/tests/korea_terrain.test.mjs`:

```js
test("aerial perspective is banded so ridgelines separate in value", () => {
  const material = createTerrainMaterial(THREE, { sceneryEra: "modern", qualityTier: "desktop" });

  assert.ok(material.uniforms.uHazeBands, "band count must be a uniform");
  assert.ok(material.uniforms.uHazeBandBlend, "band blend must be a uniform");
  assert.match(material.fragmentShader, /floor\(aerial \* uHazeBands\) \/ uHazeBands/,
    "haze must be quantised into discrete distance planes");
  assert.ok(material.uniforms.uHazeBands.value >= 3,
    "fewer than three planes cannot separate stacked ridges");

  // Banding must degrade to the old smooth wash when disabled, not divide by zero.
  const off = createTerrainMaterial(THREE, { sceneryEra: "modern", hazeBands: 0 });
  assert.equal(off.uniforms.uHazeBands.value, 0);
  assert.match(off.fragmentShader, /uHazeBands > 0\.5/,
    "the shader must guard the divide when banding is disabled");

  material.dispose();
  off.dispose();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test web/wwwroot/render/environment/tests/korea_terrain.test.mjs`

Expected: FAIL — `band count must be a uniform` (`material.uniforms.uHazeBands` is `undefined`).

- [ ] **Step 3: Add the uniforms**

In `createTerrainMaterial`'s `uniforms` object, after the `uOcclusionRange` entry from Task 2:

```js
      // Discrete aerial-perspective planes. Stacked ridges each land on their own value step,
      // which is what makes receding terrain read as depth rather than as fade.
      uHazeBands: { value: finite(options.hazeBands, 6) },
      uHazeBandBlend: { value: finite(options.hazeBandBlend, 0.65) },
```

- [ ] **Step 4: Declare and apply them in the fragment shader**

Add to `TERRAIN_FRAGMENT`'s uniform declarations, after `uniform vec2 uOcclusionRange;`:

```glsl
uniform float uHazeBands;
uniform float uHazeBandBlend;
```

Replace the two lines computing `aerial` (line 149-150, `float aerial = 1.0 - exp(-fogDensity * fogDensity` and its continuation `* distanceToCamera * distanceToCamera);`) with:

```glsl
  float aerial = 1.0 - exp(-fogDensity * fogDensity
    * distanceToCamera * distanceToCamera);
  if (uHazeBands > 0.5) {
    float banded = floor(aerial * uHazeBands) / uHazeBands;
    aerial = mix(aerial, banded, uHazeBandBlend);
  }
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test web/wwwroot/render/environment/tests/korea_terrain.test.mjs`

Expected: PASS.

- [ ] **Step 6: Bump the build stamp**

Same four edits as Task 1 step 8, using the next unclaimed build number (see Global Constraints — do not assume).

- [ ] **Step 7: Run the full gate**

Run the `./bin/check` command from the Environment section. Expected: `check rc=0`.

- [ ] **Step 8: Look at it**

```sh
PATH="/opt/homebrew/bin:$PATH" DOTNET_ROOT="$HOME/.dotnet" DOTNET_MULTILEVEL_LOOKUP=0 \
  "$HOME/.dotnet/dotnet" publish web/GunsOnly.Web.csproj -c Release
node tools/perf/terrain_frame_probe.mjs --label task3 --screenshot /tmp/task3-terrain.png
```

**Read the PNG.** Required: successive ridgelines sit on visibly distinct value planes into the distance. Failure mode to watch for: visible banding *contours* crawling across a single continuous slope. If that appears, lower `uHazeBandBlend` toward `0.4` rather than raising the band count. Compare p50 against baseline.

- [ ] **Step 9: Commit**

```bash
git add web/wwwroot/render/environment/korea_terrain.js \
  web/wwwroot/render/environment/tests/korea_terrain.test.mjs \
  web/wwwroot/render/release/release_identity.js \
  web/wwwroot/api/build-info.js \
  web/wwwroot/index.html
git commit -m "Ship Build 89: banded aerial perspective so ridgelines read as depth"
```

---

### Task 4: Author the legibility constants as visual-profile data

Tasks 2 and 3 introduced five tuning numbers hardcoded as defaults in `createTerrainMaterial`. Tuning a look by editing GLSL defaults and rebuilding is slow, and the winter work (spec phase 6) needs to vary exactly these values per pack. Lift them into the visual profile, where the ocean and atmosphere materials already live.

**Files:**
- Modify: `content/schemas/visual-profile.schema.json` (the `environment` object)
- Modify: `content/packs/korea-1950s/visual-profile.json`
- Modify: `web/wwwroot/render/visual/korea_pack_adapters.js`
- Modify: `web/wwwroot/render/environment/korea_terrain.js` (option names only — defaults already in place)
- Test: `web/wwwroot/render/visual/tests/` (new test) and `web/wwwroot/render/environment/tests/korea_terrain.test.mjs`
- Modify: the three build-stamp files

**Interfaces:**
- Consumes: `createTerrainMaterial(THREE, options)` accepting `shadowFloor`, `occlusionMin`, `occlusionMax`, `hazeBands`, `hazeBandBlend` (all already read via `finite(...)` in Tasks 2 and 3 — no shader change needed here).
- Produces: `visualProfile.environment.terrainLegibility` — an optional object `{ shadowFloor, occlusionRange: [min, max], hazeBands, hazeBandBlend }`. Absent means the `createTerrainMaterial` defaults apply, so existing packs stay valid.

- [ ] **Step 1: Write the failing test**

Create `web/wwwroot/render/visual/tests/terrain_legibility_profile.test.mjs`:

```js
import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const SCHEMA_URL = new URL(
  "../../../../../content/schemas/visual-profile.schema.json", import.meta.url);
const PROFILE_URL = new URL(
  "../../../../../content/packs/korea-1950s/visual-profile.json", import.meta.url);

test("the visual-profile schema accepts authored terrain legibility values", async () => {
  const schema = JSON.parse(await readFile(SCHEMA_URL, "utf8"));
  const block = schema.properties.environment.properties.terrainLegibility;
  assert.ok(block, "environment must expose a terrainLegibility block");
  assert.equal(block.additionalProperties, false);
  assert.ok(block.properties.shadowFloor);
  assert.ok(block.properties.occlusionRange);
  assert.ok(block.properties.hazeBands);
  assert.ok(block.properties.hazeBandBlend);
  assert.ok(!schema.properties.environment.required.includes("terrainLegibility"),
    "terrainLegibility must stay optional so existing packs remain valid");
});

test("the Korea pack authors its terrain legibility values", async () => {
  const profile = JSON.parse(await readFile(PROFILE_URL, "utf8"));
  const authored = profile.environment.terrainLegibility;
  assert.ok(authored, "the Korea profile must author terrain legibility");
  assert.ok(authored.shadowFloor <= 0.2);
  assert.equal(authored.occlusionRange.length, 2);
  assert.ok(authored.occlusionRange[0] < authored.occlusionRange[1]);
  assert.ok(authored.hazeBands >= 3);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test web/wwwroot/render/visual/tests/terrain_legibility_profile.test.mjs`

Expected: FAIL — `environment must expose a terrainLegibility block` (`block` is `undefined`).

- [ ] **Step 3: Extend the schema**

In `content/schemas/visual-profile.schema.json`, inside `properties.environment.properties` (alongside the existing `fog` and `lighting` entries), add:

```json
        "terrainLegibility": {
          "type": "object",
          "additionalProperties": false,
          "properties": {
            "shadowFloor": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            },
            "occlusionRange": {
              "type": "array",
              "minItems": 2,
              "maxItems": 2,
              "items": {
                "type": "number",
                "minimum": 0,
                "maximum": 2
              }
            },
            "hazeBands": {
              "type": "number",
              "minimum": 0,
              "maximum": 32
            },
            "hazeBandBlend": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            }
          }
        },
```

Do **not** add `terrainLegibility` to `environment.required` — absence must remain valid.

- [ ] **Step 4: Author the values**

In `content/packs/korea-1950s/visual-profile.json`, inside the `environment` object, add:

```json
      "terrainLegibility": {
        "shadowFloor": 0.12,
        "occlusionRange": [0.55, 1.12],
        "hazeBands": 6,
        "hazeBandBlend": 0.65
      },
```

- [ ] **Step 5: Run the test to verify it passes**

Run: `node --test web/wwwroot/render/visual/tests/terrain_legibility_profile.test.mjs`

Expected: PASS.

- [ ] **Step 6: Thread the values to the material**

In `web/wwwroot/render/visual/korea_pack_adapters.js`, in the terrain adapter that already builds `{ qualityTier: tierId, fogColor: fog.color, … }` around line 26, add the authored values to the same options object:

```js
      ...terrainLegibilityOptions(context.environment?.terrainLegibility),
```

and add this helper near the top of the module, after the imports:

```js
// Absent or partial authored legibility falls through to createTerrainMaterial's defaults, so a
// pack that predates this block keeps rendering exactly as before.
function terrainLegibilityOptions(authored) {
  if (!authored) return {};
  const options = {};
  if (Number.isFinite(authored.shadowFloor)) options.shadowFloor = authored.shadowFloor;
  if (Array.isArray(authored.occlusionRange) && authored.occlusionRange.length === 2) {
    options.occlusionMin = authored.occlusionRange[0];
    options.occlusionMax = authored.occlusionRange[1];
  }
  if (Number.isFinite(authored.hazeBands)) options.hazeBands = authored.hazeBands;
  if (Number.isFinite(authored.hazeBandBlend)) options.hazeBandBlend = authored.hazeBandBlend;
  return options;
}
```

- [ ] **Step 7: Validate and re-stage the pack**

Run:
```sh
node tools/assets/validate-manifests.mjs --strict --pack content/packs/korea-1950s/pack.json
node --test tools/assets/test/*.test.mjs
node tools/assets/build-assets.mjs stage --dry-run \
  --pack content/packs/korea-1950s/pack.json --output web/wwwroot/content
node tools/assets/build-assets.mjs stage \
  --pack content/packs/korea-1950s/pack.json --output web/wwwroot/content --replace
```

Expected: validation passes; the dry run lists only `visual-profile.json` as changed.

- [ ] **Step 8: Bump the build stamp**

Same four edits as Task 1 step 8, using the next unclaimed build number (see Global Constraints — do not assume).

- [ ] **Step 9: Run the full gate**

Run the `./bin/check` command from the Environment section. Expected: `check rc=0`.

- [ ] **Step 10: Confirm the authored path is live**

```sh
PATH="/opt/homebrew/bin:$PATH" DOTNET_ROOT="$HOME/.dotnet" DOTNET_MULTILEVEL_LOOKUP=0 \
  "$HOME/.dotnet/dotnet" publish web/GunsOnly.Web.csproj -c Release
node tools/perf/terrain_frame_probe.mjs --label task4 --screenshot /tmp/task4-terrain.png
```

**Read the PNG** and confirm it matches the Task 3 screenshot — this task is a refactor and must be visually identical. Then edit `shadowFloor` to `0.45` in the staged `web/wwwroot/content/packs/korea-1950s/visual-profile.json`, re-run the probe, and confirm the terrain visibly flattens. That proves the data path is live rather than silently falling back to defaults. Restore `0.12` afterwards.

- [ ] **Step 11: Commit**

```bash
git add content/schemas/visual-profile.schema.json \
  content/packs/korea-1950s/visual-profile.json \
  web/wwwroot/content/packs/korea-1950s/visual-profile.json \
  web/wwwroot/render/visual/korea_pack_adapters.js \
  web/wwwroot/render/visual/tests/terrain_legibility_profile.test.mjs \
  web/wwwroot/render/release/release_identity.js \
  web/wwwroot/api/build-info.js \
  web/wwwroot/index.html
git commit -m "Ship Build 90: author terrain legibility in the visual profile"
```

---

## Phase exit criteria

- `./bin/check` green.
- A probe screenshot in which the dendritic ridge-and-valley structure visible in `central-front-preview.png` is legible in-game.
- p50 frame time not worse than the 333.0 ms baseline at HEAD `68bb19e`.
- Owner sign-off on the look before spec phase 3 (LOD floor re-measurement) begins.

## Known follow-ons, deliberately not in this plan

- **Terrain still casts and receives no shadows.** Baked concavity approximates enclosure but not directional shadowing from neighbouring ridges. Real cast shadows over a 131 km view need a cascade strategy and belong in their own plan.
- **The albedo colour set stays in GLSL.** It moves when the winter palette needs it (spec phase 6). The `terrainLegibility` schema block accepts additions without a breaking change.
- **The `61f9d8a` frame-time regression** (spec, Performance section) is unbisected. If a task's p50 looks anomalous, suspect that first.
