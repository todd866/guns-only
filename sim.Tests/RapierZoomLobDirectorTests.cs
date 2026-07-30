using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests;

public class RapierZoomLobDirectorTests {
    static AircraftState StateAt(
        double altitudeM, double speedMps, double gamma = 0.0) =>
        new(new Vec3D(0.0, altitudeM, 0.0), speedMps, gamma, 0.0, 0.0,
            FlightModel.RapierPublicDataSurrogate.MassKg);

    static RapierMissionGuidance Step(
        RapierMissionDirector director,
        double altitudeM,
        double mach,
        double gamma,
        double noseErrDeg,
        double contactRangeM = 200_000.0,
        double fuelLb = 2_400.0,
        double reserveFuelLb = 1_200.0,
        bool zoomLobProfile = true) {
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(altitudeM);
        double speed = mach * air.SpeedOfSoundMps;
        AircraftState player = StateAt(altitudeM, speed, gamma);
        AircraftState contact = StateAt(altitudeM, 200.0);
        contact = contact with { Position = new Vec3D(0.0, altitudeM, contactRangeM) };
        return director.Step(
            player, contact, speed, StandardAtmosphere1976.Instance,
            FlightModel.RapierPublicDataSurrogate,
            catapultActive: false,
            liveOpponentCount: 1,
            pursuitActive: false,
            pursuerCount: 0,
            pursuitRangeM: 0.0,
            home: new Vec3D(0.0, 120.0, -50_000.0),
            recoveryInitial: new Vec3D(0.0, 1_120.0, -16_000.0),
            recovered: false,
            patternOnly: false,
            zoomLobProfile: zoomLobProfile,
            job: RapierJobKind.Awacs,
            noseOnVelocityErrorDeg: noseErrDeg,
            fuelLb: fuelLb,
            reserveFuelLb: reserveFuelLb);
    }

    static RapierMissionGuidance WalkToDipRelight(
        RapierMissionDirector director, bool zoomLobProfile = true) {
        RapierMissionGuidance g = default;
        for (int i = 0; i < 4; i++) {
            g = Step(director, altitudeM: 21_500.0, mach: 3.5, gamma: 0.05,
                noseErrDeg: 5.0, zoomLobProfile: zoomLobProfile);
        }
        Assert.Equal(RapierMissionPhase.ZoomPull, g.Phase);
        Assert.Equal(zoomLobProfile ? 1 : 0, g.LobSkip);
        g = Step(director, altitudeM: 30_000.0, mach: 3.2,
            gamma: 40.0 * Math.PI / 180.0, noseErrDeg: 8.0,
            zoomLobProfile: zoomLobProfile);
        Assert.Equal(RapierMissionPhase.ZoomCoast, g.Phase);
        g = Step(director, altitudeM: 32_000.0, mach: 2.8,
            gamma: -5.0 * Math.PI / 180.0, noseErrDeg: 20.0,
            zoomLobProfile: zoomLobProfile);
        Assert.Equal(RapierMissionPhase.ReenterAlign, g.Phase);
        g = Step(director, altitudeM: 22_000.0, mach: 2.5,
            gamma: -8.0 * Math.PI / 180.0, noseErrDeg: 6.0,
            zoomLobProfile: zoomLobProfile);
        Assert.Equal(RapierMissionPhase.DipRelight, g.Phase);
        return g;
    }

    [Fact]
    public void ZoomLobEntersPullAfterRamShelf() {
        var director = new RapierMissionDirector();
        RapierMissionGuidance g = default;
        for (int i = 0; i < 6; i++) {
            g = Step(director, altitudeM: 21_500.0, mach: 3.5, gamma: 0.05,
                noseErrDeg: 5.0);
        }
        Assert.Equal(RapierMissionPhase.ZoomPull, g.Phase);
        Assert.Contains("ZOOM PULL", g.Cue);
        Assert.Contains("SKIP 1/3", g.Cue);
        Assert.Equal("AWACS", g.JobToken);
        Assert.Equal(1, g.LobSkip);
        Assert.Equal(3, g.LobSkipMax);
    }

    [Fact]
    public void ZoomLobCoastsWhenPathIsSteep() {
        var director = new RapierMissionDirector();
        RapierMissionGuidance g = default;
        for (int i = 0; i < 4; i++) {
            g = Step(director, altitudeM: 21_500.0, mach: 3.5, gamma: 0.05,
                noseErrDeg: 5.0);
        }
        g = Step(director, altitudeM: 30_000.0, mach: 3.2,
            gamma: 40.0 * Math.PI / 180.0, noseErrDeg: 8.0);
        Assert.Equal(RapierMissionPhase.ZoomCoast, g.Phase);
        Assert.Equal(0.0, g.Command.Throttle, 6);
        Assert.Contains("NOSE→V", g.Cue);
        Assert.Contains("SKIP 1/3", g.Cue);
    }

