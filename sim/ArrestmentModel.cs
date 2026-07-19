namespace GunsOnly.Sim;

/// Deterministic post-trap deck-relative wire dynamics. This is intentionally separate from the
/// aircraft flight model: after the hook catches, the airplane is pinned to the active landing
/// surface while a Kelvin-Voigt pendant (spring + damper) and the arresting engine absorb its
/// deck-relative kinetic energy. The engine is set from engagement energy, as real gear is set for
/// aircraft type/weight, so normal traps finish at the same ~96 m runout rather than at constant g.
public sealed class ArrestmentModel {
    public enum ArrestmentPhase { None, Arrested, Stopped }

    public const double RunoutDistanceM = 96.0;     // 315 ft; fleet references quote ~320-350 ft
    public const double MaxWireStretchM = 3.0;      // effective pendant/purchase-cable compliance
    public const double NoseSettleSeconds = 0.85;
    const double ParkedNosePitchRad = 0.8 * System.Math.PI / 180.0;
    const double BaseEnergyFraction = 0.18;
    const double SpringEnergyFraction = 0.72;
    const double DamperEnergyFraction = 0.10;

    double _along;
    double _cross;
    double _initialPitchRad;
    double _massKg;
    double _baseTensionN;
    double _springRateNpm;
    double _dampingNspm;

    public ArrestmentPhase Phase { get; private set; }
    public Vec3D Position { get; private set; }
    public double RelativeSpeedMps { get; private set; }
    public double ElapsedSeconds { get; private set; }
    public double DistanceM { get; private set; }
    public double NosePitchRad { get; private set; }
    public int CaughtWire { get; private set; }
    public double WireStretchM { get; private set; }
    public double TensionN { get; private set; }
    public double DecelerationMps2 { get; private set; }
    public double PeakDecelerationMps2 { get; private set; }
    public double RunoutTargetM => RunoutDistanceM;
    public bool IsActive => Phase != ArrestmentPhase.None;

    public void Reset() {
        Phase = ArrestmentPhase.None;
        Position = Vec3D.Zero;
        RelativeSpeedMps = 0.0;
        ElapsedSeconds = 0.0;
        DistanceM = 0.0;
        NosePitchRad = 0.0;
        CaughtWire = 0;
        WireStretchM = 0.0;
        TensionN = 0.0;
        DecelerationMps2 = 0.0;
        PeakDecelerationMps2 = 0.0;
        _along = _cross = _initialPitchRad = 0.0;
        _massKg = 0.0;
        _baseTensionN = _springRateNpm = _dampingNspm = 0.0;
    }

    public void Engage(Carrier carrier, in AircraftState contact, double bodyPitchRad) {
        Engage(carrier, contact, bodyPitchRad, carrier.CaughtWire(contact.Position));
    }

    public void Engage(Carrier carrier, in AircraftState contact, double bodyPitchRad, int caughtWire) {
        if (caughtWire < 1 || caughtWire > 4)
            throw new System.ArgumentOutOfRangeException(nameof(caughtWire));
        var (along, cross, _) = carrier.LandingFrame(contact.Position);
        _along = along;
        _cross = cross;
        _initialPitchRad = System.Math.Max(ParkedNosePitchRad, bodyPitchRad);
        Position = carrier.LandingPoint(_along, _cross);
        RelativeSpeedMps = System.Math.Max(0.0, carrier.DeckClosureMps(contact));
        _massKg = System.Math.Max(1.0, contact.Mass);
        double energyJ = 0.5 * _massKg * RelativeSpeedMps * RelativeSpeedMps;
        _baseTensionN = BaseEnergyFraction * energyJ / RunoutDistanceM;
        // Integral of 4*S*u*(1-u) over the runout is 2*S*L/3.
        _springRateNpm = SpringEnergyFraction * energyJ * 3.0
            / (2.0 * MaxWireStretchM * RunoutDistanceM);
        // The stretch grows and releases once (total variation 2*S). The 0.58*v0 factor is the
        // velocity-weighted mean through that cycle; it gives the damper ~10% of the energy bill.
        _dampingNspm = RelativeSpeedMps > 1e-9
            ? DamperEnergyFraction * energyJ
                / (2.0 * MaxWireStretchM * 0.58 * RelativeSpeedMps)
            : 0.0;
        ElapsedSeconds = 0.0;
        DistanceM = 0.0;
        NosePitchRad = _initialPitchRad;
        CaughtWire = caughtWire;
        WireStretchM = TensionN = DecelerationMps2 = PeakDecelerationMps2 = 0.0;
        Phase = RelativeSpeedMps > 0.0 ? ArrestmentPhase.Arrested : ArrestmentPhase.Stopped;
    }

    /// Call after Carrier.Step(dt), so LandingPoint includes this tick's ship translation.
    public void Step(Carrier carrier, double dt) {
        if (Phase != ArrestmentPhase.Arrested || dt <= 0.0) return;

        double u = System.Math.Clamp(DistanceM / RunoutDistanceM, 0.0, 1.0);
        WireStretchM = 4.0 * MaxWireStretchM * u * (1.0 - u);
        double stretchPerRunout = 4.0 * MaxWireStretchM / RunoutDistanceM * (1.0 - 2.0 * u);
        double stretchRateMps = stretchPerRunout * RelativeSpeedMps;
        double springTension = _springRateNpm * WireStretchM;
        double damperTension = _dampingNspm * System.Math.Abs(stretchRateMps);
        TensionN = _baseTensionN + springTension + damperTension;
        DecelerationMps2 = TensionN / _massKg;
        PeakDecelerationMps2 = System.Math.Max(PeakDecelerationMps2, DecelerationMps2);

        double timeToStop = RelativeSpeedMps / System.Math.Max(DecelerationMps2, 1e-12);
        double movingTime = System.Math.Min(dt, timeToStop);
        double distance = RelativeSpeedMps * movingTime
            - 0.5 * DecelerationMps2 * movingTime * movingTime;
        if (DistanceM + distance >= RunoutDistanceM) {
            distance = RunoutDistanceM - DistanceM;
            RelativeSpeedMps = 0.0;
        } else {
            RelativeSpeedMps = System.Math.Max(0.0,
                RelativeSpeedMps - DecelerationMps2 * movingTime);
        }
        _along += distance;
        DistanceM += distance;
        ElapsedSeconds += movingTime;

        double settle = SmoothStep(System.Math.Min(1.0, ElapsedSeconds / NoseSettleSeconds));
        NosePitchRad = _initialPitchRad + (ParkedNosePitchRad - _initialPitchRad) * settle;
        Position = carrier.LandingPoint(_along, _cross);
        if (RelativeSpeedMps <= 1e-9) {
            RelativeSpeedMps = 0.0;
            NosePitchRad = ParkedNosePitchRad;
            WireStretchM = 0.0;
            TensionN = 0.0;
            DecelerationMps2 = 0.0;
            Phase = ArrestmentPhase.Stopped;
        }
    }

    static double SmoothStep(double x) => x * x * (3.0 - 2.0 * x);
}
