using GunsOnly.Sim.Korea;

namespace GunsOnly.Sim.Tests.Korea;

public sealed class CableHazardFieldTests {
    static readonly CableContactResponseProfile Response = new(
        "response.cable.greybox.v1",
        equivalentSnagMassKg: 25.0,
        maximumImpulseNs: 4_000.0);

    [Fact]
    public void FastSweepHitsWhenBothTickEndpointsAreClear() {
        CableHazardField field = Field();
        AircraftComponentSweep sweep = Sweep(
            new Vec3D(0.0, -2.0, 0.0),
            new Vec3D(0.0, 2.0, 0.0),
            tickDurationS: 1.0 / 120.0);

        Assert.True(field.TrySweepFirst(sweep, out CableContactRecord contact));

        Assert.Equal("cable.test.v1", contact.CableId);
        Assert.Equal(0, contact.SegmentIndex);
        Assert.Equal(
            ArmstrongCableStrikeScenarios.RightOuterWingComponentId,
            contact.AircraftComponentId);
        Assert.Equal(0.425, contact.ParametricTimeWithinTick, 10);
        Assert.Equal(contact.ParametricTimeWithinTick / 120.0,
            contact.TimeWithinTickS, 10);
        Assert.Equal(new Vec3D(1.0, 0.0, 0.0), contact.CableTangent);
        Assert.Equal(new Vec3D(0.0, 480.0, 0.0), contact.RelativeVelocityMps);
        Assert.True(contact.AppliedImpulseNs.Y < 0.0);
        Assert.Equal(Response.MaximumImpulseNs, contact.AppliedImpulseNs.Length, 8);
    }

    [Fact]
    public void SweepDoesNotInventContactOutsidePhysicalCapsules() {
        CableHazardField field = Field();
        AircraftComponentSweep clear = Sweep(
            new Vec3D(0.0, -2.0, 2.0),
            new Vec3D(0.0, 2.0, 2.0));

        Assert.False(field.TrySweepFirst(clear, out _));
    }

    [Fact]
    public void ExistingPenetrationReportsContactAtStartOfTick() {
        CableHazardField field = Field();

        Assert.True(field.TrySweepFirst(
            Sweep(
                new Vec3D(0.0, 0.1, 0.0),
                new Vec3D(0.0, 2.0, 0.0)),
            out CableContactRecord contact));

        Assert.Equal(0.0, contact.ParametricTimeWithinTick);
        Assert.Equal(0.0, contact.TimeWithinTickS);
    }

    [Fact]
    public void ContactTimeIsStableAcrossEquivalentFixedStepPartitions() {
        CableHazardField field = Field();
        const double totalDuration = 1.0 / 30.0;
        AircraftComponentSweep whole = Sweep(
            new Vec3D(0.0, -2.0, 0.0),
            new Vec3D(0.0, 2.0, 0.0),
            totalDuration);
        Assert.True(field.TrySweepFirst(whole, out CableContactRecord one));

        const int partitions = 4;
        CableContactRecord partitioned = default;
        double absoluteTime = double.NaN;
        for (int index = 0; index < partitions; index++) {
            double from = -2.0 + index;
            AircraftComponentSweep part = Sweep(
                new Vec3D(0.0, from, 0.0),
                new Vec3D(0.0, from + 1.0, 0.0),
                totalDuration / partitions);
            if (!field.TrySweepFirst(part, out partitioned)) continue;
            absoluteTime = index * totalDuration / partitions
                + partitioned.TimeWithinTickS;
            break;
        }

        Assert.True(double.IsFinite(absoluteTime));
        Assert.Equal(one.TimeWithinTickS, absoluteTime, 10);
        Assert.Equal(one.WorldContactPoint.X, partitioned.WorldContactPoint.X, 10);
        Assert.Equal(one.WorldContactPoint.Y, partitioned.WorldContactPoint.Y, 10);
        Assert.Equal(one.WorldContactPoint.Z, partitioned.WorldContactPoint.Z, 10);
    }

    [Fact]
    public void ExactTimeTieUsesStableCableIdentityNotCollectionOrder() {
        CableDefinition second = Cable("cable.z.v1");
        CableDefinition first = Cable("cable.a.v1");
        var field = new CableHazardField(new[] { second, first });

        Assert.True(field.TrySweepFirst(
            Sweep(new Vec3D(0.0, -2.0, 0.0), new Vec3D(0.0, 2.0, 0.0)),
            out CableContactRecord contact));

        Assert.Equal("cable.a.v1", contact.CableId);
    }

    [Fact]
    public void PolylineJointTieUsesFirstStableSegment() {
        CableDefinition cable = Cable(
            "cable.joint.v1",
            new[] {
                new Vec3D(-5.0, 0.0, 0.0),
                new Vec3D(0.0, 0.0, 0.0),
                new Vec3D(0.0, 5.0, 0.0)
            });
        var field = new CableHazardField(new[] { cable });

        Assert.True(field.TrySweepFirst(
            Sweep(
                new Vec3D(0.0, 0.0, -2.0),
                new Vec3D(0.0, 0.0, 2.0)),
            out CableContactRecord contact));

        Assert.Equal(0, contact.SegmentIndex);
    }

