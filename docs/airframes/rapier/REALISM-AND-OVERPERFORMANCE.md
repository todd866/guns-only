# Rapier realism and overperformance

Status: living audit · 2026-07-29 · Epistemic: mixed (measured telemetry + surrogate params)

Companion to the SE bible chapters. **Do not treat Mach-4 / CMC as closed engineering** until
the issues below are closed or deliberately accepted as fiction.

**Program design:** `docs/superpowers/specs/2026-07-29-rapier-flight-sound-realism-design.md`
(Approach 1 — this file is the dynamics↔sound epistemic map; passes are sequential).

## Aerothermal telemetry: channel mismatch (FIXED in snapshot/HUD)

| | |
| --- | --- |
| **Symptom** | Build 174 showed a plausible but low wall value in `rapier_stagnation_temp_c`, then compared it with a 1200 °C CMC number and presented hundreds of degrees of meaningless “margin.” |
| **Root cause** | The field name, value, and comparator described different things. It carried **lagged wall skin**, not stagnation `T0`; the lag target was turbulent flat-skin recovery `Taw`; 1200 °C is an authored CMC material capability, not a qualified whole-aircraft operating limit. |
| **Evidence** | Build 174 Intercept OFT at M3.635 / FL69344: ambient −55.4 °C, perfect-gas `T0` 519.9 °C, recovery 450.8 °C, lagged wall 450.6 °C, CMC card 1200 °C. The low wall reading is physically consistent; the label and “margin” were not. |
| **Fix** | Snapshot 1.19 publishes `rapier_skin_temp_c`, `rapier_recovery_temp_c`, true `rapier_stagnation_temp_c`, `rapier_cmc_capability_c`, and conservative `rapier_cmc_margin_c`. Normal HUD copy shows `SKIN` and `T0`, suppresses the giant pseudo-margin, and states `ENGINE/INLET LIMITING`. |
| **Ceiling** | Rapier screens the raw CMC capability against inlet/leading-edge `T0`, not flat-skin recovery: ~M5.37 rather than ~M5.72 at FL700. The Intercept cue advertises measured design dash **M3.55**, not that material screening ceiling; Mach 4 remains SE-bible fiction only. |
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

---

## Dynamics ↔ sound regime map

Hard rule: Mach / density / thrust thresholds appear once (`TurboRamjetPerformanceMap` or
`RapierAerodynamics`). Briefing, HUD, and `engine_audio.js` consume that source — they do not
invent parallel schedules. Presentation may stylize levels; it may not invent physics.

Map constants (owner): `RamFadeStartMach` 2.0 · `FullRamMach` 2.8 · `TurbineFadeStartMach` 1.9 ·
`TurbineGoneMach` 3.0 · `RamSpillStartMach` 3.3 · `RamSpillCompleteMach` 3.8 ·
`DesignMach` 2.6 (normaliser only).

| Regime | Physics truth | Ear cue | Evidence | Tag | Pass | Shared fields |
| --- | --- | --- | --- | --- | ---: | --- |
| Catapult / launch | Maglev gallery → 12° ramp; ~110 m/s end | Present (EM climb / rail / portal) | Surrogate launcher geometry | surrogate | 4 | `catapult_*` |
| Subsonic climb → FL560 | Turbine; ~M0.90; clean config | Present (turbine + core beds) | OFT / reconstruction | surrogate | — | `engine_rpm_pct`, thrust kn, mach |
| Transonic push | Wave-drag peak ~M1.18; push through | Present (power + q rush) | Polar knots | surrogate | — | mach, q, throttle |
| Turbine→ram bucket | Map M2.0→2.8 overlap; real thrust hole | Thrust-kn live mix; Mach-fallback owns map thresholds | Map + Build 172 | surrogate | — | map thresholds, `rapier_*_thrust_kn`, mach |
| Ram climb / dash | Climb targets M3.15 (below spill); OFT peak ~M3.69; mission commands **MeasuredDashMach 3.55** | Cue matches measured dash; M4 fiction not commanded | Reconstruction M3.69 | provisional | **1 ✓** | `rapier_design_dash_mach`, commanded mach, spill |
| FL700 capture | Geometric gate; predictive unload cues shipped post-Build 173 | Soft (rush + cue), not capture-specific bed | Reconstruction zoom error | surrogate | 2 | phase, alt error, G |
| Thin-air authority | Mass/q normal-law floor ≥ ~1.05 g; physical still ~few g @ FL720/M3.5; inertias scaled to 11 t | Missing bind-by-ear (buffet ≠ authority ceiling) | Aero unit + ClampNz | provisional | **2 ✓** | alpha limit, q, mass, load |
| Zoom coast / exo | q→0; RCS residual; turbine density fade | Present (coast silence + descending whine) | Audio tests | surrogate | — | thrust kn, q, `rapier_rcs_*` |
| RCS | Finite 40 kg cold-gas | Present (ticks / hiss) | Zoom-lob design | provisional | — | `rapier_rcs_*` |
| High-q dive / pull | Soft `rapier_over_q` above 80 kPa placard; no structural damage model | Soft over-q awareness (hot HUD cue deferred) | Authored placard | provisional | **3 ✓** | `rapier_over_q`, q |
| Inlet off-design | Sticky unstart seed above ram + α/β recovery floor | Distortion cue soft; unstart gulp still thin | NASA-inspired surrogate | provisional | **3 ✓** | `rapier_inlet_unstart`, recovery, alpha, beta |
| Trap / pattern | Hook recovery | Present (snatch / stretch) | Better-sound Phase 2 | surrogate | — | `arrest_*` |
| Reentry rush | Rising q after coast | Deferred distinct character | Better-sound Phase 2 open | provisional | **4** | q, density |

