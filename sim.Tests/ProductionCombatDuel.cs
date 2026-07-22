using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public enum ProductionCombatOutcome {
    ReferenceWin,
    EnemyWin,
    MutualKill,
    Timeout
}

/// <summary>
/// Frozen, renderer-free production combat geometry. FirstPassSafe holds both triggers through the
/// closest neutral pass; rear-quarter probes deliberately start hot to verify real lethality.
/// </summary>
public readonly record struct ProductionCombatScenario(
    string Id,
    AircraftState ReferenceStart,
    AircraftState EnemyStart,
    bool FirstPassSafe) {

    public static ProductionCombatScenario EnemyRearQuarter() {
        AircraftParams referenceAir = FlightModel.F22APublicDataSurrogate;
        AircraftParams enemyAir = FlightModel.Su27SPublicDataSurrogate;
        return new ProductionCombatScenario(
            "enemy-rear-quarter",
            new AircraftState(new Vec3D(0.0, 3000.0, 0.0),
                235.0, 0.0, 0.0, 0.0, referenceAir.MassKg),
            new AircraftState(new Vec3D(0.0, 3000.0, -220.0),
                235.0, 0.0, 0.0, 0.0, enemyAir.MassKg),
            FirstPassSafe: false);
    }

    public static ProductionCombatScenario ReferenceRearQuarter() {
        AircraftParams referenceAir = FlightModel.F22APublicDataSurrogate;
        AircraftParams enemyAir = FlightModel.Su27SPublicDataSurrogate;
        return new ProductionCombatScenario(
            "reference-rear-quarter",
            new AircraftState(new Vec3D(0.0, 3000.0, -220.0),
                235.0, 0.0, 0.0, 0.0, referenceAir.MassKg),
            new AircraftState(new Vec3D(0.0, 3000.0, 0.0),
                235.0, 0.0, 0.0, 0.0, enemyAir.MassKg),
            FirstPassSafe: false);
    }

    public static ProductionCombatScenario OffsetNeutralMerge(int engagementNumber) {
        if (engagementNumber < 1)
            throw new ArgumentOutOfRangeException(nameof(engagementNumber));
        BeatSetup beat = Beats.ModernVisualMerge();
        AircraftState reference = beat.Player;
        ReactiveBandit stagedEnemy = ReactiveBandit.SpawnForMerge(
            reference, beat.BanditAir, engagementNumber,
            beat.Bandit.Speed, PilotSkill.Competent);
        return new ProductionCombatScenario(
            $"offset-neutral-merge-{engagementNumber}",
            reference,
            stagedEnemy.State,
            FirstPassSafe: true);
    }
}

public readonly record struct ProductionCombatResult(
    ProductionCombatOutcome Outcome,
    double ElapsedSeconds,
    bool FirstPassOpened,
    double MinimumRangeM,
    int ReferenceRoundsFired,
    int EnemyRoundsFired,
    int ReferenceHits,
    int EnemyHits,
    int ReferenceEnvelopeTicks,
    int EnemyEnvelopeTicks,
    double ReferenceMinimumNoseErrorDegInRange,
    double EnemyMinimumNoseErrorDegInRange,
    int ReferenceAmmoRemaining,
    int EnemyAmmoRemaining);

public readonly record struct ProductionCombatSweepResult(
    int Engagements,
    int ReferenceWins,
    int EnemyWins,
    int MutualKills,
    int Timeouts,
    int ReferenceRoundsFired,
    int EnemyRoundsFired,
    int ReferenceHits,
    int EnemyHits,
    int ReferenceEnvelopeTicks,
    int EnemyEnvelopeTicks,
    double ReferenceMinimumNoseErrorDegInRange,
    double EnemyMinimumNoseErrorDegInRange);

/// <summary>
/// Actual-kill evaluator for the production modern fighter pairing. It deliberately mirrors the
/// session's ordering: both trigger decisions and both guns consume the same beginning-of-tick
/// sample, then both pilots advance. No camera cone, burst proxy, or fabricated damage is involved.
/// </summary>
public static class ProductionCombatDuel {
    const double Dt = SimulationSession.FixedDeltaSeconds;
    const double MergeGateM = 900.0;
    const double OpeningConfirmationSeconds = 0.20;

