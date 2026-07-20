namespace GunsOnly.Sim;

/// The actuated per-tick command (post-detent). GDemand in g, BankTarget rad, Throttle 0..the
/// airframe's published lever stop (1.0 is military power; values above 1.0 are afterburner),
/// Rudder, RollControl (pilot aileron), and SasRollControl -1..1. DirectLateralControl selects the
/// physical aileron/derivative path used by flown controls; false retains the legacy/AI bank tracker.
/// CommandedPitchRad is an absolute body pitch used by the approach law; NaN means derive pitch from G demand.
/// CommandedAlphaRad is an explicit control-law incidence demand; NaN selects the protected G/AoA
/// mapping. EnvelopeOverride is retained as pilot-intent metadata only. Aerodynamic derivatives must
/// never branch on it: two otherwise-identical actuator demands have identical physics.
public readonly record struct PilotCommand(double GDemand, double BankTarget, double Throttle, double Rudder,
    double CommandedPitchRad = double.NaN, bool EnvelopeOverride = false,
    double RollControl = 0.0, double CommandedAlphaRad = double.NaN,
    double SasRollControl = 0.0, bool DirectLateralControl = false);
