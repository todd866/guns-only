namespace GunsOnly.Sim.Okanagan;

public enum OkanaganSortieType
{
    WaterCircuits,
    FireAttack,
    LargeForceEmployment
}

public enum OkanaganMissionPhase
{
    Ready,
    Depart,
    JoinScoop,
    Scoop,
    Climb,
    Hold,
    Ingress,
    Drop,
    Downwind,
    Egress,
    Rtb,
    Approach,
    Landed,
    Complete,
    Failed,
    Paused
}

public readonly record struct OkanaganRouteGate(
    string Id,
    string Label,
    Vec3D PositionWorldM,
    double RadiusM,
    double TargetSpeedMps);

public readonly record struct OkanaganTrafficTrack(
    string Callsign,
    string Kind,
    Vec3D PositionWorldM,
    double HeadingRad,
    double AltitudeM,
    string Intent);

public readonly record struct OkanaganMissionSnapshot(
    OkanaganSortieType Sortie,
    OkanaganMissionPhase Phase,
    double MissionSeconds,
    FireBossTelemetry Aircraft,
    IReadOnlyList<OkanaganRouteGate> Route,
    int ActiveGateIndex,
    string Objective,
    string AirAttackCall,
    string Cue,
    int CompletedCycles,
    int EffectiveDrops,
    double EffectiveWaterKg,
    double FireIntensity,
    double BurnedAreaHa,
    int PopulationExposed,
    double Score,
    FireBossFuelSnapshot FuelPlan,
    IReadOnlyList<OkanaganFireCellSnapshot> FireCells,
    IReadOnlyList<OkanaganTrafficTrack> Traffic);

/// <summary>One complete scoop/drop training or incident-response sortie.</summary>
public sealed class OkanaganFireMission
{
    static readonly Vec3D ScoopEntry = OkanaganGeo.ToWorld(49.815, -119.570, 520.0);
    static readonly Vec3D ScoopTouchdown = OkanaganGeo.ToWorld(49.825, -119.580, 348.0);
    static readonly Vec3D ScoopExit = OkanaganGeo.ToWorld(49.875, -119.555, 350.0);
    static readonly Vec3D FireTarget = OkanaganGeo.ToWorld(49.850, -119.655, 810.0);
    static readonly Vec3D HoldingPoint = OkanaganGeo.ToWorld(49.900, -119.610, 1_180.0);
    static readonly Vec3D AirportDeparture = OkanaganGeo.ToWorld(49.935, -119.395, 780.0);
    static readonly Vec3D RunwayDeparture = OkanaganGeo.ToWorld(49.938, -119.3615, 590.0);
    static readonly Vec3D CircuitCrosswind = OkanaganGeo.ToWorld(49.895, -119.600, 760.0);
    static readonly Vec3D CircuitDownwind = OkanaganGeo.ToWorld(49.840, -119.630, 720.0);
    static readonly Vec3D AirportInitial = OkanaganGeo.ToWorld(49.915, -119.350, 1_050.0);
    static readonly Vec3D AirportFinal = OkanaganGeo.ToWorld(49.932, -119.358, 650.0);
    static readonly Vec3D AirportThreshold = OkanaganGeo.ToWorld(49.9442, -119.3650, 433.0);

    readonly OkanaganFireGrid _fire = new();
    readonly List<OkanaganRouteGate> _route = [];
    long _ticks;
    OkanaganMissionPhase _phaseBeforePause;
    double _dropCreditThisPass;
    double _releasedThisPass;
    bool _hadUsefulLoad;
    readonly double _blockFuelKg;

    OkanaganFireMission(OkanaganSortieType sortie, double? initialFuelKg = null)
    {
        Sortie = sortie;
        _blockFuelKg = sortie == OkanaganSortieType.WaterCircuits
            ? FireBossFuelPlan.WaterCircuitsBlockFuelKg
            : FireBossFuelPlan.FireAttackBlockFuelKg;
        Aircraft = FireBossDynamics.AtKelownaDeparture(initialFuelKg ?? _blockFuelKg);
        Phase = OkanaganMissionPhase.Ready;
        SetPhase(OkanaganMissionPhase.Depart);
    }

