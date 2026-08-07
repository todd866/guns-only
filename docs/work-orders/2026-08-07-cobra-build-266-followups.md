# Cobra work order — Build 266 follow-ups

Written 2026-08-07 after the owner flew Build 266 on guns-only.com and reported
"still needs big work". Evidence is from telemetry session
`web-cobra-1786068226444-kk8toguz` (build 266, 517 state rows, ~25 s) and a screen
recording of the same sortie.

Items are ordered by (owner-visible pain x confidence in the diagnosis). Each one states
what is wrong, the evidence, where to change it, and how to know it is done.

**Read first:** two of these are regressions or gaps from Build 266 itself, written by
Claude. They are not blamed on anyone else and should be fixed before new work.

---

## 1. HUD symbology is internally inconsistent — waterline and pitch ladder use different references

**Severity: high. Regression introduced in Build 266. Confidence: certain (structural, not measured).**

Build 266 moved the Cobra pitch ladder onto a *camera* reference so its 0 rung lands on
the visible horizon. It did **not** move the waterline or flight-path vector, which still
anchor at `noseAnchor` (body-forward projected through the camera).

The Cobra's rear-seat camera carries a fixed **+0.08 rad sight bias** plus a clamped
**<=0.05 rad gunner-target lean**. So the two references now differ by up to ~0.13 rad —
about 50 px at the recorded resolution. In the recording the waterline sits on the horizon
while the 0 rung sits ~50 px below it.

Before Build 266 both agreed with each other and disagreed with the world. Now the ladder
agrees with the world and disagrees with the waterline. The owner's words: *"the pitch
indicator and the camera should be locked to each other"*.

**Where**
- `web/wwwroot/hud.js` — `drawPitchLadder` (camera reference already implemented; see
  `cameraPitchAnchor`), `drawAirframeSymbols`, and the draw call site that passes
  `noseAnchor` to both.
- `web/wwwroot/render/cobra/cobra_hud_adapter.js` — sets `ladderReference: "camera"` on the
  frame. The same flag should govern the airframe symbols.

**Do**
Route the waterline and FPV through the same reference as the ladder when
`ladderReference === "camera"`. Keep the F-22 on the airframe-conformal path — it is
correct there and must not change.

**Done when**
- Waterline, FPV and the ladder's 0 rung agree with each other AND with the drawn horizon
  in a rendered Cobra frame.
- The F-22 scenario screenshots `forward-level` and `look-up-20` are byte-comparable to
  Build 266's.
- Extends `web/wwwroot/render/cobra/tests/cobra_ladder_reference.test.mjs`.

---

## 2. The aircraft is power-starved in normal flight — rotor caution is permanently lit

**Severity: high. Pre-existing, under-called in Build 266. Confidence: high.**

The owner sees a permanent rotor annunciation. In the recording: **NR 96%, TQ 80%**, amber.
The HUD cautions below 97% Nr and warns below 90% (`cobra_rotorcraft_hud.js:101-103`), so
96% sits permanently 1% under the caution line.

Telemetry from the sortie:

| field | p50 | p90 | min / max |
|---|---|---|---|
| `cobra_power_margin` | **0.018** | 0.362 | min 0.00001 |
| `cobra_collective` | **0.80** | 0.98 | max 1.00 |

More than half the flight is spent at ~98% of available power. A governor cannot hold Nr
without spare power, so it droops — correctly. **The governor is not the defect here.**

Hover trim alone draws **93.3%** of the 1,100 shp transmission limit at 4,051 kg, which
leaves ~7% of the power and ~20% of the collective lever for all of flying.

**This was previously assessed as historically accurate. That assessment was too generous.**
Work it through: ideal induced power 425.6 kW; with `InducedPowerFactor` 1.15 -> 489.4 kW;
profile power 199.0 kW; main-rotor total 688.4 kW. That is a **figure of merit of 0.62**.
A real AH-1G rotor is about **0.70-0.72**. At FM 0.72 the hover needs ~658 kW total ->
**~80% TQ**, which is real margin and matches the aircraft's documented ability to climb
and manoeuvre at basic mission weight.

**Where**
- `sim/Vehicles/Rotorcraft/Ah1gCobraDefinition.cs` — `InducedPowerFactor: 1.15`,
  `ProfileDragCoefficient: 0.0120`, `Solidity: 0.0651`, `RadiusM: 6.706`.
- `sim/Vehicles/Rotorcraft/Ah1gCobraDynamics.cs` — `ProfilePowerW`,
  `TotalRotorSystemPowerW`, `AvailablePowerW`.

**Do**
Bring the modelled hover figure of merit to ~0.70-0.72 against published AH-1G numbers.
Change the aerodynamics, not the engine rating — do NOT simply raise available power or
lower mass to paper over it.

**Done when**
- OGE hover at 4,051 kg costs ~80% TQ (currently 93.3%).
- `sim.Tests/Vehicles/Rotorcraft/Ah1gCobraFlightProfileTests.cs` still passes, and the
  power-margin sweep it prints shows genuine margin at 4,051 kg.
- A climbing turn at +0.15 collective over hover trim no longer saturates at basic mission
  weight (it may still droop at 4,300 kg — that is honest).

---

## 3. The governor parks at 96% Nr while 20% torque margin is available

**Severity: medium. Gap in the Build 266 fix. Confidence: medium — needs reproduction.**

Distinct from item 2. In the recorded frame **TQ is 80%**, so there *was* headroom, and a
PI governor with headroom should drive the rpm error to zero. It sat at 96%.

Build 266 added `GovernorIntegralGainWPerRpmSecond: 12_000.0` (Ki = Kp/2 s) with
back-calculation anti-windup. Hypotheses, in order:
1. Ki too low to close the error over the timescales of real flight.
2. The anti-windup back-calculation is bleeding integral it should be keeping — check the
   saturation term when demand is clamped at `availablePowerW`.
