using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;

namespace GunsOnly.Sim.Tests;

/// Scope and safety contracts for the optional long-range attack re-engagement path.
///
/// Pressure trajectories are measured separately; these contracts pin authority, safety and scope.
public sealed class BanditReengagementTests {
    const double Dt = 1.0 / AircraftSim.TickHz;
    static readonly AircraftParams BanditAir = FlightModel.Su27SPublicDataSurrogate;
    static readonly AircraftParams PlayerAir = FlightModel.F22APublicDataSurrogate;

    static AircraftState State(double x, double y, double z, double speed,
        double chi = 0.0, double gamma = 0.0, AircraftParams? air = null) =>
        new(new Vec3D(x, y, z), speed, gamma, chi, 0.0,
            (air ?? BanditAir).MassKg);

    static bool IsFinite(PilotCommand command) =>
        double.IsFinite(command.GDemand)
        && double.IsFinite(command.BankTarget)
        && double.IsFinite(command.Throttle)
        && double.IsFinite(command.SasRollControl);

    sealed class RidgeAhead : ITerrainSurface {
        public TerrainBounds Bounds => new(-100_000.0, 100_000.0, -100_000.0, 100_000.0);
        public double HorizontalResolutionM => 100.0;

        public bool TrySample(double eastM, double northM, out TerrainSample sample) {
            double heightM = eastM is > 500.0 and < 1_300.0 ? 2_500.0 : 0.0;
            sample = new TerrainSample(heightM, new Vec3D(0.0, 1.0, 0.0));
            return true;
        }
    }

    [Theory]
    [InlineData(96.0, 0.5)]
    [InlineData(96.0, 0.8)]
    [InlineData(110.0, 0.5)]
    [InlineData(110.0, 0.8)]
    public void SlowRampRecoveryUnloadsInsteadOfSustainingTheZoom(double speed, double gamma) {
        (double Exit, double Peak, double MinimumSpeed, double Gamma) Fly(bool enabled) {
            var bandit = new ReactiveBandit(State(0, 9500, 0, speed, gamma: gamma),
                BanditAir, PilotSkill.Competent) { AttackReengagementEnabled = enabled };
            var player = State(0, 8000, 3000, 250);
            double peak = 9500, minimum = speed;
            for (int tick = 0; tick < 30 * AircraftSim.TickHz; tick++) {
                bandit.Step(ActorObservation.Capture(player, tick), Dt);
                peak = Math.Max(peak, bandit.State.Position.Y);
                minimum = Math.Min(minimum, bandit.State.Speed);
                if (bandit.Tactic != BanditTactic.Energy)
                    return (tick * Dt, peak, minimum, bandit.State.Gamma);
                if (enabled) {
                    Assert.InRange(bandit.LastCommand.GDemand, -0.2, 1.1);
                    Assert.InRange(Math.Abs(bandit.LastCommand.BankTarget), 0, 0.65);
                    Assert.False(bandit.LastCommand.EnvelopeOverride);
                }
            }
            throw new Xunit.Sdk.XunitException("energy recovery did not finish in 30 seconds");
        }
        var legacy = Fly(false);
        var recovery = Fly(true);
        Assert.True(recovery.Exit < legacy.Exit * 0.8, $"exit {recovery.Exit:F2} vs {legacy.Exit:F2}");
        Assert.True(recovery.Peak < legacy.Peak - 100, $"peak {recovery.Peak:F0} vs {legacy.Peak:F0}");
        Assert.True(recovery.MinimumSpeed > speed * 0.95, $"minimum speed {recovery.MinimumSpeed:F1}");
        Assert.True(recovery.Gamma < 0, "recovery recommitted while still zooming");
    }

