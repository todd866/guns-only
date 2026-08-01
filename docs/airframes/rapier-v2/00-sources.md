# Sources, assumptions, and epistemic status

This file separates external physical basis from user-fixed fiction and local preliminary-design
assumptions. A source supports a method or order of magnitude; it does not validate the integrated
Rapier configuration.

## External physical basis

| ID | Source | Used for | Does not establish |
|---|---|---|---|
| `nasa-stagnation-temperature` | [NASA Glenn, Stagnation Temperature](https://www.grc.nasa.gov/WWW/BGH/stagtmp.html) | Perfect-gas total-temperature relation, `T0 = T * (1 + (gamma - 1) M^2 / 2)` | Rapier skin temperature, heat flux, soak time, or reusable life |
| `naca-tn-2077` | [NACA TN 2077, Recovery Factors and Heat-Transfer Coefficients](https://ntrs.nasa.gov/citations/19930082751) | The distinction between stagnation and adiabatic recovery temperature; basis for an explicit recovery factor | Rapier boundary-layer state or a local heating map |
| `nasa-sic-sic-cmc-durability-2018` | [NASA/TM-2018-219884, SiC/SiC CMC durability](https://ntrs.nasa.gov/citations/20180002984) | Plausibility of SiC/SiC-class CMC as a high-temperature structural material family | A qualified 1,200 °C Rapier assembly, coating, joint, impact, or cycle life |
| `nasa-transient-thin-skin` | [NASA TP-2000-209034, transient thin-skin heating](https://ntrs.nasa.gov/citations/20010002830) | Evidence that temperature history requires heat-transfer rate, wall heat capacity, emissivity, and trajectory time | Permission to treat adiabatic temperature as a complete thermal design |
| `standard-atmosphere` | [NASA Glenn, Earth Atmosphere Model](https://www.grc.nasa.gov/www/k-12/airplane/atmosmet.html) | Piecewise hydrostatic standard-atmosphere basis for density, pressure, and local speed of sound | Actual day weather or a launch-site atmospheric profile |
| `f100-package-class` | [Pratt & Whitney, F100-PW-229](https://www.rtx.com/en/prattwhitney/products/military-engines/f100), [USAF National Museum, F100-PW-220](https://www.nationalmuseum.af.mil/Visit/Museum-Exhibits/Fact-Sheets/Display/Article/196437/pratt-whitney-f100-pw-220/), and [Wright-Patterson AFB, F100-PW-229 display](https://www.wpafb.af.mil/News/Article-Display/Article/2086145/f100-now-on-display-at-arnold-afb-engine-test-facility/) | F100-family dimensional and thrust class. P&W publishes 1.18 m maximum diameter, 4.85 m length, 1,735 kg specification maximum weight, and 129.7 kN thrust for the -229; family references bound the comparison near 1.18–1.22 m and 4.85–4.88 m | An 84 kN dry Rapier engine deck, conversion to a variable-cycle turbo-ramjet, installed duct/accessory geometry, cooling, nozzle matching, or operability |
| `nasa-mach4-variable-cycle-fan` | [NASA/TM-2011-216769 Part 1, Results of an Advanced Fan Stage Operating Over a Wide Range of Speed and Bypass Ratio](https://ntrs.nasa.gov/citations/20110020830) | A Mach-4+ variable-cycle turbofan/ramjet needs multi-point fan operation across very large changes in bypass ratio, speed, inlet mass flow, pressure, and temperature | Rapier's co-annular layout, scale, engine rating, inlet, combustor, shared nozzle, or installed performance |
| `nasa-limx-status` | [NASA, Status of the Combined-Cycle Engine Large-Scale Inlet Mode Transition Experiment](https://ntrs.nasa.gov/citations/20110011363) | TBCC inlet transition is an active control and operability problem involving two flowpaths, a splitter, turbine-face recovery/distortion, off-design Mach, and angle of attack | A single co-annular flowpath or a successful Rapier transition schedule |
| `nasa-limx-high-speed-flowpath` | [NASA/TM-2012-217219, Computational Analyses of the LIMX TBCC Inlet High-Speed Flowpath](https://ntrs.nasa.gov/citations/20120002618) | High-speed-flowpath and isolator area, back-pressure robustness, and asymmetric inflow require dedicated analysis; LIMX is explicitly a dual over-under flowpath | Rapier's annular passage, combustor, shared circular nozzle, or total-pressure recovery floor |

## User-fixed product requirements

These are accepted design inputs and are not attributed to the external sources above:

- catapult launch;
- a 10,000 ft / 3,048 m runway with an arrestor at its exact 1,524 m midpoint;
- an honest M4+ high-altitude dash;
- one canonical, known exterior;
- thermal limits that constrain the envelope, with plausible CMC help;
- one gun-only high-altitude balloon intercept, zoom, reentry, and recovery;
- no drones.

## Local engineering assumptions

| Assumption | Status | Reason for retaining it | Required successor evidence |
|---|---|---|---|
| SiC/SiC service screen at 1,473.15 K | Material-capability surrogate | Conservative enough to distinguish hot edges from ordinary composite while using a plausible material family | Coupon, coating, attachment, impact, oxidation, and thermal-cycle qualification |
| Warm integrated panel limit at 623.15 K | Provisional local limit | Creates a real cold-structure constraint instead of letting CMC make the entire vehicle thermally invulnerable | Resin/system allowables after soak, load, joints, wiring, seals, and repair |
| Titanium-aluminide aft panel at 973.15 K and nickel nozzle fairing at 1,273.15 K | Provisional installed limits | Separates aft and plume-adjacent zones from both CMC edge and warm composite | Alloy, coating, stress, oxidation, and duty-cycle substantiation |
| Recovery factor 0.88 | Conservative screening input | Represents a high recovery-temperature case without claiming a resolved boundary layer | Local transition and heat-transfer analysis |
| Zone adiabatic-rise fractions | Provisional heating screen | Allows different surface exposure while keeping the formula and margin explicit | CFD / aerothermal map correlated to ground and flight test |
| 84 kN dry turbine rating, 1.35 turbine-only augmentation, fade, and fuel anchors | Provisional local closure, not a user-fixed requirement | Restores finite transonic acceleration with a bounded 113.4 kN augmented static ceiling instead of a blanket multiplier; augmentation disappears with the turbine by M3.0 and cannot boost ram thrust | Installed turbine deck across altitude/Mach, augmentor operability, nozzle matching, transient spool, distortion, surge margin, and measured fuel flow |
| One-inlet co-annular variable-cycle turbo-ramjet with one shared nozzle | Explicit fictional/provisional architecture | Makes the visible single inlet/tunnel/nozzle and separate turbine/ram telemetry describe one system; creates a geometry contract that can fail instead of leaving “turbo-ramjet” undefined | Integrated inlet/engine/combustor/nozzle cycle model, mode-transition controls, distortion and back-pressure maps, rig testing, and failure modes |
| `1.22 m × 4.88 m` central core inside a `1.34 m × 5.48 m` package | F100-class sizing surrogate | Adds 30 mm structural plus 30 mm thermal radial allowance, 300 mm fore/aft allowance, and an explicit 150 mm capsule fire-bulkhead gap | Casing and accessory CAD, mounts, doors, ducts, seals, cooling, service removal path, structural loads, and weight statement |
| 245 kg/m³ effective package density, producing 1,893 kg over the installed envelope | Provisional mass surrogate | Keeps engine, mounts, doors, and duct hardware explicit; the result is 158 kg / 9.1% above P&W's 1,735 kg -229 maximum-weight comparison | Component weight statement and inertia from actual hardware layout |
| 30% recovered-total-pressure choked-area floor | Conservative preliminary flow-area screen | Rejects a tunnel that cannot pass the design mass flow even under the stated floor; the current 0.324 m² annulus needs about 28.2% and has only 6.2% area margin at the 30% screen | Inlet recovery/distortion map, variable geometry, combustor demand, corrected flow, boundary layer/bleed, and mode-transition test |
| Turbo-ramjet capture and specific-thrust schedules | Propulsion surrogate | Forces net thrust to scale with the shape-derived inlet and atmospheric mass flow | Vendor-quality cycle deck, inlet total-pressure recovery, distortion, operability, and installed nozzle data |
| 7.5-degree inlet design-flow incidence and deviation-based recovery/unstart schedule | Provisional installed-inlet model | Makes the visible inlet orientation the zero-loss reference and prevents nominal trimmed body alpha from being counted again as inlet off-design flow | Inlet geometry definition, viscous CFD or tunnel recovery/distortion map over Mach, angle of attack, sideslip, and hysteretic unstart testing |
| Shape-driven drag correlation | Preliminary-design screen | Forces drag to respond to wetted area, frontal area, reference area, and aspect ratio | Viscous CFD, wind-tunnel data, trim/control increments, and uncertainty bounds |
| Shell thicknesses, effective installed densities, and fuel occupancy fractions | Geometry-volume mass surrogate | Produces mass, CG, fuel, and coordinate inertia without a hand-authored total | Weight statement, equipment layout, tank geometry, structural sizing, and measured mass properties |

## Interpretation rule

Passing the surrogate means the authored shape is not internally contradicted by this screen. It
does not mean the aircraft is feasible, safe, controllable, manufacturable, affordable, or ready for
mission simulation. Failing the surrogate is actionable: geometry or an assumption must change; the
derived output must not be manually overwritten.
