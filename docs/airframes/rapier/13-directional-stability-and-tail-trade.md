# 13 — Directional stability and tail trade

← [12 — Aerodynamics and control allocation](12-aerodynamics-and-controls.md) ·
Related: [11 — Visual identity and buried crew capsule](11-visual-identity-and-buried-capsule.md) ·
[30 — Propulsion and inlet](30-propulsion-and-inlet.md) ·
[70 — Landing gear, arrest](70-landing-gear-arrest.md)

> **Trade study, not a geometry freeze.** Rapier requires a directional-stability and yaw-control
> solution. The present twin-fin mesh is an authored visual/procedural surrogate, not an
> aerodynamically sized tail. This chapter records the discrepancy and the work required to close
> it.

## 1. Decision state

| Statement | Status |
| --- | --- |
| Rapier must remain controllable in yaw from rail handoff through arrested recovery and the high-Mach intercept | **closed requirement** |
| The pilot is fully reclined in a buried capsule with no cockpit bump or transparency | **closed owner direction** |
| Two fins are present in the current definition and procedural mesh | **closed repo fact** |
| The current fin polygon is the correct aerodynamic size | **not established** |
| A smaller twin-fin arrangement at 60–70% of current total area is the first trade to test | **proposed starting trade, not canon** |
| Single-fin and minimal-fin/split-drag-rudder arrangements remain comparison cases | **open trade** |

The concise answer is therefore: **some vertical directional-control solution is credible and
probably necessary; the two large surfaces currently drawn are not justified by the available
engineering.**

In this chapter, **closed** means a checked-in repo fact or explicit requirement, **proposed** means
a testable starting point, and **open** means analysis, measurement, or qualification is still
required. A polished concept image cannot promote a proposed or open item to closed.

## 2. What the current definition actually contains

`airframes/rapier.v1.json` contains one fin planform that the renderer mirrors left and right:

```text
[2.20, 0.00], [5.72, 0.00], [5.10, 1.82],
[4.24, 2.22], [3.15, 0.28]
```

Coordinates are longitudinal `z` and vertical `y` in the Rapier mesh convention, with `+z` aft.
Shoelace area and direct inspection of the definition give:

| Quantity | Current value | Status |
| --- | ---: | --- |
| Projected area, each fin | **3.7969 m²** | derived from closed polygon |
| Projected area, pair | **7.5938 m²** | derived |
| Pair area / 18 m² wing reference area | **42.1878%** | derived; not a sizing criterion by itself |
| Maximum polygon height | **2.22 m** | closed geometry |
| Root chord | **3.52 m** | derived from `5.72 − 2.20` |
| Projected aspect ratio, each, `h²/S` | **1.298** | derived |
| Polygon centroid | **z = +4.39449 m, y = +0.82633 m** | derived |
| Root-centre spacing | **1.16 m** | derived from `sideX = ±0.58 m` |
| Outward cant | **4.5837°** | derived from `|rotZ| = 0.08 rad` |
| Mesh thickness | **0.11 m** | closed presentation geometry |
| Pair mass allocation | **90 kg** | provisional BOM allocation, not structural sizing |

These are **fins**, not defined whole-moving rudders. The definition provides no rudder hinge line,
movable area, chord fraction, segment boundary, travel schedule, actuator, balance, or failure
position. The control chapter's phrase “twin rudders” names an arrangement; it does not close the
physical control surface.

### 2.1 Published-height mismatch

The definition publishes `dimensionsM.height = 2.5 m`, but a Three.js `Box3` around the current
procedural aircraft produces:

| Axis | Mesh extent |
| --- | ---: |
| `x` / spanwise | **7.446019 m** |
| `y` / vertical | **3.096596 m** |
| `z` / longitudinal | **13.000000 m** |

The mesh runs from approximately `y = −0.606071 m` at the inlet to `y = +2.490524 m` at a fin tip.
The resulting vertical extent exceeds the published 2.5 m envelope by about **0.5966 m**. The
spanwise overrun is largely the bevelled presentation mesh and already sits inside its visual test
tolerance; the height disagreement is not similarly explained or tested.

This mismatch must be resolved in the same revision that replaces the superseded raised
`escapePodSpine`. Until then, neither `dimensionsM.height` nor the current tail silhouette is a
reliable facility-clearance authority.

## 3. Why Rapier still needs a yaw solution

### 3.1 Long forebody and supersonic effectiveness

