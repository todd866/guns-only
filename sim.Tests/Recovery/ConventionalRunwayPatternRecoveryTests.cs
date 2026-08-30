using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Recovery;

namespace GunsOnly.Sim.Tests.Recovery;

public sealed class ConventionalRunwayPatternRecoveryTests {
    const double TestCleanDragToWeight = 0.04;
    const double TestTouchdownReferenceHeightM = 1.8;

    sealed class HeightOnlyTerrain(double heightM) : ITerrainSurface {
        public int HeightQueries { get; private set; }
        public TerrainBounds Bounds => new(
            -1_000_000.0, 1_000_000.0, -1_000_000.0, 1_000_000.0);
        public double HorizontalResolutionM => 100.0;

        public bool TrySample(double eastM, double northM, out TerrainSample sample) =>
            throw new InvalidOperationException(
                "pattern terrain marches must use the height-only surface seam");

        public bool TryHeightM(double eastM, double northM, out double sampledHeightM) {
            HeightQueries++;
            sampledHeightM = heightM;
            return true;
        }
    }

    static (BeatSetup beat, ConventionalRunway runway, double approachCalibratedMps) Fixture() {
        BeatSetup beat = Beats.ModernVisualMerge();
        ConventionalRunway runway = ConventionalRunway.FromRecoveryPlan(
            Assert.IsType<RecoveryPlan>(beat.RecoveryPlan));
        double approachCalibratedMps = SortieSchedule.ApproachCalibratedAirspeedMps(
            beat.Player.Mass,
            beat.PlayerAir,
            Assert.IsType<AirframeSystemsProfile>(beat.SystemsProfile));
        return (beat, runway, approachCalibratedMps);
    }

    [Fact]
    public void ScheduleIsANamedLeftHandRunwayPatternNotADirectIngress() {
        var (_, runway, approachCalibratedMps) = Fixture();
        IReadOnlyList<ConventionalRunwayPatternRecoveryDirector.PatternGate> gates =
            ConventionalRunwayPatternRecoveryDirector.BuildSchedule(
                runway, approachCalibratedMps);

        Assert.Equal(9, gates.Count);
        Assert.Equal(new[] {
            ApproachPatternLeg.PatternEntry,
            ApproachPatternLeg.Downwind,
            ApproachPatternLeg.Downwind,
            ApproachPatternLeg.Downwind,
            ApproachPatternLeg.Base,
            ApproachPatternLeg.Base,
            ApproachPatternLeg.Final,
            ApproachPatternLeg.Threshold,
            ApproachPatternLeg.Threshold,
        }, gates.Select(gate => gate.Leg));
        Assert.All(gates, gate => Assert.DoesNotContain(
            "WIRE", gate.Label, StringComparison.OrdinalIgnoreCase));

        var entry = runway.Frame(gates[0].Position);
        Assert.Equal(5_000.0, entry.along, precision: 6);
        Assert.Equal(-6_000.0, entry.cross, precision: 6);
        var downwind = runway.Frame(gates[2].Position);
        Assert.Equal(700.0, downwind.along, precision: 6);
        Assert.Equal(-3_000.0, downwind.cross, precision: 6);
        var baseLeg = runway.Frame(gates[4].Position);
        Assert.True(baseLeg.along < 0.0);
        Assert.InRange(baseLeg.cross, -2_201.0, -2_199.0);
        var final = runway.Frame(gates[6].Position);
        var threshold = runway.Frame(gates[7].Position);
        var touchdownAim = runway.Frame(gates[8].Position);
        Assert.Equal(-3_000.0, final.along, precision: 6);
        Assert.Equal(0.0, final.cross, precision: 6);
        Assert.Equal(0.0, threshold.along, precision: 6);
        Assert.Equal(0.0, threshold.cross, precision: 6);
        Assert.Equal(runway.TouchdownAimAlongM, touchdownAim.along, precision: 6);
        Assert.Equal(0.0, touchdownAim.cross, precision: 6);
        Assert.True(gates[4].Position.Y > gates[5].Position.Y);
        Assert.True(gates[5].Position.Y > gates[6].Position.Y,
            "base-to-final guidance must descend continuously, never command a climb");
    }