    public OkanaganSortieType Sortie { get; }
    public OkanaganMissionPhase Phase { get; private set; }
    public FireBossDynamics Aircraft { get; }
    public int ActiveGateIndex { get; private set; }
    public int CompletedCycles { get; private set; }
    public int EffectiveDrops { get; private set; }
    public double Score { get; private set; }
    public double MissionSeconds => _ticks * FireBossDynamics.FixedDeltaSeconds;

    public static OkanaganFireMission Create(OkanaganSortieType sortie,
        double? initialFuelKg = null) => new(sortie, initialFuelKg);

    public void SetPaused(bool paused)
    {
        if (paused && Phase != OkanaganMissionPhase.Paused)
        {
            _phaseBeforePause = Phase;
            Phase = OkanaganMissionPhase.Paused;
        }
        else if (!paused && Phase == OkanaganMissionPhase.Paused)
            Phase = _phaseBeforePause;
    }

    public void Step(in FireBossPilotCommand command)
    {
        if (Phase is OkanaganMissionPhase.Paused or OkanaganMissionPhase.Complete
            or OkanaganMissionPhase.Failed) return;
        FireBossTelemetry telemetry = Aircraft.Step(command);
        _ticks++;
        _fire.Step(FireBossDynamics.FixedDeltaSeconds);
        if (!telemetry.Flyable)
        {
            SetPhase(OkanaganMissionPhase.Failed);
            return;
        }

        if (telemetry.WaterReleasedThisTickKg > 0.0)
        {
            _releasedThisPass += telemetry.WaterReleasedThisTickKg;
            if (Sortie is OkanaganSortieType.FireAttack or OkanaganSortieType.LargeForceEmployment)
                _dropCreditThisPass += _fire.ApplyWater(telemetry.PositionWorldM,
                    telemetry.WaterReleasedThisTickKg);
        }

        AdvanceGate(telemetry.PositionWorldM);
        FireBossFuelSnapshot liveFuel = FireBossFuelPlan.Snapshot(_blockFuelKg,
            telemetry.FuelKg, telemetry.PositionWorldM, CompletedCycles);
        if (liveFuel.FuelAboveMinimumKg <= 55.0
            && Phase is not (OkanaganMissionPhase.Rtb or OkanaganMissionPhase.Approach
                or OkanaganMissionPhase.Landed or OkanaganMissionPhase.Complete))
            SetPhase(OkanaganMissionPhase.Rtb);
        if (Sortie == OkanaganSortieType.WaterCircuits)
            StepWaterCircuits(telemetry);
        else
            StepFireAttack(telemetry);
        Score = CalculateScore(telemetry);
    }

    public OkanaganMissionSnapshot Snapshot() => new(
        Sortie,
        Phase,
        MissionSeconds,
        Aircraft.Telemetry,
        _route.ToArray(),
        ActiveGateIndex,
        Objective(),
        AirAttackCall(),
        Cue(),
        CompletedCycles,
        EffectiveDrops,
        _fire.EffectiveWaterKg,
        _fire.TotalIntensity,
        _fire.BurnedAreaHa,
        _fire.PopulationExposed,
        Score,
        FireBossFuelPlan.Snapshot(_blockFuelKg, Aircraft.Telemetry.FuelKg,
            Aircraft.Telemetry.PositionWorldM, CompletedCycles),
        _fire.ActiveCells(),
        BuildTraffic());

