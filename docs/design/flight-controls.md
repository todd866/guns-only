# Flight controls rethink

Owner, 6 Nov 2026: "when I tried flying it was very not-like-an-airplane";
"we need to rethink those flight controls, especially for guns-only dogfight."
The owner is a former military pilot; the other player is six. So: one shared
aeroplane that really flies, two assist levels (Pilot / Kid), and one pad
layout everywhere.

## Audit: every flight path, what it did, what was wrong

| Surface | Model (before this change) | Not-like-an-aeroplane because |
|---|---|---|
| Guns-only flight (web/wwwroot/app.js) | C# simulation (`WebBridge.Session`), real airframe polars in `airframes/` | The model is fine. The PAD was not: RT fired, A was padlock, LB/RB walked the throttle — nothing like stick-and-throttle. |
| Toy dogfight / co-op (render/split/toy_flight.mjs) | Kinematic `stepJet`: position follows heading directly, speed is a servo to the lever, rudder yaws flatly at 1.05 rad/s, no stall, no energy | Velocity had no lag behind the nose, flat rudder turns beat banking, speed was free. Worse, two sign bugs: the mesh pitched **opposite** to the flight path, and stick-right banked/turned **left** (pitch rendered as `rotation.x = +pitch` on a +Z-nosed mesh is nose-down; the right wing is mesh −X, so `rotation.z = −bank` dropped the left wing). The thing looked wrong because it was wrong. |
| RC Odyssey flight (rc/physics/flight.mjs) | Three layers: `arcade` (heading/bank servo, altitude hold, speed floor, no stall), `easy` (kid flyer), legacy jet integrator (quat rates + dive gain) | Arcade flew everyone, including Big Kid: hands-off altitude hold, a speed that cannot decay, banks capped at 0.62 rad, no stall, no energy. A pilot feels the fakeness in seconds. |
| Toy gunship (toy-gunship/orbit.mjs) | The pilot steers the ORBIT (radius/alt/speed), not the plane | Intentional (the gunner needs a steady scene). Left alone. |
| Toy chopper / cobra (toy-chopper, render/cobra) | Helicopter models | Choppers keep helicopter behaviour (task rule). Left alone, except the toy fight chopper's slide/yaw signs, aligned with the aviation convention below. |

## Helicopters joined the layout (owner, 6 Nov 2026 follow-up)

"Should work the same across guns-only, helicopter and rc." Every helicopter
now flies the SAME rows, mapped helicopter-correctly, from one shared module,
`rc/flight_layout.mjs` (indices + pedal/lever arithmetic + printed-letter
faceIndex). `pad_flight.mjs`, `rc/gamepad.mjs` and `cobra_pilot_input.js` all
import it; `rc/flight_layout.test.mjs` reads one synthetic pad through all
three mappers and asserts the same buttons mean the same thing.

- Left stick = cyclic. Pull back = nose up = slow (then back); push to go.
  Aviation pull-positive at every seam; a chopper's pull is never subject to
  the plane's 'Pull back to climb' preference.
- RT/LT = collective up/down — a held lever, the vertical. The stick never
  climbs a helicopter.
- LB/RB = pedals. On the co-op chopper they replace the old d-pad pedals and
  the LB hold-steady button; in the cobra they replace right-stick-X yaw.
- Right stick = look. The cobra's authority camera is body-fixed (forward =
  nose-forward), so its right stick is RESERVED for look the way guns-only's
  LB/RB were reserved for rudder: binding it is a deliberate camera change.
