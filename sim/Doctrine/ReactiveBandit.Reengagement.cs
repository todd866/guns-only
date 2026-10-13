namespace GunsOnly.Sim.Doctrine;

public sealed partial class ReactiveBandit {
    // Opted in by the session for the single F-22 ramp opponent. Frozen modes and pair support
    // retain their existing controller. This is pursuit guidance, not extra aircraft authority.
    internal bool AttackReengagementEnabled { get; set; }
    bool _attackReengagementActive;
    bool _attackChaseLatched;
    long? _attackContactIdentity;
    double _lookaheadPlanAttackLeadSeconds;

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

    PilotCommand AttackInterceptCommand(in ActorObservation player) {
        var own = State;
        double range = Geometry.Range(own, player);
        var aim = player.Position + player.VelocityVector()
            * System.Math.Clamp(range / System.Math.Max(own.Speed, 150.0) * 0.35, 0.0, 6.0);
        double floor = System.Math.Max(LocalFloorM(own.Position.X, own.Position.Z),
            LocalFloorM(own.Position.X + own.ForwardDir().X * 900.0,
                own.Position.Z + own.ForwardDir().Z * 900.0));
        aim = aim with { Y = System.Math.Clamp(aim.Y, floor + 300.0,
            System.Math.Max(floor + 300.0, _ceilingM - 180.0)) };
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
        double throttle = own.Speed > _highSpeedMps && angle > CornerTurnNoseOffRad
            ? System.Math.Min(_maximumThrottle, CornerTurnThrottle) : _maximumThrottle;
        return new PilotCommand(System.Math.Clamp(g, -0.20, System.Math.Max(-0.20, maxG)), bank, throttle, 0.0);
    }
}
