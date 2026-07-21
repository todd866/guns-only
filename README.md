# Guns Only

Guns Only is a browser-first combat and maintenance-test-flight platform about the aircraft state
an experienced pilot perceives, the decisions they make, and the physical consequences that follow.
It is also the first proving ground for a broader decision-simulation substrate: hidden truth,
partial observations, equipment degradation, procedures, scarce resources, handoffs, and an
evidence-based debrief. Future domains can include casualty evacuation, medical-drone operations,
and austere medical-team training, while aviation remains the place where the core contracts are
made honest first.

**Play the current build:** [guns-only.vercel.app](https://guns-only.vercel.app) — desktop or
mobile, with nothing to install.

## The current slice

The playable prototype opens with the F-22: a fast, arcade-leaning guns-only program (the "Raptor
program") where you fly a public-data F-22A surrogate, fight a reactive bandit with ballistic guns,
and advance through performance-gated merges before a carrier-recovery conversion. The reduced-order
6DOF kernel also carries a Sabre-class F-86 energy model used by the carrier-recovery and
maintenance-test-flight exercises; the carrier simulation includes wind over deck, burble, moving
deck geometry, wire arrestment, bolters, and catapult relaunches. See
[docs/adr-0001-f22-first-arcade-pivot.md](docs/adr-0001-f22-first-arcade-pivot.md) for why the
opening leads with the F-22 rather than the historical Sabre.

The longer-term project is a two-era Korean campaign — deferred behind the F-22 opener as depth for
repeat players (see ADR-0001), not the current build. The historical
1950s side grows into early helicopters and maintenance-test-flight sorties. An explicitly
alternate-history 2030s side returns to the same peninsula for a US--China-shadowed drone proxy
war after a fictional rapid Taiwan fait accompli that never becomes a direct great-power war.
Modern fixed-wing drones and later multirotors get dynamics, controls, sensors, and operator
interfaces appropriate to them; both eras share terrain, environment, lifecycle, damage, and replay
foundations rather than era conditionals.

The longer-term platform shape is documented in
[docs/platform-architecture.md](docs/platform-architecture.md). The researched fact/fiction boundary,
divergence timeline, factions, environmental implications, and sortie hooks are in
[docs/world-backstory-research.md](docs/world-backstory-research.md). The first georeferenced terrain
crop, source stack, licence gates, vertical-datum handling, weather archives, and ingestion QA are
specified in [docs/korea-environment-data-sources.md](docs/korea-environment-data-sources.md).

Campaign authorship is governed by
[docs/content-governance.md](docs/content-governance.md). Its machine-readable campaign policy and
mission dossiers make the two-timeline braid, educational transfer loop, claim/source boundary,
progression allowlists, attrition fairness, perspective review, and release gates testable in
`bin/check`. The opening worked dossier begins with F-22 privilege, reframes it through a 1951 F-86
sortie, and returns at low level in an attritable drone; it remains explicitly in research status.

The current Korea presentation is a versioned content pack rather than renderer hard-coding. The
web snapshot carries stable entity, pack, profile, and presentation IDs; the browser resolves those
through the asset registry, including authored glTF models, screen-size LOD selection, and
procedural fallbacks. The modelling, socket, licensing, optimization, and staging contract is in
[docs/graphics-asset-pipeline.md](docs/graphics-asset-pipeline.md). Standalone Asset and Environment
Labs live under `web/wwwroot/` for inspecting work before it enters a sortie.

The engine, fuel, landing-gear, flap, failure, and emergency-procedure architecture is documented in
[docs/systems-simulation.md](docs/systems-simulation.md). Failures alter ordinary component state and
capability; scenarios do not choose a canned outcome.

Environment truth is also renderer-independent: the kernel now has U.S. Standard Atmosphere 1976,
bounded non-standard temperature/pressure soundings, altitude-vector wind profiles, deterministic
cloud decks and moving convective cells, optical attenuation, and bilinear terrain clearance/LOS.
The present Korea renderer still uses its inexpensive procedural sky/ocean presentation; sourced
Korean terrain tiles and sensor/icing integration are the next consumers of these contracts.

## Design principles

- **Decision-first controls.** Augmentation handles repetitive motor precision while the player
  chooses where to point, when to trade energy, when to shoot, and when to leave.
- **Mechanically honest combat.** Projectiles have time of flight and inherited launch velocity;
  aircraft and sensors should obey the same world rather than receiving privileged outcomes.
- **Vehicle-specific fidelity.** A fixed-wing fighter, a helicopter, and a multirotor do not share
  one fake parameter set. Each uses an appropriate dynamics provider behind a common session.
- **Deterministic by construction.** The simulation advances at a fixed 120 Hz and is testable
  without a renderer.
- **A complete sortie is the unit of play.** Briefing and Ready lead into combat, recovery, and a
  debrief—not an uncontrolled simulation already running behind an overlay.
- **Simulate situational awareness, not cockpit furniture.** Compute latent aircraft state, sensor
  power and failure propagation; present the smallest set of cues an experienced pilot would
  integrate. Screen space and GPU time are not spent imitating sheet metal around those cues.
- **Maintenance test flight is gameplay.** A known configuration, an uncertain symptom, a safe test
  point, a pilot action, an observed response, and a defensible diagnosis form a complete learning
  loop. The debrief judges evidence and procedure rather than whether the player guessed a hidden
  fault identifier.
- **Teach through consequence and transfer.** Let the player encounter an aviation problem, explain
  it briefly from recorded evidence, then ask them to apply it in another aircraft, era, or mission.
  Optional archives own depth, sources, disagreement, and declared simulation abstractions.

## Controls in the current build

| Action | Keyboard |
|---|---|
| Pitch | **↓** pull / **↑** push |
| Roll | **← / →** |
| Throttle | **W / S** |
| Envelope override | **Space** — high-q G-limit release / low-q high-alpha authority |
| Guns | **F** |
| Padlock | **V** |
| Landing gear | **G** |
| Flaps | **[** retract / **]** extend (hold) |
| Restart / select exercise | **R / 1–8** |

Landing gear and flaps apply only to airframes that simulate those systems (the carrier-recovery and
maintenance exercises); the F-22 opener has no retractable gear or flaps.

On mobile, the browser build provides an on-screen throttle, tilt-to-roll, and a fire button.

## Architecture

The web application is the only supported presentation shell. Rendering and input are plain
JavaScript with three.js and a canvas HUD; the deterministic C# kernel is compiled to WebAssembly.

```text
sim/          pure .NET simulation kernel and presentation-independent SimulationSession
sim.Tests/    unit, accuracy, determinism, carrier, combat, and sortie-lifecycle tests
web/          canonical browser shell: WebAssembly bridge, three.js renderer, HUD, input
server/       local ASP.NET parity server for the versioned multiplayer protocol
world-worker/ persistent Cloudflare Durable Object, identities, sectors, and AI bogeys
content/      schemas, campaign governance, mission dossiers, and versioned era/presentation packs
tools/assets/ deterministic asset validation, inspection, generation, and web staging
tools/content/ campaign/dossier schema and cross-document governance validation
docs/         current platform architecture plus dated research and design records
bin/check     aggregate JavaScript, .NET, test, and publish verification
```

`SimulationSession` is the authoritative production lifecycle boundary: it owns fixed-step time,
mission staging, Ready/Active/Paused/Finished state, controls, combat, resources, carrier recovery, and
outcomes. Presentation code translates input into session commands and renders a versioned
snapshot. Stable presentation IDs select pack assets; display names and mission-name regular
expressions do not.

Multiplayer is one persistent global world. Browser identities retain a callsign and world sector;
sectors are separated by at least 40 km, connected pilots publish validated poses at 20 Hz, and
three durable, computer-generated bogeys patrol each active sector. Remote pilots and world bogeys
are still outside combat authority: they cannot yet collide, enter padlock/HUD targeting, or
exchange gun damage. See [server/README.md](server/README.md) for architecture and deployment setup.

## Build and verify

The project requires the .NET 8 SDK and Node.js. Run the complete local gate from the repository
root:

```sh
./bin/check
```

To serve a release build manually:

```sh
dotnet publish web/GunsOnly.Web.csproj -c Release -o /tmp/guns-only-web
cd /tmp/guns-only-web/wwwroot
python3 -m http.server 8877
```

Then open `http://localhost:8877/`.

## Status

Playable prototype under active development. **One Honest Sortie** now has an explicit
Ready/Active/Paused/Finished lifecycle, mutually physical guns, player and opponent damage,
ordered combat events, durable outcomes, and airframe-specific fuel/loadout rules in the production
session and web build. The remaining milestone work is fallible contact belief, generic weapon and
damage components, and a real debrief/scoring pass.
