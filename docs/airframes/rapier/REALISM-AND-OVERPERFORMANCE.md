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

## Remaining overperformance flags

| Issue | Evidence | Recommended correction | Tag |
| --- | --- | --- | --- |
| **Sustained air-breathing M4** | Nothing flown sustains M4 air-breathing (`TurboRamjetPerformanceMap` comments). Intercept OFT energy-ladder peaks ~**M3.69**. Mission copy still says Mach 4. | Treat M4 dash as **aspirational fiction**; design dash around measured ~M3.5–3.7 or honest cycle ~M2.9 until retuned. | provisional / fiction |
| **Engine buff history** | Open findings: ramjet was buffed (DesignMach, burner, ratios) rather than fixing guidance. | Prefer guidance / profile; keep `DesignMach=2.6` as normaliser only. | open finding |
| **12 / 15 G structure** | Params; reclined thesis. Extreme for a crewed interceptor. | Cost/fatigue ledger or lower qualified G. | provisional |
| **CMC 1200 °C** | Credible 2030s material-family trajectory; no integrated Rapier component qualification. | Keep it as material capability, never pilot operating margin; add inlet/bondline qualification before claiming one. | surrogate / open |
| **Inertias still ~7.85 t class** | `Ixx`/`Iyy`/`Izz` not rescaled for 11 t design gross. | Re-derive with updated mass. | provisional |

## Implications for CMC / Mach-4 story

1. **Wall skin, recovery, and stagnation are now distinct telemetry**; none is silently relabelled.
2. **1200 °C is capability, not a pilot limit.** The large numerical gap at M4 is expected and is
   no longer promoted as useful margin.
3. **Mach-4 dash remains the weakest claim** — telemetry and map comments both say the jet is
   already improbably fast; engine/inlet binds before the CMC screen.
4. Prefer correcting **propulsion / dash** toward measured ~M3.7 before spending more art on M4
   branding.
