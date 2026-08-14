using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests.TopGun;

public sealed class F14ControlTests
{
    const double Dt = 1.0 / AircraftSim.TickHz;

    static AircraftState FastLevel(AircraftParams parameters, double speedMps = 300.0) =>
        new(new Vec3D(0.0, 3_000.0, 0.0), speedMps,
            0.0, 0.0, 0.0, parameters.MassKg);

    static DoctrineAdvice Advice => new(3.2, 0.0, "F-14 control contract");

    [Fact]
    public void ArrowDownImmediatelyCommandsProtectedSevenPointFiveGWithoutOverride()
    {
        AircraftParams parameters = FlightModel.F14APublicDataSurrogate;
        AircraftState state = FastLevel(parameters);
        var detents = new DetentLayer { AirspeedMps = state.Speed };
        var keys = new KeyGrammar();
        keys.Feed(GKey.PullUp, true, 0.0);

        detents.Tick(keys, 0.0, state, parameters, Advice, Dt);

        Assert.Equal(DemandTier.MaxPerform, detents.Tier);
        Assert.Equal(7.5, Protection.MaxPerformG(state, parameters), 10);
        Assert.Equal(7.5, detents.Command.GDemand, 10);
        Assert.False(detents.Command.EnvelopeOverride);
    }

    [Fact]
    public void SpaceAndArrowDownImmediatelyCommandTheElevenGOverrideCeiling()
    {
        AircraftParams parameters = FlightModel.F14APublicDataSurrogate;
        AircraftState state = FastLevel(parameters);
        var detents = new DetentLayer { AirspeedMps = state.Speed };
        var keys = new KeyGrammar();
        keys.Feed(GKey.PullUp, true, 0.0);
        keys.Feed(GKey.Override, true, 0.0);

        detents.Tick(keys, 0.0, state, parameters, Advice, Dt);

        Assert.Equal(DemandTier.OverDemand, detents.Tier);
        Assert.Equal(11.0, Protection.OverrideMaxG(state, parameters), 10);
        Assert.Equal(11.0, detents.Command.GDemand, 10);
        Assert.True(detents.Command.EnvelopeOverride);
    }

    [Fact]
    public void AchievedGTimeSeriesCannotRepeatThirteenPointEightGOvershootAfterOverrideRelease()
    {
        AircraftParams parameters = FlightModel.F14APublicDataSurrogate;
        const double alphaRad = 16.0 * Math.PI / 180.0;
        var pitchUp = new QuaternionD(Math.Cos(alphaRad / 2.0),
            -Math.Sin(alphaRad / 2.0), 0.0, 0.0);
        AircraftState trimmed = new AircraftSim(FastLevel(parameters), parameters).State;
        AircraftState highAlpha = trimmed with {
            BodyAttitude = (pitchUp * trimmed.BodyAttitude).Normalized()
        };
        var sim = new AircraftSim(highAlpha, parameters);
        var overridePull = new PilotCommand(11.0, 0.0, 1.0, 0.0,
            EnvelopeOverride: true);
        var releasedPull = new PilotCommand(5.5, 0.0, 1.0, 0.0);
        var achievedG = new List<double>();

        for (int tick = 0; tick < 90; tick++) {
            sim.Step(overridePull, Dt);
            achievedG.Add(sim.LastNz);
        }
        int releaseIndex = achievedG.Count;
        for (int tick = 0; tick < 180; tick++) {
            sim.Step(releasedPull, Dt);
            achievedG.Add(sim.LastNz);
        }

        Assert.True(achievedG.Take(releaseIndex).Max() >= 10.8,
            "fixture never exercised the emergency-load ceiling");
        Assert.All(achievedG, actual => Assert.True(actual <= 11.0 + 1e-9,
            $"published actual load escaped the 11 G airframe guard: {actual:F6} G"));
        Assert.True(achievedG.Skip(releaseIndex).Max() <= 11.0 + 1e-9,
            "stored alpha/load response overshot after Space was released");
    }