    [Fact]
    public void FinalThresholdAndTouchdownUseARecoverableF22SurrogateSpeed() {
        var (_, runway, approachCalibratedMps) = Fixture();
        IReadOnlyList<ConventionalRunwayPatternRecoveryDirector.PatternGate> gates =
            ConventionalRunwayPatternRecoveryDirector.BuildSchedule(
                runway, approachCalibratedMps);

        Assert.InRange(approachCalibratedMps,
            new ConventionalLandingEnvelope().MinimumAirspeedMps,
            new ConventionalLandingEnvelope().MaximumAirspeedMps);
        foreach (ConventionalRunwayPatternRecoveryDirector.PatternGate gate
            in gates.Skip(6)) {
            Assert.Equal(
                AirData.TrueAirspeedForCalibratedAirspeedMps(
                    approachCalibratedMps, gate.Position.Y),
                gate.TargetSpeedMps,
                precision: 10);
        }
        Assert.True(gates[0].TargetSpeedMps > gates[^1].TargetSpeedMps,
            "the same calibrated schedule must publish the local true speed at each altitude");
    }

    [Fact]
    public void FinalThresholdAndTouchdownShareThreeDegreeLineAnchoredAtWheelHeight() {
        const double touchdownReferenceHeightM = 2.35;
        var (_, runway, approachCalibratedMps) = Fixture();
        IReadOnlyList<ConventionalRunwayPatternRecoveryDirector.PatternGate> gates =
            ConventionalRunwayPatternRecoveryDirector.BuildSchedule(
                runway,
                approachCalibratedMps,
                touchdownReferenceHeightM);

        double slope = Math.Tan(3.0 * Math.PI / 180.0);
        foreach (ConventionalRunwayPatternRecoveryDirector.PatternGate gate
            in gates.Skip(6)) {
            var frame = runway.Frame(gate.Position);
            double expectedHeightM = touchdownReferenceHeightM
                + Math.Max(0.0, runway.TouchdownAimAlongM - frame.along) * slope;
            Assert.Equal(0.0, frame.cross, precision: 8);
            Assert.Equal(expectedHeightM, frame.height, precision: 8);
        }

        Assert.Equal(touchdownReferenceHeightM,
            runway.Frame(gates[^1].Position).height,
            precision: 8);
    }

    [Theory]
    [InlineData(-25.01, ApproachEnergyState.TooSlow)]
    [InlineData(-25.00, ApproachEnergyState.OnSpeed)]
    [InlineData(0.00, ApproachEnergyState.OnSpeed)]
    [InlineData(25.00, ApproachEnergyState.OnSpeed)]
    [InlineData(25.01, ApproachEnergyState.TooFast)]
    public void EnergyBandIsInclusiveAtPlusOrMinusTwentyFiveKtas(
        double offsetKtas,
        ApproachEnergyState expected) {
        Assert.Equal(expected, ApproachGuidance.ClassifyEnergy(
            currentKtas: 180.0 + offsetKtas,
            targetKtas: 180.0,
            toleranceKtas: 25.0));
    }

