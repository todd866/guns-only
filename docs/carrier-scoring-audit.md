# Carrier recovery scoring audit

**Status:** scoring corrections, terminal-contact persistence, and finite arresting-engine capacity
are implemented. Higher-order hook, airframe-structure, and component-failure physics remain
separate calibration work.

## Bottom line

The deployed carrier loop did not clearly deny a clean pass. The traces contain no arrival that was both geometrically trappable and structurally credible: every completed deck/near-deck arrival either missed the wire geometry, hit short/long, or carried at least 7.6 m/s (1,499 ft/min) of deck-relative sink. The first direct deck arrival was exceptionally well lined up but reached the deck at 8.41 m/s (1,656 ft/min); it was not a clean trap.

What *was* unfair was the explanation:

- physical wire capture, structural survivability, and proficiency grade were conflated;
- the recorder lost the entire contact result because the deployed loop respawned in the same simulation tick;
- an 8.41 m/s arrival was still being called `ON THE BALL` immediately before impact;
- the field named `approach_airspeed_kts` was carrier-relative TAS, not IAS;
- adaptive difficulty could make a physically intercepted wire look like a hook skip; and
- a stopped arrestment was counted as a clean proficiency success regardless of touchdown quality.

The scoring code now treats these as separate facts. A hook that crosses a pendant can engage even on a `NO GRADE` or structurally failed arrival. The touchdown assessment reports explicit IAS, raw deviations, and one prioritized teaching correction. Adaptive difficulty is feedback and weather, never a hidden physics gate.

This is still an **interim touchdown assessment**, not a complete LSO pass grade. A defensible full grade needs time-history by approach phase.

## Evidence and integrity

The audit used three production telemetry exports from 19 July 2026. A duplicate download of the first file had an identical SHA-256 and was excluded.

| Trace | Bytes | State rows | SHA-256 |
|---|---:|---:|---|
| `web-1784431963631-985314.jsonl` | 115,347,289 | 43,948 | `b81e46fb5cd8799490c4b975747f1963adf303ec3bc22c4d0cf5be0e6d0cee0b` |
| `web-1784436567527-585418.jsonl` | 174,169 | 68 | `771addd391a7258a67054f147ee4d288ecec2740eda04965192a0d6b5951eec1` |
| `web-1784438750923-138652.jsonl` | 80,041,560 | 30,815 | `26a7af70a7435c89d6612552d8816244c1ba5c2a5103606b8f40a770c3185926` |

That is 74,831 state observations. Median foreground spacing was 17 ms, but browser backgrounding produced hundreds of gaps over one second. Attempt indices also survived some respawns. I therefore reconstructed passes from browser-monotonic time, approach/wave-off mode transitions, restages, position discontinuities, and rising edges of `SPLASHED - RESPAWN`, rather than trusting one field alone.

There were 18 unique splash cues across the two substantive traces. Nine were directly attributable to a recent carrier approach; the others were later combat/free-flight impacts. After merging background-gapped fragments, the data contains roughly 13 meaningful carrier approach segments. Some end in a trace gap or manual restage, so this is deliberately not presented as an exact sortie count.

### Critical observability failure

Every one of the 74,831 states reports:

- `recovery = Flying`
- `arrest_phase = NONE`
- `touchdown_quality = NONE`
- `hook_outcome = NONE`

That does **not** mean contact never happened. The deployed continuous-operations loop detected impact and replaced the aircraft before the next telemetry snapshot. The last state before the teleport is therefore an impact precursor, not an authoritative contact sample. Wire projections below are counterfactual checks using the current geometry and constant last-sample velocity; they are useful for fairness review but are not substitutes for recorded contact events.

The trace header says build `33`. The deployed behavior came from commit `07b7a6e`, named “BUILD 34,” while that commit still emitted the literal build value `33`. Provenance by build number was therefore ambiguous. The current web shell derives its telemetry build identity from the deployed module URL instead of retaining that stale constant.

## Reconstructed outcomes

The legacy `approach_airspeed_kts` values in this table are the mislabeled TAS-like field. All decisive samples were near sea level, so the numerical IAS difference is small; the semantic error still matters for future altitude/weather work.

