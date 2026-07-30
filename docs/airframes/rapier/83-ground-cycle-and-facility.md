# 83 — Ground cycle and facility

← [82 — Launch-gallery engineering basis](82-launch-gallery-engineering-basis.md) · Next:
[90 — Failure modes](90-failure-modes.md)

> **Worldbuilding and conceptual engineering basis only.** This chapter closes the narrative gap
> between a Rapier stopped on the recovery wire and a Rapier staged on the launch shuttle. It is not
> a construction drawing, an explosive-safety plan, an airworthiness release, a maintenance manual,
> or a certified operating procedure. Exact fire separation, blast distance, structural members,
> launcher aborts, egress, fuel/munition handling, and rescue provisions require qualified design.

The launch kernel begins with an aircraft already constrained at the rail start, and the recovery
kernel ends when arrestment stops. Those are valid simulation boundaries, but they are not a ground
system. A real lane needs to say where aircraft live, how they are serviced, how a fixed-wing
7.35 m-span article reaches the shuttle, how the crew enters a buried capsule, who clears the bore,
and what happens when any part of that chain is unavailable.

## 1. Status vocabulary

| Tag | Meaning in this chapter |
| --- | --- |
| **CLOSED** | Fixed by owner direction, the deterministic kernel, or an existing closed interface. Preserve unless all owners change together. |
| **PROPOSED BASELINE** | The selected worldbuilding/engineering concept for further design, art, and simulation. It is coherent with the closed envelope but not qualified. |
| **OPEN / REQUIRED CLOSURE** | A missing ICD, analysis, test, operational decision, or failure response that must close before an engineering or safety claim. |

Proposed dimensions and times are planning values, not an invitation to infer unlisted structural or
protective performance.

## 2. Closed envelope the ground system inherits

| Item | Value | Status / source |
| --- | ---: | --- |
| Aircraft length and span | **13 m long × 7.35 m span** | **CLOSED** — [10 — Geometry](10-geometry.md), `airframes/rapier.v1.json` |
| Aircraft height | published datum **2.5 m**; measured current render mesh **3.0966 m** | **DISPUTED / OPEN** — [13 — Directional stability and tail trade](13-directional-stability-and-tail-trade.md) |
| Airframe fuel-free mass, drones removed | **5,150 kg** | **CLOSED** — [40 — Mass and CG](40-mass-and-cg.md) |
| Four stowed gun-drones | **1,440 kg** | **CLOSED mission load** — 4 × 360 kg |
| Alert fuel | **3,600 lb / 1,632.93 kg** | **CLOSED mission load** |
| Alert launch mass | **8,222.93 kg** | **derived live** |
| Design gross | **11,090 kg** | **CLOSED** |
| Gallery clear aircraft envelope | **14 m wide × 8 m high** | **CLOSED interface** |
| Covered launch rail | **433.86 m flat** | **derived live** |
| Open launch ramp | **86.14 m to 12°**, rise **8.99 m** | **derived live** |
| Total stroke / end speed / duration | **520 m / 110 m/s / 9.4545 s** | **CLOSED live interface** |
| Launch-lane offset | **70 m** from recovery centreline | **CLOSED live interface** |
| Recovery surface | **1,200 m × 48 m** | **CLOSED live mission interface** |
| Arrestor rating / payout | **35 MJ / 180 m** | **CLOSED capability** |
| Aircraft support-reference height | **0.85 m** | **provisional aircraft interface** |

The provisional support height is a single pose datum, not landing-gear design. Wheel stations, track,
strut stroke, tyres, steering, towing limits, tie-downs, and launch-cradle contact geometry remain
open in [70 — Landing gear, arrest](70-landing-gear-arrest.md).

### 2.1 Crew-capsule presentation freeze

**CLOSED — owner direction:** the occupant is inside a **buried, opaque pressure/escape capsule**
contained within the aircraft outer mould line. There is no transparent canopy and no visible
cockpit bump, blister, raised boarding fairing, or canopy-shaped silhouette. A boarding solution
must preserve the clean closed OML; ground equipment comes to the aircraft rather than permanently
growing the aircraft around a ladder or cockpit.

