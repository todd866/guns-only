using GunsOnly.Sim;
using GunsOnly.Sim.Cobra;
using GunsOnly.Sim.Cobra.GroundWar;
using GunsOnly.Sim.Vehicles;

namespace GunsOnly.UnityBridge;

/// <summary>
/// Unity companion host for Cobra Canyon / Hold the Bridge (Vietnam pack).
/// Owns <see cref="CobraMissionRuntime"/> and projects a PoseSnapshot the existing Unity client
/// can consume, plus ground-war unit samples for presentation.
/// </summary>
public sealed class UnityCobraSession : IDisposable {
    // Match web/wwwroot/render/cobra/cobra_pilot_input.js — without this the ship feels like a
    // fixed-wing with a collective stick: W/S invert, cyclic latches dives, collective flies away.
    const double CollectiveFullTravelPerSecond = 0.40;
    const double CyclicFullTravelPerSecond = 2.5;
    const double PedalFullTravelPerSecond = 2.5;
    const double CyclicLevelingGainPerRad = 3.0;
    const double CyclicLevelingAuthority = 0.5;

    readonly CobraMissionRuntime _runtime;
    VerticalLiftPilotCommand _command;
    readonly bool[] _keys = new bool[16];
    bool _disposed;
    string? _selectedTargetId;
    bool _targetSelectedByPilot;
    bool _cycleTargetHeld;

    UnityCobraSession(CobraMissionRuntime runtime) {
        _runtime = runtime;
        double hover = runtime.Cobra.EstimateHoverCollective(
            runtime.Cobra.State.GrossMassKg,
            CobraMissionRuntime.DefaultAirDensityKgM3);
        _command = new VerticalLiftPilotCommand(hover, 0, 0, 0);
    }

    public CobraMissionRuntime Runtime => _runtime;
    public CobraMissionStatus Status => _runtime.Status;
    public long Tick => _runtime.Cobra.State.Tick;
    public double SimulationTimeS =>
        _runtime.Cobra.State.Tick / (double)PlayerVehicleContract.FixedStepHz;

    public static UnityCobraSession StartRiverGorge() {
        CobraCanyonDefinition definition = CobraCanyonDefinition.Create();
        var runtime = new CobraMissionRuntime(
            definition,
            definition.CreateTerrainSurface(),
            CobraCanyonRouteChoice.RiverGorge);
        return new UnityCobraSession(runtime);
    }

    public void FeedKeyCode(int keyCode, bool pressed) {
        if (keyCode == CobraGoldenPathTracker.CycleTargetInputCode) {
            if (pressed && !_cycleTargetHeld)
                CycleSelectedTarget();
            _cycleTargetHeld = pressed;
            return;
        }
        if (keyCode < 0 || keyCode >= _keys.Length) return;
        _keys[keyCode] = pressed;
        // Web V adopts the preferred mark when no explicit Tab designation exists, then owns
        // only the presentation padlock. Mirror that authority transition without cycling an
        // already selected target every time the pilot looks at it.
        if (keyCode == (int)GKey.Padlock && pressed && !_targetSelectedByPilot)
            CycleSelectedTarget();
        // Do not snap axes here — Advance integrates slew/spring like the browser pilot seam.
    }

    public void ReleaseWeaponsHold() {
        // Cobra uses per-tick engagement consent via Trigger; nothing sticky to clear.
    }

