# 51 — Crew ingress, egress, and rescue

← [50 — Crew, escape, FBW](50-crew-escape-fbw.md) · Next:
[60 — Armament and drones](60-armament-and-drones.md) · Related:
[11 — Visual identity and buried crew capsule](11-visual-identity-and-buried-capsule.md) ·
[83 — Ground cycle and facility](83-ground-cycle-and-facility.md)

> **Conceptual engineering basis only.** This chapter defines a candidate architecture and the
> tests needed to accept or reject it. It is not an airworthiness approval, rescue procedure,
> explosive-safety plan, pressure-vessel drawing, or claim that the current Rapier loft already
> contains a human-sized capsule.

The occupant does not climb through a canopy and lower into a conventional seat. The proposed
solution is a protected-cell boarding system built around three deliberately separate things:

1. a **flush, load-bearing dorsal outer-skin plug** that restores the aircraft outer mould line;
2. a **sealed pressure hatch** that remains part of the escape capsule; and
3. a **powered reclined couch sled** that brings the occupant to the opening without moving or
   arming the complete escape capsule.

That distinction matters. Normal boarding is a ground-maintenance operation through two closed
boundaries. Flight escape ejects the complete sealed capsule only after a separate clearance event.
Emergency rescue opens or cuts the ground-access path only after the flight-escape system is made
safe.

## 1. Status vocabulary

| Tag | Meaning |
| --- | --- |
| **CLOSED** | Fixed by owner direction, a closed repository interface, or a derived value from one. Preserve until all owners change together. |
| **PROPOSED BASELINE** | Selected architecture for packaging, mock-up, analysis, art, and simulation work. It is not yet qualified. |
| **OPEN / REQUIRED TEST** | A missing dimension, analysis, demonstration, failure response, or acceptance result. It must not be implied by prose or concept art. |

## 2. Inherited constraints

### 2.1 Crew and exterior

- **CLOSED — owner direction:** one pilot is fully reclined inside a buried, opaque
  pressure-and-escape capsule.
- **CLOSED — owner direction:** there is no cockpit bump, windscreen, canopy, transparency,
  raised visor, or glazed forward panel.
- **CLOSED:** the outside world reaches the occupant through sensors and displays, not direct
  forward vision.
- **CLOSED:** the aircraft remains 13 m long and 7.35 m in span at the current definition stage,
  with a cranked delta, one ventral inlet, one propulsion tunnel, and one aft nozzle.
- **CLOSED:** flight-structure ceilings are 12 G qualified and 15 G override. They are not proof
  that an occupant, couch, hatch, capsule, or escape trajectory is qualified to those loads.
- **CLOSED:** the old raised `escapePodSpine` is a superseded assumption. It is not a volume claim
  or a boarding solution for the buried capsule.

### 2.2 Structure and nearby systems

- **PROVISIONAL REPO STRUCTURE:** four longitudinal members, a forward bulkhead, frames at the
  authored loft stations, and a wing carry-through approximately at
  `z ∈ [−1.0, +1.5] m`.
- **CLOSED LOAD-PATH RULE:** launch, gear, and recovery loads react through the keel, frames,
  longerons, and wing carry-through—not through the propulsion duct liner or crew pressure shell.
- **CLOSED:** the ventral inlet begins near `z = −3.72 m`; its tunnel occupies the lower centrebody.
- **OPEN:** gun, nose-gear, sensor, wiring, cooling, flight-escape propulsion, and capsule
  installation volumes are not closed around a human model.

The normal access opening therefore belongs in cold upper composite structure, forward of the main
carry-through and between—not through—the primary longitudinal members. A side door through a
longeron is not the baseline.

## 3. Proposed baseline architecture

### 3.1 The four nested assemblies

```text
outside air
  → A · structural OML plug
    → dry interstitial access bay
      → B · capsule pressure hatch
        → C · reclined couch sled and occupant
          → D · fixed-in-flight / separable escape capsule
```

#### A — Structural outer-mould-line plug

**PROPOSED BASELINE:** one dorsal plug sits exactly flush with the local upper surface. It has no
window and no cockpit-shaped dark treatment.

