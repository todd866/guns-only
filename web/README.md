# Guns Only — canonical web shell

The browser is the supported Guns Only presentation and distribution target. The pure C# kernel
in `sim/GunsOnly.Sim.csproj` compiles to WebAssembly unchanged; JavaScript owns rendering, input,
audio, device adaptation, and the canvas HUD.

The production boundary is `SimulationSession` in the simulation project. It owns deterministic
fixed-step time and sortie lifecycle. `WebBridge.cs` is a temporary flat transport projection for
the JavaScript shell, including the versioned pack/profile identity, stable entity-to-presentation
bindings, and a bounded ordered-event window used by the renderer. It should eventually become a
typed `PresentationSnapshot` and event contract without growing a second implementation of
mission, combat, resource, or recovery rules.

## Build and run

From the repository root, run the complete verification gate:

```sh
./bin/check
```

To publish and serve the application manually:

```sh
dotnet publish web/GunsOnly.Web.csproj -c Release -o /tmp/guns-only-web
cd /tmp/guns-only-web/wwwroot
python3 -m http.server 8877
```

Open `http://localhost:8877/`.

Production must never be deployed from the checked-in `web/wwwroot` source tree: it does not
contain the generated `_framework` WebAssembly payload. Use the guarded release command instead:

```sh
bin/deploy-web --preview
bin/deploy-web --prod
```

The command publishes to an isolated directory, rejects missing/incomplete Blazor assets and leaked
test files, verifies the deployment URL, and only then promotes a production deployment. It refuses
a dirty worktree unless `GUNS_ALLOW_DIRTY_DEPLOY=1` is set deliberately.

## Layout

- `WebBridge.cs` — temporary JavaScript-facing projection over the production simulation session.
- `wwwroot/app.js` — three.js renderer, pack-aware presentation lifecycle, camera, input, and telemetry.
- `wwwroot/hud.js` — canvas-2D flight, targeting, carrier, and coaching symbology.
- `wwwroot/render/assets/` — versioned asset registry, projected-pixel LODs, loaders, and disposal.
- `wwwroot/render/presence/` — global-room WebSocket client, validation, reconnect, and pose cadence.
- `wwwroot/content/` — deterministic staged copy of validated runtime content.
- `wwwroot/asset-lab/`, `wwwroot/environment-lab/`, and `wwwroot/effects-lab/` — standalone graphics inspection surfaces.
- `wwwroot/render/visual/` — profile-driven HDR/post, adaptive-resolution, and stabilized-shadow runtime.
- `wwwroot/render/presentation/` — cockpit motion, period sight, distant contact, and escort adapters.
- `wwwroot/vendor/three.module.js` — vendored renderer dependency; no CDN is required.
- `wwwroot/api/telemetry.js` — production Vercel telemetry endpoint.
- `wwwroot/api/build-info.js` — uncached public deployment provenance for stale-tab detection.
- `wwwroot/api/telemetry-admin.js` — production-only, bounded operator access to selected telemetry.

## Frame convention

The simulation world is `X = east`, `Y = up`, `Z = north`. three.js is right-handed with `-Z`
forward. Convert by negating world Z and build the rendered aircraft basis from the kernel frame:

```text
zAxis = -forward
xAxis = up × zAxis
basis = (xAxis, up, zAxis)
```

Do not reconstruct attitude from world-up or a scalar bank angle. That fails around vertical
flight and can reverse the apparent roll direction.

## Browser responsibilities

The shell may interpolate and smooth presentation, but it must not advance authoritative physics,
resolve hits, select AI tactics, grant contacts, or decide mission outcomes. Those decisions belong
to `SimulationSession`, allowing headless tests to exercise the game players actually receive.

The browser must also keep overlays lifecycle-aware. Briefing, help, and calibration surfaces hold
the session in Ready or Paused; a Finished outcome holds the authoritative terminal tick until the
pilot explicitly restages. Input focus changes must release held controls atomically.

Presentation objects are keyed by stable entity and presentation IDs from the snapshot. Pack
changes and entity replacement release old registry instances before attaching authored glTF or a
declared procedural fallback. The read-only `__gunsAssets` diagnostic surface exposes the resolved
pack, profile, asset, LOD, fallback, cache, and error state for browser verification.

The presence client publishes active local pose at 20 Hz, reduces inactive lifecycle heartbeats to
1 Hz, and interpolates arbitrary remote pilots in a renderer-owned entity map. These aircraft are
visual-only and do not feed the simulation, HUD, padlock, collision, or weapon code.
`__gunsMultiplayer.diagnostics()` exposes connection and room state for browser verification. The
checked-in `wwwroot/multiplayer-config.js` points both published and locally served shells at the
production room; use `?server=ws://localhost:5080/room` to exercise the local parity server, or
`?server=off` for isolated QA.

Production telemetry setup is documented in `wwwroot/SETUP.md`.
