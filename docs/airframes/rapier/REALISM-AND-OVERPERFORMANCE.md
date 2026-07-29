# Rapier realism and overperformance

Status: living audit · 2026-07-28 · Epistemic: mixed (measured telemetry + surrogate params)

Companion to the SE bible chapters. **Do not treat Mach-4 / CMC as closed engineering** until
the issues below are closed or deliberately accepted as fiction.

## Aerothermal telemetry: channel mismatch (FIXED in snapshot/HUD)

| | |
| --- | --- |
| **Symptom** | Build 174 showed a plausible but low wall value in `rapier_stagnation_temp_c`, then compared it with a 1200 °C CMC number and presented hundreds of degrees of meaningless “margin.” |
| **Root cause** | The field name, value, and comparator described different things. It carried **lagged wall skin**, not stagnation `T0`; the lag target was turbulent flat-skin recovery `Taw`; 1200 °C is an authored CMC material capability, not a qualified whole-aircraft operating limit. |
| **Evidence** | Build 174 Intercept OFT at M3.635 / FL69344: ambient −55.4 °C, perfect-gas `T0` 519.9 °C, recovery 450.8 °C, lagged wall 450.6 °C, CMC card 1200 °C. The low wall reading is physically consistent; the label and “margin” were not. |
| **Fix** | Snapshot 1.19 publishes `rapier_skin_temp_c`, `rapier_recovery_temp_c`, true `rapier_stagnation_temp_c`, `rapier_cmc_capability_c`, and conservative `rapier_cmc_margin_c`. Normal HUD copy shows `SKIN` and `T0`, suppresses the giant pseudo-margin, and states `ENGINE/INLET LIMITING`. |
| **Ceiling** | Rapier screens the raw CMC capability against inlet/leading-edge `T0`, not flat-skin recovery: ~M5.37 rather than ~M5.72 at FL700. The Intercept cue advertises commanded M4.0, not that material screening ceiling. |
| **Epistemic** | No 650 °C limit was invented. The 12 s / 180 s wall lags remain **provisional surrogates**; inlet, bondline, areal heat capacity, heat transfer, emissivity, and qualification data are open. |

