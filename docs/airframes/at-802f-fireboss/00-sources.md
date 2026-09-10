# AT-802F Fire Boss source register

## Propulsion and audio identity

| Value | Production value | Epistemic | Source and interpretation |
| --- | ---: | --- | --- |
| Engine family | PT6A-67F | measured | [Fire Boss configuration](https://firebossllc.com/specifications-and-performance/) identifies the 1,600 shp PT6A-67F installation. |
| Propeller | five-blade, constant-speed, reversing Hartzell | measured | The same Fire Boss configuration page specifies the five-blade constant-speed reversing propeller. |
| Governed takeoff Np | 1,700 RPM | measured | [EASA TCDS IM.E.008](https://www.easa.europa.eu/en/downloads/7787/en) lists 1,700 RPM as 100% power-turbine module output for the PT6A-67F. This is the production takeoff-config Np authority, not an idle or start schedule. |
| Blade-pass cadence | 141.67 Hz | derived | `1,700 RPM / 60 * 5 blades`; this owns the procedural propeller cadence. |
| PT6 architecture | free power turbine with reduction gearbox | measured | [Pratt & Whitney PT6A](https://knowmypt6-prv.prattwhitney.com/en/products/general-aviation-engines/pt6a) describes the independent power turbine and epicyclic reduction gearbox. Np is therefore modelled separately from torque and gas-generator speed. |
| Mission fuel-flow endpoints | 4.232–19.445 lb/min | provisional | Preserves the established Okanagan fuel-plan calibration of `0.032 + 0.115 × lever kg/s`. These values are gameplay/fuel-plan authority, not a PT6A-67F engine-deck claim; changing them requires recalibrating RTB, operational and final-reserve timing together. |
| Recorded machinery bed | single-engine PT6 public-domain surrogate | surrogate | A conditioned interval from DVIDS U-28/PC-12 b-roll supplies real PT6 machinery texture. Low prop orders are removed; it does not claim to be an AT-802F cockpit recording. See the production asset register. |
| Cockpit filtering and dynamic layer gains | recorded/procedural hybrid surrogate | provisional | The real recording owns broadband machinery texture. The pressure-pulse, exhaust/gearbox/prop-wash, compressor, cockpit attenuation and relative gains remain authored for gameplay and are not an OEM spectral or certified-training representation. |

The Okanagan mission starts with the aircraft running in takeoff configuration. Build 341 therefore
publishes governed Np throughout the flyable sortie. A future start, beta or shutdown sequence must
publish its own Np authority; it must not infer prop RPM by pitch-bending throttle or Ng.

## Shared fixed-wing flight dynamics

| Value | Production value | Epistemic | Source and interpretation |
| --- | ---: | --- | --- |
| Wing area | 37.25 m² | measured | Fire Boss specifications publish 401 ft²; converted to SI for dynamic-pressure forces. |
| Maximum shaft power | 1,600 shp / 1.193 MW | measured/derived | Fire Boss publishes 1,600 shp; SI conversion drives the propulsive-power ceiling. |
| Airborne solver | production `AircraftSim` through `FixedWingAircraftVehicleAdapter` | implementation fact | Fire Boss owns no alternate airborne integrator. Position, attitude, body rates, angle of attack, lift, drag, stall response, wind response, engine lag and telemetry advance through the same 120 Hz RK4 rigid-body kernel as the other fixed-wing aircraft. |
| Lift, drag, stability derivatives and control response | AT-802F parameter set in the shared coefficient model | provisional | The published wing anchors a cambered-wing surrogate with an explicit `CL0 = 0.92`. That same total coefficient drives lift, induced drag, stall incidence and protected controls; polar, inertia and control derivatives remain provisional gameplay values with internal regression coverage, not validated handling, OEM tables or a certified training model. |
| Turboprop thrust | shared shaft-power propulsion option | provisional | The shared propulsion kernel converts the published 1.193 MW through an explicit 0.82 installed-efficiency surrogate, a finite low-speed static-thrust cap and density lapse. It is not an OEM propeller map. |
| Float/runway contact | external contact resolver | provisional | Wheels/floats constrain kinematics only while in contact. Speed-dependent float resistance, scoop drag and gross-mass effects reproduce the operational sequence; on lift-off, exactly one shared `AircraftSim` aerodynamic step owns motion. |

### Cambered-wing drag correction — 2026-09-10

An open-loop physics audit found that high-lift drag chose its positive/negative lift limit
from the sign of angle of attack. With `CL0 = 0.92`, slightly negative incidence still produces
positive lift. Dividing that lift by `|CLmin| = 0.72` instead of `CLmax = 2.25` created a drag
discontinuity at zero incidence: `CD` changed from approximately `1.380526` to `0.114709`
across `alpha = ±1e-8 rad`. The actual force evaluator at 60 m/s and 1,500 m changed from
97.943 kN to 8.138 kN, creating an artificial barrier to acceleration.

The high-lift normalization now selects the limit by the sign of the total lift coefficient.
This corrects the mathematical discontinuity without retuning the polar, engine, mass or control
constants. Focused regressions cover coefficient and force continuity, full-power acceleration
through the affected region, and unchanged sampled uncambered-aircraft polars. These establish
internal force/energy consistency; they are not manufacturer flight-test validation and do not
validate the remaining provisional handling or performance assumptions.

### Conventional controls and contact — 2026-09-10

The Okanagan pilot's pitch input now represents elevator displacement, with a separately adjustable
trim setting. It no longer changes from a runway pitch-angle target to an airborne G demand.
The starting trim is calculated once from the fixture's level-flight incidence (55 m/s for surface
starts); it is not recomputed in flight, does not hold altitude, and does not compensate for bank,
water collection or power changes. Fighter and AI commands retain their existing control laws.

| Value | Production value | Epistemic | Basis / limits |
| --- | ---: | --- | --- |
| Longitudinal moment law | `q S c (Cmα α + Cmq q_body c / 2V + Cmδe δe)` | public-theory surrogate | Conventional static stability, aerodynamic rate damping and elevator effectiveness; this is a reduced-order rigid-body model, not a recovered AT-802 derivative table. |
| `Cmα`, `Cmq`, `Cmδe` | -1.2, -22, +1.1 | provisional | Explicit stable-tail starting values. Positive elevator means pilot nose-up input. These require flight-response assessment; manufacturer handling equivalence is unverified. |
| Elevator stop / pilot trim offset | 25 degrees / ±0.5 normalized | provisional | Authored actuator range; does not claim measured AT-802 travel or trim gearing. |
| Directional moment law | `q S b (Cnβ β + Cnr r b / 2V + Cnδr δr)` | public-theory surrogate | Mechanical fin/rudder response replaces the implicit heading tracker on this control path. The kernel defines positive beta as velocity right of the nose. |
| `Cnβ`, `Cnr`, `Cnδr` | +0.11, -0.30, +0.07 | provisional | Explicit directional stability, rate damping and rudder effectiveness; no OEM identification claimed. |
| Contact pitch reaction arm / roll support arm | 0.60 m / 2.0 m | provisional | Remaining normal load resists rotation and heel. Runway/float contact remains simplified; these are not surveyed landing-gear dimensions. |
| Contact pitch stops | 9° runway / 8° water | provisional | Preserves the existing collision-envelope limits while replacing direct input-to-angle motion with aerodynamic moments. |
| Liftoff boundary | positive unconstrained vertical force | implementation fact | Removes the contact constraint without injecting height, vertical velocity or zero body rates. The next shared integration tick starts from the continuous surface state. |

The conventional branch intentionally replaces all fixed-Nm pitch/yaw control and pitch-break
moments. With no airflow it has no aerodynamic control authority. Propwash, elevator hinge forces,
CG motion, detailed wheel suspension and hydrodynamic pitching moments remain unmodelled. Automated
force/response regressions establish internal consistency, not real-aircraft handling approval.

### Payload envelope correction — 2026-09-10

The [current Fire Boss manufacturer specification](https://firebossllc.com/specifications-and-performance/)
publishes **7,257 kg** for land takeoff and maximum scooping mass. This replaces the unsupported
8,200 kg mission cap. The 3,104-L hopper is a capacity, not a permitted load at every fuel quantity.
Mission scoop/drop targets must follow the available gross-mass margin rather than demand 2,800 kg
regardless of fuel. The manufacturer describes initial scoops around 600 US gallons, increasing as
fuel burns; this is consistent with load-limited scooping rather than filling the tank every time.

The retained **4,420 kg operating mass is provisional**, including an unspecified crew/equipment
allowance; it is not the published float-equipped empty mass of 3,980–4,070 kg. No serial-number
weight-and-balance sheet is available. Keeping this conservative existing operating configuration
avoids silently inventing equipment or reducing fuel to manufacture a full-hopper result.

The same source separately publishes **5,216 kg** for water takeoff and land landing, and for
full-stop water landing. The scooping run has a distinct 7,257 kg limit; do not treat a loaded scoop
as permission for a full-stop water takeoff. Detailed operational landing-weight enforcement and a
complete loading/CG model remain outside the current simplified contact resolver.

Surface steering now depends on forward speed, so a stationary aircraft cannot rotate in place
from pedal input. Its 18-m low-speed radius, 16°/s ceiling and speed fade remain provisional. The
resolver preserves the resulting yaw rate at liftoff as well as the pitch and roll rates.

Theory references: [NASA moment-coefficient definitions](https://hiliftpw.larc.nasa.gov/Workshop5/FAQs.html)
define pitching moment as `qSc Cm`; [NASA's Twin Otter simulation paper](https://ntrs.nasa.gov/api/citations/20110016128/downloads/20110016128.pdf)
separates incidence, elevator and nondimensional pitch-rate contributions. These support the model
structure only. No coefficients from a different aircraft have been presented as measured Fire Boss data.

The conventional rudder's side-force derivative is `Cyδr = -0.25` (provisional). Positive right-yaw
input pushes the tail left; its force scales with dynamic pressure and mass. This replaces the
legacy generic `0.06 × speed × rudder` lateral jink acceleration on this aircraft's mechanical
control path. The other aircraft retain their existing branches.

### Performance calibration — 2026-09-10

After removing the drag discontinuity, the old polar sustained 163.71 kt in level flight and
approximately 1,565 ft/min in its best attached climb at 7,257 kg. The manufacturer publishes
150 KIAS maximum cruise and 892 ft/min climb at that mass. Its page does not specify all test
conditions, engine settings, flap settings or instrument corrections, so these are broad
calibration anchors rather than an exact flight-test validation case.

`CD0 = 0.0603` and `InducedK = 0.116` are **provisional whole-aircraft effective coefficients**,
fit jointly to those two anchors using standard sea-level atmosphere, still air, full engine
spool, fixed surrogate configuration, and steady force/moment balance. The published 1.193 MW
shaft power and the existing 0.82 propeller-efficiency surrogate remain unchanged. These values
are not measured wing-only profile drag or Oswald efficiency. The inherited `CL0=0.92` and
`CLmax=2.25` do not establish a measured clean-wing or flap-dependent polar.

Rounded-coefficient results are 149.89 kt level speed and 887 ft/min best attached climb at
85.14 kt; the fixed-control climb remains about 4.29 m/s after 30 seconds as altitude increases.
At 115 kt, the steady initial climb is approximately 715 ft/min. No feedback pilot supplies
these force-balance or fixed-control performance results. Sea-level equivalent airspeed is used
for the approximate comparison to the published indicated-air-speed figure; no pitot-system
accuracy is claimed. Independent regression bands retain the rounded source targets, rather
than requiring the exact fitted outputs.

## Performance-limited mission loading — 2026-09-10

The published gross limit is an upper structural/operating allowance, not a promise of adequate
climb or endurance at every altitude. The mission's existing fuel allowance assumed 2.5 m/s
loaded climb. `FireBossMissionPerformance` now makes that **exercise planning assumption** an
explicit minimum at the route cruise altitude, with a **provisional 12° lift-vector bank** for
shallow climbing turns. It evaluates the actual clean surrogate polar and full-power engine in
standard atmosphere and still air. It searches attached conditions above 1.1 times the model's
bank-adjusted stall speed, and returns the feasible side of a bounded mass search. These are
planning assumptions, not a manufacturer dispatch chart, V-speed or guaranteed maneuver margin.

At 2,450 m the represented model permits 6,542.28 kg for that requirement, giving approximately
1,240 kg of water with 882 kg fuel and the declared 4,420 kg operating mass. A 700 m route still
permits the 7,257 kg legal maximum. Mission loading uses the smallest of physical hopper capacity,
gross allowance and this performance allowance; the target is captured before the water run.
No extra fuel, shaft power or lift was added to make a distant high-altitude route feasible.
An independently inclined force-balance check verifies the planner's along-path and normal
residuals. Complete route tests remain necessary because the planner does not guarantee the
fuel cost of terrain avoidance, steeper turns, approach or recovery.

The separately published 5,216 kg land-landing limit is also used for advisory load-release
guidance on return. Crossing that operating limit does not itself create a simulated crash;
the pilot still operates the drop control. Contact rotation now converts Euler steering/attitude
rates to body P/Q/R before handing them to free flight, including combined steering and rotation.
The wheel/float reaction constants remain provisional as declared above.

## Recorded audio presentation — 2026-09-10

The Fire Boss audio now uses an OA-1K / Air Tractor-family **exterior ground recording** as its
primary engine bed, with broad EQ informed by an actual Fire Boss cockpit video. This is an
**authored surrogate**, not a measured Fire Boss cockpit sample. [Audio provenance and limitations](../../../web/wwwroot/render/audio/samples/turboprop/SOURCES.md)
record the original source, reference-only YouTube use, exact interval/checksums, conditioning,
and the absence of auditory acceptance. No flight dynamics, propeller RPM authority or physical
engine constants were changed for the sound adjustment.
