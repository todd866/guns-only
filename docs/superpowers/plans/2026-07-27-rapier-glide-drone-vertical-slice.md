# Rapier Glide-Drone Vertical Slice Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Rapier’s deterministic `F` formation wipe with one physical reusable gun-drone that separates, shoots, forces bandit reaction, then turbines home to an intermittent pickup point.

**Architecture:** New friendly `RapierGunDrone` actor (own `AircraftSim` + `GunKill` + phase AI) spawned from Rapier on `F`. Scripted rail bandits promote to reactive against the drone inside a threat volume. Snapshot publishes `rd1_*` pose/alive fields; browser draws a distinct small mesh. Scale to four only after this slice is green.

**Tech Stack:** C# sim kernel (`FlightModel`, `SimulationSession`, doctrine), snapshot projection/hot frame, `scene_builders.js` / `app.js`, xUnit + node tests, OFT JSONL under `analysis/glide-drone-oft/`.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-27-rapier-glide-drone-vertical-slice-design.md`
- One drone per slice; authored load remains four; `F` consumes one
- No instant formation wipe (dev fallback flag default **off**)
- Same gun engagement rules as ownship
- Pickup ≠ Rapier arrestor
- TDD; `./bin/check` green; do not require player flight for CI
- Provisional numbers below are starting cards — change via params, not doctrine rewrites

### Provisional numbers (v1 card)

| Quantity | Value | Notes |
|---|---|---|
| Dry mass | 280 kg | Fuel-free |
| Release fuel | 80 kg (~176 lb) | Loiter + RTB |
| Wing area | 4.0 m² | Glide + turn after bleed |
| Span | ~5.5 m | Presentation + funnel |
| Turbine thrust | 1.8 kN max | Armed only below gate |
| Turbine arm | Mach ≤ 1.15 **and** alt ≤ 12 000 m | Glide until then |
| Skin limit | 593.15 K (320 °C) | Cheap structure; gates release |
| Ammo | 80 rounds | Same gun model |
| Sep offset | 25 m aft, 12 m below | Body axes at release |
| Sep hold | 1.5 s | No guidance / no fire |
| Threat volume | range ≤ 8 000 m | Bandit react |
| Pickup | strip origin + (−35 000, 180, −8 000) m | Quiet FARP ENU |
| Pickup radius | 400 m horiz, ±200 m | “Recovered” |

---

## File map

| File | Responsibility |
|---|---|
| `sim/FlightModel.cs` | `RapierGunDroneSurrogate` AircraftParams |
| `sim/RapierGunDrone.cs` | Actor + phase AI (Separate/Commit/RTB) + turbine gate |
| `sim/SimulationSession.cs` | Spawn on `F`, step drone, guns vs bandits, promote bandit react, stop wipe |
| `sim/Doctrine/Beats.cs` / env | Pickup waypoint on Rapier corridor if needed |
| `web/SnapshotProjection.cs` / `SnapshotHotFrame.cs` | `rd1_*` fields + remaining drones |
| `web/wwwroot/render/scene/scene_builders.js` | `createRapierGunDrone` mesh |
| `web/wwwroot/app.js` | Slot + briefing honesty |
| `docs/rapier-gun-drone-system.md` | Point at vertical slice; wipe no longer “shipped” |
| `sim.Tests/RapierGunDroneTests.cs` | Kernel slice tests |
| `sim.Tests/RapierGlideDroneOftTests.cs` | Agent OFT card + JSONL |
| `web/wwwroot/render/.../tests` | Presentation / wiring tests |

---

### Task 1: Drone airframe params

**Files:**
- Modify: `sim/FlightModel.cs`
- Test: `sim.Tests/RapierGunDroneTests.cs`

**Produces:** `FlightModel.RapierGunDroneSurrogate`

- [ ] **Step 1: Failing test** — assert params exist with MassKg≈360 at full fuel mass convention used by other cards, WingAreaM2=4.0, MaxThrustFraction>0, SkinTemperatureLimitK=593.15, FuelFreeMassKg=280.
- [ ] **Step 2: Run** — `GUNS_DOTNET_CLI=$HOME/.dotnet/dotnet DOTNET_ROOT=$HOME/.dotnet DOTNET_MULTILEVEL_LOOKUP=0 dotnet test sim.Tests/GunsOnly.Sim.Tests.csproj --filter RapierGunDroneTests --nologo` → FAIL missing type/params.
- [ ] **Step 3: Add** `RapierGunDroneSurrogate` with provisional card (mirror OneWayAttack / GliderStrike style comments: public-data surrogate, not an extant type).
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add Rapier gun-drone airframe surrogate params.`

---

### Task 2: RapierGunDrone actor + phase AI (unit)

**Files:**
- Create: `sim/RapierGunDrone.cs`
- Test: `sim.Tests/RapierGunDroneTests.cs`

**Produces:**
```csharp
public enum RapierGunDronePhase { Separate, Commit, Screen, Rtb, Recovered, Lost }
public sealed class RapierGunDrone {
  public RapierGunDronePhase Phase { get; }
  public AircraftSim Sim { get; }
  public GunKill Gun { get; }
  public bool TurbineArmed { get; }
  public bool StillActive { get; }
  public void Step(double dt, in AircraftState target, in Vec3D pickup, ...);
  public static RapierGunDrone SpawnFrom(in AircraftState carrier, ...);
}
```

- [ ] **Step 1: Failing tests**
  - Spawn inherits carrier speed/position with aft/below offset; Phase=Separate; throttle demand 0.
  - After sep hold, Phase→Commit; commands toward target.
  - When Mach≤1.15 and alt≤12 km, TurbineArmed true and thrust lever > 0 allowed.
  - When Commit ends (target dead or ammo 0), Phase→Rtb toward pickup; enter radius → Recovered.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: Implement** minimal AI using existing `PilotCommand` path (same as director style: bank/G/throttle). No new physics kernel.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Add RapierGunDrone actor with separate/commit/RTB phases.`

