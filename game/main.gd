extends Node3D

@onready var bridge = $SimBridge
@onready var player: Node3D = $PlayerJet
@onready var bandit: Node3D = $BanditJet
@onready var cam: Camera3D = $ChaseCam

func _process(_delta: float) -> void:
	player.global_transform = bridge.GetPlayerTransform()
	bandit.global_transform = bridge.GetBanditTransform()
	# Temporary chase camera until Task 11's rig:
	var pose: Array = bridge.GetCameraPose(1)  # Maneuver
	cam.global_position = cam.global_position.lerp(pose[0], 0.08)
	# GetCameraPose returns [pos, lookAt, up]; the pose carries its own up vector
	# (a fixed Vector3.UP hits Godot's look_at(view||up) restriction at vertical
	# geometries — review finding, see bridge/SimBridge.cs).
	cam.look_at(pose[1], pose[2])
