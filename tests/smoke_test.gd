extends SceneTree
# Run: bin/godot --headless -s res://tests/smoke_test.gd
func _initialize() -> void:
    var bridge = load("res://bridge/SimBridge.cs").new()
    root.add_child(bridge)
    bridge.StartBeat(1)
    bridge.FeedKey(0, true)  # GKey.PullUp held
    for i in range(600):          # ~10 s of physics at 60 Hz callbacks
        bridge._PhysicsProcess(1.0 / 60.0)
    var hud = bridge.GetHud()
    assert(hud["g_cmd"] > 1.5, "pull hold should raise commanded G")
    assert(hud["speed_kts"] > 100.0, "aircraft should still be flying")
    var t: Transform3D = bridge.GetPlayerTransform()
    assert(t.origin.length() > 100.0, "aircraft should have moved")
    print("SMOKE OK  gcmd=%.2f speed=%.0f" % [hud["g_cmd"], hud["speed_kts"]])

    # Roll direction: hold roll-right, northbound jet's right wing must drop (basis.x.y < 0)
    # short hold: 4 s of held roll is a deliberate full revolution (circular roll), sample mid-roll
    bridge.StartBeat(1)
    bridge.FeedKey(3, true)   # GKey.RollRight held
    for i in range(36):
        bridge._PhysicsProcess(1.0 / 60.0)
    var rt: Transform3D = bridge.GetPlayerTransform()
    assert(rt.basis.x.y < -0.2, "positive bank must render as RIGHT roll (right wing down), got basis.x.y=%f" % rt.basis.x.y)
    bridge.FeedKey(3, false)
    # Clean restart epoch: no stale input influences the new beat
    bridge.StartBeat(1)
    for i in range(240):
        bridge._PhysicsProcess(1.0 / 60.0)
    var hud2 = bridge.GetHud()
    assert(abs(hud2["g_cmd"] - 1.0) < 0.3, "fresh beat must fly baseline, got g_cmd=%f" % hud2["g_cmd"])
    print("SMOKE OK 2: roll direction + clean epoch")
    quit(0)
