# Three.js asset-loading runtime

These files are the asset-loading subset of `three@0.160.0`, matching the
vendored `../three.module.js` byte-for-byte.

Source package:

- npm package: `three@0.160.0`
- source archive: `https://registry.npmjs.org/three/-/three-0.160.0.tgz`
- source archive SHA-256: `1ee2f935c4f555814b388e87b5ef78a44856bd2e9d0feb88643a6e193fb42856`
- license: MIT; see [`LICENSE`](./LICENSE)

Included runtime pieces:

- `GLTFLoader`
- `KTX2Loader`, its Basis Universal transcoder, and KTX/Zstandard helpers
- Meshopt decoder
- `OrbitControls` for the standalone asset-inspection page
- `EffectComposer`, render/output/shader passes, threshold bloom, SMAA, and FXAA for the profile-driven visual runtime
- loader utility modules required by those files

Within the loader/control subset, the only source modifications are the four bare `three` imports in
`GLTFLoader.js`, `KTX2Loader.js`, `BufferGeometryUtils.js`, and
`OrbitControls.js`. They point to
the repository's matching `three.module.js` so the static browser build does
not require a bundler or import map.

The post-processing subset applies the same import-only patch to each module
that imports core. Its complete scope and checksums are recorded separately in
[`POSTPROCESSING.md`](./POSTPROCESSING.md).

When Three.js is upgraded, replace the core and this entire directory from
the same tagged package. Never mix loader and core versions.

## Bundled decoder notices

The upstream Three.js package redistributes decoder/parser components with
their own licenses. Their required notices are kept in [`licenses/`](./licenses/):

- Basis Universal transcoder: Apache-2.0
- Meshoptimizer decoder (v0.20): MIT
- KTX-Parse (the bundled file identifies itself as v0.3.1): MIT
- Zstddec JavaScript wrapper: MIT; embedded Zstandard decoder: BSD-3-Clause

Keep these notices with any deployed copy of the corresponding runtime files.

Post-processing source paths, import-patch scope, and per-file upstream/patched
checksums are recorded in [`POSTPROCESSING.md`](./POSTPROCESSING.md).