    /// <summary>
    /// Browser cobra_pilot_input: collective is a lever (held rate), cyclic/pedals slew and
    /// spring-center; idle cyclic springs onto a bounded attitude-leveling command so a one-tap
    /// dive does not latch forever under rate-command rotorcraft dynamics.
    /// </summary>
    void IntegratePilotControls(double dt) {
        if (dt <= 0.0) return;

        double collective = _command.Collective;
        double collRate = 0.0;
        if (_keys[6]) collRate += 1.0; // pull / increase
        if (_keys[7]) collRate -= 1.0; // push / decrease
        collective = Clamp01(collective + collRate * CollectiveFullTravelPerSecond * dt);

        double forwardTarget = 0.0;
        if (_keys[1]) forwardTarget += 1.0; // push / nose down
        if (_keys[0]) forwardTarget -= 1.0; // pull / nose up
        bool forwardIdle = Math.Abs(forwardTarget) < 1e-9;

        double rightTarget = 0.0;
        if (_keys[3]) rightTarget += 1.0;
        if (_keys[2]) rightTarget -= 1.0;
        bool rightIdle = Math.Abs(rightTarget) < 1e-9;

        double yawTarget = 0.0;
        if (_keys[5]) yawTarget += 1.0;
        if (_keys[4]) yawTarget -= 1.0;

        PlayerVehicleObservation obs = _runtime.Cobra.Observation;
        if (forwardIdle) {
            // Positive pitch (nose up) needs forward cyclic to level — same as browser.
            forwardTarget = Clamp(
                obs.PitchRad * CyclicLevelingGainPerRad,
                -CyclicLevelingAuthority,
                CyclicLevelingAuthority);
        }
        if (rightIdle) {
            // Positive roll (right wing down) needs left cyclic to level.
            rightTarget = Clamp(
                -obs.RollRad * CyclicLevelingGainPerRad,
                -CyclicLevelingAuthority,
                CyclicLevelingAuthority);
        }

        double forward = MoveToward(
            _command.ForwardCyclic, forwardTarget, CyclicFullTravelPerSecond * dt);
        double right = MoveToward(
            _command.RightCyclic, rightTarget, CyclicFullTravelPerSecond * dt);
        double yaw = MoveToward(
            _command.Yaw, yawTarget, PedalFullTravelPerSecond * dt);

        _command = new VerticalLiftPilotCommand(collective, forward, right, yaw);
    }

    public bool TriggerHeld => _keys[8];

    public int Advance(double deltaSeconds, int maximumCompressionFactor = 1) {
        const double step = 1.0 / PlayerVehicleContract.FixedStepHz;
        int ticks = 0;
        double remaining = Math.Min(deltaSeconds, 0.1);
        while (remaining + 1e-12 >= step && ticks < 12 && _runtime.MissionFlyable) {
            IntegratePilotControls(step);
            _runtime.Advance(_command);
            RefreshSelectedTarget();
            // Magazine must not drain outside the M28A1 envelope — that burned 900 rounds
            // in a banked "OUT OF LIMITS" recording while the HUD lied about why.
            if (TriggerHeld && TryAssessSelected(out CobraGunTargetAssessment fireAssess)
                && fireAssess.WithinTurretEnvelope && fireAssess.HasBallisticSolution) {
                _runtime.ApplyAuthorizedGunfire(_selectedTargetId);
            }
            ticks++;
            remaining -= step;
        }
        return ticks;
    }

    bool TryAssessSelected(out CobraGunTargetAssessment assess) {
        assess = default;
        if (!_targetSelectedByPilot || _selectedTargetId is null) return false;
        GroundUnit? target = null;
        foreach (GroundUnit unit in _runtime.GroundWar.Units) {
            if (unit.Id != _selectedTargetId) continue;
            target = unit;
            break;
        }
        if (target is null || !target.IsAlive) return false;
        PlayerVehicleObservation obs = _runtime.Cobra.Observation;
        assess = CobraGunTargeting.Assess(
            obs.PositionWorldM, obs.YawRad, target.PositionWorldM);
        return true;
    }

    public void AdvanceSeconds(double seconds) {
        double remaining = seconds;
        while (remaining > 1e-9 && _runtime.MissionFlyable) {
            double dt = Math.Min(1.0 / 60.0, remaining);
            Advance(dt);
            remaining -= dt;
        }
    }

