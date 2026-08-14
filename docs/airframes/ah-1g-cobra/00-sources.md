# Late AH-1G — source and parameter ledger

Backs `sim/Vehicles/Rotorcraft/Ah1gCobraDefinition.cs` and
`sim/Vehicles/Rotorcraft/Ah1gCobraDynamics.cs`.

## Variant lock

The modeled aircraft is a late-production AH-1G with T53-L-13B engine, standard BHC-540 rotor,
starboard tractor tail rotor and standard 8.4-inch tail-rotor chord. These values must not be mixed
with early port/pusher-tail aircraft, the enlarged 11.5-inch tail-rotor MWO, NASA instrumented-aircraft
empty weights, or later AH-1S/F engines, rotors and weapon systems.

## Primary references

1. U.S. Army, **TM 55-1520-221-10, Operator's Manual: AH-1G/TH-1G** (18 March 1980), especially
   §§2-24, 2-32, Chapter 5 limits, Chapter 7 performance, and §§8-61–77.
   [Texas Tech Vietnam Center scan](https://vva.vietnam.ttu.edu/images.php?img=%2Fimages%2F403%2F4030309001.pdf).
2. U.S. Army, **TM 55-1520-221-10 C-1** (15 September 1967), Chapter 7 limits, Chapter 8 flight
   characteristics, and Chapter 14 hover/climb charts. The local research scan is retained only in
   ignored working data under `tmp/pdfs`; it is not a shipped asset.
3. NASA TM-80112, **A Flight Investigation of Basic Performance Characteristics of a
   Teetering-Rotor Attack Helicopter**, Tables I–III and pp. 65–69.
   [NASA NTRS PDF](https://ntrs.nasa.gov/api/citations/19790018926/downloads/19790018926.pdf?attachment=true).
4. NASA CR-178201, **Summary of the Modeling and Test Correlations of a NASTRAN Finite Element
   Vibrations Model for the AH-1G Helicopter**, pp. 10 and 91–94.
   [NASA NTRS PDF](https://ntrs.nasa.gov/api/citations/19870011940/downloads/19870011940.pdf).
5. NASA CR-3144, **A Compilation and Analysis of Helicopter Handling Qualities Data, Volume One**,
   AH-1G section pp. 115–120 and derivative tables from p. 122.
   [NASA NTRS PDF](https://ntrs.nasa.gov/api/citations/19800002851/downloads/19800002851.pdf).
6. Wayne Johnson, NASA TP-2005-213477, **Model for Vortex Ring State Influence on Rotorcraft Flight
   Dynamics**, model and algorithm tables on pp. 14–15 and 23–24.
   [NASA NTRS PDF](https://ntrs.nasa.gov/api/citations/20060024029/downloads/20060024029.pdf).
7. NASA TM X-73990, **Two-Dimensional Aerodynamic Characteristics of Several Rotorcraft Airfoils at
   Mach Numbers From 0.35 to 0.90**, BHC-540 results around pp. 16–18 and 28 onward.
   [NASA NTRS PDF](https://ntrs.nasa.gov/api/citations/19770008056/downloads/19770008056.pdf).
8. FAA, **Helicopter Flying Handbook**, Chapters
   [2 (aerodynamics)](https://www.faa.gov/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/helicopter_flying_handbook/hfh_ch02.pdf),
   [3 (controls)](https://www.faa.gov/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/helicopter_flying_handbook/hfh_ch03.pdf), and
   [11 (emergencies)](https://www.faa.gov/sites/faa.gov/files/regulations_policies/handbooks_manuals/aviation/helicopter_flying_handbook/hfh_ch11.pdf).
9. U.S. Army FM 101-20 (1973), AH-1G characteristics and typical mission performance, pp. 1-21–22.
   [Archived PDF](https://www.bits.de/NRANEU/others/amd-us-archive/FM101-20%2873%29.pdf).

### Armament references reserved for the gun lab

- U.S. Army FM 1-40 (1973), Chapter 12, documents the M28A1 as a fully flexible gunner-controlled
  subsystem that the pilot can fire fixed forward, including dual-M134, dual-M129, and mixed
  installations. [Archived field manual](https://www.bits.de/NRANEU/others/amd-us-archive/FM1-40%281973%29.pdf).
- The U.S. Army Redstone Arsenal historical catalogue identifies the AH-1G M28/M28A1 turret,
  M18/M18A1 M134 pods, and port-mounted M35/M195 20 mm system. It also keeps those systems distinct
  from later Cobra fits. [Army aviation systems history](https://history.redstone.army.mil/avi-systems.html).

The first Guns Only combat card should therefore use the M28A1 with two M134s in the documented
pilot-fixed mode. Flexible gunner slaving and alternate M28A1 combinations can follow once turret
authority exists; the M35/M195 is a separate asymmetric-store configuration. Do not put an M197
turret on this late-production AH-1G baseline.

### Hold the Bridge gun model numbers (2026-08-03, `cobra-hold-tuning`)

Hold the Bridge now evaluates the gun against a flexible-turret envelope instead of the shipped
0.06 rad whole-aircraft nose coincidence:

| Quantity | Value in code | Epistemic |
|---|---:|---|
| Turret azimuth limit | ±110° | provisional — FM 1-40 Ch. 12 flexible subsystem; exact M28A1 stops not yet located |
| Turret elevation | +20° / −50° | provisional — same |
| Ballistic solution window | 80–2,000 m | provisional — gameplay bracket carried over from the initial bridge wiring |
| Turret servo slew | ≈80°/s | provisional crew/mount model, not an airframe measurement |
| M134 fire rate | 45 rps | provisional authored magazine value; the fractional-round pacing fix only made consumption honest at 120 Hz, it did not retune the rate |
| Hostile seed rings | 140 / 170 / 200 m | provisional pacing — previous 30 / 42 / 55 m rings sat inside the 80 m min-solution window and died to friendly ground fire before a player standoff shot existed |
| Hostile reinforce ring | 160 m (+20 m/slot) | provisional pacing — matches the seed standoff so reinforce waves stay shootable |

Rejected on evidence: the 0.06 rad nose-coincidence gate (unreachable with cyclic-only aim, and
not what FM 1-40's flexible subsystem does) and obstacle-only line of sight (allowed firing
through terrain). Gun LOS now samples terrain along the shot line with the same 0.5 m clearance
the threat-mask observers use.

## Published / measured values used directly

| Quantity | Value in definition | Locator and note |
|---|---:|---|
| Maximum gross mass | 9,500 lb / 4,309.1 kg | Army TM Chapter 5; CR-178201 p. 10 |
| Production empty mass | 5,760 lb / 2,612.7 kg | CR-178201 p. 93; deliberately not NASA test-aircraft 6,080 lb |
| Basic Mission inertia reference mass | 8,930.77 lb / 4,051.0 kg | CR-178201 weights tape, p. 93 |
| Body inertias at Basic Mission | Ix 3,948; Iy 18,038; Iz 15,527 kg·m² | converted CR-178201 p. 93 values; pinned for the next 6-DOF tier |
| Product inertia magnitude | 1,288 kg·m² | CR-3144; sign awaits game-axis verification and is not applied yet |
| Engine | Lycoming T53-L-13B | NASA TM-80112 Table I; Army Chapter 7 |
| Uninstalled military rating | 1,400 shp / 1.044 MW | Army §2-24 |
| Installed drivetrain limit | 1,100 shp / 820 kW | NASA TM-80112 Table I; Army 50 psi torque limit |
| Main rotor | 2-blade semi-rigid BHC-540 | NASA TM-80112 Table I |
| Main radius / chord | 6.706 m / 0.686 m | NASA TM-80112 Table I |
| Solidity / twist | 0.0651 / −10° root-to-tip | NASA TM-80112 Table I |
| Flapwise inertia | 1,878 kg·m² per blade | NASA TM-80112 Table I, standard blade |
| Precone | 2.75° | NASA TM-80112 Table I |
| Rotor RPM | 324 nominal; 294–324 continuous; 339 autorotation max | Army Chapter 5 / Figure 7-2 |
| Tail rotor radius / standard chord | 1.295 m / 0.214 m | NASA TM-80112 Table I |
| Main-to-tail gear ratio | 5.123 | NASA CR-3144 p. 116; gives ≈1,660 tail rpm at 324 main rpm |
| Main hub relative to Basic Mission CG | 0.155 m aft, 2.073 m above | CR-178201 p. 92 stations |
| Tail hub relative to Basic Mission CG | ≈0.386 m right, 1.190 m above, 8.300 m aft | CR-178201 p. 92 stations |
| Exposed stub-wing area / incidence | 1.63 m² / 14° | NASA TM-80112 Table I |
| SCAS cyclic/yaw actuator lag / authority | 0.08 s / 0.05 s / ±12.5% travel | NASA CR-3144 AH-1G section; measured. Yaw channel is active in dynamics (Build 304); cyclic SCAS still deferred to a later limited-authority SAS model |

The 1980 flight-test report NASA TM-81871 describes a modified test rotor (including 2,120
kg·m² blade inertia and enlarged tail-rotor chord). Those values are useful for reproducing that
specific test but are **not** silently substituted into this production baseline.

## Derived values

At 9,500 lb, sea level and 324 rpm:

| Quantity | Derived value | Formula / use |
|---|---:|---|
| Rotor disk area | 141.279 m² | πR² |
| Disk loading | ≈299 N/m² / 6.25 lb/ft² | W/A; cross-checks FM 101-20 |
| Ideal hover induced velocity | ≈11.05 m/s | √(W/(2ρA)) |
| Main rotor thrust coefficient | ≈0.00472 | W/(ρA(ΩR)²) |
| Blade rotational-energy lower bound | ≈2.16 MJ | ½(2Ib)Ω²; excludes hub/reflected drivetrain inertia |
| Main-shaft torque at 820 kW | ≈24.2 kN·m | P/Ω |
| Main 2/rev frequency | 10.8 Hz | 2 × 324/60 |
| Tail rotor speed / blade-passage frequency | ≈1,660 rpm / 55.3 Hz | mechanical gear ratio |

## Provisional engineering parameters — not measurements

These values make the first deterministic flight foundation operable; each must be calibrated or
replaced before production-combat fidelity is claimed.

| Field | Current value | Status / replacement path |
|---|---:|---|
| Effective collective pitch mapping | 8.5°–20.5° root-equivalent | lower endpoint follows the Army full-down autorotation discussion; upper endpoint and normalized rigging are provisional. Do not confuse with NASA physical stops or trim-angle tables. |
| Rotor lift slope / profile Cd | 5.73 rad⁻¹ / 0.012 | low-Mach BEMT starting values; replace with BHC-540 α/M/Re tables plus dynamic stall |
| Induced-power factor | 1.15 | conventional initial fit; close against Army hover torque charts |
| Governor gain and fall lag | 24 kW/rpm / 0.40 s | chosen to express droop/recovery; identify against transient data |
| Engine rise time constant | 1.33 s | derived so a first-order response reaches ≈95% in four seconds, matching the manual's “up to four seconds” bottom-to-full turbine lag |
| Fuselage drag areas | 1.70 / 4.20 / 5.80 m² | provisional anisotropic areas; replace with NASA speed-sweep/component buildup |
| Stub-wing lift model | slope 4.25 rad⁻¹, CLmax 1.15, AR 3.4, e 0.72 | geometry is sourced; polar is provisional |
| Whole-disk response | 0.12 s | provisional reduced-order rotor response; it is not the measured 0.08 s limited-authority SCAS actuator lag |
| Maximum body rates / response lags | 60°/s roll, 42°/s pitch, 45°/s yaw | gameplay-safe reduced-order response; replace with source-derived 6-DOF moments/derivatives |
| Torque→yaw gain at transmission limit | 11.0°/s body yaw | provisional reduced-order mapping; Build 307 raises residual so feet-off hover needs occasional left pedal. SCAS ±12.5% only (no 305 autotrim). Replace with hub/fin/tail-rotor moment closure |
| Forward-flight weathervane yaw damping | μ/0.18 schedule × 2.4 /s on body yaw rate | provisional directional-stability stand-in (not a fin/BEMT model). Opposes yaw rate with advance ratio so cruise holds heading better than hover residual alone. Replace with source fin/weathervane derivatives |
| Cobra canyon terrain wind field | synoptic (−4, 0, 0.5) m/s + height/slope channeling | provisional `IWindField`; ridge speed-up, lee soften, cut channeling. Not CFD. Still air = zero synoptic / disabled field (tests). Audit via wind_* telemetry vs yaw_residual |
| Numerical main-rotor load guard | 3.7 × maximum-gross weight | nonphysical divergence guard set no lower than the highest cited clean-configuration load factor; replace with weight/store-specific structural and aerodynamic envelopes |
| Skid stations/track and impact threshold | current definition | coarse four-point contact; replace from gear geometry and landing-drop evidence |
| VRS loss amplitude / RBS onset blend | current model coefficients | continuous and dimensionless, but not flight-identified; replace with Johnson VRS and azimuth-resolved stalled-area loads |
| Keyboard collective full-travel rate | 0.40 /s | matches the existing Hold the Bridge lever feel; identify against AH-1 collective travel times |
| Keyboard cyclic/pedal full-travel rate | 2.5 /s | production digital slew/spring-center; not a measured stick force or damper rate |
| DShK acquisition / burst cadence | 8.0 s / 5.0 s | provisional fairness timing. One nearest living `DshkSite` owns acquisition; masking or changing source resets it. Not a measured crew reaction or fire-control model. |
| DShK projectile / dispersion closure | 850 m/s; 2.0 s base delay; 0.12–0.48 m dispersion; 6.5 km cap | provisional warned-burst gameplay ballistics. Replace with sourced 12.7×108 mm exterior ballistics, mount dispersion and range doctrine. |
| Player vulnerability capsules | fuselage radius 1.35 m; tail-boom radius 0.58 m | provisional live-position intersection geometry, not armour/component vulnerability data. The first engagement burst is an authored 24 m near miss; later intersecting bursts can fail SCAS then engine. |
| Turnaround action timing | 0.75 s pad dwell; 1.0 s shutdown/start holds | compressed interaction timing for a one-button assisted sequence, not an AH-1G checklist duration. Order follows the operator/checklist family; timing is gameplay. |
| Grounded shutdown / spare handoff | 3.2 s rotor rundown time constant; ≤5% shaft power and ≤50 rpm | provisional safe-handoff presentation closure. It is not a measured BHC-540 coast-down curve or maintenance clearance criterion. |
| Assisted-start flight release | ≥294 rpm continuously for 0.75 s | provisional control/weapon interlock at about 91% of the sourced 324 rpm nominal Nr. Replace with source-derived start/governor limits and dwell. |

## Performance facts reserved for validation

- FM 101-20 gives representative combat level speeds of roughly 132–140 kt and 1,230–1,330
  ft/min maximum climb for heavy mission loads; a clean ferry case gives 155 kt and 1,860 ft/min.
- FM 101-20's listed configuration load factors span 2.4 at maximum takeoff weight to 3.7 in a
  clean light case. The v1 thrust solver does not claim to implement that configuration-dependent
  structural envelope; its 3.7 guard exists only to stop numerical divergence.
- CR-178201 gives approximately 149 kt maximum sea-level level speed. The Army 190 KIAS limit is
  a redline, not the level-speed target.
- The Army manual gives 60–80 kt for maximum steady autorotative rotor RPM, about 60 KIAS minimum
  rate, and 90 KIAS clean maximum glide.
- FAA effective translational lift is typically 16–24 kt. It must emerge continuously from inflow,
  not appear as a switched lift bonus.
- Army VRS/settling text reports reduced control effectiveness and descents exceeding 2,200 ft/min;
  increasing collective can worsen the developed condition.

Those are test-card targets. They are not all closed by the v1 foundation.
