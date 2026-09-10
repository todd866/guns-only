namespace GunsOnly.Sim.Okanagan;

public enum OkanaganSortieType
{
    WaterCircuits,
    FireAttack,
    LargeForceEmployment,
    PeachlandDefence,
    BigWhiteDefence,
    SilverStarDefence,
    ApexDefence
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
    Vec3D DropAimWorldM,
    double DropCreditKg,
    Vec3D DropCreditWorldM,
    IReadOnlyList<OkanaganFireCellSnapshot> FireCells,
    IReadOnlyList<OkanaganTrafficTrack> Traffic,
    string IncidentName,
    bool IncidentActive,
    bool IncidentHandedOff,
    IReadOnlyList<OkanaganSiteSnapshot> Sites,
    double ScoopTargetWaterKg = 0.0,
    double DropTargetWaterKg = 0.0);

/// <summary>One complete scoop/drop training or incident-response sortie.</summary>
public sealed class OkanaganFireMission
{
    // The training lane sits in the broad water immediately west of Kelowna. The former lane was
    // 18 km beyond the airport turn and then sent the player another 28 km around a dead recovery
    // dogleg. These points retain a real approach, water run, downwind drop and RTB while keeping
    // a finite training circuit. The measured hills require a level crossing and an over-water descent.
    internal static readonly Vec3D ScoopEntry =
        OkanaganGeo.ToWorld(49.910, -119.515, 430.0);
    internal static readonly Vec3D ScoopTouchdown =
        OkanaganGeo.ToWorld(49.920, -119.510, 348.0);
    internal static readonly Vec3D ScoopExit =
        OkanaganGeo.ToWorld(49.945, -119.483, 350.0);
    internal static readonly Vec3D LakeArrival = OkanaganGeo.ToWorld(49.865, -119.515, 780);
    internal static readonly Vec3D LoadedLiftoff = OkanaganGeo.ToWorld(49.966, -119.472, 640);
    static readonly Vec3D FireTarget = OkanaganGeo.ToWorld(49.850, -119.655, 810.0);
    static readonly Vec3D HoldingPoint = OkanaganGeo.ToWorld(49.900, -119.610, 1_180.0);
    internal static readonly Vec3D AirportDeparture =
        OkanaganGeo.ToWorld(49.935, -119.395, 780.0);
    internal static readonly Vec3D RunwayDeparture =
        OkanaganGeo.ToWorld(49.938, -119.3615, 780.0);
    internal static readonly Vec3D CircuitCrosswind =
        OkanaganGeo.ToWorld(49.960, -119.500, 720.0);
    internal static readonly Vec3D CircuitDownwind =
        OkanaganGeo.ToWorld(49.945, -119.482, 650.0);
    internal static readonly Vec3D TrainingDrop =
        CircuitDownwind + new Vec3D(0.0, 0.0, -1_800.0);
    internal static readonly Vec3D RtbCrossing =
        OkanaganGeo.ToWorld(49.950, -119.450, 850.0);
    // Runway 16 runs from the north-west threshold toward the south-east. The original recovery
    // gates sat south-east of the field and pointed back up Runway 34 while every visible cue said
    // Runway 16. Keep the geometry named and test-visible so presentation cannot drift back onto
    // the reciprocal approach unnoticed.
    internal static readonly Vec3D AirportThreshold =
        OkanaganGeo.ToWorld(49.9670, -119.3778, OkanaganGeo.KelownaRunwayElevationM);
    static readonly Vec3D RunwayDirection = new(Math.Sin(160 * Math.PI / 180), 0, Math.Cos(160 * Math.PI / 180));
    internal static readonly Vec3D AirportInitial = (AirportThreshold - RunwayDirection * 7_500) with {Y=750};
    internal static readonly Vec3D AirportFinal = (AirportThreshold - RunwayDirection * 2_600) with {Y=570};

    readonly OkanaganFireGrid _fire;
    readonly OkanaganIncident? _incident;
    readonly OkanaganProtection? _protection;
    bool _incidentActive;
    bool _incidentHandedOff;
    double _protectionAccumulator;
    readonly double _cruiseAltitude;
    readonly Vec3D _incidentUphill;
    readonly double _plannedOutboundFuel;
    readonly double _plannedMinimumRtb;
    FireBossTelemetry _latestTelemetry;
    readonly Vec3D _incidentTarget;
    Vec3D IncidentTarget => _incident is null ? FireTarget : _incidentTarget;
    readonly List<OkanaganRouteGate> _route = [];
    long _ticks;
    OkanaganMissionPhase _phaseBeforePause;
    double _dropCreditThisPass;
    int _sitesProtectedThisPass;
    double _releasedThisPass;
    double _holdDwellSeconds;
    double _dropCreditThisTick;
    bool _hadUsefulLoad;
    double _scoopTargetWaterKg;
    double _dropTargetWaterKg;
    Vec3D? _earlyReturnOrigin;
    readonly Dictionary<(Vec3D Gate, int SpeedBand), double> _shallowHoldTerrainHeights = new();
    // Exercise completion allowance, not an aircraft limit. The old 2,400/2,800 kg gates
    // required approximately this fraction of an acquired load to be delivered.
    const double DropCompletionFraction = 0.85;
    const double LoadToleranceKg = 1.0;
    readonly double _blockFuelKg;
    internal FireBossMissionPerformancePlan PerformancePlan { get; }

