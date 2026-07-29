# Nav-fabric canon: the Routing Mesh

Date: 2026-07-29  
Status: accepted fiction (design companion)  
Setting: late 2030s → ANCA2040 curriculum horizon  
Related: [no-man's-land canon](no-mans-land-canon.md),
[shared geography design](superpowers/specs/2026-07-29-shared-geography-nav-fabric-design.md),
[ADR-0003](adr-0003-ghibli-adjacent-world-presentation.md),
[ANCA2040](superpowers/specs/2026-07-29-anca2040-design.md)

## The one-sentence truth

Across the accidental reserve, navigation is no longer a civil airway book. It is a
**machine-maintained job fabric** — the **Routing Mesh** — rebuilt by competing software agents so
aircraft, recovery drones, and medevac buses can still finish a task when every emitter is a risk
and every unverified human is a classification problem.

This is fictional worldbuilding for Guns Only / ANCA2040. It is not Jeppesen, not a forecast, and
not a claim about any real airspace system.

## Why the old plates died

Civil IFR and peacetime VFR still exist *somewhere* behind quiet borders. Inside and along the
no-man's-land they failed the job:

- published fixes and airways assumed cooperative emitters and stable sovereignty;
- spoofing, passive sensing, and exclusion polygons moved faster than human chart cycles;
- recovery and clinic access were social and machine-negotiated, not merely geometric.

Agents did what agents do: they replaced the chart with a **task graph**. Places and routes exist
because a job needs them — strip recovery, corridor transit, clinic handoff, free survey — not
because a state published an enroute plate.

## The Routing Mesh

The Mesh is the shared substrate. Scenery, the moving map, and the kernel all speak its nouns.

| Noun | In-world meaning |
| --- | --- |
| **HomePlate** | The negotiated recovery anchor for this sortie (strip, registered island, or mission home). Always the **reserve-return** truth. |
| **Place** | A named, stable Mesh node: strip, clinic, corridor gate, coastal fix, Crimea survey mark, authored landmark. |
| **Free Fix** | A pilot- or agent-dropped visual waypoint (theatre east/north). Ephemeral; not scenery authority. |
| **Published Procedure** | A machine-authored multi-fix job route (recovery, corridor, medevac). Not a civil airway. |
| **ActiveDest** | The currently selected Place or Free Fix the jet is solving toward. |
| **Tour** | An ordered list of Places / Free Fixes for open free-fly. HomePlate remains the reserve anchor. |

### Two transit grammars (not Jeppesen cosplay)

| Grammar | Pilot-facing shorthand | What it is |
| --- | --- | --- |
| **Open Segment** | “VFR” in ANCA2040 teaching language | Direct or tour navigation by eye and Mesh labels. Free-click Free Fixes allowed. Curated Places are labeled shortcuts. |
| **Hard Route** | “PROCEDURE” / teaching “IFR” | Follow a Published Procedure’s legs when the job or phase requires it (or when the pilot selects a published job). Fixes and altitudes are agent-authored for *this war system*, not copied from real plates. |

Teaching may say VFR/IFR because that is the human mental model. In fiction, both grammars are Mesh
products. Hard Routes are **AI-designed job procedures**, inventable for the programme.

### Roles (capability, not decoration)

Every Place carries a role that constrains what the Mesh may do with it:

| Role | Typical use | Selectable as ActiveDest? |
| --- | --- | --- |
| `home` | HomePlate / recovery strip | Yes, when phase allows recovery or free-fly |
| `destination` | Mission or tour stop that may be flown to | Yes, when phase/mission gates allow |
| `landmark` | Map/world label for orientation | No (label only) |
| `scenery_anchor` | Hero-cell / richness footprint for soft-world presentation | No (unless also given a nav role) |
| `procedure_fix` | Leg of a Published Procedure | Only as part of selecting/following that procedure |

Mission sorties **gate** selectability by phase (roles define capability; phase can still lock).
Free-fly / open survey opens the curated Place catalog **and** Free Fixes; combat missions stay
strictly mission-place gated unless a later beat explicitly unlocks Open Segment.

## Fuel thought is Mesh thought

Pilots (and ANCA Navigate) think in a triad the Mesh always projects:

1. **NM/MIN** — how fast the ground is being eaten  
2. **LB/MIN** — how fast the tanks are being eaten  
3. **LB/NM** — whether this speed is affordable  

And two fuel truths that must never be ambiguous:

- **Fuel aboard (lb)** — current `fuel_lb`, always visible when the nav console is relevant  
- **Reserve on return to HomePlate** — after the ActiveDest (or tour remainder), what margin remains
  against the protected reserve if the jet then recovers home

A beautiful Crimea tour is still a fuel problem with a home plate.

## Relation to the soft world

The Mesh does not paint the land. The accidental reserve remains the Ghibli-adjacent soft world
from ADR-0003 and the no-man's-land canon. The Mesh only **names jobs on that land**:

- Places with `scenery_anchor` (or co-located hero cells) are where low-level richness concentrates.
- Free Fixes never spawn villages, orchards, or clinic geometry.
- Published Procedures may follow cleared corridors and registered islands; they do not require
  the whole country to look inhabited.

Beauty outside the canopy; cold Mesh numbers on the instruments.

## Moral rules

1. **Do not cosplay real civil IFR plates or real unit locations.** Invent Mesh IDs and procedures.
2. **HomePlate is sacred for fuel honesty.** Tours and Free Fixes may wander; reserve-return math
   still closes on home.
3. **Labels are not clearances.** A landmark on the map is not permission to treat ambient scenery
   as targetable or landable truth.
4. **Agents author jobs, not glory.** Procedures exist to finish recovery, transit, and care — not
   to aestheticize the war system that emptied the green zone.
5. **Live-war care holds.** Speculative fiction labels; no identifiable real casualties or real
   tactical claims.

## Gameplay consequences

- Free-fly can plan a tour (Crimea coast, Soniachne, strip) with live triad + reserve-on-return.
- Mission sorties only offer the Places the beat needs; phase can unlock recovery HomePlate.
- The moving map under NAVIGATION is a Mesh consumer, not a second geography.
- Scenery richness follows Place footprints; the regional DEM stays macro between them.
- Later Hard Routes (agent procedures) plug into the same Place / fix vocabulary without renaming
  the soft world.

## Epistemic label

`fiction` — programme worldbuilding for ANCA2040 / Guns Only. Not operational doctrine for any
real air force or ATS provider.