    /// FUN: the closed-loop finisher may not stare at a shot it is not getting. Against a target
    /// in a sustained hard turn, an opted-in bandit hands back to its planner within its tier's
    /// patience (plus one retry window) whenever no tick reaches the trigger's reach.
    [Theory]
    [InlineData(PilotSkill.Competent, 5.0)]
    [InlineData(PilotSkill.Veteran, 3.5)]
    [InlineData(PilotSkill.Ace, 2.5)]
    public void FinisherGivesUpAShotItIsNotGettingWithinTierPatience(PilotSkill skill, double patience) {
        double LongestStare(bool enabled) {
            var target = new AircraftSim(State(0, 4000, 850, 320, air: PlayerAir), PlayerAir);
            var bandit = new ReactiveBandit(State(-60, 3990, 0, 320), BanditAir, skill)
                { AttackReengagementEnabled = enabled };
            double stare = 0, longest = 0;
            for (int tick = 0; tick < 60 * AircraftSim.TickHz; tick++) {
                target.Step(new PilotCommand(4.0, 1.25, 1.0, 0.0), Dt);
                var observed = ActorObservation.Capture(target.State, tick);
                bandit.Step(observed, Dt);
                bool reach = BanditFireControl.InLeadFiringEnvelope(bandit.State, observed,
                    2.0 * BanditSkillProfile.For(skill).LeadFireConeRad);
                stare = bandit.FineTrackLatched && !reach && !bandit.WantsToFire(observed) ? stare + Dt : 0;
                longest = Math.Max(longest, stare);
            }
            return longest;
        }
        double fun = LongestStare(true), legacy = LongestStare(false);
        // Legacy (frozen fixtures) still stares ~40 s here; the opted-in pilot gives up in time.
        Assert.True(legacy > 20.0, $"fixture no longer reproduces the stare: legacy {legacy:F1} s");
        Assert.True(fun <= patience + 0.5, $"{skill}: finisher held {fun:F1} s without reach (patience {patience} s); legacy {legacy:F1} s");
    }

    /// FUN: a vertical fight is followed. A climbing ramp opponent does not declare the player
    /// "above the ceiling" and extend away just because the fight went up past its staging band.
    [Fact]
    public void OptedInOpponentFollowsAClimbingPlayerInsteadOfExtendingAway() {
        int CeilingDenialTicks(bool enabled) {
            var bandit = new ReactiveBandit(State(0, 3000, 0, 300, gamma: 0.6), BanditAir,
                PilotSkill.Veteran) { AttackReengagementEnabled = enabled };
            var player = State(0, 8000, 3500, 240);
            int ticks = 0;
            for (int tick = 0; tick < 25 * AircraftSim.TickHz; tick++) {
                bandit.Step(ActorObservation.Capture(player, tick), Dt);
                if (bandit.AttackStatus == "energy-ceiling" || (!enabled && bandit.Tactic == BanditTactic.Energy
                        && bandit.State.Speed > 160)) ticks++;
            }
            return ticks;
        }
        Assert.Equal(0, CeilingDenialTicks(true));
    }

    /// FUN: a Competent that over-pulled into the vertical recovers in seconds, not a minute,
    /// through ordinary roll and G, and ends nose-low and faster than it entered.
    [Theory]
    [InlineData(115.0, 1.35)]
    [InlineData(100.0, 1.2)]
    public void SteepSlowZoomSlicesTheNoseDownQuickly(double speed, double gamma) {
        (double Exit, double MinimumSpeed, double Gamma, int Reversals) Fly(bool enabled) {
            var bandit = new ReactiveBandit(State(0, 6000, 0, speed, gamma: gamma),
                BanditAir, PilotSkill.Competent) { AttackReengagementEnabled = enabled };
            var player = State(2000, 5000, 3000, 250);
            double minimum = speed, lastSign = 0;
            int reversals = 0;
            for (int tick = 0; tick < 60 * AircraftSim.TickHz; tick++) {
                bandit.Step(ActorObservation.Capture(player, tick), Dt);
                minimum = Math.Min(minimum, bandit.State.Speed);
                double sign = Math.Sign(bandit.LastCommand.BankTarget);
                if (sign != 0 && lastSign != 0 && sign != lastSign && Math.Abs(bandit.LastCommand.BankTarget) > 1.0)
                    reversals++;
                if (sign != 0) lastSign = sign;
                if (bandit.State.Gamma < 0.09)
                    return (tick * Dt, minimum, bandit.State.Gamma, reversals);
                Assert.False(bandit.LastCommand.EnvelopeOverride);
            }
            return (60, minimum, bandit.State.Gamma, reversals);
        }
        var legacy = Fly(false);
        var recovery = Fly(true);
        Assert.True(recovery.Exit < 12.0 && recovery.Exit < legacy.Exit * 0.6,
            $"nose through the horizon after {recovery.Exit:F1} s vs legacy {legacy.Exit:F1} s");
        Assert.Equal(0, recovery.Reversals);
        Assert.True(recovery.MinimumSpeed > 60.0, $"minimum speed {recovery.MinimumSpeed:F1}");
    }

