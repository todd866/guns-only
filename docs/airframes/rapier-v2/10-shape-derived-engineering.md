# Shape-derived engineering and acceptance boundary

All numbers below are deterministically derived from `airframes/rapier.v2.json`. Rounded display
values are descriptive; `airframes/generated/rapier.v2.engineering.json` is the runtime-consumable
artifact.

## Geometry

The wing is authored only as ordered half-span stations `(x, z_le, z_te, thickness)`. Mirroring the
stations creates the full planform. Strip integration provides reference area `S`, first chordwise
moment, and the chord-squared integral:

```text
S = 2 integral(c dx)
MAC = 2 integral(c^2 dx) / S
AR = b^2 / S
```

Elliptical body stations are integrated as frusta. Segment volume uses the prismoidal relation for
end areas; wetted area uses average ellipse perimeter times slant length. Thin-prism fin, inlet-lip,
nozzle-fairing, and wing surface contributions are then added. These component contributions may
overlap at blends, so `33.472 m^3` is a component-envelope volume rather than a watertight CAD
boolean volume. Wetted area is likewise an analytical estimate pending surface meshing.

| Derived quantity | Value |
|---|---:|
| Length × span × height | 13.000 × 7.350 × 2.228801 m |
| Reference area | 24.316845 m² |
| Aspect ratio | 2.221608 |
| Mean aerodynamic chord | 4.790958 m |
| Aerodynamic-center z in authored frame | -0.207622 m |
| Wetted area | 152.549316 m² |
| Component-envelope volume | 33.471682 m³ |
| Frontal-area approximation | 3.416581 m² |
| Boundary-layer-adjusted inlet capture | 1.427791 m² |

## Mass, CG, and inertia

Every mass element is generated from an authored piece of geometry:

- shell mass = derived surface area × shell thickness × zone-material density;
- internal installed mass = shaped volume × effective installed density;
- fuel mass = shaped volume × fuel occupancy fraction × fuel density;
- explicit box equipment volume = box volume × effective density;
- propulsion package volume = derived cylindrical envelope volume × effective density.

The element centroids give CG. Coordinate inertias use each element's local rectangular/elliptical
approximation plus the parallel-axis theorem. No total mass, CG, fuel capacity, or inertia is accepted
in the authored definition.

| Derived property | Empty | Gross |
|---|---:|---:|
| Mass | 8,068.259074 kg | 11,823.706680 kg |
| CG `(x, y, z)` | `(-0.006115, -0.017378, 0.742613)` m | `(-0.004173, -0.002140, 0.532894)` m |
| Physical `Ixx` | 67,477.860023 kg·m² | 94,669.263526 kg·m² |
| Physical `Iyy` | 71,093.857366 kg·m² | 100,219.891522 kg·m² |
| Physical `Izz` | 5,421.976494 kg·m² | 7,855.515175 kg·m² |
| Fuel capacity | — | 3,755.447606 kg |

The authored frame is right-handed with `+x` starboard, `+y` up, and `+z` aft. Therefore runtime
body-axis mapping is not inferred from the letter alone: roll about the longitudinal axis uses
physical `Izz`, pitch uses `Ixx`, and yaw uses `Iyy`.

## Dash calculation

The helper treats authored altitude as geometric, converts it to geopotential altitude using the
same `6,356,766 m` Earth radius as runtime `StandardAtmosphere1976`, and only then evaluates the
1976 atmosphere layers. At 24,000 m geometric the atmosphere calculation uses
`23,909.728707 m` geopotential. This distinction is large enough to move dynamic pressure by 1.41%,
so artifact and runtime use the same convention. Sutherland's relation supplies viscosity. At each
Mach/altitude point the helper computes:

```text
V = M sqrt(gamma R T)
q = 0.5 rho V^2
mass flow = rho V A_capture capture_efficiency(M)
raw ram thrust = mass flow specific_thrust(M) retention
inlet off-design angle = sqrt((alpha - installed incidence)^2 + beta^2)
installed ram thrust = raw ram thrust inlet_recovery(off-design angle, M)
```

Drag combines a turbulent flat-plate skin-friction screen scaled by derived wetted area, wave and
base-pressure terms scaled by derived frontal area, and an induced term scaled by derived reference
area and aspect ratio. This is deliberately coupled to the exterior, but remains a preliminary
correlation—not CFD and not an OEM engine deck.

