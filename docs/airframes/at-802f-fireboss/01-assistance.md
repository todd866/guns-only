# Fire Boss optional auto-trim

On 2026-09-10 the owner requested more automatic trim after the Build 359 handling
correction. The browser now defaults to **AUTO TRIM**, with a visible manual mode.
This is game assistance, not a claim that the real AT-802 has this control system.
The physical model and its provisional coefficients remain described in
[the source ledger](00-sources.md); the assistance changes none of them.

## Pilot contract

- Pitch input takes priority. While the stick is held, automatic trim stops moving.
  On release, it captures the current nose attitude. A short rotation or pull thus
  retains the pilot's selected nose angle even while the flight path catches up.
- Neutral pitch holds that attitude through the existing elevator-trim command.
  It does not hold altitude, climb rate, bank, heading or airspeed. Power, weight,
  lift, drag and terrain still determine the trajectory. An excessive climb can
  consume the available airspeed.
- Manual trim switches assistance off and applies the selected trim immediately.
  Switching AUTO TRIM off without selecting a new trim retains the current applied
  trim, avoiding a handover step. Switching it on starts from that manual setting.
- Pause freezes assistance. A restart clears the target and correction while
  preserving the chosen auto/manual mode. The underlying simulation and route
  test pilot do not enable this browser assistance implicitly.

## Bounded control policy

`FireBossAutoTrim` reads the current flight state and returns a pilot command with
only `ElevatorTrim` changed. It never writes attitude, velocity, position, mass or
engine power. It compensates the current conventional tail's static incidence
moment and the pitch damping needed in a banked turn, then applies pitch-error and
pitch-rate feedback. Euler pitch rate is `Q cos(bank) − R sin(bank)`, so ordinary
turning body rates are not mistaken for an unwanted pitch change.

These are **provisional assistance settings**, not manufacturer limits:

| Setting | Value / purpose |
| --- | --- |
| Trim movement | At most 0.12 normalized trim units/s |
| Correction / actual trim | Correction bounded to ±0.5; actual trim remains within the existing ±0.5 range |
| Pitch input deadband | 0.025 normalized input; larger input freezes correction |
| Pitch / rate feedback | 1.2 per radian / 0.6 per radian/s |
| Slow flight | Disable below 1.10 times modeled bank-adjusted stall speed; require 1.20 times before re-engaging |
| Attitude guard | Inhibit beyond 60° bank or 35° pitch |
| Surface guard | No capture or active hold on runway/water or after destruction |

Inhibition clears the target and returns the automatic correction toward zero at
the same bounded trim rate. Re-engagement captures the current nose angle. The
stall-speed estimate uses current mass, atmospheric density, bank and the existing
wing/maximum-lift parameters; it is an assistance margin, not a new certified speed.

The optional snapshot `auto_trim` contains `enabled`, `status`, `target_pitch_rad`,
`correction`, `manual_trim`, `applied_trim`, and `saturated`. Status distinguishes
`waiting`, `pilot`, `active`, `surface`, `low-speed`, `attitude`, and `manual`.
`active` means the controller is trying to hold its target, not that the target
has been reached. Saturation remains visible. The top-level `elevator_trim` and
`applied_controls` retain the last flown values; `auto_trim.applied_trim` also
reflects a mode/manual change before the next physics tick. `pending_controls`
contains the pilot's manual base, not the hidden sum of base and correction.

## Validation boundary

Focused native cases apply fixed pitch pulses and power steps to the actual
Fire Boss dynamics. They also test a real water release, a banked turn, saturation,
manual handover, pause/restart, and slow/surface inhibition. Static force balance
is only fixture preparation; no route test pilot steers these responses back into
their assertions. A disabled-assistance case reproduces raw telemetry exactly.
The existing open-loop handling tests remain manual and unchanged.

Initial measured examples (not hardware or manufacturer acceptance): a 0.75 s
rotation input at 55 m/s selected 9.42° nose-up and retained it 12 s later, gaining 115 m
with 52.83 m/s remaining. A short cruise pull selected 2.02° and retained it 12 s later
with 2.68 m/s climb, while the matched manual case returned to −4.91°. A 1421 kg water
release changed applied trim from 0.070 to −0.038. Fixed power steps still produced
different airspeeds and energy. With idle power after a pull, the aircraft lost
1157 J/kg of specific energy and reached low-speed inhibition at 36.14 m/s after
15.38 s; assistance neither added power nor concealed that limit.

The final focused run passed all 43 cases: 18 assistance cases plus the unchanged
raw handling, control-tap and snapshot-projection contracts. The retained local log
is `/private/tmp/fireboss-auto-trim-final.log`. A curated Cursor second opinion was
attempted but unavailable because the authenticated CLI session required login;
it supplied no review result. Root reviewed the runtime diff and the turn-rate
math received an independent agent review. Browser keyboard/touch, visible mode feedback and
the final release artifact require separate browser QA; these controller tests
do not certify the full flight experience.
