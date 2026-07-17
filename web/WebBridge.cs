using System.Runtime.InteropServices.JavaScript;
using GunsOnly.Sim;
using GunsOnly.Sim.Doctrine;

namespace GunsOnly.Web;

/// The JS-facing facade. Deliberately a mirror of bridge/SimBridge.cs (the Godot one): same
/// 120 Hz fixed step, same detent/doctrine wiring, same HUD field names — because the whole
/// point is that BOTH shells drive the identical kernel, so the same scenario run through
/// either must produce the same telemetry. The harness (bin/mission) already emits exactly
/// that artifact, which makes it a conformance suite between desktop and web for free.
///
/// Only rendering, input and HUD are new on this side. The physics is not a port: it is the
/// same compiled C# that passes the desktop suite, running in WebAssembly.
public static partial class WebBridge {
    const double Dt = 1.0 / AircraftSim.TickHz;

    static AircraftSim _player = null!;
    static RailBandit _bandit = null!;
    static BeatSetup _beat = null!;
    static KeyGrammar _keys = null!;
    static DetentLayer _detents = null!;
    static PromptTracker _prompts = null!;
    static PromptCue _cue;
    static DoctrineAdvice _advice = new(1.0, 0.0, "setup");
    static double _acc, _simTimeMs, _lastRange, _closureKts, _closureSmooth;
    static int _shotsTotal, _shotsInWindow;
    static bool _triggerDown;
    static int _beatIndex = 1;
    static bool _knockedOff;
    /// The fight is over: impacted the sea, or the player called knock-it-off. The sim stops
    /// stepping. Before this, a 12G pull from inverted flew THROUGH the sea to -10,679 ft and
    /// kept integrating, because nothing ever checked.
    static bool Frozen => _knockedOff || (_player?.BelowGround ?? false);

    [JSExport]
    public static void StartBeat(int index) {
        var variant = _detents?.Variant ?? ValleyVariant.DoctrineDeep;
        _beatIndex = index;
        _knockedOff = false;
        _beat = index switch { 2 => Beats.BreakDefense(), 3 => Beats.Saddle(), 4 => Beats.BalloonStrike(), _ => Beats.Perch() };
        _player = new AircraftSim(_beat.Player, _beat.PlayerAir);
        _bandit = new RailBandit(_beat.Bandit, _beat.BanditAir, _beat.BanditTimeline);
        _keys = new KeyGrammar();
        _detents = new DetentLayer { Variant = variant };
        _prompts = new PromptTracker();
        _advice = new DoctrineAdvice(1.0, 0.0, "setup");
        _cue = PromptCue.None;
        _triggerDown = false;
        _acc = 0; _shotsTotal = 0; _shotsInWindow = 0;
        _lastRange = Geometry.Range(_player.State, _bandit.State);
        _closureKts = 0; _closureSmooth = 0;
        // _simTimeMs deliberately NOT reset: one monotonic clock for grammar timestamps.
    }

    [JSExport] public static void FeedKey(int gkey, bool pressed) {
        _keys.Feed((GKey)gkey, pressed, _simTimeMs);
        if (gkey == (int)GKey.Trigger) Trigger(pressed);
        if (!pressed) return;
        // The Godot shell routes these through InputAdapter signals; the web shell had no
        // equivalent, so both keys were inert while the legend claimed otherwise.
        if (gkey == (int)GKey.Restart) StartBeat(_beatIndex);
        else if (gkey == (int)GKey.KnockItOff) _knockedOff = true;
    }

    static void Trigger(bool down) {
        if (down && !_triggerDown) {
            _shotsTotal++;
            if (CameraSolver.GunWindow(_player.State, _bandit.State)) _shotsInWindow++;
        }
        _triggerDown = down;
    }

    [JSExport] public static void SetVariant(int v) => _detents.Variant = v == 1 ? ValleyVariant.PhysicsOnly : ValleyVariant.DoctrineDeep;
    [JSExport] public static int GetVariant() => _detents.Variant == ValleyVariant.PhysicsOnly ? 1 : 0;

