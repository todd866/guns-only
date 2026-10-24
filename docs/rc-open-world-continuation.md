# RC open-world review candidate

Serve `.rc-world-review-dist/` through a permitted static HTTP workflow and open `/rc/?audioQa=silent`. Direct `file:` loading is unsupported. No server was bound, visible browser opened, push made or deployment/publication performed. The package contains the shared checkout's existing expansion and packaging work; no unrelated files were staged.

## Playable scope

Explore a source-based Nellis layout with 16 destinations and 15 specimens. Complete the collection to unlock Dreamland Night, then finish the finale to persist expedition completion. The map exposes 14 world races and three seamlessly integrated Housing/BX/School courses. Car Golf, bowling and Furball provide alternate play. Garage choices include jet shells, buggy, monster, rally, pickup and an unlockable golf cart; paint, records and body choice persist.

Natural clearings now have driveable contours derived from USGS elevation. Roads, buildings, fences and authored venues retain protected pads. Rendered triangles and wheel collision share the same 16 m elevation grid. Interior ground is clipped out so native floors retain their surface handling. Recovery uses actual terrain elevation; water/road/grass response is resolved at the contact point.

B-52, C-17 and A-10 hero models have refined silhouettes, landing gear, bevels and Blender ray-sampled AO. Static landmark batches also have baked AO with preserved authored colors. Editable `.blend` files accompany GLBs. Original procedural albedo/roughness/normal surfaces replace shared grain; an original HDR night environment provides moon/starlight reflections. The complete named aircraft/vehicle/venue catalogue is present, with simpler stylised geometry for several non-hero types.

Standard controllers now work through the Gamepad API: left stick steers, triggers drive/reverse, A fires, B brakes, Start opens/resumes the menu. Keyboard and mobile pointer controls remain supported.

## Evidence

- `evidence/rc-open-world/final-tests.txt`: 212/212 passing RC/source-world/district/physics/progression/tooling regressions.
- `review-build-hardware/smoke.json`: actual packaged hardware startup, keyboard driving, destinations, race/Furball and viewport checks. Adjacent PNGs include desktop, phone, garage, interiors and doubled selected text/control sizes.
- `sustained-final/sustained.json`: three 60-second representative driving samples with raw frame percentiles, movement fractions, tile counts and actual finish counts. Synthetic standard-controller input exercises normal game input and player physics; world state is not teleported.
- `expedition/expedition.json`: actual collection of every specimen, Dreamland unlock/finish and completion after reload. Public `?at=` entry URLs are explicitly scenario setup, not evidence of an uninterrupted whole-base tour. No progress is seeded. This gameplay run preceded the final landmark color-export correction; use the final hardware screenshots for art review.
- `catalogue/aircraft.png`, `catalogue/dressing.png`: actual GPU art inspection; associated JSON identifies the renderer.
- `review-manifest.json`: source HEAD and final package hashes. This is a shared working-tree candidate, not a clean committed release.

Hardware checks use full headless Chromium and report ANGLE Metal / Apple M5. Requests are fulfilled from package files with Playwright routing; browsers close in `finally`. No-op GPU results are separate and are never visual/performance proof. Frame statistics are RAF intervals for the measured scenarios; renderer counters exposed after postprocessing describe its final pass, not whole-scene totals.

Screenshot review caught and corrected an HDR background crash, negative first-frame camera damping, phone atlas overflow, floating aircraft fins and a Blender active-color export bug that washed the landmarks white. Regression review caught coarse terrain surface sampling, high-ground recovery and optional hero download failure. Tests cover those failure paths.

Final package: 492 files, 33,942,226 bytes. The three sustained samples each captured 3,601 RAF intervals: Paper Route travelled 355.2 m (p95 17.9 ms), BX 190.4 m (p95 18.1 ms), night rink 298.3 m (p95 18.2 ms, two finishes). All had median 16.7 ms; these are route samples, not universal performance guarantees. Mobile pointer input travelled 9.0 m. Both final hardware reports contain zero browser errors.

## Reproduction

- `node tools/rc/build-playable-terrain.mjs` regenerates adapted drivable contours from the checked-in public DEM and world source tiles.
- `node tools/rc/export-heroes.mjs /tmp/rc-hero` writes original hero geometry inputs. Run `tools/rc/blender/bake_hero.py` in background Blender with `--input`, `--output`, `--blend`, and `--python-exit-code 1` (after the normal battery/heavy-job guard).
- `node tools/rc/export-landmarks.mjs /tmp/rc-landmarks.json` exports the static landmark kit for the same Blender bake. Dynamic elements stay dynamic. The generator sets the render color attribute explicitly so glTF retains the authored palette.
- `node tools/rc/package-rc.mjs --out .rc-world-review-dist` creates the self-contained review package. Blender sources are retained in the repository and excluded from the web payload.

## Remaining acceptance

Human race balance, art/geographic judgement, audible audio, physical controller/touch sessions and human assistive-technology/browser-zoom acceptance remain. The terrain is an adapted public DEM with flat protected pads, not a survey replica. Several catalogue models remain deliberately simplified. These limits do not prevent the implemented exploration-to-finale loop from being played and reviewed.

Prior CUA local-file/workaround denials were respected. Ordinary sandbox server-listen and Chromium startup failures were resolved through the approved headless execution workflow without a listening server. No current access blocker remains for the recorded checks. Push/deployment/publication still require owner authorization.

Final accessibility, source comparison, deterministic balance evidence and the short human-only review are recorded in [Final review acceptance](rc-open-world-acceptance.md).