    [Fact]
    public void OverGAccumulatesStructuralConsequenceWithoutEncodingPilotBlackout()
    {
        var runtime = new TopGunFightRuntime();

        Assert.False(runtime.ObserveF14Load(8.0, 0.10));
        Assert.True(runtime.F14OverLimit);
        Assert.True(runtime.F14StructuralFatigue01 > 0.0);
        Assert.False(runtime.F14StructuralFailed);

        bool failed = false;
        for (int tick = 0; tick < 2 * AircraftSim.TickHz; tick++)
            failed |= runtime.ObserveF14Load(11.0, Dt);

        Assert.False(failed);
        Assert.False(runtime.F14StructuralFailed);
        Assert.InRange(runtime.F14StructuralFatigue01, 0.24, 0.27);

        for (int tick = 0; tick < 8 * AircraftSim.TickHz && !failed; tick++)
            failed = runtime.ObserveF14Load(11.0, Dt);

        Assert.True(failed);
        Assert.True(runtime.F14StructuralFailed);
        Assert.Equal(1.0, runtime.F14StructuralFatigue01, 10);
    }

    [Fact]
    public void F22RetainsSharedFilteredDetentAndUnboundedLegacyForcePath()
    {
        AircraftParams parameters = FlightModel.F22APublicDataSurrogate;
        AircraftState state = FastLevel(parameters);
        var detents = new DetentLayer { AirspeedMps = state.Speed };
        var keys = new KeyGrammar();
        keys.Feed(GKey.PullUp, true, 0.0);
        double target = Protection.MaxPerformG(state, parameters);

        detents.Tick(keys, 0.0, state, parameters, Advice, Dt);

        double expectedFirstTick = 1.0 + (target - 1.0) * (Dt / 0.07);
        Assert.Equal(expectedFirstTick, detents.Command.GDemand, 10);
        Assert.True(detents.Command.GDemand < target);
        Assert.False(parameters.InstantMaxPerformanceKeyboardPull);
        Assert.Equal(double.PositiveInfinity, parameters.AbsolutePositiveLoadFactorG);
    }

    [Fact]
    public void F22AchievedLiftIsNotClampedByTheTomcatSpecificElevenGGuard()
    {
        AircraftParams parameters = FlightModel.F22APublicDataSurrogate;
        const double alphaRad = 16.0 * Math.PI / 180.0;
        AircraftState trimmed = new AircraftSim(FastLevel(parameters), parameters).State;
        var pitchUp = new QuaternionD(Math.Cos(alphaRad / 2.0),
            -Math.Sin(alphaRad / 2.0), 0.0, 0.0);
        AircraftState highAlpha = trimmed with {
            BodyAttitude = (pitchUp * trimmed.BodyAttitude).Normalized()
        };
        var raw = new RawState(highAlpha.Position, highAlpha.VelocityVector(),
            highAlpha.Bank, highAlpha.Mass, highAlpha.BodyAttitude, highAlpha.BodyRates);
        AeroResult aero = FlightModel.Aerodynamics(raw,
            new PilotCommand(11.0, 0.0, 1.0, 0.0, EnvelopeOverride: true),
            parameters, Vec3D.Zero, netThrustN: 0.0,
            AirframeAerodynamicState.Clean);

        Assert.True(aero.Nz > 11.0,
            $"Tomcat-specific force guard leaked into the F-22 profile: {aero.Nz:F3} G");
    }

    [Fact]
    public void TomcatAndF22MissionsUseTheSameSharedPhysiologyProfile()
    {
        var tomcat = new SimulationSession();
        tomcat.StartBeat(() => Beats.TopGunAcm(TopGunSeat.F14A));
        var f22 = new SimulationSession(7);

        Assert.Equal(PilotPhysiologyProfile.ModernFastJetReference.Id,
            tomcat.PilotPhysiology.Profile.Id);
        Assert.Equal(f22.PilotPhysiology.Profile.Id,
            tomcat.PilotPhysiology.Profile.Id);
        Assert.Equal(0, tomcat.PilotGLocCount);
        Assert.False(tomcat.PilotControlInterlocked);
    }
}