    [Fact]
    public void DefinitionClonesGeometryAndPublishesActivationResidency() {
        var supports = new[] {
            new Vec3D(-5.0, 0.0, 0.0),
            new Vec3D(5.0, 0.0, 0.0)
        };
        CableDefinition cable = Cable("cable.clone.v1", supports);
        supports[0] = new Vec3D(9_999.0, 9_999.0, 9_999.0);

        Assert.Equal(new Vec3D(-5.0, 0.0, 0.0), cable.SupportPoints[0]);
        Assert.Equal("streaming.test.v1", cable.RequiredStreamingResidencyId);
        Assert.True(cable.ActivationBounds.Contains(Vec3D.Zero));
        Assert.False(cable.ActivationBounds.Contains(new Vec3D(0.0, 0.5, 0.0)));
        Assert.True(cable.CollisionBounds(componentRadiusM: 1.0)
            .Contains(new Vec3D(0.0, 0.5, 0.0)));
        Assert.Equal(CableHistoryLabel.Reconstructed, cable.HistoryLabel);
        Assert.Equal(
            new[] { "source.test.history.v1" },
            cable.HistoricalSourceIds);
        Assert.Equal(
            "reconstruction-record.test.cable-geometry.v1",
            cable.GeometryRecordId);
    }

    [Fact]
    public void ArmstrongScenarioSeparatesReportedContactFromAuthoredGeometryAndDate() {
        ArmstrongCableStrikeScenarioDefinition definition =
            ArmstrongCableStrikeScenarios.CableToDecisionGreybox();
        CableDefinition cable = Assert.Single(definition.CableField.Cables);

        Assert.Equal(
            new[] { "source.armstrong-nasa-sp-2011-4542.v1" },
            cable.HistoricalSourceIds);
        Assert.Equal(
            ArmstrongCableStrikeScenarios.CableGeometryReconstructionRecordId,
            cable.GeometryRecordId);
        Assert.DoesNotContain(cable.GeometryRecordId, cable.HistoricalSourceIds);
        Assert.Equal(
            ArmstrongCableStrikeScenarios.GreyboxMissionSeed,
            definition.AttackRunCheckpoint.MissionSeed);
        Assert.NotEqual(0x1951_0903UL, definition.AttackRunCheckpoint.MissionSeed);
        Assert.StartsWith(
            "component.panther-subtype-unresolved.",
            definition.RightOuterWingCollisionVolume.ComponentId,
            StringComparison.Ordinal);
    }

    [Fact]
    public void ScenarioOwnedOuterWingVolumeFollowsRealAircraftPose() {
        AirframeComponentCollisionVolume volume =
            ArmstrongCableStrikeScenarios.CableToDecisionGreybox()
                .RightOuterWingCollisionVolume;
        var previous = new AircraftState(
            new Vec3D(10.0, 100.0, 20.0),
            Speed: 150.0,
            Gamma: 0.0,
            Chi: 0.0,
            Bank: 0.0,
            Mass: 6_000.0,
            QuaternionD.Identity);
        QuaternionD reversed = QuaternionD.FromFrame(
            new Vec3D(-1.0, 0.0, 0.0),
            new Vec3D(0.0, 1.0, 0.0),
            new Vec3D(0.0, 0.0, -1.0));
        AircraftState current = previous with { BodyAttitude = reversed };

        AircraftComponentSweep sweep = volume.Sweep(
            previous,
            current,
            tickDurationS: 1.0 / 120.0,
            pilotLateralInput: 0.3,
            rudderInput: 0.0,
            normalLoadDemandG: 1.0,
            throttle: 0.85);

        Assert.Equal(previous.Position
            + previous.BodyAttitude.Rotate(volume.BodyLocalCenterM),
            sweep.PreviousWorldCenter);
        Assert.Equal(current.Position
            + current.BodyAttitude.Rotate(volume.BodyLocalCenterM),
            sweep.CurrentWorldCenter);
        Assert.NotEqual(sweep.PreviousWorldCenter, sweep.CurrentWorldCenter);
        Assert.Equal(volume.DamageProfileId, sweep.DamageProfileId);
    }

    static CableHazardField Field() => new(new[] { Cable("cable.test.v1") });

    static CableDefinition Cable(string id, Vec3D[]? supports = null) => new(
        id,
        supports ?? new[] {
            new Vec3D(-5.0, 0.0, 0.0),
            new Vec3D(5.0, 0.0, 0.0)
        },
        radiusM: 0.05,
        materialProfileId: "material.test.v1",
        renderProfileId: "render.test.v1",
        historyLabel: CableHistoryLabel.Reconstructed,
        historicalSourceIds: new[] { "source.test.history.v1" },
        geometryRecordId: "reconstruction-record.test.cable-geometry.v1",
        collisionLayers: CableCollisionLayer.PlayerAirframe,
        requiredStreamingResidencyId: "streaming.test.v1");

    static AircraftComponentSweep Sweep(
        in Vec3D previous,
        in Vec3D current,
        double tickDurationS = 1.0 / 120.0) => new(
        ArmstrongCableStrikeScenarios.RightOuterWingComponentId,
        previous,
        current,
        RadiusM: 0.25,
        tickDurationS,
        CableCollisionLayer.PlayerAirframe,
        new CablePreContactState(
            AircraftPosition: previous,
            AircraftVelocity: (current - previous) * (1.0 / tickDurationS),
            BodyAttitude: QuaternionD.Identity,
            PilotLateralInput: 0.2,
            RudderInput: 0.0,
            NormalLoadDemandG: 1.0,
            Throttle: 0.85),
        PantherRightOuterWingLossFamily.ForExtent(
            PantherRightOuterWingLossExtent.SevenFeet).Id,
        Response);
}
