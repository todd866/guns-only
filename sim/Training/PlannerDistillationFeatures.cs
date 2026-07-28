using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Training;

/// <summary>
/// Quality metadata produced beside the normalized planner feature vector. Clipping is explicit:
/// it is useful training evidence, but a deployed student must treat it as out-of-distribution
/// until that region has been calibrated deliberately.
/// </summary>
public readonly record struct PlannerFeatureQuality(
    ulong ClipBitsLow,
    ulong ClipBitsHigh,
    bool AllFinite) {

    public bool AnyClipped => ClipBitsLow != 0 || ClipBitsHigh != 0;
}

/// <summary>
/// The actor-visible, body-relative input contract used to distil the expensive nine-candidate
/// lookahead scorer. The final 36 values are the four actuated fields of each generated candidate;
/// candidate generation and every safety/state-machine gate remain exact C# authority.
/// </summary>
public static class PlannerDistillationFeatures {
    public const string Schema = "guns-only.planner-features.body-relative.v1";
    public const string NormalizationSchema = "guns-only.planner-normalization.v1";
    public const int StateFeatureCount = 52;
    public const int CandidateFeatureCount = 4;
    public const int CandidateCount = BanditDecisionTrace.CandidateCapacity;
    public const int FeatureCount =
        StateFeatureCount + CandidateCount * CandidateFeatureCount;

    const double Pi = System.Math.PI;
    const double VelocityScaleMps = 400.0;
    const double RelativePositionScaleM = 5200.0;
    const double MassScaleKg = 30_000.0;
    const double FlatClearanceScaleM = 12_000.0;
    const double CombatCeilingM = 11_500.0;
    const double ContactAgeScaleTicks = 120.0;
    const double EngagementScaleSeconds = 30.0;
    const double DefendScaleSeconds = 3.4;
    const double CooldownScaleSeconds = 3.8;
    const double LookaheadCadenceTicks = 12.0;
    const double MaximumThrottle = 1.65;
    const double MaximumProfileG = 15.0;
    const double MaximumLookaheadHorizonTicks = 180.0;

    static readonly IReadOnlyList<string> ReadOnlyNames = Array.AsReadOnly(new[] {
        "ownVelocityBodyX_div_400mps",
        "ownVelocityBodyY_div_400mps",
        "ownVelocityBodyZ_div_400mps",
        "contactRelativePositionBodyX_softsign_5200m",
        "contactRelativePositionBodyY_softsign_5200m",
        "contactRelativePositionBodyZ_softsign_5200m",
        "contactRelativeVelocityBodyX_softsign_400mps",
        "contactRelativeVelocityBodyY_softsign_400mps",
        "contactRelativeVelocityBodyZ_softsign_400mps",
        "contactForwardBodyX",
        "contactForwardBodyY",
        "contactForwardBodyZ",
        "worldUpBodyX",
        "worldUpBodyY",
        "worldUpBodyZ",
        "ownBodyRollRate_div_pi",
        "ownBodyPitchRate_div_pi",
        "ownBodyYawRate_div_pi",
        "ownSpeed_div_400mps",
        "contactSpeed_div_400mps",
        "ownMass_div_30000kg",
        "contactBankSin",
        "contactBankCos",
        "contactAge_div_120ticks",
        "contactConfidence",
        "flatClearance_div_12000m",
        "combatCeilingMargin_div_11500m",
        "engagementTime_div_30s",
        "defendRemaining_div_3_4s",
        "defendCooldownRemaining_div_3_8s",
        "lookaheadTicksUntilSelection_div_12ticks",
        "breakSign",
        "jinkIndex_div_4",
        "tacticAcquire",
        "tacticDefend",
        "tacticEnergy",
        "tacticReturn",
        "formationIndependent",
        "formationPressure",
        "formationBracket",
        "formationExtend",
        "formationLateralSign",
        "skillNovice",
        "skillCompetent",
        "skillVeteran",
        "skillAce",
        "skillMachine",
        "profileMaxAcquireG_div_15g",
        "profileLookaheadHorizon_div_180ticks",
        "profileForcesOvershoot",
        "profileDisengagesWhenLosing",
        "enginePowerFraction_div_1_65",
        "candidate0_gDemand_div_15g",
        "candidate0_bankTarget_div_pi",
        "candidate0_throttle_div_1_65",
        "candidate0_rudder",
        "candidate1_gDemand_div_15g",
        "candidate1_bankTarget_div_pi",
        "candidate1_throttle_div_1_65",
        "candidate1_rudder",
        "candidate2_gDemand_div_15g",
        "candidate2_bankTarget_div_pi",
        "candidate2_throttle_div_1_65",
        "candidate2_rudder",
        "candidate3_gDemand_div_15g",
        "candidate3_bankTarget_div_pi",
        "candidate3_throttle_div_1_65",
        "candidate3_rudder",
        "candidate4_gDemand_div_15g",
        "candidate4_bankTarget_div_pi",
        "candidate4_throttle_div_1_65",
        "candidate4_rudder",
        "candidate5_gDemand_div_15g",
        "candidate5_bankTarget_div_pi",
        "candidate5_throttle_div_1_65",
        "candidate5_rudder",
        "candidate6_gDemand_div_15g",
        "candidate6_bankTarget_div_pi",
        "candidate6_throttle_div_1_65",
        "candidate6_rudder",
        "candidate7_gDemand_div_15g",
        "candidate7_bankTarget_div_pi",
        "candidate7_throttle_div_1_65",
        "candidate7_rudder",
        "candidate8_gDemand_div_15g",
        "candidate8_bankTarget_div_pi",
        "candidate8_throttle_div_1_65",
        "candidate8_rudder"
    });

