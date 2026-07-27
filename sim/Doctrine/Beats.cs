using System.Collections.Generic;
namespace GunsOnly.Sim.Doctrine;

/// <summary>
/// The deliberately small combat/loadout seam for the current one-player/one-opponent sortie.
/// A positive PlayerAmmo value enables the player's infinite-ammunition, thermally limited gun;
/// OpponentAmmo remains a finite magazine. SimulationSession remains the authority for weapon
/// instances, projectiles, damage, and outcomes.
/// </summary>
public sealed record CombatConfig(
    int PlayerAmmo = GunKill.DefaultAmmo,
    int OpponentAmmo = GunKill.DefaultAmmo,
    int PlayerHitsToDefeat = 4,
    int OpponentHitsToDefeat = GunKill.DefaultHitsToKill,
    GunProfile? PlayerGun = null,
    GunProfile? OpponentGun = null) {
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
    public static AircraftCapability F86F30Bandit { get; } = F86F30 with {
        Id = "aircraft.f86f30.bandit.v1",
        PresentationId = "presentation.vehicle.bandit.v1"
    };
    public static AircraftCapability BalloonGliderPrototype { get; } = new(
        "aircraft.balloon-glider.prototype.v1", "Balloon glider prototype",
        "presentation.vehicle.glider-strike.v1", "systems.none.engine-less.v1", false);
    public static AircraftCapability AwacsTargetPrototype { get; } = new(
        "aircraft.awacs-target.prototype.v1", "AEW&C target prototype",
        "presentation.vehicle.awacs-target.v1", "systems.target-only.prototype.v1", false);
    public static AircraftCapability F22ASurrogate { get; } = new(
        "aircraft.f22a.public-data-surrogate.v1", "F-22A public-data surrogate",
        "presentation.vehicle.f22a.public-data-surrogate.v1",
        "systems.modern-airborne.not-simulated.v1", false, true,
        "https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104506/f-22-raptor/",
        AutoGcasCapabilityProfile.ModernCrewedPublicDataSurrogate);
    /// The 2030s cheap high-altitude interceptor. Steel where the heat is, composite elsewhere, no
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
    bool AcceptsMultiplayerWorldOrigin = false) {
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
    public const string TerrainProfileId = "terrain.ukraine.soniachne-theatre.v2";
    public const string MacroSceneryProfile = "ukraine-2030s-macro";
    public const string MicroSceneryProfile = "ukraine-modern";

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
        MissionEnvironmentFrameKind.SharedTheatre);

    public static MissionEnvironmentContract HeroCell { get; } = Shared with {
        LocationId = "location.ukraine.soniachne-hero-cell.v1",
        FrameKind = MissionEnvironmentFrameKind.LocalHeroCell,
        PreferredTerrainStreamingRadiusM = 32_000.0
    };

    // The source coordinate (-100 km, -100 km) lies in the synthetic coastal water cell. Positive
    // placement moves that source point to mission-local zero without changing the theatre datum.
    public static MissionEnvironmentContract CoastalCell { get; } = Shared with {
        LocationId = "location.ukraine.soniachne-coastal-cell.v1",
        FrameKind = MissionEnvironmentFrameKind.LocalCoastalCell,
        TerrainSourceAnchorEastM = -100_000.0,
        TerrainSourceAnchorNorthM = -100_000.0,
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
        PreferredTerrainStreamingRadiusM = 145_000.0
    };
}

