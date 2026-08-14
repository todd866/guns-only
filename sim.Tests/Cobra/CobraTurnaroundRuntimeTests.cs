using GunsOnly.Sim.Cobra;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Tests.Cobra;

public sealed class CobraTurnaroundRuntimeTests
{
    const double QuarterSecond = 0.25;

    static CobraTurnaroundObservation Observation(
        bool engineOperating = true,
        double collective = 0.0,
        bool actionHeld = false,
        bool hasSpare = true,
        double enginePowerFraction = 0.80,
        double mainRotorRpm = 324.0) => new(
            RecoveryRequired: true,
            InsideFob: true,
            ContactKind: VehicleContactKind.StableSurfaceContact,
            Collective: collective,
            EngineOperating: engineOperating,
            EnginePowerFraction: enginePowerFraction,
            MainRotorRpm: mainRotorRpm,
            HasSpare: hasSpare,
            ActionHeld: actionHeld);

    [Fact]
    public void DamagedContactRequiresDwellReleaseThenAFullShutdownHold()
    {
        var turnaround = new CobraTurnaroundRuntime();

        turnaround.Advance(QuarterSecond, Observation(actionHeld: true));
        turnaround.Advance(QuarterSecond, Observation(actionHeld: true));
        Assert.Equal(CobraTurnaroundPhase.Operational, turnaround.Phase);

        turnaround.Advance(QuarterSecond, Observation(actionHeld: true));
        Assert.Equal(CobraTurnaroundPhase.ShutdownRequired, turnaround.Phase);
        Assert.Equal(CobraTurnaroundAction.Release, turnaround.Action);
        Assert.False(turnaround.FlightControlsEnabled);
        Assert.False(turnaround.WeaponsEnabled);

        for (int step = 0; step < 8; step++)
            turnaround.Advance(QuarterSecond, Observation(actionHeld: true));
        Assert.Equal(0.0, turnaround.HoldProgress);

        turnaround.Advance(QuarterSecond, Observation(actionHeld: false));
        Assert.Equal(CobraTurnaroundAction.HoldShutdown, turnaround.Action);
        CobraTurnaroundDirective directive = default;
        for (int step = 0; step < 4; step++)
            directive = turnaround.Advance(
                QuarterSecond,
                Observation(actionHeld: true));

        Assert.True(directive.ShutdownEngine);
        Assert.Equal(CobraTurnaroundPhase.RotorCoast, turnaround.Phase);
        Assert.Equal(CobraTurnaroundAction.Coast, turnaround.Action);
    }

    [Fact]
    public void CollectiveMustBeDownAndAnEngineOutArrivalSkipsShutdownInput()
    {
        var running = new CobraTurnaroundRuntime();
        for (int step = 0; step < 3; step++)
            running.Advance(QuarterSecond, Observation(collective: 0.2));
        running.Advance(QuarterSecond, Observation(collective: 0.2));
        Assert.Equal(CobraTurnaroundAction.LowerCollective, running.Action);
        for (int step = 0; step < 8; step++)
            running.Advance(QuarterSecond, Observation(collective: 0.2, actionHeld: true));
        Assert.Equal(CobraTurnaroundPhase.ShutdownRequired, running.Phase);
        Assert.Equal(0.0, running.HoldProgress);

        var engineOut = new CobraTurnaroundRuntime();
        for (int step = 0; step < 3; step++)
            engineOut.Advance(QuarterSecond, Observation(
                engineOperating: false,
                enginePowerFraction: 0.0));
        Assert.Equal(CobraTurnaroundPhase.RotorCoast, engineOut.Phase);
    }