This supersedes any visual reading of the older sensor/escape-spine surrogate as a cockpit bump.
The pressure vessel, restraint, jettison load path, hatch cut-out, seals, rescue opening, and
separation sequence remain aircraft-side open findings in
[50 — Crew, escape, FBW](50-crew-escape-fbw.md). The selected access architecture and test
programme are in [51 — Crew ingress, egress, and rescue](51-crew-ingress-egress-and-rescue.md).

## 3. Where the aircraft live

### 3.1 Operating doctrine

**PROPOSED BASELINE:** a launch gallery is a shot lane, not a hangar. A Rapier occupies it only
during staging, launch, shuttle inspection, or a specifically isolated maintenance evolution.
Ready aircraft live one per dispersed, earth-covered alert cell. Returned aircraft go first to a
hot-return cell; they never move directly from a live arresting wire to a charged launcher.

This preserves the doctrine in [17 — Signatures and survivability](17-signatures-and-survivability.md):
the installation should not present a ramp full of rare aircraft. It also preserves the accepted
vicinity-art contract, whose revetments are explicitly not hangars and whose gravel service ribbon
is explicitly not a taxiway.

### 3.2 One-lane facility set

**PROPOSED BASELINE:**

| Facility | Count | Planning clear envelope / role |
| --- | ---: | --- |
| Flight-ready alert cell | **4** | One aircraft each; approximately **18 × 14 × 6 m** clear |
| Quick-turn cell | **1** | Fuel, ammunition, drone cassette, RCS, line inspection |
| Hot-return / quarantine cell | **1** | Leaks, over-temperature, hard landing, combat damage, fire watch |
| Rear handling/start hall | **1** | Approximately **20 × 16 × 8 m** clear; traverser, shuttle dock, crew platform, exhaust collector |
| Launcher equipment cells | multiple | Energy storage, converters, pumps, controls, cooling; fire-separated from aircraft path |
| Crash/fire/rescue point | **1** | Direct access to strip, rear hall, and portal without crossing an armed bore |

An alert-cell planning door is approximately **10 m wide × 4 m high**. It is large enough for the
fixed 7.35 m wing but small enough to remain a cell entrance rather than a conventional hangar
front. A single cell fire or blocked door must not trap the complete alert inventory.

Cells sit outside the intentionally sparse approximately 300 m presentation vicinity. Hold
**500–1,200 m** as the first layout trade, with independent earth cover, utilities isolation, and
screened entrances. That range is an operational-timing input, not a protective-standoff claim.
Geology, threat, drainage, roads, environmental constraints, and quantified blast effects set the
real positions.

### 3.3 Major maintenance

**PROPOSED BASELINE:** the lane performs line-replaceable work, quick turns, tyre/gear/hook service,
inlet inspection, limited CMC inspection, and module changes supported by its small crane. Engine
strip, major CMC repair, structural restoration, capsule overhaul, and factory modification occur at
a regional depot. A replacement aircraft arrives flyable and traps onto the strip, or arrives
partially demated by road under a separate transport plan.

**OPEN / REQUIRED CLOSURE:** depot spacing, ferry procedure, demate points, transport fixtures,
spares depth, and battle-damage repair doctrine belong with
[16 — Manufacturing and the industrial basis](16-manufacturing-and-industrial-basis.md). The
current complete-lane cost range in [95 — Cost ledger](95-cost-ledger.md) does not separately price
the cell count selected here.

## 4. How the aircraft reaches the rail

The aircraft does not taxi under its own power through the cell network or launch bore. This avoids
depending on open nosewheel-steering geometry, putting intake suction over an uncontrolled service
surface, or filling occupied cells with exhaust.

### 4.1 Aircraft transporter and transfer route

**PROPOSED BASELINE:** use a battery-electric, all-wheel-steer, omnidirectional transporter rated
for at least **15 t**. Three wheel pans capture the nose gear and both main gears; the aircraft can
move longitudinally or crab laterally without turning its fixed wing. Movement through cells,
doorways, crossings, bends, or any evolution using wing walkers is limited to **walking speed,
no faster than 1 m/s**. Approximately **5–10 m/s** is a segregated clear-route transit range only:
the swept envelope is locked clear, fixed observers remain outside it, and nobody walks beside the
moving aircraft. Final indoor positioning is no faster than **1 m/s**.

