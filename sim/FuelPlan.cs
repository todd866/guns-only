namespace GunsOnly.Sim;

/// <summary>
/// The Rapier's fuel plan, in the terms a fuel plan is actually written in.
///
/// This replaces four unsourced numbers on the beat -- bingo 1,000 lb, joker 1,200 lb, minimum
/// 600 lb, emergency 300 lb -- which were ordered sensibly but derived from nothing, and which
/// therefore could not answer the only question that matters in the air: can I still get home and
/// hold for thirty minutes? A threshold you cannot trace to a duration is not a reserve, it is a
/// number that goes red.
///
/// FFR is fixed. Everything above it is a function of where the aircraft currently is, which is
/// why bingo has to be computed in flight rather than authored here.
/// </summary>
public static class FuelPlan {
    /// <summary>
    /// Measured, not asserted: level trimmed flight at recovery weight, swept 180-500 KTAS at
    /// 1,500 ft, minimum burn 15.4 lb/min at 300 KTAS. Higher and faster costs more, and below
    /// 300 KTAS the induced drag of a 616 kg/m2 delta costs more again -- max endurance on this
    /// wing is not slow flight.
    /// </summary>
    public const double MaxEnduranceFlowLbPerMinute = 15.4;

    /// Holding is flown at 1,500 ft above the strip, which is where the flow above was measured.
    public const double HoldingSpeedKtas = 300.0;

    public const double FixedFuelReserveMinutes = 30.0;

    /// <summary>
    /// FFR — fixed fuel reserve. Thirty minutes at max endurance, and the one number in the plan
    /// that never moves: 15.4 x 30 = 462 lb, taken up to 500. It is a floor, not a target; the
    /// aircraft is not required to land near it, it is required never to land below it.
    /// </summary>
    public const double FixedFuelReserveLb = 500.0;

    /// <summary>
    /// What the approach itself costs, from recovery entry to the wire: the descent, the pattern,
    /// the break, and the final. Held separately from FFR because it is spent whether or not you
    /// ever hold, so it cannot come out of the holding reserve.
    ///
    /// 300 lb is an operator figure, not a simulator measurement, and is deliberately conservative
    /// against the ~110-150 lb a clean uninterrupted circuit costs at 25-30 lb/min. An approach
    /// allowance sized on the circuit that works is sized on the wrong circuit: it has to cover
    /// the wave-off, the re-position and the second pass, because that is when the allowance is
    /// the thing standing between the aircraft and the reserve.
    /// </summary>
    public const double ApproachAllowanceLb = 300.0;

    /// <summary>
    /// MFR — minimum fuel reserve. Approach plus FFR: the least fuel that may remain at the point
    /// the approach begins. Arriving at the initial below this means the hold is already gone.
    /// </summary>
    public const double MinimumFuelReserveLb = ApproachAllowanceLb + FixedFuelReserveLb;

    /// <summary>
    /// Bingo — leave NOW and arrive at the initial with MFR intact. Depends on range and on the
    /// burn rate the aircraft is actually achieving, so it is computed in flight and this is only
    /// the floor it can never fall below.
    /// </summary>
    public static double BingoLb(double fuelToHomeLb) =>
        System.Math.Max(MinimumFuelReserveLb, fuelToHomeLb + MinimumFuelReserveLb);

    /// <summary>
    /// Cruise specific range, lb per nautical mile, at recovery weight. Measured by sweeping
    /// trimmed level flight and REJECTING any trial point the aircraft did not actually hold
    /// (speed within 3%, altitude within 300 m, lever off the idle stop). Without that rejection
    /// the sweep reports a decaying aeroplane at idle as spectacular economy -- an earlier pass
    /// returned 0.27 lb/NM at FL450, which was simply the jet falling out of the sky quietly.
    ///
    ///     FL450  M0.9   1.72 lb/NM      FL650  M1.5   1.49 lb/NM
    ///     FL550  M1.5   2.08 lb/NM      FL750  M2.0   1.07 lb/NM   <- best
    ///
    /// The best cruise this aircraft has is SUPERSONIC and high, not subsonic and low, which is
    /// the SR-71 answer and the same physics -- a ram-cycle aircraft is efficient where the ram
    /// cycle works. Flown properly it comes home at 1.07 lb/NM.
    ///
    /// And 1.07 is only the best SUSTAINED cruise. The aircraft also has a Sanger skip-glide --
    /// ZoomPull, coast, DipRelight, up to MaxLobSkips 3 -- flown on 220 kNm of cold-gas RCS once
    /// the wing has no air to work with. Each skip buys upwards of 100 km of near-zero-burn coast,
    /// so a lofted recovery beats every number in that table.
    ///
    /// 1.0 lb/NM is therefore the rule of thumb: it sits just inside the measured best cruise and
    /// well inside a skip-glide, and it is a number a pilot can actually hold in their head.
    ///
    /// It is deliberately NOT conservative, and that is a considered choice rather than an
    /// oversight. The rule of thumb is for briefing and for the range ring; the live bingo call
    /// runs off FuelModel.SmoothedBurnLbPerMinute, which is what the aircraft is ACTUALLY burning
    /// right now. So the plan assumes the good profile and the gauge catches you if you do not fly
    /// it -- which is how it works in an aeroplane, where you have both a rule of thumb and a fuel
    /// flow indication and you do not bet the recovery on the first one.
    ///
    /// The teaching consequence is deliberate: fly the subsonic descent-and-slow instinct home and
    /// you burn 1.7x the rule of thumb, and the gauge will tell you so long before the tank does.
    public const double CruiseLbPerNauticalMile = 1.0;

    /// Transit fuel to run <paramref name="distanceNm"/> home at cruise.
    public static double TransitLb(double distanceNm) =>
        CruiseLbPerNauticalMile * System.Math.Max(0.0, distanceNm);

    /// <summary>
    /// Joker — the advisory above bingo, so bingo is never a surprise. The transit plus 10%, on
    /// top of the reserves: a long way out it calls early and overhead it barely calls at all,
    /// which is behaviour a fixed pad cannot produce. The 10% is the margin for the wind, the
    /// routing and the burn being worse than planned.
    /// </summary>
    public static double JokerLb(double fuelToHomeLb) =>
        MinimumFuelReserveLb + 1.10 * System.Math.Max(0.0, fuelToHomeLb);

    /// Joker computed straight from range when a live burn estimate is not available.
    public static double JokerForRangeLb(double distanceNm) => JokerLb(TransitLb(distanceNm));

    /// Bingo computed straight from range when a live burn estimate is not available.
    public static double BingoForRangeLb(double distanceNm) => BingoLb(TransitLb(distanceNm));

    /// Below FFR the aircraft is into its reserve and the recovery is no longer discretionary.
    public const double EmergencyLb = FixedFuelReserveLb;
}
