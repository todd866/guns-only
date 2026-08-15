using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Recovery;

namespace GunsOnly.Sim.Tests.Recovery;

public sealed class ConventionalCarrierRecoveryTests {
    [Fact]
    public void ScheduleIsTheAuthoredCaseIPatternRelativeToTheMovingDeck() {
        Carrier carrier = Beats.TopGunAcm(TopGunSeat.F14A).Carrier!;
        var gates = ConventionalCarrierRecoveryDirector.BuildSchedule(carrier, 78.0);

        Assert.Equal(8, gates.Count);
        Assert.Equal("INITIAL · 3 NM", gates[0].Label);
        Assert.Equal("WIRES · NO FLARE", gates[^1].Label);
        Assert.Equal(800.0, (gates[0].Position.Y - carrier.DeckAltM) / 0.3048,
            precision: 6);
        Assert.Equal(600.0, (gates[3].Position.Y - carrier.DeckAltM) / 0.3048,
            precision: 6);
        Assert.Equal(280.0, (gates[6].Position.Y - carrier.DeckAltM) / 0.3048,
            precision: 6);
        Assert.All(gates.Take(2), gate => Assert.False(gate.Dirty));
        Assert.All(gates.Skip(2), gate => Assert.True(gate.Dirty));

        Vec3D initialRelative = gates[0].Position - carrier.Position;
        Assert.Equal(-3.0 * 1852.0, initialRelative.Dot(carrier.Fwd), precision: 6);
        Assert.Equal(150.0, initialRelative.Dot(carrier.Right), precision: 6);
        var grooveFrame = carrier.LandingAircraftSupportFrame(gates[6].Position);
        Assert.Equal(0.0, grooveFrame.cross, precision: 6);
        Assert.Equal(-0.75 * 1852.0, grooveFrame.along, precision: 6);
    }

    [Fact]
    public void EntirePatternTranslatesWithTheSteamingCarrier() {
        Carrier carrier = Beats.TopGunAcm(TopGunSeat.F14A).Carrier!;
        var before = ConventionalCarrierRecoveryDirector.BuildSchedule(carrier, 78.0);

        carrier.Step(10.0);
        var after = ConventionalCarrierRecoveryDirector.BuildSchedule(carrier, 78.0);

        Vec3D expectedTranslation = carrier.Fwd * (carrier.SpeedMps * 10.0);
        for (int i = 0; i < before.Count; i++)
            Assert.Equal(expectedTranslation, after[i].Position - before[i].Position);
    }

    [Fact]
    public void CapturingInitialAdvancesToBreakInsteadOfInventingAnEnergyExtension() {
        BeatSetup beat = Beats.TopGunAcm(TopGunSeat.F14A);
        Carrier carrier = beat.Carrier!;
        const double approachMps = 78.0;
        var director = new ConventionalCarrierRecoveryDirector();
        var initial = ConventionalCarrierRecoveryDirector.BuildSchedule(
            carrier, approachMps)[0];
        AircraftState player = beat.Player with { Position = initial.Position };

        ApproachGuidanceState state = director.Step(
            true, carrier, player, initial.TargetSpeedMps, approachMps);

        Assert.Equal(1, director.ActiveIndex);
        Assert.Equal("BREAK LEFT", state.NextLabel);
        Assert.Equal(ApproachExtensionKind.None, state.Extension);
        Assert.False(director.DirtyRequested);
    }
}