    [Theory]
    [InlineData(false, 700.0)]
    [InlineData(false, 900.0)]
    [InlineData(false, 2000.0)]
    [InlineData(true, 2000.0)]
    public void PursuitForecastSavesWorkWithoutChangingPresentOrGunRange(bool presenting, double range) {
        ReactiveBandit Create(bool enabled) => new(State(0, 4000, 0, 250),
            BanditAir, PilotSkill.Competent, presenting: presenting) {
            AttackReengagementEnabled = enabled
        };
        var ordinary = Create(false);
        var ramp = Create(true);
        var target = ActorObservation.Capture(State(range * 0.5, 4000, range, 250), 0);
        ordinary.Step(target, Dt);
        ramp.Step(target, Dt);
        Assert.Equal(ordinary.AiWorkload.PlansStarted, ramp.AiWorkload.PlansStarted);
        Assert.Equal(ordinary.AiWorkload.CandidateEvaluations, ramp.AiWorkload.CandidateEvaluations);
        Assert.True(ramp.AiWorkload.PlansCompleted > 0);
        if (!presenting && range > 900)
            Assert.True(ramp.AiWorkload.ForecastSteps < ordinary.AiWorkload.ForecastSteps * 0.6);
        else {
            Assert.Equal(ordinary.AiWorkload.ForecastSteps, ramp.AiWorkload.ForecastSteps);
            Assert.Equal(ordinary.LastCommand, ramp.LastCommand);
        }
    }

    [Theory]
    [InlineData(AiComputeLevel.Full)]
    [InlineData(AiComputeLevel.Balanced)]
    [InlineData(AiComputeLevel.Constrained)]
    [InlineData(AiComputeLevel.Emergency)]
    public void ForecastFidelityIsFrozenAcrossRangeCrossing(AiComputeLevel level) {
        var bandit = new ReactiveBandit(State(0, 4000, 0, 250), BanditAir,
            PilotSkill.Competent) { AttackReengagementEnabled = true };
        bandit.ConfigureAiPlanning(level, incremental: true);
        bandit.Step(ActorObservation.Capture(State(100, 4000, 2000, 250), 0), Dt);
        var first = bandit.AiWorkload;
        Assert.True(first.CandidateEvaluations > 0);
        Assert.Equal(0, first.PlansCompleted);
        // Same contact moves into gun range while the first frozen plan is pending.
        // Off-axis geometry avoids the separate fine-track override.
        bandit.Step(ActorObservation.Capture(State(600, 4000, 300, 250), 1), Dt);
        var next = bandit.AiWorkload - first;
        Assert.Equal(0, next.PlansStarted);
        Assert.True(next.CandidateEvaluations > 0);
        Assert.Equal(first.ForecastSteps / first.CandidateEvaluations,
            next.ForecastSteps / next.CandidateEvaluations);
    }

    [Fact]
    public void LowClearanceEnergyRecoveryRetainsTheExistingSafetyCommand() {
        var initial = State(0, 1000, 0, 100, gamma: 0.5);
        var ordinary = new ReactiveBandit(initial, BanditAir, PilotSkill.Competent);
        var ramp = new ReactiveBandit(initial, BanditAir, PilotSkill.Competent) {
            AttackReengagementEnabled = true
        };
        for (int tick = 0; tick < 120; tick++) {
            var target = ActorObservation.Capture(State(0, 1500, 3000, 250), tick);
            ordinary.Step(target, Dt);
            ramp.Step(target, Dt);
            Assert.Equal(ordinary.LastCommand, ramp.LastCommand);
            Assert.Equal(ordinary.State, ramp.State);
        }
    }

