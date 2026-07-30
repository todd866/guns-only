# Rapier operations economy

## Application boundary

The economy is a mission rule, not an aircraft rule.

| Player-facing activity | Built-in beat | Economic mode |
| --- | ---: | --- |
| Guns Only — F-22 endless visual merge | 7 | Arcade |
| Low-Level Drone Intercept — F-22 | 8 | Arcade |
| Rapier Circuits | 11 | Training / arcade |
| Fixed-formation Rapier engineering sortie | 10 | Engineering / arcade |
| Rapier Intercept — dealt operations contract | 12 | `RapierOperations` |

The mission menu's **Rapier Intercept** card stages beat 12. It deals one of four long-range jobs:
high-altitude balloon, airborne early-warning aircraft, transport aircraft, or swarm carrier.
Sharing Rapier physics, the launcher, recovery strip, service-life recorder, or presentation does
not opt another mission into the ledger. Only
`MissionContract.EconomicMode == MissionEconomicMode.RapierOperations` does.

## Allocation-credit model

`rapier.operations.allocation-credit.v1` uses fictional allocation credits (`CR`). Credits are not
US dollars, procurement prices, or claims about a real force. The rate card is deliberately coarse:

| Confirmed line | Credits |
| --- | ---: |
| High-altitude balloon neutralized | +90 |
| Transport aircraft neutralized | +160 |
| Swarm carrier neutralized | +200 |
| Airborne early-warning aircraft neutralized | +260 |
| Rapier returned to strip | +20 |
| Fuel consumed | −1 per complete 50 lb |
| Gun ammunition consumed | −1 per started 20 rounds |
| Exceedance inspection reserved | −90 |
| Usage-evidence reconciliation | −20 |
| Confirmed Rapier loss reserve | −700 |

An unsuccessful mission still books observed consumables. A confirmed loss books the loss reserve
but does not pretend that an inspection was performed on an unavailable aircraft.

## “Bending” the aircraft

The authoritative 120 Hz service-life record can establish that a structural, dynamic-pressure,
thermal-proxy, or inlet-unstart review boundary was crossed. A returned aircraft with that evidence
books the fixed inspection reservation. This creates an immediate economic consequence for using
the aircraft hard without asserting that a component was damaged.

The current model does **not** compute:

- component fatigue or crack growth;
- residual strength;
- a repair or replacement disposition;
- a whole-aircraft life percentage; or
- a monetary repair bill.

Those remain `not_computed`. Later component assessment can add repair lines without rewriting the
raw sortie record or this historical inspection reservation.

## Authority and persistence

The kernel authors target, outcome, consumables, inspection trigger, service-life evidence status,
and a hash-addressed finalized sortie record. The browser may display those lines but cannot invent
new ones.

The local campaign profile stores the running Rapier balance and the newest 64 accepted service-life
record hashes. Applying the same hash again is a no-op, including after reload. Malformed or
missing hashes fail closed and do not change the balance. This is local prototype persistence, not
yet the multi-airframe component ledger, depot queue, or server-authoritative force economy
described in the Rapier service-life architecture.

Economy appears in the ready briefing and finished debrief only. It does not add in-flight HUD
chrome, change the F-22 score, or change flight-control limits.
