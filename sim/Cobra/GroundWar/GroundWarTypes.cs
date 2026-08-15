using GunsOnly.Sim.Vehicles;

namespace GunsOnly.Sim.Cobra.GroundWar;

public enum GroundFaction
{
    Friendly,
    Hostile
}

public enum GroundUnitRole
{
    InfantryClump,
    SoftVehicle,
    HardPoint,
    DshkSite
}

public enum GroundUnitIntent
{
    Advance,
    Hold,
    EngageNearest
}

/// <summary>Which faction currently holds a contested site. Conquest ownership, not control drift.</summary>
public enum GroundSiteOwner
{
    Friendly,
    Hostile
}

public enum HoldTheBridgeOutcome
{
    Pending,
    Victory,
    Defeat
}

/// <summary>
/// Fiction/provisional ground combatants for Cobra Canyon legibility. Not sourced vehicle models.
/// </summary>
public sealed class GroundUnit
{
    public GroundUnit(
        string id,
        GroundFaction faction,
        GroundUnitRole role,
        double maxHealth,
        in Vec3D positionWorldM,
        GroundUnitIntent intent,
        string homeSiteId,
        bool fortified = false)
    {
        if (string.IsNullOrWhiteSpace(id))
            throw new ArgumentException("Unit id is required.", nameof(id));
        if (!double.IsFinite(maxHealth) || maxHealth <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(maxHealth));
        if (!positionWorldM.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(positionWorldM));
        if (string.IsNullOrWhiteSpace(homeSiteId))
            throw new ArgumentException("Home site id is required.", nameof(homeSiteId));

        Id = id;
        Faction = faction;
        Role = role;
        MaxHealth = maxHealth;
        Health = maxHealth;
        PositionWorldM = positionWorldM;
        Intent = intent;
        HomeSiteId = homeSiteId;
        IsFortified = fortified;
    }

    public string Id { get; }
    public GroundFaction Faction { get; }
    public GroundUnitRole Role { get; }
    public double MaxHealth { get; }
    public double Health { get; private set; }
    public Vec3D PositionWorldM { get; private set; }
    public GroundUnitIntent Intent { get; set; }
    public string HomeSiteId { get; }
    public bool IsAlive => Health > 1e-9;
    public bool IsWreck => !IsAlive;

    /// <summary>
    /// Dug in: immune to ground-to-ground fire, killable only from the air. This is the
    /// structural reason a conquest point needs the gunship. Without it the friendly units
    /// already seeded at a site grind a 140 hp garrison down in 10-16 s on their own, and the
    /// objective strip's promise ("kill the garrison and friendlies will take the point")
    /// becomes a lie the player watches the AI fulfil. Player rounds arrive through
    /// ApplyAuthorizedFire and are NOT scaled by this.
    /// Friendly hard points remain ordinary ground units. Camp Ember itself is rear-area and is
    /// excluded from hostile wave spawning; the mission's losing side comes from losing the
    /// forward points and bleeding tickets, not from attackers materialising beside the pad.
    /// </summary>
    public bool IsFortified { get; }

    public double CombatPower => Role switch {
        GroundUnitRole.InfantryClump => 1.0,
        GroundUnitRole.SoftVehicle => 2.2,
        GroundUnitRole.HardPoint => 3.0,
        // An AA emplacement pressures the aircraft; it does not capture ground by itself.
        GroundUnitRole.DshkSite => 0.0,
        _ => 1.0
    };

    public bool ParticipatesInGroundCombat => Role != GroundUnitRole.DshkSite;

    public double EngagementRangeM => Role switch {
        GroundUnitRole.InfantryClump => 180.0,
        GroundUnitRole.SoftVehicle => 320.0,
        GroundUnitRole.HardPoint => 520.0,
        GroundUnitRole.DshkSite => 0.0,
        _ => 180.0
    };

    // Provisional balance, not sourced weapon effects: ground-vs-ground fire is attritional
    // (minutes to grind a unit down) so the turret's authored 24.75 dps (45 rps x 0.55
    // damage/round) is the decisive killer. The previous 8/14/22 dps let the garrison wipe a
    // seeded wave in under 10 s, which won the mission with zero player input.
    public double DamagePerSecond => Role switch {
        GroundUnitRole.InfantryClump => 1.2,
        GroundUnitRole.SoftVehicle => 2.2,
        GroundUnitRole.HardPoint => 3.2,
        GroundUnitRole.DshkSite => 0.0,
        _ => 1.2
    };

    public double MoveSpeedMps => Role switch {
        GroundUnitRole.InfantryClump => 2.4,
        GroundUnitRole.SoftVehicle => 7.5,
        GroundUnitRole.HardPoint => 0.0,
        GroundUnitRole.DshkSite => 0.0,
        _ => 2.0
    };

