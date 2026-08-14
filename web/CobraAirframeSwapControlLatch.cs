using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Web;

/// <summary>
/// Holds a newly issued Cobra airframe at a cold, neutral command until the browser has observed
/// and acknowledged the exact authority-owned swap generation. This closes both halves of the
/// render-rate race: later ticks in the same catch-up frame and stale held input on later frames.
/// </summary>
public sealed class CobraAirframeSwapControlLatch
{
    static readonly VerticalLiftPilotCommand GroundedCommand = new(0.0, 0.0, 0.0, 0.0);
    VerticalLiftPilotCommand _command = GroundedCommand;
    int _pendingSwapGeneration;
    bool _awaitingAcknowledgement;

    public VerticalLiftPilotCommand Command => _command;
    public int PendingSwapGeneration => _pendingSwapGeneration;
    public bool AwaitingAcknowledgement => _awaitingAcknowledgement;

    public void Reset()
    {
        _command = GroundedCommand;
        _pendingSwapGeneration = 0;
        _awaitingAcknowledgement = false;
    }

    public bool TrySetControls(in VerticalLiftPilotCommand command)
    {
        if (_awaitingAcknowledgement) return false;
        _command = command;
        return true;
    }

    public bool ObserveAuthoritySwap(int swapGeneration)
    {
        if (swapGeneration < 0)
            throw new ArgumentOutOfRangeException(nameof(swapGeneration));
        if (swapGeneration <= _pendingSwapGeneration) return false;

        _pendingSwapGeneration = swapGeneration;
        _awaitingAcknowledgement = true;
        _command = GroundedCommand;
        return true;
    }

    public bool AcknowledgeAuthoritySwap(int swapGeneration)
    {
        if (!_awaitingAcknowledgement || swapGeneration != _pendingSwapGeneration)
            return false;

        // Acknowledgement releases the input lock, but never supplies a control command itself.
        // The browser must deliberately stage either play's zero lever or lab's calculated trim.
        _command = GroundedCommand;
        _awaitingAcknowledgement = false;
        return true;
    }
}
