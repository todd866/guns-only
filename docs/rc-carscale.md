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
The damper is 12 N·s/m and roll centre fraction .72. The existing rolled-kerb
response retains .55 damping but uses .65 bump damping instead of .45: the softer
end stop pitched the narrow chassis into a hull strike on diagonal landings.
Changing the chassis bump settings instead disrupted transition/tape timing, so
the 4000 N/m bump spring and 40 N·s/m bump damper stay intact. Inertia distributes 85% of mass
through the body box and 15% through four solid-cylinder wheels at their settled
positions, using the parallel-axis theorem. The mass split is fictional tuning;
the old body-only box omitted the outboard wheels and made the narrow chassis too
easy to roll over road seams. Car-to-car contact spheres follow each body's width
and length instead of retaining the old 240 × 520 mm envelope.

The GLB's actual tread radius is 0.1560344845 model units, not its nominal 0.15;
its sidewalls span 0.135 units. Hub geometry originally spans 0.184 and is fitted
inside the sidewalls. Those fixed asset dimensions drive visual scaling independently
of BUGGY. Wheel pivots follow the complete physics attachment and spring compression.
Shell length fitting leaves chassis shock mounts on the 280 mm wheelbase. Each jet
shell fits a 420 × 320 mm envelope, including wings. The other body kits are lowered
and shortened vertically to meet the tyres; monster arches centre on the hubs.

Air levelling now applies acceleration through each body's own inertia tensor:
using pitch inertia for roll over-damped the narrower chassis. Transfer carry is
90% before landing selection, preserving brake room; bowl launch speed caps at
5.45 m/s to retain the established return/revert rhythm. Landing clearance uses
rideHeight(params). Grind capture already uses the hull's underside and needs no
fixed-height adjustment. Air steering yields to the normal landing gyro above
4 rad/s roll/pitch or below .5 upright alignment. Drift lateral grip scales by .5
to retain a distinct optional slide with the new inertia.
The middle rival's reference pace moves from .86 to .82; cruise (.78), ace (.95),
skill routes and pack rules stay intact. This retains attainable wins and losses
with the changed contact envelope instead of weakening the race-balance checks.

Marseille's start moves one metre along the same run-up and its coping test starts
one metre farther along. The Schoolyard tape line moves 10 cm across its kicker;
both bus lines start one metre closer. Skatestreet's ledge line starts one metre
before the same four-metre kicker. Town Plaza's west handrail gets two metres more
run-up. No geometry, medal targets, scoring rules or assertions change.

The chase camera moves from 1.28 m back / 0.49 m up to 1.36 m / 0.55 m, with both
obstruction sweeps preserved. Physics envelope, settled suspension, shipped GLB
wheel dimensions/contact and all vehicle/jet shell bounds are covered by
`web/wwwroot/rc/carscale.test.mjs`. Visual comparisons and the full test log are kept
outside the repo in the owner's carscale QA directory.
At 1280 × 720 the jet spans 151 px instead of 235 px (64%); the buggy spans 141 px
instead of 227 px (62%). Portrait framing keeps the car clear of the minimap and
garage controls. Shell changes adjust the centre of mass by the new ride-height
difference, so switching to the monster does not bury its wheels.