    [Fact]
    public void RisingTerrainPreemptsTheRampEnergyUnload() {
        var bandit = new ReactiveBandit(State(400, 3800, 0, 100, chi: Math.PI / 2),
            BanditAir, PilotSkill.Competent, new RidgeAhead()) {
            AttackReengagementEnabled = true
        };
        bandit.Step(ActorObservation.Capture(State(4000, 4500, 0, 250), 0), Dt);
        Assert.Equal("terrain-recovery", bandit.AttackStatus);
        Assert.InRange(bandit.LastCommand.GDemand, 1.0, BanditSkillProfile.For(PilotSkill.Competent).MaxAcquireG);
        Assert.Equal(0, bandit.AiWorkload.PlansStarted);
    }

    [Theory]
    [InlineData(PilotSkill.Competent, 0.30)]
    [InlineData(PilotSkill.Veteran, 1.609)]
    [InlineData(PilotSkill.Ace, 1.609)]
    public void EarlierTurnBleedIsLimitedToTheCompetentRampPilot(PilotSkill skill, double throttle) {
        var bandit = new ReactiveBandit(State(0, 4000, 0, 250), BanditAir, skill) {
            AttackReengagementEnabled = true
        };
        var target = State(0, 4000, -5000, 300, chi: Math.PI);
        bandit.Step(ActorObservation.Capture(target, 0), Dt);
        Assert.Equal("intercept", bandit.AttackStatus);
        Assert.Equal(throttle, bandit.LastCommand.Throttle, 6);
        Assert.InRange(bandit.LastCommand.GDemand, -0.2, BanditSkillProfile.For(skill).MaxAcquireG);
        Assert.False(bandit.LastCommand.EnvelopeOverride);
    }

    [Fact]
    public void LongRangeReengagementKeepsThePathFloorClearanceGate() {
        // The ridge is in the 900 m look-ahead slice. A re-engage command must resolve its floor
        // before choosing the bank, so the old 115-degree Split-S cannot arm on a stale low aim.
        var bandit = new ReactiveBandit(
            State(0.0, 4200.0, 0.0, BeatSetup.CornerTrueAirspeedMps(BanditAir, 4200.0),
                chi: Math.PI / 2.0),
            BanditAir, PilotSkill.Ace, new RidgeAhead()) {
            AttackReengagementEnabled = true,
        };
        var player = State(4500.0, 1000.0, 0.0, 300.0, chi: Math.PI / 2.0,
            air: PlayerAir);

        bandit.Step(ActorObservation.Capture(player, 0), Dt);

        Assert.True(IsFinite(bandit.LastCommand));
        Assert.InRange(Math.Abs(bandit.LastCommand.BankTarget), 0.0, 1.30);
    }

    [Fact]
    public void LongRangeReengagementNearVerticalPublishesFiniteCommand() {
        var bandit = new ReactiveBandit(
            State(0.0, 3800.0, 0.0, 250.0, chi: Math.PI, gamma: Math.PI / 2.0),
            BanditAir, PilotSkill.Competent) {
            AttackReengagementEnabled = true,
        };
        var player = State(0.0, 4000.0, 5000.0, 310.0, chi: 0.0,
            air: PlayerAir);

        bandit.Step(ActorObservation.Capture(player, 0), Dt);

        Assert.True(IsFinite(bandit.LastCommand));
        Assert.InRange(bandit.LastCommand.BankTarget, -2.0, 2.0);
    }

    [Fact]
    public void ReengagementCommandNeverRequestsBeyondSkillGCap() {
        var bandit = new ReactiveBandit(
            State(0.0, 3000.0, 0.0, 230.0, chi: Math.PI),
            BanditAir, PilotSkill.Competent) {
            AttackReengagementEnabled = true,
        };
        var player = State(0.0, 3000.0, 6000.0, 320.0, chi: 0.0,
            air: PlayerAir);
        bandit.Step(ActorObservation.Capture(player, 0), Dt);

        BanditSkillProfile profile = BanditSkillProfile.For(PilotSkill.Competent);
        Assert.True(IsFinite(bandit.LastCommand));
        Assert.InRange(bandit.LastCommand.GDemand, -0.20, profile.MaxAcquireG + 1e-9);
    }