    void RefreshSelectedTarget() {
        if (!_targetSelectedByPilot) {
            _selectedTargetId = null;
            return;
        }
        IReadOnlyList<GroundUnit> targets = OrderedHostileTargets();
        if (targets.Count == 0) {
            _selectedTargetId = null;
            _targetSelectedByPilot = false;
            return;
        }
        if (_selectedTargetId is not null
            && targets.Any(unit => unit.Id == _selectedTargetId))
            return;
        _selectedTargetId = targets[0].Id;
    }

    void CycleSelectedTarget() {
        IReadOnlyList<GroundUnit> targets = OrderedHostileTargets();
        if (targets.Count == 0) {
            _selectedTargetId = null;
            _targetSelectedByPilot = false;
            return;
        }
        int current = -1;
        for (int i = 0; i < targets.Count; i++) {
            if (targets[i].Id != _selectedTargetId) continue;
            current = i;
            break;
        }
        int next = !_targetSelectedByPilot || current < 0 ? 0 : (current + 1) % targets.Count;
        _selectedTargetId = targets[next].Id;
        _targetSelectedByPilot = true;
    }

    IReadOnlyList<GroundUnit> OrderedHostileTargets() {
        Vec3D own = _runtime.Cobra.Observation.PositionWorldM;
        return _runtime.GroundWar.Units
            .Where(unit => unit.IsAlive && unit.Faction == GroundFaction.Hostile)
            .OrderBy(unit => unit.Id == CobraGroundWarRuntime.GunnerySeamUnitId ? 0 : 1)
            .ThenBy(unit => {
                Vec3D delta = unit.PositionWorldM - own;
                return delta.Dot(delta);
            })
            .ThenBy(unit => unit.Id, StringComparer.Ordinal)
            .ToArray();
    }

    public PoseSnapshot CapturePose() {
        PlayerVehicleObservation obs = _runtime.Cobra.Observation;
        Vec3D pos = obs.PositionWorldM;
        double yaw = obs.YawRad;
        double pitch = obs.PitchRad;
        double roll = obs.RollRad;
        // Forward in sim ENU: yaw 0 = north (+Z), pitch raises nose.
        double cp = Math.Cos(pitch), sp = Math.Sin(pitch);
        double cy = Math.Cos(yaw), sy = Math.Sin(yaw);
        var fwd = new Vec3(sy * cp, sp, cy * cp);
        var left = new Vec3(-cy, 0, sy);

        RefreshSelectedTarget();
        GroundUnit? hostile = null;
        if (_selectedTargetId is not null) {
            foreach (GroundUnit unit in _runtime.GroundWar.Units) {
                if (unit.Id == _selectedTargetId) {
                    hostile = unit;
                    break;
                }
            }
        }

        bool opponent = hostile is { IsAlive: true };
        Vec3 bandit = default;
        Vec3 banditFwd = new(0, 0, 1);
        if (opponent) {
            Vec3D hp = hostile!.PositionWorldM;
            bandit = new Vec3(hp.X, hp.Y, hp.Z);
        }

        double altFt = pos.Y * 3.28084;
        double headingDeg = ((yaw * (180.0 / Math.PI)) % 360.0 + 360.0) % 360.0;
        double tasKts = obs.TrueAirspeedMps * 1.9438444924406;
        double vsFpm = obs.VerticalSpeedMps * 196.8503937;

        GroundUnitWire[] units = ProjectUnits();

        CobraRouteGuidance guidance = _runtime.Diagnostics.RouteGuidance;
        double clearanceM = guidance.CurrentClearanceM ?? Math.Max(0.0, pos.Y - SampleTerrainHeight(pos.X, pos.Z));
        Vec3D fob = _runtime.GroundWar.Fob.CentreWorldM;
        double fobEast = fob.X - pos.X;
        double fobNorth = fob.Z - pos.Z;
        double fobRangeM = Math.Sqrt(fobEast * fobEast + fobNorth * fobNorth);
        RotorcraftTelemetry rotor = _runtime.Cobra.Telemetry;

        string gunStatus = "none";
        if (_runtime.GroundWar.Magazine.IsDry) {
            gunStatus = "dry";
        } else if (opponent) {
            CobraGunTargetAssessment assess = CobraGunTargeting.Assess(
                pos, yaw, hostile!.PositionWorldM);
            if (!assess.WithinTurretEnvelope) gunStatus = "outoflimits";
            else if (!assess.HasBallisticSolution) gunStatus = "nosolution";
            else if (TriggerHeld) gunStatus = "firing";
            else gunStatus = "tracking";
        }

        return new PoseSnapshot(
            Tick: _runtime.Cobra.State.Tick,
            SimulationTimeS: SimulationTimeS,
            Lifecycle: _runtime.Status.ToString(),
            Player: new Vec3(pos.X, pos.Y, pos.Z),
            PlayerForward: fwd,
            PlayerLeft: left,
            OpponentPresent: opponent,
            Bandit: bandit,
            BanditForward: banditFwd,
            BanditLeft: new Vec3(-1, 0, 0),
            PlayerAltitudeFt: altFt,
            PlayerHeadingDeg: headingDeg,
            PlayerHealthPermille: 1000,
            WeaponsHold: false,
            IndicatedAirspeedKts: tasKts,
            PitchDeg: pitch * (180.0 / Math.PI),
            BankDeg: roll * (180.0 / Math.PI),
            VerticalSpeedFpm: vsFpm,
            Mach: tasKts / 661.0,
            MissionPack: "cobra-vietnam",
            AmmoRounds: _runtime.GroundWar.Magazine.RoundsRemaining,
            ControlBalance: _runtime.GroundWar.Balance.Control,
            RotorRpm: rotor.MainRotorRpm,
            Collective01: _command.Collective,
            ClearanceM: clearanceM,
            FobRangeM: fobRangeM,
            TorqueNm: rotor.TransmissionTorqueNm,
            TorqueLimitFraction: rotor.TransmissionLimitFraction,
            Units: units,
            GunStatus: gunStatus,
            VictoryHoldProgress: _runtime.GroundWar.VictoryHoldProgress,
            HostileKills: _runtime.GroundWar.Debrief.HostileKillsByPlayer,
            CobraTargetSelected: _targetSelectedByPilot);
    }

