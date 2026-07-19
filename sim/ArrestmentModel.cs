namespace GunsOnly.Sim;

/// <summary>
/// Deterministic, deck-relative arrestment dynamics with a finite, preselected capability. The
/// aircraft contributes only its actual mass and closure: it cannot cause the arresting engine to
/// acquire more force, payout, energy capacity, or safe line load.
/// </summary>
public sealed class ArrestmentModel {
    public enum ArrestmentPhase { None, Arrested, Stopped, Failed }
    public enum ArrestmentFailureReason {
        None,
        EnergyCapacityExceeded,
        RunoutExhausted,
        LineLoadExceeded
    }

    public const double NoseSettleSeconds = 0.85;
    const double ParkedNosePitchRad = 0.8 * Math.PI / 180.0;
    const double StopEnergyToleranceJ = 0.5;
    const double BoundaryTolerance = 1e-8;

    double _along;
    double _cross;
    double _initialPitchRad;
    double _massKg;

    public ArrestmentModel(ArrestmentCapabilityProfile? capability = null) {
        Capability = capability ?? ArrestmentCapabilityProfile.ProvisionalKoreaJet;
    }

    public ArrestmentCapabilityProfile Capability { get; }
    public ArrestmentPhase Phase { get; private set; }
    public ArrestmentFailureReason FailureReason { get; private set; }
    public Vec3D Position { get; private set; }
    public double RelativeSpeedMps { get; private set; }
    public double InitialRelativeSpeedMps { get; private set; }
    public double ResidualSpeedMps => Phase == ArrestmentPhase.Failed
        ? RelativeSpeedMps : 0.0;
    public double ElapsedSeconds { get; private set; }
    public double DistanceM { get; private set; }
    public double NosePitchRad { get; private set; }
    public int CaughtWire { get; private set; }
    public double WireStretchM { get; private set; }
    public double TensionN { get; private set; }
    public double DecelerationMps2 { get; private set; }
    public double PeakDecelerationMps2 { get; private set; }
    public double PeakLoadN { get; private set; }
    public double InitialEnergyJ { get; private set; }
    public double AbsorbedEnergyJ { get; private set; }
    public double RemainingEnergyJ => 0.5 * _massKg
        * RelativeSpeedMps * RelativeSpeedMps;
    public double RunoutTargetM => Capability.RunoutDistanceM;
    /// True only while the aircraft remains constrained to the wire or parked at its end state.
    public bool IsActive => Phase is ArrestmentPhase.Arrested or ArrestmentPhase.Stopped;
    public bool WasEngaged => Phase != ArrestmentPhase.None;

    public void Reset() {
        Phase = ArrestmentPhase.None;
        FailureReason = ArrestmentFailureReason.None;
        Position = Vec3D.Zero;
        RelativeSpeedMps = 0.0;
        InitialRelativeSpeedMps = 0.0;
        ElapsedSeconds = 0.0;
        DistanceM = 0.0;
        NosePitchRad = 0.0;
        CaughtWire = 0;
        WireStretchM = 0.0;
        TensionN = 0.0;
        DecelerationMps2 = 0.0;
        PeakDecelerationMps2 = 0.0;
        PeakLoadN = 0.0;
        InitialEnergyJ = 0.0;
        AbsorbedEnergyJ = 0.0;
        _along = _cross = _initialPitchRad = 0.0;
        _massKg = 0.0;
    }

    public void Engage(Carrier carrier, in AircraftState contact, double bodyPitchRad) {
        Engage(carrier, contact, bodyPitchRad, carrier.CaughtWire(contact.Position));
    }

    public void Engage(Carrier carrier, in AircraftState contact, double bodyPitchRad,
        int caughtWire) {
        ArgumentNullException.ThrowIfNull(carrier);
        if (caughtWire < 1 || caughtWire > 4)
            throw new ArgumentOutOfRangeException(nameof(caughtWire));
        var (along, cross, _) = carrier.LandingFrame(contact.Position);
        _along = along;
        _cross = cross;
        _initialPitchRad = Math.Max(ParkedNosePitchRad, bodyPitchRad);
        Position = carrier.LandingPoint(_along, _cross);
        RelativeSpeedMps = Math.Max(0.0, carrier.DeckClosureMps(contact));
        InitialRelativeSpeedMps = RelativeSpeedMps;
        _massKg = Math.Max(1.0, contact.Mass);
        InitialEnergyJ = 0.5 * _massKg * RelativeSpeedMps * RelativeSpeedMps;
        AbsorbedEnergyJ = 0.0;
        ElapsedSeconds = 0.0;
        DistanceM = 0.0;
        NosePitchRad = _initialPitchRad;
        CaughtWire = caughtWire;
        WireStretchM = TensionN = DecelerationMps2 = PeakDecelerationMps2 = 0.0;
        PeakLoadN = 0.0;
        FailureReason = ArrestmentFailureReason.None;
        Phase = RelativeSpeedMps > 0.0
            ? ArrestmentPhase.Arrested : ArrestmentPhase.Stopped;
        if (Phase == ArrestmentPhase.Arrested) CheckLineLoad();
    }

