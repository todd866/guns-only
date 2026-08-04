using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Cobra.GroundWar;

/// <summary>
/// Deterministic ground war for Cobra Canyon: contested sites, mutual unit combat, control
/// balance, finite turret magazine, and Camp Ember rearm. Epistemic: fiction/provisional.
/// </summary>
public sealed class CobraGroundWarRuntime
{
    public const int MaxLivingUnits = 36;
    public const double ReinforceIntervalSeconds = 18.0;
    // Hostile seed/reinforce rings stay outside the authored M134 min-solution window so an
    // aircraft over a contested site can authorize fire before mutual ground combat clears the
    // wave. Friendlies remain on the pad. See docs/airframes/ah-1g-cobra/00-sources.md.
    public const double HostileSeedHardPointRingM = 140.0;
    public const double HostileSeedInfantryRingM = 170.0;
    public const double HostileSeedSoftVehicleRingM = 200.0;
    public const double HostileReinforceRingM = 160.0;
    public const double FriendlyReinforceRingM = 40.0;
    public const double WreckRetainSeconds = 12.0;
    public const double PlayerRoundDamage = 0.55;
    public const double VictoryControlThreshold = 0.55;
    public const double VictoryHoldSeconds = 45.0;
    public const double DefeatControlThreshold = -0.75;
    public const double DefeatHoldSeconds = 30.0;
    public static readonly int VictoryHoldTicks =
        (int)Math.Round(VictoryHoldSeconds / PlayerVehicleContract.FixedDeltaSeconds);
    public static readonly int DefeatHoldTicks =
        (int)Math.Round(DefeatHoldSeconds / PlayerVehicleContract.FixedDeltaSeconds);

    static readonly string[] ContestedLandmarkIds = {
        "landmark.cobra-canyon.iron-bell-bridge.v1",
        "landmark.cobra-canyon.plantation-water-tower.v1",
        "landmark.cobra-canyon.red-earth-quarry.v1",
        "landmark.cobra-canyon.camp-ember.v1",
    };

    readonly ITerrainSurface _terrain;
    readonly List<ContestedSite> _sites;
    readonly List<GroundUnit> _units = new();
    readonly Dictionary<string, double> _wreckAgeSeconds = new(StringComparer.Ordinal);
    readonly List<GroundWarEvent> _recentEvents = new();
    readonly ControlBalance _balance = new();
    readonly CobraTurretMagazine _magazine;
    readonly FobResupplyZone _fob;
    readonly Random _rng;
    int _nextUnitSerial;
    double _reinforceAccumulatorSeconds;
    double _elapsedSeconds;
    int _hostileKillsByPlayer;
    int _friendlyKillsByPlayer;
    int _fobRearmCount;
    int _roundsExpended;
    long _authorityTick;
    int _friendlyHoldTicks;
    int _hostileHoldTicks;
    HoldTheBridgeOutcome _missionOutcome = HoldTheBridgeOutcome.Pending;
    string _missionOutcomeReason = "";
    double? _forcedControlForTests;

    public CobraGroundWarRuntime(
        CobraCanyonDefinition definition,
        ITerrainSurface terrain,
        int? seed = null,
        CobraTurretMagazine? magazine = null)
    {
        ArgumentNullException.ThrowIfNull(definition);
        _terrain = terrain ?? throw new ArgumentNullException(nameof(terrain));
        _magazine = magazine ?? new CobraTurretMagazine();
        _rng = new Random(seed ?? 19_680_701);
        _sites = BuildSites(definition, terrain);
        CobraCanyonLandmarkDefinition fobLandmark = definition.Landmarks.First(landmark =>
            landmark.Kind == CobraCanyonLandmarkKind.ForwardOperatingBase);
        if (!terrain.TrySample(fobLandmark.EastM, fobLandmark.NorthM, out TerrainSample fobSurface))
            throw new InvalidOperationException("FOB has no terrain datum.");
        _fob = new FobResupplyZone(
            new Vec3D(fobLandmark.EastM, fobSurface.HeightM, fobLandmark.NorthM),
            radiusM: 55.0,
            maxClearanceM: 9.0);
        SeedInitialForces();
    }

