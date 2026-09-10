# Rapier visual direction: Hermeus Ramjet-X

Recorded 10 September 2026. The Build 358 candidate implements the appearance pass below.

## Owner direction and reference

On 10 September 2026 the owner requested: “also check out Hermeus and their airlaunched ramjet,
that should be the design inspiration for rapier”.

**Ramjet-X is the primary visual reference for the next Rapier pass.** It is the strongest match
for that description: Hermeus announced it on 9 September as an expendable ramjet vehicle carried
to launch conditions by reusable Quarterhorse. The carrier returns after release. Engine testing
is underway, with integrated vehicle tests planned for 2027. The announcement describes development,
not demonstrated aircraft performance, and provides no numerical speed, dimensions, range,
endurance or payload capacity. [Hermeus announcement](https://www.hermeus.com/article/hermeus-unveils-ramjet-x)

Chimera is a separate reference: Hermeus's turbine-based combined-cycle engine family combines a
turbine, precooler, bypass and ramjet. The aircraft roadmap describes Mk 3's intended in-flight
mode transition and Darkhorse as reusable and uncrewed. Do not conflate those runway-capable
aircraft with Ramjet-X. [Hermeus propulsion](https://hermeus.com/propulsion),
[aircraft roadmap](https://www.hermeus.com/aircraft)

A ramjet depends on forward speed and cannot produce static thrust. This explains Ramjet-X's
carrier launch; it does not substantiate Rapier's fictional turbine/ram-path performance.
[NASA Glenn: Ramjet Propulsion](https://www.grc.nasa.gov/www/k-12/BGP/ramjet.html)

## Visual guidance

The announcement's hero illustration, `RJX_Still_02_16x9.png`, was inspected on the official page
on 10 September 2026. It shows a side view on a handling cradle. The useful cues are:

- A long, narrow, smooth body with an uninterrupted upper contour and no visible cockpit glazing.
- Compact angular wing and fin silhouettes subordinate to the body.
- A restrained silver-grey finish, subtle panel breaks and localized dark areas.
- Simple ground-handling equipment and little decorative clutter.

These are observations of published artwork, not measured geometry or evidence of production
materials, internal packaging or control authority.
[Official illustration](https://www.hermeus.com/article/hermeus-unveils-ramjet-x)

For Rapier, use that visual economy to make the fuselage, inlet, thin wing and single exhaust carry
recognition. Review front, side and three-quarter views of the actual v2 mesh. Changes to inlet
location, planform or fins belong in the canonical geometry and regenerated engineering; a poster
must not become a second airframe definition.

## Fiction and engineering boundaries

The [current v2 design](README.md) is a fictional crewed interceptor with a buried opaque capsule,
cranked delta, ventral inlet, shared propulsion tunnel/nozzle, catapult launch and arrested
recovery. The visual-reference request does not by itself replace these operating requirements
with Ramjet-X's expendable, uncrewed air-launch mission.

Hermeus's program does not validate Rapier's thrust, heating, materials, internal layout or flight
envelope. Preserve the fiction and provisional labels in the [source ledger](00-sources.md).
The [canonical airframe definition](../../../airframes/rapier.v2.json) and its
[derived engineering](10-shape-derived-engineering.md) remain the synchronized implementation
authority. The [historical v1 directory](../rapier/README.md) is superseded.

Keep manufacturer reference images linked and attributed. They are not project-owned runtime
assets and should not silently enter the shipped asset set.

## Build 358 appearance pass

The production factory now uses a restrained metallic silver-grey finish, a dark nose and subtle
circumferential seams. Body lofts retain the same linear stations with 32 radial segments instead
of 12. Wings now follow the existing per-station thickness and installation height, with sharp
edges and a closed symmetric mesh. The chordwise section is a presentation profile, not a new
airfoil or an aerodynamic claim.

The inlet has a narrow lip, a recessed dark interior and a cuff joining the existing tunnel
surface. The axial lip depth no longer doubles as a very wide radial metal band. The single
exhaust has an opaque recessed interior and stays inside the canonical nozzle radius; the old
torus exceeded it. These surfaces close visual gaps without moving the authored openings.

The canonical geometry, generated engineering, sockets, flight model and operating role are
unchanged. The updated factory uses 1,464 triangles and 15 draws, versus 736 and
10 before the pass. Front, rear, side and three-quarter captures were reviewed with identical
cameras and lighting; all shader programs linked without browser errors.

The new picker poster renders this same `createRapier()` factory with identity model transform
and the game's environment lighting. Its retained PNG, source hashes, camera and renderer record
live under `tools/assets/generators/menu-posters/sources/`; the WebP can be re-encoded from that
PNG. The poster is a studio presentation of the game model, not a flight screenshot. It includes
no manufacturer image pixels and makes no claim that a fresh GPU render is byte-reproducible.