    [Fact]
    public void IncrementalPlannerContinuesInBoundedLanesDuringReengagement() {
        var bandit = new ReactiveBandit(
            State(0.0, 4000.0, 0.0, 250.0), BanditAir, PilotSkill.Competent) {
            AttackReengagementEnabled = true,
        };
        bandit.ConfigureAiPlanning(AiComputeLevel.Emergency, incremental: true);
        var player = State(0.0, 4000.0, 5000.0, 310.0, air: PlayerAir);

        bandit.Step(ActorObservation.Capture(player, 0), Dt);
        AiWorkloadCounters previous = bandit.AiWorkload;
        Assert.True(previous.PlansStarted > 0);
        Assert.Equal("intercept", bandit.AttackStatus);
        Assert.Equal(bandit.LastCommand, bandit.DecisionTrace.SelectedCommand);

        bool sawPlannerProgress = false;
        for (long tick = 1; tick < ReactiveBandit.LookaheadDecisionCadenceTicks - 1; tick++) {
            bandit.Step(ActorObservation.Capture(player, tick), Dt);
            AiWorkloadCounters current = bandit.AiWorkload;
            long evaluations = current.CandidateEvaluations - previous.CandidateEvaluations;
            Assert.InRange(evaluations, 0, 1);
            sawPlannerProgress |= evaluations > 0;
            Assert.Equal(bandit.LastCommand, bandit.DecisionTrace.SelectedCommand);
            previous = current;
        }

        Assert.True(sawPlannerProgress,
            "re-engagement overrode the command but starved the incremental planner");
        Assert.True(bandit.AiWorkload.PlansCompleted > 0);

        // Exiting off cadence uses the hold refreshed during intercept, without starting an
        // unscheduled plan. The normal next cadence will plan from the settled geometry.
        player = player with { Position = bandit.State.Position + bandit.State.ForwardDir() * 3000 };
        bandit.Step(ActorObservation.Capture(player, ReactiveBandit.LookaheadDecisionCadenceTicks - 1), Dt);
        Assert.Equal("track", bandit.AttackStatus);
        Assert.Equal(previous.PlansStarted, bandit.AiWorkload.PlansStarted);
        Assert.Equal(bandit.LastCommand, bandit.DecisionTrace.SelectedCommand);
    }

    [Fact]
    public void ContactChangeDuringPendingInterceptDoesNotRetainTheOldTask() {
        var bandit = new ReactiveBandit(State(0, 4000, 0, 250), BanditAir,
            PilotSkill.Competent) { AttackReengagementEnabled = true };
        bandit.ConfigureAiPlanning(AiComputeLevel.Emergency, incremental: true);
        bandit.Step(ActorObservation.Capture(State(0, 4000, 5000, 310), 0)
            with { ContactIdentity = 1 }, Dt);
        Assert.Equal("intercept", bandit.AttackStatus);
        Assert.Equal(0, bandit.AiWorkload.PlansCompleted);

        // A replacement contact inside the settle range must not inherit the old intercept.
        bandit.Step(ActorObservation.Capture(State(0, 4000, 2000, 250), 1)
            with { ContactIdentity = 2 }, Dt);
        Assert.Equal("track", bandit.AttackStatus);
        Assert.Equal(bandit.LastCommand, bandit.DecisionTrace.SelectedCommand);
    }

    [Theory]
    [InlineData(false, 0)]
    [InlineData(false, 1)]
    [InlineData(false, 2)]
    [InlineData(false, 3)]
    [InlineData(true, 0)]
    [InlineData(true, 1)]
    [InlineData(true, 2)]
    [InlineData(true, 3)]
    public void RungZeroNoLongerLeavesWholeSeedTrajectoriesUncontested(bool cohort, int seed) {
        // This pins the measured improvement, not the still-unmet 60-second attack-gap goal.
        var result = BanditPressureReport.Fly(0,
            cohort ? PilotProfile.Cohort : PilotProfile.Competent, 240, durable: false, seed);
        Assert.True(result.OpponentRounds > 0 && double.IsFinite(result.FirstCredibleS),
            $"{result.Label} seed {seed}: {result.OpponentRounds} rounds, first credible {result.FirstCredibleS}");
    }