    OkanaganFireMission(OkanaganSortieType sortie, double? initialFuelKg = null)
    {
        if (!Enum.IsDefined(sortie)) throw new ArgumentOutOfRangeException(nameof(sortie));
        Sortie = sortie;
        _incident = OkanaganIncident.For(sortie);
        _fire = new OkanaganFireGrid(_incident);
        _protection = _incident == null ? null : new OkanaganProtection(_incident.Sites);
        _incidentActive = _incident == null;
        // The run direction comes from the fire's slope, as before; only the aim moves to the
        // buildings. Sampling the gradient at the aim instead swung SilverStar's run 86 degrees and
        // put the whole ingress corridor over different relief.
        _incidentUphill = UphillDirection(_incident == null ? FireTarget : _incident.Ignition + new Vec3D(200,0,160));
        _incidentTarget = _incident == null ? FireTarget : DefenceLineAnchor(_incident, _incidentUphill);
        // The cruise must also clear the relief under the descending approach itself. Otherwise the
        // straight descent from the ridge entry cuts a secondary summit, the lifted terrain gates
        // demand a climb a loaded Fire Boss cannot fly, and the aircraft crosses the ridge low
        // (Big White, 2026-09-07: 23 m). The approach then descends monotonically from the entry.
        _cruiseAltitude = _incident == null ? 700 : Math.Max(Math.Max(CorridorAltitude(ScoopEntry, IncidentTarget, 400),
            CorridorAltitude(ScoopEntry, IncidentTarget + _incidentUphill * 6_000, 400)),
            CorridorAltitude(IncidentTarget + _incidentUphill * 4_500, IncidentTarget + _incidentUphill * 300, 160));
        PerformancePlan = FireBossMissionPerformance.AtAltitude(_cruiseAltitude);
        // Exercise planning allowance: measured ferry distance plus a conservative loaded climb.
        _plannedOutboundFuel = _incident == null ? FireBossFuelPlan.PlannedOutboundTripKg
            : 35 + HorizontalDistance(ScoopEntry, IncidentTarget) / 58 * .15
                + Math.Max(0, _cruiseAltitude - 700) / FireBossMissionPerformance.RequiredClimbMps * .15;
        _blockFuelKg = sortie == OkanaganSortieType.WaterCircuits
            ? FireBossFuelPlan.WaterCircuitsBlockFuelKg
            : _incident is null ? FireBossFuelPlan.FireAttackBlockFuelKg : FireBossDynamics.InitialFuelKg;
        _plannedMinimumRtb = _incident == null ? 0 : FireBossFuelPlan.Snapshot(_blockFuelKg, _blockFuelKg,
            IncidentTarget, 0, _plannedOutboundFuel, ReturnClimbFuel(IncidentTarget)).MinimumRtbFuelKg;
        Aircraft = FireBossDynamics.AtKelownaDeparture(initialFuelKg ?? _blockFuelKg);
        _latestTelemetry = Aircraft.Telemetry;
        _scoopTargetWaterKg = PlannedScoopTarget(_latestTelemetry);
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
        ObserveFlight(Aircraft.Step(command));
    }

    // The coordinator consumes the dynamics' telemetry. Internal access lets lifecycle tests
    // exercise every transition without pretending a scripted pose sequence validates flight physics.
    internal void ObserveFlight(in FireBossTelemetry telemetry)
    {
        if (Phase is OkanaganMissionPhase.Paused or OkanaganMissionPhase.Complete
            or OkanaganMissionPhase.Failed) return;
        _dropCreditThisTick = 0.0;
        _latestTelemetry = telemetry;
        _ticks++;
        if (!_incidentActive && _incident != null
            && Phase is OkanaganMissionPhase.Ingress or OkanaganMissionPhase.Drop
            && HorizontalDistance(telemetry.PositionWorldM, IncidentTarget) < 1_800) _incidentActive = true;
        if (_incident != null && _incidentActive && Phase == OkanaganMissionPhase.Rtb
            && HorizontalDistance(telemetry.PositionWorldM, IncidentTarget) > 4_000) _incidentHandedOff = true;
        if (_incidentActive && !_incidentHandedOff) {
            _fire.Step(FireBossDynamics.FixedDeltaSeconds);
            _protectionAccumulator += FireBossDynamics.FixedDeltaSeconds;
            if (_protectionAccumulator >= .5) {
                _protection?.Step(_protectionAccumulator, _fire);
                _protectionAccumulator = 0;
            }
        }
        if (!telemetry.Flyable)
        {
            SetPhase(OkanaganMissionPhase.Failed);
            return;
        }

        if (telemetry.WaterReleasedThisTickKg > 0.0)
        {
            _releasedThisPass += telemetry.WaterReleasedThisTickKg;
            if (Sortie != OkanaganSortieType.WaterCircuits && _incidentActive)
            {
                double dose = telemetry.WaterReleasedThisTickKg * (_incident == null ? 1 :
                    DropDeliveryFraction(telemetry.PositionWorldM.Y - OkanaganCdem.SampleSurfaceHeightM(telemetry.PositionWorldM)));
                _dropCreditThisTick = _fire.ApplyWater(telemetry.PositionWorldM, dose);
                _sitesProtectedThisPass += _protection?.ApplyWater(telemetry.PositionWorldM, dose) ?? 0;
                _dropCreditThisPass += _dropCreditThisTick;
            }
        }

        AdvanceGate(telemetry.PositionWorldM);
        FireBossFuelSnapshot liveFuel = FuelPlanFor(telemetry);
        if (FuelRequiresReturn(liveFuel.FuelAboveMinimumKg)
            && Phase is not (OkanaganMissionPhase.Rtb or OkanaganMissionPhase.Approach
                or OkanaganMissionPhase.Landed or OkanaganMissionPhase.Complete))
            SetPhase(OkanaganMissionPhase.Rtb);
        if (Sortie == OkanaganSortieType.WaterCircuits)
            StepWaterCircuits(telemetry);
        else
            StepFireAttack(telemetry);
        Score = CalculateScore(telemetry);
    }

    // Bingo interrupts current work regardless of the number of previously completed circuits.
    internal static bool FuelRequiresReturn(double fuelAboveMinimumKg) => fuelAboveMinimumKg <= 0;
    internal static bool FuelAllowsAnotherCircuit(double fuelAboveMinimumKg) =>
        fuelAboveMinimumKg > FireBossFuelPlan.OneMoreCircuitProhibitedKg;

