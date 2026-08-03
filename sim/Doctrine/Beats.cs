using System.Collections.Generic;
namespace GunsOnly.Sim.Doctrine;

/// <summary>
/// The deliberately small combat/loadout seam for the current one-player/one-opponent sortie.
/// A positive PlayerAmmo value enables the player's gun. PlayerInfiniteAmmo selects the historical
/// thermally limited model; otherwise that number is the finite magazine. OpponentAmmo remains a
/// finite magazine. SimulationSession remains the authority for weapon instances, projectiles,
/// damage, and outcomes.
/// </summary>
public sealed record CombatConfig(
    int PlayerAmmo = GunKill.DefaultAmmo,
    int OpponentAmmo = GunKill.DefaultAmmo,
    int PlayerHitsToDefeat = 4,
    int OpponentHitsToDefeat = GunKill.DefaultHitsToKill,
    GunProfile? PlayerGun = null,
    GunProfile? OpponentGun = null,
    /// <summary>
    /// Optional physical target-radius override for the player's gun. Ordinary aircraft keep the
    /// gun profile's own effective radius; unusually large targets publish their real silhouette
    /// here instead of corrupting the M61 profile for every other sortie.
    /// </summary>
    double? PlayerTargetHitRadiusM = null,
    /// <summary>
    /// Player guns historically opt into the thermally limited infinite-ammunition model. A
    /// finite-pass mission can explicitly retain its declared magazine instead.
    /// </summary>
    bool PlayerInfiniteAmmo = true) {
    public static CombatConfig Fighter { get; } = new();
    public static CombatConfig GliderAgainstUnarmedTarget { get; } = new(
        PlayerAmmo: 50,
        OpponentAmmo: 0,
        PlayerHitsToDefeat: 2,
        OpponentHitsToDefeat: GunKill.DefaultHitsToKill);
    public static CombatConfig CarrierQualification { get; } = new(
        PlayerAmmo: GunKill.DefaultAmmo,
        OpponentAmmo: 0,
        PlayerHitsToDefeat: 4,
        OpponentHitsToDefeat: GunKill.DefaultHitsToKill);
    public static CombatConfig CarrierRecoveryOnly { get; } = new(
        PlayerAmmo: 0,
        OpponentAmmo: 0,
        PlayerHitsToDefeat: 4,
        OpponentHitsToDefeat: GunKill.DefaultHitsToKill);
    public static CombatConfig Casevac { get; } = new(
        PlayerAmmo: 0,
        OpponentAmmo: 0,
        PlayerHitsToDefeat: 1,
        OpponentHitsToDefeat: 1);
    public static CombatConfig ModernVisualMerge { get; } = new(
        PlayerAmmo: 480,
        OpponentAmmo: 150,
        PlayerHitsToDefeat: 3,
        OpponentHitsToDefeat: 3,
        PlayerGun: GunProfiles.M61A2PublicDataSurrogate,
        OpponentGun: GunProfiles.GSh301PublicDataSurrogate);
    public static CombatConfig ModernDroneDefense { get; } = new(
        PlayerAmmo: 480,
        OpponentAmmo: 0,
        PlayerHitsToDefeat: 3,
        OpponentHitsToDefeat: 1,
        PlayerGun: GunProfiles.M61A2PublicDataSurrogate);
    public static CombatConfig RapierBalloonIntercept { get; } = new(
        // One short trigger opportunity, not a formation-clearing magazine. SimulationSession's
        // weapon instance remains the ammunition authority; this card selects its finite magazine
        // and the mission director permits only one apex pass.
        PlayerAmmo: 120,
        OpponentAmmo: 0,
        PlayerHitsToDefeat: 3,
        OpponentHitsToDefeat: 1,
        PlayerGun: GunProfiles.M61A2PublicDataSurrogate,
        // The NASA-scale envelope is 114.5 m broadside. A 56 m radius makes rounds intersect
        // the actor the pilot can see without changing M61 dispersion or ballistics.
        PlayerTargetHitRadiusM: RapierMissionDirector.BalloonTargetHitRadiusM,
        PlayerInfiniteAmmo: false);

    public GunProfile PlayerGunProfile => PlayerGun ?? GunProfiles.SixM3FiftyCal;
    public GunProfile OpponentGunProfile => OpponentGun ?? GunProfiles.SixM3FiftyCal;
    public bool PlayerGunEnabled => PlayerAmmo > 0;
}

/// <summary>
/// Pilot-facing capability identity. A system which is not yet simulated is named explicitly;
/// presentation must not silently project F-86 utility hydraulics into another aircraft merely
/// because the current session owns an internal compatibility object.
/// </summary>
public sealed record AircraftCapability(
    string Id,
    string DisplayName,
    string PresentationId,
    string SystemsProfileId,
    bool SystemsSimulated,
    bool PublicDataSurrogate = false,
    string PublicSourceUrl = "",
    AutoGcasCapabilityProfile? AutoGcas = null) {
    public AutoGcasCapabilityProfile AutomaticGroundCollisionAvoidance =>
        AutoGcas ?? AutoGcasCapabilityProfile.None;
    public static AircraftCapability F86F30 { get; } = new(
        "aircraft.f86f30.v1", "F-86F-30",
        "presentation.vehicle.player.v1", "systems.f86f.utility.v1", true);
    /// The aircraft that actually flew the straight-deck recovery: VF-51's F9F-2 off Essex.
    /// PresentationId stays the shared player model deliberately -- there is no Panther art yet,
    /// and a wrong-looking aeroplane is a known gap, not a claim. The systems profile is openly
    /// the borrowed F-86 one for the same reason: no Panther gear/flap placard has been located
    /// (docs/airframes/f9f-2-panther/00-sources.md). Naming it "borrowed-f86f" keeps that visible
    /// instead of minting an id that implies Panther systems data we do not hold.
    public static AircraftCapability F9F2Panther { get; } = new(
        "aircraft.f9f2.v1", "F9F-2 Panther",
        "presentation.vehicle.player.v1", "systems.borrowed-f86f.utility.v1", true);
    public static AircraftCapability F86F30Bandit { get; } = F86F30 with {
        Id = "aircraft.f86f30.bandit.v1",
        PresentationId = "presentation.vehicle.bandit.v1"
    };
    public static AircraftCapability BalloonGliderPrototype { get; } = new(
        "aircraft.balloon-glider.prototype.v1", "Balloon glider prototype",
        "presentation.vehicle.glider-strike.v1", "systems.none.engine-less.v1", false);
    public static AircraftCapability HighAltitudeWeatherBalloonTarget { get; } = new(
        "target.high-altitude-weather-balloon.public-data-surrogate.v1",
        "High-altitude scientific balloon",
        "presentation.vehicle.high-altitude-weather-balloon.target.v1",
        "systems.free-balloon.target-only.public-data-surrogate.v1",
        SystemsSimulated: false,
        PublicDataSurrogate: true,
        PublicSourceUrl:
            "https://science.nasa.gov/blogs/super-pressure-balloon/2016/04/04/nasas-super-pressure-balloon-by-the-numbers/");
    public static AircraftCapability AwacsTargetPrototype { get; } = new(
        "aircraft.awacs-target.prototype.v1", "AEW&C target prototype",
        "presentation.vehicle.awacs-target.v1", "systems.target-only.prototype.v1", false);
    public static AircraftCapability TransportTargetPrototype { get; } = new(
        "aircraft.transport-target.prototype.v1", "Transport target prototype",
        "presentation.vehicle.transport-target.prototype.v1",
        "systems.target-only.prototype.v1", false);
    public static AircraftCapability F22ASurrogate { get; } = new(
        "aircraft.f22a.public-data-surrogate.v1", "F-22A public-data surrogate",
        "presentation.vehicle.f22a.public-data-surrogate.v1",
        "systems.modern-airborne.not-simulated.v1", false, true,
        "https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104506/f-22-raptor/",
        AutoGcasCapabilityProfile.ModernCrewedPublicDataSurrogate);
    /// <summary>
    /// The same public-data aircraft identity with only the generic conventional landing-gear
    /// seam enabled for the authored runway recovery. This does not claim an F-22 hydraulic,
    /// flap, warning, or emergency-extension simulation.
    /// </summary>
    public static AircraftCapability F22AConventionalRecoverySurrogate { get; } =
        F22ASurrogate with {
            SystemsProfileId =
                "systems.modern-conventional-gear.public-data-surrogate.v1",
            SystemsSimulated = true
        };
    /// The 2030s cheap high-altitude interceptor. CMC where the heat is, composite elsewhere, no
    /// windscreen — the occupant is reclined behind sensors in a composite escape pod — catapult
    /// launched from deep rear basing and recovered on a hook. Systems ARE simulated because the
    /// aircraft's whole character lives in what its engine can and cannot do at a given Mach.
    public static AircraftCapability RapierSurrogate { get; } = new(
        "aircraft.rapier.public-data-surrogate.v1",
        "Rapier high-altitude interceptor (surrogate)",
        "presentation.vehicle.rapier.public-data-surrogate.v1",
        "systems.carrier-recovery.generic-surrogate.v1", true, true);

    public static AircraftCapability F35CCarrierSurrogate { get; } = new(
        "aircraft.f35c.public-data-carrier-surrogate.v1",
        "F-35C public-data carrier surrogate",
        "presentation.vehicle.f35c.public-data-surrogate.v1",
        // The generic recovery system supplies only pilot-visible gear/flap state and the physical
        // downlock boundary needed by the carrier model. It is not labelled as an F-35 utility or
        // flight-control system simulation.
        "systems.carrier-recovery.generic-surrogate.v1", true, true,
        "https://www.f35.com/content/dam/lockheed-martin/aero/f35/documents/FG21-00000_001F35FastFacts2_2021.pdf");
    public static AircraftCapability Su27SSurrogate { get; } = new(
        "aircraft.su27s.public-data-surrogate.v1", "Su-27S public-data surrogate",
        "presentation.vehicle.su27s.public-data-surrogate.v1",
        "systems.modern-airborne.not-simulated.v1", false, true,
        "https://www.ukrspecexport.com/uploads/files/Categories/pdf_1/a205b8.pdf");
    public static AircraftCapability Su35SSurrogate { get; } = new(
        "aircraft.su35s.public-data-surrogate.v1", "Su-35S public-data surrogate",
        // The aerodynamic surrogate is a transparent Su-27S delta and reuses that family's
        // presentation until a separately governed Su-35S visual asset exists.
        "presentation.vehicle.su27s.public-data-surrogate.v1",
        "systems.modern-airborne.not-simulated.v1", false, true,
        "https://uacrussia.ru/en/aircraft/lineup/military/su-35/");
    public static AircraftCapability OneWayAttackDronePrototype { get; } = new(
        "aircraft.one-way-attack-drone.prototype.v1", "One-way attack drone prototype",
        "presentation.vehicle.one-way-attack-drone.prototype.v1",
        "systems.uncrewed-prototype.not-simulated.v1", false);
    public static AircraftCapability CasevacAirAmbulancePrototype { get; } = new(
        GunsOnly.Sim.Casevac.BuiltInCasevacDefinitions.AircraftId,
        "Air ambulance prototype",
        "presentation.vehicle.casevac-air-ambulance.prototype.v1",
        "systems.casevac-air-ambulance.reduced-order.v1",
        SystemsSimulated: false);
    /// The machine spike's airframe finally gets its own identity. It flew
    /// FlightModel.UcavInterceptorSurrogate — 15 G structural, half the player's wing loading —
    /// while presentation reported the beat's staged Su-27S, so the pilot was told they were
    /// fighting a Flanker by the hardest opponent in the game. Explicitly fictional: no public
    /// source is claimed and PublicDataSurrogate stays false. It reuses the drone prototype's
    /// visual until a separately governed uncrewed-interceptor asset exists — the same precedent
    /// the Su-35S sets by reusing the Su-27S family's presentation.
    public static AircraftCapability UcavInterceptorPrototype { get; } = new(
        "aircraft.ucav-interceptor.prototype.v1", "UCAV interceptor prototype",
        "presentation.vehicle.one-way-attack-drone.prototype.v1",
        "systems.uncrewed-prototype.not-simulated.v1", false);
    public static AircraftCapability F14ASurrogate { get; } = new(
        "aircraft.f14a.public-data-surrogate.v1", "F-14A public-data surrogate",
        "presentation.vehicle.f14a.public-data-surrogate.v1",
        "systems.cold-war-fighter.not-simulated.v1", false, true,
        "https://www.history.navy.mil/content/history/museums/nnam/explore/collections/aircraft/f/f-14a-tomcat.html");
    public static AircraftCapability Mig28Surrogate { get; } = new(
        "aircraft.mig-28.f5e-class-fiction.v1", "MiG-28 (F-5E-class fiction)",
        "presentation.vehicle.mig-28.fiction.v1",
        "systems.cold-war-fighter.not-simulated.v1", false, true,
        "https://www.hickoryaviationmuseum.org/aircraft/northrop-f-5-tiger-ii/");
}

