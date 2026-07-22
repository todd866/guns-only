using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim.Doctrine;

/// <summary>
/// Holds the opponent to the briefed reciprocal flight path through one offset neutral pass, then
/// hands the same physical state to the ordinary reactive BFM pilot. This is scenario geometry,
/// not a combat kinematic shortcut: both aircraft use <see cref="AircraftSim"/> throughout, and
/// only the opponent's pilot command changes after the pass.
/// </summary>
public sealed class NeutralMergeBandit : IBandit {
    const double MergeGateM = 900.0;
    const double OpeningConfirmationSeconds = 0.20;
    readonly AircraftParams _parameters;
    readonly AircraftSim _mergeSim;
    readonly PilotSkill _skill;
    ReactiveBandit? _fight;
    IWindField? _wind;
    IAtmosphereModel _atmosphere;
    double _previousRangeM = double.NaN;
    double _minimumRangeM = double.PositiveInfinity;
    double _openingSeconds;

    public NeutralMergeBandit(AircraftState initial, AircraftParams parameters,
        PilotSkill skill = PilotSkill.Competent) {
        _parameters = parameters;
        _skill = skill;
        _mergeSim = new AircraftSim(initial, parameters);
        _atmosphere = _mergeSim.AtmosphereModel;
    }

    public AircraftState State => _fight?.State ?? _mergeSim.State;
    public Vec3D LiftDir => _fight?.LiftDir ?? _mergeSim.LiftDir;
    public IWindField? Wind {
        get => _wind;
        set {
            _wind = value;
            _mergeSim.Wind = value;
            if (_fight is not null) _fight.Wind = value;
        }
    }
    public IAtmosphereModel Atmosphere {
        get => _atmosphere;
        set {
            ArgumentNullException.ThrowIfNull(value);
            _atmosphere = value;
            _mergeSim.AtmosphereModel = value;
            if (_fight is not null) _fight.Atmosphere = value;
        }
    }
    public double T { get; private set; }
    public bool FirstPassComplete => _fight is not null;
    /// The pilot tier this merge is briefed to hand its post-pass dogfight to, and (once the pass
    /// completes) the tier actually flying. Null before the handoff, mirroring FirstPassComplete —
    /// an honest inspection seam for verifying the flagship opener fields the intended tier.
    public PilotSkill BriefedSkill => _skill;
    public PilotSkill? FightSkill => _fight?.Skill;
    public double ThrustFraction => _fight?.ThrustFraction ?? _mergeSim.ThrustFraction;
    public bool CatastrophicallyDamaged => _fight?.CatastrophicallyDamaged ?? false;
    public bool WreckSettled => _fight?.WreckSettled ?? false;
    public ImpactSurface WreckSurface => _fight?.WreckSurface ?? ImpactSurface.None;
    public bool WreckSurfaceChangedThisStep =>
        _fight?.WreckSurfaceChangedThisStep ?? false;

    public bool WantsToFire(in AircraftState player) =>
        _fight?.WantsToFire(player) ?? false;

    public void Step(in AircraftState player, double dt) {
        if (!double.IsFinite(dt) || dt <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(dt));
        if (_fight is not null) {
            _fight.Step(player, dt);
            T += dt;
            return;
        }

        _mergeSim.Step(new PilotCommand(
            GDemand: 1.0,
            BankTarget: _mergeSim.State.Bank,
            Throttle: Math.Min(1.0, _parameters.MaxThrustFraction),
            Rudder: 0.0), dt);
        T += dt;

        double rangeM = Geometry.Range(player, _mergeSim.State);
        _minimumRangeM = Math.Min(_minimumRangeM, rangeM);
        bool opening = _minimumRangeM <= MergeGateM
            && double.IsFinite(_previousRangeM)
            && rangeM > _previousRangeM
            && rangeM >= _minimumRangeM + 20.0;
        _openingSeconds = opening ? _openingSeconds + dt : 0.0;
        _previousRangeM = rangeM;
        if (_openingSeconds >= OpeningConfirmationSeconds) BeginFight();
    }

    public void ApplyCatastrophicDamage(int handedness) {
        BeginFight();
        _fight!.ApplyCatastrophicDamage(handedness);
    }

    public void ApplySurfaceImpact(ImpactSurface surface, in Vec3D surfaceVelocity,
        double surfaceHeightM, Carrier? carrier = null) {
        BeginFight();
        _fight!.ApplySurfaceImpact(surface, surfaceVelocity, surfaceHeightM, carrier);
    }

    void BeginFight() {
        if (_fight is not null) return;
        var fight = new ReactiveBandit(_mergeSim.State, _parameters, _skill) {
            Wind = _wind,
            Atmosphere = _atmosphere
        };
        fight.SeedEnginePowerFraction(_mergeSim.ThrustFraction);
        _fight = fight;
    }
}