    public void ApplyDamage(double damage)
    {
        if (!double.IsFinite(damage) || damage < 0.0)
            throw new ArgumentOutOfRangeException(nameof(damage));
        if (!IsAlive) return;
        Health = Math.Max(0.0, Health - damage);
    }

    public void SetPosition(in Vec3D positionWorldM)
    {
        if (!positionWorldM.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(positionWorldM));
        PositionWorldM = positionWorldM;
    }
}

public sealed class ContestedSite
{
    public ContestedSite(
        string id,
        string landmarkId,
        string label,
        in Vec3D positionWorldM,
        double captureRadiusM)
    {
        if (string.IsNullOrWhiteSpace(id))
            throw new ArgumentException("Site id is required.", nameof(id));
        if (string.IsNullOrWhiteSpace(landmarkId))
            throw new ArgumentException("Landmark id is required.", nameof(landmarkId));
        if (string.IsNullOrWhiteSpace(label))
            throw new ArgumentException("Label is required.", nameof(label));
        if (!positionWorldM.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(positionWorldM));
        if (!double.IsFinite(captureRadiusM) || captureRadiusM <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(captureRadiusM));

        Id = id;
        LandmarkId = landmarkId;
        Label = label;
        PositionWorldM = positionWorldM;
        CaptureRadiusM = captureRadiusM;
    }

    public string Id { get; }
    public string LandmarkId { get; }
    public string Label { get; }
    public Vec3D PositionWorldM { get; }
    public double CaptureRadiusM { get; }
    public double LocalControl { get; private set; }

    /// <summary>The faction currently holding the point. Conquest truth; LocalControl is a readout.</summary>
    public GroundSiteOwner Owner { get; private set; }

    /// <summary>0..1 — how far the faction that does NOT own this point has come toward flipping
    /// it. Resets to 0 the instant ownership changes.</summary>
    public double CaptureProgress { get; private set; }

    /// <summary>True while living units of BOTH factions stand inside CaptureRadiusM.</summary>
    public bool IsContested { get; private set; }

    public void SetLocalControl(double control)
    {
        if (!double.IsFinite(control))
            throw new ArgumentOutOfRangeException(nameof(control));
        LocalControl = Math.Clamp(control, -1.0, 1.0);
    }

    /// <summary>Assigns the starting owner at construction. Not a capture.</summary>
    public void SetInitialOwner(GroundSiteOwner owner)
    {
        Owner = owner;
        CaptureProgress = 0.0;
        IsContested = false;
    }

    /// <summary>The single per-step ownership mutator the ground-war runtime calls.</summary>
    public void SetOwnership(GroundSiteOwner owner, double progress, bool contested)
    {
        if (!double.IsFinite(progress))
            throw new ArgumentOutOfRangeException(nameof(progress));
        Owner = owner;
        CaptureProgress = Math.Clamp(progress, 0.0, 1.0);
        IsContested = contested;
    }
}

public sealed class ControlBalance
{
    const double MaxAbsControl = 1.0;
    const double DriftGainPerSecond = 0.035;
    const double TrendSmoothingPerSecond = 1.8;

    public double Control { get; private set; }
    public double Trend { get; private set; }
    public double PeakFriendlyControl { get; private set; }
    public double PeakHostileControl { get; private set; }

    /// <summary>Test/fixture helper — not a combat impulse.</summary>
    public void OverrideControl(double control)
    {
        if (!double.IsFinite(control))
            throw new ArgumentOutOfRangeException(nameof(control));
        Control = Math.Clamp(control, -MaxAbsControl, MaxAbsControl);
        PeakFriendlyControl = Math.Max(PeakFriendlyControl, Control);
        PeakHostileControl = Math.Min(PeakHostileControl, Control);
    }

    public void Drift(double friendlyPower, double hostilePower, double dtSeconds)
    {
        RequireNonNegative(friendlyPower, nameof(friendlyPower));
        RequireNonNegative(hostilePower, nameof(hostilePower));
        RequirePositiveDt(dtSeconds);

        double total = friendlyPower + hostilePower;
        double desired = total <= 1e-9
            ? 0.0
            : (friendlyPower - hostilePower) / total;
        double delta = (desired - Control) * DriftGainPerSecond * dtSeconds;
        ApplyDelta(delta, dtSeconds);
    }

    public void ApplyPlayerKillPulse(GroundFaction victimFaction, GroundUnitRole role)
    {
        double magnitude = role switch {
            GroundUnitRole.InfantryClump => 0.04,
            GroundUnitRole.SoftVehicle => 0.08,
            GroundUnitRole.HardPoint => 0.12,
            GroundUnitRole.DshkSite => 0.10,
            _ => 0.04
        };
        // Killing hostiles tips toward friendly (+); killing friendlies tips toward hostile (-).
        double signed = victimFaction == GroundFaction.Hostile ? magnitude : -magnitude;
        ApplyDelta(signed, PlayerVehicleContract.FixedDeltaSeconds);
    }

