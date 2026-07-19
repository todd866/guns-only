# Guns Only asset tools

This directory is an offline, dependency-free validation layer plus adapters for pinned external authoring tools. The full workflow and modelling conventions are in [`docs/graphics-asset-pipeline.md`](../../docs/graphics-asset-pipeline.md).

## Fast path

```sh
node tools/assets/validate-manifests.mjs --strict
node --test tools/assets/test/*.test.mjs
node tools/assets/build-assets.mjs inspect --builtin --source path/to/model.glb
node tools/assets/build-assets.mjs pipeline --dry-run \
  --source path/to/model.blend --output path/to/model.glb
node tools/assets/build-assets.mjs stage --dry-run \
  --pack content/packs/korea-1950s/pack.json
```

`validate-manifests.mjs`, the built-in inspector, staging, and tests import only `node:*` modules. Do not add a `package.json`, vendored module tree, network fetch, or implicit `npx` download here.

## Authored asset generation

The code-authored aircraft and naval modules receive the repository's pinned Three r160 namespace from [`generators/export-assets.mjs`](./generators/export-assets.mjs). They do not import Three or an exporter themselves. The shared exporter builds each scene, serializes an in-memory GLB, embeds deterministic DataTexture PNGs through a dependency-free Node canvas adapter, inspects it, computes SHA-256, and only then performs an atomic write beneath `content/packs/korea-1950s`.

Preview every discoverable authored GLB without writing:

```sh
node tools/assets/generators/export-assets.mjs --dry-run
```

Export one set explicitly:

```sh
node tools/assets/generators/export-assets.mjs \
  --module tools/assets/generators/aircraft-assets.mjs

node tools/assets/generators/export-assets.mjs \
  --module tools/assets/generators/naval-assets.mjs
```

Export all discoverable sets using the default pack root:

```sh
node tools/assets/generators/export-assets.mjs
```

Use `--only <asset-id-or-output-fragment>` to narrow a dry-run or build. Use `--output-root <directory>` for an isolated fixture build. Do not use `--force` in a routine build: an identical output reports `unchanged`, while a differing existing GLB fails closed. `--force` is reserved for an intentional, reviewed regeneration after its source or pinned exporter changes.

The aircraft design, LOD thresholds, anchors, reviewed hashes, and metrics are recorded in [`generators/AIRCRAFT_ASSETS.md`](./generators/AIRCRAFT_ASSETS.md) and [`generators/aircraft-assets.metrics.json`](./generators/aircraft-assets.metrics.json). Naval dimensions, budgets, and anchors are in [`generators/naval/README.md`](./generators/naval/README.md). The current naval GLB hashes are:

- `models/naval/straight-deck-carrier.glb`: `606fe2eeafbb284859ef0deb6a8585c1d1e1dc3e7c7b996584ea5162aa4a3980`
- `models/naval/gun-destroyer-escort.glb`: `c16e13082f9567daf50fef077f8de5eadb672b1f9f8c0aa3e03101e8eab0de3f`

## Environment texture generation

The environment texture generator is a separate seeded, dependency-free PNG path. It writes cloud shape, ocean normal, and foam noise textures at the requested square size. Preview the canonical 256-pixel build:

```sh
node tools/assets/generators/generate-environment-textures.mjs \
  --size 256 --dry-run
```

Write the canonical files beneath `content/packs/korea-1950s/environment/textures`:

```sh
node tools/assets/generators/generate-environment-textures.mjs --size 256
```

At size 256 the deterministic outputs are:

| File | Bytes | SHA-256 |
| --- | ---: | --- |
| `cloud-shape.png` | 238,993 | `929dac4ee90d88d917973634149d9659cca286a17ece94142124f8328686edfe` |
| `ocean-normal.png` | 191,223 | `3cf7c02a980095c806846e3906a51cfe65106e68f9cde797ae17bb2aee707974` |
| `foam-noise.png` | 29,713 | `3623e916031a9f18922b1b5ec20c1b44dae10ebf8dc3f40276f4dfb15c2a72d3` |

As with GLBs, a repeat build must report `unchanged`; a differing existing PNG requires explicit `--force`. Changing `--size`, a seed, sampling math, PNG encoding, Node version, or the generator source is a reviewed content change and requires manifest size/hash updates before staging.

## Asset verification

Run the authored-scene tests, then the content/tool integration tests:

```sh
node --test tools/assets/test/aircraft-assets.test.mjs
node --test tools/assets/generators/naval/naval-assets.test.mjs
node --test tools/assets/test/assets.test.mjs
```

Or run the same set in one Node invocation:

```sh
node --test \
  tools/assets/test/*.test.mjs \
  tools/assets/generators/naval/naval-assets.test.mjs
```

The aircraft tests export twice and require byte-identical, self-contained GLBs with complete UV0/tangent coverage and embedded PBR maps on close LODs. Naval tests compare deterministic scene semantics and enforce coordinates, dimensions, anchors, UVs, PBR inputs, static batching, finite geometry, and budgets; the shared exporter dry-run is the final byte/hash check. `assets.test.mjs` validates the canonical pack closure, authored files, license coverage, socket contracts, staging, and CLI plans. All three gates must pass after manifest integration.

Determinism means identical source modules, Node version, Three revision, exporter patch, and generator options produce identical bytes and SHA-256—not merely similar geometry. A dry-run must report the reviewed dimensions, triangles, materials, and sockets before any write. Commit regenerated binaries together with their reviewed metadata; never accept unexplained hash drift.

## Pinned toolchain policy

Exact accepted authoring versions live in [`toolchain.json`](./toolchain.json):

- Node.js drives validation, inspection, tests, and staging.
- Blender drives `blender/export_glb.py`.
- `@gltf-transform/cli` provides the `gltf-transform` executable.
- KTX-Software provides `toktx` for KTX2 compression invoked by glTF Transform.

CI and reproducible artist environments should install exactly those versions into an external tool cache and pass absolute executables with `--blender` and `--gltf-transform`. glTF Transform must be installed as a pinned tool (for example `@gltf-transform/cli@4.4.1`), not added as an application dependency. Verify downloaded Blender and KTX packages against checksums published with their releases.

`--dry-run` deliberately does not require external tools. `--check` resolves each executable and runs its `--version` probe, catching broken wrappers as well as missing files. Release CI should additionally compare the reported versions with `toolchain.json`; local patch-version experiments are acceptable only for diagnosis, not for committed output.

Tool upgrades are isolated changes: update one version in `toolchain.json`, run the full Node suite, perform a headless export of the socket-triangle smoke model (or an equivalent maintained `.blend` fixture), inspect raw and optimized GLBs, compare their render, and record any byte or extension changes in the upgrade PR. Never silently regenerate all production assets during a tool bump.

## Commands

- `validate-manifests.mjs`: schema and semantic validation of all packs, or a repeated `--pack` closure.
- `build-assets.mjs export`: validated Blender background export.
- `build-assets.mjs optimize`: explicit glTF Transform optimization.
- `build-assets.mjs inspect --builtin`: dependency-free GLB/glTF metrics and socket inspection.
- `build-assets.mjs pipeline`: export plus optimize with a retained raw intermediate.
- `build-assets.mjs stage`: strict validation followed by deterministic, atomic web staging.

Run either CLI with `--help` for all flags. Staging defaults to `web/wwwroot/content` but performs no write in `--dry-run` or `--check` mode.
Geometry optimization supports Meshopt or no compression. Draco output is deliberately rejected
because the shipped Three.js loader does not include a Draco decoder.
