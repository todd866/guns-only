using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim.Tests;

/// <summary>
/// Frame-budget contracts for adaptive opponent planning.
///
/// Elapsed-time assertions are deliberately absent: JIT state, host load and native-versus-WASM
/// execution make them unsuitable for deterministic CI. The kernel's monotonic counters instead
/// report the exact speculative work performed by each production Advance call.
/// </summary>
public class AiPlannerWorkloadBudgetTests {
    const int CadenceTicks =
        ReactiveBandit.LookaheadDecisionCadenceTicks;
    const int CandidateCount = BanditDecisionTrace.CandidateCapacity;
    const int AceHorizonTicks = 150;

    sealed class FlatTerrain : ITerrainSurface {
        public TerrainBounds Bounds { get; } =
            new(-100_000.0, 100_000.0, -100_000.0, 100_000.0);
        public double HorizontalResolutionM => 240.0;

        public bool TrySample(
            double eastM,
            double northM,
            out TerrainSample sample) {
            if (!Bounds.Contains(eastM, northM)) {
                sample = default;
                return false;
            }
            sample = new TerrainSample(0.0, new Vec3D(0.0, 1.0, 0.0));
            return true;
        }
    }

    [Theory]
    [InlineData(1, AiComputeLevel.Full)]
    [InlineData(1, AiComputeLevel.Balanced)]
    [InlineData(1, AiComputeLevel.Constrained)]
    [InlineData(1, AiComputeLevel.Emergency)]
    [InlineData(2, AiComputeLevel.Full)]
    [InlineData(2, AiComputeLevel.Balanced)]
    [InlineData(2, AiComputeLevel.Constrained)]
    [InlineData(2, AiComputeLevel.Emergency)]
    public void SixtyFpsAdvanceStaysWithinCandidateBudget(
        int formationSize,
        AiComputeLevel level) {
        AssertAdvanceBudgetAcrossEveryPhase(
            formationSize,
            level,
            elapsedSeconds: 1.0 / 60.0,
            expectedTicks: 2);
    }

    [Theory]
    [InlineData(1, AiComputeLevel.Full)]
    [InlineData(1, AiComputeLevel.Balanced)]
    [InlineData(1, AiComputeLevel.Constrained)]
    [InlineData(1, AiComputeLevel.Emergency)]
    [InlineData(2, AiComputeLevel.Full)]
    [InlineData(2, AiComputeLevel.Balanced)]
    [InlineData(2, AiComputeLevel.Constrained)]
    [InlineData(2, AiComputeLevel.Emergency)]
    public void BrowserFourTickCapStaysWithinCandidateBudget(
        int formationSize,
        AiComputeLevel level) {
        AssertAdvanceBudgetAcrossEveryPhase(
            formationSize,
            level,
            elapsedSeconds: 4.0 / AircraftSim.TickHz,
            expectedTicks: 4,
            retainedTickFraction: 0.99);
    }

    [Theory]
    [InlineData(1, AiComputeLevel.Full)]
    [InlineData(1, AiComputeLevel.Balanced)]
    [InlineData(1, AiComputeLevel.Constrained)]
    [InlineData(1, AiComputeLevel.Emergency)]
    [InlineData(2, AiComputeLevel.Full)]
    [InlineData(2, AiComputeLevel.Balanced)]
    [InlineData(2, AiComputeLevel.Constrained)]
    [InlineData(2, AiComputeLevel.Emergency)]
    public void RafJitterWithRetainedRemainderStaysWithinPerTickBudget(
        int formationSize,
        AiComputeLevel level) {
        // A real RAF stream does not begin every callback with an empty fixed-step accumulator.
        // A slightly late nominal frame can therefore execute three 120 Hz ticks. Bound work by
        // the ticks actually executed rather than pretending every ~60 Hz callback is exactly two.
        AssertAdvanceBudgetAcrossEveryPhase(
            formationSize,
            level,
            elapsedSeconds: 2.02 / AircraftSim.TickHz,
            expectedTicks: 3,
            retainedTickFraction: 0.99);
    }

