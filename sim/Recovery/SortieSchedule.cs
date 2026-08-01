using System;

namespace GunsOnly.Sim.Recovery;

/// <summary>
/// Which leg of the sortie the schedule is currently answering for.
///
/// A carrier sortie is not one problem. Getting off the deck, getting somewhere, and getting back
/// aboard are governed by different limits and run on different clocks, and a schedule that tries
/// to answer all three with one equation ends up answering none of them.
/// </summary>
public enum SortieLeg {
    /// Spotted on the catapult, brakes on, not yet released. Nothing to fly yet.
    OnDeck = 0,
    /// Under the stroke, or just off the bow and still accelerating to a safe climb speed.
    Launch = 1,
    /// Climbing to the transit altitude on a speed schedule.
    Climb = 2,
    /// En route. The only leg where the aircraft is allowed to be comfortable.
    Transit = 3,
    /// Descending and decelerating toward the stabilisation point behind the ship.
    Recovery = 4,
    /// From the stabilisation point to the ramp. Seconds, and engine-limited.
    Groove = 5,
}

/// <summary>Which limit is shaping the schedule right now, so the pilot can be told WHY.</summary>
public enum SortieLimit {
    None = 0,
    /// All the thrust there is. On the climb-out of a 1950s carrier jet this is most of the leg.
    Thrust = 1,
    /// The approach speed floor. Below it the wing stops flying, and no amount of geometry helps.
    Stall = 2,
    /// Gear and flap placard.
    Configuration = 3,
    /// Geometry: the glideslope or the climb gradient is what is setting the target.
    Geometry = 4,
    /// Too much energy for the track remaining. The classic recovery failure.
    Energy = 5,
    /// The deck itself — length remaining, or the ramp.
    Deck = 6,
}

/// <summary>
/// The airframe- and ship-derived constants a sortie schedule needs. Every one of these is a
/// property of the aeroplane or the deck, not of the mission, which is what makes the same
/// schedule usable by a Panther, a Sabre or anything else that arrives later.
/// </summary>
public readonly record struct SortieReference(
    /// On-speed at the ramp, in the landing configuration. Derive it with
    /// <see cref="ApproachSpeedMps"/> rather than quoting a number.
    double ApproachSpeedMps,
    /// Speed to hold on the climb-out.
    double ClimbSpeedMps,
    /// Cruise, and the altitude it is flown at — both measured ABOVE THE DECK, never MSL.
    double TransitSpeedMps,
    double TransitHeightM,
    /// Height above the deck at the stabilisation point, where Recovery hands over to Groove.
    double StabiliseHeightM,
    /// Glideslope flown in the groove, radians. Carrier practice is steeper than a runway.
    double GlideslopeRad,
    /// Drag-to-weight in the recovery configuration: how much energy a metre of track buys back.
    double DragToWeight,
    /// Engine spool-up time constant. This is what makes a late wave-off expensive.
    double SpoolUpTauS);

/// <summary>
/// What to do right now, and why.
/// </summary>
public readonly record struct SortieScheduleState(
    bool Valid,
    SortieLeg Leg,
    /// Target height ABOVE THE DECK. Deck-relative on purpose: the previous schedule published an
    /// absolute 152.0 m MSL for every mission, which on the Rapier's 192 m strip put the floor
    /// forty metres underground. A height above the landing surface cannot make that mistake.
    double TargetHeightM,
    double TargetSpeedMps,
    /// Two-sided. 0.5 is trimmed; above means ADD power, below means take it off.
    double CommandedPower01,
    SortieLimit Limit,
    double DistanceToGoM,
    /// Seconds before the ramp by which a wave-off must be commanded for the engine to answer.
    /// Zero outside the groove.
    double WaveOffDecisionS);

/// <summary>
/// The launch/transit/recovery schedule, solved as pure arithmetic.
///
/// Two things are deliberately different from the recovery-only schedule that came before it.
///
/// FIRST, the power command is two-sided. The older solve took Math.Min(currentEnergy,
/// allowedEnergy) before differencing, which made the energy error non-negative by construction
/// and the commanded power <= 0.5 always — an instrument that could only ever tell you to take
/// power off. That is survivable on an approach and useless on a catapult stroke, so this one
/// keeps the sign.
///
/// SECOND, geometry and energy are separated. Altitude and speed come from where the aircraft
/// should BE (a climb gradient, a cruise, a glideslope); power comes from the difference between
/// the energy it has and the energy that geometry implies. The limit field then names which of the
/// two is binding, so "why is it asking for this?" has an answer rather than a shrug.
///
/// Pure: no session, no I/O, no clock. Same inputs, same answer, forever.
/// </summary>
public static class SortieSchedule {
    /// Energy band over which the power command saturates, in metres of specific energy. Wide
    /// enough that ordinary turbulence does not slam the throttle, narrow enough to be a cue.
    private const double PowerBandM = 300.0;

