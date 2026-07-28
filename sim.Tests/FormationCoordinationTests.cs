using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

public class FormationCoordinationTests {
    const long PrimaryId = 101;
    const long SupportId = 202;

    static readonly AircraftState Player = State(
        x: 0.0, z: 0.0, chi: 0.0, speed: 250.0);

    static AircraftState State(
        double x,
        double z,
        double chi,
        double speed = 250.0) =>
        new(
            new Vec3D(x, 3_000.0, z),
            speed,
            Gamma: 0.0,
            Chi: chi,
            Bank: 0.0,
            Mass: FlightModel.Su27SPublicDataSurrogate.MassKg);

    static ActorObservation Contact(long tick, double confidence = 1.0) =>
        ActorObservation.Capture(
            Player,
            sourceTick: tick,
            observationAgeTicks: 0,
            confidence: confidence);

    static FormationCoordinationMember Primary(
        in AircraftState state,
        bool active = true) =>
        new(PrimaryId, state, active);

    static FormationCoordinationMember Support(
        in AircraftState state,
        bool active = true) =>
        new(SupportId, state, active);

    static void StepThrough(
        EnemyPairCoordinator coordinator,
        long firstTick,
        long lastTick,
        in AircraftState primary,
        in AircraftState support) {
        for (long tick = firstTick; tick <= lastTick; tick++) {
            ActorObservation contact = Contact(tick);
            FormationCoordinationMember primaryMember = Primary(primary);
            FormationCoordinationMember supportMember = Support(support);
            coordinator.Step(
                tick,
                contact,
                primaryMember,
                supportMember);
        }
    }

    [Fact]
    public void FirstTickImmediatelySeedsPressureAndBracketInFormationOrder() {
        var coordinator = new EnemyPairCoordinator();
        AircraftState primary = State(-350.0, -1_100.0, chi: 0.0);
        AircraftState support = State(420.0, -1_250.0, chi: 0.0);
        ActorObservation contact = Contact(0);
        FormationCoordinationMember primaryMember = Primary(primary);
        FormationCoordinationMember supportMember = Support(support);

        coordinator.Step(
            tick: 0,
            contact,
            primaryMember,
            supportMember);

        Assert.True(coordinator.Active);
        Assert.Equal(FormationTacticalRole.Pressure, coordinator.PrimaryRole);
        Assert.Equal(FormationTacticalRole.Bracket, coordinator.SupportRole);
        Assert.Equal(1, coordinator.AssignmentSequence);
        Assert.Equal(0, coordinator.SharedContactAgeTicks);
        Assert.False(coordinator.SharedContactStale);

        FormationDirective primaryDirective =
            coordinator.DirectiveFor(PrimaryId, tick: 0);
        FormationDirective supportDirective =
            coordinator.DirectiveFor(SupportId, tick: 0);
        Assert.Equal(FormationTacticalRole.Pressure, primaryDirective.Role);
        Assert.Equal(0, primaryDirective.LateralSign);
        Assert.Equal(SupportId, primaryDirective.PartnerId);
        Assert.Equal(1, primaryDirective.AssignmentSequence);
        Assert.Equal(contact, primaryDirective.SharedContact);
        Assert.Equal(FormationTacticalRole.Bracket, supportDirective.Role);
        Assert.Equal(1, supportDirective.LateralSign);
        Assert.Equal(PrimaryId, supportDirective.PartnerId);
        Assert.Equal(
            primaryDirective.AssignmentSequence,
            supportDirective.AssignmentSequence);
    }