- A/B = the same weapon jobs, by printed letter: A is guns (cobra: gunner
  consent, was RB), B is the second/target job (cobra: cycle mark, was LB —
  the same job as guns-only's B padlock). Y keeps the cobra turnaround action.
- Same assist levels. Kid: auto-hover when the sticks are released, height
  hold, no ground strikes (the RC chopper's floor defends itself; the co-op
  chopper damps to hover and recentres the lever). Pilot: the lever and the
  drift are yours; full down is a vertical landing. RC maps Kid/Big Kid to
  Kid/Pilot; the co-op session carries `assist` ('kid' default).
- RC Odyssey's chopper form left the arcade plane flyer for its own
  `heliFly` (`rc/physics/flight.mjs`, `FLIGHT.heli`): collective vertical,
  tilt-to-go, bank turns so one stick still steers, pedals yaw. A flies up
  and B lands, as on every RC form.

## The shared aeroplane: rc/physics/airplane.mjs

Pure functions, `node:test`-covered (`airplane.test.mjs`), no DOM. Aviation
signs: pitch+ = pull/nose up, roll+ = right wing down, rudder+ = nose right.

- **The nose points where you go**: velocity chases the nose with a
  first-order lag proportional to lift (`align`·(v/Vs)²). Pull, and the path
  bends after the nose — the lag the owner's hands expect.
- **Bank to turn, coordinated by default**: turn rate is g·tanφ/V. No rudder
  needed; the pedals (LB/RB) only slip the nose. Turn rate falls as speed
  rises — the turn-rate-vs-speed trade-off is real and visible on the HUD.
- **Energy matters**: dV/dt = thrust − parasite drag − induced drag(n²) −
  g·sin γ. Climbing bleeds speed, diving buys it back, hard turns bleed both.
- **Stall, gently**: below Vs the lift fraction fades, the path sags toward
  gravity, controls go mushy (35 % authority) and the nose sags toward −0.5
  rad until speed returns. No spin, no snap; it recovers hands-off.
- **No hover, no strafe**: there is no lateral input and a slow wing falls.
- **Per-airframe params on purpose** (AGENTS.md §5): `TOY_PLANE` (toy fight),
  `RC_PLANE`/burner (RC Odyssey) are parameters of the shared functions.
  Never retune the shared model against one aircraft.
- **Lead-computing gunsight**: `gunsightLead(shooter, target, shotSpeed)`
  iterates the intercept; the HUD pipper and the dart aim-assist both use it.

## Assist levels — per player

- **Pilot** (dad): the raw model. Banks stay where you leave them, stalls are
  yours to recover, the throttle is a lever that holds.
- **Kid** (default): hands-off auto-level (wings and nose), stall protection
  (auto-throttle below 1.2·Vs and no deeper pull), a generous turn (×1.35),
  and a ground-avoidance pull-up (looks 0.9 s along the path).

Where they live: toy fight menu has `P1 KID/PILOT` and `P2 KID/PILOT` rows —
per seat in split screen. RC Odyssey maps its existing Kid / Big Kid switch:
Kid keeps the arcade flyer, Big Kid now flies the real aeroplane (the winged
mount, chopper, board and skate forms keep their own feel). The RC split
player 2 stays on the arcade flyer (the global mode switch is P1's; a per-seat
RC toggle is a follow-up).

## One pad layout (8BitDo, both printed layouts; TV)

Left stick pitch/roll · right stick look/camera · RT/LT throttle up/down
(hold where left) · LB/RB rudder · A guns/darts · B missiles/balloons.

- **Toy dogfight**: already this exactly (pad_flight.mjs); unchanged.
- **RC Odyssey**: stick pitch/roll, RT−LT throttle, LB/RB rudder already;
  'Invert flight' renamed **'Pull back to climb', ON by default** (he is a
  pilot). It flips the pad stick only — arrows/W/S always mean up-is-up.
  The old stored choice is honoured.
- **Guns-only** (dual_stick_input.js): now LS flight, RS look, **A guns,
  RT/LT throttle, B padlock**, X limit override. LB/RB are reserved for
  rudder: the WebBridge session has no rudder channel yet — adding one is a
  C# sim change and a deliberate follow-up, not something to fake client-side.

## Dogfight specifics

- **Pipper**: a per-seat ring-and-dot (`.toy-pipper`) projected where a dart
  fired now meets the nearest foe. Fly the pipper onto the toy and shoot.
- **HUD** (one aligned row per instrument, house style): pops, dart, balloon,
  throttle, **speed** (datum flips to STALL when stalled), **alt**, **G**.
- Energy fighting works because the model makes it work: a defender who
  drains speed turning can be out-zoomed; G on the HUD shows the price.
- Toy weapons unchanged: foam darts and water balloons, pops not kills.

## What to try first

1. Toy fight → menu → set `P1 PILOT`, leave P2 KID. Bank, pull, feel the
   path lag the nose; chop throttle in a hard turn and feel it mush.
2. Watch the pipper lead a crossing jet; fire when it sits on the toy.
3. RC Odyssey → Big Kid → take off (A/LB), fly on the stick: pull back to
   climb, bank to turn, LB/RB to slip, RT/LT lever. Idle and hold the nose
   up to feel the stall; lower the nose to recover.

## Known limitations / follow-ups

- Attitude is Euler-clamped (±~1 rad pitch, ±1.2 bank): no sustained inverted
  flight, loops or rolls in Pilot yet. Kid's arcade tricks still exist in RC.
- Guns-only rudder needs a sim input channel (C#) before LB/RB can bind.
- RC split-screen P2 has no per-seat Pilot toggle (global Kid/Big Kid is P1's).
