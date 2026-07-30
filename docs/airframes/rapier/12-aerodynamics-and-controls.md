# 12 — Aerodynamics and control allocation

← [10 — Geometry](10-geometry.md) · Next: [15 — Structure and build](15-structure-and-build.md)

This chapter closes the *simulation architecture* of the Rapier wing. It does not claim that a
fictional aircraft has acquired OEM wind-tunnel data. The wing reference geometry and principal
planform are closed; the local capsule and directional-control geometry are reopened. Coefficients
and high-speed schedules are public-theory **surrogates / provisional** until a CFD, tunnel, or
flight deck replaces them.

## Wing-of-record

| Quantity | Value | Status |
| --- | ---: | --- |
| Aerodynamic reference area, S | **18.0 m²** | closed |
| Span, b | **7.35 m** | closed |
| Aspect ratio, b²/S | **3.00125** | closed |
| Mean reference chord, S/b | **2.449 m** | derived / closed |
| Rendered solid planform polygon | **24.3173 m²** | closed mesh arithmetic |
| Body-overlap / non-reference residual | **6.3173 m²** | named; must not become lift area |
| Controls | one elevon each side; directional-stability/yaw solution required | elevons closed; current twin-fin/rudder geometry reopened |

The mesh has always depicted a thin cranked/delta planform. What was missing was the explicit
distinction between the **24.3173 m² drawn polygon** and the **18 m² aerodynamic reference area**.
The renderer includes carry-through/body-overlap geometry; the flight equations nondimensionalise
forces and moments with S = 18 m². Silently swapping one for the other would add about 35% lift and
moment area.

The kernel still names twin rudders, but the definition contains only two mirrored fixed fin
polygons: no hinge, movable chord, actuator, deflection schedule, tail-derived `Cnβ`, `Cnr`, or
`Cnδr` exists. The control requirement is closed; the surface architecture is not. See
[13 — Directional stability and tail trade](13-directional-stability-and-tail-trade.md).

## Lift: three limits, not one magic G number

The kernel now keeps these independent:

1. **Physical attached-flow break.** Low-speed `CLalpha = 3.60/rad`, `CLmax = 1.35`; the Rapier-only
   supersonic surrogate ceilings slope with linear theory `4/sqrt(M²−1)` and scales the physical
   break by the same ratio.
2. **Ordinary normal-law incidence.** A continuous Mach schedule caps commanded alpha below the
   physical break. It is inlet/stability protection, not a second definition of stall.
3. **Structure/control policy.** +12 G normal and +15 G deliberate override are demand ceilings.
   They do not manufacture lift. Explicit incidence override may request the physical wing beyond
   the ordinary law, while drag, inlet recovery, separation, q, and moment authority remain live.

The resulting bound is:

`n = q · S · CL / (m · g)`

At the design-gross **11,090 kg**, FL720 standard atmosphere, and M3.5, this branch computes roughly
**q = 35.0 kPa**. The current provisional schedule gives:

| Boundary | Alpha / CL | Approx. available load |
| --- | ---: | ---: |
| Ordinary normal law | 7.45° / 0.155 | **0.90 G** |
| Physical attached-flow break | 21.5° / 0.447 | **2.59 G** |
| Structural placard | — | 12 G demand ceiling, **not available here** |
| Override placard | — | 15 G demand ceiling, **not available here** |

That 0.90 G result is an intentionally visible calibration finding: the provisional Mach-only
normal-law schedule is slightly too restrictive to hold FL720 at design gross. The mission is
lighter by the dash, but Phase 2 should replace this schedule with a mass/q/inlet-aware law rather
than hiding the discrepancy. The physical conclusion is robust: the small wing cannot pull 12 G
in the upper-atmosphere M3.5 box.

Public basis:

- NASA TP-2771 treats delta-wing supersonic aerodynamics as a planform/Mach problem, not a reusable
  low-speed coefficient: <https://ntrs.nasa.gov/citations/19880008231>
