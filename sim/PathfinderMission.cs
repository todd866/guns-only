using GunsOnly.Sim.Doctrine;
using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim;

public readonly record struct PathfinderBalloonSpawn(int Id, Vec3D Position);

/// Frozen sortie inputs. Explicit seed only; a restart cannot deal a new weather day.
public sealed class PathfinderMissionDefinition {
    public uint Seed { get; }
    public bool Dawn => true;
    public int SafeKillQuota => 1;
    public double HuntDeadlineSeconds => 300;
    public double GroundElevationM { get; }
    public WeatherProfile Weather { get; }
    public IReadOnlyList<PathfinderBalloonSpawn> Spawns { get; }
    public IReadOnlyList<PathfinderPopulatedArea> PopulatedAreas { get; }

    public PathfinderMissionDefinition(uint seed, IEnumerable<PathfinderBalloonSpawn> spawns,
        IEnumerable<PathfinderPopulatedArea> populatedAreas, WeatherProfile weather, double groundElevationM = 0) {
        var actors = spawns.ToArray();
        if (actors.Length is < 1 or > 6 || actors.Select(a => a.Id).Distinct().Count() != actors.Length
            || actors.Any(a => a.Id <= 0 || !a.Position.IsFinite)
            || !double.IsFinite(groundElevationM))
            throw new ArgumentException("PATHFINDERS needs 1–6 unique finite relay spawns.", nameof(spawns));
        Seed = seed; GroundElevationM = groundElevationM;
        Weather = weather ?? throw new ArgumentNullException(nameof(weather));
        Spawns = Array.AsReadOnly(actors);
        PopulatedAreas = Array.AsReadOnly(populatedAreas.ToArray());
    }

    public static PathfinderMissionDefinition FirstLight(uint seed = 20261016) {
        // Fictional encounter geometry, calibrated against the beat-15 lab (2026-10-16).
        // A 6.5 G Rapier at M3.6 cannot chase laterally scattered targets. These 28 km
        // legs curve gently; drift still demands an actual ballistic line-up.
        var spawns = new[] {
            new PathfinderBalloonSpawn(1, new(-52_000, PathfinderRelayCard.FloatAltitudeM, 0)),
            new PathfinderBalloonSpawn(2, new(-80_000, PathfinderRelayCard.FloatAltitudeM, 100)),
            new PathfinderBalloonSpawn(3, new(-108_000, PathfinderRelayCard.FloatAltitudeM, 300))
        };
        var weather = new WeatherProfile(StandardAtmosphere1976.Instance, new LayeredWindField(new[] {
            new WindVectorLevel(0, new Vec3D(4, 0, 1)),
            new WindVectorLevel(10_000, new Vec3D(10, 0, 0)),
            new WindVectorLevel(22_000, new Vec3D(18, 0, -3))
        }));
        // Fixed town geography for every seed. Two populated districts leave a short clear
        // corridor at nominal H+85..110 s. The first arrival (~41 s) is over a district;
        // waiting means a real re-attack, not freezing the aircraft beside the balloon.
        var nominal = new PathfinderRelayBalloon(2, spawns[1].Position, 20261016,
            weather.Wind, RapierLaunchSite.OperatingSurfaceElevationM);
        var footprint = nominal.PredictFootprint();
        double west = footprint.Centre.X + nominal.Velocity.X * 85 - footprint.RadiusM;
        double east = footprint.Centre.X + nominal.Velocity.X * 110 + footprint.RadiusM;
        PathfinderPopulatedArea District(string id, double left, double right) => new(id, new[] {
            new Vec3D(left, 0, footprint.Centre.Z - 2500), new Vec3D(right, 0, footprint.Centre.Z - 2500),
            new Vec3D(right, 0, footprint.Centre.Z + 2500), new Vec3D(left, 0, footprint.Centre.Z + 2500)
        });
        return new(seed, spawns, new[] { District("pathfinder.town.west.v2", west - 8000, west),
            District("pathfinder.town.east.v2", east, east + 8000) }, weather,
            RapierLaunchSite.OperatingSurfaceElevationM);
    }
}

public readonly record struct PathfinderEngagement(int BalloonId, PathfinderBalloonComponent Component,
    bool RelayDenied, PathfinderFootprint? Footprint, PathfinderFootprintClass Classification,
    bool KillRewardEligible, double TimeSeconds, string Source = "gun");

/// Bounded Phase-1 hunt state and economy adapter. Generic fighter damage/egress never owns these
/// relay sectors. Player and drone projectiles share component and ROE resolution.
public sealed class PathfinderMission {
    readonly PathfinderRelayBalloon[] _balloons;
    readonly GunTarget[] _targets;
    readonly List<PathfinderEngagement> _killRecords = new(6);
    bool _selectionPinned;
    public PathfinderMissionDefinition Definition { get; }
    public IReadOnlyList<PathfinderRelayBalloon> Balloons { get; }
    public GunKill Gun { get; } = new(ammo: 360, hitsToKill: 1, hitRadiusM: 1.4,
        profile: GunProfiles.M61A2PublicDataSurrogate);
    public double ElapsedSeconds { get; private set; }
    public int SelectedBalloonId { get; private set; }
    public PathfinderRelayBalloon SelectedBalloon => _balloons.Single(b => b.Id == SelectedBalloonId);
    public int RelaySectorsDenied => _killRecords.Count;
    public int RelaysEscaped => _balloons.Count(b => b.Escaped);
    public bool Complete => _balloons.All(b => !b.RelayActive || b.Escaped);
    public string EndReason => ElapsedSeconds >= Definition.HuntDeadlineSeconds ? "deadline" : "relays-resolved";
    public int DroneReleases { get; private set; }
    public int DroneKills => _killRecords.Count(k => k.Source == "drone");
    public int SafeKills { get; private set; }
    public int RoeViolations { get; private set; }
    public bool ContractEarned => SafeKills >= Definition.SafeKillQuota && RoeViolations == 0;
    public PathfinderEngagement? LastEngagement { get; private set; }
    public IReadOnlyList<PathfinderEngagement> KillRecords { get; }

