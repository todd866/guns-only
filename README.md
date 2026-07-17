# Guns Only

A flat-screen, laptop-native, guns-only 1v1 jet-drone dogfight — flown on a full aerodynamic
model through a novel doctrine-detent keyboard control scheme, presented first-person through
the drone's sensor feed, and debriefed like a real sortie. No joystick, no switchology, no
missiles of your own.

## The thesis

Near-future Taiwan Strait. Taiwan can't afford $100M interceptors against $50k attack drones —
the cost-exchange math loses the war even while winning every engagement — so the answer is
cheap, attritable jet drones with guns instead of missiles. That argument (cost-exchange,
magazine depth, kill-the-enablers, delivery-as-escalation-axis) *is* the game's thesis, not a
skin painted over a generic dogfight game: this project exists to show what the *next* war
looks like, rather than build another high-fidelity museum piece of the last one. The strategy
layer's job is to be **true**; the dogfight's job is to be **fun**; the dogfight is the gateway
drug to the argument. Full design reasoning, derivations, and honesty flags on what's a design
choice vs. what's load-bearing physics: [`docs/superpowers/specs/2026-07-16-guns-only-design.md`](docs/superpowers/specs/2026-07-16-guns-only-design.md) (v4).

## Current state (2026-07-17)

**M0 — the grammar slice — is built. The feel gate has not yet been flown.** 90 unit tests pass,
but code gates are not gameplay gates: the real defects in this build so far (invisible pull,
a pitch ladder that rolled against the horizon, the edge of the world visible at 70,000 ft, a
kinematically impossible mission) were all found by rendering and looking, or by flying — never
by the test suite. Known gaps right now:

- 2 of the 3 core BFM beats never converge to a firing solution — the canned M0 execution laws
  fly toward the bandit but don't close to a tracking window. That's not a bug, it's the M3
  doctrine engine's job.
- The gun is **dry** — trigger, tracking geometry, and "shot taken" telemetry all work, but
  there's no ballistics, no damage, no kill yet. That's M4.
- Beat 4 (the balloon-glider strike on a PLA airborne early-warning aircraft) needs its
  geometry redesigned around a diving slashing pass; the original tail-chase version is
  physically impossible for an engineless glider against a 250+ kt target.

## Running it

```
bin/fly
```

Builds the C# kernel and launches the game through the CLI Godot binary. Equivalently, open
the project in Godot 4.7 (.NET/mono edition) — the Desktop app — and press Play.

### Keys (as flown, not as originally drafted — see the spec's §7 for why)

| Key | Does |
|---|---|
| **DOWN** | Pull (stick-back convention: back = positive G = nose up) |
| **UP** | Push / unload |
| **SPACE** (hold) | Override — pull past envelope protection into the buffet, at your own risk |
| **LEFT / RIGHT** | Roll |
| **A / D** | Rudder |
| **W / S** | Throttle (detented) |
| **F** | Guns (currently dry) |
| **V** | Padlock toggle / reacquire |
| **X** | Cage/uncage sight |
| **K** | Knock it off |
| **R** | Restart current beat |
| **1–4** | Select scenario beat |
| **F1** | Toggle doctrine-valley variant (A/B feel-gate test) |
| Trackpad drag | Freelook / sensor gimbal slew |
| Two-finger scroll | View zoom |

Bare arrows can never depart the aircraft — that's the whole point of the detent grammar.
Holding SPACE is the only way past protection.

## Testing it

Three tools, three different questions:

- **`bin/mission <scenario>`** — fast, headless, no rendering. Runs a scenario through the real
  sim and prints a mission-level verdict (min range, whether a gun window opened, shots inside
  it). ~60× faster than rendering; use this for "did the intercept work" questions, which are
  pure physics.
- **`bin/rig <scenario>`** — runs the same scenario through Godot movie-mode frame capture.
  Use this for "does it *look* right" questions telemetry can't answer.
- **`bin/replay [list | <segment>]`** — re-renders a real recorded session (human or
  rig-driven) through `bin/rig` unchanged. The black-box recorder in `bridge/SimBridge.cs` is
  always on, so any human flight becomes a re-renderable scenario for free.
- **`dotnet test`** — 90 unit tests over the pure C# sim kernel.

Scenario files live in `testrig/scenarios/*.json`; output lands in `testrig/out/`.

## Repo layout

| Path | What |
|---|---|
| `sim/` | Pure C# sim kernel — flight dynamics, doctrine engine, detent/key grammar, camera solver. No Godot dependency; headless-runnable. |
| `sim.Tests/` | Unit tests for the kernel (`dotnet test`). |
| `bridge/` | `SimBridge` — the Godot node that steps the kernel at 120 Hz, exposes HUD state, and always-on records sessions for replay. |
| `game/` | Godot scene, input adapter, camera rig, HUD, shaders — the playable shell. |
| `testrig/` | Scripted scenarios (`scenarios/*.json`), the `Rig` autoload, frame/telemetry output. |
| `spikes/` | M0 hardware/feasibility spikes (chord ghosting, gesture momentum, altitude look, render ULP). |
| `docs/` | Design spec, prior-art survey, airframe-derivation brief, M0 gate checklist. |
| `bin/` | `fly`, `mission`, `rig`, `replay`, `godot` — the harness. |

## Design doc

The authoritative design spec, including the full derivation of the airframe family, the
threat ladder, the doctrine engine, and an honest accounting of what's proven vs. what's still
a design choice, lives at
[`docs/superpowers/specs/2026-07-16-guns-only-design.md`](docs/superpowers/specs/2026-07-16-guns-only-design.md).