Provide a **12 m clear hard-surface operational route** between alert cells, hot-return cell, strip,
and rear hall. It may be visually grassed, screened, or surfaced in removable slabs, but it is not
the current 4.5–5.2 m ambient gravel track. Wing walkers control the 7.35 m-span clearance only
during walking-speed movement; the transporter owns traction and braking throughout.

**OPEN / REQUIRED CLOSURE:** wheel-pan loads, tyre pressure, jacking points, towing acceleration,
gear side-load limits, brake-rider requirement, transporter fail-safe braking, route grade, turning
envelope, and damaged-gear recovery.

### 4.2 Selected aircraft/shuttle concept

**PROPOSED BASELINE — selected for further design:** a **captive three-point launch shuttle** with a
separate aft-keel holdback.

1. A dedicated nose launch link feeds longitudinal acceleration into the reinforced nose-gear
   trunnion / forward keel.
2. Two main-gear saddles carry vertical and lateral support and control pitch/yaw load sharing.
3. A distinct aft-keel holdback lug carries pre-launch engine thrust. The recovery hook is not the
   holdback.
4. Independent load cells at the three supports verify aircraft seating and load balance.
5. Two mechanically load-bearing guide rails support the shuttle; segmented linear-motor stators
   provide longitudinal thrust only.
6. Dual independent release indications confirm aircraft separation.
7. A mechanical breakaway provision prevents one failed electrical command from permanently tying
   the aircraft to the shuttle.
8. Power, data, cooling, and start umbilicals disconnect before the motor bus becomes launch-ready.

This baseline reconciles the declared structure rule
`catapult → NLG/keel → longerons → wing carry-through` in
[15 — Structure and build](15-structure-and-build.md) with the captive-shuttle concept in
[82 — Launch-gallery engineering basis](82-launch-gallery-engineering-basis.md).

Use the launcher chapter's preliminary placeholders until multibody analysis replaces them:

- **160 kN longitudinal service load** before shuttle, drag, and dynamics;
- **450 kN vertical service reaction** before shuttle and local distribution;
- preliminary 1.5 ultimate multiplier: **240 kN longitudinal / 675 kN vertical**.

**OPEN / REQUIRED CLOSURE:** exact gear stations and wheelbase; launch-link and holdback coordinates;
shuttle mass and wheelbase; saddle compliance; pitch articulation; proof loads; asymmetric seating;
release timing; failed-release response; cradle/gear interaction on the 12° arc; and airworthiness
of the aircraft fittings.

### 4.3 The unsolved shuttle-stop problem

The live aircraft hands off at the closed **520 m rail end**. The launcher basis separately says the
captive shuttle brakes after aircraft separation and returns to the rear hall. Those statements do
not yet describe a physical path: a shuttle at 110 m/s cannot stop at a mathematical rail endpoint.

**OPEN / REQUIRED CLOSURE — highest-priority launcher decision:** select and prove one topology:

- aircraft releases before the closed aircraft handoff point and the shuttle continues into a
  braking extension;
- aircraft leaves at the lip while the shuttle diverts into a shuttle-only descending/return track;
- or a defined end-catcher absorbs the known shuttle kinetic energy over a real runout.

The choice sets shuttle mass, release timing, portal/ramp civil geometry, braking energy, emergency
catch, return time, visual art, and probably kernel state. No launch-cadence claim is closed until
this is resolved.

## 5. Pilot ingress and engine start

### 5.1 Buried-capsule ingress

