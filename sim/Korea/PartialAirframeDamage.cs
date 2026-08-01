namespace GunsOnly.Sim.Korea;

public enum AirframeDamageEpistemic {
    Measured,
    Surrogate,
    Reconstruction,
    Fiction
}

public enum TipTankFuelTreatment {
    RetainedUntilFuelSystemIntegration,
    RemovedWithDetachedStructure,
    NoFuelPresent
}

public enum PantherRightOuterWingLossExtent {
    SixFeet,
    SevenFeet,
    EightFeet
}

/// <summary>
/// Immutable persistent, nonterminal damage contribution. It has no engine or control-mode
/// authority; integration composes it with the live systems/automatic-surface configuration.
/// </summary>
public sealed record PartialAirframeDamageProfile {
    public PartialAirframeDamageProfile(
        string id,
        string visualDetachProfileId,
        AirframeDamageEpistemic epistemic,
        double removedSpanM,
        double removedAreaM2,
        double modeledRemovedMassKg,
        TipTankFuelTreatment tipTankFuelTreatment,
        double liftCoefficientIncrement,
        double dragCoefficientIncrement,
        double pitchMomentCoefficientIncrement,
        double lateralLiftCoefficientDifference,
        double persistentLateralLiftCoefficientDifference,
        double liftLimitCoefficientIncrement,
        double rollControlAuthorityFraction,
        double pitchControlAuthorityFraction,
        double yawControlAuthorityFraction,
        in VisibleAirframeDamage visibleDamage) {
        ArmstrongContractValidation.StableId(id, nameof(id));
        ArmstrongContractValidation.StableId(
            visualDetachProfileId, nameof(visualDetachProfileId));
        if (!Enum.IsDefined(epistemic))
            throw new ArgumentOutOfRangeException(nameof(epistemic));
        if (!Enum.IsDefined(tipTankFuelTreatment))
            throw new ArgumentOutOfRangeException(nameof(tipTankFuelTreatment));
        Positive(removedSpanM, nameof(removedSpanM));
        Positive(removedAreaM2, nameof(removedAreaM2));
        NonNegative(modeledRemovedMassKg, nameof(modeledRemovedMassKg));
        Finite(liftCoefficientIncrement, nameof(liftCoefficientIncrement));
        NonNegative(dragCoefficientIncrement, nameof(dragCoefficientIncrement));
        Finite(pitchMomentCoefficientIncrement, nameof(pitchMomentCoefficientIncrement));
        Finite(lateralLiftCoefficientDifference,
            nameof(lateralLiftCoefficientDifference));
        Finite(persistentLateralLiftCoefficientDifference,
            nameof(persistentLateralLiftCoefficientDifference));
        Finite(liftLimitCoefficientIncrement, nameof(liftLimitCoefficientIncrement));
        Authority(rollControlAuthorityFraction,
            nameof(rollControlAuthorityFraction));
        Authority(pitchControlAuthorityFraction,
            nameof(pitchControlAuthorityFraction));
        Authority(yawControlAuthorityFraction,
            nameof(yawControlAuthorityFraction));
        if (!visibleDamage.IsPresent
            || !StringComparer.Ordinal.Equals(id, visibleDamage.ProfileId))
            throw new ArgumentException(
                "Visual detach and aerodynamic damage must share one profile ID.",
                nameof(visibleDamage));

        Id = id;
        VisualDetachProfileId = visualDetachProfileId;
        Epistemic = epistemic;
        RemovedSpanM = removedSpanM;
        RemovedAreaM2 = removedAreaM2;
        ModeledRemovedMassKg = modeledRemovedMassKg;
        TipTankFuelTreatment = tipTankFuelTreatment;
        LiftCoefficientIncrement = liftCoefficientIncrement;
        DragCoefficientIncrement = dragCoefficientIncrement;
        PitchMomentCoefficientIncrement = pitchMomentCoefficientIncrement;
        LateralLiftCoefficientDifference = lateralLiftCoefficientDifference;
        PersistentLateralLiftCoefficientDifference =
            persistentLateralLiftCoefficientDifference;
        LiftLimitCoefficientIncrement = liftLimitCoefficientIncrement;
        RollControlAuthorityFraction = rollControlAuthorityFraction;
        PitchControlAuthorityFraction = pitchControlAuthorityFraction;
        YawControlAuthorityFraction = yawControlAuthorityFraction;
        VisibleDamage = visibleDamage;
    }

