using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using Xunit;

public class RapierEasternBasingTests {
    [Fact]
    public void RapierIntercept_LaunchesWest_FromEasternHomePlate() {
        BeatSetup beat = Beats.RapierIntercept();
        Carrier strip = Assert.IsType<Carrier>(beat.Carrier);
        Assert.Equal(-Math.PI / 2, strip.HeadingRad, precision: 10);
        Assert.True(strip.Fwd.X < -0.99);
        Assert.True(Math.Abs(strip.Fwd.Z) < 1e-9);

        Assert.True(beat.Bandit.Position.X < -600_000);
        Assert.True(beat.Bandit.Position.X < strip.Position.X);
        Assert.Equal(Math.PI / 2, beat.Bandit.Chi, precision: 10);
    }

    [Fact]
    public void RapierCircuits_KeepsSameWestStrip_ParksContactOffMerge() {
        BeatSetup circuits = Beats.RapierCircuits();
        BeatSetup intercept = Beats.RapierIntercept();
        Assert.Equal(intercept.Carrier!.HeadingRad, circuits.Carrier!.HeadingRad, precision: 10);
        Assert.True(circuits.Bandit.Position.X < -100_000);
        Assert.Equal(0, circuits.ScriptedIntercept!.FormationSize);
    }
}