**PROPOSED BASELINE:** the pilot boards in the alert cell, before transfer to the rear hall. A
removable low boarding bridge aligns over one flush, load-bearing dorsal structural plug in cold
upper composite. The bridge captures and lifts that plug, then separately opens the smaller opaque
capsule pressure hatch. A powered reclined couch sled brings the occupant to the bridge and returns
them to the buried flight position; the complete escape capsule does not move during normal
boarding. Both closures return flush with the OML and the bridge is removed before the transporter
moves. There is no rail-side ladder, canopy opening, raised cockpit fairing, or permanent boarding
step. See [51](51-crew-ingress-egress-and-rescue.md).

The alert cell supplies lighting, ventilation, communications, restraint assistance, and an
external rescue path while the buried capsule is open. A ground observer confirms both pressure
boundaries and the jettison seam before releasing the aircraft for transfer.

### 5.2 Occupied-transfer rescue coverage

Closing the aircraft and removing the alert-cell bridge must not strand the pilot during the
**500–1,200 m** occupied transfer.

**PROPOSED BASELINE:** a compact powered rescue frame travels on a separate escort vehicle behind
the aircraft swept envelope. It carries the same three-point bridge datums, independent manual
outer-plug and pressure-hatch drives, couch rescue winch, escape-system safing interface,
pressure-equalisation and emergency-breathing connections, lighting, fire protection, and
litter-transfer interface defined in [51](51-crew-ingress-egress-and-rescue.md). It never rides on
or mechanically couples to the aircraft transporter.

The segregated route provides protected responder access and a level docking turnout at intervals
no greater than **100 m** and at every gate, bend, portal, and grade transition. On an emergency
command the transporter stops under fail-safe braking, energy and propulsion remain inhibited, the
route closes, and the escort frame approaches only after the aircraft is stable.

Before occupied transfer is authorised, a full-scale drill must demonstrate the planning
objectives of emergency communication/breathing connection within **60 seconds** of transporter
stop and couch-as-litter extraction through the normal opening within **180 seconds** in the
undamaged cold-aircraft case. Fire, smoke, hot structure, distortion, rollover, escape-system
uncertainty, or loss of route access require separately derived—and potentially shorter—tenability
limits. Failure to meet the applicable measured limit is a transfer inhibit, not a schedule waiver.

**OPEN / REQUIRED CLOSURE:** plug and hatch position/size; primary-structure interruption; pressure,
environmental and conductive seals; couch/sled guides and locks; fire/rescue access to an
incapacitated occupant; capsule jettison through the outer-plug clearance path; pilot extraction
with failed power or distortion; route-specific heat/smoke tenability; rescue-frame stability and
docking tolerance; and depot capsule removal. Until those close, the dual-boundary flush access
system is a ground-cycle baseline, not airframe geometry.

### 5.3 Start hall and exhaust

**PROPOSED BASELINE:** the engine starts only after the aircraft is seated on the shuttle in the
rear handling/start hall. A retractable test-cell-style exhaust hood couples to a fire-separated
rear plenum. Adjacent alert cells are isolated, and all boarding/service equipment is removed before
power rises above idle. A rear fire/exhaust shutter may close behind the staged aircraft; no door is
permitted ahead of a committed launch.

Normal gallery ventilation, pressure-relief plenums, and visual dust control do not automatically
size this engine-start system. Full thrust or augmentation inside the covered gallery is a distinct
thermal, pressure, noise, ingestion, fire, and personnel case.

**OPEN / REQUIRED CLOSURE:** the authored beat says “full augmentation” on launch and sets a 1.55
lever, while the constrained launch tick currently advances the engine at fixed `1.0`. Close one
physical schedule—idle, military, augmentation light, and handoff spool—then size the exhaust
collector, ventilation, fuel burn, holdback, and crew exclusion around that schedule. Do not let art
or prose decide ahead of the engine/kernel contract.

## 6. End-to-end operating cycle

The tables below are the **PROPOSED BASELINE** for worldbuilding, staffing, and future simulation.
Only the 9.4545 s stroke inside them is a closed time.

### 6.1 Recovery, arrestment, and strip clearance

