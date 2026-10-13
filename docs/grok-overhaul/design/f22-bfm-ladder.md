# F-22 alternating BFM ladder

Owner decision, 13 October 2026: alternate easy player kill / easy AI kill, then narrow
both advantages toward neutral BFM. This supersedes Option A for Guns Only; frozen
missions and opt-in Kestrel retain their contracts. These are authored surrogate
training sets, not F-22 doctrine or measured aircraft-performance data.

## Sets and proof

Distances are relative to the player's heading; speed deltas are true airspeed.
The player retains live position, energy, fuel, ammunition and damage between sets.
Only a newly arriving opponent is staged; no living aircraft is repositioned.
O1 uses a1's exact 650 m / 45 m lateral / 25 m high, −12 m/s, 15° bank Present.
All other sets start fighting immediately, with ordinary ballistics and damage.

| Set | Start geometry / energy | Opponent | Advance only on |
|---|---|---|---|
| O1 | Ahead 650 m, low aspect; player +12 m/s | Competent Su-27; bounded Present → fight | Physical gun kill |
| D1 | Behind 600 m, 20 m lateral, 10 m low, same heading; attacker +35 m/s | Veteran Su-27; live guns attack | Defeat attack (below), survive ≥12 s |
| O2 | Ahead 900 m, 150 m lateral, 50 m high, 20° angle-off; player +6 m/s | Veteran Su-27; ordinary tactics | Physical gun kill |
| D2 | Behind 800 m, 150 m lateral, 60 m high, nose toward player; attacker +20 m/s | Ace Su-27; live attack | Defeat attack, survive ≥20 s |
| O3 | Ahead 1,200 m, 400 m lateral, 100 m high, 60° angle-off; equal speed | Ace Su-27; ordinary tactics | Physical gun kill |
| D3 | Behind 1,100 m, 400 m lateral, 100 m high, nose toward player; attacker +8 m/s | Ace Su-35; live attack | Defeat attack, survive ≥30 s |
| N | Existing reciprocal merge at own-aircraft corner speeds | Ace Su-27 | Physical gun kill |
| A2 | Existing pair merges, own-aircraft corner speeds | Ace Su-35 pair | Defeat pair; stays at ceiling |

Defensive proof: alive at the set's minimum time, plus three continuous seconds with
no opponent gun solution and range ≤1,500 m. Also require either ≥45° angle-off
between flight paths or the attacker ahead of the player's 3–9 line within 900 m.
This observes an attack defeated in close combat; simply running away does not pass.
A defensive gun kill also passes. No scripted miss, invulnerability, G/thrust changes,
or inflated hit volumes. Passive D1 should die within about 20 s; a delayed break into
the attack should survive in most seeds. D1 is deliberately punishing if ignored.

Later sets reduce geometric advantage; greater opponent skill and longer defensive
proof make the task harder. This is a hypothesis until seed sweeps show offensive
kill-time and defensive success-rate curves. Do not claim monotonic difficulty from
geometry alone. Keep existing pressure diagnostics, labelled with their known limits.

## Sorties, persistence and failure

One normal sortie is O then D: offensive conversion followed by defence, preserving
one aircraft's resources. O1's second engagement is always D1. A failed set repeats
on Again, including D alone after losing D: do not make the player re-prove O. No
automatic easing or demotion initially; expected defensive losses are not evidence
that the preceding offensive skill was lost. A non-gun offensive victory repeats O.
RTB/abandon is incomplete and never advances. Defensive success ends the combat task
via the existing ceasefire/recovery handoff, without calling the living bandit dead.
N and A2 retain the two-engagement cap. Recovery remains optional and honestly separate.

Version 3 of the existing opaque director blob stores the next set. v1 → O1;
v2 unproven/hit-only → O1, gun-kill single → O2, earned pair → A2. No inference of
defensive proficiency from old hits. Preserve historical hit/kill totals and legacy
pacing data; malformed imports are atomic failures. Assist is fixed within each
sortie, using the pair's old rung scale (O1/D1 full, O2/D2 half, later none).

## Result and correction

Reuse the existing OPP row (no added row): `D1 × → D1` or `D1 ✓ → O2`.
Tooltip/aria-label carries opponent, criterion and outcome. Existing correction row
shows one action after a failed lesson: O1/O2 “Track the lead”; O3/N/A2 “Control closure”;
D1/D2/D3 “Break into him”. Suppress unrelated generic practice suggestions for these
lessons. The rest of the result instrument and Again/Recover controls remain.

The correction is based on the public USN [P-821, §1014, p.10-47](https://navyflightmanuals.tpub.com/P-821/Flight-Path-Overshoot-263.htm)
(reproduced manual): turn into a nose-on attack to increase angle-off and closure;
a close overshoot can offer a reversal. The [CNATRA strike syllabus, BFM41](https://www.cnatra.navy.mil/local/docs/mcg/1542.164.pdf)
explicitly trains offensive, defensive and neutral perch sets. Neither source supplies
this game's numeric thresholds; those require deterministic and real-input validation.
