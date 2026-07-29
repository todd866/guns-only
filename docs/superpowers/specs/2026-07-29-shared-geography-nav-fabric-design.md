# Shared geography + Routing Mesh — design

Date: 2026-07-29  
Status: accepted design (brainstormed with owner; implementation plan in progress)  
Canon: [nav-fabric-canon.md](../../nav-fabric-canon.md)  
Related: [no-man's-land canon](../../no-mans-land-canon.md),
[ukraine-low-level-scenery.md](../../ukraine-low-level-scenery.md),
[rewild-zone scenery](2026-07-27-rewild-zone-scenery-design.md),
[art-direction.md](../../art-direction.md),
[ANCA2040](2026-07-29-anca2040-design.md)

## Goal

Define one **shared geography contract** so soft-world scenery and the interactive moving map
under `#nav-console` consume the same Mesh nouns — then sequence follow-on work:

1. This contract + Routing Mesh canon (this doc + canon)  
2. Scenery richness bound to Place footprints (Ghibli-adjacent depth where jobs live)  
3. Moving map + ActiveDest selection + nav solution UI  

## Non-goals

- Implementing scenery meshes or the map in this document  
- Copying Jeppesen / real civil IFR plates or real coordinates-as-tactical-truth  
- Making ambient procedural houses into destinations  
- Replacing ANCA’s view-only doctrine for the SA panel (the **nav console + map** are the
  interactive surface; ANCA Navigate continues to *display* Mesh truth, not invent chores)  
- Authoritative LZ / landing clearance (still `unassessed` until later surface products)

## Locked decisions

| Decision | Choice |
| --- | --- |
| Packaging | Canon doc + engineering contract (Approach 1); no mega-registry pack in v1 |
| Place set | Trends **mission-specific**; free-fly adds a **curated theatre catalog** + **Free Fixes** |
| Selectability | **Roles + mission phase gates** |
| Free-fly | Curated Places **and** free-click Free Fixes; multi-leg **Tour** optional |
| Missions | Strictly mission-place gated unless a beat unlocks Open Segment |
| Reserve math | Always closes on **HomePlate** after ActiveDest / tour remainder |
| VFR/IFR language | Teaching shorthand for **Open Segment** / **Hard Route** (invented Mesh; not Jeppesen) |
| Doctrine depth | Full in-world canon pass (`docs/nav-fabric-canon.md`) before scenery/map implementation |
| Fuel aboard | Current `fuel_lb` is first-class on the nav surface (already in snapshot; must stay obvious) |

## Architecture

```text
Routing Mesh canon (fiction vocabulary)
        |
        v
Shared geography contract (this spec)
   Place catalog (mission packs + free-fly catalog)
   Free Fix / Tour / ActiveDest / HomePlate (kernel)
        |
   +----+--------------------+
   |                         |
   v                         v
Soft-world scenery           Nav console + moving map
(Place footprints,           (select, solution triad,
 hero cells, rewild)          reserve-on-return)
        |
        v
ANCA Navigate row (view-only projection of Mesh / fuel truth)
```

SimulationSession remains authoritative for ActiveDest, HomePlate, and fuel solution numbers.
Presentation may decorate Places; it may not invent selectable destinations that the kernel does
not know, and it may not invent fuel answers from TAS alone (existing RTB honesty rule).

## Place schema (shared)

A **Place** is a stable Mesh node in theatre local metres (existing Ukraine frame).

Minimum fields:

| Field | Meaning |
| --- | --- |
| `placeId` | Stable string ID (content-pack scoped) |
| `displayName` | Pilot-facing label |
| `eastM`, `northM`, `upM?` | Theatre frame position (up optional; sample ground when omitted) |
| `role` | `home` \| `destination` \| `landmark` \| `scenery_anchor` \| `procedure_fix` |
| `navSelectable` | Capability bit derived from role (see table in canon); phase may still lock |
| `sceneryBind` | Optional hero-cell / footprint id for richness |
| `missionIds` / `catalogIds` | Which missions or free-fly catalogs expose this Place |
| `phaseGate` | Optional: phases in which selection is allowed |

**Free Fix:** ephemeral `{ eastM, northM, label? }` created by map click in Open Segment. Not a
Place. No scenery bind. May be added to a Tour.

**HomePlate:** the sortie recovery Place (or equivalent kernel recovery point). Always defined
when recovery navigation is known. Tour and ActiveDest never replace HomePlate as reserve-return
anchor.

**ActiveDest:** kernel-owned selection — either a Place id or a Free Fix. Cleared / replaced by
explicit pilot action on the nav map (or mission scripting).

### Selectability rules

1. Role grants base capability (`home`/`destination` selectable; `landmark`/`scenery_anchor` not).  
2. Mission phase may lock an otherwise capable Place.  
3. Free-fly / open survey: curated catalog Places that are `destination` or `home` are selectable;
   Free Fixes always selectable as ActiveDest.  
4. Combat/mission sorties: only Places listed for that mission (and passing phaseGate).  
5. Selecting ActiveDest commits immediately when the Place/Fix is selectable (mission-gated model);
   non-selectable Places are labels/context only on the map.

## Nav solution contract

When ActiveDest is set, the kernel (or an existing recovery-nav projection generalized) publishes
at least:

| Quantity | Notes |
| --- | --- |
| Bearing / range / turn | To ActiveDest |
| ETA / closure | When inbound math is honest; withhold when AWAY/ABEAM rules say so |
| NM/MIN, LB/MIN, LB/NM | The triad — always when groundspeed + burn known |
| Fuel aboard (lb) | `fuel_lb` — always when known; first-class on console |
| Fuel to ActiveDest (lb) | Required to reach dest at current economy assumptions |
| Fuel on arrival at dest (lb) | Aboard minus fuel-to-dest |
| Fuel to HomePlate after dest (lb) | Leg dest → home (or tour remainder → home) |
| Reserve target / margin on return | Protected reserve vs projected fuel after home recovery |

Tour mode (free-fly): solution may show next Tour stop as ActiveDest while still projecting
**reserve on return to HomePlate** after the remaining Tour legs (v1 may approximate remaining
tour as polyline great-circle legs at current LB/NM).

Do **not** manufacture fuel-to-home from TAS when the existing honesty rules withhold it.

### Nav console UI obligations (follow-on)

- Keep `#nav-console` as the interactive home; map sits **under** the existing indications.  
- **Fuel aboard** must read as current pounds, not buried or stuck on `--` when `fuel_lb` is live.  
- Destination label shows Place displayName or Free Fix label / coordinates.  
- ANCA Navigate remains view-only SA over the same numbers.

## Scenery bind (follow-on consumer)

Scenery richness (next programme slice after this contract) must:

- Concentrate Ghibli-adjacent micro detail on Place footprints / `scenery_anchor` / hero cells.  
- Keep regional DEM + land-cover bake as the macro between Places (no country-wide prop carpet).  
- Never treat Free Fixes as scenery seeds.  
- Respect ambient exclusion zones around authored feature packs.  
- Preserve 60 fps presentation contract and altitude hierarchy from ukraine-low-level-scenery.

This design does not pick specific mesh techniques; it only locks **where** richness is allowed to
spend budget.

## Moving map bind (follow-on consumer)

The map under `#nav-console` must:

- Render theatre geography enough to orient (soft-world palette; not a second art bible).  
- Show Places from the active mission set **or** free-fly catalog (mode-dependent).  
- Show HomePlate and ActiveDest distinctly.  
- Allow click → Free Fix (Open Segment / free-fly only) or select selectable Place.  
- Refuse selection UI for landmark-only / phase-locked Places (still visible as labels).  
- Drive the nav solution readouts from kernel projection, not client-side guesswork.

Hard Route / Published Procedure following is **stubbed** in v1 map UX: Places and Free Fixes ship
first; procedure polylines can appear as non-interactive labels until a later slice.

## Content authorship (v1)

1. **Mission feature packs** — may declare or reference Places (extend
   `navigationAuthority` beyond `"none"` when a pack owns selectable Mesh nodes).  
2. **Free-fly catalog** — small versioned JSON list of curated theatre Places (Crimea coast mark,
   Soniachne, Rapier strip, a few survey fixes). Hand-authored; no mega-registry CMS.  
3. **Kernel HomePlate** — continues from recovery point / strip truth already projected.

Ambient Korea/Ukraine procedural buildings remain `role: ambient` decoration and **do not** enter
the Place catalog.

## Error handling

| Case | Behaviour |
| --- | --- |
| Unknown ActiveDest id | Clear selection; console shows unknown; no invented fuel |
| Click landmark / phase-locked Place | No ActiveDest change; optional brief “not selectable” cue |
| Free Fix outside theatre bounds | Reject click; keep prior ActiveDest |
| Missing `fuel_lb` | Fuel aboard `--` / unknown; do not fabricate |
| Tour empty | Open Segment still allows single ActiveDest Free Fix / Place |

## Testing

- Unit: Place selectability (role × phase × mode).  
- Unit: nav solution reserve-on-return closes on HomePlate with fixed burn/GS fixtures.  
- Unit: Free Fix cannot attach scenery bind.  
- Presentation: nav console shows live `fuel_lb` when snapshot has it.  
- Contract: mission pack with `navigationAuthority: none` exposes no newly selectable Places.  
- Perf: map + scenery follow-ons still pass ukraine hero gate / frame governor rules (measured in
  those slices, not this doc).

## Success criteria

- Canon + this spec are the shared vocabulary for scenery and map work.  
- A free-fly tour of curated Places (e.g. Crimea mark → strip) can be described without a second
  geography model.  
- Mission sorties cannot free-click arbitrary combat destinations unless a beat unlocks Open Segment.  
- Fuel aboard and reserve-on-return-to-HomePlate are explicit product requirements for the map
  slice.  
- No Jeppesen cosplay; Hard Routes remain inventable Mesh fiction.

## Implementation order (after user approves this spec)

1. Writing-plans → thin kernel/content seams for Place catalog + ActiveDest + solution fields.  
2. Scenery richness plan bound to Place footprints.  
3. Moving map plan under `#nav-console`.  

Do not start scenery or map implementation until the corresponding plan exists.
