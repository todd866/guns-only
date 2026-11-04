# Phone driving and quarter-pipe response

The RC phone layout follows the flight game's thumb positions: steering on the right, fire and a persistent throttle lever on the left. The lever has a neutral detent and reverse below it. Brake is held independently; steering springs back when released. Opening a menu, backgrounding the page, cancelling a gesture or losing its capture clears held input. A normal throttle lift leaves the selected power set. Menus still support ordinary touch scrolling.

The straight skatepark quarter pipes have a deliberate arcade response. A slow approach makes a small forward deck exit. A fast, nearly head-on approach launches upward, rotates 180 degrees and carries the car back down the transition. The final descent softens to avoid suspension bounce undoing the turn. This uses forces and velocities on the existing collision mesh; it never moves the car directly. The adjoining hip and oblique lines remain free transfers.

The return threshold is authored for play: 5.8 m/s along the chassis, capped at 41% of the vehicle's top speed so the slower golf chassis can reach it. These are tuning values, not measurements of a real vehicle. Tests exercise both straight faces, all five vehicles, both assistance settings, transformed placement and the connected residential world.

## Asset delivery

Original GLBs remain the authoring and collision source. Browser loads use gzip delivery copies through native `DecompressionStream`; unsupported browsers or a missing copy use the original GLB. Corrupt compressed data remains an error. `node tools/rc/compress-models.mjs` refreshes delivery copies after model exports. Packaging always regenerates them from that release's originals; tests check decompressed byte identity.

The paint and foliage WebPs are delivery derivatives of the original PNGs, preserving dimensions and foliage alpha. Regenerate with `cwebp -q 88 -alpha_q 100 SOURCE.png -o DELIVERY.webp` when source art changes. Originals remain in the asset directory.

A cold Chromium test at 5 Mbps and 100 ms latency measured 70.6 seconds / 40.8 MB before this change and 22.2 seconds / 11.6 MB afterward, to the first grounded drivable frame. This is an emulated network measurement on the development Mac, not a promise for every phone. Browsers without native gzip decompression retain the larger model downloads.

Release packaging uses `node tools/rc/package-rc.mjs --bundle`: esbuild folds the ~200 ES modules and vendored three.js into `rc/main.js` plus 5 split chunks (203 to 7 JS files, 2.8 MB to 1.6 MB), cutting requests to the first drivable frame from 224 to 29 on a local server; release, new-player and mobile gates pass on the bundled site. Omit `--bundle` for the unbundled debug package.

## Verification

- `node --test web/wwwroot/rc/touch-controls.test.mjs web/wwwroot/rc/quarter-return.test.mjs web/wwwroot/rc/skatepark-transfer.test.mjs`
- `node --test web/wwwroot/rc/asset-buffer.test.mjs tools/rc/compress-models.test.mjs tools/rc/package-rc.test.mjs`
- `node tools/rc/check-mobile.cjs OUTPUT_DIR [BASE_URL]` exercises real Chromium touch gestures, simultaneous steering and throttle, braking, fire, interruption, map/garage, portrait, landscape, small-phone and doubled-text layouts. It saves viewport captures and closes the browser/server in `finally`.

The RC deployment pipeline runs the phone journey against both the packaged build and the live route, alongside the existing hardware and fresh-player race checks. The isolated fire-control case supplies one item through the existing QA hook; the separate fresh-player journey verifies ordinary pickup collection and use.