    [Fact]
    public void EntryCaptureRequiresAltitudeAndHeadingBeforeGuidanceAdvances() {
        var (beat, runway, approachCalibratedMps) = Fixture();
        IReadOnlyList<ConventionalRunwayPatternRecoveryDirector.PatternGate> schedule =
            ConventionalRunwayPatternRecoveryDirector.BuildSchedule(
                runway, approachCalibratedMps);
        var entry = schedule[0];
        var join = schedule[1];
        double entryHeadingRad = Math.Atan2(
            join.Position.X - entry.Position.X,
            join.Position.Z - entry.Position.Z);
        Vec3D nearEntry = entry.Position - runway.Forward * 100.0;

        var wrongAltitudeDirector = new ConventionalRunwayPatternRecoveryDirector();
        AircraftState wrongAltitude = beat.Player with {
            Position = nearEntry + new Vec3D(0.0, 500.0, 0.0),
            Chi = entryHeadingRad,
        };
        wrongAltitudeDirector.Step(
            active: true,
            runway,
            wrongAltitude,
            trueAirspeedMps: entry.TargetSpeedMps,
            approachCalibratedAirspeedMps: approachCalibratedMps,
            cleanDragToWeight: TestCleanDragToWeight,
            touchdownReferenceHeightM: TestTouchdownReferenceHeightM);
        Assert.Equal(0, wrongAltitudeDirector.ActiveIndex);

        var wrongHeadingDirector = new ConventionalRunwayPatternRecoveryDirector();
        AircraftState wrongHeading = beat.Player with {
            Position = nearEntry,
            Chi = entryHeadingRad + Math.PI,
        };
        wrongHeadingDirector.Step(
            active: true,
            runway,
            wrongHeading,
            trueAirspeedMps: entry.TargetSpeedMps,
            approachCalibratedAirspeedMps: approachCalibratedMps,
            cleanDragToWeight: TestCleanDragToWeight,
            touchdownReferenceHeightM: TestTouchdownReferenceHeightM);
        Assert.Equal(0, wrongHeadingDirector.ActiveIndex);

        var capturedDirector = new ConventionalRunwayPatternRecoveryDirector();
        AircraftState captured = beat.Player with {
            Position = entry.Position,
            Chi = entryHeadingRad,
        };

        ApproachGuidanceState state = capturedDirector.Step(
            active: true,
            runway,
            captured,
            trueAirspeedMps: schedule[1].TargetSpeedMps
                + 30.0 / AirData.MpsToKnots,
            approachCalibratedAirspeedMps: approachCalibratedMps,
            cleanDragToWeight: TestCleanDragToWeight,
            touchdownReferenceHeightM: TestTouchdownReferenceHeightM);

        Assert.Equal(1, capturedDirector.ActiveIndex);
        Assert.True(state.ConventionalPattern);
        Assert.Equal(ApproachPatternLeg.Downwind, state.ActivePatternLeg);
        Assert.Equal(ApproachGuidance.DefaultSpeedToleranceKtas,
            state.TargetSpeedToleranceKtas);
        Assert.Equal(ApproachEnergyState.TooFast, state.EnergyState);
        Assert.Equal("JOIN DOWNWIND", state.NextLabel);
        Assert.Equal(8, state.Gates.Count);
        Assert.Equal("touchdown_aim", state.Gates[^1].Id);
        Assert.DoesNotContain("WIRE", ApproachGuidance.GatesJson(state),
            StringComparison.OrdinalIgnoreCase);
    }

