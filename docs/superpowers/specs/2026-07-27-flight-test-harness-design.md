# Flight-test harness — how does this airplane work?

Status: Design approved 2026-07-27 · First subject: `FlightModel.RapierPublicDataSurrogate` ·
Evidence: Build 148 production tape `web-1785130068951` (γ≈62° accelerating through M1.2 on
turbine alone; effective T/W≈2.0) · Child of `docs/research/drone-derivation-brief.md`,
`docs/2026-07-26-open-work-and-findings.md` (engine buffed, not verified), and the existing
comment on `RapierPublicDataSurrogate`: *"PREDICTIONS until measured against AircraftSim."*

## Purpose (long run)

This project teaches aeronautical theory by putting the student in a jet whose dynamics are
**verifiably correct**, then missionizing that jet into a teaching task. A fun-but-wrong airplane
teaches the wrong lesson. The flight-test harness is how we keep the classroom honest: every
airframe that carries a teaching sortie must survive Identity → Point → Dynamic → Mission as one
system, so Ps, climb, specific range, and energy management on the HUD are the same physics the
brief claims.

Missionization (Rapier intercept, circuits, dogfight drills) is downstream. Accuracy is upstream.
If the motor is a homesick angel, the student learns that vertical accel through Mach 1 is normal —
and that is a failed teaching product, not a balance preference.

## Thesis

Mission tests ask **can the script finish?** A homesick-angel jet still goes green.

Point-map tests (J47) ask **does this operating point match an anchor?** The TurboRamjet has no
anchors, so buffs land as constants.

The drone-derivation brief asks **is this design coherent on paper?** It is a prompt, not a gate.

None of those answer the question a flight-test engineer asks of a paper airplane:

> **How does this system work — and where is it lying?**

That question is one system, not four dashboards. Mass, thrust, Ps, climb angle, specific range,
thermal limit, and sortie energy are coupled. Changing `ThrustMaxN` to “fix” the transonic rise
is a redesign of the airplane. Today CI cannot see that. The harness must.

Jobs the harness owns, together:

1. **Buff-creep** — mission green because someone turned the motor up
2. **Unbelievable feel** — homesick-angel climbs / free energy, with a numeric fail
3. **Paper ↔ kernel drift** — design record says one aircraft; kernel flies another
4. **Engineering understanding** — a readable report that walks Identity → Engine → Energy →
   Flight test → Mission closure → Findings

## Non-goals (v1)

- Full station-by-station cycle deck (the TurboRamjet stays a surrogate; the harness *hosts* a
  better deck later without changing its interface)
- HUD / web UI / Canvas dashboard
- Replacing `RapierMissionTests` (they stay; this sits under them as the physics contract)
- Certifying real aircraft or claiming the surrogate is a real engine
- Automatic retuning (the harness fails; a human changes Identity or the motor deliberately)

## Architecture

One deep module. Small interface, large behaviour.

```text
                    ┌─────────────────────────────────────┐
                    │  FlightTest.Evaluate(subject, prog) │
                    └─────────────────┬───────────────────┘
                                      │
                                      ▼
┌──────────┐   ┌──────────┐   ┌──────────────┐   ┌────────────────┐
│ Identity │ → │  Point   │ → │   Dynamic    │ → │    Mission     │
│ (claims) │   │ perform. │   │ flight test  │   │    energy      │
└──────────┘   └──────────┘   └──────────────┘   └────────────────┘
     │              │                │                    │
     └──────────────┴────────────────┴────────────────────┘
                                      │
                                      ▼
                         FlightTestReport (how it works
                         + pass/fail + findings)
```

**Layers must agree.** A contradiction between layers is a fail, not a vibe. Example from the
Build 148 tape: dry T/W at gross is ~0.90 (85 kN / 9.65 t), but AB at climb weight measured
~2.08 with max γ while accelerating through M1.2 ≈ 62°. A credible Identity caps augmented
climb authority near F-15 class (~1.1–1.2) and γ well below that. Mission still green today.
Harness must fail at Point/Dynamic before Mission is allowed to speak.

### Interface

```csharp
namespace GunsOnly.Sim.FlightTest;

public readonly record struct AirframeUnderTest(
    string Id,
    AircraftParams Air,
    PropulsionModelKind Propulsion,
    // Optional explicit Identity overlay. When null, Identity is derived from Air + program
    // defaults and the report flags "Identity inferred, not authored."
    AirframeIdentity? Identity = null,
    BeatSetup? Mission = null);

public sealed record FlightTestProgram(
    string Id,
    string Version,
    IReadOnlyList<FlightTestGate> Gates,
    IReadOnlyList<FlightTestPoint> Points,
    MissionClosureSpec? MissionClosure = null);

public static class FlightTest
{
    public static FlightTestReport Evaluate(
        AirframeUnderTest subject,
        FlightTestProgram program);
}
```