    public IReadOnlyList<ContestedSite> Sites => _sites;
    public IReadOnlyList<GroundUnit> Units => _units;
    public ControlBalance Balance => _balance;
    public CobraTurretMagazine Magazine => _magazine;
    public FobResupplyZone Fob => _fob;
    public long AuthorityTick => _authorityTick;
    public IReadOnlyList<GroundWarEvent> RecentEvents => _recentEvents;
    public HoldTheBridgeOutcome MissionOutcome => _missionOutcome;
    public string MissionOutcomeReason => _missionOutcomeReason;
    public double VictoryHoldProgress =>
        Math.Clamp(_friendlyHoldTicks / (double)VictoryHoldTicks, 0.0, 1.0);
    public double DefeatHoldProgress =>
        Math.Clamp(_hostileHoldTicks / (double)DefeatHoldTicks, 0.0, 1.0);

    public GroundWarDebrief Debrief => new(
        _hostileKillsByPlayer,
        _friendlyKillsByPlayer,
        _fobRearmCount,
        _balance.PeakFriendlyControl,
        _balance.PeakHostileControl,
        _elapsedSeconds,
        _roundsExpended,
        _missionOutcome,
        _missionOutcomeReason,
        VictoryHoldProgress);

    public GroundUnit? FindUnit(string unitId) =>
        _units.FirstOrDefault(unit => string.Equals(unit.Id, unitId, StringComparison.Ordinal));

    public IEnumerable<GroundUnit> LivingUnits() => _units.Where(unit => unit.IsAlive);

    /// <summary>Test/fixture helper for Hold the Bridge outcome timers. Sticky across Advance.</summary>
    public void OverrideControlForTests(double control)
    {
        _forcedControlForTests = control;
        _balance.OverrideControl(control);
    }

    public void Advance(double dtSeconds)
    {
        if (!double.IsFinite(dtSeconds) || dtSeconds <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(dtSeconds));

        _recentEvents.Clear();
        _elapsedSeconds += dtSeconds;
        if (_missionOutcome == HoldTheBridgeOutcome.Pending) {
            AgeWrecks(dtSeconds);
            ResolveMutualCombat(dtSeconds);
            MoveUnits(dtSeconds);
            UpdateSiteControl();
            DriftBalance(dtSeconds);
            MaybeReinforce(dtSeconds);
            if (_forcedControlForTests is double forced)
                _balance.OverrideControl(forced);
            EvaluateHoldTheBridge(dtSeconds);
        }
        _authorityTick++;
    }

    void EvaluateHoldTheBridge(double dtSeconds)
    {
        _ = dtSeconds;
        if (_balance.Control >= VictoryControlThreshold) {
            _friendlyHoldTicks++;
            _hostileHoldTicks = 0;
        } else if (_balance.Control <= DefeatControlThreshold) {
            _hostileHoldTicks++;
            _friendlyHoldTicks = 0;
        } else {
            _friendlyHoldTicks = 0;
            _hostileHoldTicks = 0;
        }

        if (_friendlyHoldTicks >= VictoryHoldTicks) {
            _missionOutcome = HoldTheBridgeOutcome.Victory;
            _missionOutcomeReason = "held-bridge";
            _recentEvents.Add(new GroundWarEvent(
                _authorityTick,
                "mission-victory",
                null,
                null,
                GroundFaction.Friendly,
                _fob.CentreWorldM));
        } else if (_hostileHoldTicks >= DefeatHoldTicks) {
            _missionOutcome = HoldTheBridgeOutcome.Defeat;
            _missionOutcomeReason = "lost-basin";
            _recentEvents.Add(new GroundWarEvent(
                _authorityTick,
                "mission-defeat",
                null,
                null,
                GroundFaction.Hostile,
                _fob.CentreWorldM));
        }
    }

    /// <summary>
    /// Applies authorized gunfire: consumes magazine rounds and damages the selected unit.
    /// Returns true when at least one round was expended.
    /// </summary>
    public bool ApplyAuthorizedFire(string? targetUnitId, double dtSeconds)
    {
        if (!double.IsFinite(dtSeconds) || dtSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(dtSeconds));
        if (string.IsNullOrWhiteSpace(targetUnitId) || _magazine.IsDry)
            return false;

        GroundUnit? target = FindUnit(targetUnitId);
        if (target is null || !target.IsAlive)
            return false;

        int expended = _magazine.TryConsumeWhileFiring(dtSeconds);
        if (expended <= 0) return false;
        _roundsExpended += expended;

        bool wasAlive = target.IsAlive;
        target.ApplyDamage(expended * PlayerRoundDamage);
        PushEvent("gun-hit", target.Id, target.HomeSiteId, target.Faction, target.PositionWorldM);

        if (wasAlive && !target.IsAlive) {
            RegisterPlayerKill(target);
            _wreckAgeSeconds[target.Id] = 0.0;
            PushEvent("gun-kill", target.Id, target.HomeSiteId, target.Faction, target.PositionWorldM);
        }
        return true;
    }

