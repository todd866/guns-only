namespace GunsOnly.UnityBridge;

/// <summary>Sim frame metres: X=east, Y=up, Z=north.</summary>
public readonly record struct Vec3(double X, double Y, double Z);

/// <summary>Compact ground-war marker for Unity presentation (faction 0=friendly, 1=hostile).</summary>
public readonly record struct GroundUnitWire(
    byte Faction,
    byte Role,
    float X,
    float Y,
    float Z,
    float Health01);

public readonly record struct PoseSnapshot(
    long Tick,
    double SimulationTimeS,
    string Lifecycle,
    Vec3 Player,
    Vec3 PlayerForward,
    Vec3 PlayerLeft,
    bool OpponentPresent,
    Vec3 Bandit,
    Vec3 BanditForward,
    Vec3 BanditLeft,
    double PlayerAltitudeFt,
    double PlayerHeadingDeg,
    int PlayerHealthPermille,
    bool WeaponsHold,
    double IndicatedAirspeedKts = 0,
    double PitchDeg = 0,
    double BankDeg = 0,
    double VerticalSpeedFpm = 0,
    double Mach = 0,
    string? MissionPack = null,
    int AmmoRounds = 0,
    double ControlBalance = 0,
    double RotorRpm = 0,
    double Collective01 = 0,
    double ClearanceM = 0,
    double FobRangeM = 0,
    double TorqueNm = 0,
    double TorqueLimitFraction = 0,
    GroundUnitWire[]? Units = null,
    /// <summary>
    /// Compact gunner line for HUD: none / dry / outoflimits / nosolution / masked /
    /// tracking / firing. Empty on non-cobra sessions.
    /// </summary>
    string? GunStatus = null,
    double VictoryHoldProgress = 0,
    int HostileKills = 0,
    /// <summary>True only after the Cobra pilot explicitly designates a live hostile.</summary>
    bool CobraTargetSelected = false,
    /// <summary>Authoritative recovery-platform transform; false for missions without one.</summary>
    bool RecoveryPlatformPresent = false,
    Vec3 RecoveryPlatform = default,
    double RecoveryPlatformHeadingRad = 0,
    double RecoveryPlatformPitchDeg = 0,
    /// <summary>Authoritative launcher transaction used only for renderer-side launch FX.</summary>
    bool CatapultActive = false,
    double CatapultProgress = 0,
    /// <summary>Weekend Ride context; zero on aircraft missions.</summary>
    double VehicleSpeedMps = 0,
    double EngineRpm = 0,
    int VehicleGear = 0,
    double CircuitProgressM = 0,
    double CircuitLengthM = 0,
    int NextSectorIndex = 0,
    int LapCount = 0,
    /// <summary>First Merge state-authoritative golden-path cues; defaults on other missions.</summary>
    bool PadlockSelected = false,
    bool GunSolution = false,
    int PlayerHits = 0,
    /// <summary>Rapier's sim-authored sortie context; defaults on other missions.</summary>
    int RapierPhaseCode = 0,
    string? RapierPhaseToken = null,
    string? RapierCircuitLeg = null,
    int RapierRecoveryGate = 0,
    bool RapierAutomationEnabled = false,
    bool RapierAutomationActive = false,
    string? RapierJobToken = null,
    int RapierDronesRemaining = 0,
    /// <summary>Sim-authored, symbol-led Weekend first-success cue; empty on other missions.</summary>
    string? WeekendCue = null);