    public static ProductionCombatSweepResult SweepOffsetMerges(
        PilotSkill referenceSkill,
        PilotSkill enemySkill,
        int engagements = 3,
        double maximumSecondsPerEngagement = 25.0) {
        if (engagements < 1) throw new ArgumentOutOfRangeException(nameof(engagements));
        int referenceWins = 0, enemyWins = 0, mutualKills = 0, timeouts = 0;
        int referenceRounds = 0, enemyRounds = 0, referenceHits = 0, enemyHits = 0;
        int referenceEnvelopeTicks = 0, enemyEnvelopeTicks = 0;
        double referenceMinimumNoseErrorDeg = double.PositiveInfinity;
        double enemyMinimumNoseErrorDeg = double.PositiveInfinity;
        for (int engagement = 1; engagement <= engagements; engagement++) {
            ProductionCombatScenario scenario =
                ProductionCombatScenario.OffsetNeutralMerge(engagement);
            ProductionCombatResult result = Fly(
                scenario, referenceSkill, enemySkill, maximumSecondsPerEngagement);
            switch (result.Outcome) {
                case ProductionCombatOutcome.ReferenceWin: referenceWins++; break;
                case ProductionCombatOutcome.EnemyWin: enemyWins++; break;
                case ProductionCombatOutcome.MutualKill: mutualKills++; break;
                default: timeouts++; break;
            }
            referenceRounds += result.ReferenceRoundsFired;
            enemyRounds += result.EnemyRoundsFired;
            referenceHits += result.ReferenceHits;
            enemyHits += result.EnemyHits;
            referenceEnvelopeTicks += result.ReferenceEnvelopeTicks;
            enemyEnvelopeTicks += result.EnemyEnvelopeTicks;
            referenceMinimumNoseErrorDeg = System.Math.Min(referenceMinimumNoseErrorDeg,
                result.ReferenceMinimumNoseErrorDegInRange);
            enemyMinimumNoseErrorDeg = System.Math.Min(enemyMinimumNoseErrorDeg,
                result.EnemyMinimumNoseErrorDegInRange);
        }
        return new ProductionCombatSweepResult(
            engagements,
            referenceWins,
            enemyWins,
            mutualKills,
            timeouts,
            referenceRounds,
            enemyRounds,
            referenceHits,
            enemyHits,
            referenceEnvelopeTicks,
            enemyEnvelopeTicks,
            referenceMinimumNoseErrorDeg,
            enemyMinimumNoseErrorDeg);
    }