    [Fact]
    public void AbsolutePairLanesStayBoundedAcrossNeutralHandoffAndTacticalPreemption() {
        var terrain = new FlatTerrain();
        WeatherProfile weather = WorkloadWeather(terrain);
        var session = new SimulationSession(weather: weather);
        session.StartBeat(() => Beats.ModernVisualMerge() with {
            // Keep the production Ace/Ace pair and merge geometry, but disarm the fixture so a
            // gun result cannot replace either stable actor while their workload is inspected.
            Combat = CombatConfig.ModernVisualMerge with {
                PlayerAmmo = 0,
                OpponentAmmo = 0
            }
        }, weather);
        session.SetAutoGcasEnabled(false);
        session.SetAiComputeLevel(AiComputeLevel.Full);

        var merge = Assert.IsType<NeutralMergeBandit>(session.Bandit);
        var support = Assert.IsType<ReactiveBandit>(
            Assert.Single(session.Wingmen).Bandit);
        int primaryPhase = Assert.IsType<int>(merge.LookaheadCadencePhase);
        int supportPhase = Assert.IsType<int>(support.LookaheadCadencePhase);
        int phaseSeparation = Math.Abs(primaryPhase - supportPhase);
        phaseSeparation = Math.Min(
            phaseSeparation,
            CadenceTicks - phaseSeparation);
        Assert.Equal(5, phaseSeparation);
        Assert.Equal(PilotSkill.Ace, merge.BriefedSkill);
        Assert.Equal(PilotSkill.Ace, support.Skill);
        session.Begin();

        long maximumCandidateEvaluationsPerTick = 0;
        bool observedSupportWork = false;
        void StepAndAssertPairBudget() {
            AiWorkloadCounters before =
                merge.AiWorkload + support.AiWorkload;
            long primaryCompletionsBefore =
                merge.AiWorkload.PlansCompleted;
            long supportCompletionsBefore =
                support.AiWorkload.PlansCompleted;
            long tickBefore = session.Tick;
            session.StepFixed();
            AiWorkloadCounters work =
                merge.AiWorkload + support.AiWorkload - before;
            Assert.Equal(tickBefore + 1, session.Tick);
            Assert.InRange(work.CandidateEvaluations, 0, 2);
            Assert.False(
                merge.AiWorkload.PlansCompleted
                    > primaryCompletionsBefore
                && support.AiWorkload.PlansCompleted
                    > supportCompletionsBefore,
                "absolute formation lanes completed both plans on one tick");
            maximumCandidateEvaluationsPerTick = Math.Max(
                maximumCandidateEvaluationsPerTick,
                work.CandidateEvaluations);
            observedSupportWork |= support.AiWorkload.CandidateEvaluations > 0;
        }

        for (int tick = 0;
            tick < 40 * AircraftSim.TickHz && !merge.FirstPassComplete;
            tick++)
            StepAndAssertPairBudget();

        Assert.True(merge.FirstPassComplete,
            "the authored neutral pass never handed control to the reactive planner");
        Assert.Equal(primaryPhase, merge.LookaheadCadencePhase);
        Assert.True(observedSupportWork,
            "the support aircraft performed no speculative work during the neutral pass");

        // Catch the first newly opened leader plan before it completes. The temporary contact is
        // inside terrain truth and below the low-target gate, but its straight prediction leaves
        // the bounded surface. That makes the real Ace low-block corridor unavailable and forces
        // the tactical Return override to cancel the partial speculative plan.
        bool foundPendingPrimaryPlan = false;
        for (int tick = 0; tick < 4 * CadenceTicks; tick++) {
            AiWorkloadCounters before = merge.AiWorkload;
            StepAndAssertPairBudget();
            AiWorkloadCounters after = merge.AiWorkload;
            if (after.PlansStarted > before.PlansStarted
                && after.PlansCompleted == before.PlansCompleted) {
                foundPendingPrimaryPlan = true;
                break;
            }
        }
        Assert.True(foundPendingPrimaryPlan,
            "the post-handoff leader never opened an incremental plan");

        AircraftState ordinaryPlayer = session.Player.State;
        AircraftState lowBlockPlayer = ordinaryPlayer with {
            Position = new Vec3D(0.0, 300.0, 99_800.0),
            Speed = 250.0,
            Gamma = 0.0,
            Chi = 0.0,
            Bank = 0.0,
            BodyAttitude = QuaternionD.Identity,
            BodyRates = default
        };
        Assert.True(terrain.TrySample(
            lowBlockPlayer.Position.X,
            lowBlockPlayer.Position.Z,
            out _));
        Vec3D predictedLowBlockPosition = lowBlockPlayer.Position
            + lowBlockPlayer.VelocityVector() * 1.35;
        Assert.False(terrain.TrySample(
            predictedLowBlockPosition.X,
            predictedLowBlockPosition.Z,
            out _));
        session.Player.AdoptExternalKinematics(lowBlockPlayer);
        AiWorkloadCounters beforePreemption = merge.AiWorkload;
        long selectionBeforePreemption =
            merge.DecisionTrace.SelectionSequence;
        StepAndAssertPairBudget();
        AiWorkloadCounters afterPreemption = merge.AiWorkload;

        Assert.Equal(beforePreemption, afterPreemption);
        Assert.Equal(selectionBeforePreemption + 1,
            merge.DecisionTrace.SelectionSequence);
        Assert.Equal(1, merge.DecisionTrace.CandidateCount);
        Assert.Equal(BanditTactic.Return, merge.PolicyMemory.Tactic);
        Assert.Equal(AircraftTerminalState.Flying,
            session.PlayerTerminalState);
        Assert.True(terrain.TrySample(
            session.Player.State.Position.X,
            session.Player.State.Position.Z,
            out _));

        // Restore ordinary geometry. A canceled partial plan must not resume on this next tick:
        // candidate work may restart only when a fresh plan opens on the actor's absolute lane.
        session.Player.AdoptExternalKinematics(ordinaryPlayer with {
            Mass = session.Player.State.Mass
        });
        bool observedAbsoluteLaneRestart = false;
        long canceledCandidateEvaluations =
            afterPreemption.CandidateEvaluations;
        long canceledPlansCompleted = afterPreemption.PlansCompleted;
        StepAndAssertPairBudget();
        Assert.Equal(afterPreemption, merge.AiWorkload);
        for (int tick = 0; tick <= CadenceTicks; tick++) {
            long sourceTick = session.Tick;
            AiWorkloadCounters before = merge.AiWorkload;
            StepAndAssertPairBudget();
            AiWorkloadCounters after = merge.AiWorkload;
            if (after.PlansStarted == before.PlansStarted) {
                Assert.Equal(canceledCandidateEvaluations,
                    after.CandidateEvaluations);
                Assert.Equal(canceledPlansCompleted,
                    after.PlansCompleted);
                continue;
            }

            Assert.Equal(before.PlansStarted + 1, after.PlansStarted);
            Assert.Equal(primaryPhase, (int)(sourceTick % CadenceTicks));
            Assert.True(after.CandidateEvaluations
                > canceledCandidateEvaluations);
            observedAbsoluteLaneRestart = true;
            break;
        }
        Assert.True(observedAbsoluteLaneRestart,
            "the pre-empted leader never restarted on its absolute cadence lane");

        // Keep the real pair alive for several hundred further fixed ticks. This covers many
        // complete plans after the handoff instead of proving only one carefully aligned frame.
        for (int tick = 0; tick < 6 * AircraftSim.TickHz; tick++)
            StepAndAssertPairBudget();

        Assert.Equal(primaryPhase, merge.LookaheadCadencePhase);
        Assert.Equal(supportPhase, support.LookaheadCadencePhase);
        Assert.True(merge.AiWorkload.PlansCompleted > canceledPlansCompleted);
        Assert.True(support.AiWorkload.PlansCompleted > 0);
        Assert.Equal(2, session.LiveOpponentCount);
        Assert.Equal(AircraftTerminalState.Flying,
            session.PlayerTerminalState);
        Assert.Equal(2, maximumCandidateEvaluationsPerTick);
    }

