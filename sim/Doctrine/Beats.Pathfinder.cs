namespace GunsOnly.Sim.Doctrine;

public static partial class Beats {
    public const int PathfinderBeatIndex = 15;
    public const string PathfinderMissionId = "mission.rapier.pathfinders.phase1.v1";

    /// Independent relay hunt fixture. The gallery and dealt operations factories stay intact.
    public static BeatSetup RapierPathfinders(uint seed = 20261016, bool fullSortie = false) {
        var sortie = RapierIntercept();
        var definition = PathfinderMissionDefinition.FirstLight(seed);
        double fuelLb = RapierV2Design.FuelCapacityKg * 2.20462262;
        double altitude = PathfinderRelayCard.FloatAltitudeM;
        var position = new Vec3D(-35_000, altitude, 0);
        double speed = 3.6 * definition.Weather.Atmosphere.Sample(altitude).SpeedOfSoundMps;
        var velocity = new Vec3D(-speed, 0, 0) + definition.Weather.Wind.Sample(position);
        // The generic AircraftSim fallback trims with the low-speed CLAlpha. This authored
        // ram-regime entry needs the live Mach slope and its full fuel/four-drone gross mass.
        double mass = sortie.PlayerAir.FuelFreeMassKg + fuelLb * 0.45359237
            + 4 * FlightModel.RapierGunDroneSurrogate.MassKg;
        double q = 0.5 * definition.Weather.Atmosphere.Sample(altitude).DensityKgM3 * speed * speed;
        double alpha = (mass * FlightModel.G0 / (q * sortie.PlayerAir.WingAreaM2)
            - sortie.PlayerAir.ZeroLiftCoefficient) / FlightModel.EffectiveClAlpha(sortie.PlayerAir, 3.6);
        var forward = new Vec3D(-Math.Cos(alpha), Math.Sin(alpha), 0);
        var up = new Vec3D(Math.Sin(alpha), Math.Cos(alpha), 0);
        var attitude = QuaternionD.FromFrame(up.Cross(forward), up, forward);
        return sortie with {
            Name = fullSortie ? "Rapier — PATHFINDERS full sortie" : "Rapier — PATHFINDERS first light",
            Pathfinder = definition,
            Player = fullSortie ? sortie.Player : Carrier.StateFromVelocity(position, velocity, mass, attitude),
            StartsOnCatapult = fullSortie,
            InitialThrottle = sortie.PlayerAir.MaxThrustFraction,
            CatapultEndSpeedMps = 120,
            OpponentPresence = OpponentPresence.None,
            OpponentInitialState = null,
            UsesReactiveBandit = false,
            Fuel = sortie.FuelLoadout with { CapacityLb = fuelLb, InitialFuelLb = fuelLb },
            Combat = new CombatConfig(PlayerAmmo: 360, OpponentAmmo: 0, OpponentHitsToDefeat: 1,
                PlayerGun: GunProfiles.M61A2PublicDataSurrogate, PlayerInfiniteAmmo: false),
            ScriptedIntercept = new ScriptedInterceptConfig(FormationSize: 0, ShortRangeMissiles: 0,
                DogfightingDrones: 4, PursuerCount: 0, AutomationDefaultEnabled: false,
                RecoveryRequired: true, ZoomLobProfile: false, DeterministicSwarmWipe: false,
                Job: RapierJobKind.Balloon, BalloonReactionRangeM: 0, BalloonReactionDelaySeconds: 0),
            Mission = new MissionContract(PathfinderMissionId, MissionContentFamily.ModernPublicDataSurrogate,
                PublicDataSurrogate: true, RulesOfEngagement: "PATHFINDER_DEBRIS_POPULATED_POLYGONS",
                Era: "FICTIONAL_DAWN", EconomicMode: MissionEconomicMode.RapierOperations,
                AllowsTimeCompression: false),
            OpenSegmentNav = false
        };
    }
}
