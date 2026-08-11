# Cobra Crash/Contact Envelope (Build A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Botched flying ends in a crash with a named cause — uncompensated full collective, spins, rollovers and no-flare autorotations terminate; a flared landing and a well-flown auto survive.

**Architecture:** Extend the existing four-point skid contact resolution in `Ah1gCobraDynamics.ResolveSkidAndRotorContact` with rollover/spin latches and a gear-damage tier, all driven by named `RotorcraftContactDefinition` thresholds. Surface the failure cause and touchdown measurements through the observation → `CobraWebBridge` → cobra-lab terminal banner. Prove the autorotation energy budget closes with scripted test pilots before trusting the envelope.

**Tech Stack:** .NET 8 sim (`~/.dotnet/dotnet`, xUnit), node 24 web tests (`~/.nvm/versions/node/v24.18.1/bin`), cobra-lab live-page QA via `window.__gunsOnlyCobraAuthority`.

## Global Constraints

- **Sink rate alone decides a hard impact on a flared landing** — pitch/roll must never re-penalize a 15–25° nose-up flare (owner doctrine; the rollover latch uses bank + lateral velocity, which a straight flare does not produce).
- **One engine doctrine:** all evaluations read existing sim state; no forked physics, no presentation-side judgment.
- **Every new gate gets a control experiment:** the test is written first and demonstrated to fail against pre-change code before the implementation lands.
- **Determinism:** no randomness anywhere in the envelope.
- Env for all C# runs: `DOTNET_ROOT="$HOME/.dotnet" DOTNET_MULTILEVEL_LOOKUP=0 "$HOME/.dotnet/dotnet" test sim.Tests/GunsOnly.Sim.Tests.csproj --nologo -v minimal --filter "FullyQualifiedName~<name>"`.
- Stage explicit paths only (never `git add -A`); worktree `.worktrees/cobra-hud-waterline-launchpad`, branch `feature/cobra-fights-back`.

---

### Task 1: Contact-envelope thresholds in the definition

**Files:**
- Modify: `sim/Vehicles/Rotorcraft/RotorcraftDefinition.cs` (record `RotorcraftContactDefinition`, ~line 86, and its validation, ~line 251)
- Modify: `sim/Vehicles/Rotorcraft/Ah1gCobraDefinition.cs` (`Contact:` initializer, ~line 99)
- Test: `sim.Tests/Vehicles/Rotorcraft/Ah1gCobraDynamicsTests.cs`

**Interfaces:**
- Produces: `Contact.GearDamageNormalSpeedMps` (double, 3.0), `Contact.RolloverBankRad` (double, 0.35), `Contact.RolloverLateralSpeedMps` (double, 1.5), `Contact.SpinContactYawRateRadPerSecond` (double, 0.52). Tasks 2–4 read these via `cobra.Definition.Contact.*`.

- [ ] **Step 1: Write the failing test** (in `Ah1gCobraDynamicsTests`):

```csharp
[Fact]
public void ContactEnvelopeThresholdsAreOrderedAndPositive()
{
    RotorcraftContactDefinition contact = Create("contact-thresholds").Definition.Contact;
    Assert.InRange(contact.GearDamageNormalSpeedMps, 2.0, 4.0);
    Assert.True(contact.GearDamageNormalSpeedMps < contact.HardImpactNormalSpeedMps,
        "Gear damage must trip before the hard-impact kill.");
    Assert.InRange(contact.RolloverBankRad, 0.25, 0.50);
    Assert.InRange(contact.RolloverLateralSpeedMps, 1.0, 2.5);
    Assert.InRange(contact.SpinContactYawRateRadPerSecond, 0.35, 0.80);
}
```

- [ ] **Step 2: Run it — expect FAIL** (`--filter "FullyQualifiedName~ContactEnvelopeThresholds"`), compile error: members do not exist.
- [ ] **Step 3: Add the four record parameters** after `StableContactHorizontalSpeedMps` in `RotorcraftContactDefinition`, with validation lines following the existing `Positive(...)`/`NonNegative(...)` idiom (all four `Positive`). Values in `Ah1gCobraDefinition`: `GearDamageNormalSpeedMps: 3.0` (skid design-sink territory), `RolloverBankRad: 0.35`, `RolloverLateralSpeedMps: 1.5`, `SpinContactYawRateRadPerSecond: 0.52` (30°/s).
- [ ] **Step 4: Run test — expect PASS.** Also run the full dynamics filter (`FullyQualifiedName~Ah1gCobraDynamicsTests`) — all pre-existing tests must stay green.
- [ ] **Step 5: Commit** `sim/Vehicles/Rotorcraft/RotorcraftDefinition.cs sim/Vehicles/Rotorcraft/Ah1gCobraDefinition.cs sim.Tests/Vehicles/Rotorcraft/Ah1gCobraDynamicsTests.cs` — message: `Name the contact envelope: gear-damage, rollover, and spin thresholds.`