public enum MissionContentFamily {
    Korea1950s,
    Korea2030sPrototype,
    ModernPublicDataSurrogate,
    Custom,
    UkraineTrainingPrototype,
    Ukraine2030sTheatre
}

public enum MissionEnvironmentFrameKind {
    SharedTheatre,
    LocalHeroCell,
    LocalCoastalCell,
    LocalRegionalCorridor
}

/// <summary>
/// The environment a mission occupies is independent of the aircraft/content compatibility pack.
/// A Sabre, F-22, balloon glider and Rapier can therefore share one fictional 2030s Ukraine world
/// without lying about their vehicle presentation or public-data status.
/// </summary>
public sealed record MissionEnvironmentContract(
    string TheatreId,
    string LocationId,
    string WorldFrameId,
    string TerrainProfileId,
    string MacroSceneryProfile,
    string MicroSceneryProfile,
    MissionEnvironmentFrameKind FrameKind,
    double TerrainSourceAnchorEastM = 0.0,
    double TerrainSourceAnchorNorthM = 0.0,
    double PreferredTerrainStreamingRadiusM = 64_000.0,
    bool AcceptsMultiplayerWorldOrigin = false,
    string? MissionFeaturePackId = null,
    string? MissionFeaturePackSha256 = null,
    bool MissionFeaturePackRequired = false) {
    public bool MultiplayerTerrainShared =>
        FrameKind == MissionEnvironmentFrameKind.SharedTheatre
        && AcceptsMultiplayerWorldOrigin;
}

/// <summary>
/// One synthetic 2030s Ukraine theatre with nested fidelity bands. It carries no real coordinates:
/// the regional corridor is for high-altitude continuity, Soniachne is the current 32 m hero cell,
/// and the coastal cell gives recovery sorties a sea surface in the same fictional world.
/// </summary>
public static class Ukraine2030sTheatre {
    public const string TheatreId = "theatre.ukraine.soniachne-2030s.v1";
    public const string WorldFrameId = "world.ukraine.soniachne-2030s.v1";
    public const string TerrainProfileId = "terrain.ukraine.rapier-range.atlas.v1";
    public const string MacroSceneryProfile = "ukraine-2030s-macro";
    public const string MicroSceneryProfile = "ukraine-modern";
    public const string HeroFeaturePackId =
        "mission-feature-pack.ukraine-modern.soniachne-clinic-a.v1";
    public const string HeroFeaturePackSha256 =
        "1c2bf3cae753df11b93551a9caaee534b634e1d536a9423f5947b368a98c363d";
    public const string RapierStripFeaturePackId =
        "mission-feature-pack.ukraine-modern.rapier-eastern-strip.v1";
    public const string RapierStripFeaturePackSha256 =
        "f2613c28064cd3b9a7b835449bf9cfbbc5add64b9c7f4d753a1058e505189752";

    // The physical theatre is shared by every mission, but current multiplayer sectors can extend
    // beyond this finite regional product and the v2 presence protocol carries no frame/instance
    // identity. Keep room-origin translation disabled until assignment is terrain-aware; otherwise
    // a high-index pilot can launch over an unrendered edge while physics samples the safety apron.
    public static MissionEnvironmentContract Shared { get; } = new(
        TheatreId,
        "location.ukraine.soniachne-regional.v1",
        WorldFrameId,
        TerrainProfileId,
        MacroSceneryProfile,
        MicroSceneryProfile,
        MissionEnvironmentFrameKind.SharedTheatre,
        PreferredTerrainStreamingRadiusM: 48_000.0);

    public static MissionEnvironmentContract HeroCell { get; } = Shared with {
        LocationId = "location.ukraine.soniachne-hero-cell.v1",
        FrameKind = MissionEnvironmentFrameKind.LocalHeroCell,
        PreferredTerrainStreamingRadiusM = 32_000.0,
        MissionFeaturePackId = HeroFeaturePackId,
        MissionFeaturePackSha256 = HeroFeaturePackSha256,
        MissionFeaturePackRequired = true
    };

    // Legacy shared recovery-cell origin. The current embedded atlas resolves this source point
    // to land, so callers must not treat the name as proof of a water launch surface. It remains
    // fixed because CarrierApproach is a shared fixture; whole sorties that need verified sea own
    // a separately surveyed cell below.
    public static MissionEnvironmentContract CoastalCell { get; } = Shared with {
        LocationId = "location.ukraine.soniachne-coastal-cell.v1",
        FrameKind = MissionEnvironmentFrameKind.LocalCoastalCell,
        TerrainSourceAnchorEastM = -100_000.0,
        TerrainSourceAnchorNorthM = -100_000.0,
        PreferredTerrainStreamingRadiusM = 56_000.0
    };

    // Dedicated open-water origin for the Korea whole-sortie carrier fixture. The earlier
    // CoastalCell anchor is shared by recovery drills and currently resolves to 153 m land in the
    // embedded terrain atlas, so changing it here would silently move every caller of
    // CarrierApproach. This grid point was selected from that same immutable 256 m atlas: its
    // nearest land sample or atlas edge is 23.585 km away, leaving the complete catapult stroke
    // and initial climb over authoritative water rather than relying on the out-of-bounds apron.
    public static MissionEnvironmentContract KoreaCarrierCell { get; } = Shared with {
        LocationId = "location.ukraine.korea-carrier-open-sea-cell.v1",
        FrameKind = MissionEnvironmentFrameKind.LocalCoastalCell,
        TerrainSourceAnchorEastM = -4_864.0,
        TerrainSourceAnchorNorthM = -180_480.0,
        PreferredTerrainStreamingRadiusM = 56_000.0
    };

    public static MissionEnvironmentContract RapierCorridor { get; } = Shared with {
        LocationId = "location.ukraine.soniachne-rapier-corridor.v1",
        FrameKind = MissionEnvironmentFrameKind.LocalRegionalCorridor,
        // Visibility (fog) follows visibleWorldRadiusM / the 560 km apron, not this number.
        // Streaming must still reach the apron inner edge (±131 km theatre + 4 km transition): a
        // 40 km disc left a sky hole between the last chunk and the apron, which read as flicker
        // when the nose swept across that ring. ~145 km covers the theatre with margin while
        // staying far below the old 420 km "stream the horizon" cost.
        PreferredTerrainStreamingRadiusM = 145_000.0,
        MissionFeaturePackId = RapierStripFeaturePackId,
        MissionFeaturePackSha256 = RapierStripFeaturePackSha256,
        MissionFeaturePackRequired = true
    };
}

public enum MissionEconomicMode {
    Arcade,
    RapierOperations
}

/// <summary>
/// Stable mission identity lives with content, not a bridge switch over menu indexes. Economy is
/// an explicit mission contract: sharing the Rapier airframe or presentation never opts a sortie
/// into campaign debits.
/// </summary>
public sealed record MissionContract(
    string Id,
    MissionContentFamily ContentFamily,
    bool PublicDataSurrogate = false,
    string RulesOfEngagement = "GUNS_ONLY",
    string Era = "UNSPECIFIED",
    MissionEconomicMode EconomicMode = MissionEconomicMode.Arcade,
    bool AllowsTimeCompression = false) {
    public static MissionContract Custom { get; } = new(
        "mission.custom.v1", MissionContentFamily.Custom);
}

/// <summary>
/// Whether a mission stages an opposing aircraft at all. Present is the compatibility default;
/// non-combat sorties opt out explicitly instead of inventing an invisible target.
/// </summary>
public enum OpponentPresence {
    Present,
    None
}

/// <summary>
/// The player's fuel loadout for a beat. Capacity and bingo are instance data so future aircraft
/// can carry different internal loads without teaching FuelModel about airframe identities.
/// Engine-less aircraft opt out explicitly instead of representing "no fuel" as permanent bingo.
/// </summary>
public sealed record FuelConfig(
    double CapacityLb = FuelModel.DefaultFuelLb,
    double InitialFuelLb = FuelModel.DefaultFuelLb,
    double BingoThresholdLb = FuelModel.BingoFuelLb,
    bool ConsumesFuel = true,
    double? JokerThresholdLb = null,
    double? MinimumFuelThresholdLb = null,
    double? EmergencyFuelThresholdLb = null) {
    public static FuelConfig PoweredJet { get; } = new();
    /// <summary>
    /// Internal fuel at the start of a short-range visual engagement. The tanks retain their
    /// physical 2,826 lb capacity and ordinary 800 lb bingo; only the staged quantity changes.
    /// Starting every merge at maximum internal fuel made a representative combat-weight Sabre
    /// carry another 1,026 lb into a fight which is already assumed to occur after takeoff and
    /// ingress. Carrier and maintenance sorties deliberately do not inherit this loadout.
    /// </summary>
    public static FuelConfig FighterEngagement { get; } = new(
        CapacityLb: FuelModel.DefaultFuelLb,
        InitialFuelLb: 1800.0,
        BingoThresholdLb: FuelModel.BingoFuelLb,
        ConsumesFuel: true);
    public static FuelConfig EngineLess { get; } = new(
        CapacityLb: 0.0,
        InitialFuelLb: 0.0,
        BingoThresholdLb: 0.0,
        ConsumesFuel: false);
}

/// <summary>Typed hook for the small built-in maintenance sorties owned by SimulationSession.</summary>
public enum MaintenanceScenarioKind {
    None,
    F86EmergencyGearRecovery
}

/// <summary>
/// Keeps a sortie alive across successive, physically distinct opponents. Resources remain with
/// the player; only target-owned state is replaced after the destruction presentation has had a
/// short, deterministic dwell.
/// </summary>
public sealed record ContinuousCombatConfig(
    /// The beat between a kill and the next opponent. It is also the KILL CAM window: the client
    /// holds the padlock on the aircraft it just shot down for exactly this long before jumping to
    /// the survivor, so the pilot sees the result of their own gunnery instead of the camera
    /// snapping forward the instant the rounds land. 3.5 s sits inside the "3-5 s" the pilot asked
    /// for and still reads as a beat rather than a pause.
    double ReplacementDelaySeconds = 3.5,
    double? ReplacementSpeedMps = null,
    /// How many aircraft a single wave may field. Content decides whether a mission fights in
    /// formations at all; the director decides how many WITHIN that ceiling, on the same evidence
    /// it uses for tier and airframe. A fixture that wants to exercise the replacement contract
    /// rather than formation behaviour sets this to 1.
    int MaximumFormationSize = 2);