Primary basis: [NASA stagnation temperature](https://www.grc.nasa.gov/WWW/BGH/stagtmp.html),
[NACA TN 2077 recovery factors](https://ntrs.nasa.gov/citations/19930082751), and
[NASA TP-2000-209034 transient thin-skin heating](https://ntrs.nasa.gov/citations/20010002830).

## Closed this pass (Build 163)

| Issue | Fix |
| --- | --- |
| **Stowed drone mass missing** | Design gross **11090 kg** = 5150 airframe + **1440** (4×360) + 4500 fuel. Session sheds 360 kg per release. |
| **Wet T/W too high** | Core **84 kN** (was 85) on design gross → aug T/W **≤ 1.20** family cap. Identity matched to params. |
| **Lever-only / fabricated per-stream fuel** | `TurboRamjetPerformanceMap.Evaluate` owns turbine + ram fuel separately (`RamTsfcRelativeToDryMilitary`); HUD reads kernel fields. |
| **RamClimb commanded M4 into spill** | Climb now targets **M3.15** (below spill); phase gate tolerates FL≈694 before Intercept. |

## Build-171 player-sortie audit (closed in this branch)

The final 29.2 seconds of the reported sortie ran from 75,497 ft to impact. Emergency override
commanded 15 G; the fixed low-speed lift curve let actual load peak at **15.87 G near 57,600 ft /
M3.54**. The aircraft was inverted and pulled through near-vertical pitch, accumulating about 405°
of heading-coordinate movement without producing a coordinated flat 180° reversal.

| Issue | Observed cause | Correction |
| --- | --- | --- |
| **12 G at FL700/M3.5** | Clean `CLAlpha=3.6` and `CLmax=1.35` were held constant through M3.7. | Rapier-only public-theory schedule ceilings lift slope at `4/sqrt(M²−1)` and scales CLmax with it. At FL720/M3.5 the available load is a few G; 12/15 remain structural/control ceilings. |
| **RAM ONLY + GEAR UNSAFE** | Ram-only correctly set turbine RPM to zero; shared F-86 logic then removed engine-driven hydraulics, called the throttle gear horn, and folded that demand into the unsafe lamp even with three `UP_LOCKED` legs. | Rapier utility hydraulics follow the primary electrical bus; its horn follows landing-configuration intent; unsafe now means real command/lock/door/interlock disagreement. |
| **Weak ramjet sound** | Ram gain and total power were multiplied by turbine RPM. | Actual turbine/ram thrust streams own the audio mix; a live ramjet remains audible at zero turbine RPM. |
| **Thermal confusion** | The lagged structural skin was exported as `rapier_stagnation_temp_c`, while the UI mostly showed a large margin to a 1200 °C structural limit. | Snapshot and HUD now distinguish `SKIN`, `ADIABATIC WALL`, and `STRUCTURAL LIMIT`. Legacy field remains an alias for old clients. |
| **HUD collisions** | Combined-cycle lesson shared the G-tape pixels; gear/systems and fuel/limits shared the same lower-right anchor. | Panels now stack with explicit gaps; a headless landscape/portrait regression recreates the ram-only warning state and asserts disjoint rectangles. |

## Aerodynamics/control allocation pass (this branch)

| Issue | Previous behavior | Correction / result |
| --- | --- | --- |
| **Wing identity was implicit** | A cranked/delta mesh existed, but 18 m² reference S and 24.3173 m² solid polygon were not reconciled. | Named the 6.3173 m² body-overlap/non-reference residual; force/moment equations retain S=18 m². |
| **Pitch/yaw/bank hold were fixed torque** | Controller constants could deliver moment without `q·S·length` authority; direct roll RCS was incomplete. | Rapier pitch/yaw/roll/bank-hold are q-, Mach-, and configuration-capped; RCS supplies residual on all axes and burns gas. |
| **“Flaps” contradicted one-elevon-per-side drawing** | Shared F-86 mechanical interconnect and flap UI implied separate conventional flaps. | Rapier uses independently actuated symmetric elevon droop, nose-down configuration moment, reduced remaining pitch/roll travel, and `ELEV` cockpit language. |
| **High-speed pull did not affect engine** | TBCC thrust remained on-design at arbitrary alpha/beta. | Installed thrust now follows smooth combined-flow-angle inlet recovery above M2; pilot gets low-recovery/distortion cues. |
| **12/15 G read as available performance** | Structural demand caps and physical lift were not separately visible. | Normal-law alpha, q, inlet recovery, and physical lift are separate. At FL720/M3.5/design gross: ~0.90 G ordinary provisional law; ~2.59 G physical break; 12/15 G unavailable. |

The 0.90 G ordinary-law value is itself an open calibration result: a Mach-only alpha schedule is
too restrictive for level FL720 at design gross. Do not “fix” it by restoring constant CLmax.
Replace it with a mass/q/inlet-aware law and re-run mission OFTs.

Public basis: NASA explicitly warns that applying a low-speed lift coefficient at Mach 2 is
incorrect ([Lift Coefficient](https://www1.grc.nasa.gov/beginners-guide-to-aeronautics/lift-coefficient/));
NACA TR 970 documents lift-curve-slope dependence on Mach and wing planform
([NTRS 19930091081](https://ntrs.nasa.gov/citations/19930091081)). The schedule here is therefore a
transparent first-order surrogate, not claimed Rapier wind-tunnel data.

## Remaining overperformance flags

| Issue | Evidence | Recommended correction | Tag |
| --- | --- | --- | --- |
| **Sustained air-breathing M4** | Nothing flown sustains M4 air-breathing (`TurboRamjetPerformanceMap` comments). Intercept OFT energy-ladder peaks ~**M3.69**. Mission copy still says Mach 4. | Treat M4 dash as **aspirational fiction**; design dash around measured ~M3.5–3.7 or honest cycle ~M2.9 until retuned. | provisional / fiction |
| **Engine buff history** | Open findings: ramjet was buffed (DesignMach, burner, ratios) rather than fixing guidance. | Prefer guidance / profile; keep `DesignMach=2.6` as normaliser only. | open finding |
| **12 / 15 G structural ceilings** | Params; reclined thesis. Extreme for a crewed interceptor, though now aerodynamically unreachable in the thin-air dash. | Cost/fatigue ledger or lower qualified G; retain the distinction between command ceiling and available lift. | provisional |
| **CMC 1200 °C** | Credible 2030s materials trajectory; does **not** make M4 historical. | Keep CMC as materials claim; pair with honest dash Mach. | surrogate |
| **Inertias still ~7.85 t class** | `Ixx`/`Iyy`/`Izz` not rescaled for 11 t design gross. | Re-derive with updated mass. | provisional |
| **No aeroelastic / V-q damage model** | q scales moments, but structural twist, hinge loads, flutter, reversal, and persistent over-q damage are absent. | Add an explicit V-n/V-q envelope and aeroelastic/control-load model before qualifying low-altitude supersonic pulls. | open finding |
| **Scalar inlet recovery only** | Alpha/beta now cost thrust, but there is no buzz/unstart/restart state or distortion sector map. | Replace scalar surrogate with installed inlet mass-flow/distortion deck and recovery procedure. | provisional |

## Implications for CMC / Mach-4 story

1. **Wall skin, recovery, and stagnation are now distinct telemetry**; none is silently relabelled.
2. **1200 °C is capability, not a pilot limit.** The large numerical gap at M4 is expected and is
   no longer promoted as useful margin.
3. **Mach-4 dash remains the weakest claim** — telemetry and map comments both say the jet is
   already improbably fast; engine/inlet binds before the CMC screen.
4. Prefer correcting **propulsion / dash** toward measured ~M3.7 before spending more art on M4
   branding.