---

### Task 3: Session release replaces wipe

**Files:**
- Modify: `sim/SimulationSession.cs` (`ExecuteRapierFormationSweep` → release path)
- Modify: `sim.Tests/RapierMissionTests.cs` (authorization / sweep tests)
- Test: `sim.Tests/RapierGunDroneTests.cs` (session-level)

**Produces:** `Session.RapierGunDrones` (0–1 active), `RapierDogfightingDronesRemaining` decrements by 1

- [ ] **Step 1: Failing session test** — airborne Attack card, `F`, assert: remaining 3, one active drone, LiveOpponentCount still 4, cue contains `DRONE` / not `FORMATION DESTROYED`, no catastrophic wipe.
- [ ] **Step 2: Run** → FAIL (still wipe).
- [ ] **Step 3: Implement spawn; remove default wipe; optional `ScriptedInterceptConfig.DeterministicSwarmWipe` default false for old tests that opt in.
- [ ] **Step 4: Update** any tests that required instant wipe to either opt into wipe flag or assert new behavior.
- [ ] **Step 5: Run** RapierMission + GunDrone filters → PASS.
- [ ] **Step 6: Commit** `Release one physical gun-drone on F instead of wiping the formation.`

---

### Task 4: Bandit reaction to drone

**Files:**
- Modify: `sim/SimulationSession.cs` / bandit step path
- Test: `sim.Tests/RapierGunDroneTests.cs`

- [ ] **Step 1: Failing test** — after release, primary (or assigned) bandit is reactive / command bank or heading changes away from pure rail within N seconds when drone inside 8 km.
- [ ] **Step 2: Run** → FAIL.
- [ ] **Step 3: On release, swap rail controller for reactive (or NeutralMerge) with drone as pursuit target when in threat volume; otherwise may still track Rapier.
- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** `Make scripted contacts react when a gun-drone enters threat volume.`

---

### Task 5: Drone guns vs bandits

**Files:**
- Modify: `sim/SimulationSession.cs` weapons step
- Test: `sim.Tests/RapierGunDroneTests.cs`

- [ ] **Step 1: Failing test** — place drone nose-on in gun range with ammo; after ticks, bandit takes hits or dies via ordinary GunKill.
- [ ] **Step 2: Implement** Step drone gun toward assigned bandit; attribute kills to player side (swarm is Rapier’s weapon).
- [ ] **Step 3: Run** → PASS.
- [ ] **Step 4: Commit** `Let the released gun-drone shoot with ordinary gun rules.`

---

### Task 6: Snapshot + presentation

**Files:**
- Modify: `web/SnapshotProjection.cs`, `web/SnapshotHotFrame.cs` (layout version bump)
- Modify: `web/wwwroot/render/scene/scene_builders.js` — `createRapierGunDrone`
- Modify: `web/wwwroot/app.js` — register presentation id + slot `rd1`
- Test: hot frame sync tests; node scene test; guidance/briefing text

- [ ] **Step 1: Publish** `rd1_present`, `rd1x/y/z`, `rd1fx..`, `rd1_alive`, `rd1_phase` (int), turbine armed bool if cheap.
- [ ] **Step 2: Mesh** distinct from one-way attack drone and Rapier (smaller span, gun pods, no canopy).
- [ ] **Step 3: Briefing** — stop promising instant formation destroy; describe glide-drone release.
- [ ] **Step 4: Tests** green.
- [ ] **Step 5: Commit** `Show the released Rapier gun-drone in snapshot and scene.`

---

### Task 7: Pickup waypoint + OFT harness

**Files:**
- Modify: session / beat env for pickup ENU
- Create: `sim.Tests/RapierGlideDroneOftTests.cs`
- Create: `analysis/glide-drone-oft/README.md`
- Modify: `.gitignore` — `analysis/glide-drone-oft/*/`

- [ ] **Step 1: OFT card** `release-to-pickup` — start Attack geometry, release, assert sep → (optional gun) → turbine arm → Recovered or inside pickup radius within time bound; write JSONL schema `guns-only.glide-drone-oft.v1`.
- [ ] **Step 2: Run** → PASS with artifacts.
- [ ] **Step 3: Commit** `Add glide-drone OFT card for release through pickup.`

---

### Task 8: Docs + verify

**Files:**
- Modify: `docs/rapier-gun-drone-system.md`
- Run: filtered tests + `node --test` relevant; prefer `./bin/check` if time

- [ ] **Step 1: Update** system doc status — vertical slice in progress/shipped; wipe not the contract.
- [ ] **Step 2: Verify** acceptance list from spec.
- [ ] **Step 3: Commit** `Document the glide-drone vertical slice as the Attack contract.`

---

## Out of scope (do not sneak in)

- Four-drone coordinator / screen assignment
- Datalink-denied modes
- Landing on Rapier wires
- Perfect CFD separation