public record BeatSetup(string Name, AircraftState Player, AircraftState Bandit, IExecutionLaw Law,
    List<(double T, PilotCommand Cmd)> BanditTimeline,
    AircraftParams? PlayerParams = null, AircraftParams? BanditParams = null,
    GunsOnly.Sim.Carrier? Carrier = null, bool UsesReactiveBandit = false,
    CombatConfig? Combat = null, FuelConfig? Fuel = null,
    MaintenanceScenarioKind MaintenanceScenario = MaintenanceScenarioKind.None,
    double InitialThrottle = 0.85,
    /// Stage the pilot already TRIMMED for the staged speed rather than at InitialThrottle.
    /// A fight staged at corner speed but full military thrust accelerates straight off
    /// corner, so the pilot has to pull power before every single engagement.
    bool StageAtTrimThrottle = false,
    /// The launcher this beat's aircraft actually has. A 1950s deck catapult ends at 62 m/s, which
    /// is below flying speed for a high-wing-loading jet; a land-based electromagnetic launcher runs
    /// a longer stroke to a higher end speed. Null keeps the deck default.
    /// Launch the sortie ON the catapult rather than airborne. Until now the catapult only ever
    /// fired on a RELAUNCH after a trap, so a mission that begins with a catshot had no way to say
    /// so — which is the first item in "catshot, climb, cruise, descend and trap".
    bool StartsOnCatapult = false,
    double? CatapultStrokeM = null,
    double? CatapultEndSpeedMps = null,
    /// Upward ramp at the end of the stroke. Zero is a flat deck.
    double? CatapultRampAngleRad = null,
    /// Lateral offset of the launch track from the recovery centreline. Null keeps the deck default
    /// of -7 m, which is right for a ship and wrong for a land site with room to separate them.
    double? CatapultCrossOffsetM = null,
    /// Gear/flap architecture and limits. Null keeps the Sabre research basis, which is correct for
    /// every 1950s beat and badly wrong for anything launched above 185 KIAS.
    AirframeSystemsProfile? SystemsProfile = null,
    MissionContract? Mission = null,
    AircraftCapability? PlayerCapability = null,
    AircraftCapability? BanditCapability = null,
    VisualMergeEvaluationConfig? VisualMergeEvaluation = null,
    bool UsesNeutralMergeBandit = false,
    DroneRaidScenarioDefinition? DroneRaid = null,
    PilotPhysiologyProfile? PlayerPhysiologyProfile = null,
    bool RecoveryCompletesSortie = false,
    ContinuousCombatConfig? ContinuousCombat = null,
    PilotSkill BanditSkill = PilotSkill.Competent,
    MissionEnvironmentContract? Environment = null,
    ScriptedInterceptConfig? ScriptedIntercept = null,
    RecoveryPlan? RecoveryPlan = null,
    /// <summary>
    /// When true, Mesh nav uses Open Segment: curated free-fly Places plus Free Fix clicks.
    /// Mission-gated beats expose only the places configured for that sortie (usually HomePlate).
    /// </summary>
    bool OpenSegmentNav = false,
    OpponentPresence OpponentPresence = OpponentPresence.Present,
    AircraftState? OpponentInitialState = null,
    GunsOnly.Sim.Casevac.CasevacScenarioDefinition? Casevac = null) {
    public AircraftParams PlayerAir => PlayerParams ?? FlightModel.Sabre;
    public AircraftParams BanditAir => BanditParams ?? FlightModel.Sabre;
    public CombatConfig CombatRules => Combat ?? CombatConfig.Fighter;
    public FuelConfig FuelLoadout => Fuel ?? FuelConfig.PoweredJet;
    public MissionContract MissionIdentity => Mission ?? MissionContract.Custom;
    public MissionEnvironmentContract EnvironmentIdentity =>
        Environment ?? Ukraine2030sTheatre.Shared;
    public AircraftCapability PlayerAircraft => PlayerCapability ?? AircraftCapability.F86F30;
    public AircraftCapability BanditAircraft => BanditCapability
        ?? AircraftCapability.F86F30Bandit;
    /// <summary>
    /// Optional opponent kinematics at the staging boundary. Legacy combat beats retain their
    /// positional Bandit value; no-opponent missions publish null and never construct an actor.
    /// </summary>
    public AircraftState? InitialOpponent => OpponentPresence == OpponentPresence.Present
        ? OpponentInitialState ?? Bandit
        : null;
    /// The Flanker-plus escalation keys on the SPAWNED SKILL, not the engagement index: with
    /// the FightDirector staging tiers from observed performance, a late-but-eased engagement
    /// must not inherit the Ace airframe, and a director boss must. The engagement-keyed
    /// helpers delegate through the interim ladder for callers without a director decision.
    bool UsesSu35SAtAceRung(PilotSkill skill) =>
        skill == PilotSkill.Ace
        && ContinuousCombat is not null
        && BanditAircraft.Id == AircraftCapability.Su27SSurrogate.Id;
    /// True when this beat's staged opponent is the Flanker family, so the uprated/prototype
    /// mounts have something coherent to escalate INTO. A Korea-era or drone-raid beat keeps its
    /// staged airframe whatever the director asks for: the mount axis is continuous-combat
    /// escalation, not a licence to field a Su-35S in a 1950s sortie.
    bool MountEscalationAvailable =>
        ContinuousCombat is not null
        && BanditAircraft.Id == AircraftCapability.Su27SSurrogate.Id;
    public AircraftParams BanditAirForSkill(PilotSkill skill) =>
        skill == PilotSkill.Machine
            ? FlightModel.UcavInterceptorSurrogate
            : UsesSu35SAtAceRung(skill)
                ? FlightModel.Su35SPublicDataSurrogate
                : BanditAir;
    public AircraftCapability BanditAircraftForSkill(PilotSkill skill) =>
        skill == PilotSkill.Machine && ContinuousCombat is not null
            ? AircraftCapability.UcavInterceptorPrototype
            : UsesSu35SAtAceRung(skill)
                ? AircraftCapability.Su35SSurrogate
                : BanditAircraft;

    /// The director's chosen jet. Falls back to the skill-keyed selection whenever this beat has
    /// nothing to escalate into, so every caller without a director decision behaves exactly as
    /// before.
    public AircraftParams BanditAirForMount(PilotSkill skill, BanditMount mount) =>
        !MountEscalationAvailable || skill == PilotSkill.Machine
            ? BanditAirForSkill(skill)
            : mount == BanditMount.Uprated
                ? FlightModel.Su35SPublicDataSurrogate
                : BanditAir;
    public AircraftCapability BanditAircraftForMount(PilotSkill skill, BanditMount mount) =>
        !MountEscalationAvailable || skill == PilotSkill.Machine
            ? BanditAircraftForSkill(skill)
            : mount == BanditMount.Uprated
                ? AircraftCapability.Su35SSurrogate
                : BanditAircraft;
    public AircraftParams BanditAirForEngagement(int engagementNumber) =>
        BanditAirForSkill(BanditSkillProfile.ForEngagement(engagementNumber));
    public AircraftCapability BanditAircraftForEngagement(int engagementNumber) =>
        BanditAircraftForSkill(BanditSkillProfile.ForEngagement(engagementNumber));
    /// Pilot capability belongs to the actor and mission, not to the aircraft's aerodynamic
    /// coefficients. The Korea profile is the period-fighter default; modern missions opt into
    /// their full-coverage-suit/pressure-breathing surrogate explicitly below.
    public PilotPhysiologyProfile PlayerPilotPhysiology => PlayerPhysiologyProfile
        ?? PilotPhysiologyProfile.KoreaFastJetReference;
    public IBandit CreateBandit(
        GunsOnly.Sim.Environment.ITerrainSurface? terrain = null,
        SpawnSpec? spec = null) {
        if (InitialOpponent is not { } authoredBandit)
            throw new InvalidOperationException(
                "This mission does not define an opponent actor.");
        if (UsesNeutralMergeBandit) {
            // A director-staged opening must change the whole actor, not just the skill label.
            // Keep the authored no-spec opening byte-for-byte compatible, while a persisted
            // director decision may select a different mount (or the machine's own airframe),
            // boss overlay and opener doctrine before the neutral pass begins.
            PilotSkill mergeSkill = spec?.Skill ?? BanditSkill;
            AircraftParams mergeAir = spec is { } mergeOpening
                ? BanditAirForMount(mergeSkill, mergeOpening.Mount)
                : BanditAir;
            AircraftState mergeInitial = ReferenceEquals(mergeAir, BanditAir)
                ? authoredBandit : authoredBandit with { Mass = mergeAir.MassKg };
            return new NeutralMergeBandit(
                mergeInitial, mergeAir, mergeSkill, terrain,
                profile: spec is { Boss: true } ? BanditSkillProfile.Boss() : null,
                doctrineIndex: spec?.DoctrineIndex,
                presenting: spec?.Sparring == true);
        }
        if (!UsesReactiveBandit)
            return new RailBandit(authoredBandit, BanditAir, BanditTimeline);
        // A director-staged opening (post-restart pacing memory) may resolve a skill whose
        // airframe differs from the beat's staged one — a machine spike surviving a restart
        // must fly the UCAV at UCAV mass, not the staged airframe with a 15 G label.
        PilotSkill skill = spec?.Skill ?? BanditSkill;
        AircraftParams air = spec is { } opening
            ? BanditAirForMount(skill, opening.Mount)
            : BanditAirForSkill(skill);
        AircraftState initial = ReferenceEquals(air, BanditAir)
            ? authoredBandit : authoredBandit with { Mass = air.MassKg };
        return new ReactiveBandit(initial, air, skill, terrain,
            profile: spec is { Boss: true } ? BanditSkillProfile.Boss() : null,
            doctrineIndex: spec?.DoctrineIndex);
    }

    /// <summary>
    /// Place the rest of a finite scripted formation around the authored leader. Unlike the
    /// continuous-fight spawn factory, this preserves the 420 km intercept geometry instead of
    /// teleporting a replacement merge beside the launcher.
    /// </summary>
    public IBandit CreateScriptedFormationBandit(int formationIndex,
        GunsOnly.Sim.Environment.ITerrainSurface? terrain = null) {
        if (formationIndex < 1)
            throw new ArgumentOutOfRangeException(nameof(formationIndex));
        if (InitialOpponent is not { } authoredBandit)
            throw new InvalidOperationException(
                "This mission does not define an opponent formation.");
        double side = formationIndex % 2 == 1 ? 1.0 : -1.0;
        double rank = (formationIndex + 1) / 2.0;
        AircraftState initial = authoredBandit with {
            Position = authoredBandit.Position + new Vec3D(
                side * 1_100.0 * rank,
                (formationIndex % 3 - 1) * 180.0,
                -520.0 * rank)
        };
        return UsesReactiveBandit
            ? new ReactiveBandit(initial, BanditAir, BanditSkill, terrain)
            : new RailBandit(initial, BanditAir, BanditTimeline);
    }

    /// Deterministic merge factory for a continuous-operations ruleset. Successor aircraft inherit
    /// the mission's staged opponent speed rather than falling back to a Korea-era constant. The
    /// terrain surface, when supplied, keeps replacement merges and the bandit's own floor sense
    /// honest over real ground instead of a sea-level constant.
    /// The true airspeed at which this airframe's INSTANTANEOUS turn rate peaks, at the altitude
    /// it is being staged into. Corner is where a first-turn merge is decided.
    public static double CornerTrueAirspeedMps(AircraftParams air, double altitudeM) =>
        AirData.TrueAirspeedForCalibratedAirspeedMps(
            AirData.PositiveCornerSpeedKiasAtAltitude(air.MassKg, air, altitudeM)
                / AirData.MpsToKnots,
            altitudeM);

    public IBandit CreateNextBandit(in AircraftState player, int engagementNumber,
        GunsOnly.Sim.Environment.ITerrainSurface? terrain = null, SpawnSpec? spec = null,
        AircraftState? wingLead = null) {
        // Without a director decision the interim per-engagement ladder still applies (the
        // director's own cold start reproduces it, so the two paths cannot diverge silently).
        PilotSkill skill = spec?.Skill ?? BanditSkillProfile.ForEngagement(engagementNumber);
        AircraftParams air = spec is { } staged
            ? BanditAirForMount(skill, staged.Mount)
            : BanditAirForSkill(skill);
        // Arrive at the speed THIS airframe fights best at — the same courtesy the player's
        // staging has always had. Every replacement previously inherited the beat's staged 285 m/s
        // regardless of what it was flying, which is 37.6% above the Flanker's corner: it turned up
        // to every merge 137 knots fast and could not pull its own peak rate on the first turn.
        // The mount axis makes this doubly necessary — a spawn speed constant cannot be right for
        // two different airframes.
        double replacementSpeedMps = ContinuousCombat is { } continuous
            ? continuous.ReplacementSpeedMps ?? CornerTrueAirspeedMps(air, player.Position.Y)
            : 180.0;
        return ReactiveBandit.SpawnForMerge(
            player, air,
            engagementNumber: engagementNumber,
            speedMps: replacementSpeedMps,
            skill: skill,
            terrain: terrain,
            profile: spec is { Boss: true } ? BanditSkillProfile.Boss() : null,
            doctrineIndex: spec?.DoctrineIndex,
            presenting: spec?.Sparring == true,
            wingLead: wingLead);
    }
}

