using GunsOnly.Sim.Doctrine;
using Xunit;
using Xunit.Abstractions;

namespace GunsOnly.Sim.Tests;

/// The diagnostic that answers "the bandit has gun range and never shoots": where in the funnel
/// from range to hits does each tier actually stop?
public class GunConversionFunnelTests {
    readonly ITestOutputHelper _out;
    public GunConversionFunnelTests(ITestOutputHelper output) => _out = output;

    static readonly PilotSkill[] Tiers =
        { PilotSkill.Novice, PilotSkill.Competent, PilotSkill.Veteran, PilotSkill.Ace };

    [Fact]
    public void ReportTheGunConversionFunnelPerTier() {
        foreach (PilotSkill tier in Tiers) {
            GunConversionFunnelResult result = GunConversionFunnel.MeasureEnemy(tier);
            _out.WriteLine(result.ToString());
        }
    }
    // The airframe question, measured: does putting the SAME pilot in the uprated jet change the
    // fight? Pilot skill is held constant so the only variable is the aircraft.
    [Fact]
    public void TheUpratedJetChangesTheFightWithTheSamePilotFlyingIt() {
        foreach (PilotSkill tier in new[] { PilotSkill.Veteran, PilotSkill.Ace }) {
            GunConversionFunnelResult baseline = GunConversionFunnel.MeasureEnemy(
                tier, enemyAir: FlightModel.Su27SPublicDataSurrogate);
            GunConversionFunnelResult uprated = GunConversionFunnel.MeasureEnemy(
                tier, enemyAir: FlightModel.Su35SPublicDataSurrogate);
            _out.WriteLine($"{tier} baseline : {baseline}");
            _out.WriteLine($"{tier} UPRATED  : {uprated}");
        }
    }

}
