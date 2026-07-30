# 11 — Visual identity and buried crew capsule

← [10 — Geometry](10-geometry.md) · Next: [12 — Aerodynamics and control allocation](12-aerodynamics-and-controls.md) · Related: [50 — Crew, escape, FBW](50-crew-escape-fbw.md)

This chapter defines what the Rapier must look like from the outside and records an owner-directed
change to the crew installation. It is an engineering/presentation contract, not permission for
concept art to redesign the airframe.

## Controlling owner direction

The pilot is **fully reclined inside a buried, opaque pressure-and-escape capsule**.

- There is **no cockpit bump**.
- There is **no windscreen, canopy, transparency, greenhouse, bubble, raised visor, or glazed
  forward panel**.
- The capsule remains wholly inside the aircraft's continuous outer mould line. A cutaway may reveal
  it; an exterior view may not advertise it as a conventional cockpit.
- The pilot does not acquire direct forward vision by adding a small window. Outside-world awareness
  comes from distributed sensors and displays.

This direction controls over the current `escapePodSpine` geometry in
`airframes/rapier.v1.json`. That geometry rises above the fuselage as a separate loft from
`z = -3.95` to `+1.05` and is therefore a **superseded assumption**, not a shape to preserve or
soften. Removing it changes authored geometry and must be handled as a synchronized definition,
runtime, blueprint, test, and presentation revision. Until that revision lands, the checked-in
raised spine is an acknowledged mismatch with the intended aircraft.

The rest of the closed identity remains the starting constraint: 13 m length, 7.35 m span, the
authored cranked-delta planform, one ventral inlet and continuous propulsion tunnel, and one fixed
nozzle. A directional-stability/control solution is required, but the fin count, area, height,
spacing, cant and movable-rudder geometry are reopened by
[13 — Directional stability and tail trade](13-directional-stability-and-tail-trade.md). Repack the
capsule and its systems inside the closed identity; do not solve the conflict by growing a new
canopy-shaped volume.

## External visual invariants

### Silhouette and proportion

1. **Slender, duct-dominated body.** The fuselage is not a broad modern-fighter forebody. The
   propulsion path and thin high-speed wing remain visually dominant.
2. **Cranked delta, no horizontal tail.** Use the planform vertices in `airframes/rapier.v1.json`;
   do not substitute a conventional swept wing, tailplane, cropped F-22 planform, or generic
   hypersonic wedge.
3. **A credible yaw-control solution.** Current art studies low, close twin fins with mild outward
   cant. That is a candidate architecture, not a frozen silhouette. Do not retain the existing
   enormous surfaces merely because the JSON drew them first, and do not delete passive
   directional stability by implication.
4. **One ventral inlet, one fixed nozzle.** No nose intake, cheek intakes, paired exhausts, or
   thrust-vectoring hardware.
5. **Continuous upper mould line.** In side view the nose-to-aft-body contour may change curvature
   for structure and area ruling, but it must not form a cockpit hump. The capsule is inferred from
   function, not outlined as a bubble.
6. **Internal carriage.** The ownship gun and four-drone mission load do not become pylons, pods,
   conformal stores, or visible folded wings.

### What makes the aircraft recognizably Rapier

The identity should come from the combination of:

- a very long, sharp nose ahead of the ventral inlet;
- the exact low-aspect-ratio cranked-delta outline;
- a low, flush band of dark sensor apertures rather than a canopy;
- a single belly propulsion tunnel running into one compact hot nozzle;
- a restrained aft yaw-control solution that does not dominate the wing/body silhouette;
- restrained fired-CMC leading-edge and aft-hot-zone contrast; and
- a low, compact ground stance appropriate to catapult launch and arrested recovery.

Do not use a cockpit bump as a readability shortcut. At gameplay distance the planform, inlet,
single exhaust, fin spacing, and material blocking must carry recognition.

## Buried capsule and sensor language

The internal capsule is simultaneously the pilot pressure vessel and the provisional escape module.
Its external expression is limited to flush interfaces:

- small distributed electro-optical/infrared apertures with overlapping fields of regard;
- flush radar/radome or other sensor panels where later systems work justifies them;
- bounded removable maintenance panels in cold structure;
- subtle panel-break or seal lines for capsule installation, never a glazed canopy frame; and
- external rescue/ground-service markings only after the ingress and emergency-access design is
  closed.

Sensor faces should read as dark ceramic, radome, or protected optical material, not black glass
through which a person could look. They remain conformal to the local skin. Do not gather every
sensor into one canopy-shaped black patch.