public sealed class RailBandit : IBandit {
    readonly AircraftSim _sim;
    readonly System.Collections.Generic.List<(double T, PilotCommand Cmd)> _tl;
    int _active;
    int _damageHandedness = 1;
    WreckContactMotion? _wreckMotion;
    public double T { get; private set; }
    public bool CatastrophicallyDamaged { get; private set; }
    public bool WreckSettled => _wreckMotion?.Settled ?? false;
    public ImpactSurface WreckSurface => _wreckMotion?.Surface ?? ImpactSurface.None;
    public bool WreckSurfaceChangedThisStep =>
        _wreckMotion?.SurfaceChangedThisStep ?? false;
    public AircraftState State => _sim.State;
    public Vec3D LiftDir => _sim.LiftDir;
    public GunsOnly.Sim.Turbulence.IWindField? Wind {
        get => _sim.Wind;
        set => _sim.Wind = value;
    }
    public IAtmosphereModel Atmosphere {
        get => _sim.AtmosphereModel;
        set => _sim.AtmosphereModel = value;
    }
    public RailBandit(AircraftState initial, AircraftParams p, System.Collections.Generic.List<(double, PilotCommand)> timeline) {
        if (timeline is null || timeline.Count == 0) throw new System.ArgumentException("timeline must be non-empty");
        if (timeline[0].Item1 != 0.0) throw new System.ArgumentException("timeline must start at T=0");
        for (int i = 1; i < timeline.Count; i++)
            if (timeline[i].Item1 <= timeline[i - 1].Item1) throw new System.ArgumentException("timeline must be strictly ascending");
        _sim = new AircraftSim(initial, p);
        _tl = new(timeline.Count);
        foreach (var e in timeline) _tl.Add(e);
    }
    public void Step(double dt) {
        if (!double.IsFinite(dt) || dt <= 0.0)
            throw new System.ArgumentOutOfRangeException(nameof(dt));
        if (_wreckMotion is not null) {
            _sim.AdvanceEngineOnly(0.0, dt);
            _wreckMotion.Step(dt);
            _sim.AdoptExternalKinematics(_wreckMotion.State);
            T += dt;
            return;
        }
        if (CatastrophicallyDamaged) {
            TerminalFlightDynamics.Step(_sim, AirframeAerodynamicState.Clean,
                _damageHandedness, dt);
            T += dt;
            return;
        }
        // Half-tick epsilon: float accumulation of T must not delay a scheduled switch by a tick.
        while (_active + 1 < _tl.Count && _tl[_active + 1].T <= T + dt * 0.5) _active++;
        _sim.Step(_tl[_active].Cmd, dt);
        T += dt;
    }
    public void Step(in ActorObservation player, double dt) => Step(dt);
    public bool WantsToFire(in ActorObservation player) => !CatastrophicallyDamaged
        && BanditFireControl.WantsToFire(State, player, T);
    public void ApplyCatastrophicDamage(int handedness) {
        if (CatastrophicallyDamaged) return;
        CatastrophicallyDamaged = true;
        _damageHandedness = handedness < 0 ? -1 : 1;
        _sim.EngineCombustionAvailable = false;
        _sim.AerodynamicConfiguration = TerminalFlightDynamics.Configuration(
            AirframeAerodynamicState.Clean, _damageHandedness);
    }
    public void ApplySurfaceImpact(ImpactSurface surface, in Vec3D surfaceVelocity,
        double surfaceHeightM, Carrier? carrier = null,
        GunsOnly.Sim.Environment.ITerrainSurface? terrain = null) {
        if (_wreckMotion is not null) return;
        ApplyCatastrophicDamage(_damageHandedness);
        _wreckMotion = new WreckContactMotion(_sim.State, surface,
            surfaceVelocity, surfaceHeightM, carrier, terrain: terrain);
        _sim.AdoptExternalKinematics(_wreckMotion.State);
    }
}

public static class Beats {
    public const int FirstBuiltInIndex = 1;
    /// Raise this WITH the switch below. An index past the end does not throw and does not warn:
    /// StartBeat silently clamps it to FirstBuiltInIndex, so the mission the player picked quietly
    /// becomes Perch in an F-86. That is exactly how the Korea sortie shipped a boot card reading
    /// "F9F-2 PANTHER" over a running mission.perch-attack.v1.
    public const int LastBuiltInIndex = 14;

    public static bool IsBuiltInIndex(int index) =>
        index is >= FirstBuiltInIndex and <= LastBuiltInIndex;

    const double Alt = 3000;
    static AircraftState S(double x, double y, double z, double chi, double v) =>
        new(new Vec3D(x, y, z), v, 0, chi, 0, FlightModel.Sabre.MassKg);
    static MissionContract KoreaMission(string id) => new(
        id, MissionContentFamily.Korea1950s, Era: "KOREA_1950S");

    public static BeatSetup Perch() => new("Perch attack",
        Player: S(0, Alt + 300, -500, 0, 200),
        Bandit: S(0, Alt, 0, 0, 180),
        Law: new PurePursuitLaw(),
        BanditTimeline: new() {
            (0.0, new PilotCommand(1.0, 0.0, 0.85, 0)),
            (5.0, new PilotCommand(4.0, -1.10, 1.0, 0)),   // 4G left turn
            (25.0, new PilotCommand(1.0, 0.0, 0.85, 0)),
        },
        Combat: CombatConfig.Fighter,
        Fuel: FuelConfig.FighterEngagement,
        InitialThrottle: 1.0,
        Mission: KoreaMission("mission.perch-attack.v1"));

    public static BeatSetup BreakDefense() => new("Break defense",
        Player: S(0, Alt, 0, 0, 190),
        Bandit: S(80, Alt + 120, -700, 0, 230),           // high six, closing
        Law: new BreakLaw(+1),
        BanditTimeline: new() {
            (0.0, new PilotCommand(0.9, -0.20, 1.0, 0)),   // slight left + gentle descent: converge on the player
            (8.0, new PilotCommand(2.5, -0.60, 1.0, 0)),   // press the attack
            (20.0, new PilotCommand(1.0, 0.0, 0.7, 0)),    // knock it off
        },
        Combat: CombatConfig.Fighter,
        Fuel: FuelConfig.FighterEngagement,
        InitialThrottle: 1.0,
        Mission: KoreaMission("mission.break-defense.v1"));

    /// KOREA 2030s PROXY WAR — balloon-lofted glider strike on a PLA-supported AEW&C.
    /// You were carried to 60,000 ft under a balloon and cut loose. No engine: every turn is a
    /// withdrawal from an altitude account you can never pay back into. The KJ-500 orbits at
    /// 30k, huge and slow and blind to you (no plume, no intake return). You have ONE pass —
    /// after that you're a falling wing. This is the game's energy lesson, made inescapable.
    public static BeatSetup BalloonStrike() {
        // TERMINAL PHASE. The 70k balloon release is the briefing, not the beat: at L/D 28 a
        // 12 km height surplus is ~340 km of glide energy for an 8 km problem, so a dive
        // arrives at 426 kt with a 2 km turn radius and screams past at 3 km / 64 deg off —
        // verified by the original deterministic mission probe. Gunning it requires arriving
        // SLOW—an energy-DISPOSAL approach. That is the real mission and it is hard; it belongs in
        // M2 content, not an M0 grammar test. So the beat starts where the gun pass starts:
        // you have already glided in from the balloon and are converting the last of it.
        const double DropAlt = 10058;   // 33,000 ft — 3k above the target, low overtake, flyable
        const double AwacsAlt = 9144;   // 30,000 ft
        return new BeatSetup("Balloon strike — KJ-500",
            // Cut loose slow (a balloon gives you height, not speed) 3.5 km south, nose down.
            // This is the terminal setup after the longer glide: the remaining height must be
            // deliberately spent in a steep approach or the glider sails past the firing geometry.
            Player: new AircraftState(new Vec3D(0, DropAlt, -3500), 100, -0.06, 0, 0, FlightModel.GliderStrike.MassKg),
            Bandit: new AircraftState(new Vec3D(0, AwacsAlt, 0), 130, 0, 0, 0, FlightModel.AwacsTarget.MassKg),
            Law: new PurePursuitLaw(),
            BanditTimeline: new() {
                (0.0, new PilotCommand(1.0, 0.10, 0.55, 0)),   // lazy racetrack orbit, oblivious
                (45.0, new PilotCommand(1.0, 0.10, 0.55, 0)),
            },
            PlayerParams: FlightModel.GliderStrike,
            BanditParams: FlightModel.AwacsTarget,
            Combat: CombatConfig.GliderAgainstUnarmedTarget,
            Fuel: FuelConfig.EngineLess,
            Mission: new MissionContract(
                "mission.korea-2030s.balloon-strike.prototype.v1",
                MissionContentFamily.Korea2030sPrototype,
                Era: "KOREA_2030S_PROXY"),
            PlayerCapability: AircraftCapability.BalloonGliderPrototype,
            BanditCapability: AircraftCapability.AwacsTargetPrototype);
    }

    /// CARRIER RECOVERY. You start in the active groove: low, slow, astern of the boat on a shallow
    /// glideslope. Axial preserves the Korean-War straight-deck hazard; Angled rotates the complete
    /// approach, wire and rollout frame nine degrees to port while the ship keeps steaming ahead.
    /// The generic carrier recovery fixture. Other missions compose this for their recovery leg,
    /// which is why the aircraft is a PARAMETER and not baked in: repointing the airframe to suit
    /// one beat used to change every other beat's recovery aircraft silently, and did — a Panther
    /// swap for the Korea beat broke three Rapier automation tests that had nothing to do with it.
    ///
    /// Rapier recovery is not a carrier landing. They share a schedule and a deck geometry; they
    /// do not share an aeroplane. Callers that pass nothing keep the F-86 fixture they always had.
    ///
    /// <param name="playerParams">Airframe flying the recovery. Null keeps the F-86 fixture.</param>
    /// <param name="playerCapability">Identity for that airframe; must match playerParams, or the
    /// beat reports flying one aeroplane while actually flying another.</param>
    public static BeatSetup CarrierApproach(
        GunsOnly.Sim.Carrier.DeckConfiguration configuration = GunsOnly.Sim.Carrier.DeckConfiguration.Axial,
        AircraftParams? playerParams = null,
        AircraftCapability? playerCapability = null) {
        // Naming an airframe without its identity is not a convenience worth having: it produces a
        // beat that flies a Panther and reports an F-86, which is precisely the defect the identity
        // guard exists to catch. Make it unrepresentable rather than merely discouraged.
        if (playerParams is not null && playerCapability is null)
            throw new ArgumentException(
                "a named airframe must carry its AircraftCapability, or the beat misreports what it flies",
                nameof(playerCapability));
        AircraftParams air = playerParams ?? FlightModel.Sabre;
        var carrier = new GunsOnly.Sim.Carrier(
            deckCentre: new Vec3D(0, 20, 0), headingRad: 0, speedMps: 3,
            deckAltM: 20, deckLengthM: 250, deckWidthM: 30,
            configuration: configuration);
        // ~1.5 km down the ACTIVE landing centreline, on-speed and on a −3.4° slope toward the
        // ~20 m deck. On the angled configuration this correctly starts off the ship's starboard
        // quarter and points nine degrees to port, straight down the angled landing area.
        //
        // On-speed follows the AIRFRAME. The F-86 fixture's 70 m/s (~136 kt) sits at 1.14x its
        // clean stall, so that ratio -- not the raw number -- is what transfers to another
        // aeroplane. Carrying 70 m/s onto a wing that stalls slower would fly the approach fast
        // and quietly make the deck easier, which is the opposite of the point.
        double onSpeed = 1.14 * AirData.StallSpeedKias(air.MassKg, air) / AirData.MpsToKnots;
        var start = carrier.LandingPoint(along: -1500, height: 90);
        return new BeatSetup("Carrier approach",
        Player: new AircraftState(start, onSpeed, -0.06, carrier.LandingHeadingRad, 0, air.MassKg),
        // The one-opponent ABI still needs a finite aircraft state, but carrier qualification is a
        // recovery attempt rather than a hidden combat sortie. Keep the inert rail well outside the
        // recovery volume so neither its navigation nor an incidental impact can author the result.
        Bandit: new AircraftState(new Vec3D(0, 1500, 50000), 120, 0, 0.0, 0,
            FlightModel.Sabre.MassKg),
        Law: new ApproachLaw(),
        BanditTimeline: new() {
            (0.0, new PilotCommand(1.0, 0.0, 0.30, 0)),
        },
        PlayerParams: air,
        PlayerCapability: playerCapability,
        BanditParams: FlightModel.Sabre,
        // The real target: a ~250 m × 30 m carrier, 20 m freeboard, steaming north into the wind.
        // Kinematic — it does not fly, it steams.
        Carrier: carrier,
        UsesReactiveBandit: false,
        Combat: CombatConfig.CarrierRecoveryOnly,
        Mission: KoreaMission("mission.carrier-qualification.v1"),
        RecoveryCompletesSortie: true,
        Environment: Ukraine2030sTheatre.CoastalCell);
    }

