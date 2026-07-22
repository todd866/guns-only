namespace GunsOnly.Sim.Tests;

public class PadlockRollAssistTests {
    const double DegreesToRadians = System.Math.PI / 180.0;
    const double Dt = 1.0 / AircraftSim.TickHz;
    const long TargetSequence = 41;

    static AircraftState State(
        double rollRateRadPerSecond = 0.0,
        QuaternionD? attitude = null) => new(
            Position: new Vec3D(0.0, 5000.0, 0.0),
            Speed: 250.0,
            Gamma: 0.0,
            Chi: 0.0,
            Bank: 0.0,
            Mass: FlightModel.F22APublicDataSurrogate.MassKg,
            BodyAttitude: attitude ?? QuaternionD.Identity,
            BodyRates: new BodyRates(rollRateRadPerSecond, 0.0, 0.0));

    static Vec3D TargetPosition(in AircraftState aircraft,
        double rollErrorDegrees, double angleOffDegrees = 60.0) {
        double error = rollErrorDegrees * DegreesToRadians;
        double angleOff = angleOffDegrees * DegreesToRadians;
        Vec3D bodyDirection = new(
            System.Math.Sin(angleOff) * System.Math.Sin(error),
            System.Math.Sin(angleOff) * System.Math.Cos(error),
            System.Math.Cos(angleOff));
        return aircraft.Position
            + aircraft.BodyAttitude.Normalized().Rotate(bodyDirection) * 5000.0;
    }

    static PilotCommand NeutralCommand(double rollControl = 0.0) => new(
        GDemand: 1.0,
        BankTarget: 0.0,
        Throttle: 1.0,
        Rudder: 0.0,
        RollControl: rollControl,
        SasRollControl: 0.0,
        DirectLateralControl: true);

    static PadlockRollAssistResult Step(PadlockRollAssist assist,
        in AircraftState aircraft, in Vec3D target, double rawPilotRoll = 0.0,
        PilotCommand? command = null, bool selected = true, bool eligible = true) =>
        assist.Step(command ?? NeutralCommand(rawPilotRoll), aircraft, target,
            TargetSequence, selected, eligible, rawPilotRoll, Dt);

    static PadlockRollAssistResult Capture(PadlockRollAssist assist,
        in AircraftState aircraft, in Vec3D target) {
        PadlockRollAssistResult result = default;
        int ticks = (int)System.Math.Ceiling(
            PadlockRollAssist.CaptureDwellSeconds / Dt);
        for (int tick = 0; tick < ticks; tick++)
            result = Step(assist, aircraft, target);
        Assert.True(result.State.Captured);
        return result;
    }

    [Fact]
    public void MirroredCapturedErrorsRequestMirroredMildSasRoll() {
        AircraftState aircraft = State();
        var rightAssist = new PadlockRollAssist();
        var leftAssist = new PadlockRollAssist();

        PadlockRollAssistResult right = Capture(rightAssist, aircraft,
            TargetPosition(aircraft, 8.0));
        PadlockRollAssistResult left = Capture(leftAssist, aircraft,
            TargetPosition(aircraft, -8.0));

        Assert.True(right.State.Active);
        Assert.True(right.State.SasRollControl > 0.0,
            $"right-plane error requested {right.State.SasRollControl:F4}");
        Assert.True(left.State.SasRollControl < 0.0,
            $"left-plane error requested {left.State.SasRollControl:F4}");
        Assert.Equal(right.State.SasRollControl,
            -left.State.SasRollControl, 10);
        Assert.InRange(System.Math.Abs(right.State.SasRollControl),
            0.0, PadlockRollAssist.MaximumSasRollControl);
        Assert.Equal(0.0, right.Command.RollControl, 12);
        Assert.Equal(right.State.SasRollControl,
            right.Command.SasRollControl, 12);
    }