    [Fact]
    public void MissedFinalBeyondTheAimRestartsAtPatternEntry() {
        var (beat, runway, approachCalibratedMps) = Fixture();
        IReadOnlyList<ConventionalRunwayPatternRecoveryDirector.PatternGate> schedule =
            ConventionalRunwayPatternRecoveryDirector.BuildSchedule(
                runway, approachCalibratedMps);
        var director = new ConventionalRunwayPatternRecoveryDirector();

        for (int index = 0; index < 6; index++) {
            ConventionalRunwayPatternRecoveryDirector.PatternGate gate = schedule[index];
            ConventionalRunwayPatternRecoveryDirector.PatternGate next = schedule[index + 1];
            double headingRad = Math.Atan2(
                next.Position.X - gate.Position.X,
                next.Position.Z - gate.Position.Z);
            AircraftState atGate = beat.Player with {
                Position = gate.Position,
                Speed = gate.TargetSpeedMps,
                Chi = headingRad,
            };
            director.Step(
                active: true,
                runway,
                atGate,
                trueAirspeedMps: gate.TargetSpeedMps,
                approachCalibratedAirspeedMps: approachCalibratedMps,
                cleanDragToWeight: TestCleanDragToWeight,
                touchdownReferenceHeightM: TestTouchdownReferenceHeightM);
        }
        Assert.Equal(6, director.ActiveIndex);

        AircraftState missed = beat.Player with {
            Position = runway.SurfacePoint(runway.TouchdownAimAlongM + 300.0)
                + new Vec3D(0.0, TestTouchdownReferenceHeightM + 10.0, 0.0),
            Speed = schedule[6].TargetSpeedMps,
            Chi = runway.HeadingRad,
        };
        ApproachGuidanceState restarted = director.Step(
            active: true,
            runway,
            missed,
            trueAirspeedMps: missed.Speed,
            approachCalibratedAirspeedMps: approachCalibratedMps,
            cleanDragToWeight: TestCleanDragToWeight,
            touchdownReferenceHeightM: TestTouchdownReferenceHeightM);

        Assert.Equal(0, director.ActiveIndex);
        Assert.Equal(ApproachPatternLeg.PatternEntry, restarted.ActivePatternLeg);
        Assert.All(restarted.Gates,
            gate => Assert.StartsWith("pattern_ingress_", gate.Id, StringComparison.Ordinal));
    }

    [Fact]
    public void RepeatedOrbitGeometryAdvancesMonotonicallyAlongTheFrozenIngress() {
        var (beat, runway, approachCalibratedMps) = Fixture();
        var director = new ConventionalRunwayPatternRecoveryDirector();
        AircraftState player = beat.Player with {
            Position = new Vec3D(
                beat.Player.Position.X, 15_000.0, beat.Player.Position.Z),
            Speed = approachCalibratedMps * 1.30,
            Chi = 0.0,
        };
        ApproachGuidanceState guidance = director.Step(
            active: true,
            runway,
            player,
            trueAirspeedMps: player.Speed,
            approachCalibratedAirspeedMps: approachCalibratedMps,
            cleanDragToWeight: TestCleanDragToWeight,
            touchdownReferenceHeightM: TestTouchdownReferenceHeightM);
        Assert.Equal(ApproachExtensionKind.Orbit360, guidance.Extension);
        double initialRemainingM = guidance.TrackRequiredM;
        double priorRemainingM = initialRemainingM;

        for (int step = 0; step < 60; step++) {
            WorldApproachGate next = guidance.Gates[0];
            player = player with {
                Position = new Vec3D(next.EastM, next.UpM, next.NorthM),
                Speed = next.TargetKtas / AirData.MpsToKnots,
            };
            guidance = director.Step(
                active: true,
                runway,
                player,
                trueAirspeedMps: player.Speed,
                approachCalibratedAirspeedMps: approachCalibratedMps,
                cleanDragToWeight: TestCleanDragToWeight,
                touchdownReferenceHeightM: TestTouchdownReferenceHeightM);
            Assert.True(guidance.TrackRequiredM <= priorRemainingM + 1e-6,
                $"ingress progress moved backwards at step {step}");
            priorRemainingM = guidance.TrackRequiredM;
        }

        Assert.True(priorRemainingM < initialRemainingM - 15_000.0,
            "progress must survive crossing the repeated geometry of a completed 360");
    }

