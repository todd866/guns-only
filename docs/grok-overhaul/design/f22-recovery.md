# F-22 recovery: fight → RTB → overhead → full stop (Build 380)

Owner, 14 October 2026: "I don't really care what procedure you use, just make it EASY TO
FOLLOW." Acceptance: an untrained keyboard pilot, and the kid model (450 ms reaction, coarse
key holds), fight, recover, fly the circuit and stop on ONE sortie, unaided, through real
keys. Procedure: a standard left-hand overhead. All numbers are authored surrogate tuning
for ease, not an F-22 local supplement or NATOPS.

## What the pilot sees, minute by minute

Times are typical for the O1 → D1 first sortie (both lessons end by ~0:20). Runway: Soniachne
north, 015°, threshold (600, 77.5, 19 400), 3 000 × 45 m, aim point 300 m. The fight ends
about 18–22 km short of the threshold and 6–8 km right of the centreline, at ~11 000 ft and
~450 KCAS (measured: `F22RecoveryProbe`).

| Clock | Leg | What happens | Next-gate box |
|---|---|---|---|
| 0:20 | Last splash / D1 passed | No pause card. RTB latches (kernel already does at the cap). RTB and NEXT rows appear. | Transit box 1.5–2 km ahead on the route |
| 0:20–2:30 | Transit | Turn to the route, hold the box. Boxes walk down a 9° idle descent; autothrottle (full assist) holds 330 KCAS, which at idle is about equilibrium. | Transit boxes, 2 km apart |
| 2:30 | IP | 6 NM on the extended centreline, 2 000 ft, 300 KCAS. | IP |
| 2:30–3:05 | IP → initial | Straight in, wings level, 500 ft down over 3 NM. | INITIAL |
| 3:05 | Initial | 3 NM, 1 500 ft, 300 KCAS. Radio: "Ghost, initial." / "left break approved". | BREAK |
| 3:50 | Break | Midfield (1 500 m down the runway), 1 500 ft, roll left ~60°, 180° turn. | Three break-turn boxes, then DOWNWIND |
| 4:10 | Downwind | 1 NM abeam, reciprocal, 1 500 ft, 200 KCAS. Gear below 250 KCAS. | DOWNWIND |
| 4:20 | Perch | Abeam the threshold, 1 500 ft, 180 KCAS, gear down. Radio: "base, three greens" (only with gear locked). | PERCH |
| 4:20–4:50 | Descending 180 | Continuous left turn in 45° steps down to 300 ft. | Turn boxes (APPROACH) |
| 4:50 | Final | 0.8 NM, on the 3° line (~310 ft), on-speed (~130 KCAS), gear. PAPI two white / two red. | FINAL |
| 5:05 | Touchdown | Box beyond the aim point flattens the last 450 m to ~2° (a flare). Autothrottle retards to idle at contact; wheel braking. | TOUCHDOWN |
| 5:35 | Full stop | Existing physical runway model owns contact, rollout and stop. Victory card with the gate table. | — |

Energy is honest. There is no speedbrake on this surrogate, so the route is as long as the
idle drag needs: required track = (E_now − E_IP) / 0.22, where 0.22 is the specific-energy
loss per metre measured in an 8–10° idle descent of this airframe (`F22RecoveryEnergyProbe`:
7 223 m → 2 067 m of specific energy in 20.0 km at −10°). If the direct route is shorter, the
existing `ApproachPath` solver buys the difference with an extended leg or orbit. No
teleports, no free energy. The autothrottle is the ordinary throttle lever driven by the same
speed-hold servo as assisted flight; at idle it cannot slow the jet any faster than drag.

## Gates

Runway frame: along from threshold (+ toward the far end), cross (+ right), height above the
threshold. Left-hand pattern, so downwind is at cross −1 852 m.

| Gate | along m | cross m | ft | KCAS | Gear | Graded tol. | Window |
|---|---|---|---|---|---|---|---|
| IP | −11 112 | 0 | 2 000 | 300 | – | ±500 ft, ±30 kt | 2 500 m |
| INITIAL | −5 556 | 0 | 1 500 | 300 | – | ±300 ft, ±30 kt | 2 000 m |
| BREAK | +1 500 | 0 | 1 500 | 300 | – | ±300 ft, ±40 kt | 1 500 m |
| (break turn ×3) | arc r 926 | | 1 500 | 250→200 | | not graded | 900 m |
| DOWNWIND | +900 | −1 852 | 1 500 | 200 | down | ±300 ft, ≤250 kt, gear | 1 200 m |
| PERCH | 0 | −1 852 | 1 500 | 180 | down | ±300 ft, ±25 kt, gear | 1 200 m |
| (turn 45/90/135) | arc r 926 | | → 310 | 170→140 | | not graded | 900 m |
| FINAL | −1 500 | 0 | 3° line | on-speed | down | ±100 ft, ±15 kt, gear | 600 m |
| TOUCHDOWN | physical contact | | | | down | survivable, no deviation flags | — |

