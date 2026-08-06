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
    double TenthPercentileInRangeLeadErrorDeg = double.NaN,
    // --- the trigger-time rungs: what the gun was actually pointed at when it fired ---
    double MedianLeadErrorAtTriggerDeg = double.NaN,
    double TenthPercentileLeadErrorAtTriggerDeg = double.NaN,
    double MedianRangeAtTriggerM = double.NaN,
    double MedianBallisticSubtenseAtTriggerDeg = double.NaN,
    double SolutionTriggerSeconds = 0.0,
    /// Engagements in which the bandit put at least one round into the reference aircraft.
    int EngagementsWithHits = 0,
    /// Engagements the bandit actually WON — 3 hits defeats a ship (CombatConfig.ModernVisualMerge).
    /// This is the doctrinal target: "ACE must be able to kill the player".
    int Kills = 0) {

    public double TriggerConversion =>
        EligibleSeconds > 0.0 ? TriggerSeconds / EligibleSeconds : 0.0;
    public double HitsPerRound => RoundsFired > 0 ? (double)Hits / RoundsFired : 0.0;
    /// Fraction of trigger-down time where the ballistic lead error was inside the angle the
    /// effective hit radius subtends at that range — "rounds that SHOULD have hit". This is the
    /// rung between "trigger down in range" and "hits": if it is near zero the failure is the aim
    /// point, not dispersion, ballistics, or the ROE.
    public double SolutionConversion =>
        TriggerSeconds > 0.0 ? SolutionTriggerSeconds / TriggerSeconds : 0.0;

    public string TriggerLine =>
        $"{Tier,-9} TRIGGER leadErr p10/med={TenthPercentileLeadErrorAtTriggerDeg,6:F2}/"
        + $"{MedianLeadErrorAtTriggerDeg,7:F2}deg  range med={MedianRangeAtTriggerM,6:F0}m  "
        + $"needed<={MedianBallisticSubtenseAtTriggerDeg,5:F2}deg  "
        + $"onSolution={SolutionTriggerSeconds,5:F2}s/{TriggerSeconds,5:F2}s "
        + $"({SolutionConversion,5:P1})  rounds={RoundsFired,4} hits={Hits,3} "
        + $"engagementsWithHits={EngagementsWithHits}/{Engagements} kills={Kills}";

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
        AircraftParams? enemyAir = null,
        BanditSkillProfile? enemyProfile = null) {
        BanditSkillProfile profile = enemyProfile ?? BanditSkillProfile.For(enemyTier);
        double flown = 0.0, inRange = 0.0, coarse = 0.0, body = 0.0, lead = 0.0;
        double eligible = 0.0, blocked = 0.0, trigger = 0.0, maxContinuous = 0.0;
        int rounds = 0, hits = 0, engagementsWithHits = 0, kills = 0;
        var bodyErrorsDeg = new List<double>();
        var leadErrorsDeg = new List<double>();
        var triggerLeadErrorsDeg = new List<double>();
        var triggerRangesM = new List<double>();
        var triggerSubtenseDeg = new List<double>();
        double onSolutionTrigger = 0.0;
        // Range-bucketed in-range lead error: is the aim-point failure uniform, or does the
        // solution actually tighten when the bandit presses in? The gun's required precision is
        // atan(8 m / range) — 0.57 deg at 800 m but 1.53 deg at 300 m — so the answer decides
        // whether the fix is a better tracker or better range discipline.
        var bucketSeconds = new double[RangeBuckets.Length];
        var bucketLeadDeg = new List<double>[RangeBuckets.Length];
        for (int b = 0; b < RangeBuckets.Length; b++) bucketLeadDeg[b] = new List<double>();

        for (int engagement = 1; engagement <= engagements; engagement++) {
            ProductionCombatScenario scenario =
                ProductionCombatScenario.OffsetNeutralMerge(engagement);
            AircraftParams referenceAir = FlightModel.F22APublicDataSurrogate;
            AircraftParams enemyParams =
                enemyAir ?? FlightModel.Su27SPublicDataSurrogate;
            var reference = new ReactiveBandit(
                scenario.ReferenceStart, referenceAir, referenceTier);
            var enemy = new ReactiveBandit(
                scenario.EnemyStart, enemyParams, enemyTier, profile: profile);
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
                    for (int b = 0; b < RangeBuckets.Length; b++) {
                        if (rangeM > RangeBuckets[b]) continue;
                        bucketSeconds[b] += Dt;
                        bucketLeadDeg[b].Add(leadErrorRad * 180.0 / System.Math.PI);
                        break;
                    }
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
                if (enemyTrigger) {
                    trigger += Dt;
                    // What was the gun ACTUALLY pointed at, relative to what the shot needed?
                    // The requirement is geometric and range-dependent: the effective hit radius
                    // subtends atan(r/range), so a 8 m radius at 800 m needs 0.57 deg.
                    double triggerLeadDeg = BanditFireControl.LeadNoseErrorRad(
                        enemyState, referenceObservation) * 180.0 / System.Math.PI;
                    double subtenseDeg = System.Math.Atan2(
                        combat.OpponentGunProfile.EffectiveHitRadiusM,
                        System.Math.Max(1.0, rangeM)) * 180.0 / System.Math.PI;
                    triggerLeadErrorsDeg.Add(triggerLeadDeg);
                    triggerRangesM.Add(rangeM);
                    triggerSubtenseDeg.Add(subtenseDeg);
                    if (triggerLeadDeg <= subtenseDeg) onSolutionTrigger += Dt;
                }

                referenceGun.Step(referenceTrigger, referenceState, enemyState, Dt);
                enemyGun.Step(enemyTrigger, enemyState, referenceState, Dt);

                if (referenceGun.Outcome == FightOutcome.Splash
                    || enemyGun.Outcome == FightOutcome.Splash) break;

                reference.Step(enemyObservation, Dt);
                enemy.Step(referenceObservation, Dt);
            }

            rounds += enemyGun.RoundsFired;
            hits += enemyGun.HitCount;
            if (enemyGun.HitCount > 0) engagementsWithHits++;
            if (enemyGun.Outcome == FightOutcome.Splash) kills++;
        }

        LastRangeProfile[enemyTier] = new RangeProfileData(
            bucketSeconds,
            bucketLeadDeg.Select(v => Percentile(v, 0.10)).ToArray(),
            bucketLeadDeg.Select(v => Percentile(v, 0.50)).ToArray());

        return new GunConversionFunnelResult(
            enemyTier, engagements, flown, inRange, coarse, body, lead, eligible,
            blocked, maxContinuous, trigger, rounds, hits,
            Percentile(bodyErrorsDeg, 0.50),
            Percentile(bodyErrorsDeg, 0.10),
            Percentile(leadErrorsDeg, 0.50),
            Percentile(leadErrorsDeg, 0.10),
            Percentile(triggerLeadErrorsDeg, 0.50),
            Percentile(triggerLeadErrorsDeg, 0.10),
            Percentile(triggerRangesM, 0.50),
            Percentile(triggerSubtenseDeg, 0.50),
            onSolutionTrigger,
            engagementsWithHits,
            kills);
    }

    /// Upper edges, metres, of the range buckets the lead error is profiled over.
    public static readonly double[] RangeBuckets = { 250.0, 400.0, 600.0, 900.0 };

    /// Human-readable range profile for one tier: seconds spent and lead-error percentiles in
    /// each bucket, against the precision that bucket's geometry actually demands.
    public static string RangeProfile(PilotSkill tier, int engagements = 6) {
        var lines = new List<string>();
        if (!LastRangeProfile.TryGetValue(tier, out RangeProfileData profile))
            return $"{tier}: no range profile captured";
        for (int b = 0; b < RangeBuckets.Length; b++) {
            double lower = b == 0 ? BanditFireControl.MinimumRangeM : RangeBuckets[b - 1];
            double neededDeg = System.Math.Atan2(8.0, RangeBuckets[b]) * 180.0 / System.Math.PI;
            lines.Add($"    {lower,4:F0}-{RangeBuckets[b],4:F0}m  "
                + $"{profile.Seconds[b],5:F1}s  leadErr p10/med="
                + $"{profile.P10[b],6:F2}/{profile.P50[b],7:F2}deg  "
                + $"needed<={neededDeg,5:F2}deg");
        }
        return $"{tier} range profile:\n" + string.Join("\n", lines);
    }

    public readonly record struct RangeProfileData(
        double[] Seconds, double[] P10, double[] P50);

    /// Captured by the most recent MeasureEnemy call per tier. Diagnostic only.
    public static readonly Dictionary<PilotSkill, RangeProfileData> LastRangeProfile = new();

    static double Percentile(List<double> values, double fraction) {
        if (values.Count == 0) return double.NaN;
        var sorted = values.ToArray();
        System.Array.Sort(sorted);
        int index = System.Math.Clamp(
            (int)(fraction * (sorted.Length - 1)), 0, sorted.Length - 1);
        return sorted[index];
    }
}
