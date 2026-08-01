# 45 — Fuel planning

← [40 — Mass and CG](40-mass-and-cg.md) · Kernel: `sim/FuelPlan.cs`

How much fuel this aircraft needs, expressed the way a fuel plan is actually written, and where
each number came from. Everything here is either measured in the kernel or explicitly marked as an
operator decision. Nothing in this chapter is authored to make a mission work.

## The plan

| Element | Value | Kind | Source |
| --- | --- | --- | --- |
| Internal capacity | 9,920 lb (4,500 kg) | — | definition |
| Launch load | **full internal** | — | full tank puts launch mass on design gross, 11,090 kg |
| Max endurance flow | 15.4 lb/min @ 300 KTAS, 1,500 ft | **measured** | swept 180–500 KTAS, trimmed level |
| **FFR** — fixed fuel reserve | **500 lb** | operator | 30 min × 15.4 = 462, taken up |
| **Approach allowance** | **300 lb** | operator | conservative vs ~110–150 lb for a clean circuit |
| **MFR** — minimum fuel reserve | **800 lb** | derived | approach + FFR |
| Cruise rule of thumb | **1.0 lb/NM** | measured-adjacent | best sustained cruise is 1.07 |
| **Bingo** | transit + MFR | derived, live | `FuelPlan.BingoLb` |
| **Joker** | 1.10 × transit + MFR | derived, live | `FuelPlan.JokerLb` |

## Why the launch load is full

Fuel drives mass — `SimulationSession` sets `Mass = FuelFreeMassKg + fuel` — and 9,920 lb is
4,500 kg, so a full tank is 6,590 + 4,500 = **11,090 kg, exactly the design gross weight**. Every
published number for this aircraft is computed there: identity gross, dry T/W 0.46, augmented T/W
0.71, the family cap, and the V-n corner that sets Vmo.

The card previously launched on 3,600 lb — 36% of the tank, 8,223 kg — so the aircraft flew 26%
below its own design point, the flight-test gates checked a weight the mission never used, and it
felt more overpowered than the design because it was. There is no launch mass limit anywhere in
the kernel, the launch-gallery basis, or the gear and arrest chapter.

## Specific range: the best cruise is supersonic

Measured at recovery weight, holding **both** speed and altitude:

| | M0.9 | M1.5 | M2.0 | M2.5 |
| --- | --- | --- | --- | --- |
| FL450 | **1.72** | 2.97 | 4.50 | — |
| FL550 | 2.41 | 2.08 | 2.65 | 4.29 |
| FL650 | 3.66 | **1.49** | 1.80 | 2.53 |
| FL750 | — | 2.03 | **1.07** | — |

lb/NM. The best cruise this aircraft has is **FL750 at M2.0**, and a subsonic cruise is the *worst*
option available to it — down low the delta carries its weight badly and the turbine is throttled
into its thirsty corner. This is the SR-71 answer and the same physics: a ram-cycle aircraft is
efficient where the ram cycle works.

The teaching consequence is deliberate. Fly the instinct — descend and slow down to go home — and
you burn **1.7× the rule of thumb**.

The Sänger skip-glide beats every number in that table: `ZoomPull → ZoomCoast → DipRelight`, up to
`MaxLobSkips` 3, flown on 220 kNm of cold-gas RCS, each skip buying 100+ km of near-zero-burn
coast.

**Measurement warning.** A specific-range sweep that does not verify the aircraft actually *held*
the trial point will report a jet falling quietly out of the sky as excellent economy. An early
pass here returned 0.27 lb/NM at FL450 and briefly moved the RTB cruise down to FL350 on that
basis. Reject any trial point where speed drifts >3%, altitude >300 m, or the lever sits on idle.

## Why the rule of thumb is not conservative

1.0 lb/NM sits just inside the best measured cruise, and it is deliberately **not** padded. The
rule of thumb is for briefing and the range ring; the live bingo call runs off
`FuelModel.SmoothedBurnLbPerMinute` — what the aircraft is *actually* burning. So the plan assumes
the good profile and the gauge catches you if you do not fly it, which is how it works in an
aeroplane: you have both a rule of thumb and a fuel flow indication, and you do not bet the
recovery on the first one.

## A rate is the wrong shape for the outbound leg

The outbound leg is a full-augmentor climb and acceleration, not a cruise, so it is a **block**:

| Segment | Cost | Shape |
| --- | --- | --- |
| Climb + accel to FL400 / M1.84 | ~900 lb over ~86 NM | block |
| Cruise out beyond that | 1–2 lb/NM | rate |
| Fight | block | — |
| Cruise home, FL750 / M2.0 | 1.07 lb/NM | rate |
| Approach | 300 lb | block |
| FFR | 500 lb | block |

Pricing the climb as cruise under-plans the sortie badly. It is also why a whole 250 km sortie
averages ~12 lb/NM while the cruise is ~1: almost all of it is the climb and the fight.

**Provisional:** the ~900 lb climb block is inferred from burn rate × time, not measured
end-to-end. The 1.07 lb/NM return figure and the 15.4 lb/min endurance flow are direct
measurements.