CI asserts `report.Passed`. Humans read `report.ToMarkdown()` (or JSON). Production telemetry may
later score the same `FlightTestProgram` offline — same gates, different source of samples.

### Report shape (the engineering artifact)

The report is the answer to “how does this airplane work?” One walk-through:

1. **Identity** — role, empty/gross mass, W/S, dry T/W, augmenter T/W, skin limit K, comparison
   family, authored claims (max climb γ band, dash Mach class, energy-game gap)
2. **Engine** — thrust and fuel-flow shares vs Mach/alt at mil and AB; turbine-fade / ram-light
   band; design-point thrust
3. **Energy** — Ps(M, h, W, n) and max sustainable climb γ on a coarse grid at stated weights
4. **Flight-test points** — measured from headless `AircraftSim` holds (not full mission AI)
5. **Mission closure** — if a beat is attached: fuel/time/margin by phase to the wire
6. **Findings** — English contradictions, each tied to a failed gate id

`Passed` is false if any blocking gate fails. Advisory findings do not fail CI but print.

## Layer contracts

### 1. Identity

An explicit, versioned claim about what the airplane *is*. Not inferred silently from whatever
`ThrustMaxN` happens to be after the last buff.

```csharp
public readonly record struct AirframeIdentity(
    string Role,                          // e.g. "dispersed TBCC interceptor"
    double FuelFreeMassKg,
    double GrossMassKg,
    double WingLoadingKgM2,
    double DryThrustToWeight,             // ThrustMaxN / (gross * g)
    double AugmentedThrustToWeight,       // ThrustMaxN * MaxThrustFraction / (gross * g)
    double SkinTemperatureLimitK,
    string ComparisonFamily,              // e.g. "turbine: F-15-class climb; ram: SR-71-class dash claims"
    double MaxClimbGammaDegWhileAcceleratingThroughMach1,  // family cap
    double MinSustainedVsAeroGGap,        // energy-game survival (drone-derivation brief)
    string SourceDoc);                    // path to the design record that owns these claims
```

**Drift gate:** measured mass, T/W, W/S, and skin limit from `AircraftParams` must match Identity
within stated tolerances (v1: mass 2%, T/W 5%, W/S 2%, skin limit exact). Changing the motor
without updating Identity fails CI. That is the buff-creep kill switch.

Rapier today has no authored Identity file — first deliverable is writing one that either
(a) admits the homesick-angel motor and rewrites the story, or (b) keeps the paper story and
fails until the motor comes down. The harness does not choose; it forces the choice into git.

### 2. Point performance

Closed-form + propulsion-map evaluation. No dynamics.

- Grid: Mach × altitude × weight × load factor, at mil and AB lever
- Outputs: net thrust (turbine/ram split when the map provides it), fuel flow, Ps,
  max sustained climb γ, sustained G, aero-max G, corner speed
- Methods: reuse the arithmetic in `docs/research/drone-derivation-brief.md` (Ps, sustained vs
  wing, altitude collapse). Do not re-derive in prose every session.

**Family gates (program-owned, not hardcoded in the evaluator):**

| Gate id | Example for `interceptor-tbcc-v1` |
|---|---|
| `tw-augmented-gross` | Augmented T/W at gross ≤ 1.20 (above F-15/F-22 vertical class needs an Identity rewrite) |
| `energy-game-gap` | Sustained-vs-aero G gap at 10k ft / corner ≥ Identity.MinSustainedVsAeroGGap |
| `ram-light-band` | Useful ram thrust fraction ≥ 0.1 only for M ∈ [RamFadeStart, FullRam] |

### 3. Dynamic flight test

Headless `AircraftSim` (and where needed a thin session without bandits) flying **named holds**,
not the full Rapier AI. Pattern: `EnergyZoomRepro`, not `RapierMissionTests`.

v1 points for Rapier:

| Point id | Procedure | Measure | Gate |
|---|---|---|---|
| `ab-climb-through-m1` | From M0.85 / FL100, AB, hold commanded γ schedule or max-effort climb for 30 s | max γ while `dM/dt > 0` in M∈[0.9,1.3]; peak T/W | γ ≤ Identity cap; T/W ≤ Identity.Augmented * 1.05 |
| `mil-accel-fl300` | Level mil accel M0.8→0.95 at FL300 | time, fuel | advisory band vs family |
| `ram-cruise-lb-nm` | Hold M2.5 / design alt, lever per program | lb/min, nm/min, lb/nm | lb/nm improves vs subsonic mil cruise (the J58 point) — **advisory until per-stream fuel lands** |
| `specific-excess-spot` | Spot-check Ps at 2–3 Identity conditions against Point layer | \|Ps_dyn − Ps_point\| | within 15% (model consistency) |