    /// <summary>
    /// Integrate force work against the actual kinetic-energy ledger. Call after Carrier.Step(dt)
    /// so LandingPoint includes this tick's ship translation.
    /// </summary>
    public void Step(Carrier carrier, double dt) {
        ArgumentNullException.ThrowIfNull(carrier);
        if (Phase != ArrestmentPhase.Arrested) return;
        if (!double.IsFinite(dt) || dt <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(dt));

        if (!CheckLineLoad()) {
            Position = carrier.LandingPoint(_along, _cross);
            return;
        }

        double speedBefore = RelativeSpeedMps;
        double kineticBefore = RemainingEnergyJ;
        double acceleration = TensionN / _massKg;
        double timeToStop = speedBefore / acceleration;
        double movingTime = Math.Min(dt, timeToStop);
        double proposedDistance = speedBefore * movingTime
            - 0.5 * acceleration * movingTime * movingTime;
        double runoutRemaining = Math.Max(0.0,
            Capability.RunoutDistanceM - DistanceM);
        double energyCapacityRemaining = Math.Max(0.0,
            Capability.RatedEnergyJ - AbsorbedEnergyJ);
        double energyLimitedDistance = energyCapacityRemaining / TensionN;
        double distance = Math.Min(proposedDistance,
            Math.Min(runoutRemaining, energyLimitedDistance));
        double work = Math.Min(kineticBefore, TensionN * distance);
        AbsorbedEnergyJ += work;
        double kineticAfter = Math.Max(0.0, kineticBefore - work);
        RelativeSpeedMps = Math.Sqrt(2.0 * kineticAfter / _massKg);
        double actualMovingTime = acceleration > 0.0
            ? (speedBefore - RelativeSpeedMps) / acceleration : 0.0;
        _along += distance;
        DistanceM += distance;
        ElapsedSeconds += Math.Max(0.0, actualMovingTime);

        double settle = SmoothStep(Math.Min(1.0,
            ElapsedSeconds / NoseSettleSeconds));
        NosePitchRad = _initialPitchRad
            + (ParkedNosePitchRad - _initialPitchRad) * settle;
        UpdateWireGeometry();
        Position = carrier.LandingPoint(_along, _cross);

        if (kineticAfter <= StopEnergyToleranceJ) {
            RelativeSpeedMps = 0.0;
            NosePitchRad = ParkedNosePitchRad;
            WireStretchM = 0.0;
            TensionN = 0.0;
            DecelerationMps2 = 0.0;
            Phase = ArrestmentPhase.Stopped;
            return;
        }
        if (energyCapacityRemaining <= TensionN * proposedDistance + BoundaryTolerance
            && AbsorbedEnergyJ >= Capability.RatedEnergyJ - BoundaryTolerance) {
            Fail(ArrestmentFailureReason.EnergyCapacityExceeded);
            return;
        }
        if (DistanceM >= Capability.RunoutDistanceM - BoundaryTolerance)
            Fail(ArrestmentFailureReason.RunoutExhausted);
    }

    bool CheckLineLoad() {
        TensionN = Capability.ForceAtPayoutN(DistanceM);
        PeakLoadN = Math.Max(PeakLoadN, TensionN);
        if (TensionN > Capability.MaximumLineLoadN + BoundaryTolerance) {
            DecelerationMps2 = 0.0;
            Fail(ArrestmentFailureReason.LineLoadExceeded);
            return false;
        }
        DecelerationMps2 = TensionN / _massKg;
        PeakDecelerationMps2 = Math.Max(PeakDecelerationMps2, DecelerationMps2);
        UpdateWireGeometry();
        return true;
    }

    void UpdateWireGeometry() {
        double u = Math.Clamp(DistanceM / Capability.RunoutDistanceM, 0.0, 1.0);
        WireStretchM = 4.0 * Capability.MaximumWireDeflectionM * u * (1.0 - u);
    }

    void Fail(ArrestmentFailureReason reason) {
        FailureReason = reason;
        DecelerationMps2 = 0.0;
        Phase = ArrestmentPhase.Failed;
    }

    static double SmoothStep(double x) => x * x * (3.0 - 2.0 * x);
}