    public OkanaganMissionSnapshot Snapshot() => new(
        Sortie,
        Phase,
        MissionSeconds,
        _latestTelemetry,
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
        FuelPlanFor(_latestTelemetry),
        DropAim(),
        _dropCreditThisTick,
        _latestTelemetry.PositionWorldM,
        _fire.ActiveCells(),
        BuildTraffic(),
        _incident?.Name ?? "",
        _incidentActive,
        _incidentHandedOff,
        _protection?.Snapshot() ?? [],
        _scoopTargetWaterKg,
        _dropTargetWaterKg);

    double PlannedScoopTarget(in FireBossTelemetry telemetry)
    {
        double plannedGross = PerformancePlan.MeetsClimbRequirement
            ? Math.Min(FireBossDynamics.MaximumGrossMassKg, PerformancePlan.MaximumGrossMassKg) : 0;
        return Math.Clamp(telemetry.WaterLoadKg + plannedGross - telemetry.GrossMassKg,
            0.0, FireBossDynamics.MaximumWaterKg);
    }

    bool ScoopTargetReached(in FireBossTelemetry telemetry) =>
        _scoopTargetWaterKg > LoadToleranceKg
        && telemetry.WaterLoadKg >= _scoopTargetWaterKg - LoadToleranceKg;

    // Guidance for the represented float-contact attitude, not an OEM V-speed. Accelerating
    // level before rotation avoids trapping a heavy aircraft behind its high-incidence drag.
    internal static double SuggestedWaterRotationSpeedMps(in FireBossTelemetry telemetry)
    {
        AircraftParams parameters = FlightModel.At802fFireBossPublicDataSurrogate;
        double density = StandardAtmosphere1976.Instance.Sample(telemetry.PositionWorldM.Y).DensityKgM3;
        double cl = FlightModel.LiftCoefficient(FireBossDynamics.WaterPitchLimitRad, parameters);
        return 1.03 * Math.Sqrt(2 * telemetry.GrossMassKg * FlightModel.G0
            / (density * parameters.WingAreaM2 * cl));
    }

    internal bool RecommendsShallowLoadedClimb()
    {
        var telemetry = _latestTelemetry;
        if (telemetry.SurfaceMode != FireBossSurfaceMode.Airborne || telemetry.WaterLoadKg <= 1_000
            || Phase is not (OkanaganMissionPhase.Climb or OkanaganMissionPhase.Rtb)
            || ActiveGateIndex >= _route.Count) return false;
        var gate = _route[ActiveGateIndex];
        const double establishedRangeM = 2_000;
        if (gate.PositionWorldM.Y - telemetry.PositionWorldM.Y <= 80
            || HorizontalDistance(telemetry.PositionWorldM, gate.PositionWorldM) > establishedRangeM)
            return false;
        int speedBand = (int)Math.Ceiling(Math.Max(gate.TargetSpeedMps, telemetry.TrueAirspeedMps) / 5);
        var key = (gate.PositionWorldM, speedBand);
        if (!_shallowHoldTerrainHeights.TryGetValue(key, out double safeHeight))
        {
            double speed = speedBand * 5;
            double turnRadius = speed * speed / (FlightModel.G0 * Math.Tan(12 * Math.PI / 180));
            // A shallow pursuit turn can extend a full turn diameter beyond its starting point.
            // Include the allowed entry range and sample all bearings, not only the gate chord.
            double footprint = establishedRangeM + 2 * turnRadius;
            safeHeight = 0;
            for (int bearing = 0; bearing < 72; bearing++)
            {
                double angle = bearing * Math.PI / 36;
                Vec3D edge = gate.PositionWorldM + new Vec3D(Math.Sin(angle), 0, Math.Cos(angle)) * footprint;
                safeHeight = Math.Max(safeHeight, CorridorAltitude(gate.PositionWorldM, edge, 150));
            }
            _shallowHoldTerrainHeights[key] = safeHeight;
        }
        return telemetry.PositionWorldM.Y >= safeHeight;
    }

    internal static bool NeedsRecoveryLoadRelease(OkanaganMissionPhase phase, in FireBossTelemetry telemetry) =>
        phase is OkanaganMissionPhase.Rtb or OkanaganMissionPhase.Approach
        && telemetry.SurfaceMode == FireBossSurfaceMode.Airborne
        && telemetry.WaterLoadKg > LoadToleranceKg
        && telemetry.GrossMassKg > FireBossDynamics.MaximumLandingMassKg;

    void CaptureAcquiredLoad(in FireBossTelemetry telemetry)
    {
        _hadUsefulLoad = true;
        _dropTargetWaterKg = telemetry.WaterLoadKg * DropCompletionFraction;
        // Water dumped during an earlier circuit or on the approach is not this pass's delivery.
        _releasedThisPass = 0.0;
    }

    void StepWaterCircuits(in FireBossTelemetry telemetry)
    {
        bool onWater = telemetry.SurfaceMode == FireBossSurfaceMode.Water;
        if (Phase == OkanaganMissionPhase.Depart
            && telemetry.SurfaceMode == FireBossSurfaceMode.Airborne
            && telemetry.PositionWorldM.Y >= 730.0
            && ActiveGateIndex >= 1
            && (HorizontalDistance(telemetry.PositionWorldM, AirportDeparture) < 2_200.0
                || ActiveGateIndex >= 2))
            SetPhase(OkanaganMissionPhase.JoinScoop);
        if (Phase == OkanaganMissionPhase.JoinScoop && onWater)
            SetPhase(OkanaganMissionPhase.Scoop);
        if (Phase == OkanaganMissionPhase.Scoop && ScoopTargetReached(telemetry))
        {
            CaptureAcquiredLoad(telemetry);
            SetPhase(OkanaganMissionPhase.Climb);
        }
        if (Phase == OkanaganMissionPhase.Climb && telemetry.PositionWorldM.Y >= 620.0)
            SetPhase(OkanaganMissionPhase.Downwind);
        if (Phase == OkanaganMissionPhase.Downwind && _hadUsefulLoad
            && _releasedThisPass >= _dropTargetWaterKg)
        {
            CompletedCycles++;
            _hadUsefulLoad = false;
            _releasedThisPass = 0.0;
            // Dispatch promises one complete scoop/drop/recovery circuit. Returning to the scoop
            // lane here silently turned that finite training sortie into an endurance loop and
            // made its success result unreachable until fuel happened to force an RTB.
            SetPhase(NextWaterCircuitPhase(CompletedCycles));
        }
        StepReturn(telemetry);
    }

