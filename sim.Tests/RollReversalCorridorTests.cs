using GunsOnly.Sim.Doctrine;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

public class RollReversalCorridorTests {
    readonly ITestOutputHelper _output;
    public RollReversalCorridorTests(ITestOutputHelper output) => _output = output;

    sealed class Rig {
        public readonly AircraftSim Sim;
        public readonly DetentLayer Detent = new();
        public readonly KeyGrammar Keys = new();
        double _timeMs;
        const double Dt = 1.0 / AircraftSim.TickHz;
        public Rig(double speedMps) {
            AircraftParams parameters = FlightModel.F22APublicDataSurrogate;
            Sim = new AircraftSim(new AircraftState(
                new Vec3D(0.0, 4000.0, 0.0), speedMps, 0.0, 0.0, 0.0,
                parameters.MassKg), parameters);
            Sim.SeedEnginePowerFraction(0.9);
        }
        public void Set(GKey key, bool down) => Keys.Feed(key, down, _timeMs);
        public void Step() {
            Detent.AirspeedMps = Sim.AirspeedMps;
            Detent.MeasuredAngleOfAttackRad = Sim.AngleOfAttackRad;
            Detent.Tick(Keys, _timeMs, Sim.State,
                FlightModel.F22APublicDataSurrogate,
                new DoctrineAdvice(9.0, 0.0, "reversal probe"), Dt);
            Sim.Step(Detent.Command, Dt);
            _timeMs += Dt * 1000.0;
        }
    }

    // Pilot-reported corridor (Build 73): a bank reversal is the bread-and-butter defensive
    // move and must feel Raptor-crisp through the PRODUCTION input path — key grammar, detent
    // layer, derivative law, alpha schedule, everything.
    [Theory]
    [InlineData(180.0, false, 1.60, 150.0)]
    [InlineData(180.0, true, 1.60, 150.0)]
    [InlineData(250.0, true, 1.45, 155.0)]
    public void CombatReversalStaysInsideTheCorridor(double speedMps, bool pulling,
        double maxReversalSeconds, double minPeakRateDps) {
        var rig = new Rig(speedMps);
        const double Deg = 57.29577951308232;
        // Establish a left bank through the production input path.
        rig.Set(GKey.RollLeft, true);
        if (pulling) rig.Set(GKey.PullUp, true);
        int t = 0;
        while (rig.Sim.State.Bank * Deg > -60.0 && t < 6 * AircraftSim.TickHz) {
            rig.Step(); t++;
        }
        rig.Set(GKey.RollLeft, false);
        // Reversal: full right stick, measure -60 -> +60.
        rig.Set(GKey.RollRight, true);
        int start = t; double reversalS = double.NaN; double peakBankRate = 0;
        double previousBank = rig.Sim.State.Bank;
        for (int i = 0; i < 6 * AircraftSim.TickHz; i++) {
            rig.Step(); t++;
            double bank = rig.Sim.State.Bank;
            peakBankRate = System.Math.Max(peakBankRate,
                System.Math.Abs(bank - previousBank) * Deg * AircraftSim.TickHz);
            previousBank = bank;
            if (double.IsNaN(reversalS) && bank * Deg > 60.0) {
                reversalS = (t - start) / (double)AircraftSim.TickHz;
                break;
            }
        }
        _output.WriteLine($"v={speedMps} pulling={pulling}: -60->+60 in {reversalS:F2} s, " +
            $"peak bank rate {peakBankRate:F0} deg/s, alpha {rig.Sim.AngleOfAttackRad * Deg:F1}");
        Assert.True(double.IsFinite(reversalS) && reversalS <= maxReversalSeconds,
            $"reversal took {reversalS:F2} s (corridor {maxReversalSeconds:F2})");
        Assert.True(peakBankRate >= minPeakRateDps,
            $"peak bank rate {peakBankRate:F0} deg/s below corridor {minPeakRateDps:F0}");
    }
}