/// <summary>Stable mission identity lives with content, not a bridge switch over menu indexes.</summary>
public sealed record MissionContract(
    string Id,
    MissionContentFamily ContentFamily,
    bool PublicDataSurrogate = false,
    string RulesOfEngagement = "GUNS_ONLY",
    string Era = "UNSPECIFIED") {
    public static MissionContract Custom { get; } = new(
        "mission.custom.v1", MissionContentFamily.Custom);
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
    ScriptedInterceptConfig? ScriptedIntercept = null) {
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
        if (UsesNeutralMergeBandit)
            return new NeutralMergeBandit(Bandit, BanditAir, spec?.Skill ?? BanditSkill, terrain);
        if (!UsesReactiveBandit)
            return new RailBandit(Bandit, BanditAir, BanditTimeline);
        // A director-staged opening (post-restart pacing memory) may resolve a skill whose
        // airframe differs from the beat's staged one — a machine spike surviving a restart
        // must fly the UCAV at UCAV mass, not the staged airframe with a 15 G label.
        PilotSkill skill = spec?.Skill ?? BanditSkill;
        AircraftParams air = spec is { } opening
            ? BanditAirForMount(skill, opening.Mount)
            : BanditAirForSkill(skill);
        AircraftState initial = ReferenceEquals(air, BanditAir)
            ? Bandit : Bandit with { Mass = air.MassKg };
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
        double side = formationIndex % 2 == 1 ? 1.0 : -1.0;
        double rank = (formationIndex + 1) / 2.0;
        AircraftState initial = Bandit with {
            Position = Bandit.Position + new Vec3D(
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
        GunsOnly.Sim.Environment.ITerrainSurface? terrain = null, SpawnSpec? spec = null) {
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
            doctrineIndex: spec?.DoctrineIndex);
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
    public static BeatSetup CarrierApproach(
        GunsOnly.Sim.Carrier.DeckConfiguration configuration = GunsOnly.Sim.Carrier.DeckConfiguration.Axial) {
        var carrier = new GunsOnly.Sim.Carrier(
            deckCentre: new Vec3D(0, 20, 0), headingRad: 0, speedMps: 3,
            deckAltM: 20, deckLengthM: 250, deckWidthM: 30,
            configuration: configuration);
        // ~1.5 km down the ACTIVE landing centreline, on-speed (~136 kt) and on a −3.4° slope
        // toward the ~20 m deck. On the angled configuration this correctly starts off the ship's
        // starboard quarter and points nine degrees to port, straight down the angled landing area.
        var start = carrier.LandingPoint(along: -1500, height: 90);
        return new BeatSetup("Carrier approach",
        Player: new AircraftState(start, 70, -0.06, carrier.LandingHeadingRad, 0, FlightModel.Sabre.MassKg),
        // The one-opponent ABI still needs a finite aircraft state, but carrier qualification is a
        // recovery attempt rather than a hidden combat sortie. Keep the inert rail well outside the
        // recovery volume so neither its navigation nor an incidental impact can author the result.
        Bandit: new AircraftState(new Vec3D(0, 1500, 50000), 120, 0, 0.0, 0,
            FlightModel.Sabre.MassKg),
        Law: new ApproachLaw(),
        BanditTimeline: new() {
            (0.0, new PilotCommand(1.0, 0.0, 0.30, 0)),
        },
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
        // of ship wind, burble, heave, hull and island. Its 120.5 m datum sits 2.5 m above the
        // packed Soniachne terrain at local origin (118.0 m after 0.1 m quantization).
        var carrier = new GunsOnly.Sim.Carrier(
            deckCentre: new Vec3D(0, 120.5, 0), headingRad: 0, speedMps: 0,
            deckAltM: 120.5, deckLengthM: 1_200, deckWidthM: 48,
            configuration: GunsOnly.Sim.Carrier.DeckConfiguration.Axial,
            kind: GunsOnly.Sim.Carrier.PlatformKind.FixedArrestingStrip);
        return new BeatSetup(
            Name: "Rapier intercept",
            Player: new AircraftState(new Vec3D(0, 120.5, 0), 0.0, 0, 0, 0,
                FlightModel.RapierPublicDataSurrogate.MassKg),
            // A contact high and slow ahead: the thing this aircraft was built to kill is an
            // enabler, not a fighter.
            // 680 km out. This is deliberately BEYOND the 262 km regional truth, and that is the
            // call: a realistic deep intercept matters more than staying inside the authored cell.
            // The aircraft exists because basing sits far enough back that cratering the field is
            // impractical, and at 90 or even 118 km the pilot never spends the climb or the ram
            // acceleration that justify any of it. With the contact closing at 210 m/s the merge
            // still falls near 190 km. 420 km was too far the other way: the pilot ran out of fuel
            // at the attack point, because the transit plus a fight plus a 420 km egress does not
            // fit 5,950 lb. 240 km still forces the full climb and the ram acceleration — the ram
            // corridor alone needs about 90 km at altitude — while leaving fuel for the fight and
            // the trap. Reach is what this aircraft is FOR, so this is the number to revisit once
            // per-stream fuel stops charging military flow for a turbine that is contributing
            // nothing above M2.7.
            //
            // The far half of the route is over presentation apron rather than authored terrain.
            // At 21 km cruise that is invisible; it would matter if the fight went low, and it is
            // the reason the parked ukraine-theatre branch wanted a bigger cell.
            Bandit: new AircraftState(new Vec3D(18_000, 18_000, 680_000), 210, 0, Math.PI, 0,
                FlightModel.Su27SPublicDataSurrogate.MassKg),
            Law: new PurePursuitLaw(),
            BanditTimeline: new() { (0.0, new PilotCommand(1.0, 0.0, 0.55, 0.0)) },
            PlayerParams: FlightModel.RapierPublicDataSurrogate,
            BanditParams: FlightModel.Su27SPublicDataSurrogate,
            Carrier: carrier,
            // This is a scripted four-ship intercept, not four simultaneous 120 Hz BFM thinkers.
            // Rail controllers preserve the authored closing formation until the pilot releases
            // the swarm. Running four full reactive doctrine searches during the buried launch
            // cost roughly 2.8 seconds per browser frame while changing no player-facing decision.
            UsesReactiveBandit: false,
            Combat: CombatConfig.ModernVisualMerge,
            Fuel: new FuelConfig(
                CapacityLb: 9_920.0,          // 4,500 kg of fuel
                // The interceptor can carry 2,700 kg, but this authored alert launch carries only
                // 1,406 kg. The M4 outbound dash, M4 escape, and powered recovery leave a narrow
                // trap reserve instead of turning the last act into a consequence-free cruise.
                InitialFuelLb: 3_100.0,
                BingoThresholdLb: 1_000.0,
                ConsumesFuel: true,
                JokerThresholdLb: 1_200.0,
                MinimumFuelThresholdLb: 600.0,
                EmergencyFuelThresholdLb: 300.0),
            // FULL AUGMENTED POWER on the stroke. 1.0 is the dry lever stop, and a 7.85 t aircraft
            // leaving a ramp on dry thrust decays below stall while it is still climbing away —
            // nobody launches a heavy jet at military power.
            InitialThrottle: 1.55,
            StartsOnCatapult: true,
            // The deck default of 62 m/s over 75 m cannot fly this wing. A LAND installation is
            // not constrained by a deck. 520 m of electromagnetic track is shorter than any
            // runway, costs 2.2 G to the pilot, and delivers 150 m/s — about 2.1 times this wing's
            // stall speed, where the aircraft is genuinely flying rather than clinging on. Launch
            // speed is the cheapest safety margin available: the ramp then converts it into climb.
            CatapultStrokeM: 520.0,
            // 110 m/s, not 150. Stall at launch mass with flaps is 66 m/s, so 150 left the rail at
            // 2.28 Vs -- roughly double a carrier cat shot, which is why the launch and climbout
            // read as frantic. It also forced everything around it: 88.3 MJ of launcher energy at
            // 25.5 MW peak, a 2.2 g stroke, a 16.7 m ski jump, and gear/flap limits invented at
            // 350 KIAS purely to survive our own catapult.
            //
            // 110 m/s is 1.67 Vs -- still a healthier margin than a carrier gives -- and halves the
            // launcher to 47.5 MJ at 10.0 MW, gentles the stroke to 1.19 g, and lets the gear and
            // flap limits come back to an ordinary fast-jet number.
            CatapultEndSpeedMps: 110.0,
            // A real ski jump, and the earlier seven degrees was an excuse rather than a design.
            // The steppe is flat, so the ramp is built either way; once you are building it, the
            // angle should be chosen by what the aircraft and the pilot can take, not by what
            // terrain might have offered.
            //
            // At 150 m/s this aircraft can SUSTAIN a 47.7 degree climb — thrust 65 kN against
            // 8.1 kN of drag and 77 kN of weight. So the jet is nowhere near the limit; the arc is.
            // Twelve degrees is the same angle Kuznetsov and Invincible use, and at 3 G normal it
            // needs a 765 m radius: a 160 m arc rising 16.7 m, with 360 m of flat run before it.
            // The pilot sees sqrt(2.21^2 + 3^2) = 3.73 G combined, reclined, against a 12 G
            // airframe. The rise costs 1.29 MJ of an 88.3 MJ launch — 1.5%, the same order as the
            // air the aircraft pushes down the gallery.
            CatapultRampAngleRad: 12.0 * Math.PI / 180.0,
            // The launch lane is 70 m off the recovery centreline. A carrier shares one deck
            // because it has no choice; a dispersed land site has room and must use it. The launch
            // gallery is an 8 m roofed structure under a 10 m berm, so at the deck default of -7 m
            // it sat squarely in the touchdown zone of a 48 m strip — an aircraft on short final
            // would fly into it. 70 m clears the strip edge by nearly 40 m.
            CatapultCrossOffsetM: -70.0,
            // Gear and flaps qualified past the 291 KIAS the launcher hands over at.
            SystemsProfile: AirframeSystemsProfile.RapierSurrogate,
            Mission: new MissionContract(
                "mission.modern.rapier-intercept.public-data-surrogate.v1",
                MissionContentFamily.ModernPublicDataSurrogate,
                PublicDataSurrogate: true,
                RulesOfEngagement: "GUNS_ONLY_FIRST_PASS_SAFE",
                Era: "MODERN_PUBLIC_DATA_EXERCISE"),
            PlayerCapability: AircraftCapability.RapierSurrogate,
            BanditCapability: AircraftCapability.Su27SSurrogate,
            PlayerPhysiologyProfile: PilotPhysiologyProfile.RapierReclinedInterceptor,
            RecoveryCompletesSortie: true,
            Environment: Ukraine2030sTheatre.RapierCorridor,
            ScriptedIntercept: new ScriptedInterceptConfig());
    }

    /// <summary>
    /// RAPIER CIRCUITS — the same aircraft, the same launcher, the same strip, and nothing else.
    ///
    /// The trap is the hardest thing this aircraft asks of a pilot and the intercept gives exactly
    /// one attempt at it, 240 km from home and low on fuel. That is the wrong place to learn.
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
            // No contact. The bandit slot still needs a state, so it is parked far above and behind
            // where it can never become a merge, and combat is disarmed below.
            Bandit = sortie.Bandit with {
                Position = new Vec3D(0.0, 24_000.0, -400_000.0), Speed = 200.0
            },
            UsesReactiveBandit = false,
            ScriptedIntercept = new ScriptedInterceptConfig(
                FormationSize: 0,
                ShortRangeMissiles: 0,
                DogfightingDrones: 0,
                PursuerCount: 0,
                PatternOnly: true,
                AutomationDefaultEnabled: true,
                RecoveryRequired: true),
            Combat = CombatConfig.CarrierRecoveryOnly,
            // Full tanks and no bingo pressure: the point is repetition, not endurance. A circuit
            // costs a few hundred pounds, so this is roughly a dozen patterns before fuel matters.
            Fuel = sortie.Fuel with {
                InitialFuelLb = 9_920.0,
                BingoThresholdLb = 800.0,
                JokerThresholdLb = 1_400.0
            },
            // A bolter or a go-around must NOT end the session — that is the whole exercise.
            RecoveryCompletesSortie = false,
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
        RapierJobKind job = DealRapierJob(jobSeed);
        BeatSetup sortie = RapierIntercept(configuration);
        AircraftState contact = job switch {
            RapierJobKind.Balloon => new AircraftState(
                new Vec3D(12_000, 18_500, 420_000), 40.0, 0.0, Math.PI, 0.0,
                FlightModel.GliderStrike.MassKg),
            RapierJobKind.Awacs => new AircraftState(
                new Vec3D(8_000, 9_144, 380_000), 130.0, 0.0, Math.PI, 0.0,
                FlightModel.AwacsTarget.MassKg),
            RapierJobKind.Transport => new AircraftState(
                // Low and slow after the lob — the dive is the job.
                new Vec3D(4_000, 2_200, 340_000), 145.0, 0.0, Math.PI, 0.0,
                FlightModel.Su27SPublicDataSurrogate.MassKg),
            RapierJobKind.SwarmLob => new AircraftState(
                // High formation: apex release window, then leave.
                new Vec3D(10_000, 18_500, 390_000), 200.0, 0.0, Math.PI, 0.0,
                FlightModel.Su27SPublicDataSurrogate.MassKg),
            _ => sortie.Bandit
        };
        AircraftParams banditParams = job switch {
            RapierJobKind.Balloon => FlightModel.GliderStrike,
            RapierJobKind.Awacs => FlightModel.AwacsTarget,
            _ => FlightModel.Su27SPublicDataSurrogate
        };
        AircraftCapability banditCapability = job switch {
            RapierJobKind.Balloon => AircraftCapability.BalloonGliderPrototype,
            RapierJobKind.Awacs => AircraftCapability.AwacsTargetPrototype,
            _ => AircraftCapability.Su27SSurrogate
        };
        // AWACS / enabler kill: F-22-class pursuers home — Escape path already models them.
        int pursuers = job is RapierJobKind.Awacs or RapierJobKind.Balloon ? 2 : 1;
        return sortie with {
            Name = $"Go fly the Rapier — {job}",
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
                Job: job),
            Mission = new MissionContract(
                "mission.modern.rapier-go-fly.public-data-surrogate.v1",
                MissionContentFamily.ModernPublicDataSurrogate,
                PublicDataSurrogate: true,
                RulesOfEngagement: "GUNS_ONLY_FIRST_PASS_SAFE",
                Era: "MODERN_PUBLIC_DATA_EXERCISE")
        };
    }

    static RapierJobKind DealRapierJob(int seed) {
        // Stable deal: seed 0 rotates with wall-clock seconds so each session differs; explicit
        // seeds stay deterministic for tests and OFT cards.
        int pick = seed != 0
            ? Math.Abs(seed)
            : (int)(DateTime.UtcNow.Ticks / TimeSpan.TicksPerSecond);
        return (RapierJobKind)(1 + (pick % 4)); // Balloon..SwarmLob (skip FormationIntercept)
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
            Mission: new MissionContract(
                "mission.modern.visual-merge.f22a-vs-su27s.public-data-surrogate.v1",
                MissionContentFamily.ModernPublicDataSurrogate,
                PublicDataSurrogate: true,
                RulesOfEngagement: "GUNS_ONLY_FIRST_PASS_SAFE",
                Era: "MODERN_PUBLIC_DATA_EXERCISE"),
            PlayerCapability: AircraftCapability.F22ASurrogate,
            BanditCapability: AircraftCapability.Su27SSurrogate,
            VisualMergeEvaluation: new VisualMergeEvaluationConfig(),
            PlayerPhysiologyProfile: PilotPhysiologyProfile.ModernFastJetReference,
            ContinuousCombat: new ContinuousCombatConfig(),
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
        const double PlayerAltitudeM = 460.0;
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
        12 => RapierGoFly(jobSeed: 0, deckConfiguration),
        _ => Perch()
    };
}