- NACA RM L52H14 reports major loss of delta-wing control effectiveness by M1.65; the current
  transparent schedule is unity through M1 then about 0.5 at M1.65:
  <https://ntrs.nasa.gov/api/citations/19930087329/downloads/19930087329.pdf>
- NASA TM-4533 shows that longitudinal stability/control of high-speed delta concepts can vary
  materially and may become unstable above M3:
  <https://ntrs.nasa.gov/citations/19940020243>

## Moment authority and configuration

Fixed “fighter-feel” torque is no longer free authority for this airframe. Rapier pitch, yaw, roll,
and bank-hold delivery is capped by:

- pitch: `q · S · c̄ · |Cm|max`
- yaw: `q · S · b · |Cn|max`
- roll: `q · S · b · |Cl|max`

The provisional coefficient ceilings are `|Cm| 0.18`, `|Cn| 0.055`, and `|Cl| 0.047`, multiplied by
the Mach effectiveness schedule and the actual configuration authority. They go to zero with q.
Cold-gas RCS supplies only the remaining controller demand in thin air and consumes the finite
40 kg gas budget on pitch, yaw, and roll. It does not provide free aerodynamic wing unloading.

The landing “flap” channel is **symmetric elevon droop**:

- full droop adds `ΔCL = +0.26`, `ΔCD = +0.070`, and provisional `ΔCm = −0.055`;
- it leaves **55% roll authority** and **68% pitch authority** because the same surfaces have
  consumed travel;
- the left/right actuators are electrically synchronized, not mechanically cross-shafted. One
  actuator/circuit failure can create a real split.

## Installed inlet coupling

At M > 2, combined flow angle `sqrt(alpha² + beta²)` now reduces installed TBCC thrust through an
explicit recovery surrogate. The onset is smooth from M2 to M2.5; on-design flow remains 100%.
This is not an unstart solver. It makes the first-order consequence real: a hard high-speed pull or
skid trades thrust as well as kinetic energy.

NASA mixed-compression inlet testing found a sharply bounded incidence envelope and unstart
sensitivity; one M2.5 test inlet reached only about 2.55° angle of attack before unstart. The
Rapier law is deliberately softer because its inlet geometry and control system are fictional, but
the coupling may no longer be omitted:
<https://ntrs.nasa.gov/api/citations/19750003898/downloads/19750003898.pdf>.

## F-22 as the infrastructure control case

The F-22 public-data surrogate is **not** an aerodynamic donor for Rapier. It is the regression
oracle for shared machinery:

- aerodynamic control collapses at q → 0;
- thrust vectoring requires actual thrust and respects nozzle rate/angle;
- high-alpha roll/yaw schedules and limiter reasons remain isolated from Rapier schedules;
- configuration increments are counted once;
- generic/F-22 lift paths remain bit-for-bit outside the Rapier model selector.

The USAF public fact sheet confirms a two-engine, two-dimensional-thrust-vectoring, 13.6 m span,
Mach-two-class aircraft; the repo's deeper coefficients remain labelled surrogates:
<https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104506/f-22-raptor/>.

## Still open before “fully designed” means prediction

- Reynolds-number and control-deflection aerodynamic tables (`CL/CD/Cm/Cl/Cn` vs Mach, alpha,
  beta, rate, and configuration), including hysteresis.
- Tail-off and with-tail lateral-directional derivatives, rudder geometry/hinge moments, recovery
  crosswind, high-Mach buffet/heating, jam/hard-over and RCS-inhibited handling evidence.
- Inlet mass-flow, distortion, buzz, and unstart/restart states rather than scalar recovery.
- Aeroelastic twist, hinge moment / actuator load, flutter, and control reversal versus q.
- V-n / V-q structural damage, fatigue life, asymmetric failure, and stores/bay-door effects.
- Ground-effect and hook/gear wake interaction in the carrier pattern.
- A mass/q-aware normal law that guarantees feasible level flight without allowing inlet-abusive
  turn demand.

Until those exist, telemetry and UI must say **normal-law alpha**, **dynamic pressure**, **inlet
recovery**, and **physical/structural limit** separately.
