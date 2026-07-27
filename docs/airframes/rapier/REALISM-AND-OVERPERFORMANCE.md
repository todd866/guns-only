# Rapier realism and overperformance

Status: living audit · 2026-07-27 · Epistemic: mixed (measured telemetry + surrogate params)

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

## Other overperformance flags (not fixed this pass)

| Issue | Evidence | Recommended correction | Tag |
| --- | --- | --- | --- |
| **Sustained air-breathing M4** | Nothing flown sustains M4 air-breathing (`TurboRamjetPerformanceMap` comments). Intercept OFT energy-ladder peaks ~**M3.69** (`analysis/intercept-oft/*/energy-ladder/ticks.jsonl`). Mission copy still says Mach 4. | Treat M4 dash as **aspirational fiction**; design dash / Identity around measured ~M3.5–3.7 or honest cycle ~M2.9 until retuned. | provisional / fiction |
| **Wet T/W too high** | 85 kN × 1.55 / (9650×g) ≈ **1.39** SLS wet; at alert ~6556 kg ≈ **2.05**. Flight-test Identity wants augmented T/W **≤ 1.20** (`docs/2026-07-26-open-work-and-findings.md`). Core was raised 65→85 kN for playability. | Retune core / lever stop toward ≤1.20; do not buff further to green OFT. | provisional |
| **Engine buff history** | Open findings: ramjet was buffed (DesignMach, burner, ratios) rather than fixing guidance. | Prefer guidance / profile; keep `DesignMach=2.6` as normaliser only. | open finding |
| **Lever-only fuel** | Turbine can charge MIL fuel while thrust share is zero. Ram cruise economy / “idle the core” unteachable. | Per-stream fuel in map + instruments. | open finding |
| **12 / 15 G structure** | Params; reclined thesis. Extreme for a crewed interceptor. | Cost/fatigue ledger or lower qualified G. | provisional |
| **CMC 1200 °C** | Credible 2030s materials trajectory; does **not** make M4 historical. Distinguishes thermal ceiling (~M5.7) from thrust ceiling (~M4.5). | Keep CMC as materials claim; pair with honest dash Mach. | surrogate |

## Implications for CMC / Mach-4 story

1. **Thermal gauge is now structurally honest enough to teach soak** — diving no longer fake-cools the article. Margin vs CMC limit will stay hot after a dash longer; that is the right lesson.
2. **Mach-4 dash remains the weakest claim** — telemetry and map comments both say the jet is already improbably fast; CMC was accepted to *support* that fiction, not to prove it.
3. Prefer correcting **propulsion / dash** toward measured ~M3.7 before spending more art on M4 branding.
