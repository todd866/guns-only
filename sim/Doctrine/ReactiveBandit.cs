namespace GunsOnly.Sim.Doctrine;

/// A flyable bandit contract. Scripted beats ignore ownship; reactive beats receive the player's
/// beginning-of-tick state so both aircraft still advance on the same deterministic time sample.
public interface IBandit {
    AircraftState State { get; }
    Vec3D LiftDir { get; }
    double T { get; }
    void Step(in AircraftState player, double dt);
}

public enum BanditTactic { Acquire, Defend, Energy, Return }

/// Deterministic, deliberately beatable BFM opponent. It owns a normal AircraftSim and supplies
/// only pilot controls: no kinematic shortcuts, wall clock, or random source enters the kernel.
public sealed class ReactiveBandit : IBandit {
    const double FloorM = 260.0;
    const double CeilingM = 3200.0;
    const double ReturnRadiusM = 5200.0;
    const double ThreatRangeM = 1500.0;
    const double DefendSeconds = 3.4;
    const double DefendCooldownSeconds = 3.8;
    const double EnergyEntryMps = 112.0;
    const double EnergyExitMps = 142.0;

    // Uneven timing, direction, and G make the break readable as a jink rather than an orbit.
    // This is a fixed deterministic sequence, advanced only while a real defensive threat exists.
    static readonly double[] JinkDurations = { 0.92, 0.63, 1.08, 0.77, 0.86 };
    static readonly int[] JinkDirections = { 1, 1, -1, 1, -1 };
    static readonly double[] JinkG = { 3.15, 2.70, 3.30, 2.85, 3.05 };

    readonly AircraftSim _sim;
    readonly Vec3D _fightCentre;
    readonly double _ceilingM;
    double _defendUntil = double.NegativeInfinity;
    double _defendCooldownUntil = double.NegativeInfinity;
    double _nextJinkAt = double.PositiveInfinity;
    int _jinkIndex;
    int _breakSign = 1;

    public ReactiveBandit(AircraftState initial, AircraftParams parameters) {
        _sim = new AircraftSim(initial, parameters);
        _fightCentre = initial.Position;
        // Preserve the original low-level fight volume while allowing a replacement fighter to
        // meet a high-altitude ownship near its present altitude (for example, after the AWACS beat).
        _ceilingM = System.Math.Max(CeilingM, initial.Position.Y + 1000.0);
    }

    /// Deterministically put a fresh fighter into a real offset, reciprocal merge. Engagement
    /// number replaces randomness: successive bogeys alternate sides and cycle modest variations
    /// in spacing/altitude while retaining fighting energy and a fair head-on presentation.
    public static ReactiveBandit SpawnForMerge(in AircraftState player,
        AircraftParams parameters, int engagementNumber) {
        if (engagementNumber < 1)
            throw new System.ArgumentOutOfRangeException(nameof(engagementNumber));

        int variation = (engagementNumber - 1) % 3;
        double side = (engagementNumber & 1) == 1 ? 1.0 : -1.0;
        var forward = new Vec3D(System.Math.Sin(player.Chi), 0.0, System.Math.Cos(player.Chi));
        var right = new Vec3D(System.Math.Cos(player.Chi), 0.0, -System.Math.Sin(player.Chi));
        double alongM = 3200.0 + variation * 260.0;
        double offsetM = side * (560.0 + variation * 110.0);
        double altitudeOffsetM = variation switch { 0 => 120.0, 1 => -80.0, _ => 40.0 };
        double altitudeM = System.Math.Max(FloorM + 260.0,
            player.Position.Y + altitudeOffsetM);
        var position = player.Position + forward * alongM + right * offsetM;
        position = position with { Y = altitudeM };

        // Aim slightly beyond ownship's current position. This is an offset head-on merge, not a
        // stationary target parked in the pipper, and the reactive pilot takes over immediately.
        var mergePoint = player.Position + forward * 420.0;
        var toMerge = mergePoint - position;
        double horizontalM = System.Math.Sqrt(toMerge.X * toMerge.X + toMerge.Z * toMerge.Z);
        double chi = System.Math.Atan2(toMerge.X, toMerge.Z);
        double gamma = System.Math.Atan2(toMerge.Y, System.Math.Max(1.0, horizontalM));
        var initial = new AircraftState(position, 180.0, gamma, chi, 0.0, parameters.MassKg);
        return new ReactiveBandit(initial, parameters);
    }

    public AircraftState State => _sim.State;
    public Vec3D LiftDir => _sim.LiftDir;
    public double T { get; private set; }
    public BanditTactic Tactic { get; private set; } = BanditTactic.Acquire;
    public PilotCommand LastCommand { get; private set; } = new(1.0, 0.0, 0.85, 0.0);

    public void Step(in AircraftState player, double dt) {
        if (!double.IsFinite(dt) || dt <= 0.0)
            throw new System.ArgumentOutOfRangeException(nameof(dt));

        SelectTactic(player);
        LastCommand = Tactic switch {
            BanditTactic.Defend => DefendCommand(),
            BanditTactic.Energy => EnergyCommand(player),
            BanditTactic.Return => ReturnCommand(),
            _ => AcquireCommand(player)
        };
        _sim.Step(LastCommand, dt);
        T += dt;
    }

    void SelectTactic(in AircraftState player) {
        var own = State;
        double radius = HorizontalDistance(own.Position, _fightCentre);

        if (Tactic == BanditTactic.Defend && T < _defendUntil) return;
        if (Tactic == BanditTactic.Defend) {
            _defendCooldownUntil = T + DefendCooldownSeconds;
            _nextJinkAt = double.PositiveInfinity;
        }

        if (radius > ReturnRadiusM || own.Position.Y > _ceilingM + 350.0) {
            Tactic = BanditTactic.Return;
            return;
        }

        if (own.Speed < EnergyEntryMps
            || (Tactic == BanditTactic.Energy && own.Speed < EnergyExitMps)) {
            Tactic = BanditTactic.Energy;
            return;
        }

        if (T >= _defendCooldownUntil && IsGunThreat(player)) {
            EnterDefence(player);
            return;
        }

        Tactic = BanditTactic.Acquire;
    }