    void StepWaterCircuits(in FireBossTelemetry telemetry)
    {
        bool onWater = telemetry.SurfaceMode == FireBossSurfaceMode.Water;
        FireBossFuelSnapshot fuel = FireBossFuelPlan.Snapshot(_blockFuelKg,
            telemetry.FuelKg, telemetry.PositionWorldM, CompletedCycles);
        if (Phase == OkanaganMissionPhase.Depart
            && telemetry.SurfaceMode == FireBossSurfaceMode.Airborne
            && HorizontalDistance(telemetry.PositionWorldM, AirportDeparture) < 2_200.0)
            SetPhase(OkanaganMissionPhase.JoinScoop);
        if (Phase == OkanaganMissionPhase.JoinScoop && onWater)
            SetPhase(OkanaganMissionPhase.Scoop);
        if (Phase == OkanaganMissionPhase.Scoop && telemetry.WaterLoadKg >= 2_800.0)
        {
            _hadUsefulLoad = true;
            SetPhase(OkanaganMissionPhase.Climb);
        }
        if (Phase == OkanaganMissionPhase.Climb && telemetry.PositionWorldM.Y >= 620.0)
            SetPhase(OkanaganMissionPhase.Downwind);
        if (Phase == OkanaganMissionPhase.Downwind && _hadUsefulLoad
            && _releasedThisPass >= 2_400.0)
        {
            CompletedCycles++;
            _hadUsefulLoad = false;
            _releasedThisPass = 0.0;
            if (fuel.FuelAboveMinimumKg <= 55.0) SetPhase(OkanaganMissionPhase.Rtb);
            else SetPhase(OkanaganMissionPhase.JoinScoop);
        }
        StepReturn(telemetry);
    }

    void StepFireAttack(in FireBossTelemetry telemetry)
    {
        bool onWater = telemetry.SurfaceMode == FireBossSurfaceMode.Water;
        FireBossFuelSnapshot fuel = FireBossFuelPlan.Snapshot(_blockFuelKg,
            telemetry.FuelKg, telemetry.PositionWorldM, CompletedCycles);
        if (Phase == OkanaganMissionPhase.Depart
            && telemetry.SurfaceMode == FireBossSurfaceMode.Airborne
            && HorizontalDistance(telemetry.PositionWorldM, AirportDeparture) < 2_200.0)
            SetPhase(OkanaganMissionPhase.JoinScoop);
        if (Phase == OkanaganMissionPhase.JoinScoop && onWater)
            SetPhase(OkanaganMissionPhase.Scoop);
        if (Phase == OkanaganMissionPhase.Scoop && telemetry.WaterLoadKg >= 2_800.0)
        {
            _hadUsefulLoad = true;
            SetPhase(OkanaganMissionPhase.Climb);
        }
        if (Phase == OkanaganMissionPhase.Climb && telemetry.PositionWorldM.Y >= 700.0)
            SetPhase(Sortie == OkanaganSortieType.LargeForceEmployment
                ? OkanaganMissionPhase.Hold : OkanaganMissionPhase.Ingress);
        if (Phase == OkanaganMissionPhase.Hold
            && HorizontalDistance(telemetry.PositionWorldM, HoldingPoint) < 1_350.0)
            SetPhase(OkanaganMissionPhase.Ingress);
        if (Phase == OkanaganMissionPhase.Ingress
            && HorizontalDistance(telemetry.PositionWorldM, FireTarget) < 1_900.0)
            SetPhase(OkanaganMissionPhase.Drop);
        if (Phase == OkanaganMissionPhase.Drop && _hadUsefulLoad
            && _releasedThisPass >= 2_400.0)
        {
            if (_dropCreditThisPass >= 420.0) EffectiveDrops++;
            _hadUsefulLoad = false;
            _releasedThisPass = 0.0;
            _dropCreditThisPass = 0.0;
            CompletedCycles++;
            if (fuel.FuelAboveMinimumKg <= 55.0) SetPhase(OkanaganMissionPhase.Rtb);
            else if (Sortie == OkanaganSortieType.FireAttack && EffectiveDrops >= 2)
                SetPhase(OkanaganMissionPhase.Rtb);
            else if (Sortie == OkanaganSortieType.LargeForceEmployment && EffectiveDrops >= 3)
                SetPhase(OkanaganMissionPhase.Rtb);
            else SetPhase(OkanaganMissionPhase.Egress);
        }
        if (Phase == OkanaganMissionPhase.Egress
            && HorizontalDistance(telemetry.PositionWorldM, FireTarget) > 3_200.0)
            SetPhase(OkanaganMissionPhase.JoinScoop);
        StepReturn(telemetry);
    }

