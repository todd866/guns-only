# Final review acceptance

## Automated and visual closure

- 212/212 RC tests pass. `evidence/rc-open-world/final-tests.txt` includes deterministic balance diagnostics for all 14 world courses: nine gold, five silver against unchanged targets. Driver skill is fixed at 0.9, Big Kid physics, no rivals, real source collision and elevation. This establishes medal attainability, not human difficulty or competitive fairness. Existing native-district laps and base rival regressions remain covered.
- Final packaged headless Apple M5 accessibility checks cover menu Tab navigation, keyboard activation, Escape/resume, all three dialog focus cycles/return, inert background, non-jet disabled Shell and race-disabled Vehicle, named controls and sound toggle state. Screenshots cover 1280×720, 390×844 and 667×375. A 640×360 CSS viewport checks reflow equivalent to a 1280×720 viewport at 200% browser zoom; this is explicitly not an OS browser-zoom or assistive-technology session. Prior doubled-text screenshots remain complementary evidence.
- Corrected menu Tab interception, gameplay shortcuts activating from controls, disabled-selector focus traps and missing modal isolation. Added explicit focus outlines, sound pressed state and result announcements. Actual nonvisual driving accessibility is not claimed for this chase-camera game.
- `evidence/rc-open-world/accessibility-final/` contains the executable harness result and inspected screenshots. The previous sustained M5 report remains valid for unchanged world/render/physics paths (median 16.7 ms; p95 17.9–18.2 ms). Final input changes have their own packaged browser acceptance.
- Expedition completion intentionally requires finishing Dreamland, regardless of placement. Documentation now says finish, matching the implemented child-friendly rule. No progress or medal targets were weakened.

## Source-backed geographic and art comparison

| Reference | Comparison and conclusion |
|---|---|
| Checked-in OSM manifest, extraction 2026-10-21, 2,879 features / 365 tiles; equirectangular origin 36.241303, −115.04465775 | Source IDs, roads and footprints are retained; source-collision tests drive actual imported geometry. Integrated Housing/BX/School retain authored layouts with explicit placement translations. They are playable adaptations, not building-interior surveys. |
| OSM runway ways 27545141 / 27545154 | Two distinct source axes, 03L/21R and 03R/21L, retain source-width handling (61 m / 46 m), endpoint paint and continuous lights. Runway regression verifies both; rendered ramp screenshots show the airfield context. |
| USGS 3DEP provenance in `terrain-source.json` | Source request, actual extent and SHA256 are recorded. Shared mesh/collision tests verify sampled terrain. Protected pads, 400 m transitions and 16 m interpolation intentionally adapt the data; mountain horizon and ground are not asserted survey-grade. |
| OSM administrative boundary, 45 fence ways / 186 gates | Actual source paths are used; authored openings preserve travel. Administrative outlines and the outer rectangular game barrier are explicitly distinguished from physical fencing. |
| [USAF B-52H facts](https://www.af.mil/about-us/fact-sheets/display/article/104465/b-52h-stratofortress/) | Eight engines and approximately 56.4 m span / 48.5 m length agree with the catalogue. Rendered hero shows four paired nacelles, swept wings and landing gear. |
| [USAF C-17 facts](https://www.af.mil/about-us/fact-sheets/display/article/1529726/c-17-globemaster-iii/) | Four-engine configuration agrees with the catalogue. Contact sheet shows broad cargo fuselage, high wing, T-tail and gear sponsons. These are silhouette checks, not dimensional certification of every mesh. |
| [USAF A-10C facts](https://www.af.mil/about-us/fact-sheets/display/article/104490/a-10c-thunderbolt-ii/) | Twin-engine configuration agrees; rendered hero retains straight wing, high nacelles, twin fins and nose gun. Model dimensions and finish remain toy approximations. |

The aircraft catalogue represents the established game collection, not a claim that every type is stationed at modern Nellis. Original materials, architecture and bakes are stylised; no new fidelity defect was identified that contradicts the declared scope. See `catalogue/aircraft.png`, `catalogue/dressing.png` and final hardware ramp/interior screenshots.

## Ian's short review

- Drive one road race and one district; judge steering assistance, rivals and challenge.
- Listen to engine, impacts and pickups; check volume and mute with actual speakers/headphones.
- Try a physical controller and phone touch controls.
- Judge Nellis recognisability, aircraft silhouettes and the deliberate stylised art; try the preferred screen reader/browser zoom if relevant.

These are human acceptance checks, not pending software blockers. No push or deployment was performed.