### Task 2: Rollover, spin, and gear-damage latches at contact

**Files:**
- Modify: `sim/Vehicles/Rotorcraft/Ah1gCobraDynamics.cs` (`ResolveSkidAndRotorContact`, ~line 1003; latch fields near `_hardImpactLatched` ~line 46; `flyable` stays `!_hardImpactLatched && !_rotorStrikeLatched` ~line 535)
- Test: `sim.Tests/Vehicles/Rotorcraft/Ah1gCobraDynamicsTests.cs`

**Interfaces:**
- Consumes: Task 1 thresholds.
- Produces: `public VehicleContactFailureCause LastContactFailureCause { get; }` (enum `None|HardImpact|Rollover|SpinContact|RotorStrike`, new type in `sim/Vehicles/PlayerVehicleContracts.cs`), `public bool GearDamaged { get; }`, `public ContactTouchdown LastTouchdown { get; }` (readonly record struct: `SinkMps`, `LateralMps`, `YawRateRadPerSecond`, all doubles, captured at every grounded tick's first-contact transition). Tasks 3–4 read all three.

- [ ] **Step 1: Write the failing tests.** Construction helper: spawn just above ground and advance one tick so contact resolves with an authored velocity/attitude. Follow the file's `Create(id, position, velocity)` idiom (`Create` positions at y=500 by default — pass `position: new Vec3D(0.0, <just above terrain>, 0.0)`; terrain height at origin in these tests is the flat sample the existing landing tests use — copy their setup, see the `FailEngine` tests near line 867 for the pattern). Cases:

```csharp
[Fact]
public void FlaredTouchdownAtDesignSinkStaysCleanAndFlyable()
{
    // 2.0 m/s sink, 20 deg nose-up, wings level: the attitude-blind guarantee.
    // Assert: no latch, GearDamaged false, LastContactFailureCause None, flyable true.
}

[Fact]
public void FirmTouchdownAboveDesignSinkDamagesGearWithoutKillingAuthority()
{
    // 4.0 m/s sink, level: GearDamaged true, flyable STILL true, cause None.
}

[Fact]
public void BankedDriftingContactLatchesRollover()
{
    // 1.0 m/s sink, 25 deg bank, 2.0 m/s lateral velocity toward the low skid:
    // cause Rollover, flyable false.
}

[Fact]
public void SpinningContactLatchesSpinContact()
{
    // 1.0 m/s sink, level, yaw rate 40 deg/s: cause SpinContact, flyable false.
}

[Fact]
public void TouchdownMeasurementsAreRecorded()
{
    // The 4.0 m/s case: LastTouchdown.SinkMps within [3.8, 4.2]; lateral/yaw ~0.
}
```

Write them as real tests with exact `Vec3D`/attitude construction copied from the existing landing tests in the same file.

- [ ] **Step 2: Run — expect FAIL** (missing members / missing behavior). This is the control experiment: record in the commit message that the rollover/spin/gear cases fail against the pre-change dynamics.
- [ ] **Step 3: Implement.** In `ResolveSkidAndRotorContact`, inside the grounded branch (after `normalImpactSpeedMps` is computed, before the friction/kind block):

```csharp
Vec3D bodyVelocity = attitude.InverseRotate(velocity);
double lateralSpeedMps = Math.Abs(bodyVelocity.X);
(double contactPitch, double contactRoll, _) =
    PlayerVehicleValidation.AttitudeAngles(attitude);
bool freshContact = contactWasAirborneLastTick; // track with a bool field set in the airborne branch
if (freshContact)
    _lastTouchdown = new ContactTouchdown(
        normalImpactSpeedMps, lateralSpeedMps, Math.Abs(rates.R));
if (normalImpactSpeedMps > geometry.GearDamageNormalSpeedMps)
    _gearDamagedLatched = true;
if (Math.Abs(contactRoll) > geometry.RolloverBankRad
    && lateralSpeedMps > geometry.RolloverLateralSpeedMps)
{
    _hardImpactLatched = true;
    _contactFailureCause = VehicleContactFailureCause.Rollover;
}
if (Math.Abs(rates.R) > geometry.SpinContactYawRateRadPerSecond)
{
    _hardImpactLatched = true;
    _contactFailureCause = VehicleContactFailureCause.SpinContact;
}
```

Set `_contactFailureCause = VehicleContactFailureCause.HardImpact` at the existing sink-rate latch (only if cause is still `None` — first cause wins), and `RotorStrike` at the rotor-strike latch. If `attitude.InverseRotate` does not exist on `QuaternionD`, use the conjugate rotate the file already uses for body-frame work — search `Rotate(` call sites first and follow the existing idiom.

- [ ] **Step 4: Run all five new tests + the full dynamics filter — expect PASS, no regressions.** Pay attention to `FlaredTouchdownAtDesignSinkStaysCleanAndFlyable` — if it fails, the implementation violated the attitude-blind constraint; fix the implementation, never the test.
- [ ] **Step 5: Commit** with the control-experiment note in the message.

### Task 3: Cause and touchdown surfaced to the page

**Files:**
- Modify: `web/CobraWebBridge.cs` (vehicle snapshot block, ~line 324 — the same block that carries `body_pitch_rate_rad_s`)
- Create: `web/wwwroot/render/cobra/cobra_terminal_causes.js`
- Modify: `web/wwwroot/cobra-lab/main.js` (terminal banner region, comment "Every terminal state gets an explicit outcome + cause", ~line 1048)
- Test: `web/wwwroot/render/cobra/tests/cobra_terminal_causes.test.mjs`

**Interfaces:**
- Consumes: Task 2's `LastContactFailureCause`, `GearDamaged`, `LastTouchdown`.
- Produces: snapshot fields `contact_failure_cause` (string: `"none"|"hard-impact"|"rollover"|"spin-contact"|"rotor-strike"`), `gear_damaged` (bool), `touchdown_sink_mps`, `touchdown_lateral_mps`, `touchdown_yaw_rate_rad_s` (numbers); JS `cobraTerminalCauseCopy(cause)` returning `{ title, detail }`.

- [ ] **Step 1: Write the failing node test** — `cobraTerminalCauseCopy("rollover")` → title `"ROLLOVER"` and a one-sentence detail; unknown/none → null (banner shows the existing generic copy). Exact copy for the four causes:
  - `hard-impact`: "HARD IMPACT — sink rate exceeded the gear's limits."
  - `rollover`: "ROLLOVER — banked, drifting contact dug in a skid."
  - `spin-contact`: "SPIN CONTACT — touched down still yawing."
  - `rotor-strike`: "ROTOR STRIKE — the main rotor met the ground."
- [ ] **Step 2: Run (`node --test web/wwwroot/render/cobra/tests/cobra_terminal_causes.test.mjs`, Node 24) — expect FAIL.**
- [ ] **Step 3: Implement** `cobra_terminal_causes.js` (pure module, no imports, mirroring `cobra_helicopter_fpv.js` style); add the five bridge fields reading `runtime.Cobra.LastContactFailureCause` (kebab-cased via a switch), `GearDamaged`, `LastTouchdown.*`; wire the lab banner to append the cause copy when `contact_failure_cause !== "none"`. Import in main.js with the current `?v=` pin (312 after the stamp task — use the current pin at implementation time and let the stamp sweep rewrite it).
- [ ] **Step 4: Run the node test + `node --check web/wwwroot/cobra-lab/main.js` — PASS.** C# compile via the dynamics test filter run.
- [ ] **Step 5: Commit.**

### Task 4: Autorotation energy audit

**Files:**
- Test: `sim.Tests/Vehicles/Rotorcraft/Ah1gCobraDynamicsTests.cs` (the existing `FailEngine()` tests near lines 867–912 are the scripting idiom — read them first)

**Interfaces:**
- Consumes: Tasks 1–2. No new public surface — this task PROVES the envelope, and only if the budget cannot close does it add one named tuning constant (see Step 4).

- [ ] **Step 1: Write both scripted-pilot tests** (failing or passing — this task's TDD target is the *measurement*, so the assertion bounds come from the first instrumented run):

```csharp
[Fact]
public void NoFlareAutorotationEndsInAHardImpact()
{
    // 150 m AGL, 20 m/s forward, FailEngine(), collective held at trim, no flare.
    // Advance until contact (cap 3600 ticks). Assert flyable false and
    // LastContactFailureCause is HardImpact (or RotorStrike), and
    // LastTouchdown.SinkMps > Contact.HardImpactNormalSpeedMps.
}

[Fact]
public void FlownAutorotationTouchesDownSurvivably()
{
    // Same entry; script: collective to 0.10 within 1 s of failure, hold glide,
    // then from 20 m AGL aft cyclic flare, from 8 m AGL collective pop to 0.9.
    // Assert flyable true and LastTouchdown.SinkMps < Contact.HardImpactNormalSpeedMps.
    // Include the measured sink/Nr trace in the assertion message.
}
```

- [ ] **Step 2: Run both.** The no-flare case must pass Task 2's machinery as-is. The flown case is the audit: read the failure message's measured touchdown sink and stored-Nr trace.
- [ ] **Step 3: If the flown case closes** (sink < 6.5 with a plausible script): tighten its assertion to the measured margin (e.g. `< GearDamageNormalSpeedMps + 1.0`), and the audit is done.
- [ ] **Step 4: Only if it cannot close:** the flare is energy-starved; add ONE named constant (`AutorotationFlareThrustFactor`, applied where stored rotor energy converts to thrust during collective pop — locate via the autorotative overspeed handling near the governor, `rotorAngularAcceleration` clamp ~line 433) with a doc note in `docs/airframes/ah-1g-cobra/10-flight-model.md`, before/after traces in the commit message, and re-run both tests. Do not touch the climb-droop or hover power paths (`cobra-rotor-governor-and-vrs-trap` memory: hover legitimately draws 93%).
- [ ] **Step 5: Run the FULL dynamics filter + commit.**

### Task 5: The Kind==None quiet-fail check

**Files:**
- Investigate: `rg -n "ContactKind|contact.Kind|VehicleContactKind" sim/ web/ --type cs` and `rg -n "contact" web/wwwroot/render/cobra/*.js`

**Interfaces:** none new.

- [ ] **Step 1:** The `landing-is-physics-not-procedure` memory records a diagnosed "Kind==None short-circuits and fails quiet" in the landing path. Find every consumer of contact kind and check for an early return that suppresses landing/recovery evaluation when the kind is `None`/absent.
- [ ] **Step 2:** If found: failing test → fix → pass → commit. If NOT found (the defect may have been fixed since): update the memory file `landing-is-physics-not-procedure.md` to record it checked-and-absent at this commit, and note it in the eventual PR body. Do not invent a fix for a defect that no longer exists.

### Task 6: Ship Build 312

**Files:** `docs/STATUS.md`, stamp sweep (28 files via `bin/stamp-release --next 312`)

- [ ] **Step 1: Live-page QA** — publish (`dotnet publish web/GunsOnly.Web.csproj -c Release -o <scratch>/preview`), serve with `python3 -m http.server`, drive `/cobra-lab/index.html?audioQa=silent` via `window.__gunsOnlyCobraAuthority` + synthetic KeyboardEvents (W = collective pull): reproduce all four acceptance scenarios (full-pull departure → eventual terminal card with cause; no-flare auto → crash card; flared auto → survivable; normal landing → clean), screenshot the cause cards, read them.
- [ ] **Step 2: Adversarial review** — `cursor-opinion` with the changed files AND their test files in the `--file` bundle; Codex `--mode diff` scoped web-only (its sandbox has no .NET 8 — say so in the focus so it doesn't burn its budget on `dotnet test`).
- [ ] **Step 3:** Reconcile `docs/STATUS.md` (Cobra row evidence + candidate line) → commit; `bin/stamp-release --next 312` → commit (stamp LAST); full gate with the Node-24 env; `grep GATE_EXIT`/final line must read "Guns Only checks passed".
- [ ] **Step 4:** Push, PR to main (body: scenarios, measurements, control-experiment notes, review adjudications), CI (re-run once on a `boot does not stutter` flake, per precedent), merge, deploy from the prepped `deploy-266` worktree (now on main; `npm ci` already done there), verify `https://guns-only.com/api/build-info` reports 312.

## Self-review notes

- Spec coverage: Build A of the spec = work-order scope: envelope tiers (Tasks 1–2), cause cards (Task 3), autorotation audit (Task 4), quiet-fail check (Task 5), telemetry (Task 3's five fields), ship (Task 6). Build B/C are NOT this plan.
- The rollover condition intentionally requires BOTH bank and lateral drift, so a banked-but-stationary settling and a straight flare both stay clean (attitude-blind constraint).
- Type names introduced once and reused: `VehicleContactFailureCause`, `ContactTouchdown`, `cobraTerminalCauseCopy` — later tasks must match these exactly.