    void SetPhase(OkanaganMissionPhase phase)
    {
        Phase = phase;
        ActiveGateIndex = 0;
        _route.Clear();
        foreach (OkanaganRouteGate gate in RouteFor(phase)) _route.Add(gate);
    }

    IEnumerable<OkanaganRouteGate> RouteFor(OkanaganMissionPhase phase)
    {
        if (phase == OkanaganMissionPhase.Depart)
        {
            yield return Gate("departure", "DEPART 16", RunwayDeparture, 650.0, 54.0);
            yield return Gate("turn-west", "TURN WEST", AirportDeparture, 850.0, 58.0);
            yield return Gate("lake-join", "JOIN LAKE", ScoopEntry with { Y = 780.0 }, 950.0, 62.0);
        }
        else if (phase is OkanaganMissionPhase.JoinScoop or OkanaganMissionPhase.Scoop)
        {
            yield return Gate("scoop-entry", "SCOOP ENTRY", ScoopEntry, 650.0, 47.0);
            yield return Gate("scoop-touch", "TOUCH · STEP", ScoopTouchdown, 420.0, 42.0);
            yield return Gate("scoop-lane", "SCOOPS", ScoopExit, 650.0, 43.0);
        }
        else if (phase == OkanaganMissionPhase.Climb)
        {
            yield return Gate("lift-off", "LIFT OFF", ScoopExit with { Y = 430.0 }, 650.0, 50.0);
            yield return Gate("crosswind", "CLIMB", CircuitCrosswind, 850.0, 61.0);
        }
        else if (phase == OkanaganMissionPhase.Downwind)
        {
            yield return Gate("downwind-entry", "DOWNWIND", CircuitDownwind, 900.0, 58.0);
            yield return Gate("training-drop", "DROP WATER", CircuitDownwind + new Vec3D(-2_700.0, 0.0, -900.0), 900.0, 58.0);
            yield return Gate("base-turn", "TURN BASE", ScoopEntry with { Y = 610.0 }, 900.0, 55.0);
        }
        else if (phase == OkanaganMissionPhase.Hold)
        {
            yield return Gate("hold-entry", "AIR ATTACK HOLD", HoldingPoint, 1_100.0, 62.0);
        }
        else if (phase is OkanaganMissionPhase.Ingress or OkanaganMissionPhase.Drop)
        {
            yield return Gate("target-entry", "TARGET ENTRY", FireTarget + new Vec3D(2_600.0, 210.0, -1_100.0), 900.0, 67.0);
            yield return Gate("drop-start", "START DROP", FireTarget + new Vec3D(850.0, 95.0, -350.0), 650.0, 63.0);
            yield return Gate("drop-line", "DROP LINE", FireTarget + new Vec3D(-1_050.0, 80.0, 420.0), 700.0, 63.0);
        }
        else if (phase == OkanaganMissionPhase.Egress)
        {
            yield return Gate("exit", "EXIT NORTH", FireTarget + new Vec3D(-900.0, 320.0, 3_100.0), 950.0, 66.0);
            yield return Gate("lake-return", "RETURN SCOOP", ScoopEntry with { Y = 760.0 }, 1_100.0, 64.0);
        }
        else if (phase == OkanaganMissionPhase.Rtb)
        {
            yield return Gate("rtb-crossing", "RTB EAST", OkanaganGeo.ToWorld(49.890, -119.470, 1_050.0), 1_000.0, 65.0);
            yield return Gate("airport-initial", "JOIN RUNWAY 16", AirportInitial, 1_050.0, 58.0);
        }
        else if (phase == OkanaganMissionPhase.Approach)
        {
            yield return Gate("final", "FINAL 16", AirportFinal, 720.0, 50.0);
            yield return Gate("threshold", "LAND", AirportThreshold, 420.0, 42.0);
        }
    }

    void AdvanceGate(in Vec3D position)
    {
        if (ActiveGateIndex >= _route.Count) return;
        OkanaganRouteGate gate = _route[ActiveGateIndex];
        if (Distance(position, gate.PositionWorldM) <= gate.RadiusM) ActiveGateIndex++;
    }