    double SampleTerrainHeight(double eastM, double northM) {
        if (_runtime.Terrain.TrySample(eastM, northM, out var sample))
            return sample.HeightM;
        return 0.0;
    }

    GroundUnitWire[] ProjectUnits() {
        var list = new List<GroundUnitWire>(32);
        foreach (GroundUnit unit in _runtime.GroundWar.Units) {
            if (!unit.IsAlive && !unit.IsWreck) continue;
            Vec3D p = unit.PositionWorldM;
            list.Add(new GroundUnitWire(
                (byte)(unit.Faction == GroundFaction.Friendly ? 0 : 1),
                (byte)unit.Role,
                (float)p.X,
                (float)p.Y,
                (float)p.Z,
                (float)Math.Clamp(unit.Health / Math.Max(1e-6, unit.MaxHealth), 0.0, 1.0)));
            if (list.Count >= 36) break;
        }
        return list.ToArray();
    }

    public IReadOnlyList<GroundUnit> Units => _runtime.GroundWar.Units;
    public double ControlBalance => _runtime.GroundWar.Balance.Control;
    public int Ammo => _runtime.GroundWar.Magazine.RoundsRemaining;
    public double MainRotorRpm => _runtime.Cobra.Telemetry.MainRotorRpm;
    public double Collective => _command.Collective;

    static double MoveToward(double current, double target, double maxStep) {
        double step = Math.Abs(maxStep);
        if (Math.Abs(target - current) <= step) return target;
        return current + Math.Sign(target - current) * step;
    }

    static double Clamp01(double v) => Clamp(v, 0.0, 1.0);

    static double Clamp(double v, double lo, double hi) =>
        v < lo ? lo : v > hi ? hi : v;

    public void Dispose() {
        if (_disposed) return;
        _disposed = true;
        // CobraMissionRuntime has no Dispose today; reserved for future host resources.
    }
}
