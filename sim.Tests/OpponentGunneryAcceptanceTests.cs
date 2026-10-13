using GunsOnly.Sim.Doctrine;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

public sealed class OpponentGunneryAcceptanceTests(ITestOutputHelper output) {
    [Fact]
    public void ReportAce() {
        if (System.Environment.GetEnvironmentVariable("C12_ACE") != "1") return;
        var r = GunConversionFunnel.MeasureEnemy(PilotSkill.Ace, report: output.WriteLine);
        output.WriteLine(r.TriggerLine);
    }

    [Fact]
    public void ReportDefense() {
        if (System.Environment.GetEnvironmentVariable("C12_REPORT") != "1") return;
        foreach (int lesson in new[] { 1, 3, 5 })
            foreach (bool breaking in new[] { false, true })
                foreach (int seed in Enumerable.Range(0, 8))
                    output.WriteLine(BfmFlightAcceptanceTests.FlyDefense(lesson, seed, breaking,
                        reverse: lesson == 5 && breaking).ToString());
    }

    [Fact]
    public void PassiveD1IsLethalAndBreakingDeniesItAcrossEightSeeds() {
        var passive = Enumerable.Range(0, 8).Select(i => BfmFlightAcceptanceTests.FlyDefense(1, i, false)).ToArray();
        var breaking = Enumerable.Range(0, 8).Select(i => BfmFlightAcceptanceTests.FlyDefense(1, i, true)).ToArray();
        foreach (var run in passive.Concat(breaking)) output.WriteLine(run.ToString());
        Assert.True(passive.Count(r => r.Lost && r.Hits >= 3 && r.Time <= 20) >= 7);
        Assert.True(breaking.Count(r => !r.Lost && r.Result == "passed") >= 7);
    }

    [Fact]
    public void ReportPassiveTrace() {
        if (System.Environment.GetEnvironmentVariable("C12_TRACE") != "1") return;
        var s = BfmFlightAcceptanceTests.Start(1);
        for (int tick = 0; tick < 20 * AircraftSim.TickHz; tick++) {
            if (tick % 12 == 0) {
                var b = (ReactiveBandit)s.Bandit;
                var own = b.State;
                var target = ActorObservation.Capture(s.Player.State, tick);
                var lead = BanditFireControl.LeadDirection(own, target);
                var bore = GunKill.GunDirection(own);
                output.WriteLine($"t={s.TimeSeconds:F2} range={Geometry.Range(own,target):F1} lead={BanditFireControl.LeadNoseErrorRad(own,target)*180/Math.PI:F3} bank={own.Bank*180/Math.PI:F2} gamma={own.Gamma*180/Math.PI:F3} borePitch={Math.Asin(bore.Y)*180/Math.PI:F3} leadPitch={Math.Asin(lead.Y)*180/Math.PI:F3} g={b.LastCommand.GDemand:F3} rounds={s.SortieOpponentRoundsFired} hits={s.PlayerHitsTaken}");
            }
            s.StepFixed();
            if (s.PlayerTerminalState != AircraftTerminalState.Flying) break;
        }
    }
}
