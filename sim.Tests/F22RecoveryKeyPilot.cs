using GunsOnly.Sim.Recovery;

namespace GunsOnly.Sim.Tests;

/// <summary>How a keyboard pilot flies the recovery boxes.</summary>
public sealed record RecoveryKeyPilotProfile(
    string Name,
    double ReactionSeconds,
    // Human: proportional holds. Kid: fixed coarse holds.
    bool Coarse,
    double RollHoldMs,
    double PitchHoldMs,
    double RollDeadbandDeg,
    double PitchDeadbandDeg,
    double MaxBankDeg) {
    public static RecoveryKeyPilotProfile Human { get; } =
        new("human", 0.25, false, 0, 0, 2.0, 0.5, 60.0);
    // The owner's main player: 450 ms reaction, fixed coarse holds, no proportional skill.
    public static RecoveryKeyPilotProfile Kid { get; } =
        new("kid", 0.45, true, 250, 300, 3.0, 1.5, 70.0);
}

/// <summary>
/// A HUD-cue recovery pilot on the real key path. It perceives only what the Build 380 HUD
/// draws: the next box relative to the flight-path marker, the bank on the ladder, and the GEAR
/// cue in the NEXT row. It never reads positions, gates or targets directly, and it never
/// touches the throttle (full assist owns the lever).
/// </summary>
public sealed class F22RecoveryKeyPilot {
    const double Dt = 1.0 / AircraftSim.TickHz;
    readonly RecoveryKeyPilotProfile _p;
    readonly Queue<(double t, Percept cue)> _seen = new();
    double _nextDecision;
    double _gearRetryAt;
    readonly Dictionary<GKey, double> _releaseAt = new();
    public int KeyEvents { get; private set; }
    public int GearPresses { get; private set; }

    public readonly record struct Percept(bool Valid, double RightDeg, double UpDeg,
        double BankDeg, bool GearNow);

    public F22RecoveryKeyPilot(RecoveryKeyPilotProfile profile) => _p = profile;

    /// HUD-equivalent perception: the box relative to the flight-path predictor dot, in glass
    /// degrees (body axes), plus the bank on the ladder and the GEAR cue.
    public static Percept Perceive(SimulationSession s) {
        F22OverheadCourse course = s.F22Course;
        if (!course.Armed || course.Complete || !s.ConventionalRtbPatternGuidanceActive)
            return default;
        AircraftSim own = s.Player;
        Vec3D box = course.Carrot.Position - own.State.Position;
        Vec3D dot = F22OverheadCourse.Predictor(own.State, course.CarrotLeadSeconds_)
            - own.State.Position;
        Vec3D f = own.BodyForward, u = own.BodyUp, r = own.BodyRight;
        static double Ang(Vec3D d, Vec3D axis, Vec3D fwd) =>
            Math.Atan2(d.Dot(axis), Math.Max(1e-6, d.Dot(fwd))) * 180 / Math.PI;
        Vec3D bn = box.Normalized(), pn = dot.Normalized();
        double right = Ang(bn, r, f) - Ang(pn, r, f);
        double up = Ang(bn, u, f) - Ang(pn, u, f);
        if (bn.Dot(f) <= 0.05) {
            right = Math.Sign(bn.Dot(r) + 1e-9) * 90;
            up = Math.Sign(bn.Dot(u)) * 20;
        }
        double kcas = own.IndicatedAirspeedMps * AirData.MpsToKnots;
        bool gearNow = course.NextGateNeedsGear && !s.PlayerSystems.AllGearDownAndLocked
            && s.PlayerSystems.GearHandle == LandingGearHandle.Up && kcas <= 250.0;
        return new Percept(true, right, up, own.State.Bank * 180 / Math.PI, gearNow);
    }

    void Press(SimulationSession s, GKey key, double until) {
        if (!_releaseAt.ContainsKey(key)) { s.FeedKey(key, true); KeyEvents++; }
        _releaseAt[key] = until;
    }

    void Release(SimulationSession s, GKey key) {
        if (_releaseAt.Remove(key)) { s.FeedKey(key, false); KeyEvents++; }
    }

    public void ReleaseAll(SimulationSession s) {
        foreach (GKey k in _releaseAt.Keys.ToList()) Release(s, k);
    }

    public void Drive(SimulationSession s) {
        double t = s.TimeSeconds;
        foreach (var (key, until) in _releaseAt.ToList())
            if (t >= until) Release(s, key);
        _seen.Enqueue((t, Perceive(s)));
        Percept view = default;
        bool have = false;
        while (_seen.Count > 0 && _seen.Peek().t <= t - _p.ReactionSeconds) {
            view = _seen.Dequeue().cue;
            have = true;
        }
        if (!have || t < _nextDecision || !view.Valid) return;
        _nextDecision = t + _p.ReactionSeconds;

        if (view.GearNow && t >= _gearRetryAt) {
            _gearRetryAt = t + 3.0;
            s.FeedKey(GKey.GearToggle, true);
            s.FeedKey(GKey.GearToggle, false);
            GearPresses++;
        }

        if (_p.Coarse) {
            // The kid (a8's model): box right of the marker on the glass → hold right; box
            // above → pull; well below → push. Body-frame glass directions, no horizon reasoning.
            if (Math.Abs(view.RightDeg) > _p.RollDeadbandDeg) {
                bool right = view.RightDeg > 0;
                Release(s, right ? GKey.RollLeft : GKey.RollRight);
                Press(s, right ? GKey.RollRight : GKey.RollLeft, t + _p.RollHoldMs / 1000.0);
            }
            if (view.UpDeg > _p.PitchDeadbandDeg) {
                Release(s, GKey.PushDown);
                Press(s, GKey.PullUp, t + _p.PitchHoldMs / 1000.0);
            } else if (view.UpDeg < -2.0 * _p.PitchDeadbandDeg) {
                Release(s, GKey.PullUp);
                Press(s, GKey.PushDown, t + _p.PitchHoldMs / 1000.0);
            }
            return;
        }
        // The human reads the glass against the horizon: how far the box is left/right of the
        // flight-path marker and how far above/below it (the ladder gives the bank).
        double b = view.BankDeg * Math.PI / 180.0;
        double horizontal = view.RightDeg * Math.Cos(b) + view.UpDeg * Math.Sin(b);
        double vertical = -view.RightDeg * Math.Sin(b) + view.UpDeg * Math.Cos(b);
        // Bank toward the box, no further than a comfortable bank; the neutral stick then holds
        // the turn level, and the pitch keys only move the marker up or down onto the box.
        // The dot moves sideways with bank: roll the dot onto the box.
        double wantBank = Math.Clamp(view.BankDeg + horizontal * 2.0, -_p.MaxBankDeg, _p.MaxBankDeg);
        double bankErr = wantBank - view.BankDeg;
        if (Math.Abs(bankErr) > _p.RollDeadbandDeg) {
            double ms = Math.Clamp(Math.Abs(bankErr) * 4.0, 30, 300);
            GKey key = bankErr > 0 ? GKey.RollRight : GKey.RollLeft;
            Release(s, bankErr > 0 ? GKey.RollLeft : GKey.RollRight);
            Press(s, key, t + ms / 1000.0);
        }
        if (Math.Abs(vertical) > _p.PitchDeadbandDeg) {
            double ms = Math.Clamp(Math.Abs(vertical) * 40, 30, 220);
            bool pull = vertical > 0;
            Release(s, pull ? GKey.PushDown : GKey.PullUp);
            Press(s, pull ? GKey.PullUp : GKey.PushDown, t + ms / 1000.0);
        }
    }
}
