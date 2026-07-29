# 16 — Manufacturing and the 2026 industrial basis

← [15 — Structure and build](15-structure-and-build.md) · → [20 — Thermal and materials](20-thermal-and-materials.md) · Back to [README](README.md)

*Owner direction 2026-07-29. Three sentences govern this chapter: **in service by 2040 means
buildable from 2026** — the program must name who could start cutting which part this year.
**Most of it got done in the 1960s** — the flight regime is a solved problem the industry lost
interest in, not a frontier. **All we're doing is building the same thing cheaper and in greater
volume** — performance was closed sixty years ago; cost and rate are the actual program.*

This chapter adds one epistemic tag to the [README](README.md) set: **anchor** — a real-world
program or article fact, verifiable outside this repo, cited only to show the 2026 industrial
basis exists. Anchors are not this project's numbers and impose nothing on the sim; if an anchor
is found wrong, this chapter is corrected, never the kernel.

## The lineage (anchor unless tagged)

| Year | Article | What it proved | What killed it |
| --- | --- | --- | --- |
| 1959 | North American **XF-108 Rapier** | M3 area-defense interceptor closed on paper — the namesake | Cancelled before metal; ICBMs made bomber defense look obsolete |
| 1962 | Lockheed **A-12** | M3.2+ sustained, titanium hot structure; contract to first flight in ~26 months | Cost, and the SR-71 successor absorbed it |
| 1963–65 | Lockheed **YF-12A** | The mission itself: M3.2 at 80,000 ft, long-range interceptor fire control, live missile kills from high-supersonic launch | Vietnam-era money; production line ordered destroyed |
| 1965–66 | NAA **XB-70** | M3 cruise aerodynamics at scale — nine M3 flights, 33 minutes sustained at best | Same strategic pivot |
| 1966 | Lockheed **D-21** | An M3.3 ramjet **drone** at 90,000 ft — expendable, air-launched, mass-producible (captive trials from Dec 1964; first free launch Mar 1966) | Fatal launch-separation accident, 30 Jul 1966; program cost |
| 1959 | Boeing **CIM-10 Bomarc** | Ramjet interceptors built in the **hundreds** — volume at M2.8 was routine | Mission obsolescence, not manufacturability |
| 1970 | MiG-25 | The **steel trade** this bible already refuses ([20](20-thermal-and-materials.md)): M2.83 sustained in welded nickel steel, at bomber-interceptor cost | Nothing — it served for decades; it is the cost floor this program must beat |

The regime box this aircraft flies (M3.55 measured dash, FL700, guns and drones — [00](00-mission-and-ops.md))
sits **inside** the envelope the 1960s flew in service. The sim's own inlet comment already says the
quiet part: *"the aircraft is substantially inlet, D-21-like"* (`RamCaptureAreaM2` note,
`sim/FlightModel.cs`). What the 1960s could not do is what this chapter is for: the materials, the
manufacturing rate, and the crew economics.

## What is actually new since 1966 (the three real chapters)

1. **Materials** — the A-12 hand-formed titanium; the MiG-25 welded steel. This airframe zones
   SiC/SiC **CMC where the heat is and ordinary composite everywhere else** ([20](20-thermal-and-materials.md),
   the freeze). 2026 anchor: CMC is in *revenue* service in commercial engine hot sections —
   the LEAP stage-1 turbine shroud since August 2016, five CMC part families in the GE9X
   (combustor liners, HPT nozzles and shrouds) — plus hypersonic-program leading edges.
   Precision on "additive": printed **monolithic** SiC is commercial at low volume today;
   **fiber-reinforced** SiC/SiC by AM is demonstrator-stage (NASA Glenn binder-jet vanes).
   Fourteen years buys **rate production of panels, edges, lip, duct, and nozzle** — never a
   whole-CMC airframe, which the design does not ask for.
2. **Manufacturing** — the 1960s article was a hand-built jewel. This one is priced as a munition
   (~$9M class, ~2% structural life per sortie — [95](95-cost-ledger.md)); that price is only
   coherent as an **additive + out-of-autoclave production line**: printed CMC panel families,
   fiber-placed cold structure, a single-stream propulsion install with **no TVC and no second
   nozzle** (`sim/FlightModel.cs` refusal: "hot actuators, mass, maintenance and cost").
   2026 anchor: additively manufactured flight-critical engine parts fly commercially at
   scale — the LEAP fuel-nozzle tip was certified November 2015 and passed its **100,000th**
   printed unit years ago; turboprop cores fly with roughly a third of parts printed;
   printed-airframe manufacturers deliver military drones and cruise-missile airframes at
   rate today.
