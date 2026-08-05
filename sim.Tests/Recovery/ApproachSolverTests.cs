using GunsOnly.Sim;
using GunsOnly.Sim.Recovery;
using Xunit;

namespace GunsOnly.Sim.Tests.Recovery;

public class ApproachSolverTests {
    static ApproachSolverInput Input(double altitudeM, double tasMps, double rangeM) => new(
        Position: new Vec3D(0.0, altitudeM, rangeM),
        TrueAirspeedMps: tasMps,
        CurrentHeadingRad: Math.PI,
        Threshold: new Vec3D(0.0, 0.0, 0.0),
        StabilisationAltitudeM: 152.0,
        StabilisationSpeedMps: 90.0,
        DragToWeight: 0.12,
        TurnRadiusM: 2_000.0,
        GrooveEntryTrackM: 1_200.0);

    [Fact]
    public void AnOnProfileArrivalNeedsNoExtension() {
        var s = ApproachSolver.Solve(Input(altitudeM: 900.0, tasMps: 110.0, rangeM: 30_000.0));
        Assert.True(s.Valid);
        Assert.Equal(ApproachExtensionKind.None, s.Path.Kind);
        Assert.True(s.TrackRequiredM <= s.TrackAvailableM);
        Assert.False(s.InGroove);
    }

    [Fact]
    public void HighAndFastAndCloseBuysTrackRatherThanFailing() {
        var s = ApproachSolver.Solve(Input(altitudeM: 12_000.0, tasMps: 320.0, rangeM: 15_000.0));
        Assert.True(s.Valid, "the solver must never refuse an approach");
        Assert.NotEqual(ApproachExtensionKind.None, s.Path.Kind);
        Assert.True(s.Path.TotalTrackM >= s.TrackRequiredM - 1e-6);
        Assert.True(s.ExcessEnergyM > 0.0);
    }

    [Fact]
    public void GatesDescendAndDecelerateTowardTheThreshold() {
        var s = ApproachSolver.Solve(Input(6_000.0, 200.0, 40_000.0));
        Assert.NotEmpty(s.Gates);
        for (int i = 1; i < s.Gates.Count; i++) {
            Assert.True(s.Gates[i].DistanceToGoM < s.Gates[i - 1].DistanceToGoM,
                "gates must sequence toward the threshold");
            Assert.True(s.Gates[i].TargetAltitudeM <= s.Gates[i - 1].TargetAltitudeM + 1e-6);
            Assert.True(s.Gates[i].TargetSpeedMps <= s.Gates[i - 1].TargetSpeedMps + 1e-6);
        }
        ApproachGate last = s.Gates[^1];
        Assert.Equal(152.0, last.TargetAltitudeM, precision: 3);
        Assert.Equal(90.0, last.TargetSpeedMps, precision: 3);
        Assert.True(last.DirtyConfig, "the stabilisation gate is flown dirty");
        double expectedEntry = Math.Max(
            1_200.0,
            152.0 / Math.Tan(Input(0, 0, 0).GlideslopeRad));
        Assert.Equal(-expectedEntry, last.Position.Z, precision: 3);
        Assert.NotEqual(s.Gates[^1].Position, Input(0, 0, 0).Threshold);
    }

    [Fact]
    public void GatePositionsFollowThePurchasedDownwindInsteadOfCollapsingOntoDirect() {
        var s = ApproachSolver.Solve(Input(12_000.0, 320.0, 15_000.0));
        Assert.NotEqual(ApproachExtensionKind.None, s.Path.Kind);
        Assert.Contains(s.Path.Points, p => Math.Abs(p.X) > 500.0);
        Assert.Contains(s.Gates, g => Math.Abs(g.Position.X) > 500.0);
    }

    [Fact]
    public void EveryGateEnergyEqualsWhatRemainingTrackCanStillShed() {
        ApproachSolverInput input = Input(6_000.0, 200.0, 40_000.0);
        var s = ApproachSolver.Solve(input);
        double stabiliseEnergy = ApproachEnergy.SpecificEnergyM(
            input.StabilisationAltitudeM, input.StabilisationSpeedMps);
        foreach (ApproachGate gate in s.Gates) {
            double scheduled = ApproachEnergy.SpecificEnergyM(
                gate.TargetAltitudeM, gate.TargetSpeedMps);
            Assert.Equal(
                stabiliseEnergy + input.DragToWeight * gate.DistanceToGoM,
                scheduled,
                precision: 6);
        }
    }

    [Fact]
    public void TheSolverIsDeterministic() {
        var a = ApproachSolver.Solve(Input(8_000.0, 250.0, 25_000.0));
        var b = ApproachSolver.Solve(Input(8_000.0, 250.0, 25_000.0));
        Assert.Equal(a.TrackRequiredM, b.TrackRequiredM, precision: 9);
        Assert.Equal(a.Path.TotalTrackM, b.Path.TotalTrackM, precision: 9);
        Assert.Equal(a.Gates.Count, b.Gates.Count);
    }

    [Fact]
    public void NonFiniteStateIsReportedInvalidRatherThanThrowing() {
        var s = ApproachSolver.Solve(Input(double.NaN, 200.0, 20_000.0));
        Assert.False(s.Valid);
        Assert.Empty(s.Gates);
    }

    [Fact]
    public void NegativeTrueAirspeedIsReportedInvalid() {
        var s = ApproachSolver.Solve(Input(1_000.0, -1.0, 10_000.0));
        Assert.False(s.Valid);
        Assert.Empty(s.Gates);
    }

    [Fact]
    public void NegativeStabilisationSpeedIsReportedInvalid() {
        var s = ApproachSolver.Solve(Input(1_000.0, 100.0, 10_000.0) with {
            StabilisationSpeedMps = -1.0,
        });
        Assert.False(s.Valid);
        Assert.Empty(s.Gates);
    }