    internal static OkanaganMissionPhase NextWaterCircuitPhase(int completedCycles)
    {
        if (completedCycles < 0)
            throw new ArgumentOutOfRangeException(nameof(completedCycles));
        return completedCycles >= 1
            ? OkanaganMissionPhase.Rtb
            : OkanaganMissionPhase.JoinScoop;
    }

    void StepFireAttack(in FireBossTelemetry telemetry)
    {
        bool onWater = telemetry.SurfaceMode == FireBossSurfaceMode.Water;
        FireBossFuelSnapshot fuel = FuelPlanFor(telemetry);
        if (Phase == OkanaganMissionPhase.Depart
            && telemetry.SurfaceMode == FireBossSurfaceMode.Airborne
            && telemetry.PositionWorldM.Y >= 730.0
            && ActiveGateIndex >= 1
            && (HorizontalDistance(telemetry.PositionWorldM, AirportDeparture) < 2_200.0
                || ActiveGateIndex >= 2))
            SetPhase(OkanaganMissionPhase.JoinScoop);
        if (Phase == OkanaganMissionPhase.JoinScoop && onWater)
            SetPhase(OkanaganMissionPhase.Scoop);
        if (Phase == OkanaganMissionPhase.Scoop && ScoopTargetReached(telemetry))
        {
            CaptureAcquiredLoad(telemetry);
            SetPhase(OkanaganMissionPhase.Climb);
        }
        if (Phase == OkanaganMissionPhase.Climb && telemetry.PositionWorldM.Y >= _cruiseAltitude)
            SetPhase(Sortie == OkanaganSortieType.LargeForceEmployment
                ? OkanaganMissionPhase.Hold : OkanaganMissionPhase.Ingress);
        if (Phase == OkanaganMissionPhase.Hold)
        {
            double rangeM = HorizontalDistance(telemetry.PositionWorldM, HoldingPoint);
            if (rangeM < AirAttackHoldRadiusM)
                _holdDwellSeconds += FireBossDynamics.FixedDeltaSeconds;
            else
                _holdDwellSeconds = 0.0;
            if (AirAttackHoldClears(_holdDwellSeconds, rangeM))
                SetPhase(OkanaganMissionPhase.Ingress);
        }
        if (Phase == OkanaganMissionPhase.Ingress
            && HorizontalDistance(telemetry.PositionWorldM, IncidentTarget) < 1_900.0
            && (_incident == null || ActiveGateIndex >= _route.Count - 3))
            SetPhase(OkanaganMissionPhase.Drop);
        if (Phase == OkanaganMissionPhase.Drop && _hadUsefulLoad
            && _releasedThisPass >= _dropTargetWaterKg)
        {
            // A defence load is laid on the buildings, not the fire's centre, so it earns its
            // drop by reaching structures as well as by cooling cells.
            if (_dropCreditThisPass >= 420.0 || _sitesProtectedThisPass >= 3) EffectiveDrops++;
            _hadUsefulLoad = false;
            _releasedThisPass = 0.0;
            _dropCreditThisPass = 0.0;
            _sitesProtectedThisPass = 0;
            CompletedCycles++;
            if (!FuelAllowsAnotherCircuit(fuel.FuelAboveMinimumKg) || _incident != null) SetPhase(OkanaganMissionPhase.Rtb);
            else if (Sortie == OkanaganSortieType.FireAttack && EffectiveDrops >= 2)
                SetPhase(OkanaganMissionPhase.Rtb);
            else if (Sortie == OkanaganSortieType.LargeForceEmployment && EffectiveDrops >= 3)
                SetPhase(OkanaganMissionPhase.Rtb);
            else SetPhase(OkanaganMissionPhase.Egress);
        }
        if (Phase == OkanaganMissionPhase.Egress
            && HorizontalDistance(telemetry.PositionWorldM, IncidentTarget) > 3_200.0)
            SetPhase(OkanaganMissionPhase.JoinScoop);
        StepReturn(telemetry);
    }

    void SetPhase(OkanaganMissionPhase phase)
    {
        if (phase == OkanaganMissionPhase.Rtb && Phase != OkanaganMissionPhase.Rtb)
        {
            // An abort before engagement must not first visit the remote fire's downhill exit.
            // Freeze the actual abort position so the return corridor does not move each tick.
            _earlyReturnOrigin = _incident != null && !_incidentActive && Phase != OkanaganMissionPhase.Drop
                ? _latestTelemetry.PositionWorldM : null;
        }
        if (phase == OkanaganMissionPhase.Scoop && Phase != OkanaganMissionPhase.Scoop)
        {
            // Capture once, including any retained water. Burning fuel during a scoop must not
            // move the finish line; the dynamics separately enforce the instantaneous gross cap.
            _scoopTargetWaterKg = PlannedScoopTarget(_latestTelemetry);
            _dropTargetWaterKg = 0.0;
        }
        if (_incident != null && Phase == OkanaganMissionPhase.Ingress && phase == OkanaganMissionPhase.Drop) {
            Phase = phase;
            return; // This is the same corridor; its already-passed gates remain passed.
        }
        if (phase != OkanaganMissionPhase.Hold) _holdDwellSeconds = 0.0;
        Phase = phase;
        ActiveGateIndex = 0;
        _route.Clear();
        foreach (OkanaganRouteGate gate in RouteFor(phase)) _route.Add(gate);
    }

