# Guns Only Asset Lab

Standalone browser inspector for staged content packs and local self-contained GLB files. It consumes the production Three r160 loader and `AssetRegistry`; it does not maintain a parallel loading path or alter the game shell.

## Run

From the repository root:

```sh
dotnet run --project web/GunsOnly.Web.csproj
```

Open `/asset-lab/` on the reported local URL. The default input expects:

```text
content/packs/korea-1950s/pack.json
```

Use `?pack=<relative-or-absolute-pack-url>` to prefill another staged pack. Pack-internal model and profile paths remain relative to the pack directory.

## Inspect

- Load a staged `pack.json`; the lab enumerates normalized `assetProfile.bindings` from the runtime registry.
- Select a binding and change its projected pixel height to exercise the production LOD selector.
- Use **Frame object**, autorotate, wireframe, socket-helper, and grid/axes controls to inspect the scene.
- Review node, mesh, draw-call, triangle, material, texture, bounds, source/fallback, LOD, and socket diagnostics in the right panel.
- Choose or drag a `.glb` to inspect it without staging. Local files must be GLB 2.0 with no external buffer or image URIs. Embedded Meshopt and KTX2 data use the vendored runtime support.

The lab registers neutral diagnostic factories for the Korea starter pack's stable procedural IDs. These are visual inspection stand-ins, not game assets.

## Lifecycle

Changing packs or local files releases the active registry instance, disposes the registry cache and loader stack, clears helper geometry, and revokes local object URLs. Changing LODs releases only the active instance so the production cache can serve the next selection. Errors are reported in the interface with pipeline error codes when available.

Metrics are computed from the instantiated scene before helpers are counted. Draw calls use mesh geometry groups; triangle totals include `InstancedMesh.count`.