    string Objective() => Phase switch {
        OkanaganMissionPhase.Depart => "Depart Kelowna and join the assigned lake corridor",
        OkanaganMissionPhase.JoinScoop => "Fly the gates to the northbound scoop lane",
        OkanaganMissionPhase.Scoop => "Hold the step and fill the 3,104 L hopper",
        OkanaganMissionPhase.Climb => "Retract scoops, lift off, climb through the gates",
        OkanaganMissionPhase.Hold => "Enter Air Attack hold and wait for sequencing",
        OkanaganMissionPhase.Ingress => "Follow the target-entry corridor to Division Alpha",
        OkanaganMissionPhase.Drop => "Lay water along the marked west flank",
        OkanaganMissionPhase.Downwind => "Dump the training load on downwind",
        OkanaganMissionPhase.Egress => "Exit north, remain clear of helicopters, return to scoop",
        OkanaganMissionPhase.Rtb => "Protect the reserves and follow the RTB corridor to Kelowna",
        OkanaganMissionPhase.Approach => "Fly Runway 16 final and land",
        OkanaganMissionPhase.Landed => "Clear the runway and taxi in",
        OkanaganMissionPhase.Complete => Sortie == OkanaganSortieType.WaterCircuits
            ? $"{CompletedCycles} water circuits complete" : "Sortie complete — reserves protected",
        OkanaganMissionPhase.Failed => "Aircraft lost",
        _ => "Fly the assigned profile",
    };

    string AirAttackCall() => Phase switch {
        OkanaganMissionPhase.Depart when Sortie == OkanaganSortieType.LargeForceEmployment
            => "AIR ATTACK: Boss 21, depart Runway 16. Join west of the bridge.",
        OkanaganMissionPhase.Depart => "INSTRUCTOR: Runway heading. The cyan rails bend west to the lake.",
        OkanaganMissionPhase.JoinScoop when Sortie == OkanaganSortieType.LargeForceEmployment
            => "AIR ATTACK: Boss 21, cleared onto the northbound scoop lane.",
        OkanaganMissionPhase.JoinScoop => "INSTRUCTOR: The gates bend north onto the scoop lane. Arrive wings-level at 85 knots.",
        OkanaganMissionPhase.Scoop => "INSTRUCTOR: Stable on the step—scoops down. The hopper fills in about thirteen seconds.",
        OkanaganMissionPhase.Climb => "INSTRUCTOR: Scoops up, fly the water off, then follow the climbing turn.",
        OkanaganMissionPhase.Hold => "AIR ATTACK: Boss 21 hold west, one helicopter below the target.",
        OkanaganMissionPhase.Ingress when Sortie == OkanaganSortieType.LargeForceEmployment
            => "AIR ATTACK: Boss 21 cleared in. Division Alpha, west flank, north to south.",
        OkanaganMissionPhase.Ingress => "INSTRUCTOR: Recon complete. The corridor lines you up on the west flank, north to south.",
        OkanaganMissionPhase.Drop when Sortie == OkanaganSortieType.LargeForceEmployment
            => "DIVISION ALPHA: Continue. Start at the open grass and carry into the timber.",
        OkanaganMissionPhase.Drop => "INSTRUCTOR: Start in the open grass and carry the load into the timber.",
        OkanaganMissionPhase.Downwind => "INSTRUCTOR: Training drop abeam the lane, then turn base for another scoop.",
        OkanaganMissionPhase.Egress when Sortie == OkanaganSortieType.LargeForceEmployment
            => "AIR ATTACK: Good effect. Exit north and report ready for another load.",
        OkanaganMissionPhase.Egress => "BOSS 21: Drop complete. Exit north and return for another load.",
        OkanaganMissionPhase.Rtb => "OPS: Boss 21 minimum fuel. Working complete; return Kelowna with reserves intact.",
        OkanaganMissionPhase.Approach => "KELOWNA TOWER: Boss 21 cleared to land Runway 16.",
        OkanaganMissionPhase.Landed => "OPS: Boss 21 down safe. Record landing fuel against the plan.",
        OkanaganMissionPhase.Complete when Sortie == OkanaganSortieType.LargeForceEmployment
            => "AIR ATTACK: Objective met. Boss 21 released—return Kelowna.",
        OkanaganMissionPhase.Complete => "DISPATCH: Boss 21 down safe. Objective met.",
        _ => "",
    };