    internal const double AirAttackHoldRadiusM = 1_350.0;
    internal const double AirAttackHoldDwellSeconds = 12.0;

    internal static bool AirAttackHoldClears(double dwellSeconds, double rangeM)
    {
        if (!double.IsFinite(dwellSeconds) || dwellSeconds < 0.0)
            throw new ArgumentOutOfRangeException(nameof(dwellSeconds));
        if (!double.IsFinite(rangeM) || rangeM < 0.0)
            throw new ArgumentOutOfRangeException(nameof(rangeM));
        return rangeM < AirAttackHoldRadiusM && dwellSeconds >= AirAttackHoldDwellSeconds;
    }

    Vec3D DropAim() => Sortie == OkanaganSortieType.WaterCircuits
        ? TrainingDrop with { Y = OkanaganGeo.LakeSurfaceElevationM }
        : IncidentTarget;

    internal IEnumerable<OkanaganRouteGate> RouteFor(OkanaganMissionPhase phase)
    {
        if (_incident != null && phase is OkanaganMissionPhase.Climb or OkanaganMissionPhase.Ingress or OkanaganMissionPhase.Drop or OkanaganMissionPhase.Rtb) {
            foreach (var gate in DefenceRoute(phase)) yield return gate;
            yield break;
        }
        if (phase == OkanaganMissionPhase.Depart)
        {
            yield return Gate("departure", "DEPART 16", RunwayDeparture, 650.0, 54.0);
            yield return Gate("turn-west", "TURN WEST", AirportDeparture, 850.0, 58.0);
            yield return Gate("lake-join", "JOIN LAKE", ScoopEntry with { Y = 780.0 }, 950.0, 62.0);
        }
        else if (phase is OkanaganMissionPhase.JoinScoop or OkanaganMissionPhase.Scoop)
        {
            yield return Gate("lake-arrival", "CROSS HILLS · HOLD ALTITUDE", LakeArrival, 450, 58);
            yield return Gate("scoop-entry", "DESCEND OVER LAKE", ScoopEntry, 650.0, 47.0);
            yield return Gate("scoop-touch", "TOUCH · STEP", ScoopTouchdown, 420.0, 42.0);
            yield return Gate("scoop-lane", "SCOOPS", ScoopExit, 650.0, 43.0);
        }
        else if (phase == OkanaganMissionPhase.Climb)
        {
            yield return Gate("lift-off", "LIFT OFF", LoadedLiftoff, 650.0, 54.0);
            yield return Gate("crosswind", "CLIMB", CircuitCrosswind, 850.0, 61.0);
        }
        else if (phase == OkanaganMissionPhase.Downwind)
        {
            yield return Gate("downwind-entry", "DOWNWIND", CircuitDownwind, 900.0, 58.0);
            yield return Gate("training-drop", "DROP WATER", TrainingDrop, 900.0, 58.0);
            if (Sortie == OkanaganSortieType.WaterCircuits)
            {
                // The first credited training load ends this finite circuit. Keep the last
                // pre-release gate on the same point the RTB phase will publish, so the highway
                // never tells the pilot to turn back for a scoop the mission will not request.
                yield return Gate("circuit-exit", "EXIT EAST", RtbCrossing,
                    1_000.0, 65.0);
            }
            else
                yield return Gate("base-turn", "TURN BASE",
                    ScoopEntry with { Y = 610.0 }, 900.0, 55.0);
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
            yield return Gate("rtb-crossing", "RTB EAST", RtbCrossing, 1_000.0, 65.0);
            yield return Gate("airport-initial", "JOIN RUNWAY 16", AirportInitial, 1_050.0, 58.0);
        }
        else if (phase == OkanaganMissionPhase.Landed)
        {
            yield return Gate("rollout", "CLOSE POWER · STOP ON RUNWAY", AirportThreshold + RunwayDirection * 2_550, 50, 0);
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
        if (gate.Id == "lift-off" && (_latestTelemetry.SurfaceMode != FireBossSurfaceMode.Airborne || position.Y < 500)) return;
        // The authored Apex valley turn must reach its second waypoint before turning home;
        // altitude alone would cut the corner across the ridge the escape route avoids.
        if (gate.Id == "escape-climb" && _incident?.Id == "apex" && _earlyReturnOrigin == null
            && HorizontalDistance(position, gate.PositionWorldM) > gate.RadiusM) return;
        bool altitudeGate = gate.Id is "escape-climb" or "lake-climb";
        if (altitudeGate ? position.Y >= gate.PositionWorldM.Y - 60
            : Distance(position, gate.PositionWorldM) <= gate.RadiusM) ActiveGateIndex++;
    }

    string Objective() => _incident != null && Phase is OkanaganMissionPhase.Ingress or OkanaganMissionPhase.Drop
        ? $"Defend {_incident.Name}: homes and infrastructure on the downwind edge"
        : Phase switch {
        OkanaganMissionPhase.Depart => "Depart Kelowna and join the assigned lake corridor",
        OkanaganMissionPhase.JoinScoop => "Fly the gates to the northbound scoop lane",
        OkanaganMissionPhase.Scoop => "Hold the step and reach the planned water target",
        OkanaganMissionPhase.Climb => "Retract scoops, lift off, climb through the gates",
        OkanaganMissionPhase.Hold => "Enter Air Attack hold and wait for sequencing",
        OkanaganMissionPhase.Ingress => "Follow the target-entry corridor to Division Alpha",
        OkanaganMissionPhase.Drop => "Lay water along the marked west flank",
        OkanaganMissionPhase.Downwind => "Dump the training load on downwind",
        OkanaganMissionPhase.Egress => "Exit north, remain clear of helicopters, return to scoop",
        OkanaganMissionPhase.Rtb => "Protect the reserves and follow the RTB corridor to Kelowna",
        OkanaganMissionPhase.Approach => "Fly Runway 16 final and land",
        OkanaganMissionPhase.Landed => "Close power and stop on the runway",
        OkanaganMissionPhase.Complete => Sortie == OkanaganSortieType.WaterCircuits
            ? $"{CompletedCycles} water circuits complete" : _incident != null
                ? "Aircraft recovered — review sector condition" : "Sortie complete — reserves protected",
        OkanaganMissionPhase.Failed => "Aircraft lost",
        _ => "Fly the assigned profile",
    };

    string AirAttackCall() => _incident != null ? Phase switch {
        OkanaganMissionPhase.Climb => $"AIR ATTACK: Climb over the lake to {_cruiseAltitude * 3.28084:F0} feet before crossing the ridge.",
        OkanaganMissionPhase.Ingress => $"AIR ATTACK: {_incident.Name}. One load on the defence line, then recover.",
        OkanaganMissionPhase.Drop => "AIR ATTACK: Protect the downwind buildings. Keep the escape route open.",
        OkanaganMissionPhase.Rtb => "OPS: Climb clear, then return Kelowna. Ground crews take over when you leave the sector.",
        OkanaganMissionPhase.Complete => "OPS: Aircraft recovered. Review the recorded site condition.",
        _ => RadioCallFor(Sortie, Phase),
    } : RadioCallFor(Sortie, Phase);

    internal static string RadioCallFor(OkanaganSortieType sortie,
        OkanaganMissionPhase phase) => phase switch {
        OkanaganMissionPhase.Depart when sortie == OkanaganSortieType.LargeForceEmployment
            => "AIR ATTACK: Boss 21, depart 16. Join west.",
        OkanaganMissionPhase.Depart => "INSTRUCTOR: Runway heading. Turn west.",
        OkanaganMissionPhase.JoinScoop when sortie == OkanaganSortieType.LargeForceEmployment
            => "AIR ATTACK: Boss 21, cleared northbound.",
        OkanaganMissionPhase.JoinScoop => "INSTRUCTOR: Northbound lane. 85 knots, wings level.",
        OkanaganMissionPhase.Scoop => "INSTRUCTOR: On step. Scoops down.",
        OkanaganMissionPhase.Climb => "INSTRUCTOR: Scoops up. Climb.",
        OkanaganMissionPhase.Hold => "AIR ATTACK: Boss 21, hold west. Traffic below.",
        OkanaganMissionPhase.Ingress when sortie == OkanaganSortieType.LargeForceEmployment
            => "AIR ATTACK: Boss 21, west flank, north to south.",
        OkanaganMissionPhase.Ingress => "INSTRUCTOR: West flank, north to south.",
        OkanaganMissionPhase.Drop when sortie == OkanaganSortieType.LargeForceEmployment
            => "DIVISION ALPHA: Continue. Grass into timber.",
        OkanaganMissionPhase.Drop => "INSTRUCTOR: Grass into timber.",
        OkanaganMissionPhase.Downwind when sortie == OkanaganSortieType.WaterCircuits
            => "INSTRUCTOR: Drop here, then RTB.",
        OkanaganMissionPhase.Downwind => "INSTRUCTOR: Drop here. Return to scoop.",
        OkanaganMissionPhase.Egress when sortie == OkanaganSortieType.LargeForceEmployment
            => "AIR ATTACK: Good effect. Exit north.",
        OkanaganMissionPhase.Egress => "BOSS 21: Off north. Returning to scoop.",
        OkanaganMissionPhase.Rtb when sortie == OkanaganSortieType.WaterCircuits
            => "INSTRUCTOR: Circuit complete. RTB Runway 16.",
        OkanaganMissionPhase.Rtb => "OPS: Return Kelowna.",
        OkanaganMissionPhase.Approach => "TOWER: Boss 21, cleared to land 16.",
        OkanaganMissionPhase.Landed => "OPS: Boss 21 down safe.",
        OkanaganMissionPhase.Complete when sortie == OkanaganSortieType.LargeForceEmployment
            => "AIR ATTACK: Objective met. Boss 21 released.",
        OkanaganMissionPhase.Complete => "DISPATCH: Objective met.",
        _ => "",
    };

    string Cue()
    {
        FireBossTelemetry telemetry = _latestTelemetry;
        if (!string.IsNullOrEmpty(telemetry.ScoopFault)) return telemetry.ScoopFault;
        if (NeedsRecoveryLoadRelease(Phase, telemetry)) return "RTB · RELEASE LOAD OVER LAKE";
        if (Phase is OkanaganMissionPhase.Climb or OkanaganMissionPhase.Rtb
            && telemetry.SurfaceMode == FireBossSurfaceMode.Water)
        {
            double rotateSpeed = SuggestedWaterRotationSpeedMps(telemetry);
            return telemetry.TrueAirspeedMps < rotateSpeed
                ? $"SCOOPS UP · STEP TO {rotateSpeed * 1.943844:F0} KT · THEN ROTATE"
                : "SCOOPS UP · ROTATE";
        }
        if (Phase == OkanaganMissionPhase.Scoop && !telemetry.ScoopsCommanded) return "EXTEND SCOOPS";
        if (RecommendsShallowLoadedClimb()) return "CLIMB · SHALLOW TURNS WITH LOAD";
        if (Phase == OkanaganMissionPhase.Scoop) return _scoopTargetWaterKg > LoadToleranceKg
            ? $"FILL {telemetry.WaterLoadKg / _scoopTargetWaterKg:P0} OF LOAD TARGET"
            : "NO SCOOP LOAD AVAILABLE";
        if ((Phase is OkanaganMissionPhase.Drop or OkanaganMissionPhase.Downwind)
            && telemetry.WaterLoadKg > 300.0) return "HOLD DROP ON THE LINE";
        if (Phase == OkanaganMissionPhase.Hold
            && _holdDwellSeconds < AirAttackHoldDwellSeconds)
            return "HOLD WEST · WAIT FOR AIR ATTACK";
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
            Math.Sin(t * 0.11) * 90.0,
            0.0,
            Math.Cos(t * 0.11) * 280.0);
        Vec3D helicopter = helicopterHorizontal with {
            Y = OkanaganGeo.RepresentativeTerrainHeightM(helicopterHorizontal) + 165.0
        };
        return [
            new OkanaganTrafficTrack("BIRD DOG 4", "AIR ATTACK", lead,
                t * 0.035 + Math.PI / 2.0, lead.Y, "ORBIT / SEQUENCE"),
            new OkanaganTrafficTrack("HELCO 7", "HELICOPTER", helicopter,
                t * 0.11 + Math.PI / 2.0, helicopter.Y, "BUCKET · DIVISION ALPHA"),
        ];
    }

