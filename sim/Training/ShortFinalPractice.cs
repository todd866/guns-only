using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Recovery;

namespace GunsOnly.Sim.Training;

/// Authored training geometry, not an F-22 operating limitation. Reuses the conventional
/// pattern's 3-degree line and the live-mass, configured-airframe approach speed/polar.
internal static class ShortFinalPractice {
    public static BeatSetup Create(BeatSetup source) {
        var runway = ConventionalRunway.FromRecoveryPlan(source.RecoveryPlan!);
        var systems = source.SystemsProfile!;
        var air = source.PlayerAir;
        const double alongM = -2 * 1852.0;
        const double slope = 3 * Math.PI / 180;
        double referenceHeight = new ConventionalLandingEnvelope().WheelContactReferenceHeightM;
        double altitude = runway.Threshold.Y + referenceHeight
            + (runway.TouchdownAimAlongM - alongM) * Math.Tan(slope);
        double mass = air.FuelFreeMassKg > 0
            ? air.FuelFreeMassKg + source.FuelLoadout.InitialFuelLb * 0.45359237
            : air.MassKg;
        double speed = SortieSchedule.ApproachTrueAirspeedMps(mass, air, systems, altitude);
        double dragToWeight = SortieSchedule.RecoveryDragToWeight(mass, air, systems, altitude);
        double throttle = Math.Clamp((dragToWeight - Math.Sin(slope))
            * mass * FlightModel.G0 / air.ThrustMaxN, 0, 1);
        return source with {
            Name = "Practice · short final", Practice = PracticeExercise.ShortFinal,
            Player = new AircraftState(runway.SurfacePoint(alongM) with { Y = altitude },
                speed, -slope, runway.HeadingRad, 0, mass),
            InitialThrottle = throttle, StageAtTrimThrottle = false,
            OpponentPresence = OpponentPresence.None,
            ContinuousCombat = null, VisualMergeEvaluation = null,
            Combat = CombatConfig.CarrierRecoveryOnly,
        };
    }
}