    public static ProductionCombatResult Fly(
        in ProductionCombatScenario scenario,
        PilotSkill referenceSkill,
        PilotSkill enemySkill,
        double maximumSeconds = 40.0) {
        if (!double.IsFinite(maximumSeconds) || maximumSeconds <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(maximumSeconds));

        AircraftParams referenceAir = FlightModel.F22APublicDataSurrogate;
        AircraftParams enemyAir = FlightModel.Su27SPublicDataSurrogate;
        var reference = new ReactiveBandit(
            scenario.ReferenceStart, referenceAir, referenceSkill);
        var enemy = new ReactiveBandit(
            scenario.EnemyStart, enemyAir, enemySkill);
        CombatConfig combat = CombatConfig.ModernVisualMerge;
        var referenceGun = new GunKill(
            combat.PlayerAmmo,
            combat.OpponentHitsToDefeat,
            combat.PlayerGunProfile.EffectiveHitRadiusM,
            combat.PlayerGunProfile);
        var enemyGun = new GunKill(
            combat.OpponentAmmo,
            combat.PlayerHitsToDefeat,
            combat.OpponentGunProfile.EffectiveHitRadiusM,
            combat.OpponentGunProfile);

        double minimumRangeM = Geometry.Range(reference.State, enemy.State);
        double previousRangeM = minimumRangeM;
        double openingSeconds = 0.0;
        bool firstPassOpened = !scenario.FirstPassSafe;
        int referenceEnvelopeTicks = 0;
        int enemyEnvelopeTicks = 0;
        double referenceMinimumNoseErrorRad = double.PositiveInfinity;
        double enemyMinimumNoseErrorRad = double.PositiveInfinity;
        int maximumTicks = checked((int)System.Math.Ceiling(maximumSeconds / Dt));

        for (int tick = 0; tick < maximumTicks; tick++) {
            AircraftState referenceState = reference.State;
            AircraftState enemyState = enemy.State;
            double rangeM = Geometry.Range(referenceState, enemyState);
            minimumRangeM = System.Math.Min(minimumRangeM, rangeM);

            if (!firstPassOpened && minimumRangeM <= MergeGateM) {
                bool opening = rangeM > previousRangeM
                    && rangeM >= minimumRangeM + 20.0;
                openingSeconds = opening ? openingSeconds + Dt : 0.0;
                firstPassOpened = openingSeconds >= OpeningConfirmationSeconds;
            }
            previousRangeM = rangeM;

            ActorObservation enemyObservation = ActorObservation.Capture(enemyState, tick);
            ActorObservation referenceObservation = ActorObservation.Capture(referenceState, tick);
            if (firstPassOpened && rangeM <= BanditFireControl.MaximumRangeM) {
                double referenceNoseError = BanditFireControl.NoseErrorRad(
                    referenceState, enemyObservation);
                double enemyNoseError = BanditFireControl.NoseErrorRad(
                    enemyState, referenceObservation);
                referenceMinimumNoseErrorRad = System.Math.Min(
                    referenceMinimumNoseErrorRad, referenceNoseError);
                enemyMinimumNoseErrorRad = System.Math.Min(
                    enemyMinimumNoseErrorRad, enemyNoseError);
                if (BanditFireControl.InFiringEnvelope(referenceState, enemyObservation))
                    referenceEnvelopeTicks++;
                if (BanditFireControl.InFiringEnvelope(enemyState, referenceObservation))
                    enemyEnvelopeTicks++;
            }
            bool referenceTrigger = firstPassOpened
                && referenceGun.TargetAlive
                && reference.WantsToFire(enemyObservation);
            bool enemyTrigger = firstPassOpened
                && enemyGun.TargetAlive
                && enemy.WantsToFire(referenceObservation);

            referenceGun.Step(referenceTrigger, referenceState, enemyState, Dt);
            enemyGun.Step(enemyTrigger, enemyState, referenceState, Dt);

            bool enemyDestroyed = referenceGun.Outcome == FightOutcome.Splash;
            bool referenceDestroyed = enemyGun.Outcome == FightOutcome.Splash;
            if (referenceDestroyed || enemyDestroyed) {
                ProductionCombatOutcome outcome = referenceDestroyed && enemyDestroyed
                    ? ProductionCombatOutcome.MutualKill
                    : enemyDestroyed
                        ? ProductionCombatOutcome.ReferenceWin
                        : ProductionCombatOutcome.EnemyWin;
                return Result(outcome, (tick + 1) * Dt);
            }

            reference.Step(enemyObservation, Dt);
            enemy.Step(referenceObservation, Dt);
        }

        return Result(ProductionCombatOutcome.Timeout, maximumTicks * Dt);

        ProductionCombatResult Result(ProductionCombatOutcome outcome, double elapsedSeconds) => new(
            outcome,
            elapsedSeconds,
            firstPassOpened,
            minimumRangeM,
            referenceGun.RoundsFired,
            enemyGun.RoundsFired,
            referenceGun.HitCount,
            enemyGun.HitCount,
            referenceEnvelopeTicks,
            enemyEnvelopeTicks,
            referenceMinimumNoseErrorRad * 180.0 / System.Math.PI,
            enemyMinimumNoseErrorRad * 180.0 / System.Math.PI,
            referenceGun.AmmoRemaining,
            enemyGun.AmmoRemaining);
    }
}
