namespace GunsOnly.Sim.Doctrine;

public sealed partial class ReactiveBandit {
    // Opted in by the session for the single F-22 ramp opponent. Frozen modes and pair support
    // retain their existing controller. This is pursuit guidance, not extra aircraft authority.
    internal bool AttackReengagementEnabled { get; set; }
    bool _attackReengagementActive;
    bool _attackChaseLatched;
    long? _attackContactIdentity;
    double _lookaheadPlanAttackLeadSeconds;

    // FUN: a vertical fight is followed, not declined. For the opted-in ramp opponent the
    // per-fight ceiling rises with the player (to the fixed combat ceiling), so a high yo-yo or
    // a climbing player is chased up instead of triggering a nose-cold energy extension.
    // Frozen modes and pair support keep the staged ceiling. Not extra aircraft authority.
    const double VerticalFightHeadroomM = 600.0;
    double FightCeilingM(in ActorObservation player) => AttackReengagementEnabled
        ? System.Math.Min(CombatCeilingM, System.Math.Max(_ceilingM, player.Position.Y + VerticalFightHeadroomM))
        : _ceilingM;

    // FUN: the finisher must not become a 50-second stare. Traced 2026-10-13 (N Ace and D1
    // Veteran vs a climbing turn): the closed-loop finisher latched 6-10 deg off the lead at
    // 800-900 m and held there for 50 s without one round, because its rate-limited law never
    // closes the last degrees on a target turning as hard as it can. A pilot who is not getting
    // the shot repositions. If no tick inside the trigger's reach arrives within a tier's
    // patience, hand the fight back to the planner (high/low yo-yo, max-G pull, reversal all
    // compete there) and keep the finisher out briefly so the choice can play out. Patience is
    // the tier's decision quality: the Competent fixates longest, the Ace gives up soonest.
    // Opt-in ramp opponent only; frozen fixtures keep the historical latch.
    internal bool FineTrackLatched => _fineTrackLatched;
    double _fineTrackProgressAt;
    double _fineTrackRetryAt = double.NegativeInfinity;
    const double FineTrackRetrySeconds = 2.0;
    double FineTrackPatienceSeconds => Skill switch {
        PilotSkill.Competent => 5.0,
        PilotSkill.Veteran => 3.5,
        _ => 2.5,
    };

    bool FineTrackOutOfPatience(in ActorObservation player, double leadErrorRad) {
        if (!AttackReengagementEnabled) return false;
        bool progress = leadErrorRad <= 2.0 * EffectiveLeadFireConeRad
            || (_profile.FiresOnBodyGate
                && BanditFireControl.InFiringEnvelope(State, player, EffectiveFireConeRad));
        if (progress) {
            _fineTrackProgressAt = T;
            return false;
        }
        if (T - _fineTrackProgressAt < FineTrackPatienceSeconds) return false;
        _fineTrackRetryAt = T + FineTrackRetrySeconds;
        return true;
    }

    internal string AttackStatus => !AttackReengagementEnabled ? "off"
        : Presenting ? "present"
        : _terrainRecoveryActive ? "terrain-recovery"
        : Tactic == BanditTactic.Energy ? (_ceilingDenial ? "energy-ceiling" : "energy-speed")
        : Tactic == BanditTactic.Defend ? "defend"
        : _attackReengagementActive ? "intercept"
        : _attackChaseLatched ? "chase"
        : "track";

    void UpdateAttackReengagement(in ActorObservation player, bool lowTarget) {
        if (_attackContactIdentity != player.ContactIdentity) {
            _attackContactIdentity = player.ContactIdentity;
            _attackReengagementActive = false;
            _attackChaseLatched = false;
        }
        double range = Geometry.Range(State, player);
        if (!AttackReengagementEnabled || Presenting || lowTarget
            || Tactic == BanditTactic.Defend || range > AbandonChaseRangeM) {
            _attackReengagementActive = false;
            return;
        }
        if (range < ReengageRangeM) {
            _attackReengagementActive = false;
            return;
        }
        if ((Tactic == BanditTactic.Return || IsOpeningBeyondReengageRange(player))
            && range > ReengageRangeM) _attackReengagementActive = true;
    }

    // Same observation-limited coordinated-turn assumption as ScoreCandidate, integrated in
    // closed form. A six-second bound avoids extending that belief indefinitely.
    static Vec3D AttackInterceptPoint(in ActorObservation player, double seconds) {
        double rate = FlightModel.G0 * System.Math.Tan(System.Math.Clamp(player.Bank, -1.3, 1.3))
            / System.Math.Max(player.Speed, 1.0);
        if (System.Math.Abs(rate) < 1e-5) return player.Position + player.VelocityVector() * seconds;
        double endChi = player.Chi + rate * seconds;
        double flatSpeed = player.Speed * System.Math.Cos(player.Gamma);
        return player.Position + new Vec3D(
            flatSpeed * (System.Math.Cos(player.Chi) - System.Math.Cos(endChi)) / rate,
            player.Speed * System.Math.Sin(player.Gamma) * seconds,
            flatSpeed * (System.Math.Sin(endChi) - System.Math.Sin(player.Chi)) / rate);
    }

    // Use earlier speed bleed for the 4.8-G Competent pilot's reversal.
    // Higher tiers retain their established throttle schedule; early bleed starved Veteran's
    // attack opportunities in the same three-seed early-fire contract.
    double AttackTurnSpeedMps => Skill == PilotSkill.Competent ? _lowSpeedMps : _highSpeedMps;