    [Theory]
    [InlineData(AiComputeLevel.Full, 4, 5)]
    [InlineData(AiComputeLevel.Balanced, 6, 9)]
    [InlineData(AiComputeLevel.Constrained, 8, 9)]
    [InlineData(AiComputeLevel.Emergency, 12, 9)]
    public void CompletePlanKeepsFullHorizonAtConfiguredSubstep(
        AiComputeLevel level,
        int expectedSubstepTicks,
        int expectedCompletionTicks) {
        SimulationSession session = CreateSession(formationSize: 1, level);
        AiWorkloadCounters before = session.AiWorkload;

        int steppedTicks = 0;
        while (session.AiWorkload.PlansCompleted == before.PlansCompleted
            && steppedTicks < CadenceTicks) {
            session.StepFixed();
            steppedTicks++;
        }

        AiWorkloadCounters work = session.AiWorkload - before;
        int stepsPerCandidate =
            (AceHorizonTicks + expectedSubstepTicks - 1)
            / expectedSubstepTicks;
        Assert.Equal(expectedCompletionTicks, steppedTicks);
        Assert.Equal(1, work.PlansStarted);
        Assert.Equal(1, work.PlansCompleted);
        Assert.Equal(CandidateCount, work.CandidateEvaluations);
        Assert.Equal(
            CandidateCount * stepsPerCandidate,
            work.ForecastSteps);
        Assert.Equal(work.ForecastSteps, work.TerrainSweeps);

        // Completing a plan publishes one immutable selection rather than exposing a partial
        // candidate table while work is spread over several authoritative ticks.
        var trace = Assert.IsAssignableFrom<IBanditDecisionTraceSource>(
            session.Bandit).DecisionTrace;
        Assert.Equal(1, trace.SelectionSequence);
        Assert.Equal(CandidateCount, trace.CandidateCount);
        Assert.All(
            Enumerable.Range(0, CandidateCount).Select(trace.CandidateAt),
            candidate => {
                Assert.True(candidate.Available);
                Assert.True(candidate.HasScore);
            });
    }