    /// KOREA 1951 — the recovery this whole beat was always about. VF-51 flew F9F-2 Panthers off
    /// USS Essex from exactly this deck: axial, hydraulic catapults, paddles LSO, barrier at the
    /// far end, and no bolter. The F-86 fixture stands in for the geometry elsewhere, but it was a
    /// land-based USAF fighter that never went to sea, so it cannot teach this.
    ///
    /// Axial is not a default here, it is the subject. An angled deck gives you a second chance;
    /// this one does not, and a Panther's centrifugal J42 takes its time answering the throttle
    /// (see FlightModel.F9F2Panther.SpoolUpTau). Those two facts together are the lesson.
    public static BeatSetup KoreaCarrierApproach() =>
        CarrierApproach(
            GunsOnly.Sim.Carrier.DeckConfiguration.Axial,
            FlightModel.F9F2Panther,
            AircraftCapability.F9F2Panther);

    /// KOREA 1951, THE WHOLE SORTIE — catshot, climb, cruise, descend and trap.
    ///
    /// <see cref="KoreaCarrierApproach"/> starts the aeroplane 1500 m astern, already on speed and
    /// already on the slope. That is a useful drill and it is not a sortie: it hands the pilot the
    /// one part of the day that was already set up for them, and it is why the Panther has been
    /// tested but unflyable — no BuiltIn index, no menu tile, nothing to launch from.
    ///
    /// This beat starts where a VF-51 pilot actually started: spotted on Essex's hydraulic
    /// catapult, brakes on, engine already at full power because a centrifugal J42 will not make
    /// it in the stroke otherwise. Then off the bow, up, out, back, and down onto the same axial
    /// deck with no bolter and no second chance.
    ///
    /// The catapult machinery is not new — <c>CatapultLaunchModel</c> has existed and been wired
    /// to <c>StartsOnCatapult</c> the whole time. It had simply never been pointed at a ship.
    public static BeatSetup KoreaSortie() {
        BeatSetup approach = CarrierApproach(
            GunsOnly.Sim.Carrier.DeckConfiguration.Axial,
            FlightModel.F9F2Panther,
            AircraftCapability.F9F2Panther);
        GunsOnly.Sim.Carrier deck = approach.Carrier!;
        return approach with {
            Name = "Korea sortie",
            // Carrier qualification is ownship-only. Do not inherit CarrierApproach's inert
            // compatibility actor into a finite catapult-to-trap sortie.
            OpponentPresence = OpponentPresence.None,
            // The session replaces Player with the parked catapult pose when this is set, so the
            // approach state above is only a mass and a mission carrier at this point.
            StartsOnCatapult = true,
            // Essex's H-4 hydraulic catapults were short and the Panther was heavy for them. The
            // deck default stroke stands; the end speed is the number that matters, and 62 m/s
            // (~120 kt) is comfortably above this airframe's take-off-configuration stall while
            // being the sort of figure a 1950s hydraulic cat actually produced.
            CatapultEndSpeedMps = 62.0,
            // A flat wooden deck. No ski jump anywhere near the Korean War.
            CatapultRampAngleRad = 0.0,
            // A trap ends the day rather than firing the catapult again: this is a sortie, not a
            // circuit drill, and the pilot should be told they got aboard.
            RecoveryCompletesSortie = true,
            Mission = KoreaMission("mission.korea.panther-sortie.v1"),
            // Do not inherit CarrierApproach's shared coastal fixture: that atlas anchor is land
            // above the Essex deck. The whole sortie owns a surveyed open-water cell while the
            // reusable approach drill remains exactly where its other callers expect it.
            Environment = Ukraine2030sTheatre.KoreaCarrierCell,
            // Home is the ship. It moves, which is the entire difficulty, but the recovery plan
            // needs a datum and the deck centre at staging is the honest one.
            RecoveryPlan = new RecoveryPlan(
                "recovery.korea.uss-essex.v1",
                "USS Essex",
                deck.Position,
                requiredLandingReserveLb: 400.0),
        };
    }

    /// <summary>
    /// Reduced-order F-35C conversion sortie used by the player-facing Raptor programme. Public
    /// geometry, mass, fuel and thrust anchors identify the aircraft; the carrier model and generic
    /// recovery configuration are deliberately not represented as an OEM F-35 systems simulation.
    /// The historical F-86 carrier fixture remains available through <see cref="CarrierApproach"/>.
    /// </summary>
    public static BeatSetup F35CCarrierApproach(
        GunsOnly.Sim.Carrier.DeckConfiguration configuration =
            GunsOnly.Sim.Carrier.DeckConfiguration.Angled) {
        var carrier = new GunsOnly.Sim.Carrier(
            deckCentre: new Vec3D(0, 20, 0), headingRad: 0, speedMps: 3,
            deckAltM: 20, deckLengthM: 250, deckWidthM: 30,
            configuration: configuration);
        var start = carrier.LandingPoint(along: -1700, height: 100);
        return new BeatSetup("F-35C carrier conversion",
            Player: new AircraftState(start, 70, -0.06, carrier.LandingHeadingRad, 0,
                FlightModel.F35CPublicDataCarrierSurrogate.MassKg),
            Bandit: new AircraftState(new Vec3D(0, 1500, 50000), 120, 0, 0, 0,
                FlightModel.Sabre.MassKg),
            Law: new ApproachLaw(),
            BanditTimeline: new() {
                (0.0, new PilotCommand(1.0, 0.0, 0.30, 0)),
            },
            PlayerParams: FlightModel.F35CPublicDataCarrierSurrogate,
            BanditParams: FlightModel.Sabre,
            Carrier: carrier,
            UsesReactiveBandit: false,
            Combat: CombatConfig.CarrierRecoveryOnly,
            Fuel: new FuelConfig(
                CapacityLb: 19750.0,
                InitialFuelLb: 9000.0,
                BingoThresholdLb: 3000.0,
                ConsumesFuel: true),
            InitialThrottle: 0.82,
            Mission: new MissionContract(
                "mission.modern.f35c.carrier-conversion.public-data-surrogate.v1",
                MissionContentFamily.ModernPublicDataSurrogate,
                PublicDataSurrogate: true,
                RulesOfEngagement: "RECOVERY_ONLY",
                Era: "MODERN_PUBLIC_DATA_EXERCISE"),
            PlayerCapability: AircraftCapability.F35CCarrierSurrogate,
            PlayerPhysiologyProfile: PilotPhysiologyProfile.ModernFastJetReference,
            RecoveryCompletesSortie: true,
            Environment: Ukraine2030sTheatre.CoastalCell);
    }

    /// <summary>
    /// RAPIER INTERCEPT — the complete 2030s sortie: catapult launch from deep rear basing,
    /// climb on the turbine core, accelerate into ram cruise very high and very fast, dive on the
    /// contact, and recover on the hook.
    ///
    /// Every phase exists because the aircraft forces it. Basing is far behind the front because
    /// forward airfields get cratered, which is only survivable if the aircraft is fast enough to
    /// still arrive; the climb is long because the turbine is small; the fight is brief because
    /// instantaneous G comes from structure and sustained G comes from thrust, and this aircraft has
    /// far more of the former. It can point at anything once.
    ///
    /// The launcher is declared explicitly: a 1950s deck catapult ends at 62 m/s, which is below
    /// flying speed at 436 kg/m2 — an aircraft launched on the default would sink off the bow.
    /// </summary>
    public static BeatSetup RapierIntercept(
        GunsOnly.Sim.Carrier.DeckConfiguration configuration =
            GunsOnly.Sim.Carrier.DeckConfiguration.Angled) {
        // A fixed land installation reuses the catapult/arrestment geometry but explicitly opts out
        // of ship wind, burble, heave, hull and island. The slab datum comes from the exact 32 m
        // visual-atlas records now embedded as kernel truth: 192.0 m leaves at least 1.0875 m over
        // the highest surveyed natural sample under the shoulder/gallery/ramp earthworks. Natural
        // DEM remains untouched outside those bounded constructed surfaces.
        // Eastern home plate: strip faces west (−π/2) so climb-out runs into the theatre.
        var carrier = new GunsOnly.Sim.Carrier(
            deckCentre: new Vec3D(0, RapierLaunchSite.OperatingSurfaceElevationM, 0),
            headingRad: -Math.PI / 2, speedMps: 0,
            deckAltM: RapierLaunchSite.OperatingSurfaceElevationM,
            // 10,000 ft x 48 m. This was 1,200 m, inherited wholesale from the ship deck whose
            // geometry it reuses -- nobody ever sized it as a runway. A dispersed strip for a
            // Mach 4 interceptor is a runway, and the recovery it is built around (touch down,
            // aerobrake on the delta, take the wire at midfield) needs braking distance in front
            // of the wire. At 1,200 m there was none: the wires sat at the touchdown point, so the
            // arrest had to be won at approach speed, which this aircraft cannot fly.
            deckLengthM: 3_048, deckWidthM: 48,
            configuration: GunsOnly.Sim.Carrier.DeckConfiguration.Axial,
            kind: GunsOnly.Sim.Carrier.PlatformKind.FixedArrestingStrip,
            aircraftSupportReferenceHeightM:
                RapierLaunchSite.AircraftSupportReferenceHeightM,
            launchRailHeadHeightM: RapierLaunchSite.LaunchRailHeadHeightM);
        return new BeatSetup(
            Name: "Rapier intercept",
            Player: new AircraftState(
                new Vec3D(0, RapierLaunchSite.OperatingSurfaceElevationM, 0),
                0.0, 0, -Math.PI / 2, 0,
                FlightModel.RapierPublicDataSurrogate.MassKg),
            // A contact high and slow west of home: the thing this aircraft was built to kill is an
            // enabler, not a fighter. Eastbound closing toward the eastern strip.
            // 360 km out, and this number has moved a lot: 680, then 320, then in to 170 when the
            // wait dominated the sortie, then back out once the real cause was found. The aircraft
            // was not bored, it was BROKEN -- launching on 36% fuel, climbing on a schedule that
            // rode Vmo, and carrying an inlet whose ram never lit below FL350. Fixed, it covers
            // this distance fast and the transit is the interesting part rather than the wait.
            //
            // 360 km is essentially the most the authored terrain allows: the regional atlas ends
            // at -376,832 m east, and a contact at 380 km cannot be sampled at all. If this card
            // ever needs to be longer, the atlas has to grow first.
            //
            // It leaves enough
            // gas for the fight and trap under the current per-stream fuel approximation.
            //
            // Keeping the contact inside the authored regional cell also means an early low fight
            // no longer drops onto the presentation apron.
            Bandit: new AircraftState(new Vec3D(-360_000, 18_000, 18_000), 210, 0, Math.PI / 2, 0,
                FlightModel.Su27SPublicDataSurrogate.MassKg),
            Law: new PurePursuitLaw(),
            BanditTimeline: new() { (0.0, new PilotCommand(1.0, 0.0, 0.55, 0.0)) },
            PlayerParams: FlightModel.RapierPublicDataSurrogate,
            BanditParams: FlightModel.Su27SPublicDataSurrogate,
            Carrier: carrier,
            // REACTIVE. The 2.8 seconds per browser frame this used to cost was real when it was
            // measured, and it is no longer true: incremental AI planning and the adaptive compute
            // governor landed since. Measured on the real beat, 7,200 ticks each, both running to
            // completion:
            //
            //     RailBandit      0.296 ms/tick   3.6% of a 120 Hz budget
            //     ReactiveBandit  0.165 ms/tick   2.0%
            //
            // Reactive is CHEAPER than the rails it was disabled in favour of. A rail controller
            // flies an authored timeline and does not respond to the player at all, which is
            // exactly what "the AI isn't aggressive, it's all just dots fleeing from me" describes:
            // they were never fleeing, they were never fighting.
            UsesReactiveBandit: true,
            Combat: CombatConfig.ModernVisualMerge,
            Fuel: new FuelConfig(
                CapacityLb: 9_920.0,          // 4,500 kg of fuel
                // FULL INTERNAL. This was 3,100 lb, then 3,600 lb, and each raise was treated as a
                // tuning knob when it was actually a symptom: 3,600 lb is 36% of the tank, and the
                // aircraft flamed out at 2,520 s and arrived at the field dead-stick. Every wire
                // miss downstream of that was the empty tank, not the landing law.
                //
                // The reason to fill it is stronger than "it ran out", though. Fuel drives mass --
                // SimulationSession sets Mass = FuelFreeMassKg + fuel -- and 9,920 lb is 4,500 kg,
                // so a full tank is 6,590 + 4,500 = 11,090 kg, which is EXACTLY the design gross
                // weight. Every published number for this aircraft is computed there: identity
                // gross, dry T/W 0.46, augmented T/W 0.71, the family cap, the V-n corner that
                // sets Vmo. At 3,600 lb it launched at 8,223 kg and flew 26% below all of it, so
                // the flight-test gates were checking a weight the mission never used, and the
                // aeroplane felt more overpowered than its own design point because it was.
                //
                // No launch mass limit exists -- not in the kernel, not in the launch-gallery
                // basis, not in the gear and arrest chapter. There was never a reason for a
                // partial load; the fuel clock is supposed to bite during the fight, not before
                // the aeroplane can get home however it is flown.
                InitialFuelLb: 9_920.0,
                // Every one of these used to be an authored number in a plausible order, traceable
                // to nothing. They are now the fuel plan: see FuelPlan, where FFR is 30 minutes at
                // a measured max-endurance flow and everything else is built on top of it.
                //
                // Bingo and joker are floors here, not the live calls -- the real ones depend on
                // how far out the aircraft is and what it is actually burning, so they are
                // computed in flight against FuelPlan.BingoLb / JokerLb.
                BingoThresholdLb: 1_400.0,
                ConsumesFuel: true,
                JokerThresholdLb: 2_000.0,
                MinimumFuelThresholdLb: FuelPlan.MinimumFuelReserveLb,   // MFR: approach + FFR
                EmergencyFuelThresholdLb: FuelPlan.FixedFuelReserveLb),  // into FFR
            // FULL AUGMENTED POWER on the stroke. 1.0 is the dry lever stop, and an 8.22 t aircraft
            // leaving a ramp on dry thrust decays below stall while it is still climbing away —
            // nobody launches a heavy jet at military power.
            InitialThrottle: 1.55,
            StartsOnCatapult: true,
            // The deck default of 62 m/s over 75 m cannot fly this wing. A LAND installation is
            // not constrained by a deck: every Rapier card uses the same 520 m electromagnetic
            // track and 120 m/s flying handoff, with 1.41 g along-rail acceleration. The
            // superseded 150 m/s study drove a very different rail and is not simulated here.
            CatapultStrokeM: 520.0,
            // Gear/flap qualification is the live near-ground 233 KTAS handoff, not the
            // superseded 150 m/s study's 291 KTAS case.
            CatapultEndSpeedMps: 120.0,
            // A real ski jump, and the earlier seven degrees was an excuse rather than a design.
            // The steppe is flat, so the ramp is built either way; once you are building it, the
            // angle should be chosen by what the aircraft and the pilot can take, not by what
            // terrain might have offered.
            //
            // At the live 120 m/s and 3 g rail-normal design load the pilot sees
            // sqrt(1.41^2 + 3^2) = 3.32 g combined, reclined, inside the 6.5 g airframe limit.
            CatapultRampAngleRad: 12.0 * Math.PI / 180.0,
            // The launch lane is 70 m off the recovery centreline. A carrier shares one deck
            // because it has no choice; a dispersed land site has room and must use it. The launch
            // gallery is an 8 m roofed structure under a 10 m berm, so at the deck default of -7 m
            // it sat squarely in the touchdown zone of a 48 m strip — an aircraft on short final
            // would fly into it. 70 m clears the strip edge by nearly 40 m.
            CatapultCrossOffsetM: -70.0,
            // Gear and flaps are qualified past the live near-ground 233 KTAS handoff.
            SystemsProfile: AirframeSystemsProfile.RapierSurrogate,
            Mission: new MissionContract(
                "mission.modern.rapier-intercept.public-data-surrogate.v1",
                MissionContentFamily.ModernPublicDataSurrogate,
                PublicDataSurrogate: true,
                RulesOfEngagement: "GUNS_ONLY_FIRST_PASS_SAFE",
                Era: "MODERN_PUBLIC_DATA_EXERCISE",
                AllowsTimeCompression: true),
            PlayerCapability: AircraftCapability.RapierSurrogate,
            BanditCapability: AircraftCapability.Su27SSurrogate,
            PlayerPhysiologyProfile: PilotPhysiologyProfile.RapierReclinedInterceptor,
            RecoveryCompletesSortie: true,
            Environment: Ukraine2030sTheatre.RapierCorridor,
            ScriptedIntercept: new ScriptedInterceptConfig(),
            // The existing arrested strip is also the mission-authored navigation home. Six
            // hundred pounds is this loadout's declared minimum-fuel threshold; the projection
            // protects it explicitly instead of presenting every pound on board as expendable.
            RecoveryPlan: new RecoveryPlan(
                "recovery.rapier.eastern-dispersed-strip.v1",
                "Eastern dispersed strip",
                carrier.Position,
                requiredLandingReserveLb: 600.0));
    }

