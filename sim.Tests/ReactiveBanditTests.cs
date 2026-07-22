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
    public void CarrierQualificationKeepsCombatOutOfTheRecoveryAuthority() {
        var beat = Beats.CarrierApproach();
        Assert.False(beat.UsesReactiveBandit);
        Assert.True(beat.RecoveryCompletesSortie);
        Assert.Equal(0, beat.CombatRules.PlayerAmmo);
        Assert.Equal(0, beat.CombatRules.OpponentAmmo);
        Assert.IsType<RailBandit>(beat.CreateBandit());
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

    [Theory]
    [InlineData(1, PilotSkill.Novice)]
    [InlineData(2, PilotSkill.Competent)]
    [InlineData(3, PilotSkill.Veteran)]
    [InlineData(4, PilotSkill.Ace)]
    [InlineData(5, PilotSkill.Ace)]
    public void ForEngagementIsADeterministicNoviceThroughAceRamp(int engagement, PilotSkill expected) {
        Assert.Equal(expected, BanditSkillProfile.ForEngagement(engagement));
        // Pure function of the int: repeated calls agree.
        Assert.Equal(expected, BanditSkillProfile.ForEngagement(engagement));
    }

    [Fact]
    public void SpawnForMergeThreadsTheRequestedSkillOntoTheBandit() {
        var player = State(0.0, 3000.0, 0.0, 240.0);
        Assert.Equal(PilotSkill.Ace,
            ReactiveBandit.SpawnForMerge(player, FlightModel.Sabre, 1, 180.0, PilotSkill.Ace).Skill);
        Assert.Equal(PilotSkill.Veteran,
            ReactiveBandit.SpawnForMerge(player, FlightModel.Sabre, 1, 180.0, PilotSkill.Veteran).Skill);
        // Default remains Competent so unspecified spawns stay byte-identical.
        Assert.Equal(PilotSkill.Competent,
            ReactiveBandit.SpawnForMerge(player, FlightModel.Sabre, 1).Skill);
    }

    [Theory]
    [InlineData(1, PilotSkill.Novice)]
    [InlineData(2, PilotSkill.Competent)]
    [InlineData(3, PilotSkill.Veteran)]
    [InlineData(4, PilotSkill.Ace)]
    public void FlagshipContinuousSuccessorEscalatesByEngagementNumber(int engagement, PilotSkill expected) {
        var player = State(0.0, 5486.4, 0.0, 300.0);
        var successor = Assert.IsType<ReactiveBandit>(
            Beats.ModernVisualMerge().CreateNextBandit(player, engagement));
        Assert.Equal(expected, successor.Skill);
    }

    [Fact]
    public void FlagshipOpeningNeutralMergeIsBriefedAsANoviceAndHandsOffToOne() {
        var beat = Beats.ModernVisualMerge();
        Assert.Equal(PilotSkill.Novice, beat.BanditSkill);
        var merge = Assert.IsType<NeutralMergeBandit>(beat.CreateBandit());
        Assert.Equal(PilotSkill.Novice, merge.BriefedSkill);

        // Fly the production merge geometry until the neutral pass completes and the fight is handed
        // to the reactive pilot; the tier the opener actually fields must be the briefed Novice
        // warm-up (the interim ForEngagement ramp makes fight 1 the gentlest wave).
        var playerSim = new AircraftSim(beat.Player, beat.PlayerAir);
        var straight = new PilotCommand(1.0, 0.0, 1.0, 0.0);
        for (int tick = 0; tick < 40 * AircraftSim.TickHz && !merge.FirstPassComplete; tick++) {
            var ps = playerSim.State;
            merge.Step(ps, Dt);
            playerSim.Step(straight, Dt);
        }
        Assert.True(merge.FirstPassComplete, "production merge geometry must complete its neutral pass");
        Assert.Equal(PilotSkill.Novice, merge.FightSkill);
    }

    [Fact]
    public void DefaultBeatSkillStillConstructsACompetentReactiveBandit() {
        // A beat that opts into the reactive pilot without naming a tier keeps the Competent default,
        // so every non-flagship beat stays byte-identical to before the escalation was threaded.
        var beat = new BeatSetup(
            "reactive default fixture",
            State(0.0, 3000.0, -400.0, 190.0),
            State(0.0, 3000.0, 0.0, 180.0),
            new PurePursuitLaw(),
            new() { (0.0, new PilotCommand(1.0, 0.0, 0.85, 0.0)) },
            UsesReactiveBandit: true);
        Assert.Equal(PilotSkill.Competent, beat.BanditSkill);
        Assert.Equal(PilotSkill.Competent,
            Assert.IsType<ReactiveBandit>(beat.CreateBandit()).Skill);
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
    public void EnergyTacticCannotStoreImaginaryAfterburnerSpool() {
        var player = State(1200.0, 1000.0, 1800.0, 160.0);
        var bandit = new ReactiveBandit(State(0.0, 1000.0, 0.0, 100.0), FlightModel.Sabre);

        bandit.Step(player, Dt);

        Assert.Equal(BanditTactic.Energy, bandit.Tactic);
        Assert.Equal(FlightModel.Sabre.MaxThrustFraction,
            bandit.LastCommand.Throttle, 12);
        Assert.Equal(FlightModel.Sabre.MaxThrustFraction, bandit.ThrustFraction, 12);
    }

    [Fact]
    public void ModernLowEnergyOpponentCanSelectRealAfterburnerWhileSabreRemainsBounded() {
        var player = new AircraftState(new Vec3D(1200.0, 5486.4, 1800.0),
            260.0, 0.0, 0.0, 0.0, FlightModel.F22APublicDataSurrogate.MassKg);
        var modernState = new AircraftState(new Vec3D(0.0, 5486.4, 0.0),
            100.0, 0.0, 0.0, 0.0, FlightModel.Su27SPublicDataSurrogate.MassKg);
        var modern = new ReactiveBandit(modernState,
            FlightModel.Su27SPublicDataSurrogate);

        modern.Step(player, Dt);

        Assert.Equal(BanditTactic.Energy, modern.Tactic);
        Assert.True(modern.LastCommand.Throttle > 1.30);
        Assert.Equal(FlightModel.Su27SPublicDataSurrogate.MaxThrustFraction,
            modern.LastCommand.Throttle, 12);
        Assert.True(modern.ThrustFraction > 1.30);
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

    [Theory]
    [InlineData(BanditFireControl.MinimumRangeM - 0.5, false)]
    [InlineData(BanditFireControl.MinimumRangeM, true)]
    [InlineData(BanditFireControl.MaximumRangeM, true)]
    [InlineData(BanditFireControl.MaximumRangeM + 0.5, false)]
    public void FiringEnvelopeHoldsBothRangeBoundaries(double rangeM, bool expected) {
        var own = State(0.0, 3000.0, 0.0, 200.0);
        // Cancel the level-flight AoA: point the physical gun axis exactly at the contact so the
        // range gates are isolated from the nose-error gate.
        var contactState = State(0.0, 3000.0, rangeM, 200.0);
        var gunLine = GunKill.GunDirection(own);
        contactState = contactState with {
            Position = own.Position + gunLine * rangeM
        };
        Assert.Equal(expected, BanditFireControl.InFiringEnvelope(
            own, ActorObservation.Capture(contactState, 0)));
    }

    [Theory]
    [InlineData(60.0, false)]   // deep inside the no-fire minimum range: window is unusable
    [InlineData(880.0, true)]   // just inside maximum range: window must still be rewarded
    [InlineData(1400.0, false)] // beyond maximum range: no window
    public void LookaheadRolloutRewardsOnlyTheUsableFiringEnvelope(
        double rangeM, bool windowExpected) {
        // A co-speed contact pinned dead ahead keeps the rollout range essentially constant, so
        // the gun-window reward (10 points per rollout second) dominates every shaping term when
        // and only when the geometry is inside the envelope the trigger can actually use. The
        // old rollout also rewarded nose-on time INSIDE the no-fire minimum range, letting a
        // close overshoot outscore a genuinely usable solution.
        AircraftParams air = FlightModel.Su27SPublicDataSurrogate;
        var own = new AircraftState(
            new Vec3D(0.0, 5486.4, 0.0), 300.0, 0.0, 0.0, 0.0, air.MassKg);
        var contact = new AircraftState(
            new Vec3D(0.0, 5486.4, rangeM), 300.0, 0.0, 0.0, 0.0, air.MassKg);
        var bandit = new ReactiveBandit(own, air, PilotSkill.Ace);

        bandit.Step(ActorObservation.Capture(contact, 0), Dt);

        BanditDecisionTrace trace = bandit.DecisionTrace;
        Assert.Equal(6, trace.CandidateCount);
        double best = double.NegativeInfinity;
        for (int index = 0; index < trace.CandidateCount; index++)
            best = Math.Max(best, trace.CandidateAt(index).Score);
        if (windowExpected)
            Assert.True(best > 8.0,
                $"an in-envelope hold must earn the window reward: best={best:F2}");
        else
            Assert.True(best < 5.0,
                $"no candidate may be rewarded for an unusable window: best={best:F2}");
    }
}