    public bool TryResupplyAtFob(in Vec3D cobraPositionWorldM)
    {
        if (!_terrain.TrySample(cobraPositionWorldM.X, cobraPositionWorldM.Z, out TerrainSample surface))
            return false;
        if (!_fob.Contains(cobraPositionWorldM, surface.HeightM))
            return false;
        if (_magazine.RoundsRemaining >= _magazine.CapacityRounds)
            return false;

        _magazine.Rearm();
        _fobRearmCount++;
        PushEvent("fob-rearm", null, "site.camp-ember.v1", GroundFaction.Friendly, cobraPositionWorldM);
        return true;
    }

    void RegisterPlayerKill(GroundUnit victim)
    {
        if (victim.Faction == GroundFaction.Hostile)
            _hostileKillsByPlayer++;
        else
            _friendlyKillsByPlayer++;
        _balance.ApplyPlayerKillPulse(victim.Faction, victim.Role);
    }

    void ResolveMutualCombat(double dtSeconds)
    {
        // Snapshot living set so mutual damage is order-stable.
        GroundUnit[] living = LivingUnits().OrderBy(unit => unit.Id, StringComparer.Ordinal).ToArray();
        var damage = new Dictionary<string, double>(StringComparer.Ordinal);
        foreach (GroundUnit attacker in living) {
            GroundUnit? victim = null;
            double bestRangeSq = double.PositiveInfinity;
            foreach (GroundUnit candidate in living) {
                if (candidate.Faction == attacker.Faction) continue;
                double rangeSq = HorizontalDistanceSquared(
                    attacker.PositionWorldM, candidate.PositionWorldM);
                if (rangeSq > attacker.EngagementRangeM * attacker.EngagementRangeM)
                    continue;
                if (rangeSq >= bestRangeSq) continue;
                bestRangeSq = rangeSq;
                victim = candidate;
            }
            if (victim is null) continue;
            damage[victim.Id] = damage.GetValueOrDefault(victim.Id)
                + attacker.DamagePerSecond * dtSeconds;
            if (_rng.NextDouble() < 0.02)
                PushEvent("small-arms", attacker.Id, attacker.HomeSiteId, attacker.Faction,
                    attacker.PositionWorldM);
        }

        foreach (GroundUnit unit in living) {
            if (!damage.TryGetValue(unit.Id, out double amount)) continue;
            bool wasAlive = unit.IsAlive;
            unit.ApplyDamage(amount);
            if (wasAlive && !unit.IsAlive) {
                _wreckAgeSeconds[unit.Id] = 0.0;
                PushEvent("unit-destroyed", unit.Id, unit.HomeSiteId, unit.Faction,
                    unit.PositionWorldM);
            }
        }
    }

    void MoveUnits(double dtSeconds)
    {
        foreach (GroundUnit unit in LivingUnits().OrderBy(candidate => candidate.Id, StringComparer.Ordinal)) {
            if (unit.MoveSpeedMps <= 1e-9) continue;

            Vec3D goal = GoalFor(unit);
            Vec3D delta = goal - unit.PositionWorldM;
            double horizontal = Math.Sqrt(delta.X * delta.X + delta.Z * delta.Z);
            if (horizontal < 4.0) continue;

            double step = Math.Min(unit.MoveSpeedMps * dtSeconds, horizontal);
            double east = unit.PositionWorldM.X + delta.X / horizontal * step;
            double north = unit.PositionWorldM.Z + delta.Z / horizontal * step;
            if (!_terrain.TrySample(east, north, out TerrainSample surface))
                continue;
            double heightOffset = unit.Role == GroundUnitRole.SoftVehicle ? 1.2 : 0.4;
            unit.SetPosition(new Vec3D(east, surface.HeightM + heightOffset, north));
        }
    }