| Elapsed from wire | Action | Owner |
| ---: | --- | --- |
| **0–4 s** | Arrestment to stopped state; crash/fire/rescue observes | arrestor / pilot |
| **0:04–1:30** | Engine idle/cut, wire de-tension, chocks, gear/hook pins, fire watch | recovery crew |
| **1:30–4:00** | Gun and drone-bay safe, ground power, leak/overheat walkaround | aircraft turn crew |
| **4:00–7:00** | Transporter captures all three gear points | transfer crew |
| **7:00–12:00** | Crab aircraft clear of strip to hot-return or quick-turn cell | transfer controller |

Target operating-surface closure is **12 minutes** after a normal trap. Launch and recovery lanes
are parallel, but cross-transfer temporarily sterilises both unless the final civil layout provides
a grade-separated or independently routed connection.

The deterministic arrestor profile gives scale, not certification. With all four drones gone and
600–1,000 lb fuel remaining, recovery mass is approximately **5,422–5,604 kg**:

| Wire speed | Kinetic energy | Deterministic-profile stop scale |
| --- | ---: | ---: |
| **155 kt / 79.74 m/s** | **17.2–17.8 MJ** | about **90–92 m / 2 s** |
| **88 m/s / 171 kt** | **21.0–21.7 MJ** | about **103–105 m / 2.1 s** |

Tyre/strut loads, hook dynamics, longitudinal attitude, human tolerance, wire geometry, and the
actual recovery mass distribution remain open even though the arrestor's 35 MJ rating is closed.

### 6.2 Nominal quick turn

| Elapsed in turn cell | Action |
| ---: | --- |
| **0–15 min** | Cool-down, telemetry download, FOD/inlet, tyre/gear/hook, leak and thermal inspection |
| **15–35 min** | Fuel to the 3,600 lb alert load and service cold-gas RCS |
| **25–50 min** | Load four-drone cassette and replenish 480-round ownship gun |
| **40–65 min** | FBW BIT, control sweep, gear/hook cycle, bay doors, TBCC/inlet health |
| **65–75 min** | Crew-chief independent inspection and release to alert cell |

Planning baseline is **75 minutes nominal** and **up to 120 minutes** after a full high-Mach thermal
cycle. A hard trap, over-temperature, inlet event, combat damage, or material load exceedance moves
the aircraft to quarantine for at least a **2–4 hour** inspection; actual inspection thresholds
must come from component qualification, not narrative sortie count.

Fuel and munition work overlap above only where the eventual explosive-safety case permits. If they
must be sequential, the turn time increases rather than the safety rule weakening.

### 6.3 Flight-ready alert to rail release

| Countdown | Action |
| ---: | --- |
| **T−15 to −11 min** | Alert-cell power-up; pilot boards buried capsule; restraints and flush hatches secure; BIT begins |
| **T−11 to −7** | Transporter moves aircraft to rear hall |
| **T−7 to −4** | Traverser aligns; aircraft seats in shuttle; nose link, main saddles, aft holdback, and umbilicals secure |
| **T−4 to −2** | Engine start; flight-control, gear, hook, bay, mass/CG, and fitting checks |
| **T−2 to −1** | Personnel clear; rear exhaust configuration; portal, bore, purge, pressure, fire, drainage, FOD, and shuttle interlocks |
| **T−1:40 to 0** | Launch energy becomes available; 90–100 MJ at the current 1–2 MW concept implies approximately 45–100 s ideal recovery |
| **T+0** | Holdback release / authoritative launch clock |
| **T+0–9.4545 s** | Closed constant-acceleration stroke |
| **T+9.4545 s** | Closed aircraft handoff; shuttle enters its future proved stopping sequence |

Baseline response from a flight-ready cell is **12–15 minutes**. A pilot-seated aircraft already
staged on the shuttle could leave in approximately **90–120 seconds**, but that concentrates an
aircraft, pilot, launcher, and charged plant at one aim point and should be an exceptional alert
posture rather than normal storage.

### 6.4 Lane reset

The following remains a planning sequence until §4.3 closes:

1. shuttle service brake / catcher: 10–20 s concept allowance;
2. protected return to rear hall: 60–90 s concept allowance;
3. energy recovery in parallel: 45–100 s ideal;
4. purge, FOD scan, rail/stator/brake inspection: approximately 2 min;
5. next pre-staged aircraft transfers only after the bore returns to a personnel-safe state.

