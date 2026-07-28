using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public class FormationDirectivePilotTests {
    const double Dt = 1.0 / AircraftSim.TickHz;

    static AircraftState State(
        double x,
        double y,
        double z,
        double speed = 165.0,
        double chi = 0.0) =>
        new(
            new Vec3D(x, y, z),
            speed,
            Gamma: 0.0,
            Chi: chi,
            Bank: 0.0,
            Mass: FlightModel.Sabre.MassKg);

    [Fact]
    public void PressureRolePreservesTheIndependentPilotCommand() {
        AircraftState initial = State(0.0, 1_500.0, 0.0);
        ActorObservation player = ActorObservation.Capture(
            State(900.0, 1_500.0, 1_700.0, speed: 160.0),
            sourceTick: 0);
        var independent = new ReactiveBandit(
            initial, FlightModel.Sabre, PilotSkill.Novice);
        var pressure = new ReactiveBandit(
            initial, FlightModel.Sabre, PilotSkill.Novice);
        pressure.AcceptFormationDirective(new FormationDirective(
            FormationTacticalRole.Pressure,
            LateralSign: 0,
            PartnerId: 2,
            AssignmentSequence: 1,
            SharedContact: player));

        independent.Step(player, Dt);
        pressure.Step(player, Dt);

        Assert.Equal(independent.LastCommand, pressure.LastCommand);
        Assert.Equal(independent.State, pressure.State);
        Assert.Equal(
            FormationTacticalRole.Pressure,
            pressure.PolicyMemory.FormationRole);
    }

    [Fact]
    public void BracketRoleUsesTheDelayedSharedContactForLateralStationing() {
        AircraftState initial = State(0.0, 1_500.0, 0.0);
        ActorObservation player = ActorObservation.Capture(
            State(0.0, 1_500.0, 2_000.0, speed: 160.0),
            sourceTick: 42);
        ActorObservation delayedSharedContact = player with {
            SourceTick = 0,
            ObservationAgeTicks = 42,
            Confidence = 0.8
        };
        var independent = new ReactiveBandit(
            initial, FlightModel.Sabre, PilotSkill.Novice);
        var bracket = new ReactiveBandit(
            initial, FlightModel.Sabre, PilotSkill.Novice);
        bracket.AcceptFormationDirective(new FormationDirective(
            FormationTacticalRole.Bracket,
            LateralSign: 1,
            PartnerId: 2,
            AssignmentSequence: 3,
            SharedContact: delayedSharedContact));

        independent.Step(player, Dt);
        bracket.Step(player, Dt);

        Assert.Equal(0.0, independent.LastCommand.BankTarget, 10);
        Assert.True(
            bracket.LastCommand.BankTarget > 0.2,
            $"bracket did not build right-side spacing: bank="
                + $"{bracket.LastCommand.BankTarget:F3} rad");
        Assert.Equal(
            FormationTacticalRole.Bracket,
            bracket.PolicyMemory.FormationRole);
        Assert.Equal(42,
            bracket.PolicyMemory.FormationSharedContactAgeTicks);
        Assert.Equal(0.8,
            bracket.PolicyMemory.FormationSharedContactConfidence,
            10);
    }

    [Fact]
    public void StaleBracketOrderFallsBackToIndependentPursuit() {
        AircraftState initial = State(0.0, 1_500.0, 0.0);
        ActorObservation player = ActorObservation.Capture(
            State(0.0, 1_500.0, 2_000.0, speed: 160.0),
            sourceTick: 300);
        ActorObservation staleSharedContact = player with {
            SourceTick = 0,
            ObservationAgeTicks =
                EnemyPairCoordinator.SharedContactStaleAfterTicks + 1,
            Confidence = 0.6
        };
        var independent = new ReactiveBandit(
            initial, FlightModel.Sabre, PilotSkill.Novice);
        var staleBracket = new ReactiveBandit(
            initial, FlightModel.Sabre, PilotSkill.Novice);
        staleBracket.AcceptFormationDirective(new FormationDirective(
            FormationTacticalRole.Bracket,
            LateralSign: 1,
            PartnerId: 2,
            AssignmentSequence: 4,
            SharedContact: staleSharedContact));

        independent.Step(player, Dt);
        staleBracket.Step(player, Dt);

        Assert.Equal(independent.LastCommand, staleBracket.LastCommand);
        Assert.Equal(independent.State, staleBracket.State);
        Assert.Equal(
            FormationTacticalRole.Independent,
            staleBracket.PolicyMemory.FormationRole);
    }

    [Fact]
    public void NeutralMergeCachesButDoesNotFlyTheFormationOrderBeforeHandoff() {
        BeatSetup beat = Beats.ModernVisualMerge();
        var independent = Assert.IsType<NeutralMergeBandit>(
            beat.CreateBandit());
        var bracket = Assert.IsType<NeutralMergeBandit>(
            beat.CreateBandit());
        ActorObservation player =
            ActorObservation.Capture(beat.Player, sourceTick: 0);
        bracket.AcceptFormationDirective(new FormationDirective(
            FormationTacticalRole.Bracket,
            LateralSign: 1,
            PartnerId: 2,
            AssignmentSequence: 1,
            SharedContact: player));

        independent.Step(player, Dt);
        bracket.Step(player, Dt);

        Assert.False(independent.FirstPassComplete);
        Assert.False(bracket.FirstPassComplete);
        Assert.Equal(independent.State, bracket.State);
        Assert.Equal(
            FormationTacticalRole.Bracket,
            bracket.FormationDirective.Role);
    }
}
