# Rapier crew-ingress concept v1

Status: **reference-only mechanism/packaging study; not geometry, structure, escape, rescue, or
human-factors authority**

- Generated: 2026-07-30
- Raster: `rapier-crew-ingress-concept-v1.png`, 1536 × 1024 PNG
- SHA-256: `8d028329f80109b72762fb85c00e2dcf5a4a337ec8ab1efba2ec3c30ad82538b`
- Generator: built-in OpenAI image-generation tool; the tool response exposed neither a model
  revision nor a seed
- Aircraft input: `rapier-airframe-concept-v3-low-fin.png`
- Engineering source:
  [`../51-crew-ingress-egress-and-rescue.md`](../51-crew-ingress-egress-and-rescue.md)

## What the sheet proposes

1. A protected-cell bridge docks without loading the wing.
2. A captive, load-bearing opaque outer-skin plug lifts away.
3. A separate opaque pressure hatch opens only after the escape system is safe and the capsule is
   depressurised.
4. A powered reclined couch sled raises the restrained pilot to the bridge for connection and
   lowers them into the fixed buried capsule.
5. Both pressure hatch and structural plug close before the aircraft leaves the cell; the exterior
   returns to one smooth, opaque outer mould line.

Normal boarding moves the couch, not the complete escape capsule. Flight escape would move the
complete sealed capsule after a separate outer-plug clearance event. Ground rescue uses the hatch
and couch path after positive safing; it does not fire the capsule by default.

## Review

Useful:

- clearly separates structural outer plug from capsule pressure hatch;
- never uses glass, a canopy or a raised cockpit volume;
- makes the protected bridge and reclined boarding posture immediately legible;
- panel four shows the capsule above a distinct propulsion tunnel rather than replacing it;
- demonstrates why capsule fit, hatch ring and load-path routing need a real section model.

Known mismatches and omissions:

- no panel is dimensionally registered to the current loft;
- the pressure hatch, outer plug, latches, frames, seals, bridge and sled are generated mechanisms,
  not selected hardware;
- panel four is a communication cutaway, not proof that a clothed human, pressure shell, structure,
  duct insulation and required clearances fit;
- the couch appears close to the propulsion tunnel and therefore reinforces the P0 packaging
  concern in chapter 51;
- no separation guides, recovery pack, escape propulsion, hatch-clearance trajectory, alternate
  rescue cut zone, pressure plumbing, fire barrier or damaged-aircraft access is solved;
- the pilot and technicians provide scale, not an accepted anthropometric population or procedure;
- no radar, thermal, structural or aerodynamic continuity follows from the attractive flush plug.

## Exact prompt

> Use case: storyboard
>
> Asset type: engineering-worldbuilding crew-ingress concept sheet for a fictional game aircraft
>
> Input images: Image 1 is the exact current low-fin Rapier visual candidate. Preserve its long
> needle nose, smooth unbroken upper mould line, low cranked-delta wing, compact twin fins, single
> ventral inlet, single aft nozzle, compact landing gear, material palette and complete absence of
> cockpit bump, canopy, windscreen, glass or visible cockpit.
>
> Primary request: Create one landscape 2-by-2 engineering storyboard contact sheet, four equal
> panels with thin neutral gutters and no captions or text, explaining exactly how one pilot enters
> the completely buried fully reclined capsule while the aircraft is cold inside its earth-covered
> alert cell. Keep aircraft geometry, hatch location and ground equipment consistent across panels.
>
> Panel 1 — docked and closed: front-quarter/top view of the cold aircraft inside the compact
> concrete alert cell. A narrow height-adjustable boarding bridge docks to dedicated hardpoints over
> the forward centrebody without loading the wing. The dorsal structural outer-skin plug is fully
> closed, opaque, load-bearing and perfectly flush; it must not resemble a canopy. Ground power and
> conditioned-air lines are attached. No engine operation.
>
> Panel 2 — two separate boundaries: close engineering view from above. The bridge's captive hoist
> has lifted the opaque structural outer-skin plug nearly vertically. Beneath it is a smaller,
> still-closed opaque capsule pressure hatch inside a dry interstitial bay. Clearly show perimeter
> frame, shear keys/latches and double-boundary architecture. No transparent surfaces and no seat
> protruding yet.
>
> Panel 3 — loading position: the smaller pressure hatch is open and captured by the bridge. A
> powered reclined couch sled has raised and translated a fully reclined suited pilot to the
> opening; two technicians on the protected bridge connect restraints, breathing gas,
> communications and head support. The pilot remains lying back at roughly 65–70 degrees from
> upright and never stands or climbs into a conventional cockpit. Keep the complete escape capsule
> fixed inside the aircraft.
>
> Panel 4 — flight position cutaway: clean side-section/three-quarter engineering cutaway of the
> same forward centrebody after the couch sled has lowered and translated the restrained pilot down
> and aft into the opaque buried pressure/escape capsule. Show the pressure hatch closed, structural
> outer plug closed flush, short self-locking couch guides with mechanical flight pins, capsule
> shell and releasable services. Show the ventral inlet/propulsion tunnel below as a distinct
> non-intersecting volume and primary structure routed around the dorsal opening. The exterior upper
> line remains smooth with no bump.
>
> Style/medium: realistic aerospace industrial concept art with restrained painterly finish and
> cutaway clarity, physically credible mechanisms, muted grey-green composite and warm alert-cell
> lighting, analytical rather than spectacular.
>
> Constraints: same aircraft and same opening in every panel; outer structural plug and inner
> pressure hatch are visibly separate; hatch surfaces are opaque composite, never glazing; bridge
> equipment owns and captures both covers; powered couch moves for boarding but complete escape
> capsule stays fixed; no readable text, logos, numbers or watermark.
>
> Avoid: canopy, windscreen, glass, cockpit bubble, raised fairing, visible exterior cockpit, upright
> ejection seat, pilot crawling feet-first, pilot standing on the wing, side door through a
> longeron, capsule lifted out for routine boarding, propulsion tunnel intersecting the pilot,
> fantasy holograms, exposed weapons, engine exhaust, crowds, hospital imagery, gore, fisheye.

## Promotion gate

Before any geometry promotion, run the chapter-51 clothed-human and structure/duct digital mock-up,
then a full-size boarding/rescue buck. The image fails closed if the selected population,
pressure-shell thickness, hatch structure, bridge clearances, manual rescue path and propulsion
clearance do not fit simultaneously.
