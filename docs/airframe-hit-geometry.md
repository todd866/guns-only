# F-22 route gun collision geometry

Package c10, 2026-10-13. Epistemic status: **surrogate**, not a measured damage model.

The F-22 visual merge, first-run valley and its gun practice use oriented composite solids.
The player's M61 intersects a Su-27-family solid; the opponent's gun intersects an F-22 solid.
Su-35 shares the Su-27 presentation ID and solid. Rounds are not enlarged or steered. There is
no rear-quarter forgiveness in physical collision on this route. Existing angular sight/AI
solution gates remain their historical values: a lit solution cue is not a promise of a hit.
No cadence, dispersion, ammunition, hit-count damage, doctrine or difficulty tuning changed.

## Sources and limits

- **Su-27:** 21.935 m length and 14.698 m span supplied by the accepted a4 package; the local
  authority for stations, components and origin is `web/wwwroot/render/scene/su27_surrogate.js`.
  Origin is 11.2 m aft of the nose, not exactly mid-length. This collision model follows its
  fuselage/spine/nacelle/boom stations, 42-degree wing/LERX polygon, tip rails, stabilators,
  twin fins and ventral fins. Length/span are published dimensions; section shapes were authored
  as presentation surrogates in a4, not measured aircraft structure. No new external mesh.
- **F-22:** length 18.9 m and span 13.6 m are the brief's public figures, also cited by the
  existing flight model from the [USAF F-22 fact sheet](https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104506/f-22-raptor/).
  The page returned HTTP 403 during this implementation; these are the supplied/local figures,
  not a claimed fresh source extraction. Fuselage sections, wing/root stations, canopy,
  stabilators and fin cant are **provisional geometric surrogates** within those dimensions.
  The player's legacy external drone rendering is not a scale F-22 and is not an authority for
  this first-person collision model.
- Su-27 loft skin uses the near model's radial sampling (18/14/12/8). Tetrahedra preserve its
  triangulated side surfaces even where successive sections have different aspect ratios.
  Rings are capped to make solid components. Wings/fins are thin prisms, omitting the renderer's
  small bevels (up to about 6 cm); the canopy is a sampled ellipsoid. These are deliberate,
  documented approximations, not exact CAD or per-pixel agreement at all LODs. A claim that
  public length/span alone establish exact real-airframe thickness would be false.

Rejected: the old 8 m/12 m radius, a whole-aircraft bounding box, one enlarged capsule enclosing
both wings, and a convex hull joining the two fin tips. Those accept empty air and/or omit the
nose and tail. A collision envelope is never selected to recover an old conversion percentage.

## Sweep and ownership

`GunKill` retains its ballistic chord and target-translation sweep. `AirframeHitGeometry`
transforms that relative chord into body space, then clips it against the component solids,
returning the earliest surface entry. The broad sphere and component boxes only reject;
neither can award a hit. Start-inside, edge contact, concurrent targets and target replacement
retain the ordinary weapon/damage ledger semantics.

BodyAttitude is authoritative, independently of flight-path heading/angle of attack. Legacy
states without a quaternion reconstruct a heading/pitch/bank frame. Constant beginning-of-tick
body rates extrapolate attitude within each gun cadence substep. Rotation subdivides at
0.002 rad; orientation chord error is below 0.01 mm at a 12 m extremity. Translation and gravity
are the existing constant-velocity/ballistic-chord approximation (gravity sag below 0.1 mm at
120 Hz). Angular acceleration during the tick is not predicted. No instantaneous final-pose
point test can tunnel through a thin fin between the 120 Hz samples.

Geometry is a target-shape contract carried by each weapon graph and preserved by successor,
retarget and relief transfers. This route has homogeneous opponent shapes (Su-27/Su-35) and
F-22 ownship/relief shapes. A future mixed-airframe formation needs per-actor shape selection.

## Frozen modes

`CombatConfig.ModernVisualMerge` remains the old spherical configuration because Rapier shares
it. `ModernVisualMergeAirframes` opts in the production F-22 beat; practice inherits that beat.
Frozen Ace Duel explicitly selects the old configuration. Top Gun, Rapier, drones and other
frozen beats are unchanged. Arena handicap clears the two active gun shapes without resetting
rounds, cadence or damage, including when it arrives after staging; clearing handicap restores
the beat's configured shapes. Historical direct `new GunKill()` callers retain spheres.

The production-duel/assist test harnesses and seeded F-22 training runner explicitly take the
new route configuration, so their conversion measurements cannot silently keep testing spheres.
