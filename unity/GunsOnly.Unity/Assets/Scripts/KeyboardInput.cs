using GunsOnly.UnityBridge;
using UnityEngine;

namespace GunsOnly.UnityClient {

/// <summary>Maps keys onto GunsOnly GKey ordinals without the legacy Input Manager API.</summary>
public sealed class KeyboardInput : MonoBehaviour {
    HostClient _host;
    UnityMissionKind _mission = UnityMissionKind.Cobra;

    const int PullUp = 0;
    const int PushDown = 1;
    const int RollLeft = 2;
    const int RollRight = 3;
    const int RudderLeft = 4;
    const int RudderRight = 5;
    const int Trigger = 8;
    const int Padlock = 9;

    readonly bool[] _down = new bool[16];

    void Awake() => _host = GetComponent<HostClient>();

    public void ConfigureMission(UnityMissionKind mission) => _mission = mission;

    void Update() {
        if (_host == null || !_host.Connected) return;
        // Poll via KeyCode through a try/fallback path that works when Player Settings
        // force the new Input System: use Event.current in OnGUI for reliability instead.
    }

    void OnGUI() {
        if (_host == null || !_host.Connected) return;
        Event e = Event.current;
        if (e == null || e.isKey == false) return;
        if (e.type != EventType.KeyDown && e.type != EventType.KeyUp) return;
        if (e.keyCode == KeyCode.None) return;
        if (_mission == UnityMissionKind.Cobra && e.keyCode == KeyCode.Tab) {
            // UnityCobraSession edge-latches this pilot action, so forward the release as well as
            // the press. The session remains the sole owner of authoritative selection state.
            _host.SendKey(
                CobraGoldenPathTracker.CycleTargetInputCode,
                e.type == EventType.KeyDown);
            e.Use();
            return;
        }
        int gkey = Map(e.keyCode);
        if (gkey < 0) return;

        if (e.type == EventType.KeyDown) {
            if (_down[gkey]) return;
            _down[gkey] = true;
            _host.SendKey(gkey, true);
            e.Use();
        } else if (e.type == EventType.KeyUp) {
            if (!_down[gkey]) return;
            _down[gkey] = false;
            _host.SendKey(gkey, false);
            e.Use();
        }
    }

    int Map(KeyCode code) => code switch {
        KeyCode.DownArrow => PullUp,
        KeyCode.UpArrow => PushDown,
        KeyCode.LeftArrow => RollLeft,
        KeyCode.RightArrow => RollRight,
        KeyCode.A => RudderLeft,
        KeyCode.D => RudderRight,
        // Physical W/S is presentation-specific; GKey 6/7 authority remains unchanged.
        KeyCode.W => UnityMissionSelection.ThrottleKeyForPhysicalInput(_mission, wKey: true),
        KeyCode.S => UnityMissionSelection.ThrottleKeyForPhysicalInput(_mission, wKey: false),
        KeyCode.F => Trigger,
        KeyCode.V => Padlock,
        _ => -1,
    };
}

}