The current 250 m deck places wires 1–4 at along positions −60.4, −55.2, −50.0, and −44.8 m. Projected wheel contact is a straight-line extrapolation from the final emitted height, sink, and deck closure. The modeled hook trails the main gear by 6 m.

| Pass | Last relevant evidence | Approximate physical interpretation | Fair result |
|---|---|---|---|
| A-1 | along −53.8 m, cross +0.7 m, height 0.1 m; 147.5 kt; sink 8.41 m/s; throttle 0.082; LSO `ON THE BALL` | Projected wheel −53.1 / hook −59.1 m: geometric wire-2 catch, but a blown structural arrival | Cut/airframe loss; preserve `hook engaged, wire 2` as a separate fact |
| A-2 | floated over the landing area around 141 kt with only 0.76 m/s sink, then reached along +147.5 m at height −3.1 m and 33.3 m/s sink | No arrest; over-deck continuation into bow/sea impact | Bolter/wave-off failure followed by physical impact, not a fictional trap decision |
| A-4 | along −79.1 m, cross +5.0 m, height 5.7 m; 148.0 kt; sink 9.62 m/s; throttle idle | Projected wheel −43.5 / hook −49.5 m: possible wire-4 geometry, structurally blown | Cut/airframe loss; retain possible engage-then-fail evidence |
| B-1 | wave-off; along −655.8 m, cross −54.5 m, height −20 m | Water impact well aft and displaced | Continued water-impact physics; no landing grade |
| B-2 | wave-off; along −842.1 m, height −20 m; sink 31.64 m/s; bank 50.5° | Water impact during failed escape | Continued water-impact physics; no landing grade |
| B-3 | along −44.3 m, cross +5.6 m, height 2.3 m; 148.2 kt; sink 7.62 m/s | Projected wheel −26.1 / hook −32.1 m: beyond all wires, and structurally over the current limit | Missed wires plus unsafe touchdown/impact, not a clean pass |
| B-6 | along −188.9 m, height −19.9 m; sink 9.97 m/s | Below deck/sea level well short of the round-down | Ramp/sea impact |
| B-7 | along −172.9 m, height 12.8 m; sink 9.98 m/s; throttle idle | Projected wheel −92.7 m, about 32 m short of wire 1; structurally blown | Short/unsafe arrival |
| B-8 | along −170.8 m, height 14.0 m; 171.3 kt; sink 10.28 m/s; throttle idle | Projected wheel −72.6 m, about 12 m short of wire 1; fast and structurally blown | Short/fast/unsafe arrival |

One final trace fragment ended before contact at along −79.4 m, height 7.1 m, 147.7 kt, 9.94 m/s sink, and throttle 0.01. Its constant-rate projection was long of the wires and structurally blown, but it is correctly left **unscored** because the trace ended.

### Was a clean pass denied?

No clear example exists in these traces.

- The three closest direct arrivals carried 8.41, 9.62, and 7.62 m/s of deck-relative sink.
- A historical NAVAIR survey describes about 17 ft/s (5.18 m/s) as representative limiting sink for early straight-wing jets. The sim's present provisional loss threshold is a more permissive 7.0 m/s. The recorded direct arrivals exceeded both.
- Two arrivals might have crossed a wire geometrically, but geometric capture is not the same as surviving the vertical impact or completing arrestment.
- The remaining terminal approaches were long, short, in the round-down/water, or failed wave-offs.

The honest conclusion is therefore: **outcome direction was broadly right; causality, grading, and debrief quality were not.**

## What changed

### 1. Three independent layers

`Carrier.EvaluateRecovery` now answers three questions without rewriting one from another:

1. **Hook/wire geometry:** which pendant, if any, the hook crosses during the touchdown sweep.
2. **Structural touchdown response:** whether deck-relative sink is within the current provisional survivability envelope.
3. **Touchdown proficiency:** `OK`, `FAIR`, `NO GRADE`, or `CUT`, plus transparent deviation flags.

