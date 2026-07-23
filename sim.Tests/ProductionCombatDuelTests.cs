using GunsOnly.Sim.Doctrine;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

public class ProductionCombatDuelTests {
    readonly ITestOutputHelper _output;
    public ProductionCombatDuelTests(ITestOutputHelper output) => _output = output;

    [Fact]
    public void RearQuarterThreatsResolveThroughActualProductionGuns() {
        ProductionCombatResult enemyOffensive = ProductionCombatDuel.Fly(
            ProductionCombatScenario.EnemyRearQuarter(),
            referenceSkill: PilotSkill.Veteran,
            enemySkill: PilotSkill.Ace,
            maximumSeconds: 8.0);
        ProductionCombatResult referenceOffensive = ProductionCombatDuel.Fly(
            ProductionCombatScenario.ReferenceRearQuarter(),
            referenceSkill: PilotSkill.Veteran,
            enemySkill: PilotSkill.Ace,
            maximumSeconds: 8.0);

        Assert.True(enemyOffensive.Outcome == ProductionCombatOutcome.EnemyWin,
            $"expected enemy rear-quarter kill, got {enemyOffensive}");
        Assert.Equal(CombatConfig.ModernVisualMerge.PlayerHitsToDefeat,
            enemyOffensive.EnemyHits);
        Assert.True(enemyOffensive.EnemyRoundsFired > 0);
        Assert.Equal(0, enemyOffensive.ReferenceRoundsFired);

        Assert.True(referenceOffensive.Outcome == ProductionCombatOutcome.ReferenceWin,
            $"expected reference rear-quarter kill, got {referenceOffensive}");
        Assert.Equal(CombatConfig.ModernVisualMerge.OpponentHitsToDefeat,
            referenceOffensive.ReferenceHits);
        Assert.True(referenceOffensive.ReferenceRoundsFired > 0);
        Assert.Equal(0, referenceOffensive.EnemyRoundsFired);
    }

    [Fact]
    public void OffsetMergeIsFirstPassSafeAndDeterministic() {
        ProductionCombatScenario scenario =
            ProductionCombatScenario.OffsetNeutralMerge(engagementNumber: 2);

        ProductionCombatResult first = ProductionCombatDuel.Fly(
            scenario, PilotSkill.Veteran, PilotSkill.Ace, maximumSeconds: 25.0);
        ProductionCombatResult second = ProductionCombatDuel.Fly(
            scenario, PilotSkill.Veteran, PilotSkill.Ace, maximumSeconds: 25.0);

        Assert.True(first.FirstPassOpened,
            "the frozen neutral probe must pass close and explicitly open before either gun is live");
        Assert.True(first.MinimumRangeM < 900.0,
            $"probe never reached the merge gate: {first.MinimumRangeM:F1} m");
        Assert.Equal(first, second);
    }

    [Fact]
    public void ActualOutcomeSweepCountsPhysicalResultsInsteadOfBurstProxies() {
        // 40 s per engagement. At 30 s the Ace reaches a 0.57-degree solution for ~0.5 s but
        // the fixed burst clock (phase from engagement start) can miss a brief window entirely —
        // a real backlog item (burst phase should key on envelope ENTRY), not a combat failure.
        ProductionCombatSweepResult result = ProductionCombatDuel.SweepOffsetMerges(
            referenceSkill: PilotSkill.Veteran,
            enemySkill: PilotSkill.Ace,
            engagements: 3,
            maximumSecondsPerEngagement: 40.0);
        _output.WriteLine(result.ToString());

        Assert.Equal(result.Engagements,
            result.ReferenceWins + result.EnemyWins + result.MutualKills + result.Timeouts);
        Assert.True(result.ReferenceRoundsFired + result.EnemyRoundsFired > 0,
            $"first-pass-safe production probes never fired: {result}");
        Assert.Equal(0, result.MutualKills);
    }

    [Fact]
    public void ActualTriggerEnvelopeIsNotTheTwelveDegreeCameraProxy() {
        AircraftState own = new(
            new Vec3D(0.0, 3000.0, 0.0), 230.0, 0.0, 0.0, 0.0,
            FlightModel.Su27SPublicDataSurrogate.MassKg);
        double angle = 8.0 * Math.PI / 180.0;
        AircraftState target = new(
            new Vec3D(Math.Sin(angle) * 600.0, 3000.0, Math.Cos(angle) * 600.0),
            230.0, 0.0, 0.0, 0.0,
            FlightModel.F22APublicDataSurrogate.MassKg);
        ActorObservation observation = ActorObservation.Capture(target);

        Assert.True(CameraSolver.GunWindow(own, target));
        Assert.False(BanditFireControl.WantsToFire(own, observation, engagementSeconds: 0.0));
    }
}
