namespace GunsOnly.Sim.Motorcycle;

public enum MotorcycleClutchMode {
    Auto,
    Manual
}

public readonly record struct MotorcyclePilotCommand(
    double Throttle,       // 0..1
    double Brake,          // 0..1
    double Steer,          // -1..1 bar
    double RiderLateral,   // -1..1 (right positive)
    double RiderForeAft,   // -1..1 (forward positive)
    int GearShiftRequest,  // -1, 0, +1 per tick edge (runtime latches)
    double Clutch,         // 0 disengaged .. 1 engaged (Manual mode)
    MotorcycleClutchMode ClutchMode);