    // FUN: the Competent's over-pull into the vertical is its exploitable mistake, but it must
    // not cost a minute. Traced O1 vs cohort (2026-10-13): zoomed to 79 deg at 115 m/s, and the
    // wings-level -0.2 G unload drops the nose at only ~2 deg/s there (cos(gamma) ~ 0.2), so the
    // jet hung nose-high for 25 s and returned after 55 s. Very steep and slow, a pilot rolls the
    // lift vector below the horizon toward the fight and pulls gently: the nose falls ~4x faster
    // through the normal roll/G actuators. Side latched so the roll never reverses.
    const double SteepZoomGammaRad = 1.0;     // 57 deg: below this the unload is already quick
    const double ZoomSliceBankRad = 2.6;      // 149 deg: lift vector well below the horizon
    const double ZoomSliceG = 1.5;            // gentle at low speed; capped by available G below
    int _zoomSliceSide;

    PilotCommand AttackEnergyRecoveryCommand(in ActorObservation player) {
        var own = State;
        if (own.Gamma > SteepZoomGammaRad || (_zoomSliceSide != 0 && own.Gamma > 0.35)) {
            if (_zoomSliceSide == 0) {
                double toward = LimitedBankTo(player.Position with { Y = own.Position.Y }, 1.3);
                _zoomSliceSide = System.Math.Abs(toward) > 1e-3 ? System.Math.Sign(toward) : _breakSign;
            }
            double sliceG = System.Math.Min(ZoomSliceG, System.Math.Max(0.5, AvailableAcquireG(safetyReserve: false)));
            return new PilotCommand(sliceG, _zoomSliceSide * ZoomSliceBankRad, _maximumThrottle, 0.0);
        }
        _zoomSliceSide = 0;
        // A slow aircraft cannot pull its way out of a zoom. Unload first; steer toward
        // the fight in a shallow descending turn once the flight path reaches the horizon.
        // This is pilot intent through the normal G/roll actuators, not a pose correction.
        double bank = own.Gamma > 0.09 ? 0.0 : LimitedBankTo(player.Position, 0.65);
        const double recoveryGamma = -0.15; // surrogate pilot target, not an airframe limit
        double verticalG = System.Math.Cos(own.Gamma)
            + (recoveryGamma - own.Gamma) * own.Speed / (2.0 * FlightModel.G0);
        double g = verticalG / System.Math.Cos(bank);
        return new PilotCommand(System.Math.Clamp(g, -0.20, 1.1), bank, _maximumThrottle, 0.0);
    }

    PilotCommand AttackInterceptCommand(in ActorObservation player) {
        var own = State;
        double range = Geometry.Range(own, player);
        var aim = player.Position + player.VelocityVector()
            * System.Math.Clamp(range / System.Math.Max(own.Speed, 150.0) * 0.35, 0.0, 6.0);
        double floor = System.Math.Max(LocalFloorM(own.Position.X, own.Position.Z),
            LocalFloorM(own.Position.X + own.ForwardDir().X * 900.0,
                own.Position.Z + own.ForwardDir().Z * 900.0));
        aim = aim with { Y = System.Math.Clamp(aim.Y, floor + 300.0,
            System.Math.Max(floor + 300.0, FightCeilingM(player) - 180.0)) };
        var forward = own.ForwardDir();
        var line = (aim - own.Position).Normalized();
        double angle = System.Math.Acos(System.Math.Clamp(forward.Dot(line), -1.0, 1.0));
        var normal = line - forward * forward.Dot(line);
        var right = new Vec3D(0.0, 1.0, 0.0).Cross(forward);
        if (right.Length < 1e-6)
            right = new Vec3D(System.Math.Cos(own.Chi), 0.0, -System.Math.Sin(own.Chi));
        else right = right.Normalized();
        var up = forward.Cross(right).Normalized();
        if (normal.Length < 1e-6) normal = right * _breakSign;
        double maxG = AvailableAcquireG(safetyReserve: false);
        // Gravity support plus a bounded turn acceleration avoids the old fixed 1.4-G floor,
        // which climbed even in an aligned pursuit. Project onto the safely limited bank below.
        var lift = normal.Normalized() * (maxG * System.Math.Min(1.0, angle / 0.5))
            + up * System.Math.Cos(own.Gamma);
        double bank = System.Math.Atan2(lift.Dot(right), lift.Dot(up));
        double drop = own.Position.Y - aim.Y;
        double horizontal = HorizontalDistance(own.Position, aim);
        // Preserve the established re-engage slice gates, AFTER resolving the path floor.
        bool slice = drop > 0.0 && (angle > System.Math.PI / 2.0 || drop > 0.35 * horizontal)
            && own.Position.Y - floor > 1500.0 && own.Speed > 135.0;
        double bankLimit = slice ? 2.0 : 1.30;
        bank = System.Math.Clamp(bank, -bankLimit, bankLimit);
        double g = lift.Dot(right) * System.Math.Sin(bank) + lift.Dot(up) * System.Math.Cos(bank);
        double throttle = own.Speed > AttackTurnSpeedMps && angle > CornerTurnNoseOffRad
            ? System.Math.Min(_maximumThrottle, CornerTurnThrottle) : _maximumThrottle;
        return new PilotCommand(System.Math.Clamp(g, -0.20, System.Math.Max(-0.20, maxG)), bank, throttle, 0.0);
    }
}