    [Fact]
    public void EngineFailureDuringShutdownReassertsShutdownAndStillRequiresSafeCoast()
    {
        var turnaround = new CobraTurnaroundRuntime();
        for (int step = 0; step < 3; step++)
            turnaround.Advance(QuarterSecond, Observation());
        Assert.Equal(CobraTurnaroundPhase.ShutdownRequired, turnaround.Phase);

        CobraTurnaroundDirective shutdown = turnaround.Advance(
            QuarterSecond,
            Observation(
                engineOperating: false,
                enginePowerFraction: 0.70,
                mainRotorRpm: 300.0));

        Assert.True(shutdown.ShutdownEngine);
        Assert.False(shutdown.TransferAirframe);
        Assert.Equal(CobraTurnaroundPhase.RotorCoast, turnaround.Phase);

        CobraTurnaroundDirective stillCoasting = turnaround.Advance(
            QuarterSecond,
            Observation(
                engineOperating: false,
                enginePowerFraction: 0.04,
                mainRotorRpm: 80.0));

        Assert.False(stillCoasting.TransferAirframe);
        Assert.Equal(CobraTurnaroundPhase.RotorCoast, turnaround.Phase);
    }

    [Fact]
    public void TransferRequiresLowPowerAndRotorThenRequiresANewStartPress()
    {
        var turnaround = new CobraTurnaroundRuntime();
        for (int step = 0; step < 3; step++)
            turnaround.Advance(QuarterSecond, Observation(
                engineOperating: false,
                enginePowerFraction: 0.0));

        Assert.Equal(CobraTurnaroundPhase.RotorCoast, turnaround.Phase);
        Assert.False(turnaround.Advance(QuarterSecond, Observation(
            engineOperating: false,
            enginePowerFraction: 0.04,
            mainRotorRpm: 80.0)).TransferAirframe);

        CobraTurnaroundDirective transfer = turnaround.Advance(
            QuarterSecond,
            Observation(
                engineOperating: false,
                actionHeld: true,
                enginePowerFraction: 0.04,
                mainRotorRpm: 45.0));
        Assert.True(transfer.TransferAirframe);
        Assert.Equal(CobraTurnaroundPhase.AwaitStartRelease, turnaround.Phase);

        for (int step = 0; step < 8; step++)
            turnaround.Advance(QuarterSecond, Observation(
                engineOperating: false,
                actionHeld: true,
                enginePowerFraction: 0.0,
                mainRotorRpm: 0.0));
        Assert.Equal(CobraTurnaroundPhase.AwaitStartRelease, turnaround.Phase);

        turnaround.Advance(QuarterSecond, Observation(
            engineOperating: false,
            actionHeld: false,
            enginePowerFraction: 0.0,
            mainRotorRpm: 0.0));
        Assert.Equal(CobraTurnaroundPhase.ColdAndDark, turnaround.Phase);

        CobraTurnaroundDirective start = default;
        for (int step = 0; step < 4; step++)
            start = turnaround.Advance(QuarterSecond, Observation(
                engineOperating: false,
                actionHeld: true,
                enginePowerFraction: 0.0,
                mainRotorRpm: 0.0));
        Assert.True(start.StartEngine);
        Assert.Equal(CobraTurnaroundPhase.Starting, turnaround.Phase);

        for (int step = 0; step < 2; step++)
            turnaround.Advance(QuarterSecond, Observation(
                mainRotorRpm: 294.0));
        Assert.Equal(CobraTurnaroundPhase.Starting, turnaround.Phase);
        turnaround.Advance(QuarterSecond, Observation(mainRotorRpm: 294.0));

        Assert.Equal(CobraTurnaroundPhase.Operational, turnaround.Phase);
        Assert.True(turnaround.FlightControlsEnabled);
        Assert.True(turnaround.WeaponsEnabled);
    }

    [Fact]
    public void NoSpareEndsOnlyAfterTheOldBirdIsSecured()
    {
        var turnaround = new CobraTurnaroundRuntime();
        for (int step = 0; step < 3; step++)
            turnaround.Advance(QuarterSecond, Observation(
                engineOperating: false,
                hasSpare: false,
                enginePowerFraction: 0.0));

        Assert.Equal(CobraTurnaroundPhase.RotorCoast, turnaround.Phase);
        CobraTurnaroundDirective secured = turnaround.Advance(
            QuarterSecond,
            Observation(
                engineOperating: false,
                hasSpare: false,
                enginePowerFraction: 0.0,
                mainRotorRpm: 45.0));

        Assert.True(secured.EndMissionNoSpare);
        Assert.False(secured.TransferAirframe);
    }
}
