# 82 — Launch-gallery engineering basis

← [80 — Basing and ground](80-basing-and-ground.md) · Next: [90 — Failure modes](90-failure-modes.md)

> **Conceptual basis of design only.** This is a low-definition systems study for keeping the
> fictional Rapier installation, its live simulation, and its presentation mutually coherent. It
> is **not construction-ready**, is **not a safety case**, and is **not a bid or a location-specific
> estimate**. No structural member, reinforcement schedule, fire strategy, electrical protection
> scheme, vent area, drainage capacity, or military-protection claim in this chapter is suitable
> for construction without qualified geotechnical, civil, structural, mechanical, electrical,
> fire, aviation, environmental, and explosive-safety design.
>
> Burial reduces visual exposure and can improve fragmentation protection. It does **not** make the
> launcher crater-proof. Portal attack, ground shock, progressive collapse, flooding, power loss,
> blocked egress, shuttle failure, and repair under fire remain open hazards.

This chapter is the durable basis for the gallery as a system. The live geometry and timing are
closed interfaces; the proposed civil works, launch machinery, utilities, cost, and generated
presentation plate are explicitly conceptual. The dated study
[`2026-07-26-buried-launch-tube-and-the-ukraine-theatre.md`](../../2026-07-26-buried-launch-tube-and-the-ukraine-theatre.md)
is useful design history, but its 150 m/s, 360 m + 160 m, 6.93 s, 88.3 MJ, and ~50,000 m³ values
are superseded.

## 1. Status vocabulary

| Tag | Meaning here |
| --- | --- |
| **closed live interface** | A value currently fixed by the deterministic kernel or its staged mission. Preserve it unless the kernel and all consumers are deliberately changed together. |
| **derived live value** | Arithmetic from closed live values. Recalculate if mass, speed, stroke, or ramp geometry changes. |
| **concept basis** | A physically reasoned starting point for later engineering, not a released design. |
| **fiction** | Narrative siting, threat, doctrine, or future technology; never evidence that the installation is feasible. |
| **open finding** | Measurement, analysis, qualification, or design work still required. |

The calculation basis uses SI units internally. Rounded display values do not replace the live
constants.

## 2. Closed live contract

### 2.1 Geometry and siting interface

| Quantity | Live value | Status and authority |
| --- | ---: | --- |
| Rail stroke | **520.00 m** | **closed live interface** — `Doctrine.Beats.RapierIntercept` / `CatapultLaunchModel` |
| End rail-relative speed | **110.00 m/s** (213.82 kt) | **closed live interface** |
| End ramp angle | **12.00°** | **closed live interface** |
| Ramp normal-acceleration geometry constant | **3.00 g** | **closed live interface** — sets radius; it is not a complete structural reaction calculation |
| Ramp radius | **411.29 m** | **derived live value**, \(R=v^2/(3g)\) |
| Flat, covered rail | **433.86 m** | **derived live value** |
| Open ramp arc | **86.14 m** | **derived live value** |
| Ramp rise | **8.99 m** | **derived live value** |
| Horizontal rail travel | about **519.37 m** | **derived live value**; arc length is not horizontal length |
| Gallery clear envelope | **14 m wide × 8 m high** | **closed presentation/aircraft-clearance interface**; not a closed structural section |
| Rapier span | **7.35 m** | **closed live interface** |
| Nominal aircraft frontal area | about **3 m²** | **surrogate** used only for blockage screening |
| Nominal blockage | about **2.7%** of a 112 m² rectangular clear envelope | **derived screening value**; final arch shape requires CFD geometry |
| Rail-head height above slab | **0.15 m** | **closed live interface** |
| Aircraft support-reference height | **0.85 m** | **provisional aircraft-side interface**, shared with recovery |
| Slab datum | **192.0 m MSL** | **closed fiction siting** over the current atlas survey |
| Minimum surveyed construction separation | **1.0875 m** | **closed fiction siting**; not a geotechnical clearance |
| Launch-lane lateral offset | **−70 m** from recovery centreline | **closed live interface** |
| Recovery operating surface | **1,200 m × 48 m**, heading west | **closed live mission interface** |

The kernel geometry is in `sim/Carrier.cs`; the installation datums are in
`sim/RapierLaunchSite.cs`; mission values are in `sim/Doctrine/Beats.cs`. Aircraft-side launch and
mass interfaces are summarised in [70 — Landing gear, arrest](70-landing-gear-arrest.md) and
[40 — Mass and CG](40-mass-and-cg.md).

The 14 m × 8 m value is a required **clear envelope**, not permission to infer wall thickness,
reinforcement, crown shape, service clearances, or excavation width from the current procedural
mesh. The mesh in `web/wwwroot/render/scene/scene_builders.js` is presentation art, not an IFC
model or construction drawing.