    /// <summary>
    /// RAPIER BALLOON INTERCEPT — the production statement of what the aircraft is for.
    /// Launch from the dispersed strip, build Mach four in thin air, trade that energy for one
    /// brief gun window against a stratospheric balloon, relight in the dip, and bring the same
    /// aircraft back to the midpoint arrestor. There is no dealt job, escort formation, drone,
    /// pursuer, economic layer, or injected failure on this card: the airframe physics are the
    /// adversary and the player's own M61 trigger is the attack.
    /// </summary>
    public static BeatSetup RapierBalloonIntercept(
        GunsOnly.Sim.Carrier.DeckConfiguration configuration =
            GunsOnly.Sim.Carrier.DeckConfiguration.Angled) {
        BeatSetup sortie = RapierIntercept(configuration);
        // Published float point for the NASA 18.8-million-ft3 super-pressure balloon: 33.5 km,
        // just under 110,000 ft and inside the authored high-altitude target band.
        const double BalloonAltitudeM = 33_500.0;
        double canonicalFuelCapacityLb = RapierV2Design.FuelCapacityKg * 2.20462262;
        AircraftState balloon = new(
            // The target sits on the long diagonal of the authored atlas rather than at the end
            // of its short west edge. That leaves enough distance after the aircraft has actually
            // crossed the 24 km / M4.2 gate for a finite stored-energy pull, deliberate idle/unstart,
            // and a drag-predicted zero-lift coast instead of invented pitch or thrust authority.
            // The balloon is 4.8 km inside the west edge and 10.6 km inside the north edge; the
            // flown intercept remains farther inboard because its finite gun pass crosses below
            // and southeast of the drifting envelope before the recovery turn.
            // Eight metres per second is weather drift beside that closure, while the FlightModel
            // actor's real buoyancy and drag — not a hidden rail — govern its vertical motion.
            new Vec3D(-372_000.0, BalloonAltitudeM, 186_000.0),
            Speed: 8.0,
            Gamma: 0.0,
            Chi: Math.PI / 2.0,
            Bank: 0.0,
            Mass: FlightModel.HighAltitudeBalloonPublicDataSurrogate.MassKg);
        return sortie with {
            Name = "Rapier — high-altitude balloon intercept",
            Bandit = balloon,
            BanditParams = FlightModel.HighAltitudeBalloonPublicDataSurrogate,
            BanditCapability = AircraftCapability.HighAltitudeWeatherBalloonTarget,
            BanditTimeline = new() {
                (0.0, new PilotCommand(
                    GDemand: 0.0, BankTarget: 0.0, Throttle: 0.0, Rudder: 0.0))
            },
            UsesReactiveBandit = false,
            Combat = CombatConfig.RapierBalloonIntercept,
            // V2 has one full-power lever stop. The inherited 1.55 augmentor detent belongs to
            // the legacy engineering card and is clamped by the v2 engine anyway.
            InitialThrottle = sortie.PlayerAir.MaxThrustFraction,
            // This buried 520 m land launcher gives the heavy, sharp-winged article a credible
            // flying handoff without pretending the rail can replace the propulsion system. At
            // 120 m/s it delivers about 85 MJ at canonical gross mass, 1.41 g longitudinally;
            // combined with the declared 3 g ramp arc the resultant remains a comfortable 3.32 g.
            CatapultEndSpeedMps = 120.0,
            // Production uses the canonical v2 mass closure. RapierIntercept retains its legacy
            // engineering-card load so this focused mission does not rewrite unrelated OFT data.
            Fuel = sortie.FuelLoadout with {
                CapacityLb = canonicalFuelCapacityLb,
                InitialFuelLb = canonicalFuelCapacityLb
            },
            ScriptedIntercept = new ScriptedInterceptConfig(
                FormationSize: 1,
                ShortRangeMissiles: 0,
                DogfightingDrones: 0,
                PursuerCount: 0,
                AutomationDefaultEnabled: false,
                RecoveryRequired: true,
                ZoomLobProfile: true,
                DeterministicSwarmWipe: false,
                Job: RapierJobKind.Balloon,
                ComputerFailureAtZoomCoast: RapierComputerFailure.None),
            Mission = new MissionContract(
                "mission.modern.rapier-balloon-intercept.public-data-surrogate.v1",
                MissionContentFamily.ModernPublicDataSurrogate,
                PublicDataSurrogate: true,
                RulesOfEngagement: "GUNS_ONLY_ONE_APEX_PASS",
                Era: "MODERN_PUBLIC_DATA_EXERCISE",
                EconomicMode: MissionEconomicMode.Arcade,
                AllowsTimeCompression: true),
            // Golden-path navigation contains Home Plate only. Free fixes belong to the Go Fly
            // laboratory, not a lesson whose gates and return geometry are authored.
            OpenSegmentNav = false
        };
    }

    /// <summary>
    /// RAPIER CIRCUITS — the same aircraft, the same launcher, the same strip, and nothing else.
    ///
    /// The trap is the hardest thing this aircraft asks of a pilot and the intercept gives exactly
    /// one attempt at it, 320 km from home and low on fuel. That is the wrong place to learn.
    /// Circuits removes the transit, the contact and the fuel pressure so the launch, the ram
    /// handover, the pattern and the hook can be flown over and over.
    ///
    /// Deliberately NOT a stripped mission: it keeps the full launcher, the real thermal limit and
    /// the real arrestor. What it removes is the reasons to be somewhere else.
    /// </summary>
    public static BeatSetup RapierCircuits(
        GunsOnly.Sim.Carrier.DeckConfiguration configuration =
            GunsOnly.Sim.Carrier.DeckConfiguration.Angled) {
        BeatSetup sortie = RapierIntercept(configuration);
        return sortie with {
            Name = "Rapier circuits",
            // Content truth, not a parked actor convention: Circuits has no opponent.
            OpponentPresence = OpponentPresence.None,
            UsesReactiveBandit = false,
            ScriptedIntercept = new ScriptedInterceptConfig(
                FormationSize: 0,
                ShortRangeMissiles: 0,
                DogfightingDrones: 0,
                PursuerCount: 0,
                PatternOnly: true,
                // The current automated card accepts the arrestor on its first approach. A future
                // planned touch-and-go card must change both this intent and the flown profile.
                LandingIntent: CircuitLandingIntent.FullStop,
                AutomationDefaultEnabled: true,
                RecoveryRequired: true),
            Combat = CombatConfig.CarrierRecoveryOnly,
            // Full tanks and no bingo pressure: the point is repetition, not endurance. A circuit
            // costs a few hundred pounds, so this is roughly a dozen patterns before fuel matters.
            Fuel = sortie.FuelLoadout with {
                InitialFuelLb = 9_920.0,
                BingoThresholdLb = 800.0,
                JokerThresholdLb = 1_400.0
            },
            // A bolter or a go-around must NOT end the session — that is the whole exercise.
            RecoveryCompletesSortie = false,
            OpenSegmentNav = true,
            Mission = new MissionContract(
                "mission.modern.rapier-circuits.public-data-surrogate.v1",
                MissionContentFamily.ModernPublicDataSurrogate,
                PublicDataSurrogate: true,
                RulesOfEngagement: "NO_ENGAGEMENT_PATTERN_ONLY",
                Era: "MODERN_PUBLIC_DATA_EXERCISE")
        };
    }

