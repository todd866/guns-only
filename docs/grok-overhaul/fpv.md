# First-person F-22 view

## What changed

The lower half of the guns-hot frame was an unlit white faceted mass. Hiding the canopy shell did not remove it. A ray through that mass hit the muzzle flash: the eye sits about four metres forward of the aircraft origin and the fallback muzzle is just ahead of it, so the long additive cone and the flash sphere cross the near plane and fill the lower view. Those volumes no longer draw. Tracers still show the gun.

The canopy shell, centreline bow, and helmet reflection are cockpit imitation on a flat screen. The named nodes remain so the existing contract tests keep passing, and none of them are drawn. The camera stays the pilot eye. Field of view and HUD projection are unchanged.

The soft-world horizon was authored near 0.94 linear, which tone-maps to a pure-white cap. It is now under 0.45 linear, and the sky dome is tessellated more finely so the horizon is not a handful of facets.

## Screenshots

- Before: `docs/grok-overhaul/shots/fpv-before.png` (from `.grok-shots/before-flight.png`)
- After: `docs/grok-overhaul/shots/fpv-after.png` (from `.grok-shots/v18-flight.png`)
- Iteration frames stayed in `.grok-shots/` and are not committed.

## Verification

- `node --test` on `f22_canopy_glass.test.mjs` and `production_graphics_wiring.test.mjs` — pass.
- Headless GPU snaps via `snap.sh` on port 8924, Apple M5. No C# rebuild.

## Gaps

- At 20,000 ft the lower frame is still high-altitude haze. That is the far ground, not a mesh on the camera.
- There is no own-ship nose in frame. Attitude is the horizon and the pitch ladder; the gun line is the tracer.
- The muzzle light is off with the volumes. A later pass could add a small flash that stays entirely in front of the near plane.