## Installed inlet incidence and trim closure

The inlet lip is authored and rendered at a `7.5 deg` design-flow incidence. This angle is the
installed zero-loss reference, not an extra penalty applied to body attitude. The gross-weight
level-flight trim calculation at M4.2 / 24 km produces body alpha `7.592733 deg`; with zero sideslip,
the inlet therefore sees only `0.092733 deg` (`0.001618 rad`) of combined off-design flow. The
continuous recovery model returns `0.999924` and remains started.

The same deviation convention drives runtime recovery and unstart. Above the M2 ram-regime start,
a previously started inlet trips at `0.12 rad` combined deviation and a tripped inlet clears below
`0.04 rad`; sideslip enters through the same root-sum-square angle. These thresholds are deliberately
relative to installed incidence. Treating them as absolute body alpha would count the nominal
high-Mach trim attitude twice and contradict the inclined inlet visible on the aircraft.

The authored `designFlowIncidenceDeg` value is authoritative. The generated artifact rounds all
published engineering numbers to six decimal places, so runtime converts the exact authored degree
value to radians rather than treating the artifact's rounded radian display as a second authority.

At the fixed design point, M4.2 at 24,000 m:

| Quantity | Result |
|---|---:|
| Speed | 1,250.424 m/s |
| Dynamic pressure | 36.695 kPa (passes 55 kPa limit) |
| Captured mass flow | 68.716 kg/s |
| Raw ram-stream thrust | 57.515494 kN |
| Inlet recovery | 0.999924 |
| Installed ram-stream net thrust | 57.511140 kN |
| Drag | 42.925 kN |
| Excess thrust | +14.586 kN |

The same M4.2 point at 12,000 m produces `239.544 kPa`, more than four times the limit, and is
rejected. “M4+” is therefore a high-altitude dash claim, not a placard speed available everywhere.

## Turbine-to-ram propulsion contract

The architecture is now stated rather than implied: one ventral inlet feeds a central turbine
package and a co-annular high-speed/ram path; both discharge through one shared fixed circular
nozzle. Turbine and ram telemetry remain separate so the transition cannot hide a second thrust
multiplier. This is a **fictional, provisional integration**. NASA's Mach-4+ variable-cycle fan work
shows why wide-range fan operation and turbine-to-ramjet transition are genuine problems. NASA's
LIMX work studies recovery, distortion, splitters, isolators, and mode transition in a dual
over-under flowpath. It does not validate Rapier's co-annular passage or shared nozzle.

The turbine cycle surrogate is rated at `84.000 kN` sea-level-static dry. Its maximum augmented
ratio is `1.35`, deriving a bounded `113.400 kN` augmented static ceiling. It begins fading at M1.9
and is fully absent at M3.0. Fuel anchors are `10.08`, `144.48`, and `453.6 lb/min` at idle,
military, and maximum augmentation. These are local provisional closures—not user-fixed product
requirements—and preserve the previous specific fuel consumption while avoiding free thrust.

The package contract is exact and derived from one authored core:

| Package quantity | Result |
|---|---:|
| Core diameter × length | 1.220 × 4.880 m |
| Structural + thermal radial clearance | 0.030 + 0.030 m |
| Installed envelope diameter × length | 1.340 × 5.480 m |
| Envelope axial extent in authored frame | z = -0.450 to +5.030 m |
| Fore / aft clearance | 0.300 / 0.300 m |
| Capsule-to-package fire-bulkhead gap | 0.150 m |
| Cylindrical package volume | 7.728230 m³ |
| Effective installed density / mass | 245 kg/m³ / 1,893.416 kg |

Pratt & Whitney publishes a `1.18 m` maximum diameter, `4.85 m` length, `1,735 kg` specification
maximum weight, and `129.7 kN` thrust for the F100-PW-229. Rapier uses the conservative top of the
F100-family dimensional comparison (`1.22 m × 4.88 m`) and its package surrogate is `158 kg` or
`9.1%` heavier than that -229 weight, allowing some mass for mounts, doors, and duct hardware. This
is still a class comparison: it does not close accessories, service removal, hot structure,
combustor conversion, or a shared variable-cycle nozzle.

