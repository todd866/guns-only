# 18 — Signature and 2040 detectability trade

← [17 — Signatures and survivability](17-signatures-and-survivability.md) · Next:
[20 — Thermal and materials](20-thermal-and-materials.md) · Related:
[11 — Visual identity and buried crew capsule](11-visual-identity-and-buried-capsule.md),
[12 — Aerodynamics and control allocation](12-aerodynamics-and-controls.md)

> **Conceptual systems-engineering trade only.** This chapter contains no classified signature
> data, no claimed radar cross section, no sensor detection range, and no assertion about a real
> 2040 threat system. It converts the Rapier's current geometry and mission into falsifiable design
> questions. Fictional future capabilities are labelled **HYPOTHESIS**. Relative design thresholds
> are programme gates, not predictions of combat performance.

## 1. Decision in one paragraph

The Rapier should not become an exquisite all-aspect stealth fighter. Its large supersonic inlet,
hot single nozzle, Mach-3.55-class dash, hundreds-of-degrees aerothermal state, and sonic boom make
full-spectrum invisibility physically incoherent; a fragile, maintenance-intensive low-observable
coating system would also break the production and sortie-cost thesis.

It should become a **signature-disciplined kinematic interceptor**:

- **CLOSED:** survival is not premised on remaining undetected. Speed, route, altitude, dispersal,
  offboard cueing, and attrition tolerance remain the primary doctrine.
- **PROPOSED:** robust shaping, aperture control, emission control, and aspect tactics should delay
  *classification, continuous track, and weapon-quality fire control* long enough to complete one
  pass and create an infeasible or late intercept.
- **OPEN:** no current model proves that delay. Radar, infrared, visual, acoustic, and
  electromagnetic-signature models do not exist in the kernel.

This refines rather than reverses [chapter 17](17-signatures-and-survivability.md). Its refusal of
an expensive full-low-observable requirement remains the cost guardrail. That refusal is not
permission to ignore avoidable scatterers or broadcast continuously.

## 2. What “effective stealth” means in 2040