    bool IsGunThreat(in AircraftState player) {
        var own = State;
        var ownToPlayer = player.Position - own.Position;
        double range = ownToPlayer.Length;
        if (range < 1.0 || range > ThreatRangeM) return false;

        var toPlayer = ownToPlayer * (1.0 / range);
        var playerToOwn = toPlayer * -1.0;
        double rearAspect = own.ForwardDir().Dot(toPlayer);
        double attackerAngle = player.ForwardDir().Dot(playerToOwn);
        double closing = (player.VelocityVector() - own.VelocityVector()).Dot(playerToOwn);
        return rearAspect < -0.45 && attackerAngle > 0.91 && closing > -5.0;
    }

    void EnterDefence(in AircraftState player) {
        var own = State;
        var forward = own.ForwardDir();
        var right = new Vec3D(0.0, 1.0, 0.0).Cross(forward);
        double side = right.Length < 1e-6 ? 0.0 : (player.Position - own.Position).Dot(right.Normalized());
        _breakSign = side < -1.0 ? -1 : 1;
        _jinkIndex = 0;
        _nextJinkAt = T + JinkDurations[0];
        _defendUntil = T + DefendSeconds;
        Tactic = BanditTactic.Defend;
    }

    PilotCommand AcquireCommand(in AircraftState player) {
        var own = State;
        double range = (player.Position - own.Position).Length;
        double leadSeconds = System.Math.Clamp(range / 900.0, 0.35, 1.35);
        var aim = player.Position + player.VelocityVector() * leadSeconds;
        aim = KeepAimInFightVolume(aim);

        double bank = LimitedBankTo(aim, 1.08);
        double angle = AngleTo(aim);
        // Moderate rate fighter: enough to point and threaten, below an ace's max-performance pull.
        double g = System.Math.Clamp(1.15 + angle * 1.45, 1.15, 3.20);
        double throttle = State.Speed < 145.0 ? 1.05 : State.Speed > 205.0 ? 0.45 : 0.84;
        return new PilotCommand(g, bank, throttle, 0.0);
    }

    PilotCommand DefendCommand() {
        while (T >= _nextJinkAt && T < _defendUntil) {
            _jinkIndex = (_jinkIndex + 1) % JinkDurations.Length;
            _nextJinkAt += JinkDurations[_jinkIndex];
        }

        int direction = _breakSign * JinkDirections[_jinkIndex];
        double bank = direction * 1.18;
        double g = JinkG[_jinkIndex];

        // Near the water, keep the hard turn but bias it upward rather than pulling into the sea.
        if (State.Position.Y < FloorM + 140.0) {
            var safe = new Vec3D(State.Position.X, FloorM + 420.0, State.Position.Z)
                + State.ForwardDir() * 800.0;
            bank = LimitedBankTo(safe, 0.92);
            g = 2.35;
        }
        return new PilotCommand(g, bank, 1.05, direction * 0.10);
    }

    PilotCommand EnergyCommand(in AircraftState player) {
        var own = State;
        // Unload into a shallow descending extension. Once speed is back, SelectTactic sends the
        // bandit straight back to acquire; low altitude instead commands a safe climbing turn.
        if (own.Position.Y < FloorM + 180.0) {
            var climb = KeepAimInFightVolume(player.Position with { Y = FloorM + 650.0 });
            return new PilotCommand(1.85, LimitedBankTo(climb, 0.65), 1.28, 0.0);
        }
        var extension = own.Position + own.ForwardDir() * 1200.0 + new Vec3D(0.0, -280.0, 0.0);
        return new PilotCommand(0.55, LimitedBankTo(extension, 0.38), 1.28, 0.0);
    }

    PilotCommand ReturnCommand() {
        var target = _fightCentre with { Y = System.Math.Clamp(_fightCentre.Y + 250.0, FloorM + 300.0, CeilingM - 300.0) };
        double bank = LimitedBankTo(target, 0.95);
        double angle = AngleTo(target);
        double g = System.Math.Clamp(1.2 + angle * 1.15, 1.2, 2.8);
        double throttle = State.Speed < 145.0 ? 1.05 : 0.72;
        return new PilotCommand(g, bank, throttle, 0.0);
    }

    Vec3D KeepAimInFightVolume(in Vec3D aim) {
        double y = System.Math.Clamp(aim.Y, FloorM + 180.0, _ceilingM - 180.0);
        var horizontal = new Vec3D(aim.X - _fightCentre.X, 0.0, aim.Z - _fightCentre.Z);
        if (horizontal.Length > ReturnRadiusM - 500.0)
            horizontal = horizontal.Normalized() * (ReturnRadiusM - 500.0);
        return new Vec3D(_fightCentre.X + horizontal.X, y, _fightCentre.Z + horizontal.Z);
    }

    double LimitedBankTo(in Vec3D target, double limit) =>
        System.Math.Clamp(Geometry.BankToPlaceLiftVectorOn(State, target), -limit, limit);

    double AngleTo(in Vec3D target) {
        var line = (target - State.Position).Normalized();
        return System.Math.Acos(System.Math.Clamp(State.ForwardDir().Dot(line), -1.0, 1.0));
    }

    static double HorizontalDistance(in Vec3D a, in Vec3D b) {
        double dx = a.X - b.X, dz = a.Z - b.Z;
        return System.Math.Sqrt(dx * dx + dz * dz);
    }
}
