# F-22 public-data surrogate performance audit

Date: 2026-07-28

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

## Findings

| Area | Result | Evidence / disposition |
| --- | --- | --- |
| Supersonic drag | **Broken** | The F-22 omitted `WaveDragPeakMach`, so the transonic quadratic grew forever. At M1.2 it multiplied zero-lift drag by 5.375; at M1.5 by 22.175. Force-balance reproduction puts the resulting augmented ceiling near M1.25 at FL500, matching the reported symptom. The rise now holds at M1.11. |
| Drag-peak calibration | **Surrogate, not published data** | No cited source selects M1.11. It is a corridor calibration within a checked M1.10–M1.12 sensitivity band; all three retain positive full-mass Ps at 40,000 ft / M1.5 dry and 50,000 ft / M2.0 augmented. The held plateau is intentionally coarser than a real post-peak drag reduction. |
| High-altitude thrust | **Broken outside the normal fight band** | The shared afterburning-turbofan surrogate clamped lapse to at least 30%, so thrust stopped falling in very thin air. The lower clamp is now zero for the F-22, F-35C, Su-27-family, and Cheap Rapier users; sibling regressions assert continued lapse from 70,000 to 100,000 ft. The existing density/Mach surrogate remains explicit and bounded above. |
| Atmosphere and Mach | Pass | The 1976 standard-atmosphere implementation includes the isothermal lower stratosphere and computes Mach from local speed of sound. No hidden sea-level Mach conversion or TAS/IAS mix caused the wall. |
| Automatic surfaces | Pass | Leading-edge flaps retract by 300 KCAS and add lift-limit only; the speed brake deploys only near idle. Full-power supersonic runs remain clean. |
| Speed-hold feed-forward | **Known mismatch; not a dash limiter** | `DetentLayer.ThrottleForRequiredThrust` estimates every non-J47 engine with linear density lapse, while the F-22 force kernel uses the square-root-density turbofan surrogate. Full-power flight bypasses this estimate, so it did not cause the M1.2 wall. Correcting it belongs with a propulsion-map API rather than another duplicated formula in this patch. |
| Mass and fuel | Pass as a rounded public-data surrogate | The 19,535 kg fuel-free mass is about 43,067 lb, 273 lb (0.6%) below the fact sheet's 43,340 lb weight anchor. Adding about 18,000 lb internal fuel closes to the 27,700 kg full-fuel reference mass. Mission 7 stages a lighter combat fuel load and updates mass through the fuel chain. |
| Installed thrust class | Pass as a surrogate | 233.6 kN military plus the 1.35 lever stop gives 315.4 kN maximum, close to the public two-by-35,000-lbf class. The altitude/Mach curve and fuel flows remain labelled surrogates, not an F119 deck. |
| Subsonic turn / high alpha | Covered elsewhere | +9 G protected flight, the labelled override, q-limited controls, body-axis high-alpha forces, thrust-vector allocation, and automatic leading-edge flaps already have dedicated corridor tests. This change does not retune them. |
| Thermal / inlet / exact ceiling | **Not represented well enough for a hard claim** | The F-22 declares no thermal limit and the generic turbofan has no validated inlet/installation deck. Tests therefore bind only 40–50 kft public corridors and a Mach-two-class bracket, not an exact top speed or service ceiling. |
| Range / endurance | **Unvalidated surrogate** | Fuel-flow anchors are transparent gameplay values. They should not be used to claim F-22 range or endurance until a separate public-data fuel audit is authored. |

## Executable gates

`F22SupersonicPerformanceTests` now checks:

1. the original transonic calibration is unchanged below M1.11 and no longer grows beyond it;
2. positive level-flight specific excess power at 40,000 ft / M1.5 in military power;
3. positive level-flight specific excess power at 50,000 ft / M1.5 in military power;
4. positive level-flight specific excess power at 50,000 ft / M2.0 in full augmentation;
5. negative excess power by 50,000 ft / M2.3, bounding the surrogate to Mach-two class;
6. dynamic acceleration from M1.05 through the former wall and into the dry-supercruise corridor,
   plus an augmented Mach-two run at FL450;
7. continued thrust lapse above the former 30% floor for every airframe sharing that engine model.

These are capability corridors, not curve fitting to unpublished point performance.