The long, slender body presents destabilising side area ahead of the centre of gravity. At the same
time, vertical-tail lift-curve slope and control effectiveness generally fall as Mach rises. NASA's
history of supersonic-aircraft development describes the combination of long forebodies, aft centre
of gravity, falling vertical-tail contribution, and worsening directional stability with angle of
attack. NASA's systematic M1.60–2.86 tests also show why complete wing-body-tail interaction—not
tail area alone—must be analysed.

The owner-directed removal of the cockpit bump helps: it removes forward projected side area and
changes the forebody wake. That should reduce, not increase, the tail burden relative to the old
raised-spine geometry. The magnitude is unknown until the buried-capsule outer mould line and CG
envelope are closed.

### 3.2 Inlet protection

The current installed-inlet surrogate uses:

```text
flow angle = sqrt(alpha² + beta²)
```

Above M2, sideslip therefore spends the same inlet-incidence budget as angle of attack. The current
sticky unstart surrogate trips near **0.12 rad / 6.88°** combined flow angle and clears below
**0.04 rad / 2.29°**. A directional upset can become a propulsion upset even though Rapier has one
central propulsion stream rather than two separated engines.

This is a reason for positive directional stability, yaw damping, and fast limited corrective
control. It is not evidence that the present 7.5938 m² pair is the correct solution.

### 3.3 Rail handoff and recovery

The launcher mechanically constrains vertical, lateral, pitch, and yaw motion before release. At
the **110 m/s**, **12°** handoff, however, the aircraft must accept portal gust, crosswind, gear-down
wake, and any shuttle-release transient without departing its beta corridor.

Recovery is more demanding than a clean high-speed pass:

- the wing is at high lift and the aft body may blanket a close-set tail;
- symmetric elevon droop has already consumed pitch and roll travel;
- gear, hook, and disturbed near-ground flow change the aerodynamic field;
- crosswind correction and decrab create gear, tyre, hook, and arrestor lateral loads; and
- a split elevon, hung door, damage, or actuator mismatch creates an asymmetric case.

NASA flight work on a tailless delta carrier approach found lateral-directional behaviour to be an
approach-limiting problem. Rapier's automation changes the pilot workload, but it does not remove
the force and moment requirement.

### 3.4 What does *not* drive the tail

Rapier has one centreline propulsion stream. It does not have the classic transport or twin-engine
fighter requirement to counter maximum asymmetric thrust after one engine fails. That absent
engine-out case is a material reason not to copy the tail area of a twin-engine aircraft.

Low observability is also explicitly refused for the carrier airframe. Tail cant and count should
be chosen for flow, structure, thermal life, maintenance, and control—not to imply an unsupported
radar-cross-section claim.

## 4. Why the simulation cannot size the fins

The current kernel contains useful bounded control architecture, but not a tail-derived aerodynamic
model:

- `CYBeta = 0.60` is a whole-aircraft surrogate;
- `YawBetaStiffnessNmRad = 240,000` is a controller demand;
- `YawDampingNms = 160,000` and `YawMomentMaxNm = 320,000` are reduced-order demand limits;
- `ClDeltaR = 0.026` supplies rudder-to-roll coupling, not a physical yaw derivative; and
- yaw delivery is capped by the provisional expression
  `q × S × b × |Cn|max × Mach effectiveness`, with `|Cn|max = 0.055`.

There is no fin-derived `Cnβ`, `Cnr`, or `Cnδr`. There is no tail-off body derivative, hinge-moment
model, rudder deflection schedule, or mapping from the JSON polygon to the flight model. Redrawing
or deleting the fins changes the picture without changing the aircraft dynamics.

At the documented FL720/M3.5 screening point, `q ≈ 35 kPa` and the current Mach-effectiveness
factor is `0.28`. The resulting yaw-capacity ceiling is only:

```text
35,000 × 18 × 7.35 × 0.055 × 0.28 ≈ 71,310 N·m
```

That number is a transparent gameplay surrogate. It neither proves that the existing fins can
deliver the moment nor identifies a smaller fin that can.

> **Closure prohibition:** no Rapier fin count, area, height, cant, location, or rudder size can
> close until the buried-capsule OML and CG envelope exist; `Cnβ`, `Cnr`, and `Cnδr` exist across
> the required Mach/alpha/configuration range; and neutral, jammed, hard-over, power-loss, and
> asymmetric-damage cases have been evaluated.

## 5. The low-speed RCS masking problem

`ColdGasRcs` is described as an exo/lob attitude system, but its generic blend gives full
aerodynamic ownership only above **8,000 Pa** dynamic pressure. Using standard sea-level density as
a screening calculation:

