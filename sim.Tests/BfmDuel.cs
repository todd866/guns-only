using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Sim.Tests;

/// Outcome of a headless basic-fighter-manoeuvres duel. *SolutionSeconds accumulate the time each
/// side held a valid gun window on the other (CameraSolver.GunWindow) — the yardstick for whether
/// one pilot out-fights another. This is a test-only harness; it drives two IBandit-backed fighters
/// against each other on the same deterministic time sample.
public readonly record struct BfmDuelResult(
    double ASolutionSeconds, double BSolutionSeconds, double MinRangeM,
    double AExitSpeedMps, double BExitSpeedMps);

public static class BfmDuel {
    const double Dt = 1.0 / AircraftSim.TickHz;

    public static BfmDuelResult Fly(ReactiveBandit a, ReactiveBandit b, double seconds) {
        double aSol = 0.0, bSol = 0.0, minRange = double.PositiveInfinity;
        int ticks = (int)(seconds * AircraftSim.TickHz);
        for (int i = 0; i < ticks; i++) {
            // Both fighters read the other's beginning-of-tick state, then advance on the same sample.
            var aState = a.State;
            var bState = b.State;
            a.Step(bState, Dt);
            b.Step(aState, Dt);
            if (CameraSolver.GunWindow(a.State, b.State)) aSol += Dt;
            if (CameraSolver.GunWindow(b.State, a.State)) bSol += Dt;
            double range = Geometry.Range(a.State, b.State);
            if (range < minRange) minRange = range;
        }
        return new BfmDuelResult(aSol, bSol, minRange, a.State.Speed, b.State.Speed);
    }
}
