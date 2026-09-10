using GunsOnly.Sim.Okanagan;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests.Okanagan;

public sealed class FireBossSurfaceKinematicsTests(ITestOutputHelper output)
{
    const double Deg = Math.PI / 180;

    [Theory]
    [InlineData(7, 8, 1, 4, 4)]
    [InlineData(-6, 5, -2, -3, 7)]
    [InlineData(0, 0, 0, 0, 12)]
    public void BodyRatesAgreeWithIndependentQuaternionOrientationDerivative(
        double bankDeg, double pitchDeg, double rollRateDeg, double pitchRateDeg, double headingRateDeg)
    {
        double bank = bankDeg * Deg, pitch = pitchDeg * Deg;
        double rollRate = rollRateDeg * Deg, pitchRate = pitchRateDeg * Deg, headingRate = headingRateDeg * Deg;
        BodyRates expected = DifferentiateOrientation(1.2, pitch, bank, headingRate, pitchRate, rollRate);
        BodyRates actual = FireBossSurfaceKinematics.ToBodyRates(bank, pitch, rollRate, pitchRate, headingRate);
        AssertRates(expected, actual);
        var recovered = FireBossSurfaceKinematics.ToEulerRates(bank, pitch, actual, headingRate);
        Assert.InRange(Math.Abs(recovered.Roll - rollRate), 0, 1e-12);
        Assert.InRange(Math.Abs(recovered.Pitch - pitchRate), 0, 1e-12);
    }

    [Fact]
    public void StraightWingsLevelContactKeepsTheExistingPitchAndRollRatesExactly()
    {
        var body = new BodyRates(0.017, 0.083, 0);
        var euler = FireBossSurfaceKinematics.ToEulerRates(0, 0.12, body, 0);
        Assert.Equal(body.P, euler.Roll);
        Assert.Equal(body.Q, euler.Pitch);
        Assert.Equal(body, FireBossSurfaceKinematics.ToBodyRates(0, 0.12, euler.Roll, euler.Pitch, 0));
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void SimultaneousSteeringAndRotationHandsOffTheBodyRateOfTheActualSurfaceMotion(bool water)
    {
        FireBossDynamics aircraft = water ? FireBossDynamics.OnScoopLane() : FireBossDynamics.AtKelownaDeparture();
        AircraftState original = aircraft.SharedAircraft.State;
        const double initialPitch = 3 * Deg, initialBank = 4 * Deg;
        var initial = original with {
            Speed = 50, Gamma = 0, Bank = initialBank,
            BodyAttitude = Orientation(original.Chi, initialPitch, initialBank),
            BodyRates = DifferentiateOrientation(original.Chi, initialPitch, initialBank, 4 * Deg, 2 * Deg, 1 * Deg),
        };
        aircraft.SharedAircraft.AdoptExternalKinematics(initial);
        double previousHeading = aircraft.SharedAircraft.BodyYawRad;
        double previousPitch = aircraft.SharedAircraft.BodyPitchRad;
        double previousBank = aircraft.SharedAircraft.BodyRollRad;
        aircraft.Step(new FireBossPilotCommand(0.15, 0.1, 0.6, 1, false, false));
        Assert.Equal(FireBossSurfaceMode.Airborne, aircraft.Telemetry.SurfaceMode);
        double heading = aircraft.SharedAircraft.BodyYawRad;
        double pitch = aircraft.SharedAircraft.BodyPitchRad;
        double bank = aircraft.SharedAircraft.BodyRollRad;
        double dt = FireBossDynamics.FixedDeltaSeconds;
        double headingRate = Math.Atan2(Math.Sin(heading - previousHeading), Math.Cos(heading - previousHeading)) / dt;
        double pitchRate = (pitch - previousPitch) / dt;
        double rollRate = (bank - previousBank) / dt;
        // The fixture stays away from angular stops, so the measured Euler increments are the
        // actual contact rates. Differentiate a quaternion at the final pose, not the conversion
        // helper, to obtain the body's instantaneous angular velocity independently.
        BodyRates expected = DifferentiateOrientation(heading, pitch, bank, headingRate, pitchRate, rollRate);
        BodyRates actual = aircraft.SharedAircraft.State.BodyRates;
        output.WriteLine($"{(water ? "water" : "runway")}: measured P/Q/R="
            + $"{expected.P / Deg:F5}/{expected.Q / Deg:F5}/{expected.R / Deg:F5}; stored="
            + $"{actual.P / Deg:F5}/{actual.Q / Deg:F5}/{actual.R / Deg:F5} deg/s");
        Assert.True(Math.Abs(headingRate) > 1 * Deg && Math.Abs(pitchRate) > 1 * Deg);
        Assert.InRange(pitch, 1 * Deg, 6 * Deg);
        Assert.InRange(bank, 2 * Deg, 6 * Deg);
        AssertRates(expected, actual);
        Assert.Equal(initial.Position.Y, aircraft.SharedAircraft.State.Position.Y);
        Assert.Equal(0, aircraft.SharedAircraft.State.VelocityVector().Y);
    }

    static BodyRates DifferentiateOrientation(double heading, double pitch, double bank,
        double headingRate, double pitchRate, double rollRate)
    {
        const double h = 1e-5;
        QuaternionD attitude = Orientation(heading, pitch, bank);
        QuaternionD before = Orientation(heading - headingRate * h, pitch - pitchRate * h, bank - rollRate * h);
        QuaternionD after = Orientation(heading + headingRate * h, pitch + pitchRate * h, bank + rollRate * h);
        QuaternionD derivative = (after + before * -1) * (0.5 / h);
        QuaternionD bodyOmega = attitude.Conjugate() * derivative * 2;
        // Kernel convention: quaternion angular velocity is (x=-Q, y=R, z=-P).
        return new(-bodyOmega.Z, -bodyOmega.X, bodyOmega.Y);
    }

    static QuaternionD Orientation(double heading, double pitch, double bank) =>
        new QuaternionD(Math.Cos(heading / 2), 0, Math.Sin(heading / 2), 0)
        * new QuaternionD(Math.Cos(pitch / 2), -Math.Sin(pitch / 2), 0, 0)
        * new QuaternionD(Math.Cos(bank / 2), 0, 0, -Math.Sin(bank / 2));

    static void AssertRates(BodyRates expected, BodyRates actual)
    {
        Assert.InRange(Math.Abs(expected.P - actual.P), 0, 2e-8);
        Assert.InRange(Math.Abs(expected.Q - actual.Q), 0, 2e-8);
        Assert.InRange(Math.Abs(expected.R - actual.R), 0, 2e-8);
    }
}
