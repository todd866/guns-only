namespace GunsOnly.Sim;

/// <summary>
/// Deterministic internal-fuel tank bookkeeping. Propulsion owns the engine map and supplies the
/// physical flow it requested this tick; this class integrates quantity, drives the deliberately
/// damped cockpit indication, and exposes bingo/endurance decisions.
/// </summary>
public sealed class FuelModel {
    // T.O. 1F-86F-1, fuel-capacity table: 2,826 lb usable internal JP-4 for the F-86F.
    public const double DefaultFuelLb = 2826.0;
    public const double BingoFuelLb = 800.0;
    public const double FlowSmoothingTimeSeconds = 10.0;

    bool _flowInitialized;

    public double CapacityLb { get; }
    public double BingoThresholdLb { get; }
    public double? JokerThresholdLb { get; }
    public double? MinimumFuelThresholdLb { get; }
    public double? EmergencyFuelThresholdLb { get; }
    public bool ConsumesFuel { get; }
    public double FuelLb { get; private set; }
    /// <summary>The instantaneous flow used for this tick's real fuel decrement.</summary>
    public double BurnLbPerMinute { get; private set; }
    /// <summary>A deterministic cockpit indication; it never feeds the quantity integrator.</summary>
    public double SmoothedBurnLbPerMinute { get; private set; }
    public double FuelTrendLbPerMinute => ConsumesFuel && FuelLb > 0.0
        ? -SmoothedBurnLbPerMinute
        : 0.0;
    public double? MinutesToBingo => ConsumesFuel && FuelLb > BingoThresholdLb
        && SmoothedBurnLbPerMinute > 1e-9
            ? (FuelLb - BingoThresholdLb) / SmoothedBurnLbPerMinute
            : null;
    public double? MinutesToJoker => ConsumesFuel && JokerThresholdLb is { } joker
        && FuelLb > joker && SmoothedBurnLbPerMinute > 1e-9
            ? (FuelLb - joker) / SmoothedBurnLbPerMinute
            : null;
    public double? EnduranceMinutes => ConsumesFuel && SmoothedBurnLbPerMinute > 1e-9
        ? FuelLb / SmoothedBurnLbPerMinute
        : null;
    public bool HasFuel => !ConsumesFuel || FuelLb > 0.0;
    public bool IsBingo => ConsumesFuel && FuelLb <= BingoThresholdLb;
    public bool IsJoker => ConsumesFuel && JokerThresholdLb is { } joker
        && FuelLb <= joker;
    /// <summary>
    /// Reduced-order current-quantity flags. The real calls use projected landing fuel; the
    /// simulation has no tanker/divert forecast, so it never manufactures an optimistic projection.
    /// </summary>
    public bool IsMinimumFuel => ConsumesFuel && MinimumFuelThresholdLb is { } minimum
        && FuelLb <= minimum;
    public bool IsEmergencyFuel => ConsumesFuel && EmergencyFuelThresholdLb is { } emergency
        && FuelLb <= emergency;
    public bool RtbAdvisory { get; private set; }

    public FuelModel(double initialFuelLb = DefaultFuelLb,
        double capacityLb = DefaultFuelLb,
        double bingoThresholdLb = BingoFuelLb,
        bool consumesFuel = true,
        double? jokerThresholdLb = null,
        double? minimumFuelThresholdLb = null,
        double? emergencyFuelThresholdLb = null) {
        if (!double.IsFinite(initialFuelLb) || initialFuelLb < 0.0)
            throw new ArgumentOutOfRangeException(nameof(initialFuelLb));
        if (!double.IsFinite(capacityLb) || capacityLb < 0.0)
            throw new ArgumentOutOfRangeException(nameof(capacityLb));
        if (initialFuelLb > capacityLb)
            throw new ArgumentOutOfRangeException(nameof(initialFuelLb),
                "initial fuel must not exceed capacity");
        if (!double.IsFinite(bingoThresholdLb) || bingoThresholdLb < 0.0
            || bingoThresholdLb > capacityLb)
            throw new ArgumentOutOfRangeException(nameof(bingoThresholdLb));
        ValidateOptionalThreshold(jokerThresholdLb, capacityLb, nameof(jokerThresholdLb));
        ValidateOptionalThreshold(minimumFuelThresholdLb, capacityLb,
            nameof(minimumFuelThresholdLb));
        ValidateOptionalThreshold(emergencyFuelThresholdLb, capacityLb,
            nameof(emergencyFuelThresholdLb));
        if (jokerThresholdLb is { } joker && joker < bingoThresholdLb)
            throw new ArgumentOutOfRangeException(nameof(jokerThresholdLb),
                "joker must be at or above bingo");
        if (minimumFuelThresholdLb is { } minimum && minimum > bingoThresholdLb)
            throw new ArgumentOutOfRangeException(nameof(minimumFuelThresholdLb),
                "minimum fuel must be at or below bingo");
        if (emergencyFuelThresholdLb is { } emergency
            && emergency > (minimumFuelThresholdLb ?? bingoThresholdLb))
            throw new ArgumentOutOfRangeException(nameof(emergencyFuelThresholdLb),
                "emergency fuel must be at or below minimum fuel");

        CapacityLb = capacityLb;
        BingoThresholdLb = bingoThresholdLb;
        JokerThresholdLb = jokerThresholdLb;
        MinimumFuelThresholdLb = minimumFuelThresholdLb;
        EmergencyFuelThresholdLb = emergencyFuelThresholdLb;
        ConsumesFuel = consumesFuel;
        FuelLb = initialFuelLb;
        RtbAdvisory = IsBingo;
    }

