extends Camera3D
enum Mode { FREE, MANEUVER, GUN }
var mode: int = Mode.MANEUVER
var free_yaw := 0.0
var free_pitch := -0.2
var gun_blend := 0.0
var rel_smooth := Vector3.ZERO  # camera offset relative to the player, smoothed
@onready var bridge = get_parent().get_node("SimBridge")
@onready var player: Node3D = get_parent().get_node("PlayerJet")

func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventPanGesture and mode == Mode.FREE:
		free_yaw -= event.delta.x * 0.01
		free_pitch = clampf(free_pitch - event.delta.y * 0.01, -1.2, 1.2)

func toggle_padlock() -> void:
	mode = Mode.MANEUVER if mode == Mode.FREE else Mode.FREE

func _process(delta: float) -> void:
	var hud: Dictionary = bridge.GetHud()
	var want_gun: bool = hud["gun_window"] and mode != Mode.FREE
	gun_blend = move_toward(gun_blend, 1.0 if want_gun else 0.0, delta * 2.5)
	# Smooth in the PLAYER-RELATIVE frame with time-based decay: a per-frame lerp on world
	# position lags a 200 m/s jet by ~v*tau (rig finding: camera trailed 70+ m at 30 fps,
	# shrinking the jet to a speck). Relative-frame smoothing makes the jet's own motion
	# lag-free; only camera-orbit shape changes are smoothed.
	var alpha := 1.0 - exp(-8.0 * delta)
	var ppos := player.global_position
	if mode == Mode.FREE:
		var d := 30.0
		var off := Vector3(sin(free_yaw) * cos(free_pitch), -sin(free_pitch), cos(free_yaw) * cos(free_pitch)) * d
		rel_smooth = rel_smooth.lerp(off, alpha)
		global_position = ppos + rel_smooth
		look_at(ppos, Vector3.UP)
		return
	var man: Array = bridge.GetCameraPose(1)
	var gun: Array = bridge.GetCameraPose(2)
	var pos: Vector3 = (man[0] as Vector3).lerp(gun[0], gun_blend)
	var tgt: Vector3 = (man[1] as Vector3).lerp(gun[1], gun_blend)
	rel_smooth = rel_smooth.lerp(pos - ppos, alpha)
	global_position = ppos + rel_smooth
	# Blended up vectors can oppose near vertical (review finding): re-project the blend
	# against the ACTUAL post-smoothing view direction, north fallback if degenerate.
	var view := (tgt - global_position).normalized()
	var up_raw: Vector3 = (man[2] as Vector3).lerp(gun[2], gun_blend)
	var up := up_raw - view * up_raw.dot(view)
	if up.length() < 0.05:
		up = Vector3(0, 0, -1) - view * view.dot(Vector3(0, 0, -1))
	look_at(tgt, up.normalized())
