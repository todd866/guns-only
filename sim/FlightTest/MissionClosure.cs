namespace GunsOnly.Sim.FlightTest;

/// Mission-layer seam for v1: advisory only. Full sortie closure is a follow-up plan.
public static class MissionClosure {
    public static FlightTestFinding EvaluateAdvisory(AirframeUnderTest subject) {
        if (subject.Mission is null) {
            return new FlightTestFinding(
                "mission-not-attached", false,
                "No BeatSetup attached — mission closure is advisory until Dynamic is green");
        }
        return new FlightTestFinding(
            "mission-attached-advisory", false,
            $"Mission '{subject.Mission.Name}' attached — full closure deferred to a follow-up plan");
    }
}