| Speed | Approx. `q` | Remaining RCS blend |
| --- | ---: | ---: |
| **82 m/s** | **4.118 kPa** | **58.14%** |
| **88 m/s** | **4.743 kPa** | **44.80%** |
| **110 m/s** | **7.411 kPa** | **2.00%** |

The current 82–88 m/s recovery region can therefore receive substantial cold-gas yaw assistance
when aerodynamic control saturates. Small beta-centering demands may remain inside the aerodynamic
cap, but crosswind, hard-over compensation, or full manual rudder can be masked by RCS.

That makes the live trap an invalid independent validation of fin/rudder size. The tail trade must
be flown with ordinary atmospheric RCS inhibited, or with an explicitly justified phase/q schedule
that proves the vehicle is not spending lob propellant to make a routine landing controllable.

## 6. Candidate architectures

### A — Smaller close twin fins with segmented rudders — recommended first trade

Use the current arrangement as a topology seed, not a dimensional authority.

The first comparison geometry should use **60–70% of current total projected fin area**:

| Quantity | Starting trade range |
| --- | ---: |
| Pair area | **4.5563–5.3157 m²** |
| Symmetric area per fin | **2.2781–2.6578 m²** |

This range is deliberately a broad optimisation seed, **not canon and not an acceptance band**.
Height, root chord, sweep, spacing, and cant must be varied rather than scaled blindly. Mild cant
may move a tail into cleaner flow, but it reduces pure vertical projected area and introduces
roll/yaw coupling; there is no free stability from cant.

The physical surface study should show a fixed stabilising leading portion and two trailing rudder
segments per fin:

- **low speed / recovery:** upper and lower segments available within a scheduled travel limit;
- **high Mach:** lower/root segment supplies small trim and damping corrections while the upper
  segment is centred or tightly limited to reduce root bending and hinge load;
- **failure:** independent sensing and actuation, fail-centred or fail-fixed behaviour, and a
  mechanical/electrical means to prevent one full-span hard-over command; and
- **all regimes:** measured position feedback and a Mach/q/temperature travel schedule.

Advantages:

- preserves passive weathercock stability and yaw damping;
- retains two-channel fault tolerance;
- fits the existing paired aft-body structural concept and leaves the centreline propulsion
  service path open;
- reduces wetted area, wave drag, hot leading-edge length, root moment, and visual height relative
  to the present pair; and
- changes the established silhouette less than the other architectures.

Risks:

- close fins may both sit in the same body/wing wake at recovery alpha;
- twin-tail vortex buffet and thermal/root-joint fatigue remain possible;
- a jam creates coupled asymmetric drag and side force; and
- two fin posts, two surface sets, and duplicated actuation cost more than one centre fin.

### B — One centre fin

A single higher-aspect-ratio centre fin can provide more useful side force per square metre than two
low-aspect-ratio close fins and removes one set of wetted surfaces, joints, actuators, and
interference fields.

Advantages:

- potentially lower total area and drag for a required tail volume;
- simpler aerodynamic interaction and fewer parts;
- no cant-induced roll component; and
- no need to justify two surfaces on a single-engine aircraft.

Risks:

- taller silhouette and concentrated root bending;
- one fin, actuator, or hinge becomes a common directional-control failure;
- centreline structure can obstruct propulsion-core/nozzle removal and aft-body access;
- a centre fin may be deeply blanketed at high alpha; and
- the existing paired fin posts and visual identity would require a larger structural and
  presentation revision.

This is a credible control case, not the recommended first art direction.

### C — Minimal fixed fins plus split drag rudders / active yaw

Split upper/lower surfaces near the wing's outboard trailing edge can create yaw through
differential drag with a large spanwise moment arm. Small fixed fins could retain limited passive
stability while active control supplies the rest.

Advantages:

- removes the tall-tail silhouette;
- can provide useful low-speed yaw moment without a centreline fin; and
- offers another effector for control allocation and damage reconfiguration.

Risks:

- an opened device at Mach 3 creates severe wave drag, local heating, hinge load, and energy loss;
- the same outboard trailing-edge region is already valuable for elevon lift and roll authority;
- drag-rudder yaw is strongly coupled to roll and sideslip;
- a stuck-open device is a large asymmetric drag failure;
- historical tailless-aircraft work identifies adverse or pro-spin rolling moments for some
  drag-rudder arrangements after stall;
