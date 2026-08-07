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
    // Provisional balance, not sourced doctrine: the ground war must NEED the Cobra. Hostile
    // assault waves land on a fixed cadence and the friendly garrison gets no automatic
    // reinforcements, so without effective fire support the basin tips hostile and the mission
    // is lost. Each wave is 1 soft vehicle + 2 infantry clumps (4.2 combat power, 170 unit
    // health ~= 310 turret rounds at 0.55 damage/round) assaulting the weakest defended site;
    // a site garrison grinds at ~6.6 dps, so the ~17 power/minute inflow drowns it unless the
    // turret is killing pushers. The first wave lands early so friendly control never has a
    // hostile-free window in which it could self-climb toward the victory threshold.
    public const double HostileWaveIntervalSeconds = 15.0;
    public const double FirstHostileWaveDelaySeconds = 5.0;
    public const int HostileWaveSoftVehicles = 1;
    public const int HostileWaveInfantryClumps = 2;
    // Hostile seed/wave rings stay outside the authored M134 min-solution window so an
    // aircraft over a contested site can authorize fire before mutual ground combat clears the
    // wave. Friendlies remain on the pad. See docs/airframes/ah-1g-cobra/00-sources.md.
    public const double HostileSeedInfantryRingM = 170.0;
    public const double HostileSeedSoftVehicleRingM = 200.0;
    public const double HostileWaveRingM = 160.0;
    /// <summary>
    /// Standing gunnery seam placed on the aircraft nose at mission start so the crew chain
    /// (Tab → acquire → hold F → rounds away) is reachable for the whole sortie. Site-seeded
    /// hostiles at the departure pad live ~20 s before the garrison kills them, and every other
    /// hostile sits outside the 2 km gun window — which is why fire_authorized stayed at 0%.
    /// </summary>
    public const string GunnerySeamUnitId = "ground.hostile.gunnery-seam.000";
    // Mid-envelope (ballistic window 80–2000 m, turret ±110°). 350 m worked in unit tests but
    // left a soft vehicle that Tab often skipped for nearer OOL infantry; 220 m keeps the seam
    // first in nearest-hostile order from the River Gorge spawn hover.
    public const double GunnerySeamRangeM = 220.0;
    public const double WreckRetainSeconds = 12.0;
    /// <summary>Small-arms chatter events per engaged unit per second (presentation only).</summary>
    public const double SmallArmsEventsPerSecond = 2.4;
    public const double PlayerRoundDamage = 0.55;
    public const double VictoryControlThreshold = 0.55;
    public const double VictoryHoldSeconds = 45.0;
    public const double DefeatControlThreshold = -0.75;
    public const double DefeatHoldSeconds = 30.0;
    // The hold timers themselves are wall-clock (see EvaluateHoldTheBridge); these remain as the
    // 120 Hz tick equivalents fixtures use to drive a hold at the airframe rate.
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
    // Per-step scratch, reused. Every phase below needs the living set in a stable order; building
    // it with LivingUnits().OrderBy(...).ToArray() allocated an iterator, a buffer and a string
    // sort on every step, and GoalFor re-enumerated it once per unit on top. At 120 Hz that
    // allocation churn was most of the cost the WASM heap was paying for.
    readonly List<GroundUnit> _livingScratch = new();
    readonly List<double> _damageScratch = new();
    readonly Dictionary<string, ContestedSite> _sitesById = new(StringComparer.Ordinal);
    static readonly Comparison<GroundUnit> ByIdOrdinal =
        (first, second) => string.CompareOrdinal(first.Id, second.Id);
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
    double _friendlyHoldSeconds;
    double _hostileHoldSeconds;
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
        foreach (ContestedSite site in _sites) _sitesById[site.Id] = site;
        CobraCanyonLandmarkDefinition fobLandmark = definition.Landmarks.First(landmark =>
            landmark.Kind == CobraCanyonLandmarkKind.ForwardOperatingBase);
        if (!terrain.TrySample(fobLandmark.EastM, fobLandmark.NorthM, out TerrainSample fobSurface))
            throw new InvalidOperationException("FOB has no terrain datum.");
        _fob = new FobResupplyZone(
            new Vec3D(fobLandmark.EastM, fobSurface.HeightM, fobLandmark.NorthM),
            radiusM: 55.0,
            maxClearanceM: 9.0);
        _reinforceAccumulatorSeconds = HostileWaveIntervalSeconds - FirstHostileWaveDelaySeconds;
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
        Math.Clamp(_friendlyHoldSeconds / VictoryHoldSeconds, 0.0, 1.0);
    public double DefeatHoldProgress =>
        Math.Clamp(_hostileHoldSeconds / DefeatHoldSeconds, 0.0, 1.0);

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

    /// <summary>Refill the reusable living-unit scratch in the stable ordinal-id order every
    /// combat phase depends on. Allocation-free after the first few steps.</summary>
    List<GroundUnit> RefreshLivingScratch()
    {
        _livingScratch.Clear();
        foreach (GroundUnit unit in _units)
            if (unit.IsAlive) _livingScratch.Add(unit);
        _livingScratch.Sort(ByIdOrdinal);
        return _livingScratch;
    }

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

    // Wall-clock, not a count of Advance calls: the mission runtime batches this runtime to a
    // strategic cadence (CobraMissionRuntime.GroundWarStepHz), so a tick-counted 45 s hold would
    // silently become a four-and-a-half-minute one.
    void EvaluateHoldTheBridge(double dtSeconds)
    {
        if (_balance.Control >= VictoryControlThreshold) {
            _friendlyHoldSeconds += dtSeconds;
            _hostileHoldSeconds = 0.0;
        } else if (_balance.Control <= DefeatControlThreshold) {
            _hostileHoldSeconds += dtSeconds;
            _friendlyHoldSeconds = 0.0;
        } else {
            _friendlyHoldSeconds = 0.0;
            _hostileHoldSeconds = 0.0;
        }

        if (_friendlyHoldSeconds + 1e-9 >= VictoryHoldSeconds) {
            _missionOutcome = HoldTheBridgeOutcome.Victory;
            _missionOutcomeReason = "held-bridge";
            _recentEvents.Add(new GroundWarEvent(
                _authorityTick,
                "mission-victory",
                null,
                null,
                GroundFaction.Friendly,
                _fob.CentreWorldM));
        } else if (_hostileHoldSeconds + 1e-9 >= DefeatHoldSeconds) {
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
        // Snapshot living set so mutual damage is order-stable. Damage accumulates into a
        // parallel index-aligned buffer rather than a per-step dictionary keyed on unit ids.
        List<GroundUnit> living = RefreshLivingScratch();
        _damageScratch.Clear();
        for (int index = 0; index < living.Count; index++) _damageScratch.Add(0.0);

        // Small-arms chatter is presentation, so its rate is per SECOND, not per step: at the old
        // 120 Hz coupling a flat 0.02-per-step probability meant 2.4 events/s per engaged unit.
        double smallArmsChance = Math.Min(1.0, SmallArmsEventsPerSecond * dtSeconds);
        for (int attackerIndex = 0; attackerIndex < living.Count; attackerIndex++) {
            GroundUnit attacker = living[attackerIndex];
            int victimIndex = -1;
            double bestRangeSq = attacker.EngagementRangeM * attacker.EngagementRangeM;
            for (int candidateIndex = 0; candidateIndex < living.Count; candidateIndex++) {
                GroundUnit candidate = living[candidateIndex];
                if (candidate.Faction == attacker.Faction) continue;
                double rangeSq = HorizontalDistanceSquared(
                    attacker.PositionWorldM, candidate.PositionWorldM);
                if (rangeSq > bestRangeSq) continue;
                if (victimIndex >= 0 && rangeSq >= bestRangeSq) continue;
                bestRangeSq = rangeSq;
                victimIndex = candidateIndex;
            }
            if (victimIndex < 0) continue;
            _damageScratch[victimIndex] += attacker.DamagePerSecond * dtSeconds;
            if (_rng.NextDouble() < smallArmsChance)
                PushEvent("small-arms", attacker.Id, attacker.HomeSiteId, attacker.Faction,
                    attacker.PositionWorldM);
        }

        for (int index = 0; index < living.Count; index++) {
            double amount = _damageScratch[index];
            if (amount <= 0.0) continue;
            GroundUnit unit = living[index];
            // The standing gunnery seam is for the crew chain: friendlies must not erase it
            // before the player can designate and fire. Player rounds still apply via TryFire.
            if (IsGunnerySeam(unit) && amount > 0.0) {
                // Zero out only the portion that came from friendlies by skipping all mutual
                // damage to the seam — ground AI cannot clear the player's shootable mark.
                continue;
            }
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
        List<GroundUnit> living = RefreshLivingScratch();
        foreach (GroundUnit unit in living) {
            if (unit.MoveSpeedMps <= 1e-9) continue;

            Vec3D goal = GoalFor(unit, living);
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

    Vec3D GoalFor(GroundUnit unit, List<GroundUnit> living)
    {
        // Prefer nearest living enemy; otherwise push along balance toward the next contested site.
        GroundUnit? enemy = null;
        double best = double.PositiveInfinity;
        foreach (GroundUnit candidate in living) {
            if (candidate.Faction == unit.Faction) continue;
            double rangeSq = HorizontalDistanceSquared(unit.PositionWorldM, candidate.PositionWorldM);
            if (rangeSq >= best) continue;
            best = rangeSq;
            enemy = candidate;
        }
        if (enemy is not null && (unit.Intent == GroundUnitIntent.EngageNearest
            || best <= unit.EngagementRangeM * unit.EngagementRangeM * 2.25))
            return enemy.PositionWorldM;

        ContestedSite home = _sitesById[unit.HomeSiteId];
        if (unit.Intent is GroundUnitIntent.Hold or GroundUnitIntent.EngageNearest)
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
        List<GroundUnit> living = RefreshLivingScratch();
        foreach (ContestedSite site in _sites) {
            double friendly = 0.0;
            double hostile = 0.0;
            foreach (GroundUnit unit in living) {
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
        double friendly = 0.0;
        double hostile = 0.0;
        foreach (GroundUnit unit in _units) {
            if (!unit.IsAlive) continue;
            if (unit.Faction == GroundFaction.Friendly) friendly += unit.CombatPower;
            else hostile += unit.CombatPower;
        }
        _balance.Drift(friendly, hostile, dtSeconds);
    }

    void MaybeReinforce(double dtSeconds)
    {
        // Hostile pressure only: the friendly garrison is finite (what you are defending);
        // hostile assault waves keep coming.
        _reinforceAccumulatorSeconds += dtSeconds;
        if (_reinforceAccumulatorSeconds < HostileWaveIntervalSeconds)
            return;
        _reinforceAccumulatorSeconds = 0.0;

        // Assault the weakest still-defended site so the wave always finds a fight; once every
        // garrison is gone any site will do (the basin is already falling).
        ContestedSite site = _sites
            .Where(candidate => LivingUnits().Any(unit =>
                unit.Faction == GroundFaction.Friendly
                && HorizontalDistanceSquared(unit.PositionWorldM, candidate.PositionWorldM)
                    <= candidate.CaptureRadiusM * candidate.CaptureRadiusM))
            .OrderBy(candidate => candidate.LocalControl)
            .FirstOrDefault()
            ?? _sites.OrderBy(candidate => candidate.LocalControl).First();
        int wave = 0;
        for (int index = 0; index < HostileWaveSoftVehicles && LivingUnits().Count() < MaxLivingUnits; index++)
            SpawnUnit(GroundFaction.Hostile, GroundUnitRole.SoftVehicle, site,
                GroundUnitIntent.EngageNearest, HostileWaveRingM + wave++ * 20.0);
        for (int index = 0; index < HostileWaveInfantryClumps && LivingUnits().Count() < MaxLivingUnits; index++)
            SpawnUnit(GroundFaction.Hostile, GroundUnitRole.InfantryClump, site,
                GroundUnitIntent.EngageNearest, HostileWaveRingM + wave++ * 20.0);
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

            // No seeded hostile hard points: the attackers are the moving wave targets the
            // turret exists to kill; static hostile armor would outrange the garrison forever.
            // Place hostiles on the basin-facing side of each site (±~35°) so a River Gorge
            // spawn looking into the gorge has gun-reachable marks instead of permanent
            // OutOfLimits flanks (Build 267 owner flight).
            double yawTowardBasin = Math.Atan2(
                -site.PositionWorldM.X, -site.PositionWorldM.Z);
            SpawnUnit(GroundFaction.Hostile, GroundUnitRole.InfantryClump, site,
                GroundUnitIntent.EngageNearest, ringM: HostileSeedInfantryRingM,
                bearingRad: BearingFromAircraftYaw(yawTowardBasin + 0.55));
            SpawnUnit(GroundFaction.Hostile, GroundUnitRole.SoftVehicle, site,
                GroundUnitIntent.EngageNearest, ringM: HostileSeedSoftVehicleRingM,
                bearingRad: BearingFromAircraftYaw(yawTowardBasin - 0.55));
        }
        UpdateSiteControl();
        DriftBalance(PlayerVehicleContract.FixedDeltaSeconds);
    }

    /// <summary>
    /// SpawnUnit rings use math bearing (east = cos θ, north = sin θ). Aircraft yaw uses
    /// aviation heading (east = sin ψ, north = cos ψ). Convert so approach-relative seeds
    /// land on the nose of a spawn looking ψ.
    /// </summary>
    static double BearingFromAircraftYaw(double yawRad) =>
        Math.Atan2(Math.Cos(yawRad), Math.Sin(yawRad));

    /// <summary>
    /// Places one soft vehicle on the aircraft nose inside the M28A1 envelope and ballistic
    /// window, immune to friendly mutual combat, so designation→fire is always possible from
    /// the spawn hover. Called once from CobraMissionRuntime after the vehicle pose is known.
    /// </summary>
    public GroundUnit SeedStandingGunneryTarget(
        in Vec3D aircraftPositionWorldM,
        double aircraftYawRad)
    {
        if (!aircraftPositionWorldM.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(aircraftPositionWorldM));
        if (!double.IsFinite(aircraftYawRad))
            throw new ArgumentOutOfRangeException(nameof(aircraftYawRad));
        if (_units.Any(unit => unit.Id == GunnerySeamUnitId))
            return _units.First(unit => unit.Id == GunnerySeamUnitId);

        // Keep look-down inside the M28A1 envelope (−50°). A seam planted at fixed 220 m on a
        // gorge floor under a high spawn reads OutOfLimits forever (owner Build 270: 87%).
        double aircraftX = aircraftPositionWorldM.X;
        double aircraftY = aircraftPositionWorldM.Y;
        double aircraftZ = aircraftPositionWorldM.Z;
        double rangeM = GunnerySeamRangeM;
        TerrainSample surface = default;
        double seamEast = 0.0;
        double seamNorth = 0.0;
        for (int attempt = 0; attempt < 8; attempt++) {
            seamEast = aircraftX + Math.Sin(aircraftYawRad) * rangeM;
            seamNorth = aircraftZ + Math.Cos(aircraftYawRad) * rangeM;
            if (!_terrain.TrySample(seamEast, seamNorth, out surface)) {
                seamEast = aircraftX;
                seamNorth = aircraftZ + rangeM;
                if (!_terrain.TrySample(seamEast, seamNorth, out surface))
                    throw new InvalidOperationException(
                        "Gunnery seam has no terrain datum ahead of the aircraft.");
            }
            var candidate = new Vec3D(seamEast, surface.HeightM + 1.2, seamNorth);
            var assessment = CobraGunTargeting.Assess(
                new Vec3D(aircraftX, aircraftY, aircraftZ),
                aircraftYawRad,
                candidate);
            if (assessment.WithinTurretEnvelope && assessment.HasBallisticSolution)
                break;
            rangeM = Math.Min(
                CobraGunTargeting.MaximumSolutionRangeM - 50.0,
                Math.Max(rangeM * 1.35, assessment.RangeM + 40.0));
        }

        ContestedSite home = _sites
            .OrderBy(site => HorizontalDistanceSquared(
                site.PositionWorldM, new Vec3D(seamEast, surface.HeightM, seamNorth)))
            .First();
        var unit = new GroundUnit(
            GunnerySeamUnitId,
            GroundFaction.Hostile,
            GroundUnitRole.SoftVehicle,
            maxHealth: 120.0,
            new Vec3D(seamEast, surface.HeightM + 1.2, seamNorth),
            GroundUnitIntent.Hold,
            home.Id);
        _units.Add(unit);
        PushEvent("spawn", unit.Id, home.Id, GroundFaction.Hostile, unit.PositionWorldM);
        return unit;
    }

    static bool IsGunnerySeam(GroundUnit unit) =>
        string.Equals(unit.Id, GunnerySeamUnitId, StringComparison.Ordinal);

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
