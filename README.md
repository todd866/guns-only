# Guns Only

A browser-based guns-only dogfight simulator. You fly a public-data F-22A surrogate against a
reactive AI bandit with ballistic guns — no missiles, no radar game, just angles, energy and a
gunsight.

**Play it:** [guns-only.vercel.app](https://guns-only.vercel.app) — desktop or mobile, nothing to
install.

## What's in the build

An endless gauntlet. The opening wave is a pair of Aces and the fight director eases from there on
evidence: it watches how you actually flew — hits taken, seconds of gun solution conceded,
overshoots, energy floor — and moves the pilot tier, the opponent's airframe, and the number of
aircraft you face independently, so the ladder stays hard without becoming monotonous.

The bandits are not scripted. The higher tiers run a deterministic short-horizon lookahead, fight in
the vertical, and convert to gun solutions rather than being handed extra G. Everything in the
kernel is deterministic: a fixed 120 Hz step with no RNG and no wall clock, so a sortie is
reproducible and testable without a renderer.

The HUD is held to projective truth rather than game feel — an EEGS-style funnel drawn along the
real ballistic locus, an FPV whose gap below the waterline is exactly alpha — and every HUD change
is gated by a screenshot and assertion harness
([docs/hud-symbology-notes.md](docs/hud-symbology-notes.md)).

The same kernel carries an F-86 energy model used by the carrier-recovery and maintenance
exercises, reachable with **1–8**: wind over deck, burble, wire arrestment, bolters, catapult
relaunches, and system-failure diagnosis sorties.

## Controls

| Action | Keyboard |
|---|---|
| Pitch | **↓** pull / **↑** push |
| Roll | **← / →** |
| Throttle | **W / S** |
| Guns | **F** |
| Padlock on / off | **V** |
| Next contact | **Tab** |
| Envelope override — high-q G-limit release / low-q high-alpha authority | **Space** |
| Auto-GCAS paddle (hold to refuse a fly-up) | **K** |
| Controls quicklook | **H** |
| Landing gear | **G** |
| Flaps | **[** retract / **]** extend (hold) |
| Restart / select exercise | **R / 1–8** |

Gear and flaps apply only to airframes that simulate them; the F-22 has neither. On mobile there's
an on-screen throttle, tilt-to-roll, and a fire button.

## Architecture

A deterministic C# kernel compiled to WebAssembly, with a plain-JavaScript three.js renderer and a
canvas HUD.

```text
sim/           simulation kernel and presentation-independent SimulationSession
sim.Tests/     unit, accuracy, determinism, combat, and sortie-lifecycle tests
web/           browser shell: WebAssembly bridge, three.js renderer, HUD, input
server/        local parity server for the multiplayer protocol
world-worker/  persistent Cloudflare Durable Object for identities and sectors
content/       schemas and versioned presentation packs
tools/         asset, terrain, and telemetry tooling
docs/          architecture, dated design records, and research
bin/check      the full JavaScript + .NET + publish gate
```

`SimulationSession` is the authoritative lifecycle boundary: it owns fixed-step time, mission
staging, Ready/Active/Paused/Finished, controls, combat, resources and outcomes. Presentation
translates input into session commands and renders a versioned snapshot — it never owns truth.

## Design principles

- **Decision-first controls.** Augmentation handles repetitive motor precision; you choose where to
  point, when to trade energy, when to shoot, and when to leave.
- **Mechanically honest combat.** Projectiles have time of flight and inherited launch velocity.
  Nobody gets privileged outcomes, including the AI.
- **Deterministic by construction.** Fixed 120 Hz, no RNG in the kernel, testable headless.
- **Simulate situational awareness, not cockpit furniture.** Compute latent aircraft state and
  present the smallest set of cues an experienced pilot would integrate. Screen space is not spent
  imitating sheet metal.
- **Sports are meant to be hard.** The AI has to be able to kill you. The difficulty budget is spent
  on it denying your tail position and on its own offence — never on bullet-sponge health or
  finicky player guns.

## Build and verify

Requires the .NET 8 SDK and Node.js.

```sh
./bin/check
```

To serve a release build manually:

```sh
dotnet publish web/GunsOnly.Web.csproj -c Release -o /tmp/guns-only-web
cd /tmp/guns-only-web/wwwroot && python3 -m http.server 8877
```

## Where this is going

Plans, not promises — the dogfight is the first rung.

The near work is a two-era Korean campaign sharing one kernel: the historical 1950s side, and an
explicitly alternate-history 2030s side built around attritable drones and the **air littoral**. The
longer arc is simulation as a teaching instrument beyond aviation, eventually including medical
training — the transferable asset is the honest-kernel-and-honest-instruments discipline, not the
aircraft.

Deeper background lives in [docs/platform-architecture.md](docs/platform-architecture.md),
[docs/world-backstory-research.md](docs/world-backstory-research.md) and the dated design records
under `docs/`.

## Status

Playable prototype under active development.