    /// Advance by real elapsed seconds; the kernel is stepped at a fixed 120 Hz internally.
    /// Catch-up is capped exactly as the Godot bridge caps it — a backgrounded tab must not
    /// replay minutes of sim on return.
    [JSExport]
    public static void Advance(double deltaSeconds) {
        if (Frozen) { _acc = 0; return; }
        _acc = Math.Min(_acc + deltaSeconds, 0.25);
        while (_acc >= Dt) {
            _advice = _beat.Law.Advise(_player.State, _bandit.State, _beat.PlayerAir);
            _detents.Tick(_keys, _simTimeMs, _player.State, _beat.PlayerAir, _advice, Dt);
            _cue = _prompts.Cue(_advice, _detents.Command, _detents.Tier);
            _player.Step(_detents.Command, Dt);
            _bandit.Step(Dt);
            double rng = Geometry.Range(_player.State, _bandit.State);
            _closureKts = (_lastRange - rng) / Dt * 1.94384;
            _closureKts = _closureSmooth = _closureSmooth * 0.9 + _closureKts * 0.1;
            _lastRange = rng;
            _simTimeMs += Dt * 1000.0;
            _acc -= Dt;
        }
    }

    /// One flat state blob per frame. Sim frame is X=east, Y=up, Z=north; the JS side flips Z
    /// for three.js exactly as the Godot bridge does (Godot forward = -Z), so both shells put
    /// the world in the same handedness and a roll reads the same way in both.
    [JSExport]
    public static string GetState() {
        var s = _player.State;
        var b = _bandit.State;
        var pl = _player.LiftDir; var bl = _bandit.LiftDir;
        var pf = s.ForwardDir(); var bf = b.ForwardDir();
        // hand-built JSON: no serializer, no reflection, trim-safe, allocation-cheap.
        return "{"
            + $"\"t\":{_simTimeMs / 1000.0:F4},"
            + $"\"px\":{s.Position.X:F3},\"py\":{s.Position.Y:F3},\"pz\":{s.Position.Z:F3},"
            + $"\"pfx\":{pf.X:F5},\"pfy\":{pf.Y:F5},\"pfz\":{pf.Z:F5},"
            + $"\"plx\":{pl.X:F5},\"ply\":{pl.Y:F5},\"plz\":{pl.Z:F5},"
            + $"\"bx\":{b.Position.X:F3},\"by\":{b.Position.Y:F3},\"bz\":{b.Position.Z:F3},"
            + $"\"bfx\":{bf.X:F5},\"bfy\":{bf.Y:F5},\"bfz\":{bf.Z:F5},"
            + $"\"blx\":{bl.X:F5},\"bly\":{bl.Y:F5},\"blz\":{bl.Z:F5},"
            + $"\"speed_kts\":{s.Speed * 1.94384:F2},\"alt_ft\":{s.Position.Y * 3.28084:F1},"
            + $"\"g_actual\":{_player.LastNz:F3},\"g_cmd\":{_detents.Command.GDemand:F3},"
            + $"\"g_valley\":{_detents.ValleyG:F3},"
            + $"\"g_maxperform\":{Protection.MaxPerformG(s, _beat.PlayerAir):F3},"
            + $"\"g_hardmax\":{Protection.HardMaxG(s, _beat.PlayerAir):F3},"
            + $"\"sustained\":{Protection.SustainedG(s, _beat.PlayerAir):F3},"
            + $"\"sticky\":{_detents.StickyOffsetG:F2},\"tier\":{(int)_detents.Tier},"
            + $"\"variant\":{GetVariant()},\"buffet\":{(_player.Buffet ? "true" : "false")},"
            + $"\"prompt\":{(int)_cue},"
            + $"\"pitch_deg\":{s.Gamma * 57.2958:F2},\"bank_deg\":{s.Bank * 57.2958:F2},"
            + $"\"heading_deg\":{((s.Chi * 57.2958) % 360 + 360) % 360:F2},"
            + $"\"angle_off_deg\":{Geometry.AngleOff(s, b) * 57.2958:F2},"
            + $"\"range_m\":{Geometry.Range(s, b):F1},\"closure_kts\":{_closureKts:F1},"
            + $"\"gun_window\":{(CameraSolver.GunWindow(s, b) ? "true" : "false")},"
            + $"\"below_ground\":{(_player.BelowGround ? "true" : "false")},"
            + $"\"knocked_off\":{(_knockedOff ? "true" : "false")},"
            + $"\"frozen\":{(Frozen ? "true" : "false")},"
            + $"\"below_deck\":{(_player.BelowHardDeck ? "true" : "false")},"
            + $"\"shots_total\":{_shotsTotal},\"shots_in_window\":{_shotsInWindow},"
            + $"\"context\":\"{_advice.Context}\",\"beat\":\"{_beat.Name}\""
            + "}";
    }
}