### 2.2 Exact timing and distance law

The live launcher uses constant tangential acceleration from rest:

```text
a = v² / (2L) = 110² / (2 × 520) = 11.634615 m/s² = 1.18639 g
T = 2L / v = 1,040 / 110 = 9.454545 s
x(t) / L = (t / T)²
v(t) / v_end = t / T = sqrt(x / L)
```

| Event | Distance progress | Authoritative elapsed time |
| --- | ---: | ---: |
| Clock release / stroke begins | 0.000000 | **0.0000 s** |
| Current portal-light cue begins | 0.580000 | **7.2004 s** |
| Flat gallery ends / open ramp begins | 0.834346 | **8.6360 s** |
| Rail handoff | 1.000000 | **9.4545 s** |
| Open-ramp interval | 0.834346–1.000000 | **0.8185 s** |

Distance progress is quadratic in time. A video, audio cue, loader, or test that treats
`catapult_progress` as linear time is wrong. The browser snapshot currently publishes progress and
speed but not elapsed time, duration, phase, or a launch-sequence identifier; §13.6 defines the
additional presentation contract required before a generated plate can ship.

The gallery must never wait for terrain, video, audio, shader compilation, or network delivery.
The deterministic kernel hands off at 9.4545 s. Presentation degrades or falls back; authoritative
time never stretches.

### 2.3 Live mass, energy, force, and guideway loads

The alert mission carries the four-cell design bay and **3,600 lb** fuel:

```text
fuel-free mass = 6,590.000000 kg
alert fuel      = 3,600 lb × 0.45359237 = 1,632.932532 kg
alert mass      = 8,222.932532 kg
design gross    = 11,090.000000 kg
```

| Quantity | Alert mission, 8,222.93 kg | Design gross, 11,090 kg | Status |
| --- | ---: | ---: | --- |
| Kinetic energy at 110 m/s, \(½mv²\) | **49.749 MJ** | **67.095 MJ** | derived live |
| Ramp potential-energy rise, \(mgh\) | **0.725 MJ** | **0.978 MJ** | derived live |
| Inertial tow force on flat, \(ma\) | **95.67 kN** | **129.03 kN** | derived live |
| Grade force at 12°, \(mg\sin 12°\) | **16.77 kN** | **22.61 kN** | engineering derivation |
| End-ramp tow before drag/losses | **112.44 kN** | **151.64 kN** | concept machinery basis |
| End-ramp mechanical power | **12.37 MW** | **16.68 MW** | concept machinery basis |
| End-ramp guideway reaction, \(m(v²/R+g\cos12°)\) | **320.8 kN** | **432.6 kN** | concept structural basis |

The kernel's 3 g ramp constant is the geometric centripetal acceleration at end speed. The physical
guideway reaction also carries gravity; conversely, actual detailed loads depend on shuttle mass,
wheelbase, load sharing, rail irregularity, vibration, aerodynamic lift, restraint geometry, and
transients that the kernel does not model. For preliminary machinery layout, use at least:

- **160 kN longitudinal service load** before shuttle, drag, and dynamic allowances;
- **450 kN vertical service reaction** before shuttle and local load distribution;
- a preliminary **1.5 ultimate multiplier**, giving approximately **240 kN longitudinal** and
  **675 kN vertical**, until formal load combinations replace it.

These are system-sizing placeholders, not allowable loads or structural certification values.
Changing the number of stowed drones or fuel changes launch mass; machinery must be designed to
the controlled maximum launch condition, not only the current alert sortie.

## 3. Civil and structural concept basis

### 3.1 Cross-section and earthworks