    Vec3D GoalFor(GroundUnit unit)
    {
        // Prefer nearest living enemy; otherwise push along balance toward the next contested site.
        GroundUnit? enemy = null;
        double best = double.PositiveInfinity;
        foreach (GroundUnit candidate in LivingUnits()) {
            if (candidate.Faction == unit.Faction) continue;
            double rangeSq = HorizontalDistanceSquared(unit.PositionWorldM, candidate.PositionWorldM);
            if (rangeSq >= best) continue;
            best = rangeSq;
            enemy = candidate;
        }
        if (enemy is not null && best <= unit.EngagementRangeM * unit.EngagementRangeM * 2.25)
            return enemy.PositionWorldM;

        ContestedSite home = _sites.First(site => site.Id == unit.HomeSiteId);
        if (unit.Intent == GroundUnitIntent.Hold)
            return home.PositionWorldM;

        // Advance toward a neighboring site in the direction favored by faction vs balance.
        ContestedSite? next = null;
        double bestScore = double.NegativeInfinity;
        foreach (ContestedSite site in _sites) {
            if (site.Id == home.Id) continue;
            double towardHostile = site.PositionWorldM.X + site.PositionWorldM.Z;
            double score = unit.Faction == GroundFaction.Friendly
                ? towardHostile + site.LocalControl * 100.0
                : -towardHostile - site.LocalControl * 100.0;
            if (score <= bestScore) continue;
            bestScore = score;
            next = site;
        }
        return next?.PositionWorldM ?? home.PositionWorldM;
    }

    void UpdateSiteControl()
    {
        foreach (ContestedSite site in _sites) {
            double friendly = 0.0;
            double hostile = 0.0;
            foreach (GroundUnit unit in LivingUnits()) {
                if (HorizontalDistanceSquared(unit.PositionWorldM, site.PositionWorldM)
                    > site.CaptureRadiusM * site.CaptureRadiusM)
                    continue;
                if (unit.Faction == GroundFaction.Friendly)
                    friendly += unit.CombatPower;
                else
                    hostile += unit.CombatPower;
            }
            double total = friendly + hostile;
            site.SetLocalControl(total <= 1e-9 ? 0.0 : (friendly - hostile) / total);
        }
    }

    void DriftBalance(double dtSeconds)
    {
        double friendly = LivingUnits()
            .Where(unit => unit.Faction == GroundFaction.Friendly)
            .Sum(unit => unit.CombatPower);
        double hostile = LivingUnits()
            .Where(unit => unit.Faction == GroundFaction.Hostile)
            .Sum(unit => unit.CombatPower);
        _balance.Drift(friendly, hostile, dtSeconds);
    }

    void MaybeReinforce(double dtSeconds)
    {
        _reinforceAccumulatorSeconds += dtSeconds;
        if (_reinforceAccumulatorSeconds < ReinforceIntervalSeconds)
            return;
        _reinforceAccumulatorSeconds = 0.0;

        int living = LivingUnits().Count();
        if (living >= MaxLivingUnits)
            return;

        double friendlyPower = LivingUnits()
            .Where(unit => unit.Faction == GroundFaction.Friendly)
            .Sum(unit => unit.CombatPower);
        double hostilePower = LivingUnits()
            .Where(unit => unit.Faction == GroundFaction.Hostile)
            .Sum(unit => unit.CombatPower);
        GroundFaction faction = friendlyPower <= hostilePower
            ? GroundFaction.Friendly
            : GroundFaction.Hostile;

        ContestedSite site = faction == GroundFaction.Friendly
            ? _sites.First(candidate => candidate.LandmarkId.Contains("camp-ember", StringComparison.Ordinal))
            : _sites.OrderBy(candidate => candidate.LocalControl).First();

        int slots = Math.Min(2, MaxLivingUnits - living);
        for (int index = 0; index < slots; index++) {
            GroundUnitRole role = index == 0 && _rng.NextDouble() < 0.35
                ? GroundUnitRole.SoftVehicle
                : GroundUnitRole.InfantryClump;
            double ringM = faction == GroundFaction.Hostile
                ? HostileReinforceRingM + index * 20.0
                : FriendlyReinforceRingM + index * 12.0;
            SpawnUnit(faction, role, site, GroundUnitIntent.Advance, ringM);
        }
    }

    void AgeWrecks(double dtSeconds)
    {
        for (int index = _units.Count - 1; index >= 0; index--) {
            GroundUnit unit = _units[index];
            if (unit.IsAlive) continue;
            double age = _wreckAgeSeconds.GetValueOrDefault(unit.Id) + dtSeconds;
            if (age >= WreckRetainSeconds) {
                _units.RemoveAt(index);
                _wreckAgeSeconds.Remove(unit.Id);
            } else {
                _wreckAgeSeconds[unit.Id] = age;
            }
        }
    }

