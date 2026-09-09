using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Training;

/// Practice changes the authored start and objective, not aircraft, ballistics or landing rules.
/// The underlying environment/airframe identity stays intact; Practice is an orthogonal contract
/// that every result and logbook projects explicitly. No practice attempt awards sortie credit.
public static class PracticeBeats {
    public static BeatSetup Create(PracticeExercise exercise) {
        if (exercise == PracticeExercise.Valley)
            return Beats.ModernVisualMergeFirstRun() with {
                Name = "Practice · Kestrel valley", Practice = exercise,
            };
        BeatSetup source = Beats.ModernVisualMerge();
        if (exercise == PracticeExercise.Gunnery) {
            // An explicitly unarmed, scripted target flies ahead of the player. Two physical
            // hits close the exercise; aiming at a marker or merely pressing Fire does not.
            const double altitude = 3048;
            double speed = AirData.TrueAirspeedForCalibratedAirspeedMps(
                300 / AirData.MpsToKnots, altitude);
            return source with {
                Name = "Practice · controlled gun pass", Practice = exercise,
                Player = new AircraftState(new Vec3D(1280, altitude, -4000),
                    speed, 0, 0, 0, source.PlayerAir.MassKg),
                Bandit = new AircraftState(new Vec3D(1280, altitude, -3450),
                    speed, 0, 0, 0, source.BanditAir.MassKg),
                UsesNeutralMergeBandit = false, UsesReactiveBandit = false,
                ContinuousCombat = null, VisualMergeEvaluation = null,
                Combat = source.CombatRules with { OpponentAmmo = 0 },
                BanditTimeline = new() { (0, new PilotCommand(1, 0, 0.55, 0)) },
            };
        }
        if (exercise == PracticeExercise.Recovery) {
            var runway = ConventionalRunway.FromRecoveryPlan(source.RecoveryPlan!);
            double altitude = runway.Threshold.Y + 914.4;
            Vec3D start = runway.Threshold - runway.Forward * (8 * 1852.0);
            return source with {
                Name = "Practice · runway recovery", Practice = exercise,
                Player = new AircraftState(new Vec3D(start.X, altitude, start.Z),
                    AirData.TrueAirspeedForCalibratedAirspeedMps(
                        240 / AirData.MpsToKnots, altitude),
                    0, runway.HeadingRad, 0, source.PlayerAir.MassKg),
                OpponentPresence = OpponentPresence.None,
                ContinuousCombat = null, VisualMergeEvaluation = null,
                Combat = CombatConfig.CarrierRecoveryOnly,
            };
        }
        throw new ArgumentOutOfRangeException(nameof(exercise));
    }
}
