# Rapier ground-cycle concept v1

Status: **reference-only ground-system trade; not a construction, geometry, safety, or operating
source**

- Generated: 2026-07-30
- Raster: `rapier-ground-cycle-concept-v1.png`, 1536 × 1024 PNG
- SHA-256: `22aa6274c4119a89b41fa47acd6252d2b87a404901b83994ea1226da57a60d54`
- Generator: built-in OpenAI image-generation tool; the tool response exposed neither a model
  revision nor a seed
- Aircraft input: `rapier-airframe-concept-v2.png`
- Final state: targeted low-fin edit applied consistently across all four panels

This sheet answers four worldbuilding questions visually:

1. the aircraft lives cold in a dispersed earth-covered alert cell, not in the launch bore;
2. it moves on a low three-wheel-pan omnidirectional transporter rather than self-taxiing;
3. a rear handling hall aligns it onto a captive three-point launch shuttle; and
4. the shuttle supports the aircraft mechanically on guide rails while separate stators accelerate
   it.

The four images are hypotheses derived from
[`../83-ground-cycle-and-facility.md`](../83-ground-cycle-and-facility.md). They do not close wheel
stations, load paths, transporter suspension, blast doors, capsule hatch, shuttle mass, guide-rail
section, stator geometry, holdback, release, abort, braking, runout, exhaust handling, fire
separation or personnel-safe distances.

## Review

Useful:

- the no-canopy/no-cockpit-bump aircraft remains readable in every panel;
- the alert cell is compact and earth-covered rather than a conventional fighter hangar;
- the transporter makes fixed-wing movement legible without inventing self-taxi;
- the handling hall, shuttle, guideway and personnel scale make the hidden ground system tangible;
- the low-fin correction prevents an unproved legacy tail from becoming visual canon.

Known mismatches and omissions:

- the generated aircraft, gear, transporter and shuttle are not dimensionally registered;
- the three-point shuttle contacts, independent aft-keel holdback and four load cells are not
  unambiguously readable in every view;
- the panel-three handoff machinery is suggestive rather than an executable transfer sequence;
- the panel-four rail/stator split is not authoritative;
- capsule boarding appears only as a generic service platform and hatch line;
- the exhaust collector, fire shutter, drainage, coolant, pressure relief, egress and failure
  provisions are incomplete;
- the prompt's people and machinery provide scale but not staffing or certified procedure;
- no panel resolves the launch-shuttle stopping/runout contradiction.

## Exact initial prompt

> Use case: storyboard
>
> Asset type: engineering-worldbuilding ground-cycle concept sheet for a fictional game aircraft
>
> Input images: Image 1 is the exact Rapier aircraft visual candidate. Preserve its distinctive long
> needle nose, smooth unbroken upper mould line, short low-aspect-ratio cranked-delta wing, twin aft
> fins, single aft nozzle, compact tricycle gear, grey-green composite skin, dark lower surface, and
> brown-grey CMC hot edges. The pilot capsule is completely buried inside the body: there is no
> cockpit bump, canopy, windscreen, glass, window, dorsal ridge, or visible pilot.
>
> Primary request: Create one landscape 2-by-2 cinematic engineering storyboard contact sheet, four
> equal panels with thin neutral gutters and no captions or text, showing the same aircraft and the
> same concealed launch installation through its complete alert-to-rail sequence. Keep aircraft
> geometry and markings consistent across all panels.
>
> Panel 1 — storage: the Rapier sits cold inside one compact dispersed earth-covered alert cell,
> approximately 18 m long by 14 m wide by 6 m high clear, reinforced concrete with a broad low
> blast-resistant door, subdued maintenance lighting, ground-power cable, a small crew access
> platform beside a flush dorsal service hatch, no conventional hangar clutter and no other
> aircraft.
>
> Panel 2 — transfer: the cold aircraft is fully supported by a very low 15-tonne omnidirectional
> electric transporter with three wheel pans under nose and main gear, moving along a 12 m clear
> hard-surface route screened by grassed berms. Show the fixed 7.35 m wing fitting with sensible
> clearance. Two restrained wing walkers provide scale; no self-taxi exhaust.
>
> Panel 3 — rear handling hall: an industrial 20 m by 16 m reinforced-concrete hall behind the launch
> bore. A floor traverser precisely aligns the aircraft over a captive three-point launch shuttle.
> Make the mechanical interface legible: reinforced nose/keel launch link, two main-gear saddles,
> separate aft-keel holdback, four load-cell housings, external power/data/cooling umbilical,
> inspection pit, and a retractable aft exhaust collector. The transporter is rolling clear. The
> aircraft remains wheels-down.
>
> Panel 4 — staged launch: front three-quarter view in the start cell, same smooth canopyless Rapier
> locked to the captive shuttle at the head of a 14 m wide by 8 m high concrete gallery. Clearly
> distinguish two load-bearing mechanical guide rails from separate segmented linear-motor stator
> modules. Show rear fire shutter and exhaust collector behind the nozzle, personnel fully clear,
> restrained amber service light, cool daylight far down the bore. No levitation and no launch
> motion yet.
>
> Style/medium: realistic aerospace industrial concept art with restrained painterly finish,
> physically credible civil/mechanical engineering, muted Ukraine-steppe palette, analytical rather
> than spectacular.
>
> Lighting/mood: cool overcast daylight outside, warm shielded amber within concrete cells, calm
> readiness, subtle operational wear.
>
> Constraints: exact aircraft bilateral symmetry except perspective; one aircraft per panel; same
> aircraft proportions in every panel; fixed wing; wheels down; one ventral inlet and one nozzle; no
> external stores; no readable text, logos, numbers or watermark.
>
> Avoid: cockpit bump, canopy, windscreen, glass, bubble sensors, visible pilot, raised escape spine,
> nose intake, side intakes, twin exhausts, tailplane, canards, wing fold, carrier deck, conventional
> airport hangar, taxiing under power, maglev, hovering, glowing rails, neon, lightning, giant
> sparks, fantasy doors, missiles, launch fireball, crowds, clutter, fisheye.

## Exact low-fin edit prompt

> Use case: precise-object-edit
>
> Asset type: engineering-worldbuilding ground-cycle storyboard refinement
>
> Input images: Image 1 is the edit target, a four-panel contact sheet.
>
> Primary request: In all four panels, change only the same aircraft's two oversized vertical fins.
> Reduce both fins consistently to low, compact, cropped, slightly outward-canted twin fins
> approximately half the current visible height and substantially less area, matching the low-fin
> Rapier trade. Retain their aft root locations, thin section, bilateral symmetry, small muted
> burnt-orange tip panels, and subtle rudder hinge seams. They must no longer dominate the
> silhouette.
>
> Constraints: preserve the four-panel layout, gutters, exact smooth canopyless aircraft body and
> wing in every panel, buried capsule with no cockpit bump, all transporter/shuttle/rail/alert-cell
> machinery, people, camera angles, lighting, terrain, concrete, crop, scale, palette and all other
> details unchanged. No text, logos, numbers or watermark.
>
> Avoid: changing any ground equipment or architecture; deleting fins; adding a center fin, ventral
> fins, canards, tailplane or winglets; adding a cockpit/canopy/windscreen/glass; changing any panel
> composition.

## Promotion gate

Do not ask a video model to animate this sheet. First export the live camera and aircraft/shuttle
geometry, close the aircraft/shuttle ICD and runout decision, then use controlled video only for
registered surface light, exhaust shimmer and restrained particulate response. The aircraft,
shuttle, rails, portal, personnel exclusion and timing remain live-engine truth.
