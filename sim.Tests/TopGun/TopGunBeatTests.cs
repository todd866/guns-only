using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests.TopGun;

public sealed class TopGunBeatTests
{
    [Fact]
    public void DefaultSeatIsTomcatVersusMig28()
    {
        var beat = Beats.TopGunAcm(TopGunSeat.F14A);
        Assert.Equal(AircraftCapability.F14ASurrogate.Id, beat.PlayerAircraft.Id);
        Assert.Equal(AircraftCapability.Mig28Surrogate.Id, beat.BanditAircraft.Id);
        Assert.True(beat.PlayerAircraft.SystemsSimulated);
        Assert.Contains("conventional-gear", beat.PlayerAircraft.SystemsProfileId);
        Assert.False(beat.BanditAircraft.SystemsSimulated);
        Assert.Equal(480, beat.CombatRules.PlayerAmmo);
        Assert.Equal(480, beat.CombatRules.OpponentAmmo);
    }

    [Fact]
    public void AggressorSeatSwapsOwnshipAndBandit()
    {
        var beat = Beats.TopGunAcm(TopGunSeat.Mig28);
        Assert.Equal(AircraftCapability.Mig28Surrogate.Id, beat.PlayerAircraft.Id);
        Assert.Equal(AircraftCapability.F14ASurrogate.Id, beat.BanditAircraft.Id);
        Assert.True(beat.PlayerAircraft.SystemsSimulated);
        Assert.Contains("conventional-gear", beat.PlayerAircraft.SystemsProfileId);
        Assert.False(beat.BanditAircraft.SystemsSimulated);
    }
}