    [Theory]
    [InlineData(1, AiComputeLevel.Full)]
    [InlineData(1, AiComputeLevel.Balanced)]
    [InlineData(1, AiComputeLevel.Constrained)]
    [InlineData(1, AiComputeLevel.Emergency)]
    [InlineData(2, AiComputeLevel.Full)]
    [InlineData(2, AiComputeLevel.Balanced)]
    [InlineData(2, AiComputeLevel.Constrained)]
    [InlineData(2, AiComputeLevel.Emergency)]
    public void FixedComputeLevelReplayIsBitDeterministic(
        int formationSize,
        AiComputeLevel level) {
        SimulationSession first = CreateSession(formationSize, level);
        SimulationSession second = CreateSession(formationSize, level);

        for (int frame = 0; frame < 24; frame++) {
            double elapsedSeconds = frame % 3 == 2
                ? 4.0 / AircraftSim.TickHz
                : 1.0 / 60.0;
            first.Advance(elapsedSeconds);
            second.Advance(elapsedSeconds);
            AssertSessionsEqual(first, second);
        }
    }

    [Fact]
    public void DynamicComputeLevelTapeIsBitDeterministic() {
        SimulationSession first =
            CreateSession(formationSize: 2, AiComputeLevel.Full);
        SimulationSession second =
            CreateSession(formationSize: 2, AiComputeLevel.Full);
        AiComputeLevel[] tape = [
            AiComputeLevel.Full,
            AiComputeLevel.Full,
            AiComputeLevel.Balanced,
            AiComputeLevel.Balanced,
            AiComputeLevel.Constrained,
            AiComputeLevel.Emergency,
            AiComputeLevel.Emergency,
            AiComputeLevel.Constrained,
            AiComputeLevel.Balanced,
            AiComputeLevel.Full
        ];

        for (int frame = 0; frame < 40; frame++) {
            AiComputeLevel level = tape[frame % tape.Length];
            first.SetAiComputeLevel(level);
            second.SetAiComputeLevel(level);
            double elapsedSeconds = frame % 4 == 3
                ? 4.0 / AircraftSim.TickHz
                : 1.0 / 60.0;
            first.Advance(elapsedSeconds);
            second.Advance(elapsedSeconds);
            AssertSessionsEqual(first, second);
        }

        // Level changes deliberately cancel partial forecasts. A replay-equal tape is not enough
        // if it can leave the planner permanently churning without ever publishing a selection.
        long completedBeforeRecovery = first.AiWorkload.PlansCompleted;
        first.SetAiComputeLevel(AiComputeLevel.Full);
        second.SetAiComputeLevel(AiComputeLevel.Full);
        for (int tick = 0;
            tick < 3 * CadenceTicks
                && first.AiWorkload.PlansCompleted == completedBeforeRecovery;
            tick++) {
            first.StepFixed();
            second.StepFixed();
            AssertSessionsEqual(first, second);
        }
        Assert.True(first.AiWorkload.PlansCompleted > completedBeforeRecovery,
            "the dynamic level tape never recovered to a completed plan");
    }