3. **Crew economics** — the SR-71 flew a two-man priesthood with astronaut-grade training and a
   tanker fleet. This jet flies one occupant in a reclined, windowless capsule
   ([50](50-crew-escape-fbw.md)) with the automation flying admin ([ANCA](../../superpowers/specs/2026-07-29-anca2040-design.md)) —
   because volume airframes are pointless if crews stay artisanal. 2026 anchor: sensor-vision
   cockpits are fielded (distributed-aperture systems); collaborative-combat-aircraft programs
   fly semi-autonomous fighter-class airframes with first flights inside two years of program
   start. **This is the least-anchored subsystem** — tagged provisional in the bible, and the
   windowless capsule is the one element with no fielded precedent (tag: provisional, honest).

## 2026 industrial basis, per subsystem

| Subsystem (chapter) | 1960s proof | 2026 basis (anchor) | 2026→2040 maturation burden |
| --- | --- | --- | --- |
| TBCC propulsion ([30](30-propulsion-and-inlet.md)) | J58 bleed-bypass ran as a quasi-combined cycle in squadron service | Turbojet→ramjet mode transition ground-demonstrated 2022 (Hermeus Chimera — built in 21 months for ~$18M); DARPA/AFRL TBCC lineage (FaCET, HTV-3X Blackswift, AFRE) | Flight-weight transition across M2.0–3.0 (`RamFadeStartMach`–`TurbineGoneMach`), cert of the M3.3–3.8 spill band — **the pacing item, matching the sim: engine/inlet binds first** |
| Mixed-compression inlet | A-12/SR-71 solved unstart operationally | CFD + the sticky-unstart control problem is modelled in this repo's own surrogate (`sim/RapierAerodynamics.cs`) | Unstart-tolerant control law; the sim already treats this as a first-class failure |
| CMC hot structure ([20](20-thermal-and-materials.md)) | Did not exist — the gap that forced titanium/steel | CMC hot-section parts in revenue service since 2016; printed monolithic SiC commercial, AM fiber-reinforced SiC/SiC demonstrator-stage | Panel-family rate production; **thermal-cycling life data at joints — the 2%-life cost line is secretly a fatigue claim** |
| EM launch ([80](80-basing-and-ground.md)) | Steam catapults at sea; the 520 m / 47.5 MJ / 10 MW gallery ([Beats](../../../sim/Doctrine/Beats.cs)) is milder per-metre than naval practice | EMALS at sea since 2017; a second navy **commissioned** an EM-catapult carrier in 2025 (Fujian, three catapults) | Civil-works scale, not physics: a buried lane is EMALS with unlimited prime power and no deck motion |
| Arrested recovery ([70](70-landing-gear-arrest.md)) | Solved at sea, 1950s | 35 MJ land arrestor sits inside shipboard practice — a routine operating point against Mk 7's ~64 MJ maximum (careful: Mk 7's rating is 47.5 million **foot-pounds**, numerically near the gallery's 47.5 MJ by coincidence) | Strip survivability doctrine, not hardware |
| Buried dispersed basing ([80](80-basing-and-ground.md)) | Sweden's Bas 60/90 road-base dispersal system, plus its separate early-1950s rock hangars (Barkarby/Säve class); Swiss cavern air bases; Taiwan mountain-shelter complexes | The same works, plus the 2020s dispersal lesson relearned in Ukraine | Earthworks per lane ([95](95-cost-ledger.md)) — engineering brigades, not aerospace |
| Gun ([60](60-armament-and-drones.md)) | M61 lineage in service since 1959 | M61A2 fielded; 480 rounds is a catalog item | None |
| Gun-drones ([60](60-armament-and-drones.md)) | D-21: M3.3 expendable drone flew free in 1966 | Loyal-wingman class airframes flying (XQ-58 since 2019; CCA YFQ-42A flew ~16 months from award) | Belly-cell carriage ≤ M1.6 release (drone skin limit, already canon); quiet-strip recovery if reuse is claimed |
| FBW, no mechanical fallback ([50](50-crew-escape-fbw.md)) | Analog FBW flew in the 1960s; digital since the 1970s | Commodity; triplex flight computers are the cheapest line in [95](95-cost-ledger.md) | Nothing hardware; the burden is the automation *doctrine* |
| Cold-gas RCS for zoom coast | X-15 flew peroxide RCS beyond the sensible atmosphere from 1961 (354,000 ft by 1963) | Catalog thruster hardware; 40 kg budget is small-sat scale | Integration only |