Holds use explicit pilot commands into `AircraftSim`, not mission automation — so stick-claim and
Escape-phase bugs cannot mask physics.

### 4. Mission energy closure

Optional. Attaches `BeatSetup` (Rapier intercept / circuits). Runs existing automation path;
records per-phase: time, fuel burned, range, Mach/alt in/out, margin at trap.

**Rules:**

- Mission may **not** pass if any blocking Identity / Point / Dynamic gate failed
- Mission failure may **not** be fixed by raising propulsion constants without Identity update
  (CI fails Identity first; the open-work rule “retune the approach; do NOT re-buff the engine”
  becomes mechanical)

v1 mission gates for Rapier: arrive dash corridor with fighting room (existing property);
trap with fuel ≥ Minimum; if pursuers remain, Recovery phase must still be reachable inside
the home bubble (today Escape blocks forever — that is a mission-logic bug the harness will
surface once Dynamic is green).

## First program: `interceptor-tbcc-v1`

Subject: `RapierPublicDataSurrogate`.

Initial Identity is **honest about current kernel numbers** *or* **aspirational about the paper
story** — pick one in the Identity file checked into git. Recommended start: aspirational paper
story (T/W and climb γ of a credible interceptor), so CI fails today and the buff has to be
undone or the story rewritten in the open. Hiding the fail by Identity-matching the angel is
allowed but must say so in `SourceDoc`.

Comparison family (turbine phase): F-15 / Typhoon class climb authority (augmented T/W ~1.1–1.2),
not “better than every fighter ever.” Ram phase: claims bounded by SR-71-class dash narrative and
the open-work thermal/cost warning — not free M4.

## Seams and placement

| Piece | Location | Why |
|---|---|---|
| Evaluator + report types | `sim/FlightTest/` | Deep module; no web dependency |
| Programs + Identity files | `sim/FlightTest/Programs/` (+ optional `content/` later) | Versioned with the kernel |
| Tests | `sim.Tests/FlightTest/` | Same runner as everything else |
| Design record | this spec | Owns the question |
| Sizing arithmetic | `sim/FlightTest/PointPerformance.cs` | Port of drone-derivation methods; single locality |

Do **not** put gates in `TurboRamjetPerformanceMap` itself — the map stays a surrogate; the
program decides what “reasonable” means for a given role.

## Relationship to existing tests

| Existing | Stays | Relationship |
|---|---|---|
| `J47PerformanceMapTests` | Yes | Pattern for anchored maps; TBCC gets anchors only when a real deck exists |
| `PropulsionIntegrationTests` | Yes | Conservation chain; FlightTest consumes `LastEngineOperatingPoint` |
| `EnergyZoomRepro` | Yes | Precedent for Dynamic holds; FlightTest generalises the pattern |
| `RapierMissionTests` | Yes | Mission layer; may later assert `FlightTest.Evaluate(...).Passed` as a precondition |
| drone-derivation-brief | Yes | Methods become code; brief remains the narrative teacher |

## Acceptance (v1 done when)

1. `FlightTest.Evaluate(Rapier, interceptor-tbcc-v1)` produces a markdown report a pilot-engineer
   can read without the debugger
2. At least one blocking gate fails on today’s Rapier (homesick-angel climb or T/W drift) unless
   Identity has been deliberately rewritten to admit it
3. Changing `ThrustMaxN` by +20% without touching Identity fails CI
4. Changing Identity to match a +20% thrust buff passes Identity but prints a finding that
   ComparisonFamily must be revisited
5. `bin/check` / `dotnet test` includes the FlightTest project; no web or Blob dependency

## Out of scope until v1 is green

- Scoring production telemetry chunks against the same program (natural follow-on; same gates)
- Per-stream turbine/ram fuel (open-work; unlocks the lb/nm ram-cruise gate as blocking)
- CMC vs steel cost ledger coupling
- Multi-airframe programs (Sabre, F-22 surrogate) — interface must allow them; Rapier ships first

## Open decisions (resolve in implementation plan, not by silence)

1. **Aspirational vs descriptive Identity for Rapier v1** — recommend aspirational (fail loud)
2. **Exact γ and T/W numeric caps** — set from family table in the plan; not invented in the
   evaluator
3. **Whether Mission layer is blocking in v1 or advisory** — recommend advisory until Dynamic
   is green, then promote

## Why this is the right depth

A shallow “add three Asserts to RapierMissionTests” would catch one screenshot and rot.
A giant offline notebook would explain once and never gate.
This module makes **“how does this airplane work?”** a single call with a durable artifact, and
makes lying between layers a build break — which is what flight-test engineering is for.