    [Fact]
    public void LivePairTerrainReanchorInvalidatesBothPlannerHoldsOffLane() {
        SimulationSession session =
            CreateSession(formationSize: 2, AiComputeLevel.Full);
        var primary = Assert.IsType<ReactiveBandit>(session.Bandit);
        var support = Assert.IsType<ReactiveBandit>(
            Assert.Single(session.Wingmen).Bandit);

        for (int tick = 0;
            tick < 3 * CadenceTicks
                && (primary.AiWorkload.PlansCompleted == 0
                    || support.AiWorkload.PlansCompleted == 0);
            tick++)
            session.StepFixed();

        Assert.True(primary.AiWorkload.PlansCompleted > 0);
        Assert.True(support.AiWorkload.PlansCompleted > 0);
        int primaryPhase = Assert.IsType<int>(
            primary.LookaheadCadencePhase);
        int supportPhase = Assert.IsType<int>(
            support.LookaheadCadencePhase);
        while ((int)(session.Tick % CadenceTicks) == primaryPhase
            || (int)(session.Tick % CadenceTicks) == supportPhase)
            session.StepFixed();

        AiWorkloadCounters primaryBefore = primary.AiWorkload;
        AiWorkloadCounters supportBefore = support.AiWorkload;
        long primarySelectionBefore =
            primary.DecisionTrace.SelectionSequence;
        long supportSelectionBefore =
            support.DecisionTrace.SelectionSequence;

        session.SetTerrainSurface(new FlatTerrain());
        session.StepFixed();

        Assert.Equal(primaryBefore, primary.AiWorkload);
        Assert.Equal(supportBefore, support.AiWorkload);
        Assert.Equal(primarySelectionBefore + 1,
            primary.DecisionTrace.SelectionSequence);
        Assert.Equal(supportSelectionBefore + 1,
            support.DecisionTrace.SelectionSequence);
        Assert.Equal(1, primary.DecisionTrace.CandidateCount);
        Assert.Equal(1, support.DecisionTrace.CandidateCount);
        Assert.Equal(primary.LastCommand,
            primary.DecisionTrace.SelectedCommand);
        Assert.Equal(support.LastCommand,
            support.DecisionTrace.SelectedCommand);
    }

    [Fact]
    public void AuthorityTickComputeLevelTapeReplaysBitDeterministically() {
        SimulationSession first =
            CreateSession(formationSize: 2, AiComputeLevel.Full);
        SimulationSession second =
            CreateSession(formationSize: 2, AiComputeLevel.Full);
        Assert.Equal(2, first.LiveOpponentCount);
        Assert.Equal(2, second.LiveOpponentCount);
        var tape = new Dictionary<long, AiComputeLevel> {
            [0] = AiComputeLevel.Full,
            [3] = AiComputeLevel.Balanced,
            [7] = AiComputeLevel.Emergency,
            [13] = AiComputeLevel.Constrained,
            [19] = AiComputeLevel.Full
        };

        long plansStartedBeforeTape =
            first.AiWorkload.PlansStarted;
        long completionsBeforeRecovery = -1;
        for (int step = 0; step < 6 * CadenceTicks; step++) {
            Assert.Equal(first.Tick, second.Tick);
            if (tape.TryGetValue(first.Tick, out AiComputeLevel level)) {
                first.SetAiComputeLevel(level);
                second.SetAiComputeLevel(level);
            }
            if (first.Tick == 19)
                completionsBeforeRecovery =
                    first.AiWorkload.PlansCompleted;
            AiWorkloadCounters before = first.AiWorkload;
            AiWorkloadCounters replayBefore = second.AiWorkload;
            first.StepFixed();
            second.StepFixed();
            AiWorkloadCounters work = first.AiWorkload - before;
            AiWorkloadCounters replayWork =
                second.AiWorkload - replayBefore;
            Assert.Equal(replayWork, work);
            Assert.InRange(work.CandidateEvaluations, 0, 2);
            AssertSessionsEqual(first, second);
        }

        Assert.True(first.AiWorkload.PlansStarted
                > plansStartedBeforeTape + 1,
            "level-change cancellations never restarted either planner");
        Assert.True(completionsBeforeRecovery >= 0);
        Assert.True(first.AiWorkload.PlansCompleted
                > completionsBeforeRecovery,
            "the live pair never recovered to a completed plan after the level tape");
        Assert.Equal(2, first.LiveOpponentCount);
        Assert.Equal(2, second.LiveOpponentCount);
    }