    [Fact]
    public void CaptureRequiresDwellAndUsesSeparateReleaseThreshold() {
        AircraftState aircraft = State();
        var assist = new PadlockRollAssist();
        Vec3D inside = TargetPosition(aircraft, 10.0);
        int captureTicks = (int)System.Math.Ceiling(
            PadlockRollAssist.CaptureDwellSeconds / Dt);

        PadlockRollAssistResult result = default;
        for (int tick = 0; tick < captureTicks - 1; tick++)
            result = Step(assist, aircraft, inside);
        Assert.False(result.State.Captured);

        result = Step(assist, aircraft, inside);
        Assert.True(result.State.Captured);

        result = Step(assist, aircraft, TargetPosition(aircraft, 17.9));
        Assert.True(result.State.Captured);

        result = Step(assist, aircraft, TargetPosition(aircraft, 18.1));
        Assert.False(result.State.Captured);
        Assert.False(result.State.Active);
        Assert.Equal(0.0, result.State.SasRollControl, 12);
        Assert.Equal(0.0, result.Command.SasRollControl, 12);
    }

    [Theory]
    [InlineData(0.0, false)]
    [InlineData(180.0, true)]
    public void LongitudinalAxisNeverInventsAutomaticRoll(
        double angleOffDegrees, bool anyPlane) {
        AircraftState aircraft = State();
        var assist = new PadlockRollAssist();
        Vec3D target = TargetPosition(aircraft, 90.0, angleOffDegrees);

        PadlockRollAssistResult result = CaptureAxisSample(
            assist, aircraft, target);

        Assert.Equal(anyPlane, result.State.AnyPlane);
        Assert.Equal(anyPlane, result.State.Captured);
        Assert.False(result.State.Active);
        Assert.Equal(0.0, result.State.SasRollControl, 12);
        Assert.Equal(0.0, result.Command.SasRollControl, 12);
    }

    static PadlockRollAssistResult CaptureAxisSample(PadlockRollAssist assist,
        in AircraftState aircraft, in Vec3D target) {
        PadlockRollAssistResult result = default;
        for (int tick = 0; tick < 30; tick++)
            result = Step(assist, aircraft, target);
        return result;
    }

    [Fact]
    public void PilotRollOverridesImmediatelyWithoutLosingPilotAuthority() {
        AircraftState aircraft = State();
        var assist = new PadlockRollAssist();
        Vec3D target = TargetPosition(aircraft, 8.0);
        PadlockRollAssistResult captured = Capture(assist, aircraft, target);
        Assert.NotEqual(0.0, captured.Command.SasRollControl);

        PilotCommand fullLeft = NeutralCommand(-1.0);
        PadlockRollAssistResult overridden = Step(assist, aircraft, target,
            rawPilotRoll: -1.0, command: fullLeft);

        Assert.True(overridden.State.Captured,
            "a brief pilot correction may retain the capture latch");
        Assert.False(overridden.State.Active);
        Assert.Equal(-1.0, overridden.Command.RollControl, 12);
        Assert.Equal(0.0, overridden.Command.SasRollControl, 12);
        Assert.Equal(0.0, overridden.State.SasRollControl, 12);

        PadlockRollAssistResult broken = Step(assist, aircraft,
            TargetPosition(aircraft, 19.0), rawPilotRoll: -1.0, command: fullLeft);
        Assert.False(broken.State.Captured);
        Assert.Equal(-1.0, broken.Command.RollControl, 12);
        Assert.Equal(0.0, broken.Command.SasRollControl, 12);
    }

    [Fact]
    public void NearOverrideAnalogRollCannotInheritStaleOpposingAssist() {
        AircraftState aircraft = State();
        var assist = new PadlockRollAssist();
        Vec3D target = TargetPosition(aircraft, 8.0);
        PadlockRollAssistResult captured = Capture(assist, aircraft, target);
        Assert.True(captured.State.SasRollControl > 0.0);

        const double deliberateLeftRoll = -0.29;
        PadlockRollAssistResult overridden = Step(assist, aircraft, target,
            rawPilotRoll: deliberateLeftRoll,
            command: NeutralCommand(deliberateLeftRoll));

        Assert.True(overridden.State.Captured);
        Assert.True(overridden.Command.RollControl
            + overridden.Command.SasRollControl < 0.0,
            "the current pilot direction must own the total lateral command");
        Assert.InRange(System.Math.Abs(overridden.State.SasRollControl),
            0.0, 0.002);
    }

