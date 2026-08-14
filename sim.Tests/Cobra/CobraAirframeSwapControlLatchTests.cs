using GunsOnly.Sim.Vehicles;
using GunsOnly.Web;

namespace GunsOnly.Sim.Tests.Cobra;

public class CobraAirframeSwapControlLatchTests
{
    [Fact]
    public void SwapGroundsTheNextTickAndRejectsStaleCommandsUntilExactAcknowledgement()
    {
        var latch = new CobraAirframeSwapControlLatch();
        var inherited = new VerticalLiftPilotCommand(0.78, 0.25, -0.2, 0.15);

        Assert.True(latch.TrySetControls(inherited));
        Assert.Equal(inherited, latch.Command);

        Assert.True(latch.ObserveAuthoritySwap(1));
        Assert.True(latch.AwaitingAcknowledgement);
        Assert.Equal(1, latch.PendingSwapGeneration);
        Assert.Equal(new VerticalLiftPilotCommand(0.0, 0.0, 0.0, 0.0), latch.Command);

        // A render frame can still hold the previous bird's W/gamepad input while DTO sampling
        // catches up. It cannot overwrite the grounded command while the swap is unacknowledged.
        Assert.False(latch.TrySetControls(inherited));
        Assert.Equal(0.0, latch.Command.Collective);
        Assert.False(latch.AcknowledgeAuthoritySwap(0));
        Assert.True(latch.AwaitingAcknowledgement);

        Assert.True(latch.AcknowledgeAuthoritySwap(1));
        Assert.False(latch.AwaitingAcknowledgement);
        Assert.Equal(0.0, latch.Command.Collective);

        var deliberate = new VerticalLiftPilotCommand(0.1, 0.0, 0.0, 0.0);
        Assert.True(latch.TrySetControls(deliberate));
        Assert.Equal(deliberate, latch.Command);
    }

    [Fact]
    public void LaterSwapGenerationCannotBeReleasedByAStaleBrowserSnapshot()
    {
        var latch = new CobraAirframeSwapControlLatch();

        Assert.True(latch.ObserveAuthoritySwap(2));
        Assert.False(latch.AcknowledgeAuthoritySwap(1));
        Assert.False(latch.TrySetControls(new VerticalLiftPilotCommand(1.0, 0.0, 0.0, 0.0)));
        Assert.True(latch.AwaitingAcknowledgement);
        Assert.Equal(0.0, latch.Command.Collective);
    }

    [Fact]
    public void RouteResetReturnsTheLatchToColdGenerationZero()
    {
        var latch = new CobraAirframeSwapControlLatch();
        latch.TrySetControls(new VerticalLiftPilotCommand(0.65, 0.0, 0.0, 0.0));
        latch.ObserveAuthoritySwap(1);

        latch.Reset();

        Assert.False(latch.AwaitingAcknowledgement);
        Assert.Equal(0, latch.PendingSwapGeneration);
        Assert.Equal(new VerticalLiftPilotCommand(0.0, 0.0, 0.0, 0.0), latch.Command);
    }
}