    public string Id { get; }
    public string VisualDetachProfileId { get; }
    public AirframeDamageEpistemic Epistemic { get; }
    public double RemovedSpanM { get; }
    public double RemovedAreaM2 { get; }
    public double ModeledRemovedMassKg { get; }
    public TipTankFuelTreatment TipTankFuelTreatment { get; }
    public double LiftCoefficientIncrement { get; }
    public double DragCoefficientIncrement { get; }
    public double PitchMomentCoefficientIncrement { get; }
    public double LateralLiftCoefficientDifference { get; }
    public double PersistentLateralLiftCoefficientDifference { get; }
    public double LiftLimitCoefficientIncrement { get; }
    public double RollControlAuthorityFraction { get; }
    public double PitchControlAuthorityFraction { get; }
    public double YawControlAuthorityFraction { get; }
    public VisibleAirframeDamage VisibleDamage { get; }

    static void Finite(double value, string name) {
        if (!double.IsFinite(value)) throw new ArgumentOutOfRangeException(name);
    }
    static void Positive(double value, string name) {
        if (!double.IsFinite(value) || value <= 0.0)
            throw new ArgumentOutOfRangeException(name);
    }
    static void NonNegative(double value, string name) {
        if (!double.IsFinite(value) || value < 0.0)
            throw new ArgumentOutOfRangeException(name);
    }
    static void Authority(double value, string name) {
        if (!double.IsFinite(value) || value is < 0.0 or > 1.0)
            throw new ArgumentOutOfRangeException(name);
    }
}

public sealed record PartialAirframeDamageState {
    PartialAirframeDamageState(PartialAirframeDamageProfile? profile) {
        Profile = profile;
    }

    public PartialAirframeDamageProfile? Profile { get; }
    public bool IsApplied => Profile is not null;
    public bool IsTerminal => false;
    public string? ProfileId => Profile?.Id;
    public VisibleAirframeDamage VisibleDamage =>
        Profile?.VisibleDamage ?? VisibleAirframeDamage.None;

    public static PartialAirframeDamageState Intact { get; } =
        new((PartialAirframeDamageProfile?)null);
    public static PartialAirframeDamageState Apply(
        PartialAirframeDamageProfile profile) =>
        new(profile ?? throw new ArgumentNullException(nameof(profile)));
}

public static class PartialAirframeDamageComposer {
    /// <summary>
    /// Add coefficient increments, multiply/clamp remaining authority, and preserve metadata whose
    /// owner is the systems configuration. This pure function cannot stop an engine or disable the
    /// pilot.
    /// </summary>
    public static AirframeAerodynamicState Compose(
        in AirframeAerodynamicState systemsAndAutomaticSurfaces,
        PartialAirframeDamageState damage) {
        ArgumentNullException.ThrowIfNull(damage);
        PartialAirframeDamageProfile? profile = damage.Profile;
        if (profile is null) return systemsAndAutomaticSurfaces;
        return systemsAndAutomaticSurfaces with {
            LiftCoefficientIncrement =
                systemsAndAutomaticSurfaces.LiftCoefficientIncrement
                + profile.LiftCoefficientIncrement,
            DragCoefficientIncrement =
                systemsAndAutomaticSurfaces.DragCoefficientIncrement
                + profile.DragCoefficientIncrement,
            PitchMomentCoefficientIncrement =
                systemsAndAutomaticSurfaces.PitchMomentCoefficientIncrement
                + profile.PitchMomentCoefficientIncrement,
            LateralLiftCoefficientDifference =
                systemsAndAutomaticSurfaces.LateralLiftCoefficientDifference
                + profile.LateralLiftCoefficientDifference,
            PersistentLateralLiftCoefficientDifference =
                systemsAndAutomaticSurfaces.PersistentLateralLiftCoefficientDifference
                + profile.PersistentLateralLiftCoefficientDifference,
            // LandingGearFraction deliberately remains owned by the systems configuration.
            LiftLimitCoefficientIncrement =
                systemsAndAutomaticSurfaces.LiftLimitCoefficientIncrement
                + profile.LiftLimitCoefficientIncrement,
            RollControlAuthorityFraction = AuthorityProduct(
                systemsAndAutomaticSurfaces.RollControlAuthorityFraction,
                profile.RollControlAuthorityFraction),
            PitchControlAuthorityFraction = AuthorityProduct(
                systemsAndAutomaticSurfaces.PitchControlAuthorityFraction,
                profile.PitchControlAuthorityFraction),
            YawControlAuthorityFraction = AuthorityProduct(
                systemsAndAutomaticSurfaces.YawControlAuthorityFraction,
                profile.YawControlAuthorityFraction)
        };
    }

