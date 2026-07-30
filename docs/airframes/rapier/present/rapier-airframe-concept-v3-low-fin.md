# Rapier airframe concept provenance

Status: **reference-only visual trade; not geometry authority**

Generated with the built-in OpenAI image-generation tool on 2026-07-30. The tool response exposed
neither a model revision nor a seed.

## Asset chain

| Asset | Size | SHA-256 | Review status |
| --- | ---: | --- | --- |
| `rapier-airframe-concept-v1.png` | 1536 × 1024 | `176bdac7519e8334504a45589528893084e1837775f714f4d3d0fbda04ba3702` | **Rejected.** It preserved the superseded raised escape/sensor spine and turned two sensor apertures into glossy cockpit-like blisters. |
| intermediate flush-sensor edit | 1536 × 1024 | not retained as a project asset | **Rejected as a destination.** It removed the glossy blisters but retained the raised spine. |
| `rapier-airframe-concept-v2.png` | 1536 × 1024 | `da18499abc52d6838d9bf29114b1af25a84b93c57ee599d9aef5236596167e94` | **Superseded trade.** It correctly removed every cockpit bump, but inherited the unproved 2.22 m-tall fins. |
| `rapier-airframe-concept-v3-low-fin.png` | 1536 × 1024 | `ab5d615ce271c425cb05839ba94c2e71ac08940204b0f5eaf71696160a447808` | **Superseded visual trade.** It preserves the buried capsule and tests materially lower twin fins, but also preserves the initial prompt's false bilateral muzzle cue. |

The source geometry image was a Quick Look render of
[`../blueprints/plate-01-three-view.svg`](../blueprints/plate-01-three-view.svg):

- source SVG SHA-256:
  `46dd1c832d62d9a411d3594210cd0aeb2c544d20ba42f39940540de974a267c2`;
- rendered input SHA-256:
  `0260b1a6e87f36f7c457a73e7650f5d22c81846895de2c04b38312fbf0219cc6`.

The source plate predates the owner's buried-capsule direction and the directional-stability trade.
It constrained the broad planform family, not the raised spine or final fin geometry.

## What v3 is useful for

- the first coherent exterior answer to “what does a Rapier look like?”;
- a no-canopy, no-windscreen, no-cockpit-bump reading at beauty-view distance;
- cranked-delta proportion, single-inlet/single-nozzle, compact-gear and material-language review;
- a low-fin silhouette to carry into CFD, tunnel and signature trades.

Its bilateral muzzle treatment is **rejected**. The aircraft has one gun and its one physical
aperture remains a packaging decision. The corrected current visual candidate is
[v4 — no gun cue](rapier-airframe-concept-v4-no-gun-cue.md).

## What v3 does not prove

- exact orthographic geometry, span, length, loft, area ruling or volume;
- buried-capsule, hatch, gun, drone, duct, fuel or gear packaging;
- inlet capture area or inlet-to-nozzle continuity;
- landing-gear stations, track, tyre size, hook geometry or launch fitting;
- fin area, tail volume, `Cnβ`, `Cnr`, `Cnδr`, hinge moment, buffet or failure tolerance;
- radar, infrared, visual, acoustic or electromagnetic signature;
- structural, thermal, flutter, flight, launch or recovery qualification.

The generated underside opening and landing gear are especially provisional. Do not trace this
raster into the runtime mesh. Promote geometry only through the versioned airframe definition and
the source-locked airframe engineering loop.

## Exact generation prompts

### v1 — initial concept

> Use case: stylized-concept
>
> Asset type: engineering-aware game aircraft concept art; first authoritative visual candidate for
> the fictional Rapier interceptor
>
> Input images: Image 1 is the authoritative dimensioned geometry reference. Preserve its exact
> overall planform family, 13 m length to 7.35 m span proportion, short low-aspect-ratio
> cranked-delta wing, long slender area-ruled body, and twin aft fins. Do not copy its typography or
> diagram layout.
>
> Primary request: Render one physically coherent Rapier aircraft as a highly resolved
> industrial-design concept, grounded in the supplied three-view rather than a generic sci-fi
> fighter.
>
> Scene/backdrop: clean aircraft integration hall with a matte light-neutral floor and unobtrusive
> shadow; no personnel, vehicles, weapons carts, scenery, or dramatic background.
>
> Subject: single 2040 dispersed land-based turbo-ramjet interceptor, parked on compact tricycle
> landing gear, seen from a slightly elevated front three-quarter angle so the top planform and
> underside inlet are both legible. Long needle nose; maximum fuselage width only about 1.5 m; thin
> sharp cranked-delta wing; twin slightly outward-canted vertical fins; one single circular aft
> nozzle. A small raised opaque dorsal sensor-and-escape capsule blends into the forward-mid spine;
> it has no transparent canopy and no windows. One blended ventral oval inlet begins well behind the
> needle nose, feeding one straight lower propulsion tunnel. Two small gun muzzle apertures sit
> symmetrically low in the forward fuselage. Four flush rectangular belly drone-cell door seams are
> subtle and closed. Landing gear is recovery-light and compact, not massive bomber gear. Include a
> visible but plausible nose-gear launch-bar/hardpoint interface.
>
> Style/medium: realistic aerospace industrial concept render with restrained painterly finish;
> believable manufactured aircraft, not fantasy key art.
>
> Lighting/mood: soft overcast hangar daylight, analytical and calm, enough edge light to read the
> silhouette.
>
> Color palette: weathered grey-green upper composite, dark charcoal lower surfaces, brown-grey
> as-fired SiC/SiC hot leading-edge inserts, inlet lip and nozzle fairing, nearly black opaque sensor
> spine, small muted burnt-orange tip identification panels only.
>
> Materials/textures: composite sandwich panels with sparse service seams and fasteners; segmented
> CMC thermal joints at leading edges, inlet lip and aft hot zone; modest operational wear and heat
> discoloration; no glossy stealth coating.
>
> Constraints: exact bilateral symmetry except camera perspective; aircraft fully inside frame;
> strong readable silhouette; physically continuous inlet-to-nozzle body; one inlet, one nozzle; no
> external stores; no markings, logos, text, numbers, watermark, pilot or exposed cockpit.
>
> Avoid: front/nose intake; side intakes; twin engines or twin exhausts; transparent canopy;
> conventional swept fighter wings; straight wings; tailplane; canards; stealth-fighter faceting;
> F-22/F-35/SR-71 imitation; missile pylons; oversized landing gear; excessive greebles; hovering;
> science-fiction glow; blue neon; impossible panel seams.