    void SeedInitialForces()
    {
        foreach (ContestedSite site in _sites) {
            bool fob = site.LandmarkId.Contains("camp-ember", StringComparison.Ordinal);
            SpawnUnit(GroundFaction.Friendly, GroundUnitRole.HardPoint, site,
                GroundUnitIntent.Hold, ringM: fob ? 18.0 : 28.0, bearingRad: 0.4);
            SpawnUnit(GroundFaction.Friendly, GroundUnitRole.InfantryClump, site,
                fob ? GroundUnitIntent.Hold : GroundUnitIntent.Advance, ringM: 36.0, bearingRad: 1.2);
            SpawnUnit(GroundFaction.Friendly, GroundUnitRole.SoftVehicle, site,
                GroundUnitIntent.Advance, ringM: 48.0, bearingRad: 2.1);

            SpawnUnit(GroundFaction.Hostile, GroundUnitRole.HardPoint, site,
                GroundUnitIntent.Hold, ringM: HostileSeedHardPointRingM, bearingRad: 3.6);
            SpawnUnit(GroundFaction.Hostile, GroundUnitRole.InfantryClump, site,
                GroundUnitIntent.Advance, ringM: HostileSeedInfantryRingM, bearingRad: 4.4);
            SpawnUnit(GroundFaction.Hostile, GroundUnitRole.SoftVehicle, site,
                GroundUnitIntent.Advance, ringM: HostileSeedSoftVehicleRingM, bearingRad: 5.2);
        }
        UpdateSiteControl();
        DriftBalance(PlayerVehicleContract.FixedDeltaSeconds);
    }

    void SpawnUnit(
        GroundFaction faction,
        GroundUnitRole role,
        ContestedSite site,
        GroundUnitIntent intent,
        double ringM,
        double? bearingRad = null)
    {
        if (LivingUnits().Count() >= MaxLivingUnits)
            return;

        double bearing = bearingRad ?? _rng.NextDouble() * Math.PI * 2.0;
        double east = site.PositionWorldM.X + Math.Cos(bearing) * ringM;
        double north = site.PositionWorldM.Z + Math.Sin(bearing) * ringM;
        if (!_terrain.TrySample(east, north, out TerrainSample surface)) {
            east = site.PositionWorldM.X;
            north = site.PositionWorldM.Z;
            if (!_terrain.TrySample(east, north, out surface))
                return;
        }

        double maxHealth = role switch {
            GroundUnitRole.InfantryClump => 40.0,
            GroundUnitRole.SoftVehicle => 90.0,
            GroundUnitRole.HardPoint => 140.0,
            _ => 40.0
        };
        double heightOffset = role == GroundUnitRole.SoftVehicle ? 1.2 : 0.4;
        string id = $"ground.{faction.ToString().ToLowerInvariant()}.{role.ToString().ToLowerInvariant()}.{_nextUnitSerial++:D3}";
        var unit = new GroundUnit(
            id,
            faction,
            role,
            maxHealth,
            new Vec3D(east, surface.HeightM + heightOffset, north),
            intent,
            site.Id);
        _units.Add(unit);
        PushEvent("spawn", unit.Id, site.Id, faction, unit.PositionWorldM);
    }

    void PushEvent(
        string kind,
        string? unitId,
        string? siteId,
        GroundFaction? faction,
        in Vec3D positionWorldM)
    {
        if (_recentEvents.Count >= 24) return;
        _recentEvents.Add(new GroundWarEvent(
            _authorityTick, kind, unitId, siteId, faction, positionWorldM));
    }

    static List<ContestedSite> BuildSites(
        CobraCanyonDefinition definition,
        ITerrainSurface terrain)
    {
        var sites = new List<ContestedSite>();
        foreach (string landmarkId in ContestedLandmarkIds) {
            CobraCanyonLandmarkDefinition landmark = definition.Landmarks.First(candidate =>
                string.Equals(candidate.Id, landmarkId, StringComparison.Ordinal));
            if (!terrain.TrySample(landmark.EastM, landmark.NorthM, out TerrainSample surface))
                throw new InvalidOperationException($"Site '{landmarkId}' has no terrain.");
            string siteId = landmarkId.Replace("landmark.cobra-canyon.", "site.", StringComparison.Ordinal);
            sites.Add(new ContestedSite(
                siteId,
                landmark.Id,
                landmark.Label,
                new Vec3D(landmark.EastM, surface.HeightM, landmark.NorthM),
                captureRadiusM: 220.0));
        }
        return sites;
    }

    static double HorizontalDistanceSquared(in Vec3D a, in Vec3D b)
    {
        double east = a.X - b.X;
        double north = a.Z - b.Z;
        return east * east + north * north;
    }
}