## Program shape (fiction, disciplined by anchors)

- **2026:** program start against this bible; the identity pins (`InterceptorTbccV1.cs`,
  pinned 2026-07-29) are the requirements freeze. Long-lead: TBCC core demo, CMC panel line.
- **Pace argument (anchor):** A-12 went contract → first flight in ~26 months; F-117 full-scale
  development → IOC in five years; CCA prototypes flew within two years of program start.
  Fourteen years is **triple skunk-works precedent** — the margin is for rate production and
  the automation doctrine, not for inventing physics.
- **The discipline the timeline enforces:** every requirement that arrives after the 2026 freeze
  is a 2050s aircraft trying to get out. The volume thesis is the requirements firewall — a
  50-sortie, $9M article cannot absorb exquisite growth and stay itself. (The XF-108 died of
  exactly this; the F-108's fire control survived only by escaping to a simpler airframe.)
- **Volume doctrine:** Bomarc shipped ramjet interceptors in the hundreds in 1959. The unit of
  capability is not the airframe, it is the **lane** (gallery + strip + arrestor + alert cells,
  [95](95-cost-ledger.md)) times the **line rate**. The production line is the weapon system;
  the aircraft is its ammunition.

## Sources (verified 2026-07-29; primary set held in PaperLibrary)

Adversarially verified by a five-agent web pass (zero refuted, ten nuances applied). Primary
sources are ingested in the owner's PaperLibrary corpus; the load-bearing ones:

- Robarge, *Archangel: CIA's Supersonic A-12 Reconnaissance Aircraft* (CIA CSI) — contract
  11 Feb 1960, first flight 25/30 Apr 1962.
- Merlin, *Design and Development of the Blackbird* (AIAA 2009-1522, DOI 10.2514/6.2009-1522) —
  YF-12A, F-12B termination, D-21 program.
- Johnson, *Some development aspects of the YF-12A interceptor aircraft* (J. Aircraft 1970,
  DOI 10.2514/3.44177) — the designer's own account.
- NASA FS-084-DFRC — XB-70 M3 flight record (nine M3 flights, 33 min sustained).
- Halbig et al., *Additive Manufacturing of SiC-Based CMCs* (NTRS 20160010285) and
  Chaugule et al. (DOI 10.1111/jace.19682) — the AM-CMC maturity boundary.
- Glass, *CMC TPS and Hot Structures for Hypersonic Vehicles* (DOI 10.2514/6.2008-2682);
  *Materials design for hypersonics* (Nature Comms 2024, DOI 10.1038/s41467-024-46753-3).
- Walker et al., *Falcon HTV-3X: A Reusable Hypersonic Test Bed* (DOI 10.2514/6.2008-2544) —
  the TBCC lineage.
- NAVEDTRA 14310 ch. 3 — Mk 7 arresting-gear energy (47.5 million ft-lb ≈ 64 MJ).
- Mk 7 dynamics analysis (DOI 10.1007/s12204-012-1327-4).

## Epistemic

Everything in the lineage and 2026-basis tables is **anchor** — real-world facts subject to
adversarial verification outside this repo, correctable here without touching the kernel. The
program-shape section is **fiction** disciplined by those anchors. The honest hard parts a real
2026 program would sweat are the same three the sim already flags as open findings: TBCC mode
transition across the handover band, additive-CMC joint fatigue under thermal cycling (the
2%-life line), and inlet behavior through the M3.3–3.8 spill schedule. Nothing in this chapter
claims those are easy — it claims they are **1960s-adjacent engineering plus 2026 materials**,
which is a different thing from a frontier.