    void StepReturn(in FireBossTelemetry telemetry)
    {
        if (Phase == OkanaganMissionPhase.Rtb
            && ActiveGateIndex >= _route.Count - 1
            && telemetry.PositionWorldM.Y <= AirportInitial.Y + 60
            && HorizontalDistance(telemetry.PositionWorldM, AirportInitial) < 800.0)
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
        if (_protection != null) completion = Math.Min(200, _fire.EffectiveWaterKg * .08)
            + (Phase == OkanaganMissionPhase.Complete ? _protection.OutcomeScore : 0);
        double safety = telemetry.Flyable ? 120.0 : 0.0;
        double precision = ActiveGateIndex * 16.0;
        return Math.Round(completion + safety + precision);
    }

    // A bounded game delivery model: above 450 m AGL the dispersed load earns no ground
    // effect. It is not a calibrated drop table or an instruction for real aerial firefighting.
    internal static double DropDeliveryFraction(double clearanceM) => !double.IsFinite(clearanceM) || clearanceM < 0
        ? 0 : Math.Clamp((450 - clearanceM) / 330, 0, 1);

    double ReturnClimbFuel(Vec3D position) => _incident == null || HorizontalDistance(position, AirportInitial) < 20_000
        ? 0 : 20 + Math.Max(0, _cruiseAltitude - position.Y) / FireBossMissionPerformance.RequiredClimbMps * .15;