    public PathfinderMission(PathfinderMissionDefinition definition, WeatherProfile? weather = null) {
        Definition = definition ?? throw new ArgumentNullException(nameof(definition));
        _balloons = definition.Spawns.Select(s => new PathfinderRelayBalloon(s.Id, s.Position,
            definition.Seed, (weather ?? definition.Weather).Wind, definition.GroundElevationM)).ToArray();
        Balloons = Array.AsReadOnly(_balloons);
        KillRecords = _killRecords.AsReadOnly();
        _targets = new GunTarget[_balloons.Length * 2];
        SelectedBalloonId = _balloons[0].Id;
    }

    public bool SelectBalloon(int id) {
        if (!_balloons.Any(b => b.Id == id)) return false;
        SelectedBalloonId = id;
        _selectionPinned = true; // A deliberate Tab selection may be a relay behind us.
        return true;
    }

    public PathfinderFootprintClass ClassifyKill(PathfinderRelayBalloon balloon) =>
        balloon.PredictFootprint().Classify(Definition.PopulatedAreas);

    public PathfinderEngagement Engage(int id, PathfinderBalloonComponent component, string source = "gun") {
        var balloon = _balloons.Single(b => b.Id == id);
        PathfinderFootprint? footprint = component == PathfinderBalloonComponent.Gondola && balloon.RelayActive
            ? balloon.PredictFootprint() : null;
        var classification = footprint?.Classify(Definition.PopulatedAreas) ?? PathfinderFootprintClass.Unknown;
        bool killed = balloon.Hit(component);
        bool eligible = killed && classification == PathfinderFootprintClass.Clear;
        if (eligible) SafeKills++;
        else if (killed) RoeViolations++;
        var result = new PathfinderEngagement(id, component, killed, footprint, classification, eligible, ElapsedSeconds, source);
        // At most six actors, each disabled once: repeated impacts cannot grow this ledger.
        if (killed) _killRecords.Add(result);
        LastEngagement = result;
        return result;
    }

    public void Step(in AircraftState player, bool trigger, double dt) {
        if (!double.IsFinite(dt) || dt <= 0) throw new ArgumentOutOfRangeException(nameof(dt));
        int count = 0;
        foreach (var balloon in _balloons) {
            foreach (var target in balloon.GunTargets()) _targets[count++] = target;
        }
        Gun.Step(trigger, player, SelectedBalloon.GondolaTargetId, _targets, dt,
            requireLiveSelectedTarget: false);
        // Resolve the current moment, not last frame's footprint. The gun gives ordered swept
        // contact fractions; drift, leaks and falling debris advance to each contact in turn.
        double elapsed = 0;
        foreach (var impact in Gun.ImpactsThisStep) {
            double contactTime = impact.StepFraction * dt;
            foreach (var balloon in _balloons) balloon.Step(contactTime - elapsed);
            ElapsedSeconds += contactTime - elapsed;
            elapsed = contactTime;
            int id = checked((int)(impact.TargetId / 2));
            Engage(id, impact.TargetId % 2 == 0
                ? PathfinderBalloonComponent.Envelope : PathfinderBalloonComponent.Gondola);
        }
        foreach (var balloon in _balloons) balloon.Step(dt - elapsed);
        ElapsedSeconds += dt - elapsed;
        if (ElapsedSeconds >= Definition.HuntDeadlineSeconds)
            foreach (var balloon in _balloons) balloon.Escape();
        // Preserve manual selection while the target is ahead. After a pass, point the
        // existing steering cue down the lane; missed targets remain available for a loop.
        var selectedDelta = SelectedBalloon.GondolaPosition - player.Position;
        if (!SelectedBalloon.RelayActive || SelectedBalloon.Escaped
            || (!_selectionPinned && selectedDelta.Length > 6500 && selectedDelta.Dot(player.VelocityVector()) < 0)) {
            var position = player.Position;
            var velocity = player.VelocityVector();
            var next = _balloons.Where(b => b.RelayActive && !b.Escaped
                && (b.Position - position).Dot(velocity) > 0)
                .OrderBy(b => (b.Position - position).Length).FirstOrDefault();
            if (next is not null) { SelectedBalloonId = next.Id; _selectionPinned = false; }
        }
    }

    public void RecordDroneRelease() => DroneReleases++;

    public void StepDroneGun(RapierGunDrone drone, int targetId, bool trigger, double dt) {
        int count = 0;
        foreach (var balloon in _balloons)
            foreach (var target in balloon.GunTargets()) _targets[count++] = target;
        drone.Gun.Step(trigger, drone.Sim.State, targetId * 2L + 1, _targets, dt,
            requireLiveSelectedTarget: false);
        foreach (var impact in drone.Gun.ImpactsThisStep)
            Engage(checked((int)(impact.TargetId / 2)), impact.TargetId % 2 == 0
                ? PathfinderBalloonComponent.Envelope : PathfinderBalloonComponent.Gondola, "drone");
    }

    public RapierEconomicSortieSlip EvaluateEconomy(in RapierEconomicSortieFacts facts) =>
        RapierEconomicModel.Evaluate(facts with {
            Target = RapierJobKind.Balloon,
            TargetNeutralized = ContractEarned
        });
}
