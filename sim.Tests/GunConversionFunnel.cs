using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

/// One tier's measured path from "has the target in range" to "puts rounds into it".
public readonly record struct GunConversionFunnelResult(
    PilotSkill Tier,
    int Engagements,
    double FlownSeconds,
    double InRangeSeconds,
    double CoarseTrackingSeconds,
    double BodyGateSeconds,
    double LeadGateSeconds,
    double EligibleSeconds,
    double EligibleBlockedByRecoverySeconds,
    double MaxContinuousEligibleSeconds,
    double TriggerSeconds,
    int RoundsFired,
    int Hits,
    double MedianInRangeBodyErrorDeg,
    double TenthPercentileInRangeBodyErrorDeg,
    double MedianInRangeLeadErrorDeg,
    double TenthPercentileInRangeLeadErrorDeg = double.NaN) {

    public double TriggerConversion =>
        EligibleSeconds > 0.0 ? TriggerSeconds / EligibleSeconds : 0.0;
    public double HitsPerRound => RoundsFired > 0 ? (double)Hits / RoundsFired : 0.0;

    public override string ToString() =>
        $"{Tier,-9} range={InRangeSeconds,6:F1}s  <12deg={CoarseTrackingSeconds,6:F1}s  "
        + $"body={BodyGateSeconds,5:F1}s  lead={LeadGateSeconds,5:F1}s  "
        + $"eligible={EligibleSeconds,5:F1}s (maxWin={MaxContinuousEligibleSeconds,4:F2}s) "
        + $"blockedByRecovery={EligibleBlockedByRecoverySeconds,4:F1}s  "
        + $"trigger={TriggerSeconds,5:F1}s conv={TriggerConversion,5:P0}  "
        + $"rounds={RoundsFired,4} hits={Hits,3} h/r={HitsPerRound,5:P0}  "
        + $"bodyErr p10/med={TenthPercentileInRangeBodyErrorDeg,6:F1}/"
        + $"{MedianInRangeBodyErrorDeg,6:F1}deg  leadErr p10/med="
        + $"{TenthPercentileInRangeLeadErrorDeg,6:F1}/{MedianInRangeLeadErrorDeg,6:F1}deg";
}

/// <summary>
/// Diagnostic instrument for "the bandit has gun range and never shoots". It mirrors
/// <see cref="ProductionCombatDuel"/>'s tick ordering and real guns exactly, but records the
/// per-tick funnel from range -> coarse track -> the tier's OWN body gate -> the tier's lead
/// gate -> actual angular eligibility -> trigger -> rounds -> hits.
///
/// Why not BfmDuel: its "gun solution" is CameraSolver.GunWindow — range &lt; 800 m and angle
/// &lt; 12 deg, with no minimum range. The live gate is 120-900 m at 3-5 deg, so that predicate is
/// up to four times wider in angle and cannot discriminate a fine-tracking failure from a
/// fire-control one. Every angular predicate here reads the tier's actual BanditSkillProfile.
///
/// The envelope predicates are PURE (BanditFireControl statics); WantsToFire is evaluated exactly
/// once per tick at its normal call site because it mutates the burst schedule.
/// </summary>
public static class GunConversionFunnel {
    const double Dt = SimulationSession.FixedDeltaSeconds;
    const double CoarseTrackingRad = 12.0 * System.Math.PI / 180.0;
    const double MergeGateM = 900.0;
    const double OpeningConfirmationSeconds = 0.20;