    static void AssertAdvanceBudgetAcrossEveryPhase(
        int formationSize,
        AiComputeLevel level,
        double elapsedSeconds,
        int expectedTicks,
        double retainedTickFraction = 0.0) {
        int maximumCandidates =
            MaximumCandidatesPerAdvance(formationSize, level, expectedTicks);
        int stepsPerCandidate =
            (AceHorizonTicks + PredictionSubstepTicks(level) - 1)
            / PredictionSubstepTicks(level);
        long observedMaximumCandidates = 0;

        for (int startPhase = 0; startPhase < CadenceTicks; startPhase++) {
            SimulationSession first = CreateSession(formationSize, level);
            SimulationSession replay = CreateSession(formationSize, level);
            first.StepFixed(startPhase);
            replay.StepFixed(startPhase);
            long tickBeforeRemainder = first.Tick;
            if (retainedTickFraction > 0.0) {
                double retainedSeconds =
                    retainedTickFraction / AircraftSim.TickHz;
                first.Advance(retainedSeconds);
                replay.Advance(retainedSeconds);
                Assert.Equal(tickBeforeRemainder, first.Tick);
                Assert.Equal(tickBeforeRemainder, replay.Tick);
            }
            AiWorkloadCounters before = first.AiWorkload;
            AiWorkloadCounters replayBefore = replay.AiWorkload;
            long tickBefore = first.Tick;

            first.Advance(elapsedSeconds);
            replay.Advance(elapsedSeconds);

            AiWorkloadCounters work = first.AiWorkload - before;
            AiWorkloadCounters replayWork =
                replay.AiWorkload - replayBefore;
            Assert.Equal(replayWork, work);
            Assert.Equal(expectedTicks, first.Tick - tickBefore);
            Assert.InRange(
                work.CandidateEvaluations,
                0,
                maximumCandidates);
            Assert.Equal(
                work.CandidateEvaluations * stepsPerCandidate,
                work.ForecastSteps);
            Assert.Equal(work.ForecastSteps, work.TerrainSweeps);
            // Formation lanes are separated by five ticks, so neither the 2-tick normal call nor
            // the browser's capped 4-tick call may open two fresh plans.
            Assert.InRange(work.PlansStarted, 0, 1);
            Assert.InRange(work.PlansCompleted, 0, 1);
            AssertSessionsEqual(first, replay);
            observedMaximumCandidates = Math.Max(
                observedMaximumCandidates,
                work.CandidateEvaluations);
        }

        // The bound is a measured kernel maximum across every possible cadence alignment, not a
        // loose ceiling which would also pass if planning silently stopped running.
        Assert.Equal(maximumCandidates, observedMaximumCandidates);
    }

    static int MaximumCandidatesPerAdvance(
        int formationSize,
        AiComputeLevel level,
        int tickCount) {
        if (formationSize == 1)
            return tickCount * (level == AiComputeLevel.Full ? 2 : 1);

        // Full evaluates two candidates for one dephased actor at a time. Pressure levels allow
        // one candidate per actor and their longer plans can overlap, still totaling at most two
        // candidate evaluations on any authoritative tick.
        return tickCount * 2;
    }

    static int PredictionSubstepTicks(AiComputeLevel level) => level switch {
        AiComputeLevel.Full => 4,
        AiComputeLevel.Balanced => 6,
        AiComputeLevel.Constrained => 8,
        AiComputeLevel.Emergency => 12,
        _ => throw new ArgumentOutOfRangeException(nameof(level))
    };

