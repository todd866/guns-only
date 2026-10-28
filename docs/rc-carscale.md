# RC chassis scale

The carscale brief (29 October 2026) supplies the provisional 1:10 envelope: about
420 mm long, 270–290 mm outside the wheels, and 110–120 mm tyres. These are owner
requirements, not measurements of a particular commercial car. Park geometry stays
at its existing real-world size.

BUGGY uses 116 mm tyres, 230 mm track plus 50 mm tyre width, a 280 mm wheelbase and
a 420 mm body/inertia length. The narrower, shallower hull retains about 42 mm
belly clearance at rest. Suspension droop is 50 mm with the bump spring starting
at 32 mm compression. Mass (1.8 kg), drive force (26 N) and top speed (14 m/s)
are unchanged. All spring, hull and assist values remain fictional gameplay tuning.
The monster has 140 mm tyres, 300 mm track plus 70 mm width and 60 mm droop.

The GLB's actual tread radius is 0.1560344845 model units, not its nominal 0.15;
its sidewalls span 0.135 units. Hub geometry originally spans 0.184 and is fitted
inside the sidewalls. Those fixed asset dimensions drive visual scaling independently
of BUGGY. Wheel pivots follow the complete physics attachment and spring compression.
Shell length fitting leaves chassis shock mounts on the 280 mm wheelbase. Each jet
shell fits a 420 × 320 mm envelope, including wings; the monster arches are lowered.

Air levelling now applies acceleration through each body's own inertia tensor:
using pitch inertia for roll over-damped the narrower chassis. Transfer carry is
90% before landing selection, preserving brake room; bowl launch speed caps at
5.45 m/s to retain the established return/revert rhythm. Landing clearance uses
rideHeight(params). Grind capture already uses the hull's underside and needs no
fixed-height adjustment. Marseille's start moves two metres along the same run-up;
the Schoolyard tape test moves 10 cm across its existing kicker. No geometry or
scoring assertions change.

The chase camera moves from 1.28 m back / 0.49 m up to 1.36 m / 0.55 m, with both
obstruction sweeps preserved. Physics envelope, settled suspension, shipped GLB
wheel dimensions/contact and all vehicle/jet shell bounds are covered by
`web/wwwroot/rc/carscale.test.mjs`. Visual comparisons and the full test log are kept
outside the repo in the owner's carscale QA directory.
