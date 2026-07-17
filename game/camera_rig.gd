extends Camera3D
# First-person drone SENSOR FEED (replaces the trailing external chase cam).
#
# The camera is the drone's nose camera, RIGID to the airframe attitude every frame. That
# is the point: a pull drops the horizon down the screen and a roll spins it, with zero
# camera lag or trickery. It structurally fixes two bugs the chase cam caused:
#   1. "pull is invisible" — the chase cam rotated WITH the pull, so the world never swept.
#   2. "the ladder rolls inappropriately" — a world-referenced HUD ladder drawn over a
#      world-UP chase cam rolls while the real horizon stays flat. The ladder was right;
#      the camera was wrong. Attitude-rigid makes ladder and world agree by construction.
#
# FPV ALWAYS (author directive, 2026-07-17). There is no external view and no mode enum:
# the external orbit is deleted, not disabled, so it cannot be reached by accident or quietly
# re-enabled. You are the drone; the only camera is its nose sensor.

# --- Sensor gimbal (head-look) ---
# Yaw/pitch offset (radians) applied on top of airframe attitude, in the airframe's own
# frame: +yaw slews right, +pitch slews up. Trackpad drag sets the target (held briefly so
# padlock/relax don't fight the drag); padlock (V) tracks the bandit; else eases to boresight.
var head_yaw := 0.0
var head_pitch := 0.0
var head_yaw_target := 0.0
var head_pitch_target := 0.0
var padlock_on := false
var _manual_hold_s := 0.0

const HEAD_YAW_LIMIT := deg_to_rad(150.0)   # gimbal limit: past this the bandit is masked
const HEAD_PITCH_LIMIT := deg_to_rad(90.0)  # by your own structure — an honest lost tally
const HEAD_EASE_RATE := 3.0                 # rad/s slew toward target

@onready var bridge = get_parent().get_node("SimBridge")
@onready var player: Node3D = get_parent().get_node("PlayerJet")
@onready var bandit: Node3D = get_parent().get_node_or_null("BanditJet")


func _ready() -> void:
	player.visible = false   # you ARE the drone; the nose camera sits inside your own mesh


func _unhandled_input(event: InputEvent) -> void:
	if event is InputEventPanGesture:
		head_yaw_target = clampf(head_yaw_target - event.delta.x * 0.01, -HEAD_YAW_LIMIT, HEAD_YAW_LIMIT)
		head_pitch_target = clampf(head_pitch_target - event.delta.y * 0.01, -HEAD_PITCH_LIMIT, HEAD_PITCH_LIMIT)
		_manual_hold_s = 0.3


func toggle_padlock() -> void:
	# V toggles sensor auto-tracking of the bandit (InputAdapter's padlock_toggled, GKey 9).
	padlock_on = not padlock_on


func _process(delta: float) -> void:
	_process_first_person(delta)


func _process_first_person(delta: float) -> void:
	var basis: Basis = player.global_transform.basis
	# Sensor head on the nose, just above the axis (mesh nose is ~5.5m forward of origin).
	var origin: Vector3 = player.global_position + basis.y * 0.6 + (-basis.z) * 4.0

	_manual_hold_s = maxf(_manual_hold_s - delta, 0.0)
	if _manual_hold_s <= 0.0:
		if padlock_on and bandit != null:
			var to_bandit: Vector3 = bandit.global_position - origin
			var local: Vector3 = basis.inverse() * to_bandit  # x=right, y=up, z=back
			if local.length() > 0.01:
				var horiz := sqrt(local.x * local.x + local.z * local.z)
				# Clamping IS the gimbal: past the limit the bandit is genuinely masked.
				head_yaw_target = clampf(atan2(local.x, -local.z), -HEAD_YAW_LIMIT, HEAD_YAW_LIMIT)
				head_pitch_target = clampf(atan2(local.y, horiz), -HEAD_PITCH_LIMIT, HEAD_PITCH_LIMIT)
		else:
			head_yaw_target = 0.0
			head_pitch_target = 0.0

	head_yaw = move_toward(head_yaw, head_yaw_target, delta * HEAD_EASE_RATE)
	head_pitch = move_toward(head_pitch, head_pitch_target, delta * HEAD_EASE_RATE)

	# Slew on top of airframe attitude: yaw about the airframe's up, then pitch about the
	# already-yawed right axis. With padlock on, the resulting boresight matches the yaw/pitch
	# computed to the bandit above (same convention on both sides).
	var yawed := basis.rotated(basis.y, -head_yaw)
	var head_basis := yawed.rotated(yawed.x, head_pitch)
	global_transform = Transform3D(head_basis.orthonormalized(), origin)