The tunnel has exact circular cross-sections at the package fore face, core fore face, centre, core
aft face, and package aft face. At each, the outer radius is `0.750 m`; the `7 mm` shell leaves a
`0.743 m` inner radius around the `0.670 m` installed envelope. The remaining radial passage is
`0.073 m`, and the clear co-annular area is:

```text
A_annulus = pi (0.743^2 - 0.670^2) = 0.324052 m^2
```

At M4.2 / 24 km the captured `68.716 kg/s` needs `0.305092 m²` in the provisional isentropic
choked-flow screen at a `30%` recovered-total-pressure floor. The passage has `0.018960 m²` or
`6.21%` area margin; the minimum recovery that would just pass is `28.24%`. The `0.450 m` nozzle
radius gives `0.636173 m²`, almost twice the annulus area. That is a narrow preliminary area closure,
not an inlet or cycle deck.

The generic tunnel interior owns zero fill mass and zero fuel. The explicit cylindrical package,
shell, and displaced equipment own the mass instead. Main and nose gear, avionics, services,
catapult keel, and arrestor actuator are split around or fore/aft of the cylinder. Validation rejects
the package intersecting any internal volume and also rejects box-to-box overlaps.

Augmentation applies **only to the turbine stream**. At M4.2 the turbine contribution is zero, ram
augmentation ratio is exactly `1.0`, and `57.515494 kN` raw ram result becomes `57.511140 kN` after
the same canonical inlet recovery used by runtime. It remains unaugmented.

## Thermal boundary and why CMC matters

The model reports both perfect-gas stagnation temperature and recovery temperature:

```text
T0 = T [1 + (gamma - 1) M^2 / 2]
Taw = T [1 + r (gamma - 1) M^2 / 2]
Tzone = T + fzone (Tbasis - T)
margin = material installed limit - Tzone
```

At M4.2 / 24 km, `T0 = 998.694 K` and `Taw = 905.318 K`. The CMC nose, leading edges, and inlet lip
are screened against stagnation temperature and retain `474.456 K` of material-capability margin.
Replacing that zone with the authored warm composite causes a margin worse than `-300 K`; CMC is
therefore enabling rather than decorative.

CMC does not make the whole vehicle immune. The much larger insulated warm-panel zone is binding at
`604.025 K`, only `19.125 K` below its provisional `623.15 K` installed limit. The scan's last passing
point is approximately M4.30; M4.31 is the first failure. The accepted dash is M4.2 with narrow
thermal headroom, not an unbounded “Mach 5-ish” claim.

Thermal-zone areas are derived from the same exterior segmentation:

| Zone | Derived area |
|---|---:|
| CMC stagnation hot edge | 22.362815 m² |
| Insulated warm panel | 77.311056 m² |
| Titanium aft panel | 45.165909 m² |
| Nozzle fairing | 7.709535 m² |

Adiabatic temperature is a screening ceiling, not a transient wall-temperature prediction. The next
engineering gate is time-resolved heating with boundary-layer transition, radiative cooling, wall
heat capacity, internal conduction, joints, apertures, engine soak, and the actual mission
trajectory.

## Acceptance tests

`tools/assets/airframes/tests/rapier_v2_engineering.test.mjs` proves that:

- source and web-staged definitions are byte-identical, the embedded browser module is fresh, and
  all are explicitly runtime-bound;
- no derived visual/physical result can be authored beside the canonical shape;
- dimensions, reference geometry, area, volume, mass, CG, fuel, inertia, and thermal areas are
  derived;
- the generated artifact is byte-stable and fresh;
- turbine augmentation is bounded, fuel/fade anchors are ordered, and the ram multiplier is one;
- the F100-class core, structural/thermal clearances, fire-bulkhead gap, exact tunnel sections,
  package mass, co-annular area, pressure-recovery floor, and nozzle area are generated and pass;
- shrinking any required tunnel section or moving any internal volume into the package is rejected;
- installed inlet incidence is visible in the shape adapter; trim alpha, off-design angle, recovery,
  and hysteretic deviation-based unstart are derived and runtime-bound;
- geometric altitude is converted to geopotential altitude exactly as runtime does;
- the fixed catapult, runway midpoint, balloon, internal-gun, and no-drone contract remains closed;
- M4.2 / 24 km passes recovered-thrust, dynamic-pressure, and thermal screens;
- removing CMC fails the hot-edge screen, M4.2 / 12 km fails `q`, and M4.31 closes the thermal
  envelope.
