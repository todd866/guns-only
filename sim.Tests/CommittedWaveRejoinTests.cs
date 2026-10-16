using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

/// Regression coverage for a committed wave survivor that has lost formation context.
public sealed class CommittedWaveRejoinTests {
    const double Dt = 1.0 / AircraftSim.TickHz;
    static readonly AircraftParams Air = FlightModel.Su27SPublicDataSurrogate;

    static AircraftState State(double z, double chi = Math.PI) =>
        new(new Vec3D(0.0, 3000.0, z), 220.0, 0.0, chi, 0.0, Air.MassKg);

    static AircraftState Advance(AircraftState state) => state with {
        Position = state.Position + state.VelocityVector() * Dt
    };

    static ReactiveBandit Bandit(bool committed, PilotSkill skill = PilotSkill.Competent) {
        BanditSkillProfile profile = BanditSkillProfile.For(skill) with {
            CommitToFight = committed
        };
        return new ReactiveBandit(State(0.0), Air, skill, profile: profile);
    }

    [Theory]
    [InlineData(PilotSkill.Competent)]
    [InlineData(PilotSkill.Veteran)]
    [InlineData(PilotSkill.Ace)]
    public void CommittedSurvivorRejoinsAStableTwoPointSixKilometreOrbit(PilotSkill skill) {
        var bandit = Bandit(committed: true, skill);
        // Both aircraft have the same velocity, so range is stable and the opening-rate
        // heuristic cannot explain the rejoin. The survivor is pointing away from the player.
        AircraftState player = State(2600.0);

        bandit.Step(ActorObservation.Capture(player, 0), Dt);
        Assert.Equal(BanditTactic.Return, bandit.Tactic);

        double minimumRangeM = double.PositiveInfinity;
        bool sawThreat = false;
        for (int tick = 1; tick <= 30 * AircraftSim.TickHz; tick++) {
            ActorObservation observation = ActorObservation.Capture(player, tick);
            bandit.Step(observation, Dt);
            minimumRangeM = Math.Min(minimumRangeM,
                Geometry.Range(bandit.State, player));
            sawThreat |= Geometry.Range(bandit.State, player) < 2500.0
                && Geometry.AngleOff(bandit.State, player) < 35.0 * Math.PI / 180.0;
            sawThreat |= bandit.WantsToFire(observation);
            player = Advance(player);
        }

        Assert.True(sawThreat,
            $"committed survivor never recovered a threat opportunity: minimum range {minimumRangeM:F0} m");
    }

    [Fact]
    public void OrdinaryBanditDoesNotInheritCommittedRejoinTactic() {
        var bandit = Bandit(committed: false);
        AircraftState player = State(2600.0);

        bandit.Step(ActorObservation.Capture(player, 0), Dt);

        Assert.NotEqual(BanditTactic.Return, bandit.Tactic);
    }

    [Fact]
    public void CommittedBanditDoesNotRejoinBeyondFiniteFifteenKilometreCeiling() {
        var bandit = Bandit(committed: true);
        AircraftState player = State(16_000.0);

        bandit.Step(ActorObservation.Capture(player, 0), Dt);

        Assert.NotEqual(BanditTactic.Return, bandit.Tactic);
    }
}
