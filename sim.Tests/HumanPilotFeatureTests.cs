using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Training;
using Xunit;

namespace GunsOnly.Sim.Tests;

public class HumanPilotFeatureTests {
    static CombatPolicyObservation Observation(Vec3D ownPosition, double bank,
        Vec3D contactPosition, double contactSpeed = 250.0, double contactChi = 0.0) =>
        CombatPolicyObservation.Capture(
            tick: 0, elapsedSeconds: 0.0,
            ownship: new AircraftState(ownPosition, 250.0, 0.0, 0.0, bank, 27_700.0),
            contact: ActorObservation.Capture(
                new AircraftState(contactPosition, contactSpeed, 0.0, contactChi, 0.0, 22_500.0), 0),
            ownshipAmmoRemaining: 400, weaponsAuthorized: true);

    [Fact]
    public void EveryFeatureIsNamedFiniteAndCounted() {
        var values = HumanPilotFeatures.Extract(
            Observation(new Vec3D(0, 3000, 0), 0.3, new Vec3D(500, 3200, 1500)));
        Assert.Equal(HumanPilotFeatures.FeatureCount, values.Length);
        Assert.Equal(HumanPilotFeatures.FeatureCount, HumanPilotFeatures.Names.Count);
        Assert.All(values, v => Assert.True(double.IsFinite(v)));
    }

    /// The clone must not be able to memorise map locations. The same fight in a different place is
    /// the same fight, and a feature vector that disagrees would let it learn the map instead.
    [Fact]
    public void TheSameGeometryAnywhereOnTheMapIsTheSameFeatureVector() {
        var here = HumanPilotFeatures.Extract(
            Observation(new Vec3D(0, 3000, 0), 0.4, new Vec3D(800, 3000, 1200)));
        var elsewhere = HumanPilotFeatures.Extract(
            Observation(new Vec3D(40_000, 3000, -25_000), 0.4,
                new Vec3D(40_800, 3000, -23_800)));
        for (int i = 0; i < here.Length; i++) {
            if (HumanPilotFeatures.Names[i] == "own_altitude_norm") continue;
            Assert.True(System.Math.Abs(here[i] - elsewhere[i]) < 1e-9,
                $"feature '{HumanPilotFeatures.Names[i]}' moved with world position: "
                + $"{here[i]} vs {elsewhere[i]}");
        }
    }

    /// Bank is an angle that wraps. A clone trained on a torn representation learns a
    /// discontinuity at the seam that the aircraft does not have.
    [Fact]
    public void BankIsContinuousAcrossTheSeam() {
        double epsilon = 1e-4;
        var justBelow = HumanPilotFeatures.Extract(
            Observation(new Vec3D(0, 3000, 0), System.Math.PI - epsilon, new Vec3D(0, 3000, 900)));
        var justAbove = HumanPilotFeatures.Extract(
            Observation(new Vec3D(0, 3000, 0), -System.Math.PI + epsilon, new Vec3D(0, 3000, 900)));
        for (int i = 0; i < justBelow.Length; i++)
            Assert.True(System.Math.Abs(justBelow[i] - justAbove[i]) < 1e-3,
                $"feature '{HumanPilotFeatures.Names[i]}' tears at the bank seam");
    }
}
