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
    HardPoint
}

public enum GroundUnitIntent
{
    Advance,
    Hold,
    EngageNearest
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
        string homeSiteId)
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

    public double CombatPower => Role switch {
        GroundUnitRole.InfantryClump => 1.0,
        GroundUnitRole.SoftVehicle => 2.2,
        GroundUnitRole.HardPoint => 3.0,
        _ => 1.0
    };

    public double EngagementRangeM => Role switch {
        GroundUnitRole.InfantryClump => 180.0,
        GroundUnitRole.SoftVehicle => 320.0,
        GroundUnitRole.HardPoint => 520.0,
        _ => 180.0
    };

    public double DamagePerSecond => Role switch {
        GroundUnitRole.InfantryClump => 8.0,
        GroundUnitRole.SoftVehicle => 14.0,
        GroundUnitRole.HardPoint => 22.0,
        _ => 8.0
    };

    public double MoveSpeedMps => Role switch {
        GroundUnitRole.InfantryClump => 2.4,
        GroundUnitRole.SoftVehicle => 7.5,
        GroundUnitRole.HardPoint => 0.0,
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

    public void SetLocalControl(double control)
    {
        if (!double.IsFinite(control))
            throw new ArgumentOutOfRangeException(nameof(control));
        LocalControl = Math.Clamp(control, -1.0, 1.0);
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

    /// <summary>Consumes rounds while firing. Returns rounds actually expended.</summary>
    public int TryConsumeWhileFiring(double dtSeconds)
    {
        if (!double.IsFinite(dtSeconds) || dtSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(dtSeconds));
        if (IsDry || dtSeconds <= 0.0) return 0;
        int requested = Math.Max(1, (int)Math.Round(FireRateRoundsPerSecond * dtSeconds));
        int expended = Math.Min(RoundsRemaining, requested);
        RoundsRemaining -= expended;
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
    int RoundsExpended);

public readonly record struct GroundWarEvent(
    long AuthorityTick,
    string Kind,
    string? UnitId,
    string? SiteId,
    GroundFaction? Faction,
    Vec3D PositionWorldM);