A **4–5 minute** burst interval is a planning ambition, not a closed launcher rate. The one shuttle,
one bore, pressure purge, and inspection—not grid recharge alone—are likely to bind.

## 7. Crew

**PROPOSED BASELINE:** one immediate launch evolution uses approximately **19 people**:

| Team | People | Roles |
| --- | ---: | --- |
| Aircrew | 1 | pilot / occupant |
| Aircraft turn | 8 | crew chief; airframe/gear; propulsion/thermal; avionics/FBW; 2 armament/drone; 2 fuel/fireguard |
| Transfer | 3 | transporter operator; 2 wing walkers |
| Launcher | 3 | launch controller; power/motor operator; rail/shuttle technician |
| Crash/fire/rescue | 4 | strip, rear-hall, portal response |

Some roles can cover more than one aircraft between evolutions, but no staffing reduction may erase
independent release, fire watch, wing clearance, or launch-control functions. The one-occupant
aircraft reduces aircrew economics; it does not turn an electromagnetic launch lane into an
unattended appliance.

## 8. Safety and exclusion logic

### 8.1 Operational zones

**PROPOSED BASELINE:**

- **Bore red zone:** the entire 14 × 8 m flight envelope, service ledges, rear start hall, and shuttle
  pit are personnel-free whenever launch energy is available.
- **Rear exhaust zone:** the start hall is sealed from alert/turn cells; no transfer occurs during
  engine start or stroke.
- **Portal/ramp zone:** the full 86.14 m open arc, portal apron, drains, and side access are sterile
  from commitment until the shuttle is safe.
- **Departure zone:** the kernel's two-second terrain-clearance check is not a personnel or vehicle
  safety case. A site-specific clear fan and controlled airspace remain required.
- **Recovery zone:** the 1,200 × 48 m surface, wires, 180 m payout, overrun, and rescue access remain
  clear during an approach.
- **Fuel/ordnance zone:** fuel, ammunition, and drone work occur in separated turn cells, never in a
  launch-ready bore.
- **Hot-return zone:** a leaking, overheated, damaged, or hard-landed aircraft bypasses alert storage.

### 8.2 Launch interlocks

Before holdback release, require independent agreement on at least:

- aircraft identity, actual mass, CG/loading state, and fitting proof/seat loads;
- capsule hatches/pressure boundary and pilot restraint;
- flight controls, gear, hook, bay doors, engine and fuel;
- shuttle position, guideway, release, holdback, service brake, emergency catch, and return path;
- motor segments, storage, conversion, cooling, grounding, and fault energy;
- portal/departure path, bore-personnel count, egress doors, exhaust mode, ventilation, fire, smoke,
  pressure, visibility, drainage, flood level, and FOD;
- terrain and first-two-second departure clearance;
- recovery-strip conflict and controlled airspace.

Independent hardwired safety functions own energy dump, motor inhibit, holdback, shuttle brake, and
portal-clear status beneath supervisory software.

## 9. Degraded and emergency handling

### 9.1 Before launch commitment

**PROPOSED BASELINE:** any interlock disagreement leaves the aircraft mechanically restrained.
Inhibit motor segments, dump or isolate launch-available energy, return the engine to idle, ventilate,
and either repair in place under full isolation or return the aircraft to quarantine. No launch
schedule overrides a red interlock.

### 9.2 After holdback release

**OPEN / REQUIRED CLOSURE:** the present kernel has no launcher-failure model or high-speed abort
envelope. After release, the normal intent is continue-to-flyaway using isolatable motor segments.
An emergency stop is allowed only if a proved predictor shows that the combined aircraft/shuttle can
stop inside the available guideway and structural/occupant limits. The safe-stop/continue decision,
commit point, redundant-segment performance, passive braking, and pilot escape response require
multibody, electrical, thermal, and human-factors analysis.

### 9.3 Failed aircraft release or shuttle braking