- active stability becomes safety-critical after sensor, power, or computer loss; and
- neither finite RCS gas nor the explicitly refused thrust-vectoring system is a credible
  continuous atmospheric replacement.

This architecture is a research branch. It is a poor default for the programme's simple,
high-rate, 50-sortie-shell thesis.

## 7. Cross-discipline implications

| Discipline | Tail-trade implication |
| --- | --- |
| Buried capsule | Removing the raised spine changes forward side area, wake, CG, inertia, access panels, and therefore tail demand; size the tail only on the revised OML |
| Inlet / propulsion | Beta must stay inside the accepted recovery/unstart corridor; a rudder hard-over must not create an inlet upset that defeats the remaining control authority |
| High-Mach aerodynamics | Resolve tail/body/wing shocks, falling lift-curve slope, control reversal, tail buffet, and transonic aero-centre movement |
| Thermal | Size CMC leading-edge inserts and hot/cold joints; qualify hinges, bearings, actuators, wiring, seals, and lubricants in the local temperature field |
| Structure | Close fin-post and aft-body load paths, root bending/torsion, flutter, bird/FOD or battle damage, fatigue, and the present provisional 90 kg allocation |
| Recovery | Test high-CL wake, elevon droop, gear/hook effects, crosswind/decrab, tyre and hook side loads, and bolter/abort control |
| Launch | Test the first free-flight seconds after the mechanically constrained 110 m/s handoff, including portal gust and shuttle-release errors |
| Signature | An exquisite all-aspect LO programme is refused; robust signature discipline is reopened in chapter 18. Do not preserve a larger or more canted tail to imply stealth |
| Maintenance | Compare centreline access, removable propulsion modules, fin/rudder exchange, actuator access, inspection, and field repair |
| Cost / production | Count duplicated posts, hot inserts, actuators, sensors, test channels, fixtures, NDI, and spares; “smaller” is not cheaper if it requires an exquisite active-control system |

## 8. Validation and test gate matrix

Every candidate must use one configuration identifier across geometry, aero data, simulation,
telemetry, images, and reports. A candidate fails closed if a required row has no evidence.

| Gate | Required evidence | Pass condition |
| --- | --- | --- |
| **G1 — OML and CG** | Buried-capsule loft; projected side area by station; fuel/drone/recovery CG envelope; inertia | Tail moment arm and tail-volume calculation use the same accepted OML and every operational CG |
| **G2 — Geometry integrity** | Fin/rudder vertices, areas, centroids, hinges, deflections, mesh bounds, gallery and maintenance clearance | Definition dimensions equal measured mesh bounds; no concept-art-only geometry |
| **G3 — Static directional stability** | Tail-off and tail-on `Cnβ`, `CYβ`, `Clβ` versus Mach, alpha, beta, gear, elevon droop, hook, and bay state | Published positive/relaxed-static-stability target met across the accepted envelope without unexplained unstable breaks |
| **G4 — Dynamic stability** | `Cnr`, roll-yaw cross derivatives, Dutch-roll frequency/damping, SAS-on and SAS-off responses | Handling target met; no hidden fixed moment or non-physical zero-q damping |
| **G5 — Rudder control** | `Cnδr`, `Clδr`, hinge moment, actuator force/rate/power, segment schedule, buffet and reversal | Required yaw control delivered without exceeding surface, actuator, thermal, or structural limits |
| **G6 — High-speed inlet coupling** | Coupled six-DOF/inlet runs through M2–measured dash over accepted alpha/beta manoeuvres and gusts | No accepted command or recoverable disturbance silently crosses the inlet-unstart boundary |
| **G7 — Transonic/high-Mach loads** | CFD/tunnel/validated panel results from transonic through at least measured dash; q to the 80 kPa placard; aeroelastic/thermal model | Positive margins for shock interaction, flutter, root load, actuator load, and temperature |
| **G8 — Rail handoff** | 110 m/s, 12°, gear-down release with gust, misalignment, shuttle variation, and one control-channel fault | Clean separation, bounded beta/yaw rate, no rail/portal strike, and no RCS dependence |
| **G9 — Approach and trap** | 82–88 m/s candidates; recovery mass/CG; full droop; gear/hook; crosswind/gust; bolter and wire engagement | Line-up, decrab, go-around, gear/hook side-load, and controllability requirements met with atmospheric RCS inhibited |
| **G10 — Failure cases** | One rudder neutral, jammed and hard-over; one actuator/bus/sensor lost; one fin damaged; split elevon; hung door; RCS empty | Defined continue, abort, or eject outcome for every case; no unanalysed single-point catastrophic surface command |
| **G11 — Structure and life** | Fin-post FEM, root fittings, hot/cold joints, repeated dash/recovery spectra, inspection and repair plan | Life and proof factors close inside mass/cost allocation; provisional 90 kg row replaced by sized hardware |
| **G12 — Simulation binding** | Geometry-derived derivative deck and tests that perturb fin geometry | A fin change moves `Cnβ`, `Cnr`, `Cnδr`, loads, and handling results; visual-only changes cannot pass |
| **G13 — Telemetry** | Recorded beta, yaw rate, rudder command/actual by segment, SAS demand, aero capacity/margin, RCS moment/gas, inlet recovery/unstart, hinge load, root load, and temperature | Every gate can identify *why* yaw margin was lost rather than reporting only pass/fail or frame rate |

