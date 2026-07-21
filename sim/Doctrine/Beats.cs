using System.Collections.Generic;
namespace GunsOnly.Sim.Doctrine;

/// <summary>
/// The deliberately small combat/loadout seam for the current one-player/one-opponent sortie.
/// Mission content chooses ammunition and survivability explicitly; SimulationSession remains the
/// authority for weapon instances, projectiles, damage, and outcomes.
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
    public static AircraftCapability Su27SSurrogate { get; } = new(
        "aircraft.su27s.public-data-surrogate.v1", "Su-27S public-data surrogate",
        "presentation.vehicle.su27s.public-data-surrogate.v1",
        "systems.modern-airborne.not-simulated.v1", false, true,
        "https://www.ukrspecexport.com/uploads/files/Categories/pdf_1/a205b8.pdf");
    public static AircraftCapability OneWayAttackDronePrototype { get; } = new(
        "aircraft.one-way-attack-drone.prototype.v1", "One-way attack drone prototype",
        "presentation.vehicle.one-way-attack-drone.prototype.v1",
        "systems.uncrewed-prototype.not-simulated.v1", false);
}

public enum MissionContentFamily {
    Korea1950s,
    Korea2030sPrototype,
    ModernPublicDataSurrogate,
    Custom
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
    bool ConsumesFuel = true) {
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

public record BeatSetup(string Name, AircraftState Player, AircraftState Bandit, IExecutionLaw Law,
    List<(double T, PilotCommand Cmd)> BanditTimeline,
    AircraftParams? PlayerParams = null, AircraftParams? BanditParams = null,
    GunsOnly.Sim.Carrier? Carrier = null, bool UsesReactiveBandit = false,
    CombatConfig? Combat = null, FuelConfig? Fuel = null,
    MaintenanceScenarioKind MaintenanceScenario = MaintenanceScenarioKind.None,
    double InitialThrottle = 0.85,
    MissionContract? Mission = null,
    AircraftCapability? PlayerCapability = null,
    AircraftCapability? BanditCapability = null,
    VisualMergeEvaluationConfig? VisualMergeEvaluation = null,
    bool UsesNeutralMergeBandit = false,
    DroneRaidScenarioDefinition? DroneRaid = null,
    PilotPhysiologyProfile? PlayerPhysiologyProfile = null) {
    public AircraftParams PlayerAir => PlayerParams ?? FlightModel.Sabre;
    public AircraftParams BanditAir => BanditParams ?? FlightModel.Sabre;
    public CombatConfig CombatRules => Combat ?? CombatConfig.Fighter;
    public FuelConfig FuelLoadout => Fuel ?? FuelConfig.PoweredJet;
    public MissionContract MissionIdentity => Mission ?? MissionContract.Custom;
    public AircraftCapability PlayerAircraft => PlayerCapability ?? AircraftCapability.F86F30;
    public AircraftCapability BanditAircraft => BanditCapability
        ?? AircraftCapability.F86F30Bandit;
    /// Pilot capability belongs to the actor and mission, not to the aircraft's aerodynamic
    /// coefficients. The Korea profile is the period-fighter default; modern missions opt into
    /// their full-coverage-suit/pressure-breathing surrogate explicitly below.
    public PilotPhysiologyProfile PlayerPilotPhysiology => PlayerPhysiologyProfile
        ?? PilotPhysiologyProfile.KoreaFastJetReference;
    public IBandit CreateBandit() => UsesNeutralMergeBandit
        ? new NeutralMergeBandit(Bandit, BanditAir)
        : UsesReactiveBandit
            ? new ReactiveBandit(Bandit, BanditAir)
            : new RailBandit(Bandit, BanditAir, BanditTimeline);

    /// Deterministic merge factory retained for a future continuous-operations ruleset. The
    /// current discrete SimulationSession finishes after one engagement and does not call it.
    public IBandit CreateNextBandit(in AircraftState player, int engagementNumber) =>
        ReactiveBandit.SpawnForMerge(player, BanditAir, engagementNumber);
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
    public void Step(in AircraftState player, double dt) => Step(dt);
    public bool WantsToFire(in AircraftState player) => !CatastrophicallyDamaged
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
        double surfaceHeightM, Carrier? carrier = null) {
        if (_wreckMotion is not null) return;
        ApplyCatastrophicDamage(_damageHandedness);
        _wreckMotion = new WreckContactMotion(_sim.State, surface,
            surfaceVelocity, surfaceHeightM, carrier);
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
        // A Sabre-class bogey ~3.1 km from the finals spawn, displaced right and above the egress.
        // It now owns a reactive AircraftSim: it points into the merge, breaks a gun threat, jinks,
        // unloads for energy, and returns toward this fight volume instead of flying a straight rail.
        Bandit: new AircraftState(new Vec3D(450, 650, 1500), 105, 0, 0.0, 0, FlightModel.Sabre.MassKg),
        Law: new ApproachLaw(),
        BanditTimeline: new() {
            (0.0, new PilotCommand(1.0, 0.0, 0.30, 0)),
        },
        BanditParams: FlightModel.Sabre,
        // The real target: a ~250 m × 30 m carrier, 20 m freeboard, steaming north into the wind.
        // Kinematic — it does not fly, it steams.
        Carrier: carrier,
        UsesReactiveBandit: true,
        Combat: CombatConfig.CarrierQualification,
        Mission: KoreaMission("mission.carrier-qualification.v1"));
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
            Mission: KoreaMission("mission.f86f.degraded-gear-recovery.v1"));
    }

    /// <summary>
    /// Straightforward guns-only dogfight between public-data airframe surrogates. The scenario
    /// begins at 18,000 ft in an offset reciprocal visual merge after both packages have reached
    /// the merge without a BVR result. Guns are safe through the first pass; there is no radar,
    /// stealth, missile, RWR, datalink, thrust-vectoring, or modern-FLCS simulation hiding behind
    /// the labels.
    /// </summary>
    public static BeatSetup ModernVisualMerge() {
        const double AltitudeM = 5486.4; // 18,000 ft
        return new BeatSetup("Visual merge — F-22A surrogate vs Su-27S surrogate",
            Player: new AircraftState(
                new Vec3D(-120.0, AltitudeM, -3200.0),
                300.0, 0.0, 0.0, 0.0,
                FlightModel.F22APublicDataSurrogate.MassKg),
            Bandit: new AircraftState(
                new Vec3D(120.0, AltitudeM + 60.0, 3200.0),
                285.0, 0.0, Math.PI, 0.0,
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
                ConsumesFuel: true),
            InitialThrottle: 1.0,
            Mission: new MissionContract(
                "mission.modern.visual-merge.f22a-vs-su27s.public-data-surrogate.v1",
                MissionContentFamily.ModernPublicDataSurrogate,
                PublicDataSurrogate: true,
                RulesOfEngagement: "GUNS_ONLY_FIRST_PASS_SAFE",
                Era: "MODERN_PUBLIC_DATA_EXERCISE"),
            PlayerCapability: AircraftCapability.F22ASurrogate,
            BanditCapability: AircraftCapability.Su27SSurrogate,
            VisualMergeEvaluation: new VisualMergeEvaluationConfig(),
            PlayerPhysiologyProfile: PilotPhysiologyProfile.ModernFastJetReference);
    }

    /// <summary>
    /// KOREA 2030s PROXY WAR — a public-data F-22 flight surrogate defends a fixed inner ring
    /// against four explicitly fictional one-way attack-drone prototypes. The current kernel owns
    /// one opponent, so the raid is an honest staged stream rather than four visually concurrent
    /// targets with only one physically authoritative. Each target flies a straight inbound track;
    /// the scored decision is cutoff geometry, first-valid-shot timing, and burst discipline.
    /// </summary>
    public static BeatSetup DroneRaidDefense() {
        const double AltitudeM = 2200.0;
        const double DroneSpeedMps = 115.0;
        const double DroneMassKg = 500.0;
        static AircraftState Inbound(double x, double z) => new(
            new Vec3D(x, AltitudeM, z),
            DroneSpeedMps, 0.0, Math.Atan2(-x, -z), 0.0, DroneMassKg);

        AircraftState[] targets = {
            Inbound(0.0, 8500.0),
            Inbound(4200.0, 7800.0),
            Inbound(-4800.0, 7600.0),
            Inbound(2600.0, 9000.0),
        };
        var raid = new DroneRaidScenarioDefinition(
            defendedPoint: new Vec3D(0.0, 0.0, 0.0),
            defendedRadiusM: 750.0,
            targets: targets);

        return new BeatSetup("Drone raid defence — staged stream",
            Player: new AircraftState(
                new Vec3D(0.0, AltitudeM + 250.0, -2200.0),
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
                ConsumesFuel: true),
            InitialThrottle: 1.0,
            Mission: new MissionContract(
                "mission.korea-2030s.drone-raid-defence.prototype.v1",
                MissionContentFamily.Korea2030sPrototype,
                PublicDataSurrogate: true,
                RulesOfEngagement: "GUNS_ONLY_DEFENSIVE_INTERCEPT",
                Era: "KOREA_2030S_PROXY"),
            PlayerCapability: AircraftCapability.F22ASurrogate,
            BanditCapability: AircraftCapability.OneWayAttackDronePrototype,
            DroneRaid: raid,
            PlayerPhysiologyProfile: PilotPhysiologyProfile.ModernFastJetReference);
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
}
