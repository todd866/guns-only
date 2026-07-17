using GunsOnly.Sim; using GunsOnly.Sim.Doctrine; using Xunit;
public class BeatsTests {
    [Fact] public void PerchStartsPlayerBehindAndAbove() {
        var b = Beats.Perch();
        var rel = b.Player.Position - b.Bandit.Position;
        Assert.True(rel.Y > 200);                       // above
        Assert.True(rel.Dot(b.Bandit.ForwardDir()) < -300); // behind
    }
    [Fact] public void RailBanditIsDeterministic() {
        var b = Beats.Perch();
        var r1 = new RailBandit(b.Bandit, FlightModel.Sabre, b.BanditTimeline);
        var r2 = new RailBandit(b.Bandit, FlightModel.Sabre, b.BanditTimeline);
        for (int i = 0; i < 2400; i++) { r1.Step(1.0/AircraftSim.TickHz); r2.Step(1.0/AircraftSim.TickHz); }
        Assert.Equal(r1.State, r2.State);
    }
    [Fact] public void PerchBanditEventuallyTurns() {
        var b = Beats.Perch();
        var r = new RailBandit(b.Bandit, FlightModel.Sabre, b.BanditTimeline);
        double chi0 = r.State.Chi;
        for (int i = 0; i < 1800; i++) r.Step(1.0/AircraftSim.TickHz); // 15 s
        Assert.True(System.Math.Abs(r.State.Chi - chi0) > 0.5);
    }
    [Fact] public void AllThreeBeatsConstruct() {
        Assert.NotNull(Beats.Perch()); Assert.NotNull(Beats.BreakDefense()); Assert.NotNull(Beats.Saddle());
    }
    [Fact] public void BreakDefenseBanditConvergesOnCruisingPlayer() {
        var b = Beats.BreakDefense();
        var player = new AircraftSim(b.Player, FlightModel.Sabre);
        var bandit = new RailBandit(b.Bandit, FlightModel.Sabre, b.BanditTimeline);
        double r0 = Geometry.Range(player.State, bandit.State);
        double rMin = r0;
        for (int i = 0; i < 720; i++) {
            player.Step(new PilotCommand(1.0, 0.0, 0.85, 0), 1.0/AircraftSim.TickHz);
            bandit.Step(1.0/AircraftSim.TickHz);
            rMin = System.Math.Min(rMin, Geometry.Range(player.State, bandit.State));
        }
        Assert.True(rMin < r0 * 0.75, $"threat never closed: r0={r0:F0} rMin={rMin:F0}");
    }
    [Fact] public void RailBanditRejectsBadTimelines() {
        var s = Beats.Perch().Bandit;
        Assert.Throws<System.ArgumentException>(() => new RailBandit(s, FlightModel.Sabre, new()));
        Assert.Throws<System.ArgumentException>(() => new RailBandit(s, FlightModel.Sabre, new() { (1.0, new PilotCommand(1, 0, 1, 0)) }));
        Assert.Throws<System.ArgumentException>(() => new RailBandit(s, FlightModel.Sabre, new() { (0.0, new PilotCommand(1, 0, 1, 0)), (0.0, new PilotCommand(2, 0, 1, 0)) }));
    }
}
