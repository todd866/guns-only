# RC terrain relief (31 Oct 2026)

Finding: the 125x156 m DEM spacing is not what keeps the playable ground flat. The pad, 400 m blend and 10% distance cap in `tools/rc/build-playable-terrain.mjs` are.

- A 1025x1025 3DEP pull (about 31x35 m, same bbox) moved the 16 m playable grid only slightly: stddev 6.09 -> 6.11 m, slope >5% 8.3% -> 8.9%, >10% 0.9% -> 1.4% (`evidence/rc-terrain/stats-*.json`). The committed grid itself: 5.58 m, 7.6%, 0.8%.
- The candidate passed the world tour (BX, school, housing; 0 recoveries) but is not shipped.
- `open-world-terrain.test.mjs` asserts `width === 257`, and the horizon mesh and `terrain.json` (about 5.9 MB at 1025) scale with DEM size.
- The committed `playable-terrain.json` (385x401, 23 Oct extent) is stale against catalog `BOUNDS`, which has since grown for Spirit Mountain. A plain rebuild at current `BOUNDS` gives 481x545, so the builder now defaults to the committed extent (`PLAYABLE_BOUNDS` overrides).
- The candidate data is in `evidence/rc-terrain/candidate/` (gz); build it with `--url` set to the `size=1025%2C1025` export.

Next experiment: keep pads at zero, raise the distance cap from 10% to about 25%, shorten the blend from 400 m to 200 m, then re-run the world tour and the race sweep. Decide on 1025 only after that shows the DEM is the limit.
