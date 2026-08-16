# AT-802F Fire Boss source register

## Propulsion and audio identity

| Value | Production value | Epistemic | Source and interpretation |
| --- | ---: | --- | --- |
| Engine family | PT6A-67F | measured | [Fire Boss configuration](https://firebossllc.com/specifications-and-performance/) identifies the 1,600 shp PT6A-67F installation. |
| Propeller | five-blade, constant-speed, reversing Hartzell | measured | The same Fire Boss configuration page specifies the five-blade constant-speed reversing propeller. |
| Governed takeoff Np | 1,700 RPM | measured | [EASA TCDS IM.E.008](https://www.easa.europa.eu/en/downloads/7787/en) lists 1,700 RPM as 100% power-turbine module output for the PT6A-67F. This is the production takeoff-config Np authority, not an idle or start schedule. |
| Blade-pass cadence | 141.67 Hz | derived | `1,700 RPM / 60 * 5 blades`; this owns the procedural propeller cadence. |
| PT6 architecture | free power turbine with reduction gearbox | measured | [Pratt & Whitney PT6A](https://knowmypt6-prv.prattwhitney.com/en/products/general-aviation-engines/pt6a) describes the independent power turbine and epicyclic reduction gearbox. Np is therefore modelled separately from torque and gas-generator speed. |
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
| Lift, drag, stability derivatives and control response | AT-802F parameter set in the shared coefficient model | provisional | The published wing anchors a cambered-wing surrogate with explicit polar, inertia and control derivatives. These are acceptance-tested gameplay values, not OEM tables or a certified training model. |
| Turboprop thrust | shared shaft-power propulsion option | provisional | The shared propulsion kernel converts the published 1.193 MW through an explicit 0.82 installed-efficiency surrogate, a finite low-speed static-thrust cap and density lapse. It is not an OEM propeller map. |
| Float/runway contact | external contact resolver | provisional | Wheels/floats constrain kinematics only while in contact. Speed-dependent float resistance, scoop drag and gross-mass effects reproduce the operational sequence; on lift-off, exactly one shared `AircraftSim` aerodynamic step owns motion. |
