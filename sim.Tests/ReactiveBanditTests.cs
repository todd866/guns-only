using System;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using Xunit;

namespace GunsOnly.Sim.Tests;

public class ReactiveBanditTests {
    const double Dt = 1.0 / AircraftSim.TickHz;

    static AircraftState State(double x, double y, double z, double speed, double chi = 0.0) =>
        new(new Vec3D(x, y, z), speed, 0.0, chi, 0.0, FlightModel.Sabre.MassKg);

    [Fact]
    public void CarrierBeatBuildsTheReactiveOpponent() {
        var beat = Beats.CarrierApproach();
        Assert.True(beat.UsesReactiveBandit);
        Assert.IsType<ReactiveBandit>(beat.CreateBandit());
    }

    [Fact]
    public void ReplacementBogeyStartsInAnOffsetReciprocalMerge() {
        var player = State(800.0, 1250.0, -400.0, 170.0, chi: 0.72);
        var bandit = Assert.IsType<ReactiveBandit>(
            Beats.CarrierApproach().CreateNextBandit(player, engagementNumber: 1));
        var line = (bandit.State.Position - player.Position).Normalized();
        double closureMps = (player.VelocityVector() - bandit.State.VelocityVector()).Dot(line);

        Assert.InRange(Geometry.Range(player, bandit.State), 3000.0, 3800.0);
        Assert.InRange(Math.Abs(bandit.State.Position.Y - player.Position.Y), 80.0, 180.0);
        Assert.Equal(180.0, bandit.State.Speed, 10);
        Assert.True(closureMps > 280.0, $"replacement must drive a real merge; closure={closureMps:F1} m/s");
        Assert.True(Geometry.AngleOff(bandit.State, player) < 0.30,
            "the new fighter must be pointed into the merge, not presented as a passive tail shot");
        Assert.False(CameraSolver.GunWindow(player, bandit.State),
            "the new fighter must spawn outside the immediate gun envelope");
    }

    [Fact]
    public void ReplacementSequenceIsDeterministic() {
        var player = State(-250.0, 2100.0, 900.0, 165.0, chi: -1.08);

        for (int engagement = 1; engagement <= 6; engagement++) {
            var first = ReactiveBandit.SpawnForMerge(player, FlightModel.Sabre, engagement);
            var second = ReactiveBandit.SpawnForMerge(player, FlightModel.Sabre, engagement);
            Assert.Equal(first.State, second.State);

            for (int tick = 0; tick < AircraftSim.TickHz; tick++) {
                first.Step(player, Dt);
                second.Step(player, Dt);
                Assert.Equal(first.State, second.State);
                Assert.Equal(first.Tactic, second.Tactic);
                Assert.Equal(first.LastCommand, second.LastCommand);
            }
        }
    }

    [Fact]
    public void NeutralContactIsAcquiredAndTurnedToward() {
        var player = State(1500.0, 1000.0, 1200.0, 160.0);
        var bandit = new ReactiveBandit(State(0.0, 1000.0, 0.0, 165.0), FlightModel.Sabre);
        double initialAngle = Geometry.AngleOff(bandit.State, player);

        for (int i = 0; i < 5 * AircraftSim.TickHz; i++) bandit.Step(player, Dt);

        Assert.Equal(BanditTactic.Acquire, bandit.Tactic);
        Assert.True(bandit.State.Chi > 0.20, $"bandit did not turn right toward the contact: chi={bandit.State.Chi:F3}");
        // The direct load-factor law now pins the commanded ~2 G instead of the old attitude
        // augmentation over-pulling it. The moderate AI still has to close the angle materially.
        Assert.True(Geometry.AngleOff(bandit.State, player) < initialAngle * 0.88,
            $"acquisition did not reduce angle: {initialAngle:F3} -> {Geometry.AngleOff(bandit.State, player):F3}");
    }

    [Fact]
    public void PlayerOnSixTriggersARepeatableBreakAndJink() {
        var playerSim = new AircraftSim(State(0.0, 1000.0, -650.0, 205.0), FlightModel.Sabre);
        var initialBandit = State(0.0, 1000.0, 0.0, 165.0);
        var first = new ReactiveBandit(initialBandit, FlightModel.Sabre);
        var second = new ReactiveBandit(initialBandit, FlightModel.Sabre);
        bool sawDefend = false, sawLeft = false, sawRight = false;
        double maxBankCommand = 0.0, minG = double.PositiveInfinity, maxG = double.NegativeInfinity;

        for (int i = 0; i < 4 * AircraftSim.TickHz; i++) {
            var player = playerSim.State;
            first.Step(player, Dt);
            second.Step(player, Dt);
            playerSim.Step(new PilotCommand(1.0, 0.0, 0.82, 0.0), Dt);

            Assert.Equal(first.State, second.State);
            Assert.Equal(first.Tactic, second.Tactic);
            Assert.Equal(first.LastCommand, second.LastCommand);
            sawDefend |= first.Tactic == BanditTactic.Defend;
            sawLeft |= first.LastCommand.BankTarget < -1.0;
            sawRight |= first.LastCommand.BankTarget > 1.0;
            maxBankCommand = Math.Max(maxBankCommand, Math.Abs(first.LastCommand.BankTarget));
            minG = Math.Min(minG, first.LastCommand.GDemand);
            maxG = Math.Max(maxG, first.LastCommand.GDemand);
        }

        Assert.True(sawDefend, "a close, closing attacker on the six must trigger defence");
        Assert.True(maxBankCommand > 1.1, $"break was not hard: max bank command={maxBankCommand:F2} rad");
        Assert.True(sawLeft && sawRight, "the deterministic jink must reverse its break bank");
        Assert.True(maxG - minG > 0.4, $"the jink must vary G: {minG:F2}..{maxG:F2}");
        Assert.True(Math.Abs(first.State.Chi - initialBandit.Chi) > 0.10,
            $"defender stayed effectively straight: chi={first.State.Chi:F3}");
    }
}