A poor grade cannot erase a wire. A wire cannot sanitize a structurally blown touchdown. A blown arrival can therefore report “hook engaged, wire 2, cut” and later support a real engage-then-fail simulation.

### 2. IAS is explicit

The live session supplies `AircraftSim.IndicatedAirspeedMps` to approach-slot and touchdown assessment. The web contract reports that IAS as `approach_airspeed_kts`. Deck closure remains separately deck-relative; it is not disguised as airspeed. Standalone fixtures retain a standard-atmosphere fallback only for compatibility.

### 3. Transparent touchdown assessment

The result now carries:

- `touchdown_grade`
- `touchdown_deviations`
- `touchdown_primary_correction`
- explicit indicated airspeed, deck closure, sink, lineup, wheel position, hook position, hook outcome, and wire.

The fixed touchdown reference currently flags low/hard/unsafe sink, lineup, slow/fast IAS, excessive deck closure, high/low AoA, and being outside an adaptive training target. The adaptive target is diagnostic only; it cannot alter capture physics.

### 4. Teach one correction first

When several deviations occur together, the debrief selects the earliest safety-critical correction in this order:

1. wave off earlier for an unsafe sink rate;
2. add power earlier for a hard sink rate;
3. stabilize IAS/energy for slow, fast, or excessive-closure arrivals;
4. establish lineup earlier;
5. fly on-speed AoA;
6. fly through without flaring; then
7. meet the narrower training target.

This is intentionally coaching-oriented. The trace data makes the first lesson unusually clear: the final-corridor throttle in the first pass had a median of 0.035, with every sample below 0.15, while sink rose to 9.02 m/s. The high-value correction is **establish approach power and energy earlier**, not “aim better.” The current approach-control work has separately corrected the near-idle trim pathology and deterministic carrier harnesses now trap, stop, relaunch, and remain within the touchdown envelope.

### 5. Progression counts proficiency, not mere survival

A stopped `OK` or `FAIR` recovery advances the clean-trap counter. A safe `NO GRADE` recovery resets the clean streak but does not inflate mastery. Physical recovery remains successful; only the training progression distinguishes it.

## Why this is not yet a full LSO grade

NAVAIR's carrier-qualification model keeps the grade distinct from physical outcome notation such as a bolter, and its trend forms evaluate deviations by approach phase rather than only at touchdown. That is the right long-term architecture for a decision-making and maintenance-test-flight simulator.

The next pass-grade recorder should retain deterministic samples for:

- **start / middle / in-close / ramp / wires**;
- glidepath, IAS, on-speed AoA, lineup, bank, power, and control reversals;
- LSO calls and wave-off compliance;
- hook/wire result, touchdown loads, gear state, and arrestment response; and
- the earliest causal deviation and whether it was corrected.

Until that exists, the UI should call the present output a **touchdown assessment**, not imply it is a complete LSO grade. A pilot who corrects an early high or lineup excursion and flies a good in-close should not be graded the same as one whose deviation worsens through the ramp.

## Remaining physics gaps

### Hook engagement and bounce

The current hook model is one-dimensional along-track geometry: a fixed 6 m hook-to-main-gear distance and an 8 m post-touchdown sweep. It does not yet integrate hook point height, hook angle, pitch rate, hook impact velocity, damping, deck motion at the hook, bounce, skip, or hook structural load. A hook passing over a wire therefore still guarantees geometric engagement if it falls inside the simple sweep.

NAVAIR's carrier-suitability work explicitly warns that placing the hook over a pendant does not guarantee arrestment; attitude, hook impact dynamics, damping, bounce, and last-second nose-down inputs matter. Those variables should replace the dormant categorical `HookSkip` shortcut with actual dynamics.

### Arresting-gear and structure capacity

`ArrestmentModel` now selects an immutable capability before engagement. The force-versus-payout
curve, runout, rated energy, and maximum line load are fixed properties of that profile; actual
aircraft mass and deck closure supply the incoming kinetic energy. A work/kinetic-energy ledger
therefore produces either `STOPPED` or an explicit `FAILED` result with
`ENERGY_CAPACITY_EXCEEDED`, `RUNOUT_EXHAUSTED`, or `LINE_LOAD_EXCEEDED`, absorbed and remaining
energy, peak load, and residual speed. An overload no longer grants the arresting engine more
capacity merely because it arrived faster.