- Dual release channels and independent separation sensing are required.
- A failed command must not rely on presentation software or a single powered actuator.
- The separate aft holdback must already be clear before launch-link release.
- Regenerative/eddy-current service braking requires an independent friction/emergency catch.
- A shuttle brake or return failure blocks the lane; the next aircraft remains in its alert cell.

The physical failed-release and shuttle-runout responses remain open until §4.3 closes.

### 9.4 Fire, flood, and power loss

- Pre-commit: holdback retained, motor inhibited, launch energy dumped/isolated.
- Engine or fuel fire: rear exhaust and emergency smoke modes, compatible bore suppression, pilot
  extraction through the flush capsule-access route using the fixed bridge or escorted mobile
  rescue frame, and quarantine-cell response.
- Flood high-high: launch inhibit, essential pumps, portal interceptor drain, and no attempt to
  “power through” water over the precision guideway.
- Loss of site power: essential controls, lighting, communications, egress and energy isolation
  survive; launcher availability does not.

These provisions inherit the conceptual fire, drainage, and egress basis in
[82 — Launch-gallery engineering basis](82-launch-gallery-engineering-basis.md); exact capacities
remain site-specific.

### 9.5 Recovery degradation

**Recovery-energy rule:** kinetic energy is \(½mv²\). Against the closed 35 MJ rating:

| Condition | Energy / limiting mass |
| --- | ---: |
| Alert mass 8,222.93 kg at 88 m/s | **31.84 MJ** |
| Design gross 11,090 kg at 88 m/s | **42.94 MJ — exceeds rating** |
| Maximum mass at 88 m/s | approximately **9.04 t** |
| Maximum mass at 155 kt / 79.74 m/s | approximately **11.0 t** |

Therefore recovery speed and mass must be one coupled envelope. A heavy aircraft reduces speed,
releases or diverts with stores only under a safe doctrine, or uses a higher-capability alternate;
the arrestor does not gain energy because an aircraft needs it.

**OPEN / REQUIRED CLOSURE:** three current speed statements disagree:

- Rapier Circuits kernel target: **155 KTAS**;
- Circuits UI language: approximately **165 kt**;
- intercept final director: **88 m/s / approximately 171 kt**;
- generic touchdown grading ceiling: **82 m/s / approximately 159 kt IAS**.

Select the canonical Rapier wire speed, define IAS/TAS use, close the maximum recovery mass and
approach configuration, and update kernel, guidance, UI, arrest analysis, and documentation
together.

Other recovery cases:

- **Bolter / hook miss:** climb and re-enter if fuel and flight controls permit; otherwise divert.
- **Hook or gear unsafe:** divert to a qualified longer runway or purpose-designed barrier/belly
  lane; the current 1,200 m strip has no closed conventional-stop claim.
- **Arrestor energy, runout, or line-load failure:** far-end overrun/barrier and rescue response are
  required; the current simulation preserves residual speed but the site does not yet close the
  catcher.
- **Hard trap / thermal or battle damage:** transporter to quarantine, not an alert cell.
- **Primary strip unavailable:** no launch without a reachable alternate arresting surface and
  protected reserve.

The live intercept currently treats a bolter as an ended attempt, while the seed FMECA describes
reserve consumption and circuit training. Operational doctrine and game lifecycle must choose one
truth.

## 10. Throughput and real bottlenecks

The ideal 45–100 s electrical recharge is not the whole sortie rate. Expected lane bottlenecks are:

1. unresolved shuttle stop, catch, and return;
2. one bore and one captive shuttle;
3. bore purge, FOD and rail/stator inspection;
4. cross-transfer conflict between recovery surface and rear hall;
5. high-Mach CMC/inlet thermal inspection;
6. four-drone 1,440 kg cassette handling;
7. one recovery strip and an unclosed alternate network;
8. fire/flood isolation that can close the complete lane.

**PROPOSED BASELINE planning rates:**

- first flight-ready-cell alert to airborne: **12–15 min**;
- exceptional jet already staged and crewed: **90–120 s**;
- following pre-staged launches: **4–5 min ambition**, not closed;
- normal aircraft quick turn: **75–120 min**;
- abnormal inspection: **2–4 h minimum**, then condition-based.

