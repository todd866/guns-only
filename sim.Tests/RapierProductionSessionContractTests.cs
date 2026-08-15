using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Pins the production Card 12 configuration at the point where catalogue data becomes live
/// simulation machinery. These are wiring tests: the longer trajectory test owns the sortie.
/// </summary>
public sealed class RapierProductionSessionContractTests {
    [Fact]
    public void ProductionSessionInstantiatesTheDeclaredFiniteM61Magazine() {
        var session = new SimulationSession(beatIndex: 12);

        Assert.Equal(360, session.Beat.CombatRules.PlayerAmmo);
        Assert.Equal(session.Beat.CombatRules.PlayerAmmo,
            session.PlayerGun.AmmoRemaining);
        Assert.False(session.PlayerGun.HasInfiniteAmmo);
        Assert.Null(session.PlayerGun.HeatConfig);
        Assert.Same(GunProfiles.M61A2PublicDataSurrogate, session.PlayerGun.Profile);
    }

    [Fact]
    public void ProductionSessionPublishesExactPostInletTbccComponents() {
        var session = new SimulationSession(beatIndex: 12);
        session.Begin();
        session.StepFixed();

        Assert.Equal(session.Player.LastEngineOperatingPoint.TurbineThrustN,
            session.RapierTurbineThrustN, precision: 9);
        Assert.Equal(session.Player.LastEngineOperatingPoint.RamjetThrustN,
            session.RapierRamjetThrustN, precision: 9);
        Assert.Equal(session.Player.LastEngineOperatingPoint.NetThrustN,
            session.RapierTurbineThrustN + session.RapierRamjetThrustN,
            precision: 9);
    }

    [Fact]
    public void ProductionSessionPublishesTheDirectorsExactFlightPathTarget() {
        var session = new SimulationSession(beatIndex: 12);
        session.Begin();
        session.StepFixed();
        System.Reflection.FieldInfo guidanceField = typeof(SimulationSession).GetField(
            "_rapierMissionGuidance",
            System.Reflection.BindingFlags.Instance
                | System.Reflection.BindingFlags.NonPublic)
            ?? throw new InvalidOperationException("Rapier guidance field is unavailable");
        RapierMissionGuidance guidance = (RapierMissionGuidance)(guidanceField.GetValue(session)
            ?? throw new InvalidOperationException("Rapier guidance is unavailable"));

        Assert.Equal(guidance.TargetGammaDeg, session.RapierTargetGammaDeg, precision: 9);
    }
}