Low observability has never meant literal invisibility. A useful public definition is the time
advantage: a platform evades detection or tracking long enough to detect and engage first. GAO also
records five coupled signature domains—radar, infrared, electromagnetic, visual, and acoustic—and
describes full-scale and in-flight measurement rather than appearance-based acceptance
([GAO/NSIAD-98-67, pp. 20–21](https://www.gao.gov/assets/nsiad-98-67.pdf)).

For Rapier, the relevant chain is:

`first cue → localization → classification → continuous track → weapon-quality track → launch → intercept`

The aircraft may be seen at the first step and still gain useful survivability if later steps are
late, intermittent, geometrically poor, electronically contested, or handed between incompatible
sensors. Conversely, a tiny frontal radar return is not enough if the aircraft's plume, datalink,
sonic boom, side aspect, or recovery route gives another sensor a stable cue.

The programme therefore measures time and track quality, not a marketing adjective:

| Metric | Meaning | Desired direction |
| --- | --- | --- |
| `t_first_cue` | first valid but possibly ambiguous observation | later is helpful, not required |
| `t_class` | first correct aircraft-class identification | delay beyond first cue |
| `t_continuous` | first sustained fused track through the required update interval | delay and break continuity |
| `t_WQ` | first weapon-quality state estimate under the threat's own error rules | delay beyond Rapier attack completion where feasible |
| `P_reacquire` | probability of reacquisition after a track break | reduce |
| `engagement_margin = t_WQ − t_attack_complete` | positive means Rapier completes its pass before the network has a weapon-quality track | make positive across the mission threat set |

No requirement is permitted to say simply “undetected,” “stealth,” or “low RCS.” It must name a
sensor family, frequency or spectral band, polarization where applicable, aspect, configuration,
environment, track-quality threshold, and mission time.

### 2.1 Why useful reduction has not become pointless

The monostatic radar equation makes detection range proportional to the fourth root of target radar
cross section under its simplifying assumptions. Thus signature reduction has diminishing returns,
but it does not become worthless merely because a sensor improves. A NATO educational note gives
the useful scale example that a tenfold RCS reduction reduces free-space radar range by about 44
percent; terrain, propagation, processing, geometry, jamming, and network cueing can change the
operational result
([NATO RTO-EN-018](https://www.sto.nato.int/publications/STO%20Educational%20Notes/RTO-EN-018/EN-018-%24%24ALL.pdf)).

The honest 2040 conclusion is therefore:

- **PROPOSED doctrine:** signature reduction remains worth buying when it is robust, broad enough
  to affect the threat chain, and cheaper than the time it buys.
- **REJECTED doctrine:** “stealth is obsolete, so shape does not matter.”
- **REJECTED doctrine:** “stealth defeats the sensor network, so kinematics, EW, and losses do not
  matter.”

## 3. Evidence for a distributed, multispectral threat—and its limit

Public programmes already demonstrate the direction of travel:

- Dstl's 2025 Project SIREN fused multiple radars across airborne and ground nodes into a near
  real-time air and maritime picture
  ([Dstl Project SIREN](https://www.gov.uk/government/case-studies/project-siren-advancing-networked-sensing-through-collaboration)).
- NATO's SET-243 public summary describes passive radar using emitters of opportunity, lower
  frequency bands, and multistatic geometry as a complement to active air-surveillance radar
  ([NATO STO 2019 Highlights, pp. 31–32](https://www.sto.nato.int/publications/Management%20Reports/2019_NATO_STO_Highlights_Web.pdf)).
- The US Air Force science-and-technology strategy names multimodal sensing, laser and multistatic
  radar, mesh networks, real-time spectrum awareness, and predictive analytics as research
  directions
  ([AFRL strategy summary](https://afresearchlab.com/news/new-air-force-science-technology-strategy-puts-focus-on-speed/)).
- Dstl describes distributed and disposable radars, EO sensors, adaptive radar, and multi-sensor
  fusion as active defence-science areas
  ([Dstl sensing capability](https://www.gov.uk/guidance/sensing-defence-science-and-technology-capability/)).
- DoD treats the electromagnetic spectrum as contested manoeuvre space required for sensing,
  command, communication, and force projection, rather than as an uncontested utility
  ([2020 DoD Electromagnetic Spectrum Superiority Strategy release](https://www.defense.gov/News/Releases/Release/Article/2397850/electromagnetic-spectrum-superiority-strategy-released/);
  [GAO-21-64](https://www.gao.gov/products/gao-21-64)).

These sources justify designing against **sensor diversity and cross-cueing**. They do not disclose
future sensitivity, coverage, latency, false-alarm rate, electronic protection, target-resolution,
or weapons-quality performance against a Rapier-like aircraft.

The following remain explicit **HYPOTHESES**, not canon facts:

1. **HYPOTHESIS H-1:** by 2040 a defended corridor can combine geographically separated
   low-frequency surveillance, high-frequency fire control, passive RF, and EO/IR observations.
2. **HYPOTHESIS H-2:** some airborne and ground sensors share tracks quickly enough to cue another
   sensor during Rapier's short transit.
3. **HYPOTHESIS H-3:** overhead sensors may contribute thermal or optical cueing against a hot,
   high-altitude dash, but their coverage, revisit, discrimination, and latency are not assumed.
4. **HYPOTHESIS H-4:** machine-assisted classification improves, but remains limited by data,
   geometry, weather, deception, and false alarms.
5. **EXCLUDED:** operational “quantum radar,” perfect persistent custody, universal
   counter-stealth, and infallible AI are not used as requirements without specific evidence and a
   testable sensor model.

## 4. Current aircraft facts that control the trade

| Aircraft fact | Status | Signature consequence |
| --- | --- | --- |
| 13 m long, 7.35 m span, 18.0 m² aerodynamic reference wing | **CLOSED** | electrically large in most fire-control bands; one scalar RCS cannot describe it |
| cranked delta, internal stores, no windscreen, buried opaque capsule | **CLOSED owner intent / geometry migration pending** | useful shaping hygiene; no canopy cavity or glint; access and sensor seams still matter |
| one 1.2 m²-class ventral capture stream and mixed-compression inlet | **CLOSED topology; installation provisional** | likely major forward/ventral RF scatterer; hiding it may damage pressure recovery and unstart margin |
| one fixed hot nozzle, no thrust vectoring | **CLOSED** | direct tail cavity and plume remain; no nozzle-vector yaw substitute |
| SiC/SiC-class hot leading edges, inlet, duct, and nozzle; ordinary composite cold structure | **CLOSED family / provisional installation** | material is not automatically radar absorbing; RF properties must be measured through temperature and damage |
| mission-command dash around Mach 3.55, OFT peak about Mach 3.69, and hot wall state | **CLOSED command / measured OFT / surrogate thermal model** | high IR contrast, plume, shocks, and wake are mission facts, not coating defects |
| two close vertical fins, each authored from a 3.7969 m² polygon | **CLOSED current geometry; aerodynamic need unproved** | 7.5938 m² total geometric fin area, about 42.2% of aerodynamic wing reference area; large aspect-sensitive RF and visual contributors |
| fin position `x = ±0.58 m`, mild outward cant `|rotZ| = 0.08 rad` (about 4.6°) | **CLOSED current geometry** | nearly upright paired reflectors; small cant does not establish low observability |
| one elevon per side plus “twin rudders” in the current system prose | **CLOSED wording only; physical arrangement reopened** | the render has fin solids but no authoritative rudder split, hinge, gap, seal, or actuator volume |
| yaw capacity `|Cn|max = 0.055` with Mach effectiveness schedule | **PROVISIONAL kernel surrogate** | runtime yaw authority is not derived from fin area, cant, rudder area, or hinge moment |
| 40 kg finite cold-gas RCS, active only as aerodynamic authority fades below 8 kPa q | **CLOSED runtime architecture / surrogate sizing** | useful in thin-air coast; cannot replace continuous atmospheric directional stability |
| no radar, IRST, EW, datalink-signature, or adversary sensor model in the kernel | **CLOSED implementation fact** | no current gameplay result validates any stealth or detection claim |

The fin-area calculation uses the shoelace area of the polygon in
`airframes/rapier.v1.json`; it is geometry arithmetic, not effective aerodynamic area. The current
fins may be partially blanketed by body and wing flow. That makes the need for aerodynamic data
stronger, not weaker.

## 5. The rudder question

### 5.1 Why vertical fins and rudders are there

The present fins have legitimate potential jobs:

1. **Static directional stability:** keep a disturbed aircraft weathercocked into the flow instead
   of requiring the flight-control system to manufacture every restoring moment.
2. **Yaw damping:** suppress Dutch-roll and sideslip oscillation across a wide Mach range.
3. **Commanded yaw:** align the nose for gunnery, de-crab in crosswind, coordinate bank, and recover
   from disturbances.
4. **Inlet protection:** reduce sideslip into the mixed-compression inlet. The kernel already
   penalizes combined angle of attack and sideslip and trips its provisional unstart state at about
   7° combined flow angle.
5. **Asymmetry tolerance:** oppose a stuck or asymmetric elevon, one-sided bay-door event, battle
   damage, uneven stores release, or other off-axis load.
6. **Control without TVC:** Rapier explicitly refuses thrust vectoring and cannot use differential
   thrust from a second engine.

One common vertical-tail sizing driver is absent: there is no second engine whose failure produces
a large one-engine-inoperative yawing moment. That is a reason to investigate smaller fins, not a
proof that fins are unnecessary.

Public NASA research shows both sides of the trade:

- directional stability of many supersonic aircraft decreases with increasing Mach, which helped
  drive large tails in historical designs
  ([NASA CR-186022](https://ntrs.nasa.gov/api/citations/19920022412/downloads/19920022412.pdf));
- NASA tested flying-wing arrangements with various twin-tail sizes and locations, plus split
  trailing-edge controls for yaw
  ([NASA TM-4649](https://ntrs.nasa.gov/citations/19960003382));
- the X-31 demonstrated simulated vertical-tail reduction using full-authority controls and thrust
  vectoring, explicitly trading lower weight, drag, and military RCS against added system
  complexity and reliability burden
  ([NASA TP-3624](https://ntrs.nasa.gov/api/citations/19960029101/downloads/19960029101.pdf));
- the tailless X-36 used both split ailerons and thrust vectoring—not clean-sheet geometry alone—to
  obtain yaw control
  ([NASA, *American X-Vehicles*, p. 46](https://www.nasa.gov/wp-content/uploads/2023/04/sp-4531.pdf)).

Rapier has full-authority FBW and split-capable trailing-edge concepts available for study, but it
does **not** have thrust vectoring and its reaction-control gas is finite. A finless production
baseline therefore transfers too much safety and control burden into unclosed systems.

### 5.2 Do the fins need to be this large?

**No evidence currently says they do.** The authored pair is visually and geometrically large, but:

- there is no `Cnβ`, `Cnr`, `Clβ`, `Clp`, `Cnδr`, rudder hinge-moment, buffet, flutter, or
  crosswind deck derived from the fin geometry;
- the kernel's yaw coefficient ceiling is a provisional scalar independent of fin area;
- there is no authoritative rudder geometry at all; and
- no inlet-distortion map connects sideslip suppression to a required tail volume.

The current tall pair is therefore a **geometry fact, not an engineering result**. Its size should
be reopened as a trade while the close twin-fin arrangement remains the conservative starting
point.

### 5.3 What fins and rudders do to signatures

Vertical tails are not automatically “non-stealth,” and a canted tail is not automatically
“stealth.” Their contribution depends on wavelength, polarization, incidence, edge directions,
surface current, adjacent geometry, and deflection:

- a broad fin face can produce a strong specular return at particular side or oblique aspects;
- fin leading, trailing, tip, and rudder-hinge edges diffract and can create narrow angular spikes;
- two fins and the body between them can support multiple-bounce paths; roots, gaps, and exposed
  actuators add local discontinuities;
- cant can redirect a monostatic lobe away from one sector while creating another lobe visible to a
  bistatic or elevated receiver;
- rudder deflection breaks edge alignment and exposes hinge cavities and side area, so a manoeuvring
  aircraft does not retain the clean-shape signature;
- all-moving fins remove one long external rudder hinge but add a highly loaded pivot, root gap,
  seals, and actuator burden; they are not a free signature fix;
- fins can shield part of the nozzle from selected side aspects, but their roots and inner faces may
  absorb plume and aft-body heat, increasing their own IR radiance;
- tall fins increase visual silhouette, structural weight, wave/interference drag, and buffet
  exposure; lower fins may increase the control deflection and drag needed to generate the same
  yaw moment.

NASA's public RCS fundamentals emphasize local geometry, reflections, and diffraction rather than a
single style label
([NASA/AIAA, *Radar cross section fundamentals for the aircraft designer*](https://ntrs.nasa.gov/search.jsp?R=19790063885)).
At high frequency, shape can dominate material response; at low frequency, wavelength and material
properties change the problem
([NASA, non-principal-plane plate scattering](https://ntrs.nasa.gov/api/citations/19890006725/downloads/19890006725.pdf)).

### 5.4 Configuration trade

| Option | Stability/control | RF signature | Cost / failure burden | Disposition |
| --- | --- | --- | --- | --- |
| A — current tall close twin fins and rudders | maximum unproved passive/control margin | largest side area, long edges, paired-root interactions; may shield some nozzle aspects | simplest conceptually, but heavy/buffet-prone | **REFERENCE BASELINE**, not accepted optimum |
| B — lower edge-aligned canted twin fins, modest rudders, differential elevon/split-drag augmentation, finite RCS at low q | retains passive tail and no-TVC architecture; higher FBW/control demand | likely lower fin contribution in selected sectors, but cant shifts lobes and deflection remains visible | moderate; uses systems already near the design | **PROPOSED TRADE BASELINE** |
| C — completely finless with split drag controls and cold-gas RCS | weakest control-off stability; drag control weakens with q; finite gas | best chance to remove fin scatterers, but inlet/nozzle still dominate | high FBW/redundancy burden; no TVC; poor damaged-mode case | **REJECT as production baseline; research branch only** |
| D — folding/retracting fins | configuration-dependent and mechanically complex | gaps, hinges, cavities, and transitions create new states | hot, highly loaded mechanism with dangerous failure modes | **REJECT** |
| E — one central fin | fewer roots, but one large near-vertical surface | strong broadside and tip/edge contributor; may obstruct nozzle/capsule servicing | no clear mission advantage over close twins | **HOLD, low priority** |

The current
[`rapier-airframe-concept-v3-low-fin.png`](present/rapier-airframe-concept-v3-low-fin.png) is a
useful visual hypothesis for option B. It is not geometry authority and does not show a solved
rudder, actuator, inlet, or stability installation.

### 5.5 Low-fin design-of-experiments

Before selecting a silhouette, evaluate at least:

- total geometric fin area at **40%, 55%, 70%, and 100%** of the current 7.5938 m² pair;
- outward cant and edge alignment as independent variables rather than a generic “stealth angle”;
- fixed-fin-plus-rudder and all-moving-fin variants;
- differential elevon, split-drag surface, and aerodynamic/RCS control allocation;
- clean, landing-droop, high-yaw-demand, one-surface-jam, and damaged configurations; and
- fin-root placement relative to wing/body separated flow and the nozzle plume.

Those percentages are **PROPOSED exploration points**, not target sizes. A candidate exits the trade
only when it passes every gate in §10.

## 6. Threat and sensor matrix

| Sensor / cue | What threatens Rapier | What signature discipline can do | What it cannot honestly promise | Required model / test |
| --- | --- | --- | --- | --- |
| VHF/UHF or other long-wavelength surveillance radar | early cue; resonance and whole-aircraft currents; less benefit from high-frequency edge shaping | avoid gratuitous large vertical surfaces; characterize hot/cold materials; use route, EW, and track breaks | precision fire control or defeat of every low-frequency system is not assumed | full-vehicle frequency/polarization/aspect sweep; network localization error |
| L/S/C-band search and track radar | persistent volume search and target handoff | aligned OML, controlled seams/apertures, internal carriage, fin/inlet trade | no single “all-band” coating solves the hot aircraft | solver, scale range, then full-scale clean/dirty configuration test |
| X/Ku and millimetric fire-control or terminal radar | weapon-quality range/angle/rate, especially after cueing | reduce forward/ventral scatterers; avoid direct engine-face view; control door/rudder states | a good nose sector does not protect side, tail, top, or deflected-control aspects | fine angular sweeps; dynamic control/door measurements; seeker-in-loop trials |
| passive/bistatic/multistatic radar | sees energy redirected away from a monostatic transmitter; silent receivers resist targeting | optimize across a weighted set of transmitter/receiver geometries; create track discontinuity, not one null | canting fins away from one monostatic radar may help another receiver | bistatic scattering matrix and distributed-track simulation |
| passive RF / ESM / geolocation | radar, datalink, navigation, telemetry, drone control, jammer, and maintenance emissions | receive-first architecture, directional/burst links, strict EMCON, offboard cueing | “low probability of intercept” is not invisibility; a jammer is an emitter | every transmission logged by time, EIRP, band, beam and function; red-team geolocation |
| MWIR/LWIR EO/IRST, including airborne or overhead cueing | hot inlet/leading edges/skin, nozzle hardware, combustion products, plume and heated wake | aspect shielding, thermal balance, trajectory/throttle timing, cooled apertures, avoid unnecessary hot spots | Mach-3.55 skin and an augmented ram plume cannot be made cold | 3–5 µm and 8–12 µm radiance maps through trajectory, weather and aspect; engine-on flight test |
| visible / near-IR imaging | silhouette, sun glint, paint contrast, condensation, contrails, plume luminosity | low-gloss robust finish, small fins, controlled apertures, route/weather planning | camouflage does not erase a high-altitude moving silhouette or persistent trail | calibrated contrast imagery, BRDF coupons, meteorology/contrail model |
| acoustic / infrasound | launch, engine, shock system and continuous sonic-boom carpet can cue passage and route | route, timing, launch-site dispersion, boom shaping only if it does not break mission shape | supersonic flight is not acoustically stealthy | source/propagation model and microphone-array flight measurements |
| cooperative fused network | one sensor's weak cue points a better sensor; track survives node loss | create uncertainty in multiple domains at once; attack links and geometry through EW/tactics | defeating one radar does not defeat the system | sensor-to-decision simulation with latency, false tracks, jamming and node loss |

NASA has directly formed infrared images from measured heated jet-plume temperature, pressure, and
gas fields
([NASA TM-110382](https://ntrs.nasa.gov/archive/nasa/casi.ntrs.nasa.gov/19960015541.pdf))
and uses calibrated airborne visual/IR/spectral imaging to measure hot vehicles in flight
([NASA SCIFLI](https://scifli.larc.nasa.gov/)). These prove that plume and hot-skin radiance are
measurable physical outputs; they do not supply a Rapier detection range.

Likewise, NASA's quiet-supersonic work shows that shaping can reduce boom intensity, but the shock
system remains a measurable output of supersonic flight
([NASA, *Taming the BOOM*](https://www.nasa.gov/centers-and-facilities/armstrong/taming-the-boom/)).
Rapier is not a low-boom demonstrator, so acoustic detection is accepted rather than hand-waved.

## 7. Major design contributors

### 7.1 Ventral inlet

The inlet is the hardest RF/aerodynamic conflict:

- its aperture faces ground and low-altitude threats during the high-altitude dash;
- a line of sight to conductive internal machinery or a deep duct cavity can dominate selected
  aspects;
- the lip, ramps, bleed/translation gaps, and control hardware create edges and cavities; and
- a serpentine or heavily blocked duct may destroy the 1.2 m² mixed-compression flowpath, pressure
  recovery, starting margin, and the programme's one-engine safety case.

**PROPOSED:** preserve the single ventral topology; align lip/control edges where the inlet permits;
keep internal machinery out of direct view using the least intrusive thermal-capable screen or
duct turn that survives coupled analysis; and accept a higher signature if the alternative causes
unstart or unacceptable thrust loss.

**OPEN:** the current presentation inlet ring is not a physical capture/duct model. No radar
blocker, inlet-face location, translating-ramp geometry, boundary-layer diverter, bleed path, or
high-temperature RF material has closed.

GAO's public account of F-22 RCS prediction explicitly lists engine inlets among major component
models, which is useful process evidence without disclosing a design
([GAO/NSIAD-99-55](https://www.gao.gov/assets/nsiad-99-55.pdf)).

### 7.2 Nozzle, afterbody, and plume

The single fixed nozzle is preferable to two cavities and avoids TVC gaps and actuators, but it
remains both an RF cavity and the hottest view of the aircraft.

**PROPOSED:**

- align the external boattail and replaceable CMC joints with the chosen edge families where
  thermostructurally possible;
- prevent direct views of turbine hardware without adding a heavy flattened stealth nozzle;
- measure whether the low fins shield or heat-soak from selected aspects;
- keep the nozzle fixed and mechanically simple; and
- treat throttle, altitude, route, and attack timing as the principal IR controls.

**REJECTED:** a cosmetic two-dimensional nozzle, fantasy “cold plasma” exhaust, or coating-only
solution that is not closed against thrust, cooling, mass, fatigue, and maintainability.

### 7.3 CMC and coating reality

SiC/SiC-class CMC is selected for heat, not stealth. NASA data show that its electrical resistance
varies with constituent content, fibre architecture, temperature, cracking, fibre damage, and
oxidation
([NASA, SiC/SiC electrical resistance study](https://ntrs.nasa.gov/citations/20130013151)).
Its RF complex permittivity, conductivity, thickness, seams, fasteners, environmental-barrier
coating, and temperature-dependent loss therefore require coupon and subcomponent measurement.

**CLOSED:** no document may call CMC “radar absorbing” merely because it is ceramic.

**PROPOSED:** use robust structural shaping first. Add a high-temperature RF treatment only where
coupon data, thermal cycling, erosion, rain, repair, and cost demonstrate a durable net benefit.

This is a production doctrine as much as a physics doctrine. GAO reports that F-22 low-observable
coating inspection, removal, restoration, application, and curing materially reduced aircraft
availability
([GAO-18-190, pp. 12 and 28–29](https://www.gao.gov/assets/gao-18-190.pdf)). Rapier may accept
replaceable hot-edge tiles and bounded aperture seals; it may not require a climate-controlled
surface-restoration ritual after routine sorties and still claim to be a cheap mass article.

### 7.4 Buried capsule, pilot ingress, and sensor apertures

The buried opaque capsule is favorable because it removes a transparency and deep cockpit cavity.
It does not remove the need for pilot ingress, rescue access, sensors, seals, and removable panels.

[Chapter 51](51-crew-ingress-egress-and-rescue.md) proposes separate flush structural and capsule
pressure hatches in cold upper structure. Signature consequences become acceptance criteria for
that open mechanism:

- hatch edges follow an established edge family rather than form a bright isolated loop;
- repeatable structural latches hold panel height and gap through pressure, heat, fatigue, and field
  repair;
- electrically continuous seals or deliberately characterized dielectric breaks survive repeated
  opening;
- no external handle, ladder, transparency, raised fairing, or rescue blister remains in flight;
- aperture windows remain conformal and individually cooled rather than forming a canopy-shaped
  black patch; and
- rescue opening, battle-damage extraction, and capsule separation remain more important than
  shaving the last signature increment.

**OPEN:** hatch size/station, pressure-shell interruption, rescue method, jettison seam, sensor
fields of regard, radome materials, cooling, cleaning, and battle-damage behavior. The signature
team is one owner of this interface, not the only owner.

### 7.5 Bays, gear, hook, and launch fittings

Internal carriage helps only with doors closed. The four-cell package is already geometrically open,
and gear, hook, muzzle, cooling outlets, and launch fittings can become strong local scatterers.

**PROPOSED:** flight-state closures remain flush and mechanically indexed; open-door, gear-down,
rudder-deflected, damaged-seal, and post-repair states enter the signature database. No sawtooth is
added by visual habit—every edge direction must follow the solved OML and structural load path.

**CLOSED operational truth:** landing and rail launch are not stealth configurations. Gear, hook,
shuttle hardware, open facility, engine start, and plume are visible signatures. Dispersal and time
on the surface protect the lane; aircraft RCS shaping does not.

## 8. Emissions, EW, and offboard sensing

### 8.1 Emission-control baseline

**PROPOSED:**

1. climb and dash are receive-first and do not require a continuously radiating onboard search
   radar;
2. offboard tracks provide coarse intercept geometry;
3. the aircraft verifies locally with passive EO/IR and passive RF where weather and geometry allow;
4. active radar or other illumination, if later selected, uses bounded commit-phase bursts rather
   than continuous search;
5. datalinks use directional apertures, bounded time-on-air, authentication, and recorded emission
   state; and
6. loss or corruption of offboard data degrades the mission rather than making the aircraft
   uncontrollable.

“Low probability of intercept/detection” is an unclosed waveform-and-adversary claim, not a label to
apply to ordinary short transmissions.

### 8.2 Electronic warfare

EW is a survivability layer, not a stealth substitute:

- noise or deceptive jamming can deny range/velocity/angle information but emits energy and may
  become a geolocation cue;
- onboard high-power EW requires apertures, electrical power, cooling, software, threat libraries,
  and test time absent from the current aircraft;
- offboard or drone-carried emitters can separate the jammer from the crewed aircraft, but consume
  payload and may reveal the mission;
- expendable decoys, towed decoys, and active cancellation are **OPEN** and cannot be assumed; and
- autonomous gun-drone control should not require a continuous broad-beam carrier transmission.

Any future EW option enters the same ledger as a fin: mass, drag, power, heat, cost, emissions,
failure modes, and measured mission-level time bought.

### 8.3 The network cuts both ways

Offboard sensing lets Rapier stay quieter and avoid the mass of an exquisite search suite. The same
network principle helps an adversary preserve custody after one sensor loses it. The design must
therefore:

- ingest tracks with uncertainty and provenance rather than treating them as truth;
- operate through latency, dropout, jamming, deception, and node loss;
- avoid emitting merely to reassure the pilot or make the UI busy; and
- make short local verification and a failed intercept preferable to continuous self-revelation.

## 9. Observability budgets

No absolute dBsm or detection-distance budget can be honest until threat models and a physical OML
exist. The programme can still impose relative, testable budgets now.

### 9.1 RF exposure index

Define a threat-weighted RF exposure index over mission time:

`E_RF = ∫ W(f, pol, tx, rx, aspect, phase) · σ(f, pol, tx, rx, configuration, T) dt`

where `W` is the approved threat/mission weighting and `σ` is the measured or validated predicted
monostatic/bistatic scattering value. Report medians, 95th-percentile hot spots, and the complete
angular maps; never publish `E_RF` alone.

**PROPOSED design gate:** the complete signature-discipline package, including the selected fin,
must improve threat-weighted `E_RF` by at least **6 dB** relative to the current tall-fin clean
geometry before accepting any meaningful aerodynamic, mass, cost, or maintenance penalty. No
high-priority frequency/aspect bin may worsen by more than **3 dB** without a written mission trade.

Those are decision thresholds, not predicted performance. A 6 dB RCS reduction does not mean a 6 dB
range reduction; under the simple monostatic radar equation it changes free-space range by only
about 29 percent. That is exactly why the benefit must survive the mission simulation.

### 9.2 Configuration budget

Maintain separate RF maps for:

- clean/trimmed;
- each rudder/elevon schedule and a maximum-authority transient;
- drone and gun doors closed/open/in transition;
- gear and hook up/down;
- capsule and service hatches nominal, field-repaired, dirty, eroded, and mis-rigged to tolerance;
- hot and cold CMC/EBC states;
- representative rain, ice, dust, and thermal-cycle damage where applicable; and
- each single failure or battle-damage case the aircraft is still expected to fly.

**PROPOSED gate:** manufacturing and field-repair tolerance Monte Carlo may degrade the
threat-weighted clean RF index by no more than **3 dB at the 95th percentile**. If it does, the
design is too maintenance-sensitive for Rapier doctrine.

### 9.3 Infrared budget

Record line-of-sight spectral radiance in at least the 3–5 µm and 8–12 µm bands by aspect and phase,
plus the thermal state that produced it. Do not collapse skin, nozzle, plume, and wake into one
temperature.

**PROPOSED gates:**

- no RF-shaping change may increase peak component temperature or mission fuel burn outside the
  already-open thermal/propulsion budgets;
- low-fin/nozzle changes must report whether shielding reduces apparent radiance in one aspect by
  heating another surface or extending the plume;
- sensor-aperture cooling and low-emissivity treatments must close the resulting heat rejection;
  and
- final acceptance is mission-level `t_class`/`t_WQ`, not a guessed “IR stealth” temperature.

### 9.4 Emission budget

Every intentional RF emission is a telemetry event containing function, start/stop time, frequency
band, peak/mean EIRP, beam direction/width, waveform ID, and platform configuration. Every mission
phase must be executable in an explicitly defined degraded/offboard-loss state.

**PROPOSED gates:**

- no continuously radiating search function during normal climb/dash;
- no unlogged maintenance, navigation, telemetry, or drone-control beacon in combat configuration;
- threat-triggered EW and active sensing have bounded time-on-air owned by the mission logic; and
- a red-team passive network must attempt detection, identification, and geolocation from recorded
  emissions before release.

### 9.5 Acoustic and visual budget

Acoustic and visual channels are **manage and measure**, not “make stealthy” requirements:

- compute the sonic-boom footprint and arrival time for each high-speed route;
- measure launch/gallery acoustic and plume signatures separately from airborne signature;
- model contrail/condensation probability from meteorology instead of using fixed visual effects;
- measure directional reflectance and sun glint of the durable finish; and
- expose these cues to the threat-chain model as delayed observations with uncertainty.

## 10. Coupled test and decision gates

### Gate 0 — requirements freeze

**Pass when:**

- representative mission corridors, sensor families, geometry, atmospheric cases, and EW states
  are approved;
- `t_class`, `t_continuous`, and `t_WQ` error/continuity definitions exist;
- there is no absolute RCS or IR requirement copied from another aircraft; and
- 2040 hypotheses have sensitivity cases rather than one clairvoyant adversary.

### Gate 1 — fin aerodynamic closure

Each tall/low/finless candidate must produce:

- `Cnβ`, `Cnr`, `Clβ`, `Clp`, `Cnδ`, `Clδ`, hinge moments, and nonlinear departures versus Mach,
  alpha, beta, Reynolds number, control state, and relevant configuration;
- Dutch-roll damping, control-off and degraded-FBW behavior;
- maximum crosswind takeoff/recovery, de-crab, ground steering, and rail-release disturbance;
- high-Mach sideslip-to-inlet-distortion/unstart coupling;
- asymmetric door, surface jam, damage, and gun/drone release cases;
- buffet, flutter, actuator load/rate, thermal, and fatigue margins; and
- RCS gas consumption when aerodynamic yaw authority is reduced.

**Hard fail:** a low-fin candidate that requires routine cold-gas use above 8 kPa q, continuous
maximum control deflection, or TVC not present in the design.

### Gate 2 — computational RF/IR ranking

Build the actual OML including inlet internals, nozzle, doors, hinges, seals, sensors, hatch, CMC
joints, gear/hook openings, and control deflections. Run:

- full-sphere monostatic and representative bistatic sweeps across VHF through millimetric threat
  bands and relevant polarizations;
- solver cross-checks on canonical and measured subcomponents;
- temperature-dependent material-property sweeps; and
- conjugate thermal/flow/plume radiance calculations through the flown trajectory.

**Pass when:** option B or another candidate meets §9's relative improvement gates without failing
Gate 1 or propulsion/thermal constraints.

### Gate 3 — coupon, subcomponent, and scale-range correlation

Measure:

- composite, CMC, EBC, joints, adhesives, seals, radomes, erosion, repairs, and fasteners through
  thermal cycles;
- inlet and nozzle subcomponents with representative internal terminations;
- hatch/door/hinge tolerances and repeated maintenance cycles; and
- a geometrically faithful scale model at enough frequencies to preserve electrical similarity.

**Hard fail:** a treatment whose benefit disappears after expected erosion/repair, needs routine
climate-controlled restoration, or causes unsafe hot-structure behavior.

### Gate 4 — full-scale static and engine-on measurement

Use full-scale pole/indoor-range and calibrated IR measurement for:

- clean cold aircraft;
- thermally conditioned airframe;
- controls, doors, gear, hook, and hatches in all operational states;
- engine dry/wet/ram-representative ground-test states where safe; and
- tolerance and representative repair articles.

The public F-22 programme used both full-scale pole and later in-flight RCS measurement; that is a
useful acceptance-process precedent, not a performance donor
([GAO/NSIAD-98-67](https://www.gao.gov/assets/nsiad-98-67.pdf)).

### Gate 5 — instrumented flight and distributed red team

Fly representative routes against separated radar, passive RF, EO/IR, acoustic, and fusion nodes.
Include weather, clutter, electronic attack, false tracks, data-link loss, node loss, and
reacquisition. Score the complete chain and both sides' latency.

**Mission pass:** the approved scenario set has positive engagement margin
`t_WQ − t_attack_complete` at the required percentile, with kinematics and EW modeled honestly.
The percentile remains **OPEN** for operational ownership; it must not be invented by the airframe
team.

### Gate 6 — production and field signature control

Audit random line articles and field-repaired aircraft. Store signature state by serialized
component and repair, not by an assumed fleet-average label. The lane must be able to inspect the
features that matter without creating the coating burden rejected in §7.3.

## 11. Consequences for art, simulation, and operations

### 11.1 Visual identity

The likely Rapier is not a black faceted stealth-fighter copy. It remains:

- one smooth, slender cranked delta with no cockpit bump or transparency;
- a low, conformal sensor language;
- one ventral inlet and one fixed nozzle;
- broad cold-composite surfaces with sparse maintainable seams;
- fired-CMC hot edges and aft hardware; and
- probably lower, carefully aligned twin fins if option B passes.

If the tall fins win the stability/inlet trade, they stay as a deliberate stability-first
compromise and the programme stops pretending they are stealth styling. If the low fins win, their
size and cant come from the derivative and signature maps, not the concept image.

### 11.2 Future simulation

Do not add a single “stealth factor.” A minimal sensor/signature kernel needs:

- aspect-, frequency-, polarization-, configuration-, temperature-, and damage-dependent RF tables;
- component and plume IR radiance by band and weather;
- emission events with receiver/geolocation models;
- visual/contrail and acoustic cues with propagation delay;
- independent sensor false-alarm, classification, update, custody, and handoff states;
- track fusion with uncertainty, latency, jamming, deception, and node loss; and
- telemetry for `t_first_cue`, `t_class`, `t_continuous`, `t_WQ`, reacquisition, and engagement
  margin.

The player should be able to see why custody was gained: hot plume, broadside fin return, radar
burst, open bay, contrail, or another node's cue. Detection without diagnosis cannot drive the
engineering loop.

### 11.3 Operations

Signature discipline changes tactics without changing the aircraft's purpose:

- accept that launch and supersonic transit announce a corridor;
- minimize broadside dwell to known fire-control geometries where mission routing permits;
- receive offboard cueing silently, then verify locally near commit;
- use speed and altitude to compress the interval between first cue and attack completion;
- avoid manoeuvre that simultaneously exposes fin broadside, deflects rudders, and pushes inlet
  sideslip unless survival demands it;
- treat any active EW/radar transmission as a deliberate trade; and
- disperse launch and recovery infrastructure because the sortie's plume, boom, and return track
  can cue attacks on the lane.

## 12. Status ledger

### CLOSED

- no cockpit bump, windscreen, transparency, or external store carriage;
- single ventral inlet, single fixed nozzle, no TVC;
- hot high-speed mission means IR and acoustic signatures cannot be eliminated;
- full-spectrum invisibility is not the survivability requirement;
- no unmeasured absolute RCS, detection-range, or “stealth” claim enters canon;
- CMC is not called radar absorbing without measured RF properties; and
- current runtime has large twin fin geometry but no geometry-derived yaw proof or sensor model.

### PROPOSED

- mission goal: delay classification and weapon-quality custody, not all detection;
- robust signature discipline compatible with mass production and field repair;
- lower edge-aligned canted twin-fin trade with modest rudders, differential/split-drag
  augmentation, FBW, and finite low-q RCS;
- receive-first/offboard-cued emissions doctrine;
- multi-domain observability budgets and test campaign in §§9–10; and
- relative 6 dB RF exposure improvement and 3 dB tolerance gates as thresholds for paying a real
  aircraft penalty.

### OPEN / REQUIRED CLOSURE

- complete directional-stability/control and inlet-distortion derivative deck;
- selected fin area, cant, placement, rudder/all-moving split, actuator and failure behavior;
- pilot-ingress/rescue hatch and capsule-separation interface;
- inlet blocker/duct line of sight, nozzle cavity treatment, and hot material RF properties;
- ownship sensor, EW, datalink, drone-control, aperture, power, cooling, and EMCON architecture;
- absolute RF/IR/acoustic/visual/emission signatures and threat sensor performance;
- distributed 2040 threat set, scenario weights, and required mission percentile;
- full-scale static, engine-on, in-flight, repaired-aircraft, and networked red-team evidence; and
- the simulation/telemetry machinery needed to make every future signature claim reproducible.

## 13. Immediate next engineering work

1. Replace the current fin silhouette argument with the §5.5 design-of-experiments.
2. Derive a first aerodynamic lateral/directional deck and inlet sideslip map for the 100%, 70%,
   55%, and 40% fin cases.
3. Build one detailed OML including the buried-capsule hatch, real inlet termination, nozzle,
   control seams, gear/hook closures, and closed drone doors.
4. Measure room-temperature and hot-cycled composite/CMC/EBC/radome coupons before selecting any RF
   material treatment.
5. Create a public-data sensor-network surrogate with explicit uncertainty and telemetry for the
   kill-chain times.
6. Run current tall-fin and low-fin candidates through the same RF, IR, aero, propulsion, mass,
   repair, and mission ledger.
7. Promote a visual candidate only after that ledger, not before it.

The present engineering answer is therefore precise: **the Rapier probably needs some vertical
tail because it has no TVC and must protect a sensitive inlet, but the current enormous fins are
not proven correctly sized and the rudder geometry does not yet exist. A lower twin-fin solution is
the leading trade. Useful stealth remains possible as delay, not disappearance, and only a coupled
aero–inlet–signature–mission test can say how much fin the aircraft should carry.**