Use a reinforced-concrete cut-and-cover box or horseshoe gallery with the **14 m × 8 m clear
aircraft envelope held inviolate**. Cut-and-cover means excavating a trench, constructing the
concrete structure, waterproofing it, and replacing cover; the
[FHWA Technical Manual for Design and Construction of Road Tunnels](https://www.fhwa.dot.gov/bridge/Tunnel/pubs/nhi09010/tunnel_manual.pdf)
is the primary civil analogue, not a claim that a launch gallery is a road tunnel.

Concept section:

- 14.0 m minimum clear width across the aircraft envelope;
- 8.0 m minimum clear height above the controlled support/rail datum;
- 0.8–1.2 m preliminary base slab;
- 0.6–0.9 m preliminary walls and crown;
- central precision rail plinth structurally and thermally separated where analysis requires;
- service/egress routes, drainage, cable, cooling, and fire systems outside the flight-clearance
  envelope;
- 1.5–2.5 m preliminary protected soil cover above the waterproofed crown;
- shaped visual berm crest about 10–11 m above slab, depending on final grading.

Wall, crown, and slab ranges are only quantities for planning. Groundwater, soil/rock modulus,
seismicity, settlement, hydrostatic uplift, blast demand, portal geometry, construction support,
and progressive-collapse analysis must set the real section.

An 18 m wide × 11 m deep × 433.86 m working envelope is about **85,900 m³** before portals,
dewatering sumps, the open ramp, slopes or temporary support, and contractor working room.
Accordingly:

| Quantity | Concept planning range |
| --- | ---: |
| Excavation and handled material | **90,000–120,000 m³** |
| Structural concrete including shell, invert, portal, ramp, and rail plinth | **16,000–25,000 m³** |
| Covered structural bays | about **29–44**, using 10–15 m pour/joint spacing |

The old ~50,000 m³ figure is approximately a clear-void-scale intuition, not a defensible
earthworks quantity.

### 3.2 Structure and protection

- Design the gallery as 10–15 m construction bays with waterstopped movement/control joints.
- Analyse soil-structure interaction, differential settlement, uplift, fatigue from repeated
  launches, stator magnetic forces, shuttle dynamics, portal stress concentrations, and
  temperature gradients.
- Separate precision guideway alignment from noncritical floor tolerances.
- Provide alignment monuments at every structural bay and across every movement joint.
- Keep penetrations out of highly stressed crown regions or reinforce them explicitly.
- Use sacrificial, replaceable portal and vent-outlet elements where the threat analysis supports
  them.
- Put switchgear, flywheels, converters, pumps, and control rooms in fire-rated side cells rather
  than under the aircraft path.
- Do not put a fast-closing pressure or blast door across the committed high-speed launch path.

The [UFC 4-420-01 buried-structure guidance](https://www.wbdg.org/FFC/DOD/UFC/ufc_4_420_01_2025.pdf)
is a useful primary analogue for protected membrane, soil-cover moisture control, subsurface
perforated drains, filter fabric, and internal perimeter drainage. Its magazine criteria do not
automatically qualify this geometry for aircraft launch or a specified weapon effect.

## 4. Guideway, shuttle, and electromagnetic launch machinery

The real-world architecture anchor is the US Navy's electromagnetic aircraft-launch work:
[NAVAIR describes EMALS](https://www.navair.navy.mil/product/Electromagnetic-Aircraft-Launch-System-EMALS)
as stored energy, solid-state conversion, launch control, and electromagnetic acceleration;
[NAVAIR's shared-system test account](https://www.navair.navy.mil/node/19951) describes a shuttle
propelled by linear motors. Rapier is not EMALS, and naval hardware dimensions, duty cycle,
qualification, and prices cannot be copied directly into this fictional land system.

Concept machinery:

1. Two mechanically load-bearing guide rails control vertical, lateral, pitch, and yaw motion.
2. Segmented linear induction or linear synchronous stators provide longitudinal thrust only.
3. A captive shuttle couples to a dedicated aircraft launch fitting or belly cradle.
4. A positive holdback carries pre-launch thrust and releases only after all interlocks agree.
5. Segments energise only around the shuttle to limit losses and fault energy.
6. Redundant position/velocity sensing closes the motor-control loop independently of presentation.
7. Regenerative or eddy-current service braking stops the shuttle after aircraft separation.
8. An independent friction/emergency catch arrests a failed service stop.
9. A protected return system and rear maintenance hall recover the shuttle without blocking the
   flight envelope.

Calling the system “maglev” in presentation is misleading: the current basis uses electromagnetic
propulsion and **mechanical support**, not levitation.

The aircraft/shuttle coupling, release proof load, pitch articulation, failed-release response,
launch-abort envelope, wheel/cradle load distribution, and post-release shuttle trajectory are
**open findings**. The live sim models none of these mechanisms.

## 5. Power, stored energy, and cooling

A NAVAIR ground-test article demonstrated a **60 MJ, 60 MW** motor-generator module
([primary NAVAIR report](https://www.navair.navy.mil/node/9926)). That is evidence that pulsed
electromagnetic launch storage is real, not a unit-for-unit Rapier selection. Rapier's much longer
9.45 s stroke needs less peak power than a carrier catapult but still needs controlled high-energy
storage.

Concept electrical basis:

| Item | Concept basis |
| --- | ---: |
| Maximum aircraft kinetic energy | 67.10 MJ |
| Maximum ramp potential energy | 0.98 MJ |
| Preliminary bus-to-shuttle efficiency | 80–90% assumption |
| Usable stored energy | **90–100 MJ** |
| Motor/converter peak capability | **22–25 MW** |
| Nominal recharge connection | **1–2 MW** |
| Ideal energy-recovery interval | approximately **45–100 s**, before thermal and readiness constraints |

The 90–100 MJ basis covers design-gross kinetic and potential energy, indicative drag/rolling loss,
conversion loss, and operating reserve. It is not a closed launcher rating.

Preferred arrangement:

- two or more independently isolatable flywheel or supercapacitor modules;
- energy storage in separate contained cells with rotor-burst/fire separation and vibration
  isolation;
- medium-voltage incoming service, protected rectification/DC link, segmented inverters, dump
  load, grounding, arc-flash protection, and black-start/essential-control supply;
- closed-loop deionised water/glycol circuits for stators, converters, and braking hardware;
- external dry coolers or buried heat rejection positioned so exhaust heat and noise do not
  contaminate the portal;
- flow, temperature, pressure, conductivity, insulation-resistance, vibration, and leak
  monitoring.

Assuming roughly 5–15 MJ of losses per design shot, a **100–300 kW** burst-sortie heat-rejection
allowance is reasonable for layout. Real efficiency, shot cadence, ambient design day, redundancy,
cooldown rules, and fault heat must close the plant.

## 6. Pressure relief, ventilation, dust, and air quality

The large bore rejects the old vacuum-tube idea. A 3 m² aircraft moving at 110 m/s displaces a
screening-scale **330 m³/s**, but the 112 m² nominal clear section, open portal, leakage, and
distributed relief prevent a close-fitting piston condition. This transient displacement is not a
fan sizing value.

Concept arrangement:

- paired baffled relief plenums at roughly **40 m** intervals, about ten or eleven stations over the
  covered run;
- preliminary combined effective relief area **20–40 m²**, held as a CFD trade rather than a
  requirement;
- low-velocity filtered normal supply from the rear/service end;
- distributed extraction for standby, engine exhaust, post-launch purge, and maintenance;
- a distinct reversible/emergency smoke-control mode;
- pressure, differential-pressure, airflow, visibility, CO, NOx, temperature, and fire sensing;
- louvres, FOD screens, settlement chambers, dust traps, and paved/vegetated outlet aprons.

The [FHWA tunnel manual](https://www.fhwa.dot.gov/bridge/Tunnel/pubs/nhi09010/tunnel_manual.pdf)
requires ventilation to be resolved for normal air quality and fire/smoke conditions and uses
modelling/CFD as part of design. Apply that systems discipline here while deriving aircraft-specific
contaminants, launch transients, and egress criteria separately.

Visual dust should be a small residual flow leaving pressure-relief outlets and the portal. A large
cloud inside the gallery would be a FOD and inlet-ingestion failure, not spectacle.

## 7. Fire, life safety, and launch interlocks

This gallery combines fuelled aircraft, hot machinery, very high stored electrical energy, a
confined enclosure, and a single large portal. A road-tunnel analogy is insufficient by itself, but
the [FHWA ventilation/fire systems research](https://www.fhwa.dot.gov/bridge/tunnel/tunres2.cfm)
is a useful primary integration reference.

Concept provisions:

- at least two protected egress/service routes where layout permits;
- refuge/control rooms outside the flight bore;
- fire-rated separation of energy stores, converters, pumps, cooling, and control equipment;
- zoned optical/thermal/flame detection;
- compatible fixed suppression for equipment rooms and spill/fire control in the bore;
- emergency lighting, low-level route marking, communications, breathing-air/refuge policy, and
  responder access;
- emergency exhaust and smoke stratification analysis;
- fuel-spill isolation from electrical and drainage rooms;
- fail-safe energy dump, holdback, motor inhibit, shuttle brake, and portal-clear interlocks;
- independent hardwired safety functions beneath supervisory software.

Before commitment, an abort should leave the aircraft restrained and dissipate stored energy
safely. After the defined commitment point, the launch path must stay clear and the system must
complete a controlled launch or execute a specifically analysed high-speed abort. Neither sequence
is closed in the current simulation.

## 8. Waterproofing and drainage

Concept water-management train:

1. crown membrane, protection board, and inspectable termination details;
2. geocomposite perimeter drainage outside walls and below the invert where hydrogeology permits;
3. waterstopped construction, movement, and penetration joints;
4. 0.5–1% interior crossfall away from the precision guideway;
5. continuous slot drains outside the shuttle/aircraft envelope;
6. silt and sand traps followed by oil/fuel separation;
7. redundant duty/standby sump pumps on essential power;
8. level alarms, independent high-high flood trip, check valves, and backflow isolation;
9. a portal interceptor drain so the open ramp cannot funnel storm runoff into the gallery;
10. maintainable inspection points and provision for pump replacement without closing every
    drainage path.

The [FHWA tunnel manual](https://www.fhwa.dot.gov/bridge/Tunnel/pubs/nhi09010/tunnel_manual.pdf)
identifies pipes/channels, sumps, pumps, and oil separation as an integrated tunnel drainage system.
The exact storm, groundwater, spill, firewater, freeze, and power-loss cases are site-specific open
findings.

## 9. Maintainability and instrumentation

- Make stator, rail, sensor, cable, and coolant modules removable in bounded cassettes.
- Provide equipment alcoves at the 40 m relief/service rhythm without intruding into clearance.
- Use an overhead monorail/gantry or protected side service cart for heavy module replacement.
- Provide a rear shuttle hall, inspection pit, lifting points, safe energy isolation, and a
  component route to grade.
- Survey rail position at every structural bay and monitor relative movement across joints.
- Instrument rail strain, bearing load, stator temperature, insulation, coolant, vibration,
  settlement, water ingress, pump state, vent pressure, and shuttle braking.
- Keep flight-operational telemetry separate from presentation telemetry, but time-correlate both
  with the authoritative launch-sequence identifier.
- Set inspection intervals from measured load/temperature cycles rather than a narrative sortie
  count.

No service task should require personnel in the bore while stored launch energy is available.

## 10. Concept construction and commissioning sequence

1. **Site definition:** survey, legal/environmental constraints, geotechnical and hydrogeological
   investigation, contamination/UXO survey, threat and aviation-surface studies.
2. **Temporary works:** access, utilities, runoff control, dewatering, monitoring, and sloped,
   soldier-pile, secant-pile, diaphragm-wall, or other engineered excavation support.
3. **Invert preparation:** formation proofing, ground improvement if required, subdrainage,
   blinding, waterproofing, uplift provisions, and embedded earthing.
4. **Structural shell:** base, walls, and crown in 10–15 m bays with controlled joints and
   waterstops.
5. **Embedded systems:** service penetrations, drainage, relief plenums, equipment cells, cable and
   cooling routes, egress, and fire separations.
6. **Precision plinth:** isolated survey control, rail/stator plinth pours, curing, and first
   alignment.
7. **Portal and ramp:** open-cut ramp, headwall, interceptor drainage, erosion/FOD control, and
   recovery-surface separation.
8. **Machinery:** rails, stators, shuttle, holdback/release, braking, return system, sensors,
   storage, converters, cooling, ventilation, fire, and controls.
9. **Envelope closure:** crown membrane test, protection, perimeter drains, staged backfill,
   settlement monitoring, berm shaping, outlets, service roads, and landscaping.
10. **Static commissioning:** pressure tests, electrical insulation, earthing/protection,
    interlocks, pumps, smoke control, cooling, alignment, and fail-safe tests.
11. **Progressive dynamic commissioning:** instrumented shuttle-only runs, low-energy dead loads,
    increasing-energy dead loads, abort/braking cases, thermal repetition, and full-design-energy
    proof programme.
12. **Aircraft clearance and flight trials:** only after independent civil, machinery, electrical,
    fire, operational, and airworthiness acceptance.

## 11. Class 4/5 conceptual cost basis

This is an early parametric/unit-cost estimate in constant **2026 USD**. The
[USACE Cost Engineering Regulation ER 1110-2-1302](https://www.publications.usace.army.mil/Portals/76/Publications/EngineerRegulations/er_1110-2-1302.pdf)
is the primary methodology anchor: use a consistent price level, document assumptions, and derive
contingency from risk as design matures. The rates below are project planning assumptions, not
quoted Ukrainian, US, or contractor rates.

Exclusions: land, aircraft, weapon systems, off-site generation and transmission, financing,
taxes/duties, owner programme staff, environmental remediation, unexploded ordnance removal,
extraordinary rock or groundwater, combat hardening to a defined threat, wartime logistics,
currency escalation after 2026, and operations.

| Direct element | Quantity/rate or basis | 2026-USD range |
| --- | --- | ---: |
| Excavation, support, haul, dewatering | 90–120k m³ at roughly $50–150/m³ equivalent | **$5–18M** |
| Reinforced-concrete shell, invert, portal, ramp, plinth | 16–25k m³ at roughly $900–1,800/m³ installed | **$14–45M** |
| Waterproofing, drainage, backfill, portal/ramp civil works | systems allowance | **$15–35M** |
| Guideway, segmented motor, shuttle, holdback, release, braking, return | novel custom machinery | **$25–60M** |
| Energy storage, converters, substation, protection, cooling | 90–100 MJ / 22–25 MW concept | **$20–55M** |
| Ventilation, fire/life safety, controls, instrumentation, maintenance plant | systems allowance | **$12–30M** |
| **Direct gallery/catapult subtotal** | arithmetic range | **$91–243M** |
| Design, testing, commissioning | 15–25% of direct works | **$14–61M** |
| Risk contingency | 30–50% of direct works at this definition | **$27–122M** |
| **Gallery/catapult planning range** | rounded Class 4/5 study total | **$130–430M** |

The midpoint assumptions give roughly **$265–270M**. Summing every optimistic or pessimistic bound
is not a probability model; proper quantitative risk analysis should replace the range.

For a complete basing lane, provisionally add **$60–220M** including burden for the 1,200 m recovery
surface, 35 MJ arrestor installation, revetments, roads, security, utilities, and support areas.
That puts the whole-lane conceptual range at approximately **$190–650M** before exclusions. The
[DoD Facilities Pricing Guide](https://www.wbdg.org/dod/ufc/ufs-3-701-01) can provide a consistent
future price-level framework, but it does not price this novel launcher.

For scale only, Navy budget material prices multi-catapult EMALS installations with shared ship
infrastructure; it is not a one-lane analogue and must not be divided into a Rapier unit rate
([FY2022 Navy shipbuilding budget book](https://www.secnav.navy.mil/fmc/fmb/Documents/22pres/SCN_Book.pdf)).

## 12. Visual truth contract

The gallery should look buildable enough that its fiction is legible. Production art must show:

- a 14 m × 8 m clear flight envelope;
- 10–15 m structural-bay/joint rhythm and the current 10 m visual rib cadence;
- two mechanically load-bearing guide rails and segmented motor stators;
- a visible shuttle/tow interface rather than a hovering aircraft;
- shielded warm maintenance lamps, not generic neon;
- cable trays, coolant pipes, equipment cabinets, isolation points, and numbered service bays;
- drainage crossfall, slot gutters, silt traps, sumps, and a clean FOD-controlled floor;
- baffled pressure-relief plenums at the 40 m service rhythm;
- emergency route markers, fire points, inspection access, and alignment monuments;
- a portal interceptor drain, realistic headwall, open ramp, service track, vent outlets, low
  grassed berm, revetments, and shelterbelt outside.

Do not show:

- an evacuated tube, vacuum door, or door closing across a committed launch;
- levitating “maglev” support;
- purple lightning, uncontrolled arcs, or celebratory pyrotechnics;
- a large internal dust cloud or debris crossing the intake;
- an impossibly thin concrete shell, inaccessible machinery, or drains that terminate nowhere;
- a real military unit, exact real installation, casualty, flag, insignia, or target claim;
- a baked HUD, speed, radio subtitle, aircraft silhouette, or gameplay contact in generated media.

## 13. Hybrid generated-plate contract

### 13.1 Policy gate

The accepted [ADR-0003](../../adr-0003-ghibli-adjacent-world-presentation.md) permits generated
imagery as reference/vibe material and explicitly defers generated runtime cutscenes. Therefore a
generated launch plate **cannot ship under the current ADR**. It requires:

1. a new accepted ADR or explicit amendment covering generated runtime media and rights review;
2. a versioned `video`/`cinematic` asset contract and validator extension, because
   `content/schemas/asset-manifest.schema.json` currently has no video kind;
3. production provenance, safety, visual, performance, fallback, and replay acceptance.

The generated media remains presentation-only. It cannot alter the deterministic kernel, camera
truth after the crossfade, HUD projection, input, audio, radio, warnings, streaming priority, or
handoff.

### 13.2 Authoritative shot timing

Use one continuous forward plate for only the repetitive middle of the covered gallery:

| Launch elapsed | Progress | Required presentation |
| --- | ---: | --- |
| **0.000–0.650 s** | 0.000–0.00473 | **Live renderer.** Power-on, first lamps, live clearance/readback, almost no travelled distance. |
| **0.650–4.800 s** | 0.00473–0.25775 | Generated plate may fade to opaque. Rigid forward camera; physically increasing rib cadence; restrained vibration. |
| **4.800–7.200 s** | 0.25775–0.57994 | Generated plate. Portal grows from a small daylight source; pressure-relief light and fine outward dust increase. |
| **7.200–8.5667 s** | 0.57994–0.82100 | Crossfade plate to the already-running live renderer. |
| **8.5667–8.636 s** | 0.82100–0.83435 | **Fully live** before the flat-to-ramp boundary. |
| **8.636–9.455 s** | 0.83435–1.00000 | **Fully live.** Portal, open ramp, real terrain/sky, 12° pitch, authoritative handoff. |
| **9.455–10.655 s** | — | **Fully live.** FX tail only; airborne/control radio and pilot control remain authoritative. |

The media interval maps as:

```text
plate_start_launch_s = 0.650
plate_end_launch_s   = 8.566667
plate_duration_s     = 7.916667
plate_media_time_s   = clamp(catapult_elapsed_s - 0.650, 0, 7.916667)
```

The plate may be fully opaque only after its first live alignment fade and before the 7.2 s
crossfade. If performance work suppresses expensive WebGL draws under an opaque plate, scene and
streaming updates must continue, and full draws must resume by **7.0 s** so no shader compile,
texture upload, or terrain build occurs at the portal.

An exterior establishing shot is allowed only in `Ready`, before authoritative clock release. The
current click begins the stroke immediately; hiding part of the stroke behind an exterior cut is
not accepted. A longer ritual requires a future explicit `LAUNCH_ARMED` state, not a video-imposed
delay.

### 13.3 Exact content to generate

Capture an authoritative no-HUD, no-audio reference render and per-frame camera/launch trace from
the exact target build at constant 60 fps. Use renderer frames, depth/edge guidance where supported,
and this content brief:

> **Original fictional 2040 dispersed-interceptor launch gallery; restrained painterly realism;
> fixed forward capsule-eye camera; 14 m clear width and 8 m clear height; reinforced-concrete
> cut-and-cover gallery; segmented electromagnetic launch stators and two mechanical guide rails;
> structural ribs at 10 m intervals; warm shielded industrial lamps; baffled pressure-relief
> plenums at 40 m intervals; visible drainage gutters, cable trays and coolant lines; clean
> FOD-controlled floor; low residual dust moving toward side relief outlets; a small daylight
> portal growing naturally under constant acceleration. No aircraft, no cockpit, no HUD, no text,
> no insignia, no weapons, no people, no door across the launch bore, no vacuum effect, no neon
> electricity, no levitation, no generic science-fiction tunnel, no camera cut, no zoom, no
> exposure pumping.**

Do not prompt for a named studio, living artist, existing film, identifiable real base, or
copyrighted vehicle. “Painterly realism” and the project's own palette/geometry references are the
style contract.

The first review sheet and its exact prompt/hash are recorded in
[`present/rapier-launch-gallery-storyboard-v1.md`](present/rapier-launch-gallery-storyboard-v1.md).
It is deliberately marked reference-only: its sequence and lighting are useful, but its
rail/stator distinction, service systems, and perceived ramp geometry do not yet meet this basis.

### 13.4 Asset deliverables

| Deliverable | Contract |
| --- | --- |
| Review master | 1,920 × 1,080, constant 60 fps, **475 frames / 7.916667 s**, SDR Rec.709, no audio |
| Runtime baseline | 1,280 × 720, constant 60 fps, **475 frames / 7.916667 s**, SDR Rec.709, 8-bit 4:2:0, no audio |
| Runtime codecs | AV1 or VP9 WebM plus H.264 MP4 fallback |
| Seek/resync | keyframe interval no greater than 1.0 s; exact first/last timestamps recorded |
| Composition | fixed crop/letterbox policy; never distort to viewport |
| Runtime behaviour | muted, `playsinline`, preload during Ready, immediate live fallback |
| Integrity | byte size and SHA-256 for every derivative |
| Versioning | stable cinematic asset id plus immutable version |

Do not assume 1,080p60 is cheaper than the live gallery. Promote it only after hardware-decode and
compositor telemetry pass representative desktop/mobile profiles.

### 13.5 Provenance record

Retain with the immutable source package:

- asset id and version;
- exact model/vendor/version and generation service terms;
- generation date and operator;
- complete positive and negative prompts;
- seed and every reproducibility parameter the service exposes;
- authoritative build id/commit and mission id used for the reference trace;
- every input frame, image, depth/edge/control input, and its licence/ownership;
- exact trace schema and camera transform for every source frame;
- generation attempts selected/rejected and the reason;
- edit, paint, interpolation, colour, grain, crop, and encode history;
- source and derivative hashes;
- rights/licence determination, redistribution scope, reviewer, and review date;
- `fiction` epistemic label and statement that no real site or unit is depicted;
- first-frame, crossfade-frame, and last-frame visual approvals;
- safety and anti-glorification review.

### 13.6 Runtime state and failure contract

Publish these authoritative snapshot fields before integration:

```text
catapult_elapsed_s
catapult_duration_s
catapult_phase          // STAGED | STROKE | HANDOFF
catapult_launch_sequence
```

Presentation rules:

- `catapult_elapsed_s`, not wall clock or uncorrected `video.currentTime`, owns phase.
- Pause freezes both sim and plate; resume seeks/corrects to authoritative elapsed time.
- Restart or a new sequence id resets the plate deterministically.
- Plate decode/preload failure never blocks `Begin`.
- Unexpected phase, terminal state, urgent failure, or asset mismatch fades immediately to live.
- HUD, warnings, radio, engine/catapult audio, and input remain live above the plate.
- Replay is either wholly live or records cinematic asset version and launch sequence/phase;
  wall-clock media time alone is not incident evidence.
- Procedural launch particles must remain deterministic from immutable asset/configuration state;
  if launch-to-launch variation is wanted, key it to `catapult_launch_sequence`. Per-frame
  `Math.random()` is incompatible with reproducible visual review.

### 13.7 Acceptance

The generated plate passes only if:

- first-frame and crossfade geometry align with the authoritative camera, central rails, rib
  cadence, and portal to an approved pixel tolerance;
- no aircraft, HUD, text, insignia, person, real site, or distorted gameplay cue appears;
- the plate is fully gone by 8.5667 s / progress 0.82100;
- live sky, terrain, ramp, handoff, HUD, radio, warnings, and audio remain authoritative;
- asset absence, decode failure, seek failure, pause/resume, restart, and background-tab recovery
  all return immediately to the live renderer;
- `requestVideoFrameCallback` timing and `getVideoPlaybackQuality()` dropped-frame counts are
  recorded alongside main-thread, renderer, HUD, upload, and frame-contract telemetry;
- representative profiles hold the 16.67 ms frame contract without increasing missed-frame bursts
  at preload, first decode, crossfade, or portal;
- a failed performance gate disables the plate rather than weakening simulation or HUD truth.

### 13.8 Game-production cost and delivery budget

This is separate from the physical-installation estimate in §11. No motion plate has been
commissioned, no vendor/model has been selected, and the image-generation tool used for the first
storyboard did not expose a billable price, model revision, or seed. Therefore there is no honest
“video generation cost” yet.

For planning, budget the reviewed, integrated feature as a small content-and-engineering project,
not as the price of one model invocation:

| Work package | Planning effort |
| --- | ---: |
| Authoritative camera/depth/edge trace and live reference capture | 2–4 person-days |
| Controlled generation attempts, selection, paint/cleanup, temporal repair | 5–10 person-days |
| Runtime compositor, authoritative timing, failure fallback, pause/restart/replay | 5–8 person-days |
| Codec derivatives, manifest/provenance/rights record, integrity tooling | 2–4 person-days |
| Hardware decode, crossfade, visual, browser, and regression QA | 6–10 person-days |
| **Total** | **20–36 person-days** |

At an explicit planning assumption of **$1,000–2,000 loaded USD per specialist-day**, plus
**$1,000–5,000** for generation/compute/licensing contingency, this is approximately
**$20,000–80,000** to reach shippable evidence. It is not a vendor quote. The range collapses only
after the model, rights, number of rejected takes, cleanup burden, and supported-device matrix are
known.

For runtime budgeting, a 7.9167 s 720p60 derivative at 6–10 Mbit/s is about **6–10 MB per codec**.
Two required codec families therefore imply roughly **12–20 MB** before packaging overhead. These
are encoder targets, not permission to ship: actual visual quality, CDN transfer, preload time,
hardware decode, memory, and dropped-video-frame evidence decide admission. The live procedural
path remains the zero-media fallback and may remain the better product if the plate does not buy
enough visual value for its decode and maintenance cost.

## 14. Fact, fiction, and unresolved work

| Claim | Classification |
| --- | --- |
| Constant-acceleration electromagnetic launch is physically coherent | anchored concept; real systems exist |
| 520 m, 110 m/s, 433.86/86.14 m, 12°, 9.4545 s | **closed live interface** |
| 3,600 lb alert fuel and 8,222.93 kg four-drone alert mass | **closed/derived live** |
| 14 m × 8 m clear envelope and low nominal blockage | **closed interface / derived screening** |
| Reinforced-concrete cut-and-cover construction | plausible **concept basis** |
| 90–100 MJ storage and 22–25 MW conversion | **concept basis**, not selected equipment |
| Vent areas, wall thicknesses, cooling duty, service loads, and cost | **concept basis/open** |
| Exact Ukraine installation, unit, front, and threat | **fiction** |
| Burial prevents cratering or guarantees sortie availability | **false / prohibited claim** |
| Generated plate represents real engineering evidence | **false**; presentation only |

Open work before any engineering release:

- site geology, groundwater, settlement, seismicity, environmental and UXO conditions;
- defined threat, blast/ground-shock response, portal vulnerability, redundancy, and repair;
- aircraft/shuttle/holdback/release ICD and dynamic multibody loads;
- motor topology, storage technology, fault energy, braking, EMC, grounding, and protection;
- transient CFD for pressure, dust, heat, exhaust, fire, and smoke;
- drainage design storms, spill/firewater case, pump duty and loss-of-power response;
- egress, suppression, responder, aviation safety, and commissioning criteria;
- quantified cost risk and location/productivity/escalation basis;
- generated-media ADR, schema/tooling, rights review, reference capture, and instrumented proof.
