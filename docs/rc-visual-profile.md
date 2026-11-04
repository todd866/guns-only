# RC visual profile: shared modules and the import swap

Audit 3.5 (docs/audits/2026-10-31-holistic-graphics-and-content-pipelines.md): every mode must look like
the same game, with the F-22 renderer as the reference. RC had re-implemented adaptive resolution,
tone mapping, fog, sun colour and shadow stabilisation with its own numbers. This is the shareable half.
Nothing in `web/wwwroot/rc/` imports it yet; the flight game is untouched apart from a pointer comment in
`render/visual/{profile,shadow_stabilizer,adaptive_resolution}.js`.

## What is shared (`web/wwwroot/render/visual/shared/`)

Pure modules, no imports. Three is passed in by the caller (`T`), so no second copy of three can load.

| Module | Exports | Extracted from |
| --- | --- | --- |
| `tone.js` | `applyTone(renderer, {toneMapping, exposure, outputColorSpace}, T)`, `toneMappingConstant`, `colorSpaceConstant` | tone names of `profile.js`; RC `main.js:99` |
| `atmosphere.js` | `atmosphereParams`, `createFog(profile, T)`, `applyAtmosphere(scene, profile, T)`, `fogAmount` | `profile.js` fog; RC `main.js:100,168` |
| `sun.js` | `sunStateAt(dayFraction, profile)`, `snapLightToTexels(light, camera, mapSize, worldRadius)`, `snapFocusAxisAligned`, `snapToGrid` | `shadow_stabilizer.js` (light-space snap); RC `visuals.js followSun` (world-axis snap) |
| `adaptive.js` | `createAdaptivePolicy({min,max,targetMs,percentile,...})`, `step(policy, frameMs, dtSec?)` | RC `adaptive-resolution.mjs` (p75, commit d7117eca) |

`step` returns the new ratio when it changes, else `null`; `policy.ratio` is always current. With RC's numbers
it is proven identical to `stepAdaptiveResolution` over a 6000-frame mixed trace
(`shared/tests/adaptive.test.mjs`). The flight EMA controller (`adaptive_resolution.js`) is a different
design and is not replaced.

`tools/rc/package-rc.mjs` now allows `rc/` to import `../render/visual/shared/*.js` (direct children only, no
tests, no subdirectories) in both modes. Imported modules ship as `rc/shared/visual/<file>` (default) or are
bundled (`--bundle`). Any other `render/` path is still rejected (`importApproved`).

## Profile schema (`web/wwwroot/rc/visual-profile.json`)

RC's overrides as data over `base: "f22-desktop"` (the flight `korea-1950s` profile, tier `desktop`). `_notes`
lists every number that differs from flight and why it is believed to. Sections: `tone`
(`toneMapping`, `outputColorSpace`, `exposure`, `exposureByContext`), `grade`, `atmosphere`
(`default | district | openWorld`, each `{mode, fogColor, near, far, skyColor, cameraFar}`), `sun`, `hemisphere`,
`environment`, `shadow` (map sizes, boxes, bias, follow distance, snap kind) and `adaptive`
(`min,max,percentile,targetMs,slowMs,calmMs,window,step,calmFor,cooldown,maxFrameMs`). Colours are CSS hex strings in
`atmosphere` and `0x...` strings in `sun`/`hemisphere`, as written in RC source. A test checks the file parses, is
internally valid, and that its headline numbers still match the RC source text, so a drifting edit in `main.js` fails.

## The swap for the RC agent (identical numbers first)

All in `web/wwwroot/rc/`; add `import` lines of the form `../render/visual/shared/<module>.js` (packaging rewrites them).

1. `main.js:21` and the frame loop (`stepAdaptiveResolution(adaptive, now-last)`, near line 576): replace
   `createAdaptiveResolution({max:Math.min(devicePixelRatio,1.75),min:Math.min(devicePixelRatio,1)})` with
   `createAdaptivePolicy({max:Math.min(devicePixelRatio,1.75),min:Math.min(devicePixelRatio,1),percentile:.75,targetMs:1000/60,slowMs:19,calmMs:17.8})`
   and `stepAdaptiveResolution(adaptive,ms)` with `step(adaptive,ms)`. `adaptive.ratio` is unchanged. Then
   `rc/adaptive-resolution.mjs` can be deleted.
2. `main.js:99`: replace `renderer.outputColorSpace=...;renderer.toneMapping=...;renderer.toneMappingExposure=1.15;`
   with `applyTone(renderer,{toneMapping:'aces_filmic',outputColorSpace:'srgb',exposure:1.15},T)`.
   `visuals.js applyLighting` keeps setting `toneMappingExposure` per preset (1.1 / 1.15) and `main.js:118` keeps 0.82.
3. `main.js:100`: `scene.background=...;scene.fog=new T.Fog('#b2c6c5',65,150)` becomes
   `applyAtmosphere(scene,{fogColor:'#b2c6c5',near:65,far:150},T)`; line 168 becomes
   `applyAtmosphere(scene,{fogColor:'#c9dde6',skyColor:'#a9d4ee',near:openWorld?280:180,far:openWorld?680:950},T)`.
4. `visuals.js followSun`: replace the two `snap` lines with `snapFocusAxisAligned(at, right-left, mapSize)` (same arithmetic;
   `snapLightToTexels` is the light-space alternative for convergence, not for the identity step).
5. Optional: read the numbers from `visual-profile.json` instead of literals (fetch or import assertion), keeping the file the single source.

Acceptance: run the RC look gate (`docs/rc-look-gate.md`) before and after. With identical numbers the before/after
captures must be identical, pixel MAD under the gate threshold in every scene. A bigger diff means the swap changed
behaviour and is a bug in the swap, not a look decision.

Only then converge deliberately, one number per commit with a look-gate run each: exposure toward 1.02, hemisphere
and sun colours toward `#FFE3B7`, fog by scale factor (not kilometres), shadow texel density, and finally the
adaptive thresholds. Each convergence is an owner-visible look change, so record it in the look-gate ledger.

## Known gaps

- The vendored three has no `NeutralToneMapping`, although `profile.js` accepts `"neutral"`. `tone.js` throws
  on it rather than guess; a flight profile using it would silently fall back today.
- `sunStateAt` is new behaviour (no consumer yet); RC has no day cycle and flight sets the sun from its profile.