### Remaining overperformance flags → pass assignment

| Issue | Pass | Disposition |
| --- | ---: | --- |
| Sustained air-breathing M4 / mission copy drift | 1 | **Closed** — MeasuredDashMach 3.55; M4 fiction only |
| Engine buff history (prefer guidance) | 1 | Keep `DesignMach=2.6` normaliser; no silent ratio buffs |
| Normal-law too tight @ FL720 | 2 | **Closed** — mass/q floor under physical/Mach schedule |
| Inertias ~7.85 t on 11 t gross | 2 | **Closed** — ×11090/7850 |
| 12/15 G structural ceilings | 2–3 | Keep demand≠lift; ledger later |
| Scalar inlet only | 3 | **Closed seed** — sticky unstart + recovery floor (still provisional) |
| No aeroelastic / V-q damage | 3 | **Closed awareness** — `rapier_over_q` placard; full aeroelastics deferred |
| Full aero tables | 4 | **Deferred** — Passes 1–3 closed without evidenced wrong-feel gate |
| CMC 1200 °C vs dash claim | 1 | Keep CMC materials; pair with honest dash |

---

## Pass 0 — Drift checklist (coherence inventory)

Status: **exited 2026-07-29** — dispositions filled; audio Mach-fallback consumes
`rapierPropulsionThresholds`; better-sound prose aligned. Pass 1 may begin (honest dash story).

Disposition per row: **own** (already single-sourced) · **fix** (must consume owner) · **accept**
(documented fiction / provisional with tag).

| Surface | Claimed number / schedule | Owner should be | Observed (fill in Pass 0) | Disposition |
| --- | --- | --- | --- | --- |
| `TurboRamjetPerformanceMap` | M2.0 / 2.8 / 1.9 / 3.0 / spill 3.3–3.8 | (owner) | `RamFadeStartMach=2.0`, `FullRamMach=2.8`, `TurbineFadeStartMach=1.9`, `TurbineGoneMach=3.0`, spill 3.3–3.8 — closed constants in `TurboRamjetPerformanceMap.cs` | own |
| Runtime transition banners | Formatted from map | map | `SimulationSession` emits `RAM LIGHT · M{RamFadeStartMach}` / `FULL RAM · M{FullRamMach}` from map constants | own |
| Intercept briefing prose | Historically M1.6/M2.2; kernel-publish path shipped | map | `app.js` brief uses `{RAM_LIGHT_MACH}` / `{FULL_RAM_MACH}`; `rapierBriefingText` substitutes from `rapier_*_mach` snapshot fields | own |
| Mission director climb / Accelerate M2.2 | M3.15 climb; `accel_to_m2.2` gate M2.20 | mission | `RapierMission.cs`: RamClimb `targetMach=3.15`; Accelerate gate `accel_to_m2.2` / M2.20 — profile gates, not map thresholds | own |
| Intercept M4.0 cue / design-dash fiction | Authored M4.0 intercept; skin-clamped | mission + audit | **Pass 1 closed:** `MeasuredDashMach=3.55`; Intercept/Escape command it; `rapier_design_dash_mach` published; M4 fiction only | own |
| Identity / campaign brief | “design dash M4 (fiction)” | audit dash claim | Briefing uses `{DESIGN_DASH_MACH}`; copy states Mach 4 is bible fiction, never commanded | own |
| `engine_audio.js` Mach-fallback | `rapierPropulsionThresholds` | map via published snapshot | `rapierHandoverMachFallback` reads `rapier_ram_light_mach` / `rapier_full_ram_mach`; live mix prefers thrust-kn share | own |
| Better-sound spec regime table | M2.0–M2.8 map bands; thrust-kn live mix | map | `2026-07-28-better-sound-design.md` regime table aligned with published thresholds (Pass 0 exit) | own |
| HUD combined-cycle lesson | Thresholds | map | `rapierCycleTeachPresentation` → `rapierPropulsionThresholds(state)` reads published `rapier_ram_light_mach` / `rapier_full_ram_mach` / `rapier_turbine_gone_mach` | own |
| Audio profile IDs | `audio.rapier.turbo-ram.v1` | character only — not Mach schedule | `audio_character.js` maps ID to `"rapier"`; no Mach schedule copies in profile registry | own |
| Thermal ceiling cues | T0 vs CMC capability | aerothermal snapshot | Snapshot 1.19 distinguishes `rapier_skin_temp_c`, `rapier_stagnation_temp_c`, `rapier_cmc_capability_c`; HUD shows SKIN/T0/ENGINE-INLET LIMITING | own |

Pass 0 exit: every row above has a disposition; CI or unit tests cover the cheap **fix** rows
(briefing / audio / banner numeric claims vs map). Then Pass 1 may retune dash story.

## Passes 1–3 — exit status (2026-07-29)

| Pass | Status | What landed |
| ---: | --- | --- |
| **1** | **exited** | `MeasuredDashMach=3.55`; Intercept/Escape retuned; `rapier_design_dash_mach` on schema 1.24.0; briefing tokens; OFT cue asserts measured dash |
| **2** | **exited** | Inertias ×11090/7850; mass/q normal-law floor (~1.05 g holdable at FL720/M3.5); Protection path wired |
| **3** | **exited** | Sticky inlet-unstart seed + recovery floor; `rapier_inlet_unstart` / `rapier_over_q` (80 kPa placard); unit + integration pins |
| **4** | **deferred** | No residual evidenced wrong-feel gate after 1–3; full aero tables / distinct reentry rush remain optional |