### Intermediate edit — flush sensor apertures

> Use case: precise-object-edit
>
> Asset type: engineering-aware aircraft concept refinement
>
> Input images: Image 1 is the edit target.
>
> Primary request: Change only the two small glossy black bubble-like protrusions on the forward
> dorsal spine. Replace them with low-profile, flush, opaque matte-black sensor aperture panels
> integrated into the spine surface; they must not resemble canopy glazing, windows, eyes, domes, or
> a cockpit.
>
> Constraints: preserve the aircraft silhouette, exact planform, nose, wings, twin fins, spine
> volume, single nozzle, landing gear, materials, panel layout, camera angle, crop, scale, lighting,
> floor, shadows, palette and all other details unchanged. No transparent surfaces. No text, logos,
> markings, people or watermark.
>
> Avoid: redesigning the aircraft; adding or removing gear; changing the inlet; adding cockpit
> glass; changing the background.

### v2 — buried-capsule correction

> Use case: precise-object-edit
>
> Asset type: engineering-aware aircraft concept refinement
>
> Input images: Image 1 is the edit target.
>
> Primary request: Remove the entire long raised dorsal spine/bump from the aircraft. The pilot is
> fully reclined in a sealed capsule completely buried inside the jet's centerbody, so the upper
> outer mould line must be low, smooth, continuous and unbroken from the needle nose through the
> wing-body center section. Integrate only a few truly flush, opaque, matte sensor aperture tiles
> directly into that smooth upper skin; no raised fairing of any kind.
>
> Constraints: no cockpit bump, no canopy, no windscreen, no glass, no domes, no visible pilot.
> Preserve the exact cranked-delta planform, nose length, wing outline, twin fins, single nozzle,
> landing gear, central body width, underside inlet, materials, thermal leading edges, camera angle,
> crop, scale, lighting, floor, shadows, palette and all other details unchanged. Keep enough
> internal centerbody thickness to plausibly contain a fully reclined capsule, but do not create an
> exterior hump. No text, logos, markings, people or watermark.
>
> Avoid: merely darkening the old spine; any ridge or raised crew enclosure; transparent sensors;
> changing the wings, fins, intake, nozzle, gear or background.

### v3 — low-fin trade

> Use case: precise-object-edit
>
> Asset type: engineering-aware aircraft concept refinement
>
> Input images: Image 1 is the edit target.
>
> Primary request: Change only the two oversized vertical fins/rudders. Reduce both to low, compact,
> cropped, slightly outward-canted twin fins approximately 1.15–1.25 metres high above the upper
> skin, about half the existing visible height and substantially less area. Keep their aft root
> locations, structural blending, bilateral symmetry, thin section, muted burnt-orange tip
> identification panels, and subtle separate rudder hinge seams. The result should still visibly
> provide directional stability but no longer dominate the aircraft silhouette.
>
> Engineering intent: provisional low-fin trade for a single-engine Mach-3-class tailless
> cranked-delta interceptor. Yaw control is shared with differential elevons/drag-rudder scheduling
> and finite cold-gas RCS, so the fins must look deliberately modest rather than bomber-sized.
>
> Constraints: preserve the aircraft's exact smooth unbroken upper mould line, completely buried
> opaque pilot capsule, absence of cockpit/canopy/windscreen/glass, long needle nose, cranked-delta
> wing outline, centerbody, underside inlet, single nozzle, landing gear, sensor tiles, panel seams,
> materials, camera angle, crop, scale, lighting, floor, shadows, palette and every other detail
> unchanged. No text, logos, markings, people or watermark.
>
> Avoid: deleting the fins entirely; adding a center fin; adding ventral fins, canards, tailplane or
> winglets; creating tall fighter fins; changing the wing; creating a cockpit bump; changing any
> background detail.

## Review decision

Retain v3 only as provenance for the low-fin edit. Its low-fin silhouette is a deliberately
aggressive visual hypothesis: the current JSON surfaces are visually large and not yet
aerodynamically justified, but the accepted replacement cannot be selected until the
directional-stability trade closes. Its bilateral muzzle cue is rejected and removed in v4.
