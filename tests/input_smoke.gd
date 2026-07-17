extends SceneTree
# Run: bin/godot --headless -s res://tests/input_smoke.gd
# Loads main.tscn into the tree and drives it through the REAL input path —
# Input.parse_input_event -> InputAdapter._unhandled_input -> SimBridge/CameraRig —
# rather than calling bridge methods directly, so this also exercises main.gd's
# signal wiring (Step 3 of Task 11). Regression test for the input adapter + camera rig.
#
# Note: GDScript's assert() only aborts the current call in headless -s runs (no
# debugger attached to actually halt); it does NOT stop the SceneTree main loop. Use
# explicit push_error + quit(1) for failures, not assert(), or a failing check will
# silently re-fire every frame forever instead of failing the test.
var bridge
var hud_root: Control
var t0_ms := 0
var phase := 0          # 0 = hold pull-up, 1 = beat switch (key 2), 2 = R-retry beat (beat 2 should persist), 3 = variant toggle (F1), 4 = HUD redraw settle
var variant_before := -1
var hud_frames := 0
var hud_checked := false
var r_restart_sent := false

func _initialize() -> void:
	var packed: PackedScene = load("res://game/main.tscn")
	var scene: Node = packed.instantiate()
	root.add_child(scene)
	bridge = scene.get_node("SimBridge")
	var hud_node: Node = scene.get_node_or_null("HUD/Root")
	if hud_node == null or not (hud_node is Control):
		push_error("FAIL: HUD Control node not found at HUD/Root")
		quit(1)
		return
	hud_root = hud_node
	t0_ms = Time.get_ticks_msec()
	_send_key(KEY_DOWN, true)  # DOWN = pull (stick back)

func _send_key(keycode: int, pressed: bool) -> void:
	var ev := InputEventKey.new()
	ev.keycode = keycode
	ev.pressed = pressed
	Input.parse_input_event(ev)

func _fail(msg: String) -> bool:
	push_error("FAIL: " + msg)
	quit(1)
	return true

func _process(_delta: float) -> bool:
	var hud: Dictionary = bridge.GetHud()
	var elapsed := (Time.get_ticks_msec() - t0_ms) / 1000.0
	if not hud_checked:
		hud_frames += 1
		if hud_frames >= 60:
			var draw_count = hud_root.get("draw_count")
			if draw_count != null and draw_count >= 30:
				print("PASS (d): HUD Control node present, draw_count completed %d frames with no errors" % draw_count)
				hud_checked = true
			else:
				return _fail("HUD draw_count is %s (expected >= 30), possible hidden HUD or _draw() error" % draw_count)
	if phase == 0:
		if hud["g_cmd"] > 1.5:
			print("PASS (a): holding DOWN (pull) raised g_cmd to %.2f in %.2fs" % [hud["g_cmd"], elapsed])
			_send_key(KEY_DOWN, false)
			_send_key(KEY_2, true)
			_send_key(KEY_2, false)
			phase = 1
		elif elapsed > 2.0:
			return _fail("holding DOWN (pull) should raise g_cmd above 1.5 within 2s, got %f at %.2fs" % [hud["g_cmd"], elapsed])
	elif phase == 1:
		if hud["beat"] == "Break defense":
			print("PASS (b): key 2 switched beat to '%s'" % hud["beat"])
			phase = 2
		elif elapsed > 4.0:
			return _fail("key 2 should switch beat to 'Break defense', got '%s'" % hud["beat"])
	elif phase == 2:
		if not r_restart_sent and elapsed > 5.0:
			_send_key(KEY_R, true)
			_send_key(KEY_R, false)
			r_restart_sent = true
		elif r_restart_sent and elapsed > 6.0:
			if hud["beat"] == "Break defense":
				print("PASS (b2): R restarted current beat 2, beat still '%s'" % hud["beat"])
				variant_before = hud["variant"]
				_send_key(KEY_F1, true)
				_send_key(KEY_F1, false)
				phase = 3
			else:
				return _fail("R should restart beat 2, got beat '%s'" % hud["beat"])
	elif phase == 3:
		if hud["variant"] != variant_before:
			print("PASS (c): F1 toggled variant %d -> %d" % [variant_before, hud["variant"]])
			phase = 4
		elif elapsed > 8.0:
			return _fail("F1 should toggle variant away from %d, still %d" % [variant_before, hud["variant"]])
	elif phase == 4:
		if hud_checked:
			print("INPUT SMOKE OK")
			quit(0)
			return true
		elif elapsed > 10.0:
			return _fail("HUD queue_redraw did not complete 60 clean frames within 10s")
	return false
