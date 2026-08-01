namespace GunsOnly.Sim.Korea;

public sealed record DamageInspectionDefinition {
    public DamageInspectionDefinition(
        double maximumRangeM,
        double maximumAbsoluteClosureMps,
        double maximumAbsoluteRelativeRollRad,
        int requiredDwellTicks) {
        Positive(maximumRangeM, nameof(maximumRangeM));
        Positive(maximumAbsoluteClosureMps, nameof(maximumAbsoluteClosureMps));
        Positive(maximumAbsoluteRelativeRollRad,
            nameof(maximumAbsoluteRelativeRollRad));
        if (requiredDwellTicks <= 0)
            throw new ArgumentOutOfRangeException(nameof(requiredDwellTicks));
        MaximumRangeM = maximumRangeM;
        MaximumAbsoluteClosureMps = maximumAbsoluteClosureMps;
        MaximumAbsoluteRelativeRollRad = maximumAbsoluteRelativeRollRad;
        RequiredDwellTicks = requiredDwellTicks;
    }

    public double MaximumRangeM { get; }
    public double MaximumAbsoluteClosureMps { get; }
    public double MaximumAbsoluteRelativeRollRad { get; }
    public int RequiredDwellTicks { get; }

    static void Positive(double value, string name) {
        if (!double.IsFinite(value) || value <= 0.0)
            throw new ArgumentOutOfRangeException(name);
    }
}

/// <summary>
/// Everything Carpenter is allowed to know: geometry, line of sight, and rendered component facts.
/// No controller phase, coefficient, health scalar, or future decision is present.
/// </summary>
public readonly record struct CarpenterInspectionObservation {
    public CarpenterInspectionObservation(
        string actorId,
        in Vec3D worldPosition,
        in Vec3D relativePosition,
        double closureMps,
        double relativeRollRad,
        bool lineOfSightClear,
        in VisibleAirframeDamage visibleDamage) {
        ArmstrongContractValidation.StableId(actorId, nameof(actorId));
        ArmstrongContractValidation.Finite(worldPosition, nameof(worldPosition));
        ArmstrongContractValidation.Finite(relativePosition, nameof(relativePosition));
        ArmstrongContractValidation.Finite(closureMps, nameof(closureMps));
        ArmstrongContractValidation.Finite(relativeRollRad, nameof(relativeRollRad));
        ActorId = actorId;
        WorldPosition = worldPosition;
        RelativePosition = relativePosition;
        ClosureMps = closureMps;
        RelativeRollRad = relativeRollRad;
        LineOfSightClear = lineOfSightClear;
        VisibleDamage = visibleDamage;
    }

    public string? ActorId { get; }
    public Vec3D WorldPosition { get; }
    public Vec3D RelativePosition { get; }
    public double ClosureMps { get; }
    public double RelativeRollRad { get; }
    public bool LineOfSightClear { get; }
    public VisibleAirframeDamage VisibleDamage { get; }
    public bool IsPresent => ActorId is not null;
    public double RangeM => RelativePosition.Length;
    public static CarpenterInspectionObservation None => default;
}

public readonly record struct DamageInspectionState(
    int ConsecutiveQualifiedTicks,
    bool Complete,
    VisibleAirframeDamage Report) {
    public static DamageInspectionState None => default;
}

public readonly record struct DamageInspectionSnapshot(
    bool CarpenterInInspectionStation,
    int ConsecutiveQualifiedTicks,
    bool Complete,
    VisibleAirframeDamage Report) {
    public static DamageInspectionSnapshot None => default;
}

public static class DamageInspectionFlight {
    public static bool Qualifies(
        in CarpenterInspectionObservation observation,
        DamageInspectionDefinition definition) {
        ArgumentNullException.ThrowIfNull(definition);
        if (!observation.IsPresent || !observation.VisibleDamage.IsPresent)
            return false;
        return observation.LineOfSightClear
            && observation.RangeM <= definition.MaximumRangeM
            && System.Math.Abs(observation.ClosureMps)
                <= definition.MaximumAbsoluteClosureMps
            && System.Math.Abs(observation.RelativeRollRad)
                <= definition.MaximumAbsoluteRelativeRollRad;
    }

    public static DamageInspectionState Advance(
        in DamageInspectionState current,
        in CarpenterInspectionObservation observation,
        DamageInspectionDefinition definition) {
        ArgumentNullException.ThrowIfNull(definition);
        if (current.Complete) return current;
        if (!Qualifies(observation, definition))
            return DamageInspectionState.None;
        int dwell = checked(current.ConsecutiveQualifiedTicks + 1);
        bool complete = dwell >= definition.RequiredDwellTicks;
        return new DamageInspectionState(
            dwell,
            complete,
            complete ? observation.VisibleDamage : VisibleAirframeDamage.None);
    }

    public static DamageInspectionSnapshot Project(
        in DamageInspectionState state,
        in CarpenterInspectionObservation latest,
        DamageInspectionDefinition definition) =>
        new(
            CarpenterInInspectionStation: Qualifies(latest, definition),
            ConsecutiveQualifiedTicks: state.ConsecutiveQualifiedTicks,
            Complete: state.Complete,
            Report: state.Report);
}