Normal ingress and emergency access now have a **proposed** dual-boundary flush-plug/couch-sled
architecture in [51 — Crew ingress, egress, and rescue](51-crew-ingress-egress-and-rescue.md);
packaging, qualification, depot pod removal and flight jettison remain unresolved. Concept art may
show that labelled trade, but must not silently establish a canopy, exposed ladder, explosive seam,
rocket pack, parachute, or survival envelope.

## Material, finish, and thermal zoning

Use material behavior, not decorative panel noise, to explain the aircraft:

| Zone | Visual treatment | Constraint |
| --- | --- | --- |
| Upper cold structure | weathered grey-green composite, nominal palette `#596b73` | broad bonded panels; low metallic response |
| Lower cold structure | charcoal blue-grey composite, `#26343a` | propulsion and bay access remain legible without becoming black stealth coating |
| Wing/fin leading edges and inlet lip | fired-umber SiC/SiC-class CMC, `#765244` | segmented replaceable inserts with restrained thermal-joint gaps |
| Duct/nozzle fairing | darker fired CMC / required thermal finish | one continuous hot path; no TVC actuators |
| Sensor apertures | near-black ceramic/radome language, around `#11191d` | flush and distributed; never transparent cockpit glazing |
| Readability accents | sparse burnt-orange paint, `#b85e32` | markings only; not pods, stores, or navigation fantasy |

Composite areas should use broad bonded seams, sparse flush access covers, and very limited exposed
fasteners. CMC joints may show replaceable segment boundaries and thermal isolation. Do not cover the
airframe in 1950s aluminium rivet rows, circumferential metal bands, polished titanium panels, or
generic stealth sawteeth.

The material-zone drawing remains schematic, not a CFD temperature contour. Do not depict the whole
wing glowing, soot the airframe like a rocket, or imply an operational temperature qualification
that the thermal chapter does not provide.

## Ground, recovery, and rail presentation

The aircraft reference is provisionally 0.85 m above its loaded wheel/cradle support plane. Ground
views should therefore read low and compact, with short recovery-weight landing gear rather than
tall carrier-fighter legs.

Launch views must show mechanical support:

- landing gear remains down during the stroke;
- the captive shuttle rides mechanically on guide rails;
- segmented electromagnetic stators provide longitudinal drive but do not levitate the aircraft;
- a visible launch fitting or belly cradle transfers tow load into the keel/NLG load path; and
- a positive holdback reacts pre-launch augmented thrust.

The exact coupling, wheel/cradle load distribution, pitch articulation, holdback location, and
failed-release behavior are open. Rail-interface art must be labelled as a trade study until the
aircraft/shuttle ICD closes. Never show the jet hovering over a glowing “maglev” rail.

Recovery views may show a single aft arresting hook near the provisional `z = +4.2` hardpoint.
Tyre sizes, track, oleo travel, door kinematics, hook damper, and engagement envelope remain
provisional and must not be promoted to geometry authority by a polished drawing.

## View-specific verification

Every serious concept candidate needs an orthographic set at one consistent scale.

| View | Must verify | Automatic rejection |
| --- | --- | --- |
| Top | exact JSON wing planform, 7.35 m span, candidate tail geometry identified by revision, no external stores | conventional wing/tail, altered tips, widened body, canopy-shaped dark patch, unlabelled legacy fins |
| Side | 13 m length, continuous upper mould line, buried capsule, ventral inlet station, single aft nozzle | any cockpit hump, transparency, nose intake, horizontal tail |
| Front | thin wing, one ventral inlet, compact body, mild fin cant | glazed pilot opening, paired cheek intakes, twin nacelles |
| Rear | one fixed nozzle and the selected candidate yaw-control arrangement | two exhausts, TVC petals, or a tail arrangement presented as closed without evidence |
| Belly | inlet/tunnel continuity, provisional four-cell door study, hook/gear clearance | external drone carriage, bay doors through the duct, invented gun pods |
| Ground three-quarter | low stance and believable wheel/load path | tall gear, hovering aircraft, rail intersecting the skin |
| Launch three-quarter | gear down, mechanical shuttle support, holdback and stator/rail distinction | levitation, vacuum door, neon arcs, debris crossing the inlet |
| Section/cutaway | fully reclined pilot inside an opaque capsule and non-overlapping systems volumes | upright seat, direct windscreen vision, capsule intersecting duct/gun/gear/fuel |

Perspective beauty art cannot substitute for this orthographic set. A pleasing three-quarter view
can conceal a canopy bump, impossible belly packaging, wrong span, or a conventional tail.

## Unresolved geometry and packaging questions

These questions must stay visible in briefs and reviews:

1. What station range, internal length, width, depth, and recline angle close the occupant capsule
   without violating the revised fuselage loft?
2. What minimum pressure-shell, restraint, life-support, display, and control volumes surround the
   occupant?
