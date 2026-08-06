namespace GunsOnly.Sim.Doctrine;

/// <summary>
/// A small, explicit tactical vocabulary for a two-ship. Pressure preserves the ordinary
/// independent pursuit law; Bracket asks the support fighter to build lateral separation; Extend
/// asks it to regain spacing before recommitting.
/// </summary>
public enum FormationTacticalRole {
    Independent,
    Pressure,
    Bracket,
    Extend
}

/// <summary>
/// One radio-delivered assignment. SharedContact is deliberately a sampled observation rather
/// than current AircraftState truth: formation awareness can be delayed without degrading the
/// individual pilot's own sight picture or fire control.
/// </summary>
public readonly record struct FormationDirective(
    FormationTacticalRole Role,
    int LateralSign,
    long PartnerId,
    long AssignmentSequence,
    ActorObservation SharedContact);

/// <summary>Optional formation input for policies which understand two-ship tactics.</summary>
public interface IFormationDirectiveSink {
    FormationDirective FormationDirective { get; }
    void AcceptFormationDirective(in FormationDirective directive);
}

/// <summary>An ordered member supplied at the session's beginning-of-tick boundary.</summary>
public readonly record struct FormationCoordinationMember(
    long Id,
    AircraftState State,
    bool Active = true);

/// <summary>
/// Deterministic two-ship radio coordinator. It assigns one pressure fighter and one support
/// fighter, samples shared contact updates on a fixed cadence, and delivers them after a fixed
/// communication delay. It supplies intent only; each member still flies through its own pilot
/// policy and AircraftSim.
/// </summary>
public sealed class EnemyPairCoordinator {
    public const int EvaluationIntervalTicks = 180;
    public const int MessageDelayTicks = 42;
    public const int MinimumRoleDwellTicks = 360;
    // A delivered picture is trusted for one collection interval. The next sample still spends
    // MessageDelayTicks in the radio path, so ordinary one-tick-at-a-time session stepping now has
    // a short, honest stale window before each refresh instead of making the stale fallback
    // reachable only by skipping hundreds of coordinator ticks in one call.
    public const int SharedContactStaleAfterTicks = EvaluationIntervalTicks;
    // One healthy delivery period: a sample is taken every EvaluationIntervalTicks and then spends
    // MessageDelayTicks in the radio path, so the picture age sawtooths up to exactly this value in
    // completely normal operation.
    public const int DeliveryPeriodTicks =
        EvaluationIntervalTicks + MessageDelayTicks;
    // Health-signal threshold, deliberately distinct from the BEHAVIOURAL
    // SharedContactStaleAfterTicks above, which is a pilot-policy decision and not a fault report.
    //
    // The arithmetic that sets this number: a healthy cycle sawtooths the age from
    // MessageDelayTicks (42) up to exactly DeliveryPeriodTicks (222), so anything at or below 222
    // must stay quiet. Miss ONE scheduled delivery and the picture is not refreshed for another
    // collection interval, peaking at DeliveryPeriodTicks + EvaluationIntervalTicks = 402. So a
    // watchdog that actually detects a single missed delivery has to sit strictly inside (222, 402].
    // Half a collection interval of headroom above the healthy peak buys jitter tolerance while
    // still leaving 90 ticks (0.5 s) of the missed-delivery gap above the line.
    //
    // 2 * DeliveryPeriodTicks (444) was tried and rejected: it is ABOVE 402, so it could not fire
    // on a missed delivery at all and would only have caught the coordinator ceasing to be stepped.
    public const int SharedContactHealthStaleAfterTicks =
        DeliveryPeriodTicks + EvaluationIntervalTicks / 2;
    public const double ExtendPairSeparationM = 850.0;

    readonly record struct PendingAssignment(
        long DueTick,
        long PrimaryId,
        long SupportId,
        FormationTacticalRole PrimaryRole,
        FormationTacticalRole SupportRole,
        int PrimaryLateralSign,
        int SupportLateralSign,
        long AssignmentSequence,
        ActorObservation SharedContact);

    long _primaryId;
    long _supportId;
    FormationTacticalRole _primaryRole;
    FormationTacticalRole _supportRole;
    int _primaryLateralSign;
    int _supportLateralSign;
    long _assignmentSequence;
    long _nextEvaluationTick;
    long _lastRoleChangeTick;
    long _lastTick;
    ActorObservation _sharedContact;
    PendingAssignment? _pending;

    public bool Active { get; private set; }
    public FormationTacticalRole PrimaryRole =>
        Active ? _primaryRole : FormationTacticalRole.Independent;
    public FormationTacticalRole SupportRole =>
        Active ? _supportRole : FormationTacticalRole.Independent;
    public long AssignmentSequence => Active ? _assignmentSequence : 0;
    public int SharedContactAgeTicks => Active
        ? AgeContact(_sharedContact, _lastTick).ObservationAgeTicks
        : 0;
    /// Behavioural staleness: the pilot policy falls back to its own senses past this age.
    /// True once per normal refresh cycle by construction — never publish it as a health signal.
    public bool SharedContactStale => Active
        && SharedContactAgeTicks > SharedContactStaleAfterTicks;
    /// Health staleness: a scheduled delivery was genuinely missed. Published as the NEW
    /// formation_coordination_health_stale — deliberately not as formation_coordination_stale,
    /// which keeps meaning the behavioural window it has always meant so that a 264-vs-265
    /// comparison of that field compares like with like.
    public bool SharedContactHealthStale => Active
        && SharedContactAgeTicks > SharedContactHealthStaleAfterTicks;