    static void ValidateOptionalThreshold(double? threshold, double capacityLb,
        string parameterName) {
        if (threshold is not { } value) return;
        if (!double.IsFinite(value) || value < 0.0 || value > capacityLb)
            throw new ArgumentOutOfRangeException(parameterName);
    }

    /// <summary>
    /// Consume the engine map's requested flow. The returned fraction is one for a fully supplied
    /// tick and falls below one only on the final, partially supplied tick.
    /// </summary>
    public double Step(double dtSeconds, double requestedFlowLbPerMinute) {
        if (!double.IsFinite(dtSeconds) || dtSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(dtSeconds));
        if (!double.IsFinite(requestedFlowLbPerMinute) || requestedFlowLbPerMinute < 0.0)
            throw new ArgumentOutOfRangeException(nameof(requestedFlowLbPerMinute));

        if (!ConsumesFuel) {
            BurnLbPerMinute = 0.0;
            SmoothedBurnLbPerMinute = 0.0;
            _flowInitialized = false;
            return 0.0;
        }

        double requestedBurnLb = requestedFlowLbPerMinute * dtSeconds / 60.0;
        double suppliedBurnLb = Math.Min(FuelLb, requestedBurnLb);
        double suppliedFraction = requestedBurnLb > 1e-12
            ? suppliedBurnLb / requestedBurnLb
            : FuelLb > 0.0 ? 1.0 : 0.0;
        BurnLbPerMinute = dtSeconds > 0.0
            ? suppliedBurnLb * 60.0 / dtSeconds
            : FuelLb > 0.0 ? requestedFlowLbPerMinute : 0.0;
        if (!_flowInitialized) {
            // Seed from the first physical sample. Starting at zero would manufacture a ten-second
            // period of implausibly optimistic endurance every time a sortie begins.
            SmoothedBurnLbPerMinute = BurnLbPerMinute;
            _flowInitialized = true;
        } else if (dtSeconds > 0.0) {
            double blend = 1.0 - Math.Exp(-dtSeconds / FlowSmoothingTimeSeconds);
            SmoothedBurnLbPerMinute += blend
                * (BurnLbPerMinute - SmoothedBurnLbPerMinute);
        }
        // Quantity remains the integral of supplied physical flow. The cockpit filter is strictly
        // presentation-only and cannot create or erase fuel during throttle changes.
        FuelLb = Math.Max(0.0, FuelLb - suppliedBurnLb);
        if (FuelLb <= 0.0) {
            // Flameout is an event, not a slowly decaying gauge fiction. The engine/session drops
            // combustion thrust on the following 120 Hz tick and the flow indication goes dark now.
            BurnLbPerMinute = 0.0;
            SmoothedBurnLbPerMinute = 0.0;
            _flowInitialized = false;
        }
        if (IsBingo) RtbAdvisory = true;
        return suppliedFraction;
    }

    /// <summary>
    /// Advisory navigation back to a home point after bingo. It never changes aircraft controls;
    /// shells can render the absolute bearing and signed shortest turn for the pilot to follow.
    /// </summary>
    public RtbGuidance GuidanceTo(in Vec3D position, double headingRad, in Vec3D home) {
        if (!double.IsFinite(headingRad)
            || !double.IsFinite(position.X) || !double.IsFinite(position.Y) || !double.IsFinite(position.Z)
            || !double.IsFinite(home.X) || !double.IsFinite(home.Y) || !double.IsFinite(home.Z))
            throw new ArgumentOutOfRangeException(nameof(position));

        double eastM = home.X - position.X;
        double northM = home.Z - position.Z;
        double rangeM = Math.Sqrt(eastM * eastM + northM * northM);
        double bearingRad = rangeM < 1e-9 ? headingRad : Math.Atan2(eastM, northM);
        double turnRad = Math.Atan2(Math.Sin(bearingRad - headingRad),
            Math.Cos(bearingRad - headingRad));
        return new RtbGuidance(RtbAdvisory, bearingRad, turnRad, rangeM);
    }

}

public readonly record struct RtbGuidance(
    bool Active,
    double BearingRad,
    double TurnRad,
    double RangeM);