One launcher does not justify parking multiple aircraft in or beside its gallery. Queue aircraft in
separate alert cells and accept that lane availability, not ramp density, sets output.

## 11. Simulation and presentation boundary

The live `CatapultLaunchModel` has only `None`, `Stroke`, and `Airborne`. `SimulationSession.Begin`
places a staged aircraft directly into the stroke, and the Circuits relaunch path can move a stopped
aircraft immediately back to the catapult. That is a bounded flight-game abstraction, not evidence
that the transfer machinery is instantaneous.

Future ground-cycle states should be explicit:

```text
SHELTERED
  → SERVICING
  → ALERT_READY
  → TRANSFER
  → SHUTTLE_STAGED
  → BORE_CLEAR
  → ENERGY_ARMED
  → STROKE
  → AIRBORNE
```

Return:

```text
APPROACH
  → WIRE
  → STOPPED
  → SAFE
  → TRANSFER
  → HOT_RETURN
  → SERVICING
```

The 75-minute physical turn need not run in wall-clock gameplay. A deterministic Ready sequence can
compress it, but must not confuse `STOPPED` with `SHUTTLE_STAGED`, put personnel in a charged bore,
or hide the 9.4545 s authoritative stroke behind a cinematic.

Production art must show the selected shuttle/tow interface and preserve the visual-truth contract
in [82](82-launch-gallery-engineering-basis.md): mechanical support rather than levitation, distinct
guide rails and motor stators, clean drainage/FOD control, service systems, restrained dust, and no
door ahead of a committed aircraft. The current sparse vicinity remains valid; alert cells,
operational transfer route, rear hall, transporter, and hot-return choreography are follow-on
facility content.

## 12. Required closure register

| Priority | Finding | Required owner/result |
| --- | --- | --- |
| **P0** | Shuttle has no physical post-release stopping/runout path | launcher + civil + kernel topology |
| **P0** | Aircraft/shuttle/holdback ICD absent | gear stations, fittings, loads, release, proof |
| **P0** | Full-augmentation prose conflicts with fixed `1.0` constrained engine tick | canonical launch throttle/spool and exhaust case |
| **P0** | Rapier recovery-speed statements disagree | canonical speed, maximum recovery mass, arrest analysis |
| **P1** | Wheel/strut/tyre/steering/tow geometry remains provisional | landing-gear and transporter ICD |
| **P1** | Buried-capsule ingress/rescue/jettison seam unclosed | airframe + crew + rescue ICD, no OML bump |
| **P1** | No far-end recovery barrier/overrun or alternate-strip network | basing and recovery doctrine |
| **P1** | Launch FMECA lacks motor, holdback, release, brake, portal, fire, flood, and power rows | [90 — Failure modes](90-failure-modes.md) expansion |
| **P1** | Existing art has no shuttle, transporter, alert cell, rear hall, or hot-return cycle | facility presentation package |
| **P2** | Circuits teleports stopped aircraft to catapult; intercept bolter ends attempt | explicit game abstraction or new lifecycle states |
| **P2** | Alert-cell/support-area count is not separately costed | [95 — Cost ledger](95-cost-ledger.md) update |

## 13. Epistemic

**CLOSED:** aircraft length, span and masses, no-cockpit-bump buried-capsule direction, gallery/rail
geometry, launch timing, lane offset, recovery-surface dimensions, and arrestor rating. Aircraft
height and landing-gear pose are explicitly not closed.

**PROPOSED BASELINE:** four individual alert cells, quick-turn and quarantine cells, rear
handling/start hall, 15 t omnidirectional transporter, 12 m transfer route, captive three-point
shuttle, separate aft-keel holdback, flush paired capsule access, staffing, and the timed ground
cycle.

**OPEN / REQUIRED CLOSURE:** detailed gear and capsule geometry, shuttle stop/return, release and
holdback proof, engine throttle/exhaust schedule, recovery speed/mass, launcher aborts, far-end
recovery, alternate strips, safety distances, fire/flood capacities, qualified turnaround tasks,
facility protection, cost, and full ground-failure simulation.