    public void Reset() {
        Active = false;
        _primaryId = 0;
        _supportId = 0;
        _primaryRole = FormationTacticalRole.Independent;
        _supportRole = FormationTacticalRole.Independent;
        _primaryLateralSign = 0;
        _supportLateralSign = 0;
        _assignmentSequence = 0;
        _nextEvaluationTick = 0;
        _lastRoleChangeTick = 0;
        _lastTick = 0;
        _sharedContact = default;
        _pending = null;
    }

    public void Step(
        long tick,
        in ActorObservation player,
        in FormationCoordinationMember primary,
        in FormationCoordinationMember support) {
        ValidateInputs(tick, player, primary, support);
        if (!primary.Active || !support.Active) {
            Reset();
            return;
        }

        if (!Active
            || primary.Id != _primaryId
            || support.Id != _supportId) {
            Seed(tick, player, primary, support);
            return;
        }

        _lastTick = tick;
        if (_pending is { } pending && tick >= pending.DueTick)
            Deliver(pending, tick);

        if (tick < _nextEvaluationTick) return;

        EvaluateAndQueue(tick, player, primary, support);
        _nextEvaluationTick = tick + EvaluationIntervalTicks;
    }

    public FormationDirective DirectiveFor(long memberId, long tick) {
        if (tick < 0) throw new ArgumentOutOfRangeException(nameof(tick));
        if (!Active) return default;

        ActorObservation agedContact = AgeContact(_sharedContact, tick);
        if (memberId == _primaryId) {
            return new FormationDirective(
                _primaryRole,
                _primaryLateralSign,
                _supportId,
                _assignmentSequence,
                agedContact);
        }
        if (memberId == _supportId) {
            return new FormationDirective(
                _supportRole,
                _supportLateralSign,
                _primaryId,
                _assignmentSequence,
                agedContact);
        }
        return default;
    }

    void Seed(
        long tick,
        in ActorObservation player,
        in FormationCoordinationMember primary,
        in FormationCoordinationMember support) {
        Active = true;
        _primaryId = primary.Id;
        _supportId = support.Id;
        _primaryRole = FormationTacticalRole.Pressure;
        _supportRole = FormationTacticalRole.Bracket;
        _primaryLateralSign = 0;
        _supportLateralSign = BracketSign(support.State, player);
        _assignmentSequence = 1;
        _lastRoleChangeTick = tick;
        _lastTick = tick;
        _sharedContact = player;
        _pending = new PendingAssignment(
            tick + MessageDelayTicks,
            _primaryId,
            _supportId,
            _primaryRole,
            _supportRole,
            _primaryLateralSign,
            _supportLateralSign,
            _assignmentSequence + 1,
            player);
        _nextEvaluationTick = tick + EvaluationIntervalTicks;
    }

    void EvaluateAndQueue(
        long tick,
        in ActorObservation player,
        in FormationCoordinationMember primary,
        in FormationCoordinationMember support) {
        FormationTacticalRole nextPrimaryRole = _primaryRole;
        FormationTacticalRole nextSupportRole = _supportRole;
        int nextPrimarySign = _primaryLateralSign;
        int nextSupportSign = _supportLateralSign;

        if (tick - _lastRoleChangeTick >= MinimumRoleDwellTicks) {
            double primaryPressureScore = PressureScore(primary.State, player);
            double supportPressureScore = PressureScore(support.State, player);
            bool supportPressures =
                supportPressureScore > primaryPressureScore + 1e-9;
            double pairSeparationM =
                (primary.State.Position - support.State.Position).Length;
            // A PAIR THAT OUTNUMBERS THE PLAYER DOES NOT DISENGAGE.
            //
            // This chose Extend purely on mutual proximity, and Extend's command is to fly 1600 m
            // DIRECTLY AWAY from the player. So mid-fight the two closed, tripped the 850 m
            // threshold, one ran, came back, tripped it again — a loop. Measured over a real 915 s
            // sortie (telemetry web-1785639986509-531485): the support member spent 7.9% of the
            // fight beyond 10 km while the primary NEVER exceeded 10 km once. Same airframe, same
            // tier, same fight; the only difference was the role. That is the owner's "dash-2 just
            // flies off into the sunset".
            //
            // The trigger was wrong twice over. Two aircraft being near each other is a formation
            // safety concern, and disengaging from the target is not a response to it. And with a
            // numerical advantage, disengaging throws away the only advantage the pair has: owner
            // doctrine is "I'd happily trade two su27s to take down one f22" — commit, accept
            // losses, take the exchange.
            //
            // Splitting a tight pair now means one moves LATERALLY into a bracket, which is the
            // response that actually addresses proximity while keeping both aircraft in the fight.
            FormationTacticalRole supportRole = FormationTacticalRole.Bracket;

            if (supportPressures) {
                nextPrimaryRole = supportRole;
                nextSupportRole = FormationTacticalRole.Pressure;
                nextPrimarySign = supportRole == FormationTacticalRole.Bracket
                    ? BracketSign(primary.State, player)
                    : 0;
                nextSupportSign = 0;
            } else {
                nextPrimaryRole = FormationTacticalRole.Pressure;
                nextSupportRole = supportRole;
                nextPrimarySign = 0;
                nextSupportSign = supportRole == FormationTacticalRole.Bracket
                    ? BracketSign(support.State, player)
                    : 0;
            }
        }

        _pending = new PendingAssignment(
            tick + MessageDelayTicks,
            _primaryId,
            _supportId,
            nextPrimaryRole,
            nextSupportRole,
            nextPrimarySign,
            nextSupportSign,
            _assignmentSequence + 1,
            player);
    }

