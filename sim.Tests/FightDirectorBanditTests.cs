using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public class FightDirectorBanditTests {
    const double Dt = 1.0 / AircraftSim.TickHz;
    static readonly AircraftParams Air = FlightModel.F22APublicDataSurrogate;

    readonly record struct RearAttackResult(
        double MaximumAttackerAngleOffRad,
        double MaximumContinuousGunWindowSeconds,
        double MaximumRangeGainM,
        bool RepointedAfterSeparating,
        BanditDecisionTrace[] Traces);

    static AircraftState State(double x, double y, double z, double speed,
        double chi = 0.0, double gamma = 0.0) =>
        new(new Vec3D(x, y, z), speed, gamma, chi, 0.0, Air.MassKg);

    static RearAttackResult FlyRearAttack(PilotSkill defenderSkill,
        double seconds = 6.0) {
        var defender = new ReactiveBandit(
            State(0.0, 3200.0, 0.0, 205.0), Air, defenderSkill);
        var attacker = new AircraftSim(
            // A real saddle is not a mathematically singular, perfectly collinear LOS. This
            // 20 m vertical displacement keeps the attacker inside the 12-degree gun window while
            // preserving a 300 m slant range and gives both pilots an unambiguous attack plane.
            State(0.0, 3180.0, -Math.Sqrt(300.0 * 300.0 - 20.0 * 20.0), 245.0),
            Air);
        var pursuit = new GunsSaddleLaw();
        var traces = new List<BanditDecisionTrace>();

        double initialRangeM = Geometry.Range(attacker.State, defender.State);
        double maximumRangeM = initialRangeM;
        double maximumAngleOffRad = 0.0;
        double continuousWindowSeconds = 0.0;
        double maximumContinuousWindowSeconds = 0.0;
        bool openedFourHundredMetres = false;
        bool repointed = false;
        long previousSelection = 0;

        int ticks = (int)(seconds * AircraftSim.TickHz);
        for (int tick = 0; tick < ticks; tick++) {
            AircraftState attackerState = attacker.State;
            AircraftState defenderState = defender.State;
            defender.Step(ActorObservation.Capture(attackerState, tick), Dt);

            DoctrineAdvice advice = pursuit.Advise(
                attackerState, defenderState, Air);
            attacker.Step(new PilotCommand(
                advice.RecommendedG, advice.RecommendedBank, 1.0, 0.0), Dt);

            double angleOffRad = Geometry.AngleOff(attacker.State, defender.State);
            maximumAngleOffRad = Math.Max(maximumAngleOffRad, angleOffRad);
            bool gunWindow = CameraSolver.GunWindow(attacker.State, defender.State);
            continuousWindowSeconds = gunWindow
                ? continuousWindowSeconds + Dt
                : 0.0;
            maximumContinuousWindowSeconds = Math.Max(
                maximumContinuousWindowSeconds, continuousWindowSeconds);

            double rangeM = Geometry.Range(attacker.State, defender.State);
            maximumRangeM = Math.Max(maximumRangeM, rangeM);
            openedFourHundredMetres |= rangeM >= initialRangeM + 400.0;
            if (openedFourHundredMetres) {
                Vec3D toAttacker = attacker.State.Position - defender.State.Position;
                if (toAttacker.Length > 1.0
                    && defender.State.ForwardDir().Dot(toAttacker.Normalized()) > 0.25)
                    repointed = true;
            }

            if (defender.DecisionTrace.SelectionSequence != previousSelection) {
                previousSelection = defender.DecisionTrace.SelectionSequence;
                traces.Add(defender.DecisionTrace);
            }
        }

        return new RearAttackResult(
            maximumAngleOffRad,
            maximumContinuousWindowSeconds,
            maximumRangeM - initialRangeM,
            repointed,
            traces.ToArray());
    }

    [Fact]
    public void LookaheadTraceAppendsThreeProfileGatedDefensiveCandidates() {
        Assert.Equal(9, BanditDecisionTrace.CandidateCapacity);
        AircraftState own = State(0.0, 3200.0, 0.0, 205.0);
        AircraftState attacker = State(0.0, 3200.0, -300.0, 245.0);

        var ace = new ReactiveBandit(own, Air, PilotSkill.Ace);
        ace.Step(ActorObservation.Capture(attacker), Dt);
        Assert.Equal(9, ace.DecisionTrace.CandidateCount);
        for (int index = 0; index < 9; index++)
            Assert.Equal(index, ace.DecisionTrace.CandidateAt(index).Id);
        Assert.All(
            Enumerable.Range(6, 3).Select(ace.DecisionTrace.CandidateAt),
            candidate => {
                Assert.True(candidate.Available);
                Assert.True(candidate.HasScore);
            });

        var veteran = new ReactiveBandit(own, Air, PilotSkill.Veteran);
        veteran.Step(ActorObservation.Capture(attacker), Dt);
        Assert.Equal(9, veteran.DecisionTrace.CandidateCount);
        Assert.All(
            Enumerable.Range(6, 2).Select(veteran.DecisionTrace.CandidateAt),
            candidate => {
                Assert.False(candidate.Available);
                Assert.False(candidate.HasScore);
            });
        Assert.True(veteran.DecisionTrace.CandidateAt(8).Available);
        Assert.True(veteran.DecisionTrace.CandidateAt(8).HasScore);
    }

    [Fact]
    public void AceDefenceForcesAnOvershootWithoutConcedingALongGunWindow() {
        // Measure the first defensive exchange. Extending this maximum over later neutral
        // re-engagements drives both tiers toward pi and erases the overshoot separation this
        // assertion is intended to pin.
        //
        // Tuning note: the nominal 10-point threat term was not strong enough to beat the
        // offensive window/range shaping in this real-kernel saddle; 24 was tuned first, then
        // 26 after the Build-91 merge (segment-swept clearance seeding shifted candidate scores
        // ~35 ms past the bound). 8 points per radian of attacker angle-off growth and a 2-point
        // closure-reversal bonus, both gated on the player actually attacking (nose within 90
        // degrees) so a fleeing target does not dilute pursuit commitment.
        RearAttackResult novice = FlyRearAttack(PilotSkill.Novice);
        RearAttackResult ace = FlyRearAttack(PilotSkill.Ace);

        Assert.True(
            ace.MaximumAttackerAngleOffRad
                > novice.MaximumAttackerAngleOffRad + 0.15,
            $"ace angle-off={ace.MaximumAttackerAngleOffRad:F2} rad, "
            + $"novice={novice.MaximumAttackerAngleOffRad:F2} rad");
        Assert.True(ace.MaximumContinuousGunWindowSeconds < 1.5,
            $"ace conceded a {ace.MaximumContinuousGunWindowSeconds:F2}s "
            + "continuous gun window");
    }

    [Fact]
    public void LosingAceSeparatesThenRepoints() {
        RearAttackResult ace = FlyRearAttack(PilotSkill.Ace, seconds: 60.0);

        Assert.True(ace.MaximumRangeGainM > 400.0,
            $"ace opened only {ace.MaximumRangeGainM:F0}m beyond the initial range");
        Assert.True(ace.RepointedAfterSeparating,
            "ace never brought its nose back toward the attacker after separating");
    }

    [Fact]
    public void DefensiveLookaheadDecisionTracesAreBitDeterministic() {
        RearAttackResult first = FlyRearAttack(PilotSkill.Ace, seconds: 12.0);
        RearAttackResult second = FlyRearAttack(PilotSkill.Ace, seconds: 12.0);

        Assert.Equal(first.Traces, second.Traces);
    }

    static string OpenerSignature(PilotSkill skill, int engagementNumber) {
        AircraftState initial = State(0.0, 3200.0, 0.0, 230.0);
        var bandit = new ReactiveBandit(
            initial, Air, skill, terrain: null, engagementNumber);
        var contact = new AircraftSim(
            State(620.0, 3350.0, 1500.0, 215.0, chi: -0.15), Air);
        var signature = new List<string>();
        long previousSelection = 0;

        for (int tick = 0; tick < 2 * AircraftSim.TickHz; tick++) {
            bandit.Step(ActorObservation.Capture(contact.State, tick), Dt);
            contact.Step(new PilotCommand(1.0, 0.0, 0.84, 0.0), Dt);
            if (bandit.DecisionTrace.SelectionSequence == previousSelection)
                continue;

            previousSelection = bandit.DecisionTrace.SelectionSequence;
            PilotCommand command = bandit.DecisionTrace.SelectedCommand;
            signature.Add(FormattableString.Invariant(
                $"{bandit.DecisionTrace.SelectedCandidateIndex}:{command.GDemand:F3},{command.BankTarget:F3},{command.Throttle:F3}"));
        }

        return string.Join("|", signature);
    }

    static string DirectedOpenerSignature(SpawnSpec spec) {
        BeatSetup beat = EngagementReportTests.ContinuousDuel();
        IBandit bandit = beat.CreateNextBandit(
            beat.Player,
            engagementNumber: 8,
            spec: spec);
        var contact = new AircraftSim(
            State(620.0, 3350.0, 1500.0, 215.0, chi: -0.15), Air);
        var signature = new List<string>();
        long previousSelection = 0;

        for (int tick = 0; tick < 2 * AircraftSim.TickHz; tick++) {
            bandit.Step(ActorObservation.Capture(contact.State, tick), Dt);
            contact.Step(new PilotCommand(1.0, 0.0, 0.84, 0.0), Dt);
            var trace = Assert.IsAssignableFrom<IBanditDecisionTraceSource>(bandit)
                .DecisionTrace;
            if (trace.SelectionSequence == previousSelection)
                continue;

            previousSelection = trace.SelectionSequence;
            PilotCommand command = trace.SelectedCommand;
            signature.Add(FormattableString.Invariant(
                $"{trace.SelectedCandidateIndex}:{command.GDemand:F3},{command.BankTarget:F3},{command.Throttle:F3}"));
        }

        return string.Join("|", signature);
    }

    [Fact]
    public void AceOpenersCycleDeterministicallyAcrossThreeEngagementDoctrines() {
        string first = OpenerSignature(PilotSkill.Ace, engagementNumber: 1);
        string second = OpenerSignature(PilotSkill.Ace, engagementNumber: 2);
        string third = OpenerSignature(PilotSkill.Ace, engagementNumber: 3);

        Assert.True(new[] { first, second, third }.Distinct().Count() >= 2,
            $"doctrine 0: {first}\ndoctrine 1: {second}\ndoctrine 2: {third}");
        Assert.Equal(second,
            OpenerSignature(PilotSkill.Ace, engagementNumber: 2));
    }

    [Fact]
    public void FightDirectorDoctrineIndexControlsTheSpawnedOpener() {
        string first = DirectedOpenerSignature(
            new SpawnSpec(PilotSkill.Ace, 0, false, "test"));
        string second = DirectedOpenerSignature(
            new SpawnSpec(PilotSkill.Ace, 1, false, "test"));
        string third = DirectedOpenerSignature(
            new SpawnSpec(PilotSkill.Ace, 2, false, "test"));

        Assert.Equal(3, new[] { first, second, third }.Distinct().Count());
    }

    [Theory]
    [InlineData(PilotSkill.Novice)]
    [InlineData(PilotSkill.Competent)]
    public void SingleDoctrineTiersIgnoreEngagementNumber(PilotSkill skill) {
        AircraftState initial = State(0.0, 3200.0, 0.0, 210.0);
        AircraftState contact = State(500.0, 3300.0, 1400.0, 205.0);
        var first = new ReactiveBandit(
            initial, Air, skill, terrain: null, engagementNumber: 1);
        var later = new ReactiveBandit(
            initial, Air, skill, terrain: null, engagementNumber: 37);

        for (int tick = 0; tick < 2 * AircraftSim.TickHz; tick++) {
            ActorObservation observation = ActorObservation.Capture(contact, tick);
            first.Step(observation, Dt);
            later.Step(observation, Dt);
            Assert.Equal(first.State, later.State);
            Assert.Equal(first.LastCommand, later.LastCommand);
            Assert.Equal(first.DecisionTrace, later.DecisionTrace);
        }
    }
}
