using GunsOnly.Sim.Recovery;
using Xunit;

namespace GunsOnly.Sim.Tests.Recovery;

public class ApproachEnergyTests {
    [Fact]
    public void SpecificEnergyAddsTheHeightSpeedCouldBuy() {
        // 100 m/s trades to 100^2 / (2 * 9.80665) = 509.86 m of height.
        Assert.Equal(509.86, ApproachEnergy.SpecificEnergyM(0.0, 100.0), precision: 2);
        Assert.Equal(1509.86, ApproachEnergy.SpecificEnergyM(1000.0, 100.0), precision: 2);
        Assert.Equal(1000.0, ApproachEnergy.SpecificEnergyM(1000.0, 0.0), precision: 6);
    }

    [Fact]
    public void TrackDistanceIsExcessEnergyOverDragToWeight() {
        // D*s = W*dEs  =>  s = dEs / (D/W). 1000 m of excess at 0.10 needs 10 km.
        Assert.Equal(10_000.0, ApproachEnergy.TrackDistanceRequiredM(1000.0, 0.10), precision: 6);
        Assert.Equal(4_000.0, ApproachEnergy.TrackDistanceRequiredM(1000.0, 0.25), precision: 6);
    }

    [Fact]
    public void NoExcessNeedsNoTrackAndDegenerateDragCannotDivideByZero() {
        Assert.Equal(0.0, ApproachEnergy.TrackDistanceRequiredM(0.0, 0.1));
        Assert.Equal(0.0, ApproachEnergy.TrackDistanceRequiredM(-500.0, 0.1));
        Assert.True(double.IsFinite(ApproachEnergy.TrackDistanceRequiredM(1000.0, 0.0)));
    }
}
