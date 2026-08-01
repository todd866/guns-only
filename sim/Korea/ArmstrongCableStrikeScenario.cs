namespace GunsOnly.Sim.Korea;

public sealed record ArmstrongAttackRunCheckpointDefinition {
    public ArmstrongAttackRunCheckpointDefinition(
        string id,
        long simulationTick,
        ulong missionSeed,
        string weatherStateId) {
        ArmstrongContractValidation.StableId(id, nameof(id));
        if (simulationTick < 0)
            throw new ArgumentOutOfRangeException(nameof(simulationTick));
        ArmstrongContractValidation.StableId(weatherStateId, nameof(weatherStateId));
        Id = id;
        SimulationTick = simulationTick;
        MissionSeed = missionSeed;
        WeatherStateId = weatherStateId;
    }

    public string Id { get; }
    public long SimulationTick { get; }
    public ulong MissionSeed { get; }
    public string WeatherStateId { get; }
}

/// <summary>
/// Immutable authority inputs for the cable-to-decision slice. Values that still lack primary
/// technical evidence are explicitly named as reconstruction thresholds rather than aircraft
/// truth.
/// </summary>
public sealed class ArmstrongCableStrikeScenarioDefinition {
    public ArmstrongCableStrikeScenarioDefinition(
        string id,
        ArmstrongAttackRunCheckpointDefinition attackRunCheckpoint,
        CableHazardField cableField,
        AirframeComponentCollisionVolume rightOuterWingCollisionVolume,
        PartialAirframeDamageProfile rightWingDamageProfile,
        DamageInspectionDefinition inspection,
        int stabilizationDwellTicks,
        double maximumStabilizedAbsoluteRollRateRadS,
        double minimumStabilizationTerrainClearanceM,
        int sustainedLateralDemandTicks,
        double lateralDemandThreshold,
        double maximumLandingEnvelopeRollAuthorityFraction,
        double maximumLimitedRollAuthorityFraction) {
        ArmstrongContractValidation.StableId(id, nameof(id));
        AttackRunCheckpoint = attackRunCheckpoint
            ?? throw new ArgumentNullException(nameof(attackRunCheckpoint));
        CableField = cableField ?? throw new ArgumentNullException(nameof(cableField));
        RightOuterWingCollisionVolume = rightOuterWingCollisionVolume
            ?? throw new ArgumentNullException(nameof(rightOuterWingCollisionVolume));
        RightWingDamageProfile = rightWingDamageProfile
            ?? throw new ArgumentNullException(nameof(rightWingDamageProfile));
        if (!StringComparer.Ordinal.Equals(
                RightOuterWingCollisionVolume.ComponentId,
                ArmstrongCableStrikeScenarios.RightOuterWingComponentId)
            || !StringComparer.Ordinal.Equals(
                RightOuterWingCollisionVolume.DamageProfileId,
                RightWingDamageProfile.Id))
            throw new ArgumentException(
                "The scenario's right-wing collision and damage identities must agree.",
                nameof(rightOuterWingCollisionVolume));
        Inspection = inspection ?? throw new ArgumentNullException(nameof(inspection));
        if (stabilizationDwellTicks <= 0)
            throw new ArgumentOutOfRangeException(nameof(stabilizationDwellTicks));
        if (!double.IsFinite(maximumStabilizedAbsoluteRollRateRadS)
            || maximumStabilizedAbsoluteRollRateRadS <= 0.0)
            throw new ArgumentOutOfRangeException(
                nameof(maximumStabilizedAbsoluteRollRateRadS));
        if (!double.IsFinite(minimumStabilizationTerrainClearanceM)
            || minimumStabilizationTerrainClearanceM < 0.0)
            throw new ArgumentOutOfRangeException(
                nameof(minimumStabilizationTerrainClearanceM));
        if (sustainedLateralDemandTicks <= 0)
            throw new ArgumentOutOfRangeException(nameof(sustainedLateralDemandTicks));
        if (!double.IsFinite(lateralDemandThreshold)
            || lateralDemandThreshold is <= 0.0 or > 1.0)
            throw new ArgumentOutOfRangeException(nameof(lateralDemandThreshold));
        if (!double.IsFinite(maximumLandingEnvelopeRollAuthorityFraction)
            || maximumLandingEnvelopeRollAuthorityFraction is <= 0.0 or >= 1.0)
            throw new ArgumentOutOfRangeException(
                nameof(maximumLandingEnvelopeRollAuthorityFraction));
        if (!double.IsFinite(maximumLimitedRollAuthorityFraction)
            || maximumLimitedRollAuthorityFraction
                <= maximumLandingEnvelopeRollAuthorityFraction
            || maximumLimitedRollAuthorityFraction >= 1.0)
            throw new ArgumentOutOfRangeException(
                nameof(maximumLimitedRollAuthorityFraction),
                "The limited roll-authority threshold must be above the unsafe "
                + "threshold and below full authority.");

        Id = id;
        StabilizationDwellTicks = stabilizationDwellTicks;
        MaximumStabilizedAbsoluteRollRateRadS =
            maximumStabilizedAbsoluteRollRateRadS;
        MinimumStabilizationTerrainClearanceM =
            minimumStabilizationTerrainClearanceM;
        SustainedLateralDemandTicks = sustainedLateralDemandTicks;
        LateralDemandThreshold = lateralDemandThreshold;
        MaximumLandingEnvelopeRollAuthorityFraction =
            maximumLandingEnvelopeRollAuthorityFraction;
        MaximumLimitedRollAuthorityFraction =
            maximumLimitedRollAuthorityFraction;
    }

