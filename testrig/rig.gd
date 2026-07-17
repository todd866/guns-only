extends Node
# Flight-test rig: lets the controller SEE and MEASURE the game without a human.
#
# Entirely inert unless GUNS_RIG_SCENARIO is set in the environment. When set, it
# loads a scenario JSON, waits for the Main scene to settle, drives SimBridge
# through scripted key events on a wall-clock-independent scenario timeline, and
# logs telemetry + a done.json summary before quitting the process. Movie-mode
# frame capture (--write-movie) is driven entirely from bin/rig; this script only
# knows about sim time and quits when the scenario ends.
#
# Registered as the "Rig" autoload in project.godot. Does not touch game/, bridge/,
# or sim/ code — it only calls the existing SimBridge API (FeedKey/Trigger/
# SetVariant/StartBeat/GetHud/GetPlayerTransform/GetBanditTransform).

var _scenario: Dictionary = {}
var _events: Array = []
var _event_idx := 0
var _bridge: Node = null
var _out_dir := ""
var _telemetry: FileAccess = null
var _elapsed_s := 0.0
var _tick := 0
var _active := false
var _duration_s := 10.0

var _stats_init := false
var _g_cmd_min := 0.0
var _g_cmd_max := 0.0
var _speed_min := 0.0
var _speed_max := 0.0
var _range_min := 0.0
var _gun_window_ever := false


func _ready() -> void:
	set_physics_process(false)  # default OFF: only turned on once a scenario is actually running
	var scenario_path := OS.get_environment("GUNS_RIG_SCENARIO")
	if scenario_path == "":
		return  # no-op: not a rig run, behave as if this node did not exist

	var f := FileAccess.open(scenario_path, FileAccess.READ)
	if f == null:
		push_error("Rig: cannot open scenario file: %s" % scenario_path)
		get_tree().quit(1)
		return
	var text := f.get_as_text()
	f.close()

	var parsed = JSON.parse_string(text)
	if typeof(parsed) != TYPE_DICTIONARY:
		push_error("Rig: scenario JSON did not parse to an object: %s" % scenario_path)
		get_tree().quit(1)
		return
	_scenario = parsed
	_events = _scenario.get("events", [])
	_events.sort_custom(func(a, b): return float(a["t"]) < float(b["t"]))
	_duration_s = float(_scenario.get("duration_s", 10.0))

	_out_dir = OS.get_environment("GUNS_RIG_OUT")
	if _out_dir == "":
		_out_dir = "testrig/out/%s" % str(_scenario.get("name", "unnamed"))
	DirAccess.make_dir_recursive_absolute(_out_dir)

	_telemetry = FileAccess.open(_out_dir.path_join("telemetry.jsonl"), FileAccess.WRITE)
	if _telemetry == null:
		push_error("Rig: cannot open telemetry.jsonl for write in %s" % _out_dir)
		get_tree().quit(1)
		return

	# Main scene loads after autoloads; give it two frames to finish _ready before we
	# go looking for SimBridge under it.
	await get_tree().process_frame
	await get_tree().process_frame
	_start_scenario()


func _start_scenario() -> void:
	_bridge = get_node_or_null("/root/Main/SimBridge")
	if _bridge == null:
		push_error("Rig: /root/Main/SimBridge not found -- is main.tscn the running scene?")
		get_tree().quit(1)
		return
	_bridge.SetVariant(int(_scenario.get("variant", 0)))
	_bridge.StartBeat(int(_scenario.get("beat", 1)))
	_active = true
	set_physics_process(true)


func _physics_process(delta: float) -> void:
	if not _active:
		return
	_elapsed_s += delta
	_tick += 1

	while _event_idx < _events.size() and float(_events[_event_idx]["t"]) <= _elapsed_s:
		var e: Dictionary = _events[_event_idx]
		var key := int(e["key"])
		var pressed := bool(e["pressed"])
		_bridge.FeedKey(key, pressed)
		if key == 8:  # GKey.Trigger
			_bridge.Trigger(pressed)
		_event_idx += 1

	var hud: Dictionary = _bridge.GetHud()
	_update_stats(hud)
	if _tick % 6 == 0:
		_write_telemetry(hud)

	if _elapsed_s >= _duration_s:
		_finish()


func _update_stats(hud: Dictionary) -> void:
	var g_cmd := float(hud["g_cmd"])
	var speed := float(hud["speed_kts"])
	var range_m := float(hud["range_m"])
	var gun_window := bool(hud["gun_window"])
	if not _stats_init:
		_g_cmd_min = g_cmd
		_g_cmd_max = g_cmd
		_speed_min = speed
		_speed_max = speed
		_range_min = range_m
		_stats_init = true
	else:
		_g_cmd_min = minf(_g_cmd_min, g_cmd)
		_g_cmd_max = maxf(_g_cmd_max, g_cmd)
		_speed_min = minf(_speed_min, speed)
		_speed_max = maxf(_speed_max, speed)
		_range_min = minf(_range_min, range_m)
	if gun_window:
		_gun_window_ever = true


func _write_telemetry(hud: Dictionary) -> void:
	var pt: Transform3D = _bridge.GetPlayerTransform()
	var bt: Transform3D = _bridge.GetBanditTransform()
	var cam := get_viewport().get_camera_3d()
	if cam == null:
		cam = get_node_or_null("/root/Main/CameraRig")
	var cam_pos: Vector3 = cam.global_position if cam != null else Vector3.ZERO
	var rec := {
		"t": _elapsed_s,
		"hud": hud,
		"player_pos": [pt.origin.x, pt.origin.y, pt.origin.z],
		"player_basis_x_y": pt.basis.x.y,
		"bandit_pos": [bt.origin.x, bt.origin.y, bt.origin.z],
		"cam_pos": [cam_pos.x, cam_pos.y, cam_pos.z],
	}
	_telemetry.store_line(JSON.stringify(rec))
	_telemetry.flush()


func _finish() -> void:
	_active = false
	set_physics_process(false)
	if _telemetry != null:
		_telemetry.close()
		_telemetry = null

	var summary := {
		"name": _scenario.get("name", ""),
		"duration_s": _elapsed_s,
		"ticks": _tick,
		"g_cmd_min": _g_cmd_min,
		"g_cmd_max": _g_cmd_max,
		"speed_kts_min": _speed_min,
		"speed_kts_max": _speed_max,
		"range_m_min": _range_min,
		"gun_window_ever": _gun_window_ever,
	}
	var f := FileAccess.open(_out_dir.path_join("done.json"), FileAccess.WRITE)
	f.store_string(JSON.stringify(summary, "  "))
	f.close()
	get_tree().quit()