- A co-cured perimeter ring and fore/aft portal frames route local shell loads around the opening.
- Distributed shear keys restore membrane shear and compression transfer when the plug is closed.
- Multiple over-centre or wedge latches provide fail-safe retention; no single latch carries the
  complete aerodynamic or torsional load.
- A replaceable conductive/environmental gasket restores weather, electromagnetic, and surface
  continuity. It is not the occupant pressure seal.
- The protected-cell boarding bridge lifts the plug nearly vertically and retains it captive. The
  plug is never left loose on the wing or floor.
- External mechanical release points remain usable after aircraft electrical power is isolated.
- The plug has a separate flight-clearance function for capsule escape. Ground opening and flight
  clearance must use mutually exclusive arming paths.

The plug may be load-bearing without being the sole continuation of a primary longeron. Cutting
both upper longerons and expecting removable latches to replace them is rejected.

#### B — Capsule pressure hatch

**PROPOSED BASELINE:** a smaller opaque pressure hatch sits directly below the outer plug.

- It is part of the capsule pressure vessel and remains sealed to the capsule during flight escape.
- Its pressure load reacts into a capsule hatch ring, not into the outer-skin plug.
- A double pressure seal with an instrumented inter-seal cavity supports preflight leak checking and
  distinguishes inner-seal from outer-seal failure.
- It cannot open until capsule pressure is equalised. It cannot pressurise unless its latches and
  seal witnesses agree.
- During normal boarding, a second captive puller on the cell bridge removes or translates the
  pressure hatch only after the escape system is safe and the capsule is depressurised.
- A manual equalisation valve and mechanical latch drive are reachable from outside after the outer
  plug is removed.

The exact inward-plug, translate-and-stow, or captive-removable kinematics are
**OPEN / REQUIRED TEST**. They must be selected with a full-size pressure-vessel mock-up; they
cannot be inferred from a cutaway.

#### C — Powered reclined couch sled

**PROPOSED BASELINE:** the restraint couch remains at its flight recline angle and rides on two
short, self-locking guides inside the capsule.

- Low-energy electromechanical screw actuators raise and translate the couch toward the dorsal
  opening. The occupant does not crawl feet-first through a dark pressure vessel.
- In the loading position, ground crew can reach the occupant's head, shoulders, torso, pelvis,
  restraints, oxygen, communications, and medical disconnects from the bridge.
- In the flight position, independent mechanical pins carry flight and crash loads. The actuator
  does not carry 12 G structure loads.
- The sled and couch stay inside the capsule during flight escape. They do not eject separately.
- A manual handwheel or rescue-tool input drives the same guides after electrical isolation.
- The couch can continue out far enough to act as a litter for an incapacitated occupant, subject
  to guide and bridge load tests.

The normal actuator and the emergency manual drive must not share one clutch, gearbox, or electrical
dependency whose seizure blocks both paths.

#### D — Complete escape capsule

**PROPOSED BASELINE:** the pressure vessel, pressure hatch, couch, occupant, restraint, minimum
life support, flight displays/controls needed after separation, and recovery system make one escape
capsule.

- It mounts to independent frames and separation guides; it does not use the couch sled as a
  flight-separation rail.
- Power, data, cooling, breathing-gas, and communications interfaces are releasable at the
  capsule/aircraft boundary.
- Avionics that are not required after separation remain in the aircraft to avoid making the
  capsule an unnecessarily heavy forward-fuselage section.
- Routine boarding does not translate, unlatch, or arm the complete capsule.
- Depot removal may use the dorsal structural opening or a larger assembly demate, but that
  maintenance sequence is not yet selected.

