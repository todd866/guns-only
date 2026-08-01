using GunsOnly.Sim.Korea;

namespace GunsOnly.Sim.Tests.Korea;

public sealed class DamageInspectionFlightTests {
    static readonly DamageInspectionDefinition Definition = new(
        maximumRangeM: 30.0,
        maximumAbsoluteClosureMps: 1.5,
        maximumAbsoluteRelativeRollRad: 0.3,
        requiredDwellTicks: 3);

    [Fact]
    public void InspectionRequiresGeometryLineOfSightAndFullDwell() {
        DamageInspectionState state = DamageInspectionState.None;

        state = DamageInspectionFlight.Advance(state, Observation(), Definition);
        Assert.Equal(1, state.ConsecutiveQualifiedTicks);
        Assert.False(state.Complete);
        state = DamageInspectionFlight.Advance(state, Observation(), Definition);
        Assert.Equal(2, state.ConsecutiveQualifiedTicks);
        Assert.False(state.Complete);
        state = DamageInspectionFlight.Advance(state, Observation(), Definition);

        Assert.True(state.Complete);
        Assert.Equal(Damage().ProfileId, state.Report.ProfileId);
        Assert.True(state.Report.RightOuterWingAbsent);
    }

    [Fact]
    public void LeavingStationResetsDwellAndCannotLeakAReport() {
        DamageInspectionState state = DamageInspectionFlight.Advance(
            DamageInspectionState.None, Observation(), Definition);
        CarpenterInspectionObservation obscured = Observation(lineOfSight: false);

        state = DamageInspectionFlight.Advance(state, obscured, Definition);

        Assert.Equal(DamageInspectionState.None, state);
        DamageInspectionSnapshot snapshot = DamageInspectionFlight.Project(
            state, obscured, Definition);
        Assert.False(snapshot.CarpenterInInspectionStation);
        Assert.False(snapshot.Complete);
        Assert.False(snapshot.Report.IsPresent);
    }

    [Theory]
    [InlineData(31.0, 0.0, 0.0)]
    [InlineData(20.0, 1.6, 0.0)]
    [InlineData(20.0, 0.0, 0.31)]
    public void RangeClosureAndRelativeRollArePhysicalGates(
        double rangeM,
        double closureMps,
        double relativeRollRad) {
        CarpenterInspectionObservation observation = Observation(
            rangeM, closureMps, relativeRollRad);

        Assert.False(DamageInspectionFlight.Qualifies(observation, Definition));
    }

    [Fact]
    public void CompletedReportIsStickyAndContainsNoAerodynamicState() {
        DamageInspectionState state = DamageInspectionState.None;
        for (int tick = 0; tick < Definition.RequiredDwellTicks; tick++)
            state = DamageInspectionFlight.Advance(state, Observation(), Definition);

        DamageInspectionState afterLossOfSight = DamageInspectionFlight.Advance(
            state, Observation(lineOfSight: false), Definition);

        Assert.Equal(state, afterLossOfSight);
        Assert.DoesNotContain(
            typeof(CarpenterInspectionObservation).GetProperties(),
            property => property.PropertyType == typeof(AirframeAerodynamicState)
                || property.Name.Contains("Coefficient", StringComparison.Ordinal)
                || property.Name.Contains("Health", StringComparison.Ordinal));
    }

    static CarpenterInspectionObservation Observation(
        double rangeM = 20.0,
        double closureMps = 0.5,
        double relativeRollRad = 0.1,
        bool lineOfSight = true) => new(
        "actor.carpenter.v1",
        worldPosition: new Vec3D(rangeM, 1_000.0, 0.0),
        relativePosition: new Vec3D(rangeM, 0.0, 0.0),
        closureMps,
        relativeRollRad,
        lineOfSight,
        Damage());

    static VisibleAirframeDamage Damage() =>
        PantherRightOuterWingLossFamily.ForExtent(
            PantherRightOuterWingLossExtent.SevenFeet).VisibleDamage;
}