    [Fact]
    public void ExhaustedIngressStaysFrozenUntilEntryCaptureOrCrossTrackBreach() {
        var (beat, runway, approachCalibratedMps) = Fixture();
        IReadOnlyList<ConventionalRunwayPatternRecoveryDirector.PatternGate> schedule =
            ConventionalRunwayPatternRecoveryDirector.BuildSchedule(
                runway, approachCalibratedMps);
        var entry = schedule[0];
        var join = schedule[1];
        double wrongHeading = Math.Atan2(
            join.Position.X - entry.Position.X,
            join.Position.Z - entry.Position.Z) + Math.PI;
        var director = new ConventionalRunwayPatternRecoveryDirector();
        AircraftState player = beat.Player with {
            Position = entry.Position + new Vec3D(0.0, 500.0, 0.0),
            Speed = entry.TargetSpeedMps,
            Chi = wrongHeading,
        };
        ApproachGuidanceState guidance = director.Step(
            active: true,
            runway,
            player,
            trueAirspeedMps: player.Speed,
            approachCalibratedAirspeedMps: approachCalibratedMps,
            cleanDragToWeight: TestCleanDragToWeight,
            touchdownReferenceHeightM: TestTouchdownReferenceHeightM);

        for (int step = 0; step < 200 && guidance.TrackRequiredM > 5.0; step++) {
            WorldApproachGate next = guidance.Gates[0];
            player = player with {
                Position = new Vec3D(next.EastM, next.UpM, next.NorthM),
                Speed = next.TargetKtas / AirData.MpsToKnots,
                Chi = wrongHeading,
            };
            guidance = director.Step(
                active: true,
                runway,
                player,
                trueAirspeedMps: player.Speed,
                approachCalibratedAirspeedMps: approachCalibratedMps,
                cleanDragToWeight: TestCleanDragToWeight,
                touchdownReferenceHeightM: TestTouchdownReferenceHeightM);
        }

        Assert.InRange(guidance.TrackRequiredM, 0.0, 5.0);
        Assert.Equal(0, director.ActiveIndex);
        WorldApproachGate frozen = guidance.Gates[0];
        player = player with { Speed = player.Speed + 80.0 };
        ApproachGuidanceState held = director.Step(
            active: true,
            runway,
            player,
            trueAirspeedMps: player.Speed,
            approachCalibratedAirspeedMps: approachCalibratedMps,
            cleanDragToWeight: TestCleanDragToWeight,
            touchdownReferenceHeightM: TestTouchdownReferenceHeightM);

        Assert.InRange(held.TrackRequiredM, 0.0, 5.0);
        Assert.Equal(0, director.ActiveIndex);
        Assert.Equal(frozen.EastM, held.Gates[0].EastM, precision: 8);
        Assert.Equal(frozen.NorthM, held.Gates[0].NorthM, precision: 8);
        Assert.Equal(frozen.UpM, held.Gates[0].UpM, precision: 8);
        Assert.Equal(frozen.TargetKtas, held.Gates[0].TargetKtas, precision: 8);
    }

    [Fact]
    public void CurvedIngressTerrainMarchRaisesAltitudeBySpendingScheduledSpeed() {
        var (beat, runway, approachCalibratedMps) = Fixture();
        var terrain = new HeightOnlyTerrain(500.0);
        var director = new ConventionalRunwayPatternRecoveryDirector();
        AircraftState player = beat.Player with {
            Position = new Vec3D(
                beat.Player.Position.X, 400.0, beat.Player.Position.Z),
            Speed = 120.0,
            Chi = 0.0,
        };
        double initialEnergyM = ApproachEnergy.SpecificEnergyM(
            player.Position.Y, player.Speed);

        ApproachGuidanceState guidance = director.Step(
            active: true,
            runway,
            player,
            trueAirspeedMps: player.Speed,
            approachCalibratedAirspeedMps: approachCalibratedMps,
            cleanDragToWeight: TestCleanDragToWeight,
            touchdownReferenceHeightM: TestTouchdownReferenceHeightM,
            terrain: terrain);

        Assert.True(terrain.HeightQueries > 0);
        Assert.True(guidance.Gates[0].UpM >= 800.0);
        double gateEnergyM = ApproachEnergy.SpecificEnergyM(
            guidance.Gates[0].UpM,
            guidance.Gates[0].TargetKtas / AirData.MpsToKnots);
        Assert.True(gateEnergyM <= initialEnergyM + 1e-6,
            "terrain clearance must not create altitude without spending scheduled speed");
    }
}