    static SimulationSession CreateSession(
        int formationSize,
        AiComputeLevel level) {
        var terrain = new FlatTerrain();
        WeatherProfile weather = WorkloadWeather(terrain);
        // Seed terrain before custom staging so the primary and any wingman constructed during
        // StageBeat receive the same immutable surface.
        var session = new SimulationSession(weather: weather);
        session.StartBeat(() => WorkloadBeat(formationSize), weather);
        session.SetAiComputeLevel(level);
        session.Begin();

        Assert.Equal(formationSize - 1, session.Wingmen.Count);
        Assert.Equal(level, session.AiComputeLevel);
        return session;
    }

    static WeatherProfile WorkloadWeather(ITerrainSurface terrain) =>
        new(
            StandardAtmosphere1976.Instance,
            new LayeredWindField(
            [
                new WindVectorLevel(-1_000.0, Vec3D.Zero),
                new WindVectorLevel(20_000.0, Vec3D.Zero)
            ]),
            ClearCloudField.Instance,
            terrain,
            id: "weather.ai-workload-budget.v1");

    static BeatSetup WorkloadBeat(int maximumFormationSize) {
        const double AltitudeM = 3_000.0;
        AircraftParams playerAir = FlightModel.F22APublicDataSurrogate;
        AircraftParams opponentAir = FlightModel.Su27SPublicDataSurrogate;
        return new BeatSetup(
            "AI planner workload budget fixture",
            new AircraftState(
                new Vec3D(0.0, AltitudeM, 0.0),
                225.0, 0.0, 0.0, 0.0, playerAir.MassKg),
            new AircraftState(
                new Vec3D(350.0, AltitudeM + 80.0, 1_600.0),
                215.0, 0.0, Math.PI, 0.0, opponentAir.MassKg),
            new PurePursuitLaw(),
            new() { (0.0, new PilotCommand(1.0, 0.0, 0.84, 0.0)) },
            PlayerParams: playerAir,
            BanditParams: opponentAir,
            UsesReactiveBandit: true,
            Combat: new CombatConfig(PlayerAmmo: 0, OpponentAmmo: 0),
            ContinuousCombat: new ContinuousCombatConfig(
                ReplacementDelaySeconds: 3.5,
                MaximumFormationSize: maximumFormationSize),
            BanditSkill: PilotSkill.Ace);
    }

    static void AssertSessionsEqual(
        SimulationSession expected,
        SimulationSession actual) {
        Assert.Equal(expected.Tick, actual.Tick);
        Assert.Equal(expected.TimeMilliseconds, actual.TimeMilliseconds);
        Assert.Equal(expected.AiComputeLevel, actual.AiComputeLevel);
        Assert.Equal(expected.AiWorkload, actual.AiWorkload);
        Assert.Equal(expected.Player.State, actual.Player.State);
        Assert.Equal(expected.Bandit.State, actual.Bandit.State);
        Assert.Equal(expected.Wingmen.Count, actual.Wingmen.Count);

        IBandit[] expectedActors = PlannerActors(expected);
        IBandit[] actualActors = PlannerActors(actual);
        Assert.Equal(expectedActors.Length, actualActors.Length);
        for (int index = 0; index < expectedActors.Length; index++) {
            Assert.Equal(expectedActors[index].State, actualActors[index].State);
            var expectedTrace =
                Assert.IsAssignableFrom<IBanditDecisionTraceSource>(
                    expectedActors[index]);
            var actualTrace =
                Assert.IsAssignableFrom<IBanditDecisionTraceSource>(
                    actualActors[index]);
            Assert.Equal(expectedTrace.AppliedCommand, actualTrace.AppliedCommand);
            Assert.Equal(expectedTrace.PolicyMemory, actualTrace.PolicyMemory);
            Assert.Equal(expectedTrace.DecisionTrace, actualTrace.DecisionTrace);
        }
    }

    static IBandit[] PlannerActors(SimulationSession session) =>
        new[] { session.Bandit }
            .Concat(session.Wingmen.Select(wingman => wingman.Bandit))
            .ToArray();
}