    [Fact]
    public void DipRelightOpensAnotherSkipWhenContactIsStillFar() {
        var director = new RapierMissionDirector();
        WalkToDipRelight(director);
        RapierMissionGuidance g = Step(director, altitudeM: 21_336.0, mach: 2.5,
            gamma: 0.02, noseErrDeg: 4.0, contactRangeM: 180_000.0, fuelLb: 2_200.0);
        Assert.Equal(RapierMissionPhase.ZoomPull, g.Phase);
        Assert.Equal(2, g.LobSkip);
        Assert.Contains("SKIP 2/3", g.Cue);
        Assert.Equal("zoom_pull_skip_2", g.PhaseReason);
    }

    [Fact]
    public void DipRelightGoesInterceptWhenContactIsClose() {
        var director = new RapierMissionDirector();
        WalkToDipRelight(director);
        RapierMissionGuidance g = Step(director, altitudeM: 21_336.0, mach: 2.5,
            gamma: 0.02, noseErrDeg: 4.0, contactRangeM: 60_000.0, fuelLb: 2_200.0);
        Assert.Equal(RapierMissionPhase.Intercept, g.Phase);
        Assert.Equal("post_lob_intercept", g.PhaseReason);
    }

    [Fact]
    public void DipRelightGoesInterceptWhenFuelIsAtReserve() {
        var director = new RapierMissionDirector();
        WalkToDipRelight(director);
        RapierMissionGuidance g = Step(director, altitudeM: 21_336.0, mach: 2.5,
            gamma: 0.02, noseErrDeg: 4.0, contactRangeM: 180_000.0,
            fuelLb: 1_200.0, reserveFuelLb: 1_200.0);
        Assert.Equal(RapierMissionPhase.Intercept, g.Phase);
    }

    [Fact]
    public void ScoredZoomLobWithoutProfileIsSingleSkipOnly() {
        var director = new RapierMissionDirector();
        WalkToDipRelight(director, zoomLobProfile: false);
        RapierMissionGuidance g = Step(director, altitudeM: 21_336.0, mach: 2.5,
            gamma: 0.02, noseErrDeg: 4.0, contactRangeM: 180_000.0, fuelLb: 2_200.0,
            zoomLobProfile: false);
        Assert.Equal(RapierMissionPhase.Intercept, g.Phase);
        Assert.Equal("post_lob_intercept", g.PhaseReason);
        Assert.Equal(0, g.LobSkip);
        Assert.Equal(0, g.LobSkipMax);
    }

    [Fact]
    public void GoFlyDealIsDeterministicForSeed() {
        BeatSetup a = Beats.RapierGoFly(jobSeed: 7);
        BeatSetup b = Beats.RapierGoFly(jobSeed: 7);
        Assert.Equal(a.ScriptedIntercept!.Job, b.ScriptedIntercept!.Job);
        Assert.True(a.ScriptedIntercept.ZoomLobProfile);
        Assert.StartsWith("Rapier intercept", a.Name);
    }

    [Fact]
    public void TransportAttackCueIsDivePass() {
        var director = new RapierMissionDirector();
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(8_000.0);
        double speed = 2.2 * air.SpeedOfSoundMps;
        AircraftState player = StateAt(8_000.0, speed, -0.1);
        AircraftState contact = StateAt(2_200.0, 145.0);
        contact = contact with { Position = new Vec3D(0.0, 2_200.0, 20_000.0) };
        RapierMissionGuidance g = default;
        for (int i = 0; i < 6; i++) {
            g = director.Step(
                player, contact, speed, StandardAtmosphere1976.Instance,
                FlightModel.RapierPublicDataSurrogate,
                catapultActive: false, liveOpponentCount: 1,
                pursuitActive: false, pursuerCount: 0, pursuitRangeM: 0.0,
                home: new Vec3D(0.0, 120.0, -50_000.0),
                recoveryInitial: new Vec3D(0.0, 1_120.0, -16_000.0),
                recovered: false, patternOnly: false,
                zoomLobProfile: false,
                job: RapierJobKind.Transport, noseOnVelocityErrorDeg: 4.0);
        }
        Assert.Equal(RapierMissionPhase.Attack, g.Phase);
        Assert.Contains("TRANSPORT DIVE", g.Cue);
    }
}
