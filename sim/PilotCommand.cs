namespace GunsOnly.Sim;

/// The actuated per-tick command (post-detent). GDemand in g, BankTarget rad, Throttle 0..1, Rudder -1..1.
public readonly record struct PilotCommand(double GDemand, double BankTarget, double Throttle, double Rudder);