    FireBossFuelSnapshot FuelPlanFor(in FireBossTelemetry telemetry) => FireBossFuelPlan.Snapshot(_blockFuelKg,
        telemetry.FuelKg, telemetry.PositionWorldM, CompletedCycles, _plannedOutboundFuel,
        ReturnClimbFuel(telemetry.PositionWorldM), _plannedMinimumRtb);

    static Vec3D Ground(Vec3D point, double clearance) => point with { Y = OkanaganCdem.SampleSurfaceHeightM(point) + clearance };

    internal static double CorridorAltitude(Vec3D from, Vec3D to, double clearance)
    {
        double altitude = 700;
        int steps = Math.Max(1, (int)Math.Ceiling(HorizontalDistance(from,to) / 100));
        for (int i=0; i<=steps; i++) altitude = Math.Max(altitude, OkanaganCdem.SampleSurfaceHeightM(from + (to-from)*(i/(double)steps)) + clearance);
        return Math.Ceiling(altitude / 50) * 50;
    }

    // The load has to reach buildings. Protection wets sites within 185 m of the release track and
    // a salvo lands within about 100 m of track, so a run aimed at the fire's geometric centre can
    // put the whole load on empty slope: at Apex the nearest mapped building to that centre is
    // 300 m away, and a 2026-09-07 flown drop there wetted nothing. Aim the defence run through
    // the exposed buildings nearest the fire, at the site where one load along the downhill run
    // reaches the most of them. The rule is deterministic and reads directly off the mapped sites.
    internal static Vec3D DefenceLineAnchor(OkanaganIncident incident, Vec3D uphill)
    {
        if (incident.Sites.Count == 0) return Ground(incident.Ignition + new Vec3D(200,0,160), 0);
        OkanaganSite best = incident.Sites[0];
        double bestScore = double.NegativeInfinity;
        foreach (OkanaganSite candidate in incident.Sites
            .OrderBy(s => HorizontalDistance(s.Position, incident.Ignition)).Take(24)) {
            // A salvo opened about two seconds short of the aim lands from roughly 100 m short of
            // it to just past it along the downhill run. Score the candidate by how much of that
            // footprint reaches buildings, with the same 185 m falloff the wetting model applies.
            Vec3D a = candidate.Position + uphill * 100, b = candidate.Position - uphill * 10;
            double score = incident.Sites.Sum(s => Math.Max(0, 1 - SegmentDistance(s.Position, a, b) / 185));
            if (score > bestScore + 1e-9) { best = candidate; bestScore = score; }
        }
        return Ground(best.Position, 0);
    }

    static double SegmentDistance(Vec3D p, Vec3D a, Vec3D b)
    {
        double dx = b.X - a.X, dz = b.Z - a.Z, length = dx * dx + dz * dz;
        double t = length > 0 ? Math.Clamp(((p.X - a.X) * dx + (p.Z - a.Z) * dz) / length, 0, 1) : 0;
        return Math.Sqrt(Math.Pow(p.X - (a.X + dx * t), 2) + Math.Pow(p.Z - (a.Z + dz * t), 2));
    }