    public static IReadOnlyList<string> Names => ReadOnlyNames;

    public static double[] Project(in PlannerTeacherSample sample,
        out PlannerFeatureQuality quality) {
        var values = new double[FeatureCount];
        Write(
            sample.PlanningObservation,
            sample.PolicyMemoryBefore,
            sample.BehaviorSkill,
            sample.DecisionTrace,
            sample.EnginePowerFraction,
            values,
            out quality);
        return values;
    }

    /// <summary>
    /// Writes a fixed-length vector without allocating. This overload is the train/serve contract:
    /// runtime shadow inference must call the same projection rather than reimplementing features.
    /// </summary>
    public static void Write(
        in CombatPolicyObservation observation,
        in BanditPolicyMemory memory,
        PilotSkill skill,
        in BanditDecisionTrace trace,
        double enginePowerFraction,
        Span<double> destination,
        out PlannerFeatureQuality quality) {
        if (destination.Length < FeatureCount)
            throw new ArgumentException(
                $"Planner feature destination needs {FeatureCount} values.",
                nameof(destination));
        if (!observation.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(observation));
        if (!System.Enum.IsDefined(skill))
            throw new ArgumentOutOfRangeException(nameof(skill));
        if (trace.CandidateCount is < 1 or > CandidateCount)
            throw new ArgumentOutOfRangeException(nameof(trace));
        if (!double.IsFinite(enginePowerFraction)
            || enginePowerFraction is < 0.0 or > MaximumThrottle)
            throw new ArgumentOutOfRangeException(nameof(enginePowerFraction));

        destination[..FeatureCount].Clear();
        ulong clipLow = 0;
        ulong clipHigh = 0;
        bool allFinite = true;

        AircraftState own = observation.Ownship;
        ActorObservation contact = observation.Contact;
        QuaternionD worldToBody = own.BodyAttitude.Conjugate();
        Vec3D ownVelocityBody = worldToBody.Rotate(own.VelocityVector());
        Vec3D relativePositionBody =
            worldToBody.Rotate(contact.Position - own.Position);
        Vec3D relativeVelocityBody =
            worldToBody.Rotate(contact.VelocityVector() - own.VelocityVector());
        Vec3D contactForwardBody = worldToBody.Rotate(contact.ForwardDir());
        Vec3D worldUpBody = worldToBody.Rotate(new Vec3D(0.0, 1.0, 0.0));

        int index = 0;
        PutSigned(destination, ref index, ownVelocityBody.X / VelocityScaleMps,
            ref clipLow, ref clipHigh, ref allFinite);
        PutSigned(destination, ref index, ownVelocityBody.Y / VelocityScaleMps,
            ref clipLow, ref clipHigh, ref allFinite);
        PutSigned(destination, ref index, ownVelocityBody.Z / VelocityScaleMps,
            ref clipLow, ref clipHigh, ref allFinite);
        PutSigned(destination, ref index,
            SignedSoftScale(relativePositionBody.X, RelativePositionScaleM),
            ref clipLow, ref clipHigh, ref allFinite);
        PutSigned(destination, ref index,
            SignedSoftScale(relativePositionBody.Y, RelativePositionScaleM),
            ref clipLow, ref clipHigh, ref allFinite);
        PutSigned(destination, ref index,
            SignedSoftScale(relativePositionBody.Z, RelativePositionScaleM),
            ref clipLow, ref clipHigh, ref allFinite);
        PutSigned(destination, ref index,
            SignedSoftScale(relativeVelocityBody.X, VelocityScaleMps),
            ref clipLow, ref clipHigh, ref allFinite);
        PutSigned(destination, ref index,
            SignedSoftScale(relativeVelocityBody.Y, VelocityScaleMps),
            ref clipLow, ref clipHigh, ref allFinite);
        PutSigned(destination, ref index,
            SignedSoftScale(relativeVelocityBody.Z, VelocityScaleMps),
            ref clipLow, ref clipHigh, ref allFinite);
        PutSigned(destination, ref index, contactForwardBody.X,
            ref clipLow, ref clipHigh, ref allFinite);
        PutSigned(destination, ref index, contactForwardBody.Y,
            ref clipLow, ref clipHigh, ref allFinite);
        PutSigned(destination, ref index, contactForwardBody.Z,
            ref clipLow, ref clipHigh, ref allFinite);
        PutSigned(destination, ref index, worldUpBody.X,
            ref clipLow, ref clipHigh, ref allFinite);
        PutSigned(destination, ref index, worldUpBody.Y,
            ref clipLow, ref clipHigh, ref allFinite);
        PutSigned(destination, ref index, worldUpBody.Z,
            ref clipLow, ref clipHigh, ref allFinite);
        PutSigned(destination, ref index, own.BodyRates.P / Pi,
            ref clipLow, ref clipHigh, ref allFinite);
        PutSigned(destination, ref index, own.BodyRates.Q / Pi,
            ref clipLow, ref clipHigh, ref allFinite);
        PutSigned(destination, ref index, own.BodyRates.R / Pi,
            ref clipLow, ref clipHigh, ref allFinite);
        PutUnit(destination, ref index, own.Speed / VelocityScaleMps,
            ref clipLow, ref clipHigh, ref allFinite);
        PutUnit(destination, ref index, contact.Speed / VelocityScaleMps,
            ref clipLow, ref clipHigh, ref allFinite);
        PutUnit(destination, ref index, own.Mass / MassScaleKg,
            ref clipLow, ref clipHigh, ref allFinite);
        PutSigned(destination, ref index, System.Math.Sin(contact.Bank),
            ref clipLow, ref clipHigh, ref allFinite);
        PutSigned(destination, ref index, System.Math.Cos(contact.Bank),
            ref clipLow, ref clipHigh, ref allFinite);
        PutUnit(destination, ref index,
            contact.ObservationAgeTicks / ContactAgeScaleTicks,
            ref clipLow, ref clipHigh, ref allFinite);
        PutUnit(destination, ref index, contact.Confidence,
            ref clipLow, ref clipHigh, ref allFinite);
        PutUnit(destination, ref index,
            own.Position.Y / FlatClearanceScaleM,
            ref clipLow, ref clipHigh, ref allFinite);
        PutUnit(destination, ref index,
            (CombatCeilingM - own.Position.Y) / CombatCeilingM,
            ref clipLow, ref clipHigh, ref allFinite);
        PutUnit(destination, ref index,
            memory.EngagementSeconds / EngagementScaleSeconds,
            ref clipLow, ref clipHigh, ref allFinite);
        PutUnit(destination, ref index,
            memory.DefendSecondsRemaining / DefendScaleSeconds,
            ref clipLow, ref clipHigh, ref allFinite);
        PutUnit(destination, ref index,
            memory.DefendCooldownSecondsRemaining / CooldownScaleSeconds,
            ref clipLow, ref clipHigh, ref allFinite);
        PutUnit(destination, ref index,
            memory.LookaheadTicksUntilSelection / LookaheadCadenceTicks,
            ref clipLow, ref clipHigh, ref allFinite);
        PutSigned(destination, ref index, memory.BreakSign,
            ref clipLow, ref clipHigh, ref allFinite);
        PutUnit(destination, ref index, memory.JinkIndex / 4.0,
            ref clipLow, ref clipHigh, ref allFinite);

        PutOneHot(destination, ref index, (int)memory.Tactic, 4);
        PutOneHot(destination, ref index, (int)memory.FormationRole, 4);
        PutSigned(destination, ref index, memory.FormationLateralSign,
            ref clipLow, ref clipHigh, ref allFinite);
        PutOneHot(destination, ref index, (int)skill, 5);

        BanditSkillProfile profile = BanditSkillProfile.For(skill);
        PutUnit(destination, ref index,
            profile.MaxAcquireG / MaximumProfileG,
            ref clipLow, ref clipHigh, ref allFinite);
        PutUnit(destination, ref index,
            profile.LookaheadHorizonTicks / MaximumLookaheadHorizonTicks,
            ref clipLow, ref clipHigh, ref allFinite);
        destination[index++] = profile.ForcesOvershoot ? 1.0 : 0.0;
        destination[index++] = profile.DisengagesWhenLosing ? 1.0 : 0.0;
        PutUnit(destination, ref index,
            enginePowerFraction / MaximumThrottle,
            ref clipLow, ref clipHigh, ref allFinite);

        for (int candidateIndex = 0;
            candidateIndex < CandidateCount;
            candidateIndex++) {
            BanditDecisionCandidate candidate = trace.CandidateAt(candidateIndex);
            PilotCommand command = candidate.Command;
            PutSigned(destination, ref index,
                command.GDemand / MaximumProfileG,
                ref clipLow, ref clipHigh, ref allFinite);
            PutSigned(destination, ref index, command.BankTarget / Pi,
                ref clipLow, ref clipHigh, ref allFinite);
            PutUnit(destination, ref index, command.Throttle / MaximumThrottle,
                ref clipLow, ref clipHigh, ref allFinite);
            PutSigned(destination, ref index, command.Rudder,
                ref clipLow, ref clipHigh, ref allFinite);
        }

        if (index != FeatureCount || ReadOnlyNames.Count != FeatureCount)
            throw new InvalidOperationException(
                "Planner feature names and projection order diverged.");
        quality = new PlannerFeatureQuality(clipLow, clipHigh, allFinite);
    }