    [Fact]
    public void SeedRadioMessageDeliversOnExactlyTheFortySecondTick() {
        var coordinator = new EnemyPairCoordinator();
        AircraftState primary = State(-350.0, -1_100.0, chi: 0.0);
        AircraftState support = State(420.0, -1_250.0, chi: 0.0);

        StepThrough(coordinator, 0, 41, primary, support);

        Assert.Equal(1, coordinator.AssignmentSequence);
        FormationDirective before =
            coordinator.DirectiveFor(PrimaryId, tick: 41);
        Assert.Equal(1, before.AssignmentSequence);
        Assert.Equal(41, before.SharedContact.ObservationAgeTicks);

        StepThrough(coordinator, 42, 42, primary, support);

        Assert.Equal(2, coordinator.AssignmentSequence);
        FormationDirective delivered =
            coordinator.DirectiveFor(PrimaryId, tick: 42);
        Assert.Equal(2, delivered.AssignmentSequence);
        Assert.Equal(0, delivered.SharedContact.SourceTick);
        Assert.Equal(
            EnemyPairCoordinator.MessageDelayTicks,
            delivered.SharedContact.ObservationAgeTicks);
    }

    [Fact]
    public void EvaluationCadenceAndRoleDwellDelayAPressureSwapUntilTick402() {
        var coordinator = new EnemyPairCoordinator();
        // Primary is far away and pointing away. Support is close and nose-on, so the first
        // role-change-eligible evaluation should elect support to pressure.
        AircraftState primary = State(0.0, 1_600.0, chi: 0.0);
        AircraftState support = State(
            1_200.0,
            -500.0,
            chi: Math.Atan2(-1_200.0, 500.0));

        StepThrough(coordinator, 0, 359, primary, support);
        Assert.Equal(FormationTacticalRole.Pressure, coordinator.PrimaryRole);
        Assert.Equal(FormationTacticalRole.Bracket, coordinator.SupportRole);

        // Tick 360 is the first 180-tick evaluation boundary at which the 360-tick dwell has
        // elapsed. Evaluation only queues the radio message.
        StepThrough(coordinator, 360, 401, primary, support);
        Assert.Equal(FormationTacticalRole.Pressure, coordinator.PrimaryRole);
        Assert.Equal(FormationTacticalRole.Bracket, coordinator.SupportRole);

        StepThrough(coordinator, 402, 402, primary, support);
        Assert.Equal(FormationTacticalRole.Bracket, coordinator.PrimaryRole);
        Assert.Equal(FormationTacticalRole.Pressure, coordinator.SupportRole);
        Assert.Equal(4, coordinator.AssignmentSequence);
    }

    [Fact]
    public void ExactPressureScoreTiesAlwaysPreferTheFirstFormationMember() {
        var first = new EnemyPairCoordinator();
        var second = new EnemyPairCoordinator();
        AircraftState tied = State(0.0, -700.0, chi: 0.0);

        for (long tick = 0; tick <= 402; tick++) {
            ActorObservation contact = Contact(tick);
            FormationCoordinationMember primary = Primary(tied);
            FormationCoordinationMember support = Support(tied);
            first.Step(tick, contact, primary, support);
            second.Step(tick, contact, primary, support);

            Assert.Equal(
                first.DirectiveFor(PrimaryId, tick),
                second.DirectiveFor(PrimaryId, tick));
            Assert.Equal(
                first.DirectiveFor(SupportId, tick),
                second.DirectiveFor(SupportId, tick));
        }

        Assert.Equal(FormationTacticalRole.Pressure, first.PrimaryRole);
        Assert.Equal(FormationTacticalRole.Extend, first.SupportRole);
    }

    [Fact]
    public void CloseSupportExtendsOnlyAfterDwellEvaluationAndRadioDelay() {
        var coordinator = new EnemyPairCoordinator();
        AircraftState primary = State(-100.0, -700.0, chi: 0.0);
        AircraftState support = State(100.0, -750.0, chi: Math.PI);
        Assert.True(
            (primary.Position - support.Position).Length
            < EnemyPairCoordinator.ExtendPairSeparationM);

        StepThrough(coordinator, 0, 401, primary, support);
        Assert.Equal(FormationTacticalRole.Pressure, coordinator.PrimaryRole);
        Assert.Equal(FormationTacticalRole.Bracket, coordinator.SupportRole);

        StepThrough(coordinator, 402, 402, primary, support);
        Assert.Equal(FormationTacticalRole.Pressure, coordinator.PrimaryRole);
        Assert.Equal(FormationTacticalRole.Extend, coordinator.SupportRole);
        Assert.Equal(0,
            coordinator.DirectiveFor(SupportId, 402).LateralSign);
    }

