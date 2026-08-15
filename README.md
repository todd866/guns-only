# Guns Only

Guns Only is a deterministic browser flight simulator built around mechanically honest aircraft,
projectively truthful instruments, and short missions that can be replayed and tested without a
renderer.

**Play the current production build:** [guns-only.com](https://guns-only.com)

## What is live now

The production catalogue exposes five accepted experiences:

- **F-22A surrogate — Guns Only:** an endless visual dogfight with ballistic guns, a real flight
  envelope, Auto-GCAS, padlock/target management, and a deterministic opponent.
- **Rapier — Intercept:** fly a visible high-speed path to three balloon mines at 45,000 ft,
  destroy their lethal drone payloads before deployment, then follow the RTB corridor and trap at
  the midpoint arrestor.
- **Cobra Canyon — Hold the Bridge / Ember Run:** fly the AH-1G through the River Gorge ground
  war, work the AI gunner, rearm at Camp Ember, and hold Iron Bell.
- **Weekend Ride:** take the YZF-R1 around the Rapier-strip circuit with authored motorcycle
  dynamics, rider assists, lap timing, and a helmet HUD.
- **Top Gun:** fly the F-14A in an escalating ACM fight with guns and two Sidewinders, then recover
  conventionally to the carrier in the anime-1986 presentation.

Additional mission code remains in the repository for development, but it is not silently
presented as finished product. Preview and quarantined routes show their release boundary before
they load and require an explicit `?preview=1` acknowledgement for deliberate testing. The
authoritative matrix is [docs/STATUS.md](docs/STATUS.md).

## Controls

Keyboard bindings can be changed in Settings. Defaults are:

| Action | Default |
| --- | --- |
| Pitch | **↓** pull / **↑** push |
| Roll | **← / →** |
| Rudder | **A / D** |
| Power | **W / S** |
| Guns | **F** |
| Padlock | **V** |
| Next contact | **Tab** |
| Hand off fight and return to base | **O** |
| Envelope override | **Space** |
| Auto-GCAS paddle | **K** |
| Gear | **G** |
| Flaps | **[ / ]** |
| Controls quicklook | **H** |
| Pause / resume | **Esc** |

On a phone, use the **left stick for throttle/yaw** and the **right stick for pitch/roll**. Guns
have a separate labelled button. Optional tilt contributes a small roll trim; it is not required
to fly.

## Product and evidence boundaries

- The simulation runs at a fixed 120 Hz with no wall-clock authority in the kernel.
- Presentation renders versioned snapshots and never invents combat, vehicle, mission, or medical
  truth.
- Aircraft and content declare whether their values are measured, surrogate, provisional, or
  fiction and retain source/licence records where applicable.
- Hosted flight diagnostics are **off by default**. A pilot must opt in from Settings; opting out
  clears unsent diagnostics. Core play does not require central telemetry.
- Medical and command experiments are fictional educational contexts, not clinical or operational
  guidance.

The broader product direction is [Cohort](docs/product-north-star.md): an open-source educational
game world in which aviation and medicine form the first connected spine. That document is a
north star, not a claim that every planned discipline is already available.

## Architecture

```text
sim/           deterministic simulation kernel and mission authority
sim.Tests/     physics, lifecycle, determinism, combat, recovery, and mission tests
web/           WebAssembly bridge, snapshot projection, renderer, HUD, and browser shell
server/        local parity server for the multiplayer protocol
world-worker/  Cloudflare Durable Object for persistent identities and sectors
content/       schemas and versioned presentation packs
tools/         content, asset, terrain, audio, performance, and telemetry tooling
docs/          architecture, accepted designs, status, sources, and dated evidence
bin/check      complete local release gate
```

`SimulationSession` is the lifecycle coordinator: it owns fixed-step time, Ready/Active/Paused/
Finished transitions, vehicle controls, mission state, resources, and outcomes. Mission runtimes
own their bounded domain state. The browser sends semantic input and renders the resulting
snapshot.

## Build and verify

Requires the .NET 8 SDK and Node.js 24, matching CI. The world-worker package requires Node 22 or
newer; using 24 locally keeps its real workerd startup test in the normal gate.

```sh
./bin/check
```

The gate validates content and licences, runs JavaScript and .NET suites, builds the release,
checks the publish closure, and drives silent browser smoke. GitHub Actions separates deterministic
checks from browser acceptance so a browser failure cannot erase the unit/content signal.

To serve a local release build manually:

```sh
dotnet publish web/GunsOnly.Web.csproj -c Release -o /tmp/guns-only-web
cd /tmp/guns-only-web/wwwroot && python3 -m http.server 8877
```

## Current status

Active development. Production, preview, quarantine, verification, and known-player-path status are
tracked in [docs/STATUS.md](docs/STATUS.md); dated handoffs are evidence for the build they name,
not evergreen status documents.