Sequencing is by crossing the gate's plane (perpendicular to the leg heading) within its
lateral window and within 75° of the leg heading. That always advances — a ✗ is recorded,
not a dead end. Outside the window the box stays put and a re-planned route (same Dubins
solver) brings the pilot back to it. A go-around (airborne beyond aim + 250 m) re-targets
BREAK straight ahead (closed pattern), never a box behind the jet.

## HUD (desktop 1280×720, two rows under the heading tape, monospace, fixed columns)

```
            ┌──────────────────────────────────────────┐
            │ RTB    SON 015                   8.4 NM  │   field · runway · direct range
            │ NEXT   INITIAL   1500   300      2.4 NM  │   gate · ft · KCAS · distance [GEAR]
            └──────────────────────────────────────────┘
```

- Two rows, no header, no sentence. Words only where they say what a number is (gate name,
  `NM`, `GEAR`). Tooltip/aria carries "next gate: initial, 1 500 ft, 300 knots".
- `GEAR` appears in the NEXT row only when the next gate needs gear and it is not locked;
  amber steady above 250 KCAS (wait), flashing green at or below 250 KCAS (now).
- Altitude and speed tapes carry a target bug (hollow cyan notch) at the next box's
  targets; off-scale shows an arrow.
- World: one cyan box (highway-in-the-sky gate, 120 × 80 m, scaled with range so it is
  never sub-pixel) at the next box, the following box faint. When the box is off-screen an
  edge chevron points at it. Ingress chevrons are no longer drawn 20 km ahead.
- Final: PAPI, four lights 15 m left of the runway edge abeam the aim point, transitions at
  2.5° / 2.83° / 3.17° / 3.5°; uses the c13 light-size attenuation.
- Phones: the same two rows, one line each, inside the occupied-area contract.

## Assists (same procedure at every level)

- Full assist — the sortie's gun assist is active (early ladder) or assisted flight (phone):
  autothrottle holds the box's target CAS through the recovery, holds on-speed on final and
  retards to idle at touchdown. W/S still take the lever while held.
- None (Ace rungs, desktop): cues only.
- Gear is never automatic. The NEXT row says when.

## Grading and debrief

Each gate records altitude (ft), CAS (kt) and gear at its crossing; touchdown records the
physical result. The F-22 result card gains one compact table, one row per gate:

```
IP        2050   304   –   ✓
INITIAL   1480   298   –   ✓
BREAK     1530   301   –   ✓
DOWNWIND  1460   212   ▼   ✓
PERCH     1390   176   ▼   ✓
FINAL      330   134   ▼   ✓
TD           –   131   ▼   ✓
```

Columns: gate · ALT ft · KCAS · gear · ✓/✗ (shape and colour). A missed gear at downwind is
a ✗ there. Details (targets, sink rate, touchdown position) are in tooltips. Landing after the
cap is still Victory, unchanged.

## Flow

- Last splash → no Combat result pause. Esc/pause still offers Again.
- Death in recovery ends the sortie as today.
- Default first sortie (O1 → D1) reaches recovery by ~0:20; cap unchanged (2).

## Scope and fixtures

New `sim/Recovery/F22OverheadCourse.cs` drives only the F-22 visual-merge combat sorties
(mission `mission.modern.visual-merge.f22a-vs-su27s…`). Recovery practice, short final and
Kestrel keep `ConventionalRunwayPatternRecoveryDirector` unchanged (their tests pin its
schedule). Frozen modes untouched. No generated radio: the existing approved clips fire on
the same gate ids (`break`, `perch`).

## Tests

- Kernel: gate grading (tolerances, gear ✗ at downwind), plane-crossing sequencing,
  go-around, autothrottle servo (speed hold, idle at contact, manual override), no-card flow
  is JS, PAPI geometry (JS).
- Native end-to-end: HUD-cue pilot on keys, fight start → kills → recovery → full stop.
- Browser receipt: desktop 1280×720 real keys, human and kid pilots, fight start → full stop,
  frames of every leg; portrait smoke still passes.
