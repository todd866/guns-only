# 17 — Signatures and survivability

← [16 — Manufacturing and the 2026 industrial basis](16-manufacturing-and-industrial-basis.md) · → [20 — Thermal and materials](20-thermal-and-materials.md) · Back to [README](README.md)

*Owner direction 2026-07-29 refused an exquisite low-observable programme because it would break
the cheap, high-rate Mach-3 interceptor thesis. Owner questions on 2026-07-30 refine that boundary:
full-spectrum invisibility remains refused, while robust signature discipline is reopened as a
measurable delay in classification and weapon-quality track. This chapter records the survivability
doctrine; [18 — Signature and 2040 detectability trade](18-signature-and-2040-detectability-trade.md)
defines the new engineering work.*

## The full-LO refusal (doctrine, same standing as the TVC refusal)

**An exquisite all-aspect, all-spectrum low-observable aircraft is not the requirement.** It joins
thrust vectoring on the refused list (`sim/FlightModel.cs`: "hot actuators, mass, maintenance and
cost") for the same reason: it is where the cost thesis goes to die. Robust shaping hygiene,
aperture control, emissions discipline and testable track delay are not refused. Three facts bound
the trade:

1. **The shape is the mission.** The aircraft is "substantially inlet, D-21-like"
   (`RamCaptureAreaM2` note) — a mixed-compression supersonic inlet, a single hot nozzle, and
   shock-riding edges. Serious RCS shaping fights every one of those; a radar-blocked or
   serpentine duct is incompatible with the M3.3–3.8 spill schedule that already binds the
   envelope ([30](30-propulsion-and-inlet.md)).
2. **The skin is a beacon.** At measured dash the airframe rides ~500 °C stagnation
   ([20](20-thermal-and-materials.md)); at full ram the plume is unconcealable. No IR
   suppression story survives contact with this flight regime, and fielded RAM/LO coatings are
   qualified nowhere near these temperatures — high-Mach LO skin is a research frontier
   (**anchor**, subject to the ch. 16 verification discipline), precisely the kind of frontier
   the 2026-buildable freeze exists to exclude.
3. **The economics forbid it.** LO surface maintenance is a defining share of the exquisite
   fighter's cost per flying hour (**anchor**: the F-22's LO-restoration burden). A ~$9M high-rate
   aircraft with exchangeable hot modules and independently tracked component life
   ([85](85-service-life-maintenance-and-telemetry.md)) cannot depend on delicate all-aspect
   coating restoration after heat, field handling, or every sortie and retain its availability and
   cost thesis.

## What survivability is bought with instead

The 1960s answer, priced honestly: **kinematics, dispersal, and attrition tolerance.**

- **Kinematic sanctuary** (surrogate): the engagement problem for a defender is a crossing
  target at M3.55/FL700 with a ~90 km ram corridor; the intercept window is minutes wide and
  closing speed makes most engagements stern-chase infeasible. **Anchor**: no SR-71 was ever
  lost to hostile fire across hundreds of SAM engagements over two decades — kinematic
  survivability is the best-documented survivability story in aviation history.
- **Dispersal** ([80](80-basing-and-ground.md)): the buried gallery and dispersed strips mean
  the targetable object is a hole in the ground, not a ramp full of jets — the 2020s Ukraine
  lesson this basing already encodes.
- **Attrition price** ([95](95-cost-ledger.md), [16](16-manufacturing-and-industrial-basis.md)):
  high-rate production, dispersed depots, repair, and rotable recovery make combat loss
  replaceable without making the aircraft disposable. A wreck may still be worth recovering for
  its capsule, engine, hot modules, avionics, and gun. The line and depot network prevent each
  aircraft becoming irreplaceable; planned retirement after an arbitrary sortie count is not part
  of the survivability case.

## What comes nearly free (and is already canon)

Shaping *hygiene*, not invisibility—accepted where it is robust, maintainable and does not damage
the mission:

- **No windscreen.** The occupant rides in an opaque capsule buried below a smooth upper skin with
  distributed flush sensor apertures ([50](50-crew-escape-fbw.md))—no canopy cavity or glint, a
  signature-friendly feature bought for physiology reasons.
- **Internal carriage.** All four gun-drones ride belly cells ([60](60-armament-and-drones.md));
  nothing hangs in the airstream.
- **Edge discipline** (provisional): the cranked delta's planform alignment and fin cant are
  presentation-frame choices today; family alignment is inexpensive to investigate but is not
  free to implement or certify once aerodynamics, structure, access seams and hot materials are
  counted. It remains unquantified.

No RCS number is authored anywhere in this bible, deliberately: **the sim models no radar**
(the mission briefs say so in as many words), so any signature claim would be presentation
outrunning the kernel. If a future beat models sensors, signatures get modeled physics first
and doctrine numbers second — never the reverse.

## Where the deeper low-observable burden lives

Primarily on the **gun-drones** ([60](60-armament-and-drones.md)). Small, cold, subsonic-release, and
attritable — everything the carrier aircraft is not. If the threat model ever demands a
low-signature penetrator, the answer is drone-side (tag: provisional — drone signatures are
no more modeled than the carrier's), not a stealthier Rapier. "At least somewhat stealthy"
applied to the carrier is the 2050s aircraft trying to get out — exactly the requirement the
[chapter 16](16-manufacturing-and-industrial-basis.md) freeze firewall exists to refuse.

## Epistemic

The refusal of an exquisite all-aspect LO programme and the kinematic/dispersed survivability
doctrine remain **closed** at program level. The degree of robust signature discipline is
**reopened/proposed** in chapter 18. Kinematic sanctuary remains a **surrogate** because no
threat/SAM model exists in the sim. The anchor facts (SR-71 combat-loss record, LO maintenance
economics, and high-Mach RAM immaturity) follow chapter 16's rule: verifiable outside the repo,
correctable here, never load-bearing on the kernel.