    static Vec3D UphillDirection(Vec3D target)
    {
        Vec3D gradient = new(OkanaganCdem.SampleSurfaceHeightM(target + new Vec3D(100,0,0)) - OkanaganCdem.SampleSurfaceHeightM(target - new Vec3D(100,0,0)), 0,
            OkanaganCdem.SampleSurfaceHeightM(target + new Vec3D(0,0,100)) - OkanaganCdem.SampleSurfaceHeightM(target - new Vec3D(0,0,100)));
        return gradient.Length > 1 ? gradient.Normalized() : new Vec3D(0,0,1);
    }

    IEnumerable<OkanaganRouteGate> DefenceRoute(OkanaganMissionPhase phase)
    {
        Vec3D target = IncidentTarget;
        if (phase == OkanaganMissionPhase.Climb) {
            yield return Gate("lift-off", "LIFT OFF", LoadedLiftoff, 650, 54);
            yield return Gate("lake-climb", "CLIMB OVER LAKE", OkanaganGeo.ToWorld(49.917, -119.510, _cruiseAltitude + 60), 800, 58);
        } else if (phase is OkanaganMissionPhase.Ingress or OkanaganMissionPhase.Drop) {
            // Enter from the valley side at terrain-clear cruise altitude, then work downhill.
            Vec3D uphill = _incidentUphill;
            yield return Gate("ridge-join", "ALIGN WITH DEFENCE RUN", (target + uphill * 6_000) with {Y = _cruiseAltitude}, 350, 58);
            Vec3D entry = target + uphill * 4_500;
            entry = entry with { Y = _cruiseAltitude };
            double dropClearance = _incident?.Id == "apex" ? 160 : 110;
            Vec3D dropStart = Ground(target + uphill * 300, dropClearance);
            yield return Gate("ridge-entry", "RIDGE ENTRY", entry, 450, 62);
            // A straight descent chord can pass through a secondary summit (notably at Apex).
            // Sample the approach relief too, instead of checking only the two endpoint gates,
            // and never ask for a climb on the way down: a gate lifted over relief also lifts
            // every gate before it, so the profile holds altitude until the relief is behind.
            var approach = new Vec3D[20];
            for (int i = 1; i < 21; i++) {
                Vec3D point = entry + (dropStart - entry) * (i / 21.0);
                approach[i - 1] = point with { Y = Math.Max(point.Y, OkanaganCdem.SampleSurfaceHeightM(point) + 160) };
            }
            for (int i = approach.Length - 2; i >= 0; i--)
                approach[i] = approach[i] with { Y = Math.Max(approach[i].Y, approach[i + 1].Y) };
            for (int i = 0; i < approach.Length; i++)
                yield return Gate($"terrain-approach-{i + 1}", "TERRAIN CLEARANCE", approach[i], 160, 58);
            yield return Gate("drop-start", "DEFENCE LINE", dropStart, 180, 58);
            yield return Gate("drop-line", "DROP · DOWNHILL", Ground(target - uphill * 350, dropClearance - 10), 220, 58);
            yield return Gate("escape", "CLIMB TO ESCAPE", Ground(target - uphill * 1_400, 450), 650, 62);
        } else {
            Vec3D exit = Ground(IncidentTarget - _incidentUphill * 1_800, 350);
            bool apexValleyExit = _incident?.Id == "apex" && _earlyReturnOrigin == null;
            if (apexValleyExit)
            {
                // Authored CDEM-checked valley escape: the apparent downhill continuation
                // crosses a second ridge before an aircraft can climb clear after its drop.
                var turn = OkanaganGeo.ToWorld(49.3823356091, -119.8805749981, 2100);
                yield return Gate("apex-valley-turn", "TURN RIGHT · FOLLOW VALLEY", turn, 250, 60);
            }
            else if (_earlyReturnOrigin == null)
                yield return Gate("sector-exit", "CONTINUE DOWNHILL · CLIMB", exit, 450, 60);
            Vec3D returnOrigin = apexValleyExit
                ? OkanaganGeo.ToWorld(49.3796406755, -119.8512999982, 2200)
                : _earlyReturnOrigin ?? exit;
            Vec3D lakeArrival = OkanaganGeo.ToWorld(49.950, -119.482, 850);
            double safeAltitude = CorridorAltitude(returnOrigin, lakeArrival, 400);
            Vec3D climbOrigin = apexValleyExit ? returnOrigin : _earlyReturnOrigin ?? returnOrigin - _incidentUphill * 1_800;
            yield return Gate("escape-climb", apexValleyExit ? "CLIMB CLEAR · FOLLOW VALLEY" : "CLIMB BEFORE CROSSING",
                climbOrigin with {Y=Math.Max(returnOrigin.Y, safeAltitude+80)}, apexValleyExit ? 250 : 400, 60);
            // Remain above every ridge still ahead, then descend at no more than 4% along the
            // return. A vertical stack over the airport hills was neither a lake hold nor a
            // usable descent. These intermediate gates keep the gradual descent in the route.
            int steps = Math.Max(1, (int)Math.Ceiling(HorizontalDistance(returnOrigin, lakeArrival) / 2_000));
            double altitude = apexValleyExit ? Math.Max(safeAltitude, returnOrigin.Y) : safeAltitude;
            double leg = HorizontalDistance(returnOrigin, lakeArrival) / steps;
            for (int i = 1; i <= steps; i++) {
                Vec3D p = returnOrigin + (lakeArrival - returnOrigin) * (i / (double)steps);
                altitude = Math.Max(850, Math.Max(altitude - leg * .04, CorridorAltitude(p, lakeArrival, 300)));
                yield return Gate(i == steps ? "lake-return" : $"return-descent-{i}",
                    "RETURN · TERRAIN CLEARANCE", p with {Y=altitude}, 500, 62);
            }
            yield return Gate("lake-descent", "DESCEND OVER LAKE", lakeArrival, 350, 58);
            yield return Gate("rtb-crossing", "CROSS TO AIRPORT", RtbCrossing, 450, 58);
            yield return Gate("airport-initial", "JOIN RUNWAY 16", AirportInitial, 800, 58);
        }
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
