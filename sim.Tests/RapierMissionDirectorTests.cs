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
}
