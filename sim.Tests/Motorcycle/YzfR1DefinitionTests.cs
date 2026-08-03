using GunsOnly.Sim.Motorcycle;

namespace GunsOnly.Sim.Tests.Motorcycle;

public sealed class YzfR1DefinitionTests
{
    [Fact]
    public void BindsPublished2020R1Geometry()
    {
        Assert.Equal("yamaha-yzf-r1-2020", YzfR1Definition.VehicleId);
        Assert.Equal(203.2, YzfR1Definition.CurbMassKg, 3);
        Assert.Equal(1.405, YzfR1Definition.WheelbaseM, 3);
        Assert.Equal(24.0 * Math.PI / 180.0, YzfR1Definition.RakeRad, 6);
        Assert.Equal(0.102, YzfR1Definition.TrailM, 3);
        Assert.Equal(200.0 * 745.7, YzfR1Definition.PeakCrankPowerW, 0);
        Assert.Equal(13_500.0, YzfR1Definition.PeakPowerRpm, 0);
        Assert.Equal(6, YzfR1Definition.GearCount);
    }
}
