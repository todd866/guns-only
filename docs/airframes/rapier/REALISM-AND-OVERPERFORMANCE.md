# Rapier realism and overperformance

Status: living audit · 2026-07-28 · Epistemic: mixed (measured telemetry + surrogate params)

Companion to the SE bible chapters. **Do not treat Mach-4 / CMC as closed engineering** until
the issues below are closed or deliberately accepted as fiction.

## Skin temperature: dive cools the gauge (FIXED in kernel)

| | |
| --- | --- |
| **Symptom** | Pull from ~100 kft to sea level: HUD `rapier_stagnation_temp_c` **drops**. |
| **Root cause** | Snapshot published **instantaneous adiabatic wall / recovery temperature** `T∞(1+r(γ−1)/2 M²)` with **no thermal mass**. A decelerating dive drops M faster than ambient rises → recovery falls. Real structure cannot dump heat that fast. Field name said “stagnation”; formula used recovery factor 0.88. |
| **Evidence** | `AirData.SkinTemperatureK` / `SnapshotHotFrame` (pre-fix); unit test `InstantaneousRecoveryTemperatureFallsOnADeceleratingDive`; user telemetry. |
| **Fix** | Lagged skin on `AircraftSim` (`SkinHeatTauSeconds=12`, `SkinCoolTauSeconds=180`); HUD reads `player.SkinTemperatureK`. Instantaneous recovery remains for Mach-limit schedules. |
| **Epistemic** | Lag taus are **provisional surrogates**, not measured soak curves. |

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
| **CMC 1200 °C** | Credible 2030s materials trajectory; does **not** make M4 historical. | Keep CMC as materials claim; pair with honest dash Mach. | surrogate |
| **Inertias still ~7.85 t class** | `Ixx`/`Iyy`/`Izz` not rescaled for 11 t design gross. | Re-derive with updated mass. | provisional |

## Implications for CMC / Mach-4 story

1. **Thermal gauge is structurally honest enough to teach soak** — diving no longer fake-cools the article.
2. **Mach-4 dash remains the weakest claim** — telemetry and map comments both say the jet is already improbably fast.
3. Prefer correcting **propulsion / dash** toward measured ~M3.7 before spending more art on M4 branding.
4. **Climb/dash OFTs will slow** with honest drone mass — re-baseline OFT ladders after this mass card.