The current `PROVISIONAL_KOREA_JET_V1` profile uses a 96 m payout, a fixed
51.2→159→72 kN effective force curve, 10.8 MJ rated energy, 10.539 MJ integrated force-curve work,
and a 180 kN line-load limit. Effective energy capacity is explicitly the lesser of rated energy
and force-curve work. Those figures are a coherent deterministic gameplay calibration, not an
Essex-class equipment claim or F-86/Fury certification datum.

On failure, the exact residual deck-relative state crosses into contact physics without a second
tangential collision impulse. The session emits `ARRESTMENT_FAILED`; only a completed `STOPPED`
phase can count as recovery, mastery, or relaunch. The authoritative incident clip retains the
profile, failure reason, energy ledger, and load evidence for teaching after the wreck settles.

The remaining component model must compare the minimum of:

- arresting-engine/wire energy and engaging-speed capacity;
- aircraft hook-load capacity; and
- landing-gear/airframe vertical and longitudinal load capacity.

The current line-load failure is a generic weakest-link result; it does not yet claim whether a
pendant, purchase cable, hook, attachment, landing gear, or airframe failed. Component-specific
failure, hook-point dynamics, landing-gear collapse, occupant loads, and off-centre yaw response
remain open. Historical survey values such as 85–100 kt engaging limits are calibration evidence,
not a universal constant to paste into the sim. The aircraft, carrier gear, weight,
wind-over-deck, and configuration must own the actual limits.

### Aircraft-specific calibration

The current broad IAS and sink windows are provisional gameplay references. Appendix E of the NAVAIR survey includes FJ-3 approach/trap-weight data close to the era and mass class, but `Guns Only` still needs a declared aircraft/carrier configuration and a source-backed calibration card. A Fury datum should not silently become a Sabre datum, and a published Vpa should not be confused with maximum engaging speed.

## Acceptance gates and remaining validation

1. **Implemented:** contact emits an immutable event before restage, and the terminal/contact state remains observable instead of disappearing in the impact tick.
2. **Implemented:** authoritative replay retains wire, arrestment-failure reason, energy/load
   evidence, residual damage trajectory, and final rest state without re-running physics.
3. **Next:** hook-over-wire fixtures cover engage, bounce, skip, hook failure, and attitude/pitch-rate sensitivity.
4. **Partial:** deterministic arrestment fixtures cover nominal stop, rated-energy exhaustion,
   payout exhaustion, line-load exceedance, residual continuity, and no false recovery/relaunch.
   Component-specific wire, hook, landing-gear, and airframe failures remain next.
5. **Next:** a phase-coded approach recorder grades correction trends and wave-off compliance, not just the last frame.
6. **Next:** the debrief shows physical outcome, touchdown assessment, full-pass grade, and primary correction as separate lines.

## Verification

- `CarrierRecoveryPhysicsTests` and `DifficultyTests`: **20/20 passed**.
- Covered explicit IAS, geometry-independent grading, poor-grade physical catches, soft/nominal/hard/blown arrivals, adaptive-target non-interference, deterministic assessment, correction priority, and grade-aware mastery.
- The Blazor web project builds successfully with the pinned .NET 8 SDK: **0 warnings, 0 errors**.

## Primary references

- [NAVAIR 00-80T-104, *NATOPS Landing Signal Officer Manual*, chapter 11](https://info.publicintelligence.net/LSO-NATOPS-MAY09.pdf) — grade categories, bolter notation, phase-coded trend analysis, lineup/glidepath/speed/control/wire observations.
- [NAVAIR NAWCADPAX/TR-2002/71, *Aircraft Carrier Suitability Testing Data and Procedures Manual*](https://www.robertheffley.com/docs/HQs/NAVAIR_2002_71.pdf) — early-jet sink/engaging limits, hook bounce and skip dynamics, safe engaging-limit composition, and FJ-3 reference data.
