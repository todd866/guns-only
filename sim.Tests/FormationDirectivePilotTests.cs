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
    public void FreshBracketSupportCrossesItsSpawnLeashToRejoinTheSharedFight() {
        AircraftParams air = FlightModel.F22APublicDataSurrogate;
        AircraftState initial = new(
            new Vec3D(0.0, 3_200.0, 0.0),
            Speed: 245.0,
            Gamma: 0.0,
            Chi: Math.PI / 2.0,
            Bank: 0.0,
            Mass: air.MassKg);
        AircraftState sharedState = initial with {
            Position = new Vec3D(24_000.0, 3_200.0, 0.0)
        };
        var support = new ReactiveBandit(initial, air, PilotSkill.Ace);
        double maximumDistanceFromSpawnM = 0.0;
        double minimumDistanceToSharedFightM = double.PositiveInfinity;

        for (int tick = 0; tick < 90 * AircraftSim.TickHz; tick++) {
            ActorObservation shared = ActorObservation.Capture(sharedState, tick);
            support.AcceptFormationDirective(new FormationDirective(
                FormationTacticalRole.Bracket,
                LateralSign: 1,
                PartnerId: 2,
                AssignmentSequence: 9,
                SharedContact: shared));
            support.Step(shared, Dt);
            Vec3D displacement = support.State.Position - initial.Position;
            maximumDistanceFromSpawnM = Math.Max(
                maximumDistanceFromSpawnM,
                new Vec3D(displacement.X, 0.0, displacement.Z).Length);
            minimumDistanceToSharedFightM = Math.Min(
                minimumDistanceToSharedFightM,
                (support.State.Position - sharedState.Position).Length);
        }

        Assert.True(maximumDistanceFromSpawnM >= 9_000.0,
            $"support turned back into its empty spawn bubble at "
            + $"{maximumDistanceFromSpawnM / 1_852.0:F1} NM instead of rejoining");
        Assert.True(minimumDistanceToSharedFightM < 8_000.0,
            $"support crossed its spawn leash but never closed the shared fight: "
            + $"closest {minimumDistanceToSharedFightM / 1_852.0:F1} NM");
        Assert.Equal(
            FormationTacticalRole.Bracket,
            support.PolicyMemory.FormationRole);
    }

    [Fact]
    public void FreshBracketOrderDoesNotChaseADepartedPlayerAcrossTheTheatre() {
        AircraftParams air = FlightModel.F22APublicDataSurrogate;
        AircraftState initial = new(
            new Vec3D(0.0, 3_200.0, 0.0),
            Speed: 245.0,
            Gamma: 0.0,
            Chi: Math.PI / 2.0,
            Bank: 0.0,
            Mass: air.MassKg);
        AircraftState departing = initial with {
            Position = new Vec3D(60_000.0, 3_200.0, 0.0),
            Speed = 320.0
        };
        var support = new ReactiveBandit(initial, air, PilotSkill.Ace);
        double maximumDistanceFromSpawnM = 0.0;

        for (int tick = 0; tick < 90 * AircraftSim.TickHz; tick++) {
            ActorObservation shared = ActorObservation.Capture(departing, tick);
            support.AcceptFormationDirective(new FormationDirective(
                FormationTacticalRole.Bracket,
                LateralSign: 1,
                PartnerId: 2,
                AssignmentSequence: 10,
                SharedContact: shared));
            support.Step(shared, Dt);
            Vec3D displacement = support.State.Position - initial.Position;
            maximumDistanceFromSpawnM = Math.Max(
                maximumDistanceFromSpawnM,
                new Vec3D(displacement.X, 0.0, displacement.Z).Length);
            departing = departing with {
                Position = departing.Position + departing.VelocityVector() * Dt
            };
        }

        Assert.True(maximumDistanceFromSpawnM < 20_000.0,
            $"fresh formation refresh chased a departed player "
            + $"{maximumDistanceFromSpawnM / 1_852.0:F1} NM from the fight centre");
        Assert.Equal(
            FormationTacticalRole.Bracket,
            support.PolicyMemory.FormationRole);
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

    [Theory]
    [InlineData(1)]
    [InlineData(5)]
    [InlineData(7)]
    [InlineData(11)]
    [InlineData(17)]
    public void AbsoluteLanesStayDephasedAcrossLateNeutralHandoff(int handoffTick) {
        static (int[] SupportTicks, int[] NeutralTicks,
            AircraftState SupportState, AircraftState NeutralState) Run(int handoff) {
            AircraftState initial = State(0.0, 2_500.0, 0.0, speed: 185.0);
            AircraftState playerState = State(
                0.0, 2_500.0, 1_200.0, speed: 175.0, chi: Math.PI);
            BanditSkillProfile compactAce =
                BanditSkillProfile.For(PilotSkill.Ace) with {
                    LookaheadHorizonTicks = 8
                };
            var support = new ReactiveBandit(
                initial,
                FlightModel.Sabre,
                PilotSkill.Ace,
                profile: compactAce);
            // This controller begins only at the handoff tick, matching a NeutralMergeBandit's
            // late construction of its reactive pilot.
            var neutralFight = new ReactiveBandit(
                initial,
                FlightModel.Sabre,
                PilotSkill.Ace,
                profile: compactAce);
            support.ConfigureLookaheadCadencePhase(0);
            neutralFight.ConfigureLookaheadCadencePhase(5);
            var supportTicks = new List<int>();
            var neutralTicks = new List<int>();
            long supportSequence = 0;
            long neutralSequence = 0;

            for (int tick = 0; tick < 72; tick++) {
                ActorObservation player =
                    ActorObservation.Capture(playerState, sourceTick: tick);
                support.Step(player, Dt);
                long currentSupportSequence =
                    support.DecisionTrace.SelectionSequence;
                if (currentSupportSequence != supportSequence
                    && support.DecisionTrace.CandidateCount > 1) {
                    supportTicks.Add(tick);
                }
                supportSequence = currentSupportSequence;

                if (tick < handoff) continue;
                neutralFight.Step(player, Dt);
                long currentNeutralSequence =
                    neutralFight.DecisionTrace.SelectionSequence;
                if (currentNeutralSequence != neutralSequence
                    && neutralFight.DecisionTrace.CandidateCount > 1) {
                    neutralTicks.Add(tick);
                }
                neutralSequence = currentNeutralSequence;
            }

            return (
                supportTicks.ToArray(),
                neutralTicks.ToArray(),
                support.State,
                neutralFight.State);
        }

        var first = Run(handoffTick);
        var replay = Run(handoffTick);

        Assert.NotEmpty(first.SupportTicks);
        Assert.NotEmpty(first.NeutralTicks);
        Assert.Empty(first.SupportTicks.Intersect(first.NeutralTicks));
        Assert.Equal(first.SupportTicks, replay.SupportTicks);
        Assert.Equal(first.NeutralTicks, replay.NeutralTicks);
        Assert.Equal(first.SupportState, replay.SupportState);
        Assert.Equal(first.NeutralState, replay.NeutralState);
    }
}