    /// <summary>
    /// GO FLY THE RAPIER — one entry beat that deals a random long-range job on the zoom-lob
    /// profile (balloon, AWACS, transport, or swarm lob). Player is not the Russian side:
    /// AWACS kills draw F-22-class pursuers on egress.
    /// </summary>
    public static BeatSetup RapierGoFly(
        int jobSeed = 0,
        GunsOnly.Sim.Carrier.DeckConfiguration configuration =
            GunsOnly.Sim.Carrier.DeckConfiguration.Angled) {
        (RapierJobKind job, RapierComputerFailure computerFailure) =
            DealRapierSortie(jobSeed);
        BeatSetup sortie = RapierIntercept(configuration);
        AircraftState authoredContact = sortie.Bandit;
        AircraftState contact = job switch {
            RapierJobKind.Balloon => new AircraftState(
                // The dealt jobs stay in the same practical transit class as the 320 km fixed
                // engineering card. Target variety must not restore the old 680 km wait.
                new Vec3D(12_000, 18_500, 300_000), 40.0, 0.0, Math.PI, 0.0,
                FlightModel.GliderStrike.MassKg),
            RapierJobKind.Awacs => new AircraftState(
                new Vec3D(8_000, 9_144, 300_000), 130.0, 0.0, Math.PI, 0.0,
                FlightModel.AwacsTarget.MassKg),
            RapierJobKind.Transport => new AircraftState(
                // Low and slow after the lob — the dive is the job.
                new Vec3D(4_000, 2_200, 260_000), 145.0, 0.0, Math.PI, 0.0,
                FlightModel.TransportTargetPrototype.MassKg),
            RapierJobKind.SwarmLob => new AircraftState(
                // High formation: apex release window, then leave.
                new Vec3D(10_000, 18_500, 320_000), 200.0, 0.0, Math.PI, 0.0,
                FlightModel.Su27SPublicDataSurrogate.MassKg),
            _ => authoredContact
        };
        AircraftParams banditParams = job switch {
            RapierJobKind.Balloon => FlightModel.GliderStrike,
            RapierJobKind.Awacs => FlightModel.AwacsTarget,
            RapierJobKind.Transport => FlightModel.TransportTargetPrototype,
            _ => FlightModel.Su27SPublicDataSurrogate
        };
        AircraftCapability banditCapability = job switch {
            RapierJobKind.Balloon => AircraftCapability.BalloonGliderPrototype,
            RapierJobKind.Awacs => AircraftCapability.AwacsTargetPrototype,
            RapierJobKind.Transport => AircraftCapability.TransportTargetPrototype,
            _ => AircraftCapability.Su27SSurrogate
        };
        // AWACS / enabler kill: F-22-class pursuers home — Escape path already models them.
        int pursuers = job is RapierJobKind.Awacs or RapierJobKind.Balloon ? 2 : 1;
        string computerVariant = computerFailure switch {
            RapierComputerFailure.MissionComputer => "MISSION COMPUTER FAILURE",
            RapierComputerFailure.FlightControlComputers => "FLIGHT CONTROL FAILURE",
            _ => "SYSTEMS NOMINAL"
        };
        return sortie with {
            Name = $"Rapier intercept — {job} · {computerVariant}",
            Bandit = contact,
            BanditParams = banditParams,
            BanditCapability = banditCapability,
            ScriptedIntercept = new ScriptedInterceptConfig(
                FormationSize: job == RapierJobKind.FormationIntercept ? 4 : 1,
                ShortRangeMissiles: 0,
                DogfightingDrones: job == RapierJobKind.SwarmLob ? 4 : 2,
                PursuerCount: pursuers,
                PursuerMach: 2.2,
                AutomationDefaultEnabled: true,
                RecoveryRequired: true,
                ZoomLobProfile: true,
                Job: job,
                ComputerFailureAtZoomCoast: computerFailure),
            Mission = new MissionContract(
                "mission.modern.rapier-economic-intercept.public-data-surrogate.v1",
                MissionContentFamily.ModernPublicDataSurrogate,
                PublicDataSurrogate: true,
                RulesOfEngagement: "GUNS_ONLY_FIRST_PASS_SAFE",
                Era: "MODERN_PUBLIC_DATA_EXERCISE",
                EconomicMode: MissionEconomicMode.RapierOperations,
                AllowsTimeCompression: true),
            OpenSegmentNav = true
        };
    }

    static (RapierJobKind Job, RapierComputerFailure ComputerFailure)
        DealRapierSortie(int seed) {
        // Stable deal: seed 0 rotates with wall-clock seconds so each session differs; explicit
        // seeds stay deterministic for tests and OFT cards. Four consecutive deals hold the job
        // cycle while the quotient deals NOMINAL / MISSION COMPUTER / FLIGHT CONTROLS, so tests can
        // vary the casualty without also changing the target. Widen to long before Abs so
        // int.MinValue remains a valid deterministic seed.
        long pick = seed != 0
            ? Math.Abs((long)seed)
            : DateTime.UtcNow.Ticks / TimeSpan.TicksPerSecond;
        RapierJobKind job = (RapierJobKind)(1 + (pick % 4));
        RapierComputerFailure failure = (RapierComputerFailure)((pick / 4) % 3);
        return (job, failure);
    }

    /// <summary>
    /// MAINTENANCE TEST FLIGHT — airborne utility-hydraulic loss followed by an evidence-driven
    /// emergency-gear procedure and carrier recovery. The fault identity remains scenario-private;
    /// the pilot receives only pressure, handle, and independent leg indications.
    /// </summary>
    public static BeatSetup EmergencyGearRecovery(
        GunsOnly.Sim.Carrier.DeckConfiguration configuration =
            GunsOnly.Sim.Carrier.DeckConfiguration.Axial) {
        var carrier = new GunsOnly.Sim.Carrier(
            deckCentre: new Vec3D(0, 20, 0), headingRad: 0, speedMps: 3,
            deckAltM: 20, deckLengthM: 250, deckWidthM: 30,
            configuration: configuration);
        // Start on a level, low-energy test-card leg well outside the three-kilometre groove. At
        // 9 km the pilot can observe the full normal-extension interval, emergency-extend, and
        // configure before intercepting the ordinary approach gate near 3 km. This is deliberate
        // maneuvering room, not a speed waiver: every IAS limit and the real aircraft physics stay
        // live throughout the sortie.
        var start = carrier.LandingPoint(along: -9000, height: 220);
        return new BeatSetup("Degraded recovery — utility hydraulics",
            Player: new AircraftState(start, 75, 0.0, carrier.LandingHeadingRad, 0,
                FlightModel.Sabre.MassKg),
            Bandit: new AircraftState(new Vec3D(8000, 1500, 9000), 120, 0, 0, 0,
                FlightModel.Sabre.MassKg),
            Law: new ApproachLaw(),
            BanditTimeline: new() {
                (0.0, new PilotCommand(1.0, 0.0, 0.30, 0)),
            },
            Carrier: carrier,
            Combat: CombatConfig.CarrierQualification,
            MaintenanceScenario: MaintenanceScenarioKind.F86EmergencyGearRecovery,
            Mission: KoreaMission("mission.f86f.degraded-gear-recovery.v1"),
            Environment: Ukraine2030sTheatre.CoastalCell);
    }

    /// <summary>
    /// Straightforward guns-only dogfight between public-data airframe surrogates. The scenario
    /// begins at 18,000 ft in an offset reciprocal visual merge after both packages have reached
    /// the merge without a BVR result. Guns are safe through the first pass; there is no radar,
    /// stealth, missile, RWR, datalink, exact modern-FLCS, or classified simulation hiding behind
    /// the labels. The bounded pitch-thrust-vector and gunnery-assist surrogates are explicit in the
    /// public-data airframe definition rather than implied by the mission label.
    /// </summary>
    public static BeatSetup ModernVisualMerge() {
        // 10,000 ft staging (pilot report: "the AI keeps flying super high"): the per-fight
        // ceiling tracks the merge altitude (spawn + 1,000 m), so staging in the terrain block
        // caps the whole gauntlet near 13,000 ft — the fight lives where the valleys are.
        const double AltitudeM = 3048.0; // 10,000 ft
        // Stable corner airspeed at staging (pilot spec): the fight opens at the speed the jet
        // wants to fight at — and the assisted-flight corner hold starts already on target
        // instead of chasing it through the merge.
        double playerCornerTasMps = AirData.TrueAirspeedForCalibratedAirspeedMps(
            AirData.PositiveCornerSpeedKiasAtAltitude(
                FlightModel.F22APublicDataSurrogate.MassKg,
                FlightModel.F22APublicDataSurrogate, AltitudeM) / AirData.MpsToKnots,
            AltitudeM);
        return new BeatSetup("Visual merge — F-22A surrogate vs Su-27S surrogate",
            // 9 km opening split, ~17 s of run-in (pilot spec: "the first fight needs to start a
            // bit further away"). This deliberately reverses the earlier "closer staging" note —
            // that call was made before there was weather worth flying through. The staging box
            // sits at x ~= 1.4 km because that is where the seeded ModernHigh deck puts a cloud
            // bank across the first half of the run-in while leaving BOTH the start point and the
            // merge itself visual: you launch clear, fly through cloud, break out, and there he
            // is. Verified in ModernVisualMergeTests; the seed, deck and this origin are one
            // tuned set — moving any of them alone breaks the shape.
            //
            // ONLY the opening is long. Continuous replacements still merge at ~2.2 km
            // (ReactiveBandit.SpawnForMerge), so the sortie does not pay transit per kill.
            Player: new AircraftState(
                new Vec3D(1280.0, AltitudeM, -4500.0),
                playerCornerTasMps, 0.0, 0.0, 0.0,
                FlightModel.F22APublicDataSurrogate.MassKg),
            // The bandit gets the SAME courtesy as the player: staged at the speed its own jet
            // fights best at. It used to arrive at 285 m/s — 37.6% above the Flanker's 207 m/s
            // corner, 137 knots fast — so it could not pull its peak turn rate on the opening
            // merge. At its own corner the Su-27S actually out-turns the F-22A instantaneously
            // (24.3 vs 23.4 deg/s: higher CLmax, lower mass); staged fast it manages 17.6 deg/s
            // and hands the player 2.5 seconds over 180 degrees of turn. That gift, not the
            // airframe and not the AI, is why the first turn was decided before it began.
            Bandit: new AircraftState(
                new Vec3D(1520.0, AltitudeM + 60.0, 4500.0),
                BeatSetup.CornerTrueAirspeedMps(FlightModel.Su27SPublicDataSurrogate, AltitudeM),
                0.0, Math.PI, 0.0,
                FlightModel.Su27SPublicDataSurrogate.MassKg),
            Law: new PurePursuitLaw(),
            BanditTimeline: new() {
                (0.0, new PilotCommand(1.0, 0.0, 1.0, 0.0)),
            },
            PlayerParams: FlightModel.F22APublicDataSurrogate,
            BanditParams: FlightModel.Su27SPublicDataSurrogate,
            UsesNeutralMergeBandit: true,
            Combat: CombatConfig.ModernVisualMerge,
            Fuel: new FuelConfig(
                CapacityLb: 18000.0,
                // The fight begins after launch and ingress, not at chocks with topped tanks.
                InitialFuelLb: 12000.0,
                BingoThresholdLb: 4000.0,
                ConsumesFuel: true,
                // Exercise-planning value, not an aircraft limitation. AFMAN 11-2F-22A defines
                // Joker as pre-briefed; MIN/EMER are the published F-22 thresholds.
                JokerThresholdLb: 6000.0,
                MinimumFuelThresholdLb: 2100.0,
                EmergencyFuelThresholdLb: 1200.0),
            InitialThrottle: 1.0,
            StageAtTrimThrottle: true,
            // Landing-gear-only, public-data/provisional recovery seam. An explicit profile keeps
            // this modern jet from silently inheriting the F-86 hydraulic/flap research model.
            SystemsProfile: AirframeSystemsProfile.ModernConventionalGearSurrogate,
            Mission: new MissionContract(
                "mission.modern.visual-merge.f22a-vs-su27s.public-data-surrogate.v1",
                MissionContentFamily.ModernPublicDataSurrogate,
                PublicDataSurrogate: true,
                RulesOfEngagement: "GUNS_ONLY_GUNS_FREE",
                Era: "MODERN_PUBLIC_DATA_EXERCISE"),
            PlayerCapability: AircraftCapability.F22AConventionalRecoverySurrogate,
            BanditCapability: AircraftCapability.Su27SSurrogate,
            // The 2v1 front door opens guns free: the first-pass safety made sense for one
            // choreographed merge, but against a pair the opening pass is already a fight.
            VisualMergeEvaluation: new VisualMergeEvaluationConfig(HoldFireThroughFirstPass: false),
            PlayerPhysiologyProfile: PilotPhysiologyProfile.ModernFastJetReference,
            ContinuousCombat: new ContinuousCombatConfig(),
            // Fictional runway inside the shared theatre, roughly 44 NM southwest of the merge.
            // The old (-55 km, -55 km) strip crossed a 37 m atlas rise and was visibly buried once
            // simulation terrain and presentation began sharing one authority. The eastbound site
            // below was surveyed from the same 256 m atlas records: natural terrain under the full
            // 3,000 x 45 m pavement spans 104.896..106.511 m. A 106.75 m constructed slab therefore
            // stays above the DEM with 0.24..1.85 m of bounded fill rather than flattening the
            // surrounding terrain. The 3,000 lb
            // exercise reserve sits 900 lb above declared MIN FUEL and
            // 1,800 lb above EMERGENCY FUEL; it is deliberately below 4,000 lb Bingo, which remains
            // the action threshold for turning home rather than the desired fuel at touchdown.
            RecoveryPlan: new RecoveryPlan(
                "recovery.f22a.soniachne-west-runway.v1",
                "Soniachne west recovery runway",
                new Vec3D(-61_652.0, 106.75, -56_576.0),
                requiredLandingReserveLb: 3_000.0,
                // Threshold centre is 300 m west of the touchdown aim. Heading +pi/2 is +east in
                // the simulation frame, so the full 3,000 m rollout stays inside the regional
                // theatre. These dimensions match a substantial fast-jet runway without claiming
                // a real site or an exact F-22 landing-performance requirement.
                conventionalRunway: new ConventionalRunwayGeometry(
                    thresholdPosition: new Vec3D(-61_952.0, 106.75, -56_576.0),
                    landingHeadingRad: Math.PI / 2.0,
                    lengthM: 3_000.0,
                    widthM: 45.0)),
            // The opening neutral-merge dogfight is engagement 1: a gentle Novice warm-up under the
            // interim ForEngagement ramp (1 Novice, 2 Competent, 3 Veteran, 4+ Ace). Continuous
            // successors escalate via ForEngagement at CreateNextBandit.
            BanditSkill: BanditSkillProfile.ForEngagement(1));
    }