3. Which fuselage stations replace the raised `escapePodSpine`, and how does removal change overall
   height, area distribution, inertia, drag, and structural load paths?
4. Where are the pressure bulkheads and capsule mounts relative to the four longerons, forward
   sensor/gun volume, wing carry-through, and propulsion duct?
5. How does the pilot enter during normal operations, and how do ground crew extract the occupant
   after power loss, rollover, fire, or battle damage?
6. Does the whole capsule jettison? If so, where are the separation plane, initiators, propulsion,
   stabilization, heat protection, parachute/recovery system, and safe operating envelope?
7. Which distributed sensor apertures provide forward, lateral, aft, landing, and degraded-mode
   vision, and what are their fields of regard, cleaning, cooling, redundancy, and battle-damage
   behavior?
8. Where does the single M61A2-class gun, feed system, 480-round magazine, gas management, and one
   physical muzzle aperture fit? The false bilateral sockets in airframe concepts v1–v3 did not
   close that installation; v4 removes them without inventing the final aperture.
9. Can four folded 360 kg drones and their doors/ejectors actually fit beside the central duct inside
   the local OML? Current socket centres and nominal clear boxes require a section-volume proof.
10. Where do NLG retraction, main-gear retraction, the launch fitting/cradle, and the capsule volume
    pass one another without overlap?
11. What are the capsule, sensor, cooling, wiring, and jettison masses, and how do they change CG and
    inertia through fuel burn and drone release?
12. Where is the authoritative pilot-eye/camera datum after the external raised spine is removed?
13. Which upper-surface panels remain removable for capsule and avionics maintenance without cutting
    hot structure or the primary load path?
14. What tail-off and with-tail `Cnβ`, `Cnr`, `Cnδr`, buffet, hinge-moment, failure, inlet-sideslip
    and crosswind-recovery evidence selects the directional-control architecture and surface area?

No concept image, however convincing, answers these questions by implication.

## Superseded geometry migration

The intended buried capsule is not achieved by hiding or recolouring the current spine mesh. The
eventual implementation must be one coordinated revision:

1. revise and bump `airframes/rapier.v1.json`, replacing the raised `escapePodSpine` assumption with
   a defined buried-capsule package and revised fuselage stations where required;
2. synchronize the public web definition and embedded runtime copy;
3. update `createAirframeFromDefinition`, semantic part names, cockpit-camera placement, material
   assignment, and geometry tests;
4. regenerate every affected three-view, loft, capsule, systems, thermal, structure, section, and
   assembly plate, including presentation/web copies;
5. recheck planform/area ruling, dimensions, mass/CG/inertia, sensor fields of regard, internal
   clearances, gallery fit, ground stance, and cockpit/HUD camera projection; and
6. record the accepted candidate, failures, and evidence through the source-locked airframe
   engineering loop before promoting a runtime asset.

Until all six steps agree, presentation must state that the raised-spine runtime and the intended
buried-capsule identity are temporarily out of sync.

## Concept-art authority and prohibited imagery

Existing Rapier mood art and any newly generated sheets are **candidate/reference material only**.
They may test readability, materials, lighting, and packaging hypotheses. They do not establish OML,
dimensions, control area, inlet capture, internal volume, mass, performance, or launch mechanics.
Accepted geometry flows from the versioned airframe definition and its engineering evidence into
art—not from an attractive image back into the simulation without review.

Never show:

- a cockpit bump, windscreen, canopy, transparent visor, visible pilot, or canopy-frame seam;
- an upright or conventionally seated pilot in a Rapier cutaway;
- a nose intake, cheek intakes, twin engines, twin nozzles, or thrust vectoring;
- a horizontal tail, conventional swept-wing fighter planform, or generic stealth-fighter copy;
- exposed missiles, pylons, gun pods, or unfolded drones on the carrier aircraft;
- two independent ownship cannon apertures inferred from the two VFX sockets;
- dense riveted-metal skin, polished aluminium, or unsupported low-observable coating claims;
- a finished escape, bay, gear, or shuttle mechanism presented without a provisional label;
- levitating launch support, a vacuum tube, closing launch-path door, uncontrolled arcs, or a large
  FOD/dust cloud; or
- real unit insignia, exact real installations, or generated imagery presented as engineering
  evidence.

## Epistemic

The no-bump, no-transparency, fully reclined buried-capsule direction is **closed owner intent**.
The current raised `escapePodSpine` is **superseded** and reopens the local fuselage/capsule geometry
until a synchronized definition revision lands. Existing dimensions and wing planform remain the
controlling starting constraints. Directional stability/control is required, while the current fin
geometry is **reopened** pending the tail trade. Sensor layout, ingress, escape mechanics, detailed
gear, gun installation, drone-cell packaging, and launch coupling remain **provisional/open
findings**.