The U.S. Air Force's 1988 lightweight fighter-capsule study is useful precedent for a reclined,
insertable capsule with releasable power/data/environmental interfaces and avionics kept outside
the escape body. It is not qualification evidence for Rapier:
[NASA NTRS 19890010487](https://ntrs.nasa.gov/citations/19890010487).

## 4. Packaging reality check

### 4.1 Candidate location

**PROPOSED BASELINE FOR CAD ONLY:** begin the capsule/access study between approximately
`z = −3.4 m` and `z = −1.1 m`, immediately aft of the inlet lip and just forward of the nominal
wing carry-through. Keep the opening centred between the upper longitudinal members.

This location is not closed. It is a starting box because moving farther forward collides with the
nose, sensors, gun, nose gear, and inlet; moving farther aft collides with the carry-through, centre
fuel, and drone-cell region.

### 4.2 Current vertical volume may not be enough

Interpolating the current fuselage and propulsion-tunnel lofts through that region leaves only
roughly **0.45–0.50 m of nominal model-to-model vertical space** between the tunnel crown and upper
OML through much of the likely capsule bay. That is before subtracting:

- upper and lower skins;
- longerons, frames, hatch ring, and local reinforcement;
- duct liner, thermal isolation, and inspection clearance;
- pressure shell, insulation, displays, and life-support plumbing;
- couch, restraint, helmet, suit, and occupant clearance; and
- sled guides, locks, actuators, and rescue stroke.

This rough reading is not a validated section model, but it is enough to make capsule fit a
**P0 OPEN / REQUIRED TEST**. A fully reclined suited occupant plus pressure shell is likely deeper
than the unallocated gap. The architecture must not “close” by thinning padding, deleting
clearance, intersecting the duct, or excluding part of the required pilot population.

If the package fails, preserve the no-bump direction and revisit the aircraft coherently:

1. re-loft several forward-centrebody stations into a smooth continuous upper surface rather than
   adding a local cockpit hump;
2. reshape or lower the duct crown only with propulsion/inlet re-analysis;
3. move the carry-through, gun, sensors, or gear only with their owning interfaces;
4. increase overall body depth or length with new drag, area-rule, mass, inertia, gallery, and
   runtime evidence; or
5. change the mission/airframe concept.

Reducing crash clearance or pilot accommodation to protect an inherited render mesh is not an
acceptable sixth option.

### 4.3 Initial mock-up envelopes—not frozen dimensions

The first digital and physical mock-ups should explore, not assume, these ranges:

| Item | Initial study range | Status |
| --- | ---: | --- |
| Flight recline | approximately **65–70° aft from upright** | **PROPOSED TEST RANGE**; physiology, reach, escape, and neck support must select it |
| Occupied capsule length | approximately **2.25–2.45 m** | **PACKAGING SEED**, includes suited occupant and end clearances, not recovery hardware |
| Occupied capsule maximum width | approximately **0.75–0.85 m** | **PACKAGING SEED**, to be derived from selected population and equipment |
| Occupied capsule depth | approximately **0.62–0.75 m** | **PACKAGING SEED**; likely conflict with current nominal gap |
| Clear normal-access aperture | approximately **1.35–1.55 m × 0.72–0.80 m** | **MOCK-UP SEED**, enabled by longitudinal couch motion |
| Couch-sled service stroke | approximately **0.45–0.60 m** | **MOCK-UP SEED** |

None of these values enters the airframe definition until a clothed human model, structure, duct,
systems, and rescue demonstration agree. Body dimensions are correlated; percentile dimensions
must not be stacked into a fictional “95th-percentile person.”

## 5. Protected-cell boarding

The pilot boards in an alert cell before the aircraft moves to the transporter or launch hall.
Opening either hatch in the launch bore is prohibited except during an isolated rescue.

### 5.1 Ground equipment

**PROPOSED BASELINE:**

- a height-adjustable bridge spans the upper fuselage without loading the wing skin;
- three hard-contact datums locate it to dedicated airframe ground points;
- a soft sealed boot controls rain, dust, light, and contaminated-air ingress around the opening;
- captive hoists own both hatch members;
- bridge handrails, fall restraint, lighting, ventilation, communications, and medical access
  remain available with the couch in loading position;
- a local ground panel shows pressure, latch, seal, sled-lock, escape-safe, battery, oxygen, and
  fire status independently of the pilot display; and
- the bridge carries the manual hatch and sled drives, so loss of aircraft power does not strand
  the occupant.

The bridge is removable facility equipment. The aircraft carries no permanent ladder, boarding
step, or raised fairing.

### 5.2 Normal ingress sequence

**PROPOSED BASELINE:**

1. Move the aircraft into the alert-cell boarding datum; chock, ground, and make propulsion,
   armament, capsule-flight-separation, high-pressure gas, and stored electrical energy safe.
2. Dock and mechanically verify the bridge. Connect conditioned air, communications, and ground
   power.
3. Read independent zero-pressure confirmation for the capsule.
4. Release and lift the structural OML plug into its captive bridge fixture.
5. Inspect the dry bay, seals, latch ring, drains, foreign-object state, and escape clearance path.
6. Release and open the capsule pressure hatch with the flight-escape initiators physically safed.
7. Drive the empty couch to loading position and perform actuator, manual-drive, restraint,
   medical-release, breathing-gas, display, control, and communications checks.
8. The fully equipped pilot transfers from the bridge to the already reclined couch. Two
   technicians connect and independently inspect restraint, helmet/head support, breathing gas,
   cooling, biomedical leads where used, control reach, and emergency handles.
9. Drive the couch to flight position. Mechanical locks, not actuator torque, establish the load
   path.
10. Close the pressure hatch; verify latch positions, run the inter-seal check, pressurise
    gradually, and verify pressure decay and life support.
11. Close the structural plug; verify every latch group, shear-key seating, gasket continuity,
    surface flushness, and dry-bay condition.
12. Remove every bridge interface, tool, pin, cover, and umbilical; run the independent
    flight-ready witness check before transporter release.

The existing alert timeline allocates about four minutes to boarding, restraint, hatch closure, and
the start of BIT. That remains a planning ambition. The full-scale mock-up decides whether it is
credible; the safety sequence does not lose steps to protect the countdown.

### 5.3 Flight-ready interlocks

The aircraft cannot become transport-ready, engine-ready, launch-ready, or escape-armed unless
independent channels agree on:

- structural-plug latches, shear-key seating, and flushness;
- pressure-hatch latches, inner and outer seal health, and capsule pressure;
- couch flight locks and restraint engagement;
- bridge clear, hoists clear, all ground pins/tools accounted for, and outer surface clear;
- capsule mounts, separation guides, clearance system, recovery system, and releasable
  umbilicals;
- life support, fire detection, communications, displays, controls, and minimum sensor coverage;
- escape state appropriate to the current ground or flight phase; and
- no contradictory ground-rescue command.

At least one mechanical witness or directly measured latch position is required at every load-bearing
closure. Motor current, actuator command, software state, or a camera image alone is not proof of
engagement.

### 5.4 Occupied transfer after bridge removal

The fixed alert-cell bridge is not the only ground-rescue path. Whenever the sealed, occupied
aircraft moves between its cell, recovery strip, or launch hall, a separate mobile rescue frame and
trained team cover the entire route. The frame reproduces the bridge datums, independent hatch and
couch drives, breathing/pressure ports, escape-system safing interface, fire protection, and litter
transfer without riding on the aircraft transporter. Segregated route access and docking turnouts
are part of the facility interface, not optional operating convenience.

The planning acceptance objectives are emergency communication/breathing connection within
**60 seconds** of a transporter stop and couch-as-litter extraction within **180 seconds** for an
undamaged cold aircraft. The fire, hot-structure, deformation, rollover, flood, and uncertain
escape-system cases each need their own measured tenability limit. Occupied transfer remains
inhibited until the route-specific drill passes. See
[83 — Ground cycle and facility](83-ground-cycle-and-facility.md).

## 6. Normal egress

**PROPOSED BASELINE:** after a normal trap, the pilot ordinarily remains sealed until the aircraft
is chocked in a protected hot-return or alert cell. High-Mach thermal exposure, hard landing,
suspected fire, fumes, flooding, injury, or medical distress moves egress to the emergency branch.

Normal egress reverses the ingress sequence:

1. propulsion, armament, stored energy, oxygen, and escape initiators are safe;
2. the bridge docks and supplies communications and ventilation;
3. capsule pressure equalises through the controlled valve;
4. the outer plug and pressure hatch open into captive fixtures;
5. the couch unlocks and rises to loading position;
6. technicians disconnect the occupant and assess balance, vision, cognition, neck/back condition,
   and post-G symptoms before standing is attempted; and
7. the couch remains a litter if the occupant should not self-transfer.

The pilot is not expected to sit upright abruptly after a demanding recovery merely because the
hatch is open. A reclined design has to support a reclined medical extraction.

## 7. Ground emergency rescue

### 7.1 Rescue doctrine

**PROPOSED BASELINE:** normal hatch access is the primary ground-rescue path. Flight capsule
jettison is not the ground-rescue default; near personnel, a roof, a gallery, or damaged structure,
it can create a second lethal event.

Aircraft-specific rescue cards must show:

- normal and emergency hatch releases;
- capsule pressure equalisation and emergency breathing-gas ports;
- battery, fuel, oxygen, RCS pressure, engine, gun, drone, launch-fitting, and hot-material hazards;
- flight-escape initiator safe points and stored-energy indicators;
- approved lift/stabilisation points;
- preferred and alternate cut-in zones; and
- areas where cutting can strike the pressure shell, propellant/initiators, fuel, ammunition,
  pressure vessels, wiring, or the hot duct.

FAA ARFF training guidance requires responders to know aircraft-specific normal/emergency openings,
shutdowns, egress hazards, cut-in locations, and assisted extraction; Rapier needs its own rescue
card and full-scale recurrent drills, not generic fighter knowledge:
[FAA AC 150/5210-17C](https://www.faa.gov/documentLibrary/media/Advisory_Circular/150-5210-17c-Programs-for-Training-ARFF-Personnel.pdf).

### 7.2 Emergency sequence

1. Stabilise the aircraft and establish fire protection and an extraction path.
2. Establish direct pilot/rescuer communication if any channel works.
3. Shut down propulsion and isolate launch energy, battery buses, fuel, oxygen, RCS pressure, and
   ordnance as the incident permits.
4. Place the flight-escape system in a positively indicated rescue-safe state. Do not assume
   electrical power loss means initiators are safe.
5. Dock the rescue bridge or compact rescue frame; connect emergency ventilation/breathing gas if
   required.
6. Equalise capsule pressure mechanically.
7. Open the structural plug and pressure hatch with manual drives. If deformation blocks them, use
   the approved alternate cut-in path only after hazard confirmation.
8. Release the couch flight locks and drive or winch the sled outward.
9. Treat the couch as a litter: support head/neck, disconnect services through labelled quick
   releases, and remove the occupant without a forced sit-up or axial twist.

### 7.3 Degraded cases

| Case | Proposed response | Open proof |
| --- | --- | --- |
| **Aircraft electrical power lost** | Bridge-powered or manual plug, pressure-hatch, equalisation, and couch drives; self-locking mechanisms hold position | Demonstrate with batteries removed, failed actuator, jammed clutch, darkness, gloves, and smoke |
| **Pilot unconscious or injured** | Rescuers reach airway, restraint releases, and medical disconnects with couch still reclined; couch extracts as a litter | 5th–95th population, full equipment, spinal precautions, one rescuer initially reaching from each side |
| **Engine/fuel/electrical fire before launch** | Holdback retained, launcher inhibited, engine/fuel/battery isolated, protected rescue path and cooling established, then hatch extraction | Fire plume, skin temperature, smoke ingress, suppression-agent compatibility, time-to-tenability |
| **Capsule smoke or fire** | External emergency breathing gas and ventilation/suppression port; controlled depressurisation; rapid manual access | Fire source taxonomy, toxic products, pressure response, agent selection, occupant exposure |
| **Flooding in gallery** | Keep the pressure vessel shut while water head exists; provide emergency breathing gas; tow, lift, pump, or drain before opening | Capsule buoyancy/stability, seal duration, water-pressure effects, submerged latch operation |
| **Aircraft on side** | Stabilise; use whichever bridge datum remains reachable; extract couch along a supported guide path | Side-load guide operation and restraint release |
| **Aircraft inverted / dorsal path blocked** | Do not fire the capsule into the ground. Stabilise and lift/roll from approved points, or use an approved upper-side cut-in path after escape/ordnance safing | Crash deformation, lifting fixtures, rescue clearance, cut-tool trials |
| **Outer plug deformed or latches jammed** | Independent manual sectors, hinge-free captive removal, then marked cold-structure cut path | Jammed-latch and distorted-ring tests; no-cut map validation |
| **Pressure cannot equalise normally** | External mechanical equalisation and monitored vent; protect rescuer from sudden opening | Stuck valve, blocked vent, pressure-sensor disagreement |
| **Couch drive seized** | Independent rescue winch attaches directly to couch hardpoints after drive disconnect | Gearbox seizure, guide distortion, off-axis casualty load |
| **Escape system cannot be positively safed** | Establish exclusion zone and remote technical-control procedure; do not place rescuers over the clearance axis | Initiator state indication, remote safing, misfire and hang-fire procedure |

Two shallow, flush upper-side rescue panels may provide access to equalisation, escape-system safing,
restraint release, emergency gas, and couch-winch hardpoints without being person-sized doors.
Their existence, location, and signature treatment are **OPEN / REQUIRED TEST**. They must not cut a
longeron or create a second casual boarding path.

## 8. Flight escape is not normal hatch egress

### 8.1 Separation concept

**PROPOSED BASELINE FOR ANALYSIS:**

1. An escape request enters a hard-real-time escape controller independent of the normal display
   stack.
2. If control remains, the aircraft attempts the proved unload/attitude/engine/inlet precondition
   without delaying beyond the survivability logic.
3. The structural OML plug clears on two independent indications.
4. Flight-only umbilicals and capsule mounts release.
5. The complete sealed capsule translates along dedicated guides until clear of the local flow and
   structure.
6. A future stabilisation/deceleration/recovery system takes over.

The pressure hatch remains closed and the couch remains locked throughout. Ground-rescue controls
cannot command flight clearance, and flight-escape controls cannot unlatch the pressure hatch.

### 8.2 High-dynamic-pressure limitation

There is **no closed Rapier capsule escape envelope**. “Mach 4 capable aircraft” does not mean
“safe ejection at Mach 4.”

At high dynamic pressure, clearing an outer plug opens a cavity and exposes both plug and capsule
to severe aerodynamic load. The plug can strike the capsule, inlet flow, wing, or fins; the capsule
can pitch into the airframe; the occupant can see unacceptable onset rate; and the recovery system
can fail even if the pressure shell survives. High altitude reduces density but adds long
high-speed recovery and thermal cases. Low-altitude high-equivalent-airspeed escape is a different
and potentially worse case.

The 1988 Air Force study discussed a 65° reclined, approximately 1,200 lb concept and a notional
950 KEAS escape objective. That study demonstrates that integrated capsule design was investigated;
it does not validate Rapier's shape, heat state, mass, clearance path, propulsion, or recovery
system. Until trajectory and sled tests exist, operational doctrine is:

- use the ordinary hatch only on the ground in a rescue-safe state;
- if the aircraft remains controllable, let automation seek a proved capsule-release corridor;
- do not promise zero-zero, high-q, inverted, tumbling, or Mach-number-only capability; and
- state escape availability in dynamic pressure, Mach, altitude, attitude/rates, sink rate,
  thermal state, damage state, and time-to-impact.

## 9. Human factors

### 9.1 Design population and equipment

**OPEN / REQUIRED TEST:** select the contractual aircrew population and every worn/carried item.
The initial evaluation should bracket at least 5th-percentile female through 95th-percentile male
participants, using current flight clothing, helmet/display, oxygen equipment, gloves, survival
equipment, and any chemical/biological ensemble required by doctrine.

Use [MIL-STD-1472H](https://quicksearch.dla.mil/qsdocdetails.aspx?ident_number=36903) as the current
U.S. military human-engineering reference, while applying the aircraft-specific crew-system
requirements that govern the program. NASA's full-scale HL-20 work is a useful methodological
precedent: it tested suited participants across a 5th–95th percentile range and measured actual
ingress/egress rather than accepting CAD clearance
([NASA NTRS 19930069749](https://ntrs.nasa.gov/citations/19930069749)).

### 9.2 Reclined operation

- The head, neck, shoulders, pelvis, thighs, and lower legs require continuous, energy-absorbing
  support appropriate to the chosen acceleration vector.
- Do not raise the pilot's head to recover a forward view. Sensor/display geometry must suit the
  supported head position.
- Critical flight and escape controls must remain identifiable and operable while fully restrained,
  gloved, in vibration, in darkness, after display failure, and under the accelerations for which
  they are claimed.
- A manual emergency control must be reachable without shoulder-harness release.
- Restraints require one normal release and a labelled rescuer release that cannot be confused with
  escape initiation.
- The pilot must be able to breathe, communicate, swallow, clear pressure, and tolerate the
  boarding posture during alert waits without pressure points or heat stress.
- Motion sickness, disorientation, neck loading, limb flail, vibration, spinal compression, and
  post-G orthostatic symptoms belong in the test program.

The physiology model in the simulation is not human-subject evidence.

## 10. Interfaces and seals

### 10.1 Structural plug

Close:

- opening coordinates, edge radii, plug thickness, and mass;
- frame and longeron load paths;
- latch count, spacing, preload, shear-key engagement, fatigue, and residual strength;
- aerodynamic steps/gaps under pressure, temperature, contamination, and repeated cycles;
- conductive seal and sensor-aperture interaction;
- lightning/static path, drainage, icing, and water ingestion;
- rescue release torque after deformation and heat exposure; and
- inspection interval and field replacement.

One flush seam may be signature-managed, but it is not proof of broadband low observability. The
plug must remain serviceable after repeated openings; a coating process that makes every boarding
cycle a depot repair is not viable.

### 10.2 Pressure hatch and capsule

Close:

- cabin pressure schedule, maximum differential pressure, proof/burst factors, leak rate, and
  decompression rate;
- hatch aperture and pressure-loaded area;
- seal material compatibility with oxygen, sweat, decontaminants, smoke, suppressant, fuel,
  hydraulic fluid, water, cold soak, and heat;
- latch load, pressure-assisted opening prevention, external equalisation, and trapped-pressure
  indication;
- life-support endurance in alert, flight, power loss, smoke, flood, and post-separation cases;
- pressure-shell penetration count and releasable umbilical geometry; and
- crack, impact, fire, ballistic, and repeated-cycle tolerance.

### 10.3 Couch and occupant

Close:

- selected population geometry in full equipment;
- recline angle, eye/display datum, head support, and limb envelopes;
- restraint points, load distribution, energy absorption, and medical release;
- couch dimensions, mass, centre of gravity, travel, locks, guide loads, and backlash;
- powered and manual actuation loads under pitch, roll, deformation, and casualty asymmetry;
- control reach and visibility in all flight and rescue states; and
- litter transfer to the facility rescue route.

## 11. Validation programme

The architecture advances only through evidence in this order.

### Gate 1 — Digital section-volume proof

- Build watertight OML, duct, structure, gun, gear, carry-through, sensor, wiring/cooling, capsule,
  couch, suited-human, hatch, and actuator volumes at common coordinates.
- Run interference and maintainability sweeps through the complete sled travel.
- Show pressure-shell and primary-structure thickness, not zero-thickness surfaces.
- Evaluate mass, CG, inertia, area ruling, external height, and gallery clearance.
- **Fail condition:** any required human or system volume intersects the duct, longeron,
  carry-through, gear, or closed OML without an accepted owner-level redesign.

### Gate 2 — Full-size unpressurised ergonomic mock-up

- Test the selected population in full equipment, day/night, gloves, smoke-obscured vision, and
  degraded communications.
- Measure boarding, restraint, closure, self-egress, assisted egress, airway access, and litter
  extraction.
- Repeat with one actuator failed and all aircraft power removed.
- Include alert-duration comfort and rapid post-G extraction simulations.
- **Fail condition:** an occupant must crawl unsupported, remove safety equipment, sit up sharply,
  or exceed agreed reach/force limits.

### Gate 3 — Structural plug and pressure article

- Pressure proof, burst, leak, rapid decompression, repeated seal cycles, rain/flood, thermal cycle,
  vibration, acoustic, lightning/static, contamination, and latch fault tests.
- Apply representative shell shear, compression, torsion, and local aerodynamic suction while
  measuring step/gap and latch load.
- Demonstrate manual opening after thermal exposure and controlled structural distortion.
- **Fail condition:** one latch/sensor/actuator fault defeats retention, pressure safety, or rescue
  access.

### Gate 4 — Rescue and facility demonstration

- Use an instrumented full-size airframe section with fuel/oxygen/pressure/escape hazards
  represented safely.
- Drill powered and unpowered access, unconscious casualty, fire/smoke, side-rest, rollover,
  flooding, jammed latch, seized sled, and approved cut-in.
- Validate rescue cards with the actual crash/fire/rescue team in full protective equipment.
- **Fail condition:** rescue depends on undocumented cutting, live software, one electrical bus, or
  firing the capsule on the ground.

### Gate 5 — Flight-separation development

- Subscale and full-scale sled tests, computational and wind-tunnel cavity/clearance work, captive
  carriage, plug trajectory, capsule trajectory, and recovery-system tests.
- Sweep dynamic pressure, Mach, altitude, attitude, angular rates, sink rate, thermal state,
  structural deformation, delayed initiation, one-channel failures, and time to terrain.
- Use instrumented anthropomorphic test devices before any occupied testing.
- **Fail condition:** present a marketing Mach number without a multi-variable proved envelope.

### Gate 6 — Integrated operational trial

- Prove alert-cell boarding, bridge removal, transporter release, launch interlocks, post-trap
  extraction, inspection, seal restoration, and turnaround with representative crews.
- Feed measured task times back into [83 — Ground cycle and facility](83-ground-cycle-and-facility.md).
- Freeze geometry only after airframe, propulsion, structure, crew, rescue, manufacturing,
  signature, simulation, and presentation owners accept the same configuration.

## 12. Required closure register

| Priority | Finding | Required result |
| --- | --- | --- |
| **P0** | Current OML/tunnel data do not prove occupant depth | Common-coordinate section-volume model with suited human, real shell/structure, and no intersections |
| **P0** | Outer opening may interrupt upper load paths | Portal-frame/longeron architecture and plug load proof |
| **P0** | No pressure hatch, seal, or pressure schedule exists | Pressure-vessel geometry, loads, leak/decompression requirements, and article test |
| **P0** | No flight capsule separation/recovery envelope exists | Multi-variable clearance, stabilisation, deceleration, and recovery programme |
| **P1** | Couch/sled geometry and crash load path absent | Full-size ergonomic mock-up, mechanical locks, manual rescue drive, and structural test |
| **P1** | Rescue access after power loss, fire, rollover, or flood unproved | Facility-scale responder trials and aircraft-specific rescue card |
| **P1** | Escape initiator and ground-rescue controls can conflict | Mutually exclusive mechanical/electrical state machine and fault-injection test |
| **P1** | Pilot population, suit, helmet, and survival equipment not frozen | Contractual population/equipment definition and clearance/reach evidence |
| **P1** | Capsule, hatch, couch, bridge, and escape masses absent | Mass properties and CG/inertia update |
| **P2** | Four-minute alert-cell boarding allocation unmeasured | Repeated representative-crew timing; update ground cycle if missed |
| **P2** | Hatch seam signature and repeated-service durability unknown | RF/material coupon and full-scale seam testing tied to the actual threat model |
| **P2** | Runtime camera still follows old raised-spine surrogate | New buried-eye/display datum only after accepted capsule geometry |

## 13. Epistemic

**CLOSED:** one fully reclined pilot; opaque buried pressure/escape capsule; no cockpit bump,
windscreen, canopy, or transparency; sensor-mediated outside view; current aircraft envelope and
nearby closed propulsion/structure interfaces.

**PROPOSED BASELINE:** protected-cell boarding; one flush load-bearing dorsal OML plug; a separate
capsule pressure hatch; a mechanically locked, powered/manual reclined couch sled; ordinary hatch
access for ground rescue; whole sealed-capsule separation only for flight escape; aircraft-specific
rescue cards and drills.

**OPEN / REQUIRED TEST:** whether the capsule fits at all; every hatch and couch dimension; primary
load routing; pressure schedule and seals; pilot population and equipment; boarding/rescue times;
fire, flood, power-loss, rollover, and deformation response; capsule mass and recovery hardware;
and the complete flight-escape envelope.

No exterior image should add a hatch outline until the opening survives Gate 1. No cutaway should
show a pressure shell, couch, or jettison path as settled until the corresponding gate passes.
