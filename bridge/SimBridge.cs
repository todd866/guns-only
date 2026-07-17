using Godot;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly;

public partial class SimBridge : Node {
    AircraftSim _player = null!;
    RailBandit _bandit = null!;
    BeatSetup _beat = null!;
    KeyGrammar _keys = null!;
    DetentLayer _detents = null!;
    PromptTracker _prompts = null!;
    PromptCue _cue;
    DoctrineAdvice _advice = new(1.0, 0.0, "free");
    double _acc, _simTimeMs;
    const double Dt = 1.0 / AircraftSim.TickHz;
    int _shotsInWindow, _shotsTotal;
    bool _triggerDown;

    public override void _Ready() => StartBeat(1);

    public void StartBeat(int index) {
        var variant = _detents?.Variant ?? ValleyVariant.DoctrineDeep;
        _beat = index switch { 2 => Beats.BreakDefense(), 3 => Beats.Saddle(), _ => Beats.Perch() };
        _player = new AircraftSim(_beat.Player, FlightModel.Sabre);
        _bandit = new RailBandit(_beat.Bandit, FlightModel.Sabre, _beat.BanditTimeline);
        _keys = new KeyGrammar();
        _detents = new DetentLayer { Variant = variant };
        _prompts = new PromptTracker();
        _advice = new DoctrineAdvice(1.0, 0.0, "setup");
        _cue = PromptCue.None;
        _triggerDown = false;
        _acc = 0; _shotsInWindow = 0; _shotsTotal = 0;
        // _simTimeMs deliberately NOT reset: one monotonic clock for grammar timestamps across beats.
    }
    public void FeedKey(int gkey, bool pressed) => _keys.Feed((GKey)gkey, pressed, _simTimeMs);
    public void SetVariant(int v) => _detents.Variant = v == 1 ? ValleyVariant.PhysicsOnly : ValleyVariant.DoctrineDeep;
    public int GetVariant() => _detents.Variant == ValleyVariant.PhysicsOnly ? 1 : 0;
    public void Trigger(bool down) {
        if (down && !_triggerDown) { _shotsTotal++; if (CameraSolver.GunWindow(_player.State, _bandit.State)) _shotsInWindow++; }
        _triggerDown = down;
    }

    public override void _PhysicsProcess(double delta) {
        _acc = System.Math.Min(_acc + delta, 0.25); // cap catch-up: a suspended app must not replay minutes of sim
        while (_acc >= Dt) {
            _advice = _beat.Law.Advise(_player.State, _bandit.State, FlightModel.Sabre);
            _detents.Tick(_keys, _simTimeMs, _player.State, FlightModel.Sabre, _advice, Dt);
            _cue = _prompts.Cue(_advice, _detents.Command, _detents.Tier);
            _player.Step(_detents.Command, Dt);
            _bandit.Step(Dt);
            _simTimeMs += Dt * 1000.0; _acc -= Dt;
        }
    }

    static Transform3D ToGodot(in AircraftState s, in GunsOnly.Sim.Vec3D liftDir) {
        var origin = new Vector3((float)s.Position.X, (float)s.Position.Y, (float)(-s.Position.Z));
        var fwdSim = s.ForwardDir();
        var fwd = new Vector3((float)fwdSim.X, (float)fwdSim.Y, (float)(-fwdSim.Z)).Normalized();
        var up = new Vector3((float)liftDir.X, (float)liftDir.Y, (float)(-liftDir.Z)).Normalized();
        // Basis built directly from the kernel's frame: no world-up reconstruction, no bank
        // rotation, no sign conventions to mirror (review finding: the old path rendered
        // every roll backwards and snapped 180 deg at loop apex).
        var zAxis = -fwd;                          // Godot forward = -Z
        var xAxis = up.Cross(zAxis).Normalized();  // right-handed: x = y cross z
        return new Transform3D(new Basis(xAxis, up, zAxis), origin);
    }
    public Transform3D GetPlayerTransform() => ToGodot(_player.State, _player.LiftDir);
    public Transform3D GetBanditTransform() => ToGodot(_bandit.State, _bandit.LiftDir);

    public Godot.Collections.Dictionary GetHud() {
        var s = _player.State;
        return new Godot.Collections.Dictionary {
            {"speed_kts", s.Speed * 1.94384}, {"alt_ft", s.Position.Y * 3.28084},
            {"g_actual", _player.LastNz}, {"g_cmd", _detents.Command.GDemand},
            {"g_valley", _detents.ValleyG},
            {"g_maxperform", Protection.MaxPerformG(s, FlightModel.Sabre)},
            {"g_hardmax", Protection.HardMaxG(s, FlightModel.Sabre)},
            {"sticky", _detents.StickyOffsetG}, {"tier", (int)_detents.Tier},
            {"variant", GetVariant()}, {"buffet", _player.Buffet},
            {"prompt", (int)_cue},
            {"context", _advice.Context},
            {"angle_off_deg", Geometry.AngleOff(s, _bandit.State) * 57.2958},
            {"range_m", Geometry.Range(s, _bandit.State)},
            {"gun_window", CameraSolver.GunWindow(s, _bandit.State)},
            {"beat", _beat.Name},
            {"shots_total", _shotsTotal}, {"shots_in_window", _shotsInWindow},
        };
    }
    // Camera access for the rig (GDScript): returns [pos, lookat, up] for the given mode.
    // The pose carries its own up vector — Godot look_at forbids view||up, which a fixed
    // Vector3.UP hits at vertical geometries (review finding).
    public Godot.Collections.Array GetCameraPose(int mode) {
        var pose = CameraSolver.Solve((CameraMode)mode, _player.State, _bandit.State);
        return new Godot.Collections.Array {
            new Vector3((float)pose.Position.X, (float)pose.Position.Y, (float)(-pose.Position.Z)),
            new Vector3((float)pose.LookAt.X, (float)pose.LookAt.Y, (float)(-pose.LookAt.Z)),
            new Vector3((float)pose.Up.X, (float)pose.Up.Y, (float)(-pose.Up.Z)),
        };
    }
}