    /// Measures the ENEMY side of a neutral offset merge against a frozen reference pilot — the
    /// production question: does a bandit of this tier ever earn and take a shot?
    public static GunConversionFunnelResult MeasureEnemy(
        PilotSkill enemyTier,
        PilotSkill referenceTier = PilotSkill.Veteran,
        int engagements = 6,
        double maximumSecondsPerEngagement = 45.0,
        AircraftParams? enemyAir = null) {
        BanditSkillProfile profile = BanditSkillProfile.For(enemyTier);
        double flown = 0.0, inRange = 0.0, coarse = 0.0, body = 0.0, lead = 0.0;
        double eligible = 0.0, blocked = 0.0, trigger = 0.0, maxContinuous = 0.0;
        int rounds = 0, hits = 0;
        var bodyErrorsDeg = new List<double>();
        var leadErrorsDeg = new List<double>();

        for (int engagement = 1; engagement <= engagements; engagement++) {
            ProductionCombatScenario scenario =
                ProductionCombatScenario.OffsetNeutralMerge(engagement);
            AircraftParams referenceAir = FlightModel.F22APublicDataSurrogate;
            AircraftParams enemyParams =
                enemyAir ?? FlightModel.Su27SPublicDataSurrogate;
            var reference = new ReactiveBandit(
                scenario.ReferenceStart, referenceAir, referenceTier);
            var enemy = new ReactiveBandit(scenario.EnemyStart, enemyParams, enemyTier);
            CombatConfig combat = CombatConfig.ModernVisualMerge;
            var referenceGun = new GunKill(
                combat.PlayerAmmo, combat.OpponentHitsToDefeat,
                combat.PlayerGunProfile.EffectiveHitRadiusM, combat.PlayerGunProfile);
            var enemyGun = new GunKill(
                combat.OpponentAmmo, combat.PlayerHitsToDefeat,
                combat.OpponentGunProfile.EffectiveHitRadiusM, combat.OpponentGunProfile);

            double minimumRangeM = Geometry.Range(reference.State, enemy.State);
            double previousRangeM = minimumRangeM;
            double openingSeconds = 0.0;
            bool firstPassOpened = !scenario.FirstPassSafe;
            double continuous = 0.0;
            int maximumTicks = checked(
                (int)System.Math.Ceiling(maximumSecondsPerEngagement / Dt));

            for (int tick = 0; tick < maximumTicks; tick++) {
                AircraftState referenceState = reference.State;
                AircraftState enemyState = enemy.State;
                double rangeM = Geometry.Range(referenceState, enemyState);
                minimumRangeM = System.Math.Min(minimumRangeM, rangeM);
                flown += Dt;

                if (!firstPassOpened && minimumRangeM <= MergeGateM) {
                    bool opening = rangeM > previousRangeM
                        && rangeM >= minimumRangeM + 20.0;
                    openingSeconds = opening ? openingSeconds + Dt : 0.0;
                    firstPassOpened = openingSeconds >= OpeningConfirmationSeconds;
                }
                previousRangeM = rangeM;

                ActorObservation enemyObservation =
                    ActorObservation.Capture(enemyState, tick);
                ActorObservation referenceObservation =
                    ActorObservation.Capture(referenceState, tick);

                bool enemyInRange = rangeM >= BanditFireControl.MinimumRangeM
                    && rangeM <= BanditFireControl.MaximumRangeM;
                bool eligibleThisTick = false;
                if (enemyInRange) {
                    inRange += Dt;
                    double bodyErrorRad = BanditFireControl.NoseErrorRad(
                        enemyState, referenceObservation);
                    double leadErrorRad = BanditFireControl.LeadNoseErrorRad(
                        enemyState, referenceObservation);
                    bodyErrorsDeg.Add(bodyErrorRad * 180.0 / System.Math.PI);
                    leadErrorsDeg.Add(leadErrorRad * 180.0 / System.Math.PI);
                    if (bodyErrorRad <= CoarseTrackingRad) coarse += Dt;
                    bool inBody = bodyErrorRad <= profile.FireConeRad;
                    bool inLead = leadErrorRad <= profile.LeadFireConeRad;
                    if (inBody) body += Dt;
                    if (inLead) lead += Dt;
                    eligibleThisTick = inBody || inLead;
                    if (eligibleThisTick) {
                        eligible += Dt;
                        if (!firstPassOpened) blocked += Dt;
                    }
                }
                continuous = eligibleThisTick ? continuous + Dt : 0.0;
                if (continuous > maxContinuous) maxContinuous = continuous;

                bool referenceTrigger = firstPassOpened
                    && referenceGun.TargetAlive
                    && reference.WantsToFire(enemyObservation);
                bool enemyTrigger = firstPassOpened
                    && enemyGun.TargetAlive
                    && enemy.WantsToFire(referenceObservation);
                if (enemyTrigger) trigger += Dt;

                referenceGun.Step(referenceTrigger, referenceState, enemyState, Dt);
                enemyGun.Step(enemyTrigger, enemyState, referenceState, Dt);

                if (referenceGun.Outcome == FightOutcome.Splash
                    || enemyGun.Outcome == FightOutcome.Splash) break;

                reference.Step(enemyObservation, Dt);
                enemy.Step(referenceObservation, Dt);
            }

            rounds += enemyGun.RoundsFired;
            hits += enemyGun.HitCount;
        }

        return new GunConversionFunnelResult(
            enemyTier, engagements, flown, inRange, coarse, body, lead, eligible,
            blocked, maxContinuous, trigger, rounds, hits,
            Percentile(bodyErrorsDeg, 0.50),
            Percentile(bodyErrorsDeg, 0.10),
            Percentile(leadErrorsDeg, 0.50),
            Percentile(leadErrorsDeg, 0.10));
    }

    static double Percentile(List<double> values, double fraction) {
        if (values.Count == 0) return double.NaN;
        var sorted = values.ToArray();
        System.Array.Sort(sorted);
        int index = System.Math.Clamp(
            (int)(fraction * (sorted.Length - 1)), 0, sorted.Length - 1);
        return sorted[index];
    }
}
