namespace GunsOnly.Sim.FlightTest;

public readonly record struct AirframeUnderTest(
    string Id,
    AircraftParams Air,
    PropulsionModelKind Propulsion,
    AirframeIdentity? Identity = null,
    Doctrine.BeatSetup? Mission = null);

public readonly record struct FlightTestGate(
    string Id,
    bool Blocking,
    string Description);

public readonly record struct FlightTestPoint(
    string Id,
    string Description);

public sealed record FlightTestFinding(
    string GateId,
    bool Blocking,
    string Message);

public sealed record FlightTestReport(
    string SubjectId,
    string ProgramId,
    string ProgramVersion,
    bool Passed,
    AirframeIdentity Identity,
    IReadOnlyList<FlightTestFinding> Findings,
    ClimbHoldResult? Climb = null,
    EngineDeckSample? EngineSampleSeaLevelAb = null,
    double? EnergyAeroMaxG = null,
    double? EnergySustainedG = null) {
    public string ToMarkdown() => ReportMarkdown.Render(this);
}

public sealed record FlightTestProgram(
    string Id,
    string Version,
    IReadOnlyList<FlightTestGate> Gates,
    IReadOnlyList<FlightTestPoint> Points,
    MissionClosureSpec? MissionClosure = null);

public readonly record struct MissionClosureSpec(string BeatName);