    /// The engine is ~86% of the way to commanded thrust after two time constants. That is the
    /// honest, simple answer to "how early must I decide", and it is airframe-derived: a
    /// centrifugal J42 at 4.5 s asks for nine seconds of foresight, an axial J47 half of it.
    private const double SpoolConstantsToAnswer = 2.0;

    /// <summary>
    /// On-speed for an aircraft at a given mass, in the landing configuration it actually lands in.
    ///
    /// The airframe supplies both terms. Deriving an approach speed from CLEAN CLmax instead is a
    /// mistake this project has already made and reverted: it flatters a straight wing and
    /// punishes a delta, because the whole point of the landing configuration is that it changes
    /// CLmax by a different amount on different wings.
    /// </summary>
    public static double ApproachSpeedMps(double massKg, AircraftParams air) {
        ArgumentNullException.ThrowIfNull(air);
        double stallKias = AirData.StallSpeedKias(
            massKg, air, positiveLoadFactor: 1.0,
            liftCoefficientIncrement: air.ApproachFlapCLIncrement);
        return air.ApproachStallMargin * stallKias / AirData.MpsToKnots;
    }

    /// <summary>Specific energy: the height the aircraft would reach trading all its speed.</summary>
    public static double SpecificEnergyM(double heightM, double trueAirspeedMps) =>
        heightM + trueAirspeedMps * trueAirspeedMps / (2.0 * FlightModel.G0);

    /// <summary>
    /// Solve the schedule for one instant.
    /// </summary>
    /// <param name="leg">Which leg the session says we are on.</param>
    /// <param name="heightAboveDeckM">Present height above the landing surface.</param>
    /// <param name="trueAirspeedMps">Present true airspeed.</param>
    /// <param name="distanceToGoM">
    /// Track remaining to the fix that ends this leg: the top of climb, or the ramp.
    /// </param>
    public static SortieScheduleState Solve(
        SortieLeg leg, double heightAboveDeckM, double trueAirspeedMps,
        double distanceToGoM, in SortieReference reference) {
        if (!double.IsFinite(heightAboveDeckM) || !double.IsFinite(trueAirspeedMps)
            || !double.IsFinite(distanceToGoM) || trueAirspeedMps < 0.0
            || !(reference.ApproachSpeedMps > 0.0)) {
            return new SortieScheduleState(false, leg, 0, 0, 0, SortieLimit.None, 0, 0);
        }

        double distance = Math.Max(0.0, distanceToGoM);

        return leg switch {
            SortieLeg.OnDeck => new SortieScheduleState(
                // Nothing is being asked of the pilot yet, but the schedule is still valid: the
                // aircraft should be at full power BEFORE the stroke, not after it.
                true, leg, 0.0, 0.0, 1.0, SortieLimit.Deck, distance, 0.0),

            SortieLeg.Launch => SolveLaunch(heightAboveDeckM, trueAirspeedMps, distance, reference),
            SortieLeg.Climb => SolveClimb(heightAboveDeckM, trueAirspeedMps, distance, reference),
            SortieLeg.Transit => SolveTransit(heightAboveDeckM, trueAirspeedMps, distance, reference),
            SortieLeg.Recovery => SolveRecovery(heightAboveDeckM, trueAirspeedMps, distance, reference),
            SortieLeg.Groove => SolveGroove(heightAboveDeckM, trueAirspeedMps, distance, reference),
            _ => new SortieScheduleState(false, leg, 0, 0, 0, SortieLimit.None, distance, 0),
        };
    }

    /// Off the bow with the deck behind you and not much else. Accelerate to climb speed in
    /// ground effect rather than pulling: a Panther leaving the cat at 120 kt has no energy to
    /// spend on a climb it has not earned yet.
    private static SortieScheduleState SolveLaunch(
        double heightM, double tasMps, double distance, in SortieReference r) {
        bool haveClimbSpeed = tasMps >= r.ClimbSpeedMps;
        double targetHeight = haveClimbSpeed
            ? Math.Min(r.TransitHeightM, heightM + 50.0)
            // Hold what you have until the speed is there. This is the accelerate-level segment
            // that every carrier launch flies and that no pilot enjoys.
            : Math.Max(heightM, 15.0);
        return new SortieScheduleState(
            true, SortieLeg.Launch, targetHeight,
            Math.Max(r.ClimbSpeedMps, tasMps),
            // There is no two-sided command here. There is one throttle position on a catapult
            // launch and it is all of it.
            1.0,
            haveClimbSpeed ? SortieLimit.Thrust : SortieLimit.Stall,
            distance, 0.0);
    }

