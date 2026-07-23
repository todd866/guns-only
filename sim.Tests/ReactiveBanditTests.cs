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

        Assert.InRange(Geometry.Range(player, bandit.State), 2000.0, 2800.0);
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
        Assert.Equal(9, trace.CandidateCount);
        double best = double.NegativeInfinity;
        for (int index = 0; index < trace.CandidateCount; index++) {
            BanditDecisionCandidate candidate = trace.CandidateAt(index);
            if (!candidate.HasScore) continue;
            best = Math.Max(best, candidate.Score);
        }
        if (windowExpected)
            Assert.True(best > 8.0,
                $"an in-envelope hold must earn the window reward: best={best:F2}");
        else
            Assert.True(best < 5.0,
                $"no candidate may be rewarded for an unusable window: best={best:F2}");
    }

    static GunsOnly.Sim.Environment.BilinearHeightGrid Plateau(double heightM) {
        var heights = new double[2, 2] {
            { heightM, heightM }, { heightM, heightM }
        };
        return new GunsOnly.Sim.Environment.BilinearHeightGrid(
            -60_000.0, -60_000.0, 120_000.0, 120_000.0, heights);
    }

    [Fact]
    public void SpawnForMergeClearsTheRealSurfaceUnderTheMerge() {
        // Production defect (Build 68 telemetry): a replacement tracking a player at 3,200 ft over
        // Korean terrain spawned with sea-level clearance math and flew into a ridge 7.5 seconds
        // later. The merge must begin with honest room above the LOCAL surface.
        var terrain = Plateau(1500.0);
        var player = State(0.0, 1700.0, 0.0, 240.0);

        var withTerrain = ReactiveBandit.SpawnForMerge(
            player, FlightModel.Sabre, engagementNumber: 4, 180.0, PilotSkill.Ace, terrain);
        var withoutTerrain = ReactiveBandit.SpawnForMerge(
            player, FlightModel.Sabre, engagementNumber: 4, 180.0, PilotSkill.Ace);

        Assert.True(withTerrain.State.Position.Y >= 2100.0 - 1e-9,
            $"spawn must clear terrain+600m: y={withTerrain.State.Position.Y:F0}");
        Assert.True(withoutTerrain.State.Position.Y < 2100.0,
            "control: the sea-level spawn sits lower, so the terrain path is what raised it");
    }

    [Fact]
    public void CompetentPursuitOverHighTerrainHoldsTheLocalFloor() {
        // The controller's floor offsets are measured above the LOCAL surface. Chasing a very low
        // player over a 1,200 m plateau must not descend to the legacy sea-level floor band.
        var terrain = Plateau(1200.0);
        AircraftParams air = FlightModel.Sabre;
        var own = new AircraftState(new Vec3D(0.0, 1500.0, 0.0), 200.0, 0.0, 0.0, 0.0, air.MassKg);
        var bandit = new ReactiveBandit(own, air, PilotSkill.Competent, terrain);
        var lowPlayer = State(0.0, 1260.0, 2600.0, 200.0);

        double minClearance = double.PositiveInfinity;
        double settledMinClearance = double.PositiveInfinity;
        for (int tick = 0; tick < 20 * AircraftSim.TickHz; tick++) {
            bandit.Step(ActorObservation.Capture(lowPlayer, tick), Dt);
            double clearance = bandit.State.Position.Y - 1200.0;
            minClearance = Math.Min(minClearance, clearance);
            if (tick >= 4 * AircraftSim.TickHz)
                settledMinClearance = Math.Min(settledMinClearance, clearance);
        }

        Assert.True(minClearance > 250.0,
            $"pursuit sank into the legacy sea-level band: min clearance={minClearance:F0} m");
        Assert.True(settledMinClearance > 280.0,
            "the settled pursuit must hold a terrain-raised band, not the player's "
            + $"near-surface altitude: settled min clearance={settledMinClearance:F0} m");
    }

    [Fact]
    public void VeteranLookaheadRefusesToTradeAKillLineForTerrain() {
        // Build 68 telemetry: every lookahead-tier bandit eventually terrain-killed itself in the
        // low fight because rollout scoring measured altitude against sea level. A candidate whose
        // rolled-out path reaches the local surface must lose to any surviving candidate.
        var terrain = Plateau(1500.0);
        AircraftParams air = FlightModel.Su27SPublicDataSurrogate;
        var own = new AircraftState(
            new Vec3D(0.0, 1900.0, 0.0), 240.0, 0.0, 0.0, 0.0, air.MassKg);
        var bandit = new ReactiveBandit(own, air, PilotSkill.Veteran, terrain);
        // A slow contact just below, circling: nose-low candidates aim well under the surface.
        var contact = new AircraftState(
            new Vec3D(300.0, 1750.0, 800.0), 140.0, 0.0, 0.0, 0.9, air.MassKg);

        double minClearance = double.PositiveInfinity;
        for (int tick = 0; tick < 20 * AircraftSim.TickHz; tick++) {
            bandit.Step(ActorObservation.Capture(contact, tick), Dt);
            minClearance = Math.Min(minClearance,
                bandit.State.Position.Y - 1500.0);
        }

        Assert.True(minClearance > 60.0,
            $"lookahead flew the fight into the hill: min clearance={minClearance:F0} m");
    }

    [Fact]
    public void TerrainReplacementReachesTheActiveBandit() {
        // The session can re-anchor the world origin mid-sortie (SetWorldOrigin), replacing the
        // translated terrain surface. A bandit that kept its construction-time reference would
        // silently sample the stale ground. Diving toward what the NEW surface says is a plateau
        // must engage the recovery reflex only after the update arrives.
        AircraftParams air = FlightModel.Su27SPublicDataSurrogate;
        var diving = new AircraftState(
            new Vec3D(0.0, 1700.0, 0.0), 260.0, -0.9, 0.0, 0.0, air.MassKg);
        var contact = State(0.0, 400.0, 4000.0, 200.0);

        var blind = new ReactiveBandit(diving, air, PilotSkill.Veteran);
        blind.Step(ActorObservation.Capture(contact, 0), Dt);
        Assert.NotEqual(BanditTactic.Return, blind.Tactic);

        var updated = new ReactiveBandit(diving, air, PilotSkill.Veteran);
        updated.UpdateTerrain(Plateau(1500.0));
        updated.Step(ActorObservation.Capture(contact, 0), Dt);
        Assert.Equal(BanditTactic.Return, updated.Tactic);
        Assert.Equal(BanditSkillProfile.For(PilotSkill.Veteran).MaxAcquireG,
            updated.LastCommand.GDemand, 6);
    }

    [Fact]
    public void VeteranTriggerGateIsWiderThanCompetentAndStaysHonest() {
        // The Veteran deliberately shoots a wider nose-error gate — tracer pressure with honest
        // ballistics — while Novice/Competent keep the historical 3-degree discipline exactly.
        var own = State(0.0, 3000.0, 0.0, 200.0);
        var gunLine = GunKill.GunDirection(own);
        Vec3D perpendicular = new Vec3D(0.0, 1.0, 0.0).Cross(gunLine).Normalized();
        double offAxisRad = 4.0 * Math.PI / 180.0;
        var contactState = State(0.0, 3000.0, 500.0, 200.0) with {
            Position = own.Position
                + (gunLine * Math.Cos(offAxisRad) + perpendicular * Math.Sin(offAxisRad)) * 500.0
        };
        var observation = ActorObservation.Capture(contactState, 0);

        Assert.False(BanditFireControl.WantsToFire(own, observation, 0.0),
            "4 degrees off must stay outside the historical gate");
        Assert.False(BanditFireControl.WantsToFire(own, observation, 0.0,
            BanditSkillProfile.For(PilotSkill.Competent).FireConeRad));
        Assert.True(BanditFireControl.WantsToFire(own, observation, 0.0,
            BanditSkillProfile.For(PilotSkill.Veteran).FireConeRad),
            "the Veteran's 5-degree gate must accept a 4-degree snapshot");
        Assert.Equal(3.0 * Math.PI / 180.0,
            BanditSkillProfile.For(PilotSkill.Novice).FireConeRad, 12);
        Assert.Equal(3.0 * Math.PI / 180.0,
            BanditSkillProfile.For(PilotSkill.Competent).FireConeRad, 12);
    }
}