    static void PutOneHot(Span<double> destination, ref int index,
        int selected, int count) {
        if (selected < 0 || selected >= count)
            throw new ArgumentOutOfRangeException(nameof(selected));
        for (int value = 0; value < count; value++)
            destination[index++] = selected == value ? 1.0 : 0.0;
    }

    static double SignedSoftScale(double value, double scale) =>
        value / (scale + System.Math.Abs(value));

    static void PutSigned(Span<double> destination, ref int index, double value,
        ref ulong clipLow, ref ulong clipHigh, ref bool allFinite) =>
        Put(destination, ref index, value, -1.0, 1.0,
            ref clipLow, ref clipHigh, ref allFinite);

    static void PutUnit(Span<double> destination, ref int index, double value,
        ref ulong clipLow, ref ulong clipHigh, ref bool allFinite) =>
        Put(destination, ref index, value, 0.0, 1.0,
            ref clipLow, ref clipHigh, ref allFinite);

    static void Put(Span<double> destination, ref int index, double value,
        double minimum, double maximum,
        ref ulong clipLow, ref ulong clipHigh, ref bool allFinite) {
        int featureIndex = index++;
        if (!double.IsFinite(value)) {
            allFinite = false;
            MarkClip(featureIndex, ref clipLow, ref clipHigh);
            destination[featureIndex] = 0.0;
            return;
        }
        if (value < minimum || value > maximum)
            MarkClip(featureIndex, ref clipLow, ref clipHigh);
        destination[featureIndex] = System.Math.Clamp(value, minimum, maximum);
    }

    static void MarkClip(int featureIndex,
        ref ulong clipLow, ref ulong clipHigh) {
        if (featureIndex < 64)
            clipLow |= 1UL << featureIndex;
        else
            clipHigh |= 1UL << (featureIndex - 64);
    }
}
