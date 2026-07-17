extends Camera3D
enum Mode { FREE, MANEUVER, GUN }
var mode: int = Mode.MANEUVER
var free_yaw := 0.0
var free_pitch := -0.2
var gun_blend := 0.0
var cam_fwd := Vector3(0, 0, -1)  # lagged world heading the camera trails behind
var initialized := false
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
	var ppos: Vector3 = player.global_position
	var jet_fwd: Vector3 = -player.global_transform.basis.z  # Godot forward
	if not initialized:
		cam_fwd = jet_fwd
		initialized = true

	if mode == Mode.FREE:
		var d := 32.0
		var off := Vector3(sin(free_yaw) * cos(free_pitch), -sin(free_pitch), cos(free_yaw) * cos(free_pitch)) * d
		global_position = global_position.lerp(ppos + off, 1.0 - exp(-8.0 * delta))
		look_at(ppos, Vector3.UP)
		return

	var want_gun: bool = hud["gun_window"] and mode != Mode.FREE
	gun_blend = move_toward(gun_blend, 1.0 if want_gun else 0.0, delta * 2.5)

	# TRAILING chase: the camera heading LAGS the jet's heading, and up is WORLD up.
	# This is what makes a pull legible — when you crank G the flight path curves, the
	# camera catches up slowly, so the nose visibly rotates and the horizon sweeps past.
	# A rigidly jet-framed camera (the old bug) rotated with the pull and showed nothing.
	cam_fwd = cam_fwd.slerp(jet_fwd, 1.0 - exp(-3.2 * delta)).normalized()
	var dist := 20.0
	var height := 4.5
	var maneuver_pos := ppos - cam_fwd * dist + Vector3.UP * height
	var maneuver_look := ppos + jet_fwd * 6.0  # slight lead so the nose sits just below center

	# Gun view (from CameraSolver, along the nose) blends in for the shot.
	var gun: Array = bridge.GetCameraPose(2)
	var gpos: Vector3 = gun[0]
	var glook: Vector3 = gun[1]
	var pos: Vector3 = maneuver_pos.lerp(gpos, gun_blend)
	var tgt: Vector3 = maneuver_look.lerp(glook, gun_blend)
	global_position = global_position.lerp(pos, 1.0 - exp(-9.0 * delta))

	# World up keeps the horizon a stable reference (pull sweeps it); near-vertical fallback to north.
	var view := (tgt - global_position).normalized()
	var up := Vector3.UP - view * view.dot(Vector3.UP)
	if up.length() < 0.08:
		up = Vector3(0, 0, -1) - view * view.dot(Vector3(0, 0, -1))
	look_at(tgt, up.normalized())