    /// <summary>
    /// CLIMACTIC GUNS-ONLY DUEL — the Raptor programme's final exam. Identical honest F-22A-vs-Su-27S
    /// public-data neutral merge as <see cref="ModernVisualMerge"/> (same ballistics, G-physiology,
    /// first-pass-safe ROE and airframe surrogates), but a SINGLE lone bandit flown at the Ace tier:
    /// lookahead BFM that actually converts the merge and fights the vertical. There is no continuous
    /// replacement stream — one decisive fight against the best pilot the ladder can field. Winning it
    /// is the programme capstone. No radar, missile, stealth, or classified-system simulation.
    /// </summary>
    public static BeatSetup ModernAceDuel() => ModernVisualMerge() with {
        Name = "Ace duel — F-22A surrogate vs Su-27S surrogate ace",
        // A lone climactic duel: drop the continuous-operations replacement stream so the sortie is
        // one merge against one opponent, and force the Ace tier rather than the escalation curve.
        ContinuousCombat = null,
        BanditSkill = PilotSkill.Ace,
        // The classical duel keeps the safe first pass the front door gave up.
        VisualMergeEvaluation = new VisualMergeEvaluationConfig(),
        Mission = new MissionContract(
            "mission.modern.ace-duel.f22a-vs-su27s.public-data-surrogate.v1",
            MissionContentFamily.ModernPublicDataSurrogate,
            PublicDataSurrogate: true,
            RulesOfEngagement: "GUNS_ONLY_FIRST_PASS_SAFE",
            Era: "MODERN_PUBLIC_DATA_EXERCISE"),
    };

    /// <summary>
    /// FICTIONAL UKRAINE TRAINING SECTOR — a public-data F-22 flight surrogate defends a fixed
    /// low-level inner ring against four explicitly fictional one-way attack-drone prototypes.
    /// The current kernel owns one opponent, so the raid is an honest staged stream rather than
    /// four visually concurrent targets with only one physically authoritative. Each target flies
    /// a straight inbound track over the synthetic Soniachne lowlands; the scored decision is
    /// cutoff geometry, first-valid-shot timing, and burst discipline.
    /// </summary>
    public static BeatSetup DroneRaidDefense() {
        const double DroneAltitudeM = 300.0;
        // The real 32 m atlas is 211.35 m beneath the staged player. Five metres restores the
        // authored >250 m terrain clearance that the old synthetic datum supplied.
        const double PlayerAltitudeM = 465.0;
        const double DroneSpeedMps = 115.0;
        const double DroneMassKg = 500.0;
        static AircraftState Inbound(double x, double z) => new(
            new Vec3D(x, DroneAltitudeM, z),
            DroneSpeedMps, 0.0, Math.Atan2(-x, -z), 0.0, DroneMassKg);

        AircraftState[] targets = {
            Inbound(0.0, 6_200.0),
            Inbound(2_800.0, 5_600.0),
            Inbound(-3_200.0, 5_900.0),
            Inbound(1_900.0, 6_800.0),
        };
        var raid = new DroneRaidScenarioDefinition(
            defendedPoint: new Vec3D(0.0, 0.0, 0.0),
            defendedRadiusM: 750.0,
            targets: targets);

        return new BeatSetup("Low-level drone intercept — fictional Ukraine training sector",
            Player: new AircraftState(
                new Vec3D(0.0, PlayerAltitudeM, -2_200.0),
                250.0, 0.0, 0.0, 0.0,
                FlightModel.F22APublicDataSurrogate.MassKg),
            Bandit: targets[0],
            Law: new PurePursuitLaw(),
            BanditTimeline: new() {
                (0.0, new PilotCommand(1.0, 0.0, 0.92, 0.0)),
            },
            PlayerParams: FlightModel.F22APublicDataSurrogate,
            BanditParams: FlightModel.OneWayAttackDronePrototype,
            Combat: CombatConfig.ModernDroneDefense,
            Fuel: new FuelConfig(
                CapacityLb: 18000.0,
                InitialFuelLb: 10500.0,
                BingoThresholdLb: 3500.0,
                ConsumesFuel: true,
                JokerThresholdLb: 5500.0,
                MinimumFuelThresholdLb: 2100.0,
                EmergencyFuelThresholdLb: 1200.0),
            InitialThrottle: 1.0,
            Mission: new MissionContract(
                "mission.ukraine-training.low-level-drone-intercept.prototype.v1",
                MissionContentFamily.UkraineTrainingPrototype,
                PublicDataSurrogate: true,
                RulesOfEngagement: "GUNS_ONLY_DEFENSIVE_INTERCEPT",
                Era: "UKRAINE_FICTIONAL_TRAINING_SECTOR"),
            PlayerCapability: AircraftCapability.F22ASurrogate,
            BanditCapability: AircraftCapability.OneWayAttackDronePrototype,
            DroneRaid: raid,
            PlayerPhysiologyProfile: PilotPhysiologyProfile.ModernFastJetReference,
            Environment: Ukraine2030sTheatre.HeroCell);
    }

    public static BeatSetup Saddle() => new("Saddle + shot",
        Player: S(0, Alt, -250, 0, 185),
        Bandit: S(0, Alt, 0, 0, 175),
        Law: new GunsSaddleLaw(),
        BanditTimeline: new() {
            (0.0, new PilotCommand(2.0, 0.55, 0.9, 0)),    // lazy weave
            (4.0, new PilotCommand(2.0, -0.55, 0.9, 0)),
            (8.0, new PilotCommand(2.0, 0.55, 0.9, 0)),
            (12.0, new PilotCommand(2.0, -0.55, 0.9, 0)),
            (16.0, new PilotCommand(2.0, 0.55, 0.9, 0)),
            (20.0, new PilotCommand(2.0, -0.55, 0.9, 0)),
        },
        Combat: CombatConfig.Fighter,
        Fuel: FuelConfig.FighterEngagement,
        InitialThrottle: 1.0,
        Mission: KoreaMission("mission.saddle-tracking.v1"));

    /// <summary>
    /// MEDEVAC — one unopposed low-level lift from an orchard pickup to a clinic receiver.
    /// The placeholder fixed-wing fields preserve the long-lived BeatSetup ABI; SimulationSession
    /// stages the dedicated vertical-lift provider and never constructs either placeholder actor.
    /// </summary>
    public static BeatSetup Medevac() {
        GunsOnly.Sim.Casevac.CasevacCourseDefinition course =
            GunsOnly.Sim.Casevac.BuiltInCasevacDefinitions.Prototype;
        GunsOnly.Sim.Casevac.CasevacHorizontalPoint start =
            course.World.StartPosition;
        GunsOnly.Sim.Casevac.CasevacHorizontalPoint pickup =
            course.World.Pickup.Centre;
        double headingRad = Math.Atan2(
            pickup.XM - start.XM,
            pickup.ZM - start.ZM);
        var placeholder = new AircraftState(
            new Vec3D(
                start.XM,
                course.World.StartSurfaceDatumM + course.World.StartAglM,
                start.ZM),
            Speed: 0.0,
            Gamma: 0.0,
            Chi: headingRad,
            Bank: 0.0,
            Mass: 5_850.0);
        return new BeatSetup(
            Name: "Medevac",
            Player: placeholder,
            Bandit: placeholder,
            Law: new PurePursuitLaw(),
            BanditTimeline: new() {
                (0.0, new PilotCommand(1.0, 0.0, 0.0, 0.0)),
            },
            Combat: CombatConfig.Casevac,
            Fuel: FuelConfig.EngineLess,
            InitialThrottle: 0.0,
            Mission: new MissionContract(
                course.Mission.Id,
                MissionContentFamily.Ukraine2030sTheatre,
                RulesOfEngagement: "NO_OPPONENT_CASEVAC",
                Era: "UKRAINE_2030S_THEATRE"),
            PlayerCapability: AircraftCapability.CasevacAirAmbulancePrototype,
            BanditCapability: AircraftCapability.OneWayAttackDronePrototype,
            PlayerPhysiologyProfile:
                PilotPhysiologyProfile.ModernFastJetReference,
            Environment: Ukraine2030sTheatre.HeroCell,
            OpponentPresence: OpponentPresence.None,
            Casevac: course.Mission);
    }

    /// <summary>
    /// Single built-in catalogue used by simulation staging and environment selection. Stable beat
    /// indices remain the public ABI; keeping the factory here prevents bridge/projection switches
    /// from independently forgetting a new mission's world contract.
    /// </summary>
    public static BeatSetup BuiltIn(int index,
        GunsOnly.Sim.Carrier.DeckConfiguration deckConfiguration =
            GunsOnly.Sim.Carrier.DeckConfiguration.Axial) => index switch {
        2 => BreakDefense(),
        3 => Saddle(),
        4 => BalloonStrike(),
        5 => F35CCarrierApproach(deckConfiguration),
        6 => EmergencyGearRecovery(deckConfiguration),
        7 => ModernVisualMerge(),
        8 => DroneRaidDefense(),
        9 => ModernAceDuel(),
        10 => RapierIntercept(deckConfiguration),
        11 => RapierCircuits(deckConfiguration),
        // The player-facing Rapier card is deterministic. RapierGoFly remains an explicit lab
        // factory for random jobs/economy/failures, but no catalogue entry silently deals it.
        12 => RapierBalloonIntercept(deckConfiguration),
        13 => Medevac(),
        // Korea 1951: the F9F-2 off USS Essex, whole sortie. Index 14 is the first player entry
        // point this aircraft has ever had — the Panther and the paddles/LSO machinery built for
        // it were reachable only from a unit test until now.
        14 => KoreaSortie(),
        _ => Perch()
    };
}
