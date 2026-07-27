using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Unit contract for RapierMissionDirector guidance fields that agents and the HUD rely on:
/// commanded Mach vs skin limit, and why the current phase was entered.
/// </summary>
public class RapierMissionDirectorTests {
    static AircraftState StateAt(
        double altitudeM, double speedMps, double chi = 0.0, double gamma = 0.0) =>
        new(new Vec3D(0.0, altitudeM, 0.0), speedMps, gamma, chi, 0.0,
            FlightModel.RapierPublicDataSurrogate.MassKg);

    static AircraftParams SteelLimitedRapier =>
        FlightModel.RapierPublicDataSurrogate with {
            // Historical 320 C steel skin — clamps authored M4 dash to ~M3.14 at FL700.
            SkinTemperatureLimitK = 273.15 + 320.0
        };

    static RapierMissionGuidance StepDash(
        RapierMissionDirector director,
        AircraftParams airframe,
        double altitudeM,
        double mach,
        double contactRangeM) {
        AtmosphericState air = StandardAtmosphere1976.Instance.Sample(altitudeM);
        double speed = mach * air.SpeedOfSoundMps;
        AircraftState player = StateAt(altitudeM, speed);
        AircraftState contact = StateAt(altitudeM, 200.0);
        contact = contact with {
            Position = new Vec3D(0.0, altitudeM, contactRangeM)
        };
        return director.Step(
            player,
            contact,
            speed,
            StandardAtmosphere1976.Instance,
            airframe,
            catapultActive: false,
            liveOpponentCount: 4,
            pursuitActive: false,
            pursuerCount: 0,
            pursuitRangeM: 0.0,
            home: new Vec3D(0.0, 120.0, -50_000.0),
            recoveryInitial: new Vec3D(0.0, 1_120.0, -16_000.0),
            recovered: false,
            patternOnly: false);
    }

    [Fact]
    public void InterceptGuidanceExposesCommandedMachClampedToSkinAndPhaseReason() {
        var director = new RapierMissionDirector();
        // Advance through Launch→… by presenting ladder-complete state repeatedly.
        RapierMissionGuidance guidance = default;
        for (int i = 0; i < 8; i++) {
            guidance = StepDash(director, SteelLimitedRapier,
                altitudeM: 70_000.0 * 0.3048, mach: 3.0, contactRangeM: 80_000.0);
        }

        Assert.Equal(RapierMissionPhase.Intercept, guidance.Phase);
        Assert.Equal(4.0, guidance.AuthoredTargetMach, 3);
        Assert.True(guidance.SkinMachLimit < 3.3 && guidance.SkinMachLimit > 2.9,
            $"expected ~M3.14 steel limit, got {guidance.SkinMachLimit:F2}");
        Assert.Equal(guidance.CommandedMach, guidance.TargetMach, 6);
        Assert.True(guidance.CommandedMach <= guidance.SkinMachLimit + 1e-9);
        Assert.True(guidance.CommandedMach < guidance.AuthoredTargetMach);
        Assert.Equal("intercept_dash", guidance.PhaseReason);
    }

    [Fact]
    public void AttackEntryRecordsContactRangeReason() {
        var director = new RapierMissionDirector();
        RapierMissionGuidance guidance = default;
        for (int i = 0; i < 4; i++) {
            guidance = StepDash(director, FlightModel.RapierPublicDataSurrogate,
                altitudeM: 12_000.0, mach: 1.2, contactRangeM: 20_000.0);
        }

        Assert.Equal(RapierMissionPhase.Attack, guidance.Phase);
        Assert.Equal("contact_leq_30km", guidance.PhaseReason);
    }

    [Fact]
    public void PatternOnlyClimbRecordsShelfReason() {
        var director = new RapierMissionDirector();
        AircraftState player = StateAt(500.0, 120.0);
        AircraftState contact = StateAt(24_000.0, 200.0);
        contact = contact with { Position = new Vec3D(0.0, 24_000.0, -400_000.0) };
        Vec3D home = new(0.0, 120.0, 0.0);
        Vec3D recoveryInitial = new(0.0, 1_120.0, -16_000.0);

        RapierMissionGuidance guidance = director.Step(
            player, contact, 120.0, StandardAtmosphere1976.Instance,
            FlightModel.RapierPublicDataSurrogate,
            catapultActive: false, liveOpponentCount: 0, pursuitActive: false,
            pursuerCount: 0, pursuitRangeM: 0.0, home, recoveryInitial,
            recovered: false, patternOnly: true);

        Assert.Equal(RapierMissionPhase.Climb, guidance.Phase);
        Assert.Equal("pattern_climb_to_shelf", guidance.PhaseReason);
    }

