namespace GunsOnly.Sim;

/// The actuated per-tick command (post-detent). GDemand in g, BankTarget rad, Throttle 0..1, Rudder -1..1.
/// CommandedPitchRad is an absolute body pitch used by the approach law; NaN means derive pitch from G demand.
public readonly record struct PilotCommand(double GDemand, double BankTarget, double Throttle, double Rudder,
    double CommandedPitchRad = double.NaN);
