using GunsOnly.Sim.Environment;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Cobra.GroundWar;

/// <summary>
/// Deterministic ground war for Cobra Canyon: contested sites, mutual unit combat, control
/// balance, finite turret magazine, and Camp Ember rearm. Epistemic: fiction/provisional.
/// </summary>
public sealed class CobraGroundWarRuntime
{
    // Thirty-six moving/capturing combatants plus the three authored, killable DShK sites.
    public const int MaxLivingUnits = 39;
    // Provisional balance, not sourced doctrine: the ground war must NEED the Cobra. Hostile
    // assault waves land on a fixed cadence and the friendly garrison gets no automatic
    // reinforcements, so without effective fire support the basin tips hostile and the mission
    // is lost. Each wave is 1 soft vehicle + 2 infantry clumps (4.2 combat power, 170 unit
    // health ~= 310 turret rounds at 0.55 damage/round) assaulting the weakest defended site;
    // a site garrison grinds at ~6.6 dps, so the ~17 power/minute inflow drowns it unless the
    // turret is killing pushers. The first wave lands early so friendly control never has a
    // hostile-free window in which it could self-climb toward the victory threshold.
    public const double HostileWaveIntervalSeconds = 15.0;
    // Ember Run Depart is a friendly pad departure — do not open under fire. A short quiet
    // window covers lift-off; longer delays let the garrison self-win before waves arrive
    // (ZeroInputGroundWarLosesTheBasinWithoutFireSupport).
    public const double FirstHostileWaveDelaySeconds = 22.0;
    // Slower than the hostile wave (15 s) and one clump per held point, so holding compounds
    // without ever outrunning the pressure. See MaybeReinforceFriendly.
    public const double FriendlyReinforceIntervalSeconds = 25.0;
    public const double FriendlyReinforceRingM = 40.0;
    /// <summary>
    /// Consolidation, not a garrison arms race. Reinforcement is uncapped in principle and
    /// competes with hostile waves for the same MaxLivingUnits budget, so a player holding three
    /// points measurably grew the friendly force to the global cap and starved the waves — the
    /// mission got easier the better you were doing. Friendly bodies stop here; the remaining
    /// headroom belongs to the pressure.
    /// </summary>
    public const int FriendlyReinforceMaxLiving = 18;
    /// <summary>
    /// Air-mobile insertion delay. The capture force is otherwise NOT renewable: the only
    /// friendly units with Advance intent are seeded at startup, reinforcements Hold their own
    /// points, and the corridor is far too wide to walk. So once the initial attackers at a
    /// hostile site are dead, breaking its garrison leaves nobody inside the radius and the
    /// empty-site rule freezes that point hostile forever — the player does the one job only
    /// they can do and the point still never flips. A cleared point gets troops lifted in.
    /// </summary>
    public const double AirMobileInsertionSeconds = 20.0;
    /// <summary>
    /// A conquest board can sit even, and an even board bleeds nobody. Without a limit a stable
    /// 2-2 runs forever. See the scoring in BleedTickets.
    /// </summary>
    public const double MissionTimeLimitSeconds = 600.0;
    public const int HostileWaveSoftVehicles = 1;
    public const int HostileWaveInfantryClumps = 2;
    // Hostile seed/wave rings stay outside the authored M134 min-solution window so an
    // aircraft over a contested site can authorize fire before mutual ground combat clears the
    // wave. Friendlies remain on the pad. See docs/airframes/ah-1g-cobra/00-sources.md.
    public const double HostileSeedInfantryRingM = 170.0;
    public const double HostileSeedSoftVehicleRingM = 200.0;
    public const double HostileWaveRingM = 160.0;
    /// <summary>
    /// Standing gunnery seam down the departure heading so the crew chain
    /// (Tab → acquire → hold F → rounds away) stays reachable after takeoff. It must NOT sit
    /// in the pad ring — Camp Ember is a friendly Depart, not a knife-fight spawn.
    /// </summary>
    public const string GunnerySeamUnitId = "ground.hostile.gunnery-seam.000";
    /// <summary>
    /// Every hostile-held point opens with one hard point standing ON the point. Nothing in the
    /// ownership rule knows what a "garrison" is — it is simply a hostile body inside the capture
    /// radius, which makes the point permanently contested until the gunship kills it.
    /// </summary>
    public const string GarrisonUnitIdSuffix = ".garrison";
    public static string GarrisonUnitId(string siteId) => siteId + GarrisonUnitIdSuffix;
    // Mid/far envelope (ballistic window 80–2000 m). Seeded on Ingress after the pad cold open
    // so Tab→F stays reachable once the aircraft is flying the gorge, not on the ramp.
    public const double GunnerySeamRangeM = 950.0;
    public const double WreckRetainSeconds = 28.0;
    /// <summary>Small-arms chatter events per engaged unit per second (presentation only).</summary>
    public const double SmallArmsEventsPerSecond = 2.4;
    public const double PlayerRoundDamage = 0.55;
    /// <summary>20 s to flip an uncontested point. The Cobra never captures — only ground units
    /// occupy — so this is the clock the player's rounds buy time on.</summary>
    public const double CaptureRatePerSecond = 1.0 / 20.0;
    /// <summary>
    /// Conquest tickets. The battle is decided here, not by the control number: the side holding
    /// fewer points bleeds in proportion to the deficit, so taking and keeping ground is the only
    /// way to win. An even split bleeds nobody, which is what makes a stalemate a stalemate.
    /// </summary>
    public const double StartingTickets = 300.0;
    public const double TicketBleedPerSecondPerPoint = 0.5;
    // Control is now a derived READOUT only (HUD label, telemetry, debrief peaks). These
    // thresholds survive because the bridge and the lab HUD publish them to colour that readout;
    // nothing in this file gates an outcome on them any more.
    public const double VictoryControlThreshold = 0.55;
    public const double DefeatControlThreshold = -0.75;

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
    /// <summary>
    /// Presentation chatter draws from its OWN stream. Small-arms events are sampled once per
    /// engaged attacker per Advance, so sharing `_rng` with hostile-wave bearings made the wave
    /// RNG offset a function of STEP RATE: the same seed advanced to the same elapsed time at
    /// 10 Hz and 20 Hz reached reinforcement with different offsets, spawning waves in different
    /// places and changing engagements, capture timing, tickets and potentially the winner. A
    /// cosmetic event must never be able to move the outcome.
    /// </summary>
    readonly Random _chatterRng;
    int _nextUnitSerial;
    double _reinforceAccumulatorSeconds;
    double _friendlyReinforceAccumulatorSeconds;
    readonly Dictionary<string, double> _airMobileTimerSeconds = new(StringComparer.Ordinal);
    double _elapsedSeconds;
    int _hostileKillsByPlayer;
    int _friendlyKillsByPlayer;
    int _fobRearmCount;
    int _roundsExpended;
    long _authorityTick;
    double _friendlyTickets = StartingTickets;
    double _hostileTickets = StartingTickets;
    HoldTheBridgeOutcome _missionOutcome = HoldTheBridgeOutcome.Pending;
    string _missionOutcomeReason = "";
    double? _forcedControlForTests;
    readonly Dictionary<string, (int Friendly, int Hostile)> _forcedOccupancyForTests =
        new(StringComparer.Ordinal);

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
        _chatterRng = new Random((seed ?? 19_680_701) ^ 0x5f3a_1c07);
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
        SeedAirThreatSites(definition);
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
    public double FriendlyTickets => _friendlyTickets;
    public double HostileTickets => _hostileTickets;
    public int FriendlyPointsHeld =>
        _sites.Count(site => site.Owner == GroundSiteOwner.Friendly);
    public int HostilePointsHeld =>
        _sites.Count(site => site.Owner == GroundSiteOwner.Hostile);
    // Kept as properties, redefined against tickets: the mission act ladder and the HUD both read
    // these as "how close is this to being over", which is now a ticket question.
    public double VictoryHoldProgress =>
        Math.Clamp(1.0 - _hostileTickets / StartingTickets, 0.0, 1.0);
    public double DefeatHoldProgress =>
        Math.Clamp(1.0 - _friendlyTickets / StartingTickets, 0.0, 1.0);

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
            UpdateSiteOwnership(dtSeconds);
            DriftBalance(dtSeconds);
            MaybeReinforce(dtSeconds);
            MaybeReinforceFriendly(dtSeconds);
            MaybeInsertAirMobile(dtSeconds);
            if (_forcedControlForTests is double forced)
                _balance.OverrideControl(forced);
            BleedTickets(dtSeconds);
        }
        _authorityTick++;
    }

    /// <summary>
    /// Wall-clock, not a count of Advance calls: the mission runtime batches this runtime to a
    /// strategic cadence (CobraMissionRuntime.GroundWarStepHz), so a tick-counted bleed would run
    /// an order of magnitude slow. The side down on points bleeds in proportion to the deficit;
    /// an even split bleeds nobody.
    /// </summary>
    void BleedTickets(double dtSeconds)
    {
        int friendlyPoints = FriendlyPointsHeld;
        int hostilePoints = HostilePointsHeld;
        int friendlyDeficit = hostilePoints - friendlyPoints;
        int hostileDeficit = friendlyPoints - hostilePoints;
        if (friendlyDeficit > 0)
            _friendlyTickets = Math.Max(
                0.0,
                _friendlyTickets - TicketBleedPerSecondPerPoint * friendlyDeficit * dtSeconds);
        if (hostileDeficit > 0)
            _hostileTickets = Math.Max(
                0.0,
                _hostileTickets - TicketBleedPerSecondPerPoint * hostileDeficit * dtSeconds);

        // A stalemate has to end. Bleed is driven purely by the point deficit, so an even split
        // drains nobody and a stable 2-2 board runs forever — unwinnable and unlosable at the
        // same time, which is the one outcome a conquest mission must not have. At the limit the
        // board is scored: more points wins, then more tickets, and a dead heat is a Defeat
        // because failing to break a stalemate is not winning.
        if (_elapsedSeconds >= MissionTimeLimitSeconds) {
            bool won = friendlyPoints > hostilePoints
                || (friendlyPoints == hostilePoints && _friendlyTickets > _hostileTickets);
            _missionOutcome = won ? HoldTheBridgeOutcome.Victory : HoldTheBridgeOutcome.Defeat;
            _missionOutcomeReason = "time-limit";
            _recentEvents.Add(new GroundWarEvent(
                _authorityTick,
                won ? "mission-victory" : "mission-defeat",
                null,
                null,
                won ? GroundFaction.Friendly : GroundFaction.Hostile,
                _fob.CentreWorldM));
            return;
        }

        if (_hostileTickets <= 0.0) {
            _missionOutcome = HoldTheBridgeOutcome.Victory;
            _missionOutcomeReason = "tickets-exhausted";
            _recentEvents.Add(new GroundWarEvent(
                _authorityTick,
                "mission-victory",
                null,
                null,
                GroundFaction.Friendly,
                _fob.CentreWorldM));
        } else if (_friendlyTickets <= 0.0) {
            _missionOutcome = HoldTheBridgeOutcome.Defeat;
            _missionOutcomeReason = "tickets-exhausted";
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

    /// <summary>The FOB zone test alone — shared by rearm and the airframe-swap loop.</summary>
    public bool IsInsideFob(in Vec3D cobraPositionWorldM) =>
        _terrain.TrySample(
            cobraPositionWorldM.X, cobraPositionWorldM.Z, out TerrainSample fobSurface)
        && _fob.Contains(cobraPositionWorldM, fobSurface.HeightM);

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
            if (!attacker.ParticipatesInGroundCombat) continue;
            int victimIndex = -1;
            double bestRangeSq = attacker.EngagementRangeM * attacker.EngagementRangeM;
            for (int candidateIndex = 0; candidateIndex < living.Count; candidateIndex++) {
                GroundUnit candidate = living[candidateIndex];
                if (candidate.Faction == attacker.Faction) continue;
                if (!candidate.ParticipatesInGroundCombat) continue;
                double rangeSq = HorizontalDistanceSquared(
                    attacker.PositionWorldM, candidate.PositionWorldM);
                if (rangeSq > bestRangeSq) continue;
                if (victimIndex >= 0 && rangeSq >= bestRangeSq) continue;
                bestRangeSq = rangeSq;
                victimIndex = candidateIndex;
            }
            if (victimIndex < 0) continue;
            _damageScratch[victimIndex] += attacker.DamagePerSecond * dtSeconds;
            if (_chatterRng.NextDouble() < smallArmsChance)
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
            // A dug-in garrison is an air problem. Ground units shoot at it and achieve nothing;
            // only the turret can break the point open. See GroundUnit.IsFortified.
            if (unit.IsFortified) continue;
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
            if (!candidate.ParticipatesInGroundCombat) continue;
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

        // Advance on the nearest point the OTHER side holds. Conquest gives "forward" a real
        // definition, so the previous heuristic — score sites by `X + Z` and nudge by
        // LocalControl — is now simply wrong: it expressed a fixed diagonal preference in world
        // space, which meant a unit could walk away from the only contested point on the board.
        // Iron Bell measurably never fell under a competent scripted gunner because of it.
        GroundSiteOwner enemyOwner = unit.Faction == GroundFaction.Friendly
            ? GroundSiteOwner.Hostile
            : GroundSiteOwner.Friendly;
        ContestedSite? next = null;
        double nearestSq = double.PositiveInfinity;
        foreach (ContestedSite site in _sites) {
            if (site.Owner != enemyOwner) continue;
            double rangeSq = HorizontalDistanceSquared(unit.PositionWorldM, site.PositionWorldM);
            if (rangeSq >= nearestSq) continue;
            nearestSq = rangeSq;
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
                if (!unit.ParticipatesInGroundCombat) continue;
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

    /// <summary>
    /// Conquest ownership. The rule is deliberately narrow and has no special cases: a point moves
    /// ONLY while exactly one faction stands inside its capture radius. Both factions present
    /// (the garrison case) freezes progress; nobody present freezes progress. That is why a
    /// hostile garrison stalls a friendly push, and why killing it — the only thing the Cobra can
    /// do here — is what breaks the stall.
    /// </summary>
    void UpdateSiteOwnership(double dtSeconds)
    {
        List<GroundUnit> living = RefreshLivingScratch();
        foreach (ContestedSite site in _sites) {
            int friendly;
            int hostile;
            if (_forcedOccupancyForTests.TryGetValue(site.Id, out (int Friendly, int Hostile) pinned)) {
                friendly = pinned.Friendly;
                hostile = pinned.Hostile;
            } else {
                friendly = 0;
                hostile = 0;
                foreach (GroundUnit unit in living) {
                    if (!unit.ParticipatesInGroundCombat) continue;
                    if (HorizontalDistanceSquared(unit.PositionWorldM, site.PositionWorldM)
                        > site.CaptureRadiusM * site.CaptureRadiusM)
                        continue;
                    if (unit.Faction == GroundFaction.Friendly) friendly++;
                    else hostile++;
                }
            }

            bool contested = friendly > 0 && hostile > 0;
            if (contested || (friendly == 0 && hostile == 0)) {
                // Progress HOLDS. Ownership can never change with nobody standing in the point.
                site.SetOwnership(site.Owner, site.CaptureProgress, contested);
                continue;
            }

            GroundSiteOwner present = friendly > 0 ? GroundSiteOwner.Friendly : GroundSiteOwner.Hostile;
            double step = CaptureRatePerSecond * dtSeconds;
            if (present == site.Owner) {
                // A defended point recovers toward zero.
                site.SetOwnership(site.Owner, Math.Max(0.0, site.CaptureProgress - step), false);
                continue;
            }

            double progress = site.CaptureProgress + step;
            if (progress + 1e-12 >= 1.0) {
                site.SetOwnership(present, 0.0, false);
                PushEvent(
                    "site-captured",
                    null,
                    site.Id,
                    present == GroundSiteOwner.Friendly ? GroundFaction.Friendly : GroundFaction.Hostile,
                    site.PositionWorldM);
            } else {
                site.SetOwnership(site.Owner, progress, false);
            }
        }
    }

    /// <summary>Test/fixture helper — seeds a friendly push into a site's capture radius.</summary>
    public void SeedFriendlyPushForTests(string siteId, int infantryClumps)
    {
        if (!_sitesById.TryGetValue(siteId, out ContestedSite? site))
            throw new ArgumentException($"Unknown site '{siteId}'.", nameof(siteId));
        if (infantryClumps <= 0)
            throw new ArgumentOutOfRangeException(nameof(infantryClumps));

        // Evenly spaced deterministic bearings — never the rng, which the seeded order depends on.
        for (int index = 0; index < infantryClumps; index++)
            SpawnUnit(GroundFaction.Friendly, GroundUnitRole.InfantryClump, site,
                GroundUnitIntent.Advance, ringM: 60.0,
                bearingRad: index * (Math.PI * 2.0 / infantryClumps));
    }

    /// <summary>Test/fixture helper — pins occupancy counts for a site. Sticky across Advance.</summary>
    public void OverrideSiteOccupancyForTests(string siteId, int friendly, int hostile)
    {
        if (string.IsNullOrWhiteSpace(siteId))
            throw new ArgumentException("Site id is required.", nameof(siteId));
        if (friendly < 0) throw new ArgumentOutOfRangeException(nameof(friendly));
        if (hostile < 0) throw new ArgumentOutOfRangeException(nameof(hostile));
        _forcedOccupancyForTests[siteId] = (friendly, hostile);
    }

    void DriftBalance(double dtSeconds)
    {
        double friendly = 0.0;
        double hostile = 0.0;
        foreach (GroundUnit unit in _units) {
            if (!unit.IsAlive) continue;
            if (!unit.ParticipatesInGroundCombat) continue;
            if (unit.Faction == GroundFaction.Friendly) friendly += unit.CombatPower;
            else hostile += unit.CombatPower;
        }
        _balance.Drift(friendly, hostile, dtSeconds);
    }

    /// <summary>
    /// Conquest reinforcement: every point you hold pays you infantry, on a slower cadence than
    /// the hostile wave. Without this the promise the objective strip makes to the player —
    /// clear the garrison and friendlies will take the point — is unkeepable in the back half of
    /// a sortie: the seeded friendly force is finite, falls from 12 bodies to 4 by t=200 s, and
    /// then nobody is left to walk onto a point the player has just opened. Iron Bell measurably
    /// stayed hostile forever under a competent scripted gunner for exactly that reason.
    /// Holding is therefore compounding, which is what makes the tide legible on the map.
    /// </summary>
    /// <summary>
    /// Lifts a rifle squad onto a hostile point the player has cleared — no living garrison and
    /// no living friendly inside the radius — after <see cref="AirMobileInsertionSeconds"/>. The
    /// timer is per site and resets the moment the point stops qualifying, so it cannot bank
    /// progress across a re-garrisoned or re-contested point.
    ///
    /// This is what makes "kill the garrison and friendlies will take the point" a true
    /// statement rather than an aspiration; without it a cleared point far from the line simply
    /// froze hostile forever. Vietnam-correct too: you clear the LZ, then the slicks come in.
    /// </summary>
    void MaybeInsertAirMobile(double dtSeconds)
    {
        foreach (ContestedSite site in _sites) {
            if (site.Owner != GroundSiteOwner.Hostile) {
                _airMobileTimerSeconds.Remove(site.Id);
                continue;
            }
            // The point must be CLEAR, not merely un-garrisoned. Seeded pushers sit well inside
            // the 220 m capture radius, so lifting a squad onto a point that still has hostiles
            // on it just re-contests it and freezes the capture again — the insertion has to
            // wait for the same emptiness the ownership rule itself requires.
            bool hostilePresent = false;
            bool friendlyPresent = false;
            double radiusSq = site.CaptureRadiusM * site.CaptureRadiusM;
            foreach (GroundUnit unit in _units) {
                if (!unit.IsAlive) continue;
                if (!unit.ParticipatesInGroundCombat) continue;
                if (HorizontalDistanceSquared(unit.PositionWorldM, site.PositionWorldM) > radiusSq)
                    continue;
                if (unit.Faction == GroundFaction.Friendly) friendlyPresent = true;
                else hostilePresent = true;
            }
            if (hostilePresent || friendlyPresent) {
                _airMobileTimerSeconds.Remove(site.Id);
                continue;
            }

            double elapsed = _airMobileTimerSeconds.GetValueOrDefault(site.Id) + dtSeconds;
            if (elapsed < AirMobileInsertionSeconds) {
                _airMobileTimerSeconds[site.Id] = elapsed;
                continue;
            }
            _airMobileTimerSeconds.Remove(site.Id);
            if (LivingUnits().Count() >= MaxLivingUnits) continue;
            SpawnUnit(GroundFaction.Friendly, GroundUnitRole.InfantryClump, site,
                GroundUnitIntent.Hold, ringM: 24.0, bearingRad: 1.7);
            PushEvent("air-mobile-insertion", null, site.Id, GroundFaction.Friendly,
                site.PositionWorldM);
        }
    }

    void MaybeReinforceFriendly(double dtSeconds)
    {
        _friendlyReinforceAccumulatorSeconds += dtSeconds;
        if (_friendlyReinforceAccumulatorSeconds < FriendlyReinforceIntervalSeconds)
            return;

        int livingFriendly = 0;
        foreach (GroundUnit unit in _units)
            if (unit.IsAlive && unit.Faction == GroundFaction.Friendly) livingFriendly++;

        // Hold the accumulator when the board is full rather than clearing it. Resetting first
        // discarded the entire reinforcement window whenever the cap happened to be saturated at
        // the instant it came due, so a full board silently cost 25 s of consolidation and the
        // loss depended on when the timer landed rather than on the conquest state.
        if (livingFriendly >= FriendlyReinforceMaxLiving || LivingUnits().Count() >= MaxLivingUnits)
            return;
        _friendlyReinforceAccumulatorSeconds = 0.0;

        foreach (ContestedSite site in _sites) {
            if (site.Owner != GroundSiteOwner.Friendly) continue;
            if (livingFriendly >= FriendlyReinforceMaxLiving) return;
            if (LivingUnits().Count() >= MaxLivingUnits) return;
            livingFriendly++;
            // Hold, not Advance. The corridor is kilometres wide — Iron Bell is ~4.5 km from the
            // plantation — so a 2.4 m/s clump ordered to advance spends the whole sortie walking
            // across open ground, arrives at nothing, and meanwhile vacates the point it was
            // sent to consolidate. Reinforcements consolidate; the aircraft is what projects
            // force across the valley. That asymmetry is the mission.
            SpawnUnit(GroundFaction.Friendly, GroundUnitRole.InfantryClump, site,
                GroundUnitIntent.Hold, ringM: FriendlyReinforceRingM, bearingRad: 0.9);
        }
    }

    void MaybeReinforce(double dtSeconds)
    {
        // Hostile pressure: assault waves keep coming regardless of who holds what.
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

            // Camp Ember is the Depart pad: friendlies only. Hostiles open at the contested
            // gorge sites (bridge / plantation / quarry) so the cold open is a takeoff, not a
            // surround. The standing gunnery seam is planted down-route after spawn pose is known.
            if (fob) continue;

            // The garrison: one dug-in hard point standing ON a hostile-held point. It is not a
            // capture rule, it is a body — it keeps both factions inside the radius, so the point
            // stays contested until the Cobra removes it. See UpdateSiteOwnership. Fortified
            // because ground fire alone otherwise cracks it in ~15 s and the player's job
            // evaporates; see GroundUnit.IsFortified.
            if (site.Owner == GroundSiteOwner.Hostile)
                SpawnUnit(GroundFaction.Hostile, GroundUnitRole.HardPoint, site,
                    GroundUnitIntent.Hold, ringM: 0.0, bearingRad: 0.0,
                    unitId: GarrisonUnitId(site.Id), fortified: true);

            // No seeded hostile hard points at secondary sites: the attackers are the moving
            // wave targets the turret exists to kill. Iron Bell is the authored fight — seed a
            // denser destroyable set-piece there (hard point + extra soft skin) so arrival has
            // something to shoot besides three markers.
            bool ironBell = site.LandmarkId.Contains("iron-bell", StringComparison.Ordinal);
            // Place hostiles on the basin-facing side of each site (±~35°) so a River Gorge
            // approach looking into the gorge has gun-reachable marks instead of permanent
            // OutOfLimits flanks (Build 267 owner flight).
            double yawTowardBasin = Math.Atan2(
                -site.PositionWorldM.X, -site.PositionWorldM.Z);
            SpawnUnit(GroundFaction.Hostile, GroundUnitRole.InfantryClump, site,
                GroundUnitIntent.EngageNearest, ringM: HostileSeedInfantryRingM,
                bearingRad: BearingFromAircraftYaw(yawTowardBasin + 0.55));
            SpawnUnit(GroundFaction.Hostile, GroundUnitRole.SoftVehicle, site,
                GroundUnitIntent.EngageNearest, ringM: HostileSeedSoftVehicleRingM,
                bearingRad: BearingFromAircraftYaw(yawTowardBasin - 0.55));
            // Extra infantry on the far ring so removing Camp Ember hostiles does not let the
            // garrison self-climb to victory before waves arrive.
            SpawnUnit(GroundFaction.Hostile, GroundUnitRole.InfantryClump, site,
                GroundUnitIntent.EngageNearest, ringM: HostileSeedInfantryRingM + 40.0,
                bearingRad: BearingFromAircraftYaw(yawTowardBasin + 2.4));
            if (ironBell) {
                SpawnUnit(GroundFaction.Hostile, GroundUnitRole.HardPoint, site,
                    GroundUnitIntent.Hold, ringM: HostileSeedSoftVehicleRingM + 25.0,
                    bearingRad: BearingFromAircraftYaw(yawTowardBasin + 0.15));
                SpawnUnit(GroundFaction.Hostile, GroundUnitRole.SoftVehicle, site,
                    GroundUnitIntent.EngageNearest, ringM: HostileSeedSoftVehicleRingM + 55.0,
                    bearingRad: BearingFromAircraftYaw(yawTowardBasin - 1.1));
                SpawnUnit(GroundFaction.Hostile, GroundUnitRole.InfantryClump, site,
                    GroundUnitIntent.EngageNearest, ringM: HostileSeedInfantryRingM + 70.0,
                    bearingRad: BearingFromAircraftYaw(yawTowardBasin + 1.35));
            }
        }
        UpdateSiteControl();
        DriftBalance(PlayerVehicleContract.FixedDeltaSeconds);
    }

    /// <summary>
    /// Turns each authored masking observer into a real, selectable battlefield gun. Observer
    /// IDs stay identical across line-of-sight, firing evidence and ground-war selection, so a
    /// player kill immediately suppresses that source without browser-side inference. These
    /// emplacements are fortified against mutual ground combat but remain vulnerable to
    /// ApplyAuthorizedFire.
    /// </summary>
    void SeedAirThreatSites(CobraCanyonDefinition definition)
    {
        foreach (CobraCanyonThreatObserverDefinition observer in definition.ThreatObservers) {
            if (!_terrain.TrySample(observer.EastM, observer.NorthM, out TerrainSample surface))
                throw new InvalidOperationException(
                    $"Air-threat site '{observer.Id}' has no terrain datum.");
            Vec3D positionWorldM = new(
                observer.EastM,
                surface.HeightM + observer.ObserverHeightAglM,
                observer.NorthM);
            ContestedSite home = _sites
                .OrderBy(site => HorizontalDistanceSquared(site.PositionWorldM, positionWorldM))
                .First();
            _units.Add(new GroundUnit(
                observer.Id,
                GroundFaction.Hostile,
                GroundUnitRole.DshkSite,
                maxHealth: 105.0,
                positionWorldM,
                GroundUnitIntent.Hold,
                home.Id,
                fortified: true));
            PushEvent("spawn", observer.Id, home.Id, GroundFaction.Hostile, positionWorldM);
        }
    }

    /// <summary>
    /// SpawnUnit rings use math bearing (east = cos θ, north = sin θ). Aircraft yaw uses
    /// aviation heading (east = sin ψ, north = cos ψ). Convert so approach-relative seeds
    /// land on the nose of a spawn looking ψ.
    /// </summary>
    static double BearingFromAircraftYaw(double yawRad) =>
        Math.Atan2(Math.Cos(yawRad), Math.Sin(yawRad));

    /// <summary>
    /// Places one soft vehicle down the aircraft nose inside the M28A1 envelope and ballistic
    /// window, immune to friendly mutual combat, so designation→fire stays reachable after
    /// Depart. Range is intentionally past the pad ring (see GunnerySeamRangeM).
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
        double? bearingRad = null,
        string? unitId = null,
        bool fortified = false)
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
            GroundUnitRole.DshkSite => 105.0,
            _ => 40.0
        };
        double heightOffset = role switch {
            GroundUnitRole.SoftVehicle => 1.2,
            GroundUnitRole.DshkSite => 1.0,
            _ => 0.4,
        };
        string id = unitId
            ?? $"ground.{faction.ToString().ToLowerInvariant()}.{role.ToString().ToLowerInvariant()}.{_nextUnitSerial++:D3}";
        var unit = new GroundUnit(
            id,
            faction,
            role,
            maxHealth,
            new Vec3D(east, surface.HeightM + heightOffset, north),
            intent,
            site.Id,
            fortified);
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
            sites[^1].SetInitialOwner(InitialOwnerFor(siteId));
        }
        return sites;
    }

    /// <summary>
    /// Deterministic opening board: Camp Ember is the friendly FOB / departure pad; the three
    /// gorge sites open in hostile hands, which is the whole point of the mission.
    /// </summary>
    static GroundSiteOwner InitialOwnerFor(string siteId) =>
        string.Equals(siteId, "site.camp-ember.v1", StringComparison.Ordinal)
            ? GroundSiteOwner.Friendly
            : GroundSiteOwner.Hostile;

    static double HorizontalDistanceSquared(in Vec3D a, in Vec3D b)
    {
        double east = a.X - b.X;
        double north = a.Z - b.Z;
        return east * east + north * north;
    }
}