    string Cue()
    {
        FireBossTelemetry telemetry = Aircraft.Telemetry;
        if (!string.IsNullOrEmpty(telemetry.ScoopFault)) return telemetry.ScoopFault;
        if (Phase == OkanaganMissionPhase.Rtb
            && telemetry.SurfaceMode == FireBossSurfaceMode.Water) return "SCOOPS UP · TAKE OFF · RTB";
        if (Phase == OkanaganMissionPhase.Scoop && !telemetry.ScoopsCommanded) return "EXTEND SCOOPS";
        if (Phase == OkanaganMissionPhase.Scoop) return $"FILL {telemetry.WaterLoadKg / FireBossDynamics.MaximumWaterKg:P0}";
        if ((Phase is OkanaganMissionPhase.Drop or OkanaganMissionPhase.Downwind)
            && telemetry.WaterLoadKg > 300.0) return "HOLD DROP ON THE LINE";
        if (ActiveGateIndex < _route.Count) return $"FLY {_route[ActiveGateIndex].Label}";
        return Objective().ToUpperInvariant();
    }

    IReadOnlyList<OkanaganTrafficTrack> BuildTraffic()
    {
        if (Sortie != OkanaganSortieType.LargeForceEmployment) return [];
        double t = MissionSeconds;
        Vec3D lead = HoldingPoint + new Vec3D(
            Math.Sin(t * 0.035) * 1_600.0,
            240.0,
            Math.Cos(t * 0.035) * 1_600.0);
        Vec3D helicopterHorizontal = FireTarget + new Vec3D(
            Math.Sin(t * 0.08) * 950.0,
            0.0,
            Math.Cos(t * 0.08) * 950.0);
        Vec3D helicopter = helicopterHorizontal with {
            Y = OkanaganGeo.RepresentativeTerrainHeightM(helicopterHorizontal) + 165.0
        };
        return [
            new OkanaganTrafficTrack("BIRD DOG 4", "AIR ATTACK", lead,
                t * 0.035 + Math.PI / 2.0, lead.Y, "ORBIT / SEQUENCE"),
            new OkanaganTrafficTrack("HELCO 7", "HELICOPTER", helicopter,
                t * 0.08 + Math.PI / 2.0, helicopter.Y, "BUCKET · DIVISION ALPHA"),
        ];
    }

    void StepReturn(in FireBossTelemetry telemetry)
    {
        if (Phase == OkanaganMissionPhase.Rtb
            && HorizontalDistance(telemetry.PositionWorldM, AirportInitial) < 1_300.0)
            SetPhase(OkanaganMissionPhase.Approach);
        if (Phase == OkanaganMissionPhase.Approach
            && telemetry.SurfaceMode == FireBossSurfaceMode.Runway)
            SetPhase(OkanaganMissionPhase.Landed);
        if (Phase == OkanaganMissionPhase.Landed && telemetry.TrueAirspeedMps < 4.0)
            SetPhase(OkanaganMissionPhase.Complete);
    }

    double CalculateScore(in FireBossTelemetry telemetry)
    {
        double completion = Sortie == OkanaganSortieType.WaterCircuits
            ? CompletedCycles * 250.0
            : EffectiveDrops * 300.0 + Math.Min(260.0, _fire.EffectiveWaterKg * 0.12);
        double safety = telemetry.Flyable ? 120.0 : 0.0;
        double precision = ActiveGateIndex * 16.0;
        return Math.Round(completion + safety + precision);
    }

    static OkanaganRouteGate Gate(string id, string label, Vec3D position, double radius, double speed) =>
        new(id, label, position, radius, speed);
    static double Distance(in Vec3D a, in Vec3D b) => (a - b).Length;
    static double HorizontalDistance(in Vec3D a, in Vec3D b)
    {
        double dx = a.X - b.X;
        double dz = a.Z - b.Z;
        return Math.Sqrt(dx * dx + dz * dz);
    }
}
