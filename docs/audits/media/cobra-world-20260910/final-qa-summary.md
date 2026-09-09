Final allocation improves distant tree coverage with one additional draw per view. The four final frames match the baseline camera and authority time, all shaders link, and both stationary comparisons have zero changed pixels.

| Final tier / view | Canopy instances, prior → final | Triangles, baseline → final | Draws, baseline → final |
|---|---:|---:|---:|
| balanced / player-eye | 345 → 780 | 155,256 → 187,470 | 79 → 80 |
| balanced / iron-bell | 576 → 981 | 265,356 → 272,820 | 121 → 122 |
| desktop / player-eye | 648 → 960 | 354,941 → 399,673 | 79 → 80 |
| desktop / iron-bell | 1080 → 1347 | 644,453 → 688,231 | 121 → 122 |

Built presentation totals are 335,776/380,000 triangles at balanced and 794,731/900,000 at desktop; both remain within their unchanged ceilings. The quality governor runs level 2 for the actual player eye and level 0 for parked Iron Bell.

The preceding allocation passed 12 static views, six zero-delta stationary comparisons, and 128 m continuous pans at all three tiers. Retained instance transforms had exactly zero change through 48 m and 96 m residency refreshes. Those checks use canopy 850d83af, not final allocation 170a2436. The final allocation changes only canopy capacity and the nearby asset allowance; four final frames were recaptured.

Both new texture requests were deliberately returned 503 on the preceding allocation. Balanced and mobile still booted active authority with the procedural basin, all shaders linked, and only the two expected 503 console errors. Normal quality switching kept the renderer’s allocated-texture count at 5, with each new image fetched once and verified against its exact hash.

Captured timings use shared-workstation SwiftShader and are not hardware FPS. The accepted result is a bounded improvement: large bare slopes, repeated terrain texture, geometric river banks and the Camp Ember apron still differ substantially from the generated target.

Exact runtime identities, coverage boundaries and artifact hashes: combined-evidence-manifest.json.

Cleanup verified: all owned browsers closed; server PID 78573 stopped and port 63015 has no listener. Full motion data and videos remain in /tmp; motion-summary.json is the compact archival result.
