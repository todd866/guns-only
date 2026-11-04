# Nellis RC completion checklist

Local review candidate, 2026-10-22. No push, deployment or publication.
The intended playable loop is exploration → discoveries/specimens → vehicle/activity choices → races → Dreamland finale → persistent completion and replay.

| Finish criterion | Implemented | Verification | Acceptance status |
|---|---|---|---|
| Recognisable connected Nellis layout | 365 public-source tiles; 16 destinations; public runway axes, buildings and roads; source fence paths; seamless Housing/BX/School | Source-collision driving, all native district laps and entrances, road navigation and travel regressions | Automated pass; geographic/art judgement remains human |
| Driveable natural terrain with safe authored courses | USGS-derived 16 m ground grid, −17.07…41.88 m contours; roads/buildings/venues/fences on protected pads; shared rendered/collision triangles | Real slope traversal, ray/triangle agreement, narrow surface contacts, hillside recovery above 20 m, every world race | Automated pass; adaptation is documented, not survey fidelity |
| Complete expedition | 15 specimens, persistent collection, Dreamland lock/unlock, finish and saved completion | Actual browser collects all specimens through controller input, finishes finale, reloads and verifies completion | Browser pass; public entry URLs used as scenario setup, not an uninterrupted tour |
| Complete race/recreation catalogue | 14 world events + three integrated districts; medals/records; golf, bowling, Furball | Ordinary-input source-world/native laps, strict checkpoints, activities and progression tests; hardware night race finishes/replays | Automated pass; human balance/feel remains |
| Original hero and landmark art | B-52/C-17/A-10 refined geometry, landing gear and Blender bevel/AO exports; all static landmark batches AO-baked; editable .blend sources | Actual GPU contact sheets, GLB bounds/vertex-color tests and inspected world screenshots | Pass as original stylised art; subjective fidelity remains |
| Named world catalogue | 25 aircraft types, museum hardware, support/civilian vehicles, venues, desert dressing | Geometry/collision/lifecycle tests and actual rendered inspection | Complete named catalogue; several non-hero types deliberately simpler |
| Materials/night presentation | Five original procedural PBR surface sets, asphalt wear, normal/roughness maps; original HDR night reflection environment and stars; day/night lights/effects | Periodic texture/normal tests, radiance checks, actual day/night screenshots | Automated/visual review pass; art-direction sign-off remains |
| Vehicle and input choices | Jet shells + buggy/monster/rally/pickup/golf body, paint, persistence; keyboard, pointer controls, standard gamepad axes/triggers/actions | Five body laps; browser garage/reload; synthetic standard controller drives actual player physics; mobile pointer movement | Automated pass; physical device feel remains |
| Responsive, resilient UX | Compact menu/map/garage, safe travel/retry, bounded tile cache, interior recovery, optional hero fallback | Desktop/phone/doubled-selected-text screenshots, offline/cache/travel tests and failed-hero fallback | Keyboard/modal/phone/zoom-equivalent reflow pass; human assistive-technology session remains |
| Sustained representative rendering | Three 60-second controller-driven samples: Paper Route, integrated BX, forced-night rink | Apple M5 hardware; raw RAF timings, movement fractions, tile counts, screenshots and errors | Pass: median 16.7 ms, p95 17.9–18.2 ms; 190–355 m travelled per sample; two night finishes. These routes, not every device |

## Public references and authored decisions

- OSM roads/buildings retain their source IDs and ODbL attribution. Runway ways: 27545141/27545154. Petting Zoo: 1553977384. Administrative relations: 16282210/19616628. Fence data: 45 ways and 186 gate nodes.
- Fence height and three-metre gate/road/event clearances are authored. District/specimen openings preserve gameplay. Administrative reference lines and the rectangular outer game barrier are not asserted physical fences.
- `terrain-source.json` records the public USGS 3DEP request, actual GeoTIFF extent, retrieval date and SHA256. `build-playable-terrain.mjs` protects existing roads, polygon footprints, venues and fences, then uses a 400 m smooth transition and distance envelope. Natural contours retain source influence; pads, grades, building heights and local models remain authored approximations. The exterior horizon uses the broader DEM.
- Paper Route/Grand Tour include a visible authored 21.65 m forecourt between disconnected source road components. Integrated district dimensions are retained with documented translations and matched visual/collision entrance cuts.
- Aircraft/vehicle geometry and handling remain fictional toy approximations, not flight-model measurements. Blender bakes store real sampled ambient occlusion in vertex colors, not simulated proof of a bake. Terrain/materials/night radiance use original code or public source data; no sensitive base material was used.

The candidate completes the defined playable loop and automated scenarios. Release still needs the owner's playtest/art judgement, audible audio and physical input-device checks. No automated result is represented as that human acceptance.

Final accessibility, source comparison, deterministic balance evidence and the short human-only review are recorded in [Final review acceptance](rc-open-world-acceptance.md).