    void ApplyDelta(double delta, double dtSeconds)
    {
        double previous = Control;
        Control = Math.Clamp(Control + delta, -MaxAbsControl, MaxAbsControl);
        double instantaneous = (Control - previous) / Math.Max(dtSeconds, 1e-6);
        double alpha = 1.0 - Math.Exp(-TrendSmoothingPerSecond * dtSeconds);
        Trend += (instantaneous - Trend) * alpha;
        PeakFriendlyControl = Math.Max(PeakFriendlyControl, Control);
        PeakHostileControl = Math.Min(PeakHostileControl, Control);
    }

    static void RequireNonNegative(double value, string name)
    {
        if (!double.IsFinite(value) || value < 0.0)
            throw new ArgumentOutOfRangeException(name);
    }

    static void RequirePositiveDt(double dtSeconds)
    {
        if (!double.IsFinite(dtSeconds) || dtSeconds <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(dtSeconds));
    }
}

public sealed class CobraTurretMagazine
{
    public const int DefaultCapacityRounds = 900;
    public const double DefaultFireRateRoundsPerSecond = 45.0;

    public CobraTurretMagazine(
        int capacityRounds = DefaultCapacityRounds,
        double fireRateRoundsPerSecond = DefaultFireRateRoundsPerSecond)
    {
        if (capacityRounds <= 0)
            throw new ArgumentOutOfRangeException(nameof(capacityRounds));
        if (!double.IsFinite(fireRateRoundsPerSecond) || fireRateRoundsPerSecond <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(fireRateRoundsPerSecond));
        CapacityRounds = capacityRounds;
        FireRateRoundsPerSecond = fireRateRoundsPerSecond;
        RoundsRemaining = capacityRounds;
    }

    public int CapacityRounds { get; }
    public double FireRateRoundsPerSecond { get; }
    public int RoundsRemaining { get; private set; }
    public bool IsDry => RoundsRemaining <= 0;
    public bool IsBingo => RoundsRemaining <= CapacityRounds / 5;

    double _fractionalRounds;

    /// <summary>
    /// Consumes rounds while firing. Returns rounds actually expended. Sub-round windows carry a
    /// fractional residue so the authored rate holds at 120 Hz; the previous Max(1, ...) floor
    /// fired a whole round every tick regardless of rate.
    /// </summary>
    public int TryConsumeWhileFiring(double dtSeconds)
    {
        if (!double.IsFinite(dtSeconds) || dtSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(dtSeconds));
        if (IsDry || dtSeconds <= 0.0) return 0;
        double exact = FireRateRoundsPerSecond * dtSeconds + _fractionalRounds;
        int whole = (int)Math.Floor(exact);
        int expended = Math.Min(RoundsRemaining, whole);
        RoundsRemaining -= expended;
        _fractionalRounds = expended < whole ? 0.0 : exact - whole;
        return expended;
    }

    public void Rearm() => RoundsRemaining = CapacityRounds;
}

public sealed class FobResupplyZone
{
    public FobResupplyZone(in Vec3D centreWorldM, double radiusM, double maxClearanceM)
    {
        if (!centreWorldM.IsFinite)
            throw new ArgumentOutOfRangeException(nameof(centreWorldM));
        if (!double.IsFinite(radiusM) || radiusM <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(radiusM));
        if (!double.IsFinite(maxClearanceM) || maxClearanceM <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(maxClearanceM));
        CentreWorldM = centreWorldM;
        RadiusM = radiusM;
        MaxClearanceM = maxClearanceM;
    }

    public Vec3D CentreWorldM { get; }
    public double RadiusM { get; }
    public double MaxClearanceM { get; }

    public bool Contains(in Vec3D positionWorldM, double terrainHeightM)
    {
        if (!positionWorldM.IsFinite || !double.IsFinite(terrainHeightM))
            return false;
        double east = positionWorldM.X - CentreWorldM.X;
        double north = positionWorldM.Z - CentreWorldM.Z;
        if (east * east + north * north > RadiusM * RadiusM)
            return false;
        double clearanceM = positionWorldM.Y - terrainHeightM;
        return clearanceM >= -1.0 && clearanceM <= MaxClearanceM;
    }
}

public readonly record struct GroundWarDebrief(
    int HostileKillsByPlayer,
    int FriendlyKillsByPlayer,
    int FobRearmCount,
    double PeakFriendlyControl,
    double PeakHostileControl,
    double ElapsedSeconds,
    int RoundsExpended,
    HoldTheBridgeOutcome MissionOutcome,
    string MissionOutcomeReason,
    double VictoryHoldProgress);

public readonly record struct GroundWarEvent(
    long AuthorityTick,
    string Kind,
    string? UnitId,
    string? SiteId,
    GroundFaction? Faction,
    Vec3D PositionWorldM,
    Vec3D? TargetPositionWorldM = null);
