using GunsOnly.Sim.Turbulence;

namespace GunsOnly.Sim.Doctrine;

/// <summary>
/// Holds the opponent to the briefed reciprocal flight path through one offset neutral pass, then
/// hands the same physical state to the ordinary reactive BFM pilot. This is scenario geometry,
/// not a combat kinematic shortcut: both aircraft use <see cref="AircraftSim"/> throughout, and
/// only the opponent's pilot command changes after the pass.
/// </summary>
public sealed class NeutralMergeBandit :
    IBandit,
    IBanditDecisionTraceSource,
    IFormationDirectiveSink,
    IAdaptiveAiPlanner {
    const double MergeGateM = 900.0;
    const double OpeningConfirmationSeconds = 0.20;
    readonly AircraftParams _parameters;
    readonly AircraftSim _mergeSim;
    /// Carried across the merge gate so the opening pair keeps setting the player up after the
    /// neutral pass ends, instead of snapping straight into a fight they cannot win.
    readonly bool _presenting;

    /// Before the merge gate this is the briefed intent; after it, the live fight owns the answer.
    public bool Presenting => _fight?.Presenting ?? _presenting;
    readonly PilotSkill _skill;
    readonly BanditSkillProfile _profile;
    readonly int? _doctrineIndex;
    int? _lookaheadCadencePhase;
    AiComputeLevel _computeLevel = AiComputeLevel.Full;
    bool _incrementalAiPlanning;
    GunsOnly.Sim.Environment.ITerrainSurface? _terrain;
    ReactiveBandit? _fight;
    IWindField? _wind;
    IAtmosphereModel _atmosphere;
    double _previousRangeM = double.NaN;
    double _minimumRangeM = double.PositiveInfinity;
    double _openingSeconds;
    FormationDirective _formationDirective;

    public NeutralMergeBandit(AircraftState initial, AircraftParams parameters,
        PilotSkill skill = PilotSkill.Competent,
        GunsOnly.Sim.Environment.ITerrainSurface? terrain = null,
        BanditSkillProfile? profile = null,
        int? doctrineIndex = null,
        bool presenting = false) {
        _presenting = presenting;
        _parameters = parameters;
        _skill = skill;
        _profile = profile ?? BanditSkillProfile.For(skill);
        int doctrineCount = System.Math.Max(1, _profile.DoctrineCount);
        if (doctrineIndex is < 0 || doctrineIndex >= doctrineCount)
            throw new System.ArgumentOutOfRangeException(nameof(doctrineIndex));
        _doctrineIndex = doctrineIndex;
        _terrain = terrain;
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
    /// The selected aircraft belongs to both phases. These seams verify that a director-staged
    /// opening does not revert to the beat's authored mount when the reactive pilot takes over.
    public AircraftParams BriefedAircraftParameters => _parameters;
    public AircraftParams? FightAircraftParameters => _fight?.AircraftParameters;
    internal int? LookaheadCadencePhase => _fight?.LookaheadCadencePhase
        ?? _lookaheadCadencePhase;
    public AiComputeLevel ComputeLevel => _fight?.ComputeLevel ?? _computeLevel;
    public AiWorkloadCounters AiWorkload => _fight?.AiWorkload ?? default;
    /// The tier this actor fields across both phases: the scripted merge is briefed at the same
    /// tier its post-pass ReactiveBandit fights at, so snapshot consumers read one stable value.
    public PilotSkill Skill => _skill;
    public double ThrustFraction => _fight?.ThrustFraction ?? _mergeSim.ThrustFraction;
    public bool CatastrophicallyDamaged => _fight?.CatastrophicallyDamaged ?? false;
    public bool WreckSettled => _fight?.WreckSettled ?? false;
    public ImpactSurface WreckSurface => _fight?.WreckSurface ?? ImpactSurface.None;
    public bool WreckSurfaceChangedThisStep =>
        _fight?.WreckSurfaceChangedThisStep ?? false;
    public BanditDecisionTrace DecisionTrace =>
        (_fight as IBanditDecisionTraceSource)?.DecisionTrace ?? default;
    public BanditPolicyMemory PolicyMemory =>
        (_fight as IBanditDecisionTraceSource)?.PolicyMemory ?? default;
    public PilotCommand AppliedCommand =>
        (_fight as IBanditDecisionTraceSource)?.AppliedCommand ??
        _mergeSim.LastAppliedCommand;
    public FormationDirective FormationDirective => _fight?.FormationDirective
        ?? _formationDirective;

    /// <summary>
    /// Cache the radio assignment through the authored neutral pass. It becomes tactical input
    /// only after BeginFight, so coordination cannot bend or shorten the briefed merge geometry.
    /// </summary>
    public void AcceptFormationDirective(in FormationDirective directive) {
        _formationDirective = directive;
        _fight?.AcceptFormationDirective(directive);
    }

    /// <summary>
    /// Cache host pressure through the authored merge, then forward it to the reactive planner at
    /// handoff. The scripted reciprocal pass performs no speculative forecast work itself.
    /// </summary>
    public void ConfigureAiPlanning(AiComputeLevel level, bool incremental) {
        if (!System.Enum.IsDefined(level))
            throw new System.ArgumentOutOfRangeException(nameof(level));
        _computeLevel = level;
        _incrementalAiPlanning = incremental;
        _fight?.ConfigureAiPlanning(level, incremental);
    }

    /// <summary>
    /// Cache the actor's absolute lookahead lane across the authored neutral-pass handoff.
    /// </summary>
    internal void ConfigureLookaheadCadencePhase(int phase) {
        if (phase < 0 || phase >= ReactiveBandit.LookaheadDecisionCadenceTicks)
            throw new System.ArgumentOutOfRangeException(nameof(phase));
        _lookaheadCadencePhase = phase;
        _fight?.ConfigureLookaheadCadencePhase(phase);
    }

    public bool WantsToFire(in ActorObservation player) =>
        _fight?.WantsToFire(player) ?? false;

    public void Step(in ActorObservation player, double dt) {
        if (!double.IsFinite(dt) || dt <= 0.0)
            throw new ArgumentOutOfRangeException(nameof(dt));
        if (_fight is not null) {
            _fight.Step(player, dt);
            T += dt;
            return;
        }

        _mergeSim.Step(ReciprocalPassCommand(), dt);
        T += dt;

        double rangeM = Geometry.Range(player, _mergeSim.State);
        _minimumRangeM = Math.Min(_minimumRangeM, rangeM);
        bool opening = _minimumRangeM <= MergeGateM
            && double.IsFinite(_previousRangeM)
            && rangeM > _previousRangeM
            && rangeM >= _minimumRangeM + 20.0;
        _openingSeconds = opening ? _openingSeconds + dt : 0.0;
        _previousRangeM = rangeM;
        if (_openingSeconds >= OpeningConfirmationSeconds)
            BeginFight(player.ContactIdentity);
    }

    public void ApplyCatastrophicDamage(int handedness) {
        BeginFight();
        _fight!.ApplyCatastrophicDamage(handedness);
    }

    public void ApplySurfaceImpact(ImpactSurface surface, in Vec3D surfaceVelocity,
        double surfaceHeightM, Carrier? carrier = null,
        GunsOnly.Sim.Environment.ITerrainSurface? terrain = null) {
        BeginFight();
        _fight!.ApplySurfaceImpact(surface, surfaceVelocity, surfaceHeightM, carrier, terrain);
    }

    /// <summary>Follow a session terrain replacement through to the active fight controller.</summary>
    public void UpdateTerrain(GunsOnly.Sim.Environment.ITerrainSurface? terrain) {
        _terrain = terrain;
        _fight?.UpdateTerrain(terrain);
    }

    PilotCommand ReciprocalPassCommand() => new(
        GDemand: 1.0,
        BankTarget: _mergeSim.State.Bank,
        Throttle: Math.Min(1.0, _parameters.MaxThrustFraction),
        Rudder: 0.0);

    void BeginFight(long contactIdentity = 0) {
        if (_fight is not null) return;
        var fight = new ReactiveBandit(
            _mergeSim.State, _parameters, _skill, _terrain,
            profile: _profile, doctrineIndex: _doctrineIndex,
            presenting: _presenting) {
            Wind = _wind,
            Atmosphere = _atmosphere
        };
        if (_lookaheadCadencePhase is int phase)
            fight.ConfigureLookaheadCadencePhase(phase);
        fight.ConfigureAiPlanning(_computeLevel, _incrementalAiPlanning);
        fight.SeedEnginePowerFraction(_mergeSim.ThrustFraction);
        fight.SeedHeldCommand(
            _mergeSim.LastAppliedCommand,
            contactIdentity);
        fight.AcceptFormationDirective(_formationDirective);
        _fight = fight;
    }
}