The minimum flight-test telemetry should expose:

```text
beta_deg
yaw_rate_dps
rudder_upper_left_deg / rudder_lower_left_deg
rudder_upper_right_deg / rudder_lower_right_deg
yaw_sas_demand_nm
yaw_aero_capacity_nm / yaw_aero_margin_nm
rcs_yaw_moment_nm / rcs_gas_remaining_kg
inlet_flow_angle_deg / inlet_recovery / inlet_unstarted
fin_root_bending_nm / rudder_hinge_moment_nm
fin_leading_edge_temperature_k
tail_configuration_id
```

## 9. Primary technical basis

These sources establish the phenomena and methods. None supplies Rapier-specific coefficients.

- M. L. Spearman, **“Historical development of worldwide supersonic aircraft,”**
  NASA-TM-85637 (1983): supersonic directional-stability history, falling vertical-tail
  contribution, forebody/CG effects, and angle-of-attack aggravation.
  <https://ntrs.nasa.gov/citations/19830020899>
- M. Lamb, W. C. Sawyer, and J. L. Thomas, **“Experimental and theoretical supersonic
  lateral-directional stability characteristics of a simplified wing-body configuration with a
  series of vertical-tail arrangements,”** NASA-TP-1878 (1981): single/twin-tail comparison and
  analysis validation from M1.60 to M2.86.
  <https://ntrs.nasa.gov/citations/19810020557>
- S. Corda et al., **“The SR-71 Test Bed Aircraft: A Facility for High-Speed Flight Research,”**
  NASA/TP-2000-209023 (2000): Mach-3.2 flight evidence, deliberately low positive open-loop
  directional stability, SAS dependence, and inlet-unstart transient context.
  <https://ntrs.nasa.gov/citations/20000064011>
- V. L. Peterson, **“Static Stability and Control of Canard Configurations at Mach Numbers from
  0.70 to 2.22 — Triangular Wing and Canard with Twin Vertical Tails,”** NASA-TN-D-1033 (1961):
  twin-tail effectiveness and its dependence on Mach and angle of attack.
  <https://ntrs.nasa.gov/citations/19980227076>
- M. D. White and R. C. Innis, **“A Flight Investigation of the Low-Speed Handling Qualities of a
  Tailless Delta-Wing Fighter Airplane,”** NASA-MEMO-4-15-59A (1959): carrier-approach
  lateral-directional limits and rudder behaviour.
  <https://ntrs.nasa.gov/citations/19980232080>
- C. J. Donlan, **“An Interim Report on the Stability and Control of Tailless Airplanes,”**
  Report 796 / NASA record 19770022126: directional-stability requirement and drag-rudder
  post-stall/pro-spin cautions.
  <https://ntrs.nasa.gov/citations/19770022126>
- J. T. Bosworth and P. C. Stoliker, **“The X-31A quasi-tailless flight test results,”**
  NASA-TP-3624 (1996): reduced-tail flight is feasible but depends on sufficient active-control
  authority, sensors, and validation.
  <https://ntrs.nasa.gov/citations/19960029101>

## 10. Recommendation

Generate and analyse the smaller-twin-fin candidate first because it preserves the simple passive
stability and fault-tolerance thesis while directly testing whether the current visual surfaces are
oversized. Show a fixed fin and bounded segmented rudders—not two entire moving slabs—and label all
new imagery **candidate / 60–70% area starting trade**.

Do not update the runtime geometry, dimensions, mass, cost, or visual-identity invariants from that
image. Promote a tail only after gates G1–G13 close together. Until then, the requirement is
**directional stability and controllability**, not **two large fins**.