    [Fact]
    public void InactiveMemberImmediatelyCollapsesPairAndCancelsQueuedAssignment() {
        var coordinator = new EnemyPairCoordinator();
        AircraftState primary = State(-100.0, -700.0, chi: 0.0);
        AircraftState support = State(100.0, -750.0, chi: Math.PI);
        StepThrough(coordinator, 0, 360, primary, support);

        // The tick-360 evaluation queued Extend for tick 402. Losing a member must erase it now.
        ActorObservation lostContact = Contact(380);
        FormationCoordinationMember primaryMember = Primary(primary);
        FormationCoordinationMember inactiveSupport = Support(support, active: false);
        coordinator.Step(
            tick: 380,
            lostContact,
            primaryMember,
            inactiveSupport);

        Assert.False(coordinator.Active);
        Assert.Equal(FormationTacticalRole.Independent, coordinator.PrimaryRole);
        Assert.Equal(FormationTacticalRole.Independent, coordinator.SupportRole);
        Assert.Equal(default,
            coordinator.DirectiveFor(PrimaryId, tick: 380));
        Assert.Equal(default,
            coordinator.DirectiveFor(SupportId, tick: 380));

        // Re-form before the old delivery edge. Only the new seed's tick-423 message may survive.
        StepThrough(coordinator, 381, 402, primary, support);
        Assert.True(coordinator.Active);
        Assert.Equal(FormationTacticalRole.Pressure, coordinator.PrimaryRole);
        Assert.Equal(FormationTacticalRole.Bracket, coordinator.SupportRole);
        Assert.Equal(1, coordinator.AssignmentSequence);

        StepThrough(coordinator, 403, 423, primary, support);
        Assert.Equal(2, coordinator.AssignmentSequence);
        Assert.Equal(FormationTacticalRole.Bracket, coordinator.SupportRole);
    }

    [Fact]
    public void SharedContactAgeAndConfidenceRefreshAndCrossPublicStaleThreshold() {
        var coordinator = new EnemyPairCoordinator();
        AircraftState primary = State(-350.0, -1_100.0, chi: 0.0);
        AircraftState support = State(420.0, -1_250.0, chi: 0.0);
        ActorObservation initialContact = Contact(0, confidence: 0.8);
        FormationCoordinationMember primaryMember = Primary(primary);
        FormationCoordinationMember supportMember = Support(support);
        coordinator.Step(
            tick: 0,
            initialContact,
            primaryMember,
            supportMember);

        FormationDirective fresh =
            coordinator.DirectiveFor(PrimaryId, tick: 0);
        FormationDirective older =
            coordinator.DirectiveFor(PrimaryId, tick: 100);
        Assert.Equal(0, fresh.SharedContact.ObservationAgeTicks);
        Assert.Equal(100, older.SharedContact.ObservationAgeTicks);
        Assert.True(older.SharedContact.Confidence
            < fresh.SharedContact.Confidence);
        Assert.True(older.SharedContact.Confidence > 0.0);

        // Jump without delivering a newer sampled contact: the seed transmission is now stale.
        ActorObservation currentContact = Contact(
            EnemyPairCoordinator.SharedContactStaleAfterTicks + 1L,
            confidence: 0.8);
        coordinator.Step(
            EnemyPairCoordinator.SharedContactStaleAfterTicks + 1L,
            currentContact,
            primaryMember,
            supportMember);

        Assert.Equal(
            EnemyPairCoordinator.SharedContactStaleAfterTicks + 1,
            coordinator.SharedContactAgeTicks);
        Assert.True(coordinator.SharedContactStale);
        FormationDirective stale = coordinator.DirectiveFor(
            PrimaryId,
            EnemyPairCoordinator.SharedContactStaleAfterTicks + 1L);
        Assert.Equal(
            EnemyPairCoordinator.SharedContactStaleAfterTicks + 1,
            stale.SharedContact.ObservationAgeTicks);
        Assert.True(stale.SharedContact.Confidence
            < fresh.SharedContact.Confidence);
    }
}