3. Something else caps governor authority.

Note the flight-profile harness only asserts the *steady* segments and the post-over-pull
recovery. Neither reproduces "cruising with margin, parked 4% low", which is why this
survived. **Add a segment that does.**

**Where**
- `sim/Vehicles/Rotorcraft/Ah1gCobraDynamics.cs` — the governor block
  (`rotorSpeedErrorRpm`, `candidateIntegralW`, `_governorIntegralW`).
- `sim.Tests/Vehicles/Rotorcraft/Ah1gCobraFlightProfileTests.cs`.

**Done when** a cruise segment with >=15% torque margin holds Nr within 1% of 324 rpm, and
that is pinned by a test.

---

## 4. The gunner never fires — 0 kills, 900 rounds unspent

**Severity: high. Pre-existing and unaddressed. Confidence: high.**

From the same sortie:

- `cobra_fire_authorized`: **false 100% of the time**
- `cobra_ammo`: 900 -> 900. `cobra_hostile_kills`: 0
- `cobra_gunner_state`: masked 50%, outoflimits 35%, awaitingtarget 8%, tracking 4%, acquiring 3%
- `cobra_masking`: `outsidethreatcoverage` 100%
- HUD in the recording reads **GUN OUT OF LIMITS**, target at 499 m

The gunner is masked or out of limits 85% of the time and never authorised once. This has
persisted across at least two builds. It is the single largest gap between "flies" and
"is a game".

**Do** Establish whether the turret limits, the masking test, or the geometry the mission
puts the aircraft in is responsible. Note `cobra_masking` reports `outsidethreatcoverage`
100% while the gunner reports `Masked` 50% — those two should be reconciled; at least one
is mislabelled.

**Related:** task #21 in the tracker — add a reachable-hostile QA seam so the crew chain can
be gated automatically.

---

## 5. No Cobra scenario in the HUD screenshot harness — the process gap that let #1 ship

**Severity: medium (process). Confidence: certain.**

`web/wwwroot/render/hud/tests/harness/scenarios.js` has no Cobra entry, so the "look at the
pixels" gate covers the F-22 only. Item 1 shipped to production with structural tests green
and no rendered frame ever inspected. The standing rule is that visual work ships only after
rendered frames are read; for the Cobra that rule is currently unenforceable.

**Done when** at least one Cobra scenario (forward, level, in the gorge) renders through
`screenshot.mjs`, so ladder/waterline/FPV agreement is inspectable.

---

## 6. Cobra telemetry cannot see the instruments being complained about

**Severity: medium. Confidence: certain.**

The Cobra state schema carries 23 fields and **none** of them are rotor rpm, torque,
attitude (pitch/bank), or frame time. Both defects the owner reported this week — the rotor
annunciation and the attitude indicator — are invisible to telemetry. Diagnosis required a
screen recording.

**Do** Add `main_rotor_rpm`, transmission/torque fraction, `pitch_rad`, `roll_rad`, and a
frame-time measure to the Cobra telemetry state.

**Done when** a sortie's rotor droop and attitude history can be reconstructed from
telemetry alone.

---

## 7. "Stable 60 fps" is unproven

**Severity: medium. Confidence: high that it is unproven; unknown whether it is a problem.**

Build 266 removed the dominant cost (gunner line-of-sight 41.6 ms/tick, ground war 3.5 ms,
of a ~45.5 ms budget; kernel now 1.6 ms/tick). Measured p50/p90 only, on one machine.
**p90 at "accelerating" was 17.0 ms against a 16.7 ms budget** — already marginal — and
nobody has measured p99.

Known unaddressed hitch: terrain chunk builds are **9.5 ms synchronous on the main thread
per LOD0 chunk**, ~57% of a frame, paid when crossing a chunk boundary — i.e. exactly when
traversing at speed.

**Do** Measure p99 over a few minutes of real flying before optimising further. If p99
breaches, move the terrain chunk build off the main thread.

**Caution** CI's `boot does not stutter` gate is documented flaky on loaded runners
("failed 3/6 builds and passed every re-run" — comment in `web/smoke/smoke.test.mjs`). It
failed once on the Build 266 PR and passed on re-run with no code change. Do not read it as
a frame-rate measurement; it is a boot-time gate on a SwiftShader software renderer.

---

## 8. Stamp ritual is under-documented — it missed two files

The Build 266 stamp swept `web/wwwroot/` only. The gate caught `?v=` pins in
**`web/smoke/cobra_authority.mjs`** and **`web/smoke/cobra-crew-chain.test.mjs`**.

**Do** Sweep the whole repo for `v=<OLD>`, not just `web/wwwroot/`.

---

## Standing context worth carrying

- **Deploy** must run from a worktree on branch `main`, clean (untracked files count as
  dirty), with `.vercel/project.json` and the hydrated gitignored payload trees. A fresh
  worktree needs `bin/worktree-prep`. Detached HEAD is refused.
- **Verify a deploy** against `https://guns-only.com/api/build-info`, not the deploy's exit
  code. Several scripts here end in `echo`, which masks the real status — always read
  `GATE_EXIT=` / `DEPLOY_EXIT=` from the log.
- **Do not "fix" the climb droop by raising engine power.** Drooping under a genuine
  over-pull is correct AH-1G behaviour; item 2 is about the hover baseline, not the limit.
- **Do not test rotor recovery with a zero-cyclic re-hover.** A drooped rotor at hover trim
  descends into the modelled vortex ring and cannot recover on collective alone — that is
  by design. Recovery is collective *and* forward cyclic.
