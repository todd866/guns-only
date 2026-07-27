using GunsOnly.Sim;

namespace GunsOnly.Sim.Tests;

public class ColdGasRcsTests {
    [Fact]
    public void AeroAuthorityIsOneInDenseAirAndZeroInVacuum() {
        Assert.Equal(1.0, ColdGasRcs.AeroControlAuthority(qPa: 20_000.0), 6);
        Assert.Equal(0.0, ColdGasRcs.AeroControlAuthority(qPa: 50.0), 6);
    }

    [Fact]
    public void RcsAuthorityFillsWhatAeroLosesWhileGasRemains() {
        double q = ColdGasRcs.QRcsFullPa; // mid-blend floor
        double aero = ColdGasRcs.AeroControlAuthority(q);
        Assert.True(aero < 0.05);
        Assert.Equal(1.0 - aero, ColdGasRcs.RcsAuthority(q, gasRemainingKg: 10.0), 6);
        Assert.Equal(0.0, ColdGasRcs.RcsAuthority(q, gasRemainingKg: 0.0), 6);
    }

    [Fact]
    public void NoseOnVelocityErrorIsZeroWhenAligned() {
        Vec3D forward = new(0, 0, 1);
        Vec3D velocity = new(0, 0, 400);
        Assert.Equal(0.0, ColdGasRcs.NoseOnVelocityErrorDeg(forward, velocity), 6);
    }

    [Fact]
    public void NoseOnVelocityErrorGrowsWithMisalignment() {
        Vec3D forward = new(0, 1, 0); // nose up
        Vec3D velocity = new(0, 0, 400); // flying forward
        double err = ColdGasRcs.NoseOnVelocityErrorDeg(forward, velocity);
        Assert.InRange(err, 85.0, 95.0);
    }

    [Fact]
    public void GasConsumesWithRcsDemand() {
        double gas = 5.0;
        gas = ColdGasRcs.ConsumeGas(gas, rcsMomentNm: 50_000.0, dtSeconds: 1.0,
            maxMomentNm: 100_000.0, capacityKg: 5.0, burnKgPerFullSecond: 0.5);
        Assert.Equal(4.75, gas, 6);
    }
}