    [Fact]
    public void CapturedControllerBrakesResidualRollRate() {
        AircraftState rolling = State(20.0 * DegreesToRadians);
        var assist = new PadlockRollAssist();
        Vec3D aligned = TargetPosition(rolling, 0.0);

        PadlockRollAssistResult result = Capture(assist, rolling, aligned);
        result = Step(assist, rolling, aligned);

        Assert.True(result.State.Active);
        Assert.True(result.State.SasRollControl < 0.0,
            $"positive residual p requested {result.State.SasRollControl:F4}");
        Assert.InRange(System.Math.Abs(result.State.SasRollControl),
            0.0, PadlockRollAssist.MaximumSasRollControl);
    }

    [Fact]
    public void RightBankClosesPositivePlaneErrorOneForOne() {
        AircraftState level = State();
        Vec3D target = TargetPosition(level, 25.0);
        double oneDegree = DegreesToRadians;
        QuaternionD rightBank = new(
            System.Math.Cos(oneDegree / 2.0),
            0.0,
            0.0,
            -System.Math.Sin(oneDegree / 2.0));
        AircraftState banked = State(attitude: rightBank);

        double before = PhysicalRollError(level, target);
        double after = PhysicalRollError(banked, target);

        Assert.Equal(25.0, before / DegreesToRadians, 10);
        Assert.Equal(24.0, after / DegreesToRadians, 10);
    }

    [Fact]
    public void ClosedLoopAircraftConvergesWithoutExceedingMildAuthority() {
        AircraftState initial = State();
        var aircraft = new AircraftSim(initial,
            FlightModel.F22APublicDataSurrogate);
        Vec3D target = TargetPosition(initial, 10.0);
        var assist = new PadlockRollAssist();
        PilotCommand pilot = NeutralCommand();
        double initialError = System.Math.Abs(
            PhysicalRollError(aircraft.State, target));
        double peakAssist = 0.0;
        int signChanges = 0;
        double previousError = PhysicalRollError(aircraft.State, target);

        for (int tick = 0; tick < 2 * AircraftSim.TickHz; tick++) {
            PadlockRollAssistResult result = assist.Step(pilot, aircraft.State,
                target, TargetSequence, selected: true, eligible: true,
                rawPilotRollControl: 0.0, deltaSeconds: Dt);
            peakAssist = System.Math.Max(peakAssist,
                System.Math.Abs(result.State.SasRollControl));
            aircraft.Step(result.Command, Dt);
            double error = PhysicalRollError(aircraft.State, target);
            if (System.Math.Sign(error) != 0 && System.Math.Sign(previousError) != 0
                && System.Math.Sign(error) != System.Math.Sign(previousError))
                signChanges++;
            previousError = error;
        }

        double finalError = System.Math.Abs(
            PhysicalRollError(aircraft.State, target));
        Assert.True(finalError < 4.0 * DegreesToRadians,
            $"assist reduced {initialError / DegreesToRadians:F2} deg only to {finalError / DegreesToRadians:F2} deg");
        Assert.InRange(peakAssist, 0.001,
            PadlockRollAssist.MaximumSasRollControl + 1e-12);
        Assert.InRange(signChanges, 0, 1);
    }

