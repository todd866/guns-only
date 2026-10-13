# F-22 alternating BFM ladder

Owner decision, 13 October 2026: easy player kill, easy AI kill, then progressively
narrower advantages toward neutral BFM. Supersedes Option A for Guns Only. Frozen
missions/Kestrel retain their contracts. All numbers below are authored surrogate
tuning, not aircraft data or doctrine limits.

## Sets

Positions are metres along/right/above the player's flight path; ΔV is attacker
minus player TAS. Player position, energy, fuel, ammunition and damage persist;
only a new opponent is staged. Never reposition a living aircraft.

| Set | Position; heading; ΔV | Opponent | Demonstrate |
|---|---|---|---|
| O1 | +650/+45/+25; same; −12 m/s | Competent Su-27 | Gun kill |
| D1 | −900/+150/−10; nose at player; +30 m/s | Veteran Su-27 | Defeat attack; survive 12 s |
| O2 | +700/+60/+30; 5° angle-off; −6 m/s | Veteran Su-27 | Gun kill |
| D2 | −800/+150/+60; nose at player; +20 m/s | Ace Su-27 | Force overshoot; survive 20 s |
| O3 | +750/+75/+40; 10° angle-off; equal TAS | Ace Su-27 | Gun kill |
| D3 | −900/+150/+60; nose at player; +25 m/s | Veteran Su-27 | Reverse to gun solution; survive 30 s |
| N | Existing reciprocal merge; aircraft corner speeds | Ace Su-27 | Gun kill |
| A2 | Existing pair merge; aircraft corner speeds | Ace Su-35 pair | Defeat pair; ceiling |

O1 retains a1's exact 15° bank lead. O2/O3 use 20°/25° bank. All three retain the
bounded Present → fight transition: first physical hit, tracking/proximity latch,
or 12 s cap. Defensive opponents fight immediately. No scripted misses, invulnerability,
inflated hit volumes, thrust/G changes, or generated radio.

Defensive proof first requires a rear attack within 120–900 m, attacker nose within
10°, or a real opponent gun solution. With the opponent's solution denied:

- D1: three continuous seconds within 1,500 m at ≥45° angle-off, or attacker ahead
  of the player's 3–9 line within 900 m.
- D2: attacker ahead within 900 m for one second.
- D3: player gun solution inside 900 m for 0.5 s.

Retain close-combat proof through separation; require survival to the minimum time
and no opponent solution in the final three seconds. Running straight away cannot
qualify. A defensive gun kill also passes. D1 should kill passive pilots within
about 20 s and reward a delayed break in most seeds.

Measured 13 Oct 2026 (`BFM_SWEEP=1`, `BfmLadderSweepReport`, 8 seeds, 220–280 ms
delayed stick/throttle/trigger pilots; pass = the session's own BFM outcome; 60 s cap,
N 90 s). Pass counts, median time to pass / to death:

| Lesson | Passive | Taught move | Wrong move |
|---|---|---|---|
| O1 | 0/8 | 8/8, 2.7 s | pure pursuit 8/8, 2.6 s |
| D1 | 0/8, dead 8/8 at 9.0 s | break 8/8, 12.0 s | extend 0/8 (survives) |
| O2 | 0/8 | 8/8, 3.1 s | 8/8, 3.0 s |
| D2 | 0/8, dead 8/8 at 11.7 s | break + idle overshoot 7/8, 20.0 s | extend 0/8 |
| O3 | 0/8, dead 8/8 at 27.9 s | 8/8, 5.1 s | 8/8, 6.8 s |
| D3 | 0/8, dead 8/8 at 10.0 s | overshoot + reverse 1/8, 13.0 s | extend 0/8 |
| N | 0/8 | 0/8 in 90 s | 0/8 |

D1 was −600/+20/+35 (Veteran): the shot opened at t=0 from dead six, and the same
break passed 2–5/8 depending only on stick speed, below D2's 7/8. D3 was −1100/+400/+8
(Ace Su-35): that rejected start slashed past at 100–140° crossing angle and the
reversal pilot passed 0/8. An Ace Su-27 at the new geometry also passed 0/8;
the approved Veteran Su-27 start in the table above improved this to 1/8. Offensive
pass rate does not fall for this pilot (only time and rounds rise); the gentler HUD
pilot in `LaterOffensivePairsReduceConversionForTheSameDelayedPilots` gives 8/3/0.
Neither the harness pilot nor any other automated pilot has gunned a free-manoeuvring
Ace here, so N and D3 learnability for humans remain unmeasured.

## Sorties and persistence

One normal sortie = O then D: conversion followed by defence on the same resources.
O1's second engagement is D1. Failure repeats the current lesson on Again; losing D
restarts D alone, preserving the earned O. No automatic easing/demotion. Non-gun
O victories repeat O; RTB/abandon never advances. Defensive success uses the existing
ceasefire/recovery handoff without declaring the living bandit dead. N/A2 retain the
two-engagement cap. Landing remains optional and separately recorded.

Director blob v3 appends the next lesson. Migrate v1 → O1; v2 hit-only/unproven → O1,
gun-kill single → O2, earned pair → A2. Preserve historical evidence, legacy pacing
and the BFM bookmark through Kestrel; malformed imports change nothing. Assist stays
fixed per sortie: O1/D1 full, O2/D2 half, later none.

## Result and evidence

Reuse the OPP row as BFM: `D1 × → D1` / `D1 ✓ → O2`. Tooltip/aria-label carries
opponent, criterion and outcome. Existing correction row: O1/O2 “Track the lead”;
O3/N/A2 “Control closure”; D1 “Break into him”; D2 “Force the overshoot”; D3 “Reverse
into his six”. Suppress unrelated practice suggestions; retain Again/Recover.

Public USN [P-821 §1014, p.10-47](https://navyflightmanuals.tpub.com/P-821/Flight-Path-Overshoot-263.htm)
(reproduced manual) describes turning into a nose-on attack and exploiting a close
overshoot to reverse. [CNATRA BFM41](https://www.cnatra.navy.mil/local/docs/mcg/1542.164.pdf)
trains offensive, defensive and neutral sets. Numeric thresholds here are game tuning.
Acceptance: deterministic delayed-input sweeps, migration/progression tests, existing
pressure report, and real-touch phone-landscape O1→D1 screenshots. Geometry or code
checks alone cannot establish a playable, monotonically harder ladder.