    public string Id { get; }
    public ArmstrongAttackRunCheckpointDefinition AttackRunCheckpoint { get; }
    public CableHazardField CableField { get; }
    public AirframeComponentCollisionVolume RightOuterWingCollisionVolume { get; }
    public PartialAirframeDamageProfile RightWingDamageProfile { get; }
    public DamageInspectionDefinition Inspection { get; }
    public int StabilizationDwellTicks { get; }
    public double MaximumStabilizedAbsoluteRollRateRadS { get; }
    public double MinimumStabilizationTerrainClearanceM { get; }
    public int SustainedLateralDemandTicks { get; }
    public double LateralDemandThreshold { get; }
    public double MaximumLandingEnvelopeRollAuthorityFraction { get; }
    public double MaximumLimitedRollAuthorityFraction { get; }
}

public static class ArmstrongCableStrikeScenarios {
    public const string RightOuterWingComponentId =
        "component.f9f-2-panther.right-outer-wing.reconstruction.v1";
    public const string CableGeometryReconstructionRecordId =
        "reconstruction-record.armstrong.cable-geometry.local-greybox.v1";
    /// <summary>
    /// Stable deterministic entropy only. This deliberately does not encode the source-locked
    /// 3 September 1951 incident date.
    /// </summary>
    public const ulong GreyboxMissionSeed = 0xA4C7_51D3_9E2B_6F10UL;

    /// <summary>
    /// A deliberately local greybox. Coordinates and cable layout are reconstruction, not a claim
    /// about Majon-ni; both renderer and collision must consume this same definition when wired.
    /// </summary>
    public static ArmstrongCableStrikeScenarioDefinition CableToDecisionGreybox() {
        PartialAirframeDamageProfile damage =
            PantherRightOuterWingLossFamily.ReportedRangeMidpointReconstruction();
        var cable = new CableDefinition(
            id: "hazard.armstrong.cable.reconstruction.01.v1",
            supportPoints: new[] {
                new Vec3D(-45.0, 76.0, 0.0),
                new Vec3D(45.0, 76.0, 0.0)
            },
            radiusM: 0.025,
            materialProfileId: "material.cable.steel.reconstruction.v1",
            renderProfileId: "render.cable.korea-greybox.v1",
            historyLabel: CableHistoryLabel.Reconstructed,
            // The oral history supports one reported cable contact. It does not supply the local
            // support points, radius, height, material, or purpose authored above.
            historicalSourceIds: new[] {
                "source.armstrong-nasa-sp-2011-4542.v1"
            },
            geometryRecordId: CableGeometryReconstructionRecordId,
            collisionLayers: CableCollisionLayer.PlayerAirframe,
            requiredStreamingResidencyId:
                "streaming.korea.armstrong-cable-corridor.greybox.v1");
        var response = new CableContactResponseProfile(
            "response.armstrong.cable-snag.reconstruction.v1",
            equivalentSnagMassKg: 25.0,
            maximumImpulseNs: 5_000.0);
        var rightOuterWing = new AirframeComponentCollisionVolume(
            RightOuterWingComponentId,
            // The provisional F9F-2 handling surrogate has a half-span of about 5.79 m. It sizes
            // this greybox volume only; it does not resolve the individual loss-airframe
            // configuration or source the exact component geometry.
            bodyLocalCenterM: new Vec3D(4.65, 0.0, -0.15),
            radiusM: 1.05,
            CableCollisionLayer.PlayerAirframe,
            damage.Id,
            response);
        return new ArmstrongCableStrikeScenarioDefinition(
            ArmstrongCableStrikeContract.ScenarioId,
            new ArmstrongAttackRunCheckpointDefinition(
                ArmstrongCableStrikeContract.AttackRunCheckpointId,
                simulationTick: 0,
                missionSeed: GreyboxMissionSeed,
                weatherStateId: "weather.korea-armstrong-greybox.fixed.v1"),
            new CableHazardField(new[] { cable }),
            rightOuterWing,
            damage,
            new DamageInspectionDefinition(
                maximumRangeM: 35.0,
                maximumAbsoluteClosureMps: 2.0,
                maximumAbsoluteRelativeRollRad: 0.35,
                requiredDwellTicks: 240),
            stabilizationDwellTicks: 120,
            maximumStabilizedAbsoluteRollRateRadS: 0.18,
            minimumStabilizationTerrainClearanceM: 120.0,
            sustainedLateralDemandTicks: 120,
            lateralDemandThreshold: 0.25,
            maximumLandingEnvelopeRollAuthorityFraction: 0.18,
            maximumLimitedRollAuthorityFraction: 0.35);
    }
}
