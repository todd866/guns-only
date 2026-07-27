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
        double noseErrDeg) {
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(altitudeM);
        double speed = mach * air.SpeedOfSoundMps;
        AircraftState player = StateAt(altitudeM, speed, gamma);
        AircraftState contact = StateAt(altitudeM, 200.0);
        contact = contact with { Position = new Vec3D(0.0, altitudeM, 200_000.0) };
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
            zoomLobProfile: true,
            job: RapierJobKind.Awacs,
            noseOnVelocityErrorDeg: noseErrDeg);
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
        Assert.Equal("AWACS", g.JobToken);
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
    }

    [Fact]
    public void GoFlyDealIsDeterministicForSeed() {
        BeatSetup a = Beats.RapierGoFly(jobSeed: 7);
        BeatSetup b = Beats.RapierGoFly(jobSeed: 7);
        Assert.Equal(a.ScriptedIntercept!.Job, b.ScriptedIntercept!.Job);
        Assert.True(a.ScriptedIntercept.ZoomLobProfile);
        Assert.StartsWith("Go fly the Rapier", a.Name);
    }
}
