# F-22 public-data surrogate performance audit

Date: 2026-07-28 · Re-pass: 2026-07-29 (`docs/superpowers/specs/2026-07-29-f22-flight-realism-repass-design.md`)

## Scope and claim boundary

This is a whole-path audit of `F22APublicDataSurrogate`: public airframe anchors, atmosphere and
air-data, propulsion lapse, clean drag, automatic configuration, mass/fuel integration, high-alpha
control allocation, and executable performance corridors.

It is deliberately **not** an OEM aerodynamic database, engine deck, flight-control law, or
classified envelope. The defensible public performance anchors are broad:

- USAF: greater-than-Mach-1.5 supercruise without afterburner, "Mach two class", ceiling above
  50,000 ft, 840 ft² wing, 43,340 lb empty weight, 18,000 lb internal fuel, and +9 G.
- USAF flight reporting: demonstrated Mach 1.5 at 40,000 ft on a certification flight and a
  Mach-1.5 weapon delivery from 50,000 ft.
- NASA: approximately 35,000 lbf maximum thrust per F119 and ±20° pitch thrust vectoring.

Primary sources:

- <https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104506/f-22-raptor/>
- <https://www.af.mil/News/Article-Display/Article/113833/f-22-raptor-flown-on-synthetic-biofuel/>
- <https://www.af.mil/News/Article-Display/Article/130068/raptor-meets-new-challenges-expands-capabilities/>
- <https://ntrs.nasa.gov/api/citations/20180003207/downloads/20180003207.pdf?attachment=true>

## M2.5 out of claim

Playtesting often asks why the jet “won’t make M2.5.” That is expected under this surrogate.

USAF public language is **Mach two class**, not a published M2.5 sustained dash. The executable
ledger therefore requires:

- **positive** level-flight specific excess power at FL500 / **M2.0** full augmentation;
- **negative** excess power at FL500 / **M2.3** and **M2.5** full augmentation;
- FL450 dynamic full-AB accel only into about **M1.9–2.15**.

So M2.5 is a named **negative-Ps** contract (`F22SupersonicPerformanceTests`), not a bug to
retune wave drag for. Re-pass 2026-07-29 did not open the dash ceiling.

## Findings

| Area | Result | Evidence / disposition |
| --- | --- | --- |
| Supersonic drag | **Fixed (2026-07-28)** | The F-22 omitted `WaveDragPeakMach`, so the transonic quadratic grew forever. The rise now holds at M1.11. |
| Drag-peak calibration | **Surrogate, not published data** | No cited source selects M1.11. Corridor calibration within M1.10–M1.12; retains positive full-mass Ps at 40k / M1.5 dry and 50k / M2.0 AB. |
| High-altitude thrust | **Fixed (2026-07-28)** | Former 30% lapse floor removed for shared turbofan users; regressions assert continued lapse 70k→100k ft. |
| Atmosphere and Mach | Pass | 1976 standard atmosphere; Mach from local speed of sound. |
| Automatic surfaces | Pass | LEF / speed-brake behaviour leaves full-power supersonic runs clean. |
| Speed-hold feed-forward | **Fixed (2026-07-29)** | `DetentLayer.ThrottleForRequiredThrust` now uses `TurbofanPublicDataSurrogate` (√density × Mach-ram), matching `AircraftSim`. Lever invert is against unit-military available thrust, then clamped to `MaxThrustFraction`. Covered by `TurbofanThrustEstimateTests`. |
| Relative throttle resolution | **Surrogate (2026-08-04)** | Lever→thrust stays linear. Keyboard/rocker/virtual-stick relative rates follow `ThrottleInputSchedule` (fine ≤180 KIAS and ≤0.20 lever; coarse ≥300 KIAS or ≥0.35 lever) so finals have usable precision without retuning AI, TVC, fuel, RPM, or rollout braking. Epistemic: `surrogate`. |
| Mass and fuel | Pass as a rounded public-data surrogate | ~43,067 lb fuel-free vs 43,340 lb fact-sheet anchor (~0.6%). |
| Installed thrust class | Pass as a surrogate | 233.6 kN military × 1.35 stop ≈ public two-by-35,000-lbf class. |
| Subsonic turn / high alpha | Covered elsewhere | See `docs/f22-high-alpha-review.md` and high-alpha corridor tests. |
| Thermal / inlet / exact ceiling | **Not represented well enough for a hard claim** | No thermal limit; no validated inlet deck. Bind only 40–50 kft public corridors + Mach-two-class bracket. |
| Range / endurance | **Unvalidated surrogate** | Fuel-flow anchors are gameplay-transparent; do not claim F-22 range/endurance from them. |

## Executable gates

`F22SupersonicPerformanceTests` checks:

1. transonic calibration unchanged below M1.11 and held above the peak;
2. positive level-flight Ps at 40,000 ft / M1.5 military;
3. positive level-flight Ps at 50,000 ft / M1.5 military;
4. positive level-flight Ps at 50,000 ft / M2.0 full augmentation;
5. negative excess power at 50,000 ft / M2.3 full augmentation (Mach-two-class upper bound);
6. negative excess power at 50,000 ft / M2.5 full augmentation (explicit out-of-claim lock);
7. dynamic accel at FL450: military through the former wall into dry supercruise; full AB into
   Mach-two class (~M1.9–2.15);
8. continued turbofan thrust lapse above the former 30% floor for shared engine users;
9. audit ballpark fact confirming M2.5 Ps sits below M2.3 Ps.

These are capability corridors, not curve fitting to unpublished point performance.