    [Fact]
    public void ClosedLoopAssistRetainsASlowlyMovingTargetPlane() {
        AircraftState initial = State();
        var aircraft = new AircraftSim(initial,
            FlightModel.F22APublicDataSurrogate);
        var assist = new PadlockRollAssist();
        PilotCommand pilot = NeutralCommand();
        bool capturedOnce = false;
        bool lostAfterCapture = false;
        double squaredErrorSum = 0.0;
        int measuredTicks = 0;
        double peakAssist = 0.0;

        for (int tick = 0; tick < 3 * AircraftSim.TickHz; tick++) {
            double time = tick * Dt;
            double planeDegrees = 5.0 + 8.0 * time;
            double plane = planeDegrees * DegreesToRadians;
            double angleOff = 60.0 * DegreesToRadians;
            Vec3D direction = new(
                System.Math.Sin(angleOff) * System.Math.Sin(plane),
                System.Math.Sin(angleOff) * System.Math.Cos(plane),
                System.Math.Cos(angleOff));
            Vec3D target = aircraft.State.Position + direction * 5000.0;
            PadlockRollAssistResult result = assist.Step(pilot, aircraft.State,
                target, TargetSequence, selected: true, eligible: true,
                rawPilotRollControl: 0.0, deltaSeconds: Dt);
            if (result.State.Captured) capturedOnce = true;
            else if (capturedOnce) lostAfterCapture = true;
            peakAssist = System.Math.Max(peakAssist,
                System.Math.Abs(result.State.SasRollControl));
            aircraft.Step(result.Command, Dt);
            if (capturedOnce) {
                double error = PhysicalRollError(aircraft.State, target);
                squaredErrorSum += error * error;
                measuredTicks++;
            }
        }

        double rmsErrorDegrees = System.Math.Sqrt(
            squaredErrorSum / System.Math.Max(1, measuredTicks))
            / DegreesToRadians;
        Assert.True(capturedOnce);
        Assert.False(lostAfterCapture,
            "an 8 deg/s target plane escaped the 18-degree retention gate");
        Assert.InRange(rmsErrorDegrees, 0.0, 10.0);
        Assert.InRange(peakAssist, 0.001,
            PadlockRollAssist.MaximumSasRollControl + 1e-12);
    }

    [Fact]
    public void ClosedLoopAssistRetainsPlaneDuringSixGTrackingPull() {
        AircraftState initial = State();
        var aircraft = new AircraftSim(initial,
            FlightModel.F22APublicDataSurrogate);
        var assist = new PadlockRollAssist();
        Vec3D target = TargetPosition(initial, 8.0);
        PilotCommand pull = NeutralCommand() with { GDemand = 6.0 };
        bool capturedOnce = false;
        bool lostAfterCapture = false;
        double peakAssist = 0.0;
        double peakError = 0.0;

        for (int tick = 0; tick < 2 * AircraftSim.TickHz; tick++) {
            PadlockRollAssistResult result = assist.Step(pull, aircraft.State,
                target, TargetSequence, selected: true, eligible: true,
                rawPilotRollControl: 0.0, deltaSeconds: Dt);
            if (result.State.Captured) capturedOnce = true;
            else if (capturedOnce) lostAfterCapture = true;
            peakAssist = System.Math.Max(peakAssist,
                System.Math.Abs(result.State.SasRollControl));
            peakError = System.Math.Max(peakError,
                System.Math.Abs(result.State.RollErrorRad));
            aircraft.Step(result.Command, Dt);
        }

        Assert.True(capturedOnce);
        Assert.False(lostAfterCapture,
            $"six-G tracking pull escaped at {peakError / DegreesToRadians:F1} deg");
        Assert.InRange(peakAssist, 0.001,
            PadlockRollAssist.MaximumSasRollControl + 1e-12);
    }

    [Fact]
    public void IneligiblePathIsBitForBitTransparentAndResetsCapture() {
        AircraftState aircraft = State();
        Vec3D target = TargetPosition(aircraft, 7.0);
        var assist = new PadlockRollAssist();
        Capture(assist, aircraft, target);
        PilotCommand command = NeutralCommand(0.12) with {
            SasRollControl = -0.04,
            Rudder = 0.2,
            GDemand = 4.0
        };

        PadlockRollAssistResult result = Step(assist, aircraft, target,
            rawPilotRoll: 0.12, command: command, eligible: false);

        Assert.Equal(command, result.Command);
        Assert.False(result.State.Captured);
        Assert.False(result.State.Active);
        Assert.Equal(0.0, result.State.SasRollControl, 12);
    }

    static double PhysicalRollError(in AircraftState aircraft,
        in Vec3D targetPosition) {
        Vec3D lineOfSight = (targetPosition - aircraft.Position).Normalized();
        QuaternionD attitude = aircraft.BodyAttitude.Normalized();
        Vec3D right = attitude.Rotate(new Vec3D(1.0, 0.0, 0.0));
        Vec3D up = attitude.Rotate(new Vec3D(0.0, 1.0, 0.0));
        return System.Math.Atan2(lineOfSight.Dot(right), lineOfSight.Dot(up));
    }
}
