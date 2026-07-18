using GunsOnly.Sim;
using Xunit;

namespace GunsOnly.Sim.Tests;

public class TurnCoordinationTests {
    const double Dt = 1.0 / AircraftSim.TickHz;
    const double Deg = 180.0 / System.Math.PI;

    static AircraftState Level(double speed = 220.0, double altitude = 3500.0, double bank = 0.0) =>
        new(new Vec3D(0.0, altitude, 0.0), speed, 0.0, 0.0, bank, FlightModel.Sabre.MassKg);

    static AircraftState WithYawOffset(AircraftState initial, double yaw) {
        var trimmed = new AircraftSim(initial, FlightModel.Sabre).State;
        var rotation = new QuaternionD(System.Math.Cos(yaw / 2.0), 0.0,
            System.Math.Sin(yaw / 2.0), 0.0);
        return trimmed with { BodyAttitude = rotation * trimmed.BodyAttitude };
    }

    [Fact]
    public void HardPullWithoutRollOrRudderStaysWingsLevelAndCoordinated() {
        var sim = new AircraftSim(Level(), FlightModel.Sabre);
        var pull = new PilotCommand(6.5, 0.0, 1.0, 0.0);
        double maxBank = 0.0, maxBeta = 0.0;

        for (int i = 0; i < 300; i++) { // 2.5 s: a hard, sustained pull without reaching the horizon-bank pole
            sim.Step(pull, Dt);
            maxBank = System.Math.Max(maxBank, System.Math.Abs(sim.BodyRollRad));
            maxBeta = System.Math.Max(maxBeta, System.Math.Abs(sim.SideslipRad));
        }

        Assert.True(maxBank * Deg < 5.0, $"uncommanded bank drift was {maxBank * Deg:F2} deg");
        Assert.True(maxBeta * Deg < 3.0, $"hard-pull sideslip reached {maxBeta * Deg:F2} deg");
    }

    [Fact]
    public void HardPullRejectsARealFightScaleSideslipWithoutRollingAway() {
        // BUILD 26 captured up to 21 deg beta during pulls. Start with that same disturbance and
        // require the coordinator to center it within a second while roll hold contains the wing drop.
        var sim = new AircraftSim(WithYawOffset(Level(), 21.0 / Deg), FlightModel.Sabre);
        var pull = new PilotCommand(6.5, 0.0, 1.0, 0.0);
        double maxBank = 0.0, maxBetaAfterOneSecond = 0.0;

        for (int i = 0; i < 360; i++) {
            sim.Step(pull, Dt);
            maxBank = System.Math.Max(maxBank, System.Math.Abs(sim.BodyRollRad));
            if (i >= 120)
                maxBetaAfterOneSecond = System.Math.Max(maxBetaAfterOneSecond,
                    System.Math.Abs(sim.SideslipRad));
        }

        Assert.True(maxBank * Deg < 5.0, $"sideslip disturbance rolled the jet {maxBank * Deg:F2} deg");
        Assert.True(maxBetaAfterOneSecond * Deg < 4.0,
            $"beta remained {maxBetaAfterOneSecond * Deg:F2} deg after one second");
    }

    [Fact]
    public void BankedHardPullStaysCoordinated() {
        double bank = 45.0 / Deg;
        var sim = new AircraftSim(Level(bank: bank), FlightModel.Sabre);
        var pull = new PilotCommand(6.5, bank, 1.0, 0.0);
        double maxBeta = 0.0;

        for (int i = 0; i < 360; i++) {
            sim.Step(pull, Dt);
            maxBeta = System.Math.Max(maxBeta, System.Math.Abs(sim.SideslipRad));
        }

        Assert.True(maxBeta * Deg < 3.0, $"banked pull reached {maxBeta * Deg:F2} deg beta");
    }

    [Fact]
    public void CommandedRollRetainsFullAuthority() {
        var sim = new AircraftSim(Level(), FlightModel.Sabre);
        var roll = new PilotCommand(1.0, System.Math.PI / 2.0, 1.0, 0.0);
        double maxRollRate = 0.0;

        for (int i = 0; i < 240; i++) {
            sim.Step(roll, Dt);
            maxRollRate = System.Math.Max(maxRollRate, System.Math.Abs(sim.State.BodyRates.P));
        }

        Assert.True(sim.BodyRollRad * Deg > 80.0, $"commanded roll only reached {sim.BodyRollRad * Deg:F2} deg");
        Assert.True(maxRollRate > FlightModel.Sabre.RollRateMaxRad,
            $"commanded roll rate only reached {maxRollRate * Deg:F2} deg/s");
    }

    [Fact]
    public void UncommandedRollRateIsCapturedInsteadOfWandering() {
        var trimmed = new AircraftSim(Level(), FlightModel.Sabre).State;
        var disturbed = trimmed with { BodyRates = new BodyRates(22.0 / Deg, 0.0, 0.0) };
        var sim = new AircraftSim(disturbed, FlightModel.Sabre);
        var handsOff = new PilotCommand(1.0, 0.0, 1.0, 0.0);
        double maxBank = 0.0;

        for (int i = 0; i < 240; i++) {
            sim.Step(handsOff, Dt);
            maxBank = System.Math.Max(maxBank, System.Math.Abs(sim.BodyRollRad));
        }

        Assert.True(maxBank * Deg < 1.75, $"22 deg/s disturbance wandered to {maxBank * Deg:F2} deg bank");
        Assert.True(System.Math.Abs(sim.State.BodyRates.P) * Deg < 0.5,
            $"uncommanded roll rate persisted at {sim.State.BodyRates.P * Deg:F2} deg/s");
    }

    [Fact]
    public void CoordinationIsDeterministic() {
        var initial = WithYawOffset(Level(), 8.0 / Deg);
        var a = new AircraftSim(initial, FlightModel.Sabre);
        var b = new AircraftSim(initial, FlightModel.Sabre);
        var pull = new PilotCommand(6.5, 0.0, 1.0, 0.0);

        for (int i = 0; i < 600; i++) {
            a.Step(pull, Dt);
            b.Step(pull, Dt);
        }

        Assert.Equal(a.State, b.State);
        Assert.Equal(a.SideslipRad, b.SideslipRad);
    }
}