    private static SortieScheduleState SolveClimb(
        double heightM, double tasMps, double distance, in SortieReference r) {
        double targetHeight = Math.Min(r.TransitHeightM, Math.Max(heightM, 0.0) + 100.0);
        double error = SpecificEnergyM(heightM, tasMps)
            - SpecificEnergyM(targetHeight, r.ClimbSpeedMps);
        return new SortieScheduleState(
            true, SortieLeg.Climb, targetHeight, r.ClimbSpeedMps,
            // Climb is thrust-limited in practice, but keep the command honest: if the aircraft is
            // somehow above the schedule it should be told so rather than held at the stop.
            Math.Clamp(1.0 - error / (2.0 * PowerBandM), 0.0, 1.0),
            SortieLimit.Thrust, distance, 0.0);
    }

    private static SortieScheduleState SolveTransit(
        double heightM, double tasMps, double distance, in SortieReference r) {
        double error = SpecificEnergyM(heightM, tasMps)
            - SpecificEnergyM(r.TransitHeightM, r.TransitSpeedMps);
        return new SortieScheduleState(
            true, SortieLeg.Transit, r.TransitHeightM, r.TransitSpeedMps,
            Math.Clamp(0.5 - error / (2.0 * PowerBandM), 0.0, 1.0),
            SortieLimit.None, distance, 0.0);
    }

    /// The energy solve, backwards from the stabilisation point — the only fixed end of a recovery.
    private static SortieScheduleState SolveRecovery(
        double heightM, double tasMps, double distance, in SortieReference r) {
        // Where geometry says to be: a straight line from the stabilisation point back up the
        // track, never above the transit altitude.
        double targetHeight = Math.Min(
            r.TransitHeightM, r.StabiliseHeightM + distance * Math.Tan(r.GlideslopeRad));
        // Speed bleeds from transit to on-speed over the last two kilometres. Arriving at the
        // stabilisation point fast is the failure this schedule exists to prevent.
        const double DecelerationTrackM = 2_000.0;
        double bleed = Math.Clamp(distance / DecelerationTrackM, 0.0, 1.0);
        double targetSpeed = r.ApproachSpeedMps
            + bleed * Math.Max(0.0, r.TransitSpeedMps - r.ApproachSpeedMps);

        // What the aircraft may have here, if it is going to bleed to the stabilisation point on
        // this drag: the stabilisation energy plus what the remaining track can absorb.
        double scheduledEnergy = SpecificEnergyM(r.StabiliseHeightM, r.ApproachSpeedMps)
            + r.DragToWeight * distance;
        // NOT Math.Min'd. The sign carries the answer: negative means low and slow, and low and
        // slow on an approach wants power, which the older schedule could not say.
        double energyError = SpecificEnergyM(heightM, tasMps) - scheduledEnergy;

        SortieLimit limit = energyError > PowerBandM ? SortieLimit.Energy
            : targetSpeed <= r.ApproachSpeedMps + 0.5 ? SortieLimit.Stall
            : SortieLimit.Geometry;

        return new SortieScheduleState(
            true, SortieLeg.Recovery, targetHeight, targetSpeed,
            Math.Clamp(0.5 - energyError / (2.0 * PowerBandM), 0.0, 1.0),
            limit, distance, 0.0);
    }

    /// The last kilometre. Glideslope and on-speed, and the number that actually matters on an
    /// axial deck: how long before the ramp a wave-off stops being available.
    private static SortieScheduleState SolveGroove(
        double heightM, double tasMps, double distance, in SortieReference r) {
        // Height above the DECK on the slope, going to zero at the ramp — which is the whole
        // reason this is deck-relative and not MSL.
        double targetHeight = distance * Math.Tan(r.GlideslopeRad);
        double error = SpecificEnergyM(heightM, tasMps)
            - SpecificEnergyM(targetHeight, r.ApproachSpeedMps);

        // An angled deck grants a bolter, so a late correction is cheap. This one does not: past
        // the ramp there is a barrier. The decision window is therefore set by how long the engine
        // takes to answer, which is a property of the ENGINE and not of the ship.
        double closureMps = Math.Max(1.0, tasMps);
        double secondsToRamp = distance / closureMps;
        double decisionS = Math.Max(0.0,
            secondsToRamp - SpoolConstantsToAnswer * Math.Max(0.0, r.SpoolUpTauS));

        return new SortieScheduleState(
            true, SortieLeg.Groove, targetHeight, r.ApproachSpeedMps,
            Math.Clamp(0.5 - error / (2.0 * PowerBandM), 0.0, 1.0),
            SortieLimit.Stall, distance, decisionS);
    }
}