    [Fact]
    public void SaturatedGeometryIsNotReportedAsAValidAlwaysFlyableSolution() {
        var s = ApproachSolver.Solve(Input(1e100, 100.0, 10_000.0));
        Assert.False(s.Valid);
        Assert.True(s.Path.Saturated);
        Assert.True(s.TrackAvailableM < s.TrackRequiredM);
        Assert.Empty(s.Gates);
    }

    [Fact]
    public void SaturatedGeometryIsInvalidEvenWhenItsLastMaterialisedOrbitCoversTheRequirement() {
        ApproachSolverInput nominal = Input(152.0, 90.0, 10_000.0) with {
            CurrentHeadingRad = 0.0,
        };
        double entry = Math.Max(
            nominal.GrooveEntryTrackM,
            (nominal.StabilisationAltitudeM - nominal.Threshold.Y)
                / Math.Tan(nominal.GlideslopeRad));
        ApproachPathSolution cap = ApproachPath.Solve(new ApproachPathInput(
            nominal.Position,
            nominal.CurrentHeadingRad,
            nominal.Threshold - new Vec3D(0.0, 0.0, entry),
            nominal.LandingHeadingRad,
            double.MaxValue,
            nominal.TurnRadiusM));
        double required = cap.TotalTrackM - 1.0;
        var s = ApproachSolver.Solve(nominal with {
            Position = nominal.Position with {
                Y = nominal.StabilisationAltitudeM + required * nominal.DragToWeight,
            },
        });

        Assert.True(s.Path.Saturated);
        Assert.True(s.TrackAvailableM >= s.TrackRequiredM);
        Assert.False(s.Valid);
        Assert.Empty(s.Gates);
    }

    [Fact]
    public void InsideGrooveEntryPublishesGlideslopeGates() {
        var s = ApproachSolver.Solve(Input(altitudeM: 80.0, tasMps: 90.0, rangeM: -800.0)
            with { CurrentHeadingRad = 0.0 });
        Assert.True(s.Valid);
        Assert.True(s.InGroove);
        Assert.NotEmpty(s.Gates);
        Assert.Equal("THRESHOLD", s.Gates[^1].Label);
        Assert.True(s.Gates[^1].DirtyConfig);
    }

    [Theory]
    [InlineData(800.0, 0.0, 0.0)]
    [InlineData(0.0, -800.0, 3.141592653589793)]
    [InlineData(0.0, 800.0, 0.0)]
    public void NearbyAircraftMustBeEstablishedOnFinalBeforeEnteringGroove(
        double eastM, double northM, double headingRad) {
        var s = ApproachSolver.Solve(Input(80.0, 90.0, 800.0) with {
            Position = new Vec3D(eastM, 80.0, northM),
            CurrentHeadingRad = headingRad,
        });
        Assert.True(s.Valid);
        Assert.False(s.InGroove);
        Assert.Equal("STABILISE", s.Gates[^1].Label);
    }

    [Fact]
    public void GrooveGatesAnchorToTheRunwayCentrelineNotTheAircraft() {
        // 120 m right of centreline, 2 km out on final: established, but the ladder must sit on
        // the extended centreline so the lateral error reads as offset, not follow the aircraft.
        var s = ApproachSolver.Solve(Input(120.0, 90.0, 800.0) with {
            Position = new Vec3D(120.0, 120.0, -2_000.0),
            CurrentHeadingRad = 0.0,
        });
        Assert.True(s.Valid);
        Assert.True(s.InGroove);
        Assert.NotEmpty(s.Gates);
        foreach (ApproachGate gate in s.Gates)
            Assert.Equal(0.0, gate.Position.X, precision: 6);
        Assert.Equal(0.0, s.Gates[^1].Position.Z, precision: 6);
        Assert.Equal(0.0, s.Gates[^1].DistanceToGoM, precision: 6);
    }

    [Fact]
    public void AnAircraftWellOffCentrelineIsNotEstablishedInTheGroove() {
        var s = ApproachSolver.Solve(Input(120.0, 90.0, 800.0) with {
            Position = new Vec3D(200.0, 120.0, -2_000.0),
            CurrentHeadingRad = 0.0,
        });
        Assert.True(s.Valid);
        Assert.False(s.InGroove);
        Assert.Equal("STABILISE", s.Gates[^1].Label);
    }

    [Fact]
    public void RecoveryProfileAndGrooveMeetAtTheSameAltitude() {
        ApproachSolverInput nominal = Input(152.0, 90.0, 3_000.0);
        double entry = Math.Max(
            nominal.GrooveEntryTrackM,
            (nominal.StabilisationAltitudeM - nominal.Threshold.Y)
                / Math.Tan(nominal.GlideslopeRad));
        var outside = ApproachSolver.Solve(nominal with {
            Position = new Vec3D(0.0, 152.0, -entry - 0.1),
            CurrentHeadingRad = 0.0,
        });
        var inside = ApproachSolver.Solve(nominal with {
            Position = new Vec3D(0.0, 152.0, -entry + 0.1),
            CurrentHeadingRad = 0.0,
        });

        Assert.False(outside.InGroove);
        Assert.True(inside.InGroove);
        Assert.Equal(
            outside.Gates[^1].TargetAltitudeM,
            inside.ProfileAltitudeM,
            precision: 1);
    }

    [Fact]
    public void CommandedPowerIsTwoSided() {
        double high = ApproachSolver.CommandedPower01(2_000.0, 200.0, 152.0, 90.0);
        double low = ApproachSolver.CommandedPower01(50.0, 70.0, 152.0, 90.0);
        Assert.True(high < 0.5, "high/fast must ask for less power");
        Assert.True(low > 0.5, "low/slow must ask for more power");
    }
}
