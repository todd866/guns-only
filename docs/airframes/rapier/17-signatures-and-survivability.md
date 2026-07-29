# 17 — Signatures and survivability

← [16 — Manufacturing and the 2026 industrial basis](16-manufacturing-and-industrial-basis.md) · → [20 — Thermal and materials](20-thermal-and-materials.md) · Back to [README](README.md)

*Owner direction 2026-07-29: chapter [16](16-manufacturing-and-industrial-basis.md)'s "not a
frontier" claim is honest only if signature management is explicitly **refused** — "a fairly
simple aircraft to engineer" and "at least somewhat stealthy" cannot both be true of a Mach 3.55
airframe. This chapter records the refusal and what survivability is bought with instead.*

## The refusal (doctrine, same standing as the TVC refusal)

**Low observability is not a requirement of this aircraft.** It joins thrust vectoring on the
refused list (`sim/FlightModel.cs`: "hot actuators, mass, maintenance and cost") and for the
same reason: it is where the cost thesis goes to die. Three facts force it:

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
   fighter's cost per flying hour (**anchor**: the F-22's LO-restoration burden). A ~$9M,
   ~50-sortie article ([95](95-cost-ledger.md)) that needs coating restoration between sorties
   is a contradiction in terms.

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
  the airframe is a 50-sortie round from a production line. Losing one is a line item; the
  line is the weapon. Stealth exists to make rare aircraft survivable; this program makes
  aircraft non-rare.

## What comes nearly free (and is already canon)

Shaping *hygiene*, not stealth — accepted only where it costs nothing the mission wants:

- **No windscreen.** The occupant rides an opaque capsule behind a sensor spine
  ([50](50-crew-escape-fbw.md)) — flush apertures and no canopy glint, an LO-friendly feature
  the design bought for physiology reasons.
- **Internal carriage.** All four gun-drones ride belly cells ([60](60-armament-and-drones.md));
  nothing hangs in the airstream.
- **Edge discipline** (provisional): the cranked delta's planform alignment and fin cant are
  presentation-frame choices today; keeping edges family-aligned costs nothing and is noted
  for the geometry record, unquantified.

No RCS number is authored anywhere in this bible, deliberately: **the sim models no radar**
(the mission briefs say so in as many words), so any signature claim would be presentation
outrunning the kernel. If a future beat models sensors, signatures get modeled physics first
and doctrine numbers second — never the reverse.

## Where low observability actually lives

The **gun-drones** ([60](60-armament-and-drones.md)). Small, cold, subsonic-release, and
attritable — everything the carrier aircraft is not. If the threat model ever demands a
low-signature penetrator, the answer is drone-side (tag: provisional — drone signatures are
no more modeled than the carrier's), not a stealthier Rapier. "At least somewhat stealthy"
applied to the carrier is the 2050s aircraft trying to get out — exactly the requirement the
[chapter 16](16-manufacturing-and-industrial-basis.md) freeze firewall exists to refuse.

## Epistemic

The refusal and the survivability doctrine are **closed** at the program level (owner
direction 2026-07-29). The kinematic-sanctuary framing is **surrogate** (no threat/SAM model
exists in the sim). The two **anchor** facts (SR-71 combat-loss record; LO maintenance
economics; high-Mach RAM immaturity) follow chapter 16's rule: verifiable outside the repo,
correctable here, never load-bearing on the kernel.