    [Fact]
    public void PursuitFromTheSixConvertsIntoRealRoundsWithoutClimbingAway() {
        var target = new AircraftSim(State(0, 3000, 1800, 235, air: PlayerAir), PlayerAir);
        var bandit = new ReactiveBandit(State(0, 3000, 0, 260), BanditAir,
            PilotSkill.Competent) { AttackReengagementEnabled = true };
        var combat = CombatConfig.ModernVisualMerge;
        var gun = new GunKill(combat.OpponentAmmo, combat.PlayerHitsToDefeat,
            combat.OpponentGunProfile.EffectiveHitRadiusM, combat.OpponentGunProfile);
        double peak = bandit.State.Position.Y;
        for (int tick = 0; tick < 30 * AircraftSim.TickHz && gun.RoundsFired == 0; tick++) {
            target.Step(new PilotCommand(1.0, 0.0, 0.50, 0.0), Dt);
            var observed = ActorObservation.Capture(target.State, tick);
            bandit.Step(observed, Dt);
            gun.Step(bandit.WantsToFire(observed), bandit.State, target.State, Dt);
            peak = Math.Max(peak, bandit.State.Position.Y);
        }
        Assert.True(gun.RoundsFired > 0, "the bandit never followed its stern pursuit into a shot");
        Assert.True(peak < 3500, $"level pursuit climbed away to {peak:F0} m");
    }

    [Theory]
    [InlineData(0, true)]
    [InlineData(1, true)]
    [InlineData(2, true)]
    [InlineData(3, false)]
    [InlineData(-1, false)]
    public void SessionOptInIsLimitedToSingleF22Ramp(int rung, bool expected) {
        var session = new SimulationSession();
        if (rung > 0) session.ArmDirectorStateForNextStage(BanditPressureReport.RungState(rung)!);
        session.StartBeat(rung == -1 ? Beats.ModernAceDuel : Beats.ModernVisualMerge);
        session.Begin();
        session.StepFixed();
        Assert.Equal(expected, Assert.IsType<NeutralMergeBandit>(session.Bandit).AttackReengagementEnabled);
    }

    [Fact]
    public void LowClearanceReversalCannotCommandAnInvertedSlice() {
        var bandit = new ReactiveBandit(State(0, 1200, 0, 250, chi: -Math.PI / 2),
            BanditAir, PilotSkill.Competent) { AttackReengagementEnabled = true };
        bandit.Step(ActorObservation.Capture(State(4500, 500, 0, 300, chi: Math.PI / 2), 0), Dt);
        Assert.InRange(Math.Abs(bandit.LastCommand.BankTarget), 0, 1.30);
        Assert.InRange(bandit.LastCommand.Throttle, 0, BanditAir.MaxThrustFraction);
    }

    [Fact]
    public void LowEnergyStillPreemptsReengagement() {
        var bandit = new ReactiveBandit(State(0, 3000, 0, 100), BanditAir,
            PilotSkill.Competent) { AttackReengagementEnabled = true };
        bandit.Step(ActorObservation.Capture(State(0, 3000, 6000, 300), 0), Dt);
        Assert.Equal(BanditTactic.Energy, bandit.Tactic);
    }

    [Fact]
    public void RearGunThreatInterruptsAnActiveIntercept() {
        var bandit = new ReactiveBandit(State(0, 3000, 0, 250), BanditAir,
            PilotSkill.Competent) { AttackReengagementEnabled = true };
        bandit.Step(ActorObservation.Capture(State(0, 3000, 6000, 310), 0), Dt);
        var attacker = bandit.State with {
            Position = bandit.State.Position - bandit.State.ForwardDir() * 600,
            Speed = bandit.State.Speed + 50
        };
        bandit.Step(ActorObservation.Capture(attacker, 1), Dt);
        Assert.Equal(BanditTactic.Defend, bandit.Tactic);
    }

    [Fact]
    public void FrozenCarrierBeatDoesNotArmAttackReengagementOrFormation() {
        var session = new SimulationSession();
        session.StartBeat(() => Beats.CarrierApproach());
        Assert.False(session.Beat.UsesReactiveBandit);
        Assert.Empty(session.Wingmen);

        session.Begin();
        session.StepFixed();

        Assert.True(session.OpponentPresent);
        Assert.IsNotType<ReactiveBandit>(session.Bandit);
    }
}