    [Fact]
    public void PatternOnlyClimbCommandsPatternBandNotMachDash() {
        var director = new RapierMissionDirector();
        AircraftState player = StateAt(280.0, 130.0);
        AircraftState contact = StateAt(24_000.0, 200.0);
        contact = contact with { Position = new Vec3D(0.0, 24_000.0, -400_000.0) };
        Vec3D home = new(0.0, 120.0, 0.0);
        Vec3D recoveryInitial = new(0.0, 1_120.0, -16_000.0);

        RapierMissionGuidance guidance = director.Step(
            player, contact, 130.0, StandardAtmosphere1976.Instance,
            FlightModel.RapierPublicDataSurrogate,
            catapultActive: false, liveOpponentCount: 0, pursuitActive: false,
            pursuerCount: 0, pursuitRangeM: 0.0, home, recoveryInitial,
            recovered: false, patternOnly: true);

        Assert.Equal(RapierMissionPhase.Climb, guidance.Phase);
        Assert.Equal("DEPART", guidance.CircuitLeg);
        Assert.True(guidance.FdTargetKtas > 250.0 && guidance.FdTargetKtas < 320.0,
            $"DEPART must command ~300 KT pattern band, got {guidance.FdTargetKtas:F0} KT");
        Assert.True(guidance.AuthoredTargetMach < 0.52,
            $"DEPART must stay subsonic pattern energy, got M{guidance.AuthoredTargetMach:F2}");
        Assert.True(guidance.CommandedMach < 0.52,
            $"DEPART must not chase Mach dash, got M{guidance.CommandedMach:F2}");
        Assert.Contains("HOOK DOWN", guidance.Cue);
        Assert.Contains("GEAR UP", guidance.Cue);
        Assert.Contains("300 KT", guidance.Cue);
        // Flythrough box aims at INITIAL, not the strip centre / FL560 phantom.
        Assert.True(guidance.Waypoint.Y > home.Y + 400.0,
            "DEPART box must sit near pattern shelf height");
        Assert.True(Math.Abs(guidance.Waypoint.Z) > 500.0
            || Math.Abs(guidance.Waypoint.X) > 500.0,
            "DEPART box must be offset toward INITIAL, not home origin");
    }

    [Fact]
    public void PatternOnlyRecoveryPublishesInitialLegAtPatternAltitude() {
        var director = new RapierMissionDirector();
        Vec3D home = new(0.0, 120.0, 0.0);
        Vec3D recoveryInitial = new(0.0, 1_120.0, -16_000.0);
        // Above the 550 m Circuits shelf, still inbound to INITIAL (not yet captured).
        AircraftState player = StateAt(home.Y + 600.0, 154.0, chi: 0.0);
        player = player with { Position = new Vec3D(0.0, home.Y + 600.0, -8_000.0) };
        AircraftState contact = StateAt(24_000.0, 200.0);
        contact = contact with { Position = new Vec3D(0.0, 24_000.0, -400_000.0) };

        RapierMissionGuidance guidance = default;
        for (int i = 0; i < 4; i++) {
            guidance = director.Step(
                player, contact, 154.0, StandardAtmosphere1976.Instance,
                FlightModel.RapierPublicDataSurrogate,
                catapultActive: false, liveOpponentCount: 0, pursuitActive: false,
                pursuerCount: 0, pursuitRangeM: 0.0, home, recoveryInitial,
                recovered: false, patternOnly: true);
        }

        Assert.Equal(RapierMissionPhase.Recovery, guidance.Phase);
        Assert.Equal("INITIAL", guidance.CircuitLeg);
        Assert.True(guidance.FdTargetKtas > 250.0 && guidance.FdTargetKtas < 320.0,
            $"expected ~300 KT pattern speed, got {guidance.FdTargetKtas:F0}");
        Assert.Contains("INITIAL", guidance.Cue);
        Assert.Contains("HOOK DOWN", guidance.Cue);
        Assert.Contains("GEAR UP", guidance.Cue);
    }

    [Fact]
    public void PatternOnlyLaunchStaysInPatternBand() {
        var director = new RapierMissionDirector();
        AircraftState player = StateAt(130.0, 90.0);
        AircraftState contact = StateAt(24_000.0, 200.0);
        contact = contact with { Position = new Vec3D(0.0, 24_000.0, -400_000.0) };
        Vec3D home = new(0.0, 120.0, 0.0);
        Vec3D recoveryInitial = new(0.0, 1_120.0, -16_000.0);

        RapierMissionGuidance guidance = director.Step(
            player, contact, 90.0, StandardAtmosphere1976.Instance,
            FlightModel.RapierPublicDataSurrogate,
            catapultActive: true, liveOpponentCount: 0, pursuitActive: false,
            pursuerCount: 0, pursuitRangeM: 0.0, home, recoveryInitial,
            recovered: false, patternOnly: true);

        Assert.Equal(RapierMissionPhase.Launch, guidance.Phase);
        Assert.Equal("DEPART", guidance.CircuitLeg);
        Assert.True(guidance.AuthoredTargetMach < 0.52,
            $"pattern launch must not author M0.9 dash, got M{guidance.AuthoredTargetMach:F2}");
        Assert.True(guidance.FdTargetKtas > 250.0 && guidance.FdTargetKtas < 320.0,
            $"pattern launch FD must be ~300 KT, got {guidance.FdTargetKtas:F0}");
    }

}