    void Deliver(in PendingAssignment pending, long tick) {
        // Membership changes reset the coordinator synchronously, so an old queued transmission
        // can never assign the survivor a dead partner.
        if (pending.PrimaryId != _primaryId
            || pending.SupportId != _supportId) {
            _pending = null;
            return;
        }

        bool roleChanged = pending.PrimaryRole != _primaryRole
            || pending.SupportRole != _supportRole;
        _primaryRole = pending.PrimaryRole;
        _supportRole = pending.SupportRole;
        _primaryLateralSign = pending.PrimaryLateralSign;
        _supportLateralSign = pending.SupportLateralSign;
        _assignmentSequence = pending.AssignmentSequence;
        _sharedContact = pending.SharedContact;
        _pending = null;
        if (roleChanged) _lastRoleChangeTick = tick;
    }

    static int BracketSign(
        in AircraftState member,
        in ActorObservation player) {
        Vec3D forward = player.ForwardDir();
        var horizontalForward = new Vec3D(forward.X, 0.0, forward.Z);
        if (horizontalForward.Length < 1e-9)
            horizontalForward = new Vec3D(0.0, 0.0, 1.0);
        else
            horizontalForward = horizontalForward.Normalized();
        var right = new Vec3D(
            horizontalForward.Z, 0.0, -horizontalForward.X);
        double lateralM = (member.Position - player.Position).Dot(right);
        // Exact ties follow formation order: the support member is assigned the positive side.
        return lateralM < 0.0 ? -1 : 1;
    }

    static double PressureScore(
        in AircraftState member,
        in ActorObservation player) {
        Vec3D line = player.Position - member.Position;
        double rangeM = line.Length;
        double noseDot = rangeM > 1e-9
            ? member.ForwardDir().Dot(line * (1.0 / rangeM))
            : 1.0;
        return -0.001 * rangeM
            + 2.0 * noseDot
            + 0.002 * member.Speed;
    }

    static ActorObservation AgeContact(
        in ActorObservation contact,
        long tick) {
        long sourceAge = Math.Max(0L, tick - contact.SourceTick);
        long age = Math.Max(contact.ObservationAgeTicks, sourceAge);
        int boundedAge = age > int.MaxValue ? int.MaxValue : (int)age;
        double confidenceScale = Math.Max(
            0.0,
            1.0 - 0.5 * boundedAge
                / (SharedContactStaleAfterTicks + 1.0));
        return contact with {
            ObservationAgeTicks = boundedAge,
            Confidence = Math.Clamp(
                contact.Confidence * confidenceScale,
                0.0,
                1.0)
        };
    }

    static void ValidateInputs(
        long tick,
        in ActorObservation player,
        in FormationCoordinationMember primary,
        in FormationCoordinationMember support) {
        if (tick < 0) throw new ArgumentOutOfRangeException(nameof(tick));
        if (!player.IsFinite)
            throw new ArgumentException(
                "Shared contact must be finite.", nameof(player));
        if (primary.Id <= 0)
            throw new ArgumentOutOfRangeException(nameof(primary));
        if (support.Id <= 0 || support.Id == primary.Id)
            throw new ArgumentOutOfRangeException(nameof(support));
        if (!StateIsFinite(primary.State))
            throw new ArgumentException(
                "Primary state must be finite.", nameof(primary));
        if (!StateIsFinite(support.State))
            throw new ArgumentException(
                "Support state must be finite.", nameof(support));
    }

    static bool StateIsFinite(in AircraftState state) =>
        state.Position.IsFinite
        && double.IsFinite(state.Speed)
        && state.Speed >= 0.0
        && double.IsFinite(state.Gamma)
        && double.IsFinite(state.Chi)
        && double.IsFinite(state.Bank)
        && double.IsFinite(state.Mass)
        && state.Mass >= 0.0;
}
