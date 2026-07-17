extends Camera3D
enum Mode { FREE, MANEUVER, GUN }
var mode: int = Mode.MANEUVER
var free_yaw := 0.0
var free_pitch := -0.2
var gun_blend := 0.0
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
	if mode == Mode.FREE:
		var d := 30.0
		var off := Vector3(sin(free_yaw) * cos(free_pitch), -sin(free_pitch), cos(free_yaw) * cos(free_pitch)) * d
		global_position = global_position.lerp(player.global_position + off, 0.15)
		look_at(player.global_position, Vector3.UP)
		return
	var man: Array = bridge.GetCameraPose(1)
	var gun: Array = bridge.GetCameraPose(2)
	var pos: Vector3 = (man[0] as Vector3).lerp(gun[0], gun_blend)
	var tgt: Vector3 = (man[1] as Vector3).lerp(gun[1], gun_blend)
	global_position = global_position.lerp(pos, 0.12)
	# Blended up vectors can oppose near vertical (review finding): re-project the blend
	# against the ACTUAL post-smoothing view direction, north fallback if degenerate.
	var view := (tgt - global_position).normalized()
	var up_raw: Vector3 = (man[2] as Vector3).lerp(gun[2], gun_blend)
	var up := up_raw - view * up_raw.dot(view)
	if up.length() < 0.05:
		up = Vector3(0, 0, -1) - view * view.dot(Vector3(0, 0, -1))
	look_at(tgt, up.normalized())
