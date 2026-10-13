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
| D1 | −600/+20/−10; nose at player; +35 m/s | Veteran Su-27 | Defeat attack; survive 12 s |
| O2 | +700/+60/+30; 5° angle-off; −6 m/s | Veteran Su-27 | Gun kill |
| D2 | −800/+150/+60; nose at player; +20 m/s | Ace Su-27 | Force overshoot; survive 20 s |
| O3 | +750/+75/+40; 10° angle-off; equal TAS | Ace Su-27 | Gun kill |
| D3 | −1100/+400/+100; nose at player; +8 m/s | Ace Su-35 | Reverse to gun solution; survive 30 s |
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
about 20 s and reward a delayed break in most seeds. Reduced geometric advantage,
higher skill and stronger defensive objectives require measured validation.

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