    static double AuthorityProduct(double first, double second) =>
        System.Math.Clamp(first * second, 0.0, 1.0);
}

/// <summary>
/// A bounded six/eight-foot reconstruction family around Armstrong's retrospective estimate. The
/// coefficients are provisional sensitivity points, not source claims; tip-tank fuel/mass remains
/// with its current owner until fuel-system integration can remove it consistently. Seven feet is
/// only the explicit midpoint hypothesis of that six-to-eight-foot range, never an exact fracture
/// claim.
/// </summary>
public static class PantherRightOuterWingLossFamily {
    public const PantherRightOuterWingLossExtent ReportedRangeMidpoint =
        PantherRightOuterWingLossExtent.SevenFeet;

    public static PartialAirframeDamageProfile ReportedRangeMidpointReconstruction() =>
        ForExtent(ReportedRangeMidpoint);

    public static PartialAirframeDamageProfile ForExtent(
        PantherRightOuterWingLossExtent extent) {
        if (!Enum.IsDefined(extent))
            throw new ArgumentOutOfRangeException(nameof(extent));
        double feet = extent switch {
            PantherRightOuterWingLossExtent.SixFeet => 6.0,
            PantherRightOuterWingLossExtent.SevenFeet => 7.0,
            PantherRightOuterWingLossExtent.EightFeet => 8.0,
            _ => throw new ArgumentOutOfRangeException(nameof(extent))
        };
        string variant = extent switch {
            PantherRightOuterWingLossExtent.SixFeet => "six-foot",
            PantherRightOuterWingLossExtent.SevenFeet => "seven-foot-midpoint",
            PantherRightOuterWingLossExtent.EightFeet => "eight-foot",
            _ => throw new ArgumentOutOfRangeException(nameof(extent))
        };
        double severity = feet / 7.0;
        string id = $"damage.f9f-2-panther.right-outer-wing-loss."
            + $"{variant}.reconstruction.v1";
        var visible = new VisibleAirframeDamage(
            id,
            rightOuterWingAbsent: true,
            rightTipTankAbsent: true,
            rightAileron: PantherAileronVisibleState.Partial,
            visibleFuelLeak: true,
            visibleSmoke: false,
            looseStructureVisible: true);
        return new PartialAirframeDamageProfile(
            id,
            visualDetachProfileId:
                $"visual.f9f-2-panther.right-outer-wing-loss."
                    + $"{variant}.greybox.v1",
            AirframeDamageEpistemic.Reconstruction,
            removedSpanM: feet * 0.3048,
            removedAreaM2: 5.3 * severity,
            // Fuel and tank mass must not disappear twice. Keep them in AircraftState.Mass until a
            // mission fuel owner is wired and can apply the same profile atomically.
            modeledRemovedMassKg: 0.0,
            TipTankFuelTreatment.RetainedUntilFuelSystemIntegration,
            liftCoefficientIncrement: -0.035 * severity,
            dragCoefficientIncrement: 0.040 * severity,
            pitchMomentCoefficientIncrement: 0.006 * severity,
            lateralLiftCoefficientDifference: 0.0,
            persistentLateralLiftCoefficientDifference: 0.105 * severity,
            liftLimitCoefficientIncrement: -0.18 * severity,
            rollControlAuthorityFraction: System.Math.Clamp(0.48 / severity, 0.32, 0.58),
            pitchControlAuthorityFraction: 0.96,
            yawControlAuthorityFraction: System.Math.Clamp(0.84 / severity, 0.72, 0.90),
            visible);
    }
}
