extends SceneTree
# Run: bin/godot --headless -s res://tests/smoke_test.gd
func _initialize() -> void:
    var bridge = load("res://bridge/SimBridge.cs").new()
    root.add_child(bridge)
    bridge.StartBeat(1)
    bridge.FeedKey(0, true, 0.0)  # GKey.PullUp held
    for i in range(600):          # ~10 s of physics at 60 Hz callbacks
        bridge._PhysicsProcess(1.0 / 60.0)
    var hud = bridge.GetHud()
    assert(hud["g_cmd"] > 1.5, "pull hold should raise commanded G")
    assert(hud["speed_kts"] > 100.0, "aircraft should still be flying")
    var t: Transform3D = bridge.GetPlayerTransform()
    assert(t.origin.length() > 100.0, "aircraft should have moved")
    print("SMOKE OK  gcmd=%.2f speed=%.0f" % [hud["g_cmd"], hud["speed_kts"]])
    quit(0)
